/**
 * Playfield lamp inserts: translucent coloured plastic that is a dark, glossy piece of the
 * playfield when off and glows hot when lit. All inserts share one merged mesh; each lamp has
 * a per-vertex level that is smoothed like a real incandescent filament (fast warm-up, slower
 * cool-down), so blinking lamps breathe instead of snapping. A transient "kick" overdrives a
 * lamp past full brightness (juice hook: TableView.flashLamp).
 */
import * as THREE from 'three';
import type { LampColor, LampDef } from '../sim/table-def';
import { Lamp } from '../rules/types';
import { wx, wz } from './coords';
import { lampOutline } from './machine-parts';

export const LAMP_COLORS: Record<LampColor, number> = {
  red: 0xff2a20,
  amber: 0xffa818,
  yellow: 0xffe23a,
  white: 0xfff4e4,
  blue: 0x2f8cff,
  green: 0x24ff6a,
  orange: 0xff6a10,
  violet: 0xb060ff,
};

const RISE = 26; // 1/s: filament warm-up
const FALL = 8; // 1/s: cool-down
const KICK_DECAY = 7;
/** Breathing rates of Slow and Fast lamps, in cycles a second. */
const SLOW_RATE = 1.2;
const FAST_RATE = 2.5;
const SLOW_RATE_REDUCED = 0.5;
const FAST_RATE_REDUCED = 0.8;
/** Emissive multiplier at full brightness (HDR: blooms past the threshold). */
const GAIN = 2.3;

interface LampRange {
  id: string;
  start: number;
  count: number;
}

export class Inserts {
  readonly mesh: THREE.Mesh;
  private readonly ranges: LampRange[] = [];
  private readonly level: Float32Array;
  private readonly kick: Float32Array;
  private readonly lampAttr: THREE.BufferAttribute;
  private readonly index = new Map<string, number>();
  /** Fast/slow flasher phases are computed from time, shared across lamps. */
  private time = 0;
  /** Honour Settings.reducedFlashing: slower breathing. */
  reduced = false;

  constructor(lamps: readonly LampDef[], env: THREE.Texture | null) {
    const pos: number[] = [];
    const col: number[] = [];
    const rad: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    for (const l of lamps) {
      c.setHex(LAMP_COLORS[l.color]);
      const outline = lampOutline(l.shape, l.size * 1.02);
      // Triangles must wind counter-clockwise (seen from above) to face the camera.
      let area = 0;
      for (let i = 0; i < outline.length; i++) {
        const [ax, ay] = outline[i];
        const [bx, by] = outline[(i + 1) % outline.length];
        area += ax * by - bx * ay;
      }
      if (area < 0) outline.reverse();
      const n = outline.length;
      const base = pos.length / 3;
      const cosR = Math.cos((l.rot * Math.PI) / 180);
      const sinR = Math.sin((l.rot * Math.PI) / 180);
      const put = (x: number, y: number, r: number) => {
        // Lamp-local (x right, y up the table) rotated CCW by rot, then to world.
        const tx = l.x + x * cosR - y * sinR;
        const ty = l.y + x * sinR + y * cosR;
        pos.push(wx(tx), 0.018, wz(ty));
        col.push(c.r, c.g, c.b);
        rad.push(r);
      };
      put(0, 0, 0);
      for (const [x, y] of outline) put(x * 0.6, y * 0.6, 0.55);
      for (const [x, y] of outline) put(x, y, 1);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const inner = base + 1;
        const outer = base + 1 + n;
        idx.push(base, inner + i, inner + j);
        idx.push(inner + i, outer + i, outer + j, inner + i, outer + j, inner + j);
      }
      this.ranges.push({ id: l.id, start: base, count: 1 + n * 2 });
      this.index.set(l.id, this.ranges.length - 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 1));
    this.lampAttr = new THREE.BufferAttribute(new Float32Array(pos.length / 3), 1);
    this.lampAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aLamp', this.lampAttr);
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // computeVertexNormals follows winding; the playfield is a floor, so force them up.
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.22,
      metalness: 0,
      envMap: env,
      envMapIntensity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aLamp;\nattribute float aRad;\nvarying float vLamp;\nvarying float vRad;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp; vRad = aRad;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vLamp;\nvarying float vRad;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           // Off: dark tinted plastic. On: the diffuse brightens a little; the lamp itself adds light.
           float lit = clamp(vLamp, 0.0, 1.0);
           vec3 plastic = vColor.rgb;
           diffuseColor.rgb = plastic * mix(0.17, 0.5, lit);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float hot = 1.0 - smoothstep(0.1, 1.0, vRad);
           float rimDim = mix(1.0, 0.42, smoothstep(0.6, 1.0, vRad));
           totalEmissiveRadiance += vColor.rgb * vLamp * ${GAIN.toFixed(2)} * rimDim * (0.7 + 0.9 * hot);
           totalEmissiveRadiance += vec3(1.0, 0.9, 0.75) * max(vLamp - 0.6, 0.0) * hot * 0.55;`,
        );
    };
    mat.customProgramCacheKey = () => 'inserts-v1';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'inserts';
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.level = new Float32Array(lamps.length);
    this.kick = new Float32Array(lamps.length);
  }

  /** Overdrive a lamp (or every lamp with 'all') past full brightness for a moment. */
  flash(id: string, strength: number): void {
    if (id === 'all') {
      for (let i = 0; i < this.kick.length; i++) this.kick[i] = Math.max(this.kick[i], strength);
      return;
    }
    const i = this.index.get(id);
    if (i !== undefined) this.kick[i] = Math.max(this.kick[i], strength);
  }

  /** Current smoothed level of a lamp (0..1+), for callers that want to follow it. */
  levelOf(id: string): number {
    const i = this.index.get(id);
    return i === undefined ? 0 : this.level[i];
  }

  update(modes: Record<string, Lamp> | null, dt: number, dark: boolean): void {
    this.time += dt;
    // Blinking lamps breathe on smooth curves: no square wave ever reaches the screen, and
    // reduced flashing slows both rates down.
    const slowRate = this.reduced ? SLOW_RATE_REDUCED : SLOW_RATE;
    const fastRate = this.reduced ? FAST_RATE_REDUCED : FAST_RATE;
    const slow = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * slowRate);
    const fast = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * fastRate);
    const rise = 1 - Math.exp(-dt * RISE);
    const fall = 1 - Math.exp(-dt * FALL);
    const kickK = Math.exp(-dt * KICK_DECAY);
    const a = this.lampAttr.array as Float32Array;
    for (let i = 0; i < this.ranges.length; i++) {
      const r = this.ranges[i];
      const mode = modes ? (modes[r.id] ?? Lamp.Off) : Lamp.Off;
      let target = 0;
      if (!dark) {
        if (mode === Lamp.On) target = 1;
        else if (mode === Lamp.Slow) target = slow;
        else if (mode === Lamp.Fast) target = fast;
      }
      const cur = this.level[i];
      this.level[i] = cur + (target - cur) * (target > cur ? rise : fall);
      this.kick[i] *= kickK;
      const v = this.level[i] + this.kick[i] * 0.9;
      for (let k = 0; k < r.count; k++) a[r.start + k] = v;
    }
    this.lampAttr.needsUpdate = true;
  }
}
