/**
 * Relics: the 3D bodies of charms and contraband. A recipe (relic-models.ts) is merged into
 * one flat-shaded, vertex-coloured mesh plus an unlit mesh for its glowing parts, so a relic
 * costs at most two draw calls. RelicShelf stands the owned ones on planks bolted to the
 * cabinet's flanks; RelicStage renders portraits and live turntables for the menus and HUD.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RELIC_FALLBACK, RELIC_MODELS, type RelicPart, type RelicPrim } from './relic-models';

const UNIT: Record<RelicPrim, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: () => new THREE.ConeGeometry(0.5, 1, 6),
  pyr: () => new THREE.ConeGeometry(0.5, 1, 4),
  sph: () => new THREE.IcosahedronGeometry(0.5, 1),
  tor: () => new THREE.TorusGeometry(0.4, 0.1, 5, 10),
  tet: () => new THREE.TetrahedronGeometry(0.5),
};
const unitCache = new Map<RelicPrim, THREE.BufferGeometry>();
const DEG = Math.PI / 180;

const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function partGeometry(p: RelicPart, m: THREE.Matrix4): THREE.BufferGeometry {
  let unit = unitCache.get(p[0]);
  if (!unit) {
    unit = UNIT[p[0]]().toNonIndexed();
    unit.deleteAttribute('uv');
    unitCache.set(p[0], unit);
  }
  const g = unit.clone();
  const [sx, sy, sz] = p[2];
  const [x, y, z] = p[3];
  const r = p[4] ?? [0, 0, 0];
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  const c = new THREE.Color(p[1]);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const built = new Map<
  string,
  { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
>();

function geometryFor(id: string): {
  lit: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
} {
  const have = built.get(id);
  if (have) return have;
  const parts = RELIC_MODELS[id] ?? RELIC_FALLBACK;
  const m = new THREE.Matrix4();
  const lit: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  for (const p of parts) (p[5] ? glow : lit).push(partGeometry(p, m));
  // Normalise both halves together: unit box, centred, standing on y = 0.
  const box = new THREE.Box3();
  for (const g of [...lit, ...glow]) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const size = box.getSize(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  m.makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));
  const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (!list.length) return null;
    const g = mergeGeometries(list, false);
    g.applyMatrix4(m);
    g.computeVertexNormals();
    for (const x of list) x.dispose();
    return g;
  };
  const out = { lit: merge(lit), glow: merge(glow) };
  built.set(id, out);
  return out;
}

/** A relic standing on the origin, one unit across its longest side. */
export function buildRelic(id: string): THREE.Group {
  const g = new THREE.Group();
  const { lit, glow } = geometryFor(id);
  if (lit) g.add(new THREE.Mesh(lit, litMat));
  if (glow) g.add(new THREE.Mesh(glow, glowMat));
  g.name = `relic:${id}`;
  return g;
}

export const hasRelicModel = (id: string): boolean => id in RELIC_MODELS;

// ---------------------------------------------------------------------------- shelf

interface Slot {
  anchor: THREE.Group;
  id: string;
  relic: THREE.Group | null;
  /** 0..1 pop-in, hop height and spin left from a trigger. */
  grow: number;
  hop: number;
  hopV: number;
  spin: number;
  phase: number;
}

export interface ShelfLayout {
  /** Half-width of the cabinet body the planks bolt to, and the table's length. */
  halfW: number;
  length: number;
}

const RELIC_SIZE = 3.4;
const PER_SIDE = 6;

/**
 * Two planks bolted to the cabinet's flanks. Charms fill the left plank from the player's
 * end and spill onto the back of the right one; contraband sits at the front right.
 */
export class RelicShelf {
  readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private key = '';
  private time = 0;

  constructor(layout: ShelfLayout) {
    const wood = new THREE.MeshLambertMaterial({ color: 0x3a2416, flatShading: true });
    const iron = new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true });
    const brass = new THREE.MeshLambertMaterial({ color: 0x8a6a2a, flatShading: true });
    const plankW = 4.6;
    const plankL = layout.length * 0.62;
    const z0 = 2;
    for (const side of [-1, 1]) {
      const x = side * (layout.halfW + plankW / 2 + 0.2);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW, 0.4, plankL), wood);
      plank.position.set(x, -0.2, z0);
      this.group.add(plank);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, plankL), iron);
      lip.position.set(x + (side * plankW) / 2, 0.05, z0);
      this.group.add(lip);
      for (const k of [-0.42, 0, 0.42]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(plankW * 0.9, 0.3, 0.3), iron);
        bracket.position.set(x, -1.2, z0 + k * plankL);
        bracket.rotation.z = side * 0.5;
        this.group.add(bracket);
      }
      const light = new THREE.PointLight(0xffc890, 26, 16, 1.5);
      light.position.set(x - side * 1.2, 6, z0);
      this.group.add(light);
      this.lights.push(light);
      for (let i = 0; i < PER_SIDE; i++) {
        const anchor = new THREE.Group();
        const z = z0 + plankL / 2 - (i + 0.5) * (plankL / PER_SIDE);
        anchor.position.set(x, 0, z);
        // A brass plate marks each berth so an empty shelf still reads as slots to fill.
        const plate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), brass);
        plate.position.set(0, 0.03, plankL / PER_SIDE / 2 - 0.4);
        anchor.add(plate);
        this.group.add(anchor);
        this.slots.push({
          anchor,
          id: '',
          relic: null,
          grow: 0,
          hop: 0,
          hopV: 0,
          spin: 0,
          phase: i * 1.7 + (side > 0 ? 3 : 0),
        });
      }
    }
  }

  /** Slot order: left plank front to back, then right plank back to front. */
  private charmSlot(i: number): Slot | undefined {
    if (i < PER_SIDE) return this.slots[i];
    return this.slots[PER_SIDE + (PER_SIDE - 1 - (i - PER_SIDE))];
  }

  /** Show exactly these charms and contraband (new arrivals pop in). */
  sync(charms: readonly string[], contraband: readonly string[]): void {
    const key = `${charms.join()}|${contraband.join()}`;
    if (key === this.key) return;
    this.key = key;
    const want = new Map<Slot, string>();
    charms.forEach((id, i) => {
      const s = this.charmSlot(i);
      if (s) want.set(s, id);
    });
    contraband.forEach((id, i) => {
      const s = this.slots[PER_SIDE + i];
      if (s && !want.has(s)) want.set(s, id);
    });
    for (const s of this.slots) {
      const id = want.get(s) ?? '';
      if (id === s.id) continue;
      if (s.relic) s.anchor.remove(s.relic);
      s.id = id;
      s.relic = null;
      if (!id) continue;
      s.relic = buildRelic(id);
      s.relic.rotation.y = s.anchor.position.x < 0 ? 0.6 : -0.6;
      s.anchor.add(s.relic);
      s.grow = 0;
      s.hopV = 9;
    }
  }

  /** A charm fired: its relic hops and spins. */
  trigger(id: string, strength = 1): void {
    for (const s of this.slots) {
      if (s.id !== id) continue;
      s.hopV = Math.max(s.hopV, 7 + 5 * strength);
      s.spin = Math.max(s.spin, Math.PI * 2);
    }
  }

  /** Every relic hops (a jackpot, a paid deadline). */
  cheer(strength = 1): void {
    for (const s of this.slots)
      if (s.id) s.hopV = Math.max(s.hopV, (5 + Math.random() * 5) * strength);
  }

  setLit(on: boolean): void {
    for (const l of this.lights) l.visible = on;
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.slots) {
      const r = s.relic;
      if (!r) continue;
      s.grow = Math.min(1, s.grow + dt * 4);
      s.hopV -= 60 * dt;
      s.hop += s.hopV * dt;
      if (s.hop < 0) {
        s.hop = 0;
        s.hopV = s.hopV < -6 ? -s.hopV * 0.35 : 0;
      }
      if (s.spin > 0) {
        const d = Math.min(s.spin, dt * 14);
        s.spin -= d;
        r.rotation.y += d;
      }
      // Overshoot on the way in, then a slow breath so the shelf never sits dead still.
      const e = s.grow < 1 ? 1 + Math.sin(s.grow * Math.PI) * 0.25 : 1;
      const breathe = 1 + Math.sin(this.time * 1.3 + s.phase) * 0.02;
      r.scale.setScalar(RELIC_SIZE * s.grow * e * breathe);
      r.position.y = s.hop;
      r.rotation.z = Math.sin(this.time * 0.9 + s.phase) * 0.03 + (s.hop > 0 ? s.hopV * 0.01 : 0);
    }
  }
}

// ---------------------------------------------------------------------------- stage

const PORTRAIT_PX = 72;

/**
 * A tiny offscreen renderer for relics outside the world: still portraits (data URLs, cached)
 * for inline icons, and live turntables blitted into 2D canvases that menus hand over.
 */
export class RelicStage {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private readonly holder = new THREE.Group();
  private readonly portraits = new Map<string, string>();
  private readonly live = new Set<HTMLCanvasElement>();
  private time = 0;
  private failed = false;

  constructor() {
    this.scene.add(this.holder);
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x30241c, 1.5));
    const key = new THREE.DirectionalLight(0xffe2b0, 2.6);
    key.position.set(-2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6090ff, 1.2);
    rim.position.set(3, 1, -3);
    this.scene.add(rim);
    this.camera.position.set(0, 1.0, 2.9);
    this.camera.lookAt(0, 0.48, 0);
  }

  private gl(): THREE.WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PORTRAIT_PX;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      this.renderer.setClearColor(0x000000, 0);
    } catch {
      this.failed = true;
    }
    return this.renderer;
  }

  private draw(id: string, angle: number): HTMLCanvasElement | null {
    const gl = this.gl();
    if (!gl) return null;
    const relic = buildRelic(id);
    relic.rotation.y = angle;
    this.holder.add(relic);
    gl.render(this.scene, this.camera);
    this.holder.remove(relic);
    return gl.domElement;
  }

  /** A still three-quarter portrait as a data URL ('' if WebGL is unavailable). */
  portrait(id: string): string {
    const have = this.portraits.get(id);
    if (have !== undefined) return have;
    const c = this.draw(id, -0.55);
    const url = c ? c.toDataURL('image/png') : '';
    this.portraits.set(id, url);
    return url;
  }

  /** A canvas that shows the relic turning for as long as it stays in the document. */
  turntable(id: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = PORTRAIT_PX;
    c.className = 'relic-live';
    c.dataset.relic = id;
    this.live.add(c);
    return c;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.live.size) return;
    let i = 0;
    for (const c of this.live) {
      // Detached canvases linger one screen change at most (a panel may be re-pushed).
      if (!c.isConnected) {
        if (c.dataset.seen) this.live.delete(c);
        continue;
      }
      c.dataset.seen = '1';
      const src = this.draw(c.dataset.relic ?? '', this.time * 1.1 + i * 0.9);
      i++;
      if (!src) continue;
      const g = c.getContext('2d');
      if (!g) continue;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0);
    }
  }
}

export const relicStage = new RelicStage();
