/** Combo chain: major shots within `window` seconds of the previous one build a multiplier. */
export class ComboTracker {
  count = 0;
  private last = -1e9;

  constructor(
    public window: number,
    public start: number,
    public step: number,
  ) {}

  /** Register a major shot at time t; returns the multiplier it pays at. */
  hit(t: number): number {
    this.count = t - this.last <= this.window ? this.count + 1 : 1;
    this.last = t;
    return this.mult;
  }

  get mult(): number {
    return this.count <= 0 ? 1 : this.start + (this.count - 1) * this.step;
  }

  active(t: number): boolean {
    return this.count > 0 && t - this.last <= this.window;
  }

  /** Seconds left in the current chain (0 when none). */
  left(t: number): number {
    return this.active(t) ? this.window - (t - this.last) : 0;
  }

  reset(): void {
    this.count = 0;
    this.last = -1e9;
  }
}

const COMBO_NAMES = ['', '', 'DOUBLE TIME', 'HARD LABOR', 'CHAIN GANG', 'SOLITARY'];

export function comboName(count: number): string {
  return count < COMBO_NAMES.length ? COMBO_NAMES[count] : 'LIFE SENTENCE';
}
