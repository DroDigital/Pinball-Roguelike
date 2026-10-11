/** Combo chain: major shots within `window` seconds of the previous one build a multiplier. */
export class ComboTracker {
  count = 0;
  private last = -1e9;
  /** Until this time the chain can't time out (Pocket Watch). */
  private holdUntil = -1e9;

  constructor(
    public window: number,
    public start: number,
    public step: number,
  ) {}

  /** Register a major shot at time t; returns the multiplier it pays at. */
  hit(t: number): number {
    this.count = this.within(t) ? this.count + 1 : 1;
    this.last = t;
    return this.mult;
  }

  get mult(): number {
    return this.count <= 0 ? 1 : this.start + (this.count - 1) * this.step;
  }

  active(t: number): boolean {
    return this.count > 0 && this.within(t);
  }

  /** Seconds left in the current chain (0 when none). */
  left(t: number): number {
    if (!this.active(t)) return 0;
    return Math.max(this.window - (t - this.last), Math.min(this.window, this.holdUntil - t));
  }

  /** Stop the clock: the chain can't time out until `until`. */
  hold(until: number): void {
    this.holdUntil = Math.max(this.holdUntil, until);
  }

  held(t: number): boolean {
    return t <= this.holdUntil;
  }

  reset(): void {
    this.count = 0;
    this.last = -1e9;
    this.holdUntil = -1e9;
  }

  private within(t: number): boolean {
    return t - this.last <= this.window || t <= this.holdUntil;
  }
}

const COMBO_NAMES = ['', '', 'DOUBLE TIME', 'HARD LABOR', 'CHAIN GANG', 'SOLITARY'];

export function comboName(count: number): string {
  return count < COMBO_NAMES.length ? COMBO_NAMES[count] : 'LIFE SENTENCE';
}
