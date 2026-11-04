/**
 * The pinball machine itself: flipper solenoids and coil hum, bumpers, targets, spinner,
 * rubber/metal/wood contacts, the plunger, kickers, the knocker, drain and tilt, plus the
 * continuous ball roll and wire-ramp rattle. Everything maps to sample-bank sounds (with live
 * synthesis as the fallback inside the engine).
 */
import type { Core } from './sfx-core';
import { TABLE } from '../content/table';

interface Hum {
  gain: GainNode;
  oscs: OscillatorNode[];
  /** Every node of the coil's chain, disconnected once its oscillators have stopped. */
  nodes: AudioNode[];
  /** Audio-clock time the coil was released (0 while held). */
  offAt: number;
}

/** Seconds of silence after which a coil's oscillators or the roll bed are torn down. */
const IDLE_TEARDOWN = 4;

export class MachineSounds {
  private readonly hum = new Map<string, Hum>();
  private humming = false;
  private spinLast = -1;
  private plungerNotch = -1;
  private rollAt = -1;
  private rollV = -1;
  private rollRamp = false;
  private rollIdleAt = -1;
  private rollNodes: {
    rumbleLP: BiquadFilterNode;
    rumbleGain: GainNode;
    rattleBP: BiquadFilterNode;
    rattleGain: GainNode;
    rampGain: GainNode;
    rampBP: BiquadFilterNode;
    sources: AudioScheduledSourceNode[];
    chain: AudioNode[];
    out: GainNode;
  } | null = null;

  constructor(private readonly a: Core) {}

  // ------------------------------------------------------------------ flippers

  flipper(id: string, up: boolean, x: number): void {
    const a = this.a;
    const pan = a.pan(x);
    if (up) {
      a.play('flipUp', { pan });
      this.setHum(id, true, pan);
    } else {
      a.play('flipDown', { pan });
      this.setHum(id, false, pan);
    }
  }

  /**
   * The held coil's hum. A real coil buzzes at twice the mains frequency; a bare 60/120 Hz sine
   * is inaudible on a laptop speaker, so the voice is a 120 Hz saw (its 240, 360, 480 Hz
   * harmonics are what carry) with the fundamental trimmed and a slow beating partner. One voice
   * per flipper, faded in and out.
   */
  private setHum(id: string, on: boolean, pan: number): void {
    const { ctx, mix } = this.a;
    let h = this.hum.get(id);
    if (!h) {
      if (!on) return;
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 120;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 120.9;
      const o3 = ctx.createOscillator();
      o3.type = 'square';
      o3.frequency.value = 60;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 110;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 0.8;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.6;
      const o3g = ctx.createGain();
      o3g.gain.value = 0.25;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const p = ctx.createStereoPanner();
      p.pan.value = pan * 0.6;
      o1.connect(hp);
      o2.connect(o2g).connect(hp);
      o3.connect(o3g).connect(hp);
      hp.connect(lp).connect(gain).connect(p).connect(mix.input('table').dry);
      for (const o of [o1, o2, o3]) o.start();
      h = { gain, oscs: [o1, o2, o3], nodes: [o2g, o3g, hp, lp, gain, p], offAt: 0 };
      this.hum.set(id, h);
    }
    const t = mix.now;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setTargetAtTime(on ? 0.02 : 0, t, on ? 0.04 : 0.025);
    h.offAt = on ? 0 : t;
    if (on) this.humming = true;
  }

  /** Silence every coil (ball over, pause). */
  releaseCoils(): void {
    if (!this.humming) return;
    this.humming = false;
    const t = this.a.mix.now;
    for (const h of this.hum.values()) {
      h.gain.gain.cancelScheduledValues(t);
      h.gain.gain.setTargetAtTime(0, t, 0.02);
      h.offAt = t;
    }
  }

  /** Stop the oscillators of coils that have been quiet a while (they are rebuilt on demand). */
  private sweepIdle(t: number): void {
    for (const [id, h] of this.hum) {
      if (h.offAt <= 0 || t - h.offAt < IDLE_TEARDOWN) continue;
      // The chain leaves the table bus once its oscillators have ended: nothing is left wired.
      h.oscs[0].onended = () => {
        for (const n of h.nodes) n.disconnect();
        for (const o of h.oscs) o.disconnect();
      };
      for (const o of h.oscs) o.stop(t);
      this.hum.delete(id);
    }
  }

  // ------------------------------------------------------------------ bumpers, targets

  pop(x: number): void {
    this.a.play('pop', { pan: this.a.pan(x) });
  }

  sling(x: number): void {
    this.a.play('sling', { pan: this.a.pan(x) });
  }

  /** Drop target `index` of its bank: each one a little higher than the last. */
  drop(x: number, index = 0): void {
    // A target knocked down by a charm reports no position: use the bank's own.
    const px = x > 0.01 ? x : dropX(index);
    this.a.play('drop', { pan: this.a.pan(px), rate: 1 + Math.min(4, index) * 0.05 });
  }

  dropReset(): void {
    this.a.play('dropReset');
  }

  spin(halves: number, speed: number): void {
    const a = this.a;
    if (a.now - this.spinLast < 0.02) return;
    this.spinLast = a.now;
    const r = 0.9 + Math.min(1, speed / 60) * 0.35;
    for (let i = 0; i < Math.min(halves, 3); i++)
      a.at(i * 0.026, 'spin', { pan: 0.8, rate: r, gain: 1 - i * 0.25 });
  }

  lane(x: number): void {
    this.a.play('lane', { pan: this.a.pan(x) });
  }

  // ------------------------------------------------------------------ contacts

  hit(mat: string, speed: number, x: number): void {
    const v = Math.min(1, speed / 40);
    if (v < 0.05) return;
    const pan = this.a.pan(x);
    const gain = 0.25 + 0.95 * v ** 0.8;
    const rate = 0.92 + v * 0.2;
    switch (mat) {
      case 'rubber':
      case 'post':
        this.a.play('rubber', { pan, gain, rate });
        break;
      case 'metal':
        this.a.play('metal', { pan, gain, rate });
        break;
      case 'ball':
        this.a.play('ballBall', { pan, gain, rate });
        break;
      case 'plastic':
        this.a.play('plastic', { pan, gain, rate });
        break;
      case 'wood':
        this.a.play('wood', { pan, gain, rate });
        break;
      default:
        // sling, pop and drop contacts have their own sounds
        break;
    }
  }

  flipperHit(speed: number, x: number): void {
    const v = Math.min(1, speed / 40);
    this.a.play('flipHit', { pan: this.a.pan(x), gain: 0.3 + 0.9 * v, rate: 0.9 + v * 0.3 });
  }

  // ------------------------------------------------------------------ plunger and kickers

  launch(strength: number): void {
    const s = Math.max(0, Math.min(1, strength));
    this.a.play('launch', { pan: 0.8, gain: 0.55 + 0.6 * s, rate: 0.92 + 0.2 * s });
    this.plungerNotch = -1;
  }

  /** The plunger spring ratcheting as it is pulled back (call each frame with the pull 0..1). */
  plungerPull(p: number): void {
    if (p <= 0.02) {
      this.plungerNotch = -1;
      return;
    }
    const notch = Math.floor(p * 14);
    if (notch === this.plungerNotch) return;
    const rising = notch > this.plungerNotch;
    this.plungerNotch = notch;
    if (rising) this.a.play('plungerTick', { pan: 0.8, rate: 0.85 + p * 0.5, gain: 0.7 + p * 0.5 });
  }

  chute(): void {
    this.a.play('chute', { pan: -0.4 });
  }

  /** A new ball drops into the shooter lane: the feed solenoid's thunk, then the roll to rest. */
  ballFeed(): void {
    const a = this.a;
    a.at(0, 'kick', { gain: 0.4, rate: 0.78, pan: 0.8 });
    a.at(0.06, 'chute', { gain: 0.55, rate: 1.15, pan: 0.8 });
  }

  hole(): void {
    this.a.play('hole');
  }

  kick(): void {
    this.a.play('kick');
  }

  lock(): void {
    this.a.play('lock');
  }

  /** The replay knocker: a big wooden whack. */
  knocker(gain = 1): void {
    this.a.play('knocker', { gain });
  }

  drain(): void {
    this.a.play('drain');
  }

  tilt(): void {
    this.a.play('tilt');
  }

  warn(): void {
    this.a.play('warn');
  }

  // ------------------------------------------------------------------ continuous

  /** Ball roll rumble by speed, with a wire-ramp rattle: call every frame. */
  roll(speed: number, onRamp: boolean): void {
    const t = this.a.mix.now;
    const v = Math.min(1, speed / 60);
    // Automation is only re-issued when something audible changed (this runs every frame).
    const same = onRamp === this.rollRamp && Math.abs(v - this.rollV) < 0.015;
    if (t - this.rollAt < (same ? 0.4 : 0.03)) return;
    this.sweepIdle(t);
    if (this.rollNodes && v === 0 && !onRamp) {
      if (this.rollIdleAt < 0) this.rollIdleAt = t;
      else if (t - this.rollIdleAt > IDLE_TEARDOWN) this.teardownRoll();
    } else this.rollIdleAt = -1;
    if (!this.rollNodes && v === 0 && !onRamp) return;
    const n = this.rollNodes ?? this.buildRoll();
    if (!n) return;
    this.rollAt = t;
    this.rollV = v;
    this.rollRamp = onRamp;
    n.rumbleGain.gain.setTargetAtTime(onRamp ? 0.02 : v * 0.135, t, 0.06);
    n.rumbleLP.frequency.setTargetAtTime(150 + v * 520, t, 0.06);
    n.rattleGain.gain.setTargetAtTime(onRamp ? 0 : v * v * v * 0.05, t, 0.05);
    n.rampGain.gain.setTargetAtTime(onRamp ? 0.15 + v * 0.1 : 0, t, 0.05);
    n.rampBP.frequency.setTargetAtTime(2000 + v * 1500, t, 0.05);
  }

  private buildRoll(): MachineSounds['rollNodes'] {
    const { ctx, mix, synth } = this.a;
    // Everything runs through one gain so the whole bed can be torn down at once.
    const out = ctx.createGain();
    out.connect(mix.input('table').dry);
    const bus = out;
    const sources: AudioScheduledSourceNode[] = [];
    const chain: AudioNode[] = [out];
    const loop = (rate: number, offset: number) => {
      const s = ctx.createBufferSource();
      s.buffer = synth.noiseBuf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(0, offset);
      sources.push(s);
      return s;
    };
    const node = <T extends AudioNode>(n: T): T => {
      chain.push(n);
      return n;
    };
    // Low rumble of the ball on the playfield.
    const rumbleLP = node(ctx.createBiquadFilter());
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 200;
    rumbleLP.Q.value = 0.9;
    const rumbleGain = node(ctx.createGain());
    rumbleGain.gain.value = 0;
    loop(0.5, 0).connect(rumbleLP).connect(rumbleGain).connect(bus);
    // Surface rattle: bright band that only shows up at speed.
    const rattleBP = node(ctx.createBiquadFilter());
    rattleBP.type = 'bandpass';
    rattleBP.frequency.value = 1150;
    rattleBP.Q.value = 1.3;
    const rattleGain = node(ctx.createGain());
    rattleGain.gain.value = 0;
    loop(1, 0.7).connect(rattleBP).connect(rattleGain).connect(bus);
    // Wire ramp: a ringing band chopped by the wire joints.
    const rampBP = node(ctx.createBiquadFilter());
    rampBP.type = 'bandpass';
    rampBP.frequency.value = 2400;
    rampBP.Q.value = 2.2;
    const am = node(ctx.createGain());
    am.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 31;
    const lfoDepth = node(ctx.createGain());
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth).connect(am.gain);
    lfo.start();
    sources.push(lfo);
    const rampGain = node(ctx.createGain());
    rampGain.gain.value = 0;
    loop(1.3, 1.1).connect(rampBP).connect(am).connect(rampGain).connect(bus);
    this.rollNodes = {
      rumbleLP,
      rumbleGain,
      rattleBP,
      rattleGain,
      rampGain,
      rampBP,
      sources,
      chain,
      out,
    };
    return this.rollNodes;
  }

  /** Stop the roll bed's loops (nothing is rolling): they are rebuilt when a ball moves again. */
  private teardownRoll(): void {
    const n = this.rollNodes;
    if (!n) return;
    // Stopped on the audio clock (an offline render schedules everything ahead of playback).
    const t = this.a.mix.now;
    // The bed leaves the table bus at once; its nodes are disconnected when the loops have ended.
    n.out.disconnect();
    const last = n.sources[n.sources.length - 1];
    last.onended = () => {
      for (const node of n.chain) node.disconnect();
    };
    for (const s of n.sources) s.stop(t);
    this.rollNodes = null;
    this.rollIdleAt = -1;
    this.rollV = -1;
  }
}

/** Table x of drop target `index` (for sounds whose event carries no position). */
function dropX(index: number): number {
  const t = TABLE.dropBanks[0]?.targets[index];
  return t ? (t.a[0] + t.b[0]) / 2 : 13;
}
