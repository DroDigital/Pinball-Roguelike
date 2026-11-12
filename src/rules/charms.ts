/**
 * Folding owned charms' and tattoos' static effects into one record: multipliers multiply,
 * additions add, flags OR, and "better is lower/higher" fields take the best. Each tattoo rank
 * folds its own effect, so stacked ranks compound.
 */
import { CHARM_BY_ID, type CharmFx } from '../content/charms';
import { TATTOO_BY_ID } from '../content/tattoos';
import type { ShotType } from '../sim/table-def';

export interface FoldedFx {
  shotMult: Partial<Record<ShotType, number>>;
  payMult: number;
  comboStart: number;
  comboWindowAdd: number;
  comboStep: number;
  bonusMaxAdd: number;
  bonusStartAdd: number;
  bonusShareMult: number;
  noBonusCap: boolean;
  noBonus: boolean;
  holdBonusMult: boolean;
  /** 0 = no change. */
  locksNeeded: number;
  riotBallsAdd: number;
  ballSaveAdd: number;
  noBallSave: boolean;
  nudgeStrength: number;
  extraWarnings: number;
  kickStrength: number;
  greasedRail: boolean;
  luck: number;
  sparkMult: number;
  holeHoldAdd: number;
  brawlSecondsAdd: number;
  shiftSecondsAdd: number;
  shakedownSlingsAdd: number;
  mounts: string[];
  interestAdd: number;
  /** 0 = no change. */
  loanRate: number;
  pocketInterest: number;
  payEarlyTickets: number;
  sellFull: boolean;
  contrabandSlots: number;
  contrabandDiscount: number;
  jobRewardMult: number;
  freeBalls: number;
  oilCanLevels: number;
  oilCanAlways: boolean;
  comboStepAdd: number;
  bountyMult: number;
  mostWantedSooner: number;
  paydayMult: number;
  modeSecondsMult: number;
  paGapMult: number;
  kickbackStart: boolean;
  extraBallCapAdd: number;
  twinChance: number;
  payPerRep: number;
  grudgePay: number;
  xpMult: number;
  ballPriceMult: number;
  /** Sleeves inked (behaviour checked by id). */
  sleeves: string[];
}

export function emptyFx(): FoldedFx {
  return {
    shotMult: {},
    payMult: 1,
    comboStart: 0,
    comboWindowAdd: 0,
    comboStep: 0,
    bonusMaxAdd: 0,
    bonusStartAdd: 0,
    bonusShareMult: 1,
    noBonusCap: false,
    noBonus: false,
    holdBonusMult: false,
    locksNeeded: 0,
    riotBallsAdd: 0,
    ballSaveAdd: 0,
    noBallSave: false,
    nudgeStrength: 1,
    extraWarnings: 0,
    kickStrength: 1,
    greasedRail: false,
    luck: 0,
    sparkMult: 1,
    holeHoldAdd: 0,
    brawlSecondsAdd: 0,
    shiftSecondsAdd: 0,
    shakedownSlingsAdd: 0,
    mounts: [],
    interestAdd: 0,
    loanRate: 0,
    pocketInterest: 0,
    payEarlyTickets: 0,
    sellFull: false,
    contrabandSlots: 0,
    contrabandDiscount: 0,
    jobRewardMult: 1,
    freeBalls: 0,
    oilCanLevels: 0,
    oilCanAlways: false,
    comboStepAdd: 0,
    bountyMult: 1,
    mostWantedSooner: 0,
    paydayMult: 1,
    modeSecondsMult: 1,
    paGapMult: 1,
    kickbackStart: false,
    extraBallCapAdd: 0,
    twinChance: 0,
    payPerRep: 0,
    grudgePay: 0,
    xpMult: 1,
    ballPriceMult: 1,
    sleeves: [],
  };
}

function fold(out: FoldedFx, fx: CharmFx): void {
  for (const [k, v] of Object.entries(fx.shotMult ?? {}) as [ShotType, number][])
    out.shotMult[k] = (out.shotMult[k] ?? 1) * v;
  if (fx.payMult) out.payMult *= fx.payMult;
  if (fx.comboStart) out.comboStart = Math.max(out.comboStart, fx.comboStart);
  if (fx.comboWindowAdd) out.comboWindowAdd += fx.comboWindowAdd;
  if (fx.comboStep) out.comboStep = Math.max(out.comboStep, fx.comboStep);
  if (fx.bonusMaxAdd) out.bonusMaxAdd += fx.bonusMaxAdd;
  if (fx.bonusStartAdd) out.bonusStartAdd += fx.bonusStartAdd;
  if (fx.bonusShareMult) out.bonusShareMult *= fx.bonusShareMult;
  if (fx.noBonusCap) out.noBonusCap = true;
  if (fx.noBonus) out.noBonus = true;
  if (fx.holdBonusMult) out.holdBonusMult = true;
  if (fx.locksNeeded)
    out.locksNeeded = out.locksNeeded ? Math.min(out.locksNeeded, fx.locksNeeded) : fx.locksNeeded;
  if (fx.riotBallsAdd) out.riotBallsAdd += fx.riotBallsAdd;
  if (fx.ballSaveAdd) out.ballSaveAdd += fx.ballSaveAdd;
  if (fx.noBallSave) out.noBallSave = true;
  if (fx.nudgeStrength) out.nudgeStrength *= fx.nudgeStrength;
  if (fx.extraWarnings) out.extraWarnings += fx.extraWarnings;
  if (fx.kickStrength) out.kickStrength *= fx.kickStrength;
  if (fx.greasedRail) out.greasedRail = true;
  if (fx.luck) out.luck += fx.luck;
  if (fx.sparkMult) out.sparkMult *= fx.sparkMult;
  if (fx.holeHoldAdd) out.holeHoldAdd += fx.holeHoldAdd;
  if (fx.brawlSecondsAdd) out.brawlSecondsAdd += fx.brawlSecondsAdd;
  if (fx.shiftSecondsAdd) out.shiftSecondsAdd += fx.shiftSecondsAdd;
  if (fx.shakedownSlingsAdd) out.shakedownSlingsAdd += fx.shakedownSlingsAdd;
  if (fx.mount) out.mounts.push(fx.mount);
  if (fx.interestAdd) out.interestAdd += fx.interestAdd;
  if (fx.loanRate) out.loanRate = out.loanRate ? Math.min(out.loanRate, fx.loanRate) : fx.loanRate;
  if (fx.pocketInterest) out.pocketInterest += fx.pocketInterest;
  if (fx.payEarlyTickets) out.payEarlyTickets += fx.payEarlyTickets;
  if (fx.sellFull) out.sellFull = true;
  if (fx.contrabandSlots) out.contrabandSlots += fx.contrabandSlots;
  if (fx.contrabandDiscount) out.contrabandDiscount += fx.contrabandDiscount;
  if (fx.jobRewardMult) out.jobRewardMult *= fx.jobRewardMult;
  if (fx.freeBalls) out.freeBalls += fx.freeBalls;
  if (fx.oilCanLevels) out.oilCanLevels = Math.max(out.oilCanLevels, fx.oilCanLevels);
  if (fx.oilCanAlways) out.oilCanAlways = true;
  if (fx.comboStepAdd) out.comboStepAdd += fx.comboStepAdd;
  if (fx.bountyMult) out.bountyMult *= fx.bountyMult;
  if (fx.mostWantedSooner) out.mostWantedSooner += fx.mostWantedSooner;
  if (fx.paydayMult) out.paydayMult *= fx.paydayMult;
  if (fx.modeSecondsMult) out.modeSecondsMult *= fx.modeSecondsMult;
  if (fx.paGapMult) out.paGapMult *= fx.paGapMult;
  if (fx.kickbackStart) out.kickbackStart = true;
  if (fx.extraBallCapAdd) out.extraBallCapAdd += fx.extraBallCapAdd;
  if (fx.twinChance) out.twinChance += fx.twinChance;
  if (fx.payPerRep) out.payPerRep += fx.payPerRep;
  if (fx.grudgePay) out.grudgePay += fx.grudgePay;
  if (fx.xpMult) out.xpMult *= fx.xpMult;
  if (fx.ballPriceMult) out.ballPriceMult *= fx.ballPriceMult;
}

/** Fold the static effects of a set of owned charms, then every inked tattoo rank. */
export function foldCharms(
  ids: readonly string[],
  ink: Readonly<Record<string, number>> = {},
): FoldedFx {
  const out = emptyFx();
  for (const id of ids) {
    const fx = CHARM_BY_ID.get(id)?.fx;
    if (fx) fold(out, fx);
  }
  // Object key order is insertion order: stable for a given run.
  for (const [id, n] of Object.entries(ink)) {
    const t = TATTOO_BY_ID.get(id);
    if (!t) continue;
    if (t.rarity === 'sleeve') {
      if (n > 0) out.sleeves.push(id);
      continue;
    }
    for (let r = 0; r < Math.min(n, t.ranks.length); r++) {
      const fx = t.ranks[r].fx;
      if (fx) fold(out, fx);
    }
  }
  return out;
}
