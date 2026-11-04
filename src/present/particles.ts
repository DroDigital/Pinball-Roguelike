/**
 * Pooled particle field for the juice: sparks off bumpers and slings, coin flecks on payouts,
 * embers for big moments. One THREE.Points draw call with additive blending; particles live in
 * a ring buffer of typed arrays, so spawning and updating never allocate.
 */
import * as THREE from 'three';

export type ParticleKind = 'spark' | 'coin' | 'ember' | 'glint';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aKind;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
  vKind = aKind;
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  // Sparks and glints: a hot core with a soft falloff. Coins: a flat disc with a rim.
  float a = vKind > 0.5 && vKind < 1.5
    ? (r < 0.62 ? 1.0 : 0.55) * (1.0 - smoothstep(0.82, 1.0, r))
    : exp(-r * 3.2);
  vec3 c = vColor * (vKind > 0.5 && vKind < 1.5 ? (0.8 + 0.5 * (1.0 - r)) : (1.0 + 1.6 * exp(-r * 9.0)));
  gl_FragColor = vec4(c * a * vAlpha, a * vAlpha);
}
`;

const KIND_ID: Record<ParticleKind, number> = { spark: 0, coin: 1, ember: 2, glint: 3 };

export class ParticleField {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly sizeA: Float32Array;
  private readonly alphaA: Float32Array;
  private readonly colorA: Float32Array;
  private readonly kindA: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private next = 0;
  private live = 0;
  /** Settings > Reduced flashing: fewer, dimmer particles. */
  reduced = false;
  /** World up (the cabinet stands on world y). */
  gravity = -22;

  constructor(count = 900) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.size0 = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.sizeA = new Float32Array(count);
    this.alphaA = new Float32Array(count);
    this.colorA = new Float32Array(count * 3);
    this.kindA = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.sizeA, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alphaA, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.colorA, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aKind',
      new THREE.BufferAttribute(this.kindA, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Point size scale follows the render height so particles keep their look at any resolution. */
  setViewHeight(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px * 0.55;
  }

  /**
   * Spawn `count` particles at p. `speed` is the burst speed, `up` biases them upward (world
   * y), `color` is a hex colour.
   */
  burst(
    kind: ParticleKind,
    p: THREE.Vector3,
    count: number,
    color: number,
    speed = 8,
    up = 0.6,
    size = 1,
  ): void {
    if (this.reduced) count = Math.ceil(count * 0.4);
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    const k = KIND_ID[kind];
    for (let c = 0; c < count; c++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const i3 = i * 3;
      this.pos[i3] = p.x;
      this.pos[i3 + 1] = p.y;
      this.pos[i3 + 2] = p.z;
      // Random direction on a sphere, lifted toward world up.
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + 0.65 * Math.random());
      this.vel[i3] = s * Math.cos(t) * v;
      this.vel[i3 + 1] = (Math.abs(u) * (1 - up) + up) * v;
      this.vel[i3 + 2] = s * Math.sin(t) * v;
      const life =
        kind === 'spark'
          ? 0.25 + Math.random() * 0.3
          : kind === 'coin'
            ? 0.9 + Math.random() * 0.6
            : kind === 'ember'
              ? 0.8 + Math.random() * 0.8
              : 0.35;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size0[i] =
        size *
        (kind === 'coin' ? 0.55 : kind === 'ember' ? 0.32 : kind === 'glint' ? 0.9 : 0.24) *
        (0.7 + Math.random() * 0.6);
      this.drag[i] = kind === 'ember' ? 1.8 : kind === 'spark' ? 2.6 : 0.6;
      this.grav[i] = kind === 'ember' ? 0.15 : kind === 'glint' ? 0 : 1;
      this.colorA[i3] = r;
      this.colorA[i3 + 1] = g;
      this.colorA[i3 + 2] = b;
      this.kindA[i] = k;
    }
    this.live = Math.min(this.n, this.live + count);
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let alive = 0;
    const g = this.gravity * dt;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.alphaA[i] !== 0) this.alphaA[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d + g * this.grav[i];
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alphaA[i] = (this.reduced ? 0.6 : 1) * Math.min(1, k * 2.2);
      this.sizeA[i] = this.size0[i] * (this.kindA[i] === 0 ? 0.4 + 0.6 * k : 1);
    }
    this.live = alive;
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aKind.needsUpdate = true;
  }
}
