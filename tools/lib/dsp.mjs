/* global Buffer */
/**
 * Tiny offline DSP kit for the procedural foley in tools/build-sfx.mjs: modal resonators,
 * filtered noise, pitch-dropping sines, biquads and loop helpers. Everything works on mono
 * Float32Arrays at SR and is deterministic given a seed, so the sample bank is reproducible.
 */
export const SR = 44100;
const TAU = Math.PI * 2;

/** mulberry32: small seeded PRNG returning [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
export const dbToLin = (db) => 10 ** (db / 20);
export const linToDb = (x) => 20 * Math.log10(Math.max(1e-9, x));
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Uniform in [lo, hi). */
export const between = (r, lo, hi) => lo + (hi - lo) * r();
/** +-spread multiplicative jitter around 1. */
export const jit = (r, spread) => 1 + (r() * 2 - 1) * spread;

export function whiteNoise(n, r) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

/** RBJ biquad; returns an in-place processor for one channel. */
export function biquad(type, f, q = 0.707, gainDb = 0) {
  const w0 = (TAU * Math.min(f, SR * 0.45)) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'hp':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'bp':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case 'ls': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - s;
      break;
    }
    case 'hs': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - s;
      break;
    }
    default:
      throw new Error(`biquad: unknown type ${type}`);
  }
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  return (x) => {
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      const y = nb0 * v + z1;
      z1 = nb1 * v - na1 * y + z2;
      z2 = nb2 * v - na2 * y;
      x[i] = y;
    }
    return x;
  };
}

/** Apply a chain of [type, f, q, gainDb] filters in place. */
export function filt(x, ...chain) {
  for (const [type, f, q, g] of chain) biquad(type, f, q, g)(x);
  return x;
}

/**
 * Filter whose cutoff follows fn(t) (seconds); coefficients refresh every 32 samples. Used for
 * sweeps (whooshes, risers, falling wind).
 */
export function sweepFilter(x, type, fn, q = 0.9) {
  let z1 = 0;
  let z2 = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const f = Math.max(20, Math.min(fn(i / SR), SR * 0.45));
      const w0 = (TAU * f) / SR;
      const cos = Math.cos(w0);
      const alpha = Math.sin(w0) / (2 * q);
      let a0;
      if (type === 'lp') {
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = b0;
      } else if (type === 'hp') {
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = b0;
      } else {
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
      }
      a0 = 1 + alpha;
      a1 = (-2 * cos) / a0;
      a2 = (1 - alpha) / a0;
      b0 /= a0;
      b1 /= a0;
      b2 /= a0;
    }
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}

/** out += src * gain starting at t0 seconds. */
export function mix(out, src, t0 = 0, gain = 1) {
  const i0 = Math.round(t0 * SR);
  const n = Math.min(src.length, out.length - i0);
  for (let i = 0; i < n; i++) out[i0 + i] += src[i] * gain;
  return out;
}

/**
 * Sum of exponentially decaying sines. mode = { f, a, tau, ph?, f1?, bend? }: tau is the
 * amplitude time constant in seconds; f1/bend glide the pitch from f1 down to f.
 */
export function modal(out, t0, modes, gain = 1) {
  const i0 = Math.round(t0 * SR);
  for (const m of modes) {
    const n = Math.min(out.length - i0, Math.ceil(m.tau * SR * 9));
    if (n <= 0) continue;
    const dec = Math.exp(-1 / (m.tau * SR));
    let env = (m.a ?? 1) * gain;
    let phase = m.ph ?? 0;
    const w = (TAU * m.f) / SR;
    if (m.f1) {
      const k = Math.exp(-1 / ((m.bend ?? 0.02) * SR));
      let d = m.f1 - m.f;
      for (let i = 0; i < n; i++) {
        out[i0 + i] += env * Math.sin(phase);
        phase += w + (TAU * d) / SR;
        d *= k;
        env *= dec;
      }
    } else {
      for (let i = 0; i < n; i++) {
        out[i0 + i] += env * Math.sin(phase);
        phase += w;
        env *= dec;
      }
    }
  }
  return out;
}

/** Inharmonic partial set: f0 x ratios, amplitudes and decays falling off with partial index. */
export function partials(f0, ratios, { a = 1, aSlope = 0.6, tau, tauSlope = 0.6, r, detune = 0 }) {
  return ratios.map((k, i) => ({
    f: f0 * k * (r ? jit(r, detune) : 1),
    a: a * aSlope ** i,
    tau: tau * tauSlope ** i,
    ph: r ? r() * TAU : 0,
  }));
}

/** Free-free bar (chime bars, tubular metal): 1 : 2.76 : 5.40 : 8.93 : 13.3. */
export const BAR = [1, 2.756, 5.404, 8.933, 13.344];
/** Struck plate / sheet metal (apron, trays): dense, bright. */
export const PLATE = [1, 1.593, 2.136, 2.653, 2.918, 3.5, 4.06, 4.64];
/** Bell-ish (handbell, phone gong): hum, prime, minor third, fifth, octave, ... */
export const BELL = [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166];
/** Wooden box / cabinet: low, sparse, damped. */
export const BOX = [1, 1.82, 2.9, 4.3, 6.1];

/**
 * Filtered noise burst with an attack and an exponential decay.
 * chain: [[type, f, q], ...] biquads applied to the noise first.
 */
export function noiseHit(out, t0, { tau, atk = 0.0006, gain = 1, chain = [], r, dur }) {
  const len = Math.min(out.length - Math.round(t0 * SR), Math.ceil((dur ?? tau * 9) * SR));
  if (len <= 0) return out;
  const x = whiteNoise(len, r);
  for (const [type, f, q, g] of chain) biquad(type, f, q, g)(x);
  const atkN = Math.max(1, Math.round(atk * SR));
  const dec = Math.exp(-1 / (tau * SR));
  let env = 1;
  const i0 = Math.round(t0 * SR);
  for (let i = 0; i < len; i++) {
    out[i0 + i] += x[i] * env * Math.min(1, (i + 1) / atkN) * gain;
    env *= dec;
  }
  return out;
}

/** Pitch-dropping sine (kick/thump/solenoid body) with optional soft saturation. */
export function thump(out, t0, { f0, f1, glide = 0.03, tau, gain = 1, drive = 0, ph = 0 }) {
  const i0 = Math.round(t0 * SR);
  const n = Math.min(out.length - i0, Math.ceil(tau * SR * 8));
  const k = Math.exp(-1 / (glide * SR));
  const dec = Math.exp(-1 / (tau * SR));
  let f = f0 - f1;
  let env = 1;
  let phase = ph;
  const norm = drive > 0 ? 1 / Math.tanh(drive) : 1;
  for (let i = 0; i < n; i++) {
    let v = Math.sin(phase);
    if (drive > 0) v = Math.tanh(v * drive) * norm;
    out[i0 + i] += v * env * gain;
    phase += (TAU * (f1 + f)) / SR;
    f *= k;
    env *= dec;
  }
  return out;
}

/** Short broadband click (coil/contact transient). */
export function click(out, t0, { dur = 0.0015, gain = 1, hp = 2500, r }) {
  const n = Math.max(2, Math.round(dur * SR));
  const x = whiteNoise(n, r);
  biquad('hp', hp, 0.7)(x);
  for (let i = 0; i < n; i++) {
    const w = Math.sin((Math.PI * (i + 0.5)) / n);
    x[i] *= w * w;
  }
  return mix(out, x, t0, gain);
}

/** Periodic oscillator add (for buzzers, hums): saw/square/sine with optional harmonics. */
export function osc(
  out,
  t0,
  { f, dur, type = 'saw', gain = 1, f1, harmonics = 1, atk = 0.005, rel = 0.03 },
) {
  const i0 = Math.round(t0 * SR);
  const n = Math.min(out.length - i0, Math.round(dur * SR));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const fr = f1 ? f + (f1 - f) * t : f;
    phase += fr / SR;
    phase -= Math.floor(phase);
    let v;
    if (type === 'sine') v = Math.sin(TAU * phase);
    else if (type === 'square') v = phase < 0.5 ? 1 : -1;
    else if (type === 'pulse') v = phase < 0.25 ? 1 : -1;
    else if (type === 'tri') v = 4 * Math.abs(phase - 0.5) - 1;
    else v = 2 * phase - 1;
    const env =
      Math.min(1, i / Math.max(1, atk * SR)) * Math.min(1, (n - i) / Math.max(1, rel * SR));
    out[i0 + i] += v * env * gain * harmonics;
  }
  return out;
}

export function fade(x, inSec = 0.002, outSec = 0.01) {
  const a = Math.round(inSec * SR);
  const b = Math.round(outSec * SR);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

export function peakOf(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

export function rmsOf(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/** Scale so the peak is peakDb dBFS. */
/**
 * RMS over the active part of a sound: 10 ms windows within `rangeDb` of the loudest window.
 * A click and a long bell then land at the same perceived level, which a peak cannot do.
 */
export function activeRms(x, rangeDb = 30, win = 441) {
  const n = Math.floor(x.length / win);
  if (n === 0) return rmsOf(x);
  const ms = new Float64Array(n);
  let max = 0;
  for (let w = 0; w < n; w++) {
    let s = 0;
    for (let i = w * win; i < (w + 1) * win; i++) s += x[i] * x[i];
    ms[w] = s / win;
    if (ms[w] > max) max = ms[w];
  }
  if (max <= 0) return 0;
  const gate = max * 10 ** (-rangeDb / 10);
  let s = 0;
  let c = 0;
  for (let w = 0; w < n; w++)
    if (ms[w] >= gate) {
      s += ms[w];
      c++;
    }
  return Math.sqrt(s / c);
}

/** Scale x so its active RMS is `targetDb`, but never let its peak pass `ceilDb`. */
export function levelTo(x, targetDb, ceilDb = -1) {
  const a = activeRms(x);
  if (a <= 0) return x;
  let g = dbToLin(targetDb) / a;
  const pk = peakOf(x);
  if (pk * g > dbToLin(ceilDb)) g = dbToLin(ceilDb) / pk;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function normalize(x, peakDb = -2) {
  const p = peakOf(x);
  if (p > 0) {
    const g = dbToLin(peakDb) / p;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return x;
}

/** Soft limiter for summed layers (keeps transients rounded, never hard-clips). */
export function softClip(x, drive = 1) {
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) * norm;
  return x;
}

/** Trim trailing near-silence (below thresholdDb relative to peak). */
export function trimTail(x, thresholdDb = -50, minSec = 0.05) {
  const thr = peakOf(x) * dbToLin(thresholdDb);
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < thr) end--;
  end = Math.min(x.length, Math.max(end, Math.round(minSec * SR)));
  return x.subarray(0, end);
}

/** Make a seamless loop: the last xf seconds crossfade into the head, which is dropped. */
export function loopify(x, xfSec = 0.15) {
  const xf = Math.round(xfSec * SR);
  const n = x.length - xf;
  const y = new Float32Array(n);
  y.set(x.subarray(0, n));
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    // Equal-power fade between the tail (fading out) and the head (fading in).
    y[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return y;
}

/** Rectangle-windowed DC removal + gentle sub cut. */
export function dcBlock(x) {
  biquad('hp', 24, 0.7)(x);
  return x;
}

/** Brown-ish noise (-6 dB/oct): integrated white noise with leak. */
export function brownNoise(n, r, leak = 0.995) {
  const x = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = s * leak + (r() * 2 - 1) * 0.05;
    x[i] = s;
  }
  return x;
}

/** Wrap a Float32Array as a little-endian f32 Buffer for piping into ffmpeg. */
export function toF32Buffer(x) {
  return Buffer.from(x.buffer, x.byteOffset, x.byteLength);
}

/** In-place radix-2 FFT (re, im lengths must be a power of two). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-TAU / len) * 1;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** RMS (dBFS) of the loudest 100 ms window. */
function loudest100(x) {
  const win = Math.round(0.1 * SR);
  if (x.length <= win) return linToDb(rmsOf(x));
  const hop = Math.round(win / 4);
  let best = 0;
  for (let s = 0; s + win <= x.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += x[i] * x[i];
    best = Math.max(best, e / win);
  }
  return linToDb(Math.sqrt(best));
}

/**
 * Where a sound's energy sits, for judging it on laptop and phone speakers:
 *  centroid - spectral centroid (Hz) of the first ~3 s
 *  low      - share of energy below 250 Hz (0..1)
 *  small    - how far the loudest 100 ms drops (dB) when a 180 Hz high-pass stands in for a
 *             small speaker (0 = unchanged; -6 = a quarter of the power gone)
 */
export function spectralStats(x) {
  const n = Math.min(x.length, 1 << 17);
  let size = 1024;
  while (size < n) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  // Unwindowed: a Hann window across the whole file would all but erase a transient at its start.
  for (let i = 0; i < n; i++) re[i] = x[i];
  fft(re, im);
  let tot = 0;
  let wsum = 0;
  let low = 0;
  let hi = 0;
  const bin = SR / size;
  for (let k = 1; k < size / 2; k++) {
    const e = re[k] * re[k] + im[k] * im[k];
    const f = k * bin;
    tot += e;
    wsum += e * f;
    if (f < 250) low += e;
    if (f > 2000) hi += e;
  }
  const hp = Float32Array.from(x);
  biquad('hp', 180, 0.707)(hp);
  biquad('hp', 180, 0.707)(hp);
  return {
    centroid: tot > 0 ? wsum / tot : 0,
    low: tot > 0 ? low / tot : 0,
    hi: tot > 0 ? hi / tot : 0,
    small: loudest100(hp) - loudest100(x),
  };
}
