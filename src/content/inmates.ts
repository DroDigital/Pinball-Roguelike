/**
 * Inmates: starting loadouts picked from the mugshot lineup, each with an upside and a
 * downside. Effects are applied once when the run starts.
 */
export interface InmateFx {
  charms?: string[];
  contraband?: string[];
  keys?: number;
  /** Multipliers. */
  flipperStrength?: number;
  tiltSensitivity?: number;
  rerollMult?: number;
  debtMult?: number;
  /** Extra free balls every round. */
  freeBalls?: number;
  /** Absolute charm slots. */
  charmSlots?: number;
  /** Extra choices when the phone offers perks. */
  phoneOffersAdd?: number;
  noRedCalls?: boolean;
  noNeighbor?: boolean;
}

export interface InmateDef {
  id: string;
  name: string;
  /** Prisoner number on the mugshot board. */
  number: string;
  /** The charge, as written on the board. */
  charge: string;
  upside: string;
  downside: string;
  fx: InmateFx;
}

export const INMATES: InmateDef[] = [
  {
    id: 'debtor',
    name: 'The Debtor',
    number: '4471',
    charge: 'Owed. Still owes.',
    upside: 'Nothing special.',
    downside: 'Nothing special.',
    fx: {},
  },
  {
    id: 'embezzler',
    name: 'The Embezzler',
    number: '0913',
    charge: 'Moved money that belonged to someone else.',
    upside: 'Starts with Rusty Piggy Bank and a Forged Receipt.',
    downside: 'Rerolls cost double.',
    fx: { charms: ['piggyBank'], contraband: ['forgedReceipt'], rerollMult: 2 },
  },
  {
    id: 'brawler',
    name: 'The Brawler',
    number: '2208',
    charge: 'Assault on a vending machine.',
    upside: 'Starts with Jar of Teeth. Flippers hit 10% harder.',
    downside: 'Tilt is twice as sensitive.',
    fx: { charms: ['jarOfTeeth'], flipperStrength: 1.1, tiltSensitivity: 2 },
  },
  {
    id: 'lifer',
    name: 'The Lifer',
    number: '0001',
    charge: 'Nobody remembers.',
    upside: '+1 free ball every round.',
    downside: 'Every debt is 20% higher.',
    fx: { freeBalls: 1, debtMult: 1.2 },
  },
  {
    id: 'escapeArtist',
    name: 'The Escape Artist',
    number: '7130',
    charge: 'Left. Several times.',
    upside: 'Starts with a Key and a Lockpick.',
    downside: 'Only 4 charm slots.',
    fx: { keys: 1, contraband: ['lockpick'], charmSlots: 4 },
  },
  {
    id: 'snitch',
    name: 'The Snitch',
    number: '3355',
    charge: 'Talked.',
    upside: 'The phone offers 4 perks.',
    downside: 'No red calls, and the neighbor never knocks.',
    fx: { phoneOffersAdd: 1, noRedCalls: true, noNeighbor: true },
  },
];

export function inmateDef(id: string): InmateDef {
  const d = INMATES.find((i) => i.id === id);
  if (!d) throw new Error(`unknown inmate ${id}`);
  return d;
}
