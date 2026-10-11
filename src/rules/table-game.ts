/**
 * TableGame: the per-ball rules of DEBTOR'S PRISON. Consumes SimEvents after every physics
 * step, scores hits, runs ball save / tilt / skill shots, and drives the machine (ejects,
 * re-serves). Emits GameEvents for presentation. Node-safe and deterministic.
 */
import type { PinballSim, SimInput } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import type { ShotType } from '../sim/table-def';
import { BALL, HOLE, SCORE, TILT } from '../content/balance';
import { Lamp, type GameEvent, type GameEventSink } from './types';

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

/** Run-derived, read-only facts the ball needs. Plain data so it can be snapshotted. */
export interface BallContext {
  shotLevels: Record<ShotType, number>;
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
}

/** Machine state that persists between balls within a round. */
export interface MachineState {
  /** Top lanes completed this set (A, B, C). */
  lanes: boolean[];
  /** Index of the lane lit for the Roll Call skill shot. */
  skillLane: number;
  /** Drop targets up/down. */
  drops: boolean[];
}

export function newMachineState(): MachineState {
  return { lanes: [false, false, false], skillLane: 1, drops: [true, true, true] };
}

export function defaultBallContext(): BallContext {
  const levels = {} as Record<ShotType, number>;
  for (const s of SHOT_TYPES) levels[s] = 1;
  return {
    shotLevels: levels,
    ballSave: BALL.ballSave,
    tiltSensitivity: 1,
    extraWarnings: 0,
    payMult: 1,
    ballNumber: 1,
    ballsInRound: 1,
  };
}

const LANE_IDS = ['laneA', 'laneB', 'laneC'];
const PERIM_WINDOW = 2.2; // seconds between orbit entry and top switch
const SKILL_WINDOW = 4; // seconds after launch for the skill shot to resolve
const SUPER_WINDOW = 6;

export class TableGame {
  /** Fractional coins earned this ball (committed on a clean drain). */
  earned = 0;
  tilted = false;
  tiltMeter = 0;
  tiltWarnings = 0;
  over = false;
  readonly lamps: Record<string, Lamp> = {};
  /** Seconds of ball save left (counts below zero through the grace period). */
  ballSaveLeft = 0;
  private saveStarted = false;
  private saved = false;
  private skillArmed = true;
  private skillTimer = -1;
  private superArmed = -1;
  private perimArm = { L: -1e9, R: -1e9 };
  private holeHolds = new Map<number, number>();
  private prevLeft = false;
  private prevRight = false;
  private launched = false;
  private cursor = 0;
  private readonly dt: number;

  constructor(
    readonly sim: PinballSim,
    readonly ctx: BallContext,
    readonly machine: MachineState,
    private readonly emit: GameEventSink = () => {},
  ) {
    this.dt = sim.dt;
    this.cursor = sim.events.head;
    this.refreshLamps();
  }

  /** Start the ball: serve to the plunger. */
  start(): void {
    this.sim.serveBall(false);
    this.skillArmed = true;
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
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT.decay * this.dt);
  }

  /** After the physics step: consume events, run timers, decide ball over. */
  postStep(): void {
    this.cursor = this.sim.events.read(this.cursor, this.onEvent);
    const dt = this.dt;
    if (this.saveStarted && this.ballSaveLeft > -BALL.ballSaveGrace) {
      const was = this.ballSaveLeft;
      this.ballSaveLeft -= dt;
      if ((was > 0 && this.ballSaveLeft <= 0) || (was > 2 && this.ballSaveLeft <= 2))
        this.refreshLamps();
    }
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
    for (const [id, left] of this.holeHolds) {
      if (left <= 1) {
        this.holeHolds.delete(id);
        this.sim.ejectHeld(id);
      } else this.holeHolds.set(id, left - 1);
    }
    if (!this.over && this.launched && this.sim.ballsInPlay() === 0) this.endBall();
  }

  // ------------------------------------------------------------------ events

  private readonly onEvent = (e: SimEvent): void => {
    switch (e.type) {
      case 'launch':
        this.launched = true;
        if (this.skillArmed && e.dir === 0) this.skillTimer = 0;
        break;
      case 'served':
        this.launched = true;
        break;
      case 'trigger':
        this.onTrigger(e);
        break;
      case 'pop':
        this.pay('yard', SCORE.pop, e.x, e.y);
        this.endSkill();
        break;
      case 'sling':
        this.pay('sling', SCORE.sling, e.x, e.y);
        this.endSkill();
        break;
      case 'drop':
        this.onDrop(e);
        break;
      case 'spin':
        this.pay('searchlight', SCORE.searchlightSpin * e.value, e.x, e.y);
        break;
      case 'chuteMade':
        this.pay('chute', SCORE.chute, e.x, e.y);
        this.emit({ t: 'callout', text: 'THE CHUTE', priority: 2 });
        this.endSkill();
        break;
      case 'holeCapture':
        this.pay('hole', SCORE.hole, e.x, e.y);
        this.emit({ t: 'callout', text: 'THE HOLE', priority: 2 });
        this.holeHolds.set(e.ballId, Math.round(HOLE.holdTime / this.dt));
        this.endSkill();
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
          break;
      }
    }
  }

  private onLane(lane: number, x: number, y: number): void {
    if (this.skillArmed && this.skillTimer >= 0) {
      if (lane === this.machine.skillLane) {
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
    if (this.machine.lanes.every(Boolean)) {
      this.machine.lanes.fill(false);
      this.pay('lanes', SCORE.laneSet, x, y);
      this.emit({ t: 'laneComplete' });
      this.emit({ t: 'callout', text: 'HEADCOUNT', sub: 'LANES COMPLETE', priority: 2 });
    }
    this.refreshLamps();
  }

  private onPerimeter(side: 'L' | 'R', e: SimEvent): void {
    this.pay('perimeter', SCORE.perimeter, e.x, e.y);
    this.emit({ t: 'callout', text: 'THE PERIMETER', priority: 2 });
    if (side === 'L' && this.superArmed >= 0) {
      this.superArmed = -1;
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

  private onDrop(e: SimEvent): void {
    this.pay('cellblock', SCORE.drop, e.x, e.y);
    this.endSkill();
    const states = this.sim.dropStates();
    this.machine.drops = states;
    if (states.every((u) => !u)) {
      this.pay('cellblock', SCORE.cellBlock, e.x, e.y);
      this.emit({ t: 'callout', text: 'CELL BLOCK', sub: 'CLEARED', priority: 3 });
      this.sim.resetDrops();
      this.machine.drops = [true, true, true];
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
      this.emit({ t: 'tilt' });
      this.emit({ t: 'callout', text: 'TILT', priority: 9, anim: 'tilt' });
    } else {
      this.emit({ t: 'tiltWarning', n: this.tiltWarnings });
      this.emit({ t: 'callout', text: 'DANGER', sub: `WARNING ${this.tiltWarnings}`, priority: 6 });
    }
  }

  private onDrain(e: SimEvent): void {
    this.emit({ t: 'drain', cause: e.id, x: e.x, y: e.y });
    const saving =
      !this.tilted && this.saveStarted && this.ballSaveLeft > -BALL.ballSaveGrace && !this.saved;
    if (saving && this.sim.ballsInPlay() === 0) {
      this.saved = true;
      this.ballSaveLeft = -BALL.ballSaveGrace;
      this.sim.serveBall(true);
      this.emit({ t: 'ballSaved' });
      this.emit({ t: 'callout', text: 'BALL SAVED', priority: 5 });
      this.refreshLamps();
    }
  }

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

  private endBall(): void {
    this.over = true;
    if (this.tilted) this.earned = 0;
    this.emit({ t: 'ballOver', earned: this.earned, tilted: this.tilted });
  }

  // ------------------------------------------------------------------ scoring

  /** Value of a hit before luck/charm effects: base scaled by shot level. */
  shotValue(shot: ShotType, base: number): number {
    const level = this.ctx.shotLevels[shot] ?? 1;
    return base * (1 + SCORE.levelStep * (level - 1)) * this.ctx.payMult;
  }

  private pay(shot: ShotType, base: number, x: number, y: number): void {
    if (this.tilted) return;
    const v = this.shotValue(shot, base);
    if (v <= 0) return;
    this.earned += v;
    this.emit({ t: 'score', shot, amount: v, x, y } satisfies GameEvent);
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
    L.ballSave = this.ballSaveLeft > 0 ? (this.ballSaveLeft < 2 ? Lamp.Fast : Lamp.Slow) : Lamp.Off;
    L.skill = this.skillArmed ? Lamp.Fast : Lamp.Off;
    L.arrowPerimL = this.superArmed >= 0 ? Lamp.Fast : Lamp.Off;
    L.arrowChute = Lamp.Off;
    L.arrowHole = Lamp.Off;
    L.arrowPerimR = Lamp.Off;
    L.arrowCell = drops.some(Boolean) ? Lamp.Slow : Lamp.Off;
    L.kickback = this.sim.kickbackArmed ? Lamp.On : Lamp.Off;
    L.lockup = Lamp.Off;
    L.shootAgain = Lamp.Off;
  }
}
