/**
 * Synthesised audio (no files): machine SFX, cell ambience and adaptive music all built from
 * oscillators, filtered noise and envelopes. Channels: master, sfx, music, voice.
 */

export type Channel = 'master' | 'sfx' | 'music' | 'ambience';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses: Record<Exclude<Channel, 'master'>, GainNode> = {} as never;
  private noiseBuf!: AudioBuffer;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private coilHum: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();
  private spinnerLast = 0;
  volumes: Record<Channel, number> = { master: 0.8, sfx: 0.9, music: 0.6, ambience: 0.7 };

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    for (const ch of ['sfx', 'music', 'ambience'] as const) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[ch] = g;
    }
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Continuous ball-roll noise; gain follows ball speed.
    const roll = ctx.createBufferSource();
    roll.buffer = this.noiseBuf;
    roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 300;
    this.rollFilter.Q.value = 0.7;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.buses.sfx);
    roll.start();
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.music.gain.value = this.volumes.music;
    this.buses.ambience.gain.value = this.volumes.ambience;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  bus(ch: Exclude<Channel, 'master'>): GainNode | null {
    return this.ctx ? this.buses[ch] : null;
  }

  // ------------------------------------------------------------------ primitives

  /** Short filtered noise burst. */
  noise(opts: {
    dur: number;
    freq: number;
    q?: number;
    type?: BiquadFilterType;
    gain: number;
    attack?: number;
    pan?: number;
    bus?: 'sfx' | 'music' | 'ambience';
    when?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (opts.when ?? ctx.currentTime) + 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    let node: AudioNode = src.connect(f).connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.buses[opts.bus ?? 'sfx']);
    src.start(t, Math.random() * 1.5);
    src.stop(t + opts.dur + 0.05);
  }

  /** Oscillator blip with pitch envelope. */
  tone(opts: {
    type?: OscillatorType;
    f0: number;
    f1?: number;
    dur: number;
    gain: number;
    attack?: number;
    pan?: number;
    bus?: 'sfx' | 'music' | 'ambience';
    when?: number;
    detune?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (opts.when ?? ctx.currentTime) + 0.001;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1 !== undefined)
      o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t + opts.dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    let node: AudioNode = o.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.buses[opts.bus ?? 'sfx']);
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  // ------------------------------------------------------------------ machine sounds

  /** x in table units (0..18.4) -> stereo pan. */
  pan(x: number): number {
    return (x / 18.4 - 0.5) * 1.4;
  }

  flipper(id: string, up: boolean, x: number): void {
    if (!this.ctx) return;
    const pan = this.pan(x);
    if (up) {
      // Solenoid clack + coil hum while held.
      this.noise({ dur: 0.07, freq: 1800, q: 0.8, gain: 0.55, pan });
      this.tone({ type: 'square', f0: 140, f1: 60, dur: 0.06, gain: 0.25, pan });
      if (!this.coilHum.has(id)) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 60;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.025, this.now + 0.05);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 400;
        o.connect(f).connect(g).connect(this.buses.sfx);
        o.start();
        this.coilHum.set(id, { osc: o, gain: g });
      }
    } else {
      this.noise({ dur: 0.05, freq: 900, q: 1.2, gain: 0.25, pan });
      const h = this.coilHum.get(id);
      if (h) {
        h.gain.gain.cancelScheduledValues(this.now);
        h.gain.gain.setTargetAtTime(0, this.now, 0.02);
        h.osc.stop(this.now + 0.2);
        this.coilHum.delete(id);
      }
    }
  }

  pop(x: number): void {
    const pan = this.pan(x);
    this.tone({ type: 'sine', f0: 160, f1: 55, dur: 0.18, gain: 0.7, pan });
    this.noise({ dur: 0.08, freq: 700, q: 1, gain: 0.5, pan });
  }

  sling(x: number): void {
    const pan = this.pan(x);
    this.noise({ dur: 0.06, freq: 2600, q: 1.5, gain: 0.55, pan });
    this.tone({ type: 'triangle', f0: 320, f1: 90, dur: 0.08, gain: 0.3, pan });
  }

  drop(x: number): void {
    const pan = this.pan(x);
    this.noise({ dur: 0.12, freq: 1200, q: 3, gain: 0.5, pan });
    this.tone({ type: 'square', f0: 220, f1: 110, dur: 0.1, gain: 0.15, pan });
  }

  dropReset(): void {
    for (let i = 0; i < 3; i++)
      this.noise({ dur: 0.08, freq: 1500, q: 3, gain: 0.35, when: this.now + i * 0.03 });
  }

  spin(halves: number, speed: number): void {
    if (!this.ctx) return;
    if (this.now - this.spinnerLast < 0.02) return;
    this.spinnerLast = this.now;
    for (let i = 0; i < Math.min(halves, 3); i++)
      this.noise({
        dur: 0.03,
        freq: 2500 + speed * 40,
        q: 6,
        gain: 0.25,
        when: this.now + i * 0.025,
        pan: 0.8,
      });
  }

  hit(mat: string, speed: number, x: number): void {
    const v = Math.min(1, speed / 40);
    if (v < 0.05) return;
    const pan = this.pan(x);
    if (mat === 'rubber' || mat === 'post' || mat === 'sling')
      this.noise({ dur: 0.05, freq: 500, q: 1, gain: 0.35 * v, pan });
    else if (mat === 'metal' || mat === 'ball')
      this.tone({
        type: 'triangle',
        f0: 1800 + Math.random() * 400,
        f1: 900,
        dur: 0.07,
        gain: 0.25 * v,
        pan,
      });
    else this.noise({ dur: 0.07, freq: 300, q: 0.9, gain: 0.45 * v, pan });
  }

  flipperHit(speed: number, x: number): void {
    const v = Math.min(1, speed / 40);
    this.noise({ dur: 0.05, freq: 400, q: 1, gain: 0.4 * v, pan: this.pan(x) });
  }

  launch(strength: number): void {
    this.noise({ dur: 0.25, freq: 600 + strength * 600, q: 2, gain: 0.5, pan: 0.8 });
    this.tone({ type: 'sine', f0: 90, f1: 40, dur: 0.15, gain: 0.4, pan: 0.8 });
  }

  plungerPull(p: number): void {
    if (Math.random() < 0.15)
      this.noise({ dur: 0.02, freq: 3000 + p * 2000, q: 8, gain: 0.08, pan: 0.8 });
  }

  /** Coin clink; pitch rises with combo level. */
  coin(level = 0): void {
    const f = 1900 * Math.pow(1.06, level);
    this.tone({ type: 'sine', f0: f, dur: 0.12, gain: 0.18 });
    this.tone({ type: 'sine', f0: f * 1.5, dur: 0.09, gain: 0.08, when: this.now + 0.01 });
  }

  chute(): void {
    for (let i = 0; i < 6; i++)
      this.noise({
        dur: 0.05,
        freq: 1500 + i * 200,
        q: 4,
        gain: 0.15,
        when: this.now + i * 0.06,
        pan: -0.5,
      });
  }

  hole(): void {
    this.tone({ type: 'sine', f0: 90, f1: 45, dur: 0.35, gain: 0.7 });
    this.noise({ dur: 0.2, freq: 250, q: 1, gain: 0.5 });
  }

  kick(): void {
    this.tone({ type: 'square', f0: 120, f1: 50, dur: 0.12, gain: 0.4 });
    this.noise({ dur: 0.1, freq: 1000, q: 1, gain: 0.4 });
  }

  /** The classic knocker (extra balls, specials). */
  knocker(): void {
    this.tone({ type: 'square', f0: 70, f1: 40, dur: 0.18, gain: 0.9 });
    this.noise({ dur: 0.15, freq: 180, q: 0.7, gain: 0.9 });
  }

  drain(): void {
    this.tone({ type: 'sine', f0: 200, f1: 50, dur: 0.6, gain: 0.5 });
  }

  tilt(): void {
    this.tone({ type: 'sawtooth', f0: 110, dur: 0.9, gain: 0.35 });
  }

  warn(): void {
    this.tone({ type: 'square', f0: 880, dur: 0.12, gain: 0.2 });
    this.tone({ type: 'square', f0: 660, dur: 0.12, gain: 0.2, when: this.now + 0.14 });
  }

  callout(priority: number): void {
    this.tone({
      type: 'square',
      f0: 440 + priority * 60,
      f1: 880 + priority * 80,
      dur: 0.12,
      gain: 0.12,
    });
  }

  atmBeep(): void {
    this.tone({ type: 'square', f0: 1320, dur: 0.06, gain: 0.12 });
  }

  phoneRing(): void {
    const t = this.now;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 20; k++) {
        this.tone({
          type: 'triangle',
          f0: 1100,
          dur: 0.025,
          gain: 0.25,
          when: t + i * 0.5 + k * 0.025,
          bus: 'ambience',
        });
        this.tone({
          type: 'triangle',
          f0: 1350,
          dur: 0.025,
          gain: 0.2,
          when: t + i * 0.5 + k * 0.025 + 0.012,
          bus: 'ambience',
        });
      }
    }
  }

  trapdoor(): void {
    this.tone({ type: 'square', f0: 60, f1: 30, dur: 0.6, gain: 1 });
    this.noise({ dur: 0.5, freq: 120, q: 0.6, gain: 1 });
    this.noise({
      dur: 2.5,
      freq: 400,
      q: 0.5,
      gain: 0.25,
      when: this.now + 0.2,
      attack: 0.5,
      bus: 'ambience',
    });
  }

  creak(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone({
      type: 'sawtooth',
      f0: 90 + Math.random() * 60,
      f1: 70,
      dur: 0.8,
      gain: 0.05,
      attack: 0.3,
      bus: 'ambience',
    });
  }

  /** Ball roll noise: called each frame with the fastest field ball's speed. */
  roll(speed: number, onRamp: boolean): void {
    if (!this.ctx) return;
    const v = Math.min(1, speed / 60);
    this.rollGain.gain.setTargetAtTime(v * (onRamp ? 0.25 : 0.12), this.now, 0.05);
    this.rollFilter.frequency.setTargetAtTime(
      onRamp ? 1800 + v * 1500 : 180 + v * 500,
      this.now,
      0.05,
    );
  }
}

export const audio = new Audio();
