/**
 * REP and Ink, run side: REP from each ball's earnings, level-ups, the three-tattoo offer and
 * inking a choice. The ball side (live REP, level-up callouts, Sleeve behaviours) is in
 * TableGame; the curve is shared through `repToNext`.
 */
import { REP } from '../content/balance';
import { TATTOOS, tattooDef, type TattooDef } from '../content/tattoos';
import { SHOT_TYPES } from './table-game';
import { repToNext } from './rep';
import { charmFx, debtFor, payScale, rngOf, type RunState } from './run';

export { repToNext };

export interface RepState {
  /** Current REP level (starts at 1) and REP into it. */
  level: number;
  xp: number;
  /** Levels earned and not yet inked. */
  picks: number;
  /** The tattoos on offer for the next pick ('cash' when nothing is left to ink). */
  offer: InkOffer[] | null;
}

export interface InkOffer {
  id: string;
  /** Coins paid by the 'cash' fallback. */
  cash?: number;
}

export function newRep(): RepState {
  return { level: 1, xp: 0, picks: 0, offer: null };
}

/** REP per coin earned on the table this deadline (coins in deadline-1 terms). */
export function repRate(s: RunState): number {
  return charmFx(s).xpMult / payScale(s);
}

export function rankOf(s: RunState, id: string): number {
  return s.ink[id] ?? 0;
}

/** Add REP; every level crossed queues a pick. Returns the levels gained. */
export function gainRep(s: RunState, rep: number): number {
  const r = s.rep;
  if (!(rep > 0)) return 0;
  r.xp += rep;
  let gained = 0;
  while (r.xp >= repToNext(r.level)) {
    r.xp -= repToNext(r.level);
    r.level++;
    gained++;
  }
  r.picks += gained;
  if (r.picks > 0 && !r.offer) rollInk(s);
  return gained;
}

/** Can this Sleeve be offered: both its tattoos inked deep enough, not already worn. */
export function sleeveReady(s: RunState, d: TattooDef): boolean {
  if (!d.needs || rankOf(s, d.id) > 0) return false;
  return d.needs.every((id) => rankOf(s, id) >= REP.sleeveRank);
}

function inkWeight(s: RunState, d: TattooDef): number {
  if (d.rarity === 'sleeve') return 0;
  const w = REP.weights[d.rarity];
  return rankOf(s, d.id) > 0 ? w * REP.ownedBoost : w;
}

/** Draw the offer for the next pick: a ready Sleeve takes one slot, then weighted tattoos. */
export function rollInk(s: RunState): void {
  const rng = rngOf(s);
  const offer: InkOffer[] = [];
  const sleeves = TATTOOS.filter((d) => sleeveReady(s, d));
  if (sleeves.length) offer.push({ id: rng.pick(sleeves).id });
  const pool = TATTOOS.filter((d) => d.rarity !== 'sleeve' && rankOf(s, d.id) < d.ranks.length);
  while (offer.length < REP.offers && pool.length) {
    const d = rng.weighted(pool, (t) => inkWeight(s, t));
    pool.splice(pool.indexOf(d), 1);
    offer.push({ id: d.id });
  }
  if (offer.length < REP.offers)
    offer.push({ id: 'cash', cash: Math.max(1, Math.round(debtFor(s.deadline) * REP.cashShare)) });
  s.rng = rng.getState();
  s.rep.offer = offer;
}

/** Ink the chosen tattoo (or take the cash). Rolls the next offer while picks remain. */
export function chooseInk(s: RunState, index: number): boolean {
  const r = s.rep;
  const o = r.offer?.[index];
  if (!o || r.picks <= 0) return false;
  if (o.id === 'cash') s.pocket += o.cash ?? 0;
  else {
    const d = tattooDef(o.id);
    const n = rankOf(s, o.id);
    if (n >= d.ranks.length) return false;
    s.ink[o.id] = n + 1;
    const once = d.ranks[n].once;
    if (once?.debtMult) s.mods.debtMult *= once.debtMult;
    if (once?.levelsAll) for (const t of SHOT_TYPES) s.shotLevels[t] += once.levelsAll;
  }
  r.picks--;
  r.offer = null;
  if (r.picks > 0) rollInk(s);
  return true;
}

/** Owns this Sleeve. */
export function wears(s: RunState, id: string): boolean {
  return rankOf(s, id) > 0;
}

/** Ranks inked in total (for stats and the receipt). */
export function inkCount(s: RunState): number {
  let n = 0;
  for (const v of Object.values(s.ink)) n += v;
  return n;
}
