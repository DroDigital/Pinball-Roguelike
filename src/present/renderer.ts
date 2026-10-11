/**
 * Render pipeline: the scene renders into a low-resolution target (default ~426x240), then a
 * full-screen pass upscales it with nearest-neighbour filtering and applies the retro stack
 * (ordered dither, palette crush, vignette, grain). Strength settings come from Settings.
 */
import * as THREE from 'three';

export interface RetroSettings {
  /** Internal render height in pixels (240 = authentic). 0 = native. */
  pixelHeight: number;
  /** 0..1 strength of grain/dither/vignette. */
  crt: number;
  /** Colour levels per channel for the palette crush (0 = off). */
  levels: number;
}

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uLowRes;
uniform float uTime;
uniform float uCrt;
uniform float uLevels;
uniform float uFlash;
uniform vec3 uTint;
uniform float uExposure;
varying vec2 vUv;

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) if (k == i) v = m[k];
  return v / 16.0 - 0.5;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = floor(vUv * uLowRes);
  vec3 c = texture2D(tScene, (px + 0.5) / uLowRes).rgb * uExposure;
  // ACES filmic tone map, then linear -> sRGB (render target holds linear HDR).
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0 / 2.2));
  // Ordered dither + palette crush.
  if (uLevels > 0.5) {
    float d = bayer4(px) * uCrt;
    c = floor(c * uLevels + d + 0.5) / uLevels;
  }
  // Film grain.
  float g = hash(px + fract(uTime) * 91.7) - 0.5;
  c += g * 0.06 * uCrt;
  // Vignette.
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 1.15 * uCrt;
  c = c * uTint + uFlash;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private readonly postScene = new THREE.Scene();
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly postMat: THREE.ShaderMaterial;
  settings: RetroSettings = { pixelHeight: 240, crt: 0.7, levels: 24 };
  /** Adaptive scale multiplier (performance governor). */
  scale = 1;
  flash = 0;
  exposure = 1.1;
  readonly tint = new THREE.Vector3(1, 1, 1);
  private lowW = 426;
  private lowH = 240;

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
    this.target = new THREE.WebGLRenderTarget(this.lowW, this.lowH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      type: THREE.HalfFloatType,
    });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uLowRes: { value: new THREE.Vector2(this.lowW, this.lowH) },
        uTime: { value: 0 },
        uCrt: { value: 0.7 },
        uLevels: { value: 24 },
        uFlash: { value: 0 },
        uTint: { value: this.tint },
        uExposure: { value: 1.1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  get lowSize(): { w: number; h: number } {
    return { w: this.lowW, h: this.lowH };
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const ph =
      this.settings.pixelHeight > 0 ? Math.round(this.settings.pixelHeight * this.scale) : h;
    this.lowH = Math.max(120, Math.min(h, ph));
    this.lowW = Math.max(160, Math.round((this.lowH * w) / h));
    this.target.setSize(this.lowW, this.lowH);
    (this.postMat.uniforms.uLowRes.value as THREE.Vector2).set(this.lowW, this.lowH);
  }

  get aspect(): number {
    return this.lowW / this.lowH;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    const u = this.postMat.uniforms;
    u.uTime.value = time;
    u.uCrt.value = this.settings.crt;
    u.uLevels.value = this.settings.levels;
    u.uFlash.value = this.flash;
    u.uExposure.value = this.exposure;
    r.render(this.postScene, this.postCam);
  }
}
