/**
 * The mix: buses, a convolution reverb of a small concrete cell, a glue compressor and a
 * limiter on the master, music ducking, and the low-pass "muffle" that pushes the machine into
 * the background when the camera looks away from it.
 *
 *   voice -> table bus -> muffle LP -+
 *   voice -> sfx bus ----------------+
 *   voice -> amb bus ----------------+--> pre -> comp -> limiter -> master -> out
 *   music -> LP -> duck ------------+      ^
 *   every bus' wet path -> reverb ---------+
 */
import type { SfxBus } from './sfx-manifest';

export type Channel = 'master' | 'sfx' | 'music' | 'ambience';
export type Volumes = Record<Channel, number>;

/** Where the camera is looking, as far as hearing is concerned. */
export type Focus = 'table' | 'seated' | 'title' | 'away' | 'fall';

const FOCUS: Record<Focus, { lp: number; table: number; wet: number; music: number }> = {
  // lp: cutoff for the table; table: its trim; wet: reverb boost; music: music cutoff.
  table: { lp: 19000, table: 1, wet: 1, music: 19000 },
  seated: { lp: 15000, table: 1, wet: 1.1, music: 19000 },
  title: { lp: 5200, table: 0.9, wet: 1.4, music: 7000 },
  away: { lp: 1250, table: 0.72, wet: 1.7, music: 2400 },
  fall: { lp: 500, table: 0.5, wet: 2, music: 700 },
};

export interface BusNodes {
  /** Dry input. */
  dry: GainNode;
  /** Reverb send collector (follows the bus volume). */
  wet: GainNode;
}

/** Deterministic PRNG for the impulse response (the room should sound the same every run). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Impulse response of a small bare concrete room (about 3 x 2.5 x 2.4 m): a few hard early
 * reflections, then a dense tail (RT60 ~1.5 s) that darkens as it decays, decorrelated per ear.
 */
export function makeCellImpulse(ctx: BaseAudioContext, seconds = IR_SECONDS): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const rt60 = 1.5;
  const tau = rt60 / 6.908;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const rand = lcg(7919 + ch * 104729);
    // Late field: noise with a one-pole low-pass whose cutoff sinks over time.
    let lp = 0;
    const pre = Math.floor(sr * 0.007);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const cutoff = 9000 * Math.exp(-t / 0.9) + 1400;
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      lp += a * (rand() * 2 - 1 - lp);
      // Fade the onset in over 12 ms so the late field does not smear the early taps.
      d[i] = lp * Math.exp(-t / tau) * Math.min(1, t / 0.012) * 0.55;
    }
    // Early reflections: walls, floor and ceiling, alternating ears.
    const taps = [4.1, 6.3, 8.2, 10.9, 13.4, 16.8, 21.5, 27.3];
    taps.forEach((ms, k) => {
      const i = Math.floor((ms + (ch ? 0.9 : 0)) * 0.001 * sr);
      const sign = rand() < 0.5 ? -1 : 1;
      const a = 0.9 * 0.82 ** k * (k % 2 === ch ? 1 : 0.65);
      for (let j = 0; j < 14 && i + j < len; j++)
        d[i + j] += sign * a * Math.exp(-j / 3) * (rand() * 0.5 + 0.5);
    });
  }
  return ir;
}

/** Music is mixed this far under the effects when its slider matches theirs. */
const MUSIC_TRIM = 0.55;
/** While a ball is live the groove steps back 5.5 dB so the table's contacts stay on top. */
const MUSIC_UNDER_BALL = 10 ** (-5.5 / 20);
/** Length of the cell's impulse response: the room needs this long after the last wet input. */
const IR_SECONDS = 1.7;

export class Mix {
  readonly pre: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly master: GainNode;
  readonly reverb: ConvolverNode;
  readonly reverbIn: GainNode;
  readonly buses: Record<SfxBus, BusNodes>;
  /** The table's trim and muffle sit between its bus and the sfx volume. */
  private readonly tableTrim: GainNode;
  private readonly tableLP: BiquadFilterNode;
  private readonly tableWetLP: BiquadFilterNode;
  private readonly sfxVol: GainNode;
  private readonly sfxWetVol: GainNode;
  private readonly ambVol: GainNode;
  private readonly ambWetVol: GainNode;
  private readonly musicVol: GainNode;
  private readonly musicWetVol: GainNode;
  private readonly musicLP: BiquadFilterNode;
  private readonly musicLive: GainNode;
  private readonly musicDuck: GainNode;
  private readonly tableWetTrim: GainNode;
  private focus: Focus = 'table';
  private duckUntil = 0;
  private duckDepth = 1;
  private ballLive = false;
  /** The reverb is only fed while a wet send is still audible; it is idle (and free) otherwise. */
  private wetOn = true;
  private wetUntilT = 0;
  volumes: Volumes = { master: 0.8, sfx: 0.9, music: 0.6, ambience: 0.7 };
  /** Overrides the context clock (offline checks schedule events on their own timeline). */
  clock: (() => number) | null = null;

  constructor(readonly ctx: BaseAudioContext) {
    const g = () => ctx.createGain();
    this.pre = g();
    this.comp = ctx.createDynamicsCompressor();
    // Glue: gentle, slowish; catches the sum of a busy table without pumping the flippers.
    this.comp.threshold.value = -20;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.22;
    this.limiter = ctx.createDynamicsCompressor();
    // A fast 20:1 stage rather than a true brickwall: with a 1 ms attack the stress scenario holds
    // near -2.8 dBFS in Chromium (audio:check). Engines differ by a dB or so in their look-ahead.
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.master = g();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 32;
    hp.Q.value = 0.6;
    this.pre.connect(hp).connect(this.comp).connect(this.limiter).connect(this.master);
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeCellImpulse(ctx);
    this.reverbIn = g();
    const rtn = g();
    rtn.gain.value = 1.2;
    this.reverbIn.connect(this.reverb).connect(rtn).connect(this.pre);

    // Table: bus -> trim -> muffle -> sfx volume.
    this.sfxVol = g();
    this.sfxWetVol = g();
    this.sfxVol.connect(this.pre);
    this.sfxWetVol.connect(this.reverbIn);
    const tableDry = g();
    this.tableTrim = g();
    this.tableLP = ctx.createBiquadFilter();
    this.tableLP.type = 'lowpass';
    this.tableLP.Q.value = 0.55;
    tableDry.connect(this.tableTrim).connect(this.tableLP).connect(this.sfxVol);
    const tableWet = g();
    this.tableWetTrim = g();
    this.tableWetLP = ctx.createBiquadFilter();
    this.tableWetLP.type = 'lowpass';
    this.tableWetLP.Q.value = 0.55;
    tableWet.connect(this.tableWetTrim).connect(this.tableWetLP).connect(this.sfxWetVol);

    const sfxDry = g();
    const sfxWet = g();
    sfxDry.connect(this.sfxVol);
    sfxWet.connect(this.sfxWetVol);

    this.ambVol = g();
    this.ambWetVol = g();
    this.ambVol.connect(this.pre);
    this.ambWetVol.connect(this.reverbIn);
    const ambDry = g();
    const ambWet = g();
    ambDry.connect(this.ambVol);
    ambWet.connect(this.ambWetVol);

    // Music: volume -> (muffle) -> duck -> pre; a little of it reaches the room.
    this.musicVol = g();
    this.musicWetVol = g();
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.Q.value = 0.5;
    this.musicLive = g();
    this.musicDuck = g();
    this.musicVol
      .connect(this.musicLP)
      .connect(this.musicLive)
      .connect(this.musicDuck)
      .connect(this.pre);
    this.musicWetVol.connect(this.reverbIn);
    const musicDry = g();
    const musicWet = g();
    musicDry.connect(this.musicVol);
    musicWet.connect(this.musicWetVol);

    this.buses = {
      table: { dry: tableDry, wet: tableWet },
      sfx: { dry: sfxDry, wet: sfxWet },
      amb: { dry: ambDry, wet: ambWet },
      music: { dry: musicDry, wet: musicWet },
    };
    this.applyFocus(true);
    this.applyVolumes();
  }

  get now(): number {
    return this.clock ? this.clock() : this.ctx.currentTime;
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const v = this.volumes;
    const t = this.now;
    const set = (n: GainNode, x: number) => n.gain.setTargetAtTime(x, t, 0.02);
    set(this.master, v.master);
    set(this.sfxVol, v.sfx);
    set(this.sfxWetVol, v.sfx);
    set(this.ambVol, v.ambience);
    set(this.ambWetVol, v.ambience);
    // The music sits well under the effects at the same slider position.
    set(this.musicVol, v.music * MUSIC_TRIM);
    set(this.musicWetVol, v.music * MUSIC_TRIM * 0.35);
  }

  /** Move the camera's hearing: the table muffles and drifts into the room when looked away from. */
  setFocus(f: Focus, instant = false): void {
    if (f === this.focus && !instant) return;
    this.focus = f;
    this.applyFocus(instant);
  }

  private applyFocus(instant: boolean): void {
    const p = FOCUS[this.focus];
    const t = this.now;
    const tc = instant ? 0.001 : 0.14;
    this.tableLP.frequency.setTargetAtTime(p.lp, t, tc);
    this.tableWetLP.frequency.setTargetAtTime(p.lp, t, tc);
    this.tableTrim.gain.setTargetAtTime(p.table, t, tc);
    this.tableWetTrim.gain.setTargetAtTime(p.wet, t, tc);
    this.musicLP.frequency.setTargetAtTime(p.music, t, tc);
  }

  get currentFocus(): Focus {
    return this.focus;
  }

  /** A live ball on the table: the groove steps back so the contacts sit on top of it. */
  setBallLive(on: boolean): void {
    if (on === this.ballLive) return;
    this.ballLive = on;
    this.musicLive.gain.setTargetAtTime(on ? MUSIC_UNDER_BALL : 1, this.now, 0.25);
  }

  /** A wet send is playing until `t` (its tail is added here): the reverb must stay fed. */
  wetUntil(t: number): void {
    if (t > this.wetUntilT) this.wetUntilT = t;
    if (!this.wetOn) {
      this.reverbIn.connect(this.reverb);
      this.wetOn = true;
    }
  }

  /** Call every frame: cuts the reverb's input once its last wet tail has decayed. */
  tick(): void {
    if (this.wetOn && this.now > this.wetUntilT + IR_SECONDS) {
      this.reverbIn.disconnect(this.reverb);
      this.wetOn = false;
    }
  }

  /**
   * Dip the music (and let the stinger breathe) for `hold` seconds, then swell back over
   * `release`. Overlapping calls keep the deepest dip and the latest end.
   */
  duck(depth = 0.4, hold = 0.5, release = 0.9): void {
    const t = this.now;
    const g = this.musicDuck.gain;
    if (t < this.duckUntil) depth = Math.min(depth, this.duckDepth);
    const until = Math.max(this.duckUntil, t + hold);
    this.duckDepth = depth;
    this.duckUntil = until;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.03);
    g.setTargetAtTime(1, until, release / 3);
  }

  /** Wet nodes for a bus, for synth voices that route themselves. */
  input(bus: SfxBus): BusNodes {
    return this.buses[bus];
  }
}
