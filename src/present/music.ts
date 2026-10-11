/**
 * Adaptive music, all synthesised. A lookahead step sequencer schedules notes on the
 * AudioContext clock (sample-accurate, frame-rate independent).
 * - cell: a low drone and a ticking clock; the clock speeds up with the deadline's tension.
 * - table: percussion and bass, adding layers with combos, RIOT and Sentence rounds.
 */
import { audio } from './audio';

export type MusicMode = 'off' | 'cell' | 'table';

export interface MusicState {
  /** Combo chain length (0 = none). */
  combo: number;
  riot: boolean;
  sentence: boolean;
  /** 0..1: how close the deadline is (cell clock tempo). */
  tension: number;
}

const BPM = 112;
const STEPS = 16;
const LOOKAHEAD = 0.15;
// A minor with a flat second for dread: A Bb C D E F G.
const ROOTS = [55, 43.65, 49, 41.2]; // A1, F1, G1, E1 (bar progression)
const ARP = [0, 3, 7, 10, 12, 10, 7, 3]; // semitone offsets
const semis = (f: number, n: number) => f * Math.pow(2, n / 12);

export class Music {
  mode: MusicMode = 'off';
  readonly state: MusicState = { combo: 0, riot: false, sentence: false, tension: 0 };
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private drone: { stop(): void } | null = null;
  private tickNext = 0;

  setMode(m: MusicMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.drone?.stop();
    this.drone = null;
    const ctx = audio.ctx;
    if (!ctx) return;
    this.nextTime = ctx.currentTime + 0.05;
    this.tickNext = ctx.currentTime + 0.3;
    this.step = 0;
    if (m === 'cell') this.drone = this.startDrone();
  }

  /** Call every frame: schedules whatever falls inside the lookahead window. */
  update(): void {
    const ctx = audio.ctx;
    if (!ctx || this.mode === 'off') return;
    // A context created after setMode: start the drone late.
    if (this.mode === 'cell' && !this.drone) this.drone = this.startDrone();
    const horizon = ctx.currentTime + LOOKAHEAD;
    if (this.mode === 'cell') {
      // Clock: one tick per second, up to two per second as the deadline nears.
      const period = 1 / (1 + this.state.tension);
      while (this.tickNext < horizon) {
        this.tick(this.tickNext);
        this.tickNext += period;
      }
      return;
    }
    const stepDur = 60 / BPM / 4;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < horizon) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.bar = (this.bar + 1) % ROOTS.length;
    }
  }

  // ------------------------------------------------------------------ voices

  private playStep(i: number, t: number): void {
    const s = this.state;
    const root = ROOTS[this.bar] * (s.sentence ? Math.pow(2, 1 / 12) : 1);
    // Kick on the beat, an extra push in RIOT.
    if (i % 4 === 0 || (s.riot && i === 10)) this.kick(t);
    // Hats: offbeats always, sixteenths once a combo is going.
    if (i % 4 === 2 || (s.combo >= 2 && i % 2 === 1))
      audio.noise({ dur: 0.04, freq: 8000, type: 'highpass', gain: 0.05, bus: 'music', when: t });
    // Snare on 2 and 4 (rolls in RIOT).
    if (i === 4 || i === 12 || (s.riot && i >= 14))
      audio.noise({ dur: 0.14, freq: 1900, q: 0.8, gain: 0.12, bus: 'music', when: t });
    // Bass: root pulses, busier with combos.
    if (i % 4 === 0 || (s.combo >= 1 && i % 4 === 3))
      this.bass(root * 2, t, s.combo >= 3 ? 0.11 : 0.09);
    // Arp lead in RIOT or long combos.
    if (s.riot || s.combo >= 3) {
      const f = semis(root * 8, ARP[i % ARP.length]);
      this.lead(f, t, s.riot ? 0.05 : 0.035);
    }
    // Sentence rounds: a sour high drone stab each bar.
    if (s.sentence && i === 0) this.lead(semis(root * 16, 1), t, 0.03, 1.2);
  }

  private kick(t: number): void {
    audio.tone({ type: 'sine', f0: 140, f1: 38, dur: 0.22, gain: 0.32, bus: 'music', when: t });
  }

  private bass(f: number, t: number, gain: number): void {
    this.osc('sawtooth', f, t, 0.18, gain, 420);
  }

  private lead(f: number, t: number, gain: number, dur = 0.12): void {
    this.osc('square', f, t, dur, gain, 2400);
  }

  /** Filtered oscillator note on the music bus. */
  private osc(
    type: OscillatorType,
    f: number,
    t: number,
    dur: number,
    gain: number,
    cutoff: number,
  ): void {
    const ctx = audio.ctx;
    const bus = audio.bus('music');
    if (!ctx || !bus) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The cell clock: a dry wooden tick, a lower tock every fourth. */
  private tick(t: number): void {
    audio.noise({ dur: 0.03, freq: 3200, q: 6, gain: 0.08, bus: 'ambience', when: t });
    audio.tone({
      type: 'triangle',
      f0: 1800,
      f1: 1200,
      dur: 0.03,
      gain: 0.03,
      bus: 'ambience',
      when: t,
    });
  }

  /** Two detuned saws through a slowly breathing low-pass. */
  private startDrone(): { stop(): void } | null {
    const ctx = audio.ctx;
    const bus = audio.bus('ambience');
    if (!ctx || !bus) return null;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);
    const oscs = [55, 55.4, 82.4].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(out).connect(bus);
    lfo.start();
    return {
      stop: () => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 1.2);
        for (const o of [...oscs, lfo]) o.stop(t + 1.3);
      },
    };
  }
}

export const music = new Music();
