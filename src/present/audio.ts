/**
 * Audio facade. A sample bank (public/sfx, see sfx-manifest.ts) plays through a sample engine
 * with random variation, voice limits and a convolution-reverb send; live synthesis is the
 * fallback and also drives the music. The mix (sfx-mix.ts) has a glue compressor and limiter,
 * music ducking and a low-pass that muffles the machine when the camera looks away from it.
 * Channels: master, sfx, music, ambience (volumes come from Settings).
 *
 * Presentation calls the semantic methods below (flipper, pop, combo, jackpot, ...); the sound
 * modules behind them are sfx-machine.ts (the table), sfx-reward.ts (chimes, coins, stingers)
 * and sfx-cell.ts (phone, ATM, vending, doors).
 */
import { SfxEngine, prefetchBank, type PlayOpts } from './sfx-engine';
import type { Core } from './sfx-core';
import type { SfxName } from './sfx-manifest';
import { Mix, type Channel, type Focus, type Volumes } from './sfx-mix';
import { CellSounds } from './sfx-cell';
import { MachineSounds } from './sfx-machine';
import { RewardSounds, type BannerKind } from './sfx-reward';
import { StorySounds, type EndingSound } from './sfx-story';
import { Synth, runFallback, type NoiseOpts, type ToneOpts } from './sfx-synth';
import { controlCue, type UiCue } from './sfx-controls';

export type { Channel } from './sfx-mix';
export type { BannerKind } from './sfx-reward';
export type { EndingSound } from './sfx-story';
export type { UiCue } from './sfx-controls';

const UI_CUES: Record<UiCue, SfxName> = {
  move: 'uiMove',
  select: 'uiSelect',
  back: 'uiBack',
  open: 'uiOpen',
  close: 'uiClose',
  error: 'uiError',
  buy: 'uiBuy',
  sell: 'uiSell',
  reward: 'uiReward',
  toggleOn: 'uiToggleOn',
  toggleOff: 'uiToggleOff',
  deposit: 'uiDeposit',
  tick: 'uiTick',
  hover: 'uiHover',
  slider: 'uiSlider',
  lock: 'uiLock',
  unlock: 'uiUnlock',
  success: 'uiSuccess',
  warning: 'uiWarning',
  notify: 'uiNotify',
  pause: 'uiPause',
  resume: 'uiResume',
};

/** Camera modes (scene.ts CamMode) -> what the player is listening to. */
function focusFor(cam: string): Focus {
  switch (cam) {
    case 'play':
    case 'top':
    case 'tray':
      return 'table';
    case 'seated':
      return 'seated';
    case 'title':
      return 'title';
    case 'fall':
      return 'fall';
    default:
      return 'away';
  }
}

interface Rig {
  mix: Mix;
  synth: Synth;
  engine: SfxEngine;
  machine: MachineSounds;
  reward: RewardSounds;
  cell: CellSounds;
  story: StorySounds;
}

/** Gestures that may start (or restart) the audio context; iOS needs touchend or click. */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

const CHANNELS: Channel[] = ['master', 'sfx', 'music', 'ambience'];

/** A UI sound that started this recently can still be cancelled by the control's own sound. */
const SUPERSEDE_WINDOW = 0.1;
/** How long a ring or an alarm stays visible to the screen (seconds). */
const PULSE_SECONDS = 1.2;

export class Audio {
  ctx: BaseAudioContext | null = null;
  volumes: Volumes = { master: 0.8, sfx: 0.9, music: 0.6, ambience: 0.7 };
  private rig: Rig | null = null;
  /** Volumes as last applied (a change plays that channel's preview). */
  private applied: Volumes | null = null;
  private previewAt: Record<Channel, number> = { master: 0, sfx: 0, music: 0, ambience: 0 };
  private clickTimer = 0;
  private hovered: HTMLButtonElement | null = null;
  /** When the phone last rang and the ATM last chirped (for on-screen pulses). */
  private ringAt = -1e9;
  private alarmAt = -1e9;
  private recentUi: { name: SfxName; at: number }[] = [];
  private lastUiCue: { cue: UiCue; at: number } = { cue: 'select', at: -1 };
  private keySemis = 0;
  /** True once the context was made by unlock() (not an offline one for level checks). */
  private live = false;
  private suspendedByHide = false;

  constructor() {
    if (typeof window === 'undefined') return;
    prefetchBank(defaultBank());
    for (const g of GESTURES) window.addEventListener(g, this.onGesture, { capture: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    // One listener for every control: the cue comes from the control itself (sfx-controls.ts).
    document.addEventListener('click', this.onPress, { capture: true });
    document.addEventListener('pointerdown', this.onDisabledPress, { capture: true });
    document.addEventListener('pointerover', this.onHover, { capture: true });
  }

  /** A mouse moving onto a new enabled button: a faint tick (touch has no hover). */
  private readonly onHover = (e: Event): void => {
    const b = buttonOf(e.target);
    if (!b || b === this.hovered) return;
    this.hovered = b.disabled ? null : b;
    if (this.hovered && (e as PointerEvent).pointerType === 'mouse') this.ui('hover');
  };

  /** A press on an enabled button: its cue, one tick late so the control's own sound replaces it. */
  private readonly onPress = (e: Event): void => {
    const b = buttonOf(e.target);
    if (b && !b.disabled) this.deferCue(controlCue(b));
  };

  /** Disabled buttons swallow clicks, so the buzz is taken from the press itself. */
  private readonly onDisabledPress = (e: Event): void => {
    const b = buttonOf(e.target);
    if (b?.disabled) this.ui('error');
  };

  // ------------------------------------------------------------------ lifecycle

  private readonly onGesture = (): void => {
    if (this.ctx && (this.ctx as AudioContext).state === 'running') return;
    this.unlock();
  };

  /** A hidden tab makes no sound: the beds and coil oscillators would otherwise run on. */
  private readonly onVisibility = (): void => {
    const c = this.ctx as AudioContext | null;
    if (!c || !this.live) return;
    if (document.hidden) {
      if (c.state === 'running') {
        this.suspendedByHide = true;
        void c.suspend().catch(() => {});
      }
    } else if (this.suspendedByHide) {
      this.suspendedByHide = false;
      void c.resume().catch(() => {});
    }
  };

  /** Must be called from a user gesture (it also runs on any gesture by itself). */
  unlock(): void {
    if (this.ctx) {
      const c = this.ctx as AudioContext;
      // Safari reports 'interrupted' after a call or a lock screen; resume() brings it back.
      if (this.live && !document.hidden && c.state !== 'running' && c.state !== 'closed')
        void c.resume().catch(() => {});
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.live = true;
    this.attach(new AC());
  }

  /**
   * Build the mix and engine on any context (a real one from unlock(), or an OfflineAudioContext
   * for level checks). `bank` is the URL of the sfx folder; null skips loading.
   */
  attach(ctx: BaseAudioContext, bank: string | null = defaultBank()): void {
    this.ctx = ctx;
    const mix = new Mix(ctx);
    mix.setVolumes(this.volumes);
    const synth = new Synth(ctx, mix);
    const engine = new SfxEngine(ctx, mix);
    engine.fallback = (name, o) => runFallback(synth, name, o);
    const core: Core = {
      ctx,
      mix,
      synth,
      get now() {
        return mix.now;
      },
      play: (name, o) => engine.play(name, o),
      at: (delay, name, o) => engine.play(name, { ...o, when: mix.now + delay }),
      pan: (x) => this.pan(x),
      stop: (name) => engine.stop(name),
    };
    const reward = new RewardSounds(core);
    const cell = new CellSounds(core);
    this.rig = {
      mix,
      synth,
      engine,
      machine: new MachineSounds(core),
      reward,
      cell,
      story: new StorySounds(core, reward, cell),
    };
    reward.setKey(this.keySemis);
    if (bank !== null) void engine.load(bank);
  }

  /**
   * Push the Settings volumes to the mix. A channel that moved plays a short sample of itself, so
   * the stepper buttons in Settings can be judged by ear.
   */
  applyVolumes(): void {
    const prev = this.applied;
    this.applied = { ...this.volumes };
    this.rig?.mix.setVolumes(this.volumes);
    if (!prev || !this.rig) return;
    for (const ch of CHANNELS) if (Math.abs(prev[ch] - this.volumes[ch]) > 0.001) this.preview(ch);
  }

  private preview(ch: Channel): void {
    const r = this.rig;
    if (!r) return;
    // The stepper's own tick would double the channel's sample: the sample is the feedback.
    this.cancelClick();
    const t = r.mix.now;
    if (t - this.previewAt[ch] < 0.12) return;
    this.previewAt[ch] = t;
    // Everything previews on its own crisp bus so the Settings screen's muffle does not colour it.
    switch (ch) {
      case 'master':
        r.reward.note(4, { gain: 0.7, bus: 'sfx' });
        r.reward.note(7, { gain: 0.5, delay: 0.07, bus: 'sfx' });
        break;
      case 'sfx':
        r.engine.play('flipUp', { bus: 'sfx', gain: 1.1 });
        r.reward.coin(2, { bus: 'sfx', delay: 0.09 });
        break;
      case 'music':
        r.engine.play('mKick', { bus: 'music' });
        r.engine.play('mSnare', { bus: 'music', when: t + 0.17 });
        r.engine.play('mHat', { bus: 'music', when: t + 0.17 });
        break;
      case 'ambience':
        r.engine.play('drip', { variant: 0, gain: 1.4 });
        r.engine.play('pipe', { variant: 0, when: t + 0.35 });
        break;
    }
  }

  /** Transpose the reward bells (Sentence rounds move the music up a semitone). */
  setKey(semitones: number): void {
    if (semitones === this.keySemis) return;
    this.keySemis = semitones;
    this.rig?.reward.setKey(semitones);
  }

  get now(): number {
    return this.rig?.mix.now ?? 0;
  }

  /** Dev/test access to the pieces. */
  get parts(): Rig | null {
    return this.rig;
  }

  /** Sample bank status for dev checks. */
  stats(): { loaded: number; failed: string[]; focus: Focus | null } {
    const e = this.rig?.engine;
    return {
      loaded: e?.loadedCount ?? 0,
      failed: e ? [...e.failed] : [],
      focus: this.rig?.mix.currentFocus ?? null,
    };
  }

  /** Resolves when every file is decoded (or failed). */
  async ready(): Promise<void> {
    await this.rig?.engine.load(defaultBank());
  }

  /** A bus' input node, for synthesised music and beds. */
  bus(ch: Exclude<Channel, 'master'>): GainNode | null {
    const m = this.rig?.mix;
    if (!m) return null;
    return m.input(ch === 'music' ? 'music' : ch === 'ambience' ? 'amb' : 'sfx').dry;
  }

  /** Where the camera is looking: muffles and wets the machine when it looks away. */
  setView(camMode: string): void {
    this.rig?.mix.setFocus(focusFor(camMode));
  }

  /**
   * Call every frame. `ballLive`: a ball is on the table (the groove steps back under it). Also
   * cuts the reverb's input once its last tail has decayed.
   */
  frame(ballLive: boolean): void {
    this.rig?.mix.setBallLive(ballLive);
    this.rig?.mix.tick();
  }

  /** Something wet is sounding for the next moment (the groove calls this while it plays). */
  keepWet(): void {
    this.rig?.mix.wetUntil(this.now + 0.5);
  }

  /** Dip the music under a stinger. */
  duck(depth = 0.4, hold = 0.5, release = 0.9): void {
    this.rig?.mix.duck(depth, hold, release);
  }

  // ------------------------------------------------------------------ generic playback

  /** Play a bank sound by name (falls back to synthesis if its file is missing). */
  play(name: SfxName, o?: PlayOpts): boolean {
    return this.rig?.engine.play(name, o) ?? false;
  }

  /** Play after `delay` seconds on the audio clock. */
  at(delay: number, name: SfxName, o?: PlayOpts): boolean {
    return this.rig?.engine.play(name, { ...o, when: this.now + delay }) ?? false;
  }

  stop(name?: SfxName): void {
    this.rig?.engine.stop(name);
  }

  /** Table x in units (0..18.4) -> stereo pan. */
  pan(x: number): number {
    return (x / 18.4 - 0.5) * 1.4;
  }

  /** Short filtered noise burst (synthesis primitive; also used by the music). */
  noise(o: NoiseOpts): void {
    this.rig?.synth.noise(o);
  }

  /** Oscillator blip with a pitch envelope. */
  tone(o: ToneOpts): void {
    this.rig?.synth.tone(o);
  }

  // ------------------------------------------------------------------ menus

  /**
   * A menu cue. The same cue twice within a few ms (a keyboard handler and the delegated one)
   * plays once. The money cues get a little of the machine's metal on top.
   */
  ui(cue: UiCue): void {
    this.cancelClick();
    const r = this.rig;
    if (!r) return;
    const now = r.mix.now;
    if (this.lastUiCue.cue === cue && now - this.lastUiCue.at < 0.025) return;
    this.lastUiCue = { cue, at: now };
    this.uiPlay(UI_CUES[cue]);
    // Layers sit on the crisp bus: a menu reward must not be muffled with the table.
    const o = { bus: 'sfx' as const };
    if (cue === 'buy') this.uiPlay('coin', { ...o, delay: 0.1, gain: 0.7, rate: 1.1 });
    else if (cue === 'sell') this.uiPlay('coinTray', { ...o, delay: 0.08, gain: 1.4 });
    else if (cue === 'deposit') this.uiPlay('cashCount', { delay: 0.1, gain: 0.8 });
    else if (cue === 'reward') r.reward.note(4, { gain: 0.7, delay: 0.08, ...o });
    else if (cue === 'success') r.reward.note(2, { gain: 0.5, delay: 0.05, ...o });
  }

  private uiPlay(
    name: SfxName,
    o: { delay?: number; gain?: number; rate?: number; bus?: 'sfx' } = {},
  ): void {
    const r = this.rig;
    if (!r) return;
    const at = r.mix.now + (o.delay ?? 0);
    r.engine.play(name, { when: at, gain: o.gain, rate: o.rate, bus: o.bus });
    this.recentUi.push({ name, at });
    if (this.recentUi.length > 6) this.recentUi.shift();
  }

  /**
   * A press's cue. It waits one tick so the control's own sound (a purchase, a keypad beep),
   * which fires right after it, replaces it instead of stacking on top.
   */
  private deferCue(cue: UiCue): void {
    if (this.clickTimer || typeof window === 'undefined') return;
    this.clickTimer = window.setTimeout(() => {
      this.clickTimer = 0;
      this.ui(cue);
    }, 0);
  }

  /** The generic button click (kept for callers that name no control). */
  atmBeep(): void {
    this.deferCue('select');
  }

  private cancelClick(): void {
    if (!this.clickTimer) return;
    window.clearTimeout(this.clickTimer);
    this.clickTimer = 0;
  }

  /**
   * A control's own multi-part sound (vend, deposit, cash-out) is starting: cut the cue sounds
   * a cue handler started a moment ago, so the two never stack.
   */
  private takeOver(): void {
    this.cancelClick();
    const r = this.rig;
    if (!r) return;
    const now = r.mix.now;
    for (const u of this.recentUi) if (now - u.at < SUPERSEDE_WINDOW) r.engine.stop(u.name);
    this.recentUi.length = 0;
  }

  // ------------------------------------------------------------------ the machine

  flipper(id: string, up: boolean, x: number): void {
    this.rig?.machine.flipper(id, up, x);
  }
  pop(x: number): void {
    this.rig?.machine.pop(x);
  }
  sling(x: number): void {
    this.rig?.machine.sling(x);
  }
  drop(x: number, index = 0): void {
    this.rig?.machine.drop(x, index);
  }
  dropReset(): void {
    this.rig?.machine.dropReset();
  }
  spin(halves: number, speed: number): void {
    this.rig?.machine.spin(halves, speed);
  }
  lane(x: number): void {
    this.rig?.machine.lane(x);
  }
  hit(mat: string, speed: number, x: number): void {
    this.rig?.machine.hit(mat, speed, x);
  }
  flipperHit(speed: number, x: number): void {
    this.rig?.machine.flipperHit(speed, x);
  }
  launch(strength: number): void {
    this.rig?.machine.launch(strength);
  }
  plungerPull(p: number): void {
    this.rig?.machine.plungerPull(p);
  }
  chute(): void {
    this.rig?.machine.chute();
  }
  /** A new ball drops into the plunger lane. */
  ballFeed(): void {
    this.rig?.machine.ballFeed();
  }
  hole(): void {
    this.rig?.machine.hole();
  }
  kick(): void {
    this.rig?.machine.kick();
  }
  /** The replay knocker (a big wooden whack). */
  knocker(gain = 1): void {
    this.rig?.machine.knocker(gain);
  }
  drain(): void {
    this.rig?.machine.drain();
  }
  tilt(): void {
    this.rig?.machine.tilt();
  }
  warn(): void {
    this.rig?.machine.warn();
  }
  /** Ball roll rumble and ramp rattle: call each frame with the fastest field ball's speed. */
  roll(speed: number, onRamp: boolean): void {
    this.rig?.machine.roll(speed, onRamp);
  }
  /** Let go of every flipper coil's hum. */
  releaseCoils(): void {
    this.rig?.machine.releaseCoils();
  }

  // ------------------------------------------------------------------ rewards (juice hooks)

  /** Coin clink; pitch rises with combo level (0..8). */
  coin(level = 0): void {
    this.rig?.reward.coin(level);
  }
  /** A payout: coin, plus a bell that rides the combo ladder when it is big. */
  score(amount: number, combo = 0, big = false): void {
    this.rig?.reward.score(amount, combo, big);
  }
  /** The chain is at `n` links: an escalating stinger. */
  combo(n: number): void {
    this.rig?.reward.combo(n);
  }
  /** level 1 = jackpot, 2 = the super one. */
  jackpot(level = 1): void {
    this.rig?.reward.jackpot(level);
  }
  payday(sup = false): void {
    this.rig?.reward.payday(sup);
  }
  riot(on: boolean): void {
    this.rig?.reward.riot(on);
  }
  /** Ball save. */
  save(): void {
    this.rig?.reward.save();
  }
  extraBall(): void {
    this.rig?.reward.extraBall();
  }
  skillShot(sup = false): void {
    this.rig?.reward.skillShot(sup);
  }
  jobComplete(): void {
    this.rig?.reward.jobComplete();
  }
  levelUp(): void {
    this.rig?.reward.levelUp();
  }
  deadlinePaid(): void {
    this.rig?.reward.deadlinePaid();
  }
  /** A new unlock or rap sheet entry. */
  unlocked(): void {
    this.rig?.reward.unlocked();
  }
  /** The neighbor's secret shot. */
  tunnel(): void {
    this.rig?.reward.tunnel();
  }
  /** Bonus count-up tick i of total. */
  countTick(i: number, total: number): void {
    this.rig?.reward.countTick(i, total);
  }
  bonusMult(mult: number): void {
    this.rig?.reward.bonusMult(mult);
  }
  /** A charm's active ability fired. */
  active(): void {
    this.rig?.reward.active();
  }
  /** Lockup ball locked. */
  lock(n = 1): void {
    this.rig?.reward.lock(n);
  }
  spark(): void {
    this.rig?.reward.spark();
  }
  ballOver(tilted = false): void {
    this.rig?.reward.ballOver(tilted);
  }
  /** The Warden speaks (dark beat). */
  warden(): void {
    this.rig?.reward.warden();
  }
  /** DMD banner figure by kind. */
  banner(kind: BannerKind = 'info', priority = 3): void {
    this.rig?.reward.banner(kind, priority);
  }
  /** DMD callout by priority. */
  callout(priority: number): void {
    this.rig?.reward.callout(priority);
  }
  /** One bar of the chime unit: 0 low, 1 mid, 2 high. */
  chime(tier: 0 | 1 | 2): void {
    this.rig?.reward.chime(tier);
  }
  /** A bell at pentatonic ladder step 0..8. */
  note(step: number): void {
    this.rig?.reward.note(step);
  }
  /** JAILBREAK on the table, by phase (start, shot, posts, lights, glass, escaped, failed). */
  jailbreak(phase: string, n = 0): void {
    this.rig?.story.jailbreak(phase, n);
  }

  /** The hurry-up lit (on) or ended; `paid` when the Chute made it in time. */
  hurry(on: boolean, paid = false): void {
    this.rig?.reward.hurry(on, paid);
  }
  /** Call every frame with the hurry-up's seconds left (0 = not running): a pulse that speeds up. */
  hurryTick(left: number): void {
    this.rig?.reward.hurryTick(left);
  }

  // ------------------------------------------------------------------ story beats

  /** A new run: the cell door slams and locks. */
  runStart(): void {
    this.rig?.story.runStart();
  }
  /** The ATM chirps: a deadline is due. */
  atmAlarm(): void {
    this.alarmAt = this.now;
    this.rig?.story.atmAlarm();
  }
  /** True for a moment after the ATM chirps: the screen can pulse with it. */
  alarming(): boolean {
    return this.now - this.alarmAt < PULSE_SECONDS;
  }
  /** An ending's title card. */
  titleCard(): void {
    this.rig?.story.titleCard();
  }
  /** An ending's soundscape (call when it starts; its cues fire the stings themselves). */
  ending(kind: EndingSound): void {
    this.rig?.story.ending(kind);
  }

  // ------------------------------------------------------------------ the cell

  knock(n = 3): void {
    this.rig?.cell.knock(n);
  }
  clang(): void {
    this.rig?.cell.clang();
  }
  glassCrack(): void {
    this.rig?.cell.glassCrack();
  }
  /** A coin landing in the tray. */
  clatter(): void {
    this.rig?.cell.clatter();
  }
  creak(): void {
    this.rig?.cell.creak();
  }
  trapdoor(): void {
    this.rig?.cell.trapdoor();
  }
  phoneRing(): void {
    this.ringAt = this.now;
    this.rig?.cell.phoneRing();
  }
  /** True for a moment after the phone rings: the handset can pulse with it. */
  ringing(): boolean {
    return this.now - this.ringAt < PULSE_SECONDS;
  }
  /** The handset is lifted: stops the ringing. */
  phonePick(): void {
    this.takeOver();
    this.rig?.cell.phonePick();
  }
  atmKey(i?: number): void {
    this.takeOver();
    this.rig?.cell.atmKey(i);
  }
  atmOk(): void {
    this.takeOver();
    this.rig?.cell.atmOk();
  }
  atmNo(): void {
    this.takeOver();
    this.rig?.cell.atmNo();
  }
  /** Coins into the ATM. */
  deposit(): void {
    this.takeOver();
    this.rig?.cell.deposit();
  }
  /** A loan comes out of the ATM. */
  cashOut(): void {
    this.takeOver();
    this.rig?.cell.cashOut();
  }
  /** A purchase at the vending cabinet. */
  vend(): void {
    this.takeOver();
    this.rig?.cell.vend();
  }
  doorClang(gain = 1): void {
    this.rig?.cell.doorClang(gain);
  }
  doorLock(): void {
    this.rig?.cell.doorLock();
  }
  chain(): void {
    this.rig?.cell.chain();
  }
  wallDown(): void {
    this.rig?.cell.wallDown();
  }
  coinSpill(): void {
    this.rig?.cell.coinSpill();
  }
}

/** The button under a press, if any (the press may land on its label). */
function buttonOf(t: EventTarget | null): HTMLButtonElement | null {
  return t instanceof Element ? t.closest('button') : null;
}

function defaultBank(): string {
  return `${import.meta.env.BASE_URL}sfx/`;
}

export const audio = new Audio();

if (import.meta.env.DEV) (globalThis as unknown as { __audio: Audio }).__audio = audio;
