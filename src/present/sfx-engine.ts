/**
 * Sample engine: fetches and decodes the bank, then plays named sounds through pooled voices
 * with random pitch/level variation, per-sound voice limits, priority stealing, stereo pan and
 * a reverb send. When a file is missing or failed to decode, the registered fallback (live
 * synthesis) plays instead, so the game is never silent.
 */
import { SFX, loadOrder, type SfxBus, type SfxDef, type SfxName } from './sfx-manifest';
import type { Mix } from './sfx-mix';

export interface PlayOpts {
  /** Multiplies the sound's own gain. */
  gain?: number;
  /** Multiplies the playback rate (pitch). */
  rate?: number;
  /** -1..1. */
  pan?: number;
  /** Absolute AudioContext time to start at. */
  when?: number;
  /** Multiplies the sound's reverb send. */
  send?: number;
  /** Force a variant (index into the manifest's files). */
  variant?: number;
  /** Play on this bus instead of the sound's own (a bell in a menu stays crisp on 'sfx'). */
  bus?: SfxBus;
}

interface Loaded {
  buffer: AudioBuffer;
  /** Seconds of encoder padding/silence before the first audible sample. */
  lead: number;
}

interface Runtime {
  name: SfxName;
  def: SfxDef;
  loaded: (Loaded | null)[];
  last: number;
  lastVariant: number;
  /** Start times of recent live-synthesis fallbacks (they have no voices to count). */
  fb: number[];
}

interface Voice {
  gain: GainNode;
  pan: StereoPannerNode;
  send: GainNode;
  src: AudioBufferSourceNode | null;
  rt: Runtime | null;
  prio: number;
  /** Scheduled start and end on the context clock. */
  start: number;
  end: number;
  seq: number;
}

const POOL: Record<SfxBus, number> = { table: 40, sfx: 18, amb: 10, music: 14 };

export type Fallback = (name: SfxName, o: PlayOpts) => void;

/** Raw file bytes fetched ahead of the first user gesture (decoding needs the audio context). */
const prefetched = new Map<string, Promise<ArrayBuffer>>();

function fetchBytes(url: string): Promise<ArrayBuffer> {
  let p = prefetched.get(url);
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.arrayBuffer();
    });
    prefetched.set(url, p);
    // A failed fetch is forgotten, so the next load retries it.
    p.catch(() => prefetched.delete(url));
  }
  return p;
}

/**
 * Start downloading the bank when the page is idle (not during startup), so the first sounds
 * after the first click are ready without competing with the game's own assets.
 */
export function prefetchBank(base: string): void {
  const go = () => {
    for (const stem of loadOrder()) void fetchBytes(`${base}${stem}.mp3`).catch(() => {});
  };
  const w = globalThis as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1200);
}

export class SfxEngine {
  private readonly rt = new Map<SfxName, Runtime>();
  /** Which (sound, variant slots) each file stem feeds, so a decoded file is live at once. */
  private readonly users = new Map<string, { rt: Runtime; i: number }[]>();
  private readonly pools: Record<SfxBus, Voice[]> = { table: [], sfx: [], amb: [], music: [] };
  private seq = 0;
  fallback: Fallback | null = null;
  loadedCount = 0;
  readonly failed: string[] = [];
  private loading: Promise<void> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly mix: Mix,
  ) {
    for (const name of Object.keys(SFX) as SfxName[]) {
      const def: SfxDef = SFX[name];
      const rt: Runtime = {
        name,
        def,
        loaded: def.files.map(() => null),
        last: -1e9,
        lastVariant: -1,
        fb: [],
      };
      this.rt.set(name, rt);
      def.files.forEach((stem, i) => {
        const list = this.users.get(stem) ?? [];
        list.push({ rt, i });
        this.users.set(stem, list);
      });
    }
    for (const bus of Object.keys(POOL) as SfxBus[])
      for (let i = 0; i < POOL[bus]; i++) this.pools[bus].push(this.makeVoice(bus));
  }

  private makeVoice(bus: SfxBus): Voice {
    const ctx = this.ctx;
    const nodes = this.mix.input(bus);
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const send = ctx.createGain();
    gain.connect(pan).connect(nodes.dry);
    gain.connect(send).connect(nodes.wet);
    return { gain, pan, send, src: null, rt: null, prio: 0, start: 0, end: 0, seq: 0 };
  }

  /**
   * Fetch and decode every file (a few at a time, most urgent first). Each file goes live the
   * moment it is decoded. Safe to call repeatedly.
   */
  load(base: string): Promise<void> {
    if (this.loading) return this.loading;
    const stems = loadOrder();
    let next = 0;
    const worker = async () => {
      while (next < stems.length) {
        const stem = stems[next++];
        try {
          // decodeAudioData detaches its input, so decode a copy (other contexts may reuse the bytes).
          const bytes = (await fetchBytes(`${base}${stem}.mp3`)).slice(0);
          const buffer = await this.ctx.decodeAudioData(bytes);
          const loaded: Loaded = { buffer, lead: leadOf(buffer) };
          for (const u of this.users.get(stem) ?? []) u.rt.loaded[u.i] = loaded;
          this.loadedCount++;
        } catch {
          this.failed.push(stem);
        }
      }
    };
    this.loading = Promise.all(Array.from({ length: 6 }, worker)).then(() => undefined);
    return this.loading;
  }

  has(name: SfxName): boolean {
    return this.rt.get(name)?.loaded.some(Boolean) ?? false;
  }

  /** Length in seconds of the first variant (0 if not loaded). */
  duration(name: SfxName): number {
    const l = this.rt.get(name)?.loaded.find(Boolean);
    return l ? l.buffer.duration - l.lead : 0;
  }

  /**
   * Play a sound. Returns false only when nothing could play (no sample and no fallback).
   * Calls swallowed by a sound's minGap count as played.
   */
  play(name: SfxName, o: PlayOpts = {}): boolean {
    const rt = this.rt.get(name);
    if (!rt) return false;
    const def = rt.def;
    const now = this.mix.now;
    const t = Math.max(o.when ?? now, now);
    if (def.minGap && t - rt.last < def.minGap) return true;
    const n = def.files.length;
    let vi = o.variant !== undefined ? Math.min(n - 1, Math.max(0, Math.floor(o.variant))) : -1;
    if (vi < 0) {
      vi = n > 1 ? Math.floor(Math.random() * n) : 0;
      if (n > 1 && vi === rt.lastVariant) vi = (vi + 1 + Math.floor(Math.random() * (n - 1))) % n;
    }
    let ld = rt.loaded[vi];
    if (!ld) ld = rt.loaded.find(Boolean) ?? null;
    if (!ld) {
      if (!this.fallback) return false;
      // No voices to count for live synthesis: keep a burst of the same sound from stacking up.
      const cap = (def.voices ?? 4) * 2;
      if (rt.fb.length >= cap && t - rt.fb[rt.fb.length - cap] < 0.3) return true;
      rt.fb.push(t);
      if (rt.fb.length > cap) rt.fb.shift();
      this.fallback(name, o);
      rt.last = t;
      return true;
    }
    const bus = o.bus ?? def.bus ?? 'table';
    const prio = def.prio ?? 5;
    const v = this.alloc(bus, rt, prio, t);
    if (!v) return true;
    rt.last = t;
    rt.lastVariant = vi;

    const rv = (spread: number) => (Math.random() * 2 - 1) * spread;
    const rate = Math.min(
      4,
      Math.max(0.25, (def.rate ?? 1) * (o.rate ?? 1) * 2 ** (rv(def.pitchVar ?? 0) / 12)),
    );
    const g = (def.gain ?? 1) * (o.gain ?? 1) * (1 + rv(def.gainVar ?? 0));
    const src = this.ctx.createBufferSource();
    src.buffer = ld.buffer;
    src.playbackRate.value = rate;
    src.connect(v.gain);
    v.gain.gain.setValueAtTime(g, t);
    v.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, o.pan ?? 0)), t);
    const wet = (def.send ?? 0) * (o.send ?? 1);
    v.send.gain.setValueAtTime(wet, t);
    src.start(t, ld.lead);
    v.src = src;
    v.rt = rt;
    v.prio = prio;
    v.start = t;
    v.end = t + (ld.buffer.duration - ld.lead) / rate;
    v.seq = ++this.seq;
    if (wet > 0) this.mix.wetUntil(v.end);
    return true;
  }

  /** A free voice, or one stolen from a quieter/older sound; null if the new sound loses. */
  private alloc(bus: SfxBus, rt: Runtime, prio: number, t: number): Voice | null {
    const pool = this.pools[bus];
    const limit = rt.def.voices ?? 4;
    let idle: Voice | null = null;
    let same = 0;
    let oldestSame: Voice | null = null;
    let victim: Voice | null = null;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i];
      if (!v.src || v.end <= t) {
        idle ??= v;
        continue;
      }
      if (v.rt === rt) {
        same++;
        if (!oldestSame || v.seq < oldestSame.seq) oldestSame = v;
      }
      if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.seq < victim.seq))
        victim = v;
    }
    if (same >= limit && oldestSame) return this.steal(bus, oldestSame, t);
    if (idle) return idle;
    if (victim && victim.prio <= prio) return this.steal(bus, victim, t);
    return null;
  }

  /** Fade a playing voice out and give its slot fresh nodes (so the fade cannot touch the new sound). */
  private steal(bus: SfxBus, v: Voice, t: number): Voice {
    const src = v.src;
    const { gain, pan, send } = v;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.004);
      src?.stop(t + 0.03);
    } catch {
      // already stopped
    }
    const done = () => {
      gain.disconnect();
      pan.disconnect();
      send.disconnect();
    };
    if (src) src.onended = done;
    else done();
    const fresh = this.makeVoice(bus);
    const pool = this.pools[bus];
    pool[pool.indexOf(v)] = fresh;
    return fresh;
  }

  /** Fade out every playing (or scheduled) voice of one sound, or of all sounds. */
  stop(name?: SfxName): void {
    const t = this.mix.now;
    const rt = name ? this.rt.get(name) : null;
    for (const bus of Object.keys(this.pools) as SfxBus[])
      for (const v of this.pools[bus]) {
        if (!v.src || v.end <= t || (rt && v.rt !== rt)) continue;
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0, t, 0.02);
        try {
          v.src.stop(t + 0.12);
        } catch {
          // already stopped
        }
        // Stay busy until the fade is done: a sound that reuses this voice sooner would
        // reset the gain and let the old tail ring out again.
        v.end = t + 0.14;
      }
  }
}

/** Seconds before the first sample above -48 dBFS (decoder padding differs between browsers). */
function leadOf(buffer: AudioBuffer): number {
  const d = buffer.getChannelData(0);
  const max = Math.min(d.length, Math.floor(buffer.sampleRate * 0.06));
  for (let i = 0; i < max; i++)
    if (Math.abs(d[i]) > 0.004) return Math.max(0, i / buffer.sampleRate - 0.0004);
  return 0;
}
