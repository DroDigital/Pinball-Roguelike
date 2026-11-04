/**
 * Coins that fly from a payout on the table to the Pocket counter in the HUD: a pool of DOM
 * coins on an arc (quadratic Bezier), easing in, staggered, each one pulsing the target when it
 * lands. Purely presentation; honours prefers-reduced-motion.
 */
import { reducedMotion } from './counter';

interface Flight {
  el: HTMLElement;
  t: number;
  dur: number;
  delay: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  active: boolean;
}

export class CoinFlight {
  private readonly pool: Flight[] = [];
  private next = 0;
  /** Called when a coin lands (pulse the counter, tick a sound). */
  onLand: (() => void) | null = null;

  constructor(layer: HTMLElement, size = 28) {
    for (let i = 0; i < size; i++) {
      const el = document.createElement('i');
      el.className = 'fly-coin';
      el.style.display = 'none';
      layer.append(el);
      this.pool.push({ el, t: 0, dur: 0, delay: 0, x0: 0, y0: 0, cx: 0, cy: 0, active: false });
    }
  }

  /** Launch `count` coins from screen point (x, y) toward the element tagged data-hud=pocket. */
  launch(x: number, y: number, count: number): void {
    if (reducedMotion() || !this.target()) return;
    const n = Math.min(count, 12);
    for (let i = 0; i < n; i++) {
      const f = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      f.x0 = x + (Math.random() - 0.5) * 30;
      f.y0 = y + (Math.random() - 0.5) * 20;
      // The control point lifts the arc up and out before it drops into the counter.
      f.cx = f.x0 + (Math.random() - 0.5) * 220;
      f.cy = f.y0 - 120 - Math.random() * 140;
      f.t = 0;
      f.dur = 0.55 + Math.random() * 0.25;
      f.delay = i * 0.045;
      f.active = true;
      f.el.style.display = 'block';
      f.el.style.opacity = '0';
    }
  }

  private target(): HTMLElement | null {
    const el = document.querySelector<HTMLElement>('[data-hud="pocket"]');
    return el && el.offsetParent !== null ? el : null;
  }

  update(dt: number): void {
    let tx = 0;
    let ty = 0;
    let have = false;
    for (const f of this.pool) {
      if (!f.active) continue;
      if (!have) {
        const t = this.target();
        if (!t) {
          f.active = false;
          f.el.style.display = 'none';
          continue;
        }
        const r = t.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        have = true;
      }
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.active = false;
        f.el.style.display = 'none';
        this.onLand?.();
        continue;
      }
      // Ease in: slow lift, fast drop into the counter.
      const k = f.t * f.t;
      const a = 1 - k;
      const x = a * a * f.x0 + 2 * a * k * f.cx + k * k * tx;
      const y = a * a * f.y0 + 2 * a * k * f.cy + k * k * ty;
      const s = 1.15 - 0.55 * k;
      f.el.style.opacity = String(Math.min(1, f.t * 6));
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s}) rotate(${f.t * 540}deg)`;
    }
  }
}
