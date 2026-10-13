/**
 * TableView: Three.js meshes for DEBTOR'S PRISON, built from the same TableDef the physics
 * uses, and synced every frame from the sim (interpolated) and the rules' lamp states.
 */
import * as THREE from 'three';
import { TABLE } from '../content/table';
import type { LampColor, LampDef, TableDef, WallDef } from '../sim/table-def';
import type { PinballSim } from '../sim/sim';
import { Lamp } from '../rules/types';
import { wx, wz, TW, TH, CX, CY } from './coords';
import { paintPlayfield, shapePath, ART_PX } from './playfield-art';
import { readyArt } from './art';

const LAMP_COLORS: Record<LampColor, number> = {
  red: 0xff3a2a,
  amber: 0xffb020,
  yellow: 0xfff060,
  white: 0xf4f0e8,
  blue: 0x3aa0ff,
  green: 0x40ff70,
  orange: 0xff7a18,
  violet: 0xc070ff,
};

interface LampMesh {
  def: LampDef;
  mat: THREE.MeshBasicMaterial;
  on: THREE.Color;
  off: THREE.Color;
  glow: THREE.Mesh;
}

interface BallVis {
  light: THREE.PointLight;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  trail: THREE.Line;
  trailPos: Float32Array;
  trailCount: number;
  seen: boolean;
}

const TRAIL = 10;

export class TableView {
  readonly root = new THREE.Group();
  private readonly flippers = new Map<string, THREE.Group>();
  private readonly pops = new Map<
    string,
    { cap: THREE.MeshStandardMaterial; ring: THREE.Mesh; base: number }
  >();
  /** Objects shown only when their tag is active for the current ball. */
  private readonly tagged = new Map<string, THREE.Object3D[]>();
  private goldPop = '';
  private readonly slings: THREE.MeshStandardMaterial[] = [];
  private readonly drops: THREE.Mesh[] = [];
  private spinner: THREE.Mesh | null = null;
  private readonly lamps = new Map<string, LampMesh>();
  private readonly balls = new Map<number, BallVis>();
  private readonly ballGeo = new THREE.SphereGeometry(0.5, 24, 16);
  private readonly haloGeo = new THREE.SphereGeometry(0.62, 16, 12);
  private readonly ballMat: THREE.MeshStandardMaterial;
  private pfCanvas!: HTMLCanvasElement;
  private pfTex!: THREE.CanvasTexture;
  private readonly haloMat = new THREE.MeshBasicMaterial({
    color: 0xffe8c0,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
    depthWrite: false,
  });
  private readonly trailMat = new THREE.LineBasicMaterial({
    color: 0xfff0d0,
    transparent: true,
    opacity: 0.45,
  });
  private plunger: THREE.Mesh | null = null;
  private time = 0;
  readonly gold = new Set<string>();
  /** Blackout Sentence: inserts stay dark and each ball carries a light. */
  blackout = false;
  private readonly axis = new THREE.Vector3();

  constructor(
    readonly table: TableDef = TABLE,
    tags: ReadonlySet<string> = new Set(['outlanePosts']),
    envMap: THREE.Texture | null = null,
  ) {
    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0xdedede,
      metalness: 1,
      roughness: 0.12,
      envMap,
      envMapIntensity: 1.4,
    });
    this.build();
    this.setTags(tags);
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    // Everything is built; tagged parts (hardware, Sentences, contraband) toggle per ball.
    const tag = (obj: THREE.Object3D, t?: string) => {
      if (!t) return;
      const list = this.tagged.get(t) ?? [];
      list.push(obj);
      this.tagged.set(t, list);
    };
    const t = this.table;

    // Playfield.
    const canvas = document.createElement('canvas');
    paintPlayfield(canvas, readyArt('machine/playfield-illustration'));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.pfCanvas = canvas;
    this.pfTex = tex;
    const pfW = canvas.width / ART_PX;
    const pfH = canvas.height / ART_PX;
    const pf = new THREE.Mesh(
      new THREE.PlaneGeometry(pfW, pfH),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 }),
    );
    pf.rotation.x = -Math.PI / 2;
    pf.position.set(pfW / 2 - CX, 0, -(pfH / 2 - CY));
    pf.receiveShadow = true;
    pf.name = 'playfield';
    this.root.add(pf);

    const mats = {
      wood: new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.8 }),
      block: new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xb8b8bc, roughness: 0.35, metalness: 0.85 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xd0d0d8, roughness: 0.25, metalness: 0.9 }),
      plastic: new THREE.MeshStandardMaterial({
        color: 0xc8b8a0,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
      }),
      apron: new THREE.MeshStandardMaterial({ color: 0x3c3836, roughness: 0.5, metalness: 0.4 }),
      plug: new THREE.MeshStandardMaterial({ color: 0xc03020, roughness: 0.6 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
      post: new THREE.MeshStandardMaterial({ color: 0xe0dccf, roughness: 0.5 }),
      cabinet: new THREE.MeshStandardMaterial({ color: 0x2b1810, roughness: 0.75 }),
    };

    for (const w of t.walls) {
      if (w.look === 'invisible') continue;
      const mat =
        w.look === 'cabinet'
          ? mats.cabinet
          : w.look === 'block'
            ? mats.block
            : w.look === 'apron'
              ? mats.apron
              : w.look === 'rail'
                ? mats.plastic
                : w.look === 'plug'
                  ? mats.plug
                  : w.mat === 'metal'
                    ? mats.metal
                    : w.mat === 'rubber'
                      ? mats.rubber
                      : mats.wood;
      const mesh = w.look === 'cabinet' ? this.cabinetMesh(w, mat) : this.wallMesh(w, mat);
      if (mesh) {
        this.root.add(mesh);
        tag(mesh, w.tag);
      }
    }
    // One-way gates as thin metal flaps.
    for (const ow of t.oneWays) this.root.add(this.segmentBox(ow.a, ow.b, 0.06, 0.7, mats.metal));

    for (const p of t.posts) {
      const g = new THREE.Group();
      tag(g, p.tag);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.7, 0.9, 12),
        p.mat === 'metal' ? mats.metal : mats.post,
      );
      core.position.y = 0.45;
      g.add(core);
      if (p.mat === 'post') {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(p.r * 0.85, p.r * 0.2, 6, 16),
          mats.rubber,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.3;
        g.add(ring);
      }
      g.position.set(wx(p.x), 0, wz(p.y));
      this.root.add(g);
    }

    for (const b of t.bumpers) {
      const g = new THREE.Group();
      tag(g, b.tag);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r * 0.7, b.r * 0.8, 0.7, 20),
        mats.metal,
      );
      body.position.y = 0.35;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, 0.12, 24), mats.post);
      skirt.position.y = 0.06;
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xd02020,
        emissive: 0x400000,
        roughness: 0.4,
      });
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r * 0.92, b.r * 0.92, 0.3, 24),
        capMat,
      );
      cap.position.y = 0.85;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.86, 0.08, 6, 24), mats.metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.45;
      g.add(body, skirt, cap, ring);
      g.position.set(wx(b.x), 0, wz(b.y));
      this.root.add(g);
      this.pops.set(b.id, { cap: capMat, ring, base: 0.45 });
    }

    for (const s of t.slings) {
      const shape = new THREE.Shape(
        [s.a, s.b, s.c].map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1]))),
      );
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: false });
      const mat = new THREE.MeshStandardMaterial({
        color: 0xe8dcc8,
        roughness: 0.45,
        emissive: 0x000000,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      this.root.add(m);
      this.root.add(this.segmentBox(s.a, s.b, 0.14, 0.5, mats.rubber, s.postR * 0.9));
      this.slings.push(mat);
      for (const p of [s.a, s.b, s.c]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(s.postR, s.postR, 0.8, 12),
          mats.post,
        );
        post.position.set(wx(p[0]), 0.4, wz(p[1]));
        this.root.add(post);
      }
    }

    const dropMat = new THREE.MeshStandardMaterial({
      color: 0x2fae4a,
      roughness: 0.5,
      emissive: 0x0a2010,
    });
    for (const bank of t.dropBanks) {
      for (const d of bank.targets) {
        const m = this.segmentBox(d.a, d.b, 0.22, 0.9, dropMat, -0.12);
        this.drops.push(m);
        this.root.add(m);
      }
    }

    for (const sp of t.spinners) {
      const len = Math.hypot(sp.b[0] - sp.a[0], sp.b[1] - sp.a[1]);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.55, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xf0e070, metalness: 0.7, roughness: 0.3 }),
      );
      plate.geometry.translate(0, -0.3, 0);
      const holder = new THREE.Group();
      holder.position.set(wx((sp.a[0] + sp.b[0]) / 2), 0.75, wz((sp.a[1] + sp.b[1]) / 2));
      holder.rotation.y = Math.atan2(sp.b[1] - sp.a[1], sp.b[0] - sp.a[0]);
      const spin = new THREE.Group();
      spin.add(plate);
      holder.add(spin);
      this.root.add(holder);
      this.spinner = plate;
    }

    const flipMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.45 });
    const flipRubber = new THREE.MeshStandardMaterial({ color: 0x9a1810, roughness: 0.8 });
    for (const f of t.flippers) {
      const shape = flipperShape(f.len, f.r0, f.r1);
      const body = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 10 }),
        [flipMat, flipRubber],
      );
      body.rotation.x = -Math.PI / 2;
      const g = new THREE.Group();
      g.add(body);
      g.position.set(wx(f.x), 0.02, wz(f.y));
      this.root.add(g);
      this.flippers.set(f.id, g);
      tag(g, f.tag);
    }

    // Wireforms and the Chute ramp.
    for (const tp of t.transports) {
      const pts = tp.path.map((p) => new THREE.Vector3(wx(p[0]), p[2] + 0.5, wz(p[1])));
      const curve = new THREE.CatmullRomCurve3(pts);
      const seg = Math.max(24, Math.round(curve.getLength() * 4));
      const half = tp.look === 'ramp' ? 0.62 : 0.42;
      for (const side of [-1, 1]) {
        const railPts: THREE.Vector3[] = [];
        for (let i = 0; i <= seg; i++) {
          const { p, n } = sideAt(curve, i / seg);
          railPts.push(p.addScaledVector(n, side * half).add(new THREE.Vector3(0, -0.12, 0)));
        }
        this.root.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(railPts),
              seg,
              tp.look === 'ramp' ? 0.07 : 0.05,
              6,
            ),
            mats.rail,
          ),
        );
      }
      if (tp.look === 'ramp') {
        const floor = new THREE.Mesh(
          ribbon(curve, seg, half, -0.5),
          new THREE.MeshStandardMaterial({
            color: 0x9ac0ff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        this.root.add(floor);
      }
    }

    // Plunger rod.
    const pl = t.plunger;
    this.plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 10), mats.metal);
    this.plunger.rotation.x = Math.PI / 2;
    this.plunger.position.set(wx(pl.x), 0.4, wz(pl.y - 1.5));
    this.root.add(this.plunger);

    // Lamps (inserts).
    for (const l of t.lamps) this.addLamp(l);
  }

  private addLamp(l: LampDef): void {
    const shape = lampShape(l.shape, l.size);
    const geo = new THREE.ShapeGeometry(shape, 8);
    const on = new THREE.Color(LAMP_COLORS[l.color]);
    const off = on.clone().multiplyScalar(0.12);
    const mat = new THREE.MeshBasicMaterial({ color: off.clone() });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = (l.rot * Math.PI) / 180;
    m.position.set(wx(l.x), 0.015, wz(l.y));
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(l.size * 1.3, 16),
      new THREE.MeshBasicMaterial({
        color: on,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(wx(l.x), 0.03, wz(l.y));
    this.root.add(m, glow);
    this.lamps.set(l.id, { def: l, mat, on, off, glow });
  }

  private wallMesh(w: WallDef, mat: THREE.Material): THREE.Mesh | null {
    if (!w.loop) return null;
    const shape = new THREE.Shape(w.pts.map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1]))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w.h ?? 1, bevelEnabled: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = true;
    return m;
  }

  private cabinetMesh(w: WallDef, mat: THREE.Material): THREE.Mesh {
    const pad = 1.6;
    const outer = new THREE.Shape([
      new THREE.Vector2(-TW / 2 - pad, -TH / 2 - pad - 2),
      new THREE.Vector2(TW / 2 + pad, -TH / 2 - pad - 2),
      new THREE.Vector2(TW / 2 + pad, TH / 2 + pad),
      new THREE.Vector2(-TW / 2 - pad, TH / 2 + pad),
    ]);
    const pts = w.pts.map((p) => new THREE.Vector2(wx(p[0]), -wz(p[1])));
    outer.holes.push(new THREE.Path(pts.reverse()));
    const m = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outer, { depth: w.h ?? 2, bevelEnabled: false }),
      mat,
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  /** A box lying along table segment a->b, standing `h` tall; offset shifts it along the normal. */
  private segmentBox(
    a: readonly number[],
    b: readonly number[],
    thick: number,
    h: number,
    mat: THREE.Material,
    offset = 0,
  ): THREE.Mesh {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, thick), mat);
    m.position.set(wx((a[0] + b[0]) / 2 + nx * offset), h / 2, wz((a[1] + b[1]) / 2 + ny * offset));
    m.rotation.y = Math.atan2(dy, dx);
    return m;
  }

  /** Print the art pack's illustration on the playfield (it arrives after the table is built). */
  setIllustration(img: HTMLImageElement): void {
    paintPlayfield(this.pfCanvas, img);
    this.pfTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ per-frame sync

  update(sim: PinballSim, lamps: Record<string, Lamp> | null, alpha: number, dt: number): void {
    this.time += dt;
    for (const f of sim.flippers) {
      const g = this.flippers.get(f.def.id);
      if (!g) continue;
      g.rotation.y = f.prevAngle + (f.angle - f.prevAngle) * alpha;
    }
    for (const p of sim.pops) {
      const v = this.pops.get(p.id);
      if (!v) continue;
      if (p.id === this.goldPop) v.cap.emissive.setRGB(0.35 + p.flash, 0.25 + p.flash * 0.8, 0.02);
      else v.cap.emissive.setRGB(0.25 + p.flash * 0.9, 0.02 + p.flash * 0.25, 0);
      v.ring.position.y = v.base - p.flash * 0.3;
    }
    sim.slings.forEach((s, i) =>
      this.slings[i]?.emissive.setRGB(s.flash * 0.7, s.flash * 0.5, s.flash * 0.2),
    );
    sim.drops.forEach((d, i) => {
      const m = this.drops[i];
      if (!m) return;
      const target = d.up ? 0.45 : -0.5;
      m.position.y += (target - m.position.y) * Math.min(1, dt * 25);
    });
    if (this.spinner && sim.spinners[0])
      this.spinner.parent!.rotation.x = sim.spinners[0].angle * Math.PI * 2;
    if (this.plunger)
      this.plunger.position.z = wz(sim.table.plunger.y - 1.5) + sim.plungerPull * 1.1;

    // Lamps.
    if (lamps) {
      const slow = Math.sin(this.time * Math.PI * 2 * 1.6) > 0;
      const fast = Math.sin(this.time * Math.PI * 2 * 5) > 0;
      for (const [id, lm] of this.lamps) {
        const mode = lamps[id] ?? Lamp.Off;
        const lit =
          !this.blackout &&
          (mode === Lamp.On || (mode === Lamp.Slow && slow) || (mode === Lamp.Fast && fast));
        lm.mat.color.copy(lit ? lm.on : lm.off);
        (lm.glow.material as THREE.MeshBasicMaterial).opacity = lit ? 0.35 : 0;
      }
    }

    // Balls.
    for (const v of this.balls.values()) v.seen = false;
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
      v.halo.position.copy(v.mesh.position);
      // Rolling look: rotate around the axis perpendicular to motion.
      const vx = b.vx;
      const vy = b.vy;
      const sp = Math.hypot(vx, vy);
      if (sp > 0.01) {
        this.axis.set(-vy / sp, 0, -vx / sp);
        v.mesh.rotateOnWorldAxis(this.axis, sp * dt * 2);
      }
      v.light.visible = this.blackout;
      if (this.blackout)
        v.light.position.set(v.mesh.position.x, v.mesh.position.y + 1.4, v.mesh.position.z);
      // Trail.
      const tp = v.trailPos;
      tp.copyWithin(3, 0, (TRAIL - 1) * 3);
      tp[0] = v.mesh.position.x;
      tp[1] = v.mesh.position.y;
      tp[2] = v.mesh.position.z;
      v.trailCount = Math.min(TRAIL, v.trailCount + 1);
      v.trail.geometry.setDrawRange(0, v.trailCount);
      (v.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      v.trail.visible = sp > 8;
    }
    for (const [id, v] of this.balls) {
      if (!v.seen) {
        this.root.remove(v.mesh, v.halo, v.trail, v.light);
        v.trail.geometry.dispose();
        this.balls.delete(id);
      }
    }
  }

  private makeBall(): BallVis {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.castShadow = true;
    const halo = new THREE.Mesh(this.haloGeo, this.haloMat);
    const trailPos = new Float32Array(TRAIL * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(geo, this.trailMat);
    trail.frustumCulled = false;
    // Blackout: each ball carries its own small light.
    const light = new THREE.PointLight(0xffe0b0, 7, 7, 1.6);
    light.visible = false;
    this.root.add(mesh, halo, trail, light);
    return { mesh, halo, trail, trailPos, trailCount: 0, seen: true, light };
  }

  /** Show the parts for this ball's tags; the Gold Filling turns its bumper gold. */
  setTags(tags: ReadonlySet<string>): void {
    for (const [t, objs] of this.tagged) for (const o of objs) o.visible = tags.has(t);
    const gold = this.table.mounts.find((m) => m.kind === 'gold');
    const goldId = gold && tags.has(gold.tag) ? (gold.ref ?? '') : '';
    if (goldId === this.goldPop) return;
    for (const [id, v] of this.pops) {
      const isGold = id === goldId;
      v.cap.color.setHex(isGold ? 0xe8b830 : 0xd02020);
      v.cap.metalness = isGold ? 0.85 : 0;
      v.cap.roughness = isGold ? 0.25 : 0.4;
    }
    this.goldPop = goldId;
  }

  /** World position of a table point (for pops, particles, camera targets). */
  worldOf(x: number, y: number, h = 0.5, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(wx(x), h, wz(y));
    return this.root.localToWorld(out);
  }
}

function flipperShape(len: number, r0: number, r1: number): THREE.Shape {
  // Local table coords: x along the bat from the pivot, y up-table. Shape y maps to table y.
  const phi = Math.asin((r0 - r1) / len);
  const a = Math.PI / 2 - phi;
  const s = new THREE.Shape();
  s.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
  s.absarc(0, 0, r0, a, Math.PI * 2 - a, false);
  s.lineTo(len + r1 * Math.cos(-a), r1 * Math.sin(-a));
  s.absarc(len, 0, r1, -a, a, false);
  s.lineTo(r0 * Math.cos(a), r0 * Math.sin(a));
  return s;
}

/** Point on the curve and the horizontal unit vector to its right. */
function sideAt(curve: THREE.CatmullRomCurve3, u: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u);
  const n = new THREE.Vector3(-t.z, 0, t.x);
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
  n.normalize();
  return { p, n };
}

function ribbon(
  curve: THREE.CatmullRomCurve3,
  seg: number,
  half: number,
  yOff: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const { p, n } = sideAt(curve, i / seg);
    pos.push(
      p.x - n.x * half,
      p.y + yOff,
      p.z - n.z * half,
      p.x + n.x * half,
      p.y + yOff,
      p.z + n.z * half,
    );
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lampShape(kind: LampDef['shape'], size: number): THREE.Shape {
  // Build via the same path routine as the playfield sockets, sampled into a Shape.
  const s = new THREE.Shape();
  const pts: [number, number][] = [];
  const fake = {
    beginPath() {},
    moveTo(x: number, y: number) {
      pts.push([x, y]);
    },
    lineTo(x: number, y: number) {
      pts.push([x, y]);
    },
    closePath() {},
    arc(cx: number, cy: number, r: number) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    },
    rect(x: number, y: number, w: number, h: number) {
      pts.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
    },
  } as unknown as CanvasRenderingContext2D;
  shapePath(fake, kind, size);
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, -y) : s.lineTo(x, -y)));
  return s;
}
