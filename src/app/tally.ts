/**
 * The ball-over breakdown as plain numbers. The Pocket takes whole coins and `finishBall` carries
 * the fraction to the next ball, so the honest sum on screen is
 *
 *   table + bonus + loose change carried in  =  coins into the Pocket + loose change kept
 */
import type { BallOutcome, BallResult } from '../rules/run';

export interface Tally {
  table: number;
  bonus: number;
  /** Loose change from earlier balls that rode in with this one. */
  carried: number;
  /** Whole coins that went into the Pocket. */
  gained: number;
  /** The fraction left over, carried to the next ball. */
  kept: number;
  /** A tilt keeps nothing: the rows are shown but struck out. */
  lost: boolean;
}

/** `looseChange` is the run's carry as it is after the ball was finished. */
export function tally(o: BallOutcome, res: BallResult, looseChange: number): Tally {
  const lost = o.tilted;
  const kept = lost ? 0 : looseChange;
  const carried = lost ? 0 : Math.max(0, res.gained + kept - o.earned - o.bonus);
  return { table: o.earned, bonus: o.bonus, carried, gained: res.gained, kept, lost };
}
