/**
 * Plays lamp shows over the rules' lamp states. While a show runs, `apply` returns an
 * override record (reused every frame, no allocations) that the table view renders.
 */
import { Lamp } from '../rules/types';
import { lampShow, type LampSegment, type LampShowDef } from '../content/lampshows';
import type { LampDef } from '../sim/table-def';

const CX = 9.2;
const CY = 20;

export class LampShowPlayer {
  private show: LampShowDef | null = null;
  private t = 0;
  private readonly out: Record<string, Lamp> = {};
  private readonly order: { id: string; y: number; angle: number }[];
  private readonly yMin: number;
  private readonly yMax: number;
  private seed = 1;

  constructor(lamps: readonly LampDef[]) {
    this.order = lamps.map((l) => ({ id: l.id, y: l.y, angle: Math.atan2(l.y - CY, l.x - CX) }));
    this.order.sort((a, b) => a.angle - b.angle);
    this.yMin = Math.min(...lamps.map((l) => l.y));
    this.yMax = Math.max(...lamps.map((l) => l.y));
  }

  get playing(): string | null {
    return this.show?.id ?? null;
  }

  /** Start a show; a looping show (attract) yields to any one-shot. */
  play(id: string): void {
    const s = lampShow(id);
    if (!s) return;
    if (this.show && !this.show.loop && s.loop) return;
    this.show = s;
    this.t = 0;
  }

  stop(): void {
    this.show = null;
  }

  update(dt: number): void {
    if (!this.show) return;
    this.t += dt;
    const total = this.show.segments.reduce((a, s) => a + s.dur, 0);
    if (this.t >= total) {
      if (this.show.loop) this.t %= total;
      else this.show = null;
    }
  }

  /** Lamps to render this frame: the base states, or the show's frame. */
  apply(base: Record<string, Lamp> | null): Record<string, Lamp> | null {
    if (!this.show) return base;
    let t = this.t;
    let seg: LampSegment = this.show.segments[0];
    for (const s of this.show.segments) {
      seg = s;
      if (t < s.dur) break;
      t -= s.dur;
    }
    const rate = seg.rate ?? 1;
    const n = this.order.length;
    for (let i = 0; i < n; i++) {
      const o = this.order[i];
      let on = false;
      switch (seg.pattern) {
        case 'on':
          on = true;
          break;
        case 'off':
          break;
        case 'flash':
          on = Math.floor(t * rate * 2) % 2 === 0;
          break;
        case 'sweep': {
          const k = (t * rate) % 1;
          const pos = seg.down ? 1 - k : k;
          const y = (o.y - this.yMin) / Math.max(1, this.yMax - this.yMin);
          on = Math.abs(y - pos) < 0.18;
          break;
        }
        case 'chase': {
          const every = seg.every ?? 3;
          on = (i + Math.floor(t * rate)) % every === 0;
          break;
        }
        case 'sparkle':
          // Cheap deterministic hash so the twinkle doesn't strobe every frame.
          this.seed = (Math.imul(i + 1, 2654435761) ^ Math.floor(t * 12)) >>> 0;
          on = this.seed % 7 === 0;
          break;
      }
      this.out[o.id] = on ? Lamp.On : Lamp.Off;
    }
    return this.out;
  }
}
