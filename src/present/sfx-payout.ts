/**
 * How a table payout sounds. Payouts are scaled by SCORE.scale (a pop bumper pays 0.12 coins at
 * level 1), so the tiers are defined on "points": amount / SCORE.scale, which is the shot's base
 * value times its level, combo and charm multipliers. That way the sound follows what the shot is
 * worth, not the economy's current scale. Pure data and functions (Node-safe) so tests can check
 * them against real payouts.
 */
import { SCORE } from '../content/balance';

export type PayoutTier = 0 | 1 | 2 | 3 | 4;

/** Lower bounds, in points, of tiers 1..4. Below the first, only the hit's own sound plays. */
export const PAYOUT_POINTS = {
  /** A quiet coin tick: lane, pop, drop target. */
  tick: 0.3,
  /** Coin and a low chime bar: outlane, Hole, a levelled pop. */
  minor: 0.9,
  /** Coin, mid chime bar and a note on the ladder: Chute, Perimeter, Cell Block, skill shot. */
  major: 2.5,
  /** Coin, high bar, ladder note and the bright coin: combos, super skill shot, levelled shots. */
  big: 6,
} as const;

/** The tier of a payout (`amount` in coins). */
export function payoutTier(amount: number): PayoutTier {
  const pts = amount / SCORE.scale;
  if (pts >= PAYOUT_POINTS.big) return 4;
  if (pts >= PAYOUT_POINTS.major) return 3;
  if (pts >= PAYOUT_POINTS.minor) return 2;
  if (pts >= PAYOUT_POINTS.tick) return 1;
  return 0;
}

/** Minimum seconds between two tier-1 ticks (a pop bumper rally must not turn into a rattle). */
export const TICK_GAP = 0.085;

/**
 * Crowd control for bursts of payouts: each payout adds one to a density that decays with this
 * time constant, and the level of the next one drops as it builds.
 */
export const CROWD = { decay: 0.7, free: 2, slope: 0.16 } as const;

/** Gain multiplier (<= 1) for a payout landing on top of `density` recent ones. */
export function crowdGain(density: number): number {
  return 1 / (1 + CROWD.slope * Math.max(0, density - CROWD.free));
}
