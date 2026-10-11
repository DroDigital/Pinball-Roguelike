/**
 * Hard Time: difficulty levels 1-8, unlocked per inmate by winning at the level below. Each
 * level adds its effect to every level beneath it.
 */
export interface HardTimeFx {
  debtMult?: number;
  /** Final rounds of each deadline a Sentence covers. */
  sentenceRounds?: number;
  ballSaveMult?: number;
  /** Charms on offer in the vending cabinet. */
  shopCharms?: number;
  interestAdd?: number;
  ballPriceMult?: number;
  redChanceAdd?: number;
}

export interface HardTimeDef {
  level: number;
  text: string;
  fx: HardTimeFx;
}

export const HARD_TIME: HardTimeDef[] = [
  { level: 1, text: 'Debts are 25% higher.', fx: { debtMult: 1.25 } },
  { level: 2, text: 'Sentences also hit round 2.', fx: { sentenceRounds: 2 } },
  { level: 3, text: 'Ball save is halved.', fx: { ballSaveMult: 0.5 } },
  { level: 4, text: 'The vending cabinet stocks 4 charms.', fx: { shopCharms: 4 } },
  { level: 5, text: 'The bank pays 5% interest.', fx: { interestAdd: -0.05 } },
  { level: 6, text: 'Balls cost 50% more.', fx: { ballPriceMult: 1.5 } },
  { level: 7, text: 'The red phone rings more often.', fx: { redChanceAdd: 0.15 } },
  { level: 8, text: 'Debts are doubled.', fx: { debtMult: 2 } },
];

export const MAX_HARD_TIME = HARD_TIME.length;
