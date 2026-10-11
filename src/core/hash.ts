/** Incremental FNV-1a hasher over numbers, used for deterministic state hashes. */
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

export class StateHasher {
  private h = 0x811c9dc5;

  num(v: number): this {
    f64[0] = v;
    this.u32(u32[0]);
    this.u32(u32[1]);
    return this;
  }

  /** Quantised number: robust to -0 and tiny float noise when comparing across runs. */
  q(v: number, scale = 1e6): this {
    return this.int(Math.round(v * scale));
  }

  int(v: number): this {
    return this.u32(v | 0);
  }

  bool(v: boolean): this {
    return this.u32(v ? 1 : 0);
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this;
  }

  private u32(v: number): this {
    let h = this.h;
    for (let i = 0; i < 4; i++) {
      h ^= (v >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
    this.h = h;
    return this;
  }

  digest(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
