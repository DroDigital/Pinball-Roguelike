/**
 * First-time hints: one short note per idea, shown the first time it matters and never
 * again (the save remembers). `touch` replaces the text on touch screens.
 */
export interface HintDef {
  text: string;
  touch?: string;
}

export const HINTS = {
  flippers: {
    text: 'Flippers: Z and / (or Shift, or the arrows). Hold one up to catch the ball.',
    touch: 'Flippers: touch the left or right half of the screen. Hold to catch the ball.',
  },
  plunger: {
    text: 'Hold Space to pull the plunger, release to fire. Stop on the white mark to roll into the lit lane.',
    touch: 'Drag down in the bottom-right corner to pull the plunger; let go to fire.',
  },
  nudge: {
    text: 'X, C and V nudge the table. Nudge too much and it tilts: the ball and its coins are lost.',
    touch: 'Three fingers nudge the table. Too much and it tilts.',
  },
  pocket: {
    text: 'Coins land in your Pocket. Only coins deposited at the ATM count toward the debt.',
  },
  jobs: { text: 'Take one Job each round. Do it on the table for tickets, coins or shot levels.' },
  buy: { text: 'The first ball each round is free. Extra balls cost coins: keep some for later.' },
  atm: { text: 'Deposits are final. The Bank earns 10% at the end of every round.' },
  shop: {
    text: 'Charms cost tickets and change how the table pays. Contraband costs coins and is used between balls.',
  },
  phone: { text: 'Pick one perk. It lasts for the rest of the run.' },
  redCall: {
    text: 'The red phone offers deals. Every one of them costs something. You can hang up.',
  },
  knock: { text: 'You don’t have to answer. Someone is keeping count either way.' },
  lockup: {
    text: 'Lockup is lit: sink the Hole to lock a ball. Two locks start a RIOT.',
  },
  riot: { text: 'RIOT: shoot the Chute for PAYDAY, then the Hole for SUPER PAYDAY.' },
  sentence: {
    text: 'This round is under the Sentence shown at the deadline. It ends with the deadline.',
  },
  keys: { text: 'Keys: hold three on Last Call and the Hole opens JAILBREAK.' },
  actives: {
    text: 'Active charms fire with B (or their number key). Charges come back each round or deadline.',
    touch: 'Active charms fire with the LOCKBAR button. Charges come back each round or deadline.',
  },
} satisfies Record<string, HintDef>;

export type HintId = keyof typeof HINTS;
