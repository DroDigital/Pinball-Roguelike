/** Arc-length parameterised 3D Catmull-Rom path for ramps and wireforms. */
export class TransportPath {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
  readonly cum: Float64Array;
  readonly length: number;

  constructor(points: readonly (readonly [number, number, number])[], samplesPerSegment = 16) {
    const n = (points.length - 1) * samplesPerSegment + 1;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.cum = new Float64Array(n);
    let k = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        this.xs[k] = cr(p0[0], p1[0], p2[0], p3[0], t);
        this.ys[k] = cr(p0[1], p1[1], p2[1], p3[1], t);
        this.zs[k] = cr(p0[2], p1[2], p2[2], p3[2], t);
        k++;
      }
    }
    const last = points[points.length - 1];
    this.xs[k] = last[0];
    this.ys[k] = last[1];
    this.zs[k] = last[2];
    for (let i = 1; i < n; i++) {
      const dx = this.xs[i] - this.xs[i - 1];
      const dy = this.ys[i] - this.ys[i - 1];
      const dz = this.zs[i] - this.zs[i - 1];
      this.cum[i] = this.cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.length = this.cum[n - 1];
  }

  /** Sample position at fraction u in [0,1] of arc length into out[0..2]. */
  sample(u: number, out: Float64Array | number[]): void {
    const target = Math.min(1, Math.max(0, u)) * this.length;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < target) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo];
    const f = seg > 0 ? (target - this.cum[lo]) / seg : 0;
    out[0] = this.xs[lo] + (this.xs[hi] - this.xs[lo]) * f;
    out[1] = this.ys[lo] + (this.ys[hi] - this.ys[lo]) * f;
    out[2] = this.zs[lo] + (this.zs[hi] - this.zs[lo]) * f;
  }
}

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  );
}
