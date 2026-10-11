/**
 * Room-surface material in the late-90s console style: vertices snapped to the low-res pixel
 * grid, affine (screen-linear) texture mapping that wobbles as the camera moves, lit by the
 * bare bulb with a hard falloff, exponential fog, and rust/grime that grows with the cell's
 * decay. Only the cell uses it; the machine keeps standard materials so it stays readable.
 */
import * as THREE from 'three';

/** Uniforms shared by every room surface, updated once per frame by the World. */
export const ROOM_UNIFORMS = {
  uBulbPos: { value: new THREE.Vector3(0, 26, 12) },
  uBulbColor: { value: new THREE.Color(1, 0.84, 0.6) },
  uBulbPower: { value: 1 },
  uAmbient: { value: new THREE.Color(0.11, 0.09, 0.08) },
  uSnap: { value: new THREE.Vector2(213, 120) },
  uFogColor: { value: new THREE.Color(0.027, 0.02, 0.016) },
  uFogDensity: { value: 0.012 },
  uDecay: { value: 0 },
  uTime: { value: 0 },
};

const vert = /* glsl */ `
uniform vec2 uSnap;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUvW;
varying float vW;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  vec4 clip = projectionMatrix * view;
  // Snap to the low-res pixel grid (in NDC, then back to clip space).
  vec2 ndc = clip.xy / clip.w;
  ndc = floor(ndc * uSnap + 0.5) / uSnap;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  // Affine mapping: interpolate uv*w and w, divide per fragment.
  vUvW = uv * clip.w;
  vW = clip.w;
}
`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform vec2 uUvScale;
uniform vec3 tint;
uniform vec3 uBulbPos;
uniform vec3 uBulbColor;
uniform float uBulbPower;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDecay;
uniform float uRust;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUvW;
varying float vW;
varying float vDepth;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 uv = vUvW / vW * uUvScale;
  vec3 albedo = texture2D(map, uv).rgb * tint;
  // Rust streaks run down from the top of walls; more of them as the cell decays.
  float streak = noise(vec2(vWorld.x * 0.35 + vWorld.z * 0.35, vWorld.y * 0.04));
  float grime = noise(vWorld.xz * 0.08 + vWorld.y * 0.05);
  float rust = smoothstep(0.75 - uDecay * 0.35 * uRust, 0.95, streak) * uRust;
  albedo = mix(albedo, vec3(0.34, 0.14, 0.05) * (0.6 + grime * 0.6), rust * 0.8);
  albedo *= 0.75 + grime * 0.35;
  // Bulb: Lambert with a hard inverse-square falloff.
  vec3 toL = uBulbPos - vWorld;
  float d2 = dot(toL, toL);
  float lambert = max(dot(normalize(vNormal), toL * inversesqrt(d2)), 0.0);
  vec3 light = uAmbient + uBulbColor * uBulbPower * lambert * (900.0 / (d2 + 60.0));
  vec3 col = albedo * light;
  float fog = 1.0 - exp(-pow(uFogDensity * vDepth, 2.0));
  gl_FragColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}
`;

export interface RetroOptions {
  map: THREE.Texture;
  tint?: THREE.ColorRepresentation;
  /** 0 = no rust on this surface (floors, glass). */
  rust?: number;
  /** Texture repeats across the surface. */
  repeat?: [number, number];
  side?: THREE.Side;
}

export function retroMaterial(o: RetroOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...ROOM_UNIFORMS,
      map: { value: o.map },
      tint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      uUvScale: { value: new THREE.Vector2(...(o.repeat ?? [1, 1])) },
      uRust: { value: o.rust ?? 1 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: o.side ?? THREE.FrontSide,
  });
}

/** Procedural canvas texture helper (nearest filtered, repeating). */
export function canvasTexture(
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
