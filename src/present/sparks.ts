/**
 * Hit sparks and shock rings: one pooled Points cloud and a few pooled ring meshes, so the
 * table can throw light on every hit without allocating.
 */
import * as THREE from 'three';

const POOL = 360;
const RINGS = 10;

export class Sparks {
  readonly group = new THREE.Group();
  private readonly pos = new Float32Array(POOL * 3);
  private readonly col = new Float32Array(POOL * 3);
  private readonly vel = new Float32Array(POOL * 3);
  private readonly life = new Float32Array(POOL);
  private readonly max = new Float32Array(POOL);
  private readonly base = new Float32Array(POOL * 3);
  private readonly geo = new THREE.BufferGeometry();
  private readonly rings: { m: THREE.Mesh; t: number; life: number; size: number }[] = [];
  private next = 0;
  private nextRing = 0;
  private readonly c = new THREE.Color();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -999;
    const pts = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.42,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pts.frustumCulled = false;
    this.group.add(pts);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 20);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.visible = false;
      this.group.add(m);
      this.rings.push({ m, t: 0, life: 0, size: 1 });
    }
  }

  /** Throw `n` sparks outward from a world point. */
  burst(p: THREE.Vector3, color: number, n = 10, speed = 9, up = 5): void {
    this.c.setHex(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.3 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.base[i * 3] = this.c.r;
      this.base[i * 3 + 1] = this.c.g;
      this.base[i * 3 + 2] = this.c.b;
      this.max[i] = this.life[i] = 0.25 + Math.random() * 0.4;
    }
  }

  /** A flat ring that swells and fades (bumpers, jackpots). `tilt` lays it on the table. */
  ring(p: THREE.Vector3, color: number, size = 3, life = 0.35, tilt = -Math.PI / 2 + 0.11): void {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % RINGS;
    r.m.position.copy(p);
    r.m.rotation.set(tilt, 0, 0);
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.t = 0;
    r.life = life;
    r.size = size;
    r.m.visible = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -999;
        continue;
      }
      this.vel[j + 1] -= 26 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = this.life[i] / this.max[i];
      this.col[j] = this.base[j] * k;
      this.col[j + 1] = this.base[j + 1] * k;
      this.col[j + 2] = this.base[j + 2] * k;
    }
    if (any) {
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(0.3 + r.size * (1 - (1 - k) * (1 - k)));
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }
  }
}
