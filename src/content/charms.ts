/**
 * Charms. Each is data: rarity, ticket cost, tags, text, and its effect split into
 * - `fx`: static modifiers compiled into every ball and the run's economy (multipliers from
 *   different charms multiply, additions add), and
 * - behaviour hooks, implemented in `rules/charm-hooks.ts` and keyed by charm id (hit, combo,
 *   set complete, PAYDAY, drain, bonus tally, Job complete, round end, deadline, deposit,
 *   loan).
 * Numbers are starting values; tune them with `npm run economy`.
 */
import type { ShotType } from '../sim/table-def';

export type CharmTag = 'Yard' | 'Chute' | 'Bonus' | 'Riot' | 'Luck' | 'Money' | 'Lone' | 'Iron';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'devil';

/** Static effects. Ball-side fields reach the BallContext / sim; run-side fields the economy. */
export interface CharmFx {
  // ---- ball
  shotMult?: Partial<Record<ShotType, number>>;
  payMult?: number;
  comboStart?: number;
  comboWindowAdd?: number;
  comboStep?: number;
  bonusMaxAdd?: number;
  bonusShareMult?: number;
  noBonusCap?: boolean;
  noBonus?: boolean;
  holdBonusMult?: boolean;
  locksNeeded?: number;
  riotBallsAdd?: number;
  ballSaveAdd?: number;
  noBallSave?: boolean;
  nudgeStrength?: number;
  extraWarnings?: number;
  kickStrength?: number;
  greasedRail?: boolean;
  luck?: number;
  sparkMult?: number;
  /** Seconds added to the Hole's hold (negative ejects sooner). */
  holeHoldAdd?: number;
  /** Table tag this hardware charm mounts. */
  mount?: string;
  // ---- run
  interestAdd?: number;
  loanRate?: number;
  pocketInterest?: number;
  payEarlyTickets?: number;
  sellFull?: boolean;
  contrabandSlots?: number;
  contrabandDiscount?: number;
  jobRewardMult?: number;
  freeBalls?: number;
  /** Multiplies every remaining debt when gained (Devil's Due). */
  debtMult?: number;
  oilCanLevels?: number;
  oilCanAlways?: boolean;
}

export interface ActiveDef {
  charges: number;
  /** Charges refill every round (default) or every deadline. */
  per: 'round' | 'deadline';
  action: 'ballSave' | 'slowmo' | 'crowbar' | 'twinYolk';
}

export interface CharmDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Ticket cost. */
  cost: number;
  tags: CharmTag[];
  text: string;
  fx?: CharmFx;
  active?: ActiveDef;
  /** Devil charms can't be sold. */
  cursed?: boolean;
}

export const CHARMS: CharmDef[] = [
  // ---------------------------------------------------------------- Money
  {
    id: 'piggyBank',
    name: 'Rusty Piggy Bank',
    rarity: 'common',
    cost: 2,
    tags: ['Money'],
    text: '+5% interest.',
    fx: { interestAdd: 0.05 },
  },
  {
    id: 'sharkTooth',
    name: "Loan Shark's Tooth",
    rarity: 'uncommon',
    cost: 3,
    tags: ['Money'],
    text: 'Loans add 110% to the next debt instead of 150%.',
    fx: { loanRate: 1.1 },
  },
  {
    id: 'mattress',
    name: 'Mattress Stuffing',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Money'],
    text: 'Pocket coins also earn 5% interest at round end.',
    fx: { pocketInterest: 0.05 },
  },
  {
    id: 'pawnTicket',
    name: 'Pawn Ticket',
    rarity: 'common',
    cost: 1,
    tags: ['Money'],
    text: '+2 tickets whenever you pay a deadline early.',
    fx: { payEarlyTickets: 2 },
  },
  {
    id: 'hollowBook',
    name: 'Hollow Book',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Money'],
    text: 'Selling a charm refunds its full price.',
    fx: { sellFull: true },
  },
  {
    id: 'stashBox',
    name: 'Stash Box',
    rarity: 'common',
    cost: 2,
    tags: ['Money'],
    text: '+1 contraband slot; contraband costs 1 coin less.',
    fx: { contrabandSlots: 1, contrabandDiscount: 1 },
  },
  {
    id: 'overtime',
    name: 'Overtime',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Money'],
    text: 'Job rewards are doubled.',
    fx: { jobRewardMult: 2 },
  },

  // ---------------------------------------------------------------- Shots
  {
    id: 'jarOfTeeth',
    name: 'Jar of Teeth',
    rarity: 'common',
    cost: 2,
    tags: ['Yard'],
    text: 'Yard bumpers pay 3x.',
    fx: { shotMult: { yard: 3 } },
  },
  {
    id: 'brassKnuckles',
    name: 'Brass Knuckles',
    rarity: 'common',
    cost: 1,
    tags: ['Yard'],
    text: 'Slingshots pay 4x.',
    fx: { shotMult: { sling: 4 } },
  },
  {
    id: 'barFight',
    name: 'Bar Fight',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Yard', 'Bonus'],
    text: 'Every 25 Yard bumper hits in one ball add +1 to the Bonus multiplier.',
  },
  {
    id: 'oiledHinge',
    name: 'Oiled Hinge',
    rarity: 'common',
    cost: 2,
    tags: ['Chute'],
    text: 'The Searchlight pays 3x.',
    fx: { shotMult: { searchlight: 3 } },
  },
  {
    id: 'greasedRail',
    name: 'Greased Rail',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Chute'],
    text: 'Chute shots pay 3x and never roll back down.',
    fx: { shotMult: { chute: 3 }, greasedRail: true },
  },
  {
    id: 'mothWings',
    name: 'Moth Wings',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Chute'],
    text: 'Perimeter shots pay 3x while a combo is active.',
  },
  {
    id: 'feedingBowl',
    name: 'Feeding Bowl',
    rarity: 'common',
    cost: 2,
    tags: ['Riot'],
    text: 'The Hole pays 3x and ejects 1 s sooner.',
    fx: { shotMult: { hole: 3 }, holeHoldAdd: -1 },
  },
  {
    id: 'greaseMonkey',
    name: 'Grease Monkey',
    rarity: 'rare',
    cost: 5,
    tags: ['Iron'],
    text: 'Oil Cans give +2 levels and appear in every shop.',
    fx: { oilCanLevels: 2, oilCanAlways: true },
  },

  // ---------------------------------------------------------------- Combos
  {
    id: 'crackedMirror',
    name: 'Cracked Mirror',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Chute'],
    text: 'Combos start at x2.',
    fx: { comboStart: 2 },
  },
  {
    id: 'longFuse',
    name: 'Long Fuse',
    rarity: 'common',
    cost: 2,
    tags: ['Chute'],
    text: 'The combo window lasts 2 s longer.',
    fx: { comboWindowAdd: 2 },
  },
  {
    id: 'chainLink',
    name: 'Chain Link',
    rarity: 'rare',
    cost: 6,
    tags: ['Chute'],
    text: 'Each combo shot adds 2 to the multiplier instead of 1.',
    fx: { comboStep: 2 },
  },

  // ---------------------------------------------------------------- Bonus
  {
    id: 'chippedAbacus',
    name: 'Chipped Abacus',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Bonus'],
    text: '+3 max Bonus multiplier.',
    fx: { bonusMaxAdd: 3 },
  },
  {
    id: 'cookedBooks',
    name: 'Cooked Books',
    rarity: 'common',
    cost: 2,
    tags: ['Bonus'],
    text: 'Every hit adds double to the Bonus.',
    fx: { bonusShareMult: 2 },
  },
  {
    id: 'heldBreath',
    name: 'Held Breath',
    rarity: 'rare',
    cost: 5,
    tags: ['Bonus'],
    text: 'The Bonus multiplier carries over between balls within a round.',
    fx: { holdBonusMult: true },
  },
  {
    id: 'lastRites',
    name: 'Last Rites',
    rarity: 'uncommon',
    cost: 4,
    tags: ['Bonus'],
    text: 'The last ball of each round tallies its Bonus twice.',
  },

  // ---------------------------------------------------------------- Riot
  {
    id: 'notchedSpoon',
    name: 'Notched Spoon',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Riot'],
    text: 'Each completed Cell Block adds +1 Cell Block level for the rest of the run.',
  },
  {
    id: 'spareKey',
    name: 'Spare Key',
    rarity: 'uncommon',
    cost: 4,
    tags: ['Riot'],
    text: 'RIOT starts after 1 lock instead of 2.',
    fx: { locksNeeded: 1 },
  },
  {
    id: 'cellmates',
    name: 'Cellmates',
    rarity: 'rare',
    cost: 6,
    tags: ['Riot'],
    text: 'RIOT launches one extra ball.',
    fx: { riotBallsAdd: 1 },
  },
  {
    id: 'hoarderSack',
    name: "Hoarder's Sack",
    rarity: 'rare',
    cost: 5,
    tags: ['Riot'],
    text: 'PAYDAY keeps its value between RIOTs.',
  },

  // ---------------------------------------------------------------- Luck
  {
    id: 'candleStub',
    name: 'Candle Stub',
    rarity: 'common',
    cost: 2,
    tags: ['Luck'],
    text: '+6 luck on the last ball of each round.',
  },
  {
    id: 'wishbone',
    name: 'Wishbone',
    rarity: 'common',
    cost: 1,
    tags: ['Luck'],
    text: 'Every drained ball gives +2 luck until the round ends.',
  },
  {
    id: 'liveWire',
    name: 'Live Wire',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Luck'],
    text: 'Spontaneous luck sparks come twice as often and give double luck.',
    fx: { sparkMult: 2 },
  },
  {
    id: 'crookedPenny',
    name: 'Crooked Penny',
    rarity: 'rare',
    cost: 5,
    tags: ['Luck'],
    text: 'Each hit has a 5% chance (+luck) to pay 10x.',
  },
  {
    id: 'magpieFeather',
    name: 'Magpie Feather',
    rarity: 'common',
    cost: 2,
    tags: ['Luck'],
    text: 'Each drained ball has a 10% chance (+luck) to leave a ticket.',
  },
  {
    id: 'ninthLife',
    name: 'Ninth Life',
    rarity: 'rare',
    cost: 5,
    tags: ['Luck', 'Bonus'],
    text: 'Each lucky bounce adds +1 to the Bonus multiplier.',
  },

  // ---------------------------------------------------------------- Lone
  {
    id: 'spareBearing',
    name: 'Spare Bearing',
    rarity: 'uncommon',
    cost: 4,
    tags: ['Lone'],
    text: '+1 free ball each round.',
    fx: { freeBalls: 1 },
  },
  {
    id: 'rubberBands',
    name: 'Rubber Bands',
    rarity: 'common',
    cost: 2,
    tags: ['Lone'],
    text: 'Ball save lasts 5 s longer.',
    fx: { ballSaveAdd: 5 },
  },
  {
    id: 'patronSaint',
    name: 'Patron Saint Medal',
    rarity: 'rare',
    cost: 5,
    tags: ['Lone'],
    text: 'The first ball you lose each round is returned.',
  },
  {
    id: 'ironLockbar',
    name: 'Iron Lockbar',
    rarity: 'common',
    cost: 2,
    tags: ['Lone'],
    text: 'Stronger nudges and 2 extra tilt warnings.',
    fx: { nudgeStrength: 1.3, extraWarnings: 2 },
  },
  {
    id: 'solitary',
    name: 'Solitary Confinement',
    rarity: 'rare',
    cost: 5,
    tags: ['Lone'],
    text: 'If you buy no balls in a round, your free balls pay 4x.',
  },
  {
    id: 'thickSkin',
    name: 'Thick Skin',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Lone'],
    text: 'Each Sentence round you play through gives +3 tickets and +1 permanent luck.',
  },

  // ---------------------------------------------------------------- Hardware (mount points)
  {
    id: 'bentNail',
    name: 'Bent Nail',
    rarity: 'common',
    cost: 2,
    tags: ['Iron', 'Lone'],
    text: 'A post that narrows the left outlane.',
    fx: { mount: 'mount:bentNail' },
  },
  {
    id: 'spareBumper',
    name: 'Spare Bumper',
    rarity: 'uncommon',
    cost: 4,
    tags: ['Iron', 'Yard'],
    text: 'A 4th Yard bumper.',
    fx: { mount: 'mount:spareBumper' },
  },
  {
    id: 'goldFilling',
    name: 'Gold Filling',
    rarity: 'uncommon',
    cost: 4,
    tags: ['Iron', 'Yard'],
    text: 'One Yard bumper turns gold and pays 10x.',
    fx: { mount: 'mount:goldFilling' },
  },
  {
    id: 'thirdArm',
    name: 'Third Arm',
    rarity: 'rare',
    cost: 6,
    tags: ['Iron', 'Chute'],
    text: 'An upper-right flipper on the right flipper button.',
    fx: { mount: 'mount:thirdArm' },
  },

  // ---------------------------------------------------------------- Active (lockbar button)
  {
    id: 'panicButton',
    name: 'Panic Button',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Lone'],
    text: 'Active (1 charge): arms a 10 s ball save.',
    active: { charges: 1, per: 'round', action: 'ballSave' },
  },
  {
    id: 'pocketWatch',
    name: 'Pocket Watch',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Chute'],
    text: 'Active (2 charges): slows time to half speed for 4 s.',
    active: { charges: 2, per: 'round', action: 'slowmo' },
  },
  {
    id: 'crowbar',
    name: 'Crowbar',
    rarity: 'common',
    cost: 2,
    tags: ['Riot'],
    text: 'Active (1 charge): instantly completes Cell Block.',
    active: { charges: 1, per: 'round', action: 'crowbar' },
  },
  {
    id: 'twinYolk',
    name: 'Twin Yolk',
    rarity: 'rare',
    cost: 5,
    tags: ['Riot'],
    text: 'Active (1 charge per deadline): starts a 2-ball multiball.',
    active: { charges: 1, per: 'deadline', action: 'twinYolk' },
  },
  {
    id: 'handCrank',
    name: 'Hand-Crank Generator',
    rarity: 'uncommon',
    cost: 3,
    tags: ['Riot'],
    text: 'Collecting PAYDAY recharges all active charms.',
  },

  // ---------------------------------------------------------------- Legendary
  {
    id: 'wardensKeyring',
    name: "Warden's Keyring",
    rarity: 'legendary',
    cost: 8,
    tags: ['Money'],
    text: 'Gain a Key whenever you pay a deadline early.',
  },
  {
    id: 'endlessTally',
    name: 'Endless Tally',
    rarity: 'legendary',
    cost: 8,
    tags: ['Bonus'],
    text: 'The Bonus multiplier has no cap.',
    fx: { noBonusCap: true },
  },
  {
    id: 'glassEye',
    name: 'Glass Eye',
    rarity: 'legendary',
    cost: 8,
    tags: ['Luck'],
    text: 'At 20+ luck, every outlane drain becomes a lucky bounce.',
  },
  {
    id: 'riotShield',
    name: 'Riot Shield',
    rarity: 'legendary',
    cost: 8,
    tags: ['Riot'],
    text: 'During RIOT, drained balls are returned for the first 20 s and PAYDAY pays double.',
  },

  // ---------------------------------------------------------------- Devil (red calls only)
  {
    id: 'devilsDue',
    name: "Devil's Due",
    rarity: 'devil',
    cost: 0,
    tags: ['Money'],
    text: 'Everything pays 2x, but every remaining debt rises 50%.',
    fx: { payMult: 2, debtMult: 1.5 },
    cursed: true,
  },
  {
    id: 'blackCandle',
    name: 'Black Candle',
    rarity: 'devil',
    cost: 0,
    tags: ['Luck'],
    text: '+8 luck, but no ball save.',
    fx: { luck: 8, noBallSave: true },
    cursed: true,
  },
  {
    id: 'hellfireRubber',
    name: 'Hellfire Rubber',
    rarity: 'devil',
    cost: 0,
    tags: ['Yard'],
    text: 'Yard bumpers and slings kick twice as hard and pay 5x, but your Bonus is never tallied.',
    fx: { kickStrength: 2, shotMult: { yard: 5, sling: 5 }, noBonus: true },
    cursed: true,
  },
];

export const CHARM_BY_ID = new Map(CHARMS.map((c) => [c.id, c]));

export function charmDef(id: string): CharmDef {
  const d = CHARM_BY_ID.get(id);
  if (!d) throw new Error(`unknown charm ${id}`);
  return d;
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#cfc6b0',
  uncommon: '#7dd88a',
  rare: '#6aa8ff',
  legendary: '#ffcf4a',
  devil: '#ff4a3a',
};
