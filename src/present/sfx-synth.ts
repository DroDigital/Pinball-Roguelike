/**
 * Live synthesis: the oscillator/noise primitives (also used by the music) and a fallback voice
 * for each important sound, so the game still makes noise when a sample fails to load.
 */
import type { SfxBus, SfxName } from './sfx-manifest';
import type { PlayOpts } from './sfx-engine';
import type { Mix } from './sfx-mix';

export type SynthBus = SfxBus | 'ambience';

interface Common {
  gain: number;
  attack?: number;
  pan?: number;
  bus?: SynthBus;
  when?: number;
  /** Reverb send (0..1). */
  send?: number;
}

export interface NoiseOpts extends Common {
  dur: number;
  freq: number;
  q?: number;
  type?: BiquadFilterType;
}

export interface ToneOpts extends Common {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  detune?: number;
}

const busOf = (b: SynthBus | undefined): SfxBus => (b === 'ambience' ? 'amb' : (b ?? 'sfx'));

export class Synth {
  /** Two seconds of white noise, looped by the beds and sliced by the bursts. */
  readonly noiseBuf: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly mix: Mix,
  ) {
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
  }

  private out(node: AudioNode, o: Common): void {
    const ctx = this.ctx;
    let n = node;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      n = n.connect(p);
    }
    const bus = this.mix.input(busOf(o.bus));
    n.connect(bus.dry);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      n.connect(s).connect(bus.wet);
      // A synthesised voice is short (its longest tail is a few seconds): keep the room fed.
      this.mix.wetUntil((o.when ?? this.mix.now) + 3);
    }
  }

  /** Short filtered noise burst. */
  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    const t = (o.when ?? this.mix.now) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.value = o.freq;
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    this.out(src.connect(f).connect(g), o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  /** Oscillator blip with a pitch envelope. */
  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const t = (o.when ?? this.mix.now) + 0.001;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    this.out(osc.connect(g), o);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** A struck-bar bell: inharmonic partials with shorter decays up the series. */
  bell(f: number, gain: number, dur: number, o: Partial<Common>): void {
    const parts: [number, number, number][] = [
      [1, 1, 1],
      [2.756, 0.45, 0.45],
      [5.404, 0.2, 0.22],
    ];
    for (const [r, a, d] of parts) this.tone({ ...o, f0: f * r, dur: dur * d, gain: gain * a });
  }
}

type Fb = (s: Synth, p: { g: number; pan: number; r: number; when: number | undefined }) => void;

/** Fallback voices, keyed by manifest name. Missing names are silent when their file is missing. */
const T = 'table' as const;
export const FALLBACKS: Partial<Record<SfxName, Fb>> = {
  flipUp: (s, { g, pan, when }) => {
    s.noise({ dur: 0.07, freq: 1800, q: 0.8, gain: 0.5 * g, pan, bus: T, when });
    s.tone({ type: 'sine', f0: 150, f1: 58, dur: 0.1, gain: 0.5 * g, pan, bus: T, when });
    s.tone({ type: 'square', f0: 140, f1: 60, dur: 0.05, gain: 0.14 * g, pan, bus: T, when });
  },
  flipDown: (s, { g, pan, when }) =>
    s.noise({ dur: 0.05, freq: 900, q: 1.2, gain: 0.25 * g, pan, bus: T, when }),
  flipHit: (s, { g, pan, when }) =>
    s.noise({ dur: 0.05, freq: 400, q: 1, gain: 0.4 * g, pan, bus: T, when }),
  rubber: (s, { g, pan, when }) =>
    s.noise({ dur: 0.05, freq: 500, q: 1, gain: 0.35 * g, pan, bus: T, when }),
  plastic: (s, { g, pan, when }) =>
    s.noise({ dur: 0.04, freq: 1800, q: 1.2, gain: 0.3 * g, pan, bus: T, when }),
  metal: (s, { g, pan, r, when }) =>
    s.tone({
      type: 'triangle',
      f0: 1900 * r,
      f1: 900 * r,
      dur: 0.07,
      gain: 0.25 * g,
      pan,
      bus: T,
      when,
    }),
  ballBall: (s, { g, pan, r, when }) =>
    s.tone({ type: 'sine', f0: 4300 * r, dur: 0.04, gain: 0.12 * g, pan, bus: T, when }),
  wood: (s, { g, pan, when }) =>
    s.noise({ dur: 0.07, freq: 300, q: 0.9, gain: 0.45 * g, pan, bus: T, when }),
  pop: (s, { g, pan, when }) => {
    s.tone({ type: 'sine', f0: 160, f1: 55, dur: 0.18, gain: 0.7 * g, pan, bus: T, when });
    s.noise({ dur: 0.08, freq: 700, q: 1, gain: 0.5 * g, pan, bus: T, when });
  },
  sling: (s, { g, pan, when }) => {
    s.noise({ dur: 0.06, freq: 2600, q: 1.5, gain: 0.55 * g, pan, bus: T, when });
    s.tone({ type: 'triangle', f0: 320, f1: 90, dur: 0.08, gain: 0.3 * g, pan, bus: T, when });
  },
  drop: (s, { g, pan, when }) => {
    s.noise({ dur: 0.12, freq: 1200, q: 3, gain: 0.5 * g, pan, bus: T, when });
    s.tone({ type: 'square', f0: 220, f1: 110, dur: 0.1, gain: 0.15 * g, pan, bus: T, when });
  },
  dropReset: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 3; i++)
      s.noise({ dur: 0.08, freq: 1500, q: 3, gain: 0.35 * g, bus: T, when: t + i * 0.03 });
  },
  spin: (s, { g, r, when }) =>
    s.noise({ dur: 0.03, freq: 2500 * r, q: 6, gain: 0.25 * g, pan: 0.8, bus: T, when }),
  lane: (s, { g, pan, when }) =>
    s.noise({ dur: 0.02, freq: 3000, q: 4, gain: 0.15 * g, pan, bus: T, when }),
  plungerTick: (s, { g, r, when }) =>
    s.noise({ dur: 0.02, freq: 3000 * r, q: 8, gain: 0.08 * g, pan: 0.8, bus: T, when }),
  launch: (s, { g, when }) => {
    s.noise({ dur: 0.25, freq: 900, q: 2, gain: 0.5 * g, pan: 0.8, bus: T, when });
    s.tone({ type: 'sine', f0: 90, f1: 40, dur: 0.15, gain: 0.4 * g, pan: 0.8, bus: T, when });
  },
  kick: (s, { g, pan, when }) => {
    s.tone({ type: 'square', f0: 120, f1: 50, dur: 0.12, gain: 0.4 * g, pan, bus: T, when });
    s.noise({ dur: 0.1, freq: 1000, q: 1, gain: 0.4 * g, pan, bus: T, when });
  },
  hole: (s, { g, when }) => {
    s.tone({ type: 'sine', f0: 90, f1: 45, dur: 0.35, gain: 0.7 * g, bus: T, when });
    s.noise({ dur: 0.2, freq: 250, q: 1, gain: 0.5 * g, bus: T, when });
  },
  lock: (s, { g, when }) => {
    s.tone({ type: 'square', f0: 120, f1: 50, dur: 0.12, gain: 0.4 * g, bus: T, when });
    s.noise({ dur: 0.1, freq: 1000, q: 1, gain: 0.4 * g, bus: T, when });
  },
  chute: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 6; i++)
      s.noise({
        dur: 0.05,
        freq: 1500 + i * 200,
        q: 4,
        gain: 0.15 * g,
        pan: -0.5,
        bus: T,
        when: t + i * 0.06,
      });
  },
  knocker: (s, { g, when }) => {
    s.tone({ type: 'square', f0: 70, f1: 40, dur: 0.18, gain: 0.9 * g, when });
    s.noise({ dur: 0.15, freq: 180, q: 0.7, gain: 0.9 * g, when });
  },
  drain: (s, { g, when }) =>
    s.tone({ type: 'sine', f0: 200, f1: 50, dur: 0.6, gain: 0.5 * g, when }),
  tilt: (s, { g, when }) => s.tone({ type: 'sawtooth', f0: 110, dur: 0.9, gain: 0.35 * g, when }),
  warn: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.tone({ type: 'square', f0: 880, dur: 0.12, gain: 0.2 * g, when: t });
    s.tone({ type: 'square', f0: 660, dur: 0.12, gain: 0.2 * g, when: t + 0.14 });
  },
  bellC: (s, { g, r, when }) => s.bell(1046.5 * r, 0.22 * g, 1.2, { bus: T, when, send: 0.2 }),
  bellE: (s, { g, r, when }) => s.bell(1318.5 * r, 0.22 * g, 1.2, { bus: T, when, send: 0.2 }),
  bellG: (s, { g, r, when }) => s.bell(1568 * r, 0.22 * g, 1.2, { bus: T, when, send: 0.2 }),
  toll: (s, { g, when }) => s.bell(196, 0.4 * g, 2.5, { bus: 'sfx', when, send: 0.4 }),
  coin: (s, { g, r, when }) => {
    s.tone({ type: 'sine', f0: 1900 * r, dur: 0.12, gain: 0.18 * g, bus: T, when });
    s.tone({ type: 'sine', f0: 2850 * r, dur: 0.09, gain: 0.08 * g, bus: T, when });
  },
  coinTray: (s, { g, r, when }) => {
    s.noise({ dur: 0.03, freq: 4200 * r, q: 6, gain: 0.07 * g, pan: 0.35, bus: T, when });
    s.tone({ type: 'sine', f0: 2600 * r, dur: 0.07, gain: 0.05 * g, bus: T, when });
  },
  boom: (s, { g, when }) => {
    s.tone({ type: 'sine', f0: 80, f1: 32, dur: 0.9, gain: 0.8 * g, when });
    s.noise({ dur: 0.6, freq: 200, q: 0.6, gain: 0.5 * g, type: 'lowpass', when });
  },
  doorClang: (s, { g, when }) => {
    s.tone({ type: 'square', f0: 220, f1: 90, dur: 0.5, gain: 0.12 * g, when });
    s.tone({ type: 'sine', f0: 640, f1: 410, dur: 0.9, gain: 0.1 * g, when });
    s.noise({ dur: 0.4, freq: 1200, q: 1, gain: 0.25 * g, when });
  },
  glassCrack: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 5; i++)
      s.noise({ dur: 0.03, freq: 5000 + i * 700, q: 8, gain: 0.2 * g, when: t + i * 0.04 });
  },
  creak: (s, { g, when }) =>
    s.tone({
      type: 'sawtooth',
      f0: 90 + Math.random() * 60,
      f1: 70,
      dur: 0.8,
      gain: 0.05 * g,
      attack: 0.3,
      when,
    }),
  knock: (s, { g, when }) => {
    s.tone({ type: 'sine', f0: 110, f1: 60, dur: 0.12, gain: 0.5 * g, when });
    s.noise({ dur: 0.05, freq: 300, q: 2, gain: 0.25 * g, pan: -0.7, when });
  },
  trapdoor: (s, { g, when }) => {
    s.tone({ type: 'square', f0: 60, f1: 30, dur: 0.6, gain: 0.9 * g, when });
    s.noise({ dur: 0.5, freq: 120, q: 0.6, gain: 0.9 * g, when });
  },
  phoneRing: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 20; k++) {
        const at = t + i * 0.5 + k * 0.025;
        s.tone({ type: 'triangle', f0: 1100, dur: 0.025, gain: 0.2 * g, when: at });
        s.tone({ type: 'triangle', f0: 1350, dur: 0.025, gain: 0.15 * g, when: at + 0.012 });
      }
  },
  atmKey: (s, { g, r, when }) =>
    s.tone({ type: 'square', f0: 1320 * r, dur: 0.06, gain: 0.1 * g, when }),
  hurryTick: (s, { g, r, when }) =>
    s.tone({ type: 'square', f0: 1320 * r, dur: 0.05, gain: 0.08 * g, bus: T, when }),
  atmOk: (s, { g, when }) => s.tone({ type: 'square', f0: 1320, dur: 0.1, gain: 0.1 * g, when }),
  atmNo: (s, { g, when }) => s.tone({ type: 'square', f0: 330, dur: 0.2, gain: 0.12 * g, when }),
  cash: (s, { g, when }) => s.bell(2350, 0.18 * g, 0.6, { when, send: 0.2 }),
  rubble: (s, { g, when }) => {
    s.tone({ type: 'sine', f0: 90, f1: 34, dur: 0.8, gain: 0.7 * g, when });
    s.noise({ dur: 1.2, freq: 400, q: 0.5, gain: 0.5 * g, type: 'lowpass', when });
  },
  clock: (s, { g, r, when }) => {
    s.noise({ dur: 0.03, freq: 3200 * r, q: 6, gain: 0.08 * g, bus: 'amb', when });
  },
  uiMove: (s, { g, when }) => s.tone({ type: 'square', f0: 1100, dur: 0.03, gain: 0.05 * g, when }),
  uiHover: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1400, dur: 0.02, gain: 0.03 * g, when }),
  uiTick: (s, { g, when }) => s.tone({ type: 'square', f0: 1700, dur: 0.02, gain: 0.05 * g, when }),
  uiSlider: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1500, dur: 0.02, gain: 0.05 * g, when }),
  uiSelect: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1320, dur: 0.06, gain: 0.12 * g, when }),
  uiBack: (s, { g, when }) => s.tone({ type: 'square', f0: 880, dur: 0.05, gain: 0.1 * g, when }),
  uiOpen: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 990, f1: 1480, dur: 0.07, gain: 0.1 * g, when }),
  uiClose: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1480, f1: 990, dur: 0.07, gain: 0.1 * g, when }),
  uiError: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.tone({ type: 'square', f0: 880, dur: 0.12, gain: 0.2 * g, when: t });
    s.tone({ type: 'square', f0: 660, dur: 0.12, gain: 0.2 * g, when: t + 0.14 });
  },
  uiBuy: (s, { g, when }) => s.bell(1760, 0.14 * g, 0.4, { when }),
  uiSell: (s, { g, when }) => s.bell(1320, 0.12 * g, 0.3, { when }),
  uiDeposit: (s, { g, when }) => s.bell(1568, 0.14 * g, 0.4, { when }),
  uiReward: (s, { g, when }) => s.bell(2093, 0.14 * g, 0.5, { when }),
  uiToggleOn: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1180, dur: 0.05, gain: 0.1 * g, when }),
  uiToggleOff: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 880, dur: 0.05, gain: 0.1 * g, when }),
  uiSuccess: (s, { g, when }) => arp(s, [1047, 1319], 0.06, 0.12 * g, when),
  uiNotify: (s, { g, when }) => arp(s, [1319, 1760], 0.07, 0.1 * g, when),
  uiUnlock: (s, { g, when }) => arp(s, [880, 1175], 0.05, 0.1 * g, when),
  uiLock: (s, { g, when }) => arp(s, [1175, 880], 0.05, 0.1 * g, when),
  uiWarning: (s, { g, when }) => arp(s, [660, 660], 0.14, 0.12 * g, when, 'square'),
  // Stingers and chip accents: short bell figures stand in for the recordings.
  stAchievement: (s, { g, when }) => arp(s, [523, 659, 784, 1047], 0.09, 0.14 * g, when),
  stBonus: (s, { g, when }) => arp(s, [523, 784, 1047], 0.08, 0.14 * g, when),
  stReward: (s, { g, when }) => arp(s, [523, 659, 784], 0.09, 0.14 * g, when),
  stLevelUp: (s, { g, when }) => arp(s, [392, 523, 659, 784], 0.07, 0.14 * g, when),
  stLock: (s, { g, when }) => arp(s, [330, 247], 0.08, 0.16 * g, when),
  stWarning: (s, { g, when }) => arp(s, [440, 330, 440, 330], 0.14, 0.12 * g, when, 'square'),
  stError: (s, { g, when }) => arp(s, [330, 233], 0.12, 0.14 * g, when, 'square'),
  ssUpgrade: (s, { g, when }) => arp(s, [660, 880, 1320], 0.05, 0.08 * g, when, 'square'),
  ssSecret: (s, { g, when }) => arp(s, [988, 1319, 1976], 0.07, 0.08 * g, when, 'square'),
  ssLose: (s, { g, when }) => arp(s, [440, 370, 311], 0.1, 0.1 * g, when, 'square'),
  ssGameover: (s, { g, when }) => arp(s, [330, 277, 247, 196], 0.18, 0.1 * g, when, 'square'),
  ssCoin: (s, { g, r, when }) =>
    s.tone({ type: 'square', f0: 1760 * r, dur: 0.07, gain: 0.05 * g, when }),
  ssCoinHi: (s, { g, r, when }) =>
    s.tone({ type: 'square', f0: 2350 * r, dur: 0.07, gain: 0.05 * g, bus: T, when }),
  coinShower: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 14; i++)
      s.tone({
        type: 'sine',
        f0: 2300 + ((i * 937) % 1500),
        dur: 0.08,
        gain: 0.07 * g,
        when: t + i * 0.055,
      });
  },
  whoosh: (s, { g, when }) =>
    s.noise({ dur: 0.4, freq: 1400, q: 0.8, gain: 0.25 * g, attack: 0.12, when }),
  riser: (s, { g, when }) =>
    s.tone({ type: 'sawtooth', f0: 180, f1: 1500, dur: 1.6, gain: 0.05 * g, attack: 0.6, when }),
  alarm: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 5; i++)
      s.tone({
        type: 'triangle',
        f0: i % 2 ? 905 : 860,
        dur: 0.07,
        gain: 0.14 * g,
        when: t + i * 0.066,
      });
  },
  doorLock: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.noise({ dur: 0.03, freq: 1800, q: 2, gain: 0.3 * g, when: t });
    s.tone({ type: 'sine', f0: 170, f1: 70, dur: 0.1, gain: 0.4 * g, when: t + 0.08 });
    s.noise({ dur: 0.03, freq: 1500, q: 2, gain: 0.25 * g, when: t + 0.34 });
  },
  chain: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 9; i++)
      s.noise({
        dur: 0.03,
        freq: 2200 + ((i * 613) % 1400),
        q: 5,
        gain: 0.07 * g,
        when: t + i * 0.06,
      });
  },
  phonePick: (s, { g, when }) => s.noise({ dur: 0.08, freq: 900, q: 1.2, gain: 0.3 * g, when }),
  cashOut: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.noise({ dur: 0.9, freq: 1800, q: 1.2, gain: 0.12 * g, attack: 0.1, when: t });
    s.tone({ type: 'sine', f0: 150, f1: 60, dur: 0.12, gain: 0.4 * g, when: t + 1 });
  },
  vendCoin: (s, { g, when }) => s.bell(2350, 0.12 * g, 0.2, { when }),
  vendDrop: (s, { g, when }) => {
    s.tone({ type: 'sine', f0: 190, f1: 70, dur: 0.14, gain: 0.5 * g, when });
    s.noise({ dur: 0.1, freq: 900, q: 1, gain: 0.3 * g, when });
  },
  vendSpiral: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 8; i++)
      s.tone({ type: 'sine', f0: 240 + i * 30, dur: 0.05, gain: 0.06 * g, when: t + i * 0.07 });
  },
  cashCount: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 6; i++)
      s.noise({ dur: 0.02, freq: 2600 + i * 180, q: 2, gain: 0.12 * g, when: t + i * 0.09 });
  },
  coinSpin: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    for (let i = 0; i < 8; i++)
      s.tone({
        type: 'sine',
        f0: 2600 + ((i * 311) % 900),
        dur: 0.04,
        gain: 0.05 * g,
        when: t + i * 0.07,
      });
  },
  crumble: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.noise({ dur: 1, freq: 500, q: 0.6, gain: 0.35 * g, attack: 0.01, when: t });
    s.tone({ type: 'sine', f0: 90, f1: 40, dur: 0.4, gain: 0.3 * g, when: t });
  },
  fall: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.tone({ type: 'sine', f0: 320, f1: 60, dur: 0.6, gain: 0.25 * g, attack: 0.01, when: t });
    s.noise({ dur: 0.5, freq: 900, q: 0.8, gain: 0.18 * g, attack: 0.02, when: t });
  },
  drip: (s, { g, r, when }) =>
    s.tone({ type: 'sine', f0: 1400 * r, f1: 620 * r, dur: 0.14, gain: 0.12 * g, when }),
  pipe: (s, { g, when }) =>
    s.noise({
      dur: 0.6,
      freq: 700,
      q: 6,
      gain: 0.05 * g,
      attack: 0.1,
      bus: 'ambience',
      send: 0.8,
      when,
    }),
  farDoor: (s, { g, when }) => {
    const t = when ?? s.mix.now;
    s.noise({
      dur: 0.5,
      freq: 300,
      q: 1.5,
      gain: 0.25 * g,
      attack: 0.05,
      bus: 'ambience',
      when: t,
    });
    s.tone({ type: 'sine', f0: 180, f1: 90, dur: 0.6, gain: 0.12 * g, bus: 'ambience', when: t });
  },
  mKick: (s, { g, when }) =>
    s.tone({ type: 'sine', f0: 150, f1: 48, dur: 0.22, gain: 0.8 * g, bus: 'music', when }),
  mSnare: (s, { g, when }) => {
    s.noise({ dur: 0.18, freq: 1800, q: 0.7, gain: 0.35 * g, bus: 'music', when });
    s.tone({ type: 'triangle', f0: 190, dur: 0.1, gain: 0.2 * g, bus: 'music', when });
  },
  mHat: (s, { g, when }) =>
    s.noise({ dur: 0.04, freq: 8000, q: 1.5, gain: 0.12 * g, bus: 'music', when }),
  mOhat: (s, { g, when }) =>
    s.noise({ dur: 0.22, freq: 8000, q: 1.2, gain: 0.1 * g, bus: 'music', when }),
  mRim: (s, { g, when }) =>
    s.tone({ type: 'square', f0: 1700, dur: 0.02, gain: 0.08 * g, bus: 'music', when }),
  mTom: (s, { g, when }) =>
    s.tone({ type: 'sine', f0: 160, f1: 100, dur: 0.3, gain: 0.4 * g, bus: 'music', when }),
  uiPause: (s, { g, when }) => arp(s, [880, 660], 0.07, 0.1 * g, when),
  uiResume: (s, { g, when }) => arp(s, [660, 880], 0.07, 0.1 * g, when),
};

/**
 * Sounds deliberately without a live-synthesis voice (silent when their file fails). Empty: every
 * bank sound has a fallback, and a test keeps it that way.
 */
export const NO_FALLBACK: readonly SfxName[] = [];

/** A run of notes: soft triangle (or square) blips, one every `gap` seconds. */
function arp(
  s: Synth,
  freqs: number[],
  gap: number,
  gain: number,
  when: number | undefined,
  type: OscillatorType = 'triangle',
): void {
  const t = when ?? s.mix.now;
  freqs.forEach((f, i) => s.tone({ type, f0: f, dur: 0.16, gain, when: t + i * gap }));
}

export function runFallback(s: Synth, name: SfxName, o: PlayOpts): void {
  const fb = FALLBACKS[name];
  if (!fb) return;
  fb(s, {
    g: o.gain ?? 1,
    pan: o.pan ?? 0,
    r: o.rate ?? 1,
    when: o.when,
  });
}
