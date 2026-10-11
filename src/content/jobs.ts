/**
 * Round Jobs posted by the ATM. A Job reads one per-ball stat and either sums it over the
 * round's balls or takes the best single ball. Coin-denominated targets and rewards follow
 * the debt curve so a Job means the same thing in deadline 1 and deadline 7.
 */
import type { ShotType } from '../sim/table-def';

/** Per-ball counters the rules keep (also feed run stats and the Rap Sheet). */
export interface BallStats {
  chutes: number;
  perimeters: number;
  holes: number;
  cellBlocks: number;
  laneSets: number;
  yardHits: number;
  spins: number;
  skillShots: number;
  superSkillShots: number;
  maxCombo: number;
  locks: number;
  riots: number;
  paydays: number;
  superPaydays: number;
  biggestPayday: number;
  bonusTally: number;
  seconds: number;
  earned: number;
  luckyBounces: number;
  /** The neighbor's secret shot. */
  tunnels: number;
  jailbreakShots: number;
}

export function emptyBallStats(): BallStats {
  return {
    chutes: 0,
    perimeters: 0,
    holes: 0,
    cellBlocks: 0,
    laneSets: 0,
    yardHits: 0,
    spins: 0,
    skillShots: 0,
    superSkillShots: 0,
    maxCombo: 0,
    locks: 0,
    riots: 0,
    paydays: 0,
    superPaydays: 0,
    biggestPayday: 0,
    bonusTally: 0,
    seconds: 0,
    earned: 0,
    luckyBounces: 0,
    tunnels: 0,
    jailbreakShots: 0,
  };
}

export interface JobReward {
  tickets?: number;
  /** Coins, scaled by the debt curve. */
  coins?: number;
  /** +1 level to this shot type. */
  level?: ShotType;
  keys?: number;
}

export interface JobDef {
  id: string;
  /** Short title for the DMD and ATM ("{n}" is replaced with the target). */
  text: string;
  stat: keyof BallStats;
  /** sum: across the round's balls; max: best single ball. */
  mode: 'sum' | 'max';
  target: number;
  /** Target follows the debt curve (coin-valued stats). */
  scaled?: boolean;
  reward: JobReward;
  /** Key Jobs are rare, harder, and award a Key. */
  key?: boolean;
  minDeadline?: number;
}

export const JOB_DEFS: JobDef[] = [
  {
    id: 'chute',
    text: 'Shoot the Chute {n} times',
    stat: 'chutes',
    mode: 'sum',
    target: 5,
    reward: { tickets: 3 },
  },
  {
    id: 'cellblock',
    text: 'Clear Cell Block {n} times',
    stat: 'cellBlocks',
    mode: 'sum',
    target: 2,
    reward: { tickets: 3 },
  },
  {
    id: 'combo',
    text: 'Make a {n}-shot combo',
    stat: 'maxCombo',
    mode: 'max',
    target: 4,
    reward: { tickets: 4 },
  },
  {
    id: 'riot',
    text: 'Start a RIOT',
    stat: 'riots',
    mode: 'sum',
    target: 1,
    reward: { tickets: 4 },
  },
  {
    id: 'bonus',
    text: 'Tally a {n}-coin Bonus',
    stat: 'bonusTally',
    mode: 'max',
    target: 12,
    scaled: true,
    reward: { tickets: 3 },
  },
  {
    id: 'survive',
    text: 'Keep one ball alive {n} s',
    stat: 'seconds',
    mode: 'max',
    target: 90,
    reward: { coins: 10 },
  },
  {
    id: 'perimeter',
    text: 'Shoot the Perimeter {n} times',
    stat: 'perimeters',
    mode: 'sum',
    target: 4,
    reward: { level: 'perimeter', tickets: 1 },
  },
  {
    id: 'yard',
    text: 'Hit the Yard {n} times',
    stat: 'yardHits',
    mode: 'sum',
    target: 60,
    reward: { level: 'yard', tickets: 1 },
  },
  {
    id: 'skill',
    text: 'Make {n} skill shots',
    stat: 'skillShots',
    mode: 'sum',
    target: 2,
    reward: { tickets: 2, coins: 4 },
  },
  {
    id: 'lanes',
    text: 'Complete the top lanes {n} times',
    stat: 'laneSets',
    mode: 'sum',
    target: 3,
    reward: { level: 'lanes', tickets: 1 },
  },
  {
    id: 'spinner',
    text: 'Spin the Searchlight {n} times',
    stat: 'spins',
    mode: 'sum',
    target: 100,
    reward: { level: 'searchlight', tickets: 1 },
  },
  {
    id: 'hole',
    text: 'Sink the Hole {n} times',
    stat: 'holes',
    mode: 'sum',
    target: 4,
    reward: { level: 'hole', tickets: 1 },
  },
  {
    id: 'earn',
    text: 'Earn {n} coins in one ball',
    stat: 'earned',
    mode: 'max',
    target: 22,
    scaled: true,
    reward: { tickets: 3 },
  },
  // Key Jobs.
  {
    id: 'kSuper',
    text: 'Collect SUPER PAYDAY',
    stat: 'superPaydays',
    mode: 'sum',
    target: 1,
    reward: { keys: 1 },
    key: true,
  },
  {
    id: 'kCombo',
    text: 'Make a {n}-shot combo',
    stat: 'maxCombo',
    mode: 'max',
    target: 6,
    reward: { keys: 1 },
    key: true,
  },
  {
    id: 'kSkill',
    text: 'Make a super skill shot',
    stat: 'superSkillShots',
    mode: 'sum',
    target: 1,
    reward: { keys: 1 },
    key: true,
  },
  {
    id: 'kCell',
    text: 'Clear Cell Block {n} times in one ball',
    stat: 'cellBlocks',
    mode: 'max',
    target: 3,
    reward: { keys: 1 },
    key: true,
  },
];

export function jobDef(id: string): JobDef {
  const d = JOB_DEFS.find((j) => j.id === id);
  if (!d) throw new Error(`unknown job ${id}`);
  return d;
}

export function jobText(def: JobDef, target: number): string {
  return def.text.replace('{n}', String(target));
}
