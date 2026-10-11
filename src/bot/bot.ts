/**
 * Heuristic pinball bot. Tracks balls with a short ballistic prediction, flips live balls as
 * they reach a flipper's swept sector, traps slow balls into a cradle, then fires calibrated
 * shots from the cradle at a chosen target. Runs headless in Node (tools, tests) and drives
 * attract mode in the browser. Deterministic given its seed.
 */
import type { PinballSim, SimBall, SimInput, FlipperRT } from '../sim/sim';
import { emptyInput } from '../sim/sim';
import { Rng } from '../core/rng';
import { DEG } from '../core/math';
import { TILT } from '../content/balance';
import { SHOT_TABLE, type ShotTarget } from './shot-table';

export type BotSkillName = 'novice' | 'average' | 'expert';

export interface BotSkill {
  name: BotSkillName;
  /** Reaction latency in steps (mean, +- jitter). */
  reaction: number;
  reactionJitter: number;
  /** Timing jitter (+- steps) on calibrated cradle shots. */
  aimJitter: number;
  /** Probability of trapping a catchable ball into a cradle. */
  cradle: number;
  /** Probability of taking an aimed shot from a cradle (vs. a plain flip). */
  aim: number;
  /** Probability of attempting a nudge save on an outlane ball. */
  nudgeSave: number;
  /** Chance per live flip of a badly mistimed flip. */
  sloppy: number;
}

export const BOT_SKILLS: Record<BotSkillName, BotSkill> = {
  novice: {
    name: 'novice',
    reaction: 7,
    reactionJitter: 4,
    aimJitter: 7,
    cradle: 0.1,
    aim: 0.3,
    nudgeSave: 0,
    sloppy: 0.2,
  },
  average: {
    name: 'average',
    reaction: 3,
    reactionJitter: 2,
    aimJitter: 3,
    cradle: 0.6,
    aim: 0.8,
    nudgeSave: 0.3,
    sloppy: 0.06,
  },
  expert: {
    name: 'expert',
    reaction: 1,
    reactionJitter: 1,
    aimJitter: 1,
    cradle: 0.92,
    aim: 0.95,
    nudgeSave: 0.85,
    sloppy: 0.01,
  },
};

const enum FState {
  Idle,
  Flipping,
  Catching,
  Cradled,
  Releasing,
  Shooting,
}

interface FlipBrain {
  side: 'left' | 'right';
  state: FState;
  timer: number;
  /** Steps the button stays held (Flipping/Shooting). */
  hold: number;
  /** Planned flip (reaction delay countdown), -1 = none. */
  flipIn: number;
  delay: number;
  target: ShotTarget | null;
  ballId: number;
  decidedBall: number;
  willCatch: boolean;
}

/** Callback the game supplies so the bot aims at lit shots; null = bot's own choice. */
export type TargetChooser = (side: 'left' | 'right') => ShotTarget | null;

const PREDICT_STEPS = 48;
const PREDICT_STRIDE = 2;

export class Bot {
  readonly rng: Rng;
  skill: BotSkill;
  chooseTarget: TargetChooser | null = null;
  /** Desired plunge pull, chosen per ball (null = aim for the skill shot or full plunge). */
  plungePull: number | null = null;
  /** Lit Roll Call lane (0..2) so the plunge can aim for it; null = always full plunge. */
  skillLane: (() => number) | null = null;
  /** Counters for diagnostics. */
  readonly stats = { flips: 0, catches: 0, cradles: 0, aimed: 0, nudges: 0 };
  private brains: FlipBrain[];
  private input: SimInput = emptyInput();
  private plungeTimer = -1;
  private plungeHoldSteps = 0;
  private tiltMeter = 0;
  private nudgeCooldown = 0;
  private lastOutlaneCheck = new Map<number, number>();
  private readonly fr = { r: 0, th: 0 };

  constructor(skill: BotSkillName | BotSkill = 'average', seed = 1) {
    this.skill = typeof skill === 'string' ? BOT_SKILLS[skill] : skill;
    this.rng = new Rng(seed);
    this.brains = (['left', 'right'] as const).map((side) => ({
      side,
      state: FState.Idle,
      timer: 0,
      hold: 0,
      flipIn: -1,
      delay: 0,
      target: null,
      ballId: -1,
      decidedBall: -1,
      willCatch: false,
    }));
  }

  /** Decide this step's input. Call once per sim step, before sim.stepOnce. */
  decide(sim: PinballSim): SimInput {
    const inp = this.input;
    inp.nudge = 0;
    inp.pull = -1;
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT.decay * sim.dt);
    if (this.nudgeCooldown > 0) this.nudgeCooldown--;
    this.handlePlunger(sim, inp);
    inp.left = this.updateFlipper(sim, this.brains[0]);
    inp.right = this.updateFlipper(sim, this.brains[1]);
    this.maybeNudge(sim, inp);
    // Never hold left during a plunge unless a super skill shot is planned.
    if (inp.plunger) inp.left = false;
    return inp;
  }

  // ------------------------------------------------------------------ plunger

  private handlePlunger(sim: PinballSim, inp: SimInput): void {
    const pl = sim.table.plunger;
    let resting = false;
    for (const b of sim.balls)
      if (
        b.state === 'field' &&
        b.x > pl.minX &&
        b.y < pl.y + 0.5 &&
        Math.abs(b.vy) < 0.5 &&
        b.autoLaunchIn < 0
      )
        resting = true;
    if (!resting) {
      inp.plunger = false;
      this.plungeTimer = -1;
      return;
    }
    if (this.plungeTimer < 0) {
      this.plungeTimer = this.rng.int(40, 140);
      let pull = this.plungePull ?? this.rng.range(0.92, 1.0);
      let jitter = 2;
      if (this.plungePull === null && this.skillLane && this.rng.chance(this.skill.aim)) {
        pull = sim.cfg.plunger.lanePull[this.skillLane()];
        jitter = this.skill.aimJitter * 2;
      }
      this.plungeHoldSteps =
        Math.round(pull * sim.cfg.plunger.pullTime * 240) + this.rng.int(-jitter, jitter);
    }
    if (this.plungeTimer > 0) {
      this.plungeTimer--;
      inp.plunger = false;
      return;
    }
    if (this.plungeHoldSteps > 0) {
      inp.plunger = true;
      this.plungeHoldSteps--;
    } else {
      inp.plunger = false;
      this.plungeTimer = -1;
    }
  }

  // ------------------------------------------------------------------ flippers

  private mainFlipper(sim: PinballSim, side: 'left' | 'right'): FlipperRT {
    return sim.flippers.find((f) => f.def.id === (side === 'left' ? 'L' : 'R'))!;
  }

  /** Point in the flipper's frame (mirrored so both flippers look like a left one). */
  private frame(f: FlipperRT, x: number, y: number): { r: number; th: number } {
    let dx = x - f.def.x;
    if (f.def.side === 'right') dx = -dx;
    const dy = y - f.def.y;
    this.fr.r = Math.hypot(dx, dy);
    this.fr.th = Math.atan2(dy, dx) / DEG;
    return this.fr;
  }

  /** Is a ball centre inside the sector the flipper can hit this stroke? */
  private hittable(f: FlipperRT, x: number, y: number): boolean {
    const d = f.def;
    const p = this.frame(f, x, y);
    return p.r > d.r0 && p.r < d.len + d.r1 + 0.62 && p.th > d.restDeg - 14 && p.th < d.upDeg + 10;
  }

  /**
   * Steps until the ball (ballistic prediction, gravity only) first enters the flipper's
   * hittable sector; -1 if not within the horizon.
   */
  private timeToSector(sim: PinballSim, f: FlipperRT, b: SimBall): number {
    const g = sim.cfg.physics.slopeGravity * sim.cfg.mods.gravity;
    for (let k = PREDICT_STRIDE; k <= PREDICT_STEPS; k += PREDICT_STRIDE) {
      const t = k * sim.dt;
      const x = b.x + b.vx * t;
      const y = b.y + b.vy * t - 0.5 * g * t * t;
      if (this.hittable(f, x, y)) return k;
      if (y < 1) return -1;
    }
    return -1;
  }

  /** Returns whether this flipper's button is held this step. */
  private updateFlipper(sim: PinballSim, br: FlipBrain): boolean {
    const f = this.mainFlipper(sim, br.side);
    const d = f.def;

    // Most urgent field ball for this flipper.
    let best: SimBall | null = null;
    let bestT = 1e9;
    for (const b of sim.balls) {
      if (b.state !== 'field' || b.inShooter || b.y > 18) continue;
      const t = this.hittable(f, b.x, b.y) ? 0 : this.timeToSector(sim, f, b);
      if (t < 0) continue;
      if (t < bestT) {
        bestT = t;
        best = b;
      }
    }

    switch (br.state) {
      case FState.Shooting:
      case FState.Flipping:
        if (--br.hold <= 0) {
          br.state = FState.Idle;
          br.timer = 0;
          return false;
        }
        return true;

      case FState.Releasing:
        if (++br.timer >= br.delay) {
          br.state = FState.Shooting;
          br.hold = 48;
          this.stats.aimed++;
          return true;
        }
        return false;

      case FState.Cradled: {
        const b = sim.getBall(br.ballId);
        if (!b || b.state !== 'field' || Math.hypot(b.vx, b.vy) > 2.5) {
          br.state = FState.Idle;
          return true;
        }
        // Another ball about to need this flipper? Shoot now rather than lose it.
        const urgent = best !== null && best.id !== b.id && bestT < 12;
        if (++br.timer > 40 + this.rng.int(0, 40) || urgent) {
          const target =
            (this.chooseTarget && this.chooseTarget(br.side)) ?? this.defaultTarget(br.side);
          const entry = target ? SHOT_TABLE[br.side][target] : undefined;
          if (entry !== undefined && this.rng.chance(this.skill.aim) && !urgent) {
            br.target = target;
            br.delay = Math.max(
              1,
              entry + this.rng.int(-this.skill.aimJitter, this.skill.aimJitter),
            );
          } else {
            br.target = null;
            br.delay = urgent ? 0 : this.rng.int(100, 190);
          }
          br.state = FState.Releasing;
          br.timer = 0;
          return false;
        }
        return true;
      }

      case FState.Catching: {
        const b = sim.getBall(br.ballId);
        if (!b || b.state !== 'field') {
          br.state = FState.Idle;
          return false;
        }
        const p = this.frame(f, b.x, b.y);
        const speed = Math.hypot(b.vx, b.vy);
        if (p.r < d.len * 0.55 && speed < 0.5 && f.progress > 0.9) {
          br.state = FState.Cradled;
          br.timer = 0;
          this.stats.cradles++;
          return true;
        }
        // Ball sliding out toward the tip: tap it (drop and re-flip) instead of losing it.
        const fx = f.def.side === 'left' ? 1 : -1;
        const outward =
          b.vx * fx * Math.cos(f.def.upDeg * DEG) + b.vy * Math.sin(f.def.upDeg * DEG);
        if (p.r > d.len * 0.6 && outward > 2) {
          br.state = FState.Releasing;
          br.timer = 0;
          br.delay = 5;
          return false;
        }
        if (++br.timer > 360 || (b.vy < -3 && p.th < d.restDeg - 5 && p.r > d.len * 0.6)) {
          br.state = FState.Idle;
          return false;
        }
        return true;
      }

      case FState.Idle:
        break;
    }

    if (!best) {
      br.flipIn = -1;
      return false;
    }

    // A pending reaction-delayed flip.
    if (br.flipIn >= 0) {
      if (br.flipIn-- === 0) {
        this.startFlip(br);
        return true;
      }
      return false;
    }

    const speed = Math.hypot(best.vx, best.vy);
    const p = this.frame(f, best.x, best.y);

    // Ball already resting on a raised flipper (e.g. after a flip) -> cradle.
    if (f.progress > 0.9 && speed < 0.5 && p.r < d.len * 0.55) {
      br.state = FState.Cradled;
      br.ballId = best.id;
      br.timer = 0;
      return true;
    }

    if (best.id !== br.decidedBall) {
      br.decidedBall = best.id;
      br.willCatch = this.rng.chance(this.skill.cradle);
      br.delay = this.rng.int(45, 75); // along-the-bat % at which to flip a rolling ball
    }

    // Inlane feed: raise while the ball is still in the inlane so it rolls onto a raised bat
    // into the cradle. Raising once it reaches the base squirts it back over the inlane.
    const inInlane =
      (br.side === 'left' ? best.x < 3.3 : best.x > 15.1) &&
      best.y > d.y + 2.6 &&
      best.y < 12.6 &&
      best.vy < 0;
    if (br.willCatch && inInlane) {
      br.state = FState.Catching;
      br.ballId = best.id;
      br.timer = 0;
      this.stats.catches++;
      return true;
    }

    // Ball on the lowered flipper (rolling along it): flip once it has rolled to a useful
    // point along the bat; never at the base.
    const onBat = bestT === 0 && p.th < d.restDeg + 16 && p.th > d.restDeg - 14;
    if (onBat) {
      if (p.r < d.len * 0.4) return false;
      if ((p.r / d.len) * 100 < br.delay && speed < 14) return false;
    } else if (
      br.willCatch &&
      speed < 16 &&
      best.vy < 0 &&
      p.th > d.restDeg + 10 &&
      bestT > 0 &&
      bestT <= 24
    ) {
      // Dropping onto the bat from above: raise early so it lands on the bat and rolls down
      // into the cradle (only when it will land well out from the base).
      const t = bestT * sim.dt;
      const along = this.frame(f, best.x + best.vx * t, best.y + best.vy * t).r / d.len;
      if (along > 0.45 && along < 0.75) {
        br.state = FState.Catching;
        br.ballId = best.id;
        br.timer = 0;
        this.stats.catches++;
        return true;
      }
    }

    // Live flip: meet the ball on the upswing.
    const lead = 5;
    if (bestT <= lead) {
      let delay = Math.max(
        0,
        Math.round(this.skill.reaction + this.rng.range(-1, 1) * this.skill.reactionJitter) -
          lead +
          bestT,
      );
      if (this.rng.chance(this.skill.sloppy)) delay += this.rng.int(-3, 10);
      br.flipIn = Math.max(0, delay);
      if (br.flipIn === 0) {
        br.flipIn = -1;
        this.startFlip(br);
        return true;
      }
    }
    return false;
  }

  private startFlip(br: FlipBrain): void {
    br.state = FState.Flipping;
    br.hold = this.rng.int(36, 70);
    this.stats.flips++;
  }

  private defaultTarget(side: 'left' | 'right'): ShotTarget | null {
    const opts = Object.keys(SHOT_TABLE[side]) as ShotTarget[];
    return opts.length ? this.rng.pick(opts) : null;
  }

  // ------------------------------------------------------------------ nudging

  private maybeNudge(sim: PinballSim, inp: SimInput): void {
    if (this.skill.nudgeSave <= 0 || this.nudgeCooldown > 0) return;
    if (this.tiltMeter + TILT.perNudge >= 0.95) return;
    for (const b of sim.balls) {
      if (b.state !== 'field') continue;
      // Straight down the middle: a side bump shifts it into a flipper's reach.
      const cx = sim.table.width / 2 - 0.75;
      if (Math.abs(b.x - cx) < 0.45 && b.y > 5.2 && b.y < 9 && b.vy < -4 && Math.abs(b.vx) < 6) {
        const last = this.lastOutlaneCheck.get(-b.id) ?? -1e9;
        this.lastOutlaneCheck.set(-b.id, sim.step);
        if (sim.step - last >= 60 && this.rng.chance(this.skill.nudgeSave)) {
          inp.nudge = b.x < cx ? 2 : 3;
          this.tiltMeter += TILT.perNudge;
          this.nudgeCooldown = 120;
          this.stats.nudges++;
          return;
        }
      }
      // Ball dropping onto an outlane post from above: a side bump can kick it to the inlane.
      const nearL = b.x < 2.3 && b.x > 0.6 && b.y > 11.4 && b.y < 13.4 && b.vy < -2;
      const nearR = b.x > 16.1 && b.x < 17.8 && b.y > 11.4 && b.y < 13.4 && b.vy < -2;
      if (!nearL && !nearR) continue;
      const last = this.lastOutlaneCheck.get(b.id) ?? -1e9;
      this.lastOutlaneCheck.set(b.id, sim.step);
      if (sim.step - last < 60) continue;
      if (!this.rng.chance(this.skill.nudgeSave)) continue;
      inp.nudge = nearL ? 3 : 2;
      this.tiltMeter += TILT.perNudge;
      this.nudgeCooldown = 120;
      this.stats.nudges++;
      return;
    }
  }
}
