/**
 * GameApp: owns the loop and the flow of a run. Fixed 240 Hz simulation with render
 * interpolation; input transitions are applied on the exact step they happened.
 */
import * as THREE from 'three';
import { RetroRenderer } from '../present/renderer';
import { World, type CamMode } from '../present/scene';
import { Dmd } from '../present/dmd';
import { FONT_SMALL } from '../present/dmd-font';
import { NumberPops, formatCoins } from '../present/pops';
import { audio } from '../present/audio';
import { music } from '../present/music';
import { ROOM_UNIFORMS } from '../present/retro-material';
import { paintBackglass } from '../present/backglass';
import { loadArtFonts } from '../present/art-kit';
import { LampShowPlayer } from '../present/lampshow';
import {
  LOW_FPS,
  LOW_FPS_SECS,
  capAfterSettings,
  effectivePixelHeight,
  nextQualityStep,
} from '../present/quality';
import { TABLE } from '../content/table';
import { Input, type Action } from './input';
import { UI, h } from './ui';
import { loadSave, writeSave, type SaveData } from './save';
import { lineupPanel, rapSheetPanel, type LineupChoice } from './meta-screens';
import { pausePanel, settingsPanel } from './settings-screen';
import { Hints } from './hints';
import { Notices } from './notices';
import { AUDIO_CUE } from './cues';
import { Hud, type HudLayout } from './hud';
import { setReducedMotion } from './counter';
import { btn, setKeyBindings } from './widgets';
import {
  atmPanel,
  ballEndPanel,
  buyPanel,
  cellPanel,
  deadlinePanel,
  introPanel,
  jobsPanel,
  knockPanel,
  phonePanel,
  redPhonePanel,
  runEndPanel,
  shopPanel,
  titlePanel,
  unlockToast,
  where,
} from './screens';
import type { Settings } from './settings';
import { EndingDirector, type EndingKind } from '../present/endings';
import { paintCracks } from '../present/cracks';
import {
  discover,
  endlessUnlocked,
  inmateUnlocked,
  lockedCharms,
  maxHardTime,
  checkUnlocks,
  recordBall,
  recordDeadline,
  recordKnock,
  recordRunEnd,
  recordRunStart,
} from '../rules/meta';
import type { UnlockDef } from '../content/unlocks';
import { inmateDef } from '../content/inmates';
import { NEIGHBOR_LINES } from '../content/neighbor';
import { dailySeed, dayKey, recordDaily, shareLink } from '../rules/daily';
import { BallSession, InputRecording, type BallSnapshot } from '../rules/session';
import type { GameEvent } from '../rules/types';
import { emptyInput, type SimInput } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import { Bot, type BotSkillName } from '../bot/bot';
import { attachBot, defaultSnapshot } from '../bot/autoplay';
import { AWARD_NAMES } from '../rules/table-game';
import {
  newRun,
  buyBalls,
  ballsLeft,
  nextBall,
  finishBall,
  deposit,
  endRound,
  settleDeadline,
  pickJob,
  payEarly,
  borrow,
  sentenceActive,
  roundsIn,
  choosePerk,
  acceptBargain,
  hangUp,
  answerKnock,
  lastCall,
  type BallOutcome,
  type RunKind,
  type RunState,
} from '../rules/run';
import { sentenceDef } from '../content/sentences';
import { charmDef } from '../content/charms';
import { contrabandDef } from '../content/contraband';
import { buyCharm, buyContraband, reroll, sellCharm, useContraband } from '../rules/shop';
import { WARDEN, type WardenTrigger } from '../content/dialogue';
import { Subtitles } from '../present/subtitles';
import { SaveDetector } from '../present/save-detector';
import { ASSIST, BONUS, ECONOMY, NEIGHBOR } from '../content/balance';

const STEP = 1 / 240;
const STEP_MS = 1000 / 240;
/** Last-second saves get one reaction per this many ms. */
const SAVE_COOLDOWN_MS = 4000;
/** Instant replay: seconds shown before and after the moment. */
const REPLAY_LEAD = 6;
const REPLAY_TAIL = 2.5;
/** Below this FPS for this long, drop to the lowest internal resolution. */
/** The Warden remarks on a PAYDAY worth this share of the debt, and on some center drains. */
const BIG_PAYDAY_SHARE = 0.1;
const CENTER_DRAIN_CHANCE = 0.6;

export type AppMode =
  | 'title'
  | 'intro'
  | 'phone'
  | 'jobs'
  | 'shop'
  | 'buy'
  | 'cell'
  | 'atm'
  | 'play'
  | 'tally'
  | 'ballEnd'
  | 'deadline'
  | 'fall'
  | 'rapsheet'
  | 'lineup'
  | 'knock'
  | 'ending'
  | 'meta'
  | 'replay';

export class GameApp {
  readonly renderer: RetroRenderer;
  readonly world: World;
  readonly dmd = new Dmd(4);
  readonly pops = new NumberPops();
  readonly shows = new LampShowPlayer(TABLE.lamps);
  readonly input: Input;
  readonly ui: UI;
  save: SaveData;
  private screen: AppMode = 'title';
  run: RunState | null = null;
  session: BallSession | null = null;
  /** Attract-mode session played by the bot on the title screen. */
  private attract: { session: BallSession; bot: Bot } | null = null;
  /** Bot that plays the player's balls (?bot or dev). */
  autoBot: Bot | null = null;
  private simInput: SimInput = emptyInput();
  private acc = 0;
  private last = 0;
  private wallClock = 0;
  private time = 0;
  timeScale = 1;
  /** Dev: freeze the sim; `stepRequests` advances it one step at a time. */
  paused = false;
  /** Dev: camera override while playing. */
  devCam: CamMode | null = null;
  stepRequests = 0;
  /** Dev: called after every frame (overlays). */
  onFrame: ((dt: number) => void) | null = null;
  private hitStop = 0;
  private readonly saves = new SaveDetector();
  /** Coins the tray shows (poured or piled); follows the pocket between balls. */
  private trayCoins = 0;
  private clatterAt = 0;
  readonly endings: EndingDirector;
  private ending: EndingKind | null = null;
  /** Milestones reached at the end of the last run (shown on its Rap Sheet). */
  private fresh: UnlockDef[] = [];
  private lineup: LineupChoice = { inmate: 'debtor', hardTime: 0, endless: false, seed: '' };
  /** Set at the end of a daily run that beat the day's best. */
  private dailyBest = false;
  private readonly cracks: HTMLCanvasElement;
  /** Panels pushed over the screen (pause, settings); play freezes while any is up. */
  private overlays = 0;
  private menuOpen = false;
  readonly hints: Hints;
  readonly notices: Notices;
  /** What the game is doing; a change also tells the hints which screen they are on. */
  get mode(): AppMode {
    return this.screen;
  }
  set mode(m: AppMode) {
    if (m === this.screen) return;
    this.screen = m;
    this.hints.modeChanged(m);
  }
  /** This ball's big moments (sim step), offered as an instant replay afterwards. */
  private moments: { step: number; label: string; value: number }[] = [];
  private replay: {
    session: BallSession;
    play: (step: number) => SimInput;
    end: number;
    back: () => void;
  } | null = null;
  readonly subs: Subtitles;
  private simCursor = 0;
  private gameEvents: GameEvent[] = [];
  /** Bonus count-up after a drain. */
  private tally: { k: number; bonus: number; mult: number; total: number; ticks: number } | null =
    null;
  private outcome: BallOutcome | null = null;
  /** The play HUD: also the home of the juice hooks (banner, count-up, combo slot). */
  readonly hud: Hud;
  private readonly portraitQuery = matchMedia('(max-aspect-ratio: 6/5)');
  private readonly tmpV = new THREE.Vector3();
  private fallT = 0;
  private dmdTex: THREE.CanvasTexture;
  frames = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    canvas: HTMLCanvasElement,
    hud: HTMLElement,
    uiRoot: HTMLElement,
    noticeRoot: HTMLElement,
  ) {
    this.save = loadSave();
    this.renderer = new RetroRenderer(canvas);
    this.renderer.settings.crt = this.save.settings.crt;
    this.renderer.settings.pixelHeight = this.save.settings.pixelHeight;
    this.world = new World(new Set(['outlanePosts']), this.renderer.env);
    this.world.scene.add(this.pops.group);
    this.input = new Input(document.body);
    // Toasts, tips and captions share one notice slot per layout (see notices.ts).
    this.notices = new Notices(noticeRoot, () => this.ui.open);
    this.ui = new UI(uiRoot, this.notices);
    this.ui.onCue = (c) => {
      const cue = AUDIO_CUE[c];
      if (cue) audio.ui(cue);
    };
    setKeyBindings(() => this.input.bindings);
    this.hints = new Hints(this.notices, this.save.seenHints, () => this.persist());
    this.hints.enabled = this.save.settings.hints;
    // On a portrait phone the top of the table is where the ball is: tips wait for the plunger.
    this.hints.gate = () =>
      !(this.portraitQuery.matches && this.mode === 'play' && !this.ballInShooter());
    this.subs = new Subtitles(this.notices);
    this.subs.voice = this.save.settings.voice;
    this.hud = new Hud(hud, this.dmd.canvas, {
      press: (a) => this.input.press(a, performance.now()),
      release: (a) => this.input.release(a, performance.now()),
    });
    // DMD and backglass live on the backbox: a glowing dot-matrix panel and a backlit glass.
    this.dmdTex = new THREE.CanvasTexture(this.dmd.canvas);
    this.dmdTex.colorSpace = THREE.SRGBColorSpace;
    this.dmdTex.anisotropy = 4;
    this.glassCanvas = document.createElement('canvas');
    paintBackglass(this.glassCanvas, null);
    this.glassTex = new THREE.CanvasTexture(this.glassCanvas);
    this.glassTex.colorSpace = THREE.SRGBColorSpace;
    this.glassTex.anisotropy = 4;
    // The glass is painted before the web fonts can be drawn to a canvas: paint it again.
    void loadArtFonts().then(() => {
      if (!this.glassCanvas || !this.glassTex) return;
      paintBackglass(this.glassCanvas, this.glassLevels);
      this.glassTex.needsUpdate = true;
    });
    this.world.backbox.attach(this.dmdTex, this.glassTex);
    this.endings = new EndingDirector(this.world, document.body, this.glassTex);
    this.endings.onCue = (who, text) => this.endingCue(who, text);
    this.cracks = h('canvas', { class: 'cracks' });
    this.cracks.style.display = 'none';
    document.body.append(this.cracks);
    // A shared link (?seed=&inmate=&ht=) fills in the lineup.
    const q = new URLSearchParams(location.search);
    this.lineup = {
      inmate: q.get('inmate') ?? this.save.lastInmate,
      hardTime: Number(q.get('ht') ?? this.save.lastHardTime) || 0,
      endless: false,
      seed: (q.get('seed') ?? '').toUpperCase(),
    };
    this.dmd.idle = (d, t) => this.dmdIdle(d, t);
    this.dmd.registerAnim('tally', (d) => {
      const t = this.tally;
      if (!t) return;
      d.text(`BONUS ${formatCoins(t.bonus)} X${t.mult}`, 64, 3, {
        font: FONT_SMALL,
        align: 'center',
        v: 11,
      });
      d.text(formatCoins(t.total * t.k), 64, 12, { scale: 2, align: 'center' });
    });
    this.input.onPress = (a) => this.onPress(a);
    window.addEventListener('resize', () => this.resize());
    const botParam = new URLSearchParams(location.search).get('bot');
    if (botParam)
      this.autoBot = new Bot(
        (['novice', 'average', 'expert'].includes(botParam) ? botParam : 'expert') as BotSkillName,
        7,
      );
    this.applySettings();
    this.resize();
    this.enterTitle();
  }

  // ------------------------------------------------------------------ settings / sizing

  applySettings(): void {
    const s = this.save.settings;
    audio.volumes = { ...s.volume };
    audio.applyVolumes();
    this.renderer.settings.crt = s.crt;
    this.renderer.settings.pixelHeight = effectivePixelHeight(s.pixelHeight, this.qualityCap);
    this.renderer.reducedFlashing = s.reducedFlashing;
    this.world.table.reducedFlashing = s.reducedFlashing;
    this.shows.reducedFlashing = s.reducedFlashing;
    this.input.vibration = s.vibration;
    if (s.bindings) {
      this.input.bindings = {
        ...this.input.bindings,
        ...(s.bindings as typeof this.input.bindings),
      };
      this.input.rebuildKeyMap();
    }
    document.documentElement.style.setProperty('--text-scale', String(s.textSize));
    setReducedMotion(s.reducedFlashing);
    this.resize();
  }

  resize(): void {
    this.renderer.resize();
    this.world.aspect = this.renderer.aspect;
    // The cell keeps its wobbly low-res vertex snap even when the machine renders crisp.
    const { w, h } = this.renderer.lowSize;
    ROOM_UNIFORMS.uSnap.value.set(Math.min(w / 2, 213), Math.min(h / 2, 120));
  }

  persist(): void {
    if (this.run) discover(this.save.meta, this.run);
    writeSave(this.save);
  }

  // ------------------------------------------------------------------ loop

  start(): void {
    const tick = (now: number) => {
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame((now) => {
      this.last = now;
      this.wallClock = now;
      tick(now);
    });
  }

  private lowFpsFor = 0;
  /** Runtime cap from the watchdog (0 = none). Kept apart from the saved choice; see quality.ts. */
  private qualityCap = 0;

  /**
   * A struggling device steps the internal resolution down one tier at a time (540 -> 360 ->
   * 240 -> 180), so the machine stays as crisp as the hardware allows. Not saved.
   */
  private watchQuality(dt: number): void {
    if (this.mode !== 'play') return;
    this.lowFpsFor = this.fps < LOW_FPS ? this.lowFpsFor + dt : 0;
    if (this.lowFpsFor < LOW_FPS_SECS) return;
    this.lowFpsFor = 0;
    const next = nextQualityStep(this.renderer.settings.pixelHeight);
    if (next === null) return;
    this.qualityCap = next;
    this.renderer.settings.pixelHeight = next;
    this.resize();
    this.ui.toast('Running slow: resolution lowered (Settings to change)', 4000, 'warn');
  }

  /** True when no live ball is out on the table (waiting in the shooter lane, or between balls). */
  private ballInShooter(): boolean {
    const s = this.session;
    if (!s) return true;
    for (const b of s.sim.balls) if (b.inShooter && b.state === 'field') return true;
    return false;
  }

  private activeSession(): { session: BallSession; bot: Bot | null } | null {
    if (this.mode === 'replay' && this.replay) return { session: this.replay.session, bot: null };
    if (this.mode === 'play' && this.session) return { session: this.session, bot: this.autoBot };
    if (this.attract) return { session: this.attract.session, bot: this.attract.bot };
    return null;
  }

  frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.time += dt;
    this.frames++;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.watchQuality(this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.input.pollGamepad();
    const act = this.activeSession();
    let alpha = 1;
    if (act) {
      if (this.menuOpen) {
        // Paused: nothing moves; presses go to the menu.
        this.wallClock = now;
        this.input.events.length = 0;
      } else if (this.hitStop > 0) {
        // Freeze the table; inputs made meanwhile apply on the first step after.
        this.hitStop -= dt;
        this.wallClock = now;
      } else {
        if (this.paused) {
          this.acc = this.stepRequests * STEP;
          this.stepRequests = 0;
        }
        // Effective time scale: the dev panel's, times Assist mode's slower table.
        const scale =
          this.timeScale *
          (this.run?.assist && act.session === this.session ? ASSIST.timeScale : 1);
        if (!this.paused) this.acc += dt * scale;
        // Real time of the sim's current step: inputs are applied on the step they happened.
        this.wallClock = now - (this.acc / scale) * 1000;
        let budget = 60; // never spiral
        while (this.acc >= STEP && budget-- > 0) {
          this.wallClock += STEP_MS / scale;
          const rp = this.replay;
          const inp =
            rp && act.session === rp.session
              ? rp.play(act.session.steps)
              : act.bot
                ? act.bot.decide(act.session.sim)
                : this.stepInput(this.wallClock);
          act.session.step(inp);
          this.consumeSimEvents(act.session);
          this.acc -= STEP;
          if (act.session.over) break;
        }
        if (budget <= 0) this.acc = 0;
        alpha = this.acc / STEP;
        if (
          act.session === this.session &&
          this.saves.update(act.session.sim.balls, act.session.steps * STEP)
        )
          this.lastSecondSave();
      }
      if (act.session === this.session && this.session.over && this.mode === 'play')
        this.onBallOver();
      const rp = this.replay;
      if (rp && act.session === rp.session && (rp.session.over || rp.session.steps >= rp.end))
        this.endReplay();
      if (this.attract && act.session === this.attract.session && this.attract.session.over)
        this.newAttractBall();
    } else {
      this.wallClock = now;
      this.input.events.length = 0;
    }
    if (this.mode === 'tally') this.updateTally(dt);
    if (this.endings.kind) this.endings.update(dt);
    if (this.mode === 'ending' && !this.endings.running) this.rapSheet();
    this.updateMusic();
    const shown = act?.session ?? this.session;
    if (this.mode === 'title') this.shows.play('attract');
    else if (this.shows.playing === 'attract') this.shows.stop();
    this.shows.update(dt);
    if (shown)
      this.world.table.update(
        shown.sim,
        this.shows.apply(shown.game.lamps),
        Math.min(1, Math.max(0, alpha)),
        dt,
      );
    this.flushGameEvents();
    this.updateCamera(dt);
    this.world.update(dt);
    this.updateCoins(dt);
    this.pops.update(dt);
    this.dmd.update(dt);
    if (this.dmd.dirty) this.dmdTex.needsUpdate = true;
    this.updateHud(shown, dt);
    // Runs with or without a session: a roll bed, a held coil or the hurry-up must never outlive
    // the table (quit to title, a cell or shop screen).
    let maxV = 0;
    let ramp = false;
    if (shown)
      for (const b of shown.sim.balls) {
        if (b.state === 'transport') ramp = true;
        else if (b.state === 'field') maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      }
    const playing = shown !== null && this.mode === 'play' && !this.menuOpen;
    audio.roll(this.menuOpen ? 0 : this.mode === 'play' ? maxV : maxV * 0.4, ramp);
    audio.plungerPull(playing ? shown.sim.plungerPull : 0);
    audio.hurryTick(playing ? shown.game.hurryLeft : 0);
    if (!playing) audio.releaseCoils();
    audio.frame(playing && shown.sim.balls.length > 0);
    // The phone rings or the ATM chirps: a steady rim on the screen, so the cue is not audio-only.
    this.hud.root.classList.toggle('pulse-alarm', audio.ringing() || audio.alarming());
    this.renderer.flash = Math.max(0, this.renderer.flash - dt * 4);
    this.onFrame?.(dt);
    this.renderer.render(this.world.scene, this.world.camera, this.time);
  }

  /** Build the SimInput for a step, applying input transitions that happened by `t`. */
  private stepInput(t: number): SimInput {
    const inp = this.simInput;
    inp.nudge = 0;
    inp.active = 0;
    const ev = this.input.events;
    let n = 0;
    let pressed = 0; // bit per button pressed this step
    while (n < ev.length && ev[n].time <= t) {
      const e = ev[n];
      // A release in the same step as its press waits a step, so even the briefest tap
      // reaches the sim (and the rules see a flipper edge).
      const bit =
        e.action === 'left' ? 1 : e.action === 'right' ? 2 : e.action === 'plunger' ? 4 : 0;
      if (bit && !e.down && pressed & bit) break;
      if (bit && e.down) pressed |= bit;
      n++;
      switch (e.action) {
        case 'left':
          inp.left = e.down;
          break;
        case 'right':
          inp.right = e.down;
          break;
        case 'plunger':
          inp.plunger = e.down;
          break;
        case 'nudge':
          if (e.down) inp.nudge = 1;
          break;
        case 'nudgeLeft':
          if (e.down) inp.nudge = 2;
          break;
        case 'nudgeRight':
          if (e.down) inp.nudge = 3;
          break;
        case 'lockbar':
          if (e.down) inp.active = 6;
          break;
        case 'slot1':
        case 'slot2':
        case 'slot3':
        case 'slot4':
        case 'slot5':
          if (e.down) inp.active = Number(e.action.slice(4));
          break;
        default:
          break;
      }
    }
    if (n) ev.splice(0, n);
    inp.pull = this.input.analogPull;
    return inp;
  }

  // ------------------------------------------------------------------ events -> presentation

  private consumeSimEvents(s: BallSession): void {
    const quiet = s !== this.session && s !== this.replay?.session;
    this.simCursor = s.sim.events.read(Math.max(this.simCursor, s.sim.events.head - 200), (e) =>
      this.onSimEvent(e, quiet),
    );
  }

  private onSimEvent(e: SimEvent, quiet: boolean): void {
    const vol = quiet ? 0.25 : 1;
    if (quiet && Math.random() > 0.5) return;
    void vol;
    switch (e.type) {
      case 'flipper':
        audio.flipper(e.id, e.dir === 1, e.x);
        if (!quiet && e.dir === 1) this.input.rumble(0.2, 0.4, 40);
        break;
      case 'pop':
        audio.pop(e.x);
        if (!quiet) {
          this.shake(0.25);
          this.world.swingBulb(0.05);
          this.input.rumble(0.3, 0.2, 50);
        }
        break;
      case 'sling':
        audio.sling(e.x);
        if (!quiet) this.shake(0.15);
        break;
      case 'drop':
        audio.drop(e.x, e.value);
        break;
      case 'trigger':
        // Rollover switches: a light tick as the ball runs the lanes.
        if (e.dir === 1 && (e.id.startsWith('lane') || e.id.includes('nlane'))) audio.lane(e.x);
        break;
      case 'dropsReset':
        audio.dropReset();
        break;
      case 'spin':
        audio.spin(e.value, 20);
        break;
      case 'hit':
        audio.hit(e.id, e.value, e.x);
        break;
      case 'flipperHit':
        audio.flipperHit(e.value, e.x);
        break;
      case 'launch':
        audio.launch(e.value / 45);
        break;
      case 'chuteMade':
        audio.chute();
        break;
      case 'holeCapture':
        audio.hole();
        if (!quiet) {
          this.hitStop = 0.05;
          this.shake(0.4);
        }
        break;
      case 'holeEject':
      case 'kickback':
      case 'luckyKick':
        audio.kick();
        break;
      case 'nudge':
        if (!quiet) {
          this.world.kick(
            e.dir === 1 ? 2.2 : 1.6,
            new THREE.Vector3(e.dir === 2 ? -1 : e.dir === 3 ? 1 : 0, 0, e.dir === 1 ? -1 : 0),
          );
          audio.hit('wood', 30, 9);
        }
        break;
      case 'drain':
        if (!quiet) audio.drain();
        break;
      default:
        break;
    }
  }

  private onGameEvent = (e: GameEvent): void => {
    this.gameEvents.push(e);
  };

  private flushGameEvents(): void {
    if (!this.gameEvents.length) return;
    const evs = this.gameEvents;
    this.gameEvents = [];
    const combo = this.session?.game.combo.count ?? 0;
    // PAYDAY pays through a jackpot score too and has its own fanfare; a hurry-up has none.
    let paydayNow = false;
    let jackpotNow = false;
    for (const e of evs) {
      if (e.t === 'payday') paydayNow = true;
      else if (e.t === 'score' && e.shot === 'jackpot') jackpotNow = true;
    }
    for (const e of evs) {
      switch (e.t) {
        case 'score': {
          const p = this.world.table.worldOf(e.x, e.y, 1.6, this.tmpV);
          const jackpot = e.shot === 'jackpot';
          const big = e.amount >= 3 || jackpot;
          this.pops.spawn(`+${formatCoins(e.amount)}`, p, big ? '#ffe28a' : '#ffb347', big);
          // Coin clinks rise in pitch through combos; bigger payouts add a bell on the ladder.
          if (jackpot && !paydayNow) audio.jackpot(1);
          else audio.score(e.amount, combo, big);
          break;
        }
        case 'hurry':
          audio.hurry(e.on, jackpotNow);
          break;
        case 'callout':
          if (e.sub === 'LOCKUP IS LIT' && this.mode === 'play') this.hints.show('lockup');
          this.dmd.show({
            text: e.text,
            sub: e.sub,
            priority: e.priority,
            anim: e.anim,
            duration: e.duration,
          });
          audio.callout(e.priority);
          break;
        case 'skillShot':
          this.shows.play('skill');
          audio.skillShot(e.super);
          this.flash(0.25);
          this.shake(0.6);
          break;
        case 'combo':
          audio.combo(e.count);
          if (e.count >= 3) this.shake(0.15 * e.count);
          break;
        case 'lock':
          audio.lock(e.locks);
          this.shake(0.5);
          break;
        case 'riot':
          if (e.on) {
            this.react('riot');
            if (this.mode === 'play') this.hints.show('riot');
            this.shows.play('riot');
            audio.riot(true);
            this.flash(0.4);
            this.shake(1);
            this.world.swingBulb(0.4);
          } else audio.riot(false);
          break;
        case 'payday':
          if (this.mode === 'play' && this.session)
            this.moments.push({
              step: this.session.steps,
              label: `${e.super ? 'SUPER PAYDAY' : 'PAYDAY'} +${formatCoins(e.amount)}`,
              value: e.amount,
            });
          if (e.super || (this.run && e.amount >= BIG_PAYDAY_SHARE * this.run.debt))
            this.react('bigPayday');
          this.shows.play('payday');
          this.hitStop = e.super ? 0.06 : 0.04;
          audio.payday(e.super);
          this.flash(e.super ? 0.5 : 0.3);
          this.shake(e.super ? 1.4 : 0.9);
          this.world.swingBulb(e.super ? 0.6 : 0.3);
          this.input.buzz(e.super ? 120 : 60);
          break;
        case 'extraBall':
          audio.extraBall();
          this.hud.banner('Extra ball', { tone: 'green', sub: 'Shoot again' });
          break;
        case 'award':
          if (!e.collected) this.ui.toast(`The Hole is lit: ${AWARD_NAMES[e.award]}`, 2400, 'good');
          else audio.levelUp();
          break;
        case 'luck':
          if (e.kind === 'spark') {
            this.flash(0.35);
            audio.spark();
          } else {
            audio.kick();
            this.shake(0.4);
          }
          break;
        case 'tunnel':
          audio.tunnel();
          this.shake(0.8);
          this.flash(0.3);
          this.react('tunnel', true);
          break;
        case 'jailbreak':
          this.onJailbreak(e.phase, e.n);
          break;
        case 'active':
          audio.active();
          this.ui.toast(`${charmDef(e.id).name}: ${e.charges} left`, 2200, 'good');
          break;
        case 'jobDone':
          this.react('jobDone');
          audio.jobComplete();
          this.flash(0.2);
          break;
        case 'ballSaved':
          audio.save();
          break;
        case 'laneComplete':
          audio.chime(1);
          break;
        case 'bonusMult':
          audio.bonusMult(e.mult);
          break;
        case 'ballOver':
          audio.ballOver(e.tilted);
          break;
        case 'tiltWarning':
          audio.warn();
          this.hud.banner(`Warning ${e.n}`, { tone: 'red', sub: 'Ease off or the table tilts' });
          break;
        case 'tilt':
          this.react('tilt', true);
          audio.tilt();
          this.flash(0.3);
          break;
        case 'drain':
          if (this.session && this.session.sim.ballsInPlay() === 0) {
            this.shows.play('drain');
            if (e.cause === 'center' && Math.random() < CENTER_DRAIN_CHANCE)
              this.react('centerDrain');
          }
          this.dmd.show({ text: 'DRAINED', priority: 3, anim: 'drain', duration: 1.0 });
          break;
        default:
          break;
      }
    }
  }

  shake(amount: number): void {
    const s = this.save.settings.shake * amount;
    if (s > 0)
      this.world.kick(
        s * 3,
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random(),
          (Math.random() - 0.5) * 2,
        ).normalize(),
      );
  }

  flash(amount: number): void {
    if (this.save.settings.reducedFlashing) return;
    this.renderer.flash = Math.max(this.renderer.flash, amount);
  }

  // ------------------------------------------------------------------ input

  private onPress(a: Action): void {
    audio.unlock();
    if (a === 'pause' || (a === 'back' && this.overlays > 0)) {
      if (this.overlays > 0) {
        this.ui.cue('close');
        this.closeOverlay();
      } else if (this.mode !== 'title' && this.mode !== 'fall' && this.mode !== 'ending') {
        this.ui.cue('open');
        this.openPause();
      }
      return;
    }
    if (this.ui.open) {
      if (a === 'left' || a === 'lookLeft') this.ui.moveFocus(-1);
      else if (a === 'right' || a === 'lookRight') this.ui.moveFocus(1);
      else if (a === 'plunger' || a === 'confirm') this.ui.activate();
      return;
    }
    if (
      this.mode === 'title' &&
      (a === 'confirm' || a === 'plunger' || a === 'left' || a === 'right')
    )
      this.enterLineup();
    else if (this.mode === 'ending' && (a === 'confirm' || a === 'plunger')) this.rapSheet();
    else if (this.mode === 'replay' && (a === 'confirm' || a === 'plunger')) this.endReplay();
  }

  // ------------------------------------------------------------------ flow

  enterTitle(): void {
    this.mode = 'title';
    this.world.cell.setTallies(this.save.tallies);
    this.world.setDecay(0);
    this.renderer.tint.set(1, 1, 1);
    this.session = null;
    this.endings.stop();
    this.ending = null;
    this.world.setMode('title');
    this.world.coins.clear();
    this.trayCoins = 0;
    this.newAttractBall();
    this.ui.show(
      titlePanel(
        {
          saved: this.save.run,
          tallies: this.save.tallies,
          dailyBest: this.dailyBestText(),
          touch: matchMedia('(pointer: coarse)').matches,
        },
        {
          continueRun: () => this.continueRun(),
          newRun: () => this.enterLineup(),
          daily: () => this.newRunFlow(undefined, true),
          rapSheet: () => this.enterMeta(),
          settings: () => this.openSettings(),
        },
      ),
    );
  }

  // ------------------------------------------------------------------ pause / settings

  openPause(): void {
    this.menuOpen = this.mode === 'play';
    this.overlays++;
    audio.ui('pause');
    this.ui.push(
      pausePanel(
        {
          resume: () => this.closeOverlay(),
          settings: () => this.openSettings(),
          bugReport: () => this.copyBugReport(),
          quit: () => this.quitToTitle(),
        },
        !this.run || this.run.phase === 'over'
          ? ''
          : this.mode === 'play'
            ? 'this ball is lost; the run is saved'
            : 'the run is saved',
        this.run && this.run.phase !== 'over' ? where(this.run) : '',
      ),
    );
  }

  private closeOverlay(): void {
    if (this.input.capture) {
      this.input.capture = null;
      return;
    }
    this.ui.pop();
    this.overlays = Math.max(0, this.overlays - 1);
    if (this.overlays === 0 && this.menuOpen) {
      this.menuOpen = false;
      // Buttons may have changed while paused: carry over what is held now.
      const inp = this.simInput;
      inp.left = this.input.isHeld('left');
      inp.right = this.input.isHeld('right');
      inp.plunger = this.input.isHeld('plunger');
      this.input.events.length = 0;
    }
  }

  openSettings(): void {
    this.overlays++;
    this.ui.push(this.settingsEl(null));
  }

  private settingsEl(waiting: Action | null): HTMLElement {
    return settingsPanel(
      this.save.settings,
      this.input.bindings,
      {
        change: (s) => this.changeSettings(s),
        capture: (done) => {
          this.ui.replace(this.settingsEl(this.captureTarget()), this.ui.focusKey());
          this.input.capture = (code) => {
            if (code !== 'Escape') done(code);
            this.changeSettings({
              ...this.save.settings,
              bindings: structuredClone(this.input.bindings),
            });
          };
        },
        back: () => this.closeOverlay(),
      },
      waiting,
    );
  }

  /** The action whose rebind button has focus. */
  private captureTarget(): Action | null {
    const k = this.ui.focusKey();
    return k?.startsWith('bind-') ? (k.slice(5) as Action) : null;
  }

  private changeSettings(s: Settings): void {
    const voiceOn = s.voice && !this.save.settings.voice;
    this.qualityCap = capAfterSettings(
      this.qualityCap,
      this.save.settings.pixelHeight,
      s.pixelHeight,
    );
    this.save.settings = s;
    this.input.rebuildKeyMap();
    this.applySettings();
    this.subs.voice = s.voice;
    this.hints.enabled = s.hints;
    this.persist();
    if (voiceOn) this.subs.say('THE WARDEN', 'You will hear me now.');
    this.ui.replace(this.settingsEl(null), this.ui.focusKey());
  }

  /** Leave for the title. A ball in play is lost (no quitting out of a bad ball). */
  private quitToTitle(): void {
    const r = this.run;
    this.overlays = 0;
    this.menuOpen = false;
    if (r && r.phase === 'ball') {
      // Mid-ball the ball is forfeit; during the tally it counts as played.
      const live = this.session && !this.session.over;
      const o = live
        ? { ...this.session!.game.outcome(), earned: 0, bonus: 0, tilted: true }
        : this.outcome;
      if (o) finishBall(r, o);
      this.session = null;
      if ((r.phase as string) === 'over') {
        this.endRun();
        return;
      }
    }
    this.autosave();
    this.enterTitle();
  }

  private copyLink(r: RunState): void {
    const link = shareLink(`${location.origin}${location.pathname}`, r);
    if (!navigator.clipboard) {
      this.ui.toast(link, 8000);
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => this.ui.toast('Link copied: anyone who opens it plays this run', 3000, 'good'),
      () => this.ui.toast(link, 8000),
    );
  }

  /** Bug report: the run and the current ball (snapshot + recorded inputs) as JSON. */
  private copyBugReport(): void {
    const s = this.session;
    const report = JSON.stringify({
      game: 'ball-and-chain',
      version: 1,
      at: new Date().toISOString(),
      ua: navigator.userAgent,
      run: this.run,
      ball: s ? { snapshot: s.snapshot, inputs: s.recording.toJSON(), steps: s.steps } : null,
    });
    if (!navigator.clipboard) {
      this.downloadReport(report);
      return;
    }
    navigator.clipboard.writeText(report).then(
      () => this.ui.toast('Bug report copied to the clipboard', 2600, 'good'),
      () => this.downloadReport(report),
    );
  }

  private downloadReport(text: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `ball-and-chain-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.ui.toast('Bug report saved');
  }

  private newAttractBall(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const s = new BallSession(defaultSnapshot(seed));
    const bot = attachBot(new Bot('expert', seed ^ 0x5bd1e995), s);
    this.attract = { session: s, bot };
    this.world.table.setTags(new Set(s.snapshot.tags));
    this.simCursor = 0;
  }

  /** The mugshot lineup: inmate, Hard Time, Endless. */
  enterLineup(): void {
    this.mode = 'lineup';
    const meta = this.save.meta;
    const c = this.lineup;
    if (!inmateUnlocked(meta, c.inmate)) c.inmate = 'debtor';
    c.hardTime = Math.min(c.hardTime, maxHardTime(meta, c.inmate));
    if (!endlessUnlocked(meta)) c.endless = false;
    this.ui.show(
      lineupPanel(meta, c, {
        change: (n) => {
          this.lineup = n;
          this.enterLineup();
        },
        start: () => this.newRunFlow(),
        back: () => this.enterTitle(),
      }),
    );
  }

  newRunFlow(seed?: string, daily = false): void {
    this.attract = null;
    const c = this.lineup;
    const typed = seed ?? c.seed;
    const kind: RunKind = daily ? 'daily' : typed ? 'seeded' : 'random';
    const sd = daily
      ? dailySeed(new Date())
      : typed || Math.random().toString(36).slice(2, 10).toUpperCase();
    this.run = newRun(sd, {
      inmate: daily ? 'debtor' : c.inmate,
      hardTime: daily ? 0 : c.hardTime,
      endless: daily ? false : c.endless,
      assist: this.save.settings.assist,
      kind,
      // Seeded and daily runs use the whole collection so a seed plays the same anywhere.
      locked: kind === 'random' ? lockedCharms(this.save.meta) : [],
    });
    this.dailyBest = false;
    this.save.lastInmate = c.inmate;
    this.save.lastHardTime = c.hardTime;
    this.world.coins.clear();
    this.trayCoins = 0;
    this.save.tallies++;
    recordRunStart(this.save.meta);
    this.world.cell.setTallies(this.save.tallies);
    this.persist();
    this.ui.toast(`Seed ${sd}`);
    audio.runStart();
    this.enterDeadlineIntro();
  }

  /** Today's best Daily Sentence result, for the title screen ('' if none yet). */
  private dailyBestText(): string {
    const d = this.save.daily;
    return d.date === dayKey(new Date()) && d.best
      ? `Today's best: ${d.best.deadlines} paid, ${d.best.coins} coins`
      : '';
  }

  /** Resume the autosaved run at the start of its round. */
  continueRun(): void {
    const r = this.save.run;
    if (!r) return;
    this.attract = null;
    this.run = JSON.parse(JSON.stringify(r)) as RunState;
    this.world.coins.setPile(this.run.pocket);
    this.trayCoins = this.run.pocket;
    this.world.setDecay(this.run.deadline / Math.max(1, Math.min(8, this.run.deadlines) - 1));
    if (this.run.phase === 'betweenBalls') this.afterBall();
    else if (this.run.round === 0 && !this.run.neighbor.knock) this.enterDeadlineIntro();
    else this.enterJobs();
  }

  /** Autosave: the run as it stands at the start of a round. */
  private autosave(): void {
    if (!this.run || (this.run.phase !== 'pickJob' && this.run.phase !== 'betweenBalls')) return;
    this.save.run = JSON.parse(JSON.stringify(this.run)) as RunState;
    this.persist();
  }

  /** Lifetime Rap Sheet from the title. */
  enterMeta(): void {
    this.mode = 'meta';
    this.ui.show(rapSheetPanel(this.save.meta, this.save.tallies, () => this.enterTitle()));
  }

  /** Milestones reached mid-run (from stats) are announced at once. */
  private unlockCheck(): void {
    for (const u of checkUnlocks(this.save.meta)) this.announceUnlock(u);
  }

  private announceUnlock(u: UnlockDef): void {
    const what = [
      ...(u.charms ?? []).map((id) => charmDef(id).name),
      u.inmate ? inmateDef(u.inmate).name : '',
      u.endless ? 'Endless' : '',
    ].filter(Boolean);
    audio.unlocked();
    this.ui.toast(unlockToast('Unlocked', what.length ? what.join(', ') : u.text), 4500, 'unlock');
    this.ui.cue('reward');
  }

  private decks = new Map<WardenTrigger, string[]>();

  /** Deal a Warden line from a shuffled deck so lines rarely repeat. */
  warden(t: WardenTrigger): string {
    let deck = this.decks.get(t);
    if (!deck || !deck.length) {
      deck = [...WARDEN[t]].sort(() => Math.random() - 0.5);
      this.decks.set(t, deck);
    }
    return deck.pop()!;
  }

  /** JAILBREAK on the table: every lit shot shakes something loose. */
  private onJailbreak(phase: string, n: number): void {
    if (this.mode === 'play' && this.session && (phase === 'escaped' || phase === 'start'))
      this.moments.push({
        step: this.session.steps,
        label: phase === 'escaped' ? 'THE ESCAPE' : 'JAILBREAK',
        value: phase === 'escaped' ? 1e12 : 1e11,
      });
    audio.jailbreak(phase, n);
    switch (phase) {
      case 'start':
        this.shows.play('jailbreak');
        this.flash(0.5);
        this.shake(1.2);
        this.world.swingBulb(0.7);
        this.react('jailbreak', true);
        break;
      case 'shot':
        this.shake(0.3 + n * 0.08);
        this.world.swingBulb(0.15 + n * 0.03);
        this.input.buzz(40 + n * 6);
        break;
      case 'posts':
        if (this.session) this.world.table.setTags(new Set(this.session.sim.tags));
        this.hud.banner('The posts fall off', { tone: 'red', sub: 'The outlanes are open' });
        break;
      case 'lights':
        this.world.lightsDying = true;
        this.hud.banner('The lights are dying', { tone: 'red' });
        break;
      case 'glass':
        paintCracks(this.cracks, n * 7919 + 13);
        this.cracks.style.display = '';
        this.flash(0.4);
        break;
      case 'escaped':
        this.flash(0.8);
        this.shake(2);
        break;
      case 'failed':
        this.react('caught', true);
        break;
    }
  }

  /** The Warden reacts to play (rate-limited unless `force`). */
  private react(t: WardenTrigger, force = false): void {
    if (!this.run || this.mode !== 'play') return;
    if (force) {
      this.subs.say('THE WARDEN', this.warden(t));
      audio.warden();
    } else if (this.subs.react('THE WARDEN', () => this.warden(t), performance.now()))
      audio.warden();
  }

  private lastSave = -1e9;

  /** A ball dropping through the gap got sent back up. */
  private lastSecondSave(): void {
    const now = performance.now();
    if (now - this.lastSave < SAVE_COOLDOWN_MS) return;
    this.lastSave = now;
    audio.creak();
    this.shake(0.3);
    this.input.buzz(40);
  }

  /** A deadline begins: the debt, and the Sentence for its last round. */
  private enterDeadlineIntro(): void {
    const r = this.run!;
    this.mode = 'intro';
    this.world.setDecay(r.deadline / Math.max(1, Math.min(8, r.deadlines) - 1));
    this.world.cell.setAtmAlarm(false);
    this.world.setMode('seated');
    const last = lastCall(r);
    this.autosave();
    const line = this.warden(r.deadline === 0 ? 'intro' : last ? 'lastCall' : 'sentence');
    if (r.deadline > 0) audio.warden();
    this.dmd.say(`THE WARDEN: ${line}`);
    this.subs.say('THE WARDEN', line, false);
    this.ui.show(introPanel(r, line, { next: () => this.enterJobs() }));
  }

  /** The phone after a paid deadline: perks, or the red phone's bargains. */
  private enterPhone(): void {
    const r = this.run!;
    const call = r.call;
    if (!call) {
      this.enterDeadlineIntro();
      return;
    }
    this.mode = 'phone';
    this.world.setMode('seated');
    audio.phoneRing();
    this.hints.show(call.kind === 'perks' ? 'phone' : 'redCall');
    if (call.kind === 'perks') {
      const line = this.warden('deadlinePaid');
      this.dmd.say(`THE WARDEN: ${line}`);
      this.subs.say('THE WARDEN', line, false);
      this.ui.show(
        phonePanel(r, line, { choose: (i) => this.answerPhone(() => choosePerk(r, i)) }),
      );
      return;
    }
    const line = this.warden('redCall');
    this.dmd.say(`THE RED PHONE: ${line}`);
    this.subs.say('THE RED PHONE', line, false);
    this.flash(0.15);
    audio.creak();
    this.ui.show(
      redPhonePanel(r, line, {
        accept: (i) => this.answerPhone(() => acceptBargain(r, i)),
        hangUp: () =>
          this.answerPhone(() => {
            this.subs.say('THE WARDEN', this.warden('hangUp'));
            return hangUp(r);
          }),
      }),
    );
  }

  private answerPhone(fn: () => boolean): void {
    if (!fn()) return;
    audio.phonePick();
    this.enterDeadlineIntro();
  }

  /** Pay the deadline at the start of a round and skip the rest. */
  private payEarlyFlow(): void {
    const r = this.run!;
    const before = r.tickets;
    if (!payEarly(r)) return;
    recordDeadline(this.save.meta, r);
    this.unlockCheck();
    this.persist();
    this.subs.say('THE WARDEN', this.warden('payEarly'));
    this.ui.toast(`+${r.tickets - before} tickets`, 2600, 'good');
    if (r.phase === 'over') this.endRun();
    else this.enterPhone();
  }

  private enterJobs(): void {
    const r = this.run!;
    this.autosave();
    if (r.neighbor.knock) {
      this.enterKnock();
      return;
    }
    this.mode = 'jobs';
    this.hints.show('jobs');
    if (sentenceActive(r)) this.hints.show('sentence');
    this.world.setMode('seated');
    this.ui.cue('open');
    this.ui.show(
      jobsPanel(r, { take: (i) => this.takeJob(i), payEarly: () => this.payEarlyFlow() }),
    );
    if (sentenceActive(r))
      this.dmd.show({
        text: 'SENTENCE',
        sub: r.sentences.map((id) => sentenceDef(id).name.toUpperCase()).join(' + '),
        priority: 6,
        duration: 2.5,
      });
  }

  /** Knocking through the wall: the neighbor asks, and offers something back. */
  private enterKnock(): void {
    this.hints.show('knock');
    const r = this.run!;
    const k = r.neighbor.knock!;
    this.mode = 'knock';
    audio.knock();
    const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
    const fill = (t: string) =>
      t
        .replaceAll('{amount}', String(k.amount))
        .replaceAll('{charm}', k.charm ? charmDef(k.charm).name : '')
        .replaceAll('{item}', k.item ? contrabandDef(k.item).name : '');
    const ask = fill(pick(NEIGHBOR_LINES.ask[k.ask]));
    const offer = fill(NEIGHBOR_LINES.offer[k.offer]).replace(
      '{amount}',
      String(k.offerAmount ?? NEIGHBOR.ticketsOffered),
    );
    this.subs.say('THE WALL', pick(NEIGHBOR_LINES.knock));
    const give =
      k.ask === 'coins'
        ? `${k.amount} coins`
        : k.ask === 'tickets'
          ? `${k.amount} tickets`
          : charmDef(k.charm!).name;
    const get =
      k.offer === 'key'
        ? 'A key'
        : k.offer === 'tip'
          ? 'A tip about the table'
          : k.offer === 'contraband'
            ? k.item
              ? contrabandDef(k.item).name
              : 'Contraband'
            : `${k.offerAmount ?? NEIGHBOR.ticketsOffered} tickets`;
    const answer = (help: boolean) => {
      if (!answerKnock(r, help)) return;
      recordKnock(this.save.meta);
      this.subs.say('NEXT DOOR', pick(help ? NEIGHBOR_LINES.thanks : NEIGHBOR_LINES.refused));
      if (help && k.offer === 'tip') this.ui.toast(NEIGHBOR_LINES.tip, 9000);
      else if (help) audio.coin(3);
      this.unlockCheck();
      this.persist();
      this.enterJobs();
    };
    this.ui.show(knockPanel(r, k, { ask, offer, give, get }, { answer }));
  }

  takeJob(i: number): void {
    if (!this.run || !pickJob(this.run, i)) return;
    this.enterBuy();
  }

  private enterBuy(): void {
    this.hints.show('buy');
    const r = this.run!;
    this.mode = 'buy';
    this.world.setMode('seated');
    this.ui.show(buyPanel(r, { buy: (n) => this.buy(n) }));
  }

  buy(n: number): void {
    if (!this.run || !buyBalls(this.run, n)) return;
    audio.ui('buy');
    this.enterCell();
  }

  private enterCell(): void {
    const r = this.run!;
    this.mode = 'cell';
    this.world.setMode('seated');
    this.session = null;
    this.ui.show(
      cellPanel(r, {
        play: () => this.startBall(),
        atm: () => this.enterAtm('cell'),
        shop: () => this.enterShop(),
        use: (i, target) => {
          const name = contrabandDef(r.contraband[i]).name;
          if (useContraband(r, i, target ?? {})) {
            audio.atmBeep();
            this.ui.toast(`${name}: done.`, 2200, 'good');
          }
          this.enterCell();
        },
      }),
    );
  }

  enterAtm(back: 'cell' | 'deadline'): void {
    this.hints.show('atm');
    const r = this.run!;
    this.mode = 'atm';
    this.world.setMode('seated');
    this.ui.show(
      atmPanel(r, back, {
        deposit: (n) => {
          deposit(r, n);
          audio.deposit();
          this.enterAtm(back);
        },
        borrow: (n) => {
          if (borrow(r, n) > 0) {
            audio.cashOut();
            this.subs.say('THE WARDEN', this.warden('loan'));
          }
          this.enterAtm(back);
        },
        done: () => (back === 'deadline' ? this.enterDeadline() : this.enterCell()),
      }),
    );
  }

  enterShop(): void {
    this.hints.show('shop');
    const r = this.run!;
    this.mode = 'shop';
    this.world.setMode('seated');
    this.ui.show(
      shopPanel(r, {
        buyCharm: (i) => {
          if (buyCharm(r, i)) audio.vend();
          this.enterShop();
        },
        buyContraband: (i) => {
          if (buyContraband(r, i)) audio.vend();
          this.enterShop();
        },
        sell: (slot) => {
          if (sellCharm(r, slot)) audio.ui('sell');
          this.enterShop();
        },
        reroll: () => {
          if (reroll(r)) audio.atmBeep();
          this.enterShop();
        },
        done: () => this.enterCell(),
      }),
    );
  }

  startBall(): void {
    const r = this.run!;
    if (ballsLeft(r) <= 0) return;
    this.ui.hide();
    const snap = nextBall(r);
    this.session = new BallSession(snap, this.onGameEvent);
    this.saves.reset();
    this.moments = [];
    this.hints.show('flippers');
    this.hints.show('plunger');
    if (snap.ctx.actives.length) this.hints.show('actives');
    if (this.autoBot) attachBot(this.autoBot, this.session);
    this.world.setBlackout(snap.ctx.blackout);
    this.world.table.setTags(new Set(snap.tags));
    this.world.restoreLights();
    this.cracks.style.display = 'none';
    if (snap.ctx.jailbreak) {
      this.dmd.show({
        text: 'JAILBREAK',
        sub: 'IS LIT AT THE HOLE',
        priority: 6,
        anim: 'jailbreak',
        duration: 2.5,
      });
    }
    this.world.sway = snap.ctx.moonshine ? 1 : 0;
    this.simCursor = 0;
    this.acc = 0;
    this.input.events.length = 0;
    this.simInput = emptyInput();
    this.mode = 'play';
    this.world.setMode(this.save.settings.camera === 'seated' ? 'seated' : 'play');
    audio.ballFeed();
  }

  private onBallOver(): void {
    this.world.setBlackout(false);
    this.world.restoreLights();
    this.cracks.style.display = 'none';
    this.world.sway = 0;
    const g = this.session!.game;
    this.outcome = g.outcome();
    if (!g.tilted) this.pourCoins(Math.floor(this.outcome.earned));
    if (!g.tilted && g.bonusPaid > 0) {
      this.mode = 'tally';
      this.tally = { k: 0, bonus: g.bonus, mult: g.bonusMult, total: g.bonusPaid, ticks: 0 };
      this.dmd.show({ text: 'BONUS', priority: 9, anim: 'tally', duration: 60 });
    } else this.finishBall();
  }

  /** Bonus count-up; both flippers fast-forward. */
  private updateTally(dt: number): void {
    const t = this.tally;
    if (!t) return;
    const fast = this.input.isHeld('left') && this.input.isHeld('right');
    t.k = Math.min(1, t.k + (dt * (fast ? 6 : 1)) / BONUS.tallyTime);
    const ticks = Math.floor(t.k * 24);
    if (ticks > t.ticks) {
      this.pourCoins(Math.floor((t.total * ticks) / 24) - Math.floor((t.total * t.ticks) / 24));
      t.ticks = ticks;
      audio.countTick(ticks, 24);
    }
    if (t.k >= 1) {
      this.tally = null;
      this.dmd.cut();
      this.finishBall();
    }
  }

  private pourCoins(n: number): void {
    if (n <= 0) return;
    this.world.coins.pour(n);
    this.trayCoins += n;
  }

  /** The tray follows the pocket: pours what it is owed, empties when the ATM takes coins. */
  private updateCoins(dt: number): void {
    const r = this.run;
    if (r && this.mode !== 'play' && this.mode !== 'tally') {
      if (r.pocket < this.trayCoins) {
        this.world.coins.setPile(r.pocket);
        this.trayCoins = r.pocket;
      } else if (r.pocket > this.trayCoins) this.pourCoins(r.pocket - this.trayCoins);
    }
    const landed = this.world.coins.update(dt);
    const now = performance.now();
    if (landed > 0 && now - this.clatterAt > 40) {
      this.clatterAt = now;
      audio.clatter();
    }
  }

  private finishBall(): void {
    const r = this.run!;
    const o = this.outcome!;
    this.mode = 'ballEnd';
    const res = finishBall(r, o);
    if (res.debtAdded) this.ui.toast(`Head count: +${res.debtAdded} debt`, 3200, 'bad');
    recordBall(this.save.meta, o, res.gained);
    this.hints.show('pocket');
    this.unlockCheck();
    this.autosave();
    this.persist();
    if (r.phase === 'over') {
      // JAILBREAK made it out: straight to the ending.
      this.endRun();
      return;
    }
    this.dmd.show({
      text: o.tilted ? 'TILTED' : 'BALL OVER',
      sub: o.tilted ? 'NOTHING COUNTS' : `+${res.gained} COINS`,
      priority: 8,
      anim: 'count',
      duration: 1.6,
    });
    if (res.jobDone) this.ui.cue('reward');
    let lastTick = 0;
    this.ui.show(
      ballEndPanel(
        { r, o, res },
        {
          next: () => this.afterBall(),
          // A tick as the Pocket total counts up, at most a few a second.
          tick: () => {
            const now = performance.now();
            if (now - lastTick > 120) {
              lastTick = now;
              this.ui.cue('tick');
            }
          },
        },
        this.replayButton(() => this.finishBallPanelAgain()),
      ),
    );
    this.ballEndPanel = this.ui.current;
  }

  private ballEndPanel: HTMLElement | null = null;

  private finishBallPanelAgain(): void {
    this.mode = 'ballEnd';
    if (this.ballEndPanel) this.ui.show(this.ballEndPanel);
  }

  /** "Watch the replay" for this ball's biggest moment, if it had one. */
  private replayButton(back: () => void, before?: () => void): HTMLElement | null {
    const s = this.session;
    if (!s || !this.moments.length) return null;
    const m = this.moments.reduce((a, b) => (b.value > a.value ? b : a));
    return btn(`Replay: ${m.label.toLowerCase()}`, {
      icon: 'eye',
      k: 'replay',
      onclick: () => {
        before?.();
        this.startReplay(
          s.snapshot,
          s.recording,
          Math.max(0, m.step - Math.round(REPLAY_LEAD / STEP)),
          m.step + Math.round(REPLAY_TAIL / STEP),
          m.label,
          back,
        );
      },
    });
  }

  /** Re-simulate a recorded ball silently up to `from`, then show it live until `to`. */
  startReplay(
    snap: BallSnapshot,
    rec: InputRecording,
    from: number,
    to: number,
    label: string,
    back: () => void,
  ): void {
    let live = false;
    const s = new BallSession(snap, (e) => {
      if (live) this.onGameEvent(e);
    });
    const play = rec.player();
    while (s.steps < from && !s.over) s.step(play(s.steps));
    live = true;
    this.replay = { session: s, play, end: to, back };
    this.mode = 'replay';
    this.ui.hide();
    this.simCursor = s.sim.events.head;
    this.acc = 0;
    this.world.table.setTags(new Set(s.sim.tags));
    document.body.classList.add('replaying');
    this.dmd.show({
      text: 'INSTANT REPLAY',
      sub: label,
      priority: 9,
      duration: (to - from) * STEP,
    });
  }

  private endReplay(): void {
    const rp = this.replay;
    if (!rp) return;
    this.replay = null;
    document.body.classList.remove('replaying');
    this.world.restoreLights();
    this.cracks.style.display = 'none';
    this.dmd.cut();
    rp.back();
  }

  /** Dev: play back a pasted bug report's ball from the start. */
  devPlayReport(json: string): void {
    const r = JSON.parse(json) as {
      ball?: { snapshot: BallSnapshot; inputs: number[]; steps: number };
    };
    if (!r.ball) return;
    const mode = this.mode;
    this.attract = null;
    this.startReplay(
      r.ball.snapshot,
      InputRecording.fromJSON(r.ball.inputs),
      0,
      r.ball.steps,
      'BUG REPORT',
      () => (mode === 'title' ? this.enterTitle() : this.ui.toast('Report played back')),
    );
  }

  afterBall(): void {
    const r = this.run!;
    if (ballsLeft(r) > 0) {
      this.enterCell();
      return;
    }
    const roundBefore = r.round;
    const underSentence = sentenceActive(r);
    endRound(r);
    if (r.phase === 'deadline') {
      this.enterDeadline();
      if (underSentence && r.bank + r.pocket >= r.debt)
        this.subs.say('THE WARDEN', this.warden('sentenceSurvived'));
    } else {
      this.ui.toast(`Round ${roundBefore + 1} over. The Bank pays interest.`);
      this.enterJobs();
    }
  }

  private enterDeadline(): void {
    const r = this.run!;
    this.mode = 'deadline';
    this.world.cell.setAtmAlarm(true);
    audio.atmAlarm();
    this.world.setMode('seated');
    this.ui.show(
      deadlinePanel(r, { deposit: () => this.enterAtm('deadline'), pay: () => this.payDeadline() }),
    );
  }

  private payDeadline(): void {
    const r = this.run!;
    settleDeadline(r);
    recordDeadline(this.save.meta, r);
    if (r.phase !== 'over') audio.deadlinePaid();
    this.unlockCheck();
    this.persist();
    if (r.phase === 'over') this.endRun();
    else this.enterPhone();
  }

  /** Dev: pay the current deadline from thin air and move on. */
  devSkipDeadline(): void {
    const r = this.run;
    if (!r || r.phase === 'over') return;
    this.session = null;
    r.bank = Math.max(r.bank, r.debt);
    r.round = ECONOMY.roundsPerDeadline;
    r.ballsPlayed = r.ballsThisRound;
    r.phase = 'deadline';
    this.payDeadline();
  }

  fall(): void {
    this.mode = 'fall';
    this.ui.hide();
    this.fallT = 0;
    this.world.setMode('fall');
    audio.trapdoor();
    const line = this.warden('fall');
    this.dmd.say(`THE WARDEN: ${line}`);
    this.subs.say('THE WARDEN', line);
    this.shake(1.2);
    this.flash(0.2);
    window.setTimeout(() => this.rapSheet(), 3000);
  }

  /** The run is over: record it, then the fall or the ending's sequence. */
  private endRun(): void {
    const r = this.run!;
    this.save.run = null;
    this.fresh = recordRunEnd(this.save.meta, r, this.save.tallies);
    this.dailyBest = recordDaily(this.save.daily, r, dayKey(new Date()));
    this.persist();
    if (r.result === 'fell' || !r.result) {
      this.fall();
      return;
    }
    this.mode = 'ending';
    this.ui.hide();
    this.ending = r.result;
    this.endings.start(r.result);
    audio.ending(r.result);
  }

  private endingCue(who: string, text: string): void {
    if (who === 'TITLE') {
      this.dmd.show({ text, priority: 10, anim: 'jailbreak', duration: 4 });
      audio.titleCard();
      return;
    }
    this.subs.say(who, text);
    if (this.ending === 'cellmate' && text.startsWith('Then the wall')) {
      audio.wallDown();
      window.setTimeout(() => this.shake(1.4), 900);
    }
  }

  /** Dev: play an ending now. */
  devEnding(kind: EndingKind): void {
    if (!this.run) this.newRunFlow('DEV');
    const r = this.run!;
    this.session = null;
    r.phase = 'over';
    r.result = kind;
    this.endRun();
  }

  /** Dev: the neighbor knocks at the next round start. */
  devKnock(): void {
    const r = this.run;
    if (!r) return;
    r.neighbor.asked++;
    r.neighbor.knock = {
      ask: 'coins',
      amount: Math.min(5, r.pocket + r.bank),
      offer: r.neighbor.tip ? 'key' : 'tip',
    };
  }

  private rapSheet(): void {
    const r = this.run!;
    this.mode = 'rapsheet';
    this.renderer.tint.set(1, 1, 1);
    if (!this.ending) this.world.setMode('seated');
    const daily = this.save.daily.best;
    this.ui.show(
      runEndPanel(
        {
          r,
          fresh: this.fresh,
          tallies: this.save.tallies,
          dailyBest: this.dailyBest,
          dailyLine:
            r.kind === 'daily'
              ? this.dailyBest
                ? `Daily Sentence: a new best for today (${r.deadline} paid, ${r.stats.coinsEarned} coins).`
                : `Daily Sentence: today's best is ${daily?.deadlines ?? 0} paid, ${daily?.coins ?? 0} coins.`
              : null,
          unlockText: (u) => (u.ending ? u.text : `${u.text} → ${unlockReward(u)}`),
        },
        { again: () => this.enterTitle(), copyLink: () => this.copyLink(r) },
        r.result === 'breakout'
          ? this.replayButton(
              () => this.rapSheet(),
              () => {
                this.endings.stop();
                this.ending = null;
              },
            )
          : null,
      ),
    );
  }

  /** Table music while a ball is live; the cell's drone and clock otherwise. */
  private updateMusic(): void {
    const m = this.mode;
    music.setMode(
      m === 'play' || m === 'tally' || m === 'replay'
        ? 'table'
        : m === 'fall' || m === 'rapsheet'
          ? 'off'
          : 'cell',
    );
    const g = this.mode === 'play' ? this.session?.game : null;
    const r = this.run;
    const st = music.state;
    st.combo = g && g.combo.active(g.time) ? g.combo.count : 0;
    st.riot = !!g?.riot || !!g?.jailbreak;
    st.sentence = !!r && sentenceActive(r);
    st.tension = r ? Math.min(1, r.round / Math.max(1, roundsIn(r) - 1)) : 0;
    music.update();
  }

  // ------------------------------------------------------------------ camera / HUD

  private updateCamera(dt: number): void {
    if (this.mode === 'fall') {
      this.fallT += dt;
      if (this.world.mode !== 'fall') this.world.setMode('fall');
      audio.setView('fall');
      // The light above shrinks to nothing over the three seconds.
      const k = Math.min(1, this.fallT / 2.6);
      this.renderer.tint.setScalar(Math.max(0, 1 - k * k * 1.1));
      return;
    }
    const m: CamMode =
      this.mode === 'play' || this.mode === 'replay'
        ? (this.devCam ?? (this.save.settings.camera === 'seated' ? 'seated' : 'play'))
        : (CAMERA_FOR[this.mode] ?? 'seated');
    if (this.world.mode !== m) this.world.setMode(m);
    audio.setView(m);
    if (this.mode !== 'play') {
      const look =
        (this.input.isHeld('lookLeft') ? 1 : 0) - (this.input.isHeld('lookRight') ? 1 : 0);
      this.world.lookYaw += (look * 0.6 - this.world.lookYaw) * Math.min(1, dt * 3);
    } else this.world.lookYaw = 0;
  }

  private dmdIdle(d: Dmd, t: number): void {
    if (this.mode === 'title' || !this.run) {
      const k = Math.floor(t / 3) % 2;
      d.text(k ? 'BALL & CHAIN' : "DEBTOR'S PRISON", 64, 6, { scale: 1, align: 'center' });
      d.text(k ? 'PRESS START' : 'PAY OR FALL', 64, 20, {
        font: FONT_SMALL,
        align: 'center',
        v: Math.floor(t * 2) % 2 ? 15 : 7,
      });
      return;
    }
    const r = this.run;
    const g = this.mode === 'play' && this.session ? this.session.game : null;
    const earned = g ? g.earned : 0;
    d.text(`${formatCoins(r.pocket + earned)}`, 64, 2, { scale: 2, align: 'center' });
    let mid = '';
    if (g?.riot) mid = `PAYDAY ${formatCoins(g.shotValue('chute', g.payday))}`;
    else if (g && g.hurryLeft > 0) mid = `HURRY-UP ${Math.ceil(g.hurryLeft)}`;
    else if (g && g.combo.active(g.time) && g.combo.count >= 1) mid = `COMBO X${g.combo.mult}`;
    if (mid)
      d.text(mid, 64, 18, { font: FONT_SMALL, align: 'center', v: Math.floor(t * 6) % 2 ? 15 : 9 });
    if (g && g.combo.active(g.time)) {
      const w = Math.round((g.combo.left(g.time) / g.ctx.comboWindow) * 60);
      d.rect(64 - w / 2, 24, w, 1, 8);
    }
    d.text(`BALL ${r.ballsPlayed + (this.mode === 'play' ? 1 : 0)}/${r.ballsThisRound}`, 2, 26, {
      font: FONT_SMALL,
      v: 10,
    });
    if (g && g.bonusMult > 1)
      d.text(`BX${g.bonusMult}`, 64, 26, { font: FONT_SMALL, v: 10, align: 'center' });
    d.text(`DEBT ${r.debt}`, 126, 26, { font: FONT_SMALL, v: 10, align: 'right' });
  }

  private glassCanvas: HTMLCanvasElement | null = null;
  private glassTex: THREE.CanvasTexture | null = null;
  private glassSig = -1;
  private atmSig = -1;
  private glassLevels: Record<string, number> | null = null;

  /** Which HUD layout a screen gets: columns beside the table, a ribbon, the DMD, or none. */
  private hudLayout(): HudLayout {
    switch (this.mode) {
      case 'play':
      case 'tally':
        return 'columns';
      // The ball-over panel is narrow enough to sit between the columns (not on a phone).
      case 'ballEnd':
        return this.portraitQuery.matches ? 'ribbon' : 'columns';
      case 'intro':
      case 'phone':
      case 'jobs':
      case 'shop':
      case 'buy':
      case 'cell':
      case 'atm':
      case 'deadline':
      case 'knock':
        return 'ribbon';
      case 'replay':
      case 'fall':
      case 'ending':
        return 'dmd';
      default:
        return 'off';
    }
  }

  private updateHud(shown: BallSession | null, dt: number): void {
    const r = this.run;
    const playing = this.mode === 'play' || this.mode === 'tally';
    const g = shown && playing ? shown.game : null;
    if (r) {
      if (r.keys) this.hints.show('keys');
      if (g && g.stats.seconds > 25) this.hints.show('nudge');
    }
    this.hud.update(dt, this.hudLayout(), r, shown, playing);
    if (r) {
      // Backglass ladders and the ATM's LCD follow the run.
      let lv = 0;
      for (const k in r.shotLevels) lv = lv * 31 + r.shotLevels[k as keyof typeof r.shotLevels];
      if (lv !== this.glassSig && this.glassCanvas && this.glassTex) {
        this.glassSig = lv;
        this.glassLevels = r.shotLevels;
        paintBackglass(this.glassCanvas, r.shotLevels);
        this.glassTex.needsUpdate = true;
      }
      const atm = (r.debt * 31 + r.bank) * 31 + r.round * 2 + (r.phase === 'deadline' ? 1 : 0);
      if (atm !== this.atmSig) {
        this.atmSig = atm;
        this.world.cell.drawAtm(
          `DEBT ${r.debt}\nBANK ${r.bank}\n${r.phase === 'deadline' ? 'PAY NOW' : `ROUND ${r.round + 1}/${roundsIn(r)}`}`,
        );
      }
    }
  }
}

/** Where the camera looks for each screen: the cell's props are the menus. */
const CAMERA_FOR: Partial<Record<AppMode, CamMode>> = {
  title: 'title',
  jobs: 'atm',
  atm: 'atm',
  deadline: 'atm',
  shop: 'vending',
  phone: 'phone',
  rapsheet: 'wall',
  meta: 'wall',
  knock: 'wall',
  lineup: 'door',
  intro: 'seated',
  tally: 'tray',
  ballEnd: 'tray',
};

/** What a milestone gave, for the Rap Sheet. */
function unlockReward(u: UnlockDef): string {
  const parts = (u.charms ?? []).map((id) => charmDef(id).name);
  if (u.inmate) parts.push(inmateDef(u.inmate).name);
  if (u.endless) parts.push('Endless');
  return parts.join(', ');
}
