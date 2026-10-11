/**
 * Contraband: single-use items bought with coins at the vending cabinet and used between
 * balls. Prices follow the economy (see `contrabandPrice` in rules/shop.ts): `price` is the
 * deadline-1 price in coins, or a fraction of the debt for Bribe and the Calendar Page.
 */
export type ContrabandUse =
  | 'smuggledBall'
  | 'chalk'
  | 'rubberCement'
  | 'moonshine'
  | 'lockpick'
  | 'forgedReceipt'
  | 'oilCan'
  | 'shiv'
  | 'bribe'
  | 'calendar';

export interface ContrabandDef {
  id: ContrabandUse;
  name: string;
  text: string;
  /** Deadline-1 price in coins (scaled up each deadline). */
  price?: number;
  /** Price as a fraction of the current debt instead. */
  debtPrice?: number;
  /** Smuggled Ball costs this many ball prices. */
  ballPrices?: number;
  /** Rare: offered less often. */
  rare?: boolean;
  /** Needs a target chosen when used. */
  target?: 'shot' | 'charm';
}

export const CONTRABAND: ContrabandDef[] = [
  { id: 'smuggledBall', name: 'Smuggled Ball', text: '+1 ball this round.', ballPrices: 1.5 },
  {
    id: 'chalk',
    name: 'Chalk',
    text: 'Your next ball starts with the top lanes complete.',
    price: 4,
  },
  {
    id: 'rubberCement',
    name: 'Rubber Cement',
    text: 'The outlanes are plugged for your next ball.',
    price: 6,
  },
  {
    id: 'moonshine',
    name: 'Moonshine',
    text: '+8 luck for your next ball, but the camera sways.',
    price: 4,
  },
  {
    id: 'lockpick',
    name: 'Lockpick',
    text: 'Your next ball starts with one ball locked.',
    price: 6,
  },
  {
    id: 'forgedReceipt',
    name: 'Forged Receipt',
    text: 'Your next deposit is credited +20%.',
    price: 3,
  },
  {
    id: 'oilCan',
    name: 'Oil Can',
    text: '+1 level to a shot type of your choice.',
    price: 7,
    target: 'shot',
  },
  {
    id: 'shiv',
    name: 'Shiv',
    text: 'Destroy one of your charms for twice its ticket cost.',
    price: 2,
    target: 'charm',
  },
  { id: 'bribe', name: 'Bribe', text: "Cancel this deadline's Sentence.", debtPrice: 0.2 },
  {
    id: 'calendar',
    name: 'Torn Calendar Page',
    text: '+1 round this deadline (once per deadline).',
    debtPrice: 0.3,
    rare: true,
  },
];

export function contrabandDef(id: string): ContrabandDef {
  const d = CONTRABAND.find((c) => c.id === id);
  if (!d) throw new Error(`unknown contraband ${id}`);
  return d;
}
