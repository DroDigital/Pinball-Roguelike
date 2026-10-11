/**
 * The run: deadlines, rounds, Jobs, balls, Pocket/Bank/debt. Plain serialisable state plus
 * pure-ish functions that mutate it deterministically (all randomness through the run's
 * Rng state).
 */
import { Rng, hashString, type RngState } from '../core/rng';
import { ECONOMY, JOBS } from '../content/balance';
import { JOB_DEFS, jobDef, type BallStats, type JobDef } from '../content/jobs';
import type { ShotType } from '../sim/table-def';
import {
  SHOT_TYPES,
  defaultBallContext,
  newMachineState,
  type BallContext,
  type MachineState,
} from './table-game';
import type { BallSnapshot } from './session';

export type RunPhase = 'pickJob' | 'buyBalls' | 'ball' | 'betweenBalls' | 'deadline' | 'over';
export type RunResult = 'fell' | 'paidInFull' | 'breakout' | 'cellmate' | null;

export interface RunStats {
  balls: number;
  coinsEarned: number;
  biggestBall: number;
  drains: Record<string, number>;
  tilts: number;
  skillShots: number;
  riots: number;
  paydays: number;
  biggestPayday: number;
  longestCombo: number;
  biggestBonus: number;
  jobsDone: number;
}

export interface JobOffer {
  id: string;
  target: number;
}

export interface RunJob extends JobOffer {
  progress: number;
  done: boolean;
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
  /** Permanent luck (Thick Skin, phone perks); each ball adds its own on top. */
  luck: number;
  shotLevels: Record<ShotType, number>;
  machine: MachineState;
  phase: RunPhase;
  /** Jobs posted at round start, and the one taken. */
  jobOffers: JobOffer[];
  job: RunJob | null;
  /** Balls bought for this round (incl. free and extra balls) and how many have been played. */
  ballsThisRound: number;
  ballsPlayed: number;
  /** PAYDAY value carried between RIOTs (Hoarder's Sack). */
  paydayCarry: number;
  result: RunResult;
  stats: RunStats;
  /** Deadlines in this run (8 normally). */
  deadlines: number;
}

export function debtFor(deadline: number, base = ECONOMY.startDebt): number {
  return Math.round(base * Math.pow(ECONOMY.debtGrowth, deadline));
}

/** How much bigger coin amounts are at this deadline than at the first. */
export function debtScale(deadline: number): number {
  return Math.pow(ECONOMY.debtGrowth, deadline) * JOBS.coinScale;
}

export function ballPrice(s: RunState): number {
  return ECONOMY.ballPriceBase + ECONOMY.ballPricePerDeadline * s.deadline;
}

export function newRun(seed: string, opts: { deadlines?: number } = {}): RunState {
  const rng = new Rng(hashString(seed));
  const levels = {} as Record<ShotType, number>;
  for (const t of SHOT_TYPES) levels[t] = 1;
  const s: RunState = {
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
    luck: 0,
    shotLevels: levels,
    machine: newMachineState(),
    phase: 'pickJob',
    jobOffers: [],
    job: null,
    ballsThisRound: 0,
    ballsPlayed: 0,
    paydayCarry: 0,
    result: null,
    stats: {
      balls: 0,
      coinsEarned: 0,
      biggestBall: 0,
      drains: {},
      tilts: 0,
      skillShots: 0,
      riots: 0,
      paydays: 0,
      biggestPayday: 0,
      longestCombo: 0,
      biggestBonus: 0,
      jobsDone: 0,
    },
    deadlines: opts.deadlines ?? ECONOMY.deadlines,
  };
  postJobs(s);
  return s;
}

function rngOf(s: RunState): Rng {
  const r = new Rng(0);
  r.setState(s.rng);
  return r;
}

// ------------------------------------------------------------------ jobs

export function jobTarget(def: JobDef, deadline: number): number {
  return def.scaled ? Math.max(1, Math.round(def.target * debtScale(deadline))) : def.target;
}

/** The ATM posts this round's Jobs. */
export function postJobs(s: RunState): void {
  const rng = rngOf(s);
  const pool = JOB_DEFS.filter((d) => !d.key && (d.minDeadline ?? 0) <= s.deadline);
  rng.shuffle(pool);
  const picks = pool.slice(0, JOBS.offers);
  if (s.deadline >= JOBS.keyJobMinDeadline && rng.chance(JOBS.keyJobChance)) {
    const keys = JOB_DEFS.filter((d) => d.key);
    picks[picks.length - 1] = rng.pick(keys);
  }
  s.rng = rng.getState();
  s.jobOffers = picks.map((d) => ({ id: d.id, target: jobTarget(d, s.deadline) }));
  s.job = null;
  s.phase = 'pickJob';
}

export function pickJob(s: RunState, index: number): boolean {
  if (s.phase !== 'pickJob') return false;
  const o = s.jobOffers[index];
  if (!o) return false;
  s.job = { ...o, progress: 0, done: false };
  s.phase = 'buyBalls';
  return true;
}

/** Coins a Job's coin reward is worth at this deadline. */
export function jobCoins(def: JobDef, deadline: number): number {
  return def.reward.coins ? Math.round(def.reward.coins * debtScale(deadline)) : 0;
}

function applyJobReward(s: RunState, def: JobDef): void {
  const r = def.reward;
  if (r.tickets) s.tickets += r.tickets;
  s.pocket += jobCoins(def, s.deadline);
  if (r.level) s.shotLevels[r.level]++;
  if (r.keys) s.keys += r.keys;
  s.stats.jobsDone++;
}

// ------------------------------------------------------------------ balls

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
  const base = defaultBallContext();
  const job = s.job ? jobDef(s.job.id) : null;
  const ctx: BallContext = {
    ...base,
    shotLevels: { ...s.shotLevels },
    luck: s.luck,
    ballNumber: s.ballsPlayed + 1,
    ballsInRound: s.ballsThisRound,
    job:
      s.job && job
        ? {
            id: s.job.id,
            stat: job.stat,
            mode: job.mode,
            base: s.job.progress,
            target: s.job.target,
            done: s.job.done,
          }
        : null,
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
  /** Fractional coins earned on the table (excluding Bonus). */
  earned: number;
  /** Bonus tallied at the drain. */
  bonus: number;
  tilted: boolean;
  drainCause: string;
  machine: MachineState;
  stats: BallStats;
  levelUps: ShotType[];
  extraBalls: number;
  paydayEnd: number;
}

export interface BallResult {
  /** Whole coins added to the Pocket from the table and Bonus. */
  gained: number;
  /** The Job completed by this ball, if any. */
  jobDone: JobDef | null;
}

/** Commit a finished ball. */
export function finishBall(s: RunState, o: BallOutcome): BallResult {
  const total = o.tilted ? 0 : o.earned + o.bonus + s.looseChange;
  const whole = Math.floor(total);
  if (!o.tilted) s.looseChange = total - whole;
  const gained = o.tilted ? 0 : whole;
  s.pocket += gained;
  s.machine = o.machine;
  s.ballsPlayed++;
  s.ballsThisRound += o.extraBalls;
  for (const l of o.levelUps) s.shotLevels[l]++;
  const st = s.stats;
  st.balls++;
  st.coinsEarned += gained;
  st.biggestBall = Math.max(st.biggestBall, gained);
  st.drains[o.drainCause] = (st.drains[o.drainCause] ?? 0) + 1;
  if (o.tilted) st.tilts++;
  st.skillShots += o.stats.skillShots + o.stats.superSkillShots;
  st.riots += o.stats.riots;
  st.paydays += o.stats.paydays + o.stats.superPaydays;
  st.biggestPayday = Math.max(st.biggestPayday, o.stats.biggestPayday);
  st.longestCombo = Math.max(st.longestCombo, o.stats.maxCombo);
  st.biggestBonus = Math.max(st.biggestBonus, o.bonus);
  let jobDone: JobDef | null = null;
  if (s.job && !s.job.done) {
    const def = jobDef(s.job.id);
    const v = o.stats[def.stat];
    s.job.progress = def.mode === 'sum' ? s.job.progress + v : Math.max(s.job.progress, v);
    if (s.job.progress >= s.job.target) {
      s.job.done = true;
      applyJobReward(s, def);
      jobDone = def;
    }
  }
  s.phase = 'betweenBalls';
  return { gained, jobDone };
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
  else postJobs(s);
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
      postJobs(s);
    }
    return true;
  }
  s.phase = 'over';
  s.result = 'fell';
  return false;
}
