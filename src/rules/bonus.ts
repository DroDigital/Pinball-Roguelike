/** End-of-ball Bonus maths (pure). */
export interface BonusFactors {
  /** Fraction of the Bonus the player keeps (Taxman 0.75; Hellfire Rubber 0). */
  keep: number;
  /** Times the Bonus is tallied (Last Rites on the last ball: 2). */
  times: number;
}

export function bonusTotal(bonus: number, mult: number, f: BonusFactors): number {
  return Math.max(0, bonus) * Math.max(1, mult) * f.keep * f.times;
}
