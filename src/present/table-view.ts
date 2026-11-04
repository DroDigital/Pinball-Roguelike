/**
 * TableView: Three.js meshes for DEBTOR'S PRISON, built from the same TableDef the physics
 * uses, and synced every frame from the sim (interpolated) and the rules' lamp states.
 *
 * Juice hooks (all honour Settings.reducedFlashing via `reducedFlashing`):
 *   flashPart(kind, index, strength)  flash a bumper cap / sling plate / drop target / spinner
 *   fireFlasher(id | colour | 'all', strength)  blaze flasher domes (ids: flankL flankR hole
 *                                     roof chute backL backR backC; colours red yellow white)
 *   giPulse(colour, strength)         tint and surge the GI bulbs and lights
 *   flashLamp(id | 'all', strength)   overdrive a playfield insert past full brightness
 *   giLevel                           0..1 base GI brightness (blackout / dying lights)
 * RetroRenderer.bloomPulse(k) kicks the bloom; LampShowPlayer.play(name) runs lamp shows.
 *
 * Static parts (rails, posts, screws, wireforms, plastics) are merged into a few meshes per
 * material; only parts that move or glow individually (flippers, pops, slings, targets,
 * spinner, plunger, balls, inserts, flashers) are separate objects.
 */
import * as THREE from 'three';
import { TABLE } from '../content/table';
import type { TableDef, WallDef } from '../sim/table-def';
import type { PinballSim } from '../sim/sim';
import { Lamp } from '../rules/types';
import { wx, wz, TW, TH, CX, CY } from './coords';
import { paintPlayfield, ART_PX } from './playfield-art';
import {
  PLASTIC_RECT,
  paintFrameBand,
  paintDropFace,
  paintPlastics,
  paintSpinnerFace,
  plasticUv,
} from './plastics-art';
import { loadArtFonts } from './art-kit';
import { Batch, artTexture, makeMaterials, splitGroups, type MachineMaterials } from './materials';
import { Inserts } from './inserts';
import { FlasherBank } from './flashers';
import { bumperCap, flipperShape, ribbon, sideAt, strut, tubeAlong } from './machine-parts';

interface BallVis {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  trail: THREE.Mesh;
  trailPos: Float32Array;
  trailGeo: THREE.BufferGeometry;
  trailCount: number;
  seen: boolean;
}

interface PopVis {
  cap: THREE.MeshPhysicalMaterial;
  bulb: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  base: number;
}

export type PartKind = 'bumper' | 'sling' | 'target' | 'spinner';

const TRAIL = 12;
/** Longest ball trail, in ball diameters. */
const TRAIL_LEN = 4.5;
/**
 * Blackout lights: a fixed pool that stays in the scene at zero intensity. Showing or hiding
 * a light changes the shader's light count and recompiles every material, so the pool never
 * comes and goes.
 */
const BALL_LIGHTS = 2;
const BALL_LIGHT_INTENSITY = 7;
const CAP_RED = new THREE.Color(0xe01c1c);
const CAP_GOLD = new THREE.Color(0xffc030);

export class TableView {
  readonly root = new THREE.Group();
  readonly flashers = new FlasherBank();
  private readonly flippers = new Map<string, THREE.Group>();
  private readonly pops = new Map<string, PopVis>();
  /** Objects shown only when their tag is active for the current ball. */
  private readonly tagged = new Map<string, THREE.Object3D[]>();
  private goldPop = '';
  private readonly slingMats: THREE.MeshPhysicalMaterial[] = [];
  private readonly drops: THREE.Mesh[] = [];
  private spinner: THREE.Mesh | null = null;
  private inserts!: Inserts;
  private readonly balls = new Map<number, BallVis>();
  private readonly ballGeo = new THREE.SphereGeometry(0.5, 32, 20);
  private readonly ballMat: THREE.MeshStandardMaterial;
  private readonly ballLights: THREE.PointLight[] = [];
  private readonly shadowGeo = new THREE.PlaneGeometry(1, 1);
  private readonly shadowTex: THREE.Texture;
  private readonly trailMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private time = 0;
  readonly gold = new Set<string>();
  /** Blackout Sentence: inserts stay dark and each ball carries a light. */
  blackout = false;
  /** Honour Settings.reducedFlashing in every flash hook. */
  reducedFlashing = false;
  /** Base GI brightness 0..1 (the World dims it for decay, blackout and JAILBREAK). */
  giLevel = 1;
  /** GI surge state; the World reads it to drive its real GI lights too. */
  readonly gi = { pulse: 0, color: new THREE.Color(1, 0.9, 0.7) };
  private readonly partFlash = {
    bumper: new Float32Array(8),
    sling: new Float32Array(4),
    target: new Float32Array(8),
    spinner: new Float32Array(2),
  };
  private readonly flashLists = [
    this.partFlash.bumper,
    this.partFlash.sling,
    this.partFlash.target,
    this.partFlash.spinner,
  ];
  private giBulbs: THREE.InstancedMesh | null = null;
  private readonly giBase = new THREE.Color(3.2, 1.75, 0.55);
  private readonly tmpColor = new THREE.Color();
  private readonly axis = new THREE.Vector3();
  private readonly mats: MachineMaterials;
  private plasticsTex!: THREE.CanvasTexture;
  private plasticsCanvas!: HTMLCanvasElement;
  private pfCanvas!: HTMLCanvasElement;
  private pfTex!: THREE.CanvasTexture;
  private readonly env: THREE.Texture | null;

  constructor(
    readonly table: TableDef = TABLE,
    tags: ReadonlySet<string> = new Set(['outlanePosts']),
    envMap: THREE.Texture | null = null,
  ) {
    this.env = envMap;
    this.mats = makeMaterials(envMap);
    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0xaab1bc,
      metalness: 1,
      // Steel with a broad sheen: the point lights' speculars spread out instead of peaking
      // into a white disc, which the bloom would turn into a light source.
      roughness: 0.4,
      envMap,
      envMapIntensity: 0.75,
    });
    for (let i = 0; i < BALL_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffe0b0, 0, 7, 1.6);
      this.root.add(l);
      this.ballLights.push(l);
    }
    this.shadowTex = makeShadowTexture();
    this.build();
    this.setTags(tags);
    // Art uses web fonts: repaint once they can be drawn to a canvas.
    void loadArtFonts().then(() => this.repaintArt());
  }

  /** Shared machine materials (the cabinet and backbox reuse them). */
  get materials(): MachineMaterials {
    return this.mats;
  }

  // ------------------------------------------------------------------ juice hooks

  /** Flash a part: kind 'bumper' (index or id 'pop2'), 'sling', 'target', 'spinner'. */
  flashPart(kind: PartKind, index: number | string = 0, strength = 1): void {
    const k = Math.min(this.reducedFlashing ? 0.4 : 1.5, strength);
    const i = typeof index === 'string' ? Number(index.replace(/\D/g, '')) || 0 : index;
    const arr = this.partFlash[kind];
    if (i >= 0 && i < arr.length) arr[i] = Math.max(arr[i], k);
  }

  /** Fire flasher domes by id, colour group or 'all'. */
  fireFlasher(id: string, strength = 1): void {
    this.flashers.fire(id, strength);
  }

  /** Tint and surge the GI bulbs (and, through the World, the GI lights). */
  giPulse(color: THREE.ColorRepresentation, strength = 1): void {
    this.gi.color.set(color);
    this.gi.pulse = Math.max(this.gi.pulse, Math.min(this.reducedFlashing ? 0.3 : 1.3, strength));
  }

  /** Overdrive an insert (or 'all') past full brightness for a moment. */
  flashLamp(id: string, strength = 1): void {
    this.inserts.flash(id, Math.min(this.reducedFlashing ? 0.4 : 1.4, strength));
  }

  // ------------------------------------------------------------------ build

  private repaintArt(): void {
    paintPlayfield(this.pfCanvas);
    this.pfTex.needsUpdate = true;
    paintPlastics(this.plasticsCanvas);
    this.plasticsTex.needsUpdate = true;
  }

  private build(): void {
    const t = this.table;
    const mats = this.mats;
    const batch = new Batch();
    const tag = (obj: THREE.Object3D, tg?: string) => {
      if (!tg) return;
      const list = this.tagged.get(tg) ?? [];
      list.push(obj);
      this.tagged.set(tg, list);
    };

    // ---- the playfield sheet and the plastics sheet
    this.pfCanvas = document.createElement('canvas');
    paintPlayfield(this.pfCanvas);
    this.pfTex = new THREE.CanvasTexture(this.pfCanvas);
    this.pfTex.colorSpace = THREE.SRGBColorSpace;
    this.pfTex.anisotropy = 8;
    const pfW = this.pfCanvas.width / ART_PX;
    const pfH = this.pfCanvas.height / ART_PX;
    const pf = new THREE.Mesh(
      new THREE.PlaneGeometry(pfW, pfH),
      new THREE.MeshPhysicalMaterial({
        map: this.pfTex,
        // A clear coat over the print: a tight sheen from the environment, with the matte
        // ink underneath. Point lights only add a faint broad spec so no hot spots (and no
        // bloom flares) crawl across the art.
        roughness: 0.42,
        metalness: 0,
        specularIntensity: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.22,
        envMap: this.env,
        envMapIntensity: 0.4,
        emissive: 0xffffff,
        emissiveMap: this.pfTex,
        emissiveIntensity: 0.2,
      }),
    );
    pf.rotation.x = -Math.PI / 2;
    pf.position.set(pfW / 2 - CX, 0, -(pfH / 2 - CY));
    pf.name = 'playfield';
    this.root.add(pf);

    this.plasticsCanvas = document.createElement('canvas');
    paintPlastics(this.plasticsCanvas);
    this.plasticsTex = new THREE.CanvasTexture(this.plasticsCanvas);
    this.plasticsTex.colorSpace = THREE.SRGBColorSpace;
    this.plasticsTex.anisotropy = 8;
    const plasticTop = new THREE.MeshPhysicalMaterial({
      map: this.plasticsTex,
      roughness: 0.42,
      metalness: 0,
      specularIntensity: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      envMap: this.env,
      envMapIntensity: 0.45,
      emissive: 0xffffff,
      emissiveMap: this.plasticsTex,
      emissiveIntensity: 0.28,
    });

    // ---- walls
    for (const w of t.walls) {
      if (w.look === 'invisible' || !w.loop) continue;
      if (w.look === 'cabinet') {
        this.addFrame(batch, w, plasticTop);
        continue;
      }
      const h = w.h ?? 1;
      const shape = new THREE.Shape(w.pts.map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1]))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.plasticUvs(geo);
      const [caps, sides] = splitGroups(geo);
      geo.dispose();
      let capMat: THREE.Material = plasticTop;
      let sideMat: THREE.Material = mats.enamel;
      switch (w.look) {
        case 'rail':
          capMat = sideMat = mats.smoke;
          break;
        case 'plug':
          capMat = sideMat = w.mat === 'rubber' ? mats.rubberRed : mats.steel;
          break;
        case 'lane':
          capMat = mats.satin;
          sideMat = mats.steel;
          break;
        case 'guide':
          if (w.mat === 'metal') {
            capMat = mats.satin;
            sideMat = mats.steel;
          } else {
            capMat = mats.enamelRed;
            sideMat = mats.enamelRed;
          }
          break;
        case 'apron':
          sideMat = mats.steel;
          break;
        default:
          break;
      }
      batch.add(caps, capMat, undefined, w.tag, w.look === 'rail' ? 3 : 0);
      batch.add(sides, sideMat, undefined, w.tag, w.look === 'rail' ? 3 : 0);
      if (w.look === 'block' || w.look === 'apron') this.addScrews(batch, w, h);
    }
    // One-way gates as thin chrome flaps.
    for (const ow of t.oneWays) this.addSegment(batch, ow.a, ow.b, 0.06, 0.7, mats.satin);

    // ---- posts: chrome shaft, rubber ring (or plain chrome cap), screw head
    for (const p of t.posts) {
      const x = wx(p.x);
      const z = wz(p.y);
      if (p.mat === 'post') {
        batch.addAt(
          new THREE.CylinderGeometry(p.r * 0.62, p.r * 0.7, 1.0, 14),
          mats.satin,
          x,
          0.5,
          z,
          0,
          0,
          0,
          p.tag,
        );
        batch.addAt(
          new THREE.TorusGeometry(p.r * 0.86, p.r * 0.34, 8, 18),
          mats.rubberWhite,
          x,
          0.34,
          z,
          Math.PI / 2,
          0,
          0,
          p.tag,
        );
        batch.addAt(
          new THREE.TorusGeometry(p.r * 0.86, p.r * 0.34, 8, 18),
          mats.rubberRed,
          x,
          0.72,
          z,
          Math.PI / 2,
          0,
          0,
          p.tag,
        );
        batch.addAt(
          new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.7, 0.07, 14),
          mats.screw,
          x,
          1.03,
          z,
          0,
          0,
          0,
          p.tag,
        );
      } else {
        batch.addAt(
          new THREE.CylinderGeometry(p.r * 0.95, p.r, 1.0, 16),
          mats.satin,
          x,
          0.5,
          z,
          0,
          0,
          0,
          p.tag,
        );
        batch.addAt(
          new THREE.CylinderGeometry(p.r * 0.5, p.r * 0.5, 0.06, 10),
          mats.darkMetal,
          x,
          1.02,
          z,
          0,
          0,
          0,
          p.tag,
        );
      }
    }

    // ---- pop bumpers: base skirt, black body, moving chrome ring, glowing cap with a bulb
    for (const b of t.bumpers) {
      const g = new THREE.Group();
      g.position.set(wx(b.x), 0, wz(b.y));
      tag(g, b.tag);
      // Skirt, rim, body and screw never move: they bake into the shared batch.
      const bx = wx(b.x);
      const bz = wz(b.y);
      batch.addAt(
        new THREE.CylinderGeometry(b.r * 1.0, b.r * 1.04, 0.1, 28),
        mats.postWhite,
        bx,
        0.05,
        bz,
        0,
        0,
        0,
        b.tag,
      );
      batch.addAt(
        new THREE.TorusGeometry(b.r * 0.99, 0.045, 8, 32),
        mats.rubberRed,
        bx,
        0.11,
        bz,
        Math.PI / 2,
        0,
        0,
        b.tag,
      );
      batch.addAt(
        new THREE.CylinderGeometry(b.r * 0.72, b.r * 0.86, 0.6, 24),
        mats.enamel,
        bx,
        0.38,
        bz,
        0,
        0,
        0,
        b.tag,
      );
      batch.addAt(
        new THREE.CylinderGeometry(b.r * 0.2, b.r * 0.2, 0.05, 12),
        mats.screw,
        bx,
        1.2,
        bz,
        0,
        0,
        0,
        b.tag,
      );
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.9, 0.085, 10, 32), mats.chrome);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.46;
      // Translucent red dome: the lamp inside shows through it, hot at the core.
      const cap = new THREE.MeshPhysicalMaterial({
        color: CAP_RED,
        emissive: CAP_RED,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMap: this.env,
        envMapIntensity: 1.0,
      });
      const capMesh = new THREE.Mesh(bumperCap(b.r), cap);
      capMesh.position.y = 0.68;
      capMesh.renderOrder = 4;
      const bulb = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.5, 0.55, 0.22),
        toneMapped: false,
      });
      const core = new THREE.Mesh(new THREE.SphereGeometry(b.r * 0.4, 16, 12), bulb);
      core.position.y = 0.74;
      g.add(ring, core, capMesh);
      this.root.add(g);
      this.pops.set(b.id, { cap, bulb, ring, base: 0.46 });
    }

    // ---- slingshots: plastic plate on top (flashes), rubber on the kick face, white posts
    for (const s of t.slings) {
      const pts = [s.a, s.b, s.c];
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1]))));
      const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: false });
      bodyGeo.rotateX(-Math.PI / 2);
      batch.add(bodyGeo, mats.enamel);
      const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      plateGeo.rotateX(-Math.PI / 2);
      this.plasticUvs(plateGeo);
      const [plateCaps, plateSides] = splitGroups(plateGeo);
      const plateMat = new THREE.MeshPhysicalMaterial({
        map: this.plasticsTex,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMap: this.env,
        envMapIntensity: 0.9,
        emissive: 0xff6a20,
        emissiveIntensity: 0.0,
      });
      const plate = new THREE.Mesh(plateCaps, plateMat);
      plate.position.y = 0.72;
      const plateEdge = new THREE.Mesh(plateSides, mats.rubberRed);
      plateEdge.position.y = 0.72;
      this.root.add(plate, plateEdge);
      this.slingMats.push(plateMat);
      this.addSegment(batch, s.a, s.b, 0.16, 0.55, mats.rubberBlack, s.postR * 0.9);
      for (const p of pts) {
        const x = wx(p[0]);
        const z = wz(p[1]);
        batch.addAt(
          new THREE.CylinderGeometry(s.postR * 0.62, s.postR * 0.7, 0.95, 14),
          mats.satin,
          x,
          0.47,
          z,
        );
        batch.addAt(
          new THREE.TorusGeometry(s.postR * 0.88, s.postR * 0.34, 8, 18),
          mats.rubberWhite,
          x,
          0.33,
          z,
          Math.PI / 2,
        );
        batch.addAt(
          new THREE.CylinderGeometry(s.postR * 0.7, s.postR * 0.7, 0.07, 14),
          mats.screw,
          x,
          0.98,
          z,
        );
      }
    }

    // ---- drop targets: printed cell-door faces that sink into the playfield
    let dropIndex = 0;
    for (const bank of t.dropBanks) {
      for (const d of bank.targets) {
        const face = document.createElement('canvas');
        paintDropFace(face, dropIndex++);
        const tex = new THREE.CanvasTexture(face);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const front = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.4,
          emissive: 0xffffff,
          emissiveMap: tex,
          emissiveIntensity: 0.22,
          envMap: this.env,
          envMapIntensity: 0.4,
        });
        const dx = d.b[0] - d.a[0];
        const dy = d.b[1] - d.a[1];
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        // Five enamel faces share one draw; only the printed face is its own group.
        const boxGeo = new THREE.BoxGeometry(len, 0.9, 0.22);
        boxGeo.clearGroups();
        boxGeo.addGroup(0, 30, 0);
        boxGeo.addGroup(30, 6, 1);
        const m = new THREE.Mesh(boxGeo, [mats.enamel, front]);
        m.position.set(
          wx((d.a[0] + d.b[0]) / 2 + nx * -0.12),
          0.45,
          wz((d.a[1] + d.b[1]) / 2 + ny * -0.12),
        );
        m.rotation.y = Math.atan2(dy, dx);
        this.drops.push(m);
        this.root.add(m);
      }
    }

    // ---- spinner: a printed plate on an axle between two brackets
    for (const sp of t.spinners) {
      const len = Math.hypot(sp.b[0] - sp.a[0], sp.b[1] - sp.a[1]);
      const face = document.createElement('canvas');
      paintSpinnerFace(face);
      const tex = new THREE.CanvasTexture(face);
      tex.colorSpace = THREE.SRGBColorSpace;
      const plateMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.35,
        metalness: 0.2,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide,
        envMap: this.env,
        envMapIntensity: 0.8,
      });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.88, 0.56), plateMat);
      plate.geometry.translate(0, -0.3, 0);
      const holder = new THREE.Group();
      holder.position.set(wx((sp.a[0] + sp.b[0]) / 2), 0.78, wz((sp.a[1] + sp.b[1]) / 2));
      holder.rotation.y = Math.atan2(sp.b[1] - sp.a[1], sp.b[0] - sp.a[0]);
      const spin = new THREE.Group();
      spin.add(plate);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), mats.chrome);
      axle.rotation.z = Math.PI / 2;
      holder.add(spin, axle);
      for (const side of [-1, 1]) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.14), mats.chrome);
        br.position.set((side * len) / 2, -0.38, 0);
        holder.add(br);
      }
      this.root.add(holder);
      this.spinner = plate;
    }

    // ---- flippers: white bat, red rubber ring, chrome bushing and a screw cap
    const flipBat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f1e6,
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      envMap: this.env,
      envMapIntensity: 0.9,
    });
    for (const f of t.flippers) {
      const g = new THREE.Group();
      const batGeo = new THREE.ExtrudeGeometry(flipperShape(f.len, f.r0 * 0.9, f.r1 * 0.9), {
        depth: 0.56,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
        curveSegments: 14,
      });
      batGeo.rotateX(-Math.PI / 2);
      const bat = new THREE.Mesh(batGeo, flipBat);
      bat.position.y = 0.02;
      const rubGeo = new THREE.ExtrudeGeometry(flipperShape(f.len, f.r0 * 1.02, f.r1 * 1.04), {
        depth: 0.34,
        bevelEnabled: false,
        curveSegments: 14,
      });
      rubGeo.rotateX(-Math.PI / 2);
      const rub = new THREE.Mesh(rubGeo, mats.rubberRed);
      rub.position.y = 0.02;
      const bush = new THREE.Mesh(
        new THREE.CylinderGeometry(f.r0 * 0.52, f.r0 * 0.6, 0.2, 20),
        mats.chrome,
      );
      bush.position.y = 0.66;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(f.r0 * 0.3, f.r0 * 0.3, 0.06, 12),
        mats.screw,
      );
      cap.position.y = 0.79;
      g.add(rub, bat, bush, cap);
      g.position.set(wx(f.x), 0.02, wz(f.y));
      this.root.add(g);
      this.flippers.set(f.id, g);
      tag(g, f.tag);
    }

    // ---- wireforms and the Chute ramp
    for (const tp of t.transports) this.addTransport(batch, tp);

    // ---- plunger: a chrome rod with a rubber tip in the lane, running out through the cabinet
    // front to a knob the player "pulls" (the whole group slides with the sim's pull)
    const pl = t.plunger;
    const baseZ = wz(pl.y - 1.5);
    const stick = 1.1;
    const reach = TH / 2 + 3.6 - baseZ + stick;
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, reach + 0.9, 14),
      mats.chrome,
    );
    rod.rotation.x = Math.PI / 2;
    rod.position.z = (reach - 0.9) / 2;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 14), mats.rubberBlack);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -1.0;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), mats.chrome);
    knob.position.z = reach + 0.35;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.22, 16), mats.rubberRed);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = reach - 0.35;
    const plungerGroup = new THREE.Group();
    plungerGroup.add(rod, tip, knob, grip);
    plungerGroup.position.set(wx(pl.x), 0.4, baseZ);
    this.plungerGroup = plungerGroup;
    this.root.add(plungerGroup);

    // ---- GI bulbs along the inner top of the frame
    this.addGiBulbs();

    // ---- flasher domes on top of the blocks
    const fl = (id: string, color: 'red' | 'yellow' | 'white', x: number, y: number, h: number) =>
      this.flashers.add(id, color, this.root, wx(x), h, wz(y), mats, 0.85);
    fl('flankL', 'red', 0.95, 17.1, 1.4);
    fl('flankR', 'red', 17.55, 17.9, 1.4);
    fl('hole', 'yellow', 7.9, 26.0, 1.4);
    fl('roof', 'white', 14.6, 23.1, 1.2);
    fl('chute', 'yellow', 3.0, 25.1, 1.2);

    // Merge everything static, then the inserts on top.
    batch.build(this.root, this.tagged);
    this.inserts = new Inserts(t.lamps, this.env);
    this.root.add(this.inserts.mesh);
    this.addGlass();
  }

  private plungerGroup: THREE.Group | null = null;

  /** Subtle glass: a faint reflection streak over the playfield (additive, no tint). */
  private addGlass(): void {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    const grad = g.createLinearGradient(0, 0, 128, 256);
    grad.addColorStop(0.18, 'rgba(255,255,255,0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.36, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.64, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    // Fade to black at the edges so the streak never ends in a hard rectangle.
    g.globalCompositeOperation = 'multiply';
    for (const [x1, y1, x2, y2] of [
      [0, 0, 128, 0],
      [0, 0, 0, 256],
    ]) {
      const m = g.createLinearGradient(x1, y1, x2, y2);
      m.addColorStop(0, '#000');
      m.addColorStop(0.22, '#fff');
      m.addColorStop(0.78, '#fff');
      m.addColorStop(1, '#000');
      g.fillStyle = m;
      g.fillRect(0, 0, 128, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(TW + 0.2, TH + 0.2),
      new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color(0.14, 0.15, 0.17),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, 2.45, 0);
    glass.renderOrder = 6;
    glass.name = 'glass';
    this.root.add(glass);
  }

  /** Planar UVs into the plastics sheet for a baked (world-space) geometry. */
  private plasticUvs(geo: THREE.BufferGeometry): void {
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    const out: [number, number] = [0, 0];
    for (let i = 0; i < pos.count; i++) {
      plasticUv(pos.getX(i) + CX, CY - pos.getZ(i), out);
      uv[i * 2] = out[0];
      uv[i * 2 + 1] = out[1];
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /** The cabinet frame around the playfield: enamel walls, printed top, chrome siderails. */
  private addFrame(batch: Batch, w: WallDef, topMat: THREE.Material): void {
    const mats = this.mats;
    const pad = 1.6;
    const outer = new THREE.Shape([
      new THREE.Vector2(-TW / 2 - pad, -TH / 2 - pad - 2),
      new THREE.Vector2(TW / 2 + pad, -TH / 2 - pad - 2),
      new THREE.Vector2(TW / 2 + pad, TH / 2 + pad),
      new THREE.Vector2(-TW / 2 - pad, TH / 2 + pad),
    ]);
    const pts = w.pts.map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1])));
    outer.holes.push(new THREE.Path(pts.reverse()));
    const h = w.h ?? 2.2;
    const geo = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    this.plasticUvs(geo);
    const [caps, sides] = splitGroups(geo);
    geo.dispose();
    batch.add(caps, topMat);
    batch.add(sides, mats.cabinet);
    // Chrome siderails along both outer top edges and the lockdown bar across the front.
    const railLen = TH + 2;
    for (const s of [-1, 1]) {
      batch.addAt(
        new THREE.BoxGeometry(0.5, 0.3, railLen),
        mats.satin,
        s * (TW / 2 + pad - 0.3),
        h + 0.14,
        -TH / 2 + railLen / 2 - 3.3,
      );
      batch.addAt(
        new THREE.BoxGeometry(0.16, 0.34, railLen),
        mats.darkMetal,
        s * (TW / 2 + pad - 0.66),
        h + 0.16,
        -TH / 2 + railLen / 2 - 3.3,
      );
    }
    // Printed bands on the outer walls: the frame would otherwise be a black slab above the
    // painted cabinet body.
    const bandMat = (len: number, legend: string) =>
      new THREE.MeshStandardMaterial({
        map: artTexture((c) => paintFrameBand(c, 2048, Math.round((2048 * h) / len), legend)),
        roughness: 0.4,
        envMap: this.env,
        envMapIntensity: 0.5,
      });
    const frontZ = TH / 2 + pad + 2.01;
    const backZ = -TH / 2 - pad - 0.01;
    const sideLen = frontZ - backZ;
    const sideX = TW / 2 + pad + 0.01;
    const band = (len: number, mat: THREE.Material, x: number, z: number, ry: number) =>
      batch.addAt(new THREE.PlaneGeometry(len, h), mat, x, h / 2, z, 0, ry, 0);
    band(TW + pad * 2, bandMat(TW + pad * 2, "DEBTOR'S PRISON"), 0, frontZ, 0);
    const sideMat = bandMat(sideLen, 'PAY OR FALL');
    band(sideLen, sideMat, sideX, (frontZ + backZ) / 2, Math.PI / 2);
    band(sideLen, sideMat, -sideX, (frontZ + backZ) / 2, -Math.PI / 2);
    batch.addAt(
      new THREE.BoxGeometry(TW + pad * 2, 0.6, 0.8),
      mats.satin,
      0,
      h + 0.28,
      TH / 2 + pad + 1.5,
    );
    for (const s of [-1, 1]) {
      batch.addAt(
        new THREE.BoxGeometry(0.8, 0.9, 1.1),
        mats.darkMetal,
        s * (TW / 2 + pad - 0.5),
        h + 0.3,
        TH / 2 + pad + 1.5,
      );
    }
  }

  private addScrews(batch: Batch, w: WallDef, h: number): void {
    let cx = 0;
    let cy = 0;
    for (const p of w.pts) {
      cx += p[0];
      cy += p[1];
    }
    cx /= w.pts.length;
    cy /= w.pts.length;
    const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8);
    for (let i = 0; i < w.pts.length; i += w.pts.length > 8 ? 2 : 1) {
      const p = w.pts[i];
      const x = p[0] + (cx - p[0]) * 0.16;
      const y = p[1] + (cy - p[1]) * 0.16;
      batch.addAt(geo, this.mats.screw, wx(x), h + 0.02, wz(y), 0, 0, 0, w.tag);
    }
  }

  /** A box lying along table segment a->b, standing `h` tall (static; baked into the batch). */
  private addSegment(
    batch: Batch,
    a: readonly number[],
    b: readonly number[],
    thick: number,
    h: number,
    mat: THREE.Material,
    offset = 0,
  ): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    batch.addAt(
      new THREE.BoxGeometry(len, h, thick),
      mat,
      wx((a[0] + b[0]) / 2 + nx * offset),
      h / 2,
      wz((a[1] + b[1]) / 2 + ny * offset),
      0,
      Math.atan2(dy, dx),
      0,
    );
  }

  /** Solid wireform habitrails (lower and upper wires, cross straps, legs) or a clear ramp. */
  private addTransport(batch: Batch, tp: TableDef['transports'][number]): void {
    const mats = this.mats;
    const pts = tp.path.map((p) => new THREE.Vector3(wx(p[0]), p[2] + 0.5, wz(p[1])));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const length = curve.getLength();
    const seg = Math.max(28, Math.round(length * 5));
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tg = new THREE.Vector3();
    const isRamp = tp.look === 'ramp';
    // Rails: [lateral offset, vertical offset, radius].
    const rails: [number, number, number][] = isRamp
      ? [
          [-0.62, -0.12, 0.075],
          [0.62, -0.12, 0.075],
          [-0.62, 0.3, 0.05],
          [0.62, 0.3, 0.05],
        ]
      : [
          // Fine wire: the upper pair must not fight the shot labels for the eye.
          [-0.42, -0.36, 0.036],
          [0.42, -0.36, 0.036],
          [-0.5, 0.25, 0.03],
          [0.5, 0.25, 0.03],
        ];
    const railPts: THREE.Vector3[][] = rails.map(() => []);
    for (let i = 0; i <= seg; i++) {
      sideAt(curve, i / seg, p, n, tg);
      rails.forEach(([lat, vert], k) => {
        railPts[k].push(new THREE.Vector3(p.x + n.x * lat, p.y + vert, p.z + n.z * lat));
      });
    }
    rails.forEach(([, , r], k) => {
      batch.add(tubeAlong(railPts[k], r, 2.4, 6), mats.wire);
    });
    // Cross straps every ~1.1 units under the ball (lower pair) and over it (upper pair).
    const straps = Math.max(2, Math.round(length / 3.4));
    for (let i = 1; i < straps; i++) {
      const u = i / straps;
      sideAt(curve, u, p, n, tg);
      const [l0] = rails[0];
      const [l2] = rails[2];
      const a = new THREE.Vector3(p.x + n.x * l0, p.y + rails[0][1], p.z + n.z * l0);
      const b = new THREE.Vector3(p.x - n.x * l0, p.y + rails[0][1], p.z - n.z * l0);
      batch.add(strut(a, b, 0.024), mats.wire);
      {
        const c = new THREE.Vector3(p.x + n.x * l2, p.y + rails[2][1], p.z + n.z * l2);
        const d = new THREE.Vector3(p.x - n.x * l2, p.y + rails[2][1], p.z - n.z * l2);
        batch.add(strut(c, d, 0.02), mats.wire);
      }
    }
    // Legs: pairs of struts down to the playfield where the track is high.
    const legs = Math.max(1, Math.round(length / 5));
    for (let i = 0; i <= legs; i++) {
      const u = Math.min(0.97, Math.max(0.03, i / legs));
      sideAt(curve, u, p, n, tg);
      if (p.y < 1.0) continue;
      for (const side of [-1, 1]) {
        const lat = (isRamp ? 0.68 : 0.46) * side;
        const top = new THREE.Vector3(p.x + n.x * lat, p.y - 0.4, p.z + n.z * lat);
        const bottom = new THREE.Vector3(top.x, 0.02, top.z);
        batch.add(strut(top, bottom, 0.04), mats.steel);
        batch.addAt(
          new THREE.CylinderGeometry(0.12, 0.14, 0.06, 10),
          mats.chrome,
          bottom.x,
          0.03,
          bottom.z,
        );
      }
    }
    if (isRamp) {
      batch.add(ribbon(curve, seg, 0.6, -0.5), mats.ramp, undefined, undefined, 3);
      // Printed side walls of clear plastic.
      for (const side of [-1, 1]) {
        const wallPts: THREE.Vector3[] = [];
        for (let i = 0; i <= seg; i++) {
          sideAt(curve, i / seg, p, n, tg);
          wallPts.push(
            new THREE.Vector3(p.x + n.x * 0.64 * side, p.y - 0.1, p.z + n.z * 0.64 * side),
          );
        }
        batch.add(tubeAlong(wallPts, 0.085, 2.4, 6), mats.wire);
      }
    }
  }

  private addGiBulbs(): void {
    const cab = this.table.walls.find((w) => w.look === 'cabinet');
    if (!cab) return;
    const pts: THREE.Vector3[] = [];
    const geoPts = cab.pts;
    let carry = 0;
    const step = 2.1;
    for (let i = 0; i < geoPts.length - 1; i++) {
      const a = geoPts[i];
      const b = geoPts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / len;
      const dy = (b[1] - a[1]) / len;
      let s = step - carry;
      while (s < len) {
        const x = a[0] + dx * s;
        const y = a[1] + dy * s;
        // Inward normal: the polygon runs bottom-left -> up -> over the arch -> down.
        const nx = dy;
        const ny = -dx;
        if (y > 2.2) pts.push(new THREE.Vector3(wx(x + nx * 0.2), 1.62, wz(y + ny * 0.2)));
        s += step;
      }
      carry = len - (s - step);
    }
    const geo = new THREE.SphereGeometry(0.15, 10, 8);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      pts.length,
    );
    const m = new THREE.Matrix4();
    pts.forEach((v, i) => {
      m.makeTranslation(v.x, v.y, v.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.giBase);
    });
    mesh.frustumCulled = false;
    mesh.name = 'gi-bulbs';
    this.giBulbs = mesh;
    this.root.add(mesh);
    // Little chrome sockets under each bulb.
    const sockets = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.17, 0.2, 8),
      this.mats.chrome,
      pts.length,
    );
    pts.forEach((v, i) => {
      m.makeTranslation(v.x, v.y - 0.17, v.z);
      sockets.setMatrixAt(i, m);
    });
    sockets.frustumCulled = false;
    this.root.add(sockets);
  }

  // ------------------------------------------------------------------ per-frame sync

  update(sim: PinballSim, lamps: Record<string, Lamp> | null, alpha: number, dt: number): void {
    this.time += dt;
    this.flashers.reduced = this.reducedFlashing;
    const pf = this.partFlash;
    const decay = Math.exp(-dt * 9);
    for (const a of this.flashLists) for (let i = 0; i < a.length; i++) a[i] *= decay;

    for (const f of sim.flippers) {
      const g = this.flippers.get(f.def.id);
      if (!g) continue;
      g.rotation.y = f.prevAngle + (f.angle - f.prevAngle) * alpha;
    }
    for (let i = 0; i < sim.pops.length; i++) {
      const p = sim.pops[i];
      const v = this.pops.get(p.id);
      if (!v) continue;
      const e = Math.max(p.flash, pf.bumper[i] ?? 0);
      const gold = p.id === this.goldPop;
      v.cap.emissiveIntensity = (gold ? 0.55 : 0.5) + e * 3.4;
      v.bulb.color
        .setRGB(gold ? 2.6 : 2.4, gold ? 1.7 : 0.55, gold ? 0.3 : 0.3)
        .multiplyScalar(0.8 + e * 3);
      v.ring.position.y = v.base - Math.min(1, e) * 0.14;
    }
    for (let i = 0; i < sim.slings.length; i++) {
      const m = this.slingMats[i];
      if (m) m.emissiveIntensity = Math.max(sim.slings[i].flash, pf.sling[i] ?? 0) * 2.6;
    }
    for (let i = 0; i < sim.drops.length; i++) {
      const m = this.drops[i];
      if (!m) continue;
      const target = sim.drops[i].up ? 0.45 : -0.5;
      m.position.y += (target - m.position.y) * Math.min(1, dt * 25);
      const mat = (m.material as THREE.MeshStandardMaterial[])[1];
      mat.emissiveIntensity = 0.22 + (pf.target[i] ?? 0) * 2.2;
    }
    if (this.spinner && sim.spinners[0])
      this.spinner.parent!.rotation.x = sim.spinners[0].angle * Math.PI * 2;
    if (this.spinner) {
      const sm = this.spinner.material as THREE.MeshStandardMaterial;
      sm.emissiveIntensity = 0.25 + (pf.spinner[0] ?? 0) * 2.2;
    }
    if (this.plungerGroup)
      this.plungerGroup.position.z = wz(sim.table.plunger.y - 1.5) + sim.plungerPull * 1.1;

    this.inserts.reduced = this.reducedFlashing;
    this.inserts.update(lamps, dt, this.blackout);
    this.flashers.update(dt);
    this.updateGi(dt);

    // Balls.
    for (const v of this.balls.values()) v.seen = false;
    let litBalls = 0;
    for (const b of sim.balls) {
      if (b.state === 'gone' || b.state === 'held') continue;
      let v = this.balls.get(b.id);
      if (!v) {
        v = this.makeBall();
        this.balls.set(b.id, v);
      }
      v.seen = true;
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      const z = b.pz + (b.z - b.pz) * alpha;
      v.mesh.position.set(wx(x), 0.5 + z, wz(y));
      // Contact shadow: tight on the playfield, softer and wider as the ball rides higher.
      const lift = Math.min(1, z / 2.5);
      v.shadow.position.set(
        v.mesh.position.x + 0.07 + lift * 0.4,
        0.024 + (z > 0.3 ? 0.002 : 0),
        v.mesh.position.z + 0.1 + lift * 0.5,
      );
      v.shadow.scale.setScalar(1.55 + lift * 1.2);
      (v.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - lift * 0.65);
      // Rolling look: rotate around the axis perpendicular to motion.
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.01) {
        this.axis.set(-b.vy / sp, 0, -b.vx / sp);
        v.mesh.rotateOnWorldAxis(this.axis, sp * dt * 2);
      }
      if (this.blackout && litBalls < this.ballLights.length) {
        this.ballLights[litBalls++].position.set(
          v.mesh.position.x,
          v.mesh.position.y + 1.4,
          v.mesh.position.z,
        );
      }
      this.updateTrail(v, sp, z, dt);
    }
    for (let i = 0; i < this.ballLights.length; i++) {
      this.ballLights[i].intensity = i < litBalls ? BALL_LIGHT_INTENSITY : 0;
    }
    for (const [id, v] of this.balls) {
      if (!v.seen) {
        this.root.remove(v.mesh, v.shadow, v.trail);
        v.trailGeo.dispose();
        (v.shadow.material as THREE.Material).dispose();
        this.balls.delete(id);
      }
    }
  }

  private updateGi(dt: number): void {
    const g = this.gi;
    g.pulse *= Math.exp(-dt * 3.2);
    if (g.pulse < 0.005) g.pulse = 0;
    const mesh = this.giBulbs;
    if (!mesh) return;
    const lvl = this.blackout ? 0.04 : this.giLevel;
    const c = this.tmpColor;
    // Steady warm glow with a faint incandescent shimmer, plus the surge in the pulse colour.
    const shimmer = 1 + Math.sin(this.time * 17 + 1.3) * 0.015;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      c.copy(this.giBase).multiplyScalar(lvl * shimmer);
      c.r += g.color.r * g.pulse * 4;
      c.g += g.color.g * g.pulse * 4;
      c.b += g.color.b * g.pulse * 4;
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private updateTrail(v: BallVis, speed: number, z: number, dt: number): void {
    // The trail is sampled per frame: after a hitch it would smear across the table.
    if (dt > 0.05) v.trailCount = 0;
    const tp = v.trailPos;
    tp.copyWithin(3, 0, (TRAIL - 1) * 3);
    tp[0] = v.mesh.position.x;
    tp[1] = v.mesh.position.y - 0.4;
    tp[2] = v.mesh.position.z;
    v.trailCount = Math.min(TRAIL, v.trailCount + 1);
    const on = speed > 7 || z > 0.4;
    v.trail.visible = on && v.trailCount > 2;
    if (!v.trail.visible) return;
    const pos = v.trailGeo.attributes.position as THREE.BufferAttribute;
    const col = v.trailGeo.attributes.color as THREE.BufferAttribute;
    const k = Math.min(1, speed / 28);
    const m = v.trailCount;
    // Fade by distance, not by sample: a fast ball would otherwise smear a bar down the lane.
    let cum = 0;
    let n = 0;
    for (let i = 0; i < m; i++) {
      if (i > 0) cum += Math.hypot(tp[i * 3] - tp[i * 3 - 3], tp[i * 3 + 2] - tp[i * 3 - 1]);
      const f = Math.max(0, 1 - cum / TRAIL_LEN);
      const a = Math.max(0, i - 1);
      const b = Math.min(m - 1, i + 1);
      let dx = tp[a * 3] - tp[b * 3];
      let dz = tp[a * 3 + 2] - tp[b * 3 + 2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const w = 0.28 * f;
      const x = tp[i * 3];
      const y = tp[i * 3 + 1];
      const zz = tp[i * 3 + 2];
      pos.setXYZ(i * 2, x - dz * w, y, zz + dx * w);
      pos.setXYZ(i * 2 + 1, x + dz * w, y, zz - dx * w);
      const s = f * f * (0.4 + k * 0.9);
      col.setXYZ(i * 2, 1.0 * s, 0.85 * s, 0.6 * s);
      col.setXYZ(i * 2 + 1, 1.0 * s, 0.85 * s, 0.6 * s);
      n = i + 1;
      if (f === 0) break;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    v.trailGeo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  private makeBall(): BallVis {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    const shadow = new THREE.Mesh(
      this.shadowGeo,
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    const trailPos = new Float32Array(TRAIL * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++)
      idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const trail = new THREE.Mesh(geo, this.trailMat);
    trail.frustumCulled = false;
    trail.renderOrder = 5;
    this.root.add(mesh, shadow, trail);
    return { mesh, shadow, trail, trailPos, trailGeo: geo, trailCount: 0, seen: true };
  }

  /** Show the parts for this ball's tags; the Gold Filling turns its bumper gold. */
  setTags(tags: ReadonlySet<string>): void {
    for (const [t, objs] of this.tagged) for (const o of objs) o.visible = tags.has(t);
    const gold = this.table.mounts.find((m) => m.kind === 'gold');
    const goldId = gold && tags.has(gold.tag) ? (gold.ref ?? '') : '';
    if (goldId === this.goldPop) return;
    for (const [id, v] of this.pops) {
      const isGold = id === goldId;
      v.cap.color.copy(isGold ? CAP_GOLD : CAP_RED);
      v.cap.emissive.copy(isGold ? CAP_GOLD : CAP_RED);
      v.cap.metalness = isGold ? 0.5 : 0;
      v.cap.roughness = isGold ? 0.2 : 0.18;
    }
    this.goldPop = goldId;
  }

  /** World position of a table point (for pops, particles, camera targets). */
  worldOf(x: number, y: number, h = 0.5, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(wx(x), h, wz(y));
    return this.root.localToWorld(out);
  }

  /** Plastics sheet extents (table units), for tools that want to inspect the art. */
  static readonly plasticsRect = PLASTIC_RECT;
}

function makeShadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.45, 'rgba(0,0,0,0.5)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
