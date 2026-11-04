/**
 * Adaptive music. A lookahead scheduler puts notes and samples on the AudioContext clock
 * (sample-accurate, frame-rate independent).
 * - cell: a low drone with a dissonant pad, room tone and the bulb's hum, a ticking wall clock,
 *   a heartbeat as the deadline nears, and the building's own noises (drips, pipes, doors).
 * - table: a minor-key groove (sampled drums, a plucked bass, electric-piano stabs) that adds
 *   layers with combos, RIOT and Sentence rounds; arps ride a dotted-eighth delay.
 */
import { audio, type Audio } from './audio';

export type MusicMode = 'off' | 'cell' | 'table';

export interface MusicState {
  /** Combo chain length (0 = none). */
  combo: number;
  riot: boolean;
  sentence: boolean;
  /** 0..1: how close the deadline is (cell clock tempo, dread). */
  tension: number;
}

const BPM = 108;
const STEPS = 16;
const LOOKAHEAD = 0.15;
const STEP = 60 / BPM / 4;
// A natural minor with a major dominant: Am, Fmaj7, G7, E7.
const ROOTS = [55, 43.65, 49, 41.2];
const CHORDS: number[][] = [
  [0, 3, 7, 10],
  [0, 4, 7, 11],
  [0, 4, 7, 10],
  [0, 4, 8, 10],
];
const ARP = [0, 3, 7, 10, 12, 10, 7, 3];
const ARP_RIOT = [0, 1, 7, 8, 12, 8, 7, 1];
/** Bass figure: [step, semitones above the root, length in steps]. */
const BASS: number[][] = [
  [0, 0, 3],
  [3, 0, 1],
  [6, 12, 1.5],
  [8, 0, 2.5],
  [11, 7, 1],
  [14, 5, 1],
];
const semis = (f: number, n: number) => f * Math.pow(2, n / 12);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

interface Drone {
  stop(): void;
  tension: GainNode;
}

export class Music {
  mode: MusicMode = 'off';
  readonly state: MusicState = { combo: 0, riot: false, sentence: false, tension: 0 };
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private drone: Drone | null = null;
  private tickNext = 0;
  private tickN = 0;
  private beatNext = 0;
  private ambNext = 0;
  private delayIn: GainNode | null = null;
  private delayCtx: BaseAudioContext | null = null;

  constructor(private readonly a: Audio = audio) {}

  setMode(m: MusicMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.drone?.stop();
    this.drone = null;
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.nextTime = this.a.now + 0.05;
    this.tickNext = this.a.now + 0.3;
    this.beatNext = this.a.now + 0.6;
    this.ambNext = this.a.now + rand(3, 7);
    this.step = 0;
    this.bar = 0;
    if (m === 'cell') this.drone = this.startDrone();
  }

  /** Call every frame: schedules whatever falls inside the lookahead window. */
  update(): void {
    const ctx = this.a.ctx;
    // The reward bells follow the groove's key (Sentence rounds sit a semitone up).
    this.a.setKey(this.state.sentence ? 1 : 0);
    if (!ctx || this.mode === 'off') return;
    const now = this.a.now;
    // The groove's own sends to the room are continuous: keep the reverb fed while it plays.
    this.a.keepWet();
    // A context created after setMode: start the drone late.
    if (this.mode === 'cell' && !this.drone) this.drone = this.startDrone();
    const horizon = now + LOOKAHEAD;
    if (this.mode === 'cell') {
      this.updateCell(now, horizon);
      return;
    }
    if (this.nextTime < now - 0.5) this.nextTime = now + 0.02;
    while (this.nextTime < horizon) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.bar = (this.bar + 1) % ROOTS.length;
    }
  }

  // ------------------------------------------------------------------ cell

  private updateCell(now: number, horizon: number): void {
    const s = this.state;
    this.drone?.tension.gain.setTargetAtTime(s.tension * s.tension * 0.05, now, 1.5);
    // Clock: one tick per second, up to two per second as the deadline nears.
    const period = 1 / (1 + s.tension);
    while (this.tickNext < horizon) {
      this.a.play('clock', { when: this.tickNext, variant: this.tickN++ % 2 });
      this.tickNext += period;
    }
    // Heartbeat once the deadline is close: lub-dub, faster and louder with the dread.
    if (s.tension > 0.5) {
      const k = (s.tension - 0.5) * 2;
      const beat = 1.5 - k * 0.55;
      while (this.beatNext < horizon) {
        this.a.play('mKick', { when: this.beatNext, rate: 0.55, gain: 0.2 + k * 0.3 });
        this.a.play('mKick', { when: this.beatNext + 0.17, rate: 0.5, gain: 0.12 + k * 0.2 });
        this.beatNext += beat;
      }
    } else this.beatNext = Math.max(this.beatNext, now);
    // The building: drips, a pipe knocked far away, a door slamming down the corridor.
    if (this.ambNext < now) {
      const r = Math.random();
      const t = now + 0.02;
      if (r < 0.58) this.a.play('drip', { when: t, pan: rand(-0.8, 0.8) });
      else if (r < 0.8) this.a.play('pipe', { when: t, pan: rand(-0.6, 0.6) });
      else if (r < 0.92) this.a.play('farDoor', { when: t, pan: rand(-0.5, 0.5) });
      else this.a.play('chain', { when: t, gain: 0.35, pan: rand(-0.7, 0.7) });
      this.ambNext = now + rand(5, 15) / (1 + s.tension * 0.8);
    }
  }

  /** Low drone, dissonant pad, room tone and bulb hum through a slowly breathing low-pass. */
  private startDrone(): Drone | null {
    const ctx = this.a.ctx;
    const bus = this.a.bus('ambience');
    const noise = this.a.parts?.synth.noiseBuf;
    if (!ctx || !bus || !noise) return null;
    const t0 = this.a.now;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 2.5);
    const stoppers: { stop(t: number): void }[] = [];

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);
    const drone = ctx.createGain();
    drone.gain.value = 0.03;
    for (const f of [55, 55.4, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      stoppers.push(o);
    }
    lp.connect(drone).connect(out);
    lfo.start();
    stoppers.push(lfo);

    // The dread: a minor second that only fades in as the deadline gets close.
    const tension = ctx.createGain();
    tension.gain.value = 0;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 0.19;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.3;
    tremLfo.connect(tremDepth).connect(trem.gain);
    tremLfo.start();
    stoppers.push(tremLfo);
    for (const f of [233.1, 246.9, 349.2]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(trem);
      o.start();
      stoppers.push(o);
    }
    trem.connect(tension).connect(out);

    // Room tone and the bare bulb's mains hum.
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    air.playbackRate.value = 0.4;
    const airBP = ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = 380;
    airBP.Q.value = 0.4;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.018;
    air.connect(airBP).connect(airGain).connect(out);
    air.start(0, 0.3);
    stoppers.push(air);
    for (const [f, g] of [
      [100, 0.006],
      [200, 0.003],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(out);
      o.start();
      stoppers.push(o);
    }
    out.connect(bus);
    return {
      tension,
      stop: () => {
        const t = this.a.now;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 1.2);
        for (const s of stoppers) s.stop(t + 1.3);
      },
    };
  }

  // ------------------------------------------------------------------ table

  private playStep(i: number, t: number): void {
    const s = this.state;
    const a = this.a;
    const root = ROOTS[this.bar] * (s.sentence ? Math.pow(2, 1 / 12) : 1);
    const swing = i % 2 === 1 ? STEP * 0.12 : 0;
    const ts = t + swing;
    // Kick: the downbeats, a push before the turnaround; four on the floor in RIOT.
    const kick =
      i === 0 || i === 8 || (this.bar % 2 === 1 && i === 10) || (this.bar === 3 && i === 14);
    if (kick || (s.riot && i % 4 === 0)) a.play('mKick', { when: t, gain: i === 0 ? 1 : 0.85 });
    // Snare on 2 and 4 with a rim ghost; rolls in RIOT.
    if (i === 4 || i === 12) a.play('mSnare', { when: t, gain: s.riot ? 1 : 0.8 });
    else if (i === 7 && this.bar % 2 === 1) a.play('mRim', { when: ts, gain: 0.4 });
    if (s.riot && i >= 14) a.play('mSnare', { when: t, gain: 0.55 });
    // Hats: eighths always, sixteenths with a combo, an open hat to turn the bar around.
    if (i % 2 === 0) a.play('mHat', { when: t, gain: i % 4 === 0 ? 0.55 : 0.9 });
    else if (s.combo >= 2 || s.riot) a.play('mHat', { when: ts, gain: 0.4 });
    if (i === 14 && this.bar === 3) a.play('mOhat', { when: t });
    // Bass: a plucked figure, busier with a combo.
    for (const [st, n, len] of BASS) {
      if (st !== i) continue;
      if (!s.combo && n === 7 && this.bar % 2 === 0) continue;
      // The saw carries the figure up where a laptop speaker can reproduce it; the sine under
      // it supplies the weight on full-range speakers.
      this.pluck(
        semis(root * 2, n),
        t,
        len * STEP * 0.9,
        s.combo >= 3 ? 0.15 : 0.12,
        1700,
        480,
        'sawtooth',
      );
      this.pluck(root * (n >= 12 ? 2 : 1), t, len * STEP * 0.8, 0.07, 200, 120, 'sine');
      this.pluck(semis(root * 2, n), t, len * STEP * 0.7, 0.06, 500, 300, 'triangle');
    }
    // Electric piano stabs on the offbeats.
    if (i === 2 || i === 10 || (s.combo >= 1 && i === 7))
      this.stab(root * 4, CHORDS[this.bar], t, i === 7 ? 0.7 : 1);
    // Arp for long combos and RIOT, riding the delay.
    if (s.riot || s.combo >= 3) {
      const arp = s.riot ? ARP_RIOT : ARP;
      this.pluck(
        semis(root * 8, arp[i % arp.length]),
        ts,
        STEP * 1.8,
        s.riot ? 0.05 : 0.036,
        3200,
        700,
        'square',
        0.5,
      );
    }
    // RIOT: a siren figure on every beat.
    if (s.riot && i % 4 === 0) {
      this.pluck(semis(root * 16, 0), t, STEP * 1.6, 0.032, 2600, 1200, 'sawtooth', 0.3);
      this.pluck(
        semis(root * 16, -6),
        t + STEP * 2,
        STEP * 1.6,
        0.032,
        2600,
        1200,
        'sawtooth',
        0.3,
      );
    }
    // Sentence rounds: a sour high drone stab each bar.
    if (s.sentence && i === 0)
      this.pluck(semis(root * 16, 1), t, STEP * 7, 0.03, 2400, 900, 'square', 0.4);
    // A tom fill into the next bar when the combo is hot.
    if (this.bar === 3 && i >= 12 && s.combo >= 2 && i % 2 === 0)
      a.play('mTom', { when: t, rate: 1.3 - (i - 12) * 0.08, gain: 0.7 });
  }

  /** A filtered oscillator note: the cutoff falls from c0 to c1 as it decays. */
  private pluck(
    f: number,
    t: number,
    dur: number,
    gain: number,
    c0: number,
    c1: number,
    type: OscillatorType,
    delaySend = 0,
  ): void {
    const ctx = this.a.ctx;
    const bus = this.a.bus('music');
    if (!ctx || !bus) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(c0, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(60, c1), t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(bus);
    if (delaySend > 0) {
      const d = this.delay();
      if (d) {
        const sg = ctx.createGain();
        sg.gain.value = delaySend;
        g.connect(sg).connect(d);
      }
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A soft electric-piano chord: sine with a quick bright second partial. */
  private stab(root: number, chord: number[], t: number, vel: number): void {
    const ctx = this.a.ctx;
    const mix = this.a.parts?.mix;
    if (!ctx || !mix) return;
    const bus = mix.input('music');
    for (const n of chord) {
      const f = semis(root, n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.026 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const o1 = ctx.createOscillator();
      o1.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.frequency.value = f * 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.4, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o1.connect(g);
      o2.connect(g2).connect(g);
      g.connect(lp);
      lp.connect(bus.dry);
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      lp.connect(sg).connect(bus.wet);
      o1.start(t);
      o2.start(t);
      o1.stop(t + 0.55);
      o2.stop(t + 0.55);
    }
  }

  /** Dotted-eighth feedback delay for the arps (built once per context). */
  private delay(): GainNode | null {
    const ctx = this.a.ctx;
    const bus = this.a.bus('music');
    if (!ctx || !bus) return null;
    if (this.delayIn && this.delayCtx === ctx) return this.delayIn;
    const input = ctx.createGain();
    const d = ctx.createDelay(1);
    d.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    const out = ctx.createGain();
    out.gain.value = 0.55;
    input.connect(d);
    d.connect(tone).connect(fb).connect(d);
    tone.connect(out).connect(bus);
    this.delayIn = input;
    this.delayCtx = ctx;
    return input;
  }
}

export const music = new Music();
