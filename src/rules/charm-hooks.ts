/**
 * Charm behaviour hooks, keyed by charm id. Ball hooks run inside TableGame through the
 * narrow `BallRules` interface; run hooks act on the RunState between balls. Static effects
 * (multipliers, slots, flags) live in the charm data and are folded by rules/charms.ts.
 */
import type { ShotType } from '../sim/table-def';
import type { BallStats } from '../content/jobs';
import type { BallContext } from './table-game';
import type { ComboTracker } from './combo';

/** What a ball hook may read and do. */
export interface BallRules {
  readonly ctx: BallContext;
  readonly stats: BallStats;
  readonly combo: ComboTracker;
  readonly time: number;
  readonly luck: number;
  readonly riot: boolean;
  /** Roll a base chance with luck applied. */
  lucky(base: number): boolean;
  addBonusMult(n: number): void;
  levelUp(shot: ShotType): void;
}

export interface BallHooks {
  /** Multiplier on a hit's value (`source` is the switch / bumper id). */
  hitMult?(g: BallRules, shot: ShotType, source: string): number;
  onHit?(g: BallRules, shot: ShotType, source: string): void;
  onSetComplete?(g: BallRules, set: 'lanes' | 'cellblock'): void;
  paydayMult?(g: BallRules): number;
  onPayday?(g: BallRules, isSuper: boolean): void;
  onLuckyBounce?(g: BallRules): void;
  /** True turns this outlane drain into a lucky bounce. */
  forceBounce?(g: BallRules): boolean;
  /** RIOT multiball save in seconds (the longest wins). */
  riotSave?(g: BallRules): number;
}

const CRACK_PENNY_CHANCE = 0.05;
const BAR_FIGHT_HITS = 25;
const GLASS_EYE_LUCK = 20;
const RIOT_SHIELD_SECS = 20;

export const BALL_HOOKS: Record<string, BallHooks> = {
  mothWings: {
    hitMult: (g, shot) =>
      shot === 'perimeter' && g.combo.count >= 2 && g.combo.active(g.time) ? 3 : 1,
  },
  crookedPenny: {
    hitMult: (g, shot) => (shot !== 'searchlight' && g.lucky(CRACK_PENNY_CHANCE) ? 10 : 1),
  },
  goldFilling: {
    // The gold bumper is the mount's reference bumper (pop2).
    hitMult: (_g, shot, source) => (shot === 'yard' && source === 'pop2' ? 10 : 1),
  },
  barFight: {
    onHit: (g, shot) => {
      if (shot === 'yard' && g.stats.yardHits > 0 && g.stats.yardHits % BAR_FIGHT_HITS === 0)
        g.addBonusMult(1);
    },
  },
  notchedSpoon: {
    onSetComplete: (g, set) => {
      if (set === 'cellblock') g.levelUp('cellblock');
    },
  },
  ninthLife: {
    onLuckyBounce: (g) => g.addBonusMult(1),
  },
  glassEye: {
    forceBounce: (g) => g.luck >= GLASS_EYE_LUCK,
  },
  riotShield: {
    paydayMult: () => 2,
    riotSave: () => RIOT_SHIELD_SECS,
  },
};

/** Run-level hook ids (implemented in rules/run.ts where the run state lives). */
export const RUN_HOOK_IDS = [
  'lastRites',
  'candleStub',
  'wishbone',
  'magpieFeather',
  'patronSaint',
  'solitary',
  'thickSkin',
  'hoarderSack',
  'wardensKeyring',
  'handCrank',
] as const;

export const RUN_HOOK = {
  candleLuck: 6,
  wishboneLuck: 2,
  magpieChance: 0.1,
  solitaryMult: 4,
  thickSkinTickets: 3,
  thickSkinLuck: 1,
  lastRitesTimes: 2,
} as const;
