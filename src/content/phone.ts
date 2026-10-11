/**
 * The phone: after each cleared deadline it rings with three permanent perks to choose from,
 * or (about one call in four, more once you've accepted one) a red call: devil's bargains
 * with a big upside and a real cost. Devil charms join the red calls in M4.
 */
import type { ShotType } from '../sim/table-def';

export type PerkEffect =
  | { kind: 'charmSlot' }
  | { kind: 'contrabandSlot' }
  | { kind: 'freeBall' }
  | { kind: 'levels'; amount: number }
  | { kind: 'ballSave'; seconds: number }
  | { kind: 'bonusMax' }
  | { kind: 'tickets'; amount: number }
  | { kind: 'interest'; amount: number }
  | { kind: 'rerolls' };

export interface PerkDef {
  id: string;
  /** "{shot}" is replaced with the offered shot type for level perks. */
  text: string;
  effect: PerkEffect;
  /** Only offered once the system it touches exists. */
  requires?: 'shop';
}

export const PERKS: PerkDef[] = [
  { id: 'charmSlot', text: '+1 charm slot', effect: { kind: 'charmSlot' }, requires: 'shop' },
  {
    id: 'contrabandSlot',
    text: '+1 contraband slot',
    effect: { kind: 'contrabandSlot' },
    requires: 'shop',
  },
  { id: 'freeBall', text: '+1 free ball every round', effect: { kind: 'freeBall' } },
  { id: 'levels', text: '+2 levels to the {shot}', effect: { kind: 'levels', amount: 2 } },
  { id: 'ballSave', text: 'Ball save lasts 3 s longer', effect: { kind: 'ballSave', seconds: 3 } },
  { id: 'bonusMax', text: '+1 max Bonus multiplier', effect: { kind: 'bonusMax' } },
  { id: 'tickets', text: '+6 tickets', effect: { kind: 'tickets', amount: 6 } },
  { id: 'interest', text: '+5% interest', effect: { kind: 'interest', amount: 0.05 } },
  {
    id: 'rerolls',
    text: 'Shop rerolls cost 1 less',
    effect: { kind: 'rerolls' },
    requires: 'shop',
  },
];

/** Shot types a level perk can name. */
export const PERK_SHOTS: ShotType[] = ['chute', 'perimeter', 'hole', 'cellblock', 'yard', 'lanes'];

/** What a bargain does to the run (applied once when accepted). */
export interface BargainEffect {
  payMult?: number;
  debtMult?: number;
  tickets?: number;
  keys?: number;
  luck?: number;
  ballSaveAdd?: number;
  tiltSensitivity?: number;
  extraWarnings?: number;
  flipperStrength?: number;
  levels?: Partial<Record<ShotType, number>>;
  noFreeBall?: true;
  noKickback?: true;
}

export interface BargainDef {
  id: string;
  name: string;
  gain: string;
  cost: string;
  effect: BargainEffect;
}

/** Red-call bargains. */
export const BARGAINS: BargainDef[] = [
  {
    id: 'bloodMoney',
    name: 'Blood Money',
    gain: 'Everything on the table pays 50% more.',
    cost: 'Every remaining debt rises 30%.',
    effect: { payMult: 1.5, debtMult: 1.3 },
  },
  {
    id: 'sleeplessNights',
    name: 'Sleepless Nights',
    gain: '+12 tickets now.',
    cost: 'Ball save is 4 s shorter for the rest of the run.',
    effect: { tickets: 12, ballSaveAdd: -4 },
  },
  {
    id: 'borrowedLuck',
    name: 'Borrowed Luck',
    gain: '+6 luck for the rest of the run.',
    cost: 'Tilt is twice as sensitive.',
    effect: { luck: 6, tiltSensitivity: 2 },
  },
  {
    id: 'ironCollar',
    name: 'Iron Collar',
    gain: 'A Key.',
    cost: 'The first ball of each round is no longer free.',
    effect: { keys: 1, noFreeBall: true },
  },
  {
    id: 'badWiring',
    name: 'Bad Wiring',
    gain: '+3 levels to the Chute and the Perimeter.',
    cost: 'The kickback can never be lit again.',
    effect: { levels: { chute: 3, perimeter: 3 }, noKickback: true },
  },
  {
    id: 'heavyHands',
    name: 'Heavy Hands',
    gain: 'Flippers hit 10% harder.',
    cost: 'One fewer tilt warning.',
    effect: { flipperStrength: 1.1, extraWarnings: -1 },
  },
];

export function perkDef(id: string): PerkDef {
  const d = PERKS.find((p) => p.id === id);
  if (!d) throw new Error(`unknown perk ${id}`);
  return d;
}

export function bargainDef(id: string): BargainDef {
  const d = BARGAINS.find((p) => p.id === id);
  if (!d) throw new Error(`unknown bargain ${id}`);
  return d;
}
