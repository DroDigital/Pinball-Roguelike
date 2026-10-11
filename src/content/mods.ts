/**
 * Permanent run modifiers. Phone perks, red-call bargains, inmates, Hard Time and (M4) charms
 * all write into this one record; the run reads it when pricing, paying interest and
 * building each ball. Additive fields add, `...Mult` fields multiply.
 */
import type { ShotType } from '../sim/table-def';

export interface RunMods {
  charmSlots: number;
  contrabandSlots: number;
  /** Extra free balls every round. */
  freeBalls: number;
  ballSaveAdd: number;
  bonusMaxAdd: number;
  interestAdd: number;
  rerollDiscount: number;
  luck: number;
  /** Multiplies every table payout. */
  payMult: number;
  /** Multiplies every future deadline's debt. */
  debtMult: number;
  ballPriceMult: number;
  flipperStrength: number;
  tiltSensitivity: number;
  extraWarnings: number;
  /** Loan repayment factor (150% normally). */
  loanRate: number;
  /** Shots that can never be lit / used (e.g. 'kickback'). */
  noKickback: boolean;
  /** Times a red call has been accepted (raises their odds). */
  redAccepted: number;
  /** First ball each round is not free. */
  noFreeBall: boolean;
  /** Per-shot pay multipliers. */
  shotMult: Partial<Record<ShotType, number>>;
}

export function defaultRunMods(): RunMods {
  return {
    charmSlots: 5,
    contrabandSlots: 2,
    freeBalls: 0,
    ballSaveAdd: 0,
    bonusMaxAdd: 0,
    interestAdd: 0,
    rerollDiscount: 0,
    luck: 0,
    payMult: 1,
    debtMult: 1,
    ballPriceMult: 1,
    flipperStrength: 1,
    tiltSensitivity: 1,
    extraWarnings: 0,
    loanRate: 1.5,
    noKickback: false,
    redAccepted: 0,
    noFreeBall: false,
    shotMult: {},
  };
}
