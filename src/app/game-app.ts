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
import { Input, type Action } from './input';
import { UI, h } from './ui';
import { loadSave, writeSave, type SaveData } from './save';
import { BallSession } from '../rules/session';
import { Lamp, type GameEvent } from '../rules/types';
import { emptyInput, type SimInput } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import { Bot, type BotSkillName } from '../bot/bot';
import { defaultSnapshot } from '../bot/autoplay';
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
  type RunState,
} from '../rules/run';
import { ECONOMY } from '../content/balance';

const STEP = 1 / 240;
const STEP_MS = 1000 / 240;

export type AppMode =
  | 'title'
  | 'buy'
  | 'cell'
  | 'atm'
  | 'play'
  | 'ballEnd'
  | 'deadline'
  | 'fall'
  | 'rapsheet';

export class GameApp {
  readonly renderer: RetroRenderer;
  readonly world: World;
  readonly dmd = new Dmd(4);
  readonly pops = new NumberPops();
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
  private simCursor = 0;
  private gameEvents: GameEvent[] = [];
  private ballEarned = 0;
  private ballSkill = 0;
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
        this.hitStop -= dt;
        this.wallClock = now;
        this.input.events.length = 0;
      } else {
        if (this.paused) {
          this.acc = this.stepRequests * STEP;
          this.stepRequests = 0;
        } else this.acc += dt * this.timeScale;
        let budget = 60; // never spiral
        while (this.acc >= STEP && budget-- > 0) {
          this.wallClock += STEP_MS / this.timeScale;
          const inp = act.bot ? act.bot.decide(act.session.sim) : this.stepInput(this.wallClock);
          act.session.step(inp);
          this.consumeSimEvents(act.session, act === null);
          this.acc -= STEP;
          if (act.session.over) break;
        }
        if (budget <= 0) this.acc = 0;
        this.wallClock = Math.max(this.wallClock, now - 100);
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
    const shown = act?.session ?? this.session;
    if (shown)
      this.world.table.update(shown.sim, shown.game.lamps, Math.min(1, Math.max(0, alpha)), dt);
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
        default:
          break;
      }
    }
    if (n) ev.splice(0, n);
    inp.pull = this.input.analogPull;
    return inp;
  }

  // ------------------------------------------------------------------ events -> presentation

  private consumeSimEvents(s: BallSession, _attract: boolean): void {
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
    for (const e of evs) {
      switch (e.t) {
        case 'score': {
          const p = this.world.table.worldOf(e.x, e.y, 1.6, this.tmpV);
          this.pops.spawn(
            `+${formatCoins(e.amount)}`,
            p,
            e.amount >= 3 ? '#ffe28a' : '#ffb347',
            e.amount >= 3,
          );
          if (e.amount >= 1) audio.coin(Math.min(8, Math.floor(e.amount)));
          this.ballEarned += e.amount;
          break;
        }
        case 'callout':
          this.dmd.show({ text: e.text, sub: e.sub, priority: e.priority, anim: e.anim });
          audio.callout(e.priority);
          break;
        case 'skillShot':
          this.ballSkill++;
          audio.knocker();
          this.flash(0.25);
          this.shake(0.6);
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
    const bot = new Bot('expert', seed ^ 0x5bd1e995);
    bot.skillLane = () => s.game.machine.skillLane;
    this.attract = { session: s, bot };
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
    this.dmd.say('THE WARDEN: YOU OWE ME. PAY BY THE DEADLINE OR FALL.');
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

  startBall(): void {
    const r = this.run!;
    if (ballsLeft(r) <= 0) return;
    this.ui.hide();
    const snap = nextBall(r);
    this.ballEarned = 0;
    this.ballSkill = 0;
    this.session = new BallSession(snap, this.onGameEvent);
    const live = this.session;
    if (this.autoBot) this.autoBot.skillLane = () => live.game.machine.skillLane;
    this.simCursor = 0;
    this.acc = 0;
    this.input.events.length = 0;
    this.simInput = emptyInput();
    this.mode = 'play';
    this.world.setMode(this.save.settings.camera === 'seated' ? 'seated' : 'play');
  }

  private onBallOver(): void {
    const r = this.run!;
    const s = this.session!;
    this.mode = 'ballEnd';
    const g = s.game;
    let cause = 'center';
    s.sim.events.read(Math.max(0, s.sim.events.head - 64), (e) => {
      if (e.type === 'drain') cause = e.id;
    });
    const gained = finishBall(r, {
      earned: g.earned,
      tilted: g.tilted,
      drainCause: cause,
      machine: s.game.machine,
      skillShots: this.ballSkill,
    });
    this.save.stats.balls++;
    this.save.stats.coins += gained;
    this.persist();
    this.dmd.show({
      text: g.tilted ? 'TILTED' : 'BALL OVER',
      sub: g.tilted ? 'NOTHING COUNTS' : `+${gained} COINS`,
      priority: 8,
      anim: 'count',
      duration: 1.6,
    });
    this.ui.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', null, g.tilted ? 'Tilt' : 'Ball over'),
        h(
          'p',
          null,
          g.tilted
            ? 'The machine keeps everything that ball earned.'
            : `Earned ${gained} coins (${formatCoins(g.earned)} on the table).`,
        ),
        h(
          'div',
          { class: 'grid' },
          'Pocket',
          h('b', null, `${r.pocket}c`),
          'Balls left',
          h('b', null, String(ballsLeft(r))),
        ),
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
      this.enterBuy();
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
          h(
            'button',
            {
              class: canPay ? 'primary' : '',
              disabled: !canPay,
              onclick: () => this.payDeadline(),
            },
            'Pay the debt',
          ),
          h(
            'button',
            { class: !couldPay ? 'primary' : '', onclick: () => this.payDeadline() },
            canPay ? 'Hold' : 'Face it',
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
    audio.phoneRing();
    this.dmd.say('THE PHONE RINGS. "PAID. FOR NOW."');
    if (r.phase === 'over') this.rapSheet();
    else this.enterBuy();
  }

  fall(): void {
    this.mode = 'fall';
    this.ui.hide();
    this.fallT = 0;
    this.world.setMode('fall');
    audio.trapdoor();
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
            ? `Fell at deadline ${r.deadline + 1}, owing ${r.debt}c.`
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
          'Tilts',
          h('b', null, String(r.stats.tilts)),
        ),
        h('p', { class: 'dim' }, `Drains: ${drains || 'none'}`),
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
    const earned = this.mode === 'play' && this.session ? this.session.game.earned : 0;
    d.text(`${formatCoins(r.pocket + earned)}`, 64, 3, { scale: 2, align: 'center' });
    d.text(`BALL ${r.ballsPlayed + (this.mode === 'play' ? 1 : 0)}/${r.ballsThisRound}`, 2, 25, {
      font: FONT_SMALL,
      v: 10,
    });
    d.text(`DEBT ${r.debt}`, 126, 25, { font: FONT_SMALL, v: 10, align: 'right' });
  }

  private updateHud(shown: BallSession | null): void {
    const r = this.run;
    const playing = this.mode === 'play';
    this.hud.style.display = this.mode === 'title' ? 'none' : '';
    if (r) {
      const earned = shown && playing ? shown.game.earned : 0;
      this.hudStats.innerHTML = `Pocket <b>${r.pocket}c</b>${playing ? ` <span style="color:#ffd27a">+${formatCoins(earned)}</span>` : ''}<br>Bank <b>${r.bank}c</b><br><span class="debt">Debt <b>${r.debt}c</b></span>`;
      this.hudRight.innerHTML = `Deadline ${r.deadline + 1}/${r.deadlines}<br>Round ${r.round + 1}/${ECONOMY.roundsPerDeadline}<br>Ball ${r.ballsPlayed + (playing ? 1 : 0)}/${r.ballsThisRound}`;
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
