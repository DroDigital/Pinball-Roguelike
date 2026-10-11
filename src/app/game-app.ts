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
import { LampShowPlayer } from '../present/lampshow';
import { TABLE } from '../content/table';
import { Input, type Action } from './input';
import { UI, h } from './ui';
import { loadSave, writeSave, type SaveData } from './save';
import { BallSession } from '../rules/session';
import { Lamp, type GameEvent } from '../rules/types';
import { emptyInput, type SimInput } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import { Bot, type BotSkillName } from '../bot/bot';
import { attachBot, defaultSnapshot } from '../bot/autoplay';
import { jobDef, jobText, type JobDef } from '../content/jobs';
import { AWARD_NAMES } from '../rules/table-game';
import {
  newRun,
  buyBalls,
  costForBalls,
  maxAffordableBalls,
  ballPrice,
  ballsLeft,
  nextBall,
  finishBall,
  deposit,
  endRound,
  settleDeadline,
  pickJob,
  jobCoins,
  canPayEarly,
  payEarly,
  payScale,
  loanAvailable,
  loanCost,
  borrow,
  sentenceActive,
  roundsIn,
  choosePerk,
  acceptBargain,
  hangUp,
  type BallOutcome,
  type RunState,
} from '../rules/run';
import { sentenceDef } from '../content/sentences';
import { charmDef, RARITY_COLORS } from '../content/charms';
import { contrabandDef } from '../content/contraband';
import {
  buyCharm,
  buyContraband,
  canUse,
  contrabandPrice,
  contrabandSlots,
  ownedTags,
  reroll,
  rerollCost,
  sellCharm,
  sellValue,
  useContraband,
} from '../rules/shop';
import { perkDef, bargainDef } from '../content/phone';
import { WARDEN, type WardenTrigger } from '../content/dialogue';
import { BONUS, ECONOMY } from '../content/balance';

const STEP = 1 / 240;
const STEP_MS = 1000 / 240;

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
  | 'rapsheet';

export class GameApp {
  readonly renderer: RetroRenderer;
  readonly world: World;
  readonly dmd = new Dmd(4);
  readonly pops = new NumberPops();
  readonly shows = new LampShowPlayer(TABLE.lamps);
  readonly input: Input;
  readonly ui: UI;
  save: SaveData;
  mode: AppMode = 'title';
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
  /** Pocket Watch: sim seconds of half-speed time left (presentation only). */
  private slowmoLeft = 0;
  private simCursor = 0;
  private gameEvents: GameEvent[] = [];
  /** Bonus count-up after a drain. */
  private tally: { k: number; bonus: number; mult: number; total: number; ticks: number } | null =
    null;
  private outcome: BallOutcome | null = null;
  private hud: HTMLElement;
  private hudStats: HTMLElement;
  private hudRight: HTMLElement;
  private hudPlunger: HTMLElement;
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
    toast: HTMLElement,
  ) {
    this.save = loadSave();
    this.renderer = new RetroRenderer(canvas);
    this.renderer.settings.crt = this.save.settings.crt;
    this.renderer.settings.pixelHeight = this.save.settings.pixelHeight;
    this.world = new World(new Set(['outlanePosts']));
    this.world.scene.add(this.pops.group);
    this.input = new Input(document.body);
    this.ui = new UI(uiRoot, toast);
    this.ui.onClick = () => audio.atmBeep();
    this.hud = hud;
    this.hudStats = h('div', { class: 'stats' });
    this.hudRight = h('div', { class: 'right' });
    this.hudPlunger = h('div', { class: 'plunger' }, h('i'), h('em', { style: { bottom: '50%' } }));
    const dmdCanvas = this.dmd.canvas;
    dmdCanvas.className = 'dmd';
    hud.append(
      h('div', { class: 'left' }, dmdCanvas, this.hudStats),
      this.hudRight,
      this.hudPlunger,
    );
    // DMD on the backbox too.
    this.dmdTex = new THREE.CanvasTexture(this.dmd.canvas);
    this.dmdTex.colorSpace = THREE.SRGBColorSpace;
    this.dmdTex.magFilter = THREE.NearestFilter;
    const backbox = this.world.cabinet.getObjectByName('backbox');
    if (backbox) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 4.5),
        new THREE.MeshBasicMaterial({ map: this.dmdTex }),
      );
      panel.position.set(0, -4.5, 2.05);
      backbox.add(panel);
    }
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
    window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
    window.addEventListener('keydown', () => audio.unlock());
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
    this.renderer.settings.pixelHeight = s.pixelHeight;
    this.input.vibration = s.vibration;
    if (s.bindings) {
      this.input.bindings = {
        ...this.input.bindings,
        ...(s.bindings as typeof this.input.bindings),
      };
      this.input.rebuildKeyMap();
    }
    document.documentElement.style.setProperty('--text-scale', String(s.textSize));
    this.resize();
  }

  resize(): void {
    this.renderer.resize();
    this.world.aspect = this.renderer.aspect;
  }

  persist(): void {
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

  private activeSession(): { session: BallSession; bot: Bot | null } | null {
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
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.input.pollGamepad();
    const act = this.activeSession();
    let alpha = 1;
    if (act) {
      if (this.hitStop > 0) {
        // Freeze the table; inputs made meanwhile apply on the first step after.
        this.hitStop -= dt;
        this.wallClock = now;
      } else {
        if (this.paused) {
          this.acc = this.stepRequests * STEP;
          this.stepRequests = 0;
        }
        // Effective time scale: dev slow-mo times the Pocket Watch.
        const scale = this.timeScale * (this.slowmoLeft > 0 ? 0.5 : 1);
        if (!this.paused) {
          this.acc += dt * scale;
          this.slowmoLeft = Math.max(0, this.slowmoLeft - dt * scale);
        }
        // Real time of the sim's current step: inputs are applied on the step they happened.
        this.wallClock = now - (this.acc / scale) * 1000;
        let budget = 60; // never spiral
        while (this.acc >= STEP && budget-- > 0) {
          this.wallClock += STEP_MS / scale;
          const inp = act.bot ? act.bot.decide(act.session.sim) : this.stepInput(this.wallClock);
          act.session.step(inp);
          this.consumeSimEvents(act.session);
          this.acc -= STEP;
          if (act.session.over) break;
        }
        if (budget <= 0) this.acc = 0;
        alpha = this.acc / STEP;
      }
      if (act.session === this.session && this.session.over && this.mode === 'play')
        this.onBallOver();
      if (this.attract && act.session === this.attract.session && this.attract.session.over)
        this.newAttractBall();
    } else {
      this.wallClock = now;
      this.input.events.length = 0;
    }
    if (this.mode === 'tally') this.updateTally(dt);
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
    this.pops.update(dt);
    this.dmd.update(dt);
    this.dmdTex.needsUpdate = true;
    this.updateHud(shown);
    if (shown) {
      let maxV = 0;
      let ramp = false;
      for (const b of shown.sim.balls) {
        if (b.state === 'transport') ramp = true;
        else if (b.state === 'field') maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      }
      audio.roll(this.mode === 'play' ? maxV : maxV * 0.4, ramp);
    }
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
    const quiet = s !== this.session;
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
        audio.drop(e.x);
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
    for (const e of evs) {
      switch (e.t) {
        case 'score': {
          const p = this.world.table.worldOf(e.x, e.y, 1.6, this.tmpV);
          const big = e.amount >= 3 || e.shot === 'jackpot';
          this.pops.spawn(`+${formatCoins(e.amount)}`, p, big ? '#ffe28a' : '#ffb347', big);
          // Coin clinks rise in pitch through combos.
          if (e.amount >= 1) audio.coin(Math.min(8, Math.floor(e.amount) + combo));
          break;
        }
        case 'callout':
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
          audio.knocker();
          this.flash(0.25);
          this.shake(0.6);
          break;
        case 'combo':
          if (e.count >= 3) this.shake(0.15 * e.count);
          break;
        case 'lock':
          audio.kick();
          this.shake(0.5);
          break;
        case 'riot':
          if (e.on) {
            this.shows.play('riot');
            audio.knocker();
            this.flash(0.4);
            this.shake(1);
            this.world.swingBulb(0.4);
          }
          break;
        case 'payday':
          this.shows.play('payday');
          this.hitStop = e.super ? 0.06 : 0.04;
          audio.knocker();
          this.flash(e.super ? 0.5 : 0.3);
          this.shake(e.super ? 1.4 : 0.9);
          this.world.swingBulb(e.super ? 0.6 : 0.3);
          this.input.buzz(e.super ? 120 : 60);
          break;
        case 'extraBall':
          audio.knocker();
          this.ui.toast('EXTRA BALL');
          break;
        case 'award':
          if (!e.collected) this.ui.toast(`The Hole is lit: ${AWARD_NAMES[e.award]}`);
          break;
        case 'luck':
          if (e.kind === 'spark') {
            this.flash(0.35);
            audio.creak();
          } else {
            audio.kick();
            this.shake(0.4);
          }
          break;
        case 'slowmo':
          this.slowmoLeft = e.seconds;
          break;
        case 'active':
          audio.kick();
          this.ui.toast(`${charmDef(e.id).name} (${e.charges} left)`);
          break;
        case 'jobDone':
          audio.knocker();
          this.flash(0.2);
          break;
        case 'ballSaved':
          audio.knocker();
          break;
        case 'tiltWarning':
          audio.warn();
          this.ui.toast(`DANGER — WARNING ${e.n}`);
          break;
        case 'tilt':
          audio.tilt();
          this.flash(0.3);
          break;
        case 'drain':
          if (this.session && this.session.sim.ballsInPlay() === 0) this.shows.play('drain');
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
      this.newRunFlow();
  }

  // ------------------------------------------------------------------ flow

  enterTitle(): void {
    this.mode = 'title';
    this.session = null;
    this.world.setMode('title');
    this.newAttractBall();
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h('h1', null, 'Ball & Chain'),
        h('p', null, 'You owe the Warden. The machine is the only way out.'),
        h('p', { class: 'dim' }, `Runs on the wall: ${this.save.tallies}`),
        h('p', { class: 'tally' }, tallyMarks(this.save.tallies)),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.newRunFlow() }, 'Wake up'),
        ),
        h(
          'p',
          { class: 'dim' },
          'Flippers: Z / slash (or shift, arrows). Plunger: hold space. Nudge: X.',
        ),
      ),
    );
  }

  private newAttractBall(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const s = new BallSession(defaultSnapshot(seed));
    const bot = attachBot(new Bot('expert', seed ^ 0x5bd1e995), s);
    this.attract = { session: s, bot };
    this.world.table.setTags(new Set(s.snapshot.tags));
    this.simCursor = 0;
  }

  newRunFlow(seed?: string): void {
    this.attract = null;
    const sd =
      seed ??
      new URLSearchParams(location.search).get('seed') ??
      Math.random().toString(36).slice(2, 10).toUpperCase();
    this.run = newRun(sd);
    this.save.tallies++;
    this.save.stats.runs++;
    this.persist();
    this.ui.toast(`Seed ${sd}`);
    this.enterDeadlineIntro();
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

  /** A deadline begins: the debt, and the Sentence for its last round. */
  private enterDeadlineIntro(): void {
    const r = this.run!;
    this.mode = 'intro';
    this.world.setMode('seated');
    const last = r.deadline === r.deadlines - 1;
    const line = this.warden(r.deadline === 0 ? 'intro' : last ? 'lastCall' : 'sentence');
    this.dmd.say(`THE WARDEN: ${line}`);
    const cards = r.sentences.map((id) => {
      const d = sentenceDef(id);
      return h('div', { class: 'sentence' }, h('b', null, d.name), h('small', null, d.text));
    });
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h(
          'h2',
          null,
          last
            ? `Deadline ${r.deadline + 1}: Last Call`
            : `Deadline ${r.deadline + 1} of ${r.deadlines}`,
        ),
        h('p', { class: 'warden' }, `“${line}”`),
        r.deadline > 0
          ? h(
              'p',
              { class: 'good' },
              `A heavier coin mech: the machine now pays x${formatCoins(payScale(r))}.`,
            )
          : null,
        h(
          'div',
          { class: 'grid' },
          'Debt',
          h('b', null, `${r.debt}c`),
          'Bank',
          h('b', null, `${r.bank}c`),
          'Pocket',
          h('b', null, `${r.pocket}c`),
        ),
        h(
          'p',
          null,
          `${r.sentences.length > 1 ? 'Sentences' : 'Sentence'} for round ${ECONOMY.roundsPerDeadline}:`,
        ),
        ...cards,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.enterJobs() }, 'To the ATM'),
        ),
      ),
    );
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
    if (call.kind === 'perks') {
      const line = this.warden('deadlinePaid');
      this.dmd.say(`THE WARDEN: ${line}`);
      const cards = call.offers.map((o, i) =>
        h(
          'button',
          {
            class: `job${i === 0 ? ' primary' : ''}`,
            onclick: () => this.answerPhone(() => choosePerk(r, i)),
          },
          h('b', null, perkDef(o.id).text.replace('{shot}', o.shot ?? '')),
        ),
      );
      this.ui.show(
        h(
          'div',
          { class: 'panel' },
          h('h2', null, 'The phone rings'),
          h('p', { class: 'warden' }, `“${line} Pick one. It is yours for the rest of your stay.”`),
          h('div', { class: 'col' }, ...cards),
        ),
      );
      return;
    }
    const line = this.warden('redCall');
    this.dmd.say(`THE RED PHONE: ${line}`);
    this.flash(0.15);
    audio.creak();
    const cards = call.offers.map((id, i) => {
      if (id.startsWith('charm:')) {
        const c = charmDef(id.slice(6));
        return h(
          'button',
          { class: 'job bargain', onclick: () => this.answerPhone(() => acceptBargain(r, i)) },
          h('b', null, `${c.name} (devil charm)`),
          h('small', null, c.text),
          h('small', { class: 'cost' }, 'Takes a charm slot. It cannot be sold.'),
        );
      }
      const b = bargainDef(id);
      return h(
        'button',
        { class: 'job bargain', onclick: () => this.answerPhone(() => acceptBargain(r, i)) },
        h('b', null, b.name),
        h('small', null, b.gain),
        h('small', { class: 'cost' }, b.cost),
      );
    });
    this.ui.show(
      h(
        'div',
        { class: 'panel red' },
        h('h2', null, 'The red phone rings'),
        h('p', { class: 'warden' }, `“${line}”`),
        h('div', { class: 'col' }, ...cards),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'primary',
              onclick: () =>
                this.answerPhone(() => {
                  this.ui.toast(this.warden('hangUp'));
                  return hangUp(r);
                }),
            },
            'Hang up',
          ),
        ),
      ),
    );
  }

  private answerPhone(fn: () => boolean): void {
    if (!fn()) return;
    audio.atmBeep();
    this.enterDeadlineIntro();
  }

  /** Pay the deadline at the start of a round and skip the rest. */
  private payEarlyFlow(): void {
    const r = this.run!;
    const before = r.tickets;
    if (!payEarly(r)) return;
    this.save.stats.bestDeadline = Math.max(this.save.stats.bestDeadline, r.deadline);
    this.persist();
    this.ui.toast(`${this.warden('payEarly')} (+${r.tickets - before} tickets)`);
    if (r.phase === 'over') this.rapSheet();
    else this.enterPhone();
  }

  private enterJobs(): void {
    const r = this.run!;
    this.mode = 'jobs';
    this.world.setMode('seated');
    audio.atmBeep();
    const cards = r.jobOffers.map((o, i) => {
      const def = jobDef(o.id);
      return h(
        'button',
        {
          class: `job${def.key ? ' key' : ''}${i === 0 ? ' primary' : ''}`,
          onclick: () => this.takeJob(i),
        },
        h('b', null, jobText(def, o.target)),
        h('small', null, rewardText(def, r.deadline)),
      );
    });
    this.ui.show(
      h(
        'div',
        { class: 'panel atm' },
        h('h2', null, `Round ${r.round + 1}: jobs`),
        sentenceActive(r)
          ? h(
              'p',
              { class: 'cost' },
              `SENTENCE ROUND: ${r.sentences.map((id) => sentenceDef(id).name.toUpperCase()).join(' + ')}`,
            )
          : null,
        h('p', null, 'THE ATM POSTS THREE JOBS. TAKE ONE.'),
        h('div', { class: 'col' }, ...cards),
        canPayEarly(r)
          ? h(
              'div',
              { class: 'row' },
              h(
                'button',
                { onclick: () => this.payEarlyFlow() },
                `Pay the debt now (+${ECONOMY.payEarlyTickets * (ECONOMY.roundsPerDeadline - r.round)} tickets)`,
              ),
            )
          : null,
      ),
    );
    if (sentenceActive(r))
      this.dmd.show({
        text: 'SENTENCE',
        sub: r.sentences.map((id) => sentenceDef(id).name.toUpperCase()).join(' + '),
        priority: 6,
        duration: 2.5,
      });
  }

  takeJob(i: number): void {
    if (!this.run || !pickJob(this.run, i)) return;
    this.enterBuy();
  }

  private enterBuy(): void {
    const r = this.run!;
    this.mode = 'buy';
    this.world.setMode('seated');
    const price = ballPrice(r);
    const max = maxAffordableBalls(r);
    const opts: HTMLElement[] = [];
    for (let n = 1; n <= ECONOMY.maxBallsPerRound; n++) {
      const cost = costForBalls(r, n);
      opts.push(
        h(
          'button',
          {
            class: n === Math.min(3, max) ? 'primary' : '',
            disabled: n > max,
            onclick: () => this.buy(n),
          },
          `${n} ball${n > 1 ? 's' : ''} — ${cost ? `${cost}c` : 'free'}`,
        ),
      );
    }
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h(
          'h2',
          null,
          `Deadline ${r.deadline + 1} · Round ${r.round + 1}/${ECONOMY.roundsPerDeadline}`,
        ),
        h(
          'div',
          { class: 'grid' },
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Bank',
          h('b', null, `${r.bank}c`),
          'Debt',
          h('b', null, `${r.debt}c`),
        ),
        h('p', null, `Buy balls for this round. The first is free; each extra costs ${price}c.`),
        h('div', { class: 'row' }, ...opts),
      ),
    );
  }

  buy(n: number): void {
    if (!this.run || !buyBalls(this.run, n)) return;
    this.enterCell();
  }

  private enterCell(): void {
    const r = this.run!;
    this.mode = 'cell';
    this.world.setMode('seated');
    this.session = null;
    const left = ballsLeft(r);
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', null, 'The cell'),
        h(
          'div',
          { class: 'grid' },
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Bank',
          h('b', null, `${r.bank}c`),
          'Debt',
          h('b', null, `${r.debt}c`),
          'Balls left',
          h('b', null, String(left)),
        ),
        h(
          'p',
          { class: 'dim' },
          `Deadline ${r.deadline + 1}/${r.deadlines} · Round ${r.round + 1}/${ECONOMY.roundsPerDeadline}`,
        ),
        r.job
          ? h(
              'p',
              { class: r.job.done ? 'good' : 'dim' },
              `Job: ${jobText(jobDef(r.job.id), r.job.target)} — ${r.job.done ? 'done' : `${formatCoins(r.job.progress)}/${r.job.target}`}`,
            )
          : null,
        h('p', { class: 'dim' }, `Shot levels: ${levelsText(r)}`),
        this.charmBar(r),
        this.stash(r, () => this.enterCell()),
        h(
          'p',
          { class: sentenceActive(r) ? 'cost' : 'dim' },
          `${sentenceActive(r) ? 'Sentence in force' : `Sentence (round ${ECONOMY.roundsPerDeadline})`}: ${r.sentences.map((id) => sentenceDef(id).name).join(', ')}`,
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: left > 0 ? 'primary' : '',
              disabled: left <= 0,
              onclick: () => this.startBall(),
            },
            'Play ball',
          ),
          h('button', { onclick: () => this.enterAtm('cell') }, 'ATM'),
          h('button', { onclick: () => this.enterShop() }, 'Vending cabinet'),
        ),
      ),
    );
  }

  enterAtm(back: 'cell' | 'deadline'): void {
    const r = this.run!;
    this.mode = 'atm';
    this.world.setMode('seated');
    const dep = (n: number) => {
      deposit(r, n);
      audio.atmBeep();
      this.enterAtm(back);
    };
    const need = Math.max(0, r.debt - r.bank);
    this.ui.show(
      h(
        'div',
        { class: 'panel atm' },
        h('h2', null, 'Automated Teller'),
        h(
          'p',
          null,
          back === 'deadline' ? 'FINAL DEPOSIT BEFORE THE DEADLINE.' : 'DEPOSITS ARE FINAL.',
        ),
        h(
          'div',
          { class: 'grid' },
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Bank',
          h('b', null, `${r.bank}c`),
          'Debt',
          h('b', null, `${r.debt}c`),
          'Still owed',
          h('b', null, `${need}c`),
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { disabled: r.pocket < 1, onclick: () => dep(1) }, '+1'),
          h('button', { disabled: r.pocket < 5, onclick: () => dep(5) }, '+5'),
          h('button', { disabled: r.pocket < 10, onclick: () => dep(10) }, '+10'),
          h(
            'button',
            { disabled: need < 1 || r.pocket < 1, onclick: () => dep(Math.min(need, r.pocket)) },
            'Owed',
          ),
          h('button', { disabled: r.pocket < 1, onclick: () => dep(r.pocket) }, 'All'),
        ),
        this.loanRow(r, back),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'primary',
              onclick: () => (back === 'deadline' ? this.enterDeadline() : this.enterCell()),
            },
            'Done',
          ),
        ),
      ),
    );
  }

  private loanRow(r: RunState, back: 'cell' | 'deadline'): HTMLElement | null {
    const avail = loanAvailable(r);
    const owed = r.loanDue ? h('p', { class: 'dim' }, `Added to next debt: ${r.loanDue}c`) : null;
    if (avail <= 0)
      return (
        owed ??
        h(
          'p',
          { class: 'dim' },
          r.deadline >= r.deadlines - 1 ? 'NO LOANS ON LAST CALL.' : 'LOAN LIMIT REACHED.',
        )
      );
    const take = (n: number) => {
      if (borrow(r, n) > 0) {
        audio.atmBeep();
        this.ui.toast(this.warden('loan'));
      }
      this.enterAtm(back);
    };
    const half = Math.max(1, Math.floor(avail / 2));
    return h(
      'div',
      null,
      h(
        'p',
        null,
        `LOAN: borrow up to ${avail}c, repaid at ${Math.round(r.mods.loanRate * 100)}% with the next debt.`,
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => take(half) }, `Borrow ${half}c (owe ${loanCost(r, half)}c)`),
        h(
          'button',
          { onclick: () => take(avail) },
          `Borrow ${avail}c (owe ${loanCost(r, avail)}c)`,
        ),
      ),
      owed,
    );
  }

  /** Owned charms in slot order (active ones show charges and their key). */
  private charmBar(r: RunState): HTMLElement {
    const items = r.charms.map((id, i) => {
      const c = charmDef(id);
      const charges = c.active
        ? ` [${i + 1}] ${'●'.repeat(r.charges[id] ?? 0)}${'○'.repeat(c.active.charges - (r.charges[id] ?? 0))}`
        : '';
      return h(
        'span',
        { class: 'charm', style: { borderColor: RARITY_COLORS[c.rarity] }, title: c.text },
        `${c.name}${charges}`,
      );
    });
    return h(
      'div',
      { class: 'charms' },
      h(
        'small',
        { class: 'dim' },
        `Charms ${r.charms.length}/${r.mods.charmSlots} · Tickets ${r.tickets} · Keys ${r.keys}`,
      ),
      h(
        'div',
        { class: 'chips' },
        ...(items.length ? items : [h('span', { class: 'dim' }, 'none')]),
      ),
    );
  }

  /** Contraband stash with Use buttons (Oil Can and Shiv ask for a target). */
  private stash(r: RunState, back: () => void): HTMLElement | null {
    if (!r.contraband.length) return null;
    const use = (i: number, t = {}) => {
      const name = contrabandDef(r.contraband[i]).name;
      if (useContraband(r, i, t)) {
        audio.atmBeep();
        this.ui.toast(`${name}: done.`);
      }
      back();
    };
    const rows = r.contraband.map((id, i) => {
      const d = contrabandDef(id);
      if (d.target === 'shot')
        return h(
          'div',
          { class: 'row' },
          h('small', null, `${d.name}:`),
          ...(['chute', 'perimeter', 'hole', 'cellblock', 'yard', 'lanes'] as const).map((shot) =>
            h('button', { onclick: () => use(i, { shot }) }, shot),
          ),
        );
      if (d.target === 'charm')
        return h(
          'div',
          { class: 'row' },
          h('small', null, `${d.name}:`),
          ...r.charms.map((cid, slot) =>
            h('button', { onclick: () => use(i, { charmSlot: slot }) }, charmDef(cid).name),
          ),
        );
      return h(
        'button',
        { disabled: !canUse(r, id), title: d.text, onclick: () => use(i) },
        `Use ${d.name}`,
      );
    });
    return h(
      'div',
      { class: 'stash' },
      h('small', { class: 'dim' }, 'Contraband'),
      h('div', { class: 'row' }, ...rows),
    );
  }

  enterShop(): void {
    const r = this.run!;
    this.mode = 'shop';
    this.world.setMode('seated');
    const tags = ownedTags(r);
    const charmCards = r.shop.charms.map((id, i) => {
      const c = charmDef(id);
      const glow = c.tags.some((t) => tags.has(t));
      return h(
        'button',
        {
          class: `job charmcard${glow ? ' glow' : ''}`,
          style: { borderColor: RARITY_COLORS[c.rarity] },
          disabled: r.tickets < c.cost || r.charms.length >= r.mods.charmSlots,
          onclick: () => {
            if (buyCharm(r, i)) audio.coin(4);
            this.enterShop();
          },
        },
        h('b', null, `${c.name} — ${c.cost} ticket${c.cost === 1 ? '' : 's'}`),
        h('small', null, c.text),
        h('small', { class: 'tags' }, `${c.rarity} · ${c.tags.join(', ')}`),
      );
    });
    const cbCards = r.shop.contraband.map((id, i) => {
      const d = contrabandDef(id);
      const price = contrabandPrice(r, id);
      return h(
        'button',
        {
          class: 'job',
          disabled: r.pocket < price || r.contraband.length >= contrabandSlots(r),
          onclick: () => {
            if (buyContraband(r, i)) audio.coin(3);
            this.enterShop();
          },
        },
        h('b', null, `${d.name} — ${price}c`),
        h('small', null, d.text),
      );
    });
    const sells = r.charms.map((id, slot) => {
      const c = charmDef(id);
      return h(
        'button',
        {
          disabled: !!c.cursed,
          onclick: () => {
            if (sellCharm(r, slot)) audio.atmBeep();
            this.enterShop();
          },
        },
        c.cursed ? `${c.name} (cursed)` : `Sell ${c.name} +${sellValue(r, id)}t`,
      );
    });
    const cost = rerollCost(r);
    this.ui.show(
      h(
        'div',
        { class: 'panel shop' },
        h('h2', null, 'Vending cabinet'),
        h(
          'div',
          { class: 'grid' },
          'Tickets',
          h('b', null, String(r.tickets)),
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Charm slots',
          h('b', null, `${r.charms.length}/${r.mods.charmSlots}`),
          'Contraband',
          h('b', null, `${r.contraband.length}/${contrabandSlots(r)}`),
        ),
        h('div', { class: 'col' }, ...charmCards),
        h('div', { class: 'col' }, ...cbCards),
        sells.length ? h('div', { class: 'row' }, ...sells) : null,
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              disabled: r.pocket < cost,
              onclick: () => {
                if (reroll(r)) audio.atmBeep();
                this.enterShop();
              },
            },
            `Reroll ${cost}c`,
          ),
          h('button', { class: 'primary', onclick: () => this.enterCell() }, 'Done'),
        ),
      ),
    );
  }

  startBall(): void {
    const r = this.run!;
    if (ballsLeft(r) <= 0) return;
    this.ui.hide();
    const snap = nextBall(r);
    this.session = new BallSession(snap, this.onGameEvent);
    if (this.autoBot) attachBot(this.autoBot, this.session);
    this.world.setBlackout(snap.ctx.blackout);
    this.world.table.setTags(new Set(snap.tags));
    this.world.sway = snap.ctx.moonshine ? 1 : 0;
    this.slowmoLeft = 0;
    this.simCursor = 0;
    this.acc = 0;
    this.input.events.length = 0;
    this.simInput = emptyInput();
    this.mode = 'play';
    this.world.setMode(this.save.settings.camera === 'seated' ? 'seated' : 'play');
  }

  private onBallOver(): void {
    this.world.setBlackout(false);
    this.world.sway = 0;
    this.slowmoLeft = 0;
    const g = this.session!.game;
    this.outcome = g.outcome();
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
      t.ticks = ticks;
      audio.coin(Math.min(8, Math.floor(ticks / 3)));
    }
    if (t.k >= 1) {
      this.tally = null;
      this.dmd.cut();
      this.finishBall();
    }
  }

  private finishBall(): void {
    const r = this.run!;
    const o = this.outcome!;
    this.mode = 'ballEnd';
    const res = finishBall(r, o);
    if (res.debtAdded) this.ui.toast(`HEAD COUNT: +${res.debtAdded}c debt`);
    this.save.stats.balls++;
    this.save.stats.coins += res.gained;
    this.save.stats.biggestPayday = Math.max(
      this.save.stats.biggestPayday,
      Math.round(o.stats.biggestPayday),
    );
    this.save.stats.longestCombo = Math.max(this.save.stats.longestCombo, o.stats.maxCombo);
    this.persist();
    this.dmd.show({
      text: o.tilted ? 'TILTED' : 'BALL OVER',
      sub: o.tilted ? 'NOTHING COUNTS' : `+${res.gained} COINS`,
      priority: 8,
      anim: 'count',
      duration: 1.6,
    });
    const lines: (string | HTMLElement)[] = [];
    if (o.tilted) lines.push('The machine keeps everything that ball earned.');
    const grid = h(
      'div',
      { class: 'grid' },
      'Table',
      h('b', null, `${formatCoins(o.earned)}c`),
      'Bonus',
      h('b', null, o.bonus > 0 ? `${formatCoins(o.bonus)}c` : '—'),
      'Into Pocket',
      h('b', null, `${res.gained}c`),
      'Pocket',
      h('b', null, `${r.pocket}c`),
      'Balls left',
      h('b', null, String(ballsLeft(r))),
    );
    const notes: HTMLElement[] = [];
    if (o.extraBalls)
      notes.push(h('p', { class: 'good' }, `Extra ball: +${o.extraBalls} this round.`));
    for (const l of o.levelUps)
      notes.push(h('p', { class: 'good' }, `${l.toUpperCase()} is now level ${r.shotLevels[l]}.`));
    if (res.jobDone)
      notes.push(
        h(
          'p',
          { class: 'good' },
          `Job done: ${jobText(res.jobDone, r.job!.target)}. ${rewardText(res.jobDone, r.deadline)}.`,
        ),
      );
    else if (r.job && !r.job.done) {
      const def = jobDef(r.job.id);
      notes.push(
        h(
          'p',
          { class: 'dim' },
          `Job: ${jobText(def, r.job.target)} (${formatCoins(r.job.progress)}/${r.job.target})`,
        ),
      );
    }
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', null, o.tilted ? 'Tilt' : 'Ball over'),
        ...lines.map((l) => h('p', null, l)),
        grid,
        ...notes,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.afterBall() }, 'Continue'),
        ),
      ),
    );
  }

  afterBall(): void {
    const r = this.run!;
    if (ballsLeft(r) > 0) {
      this.enterCell();
      return;
    }
    const roundBefore = r.round;
    endRound(r);
    if (r.phase === 'deadline') this.enterDeadline();
    else {
      this.ui.toast(`Round ${roundBefore + 1} over. The bank pays interest.`);
      this.enterJobs();
    }
  }

  private enterDeadline(): void {
    const r = this.run!;
    this.mode = 'deadline';
    this.world.setMode('seated');
    const canPay = r.bank >= r.debt;
    const couldPay = r.bank + r.pocket >= r.debt;
    this.ui.show(
      h(
        'div',
        { class: 'panel atm' },
        h('h2', null, `Deadline ${r.deadline + 1}`),
        h('p', null, 'THE ATM CHIRPS. THE WARDEN IS WAITING.'),
        h(
          'div',
          { class: 'grid' },
          'Bank',
          h('b', null, `${r.bank}c`),
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Debt',
          h('b', null, `${r.debt}c`),
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { disabled: r.pocket < 1, onclick: () => this.enterAtm('deadline') },
            'Deposit',
          ),
          canPay
            ? h('button', { class: 'primary', onclick: () => this.payDeadline() }, 'Pay the debt')
            : h(
                'button',
                { class: couldPay ? '' : 'primary', onclick: () => this.payDeadline() },
                'Face it',
              ),
        ),
      ),
    );
  }

  private payDeadline(): void {
    const r = this.run!;
    const ok = settleDeadline(r);
    this.save.stats.bestDeadline = Math.max(this.save.stats.bestDeadline, r.deadline);
    this.persist();
    if (!ok) {
      this.fall();
      return;
    }
    if (r.phase === 'over') this.rapSheet();
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
    this.dmd.say(`THE WARDEN: ${this.warden('fall')}`);
    this.shake(1.2);
    this.flash(0.2);
    window.setTimeout(() => this.rapSheet(), 3000);
  }

  private rapSheet(): void {
    const r = this.run!;
    this.mode = 'rapsheet';
    this.renderer.tint.set(1, 1, 1);
    this.world.setMode('seated');
    const fell = r.result === 'fell';
    const drains = Object.entries(r.stats.drains)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h('h1', null, 'Rap sheet'),
        h(
          'p',
          null,
          fell
            ? `Fell at deadline ${r.deadline + 1} of ${r.deadlines}, owing ${r.debt}c.`
            : 'Paid in full. The door opens.',
        ),
        h(
          'div',
          { class: 'grid' },
          'Balls played',
          h('b', null, String(r.stats.balls)),
          'Coins earned',
          h('b', null, String(r.stats.coinsEarned)),
          'Best ball',
          h('b', null, `${r.stats.biggestBall}c`),
          'Skill shots',
          h('b', null, String(r.stats.skillShots)),
          'RIOTs',
          h('b', null, String(r.stats.riots)),
          'Biggest PAYDAY',
          h('b', null, `${Math.round(r.stats.biggestPayday)}c`),
          'Longest combo',
          h('b', null, String(r.stats.longestCombo)),
          'Jobs done',
          h('b', null, String(r.stats.jobsDone)),
          'Sentences survived',
          h('b', null, String(r.stats.sentencesSurvived)),
          'Loans',
          h('b', null, String(r.stats.loans)),
          'Paid early',
          h('b', null, String(r.stats.earlyPays)),
          'Red calls',
          h('b', null, `${r.stats.redCalls} (${r.bargains.length} taken)`),
          'Tilts',
          h('b', null, String(r.stats.tilts)),
        ),
        h('p', { class: 'dim' }, `Drains: ${drains || 'none'}`),
        h(
          'p',
          { class: 'dim' },
          `Build: ${r.charms.map((id) => charmDef(id).name).join(', ') || 'no charms'}`,
        ),
        h('p', { class: 'dim' }, 'A new mark is scratched into the wall.'),
        h('p', { class: 'tally' }, tallyMarks(this.save.tallies)),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.enterTitle() }, 'Again'),
        ),
      ),
    );
  }

  /** Table music while a ball is live; the cell's drone and clock otherwise. */
  private updateMusic(): void {
    const m = this.mode;
    music.setMode(
      m === 'play' || m === 'tally' ? 'table' : m === 'fall' || m === 'rapsheet' ? 'off' : 'cell',
    );
    const g = this.mode === 'play' ? this.session?.game : null;
    const r = this.run;
    const st = music.state;
    st.combo = g && g.combo.active(g.time) ? g.combo.count : 0;
    st.riot = !!g?.riot;
    st.sentence = !!r && sentenceActive(r);
    st.tension = r ? Math.min(1, r.round / Math.max(1, roundsIn(r) - 1)) : 0;
    music.update();
  }

  // ------------------------------------------------------------------ camera / HUD

  private updateCamera(dt: number): void {
    if (this.mode === 'fall') {
      this.fallT += dt;
      const k = Math.min(1, this.fallT / 2.4);
      this.world.shake.y -= dt * 30 * k;
      this.renderer.tint.setScalar(Math.max(0, 1 - k * 1.2));
      return;
    }
    const m: CamMode =
      this.mode === 'play'
        ? (this.devCam ?? (this.save.settings.camera === 'seated' ? 'seated' : 'play'))
        : this.mode === 'title'
          ? 'title'
          : 'seated';
    if (this.world.mode !== m) this.world.setMode(m);
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

  private hudCache = new Map<HTMLElement, string>();

  /** Set innerHTML only when it changed (the HUD updates every frame). */
  private setHtml(el: HTMLElement, html: string): void {
    if (this.hudCache.get(el) === html) return;
    this.hudCache.set(el, html);
    el.innerHTML = html;
  }

  private updateHud(shown: BallSession | null): void {
    const r = this.run;
    const playing = this.mode === 'play' || this.mode === 'tally';
    this.hud.style.display = this.mode === 'title' ? 'none' : '';
    if (r) {
      const g = shown && playing ? shown.game : null;
      let left = `Pocket <b>${r.pocket}c</b>${g ? ` <span class="earn">+${formatCoins(g.earned)}</span>` : ''}<br>Bank <b>${r.bank}c</b><br><span class="debt">Debt <b>${r.phase === 'phone' ? 'paid' : `${r.debt}c`}</b></span>`;
      if (g) {
        left += `<br>Bonus <b>${formatCoins(g.bonus)}</b> x${g.bonusMult}`;
        if (g.luck > 0) left += `<br>Luck <b>${g.luck}</b>`;
      }
      this.setHtml(this.hudStats, left);
      let right = `Deadline ${r.deadline + 1}/${r.deadlines}<br>Round ${r.round + 1}/${ECONOMY.roundsPerDeadline}<br>Ball ${Math.min(r.ballsThisRound, r.ballsPlayed + (playing ? 1 : 0))}/${r.ballsThisRound}`;
      if (r.job) {
        const def = jobDef(r.job.id);
        const prog = g ? g.jobProgress() : r.job.progress;
        const done = r.job.done || (g?.jobDone ?? false);
        right += `<div class="job${done ? ' done' : ''}">${jobText(def, r.job.target)}<br><b>${done ? 'DONE' : `${formatCoins(Math.min(prog, r.job.target))}/${r.job.target}`}</b></div>`;
      }
      if (r.tickets || r.keys)
        right += `<br>Tickets <b>${r.tickets}</b>${r.keys ? ` · Keys <b>${r.keys}</b>` : ''}`;
      const actives = g ? g.ctx.actives : [];
      if (actives.length)
        right += `<div class="actives">${actives
          .map(
            (a) =>
              `[${a.slot}] ${charmDef(a.id).name} ${'●'.repeat(a.charges)}${'○'.repeat(a.max - a.charges)}`,
          )
          .join('<br>')}<br><small>B fires the first charged</small></div>`;
      this.setHtml(this.hudRight, right);
    }
    const pull = shown ? shown.sim.plungerPull : 0;
    this.hudPlunger.style.display =
      playing && shown && shown.sim.balls.some((b) => b.inShooter && b.state === 'field')
        ? ''
        : 'none';
    (this.hudPlunger.firstChild as HTMLElement).style.height = `${Math.round(pull * 100)}%`;
    // Mark the pull that drops into the lit Roll Call lane.
    const mark = this.hudPlunger.lastChild as HTMLElement;
    const armed = shown ? shown.game.lamps.skill !== Lamp.Off : false;
    mark.style.display = armed ? '' : 'none';
    if (shown && armed)
      mark.style.bottom = `${Math.round(shown.sim.cfg.plunger.lanePull[shown.game.machine.skillLane] * 100)}%`;
  }
}

function tallyMarks(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += (i + 1) % 5 === 0 ? '/ ' : '|';
  return s || '—';
}

function rewardText(def: JobDef, deadline: number): string {
  const r = def.reward;
  const parts: string[] = [];
  if (r.keys) parts.push(`${r.keys} KEY`);
  if (r.tickets) parts.push(`${r.tickets} ticket${r.tickets > 1 ? 's' : ''}`);
  const coins = jobCoins(def, deadline);
  if (coins) parts.push(`${coins}c`);
  if (r.level) parts.push(`+1 ${r.level} level`);
  return `Reward: ${parts.join(', ')}`;
}

function levelsText(r: RunState): string {
  return (Object.entries(r.shotLevels) as [string, number][])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
}
