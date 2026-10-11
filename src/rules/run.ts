/**
 * The run: deadlines, rounds, balls, Pocket/Bank/debt. Plain serialisable state plus pure-ish
 * functions that mutate it deterministically (all randomness through the run's Rng state).
 */
import { Rng, hashString, type RngState } from '../core/rng';
import { ECONOMY } from '../content/balance';
import type { ShotType } from '../sim/table-def';
import {
  SHOT_TYPES,
  defaultBallContext,
  newMachineState,
  type BallContext,
  type MachineState,
} from './table-game';
import type { BallSnapshot } from './session';

export type RunPhase = 'buyBalls' | 'ball' | 'betweenBalls' | 'deadline' | 'over';
export type RunResult = 'fell' | 'paidInFull' | 'breakout' | 'cellmate' | null;

export interface RunStats {
  balls: number;
  coinsEarned: number;
  biggestBall: number;
  drains: Record<string, number>;
  tilts: number;
  skillShots: number;
}

export interface RunState {
  version: 1;
  seed: string;
  rng: RngState;
  deadline: number;
  round: number;
  debt: number;
  bank: number;
  pocket: number;
  /** Fractional coins carried between balls. */
  looseChange: number;
  tickets: number;
  keys: number;
  shotLevels: Record<ShotType, number>;
  machine: MachineState;
  phase: RunPhase;
  /** Balls bought for this round (incl. free) and how many have been played. */
  ballsThisRound: number;
  ballsPlayed: number;
  result: RunResult;
  stats: RunStats;
  /** Deadlines in this run (8 normally). */
  deadlines: number;
}

export function debtFor(deadline: number, base = ECONOMY.startDebt): number {
  return Math.round(base * Math.pow(ECONOMY.debtGrowth, deadline));
}

export function ballPrice(s: RunState): number {
  return ECONOMY.ballPriceBase + ECONOMY.ballPricePerDeadline * s.deadline;
}

export function newRun(seed: string, opts: { deadlines?: number } = {}): RunState {
  const rng = new Rng(hashString(seed));
  const levels = {} as Record<ShotType, number>;
  for (const t of SHOT_TYPES) levels[t] = 1;
  return {
    version: 1,
    seed,
    rng: rng.getState(),
    deadline: 0,
    round: 0,
    debt: debtFor(0),
    bank: 0,
    pocket: ECONOMY.startCoins,
    looseChange: 0,
    tickets: 0,
    keys: 0,
    shotLevels: levels,
    machine: newMachineState(),
    phase: 'buyBalls',
    ballsThisRound: 0,
    ballsPlayed: 0,
    result: null,
    stats: { balls: 0, coinsEarned: 0, biggestBall: 0, drains: {}, tilts: 0, skillShots: 0 },
    deadlines: opts.deadlines ?? ECONOMY.deadlines,
  };
}

function rngOf(s: RunState): Rng {
  const r = new Rng(0);
  r.setState(s.rng);
  return r;
}

/** Cost to buy n balls this round (the first is free). */
export function costForBalls(s: RunState, n: number): number {
  return Math.max(0, n - 1) * ballPrice(s);
}

export function maxAffordableBalls(s: RunState): number {
  const p = ballPrice(s);
  return Math.min(ECONOMY.maxBallsPerRound, 1 + Math.floor(s.pocket / p));
}

/** Buy balls at round start. Returns false if not allowed/affordable. */
export function buyBalls(s: RunState, n: number): boolean {
  if (s.phase !== 'buyBalls' || n < 1 || n > ECONOMY.maxBallsPerRound) return false;
  const cost = costForBalls(s, n);
  if (cost > s.pocket) return false;
  s.pocket -= cost;
  s.ballsThisRound = n;
  s.ballsPlayed = 0;
  s.phase = 'betweenBalls';
  return true;
}

export function ballsLeft(s: RunState): number {
  return s.ballsThisRound - s.ballsPlayed;
}

/** Build the snapshot for the next ball. Advances the run Rng. */
export function nextBall(s: RunState, tags: string[] = ['outlanePosts']): BallSnapshot {
  const rng = rngOf(s);
  const seed = rng.nextU32();
  s.rng = rng.getState();
  s.phase = 'ball';
  const ctx: BallContext = {
    ...defaultBallContext(),
    shotLevels: { ...s.shotLevels },
    ballNumber: s.ballsPlayed + 1,
    ballsInRound: s.ballsThisRound,
  };
  return {
    seed,
    tags,
    mods: {},
    machine: JSON.parse(JSON.stringify(s.machine)) as MachineState,
    ctx,
  };
}

export interface BallOutcome {
  earned: number;
  tilted: boolean;
  drainCause: string;
  machine: MachineState;
  skillShots: number;
}

/** Commit a finished ball. Returns whole coins added to the Pocket. */
export function finishBall(s: RunState, o: BallOutcome): number {
  const total = o.earned + s.looseChange;
  const whole = Math.floor(total);
  s.looseChange = o.tilted ? s.looseChange : total - whole;
  const gained = o.tilted ? 0 : whole;
  s.pocket += gained;
  s.machine = o.machine;
  s.ballsPlayed++;
  s.stats.balls++;
  s.stats.coinsEarned += gained;
  s.stats.biggestBall = Math.max(s.stats.biggestBall, gained);
  s.stats.drains[o.drainCause] = (s.stats.drains[o.drainCause] ?? 0) + 1;
  if (o.tilted) s.stats.tilts++;
  s.stats.skillShots += o.skillShots;
  s.phase = 'betweenBalls';
  return gained;
}

/** Move coins from Pocket to Bank. Deposits are final. */
export function deposit(s: RunState, amount: number): number {
  const a = Math.max(0, Math.min(Math.floor(amount), s.pocket));
  s.pocket -= a;
  s.bank += a;
  return a;
}

/** End the round once all balls are played: interest, then next round or the deadline. */
export function endRound(s: RunState): void {
  if (ballsLeft(s) > 0) return;
  s.bank += Math.floor(s.bank * ECONOMY.interest);
  s.round++;
  s.machine = newMachineState();
  if (s.round >= ECONOMY.roundsPerDeadline) s.phase = 'deadline';
  else s.phase = 'buyBalls';
}

/** Settle the deadline. Returns true if paid (run continues), false if the floor opens. */
export function settleDeadline(s: RunState): boolean {
  if (s.bank >= s.debt) {
    s.bank -= s.debt;
    s.deadline++;
    s.round = 0;
    if (s.deadline >= s.deadlines) {
      s.phase = 'over';
      s.result = 'paidInFull';
    } else {
      s.debt = debtFor(s.deadline);
      s.phase = 'buyBalls';
    }
    return true;
  }
  s.phase = 'over';
  s.result = 'fell';
  return false;
}
