/**
 * TableGame: the per-ball rules of DEBTOR'S PRISON. Consumes SimEvents after every physics
 * step, scores hits, runs combos, Bonus, Lockup / RIOT / PAYDAY, Hole awards, hurry-up,
 * kickback, luck, ball save, tilt and skill shots, tracks the round's Job, and drives the
 * machine (ejects, locks, multiball serves). Emits GameEvents for presentation.
 * Node-safe and deterministic.
 */
import type { PinballSim, SimInput } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import type { ShotType } from '../sim/table-def';
import { Rng } from '../core/rng';
import {
  AWARDS,
  BALL,
  BONUS,
  COMBO,
  HOLE,
  HURRY,
  JAILBREAK,
  LUCK,
  RIOT,
  SCORE,
  SECRET,
  TILT,
} from '../content/balance';
import { emptyBallStats, type BallStats } from '../content/jobs';
import { ComboTracker, comboName } from './combo';
import { BALL_HOOKS, type BallHooks, type BallRules } from './charm-hooks';
import { bonusTotal } from './bonus';
import { Lamp, type AwardId, type GameEvent, type GameEventSink } from './types';
import type { BallOutcome } from './run';

export const SHOT_TYPES: ShotType[] = [
  'yard',
  'sling',
  'lanes',
  'cellblock',
  'chute',
  'perimeter',
  'searchlight',
  'hole',
];

/** The round's Job as the ball sees it. */
export interface BallJob {
  id: string;
  stat: keyof BallStats;
  mode: 'sum' | 'max';
  /** Progress before this ball. */
  base: number;
  target: number;
  done: boolean;
}

/** Run-derived, read-only facts the ball needs. Plain data so it can be snapshotted. */
export interface BallContext {
  shotLevels: Record<ShotType, number>;
  /** Per-shot pay multipliers from charms (Jar of Teeth: yard 3). */
  shotMult: Record<ShotType, number>;
  /** Ball save seconds for this ball. */
  ballSave: number;
  /** Tilt meter multiplier (Shakedown 2x, Brawler 2x). */
  tiltSensitivity: number;
  /** Extra tilt warnings (Iron Lockbar). */
  extraWarnings: number;
  /** Global coin multiplier for this ball. */
  payMult: number;
  /** 1-based ball number within the round and balls in the round (for callouts). */
  ballNumber: number;
  ballsInRound: number;
  luck: number;
  comboWindow: number;
  comboStart: number;
  comboStep: number;
  bonusMaxMult: number;
  /** The Bonus multiplier each ball starts at (Chipped Abacus 2). */
  bonusStart: number;
  /** Bonus added per paid coin. */
  bonusShare: number;
  /** Fraction of the Bonus kept (Taxman 0.75, Hellfire Rubber 0) and times tallied. */
  bonusKeep: number;
  bonusTimes: number;
  /** Top lanes don't raise the Bonus multiplier (Dead Lanes). */
  deadLanes: boolean;
  /** Lockup can't be lit (Lockdown). */
  lockdown: boolean;
  locksNeeded: number;
  riotBalls: number;
  /** PAYDAY value carried in (Hoarder's Sack), 0 = start from base. */
  paydayCarry: number;
  /** Spark chance and luck multiplier (Live Wire 2). */
  sparkMult: number;
  /** The Bonus multiplier carries over between balls in a round (Held Breath). */
  holdBonusMult: boolean;
  /** The kickback can never be lit (Bad Wiring). */
  noKickback: boolean;
  /** Blackout Sentence: lamps out except the ball's halo (presentation only). */
  blackout: boolean;
  /** Owned charm ids (behaviour hooks). */
  charms: string[];
  /** Active charms by charm slot, with charges left. */
  actives: ActiveSlot[];
  /** Seconds added to the Hole's hold (Feeding Bowl -1). */
  holeHoldAdd: number;
  /** Chalk: the top lanes start complete. */
  chalk: boolean;
  /** Moonshine: the camera sways (presentation). */
  moonshine: boolean;
  /** The neighbor's tip: the Tunnel pays (Cell Block knocked down top to bottom). */
  tunnel: boolean;
  /** JAILBREAK is lit at the Hole (Last Call with the Keys). */
  jailbreak: boolean;
  job: BallJob | null;
}

export interface ActiveSlot {
  /** 1-based charm slot (number keys). */
  slot: number;
  id: string;
  action: 'ballSave' | 'slowmo' | 'crowbar' | 'twinYolk';
  charges: number;
  max: number;
}

/** Machine state that persists between balls within a round. */
export interface MachineState {
  /** Top lanes completed this set (A, B, C). */
  lanes: boolean[];
  /** Index of the lane lit for the Roll Call skill shot. */
  skillLane: number;
  /** Drop targets up/down. */
  drops: boolean[];
  locks: number;
  lockLit: boolean;
  kickback: boolean;
  /** Next award on the Hole ladder, and whether it is lit. */
  award: number;
  awardLit: boolean;
  /** Bonus multiplier carried between balls (Held Breath); otherwise each ball starts at 1. */
  bonusMult: number;
}

export function newMachineState(): MachineState {
  return {
    lanes: [false, false, false],
    skillLane: 1,
    drops: [true, true, true],
    locks: 0,
    lockLit: false,
    kickback: false,
    award: 0,
    awardLit: true,
    bonusMult: 1,
  };
}

export function defaultBallContext(): BallContext {
  const levels = {} as Record<ShotType, number>;
  const mult = {} as Record<ShotType, number>;
  for (const s of SHOT_TYPES) {
    levels[s] = 1;
    mult[s] = 1;
  }
  return {
    shotLevels: levels,
    shotMult: mult,
    ballSave: BALL.ballSave,
    tiltSensitivity: 1,
    extraWarnings: 0,
    payMult: 1,
    ballNumber: 1,
    ballsInRound: 1,
    luck: 0,
    comboWindow: COMBO.window,
    comboStart: COMBO.start,
    comboStep: COMBO.step,
    bonusMaxMult: BONUS.maxMult,
    bonusStart: 1,
    bonusShare: BONUS.share,
    bonusKeep: 1,
    bonusTimes: 1,
    deadLanes: false,
    lockdown: false,
    locksNeeded: RIOT.locksNeeded,
    riotBalls: RIOT.balls,
    paydayCarry: 0,
    sparkMult: 1,
    holdBonusMult: false,
    noKickback: false,
    blackout: false,
    charms: [],
    actives: [],
    holeHoldAdd: 0,
    chalk: false,
    moonshine: false,
    tunnel: false,
    jailbreak: false,
    job: null,
  };
}

const LANE_IDS = ['laneA', 'laneB', 'laneC'];
const ACTIVE_SAVE = 10; // Panic Button seconds
const ACTIVE_SLOWMO = 4; // Pocket Watch seconds at half speed
const TWIN_SAVE = 6; // Twin Yolk multiball save
const LADDER_SHOTS: ShotType[] = ['chute', 'perimeter', 'hole', 'cellblock'];
const FAVOURITES = LADDER_SHOTS;
const PERIM_WINDOW = 2.2; // seconds between orbit entry and top switch
const SKILL_WINDOW = 4; // seconds after launch for the skill shot to resolve
const SUPER_WINDOW = 6;
/** The Tunnel: drop targets knocked down from the top (index 2) to the bottom (index 0). */
const TUNNEL_ORDER = [2, 1, 0];

/** JAILBREAK's lit shots. */
export type JailbreakShot = 'chute' | 'perimL' | 'perimR' | 'hole' | 'cellblock';
export const JAILBREAK_SHOTS: JailbreakShot[] = ['chute', 'perimL', 'perimR', 'hole', 'cellblock'];
const JB_LAMP: Record<JailbreakShot, string> = {
  chute: 'arrowChute',
  perimL: 'arrowPerimL',
  perimR: 'arrowPerimR',
  hole: 'arrowHole',
  cellblock: 'arrowCell',
};

export const AWARD_NAMES: Record<AwardId, string> = {
  bonusX: 'BONUS X',
  kickback: 'KICKBACK',
  hurryUp: 'HURRY-UP',
  shotLevel: 'LEVEL UP',
  extraBall: 'EXTRA BALL',
};

export class TableGame implements BallRules {
  /** Fractional coins earned on the table this ball (committed on a clean drain). */
  earned = 0;
  /** Bonus collected so far this ball and the Bonus multiplier. */
  bonus = 0;
  bonusMult: number;
  /** Final Bonus tally (set when the ball ends). */
  bonusPaid = 0;
  tilted = false;
  tiltMeter = 0;
  tiltWarnings = 0;
  over = false;
  readonly lamps: Record<string, Lamp> = {};
  readonly stats: BallStats = emptyBallStats();
  /** Shot levels for this ball (Hole awards raise them immediately). */
  readonly levels: Record<ShotType, number>;
  /** Level-ups earned this ball, applied to the run afterwards. */
  readonly levelUps: ShotType[] = [];
  extraBalls = 0;
  luck: number;
  readonly combo: ComboTracker;
  riot = false;
  payday = 0;
  /** PAYDAY value when the last RIOT ended (Hoarder's Sack carries it). */
  paydayEnd = 0;
  /** PAYDAY value the lit SUPER PAYDAY multiplies. */
  private superValue = 0;
  superLit = false;
  /** Hurry-up seconds left (<= 0: off). */
  hurryLeft = 0;
  jobDone = false;
  /** Cause of the most recent drain. */
  drainCause = '';
  /** Seconds of ball save left (counts below zero through the grace period). */
  ballSaveLeft = 0;
  riotSaveLeft = 0;
  private saveStarted = false;
  private saved = false;
  private skillArmed = true;
  private skillTimer = -1;
  private superArmed = -1;
  private perimArm = { L: -1e9, R: -1e9 };
  private holeHolds = new Map<number, number>();
  /** Pending RIOT releases: steps until each extra ball comes out. */
  private releases: { steps: number; fromHole: boolean }[] = [];
  private hitCounts = {} as Record<ShotType, number>;
  private prevLeft = false;
  private prevRight = false;
  private launched = false;
  private cursor = 0;
  private readonly dt: number;
  private readonly rng: Rng;
  private readonly hooks: BallHooks[];
  private readonly owned: ReadonlySet<string>;
  /** Extra-ball multiball (Twin Yolk) save seconds left. */
  private multiSaveLeft = 0;
  /** Cell Block cleared and waiting for the sim to reset the targets. */
  private cellCleared = false;
  /** Drop order since the bank was last up (null: unknown, it started part-down). */
  private dropSeq: number[] | null;
  /** JAILBREAK running, its lit shots, shots made and how it ended. */
  jailbreak = false;
  readonly jbLit = new Set<JailbreakShot>();
  jbShots = 0;
  jbResult: 'none' | 'failed' | 'escaped' = 'none';
  private jbSaveLeft = 0;

  constructor(
    readonly sim: PinballSim,
    readonly ctx: BallContext,
    readonly machine: MachineState,
    private readonly emit: GameEventSink = () => {},
  ) {
    this.dt = sim.dt;
    this.cursor = sim.events.head;
    // Own stream, derived from the sim's seed state without advancing the physics stream.
    const st = sim.rng.getState();
    this.rng = new Rng((st.a ^ Math.imul(st.b, 0x9e3779b1) ^ 0x51ed270b) >>> 0);
    this.levels = { ...ctx.shotLevels };
    this.owned = new Set(ctx.charms);
    this.hooks = ctx.charms.map((id) => BALL_HOOKS[id]).filter((h): h is BallHooks => !!h);
    for (const s of SHOT_TYPES) this.hitCounts[s] = 0;
    this.luck = ctx.luck;
    const start = Math.min(ctx.bonusStart, ctx.bonusMaxMult);
    this.bonusMult = ctx.holdBonusMult
      ? Math.max(start, Math.min(machine.bonusMult, ctx.bonusMaxMult))
      : start;
    this.combo = new ComboTracker(ctx.comboWindow, ctx.comboStart, ctx.comboStep);
    this.payday = ctx.paydayCarry > 0 ? ctx.paydayCarry : RIOT.paydayBase;
    if (ctx.lockdown) machine.lockLit = false;
    this.dropSeq = machine.drops.every(Boolean) ? [] : null;
    sim.setKickback(machine.kickback);
    this.refreshLamps();
  }

  get time(): number {
    return this.sim.step * this.dt;
  }

  /** Start the ball: serve to the plunger. */
  start(): void {
    this.sim.serveBall(false);
    this.skillArmed = true;
    if (this.ctx.chalk) this.completeLanes(9.2, 33);
    this.emit({
      t: 'callout',
      text: 'ROLL CALL',
      sub: `BALL ${this.ctx.ballNumber}/${this.ctx.ballsInRound}`,
      priority: 1,
      anim: 'rollcall',
    });
  }

  // ------------------------------------------------------------------ step hooks

  /** Before the physics step: lane change on flipper presses, tilt decay. */
  preStep(input: SimInput): void {
    const leftEdge = input.left && !this.prevLeft;
    const rightEdge = input.right && !this.prevRight;
    this.prevLeft = input.left;
    this.prevRight = input.right;
    if (!this.tilted && (leftEdge || rightEdge)) this.laneChange(leftEdge ? -1 : 1);
    if (input.active && !this.tilted && !this.over) this.activate(input.active);
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT.decay * this.dt);
  }

  /** After the physics step: consume events, run timers, decide ball over. */
  postStep(): void {
    this.cursor = this.sim.events.read(this.cursor, this.onEvent);
    const dt = this.dt;
    if (this.launched && !this.over) this.stats.seconds += dt;
    if (this.saveStarted && this.ballSaveLeft > -BALL.ballSaveGrace) {
      const was = this.ballSaveLeft;
      this.ballSaveLeft -= dt;
      if ((was > 0 && this.ballSaveLeft <= 0) || (was > 2 && this.ballSaveLeft <= 2))
        this.refreshLamps();
    }
    if (this.riotSaveLeft > 0) this.riotSaveLeft -= dt;
    if (this.multiSaveLeft > 0) this.multiSaveLeft -= dt;
    if (this.jbSaveLeft > 0) this.jbSaveLeft -= dt;
    if (this.skillTimer >= 0) {
      this.skillTimer += dt;
      if (this.skillTimer > SKILL_WINDOW) this.endSkill();
    }
    if (this.superArmed >= 0) {
      this.superArmed += dt;
      if (this.superArmed > SUPER_WINDOW) {
        this.superArmed = -1;
        this.refreshLamps();
      }
    }
    if (this.hurryLeft > 0) {
      this.hurryLeft -= dt;
      if (this.hurryLeft <= 0) {
        this.emit({ t: 'hurry', on: false });
        this.refreshLamps();
      }
    }
    for (const [id, left] of this.holeHolds) {
      if (left <= 1) {
        this.holeHolds.delete(id);
        this.sim.ejectHeld(id);
      } else this.holeHolds.set(id, left - 1);
    }
    for (let i = this.releases.length - 1; i >= 0; i--) {
      const r = this.releases[i];
      if (--r.steps > 0) continue;
      this.releases.splice(i, 1);
      if (r.fromHole) this.sim.ejectHeld(this.sim.spawnHeld().id);
      else this.sim.serveBall(true);
    }
    if (
      this.riot &&
      this.releases.length === 0 &&
      this.riotSaveLeft <= 0 &&
      this.sim.ballsInPlay() <= 1
    )
      this.endRiot();
    this.checkJob();
    if (!this.over && this.launched && this.sim.ballsInPlay() === 0) this.endBall();
  }

  // ------------------------------------------------------------------ events

  private readonly onEvent = (e: SimEvent): void => {
    switch (e.type) {
      case 'launch':
        this.launched = true;
        if (this.skillArmed && e.dir === 0) this.skillTimer = 0;
        if (e.dir === 0) this.maybeSpark();
        break;
      case 'served':
        this.launched = true;
        break;
      case 'trigger':
        this.onTrigger(e);
        break;
      case 'pop':
        this.stats.yardHits++;
        this.pay('yard', SCORE.pop, e.x, e.y, 1, e.id);
        this.endSkill();
        break;
      case 'sling':
        this.pay('sling', SCORE.sling, e.x, e.y);
        this.endSkill();
        break;
      case 'drop':
        this.onDrop(e);
        break;
      case 'dropsReset':
        this.cellCleared = false;
        break;
      case 'spin':
        this.stats.spins += e.value;
        this.pay('searchlight', SCORE.searchlightSpin * e.value, e.x, e.y);
        break;
      case 'chuteMade':
        this.onChute(e);
        break;
      case 'holeCapture':
        this.onHole(e);
        break;
      case 'kickback':
        this.machine.kickback = false;
        this.sim.setKickback(false);
        this.emit({ t: 'callout', text: 'KICKBACK', priority: 3 });
        this.refreshLamps();
        break;
      case 'diverted':
        this.endSkill();
        break;
      case 'transportExit':
        if (e.id === 'skillWire') {
          this.superArmed = 0;
          this.emit({
            t: 'callout',
            text: 'SUPER SKILL',
            sub: 'SHOOT THE LEFT PERIMETER',
            priority: 3,
          });
          this.refreshLamps();
        }
        break;
      case 'nudge':
        this.onNudge();
        break;
      case 'drain':
        this.onDrain(e);
        break;
      default:
        break;
    }
  };

  private onTrigger(e: SimEvent): void {
    const id = e.id;
    if (id === 'shooterExit' && e.dir > 0) {
      if (!this.saveStarted && this.ctx.ballSave > 0) {
        this.saveStarted = true;
        this.ballSaveLeft = this.ctx.ballSave;
        this.refreshLamps();
      }
      return;
    }
    const lane = LANE_IDS.indexOf(id);
    if (lane >= 0 && e.dir > 0) {
      this.onLane(lane, e.x, e.y);
      return;
    }
    if (e.dir > 0) {
      switch (id) {
        case 'perimL':
          this.perimArm.L = e.step;
          break;
        case 'perimR':
          this.perimArm.R = e.step;
          break;
        case 'perimLTop':
          if ((e.step - this.perimArm.L) * this.dt < PERIM_WINDOW) {
            this.perimArm.L = -1e9;
            this.onPerimeter('L', e);
          }
          break;
        case 'perimRTop':
          if ((e.step - this.perimArm.R) * this.dt < PERIM_WINDOW) {
            this.perimArm.R = -1e9;
            this.onPerimeter('R', e);
          }
          break;
        case 'inlaneL':
        case 'inlaneR':
          this.pay('lanes', SCORE.inlane, e.x, e.y);
          this.endSkill();
          break;
        case 'outlaneL':
        case 'outlaneR':
          this.pay('lanes', SCORE.outlane, e.x, e.y);
          this.maybeLuckyBounce(e);
          break;
      }
    }
  }

  private onLane(lane: number, x: number, y: number): void {
    if (this.skillArmed && this.skillTimer >= 0) {
      if (lane === this.machine.skillLane) {
        this.stats.skillShots++;
        this.pay('lanes', SCORE.skillShot, x, y);
        this.emit({ t: 'skillShot', super: false });
        this.emit({
          t: 'callout',
          text: 'ROLL CALL!',
          sub: 'SKILL SHOT',
          priority: 4,
          anim: 'skill',
        });
      }
      this.endSkill();
    }
    this.pay('lanes', SCORE.lane, x, y);
    this.machine.lanes[lane] = true;
    if (this.machine.lanes.every(Boolean)) this.completeLanes(x, y);
    this.refreshLamps();
  }

  /** Light the first unlit top lane (orbits, Roll Call Sheet); a full set completes. */
  spotLane(x = 14.9, y = 35): void {
    const i = this.machine.lanes.indexOf(false);
    if (i < 0) return;
    this.machine.lanes[i] = true;
    if (this.machine.lanes.every(Boolean)) this.completeLanes(x, y);
    this.refreshLamps();
  }

  /** A top-lane set: Bonus multiplier up (unless Dead Lanes) and the Hole award lights. */
  private completeLanes(x: number, y: number): void {
    this.machine.lanes.fill(false);
    this.stats.laneSets++;
    this.pay('lanes', SCORE.laneSet, x, y);
    this.emit({ t: 'laneComplete' });
    if (!this.ctx.deadLanes && this.bonusMult < this.ctx.bonusMaxMult) {
      this.bonusMult++;
      this.emit({ t: 'bonusMult', mult: this.bonusMult });
      this.emit({ t: 'callout', text: 'HEADCOUNT', sub: `BONUS X${this.bonusMult}`, priority: 3 });
    } else this.emit({ t: 'callout', text: 'HEADCOUNT', sub: 'LANES COMPLETE', priority: 2 });
    this.setComplete('lanes');
    this.refreshLamps();
  }

  private onPerimeter(side: 'L' | 'R', e: SimEvent): void {
    this.jbShot(side === 'L' ? 'perimL' : 'perimR', e.x, e.y);
    // The orbit runs past the top lanes: it spots the next one.
    this.spotLane(e.x, e.y);
    this.stats.perimeters++;
    const mult = this.major();
    this.pay('perimeter', SCORE.perimeter * mult, e.x, e.y, mult);
    if (mult === 1) this.emit({ t: 'callout', text: 'THE PERIMETER', priority: 2 });
    if (side === 'L' && this.superArmed >= 0) {
      this.superArmed = -1;
      this.stats.superSkillShots++;
      this.pay('perimeter', SCORE.superSkillShot, e.x, e.y);
      this.emit({ t: 'skillShot', super: true });
      this.emit({
        t: 'callout',
        text: 'SUPER SKILL!',
        sub: 'OVER THE WALL',
        priority: 5,
        anim: 'skill',
      });
      this.refreshLamps();
    }
  }

  private onChute(e: SimEvent): void {
    this.jbShot('chute', e.x, e.y);
    this.stats.chutes++;
    this.endSkill();
    const mult = this.major();
    this.pay('chute', SCORE.chute * mult, e.x, e.y, mult);
    if (this.riot) {
      const amount = this.shotValue('chute', this.payday) * mult * this.paydayMult();
      this.stats.paydays++;
      this.stats.biggestPayday = Math.max(this.stats.biggestPayday, amount);
      this.payRaw(amount, e.x, e.y);
      // Collecting resets PAYDAY: let it grow for a bigger one, or bank it now.
      this.superValue = this.payday;
      this.payday = RIOT.paydayBase;
      this.superLit = true;
      this.emit({ t: 'payday', amount, super: false });
      this.onPaydayHooks(false);
      this.emit({
        t: 'callout',
        text: 'PAYDAY!',
        sub: `+${fmt(amount)}  SUPER AT THE HOLE`,
        priority: 7,
        anim: 'payday',
      });
    } else if (this.hurryLeft > 0) {
      const k = 1 - this.hurryLeft / HURRY.seconds;
      const amount = this.shotValue('chute', HURRY.start + (HURRY.end - HURRY.start) * k) * mult;
      this.payRaw(amount, e.x, e.y);
      this.hurryLeft = 0;
      this.emit({ t: 'hurry', on: false });
      this.emit({ t: 'callout', text: 'HURRY-UP!', sub: `+${fmt(amount)}`, priority: 5 });
    } else if (mult === 1) this.emit({ t: 'callout', text: 'THE CHUTE', priority: 2 });
    this.refreshLamps();
  }

  private onHole(e: SimEvent): void {
    this.stats.holes++;
    this.endSkill();
    const mult = this.major();
    this.pay('hole', SCORE.hole * mult, e.x, e.y, mult);
    let locked = false;
    if (this.jailbreak) {
      this.jbShot('hole', e.x, e.y);
    } else if (this.ctx.jailbreak && this.jbResult === 'none' && !this.riot) {
      this.startJailbreak();
    } else if (this.riot && this.superLit) {
      const amount =
        this.shotValue('hole', this.superValue * RIOT.superMult) * mult * this.paydayMult();
      this.superLit = false;
      this.stats.superPaydays++;
      this.stats.biggestPayday = Math.max(this.stats.biggestPayday, amount);
      this.payRaw(amount, e.x, e.y);
      this.emit({ t: 'payday', amount, super: true });
      this.onPaydayHooks(true);
      this.emit({
        t: 'callout',
        text: 'SUPER PAYDAY!',
        sub: `+${fmt(amount)}`,
        priority: 8,
        anim: 'payday',
      });
    } else if (!this.riot && this.machine.lockLit && !this.ctx.lockdown) {
      locked = this.lock(e.ballId);
    } else if (this.machine.awardLit) {
      this.collectAward();
    } else if (mult === 1) this.emit({ t: 'callout', text: 'THE HOLE', priority: 2 });
    if (!locked) this.holeHolds.set(e.ballId, Math.round(this.holeHold() / this.dt));
    this.refreshLamps();
  }

  /** Lock the captured ball. Returns true if the ball left play (not starting RIOT). */
  private lock(ballId: number): boolean {
    this.machine.locks++;
    // Each Cell Block clear lights Lockup for one lock.
    this.machine.lockLit = false;
    this.stats.locks++;
    const needed = this.ctx.locksNeeded;
    this.emit({ t: 'lock', locks: this.machine.locks, needed });
    if (this.machine.locks >= needed) {
      this.startRiot();
      return false;
    }
    this.emit({
      t: 'callout',
      text: 'LOCKED UP',
      sub: `BALL ${this.machine.locks} OF ${needed}`,
      priority: 5,
    });
    this.sim.lockHeld(ballId);
    if (this.sim.ballsInPlay() === 0) this.sim.serveBall(false);
    return true;
  }

  private startRiot(): void {
    this.riot = true;
    this.stats.riots++;
    this.machine.locks = 0;
    this.machine.lockLit = false;
    this.superLit = false;
    this.combo.reset();
    // The captured ball ejects after its hold; the other balls come out one by one.
    const hold = Math.round(this.holeHold() / this.dt);
    const gap = Math.round(RIOT.releaseGap / this.dt);
    for (let i = 1; i < this.ctx.riotBalls; i++)
      this.releases.push({ steps: hold + gap * i, fromHole: i === 1 });
    let save = RIOT.ballSave;
    for (const h of this.hooks) save = Math.max(save, h.riotSave?.(this) ?? 0);
    this.riotSaveLeft = save + this.holeHold() + RIOT.releaseGap * this.ctx.riotBalls;
    this.emit({ t: 'riot', on: true });
    this.emit({
      t: 'callout',
      text: 'RIOT!',
      sub: 'PAYDAY AT THE CHUTE',
      priority: 9,
      anim: 'riot',
      duration: 2.4,
    });
  }

  private endRiot(): void {
    this.riot = false;
    this.superLit = false;
    this.paydayEnd = this.payday;
    this.payday = RIOT.paydayBase;
    this.emit({ t: 'riot', on: false });
    this.emit({ t: 'callout', text: 'RIOT OVER', sub: 'BACK IN YOUR CELLS', priority: 4 });
    this.refreshLamps();
  }

  private collectAward(): void {
    const ladder = AWARDS.ladder;
    let award = ladder[this.machine.award % ladder.length] as AwardId;
    this.machine.award = (this.machine.award + 1) % ladder.length;
    if (award === 'kickback' && this.ctx.noKickback) award = 'bonusX';
    this.machine.awardLit = false;
    this.emit({ t: 'award', award, collected: true });
    let sub = AWARD_NAMES[award];
    switch (award) {
      case 'bonusX':
        if (this.bonusMult < this.ctx.bonusMaxMult) this.bonusMult++;
        this.emit({ t: 'bonusMult', mult: this.bonusMult });
        sub = `BONUS X${this.bonusMult}`;
        break;
      case 'kickback':
        this.machine.kickback = true;
        this.sim.setKickback(true);
        sub = 'KICKBACK LIT';
        break;
      case 'hurryUp':
        this.hurryLeft = HURRY.seconds;
        this.emit({ t: 'hurry', on: true });
        sub = 'HURRY-UP AT THE CHUTE';
        break;
      case 'shotLevel': {
        const shot = this.favouriteShot();
        this.levelUp(shot);
        sub = `${shot.toUpperCase()} LEVEL ${this.levels[shot]}`;
        break;
      }
      case 'extraBall':
        this.extraBalls++;
        this.emit({ t: 'extraBall' });
        sub = 'EXTRA BALL';
        break;
    }
    this.emit({ t: 'callout', text: 'THE HOLE PAYS', sub, priority: 6 });
  }

  /** The major shot made most this ball (else the Yard): levels go where you aim. */
  private favouriteShot(): ShotType {
    let best: ShotType = 'yard';
    let n = 0;
    for (const s of FAVOURITES) {
      if (this.hitCounts[s] > n) {
        n = this.hitCounts[s];
        best = s;
      }
    }
    return best;
  }

  /** A set (top lanes or Cell Block) completed: light the Hole award if it isn't. */
  private setComplete(set: 'lanes' | 'cellblock'): void {
    for (const h of this.hooks) h.onSetComplete?.(this, set);
    if (this.machine.awardLit) return;
    this.machine.awardLit = true;
    const award = AWARDS.ladder[this.machine.award % AWARDS.ladder.length] as AwardId;
    this.emit({ t: 'award', award, collected: false });
  }

  private onDrop(e: SimEvent): void {
    this.pay('cellblock', SCORE.drop, e.x, e.y);
    this.endSkill();
    this.jbShot('cellblock', e.x, e.y);
    this.dropSeq?.push(e.value);
    const states = this.sim.dropStates();
    this.machine.drops = states;
    // The sim resets the bank after the step; one clear per reset.
    if (states.every((u) => !u) && !this.cellCleared) {
      this.cellCleared = true;
      this.stats.cellBlocks++;
      this.pay('cellblock', SCORE.cellBlock, e.x, e.y);
      const seq = this.dropSeq;
      this.dropSeq = [];
      if (this.ctx.tunnel && seq && seq.join() === TUNNEL_ORDER.join()) this.onTunnel(e);
      this.sim.resetDrops();
      this.machine.drops = [true, true, true];
      if (!this.riot && !this.jailbreak && !this.ctx.lockdown && !this.machine.lockLit) {
        this.machine.lockLit = true;
        this.emit({ t: 'callout', text: 'CELL BLOCK', sub: 'LOCKUP IS LIT', priority: 4 });
      } else this.emit({ t: 'callout', text: 'CELL BLOCK', sub: 'CLEARED', priority: 3 });
      this.setComplete('cellblock');
    }
    this.refreshLamps();
  }

  private onNudge(): void {
    if (this.tilted) return;
    this.tiltMeter += TILT.perNudge * this.ctx.tiltSensitivity;
    if (this.tiltMeter < 1) return;
    this.tiltWarnings++;
    this.tiltMeter = TILT.afterWarning;
    if (this.tiltWarnings > TILT.warnings + this.ctx.extraWarnings) {
      this.tilted = true;
      this.sim.setTilted(true);
      this.ballSaveLeft = -BALL.ballSaveGrace;
      this.riotSaveLeft = 0;
      this.hurryLeft = 0;
      this.emit({ t: 'tilt' });
      this.emit({ t: 'callout', text: 'TILT', priority: 9, anim: 'tilt' });
    } else {
      this.emit({ t: 'tiltWarning', n: this.tiltWarnings });
      this.emit({ t: 'callout', text: 'DANGER', sub: `WARNING ${this.tiltWarnings}`, priority: 6 });
    }
  }

  private onDrain(e: SimEvent): void {
    this.drainCause = e.id;
    this.emit({ t: 'drain', cause: e.id, x: e.x, y: e.y });
    if (this.tilted) return;
    if ((this.riot && this.riotSaveLeft > 0) || this.multiSaveLeft > 0 || this.jbSaveLeft > 0) {
      this.sim.serveBall(true);
      this.emit({ t: 'ballSaved' });
      return;
    }
    const saving = this.saveStarted && this.ballSaveLeft > -BALL.ballSaveGrace && !this.saved;
    if (saving && this.sim.ballsInPlay() === 0) {
      this.saved = true;
      this.ballSaveLeft = -BALL.ballSaveGrace;
      this.sim.serveBall(true);
      this.emit({ t: 'ballSaved' });
      this.emit({ t: 'callout', text: 'BALL SAVED', priority: 5 });
      this.refreshLamps();
    }
  }

  // ------------------------------------------------------------------ luck

  /** Probability with luck applied (+2 percentage points per luck). */
  chance(base: number): number {
    return Math.max(0, Math.min(1, base + LUCK.perPoint * this.luck));
  }

  private maybeLuckyBounce(e: SimEvent): void {
    if (this.tilted) return;
    // The left kickback handles its own outlane.
    if (e.id === 'outlaneL' && this.sim.kickbackArmed) return;
    const forced = this.hooks.some((h) => h.forceBounce?.(this));
    if (!forced && !this.rng.chance(this.chance(LUCK.luckyBounce))) return;
    this.sim.luckyKick(e.ballId);
    this.stats.luckyBounces++;
    for (const h of this.hooks) h.onLuckyBounce?.(this);
    this.emit({ t: 'luck', kind: 'bounce', amount: 0 });
    this.emit({ t: 'callout', text: 'LUCKY BOUNCE', priority: 6 });
  }

  private maybeSpark(): void {
    const p = Math.min(1, LUCK.sparkChance * this.ctx.sparkMult);
    if (!this.rng.chance(p)) return;
    const amount = LUCK.sparkLuck * this.ctx.sparkMult;
    this.luck += amount;
    this.emit({ t: 'luck', kind: 'spark', amount });
    this.emit({ t: 'callout', text: 'SPARKS!', sub: `+${amount} LUCK THIS BALL`, priority: 4 });
  }

  // ------------------------------------------------------------------ misc

  private endSkill(): void {
    if (!this.skillArmed) return;
    this.skillArmed = false;
    this.skillTimer = -1;
    this.refreshLamps();
  }

  private laneChange(dir: number): void {
    const l = this.machine.lanes;
    if (dir < 0) l.push(l.shift()!);
    else l.unshift(l.pop()!);
    if (this.skillArmed) this.machine.skillLane = (this.machine.skillLane + dir + 3) % 3;
    this.refreshLamps();
  }

  /** Register a major shot for combos; returns its multiplier. */
  private major(): number {
    const mult = this.combo.hit(this.time);
    const n = this.combo.count;
    if (n > this.stats.maxCombo) this.stats.maxCombo = n;
    if (n >= 2) {
      this.emit({ t: 'combo', count: n, mult });
      this.emit({
        t: 'callout',
        text: `COMBO X${mult}`,
        sub: comboName(n),
        priority: 4 + Math.min(3, n - 2),
        anim: 'combo',
      });
    }
    return mult;
  }

  private checkJob(): void {
    const j = this.ctx.job;
    if (!j || j.done || this.jobDone) return;
    const v = this.stats[j.stat];
    const progress = j.mode === 'sum' ? j.base + v : Math.max(j.base, v);
    if (progress >= j.target) {
      this.jobDone = true;
      this.emit({ t: 'jobDone', id: j.id });
      this.emit({ t: 'callout', text: 'JOB DONE', sub: 'COLLECT AT THE ATM', priority: 6 });
    }
  }

  /** Live progress of the round's Job including this ball. */
  jobProgress(): number {
    const j = this.ctx.job;
    if (!j) return 0;
    const v = this.stats[j.stat];
    return j.mode === 'sum' ? j.base + v : Math.max(j.base, v);
  }

  private endBall(): void {
    this.over = true;
    this.hurryLeft = 0;
    if (this.riot) this.endRiot();
    if (this.jailbreak) {
      this.jailbreak = false;
      if (this.jbResult === 'failed') {
        this.emit({ t: 'jailbreak', phase: 'failed', n: this.jbShots });
        this.emit({ t: 'callout', text: 'CAUGHT', sub: 'BACK TO PAYING', priority: 9 });
      }
    }
    if (this.tilted) {
      this.earned = 0;
      this.bonus = 0;
      this.bonusPaid = 0;
    } else {
      this.bonusPaid = bonusTotal(this.bonus, this.bonusMult, {
        keep: this.ctx.bonusKeep,
        times: this.ctx.bonusTimes,
      });
      this.emit({ t: 'bonus', bonus: this.bonus, mult: this.bonusMult, total: this.bonusPaid });
    }
    this.stats.bonusTally = this.bonusPaid;
    this.stats.earned = this.earned + this.bonusPaid;
    this.machine.bonusMult = this.bonusMult;
    this.checkJob();
    this.emit({ t: 'ballOver', earned: this.earned + this.bonusPaid, tilted: this.tilted });
  }

  // ------------------------------------------------------------------ charm API (BallRules)

  lucky(base: number): boolean {
    return this.rng.chance(this.chance(base));
  }

  addBonusMult(n: number): void {
    const cap = this.ctx.bonusMaxMult;
    const before = this.bonusMult;
    this.bonusMult = Math.min(cap, this.bonusMult + n);
    if (this.bonusMult !== before) {
      this.emit({ t: 'bonusMult', mult: this.bonusMult });
      this.refreshLamps();
    }
  }

  levelUp(shot: ShotType): void {
    this.levels[shot]++;
    this.levelUps.push(shot);
    this.refreshLamps();
  }

  has(id: string): boolean {
    return this.owned.has(id);
  }

  private holeHold(): number {
    return Math.max(0.3, HOLE.holdTime + this.ctx.holeHoldAdd);
  }

  private paydayMult(): number {
    let m = 1;
    for (const h of this.hooks) if (h.paydayMult) m *= h.paydayMult(this);
    return m;
  }

  private onPaydayHooks(isSuper: boolean): void {
    for (const h of this.hooks) h.onPayday?.(this, isSuper);
    // Hand-Crank Generator: PAYDAY recharges every active charm.
    if (this.has('handCrank') && !isSuper) {
      for (const a of this.ctx.actives) a.charges = a.max;
      this.emit({ t: 'callout', text: 'RECHARGED', sub: 'HAND-CRANK GENERATOR', priority: 4 });
    }
  }

  /** Fire an active charm: slot 1-5, or 6 for the lockbar (leftmost with charges). */
  private activate(code: number): void {
    const a =
      code >= 6
        ? this.ctx.actives.find((x) => x.charges > 0)
        : this.ctx.actives.find((x) => x.slot === code && x.charges > 0);
    if (!a) return;
    a.charges--;
    this.emit({ t: 'active', id: a.id, slot: a.slot, charges: a.charges });
    switch (a.action) {
      case 'ballSave':
        this.saveStarted = true;
        this.saved = false;
        this.ballSaveLeft = Math.max(this.ballSaveLeft, ACTIVE_SAVE);
        this.emit({ t: 'callout', text: 'PANIC BUTTON', sub: 'BALL SAVE ARMED', priority: 5 });
        break;
      case 'slowmo':
        this.emit({ t: 'slowmo', seconds: ACTIVE_SLOWMO });
        this.emit({ t: 'callout', text: 'POCKET WATCH', sub: 'TIME DRAGS', priority: 4 });
        break;
      case 'crowbar': {
        const drops = this.sim.dropStates();
        for (let i = 0; i < drops.length; i++) if (drops[i]) this.sim.knockDrop(i);
        this.emit({ t: 'callout', text: 'CROWBAR', priority: 4 });
        break;
      }
      case 'twinYolk':
        this.sim.serveBall(true);
        this.multiSaveLeft = TWIN_SAVE;
        this.emit({ t: 'callout', text: 'TWIN YOLK', sub: 'TWO-BALL MULTIBALL', priority: 6 });
        break;
    }
    this.refreshLamps();
  }

  /** What the run needs from a finished ball. */
  outcome(): BallOutcome {
    return {
      earned: this.earned,
      bonus: this.bonusPaid,
      tilted: this.tilted,
      drainCause: this.over ? this.drainCause || 'unknown' : 'timeout',
      machine: this.machine,
      stats: { ...this.stats },
      levelUps: [...this.levelUps],
      extraBalls: this.extraBalls,
      paydayEnd: this.paydayEnd,
      charges: Object.fromEntries(this.ctx.actives.map((a) => [a.id, a.charges])),
      jailbreak: this.jbResult,
    };
  }

  // ------------------------------------------------------------------ the Tunnel, JAILBREAK

  private onTunnel(e: SimEvent): void {
    this.stats.tunnels++;
    const v = this.shotValue('cellblock', SECRET.tunnel);
    this.payRaw(v, e.x, e.y);
    this.emit({ t: 'tunnel', amount: v });
    this.emit({
      t: 'callout',
      text: 'THE TUNNEL',
      sub: `A BRICK COMES LOOSE  +${fmt(v)}`,
      priority: 7,
      anim: 'skill',
    });
  }

  private startJailbreak(): void {
    this.jailbreak = true;
    this.jbResult = 'failed';
    this.combo.reset();
    this.machine.lockLit = false;
    for (const s of JAILBREAK_SHOTS) this.jbLit.add(s);
    // The captured ball ejects after its hold; the rest come out one by one.
    const hold = Math.round(this.holeHold() / this.dt);
    const gap = Math.round(JAILBREAK.releaseGap / this.dt);
    for (let i = 1; i < JAILBREAK.balls; i++)
      this.releases.push({ steps: hold + gap * i, fromHole: i === 1 });
    this.jbSaveLeft = JAILBREAK.ballSave + this.holeHold() + JAILBREAK.releaseGap * JAILBREAK.balls;
    this.emit({ t: 'jailbreak', phase: 'start', n: 0 });
    this.emit({
      t: 'callout',
      text: 'JAILBREAK!',
      sub: `${JAILBREAK.shotsToEscape} SHOTS TO THE DOOR`,
      priority: 10,
      anim: 'jailbreak',
      duration: 3,
    });
  }

  /** A lit JAILBREAK shot: pay, count, tear a piece off the machine, maybe escape. */
  private jbShot(shot: JailbreakShot, x: number, y: number): void {
    if (!this.jailbreak || !this.jbLit.has(shot) || this.tilted) return;
    this.jbLit.delete(shot);
    if (this.jbLit.size === 0) for (const s of JAILBREAK_SHOTS) this.jbLit.add(s);
    const n = ++this.jbShots;
    this.stats.jailbreakShots++;
    this.jbSaveLeft = Math.max(this.jbSaveLeft, 0) + JAILBREAK.savePerShot;
    this.payRaw(JAILBREAK.shotValue * n * SCORE.scale * this.ctx.payMult, x, y);
    this.emit({ t: 'jailbreak', phase: 'shot', n });
    if (n === JAILBREAK.postsDropAt) {
      this.sim.removeTag('outlanePosts');
      this.emit({ t: 'jailbreak', phase: 'posts', n });
    }
    if (n === JAILBREAK.lightsDieAt) this.emit({ t: 'jailbreak', phase: 'lights', n });
    if (n === JAILBREAK.glassCracksAt) this.emit({ t: 'jailbreak', phase: 'glass', n });
    if (n >= JAILBREAK.shotsToEscape) {
      this.jbResult = 'escaped';
      this.emit({ t: 'jailbreak', phase: 'escaped', n });
      this.emit({ t: 'callout', text: 'ESCAPED', sub: 'RUN', priority: 10, anim: 'jailbreak' });
      this.endBall();
      return;
    }
    const left = JAILBREAK.shotsToEscape - n;
    this.emit({
      t: 'callout',
      text: `${left} TO GO`,
      sub: 'THE MACHINE IS COMING APART',
      priority: 7,
      anim: 'jailbreak',
    });
    this.refreshLamps();
  }

  // ------------------------------------------------------------------ scoring

  /** Value of a hit before luck/charm effects: base scaled by shot level and multipliers. */
  shotValue(shot: ShotType, base: number): number {
    const level = this.levels[shot] ?? 1;
    return (
      base *
      SCORE.scale *
      (1 + SCORE.levelStep * (level - 1)) *
      (this.ctx.shotMult[shot] ?? 1) *
      this.ctx.payMult
    );
  }

  /** Pay a hit: scaled by level; adds to Bonus (excluding the combo part) and to PAYDAY. */
  private pay(
    shot: ShotType,
    base: number,
    x: number,
    y: number,
    comboMult = 1,
    source = '',
  ): void {
    if (this.tilted) return;
    let v = this.shotValue(shot, base);
    if (v <= 0) return;
    for (const h of this.hooks) if (h.hitMult) v *= h.hitMult(this, shot, source);
    this.hitCounts[shot]++;
    for (const h of this.hooks) h.onHit?.(this, shot, source);
    this.bonus += (v / comboMult) * this.ctx.bonusShare;
    if (this.riot) this.payday += RIOT.paydayPerHit;
    this.earned += v;
    this.emit({ t: 'score', shot, amount: v, x, y } satisfies GameEvent);
  }

  /** Pay an already-valued jackpot (PAYDAY, hurry-up): no Bonus, no PAYDAY growth. */
  private payRaw(amount: number, x: number, y: number): void {
    if (this.tilted || amount <= 0) return;
    this.earned += amount;
    this.emit({ t: 'score', shot: 'jackpot', amount, x, y });
  }

  // ------------------------------------------------------------------ lamps

  refreshLamps(): void {
    const L = this.lamps;
    for (let i = 0; i < 3; i++) {
      const id = LANE_IDS[i];
      L[id] =
        this.skillArmed && i === this.machine.skillLane
          ? Lamp.Fast
          : this.machine.lanes[i]
            ? Lamp.On
            : Lamp.Off;
    }
    const drops = this.machine.drops;
    for (let i = 0; i < drops.length; i++) L[`drop${i}`] = drops[i] ? Lamp.Slow : Lamp.On;
    L.ballSave =
      this.riotSaveLeft > 0 || this.ballSaveLeft > 0
        ? this.ballSaveLeft > 0 && this.ballSaveLeft < 2
          ? Lamp.Fast
          : Lamp.Slow
        : Lamp.Off;
    L.skill = this.skillArmed ? Lamp.Fast : Lamp.Off;
    L.arrowPerimL = this.superArmed >= 0 ? Lamp.Fast : Lamp.Off;
    L.arrowChute = this.riot || this.hurryLeft > 0 ? Lamp.Fast : Lamp.Off;
    L.arrowHole = this.superLit
      ? Lamp.Fast
      : (this.machine.lockLit && !this.riot) || this.machine.awardLit
        ? Lamp.Slow
        : Lamp.Off;
    L.arrowPerimR = Lamp.Off;
    L.arrowCell = !this.machine.lockLit && !this.riot && drops.some(Boolean) ? Lamp.Slow : Lamp.Off;
    if (this.jailbreak)
      for (const s of JAILBREAK_SHOTS) L[JB_LAMP[s]] = this.jbLit.has(s) ? Lamp.Fast : Lamp.Off;
    L.kickback = this.machine.kickback ? Lamp.On : Lamp.Off;
    L.lockup = this.riot ? Lamp.Fast : this.machine.lockLit ? Lamp.Slow : Lamp.Off;
    L.shootAgain = this.extraBalls > 0 ? Lamp.On : Lamp.Off;
    const ladder = AWARDS.ladder;
    for (let i = 0; i < ladder.length; i++)
      L[`award_${ladder[i]}`] =
        i === this.machine.award % ladder.length
          ? this.machine.awardLit
            ? Lamp.Slow
            : Lamp.Off
          : Lamp.Off;
    for (let m = 2; m <= 5; m++) L[`bonusX${m}`] = this.bonusMult >= m ? Lamp.On : Lamp.Off;
    for (const shot of LADDER_SHOTS)
      for (let n = 2; n <= 4; n++)
        L[`lvl_${shot}_${n}`] = this.levels[shot] >= n ? Lamp.On : Lamp.Off;
  }
}

function fmt(v: number): string {
  return v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
}
