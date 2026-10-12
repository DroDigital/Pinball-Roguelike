/**
 * Render pipeline. The scene renders HDR (half float, MSAA when the tier allows) into an
 * internal-resolution target; a dual-filter bloom pulls bright/emissive pixels (inserts,
 * flashers, bumper caps, the DMD) into a soft glow; a final pass adds the glow, tone maps
 * (ACES), sharpens a touch and applies the retro stack (anti-banding dither, optional ordered
 * dither + palette crush, grain, vignette). Strength settings come from Settings.
 *
 * Juice hook: `bloomPulse(k)` kicks the bloom and exposure for a moment (honours reduced
 * flashing). Quality is tiered by internal height so the quality watchdog (which lowers
 * `settings.pixelHeight`) also drops MSAA and bloom levels.
 */
import * as THREE from 'three';
import { buildEnvironment } from './env-map';

export interface RetroSettings {
  /** Internal render height in pixels (540 = crisp default, 240 = chunky). 0 = native. */
  pixelHeight: number;
  /** 0..1 strength of grain/dither/vignette. */
  crt: number;
  /** Colour levels per channel for the palette crush (0 = off). */
  levels: number;
  /** Bloom strength multiplier (0 = off). */
  bloom: number;
}

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 fetch(vec2 uv) {
  vec3 c = texture2D(tSrc, uv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float k = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * k;
}
void main() {
  vec2 o = uTexel * 0.5;
  // 4 bilinear taps = a 4x4 box; clamp to tame single-pixel fireflies.
  vec3 c = fetch(vUv + vec2(-o.x, -o.y)) + fetch(vUv + vec2(o.x, -o.y))
         + fetch(vUv + vec2(-o.x, o.y)) + fetch(vUv + vec2(o.x, o.y));
  gl_FragColor = vec4(min(c * 0.25, vec3(24.0)), 1.0);
}
`;

const DOWN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c * 0.125, 1.0);
}
`;

const UP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c * (uGain / 12.0), 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uLowRes;
uniform float uPixelate;
uniform float uTime;
uniform float uCrt;
uniform float uLevels;
uniform float uFlash;
uniform vec3 uTint;
uniform float uExposure;
uniform float uBloom;
uniform float uSharpen;
varying vec2 vUv;

float bayer4(vec2 p) {
  vec2 q = mod(p, 4.0);
  float x = q.x;
  float y = q.y;
  // 4x4 ordered-dither matrix without arrays.
  float a = mod(floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0, 4.0);
  float b = mod(mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0, 4.0);
  return (a * 4.0 + b) / 16.0 - 0.47;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

vec3 sceneAt(vec2 uv) {
  vec2 q = uPixelate > 0.5 ? (floor(uv * uLowRes) + 0.5) / uLowRes : uv;
  return texture2D(tScene, q).rgb;
}

void main() {
  vec3 c = sceneAt(vUv);
  if (uPixelate < 0.5 && uSharpen > 0.0) {
    vec2 o = 1.0 / uLowRes;
    vec3 b = (sceneAt(vUv + vec2(o.x, 0.0)) + sceneAt(vUv - vec2(o.x, 0.0))
            + sceneAt(vUv + vec2(0.0, o.y)) + sceneAt(vUv - vec2(0.0, o.y))) * 0.25;
    c = max(c + clamp(c - b, vec3(-0.35), vec3(0.35)) * uSharpen, vec3(0.0));
  }
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  // ACES filmic tone map, then linear -> sRGB (render target holds linear HDR).
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0 / 2.2));
  vec2 px = uPixelate > 0.5 ? floor(vUv * uLowRes) : gl_FragCoord.xy;
  // Always: sub-LSB dither so dark gradients and bloom falloff never band.
  c += (ign(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5) / 255.0 * 1.6;
  // Retro: ordered dither + palette crush, scaled by the Grain and dither setting.
  if (uLevels > 0.5 && uCrt > 0.02) {
    float d = bayer4(px) * uCrt;
    c = floor(c * uLevels + d + 0.5) / uLevels;
  }
  float g = hash(px + fract(uTime) * 91.7) - 0.5;
  c += g * 0.07 * uCrt;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * (0.35 + 0.9 * uCrt);
  c = c * uTint + uFlash;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const MAX_MIPS = 5;

interface Tier {
  samples: number;
  mips: number;
}

function tierFor(lowH: number): Tier {
  if (lowH >= 400) return { samples: 4, mips: 5 };
  if (lowH >= 280) return { samples: 2, mips: 4 };
  return { samples: 0, mips: 3 };
}

export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** PMREM reflection environment for the machine's metals and glass. */
  readonly env: THREE.Texture;
  private target: THREE.WebGLRenderTarget;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private mipCount = MAX_MIPS;
  private readonly postScene = new THREE.Scene();
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly postMat: THREE.ShaderMaterial;
  private readonly preMat: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  settings: RetroSettings = { pixelHeight: 540, crt: 0.35, levels: 40, bloom: 0.75 };
  /** Adaptive scale multiplier (performance governor). */
  scale = 1;
  flash = 0;
  exposure = 1.1;
  /** Honour Settings.reducedFlashing: caps bloom pulses. */
  reducedFlashing = false;
  readonly tint = new THREE.Vector3(1, 1, 1);
  private lowW = 640;
  private lowH = 360;
  private pulse = 0;
  private lastTime = 0;
  private samples = -1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = false;
    // One frame spans several passes; keep the counters for the whole frame.
    this.renderer.info.autoReset = false;
    this.env = buildEnvironment(this.renderer);
    this.target = new THREE.WebGLRenderTarget(this.lowW, this.lowH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      type: THREE.HalfFloatType,
    });
    const pass = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        vertexShader: POST_VERT,
        fragmentShader: frag,
        uniforms,
        depthTest: false,
        depthWrite: false,
      });
    this.preMat = pass(PREFILTER_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.2 },
      uKnee: { value: 0.6 },
    });
    this.downMat = pass(DOWN_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this.upMat = pass(UP_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uGain: { value: 1 },
    });
    this.upMat.blending = THREE.CustomBlending;
    this.upMat.blendEquation = THREE.AddEquation;
    this.upMat.blendSrc = THREE.OneFactor;
    this.upMat.blendDst = THREE.OneFactor;
    this.postMat = pass(POST_FRAG, {
      tScene: { value: this.target.texture },
      tBloom: { value: null },
      uLowRes: { value: new THREE.Vector2(this.lowW, this.lowH) },
      uPixelate: { value: 0 },
      uTime: { value: 0 },
      uCrt: { value: 0.35 },
      uLevels: { value: 40 },
      uFlash: { value: 0 },
      uTint: { value: this.tint },
      uExposure: { value: 1.1 },
      uBloom: { value: 0.75 },
      uSharpen: { value: 0.3 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
  }

  get lowSize(): { w: number; h: number } {
    return { w: this.lowW, h: this.lowH };
  }

  /** Kick the bloom and exposure for a moment (big hit, jackpot, flasher). */
  bloomPulse(k: number): void {
    // Capped near 1.1: a bigger kick washes the printed field out (bloom reaches 2.5x).
    this.pulse = Math.max(this.pulse, Math.min(this.reducedFlashing ? 0.35 : 1.1, k));
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const ph =
      this.settings.pixelHeight > 0 ? Math.round(this.settings.pixelHeight * this.scale) : h;
    this.lowH = Math.max(120, Math.min(h, ph));
    this.lowW = Math.max(160, Math.round((this.lowH * w) / h));
    const tier = tierFor(this.lowH);
    if (tier.samples !== this.samples) {
      this.samples = tier.samples;
      this.target.samples = tier.samples;
      this.target.dispose();
    }
    this.target.setSize(this.lowW, this.lowH);
    (this.postMat.uniforms.uLowRes.value as THREE.Vector2).set(this.lowW, this.lowH);
    this.mipCount = tier.mips;
    // Bloom chain: half resolution first, then halving.
    let bw = Math.max(8, this.lowW >> 1);
    let bh = Math.max(8, this.lowH >> 1);
    for (let i = 0; i < MAX_MIPS; i++) {
      let rt = this.mips[i];
      if (!rt) {
        rt = new THREE.WebGLRenderTarget(bw, bh, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          type: THREE.HalfFloatType,
        });
        this.mips[i] = rt;
      } else rt.setSize(bw, bh);
      bw = Math.max(4, bw >> 1);
      bh = Math.max(4, bh >> 1);
    }
  }

  get aspect(): number {
    return this.lowW / this.lowH;
  }

  private runPass(mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.postScene, this.postCam);
  }

  private bloomChain(): THREE.Texture | null {
    const n = this.mipCount;
    const m = this.mips;
    // Bright pass into mip 0 (half resolution), then the down chain.
    this.preMat.uniforms.tSrc.value = this.target.texture;
    (this.preMat.uniforms.uTexel.value as THREE.Vector2).set(1 / this.lowW, 1 / this.lowH);
    this.runPass(this.preMat, m[0]);
    for (let i = 1; i < n; i++) {
      this.downMat.uniforms.tSrc.value = m[i - 1].texture;
      (this.downMat.uniforms.uTexel.value as THREE.Vector2).set(
        1 / m[i - 1].width,
        1 / m[i - 1].height,
      );
      this.runPass(this.downMat, m[i]);
    }
    // Up chain: each level adds the smaller one's blur on top of itself.
    for (let i = n - 2; i >= 0; i--) {
      this.upMat.uniforms.tSrc.value = m[i + 1].texture;
      (this.upMat.uniforms.uTexel.value as THREE.Vector2).set(
        1 / m[i + 1].width,
        1 / m[i + 1].height,
      );
      this.upMat.uniforms.uGain.value = 1;
      this.runPass(this.upMat, m[i]);
    }
    return m[0].texture;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.pulse *= Math.exp(-dt * 4.5);
    r.info.reset();
    r.autoClear = true;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    let bloomTex: THREE.Texture | null = null;
    const bloomOn = this.settings.bloom > 0.001;
    if (bloomOn) {
      r.autoClear = false;
      bloomTex = this.bloomChain();
      r.autoClear = true;
    }
    const u = this.postMat.uniforms;
    u.tBloom.value = bloomTex ?? this.mips[0]?.texture ?? null;
    u.uTime.value = time;
    u.uCrt.value = this.settings.crt;
    u.uLevels.value = this.settings.levels;
    u.uFlash.value = this.flash;
    u.uExposure.value = this.exposure * (1 + this.pulse * 0.12);
    u.uBloom.value = bloomOn ? this.settings.bloom * (1 + this.pulse * 1.4) : 0;
    u.uPixelate.value = this.lowH <= 360 && this.settings.pixelHeight > 0 ? 1 : 0;
    u.uSharpen.value = this.lowH > 360 ? 0.3 : 0;
    this.runPass(this.postMat, null);
  }
}
