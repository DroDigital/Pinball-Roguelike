/**
 * The vending cabinet: restocks each deadline with charms (tickets) and contraband (coins),
 * sometimes an Oil Can. Rerolls cost coins and get dearer; charms sell for half (Hollow
 * Book: full). Contraband is single use, between balls.
 */
import { SHOP } from '../content/balance';
import { CHARMS, charmDef, type CharmTag, type Rarity } from '../content/charms';
import { CONTRABAND, contrabandDef } from '../content/contraband';
import type { ShotType } from '../sim/table-def';
import { ballPrice, charmFx, debtScale, gainCharm, rngOf, type RunState } from './run';

/** Restock the cabinet; charms still locked by meta progression never appear. */
export function restock(s: RunState): void {
  const rng = rngOf(s);
  const pool = CHARMS.filter(
    (c) =>
      c.rarity !== 'devil' &&
      !s.charms.includes(c.id) &&
      !s.locked.includes(c.id) &&
      (c.rarity !== 'legendary' || s.deadline >= SHOP.legendaryFrom),
  );
  const picks: string[] = [];
  for (let i = 0; i < s.mods.shopCharms && pool.length; i++) {
    const c = rng.weighted(pool, (x) => SHOP.rarityWeights[x.rarity as Exclude<Rarity, 'devil'>]);
    picks.push(c.id);
    pool.splice(pool.indexOf(c), 1);
  }
  const cb = CONTRABAND.filter((c) => c.id !== 'oilCan');
  const contraband: string[] = [];
  for (let i = 0; i < SHOP.contrabandOffers; i++) {
    const avail = cb.filter((c) => !contraband.includes(c.id) && (!c.rare || rng.chance(0.4)));
    if (!avail.length) break;
    contraband.push(rng.pick(avail).id);
  }
  if (charmFx(s).oilCanAlways || rng.chance(SHOP.oilCanChance)) contraband.push('oilCan');
  s.shop = { charms: picks, contraband, rerolls: s.shop?.rerolls ?? 0 };
  s.rng = rng.getState();
}

/** Coin prices grow with the debt curve (softened). */
function scaled(s: RunState, coins: number): number {
  return Math.max(1, Math.round(coins * Math.pow(debtScale(s.deadline), SHOP.priceScaleExp)));
}

export function rerollCost(s: RunState): number {
  const base = scaled(s, SHOP.rerollBase + SHOP.rerollStep * s.shop.rerolls);
  return Math.max(1, base - s.mods.rerollDiscount) * s.mods.rerollMult;
}

export function reroll(s: RunState): boolean {
  const c = rerollCost(s);
  if (s.pocket < c) return false;
  s.pocket -= c;
  s.shop.rerolls++;
  restock(s);
  return true;
}

export function contrabandPrice(s: RunState, id: string): number {
  const d = contrabandDef(id);
  let p: number;
  if (d.debtPrice) p = Math.round(s.debt * d.debtPrice);
  else if (d.ballPrices) p = Math.round(ballPrice(s) * d.ballPrices);
  else p = scaled(s, d.price ?? 1);
  return Math.max(1, p - charmFx(s).contrabandDiscount);
}

export function contrabandSlots(s: RunState): number {
  return s.mods.contrabandSlots + charmFx(s).contrabandSlots;
}

/** Tags of owned charms: shop items sharing one glow. */
export function ownedTags(s: RunState): Set<CharmTag> {
  return new Set(s.charms.flatMap((id) => charmDef(id).tags));
}

export function canShop(s: RunState): boolean {
  return s.phase === 'pickJob' || s.phase === 'buyBalls' || s.phase === 'betweenBalls';
}

export function buyCharm(s: RunState, index: number): boolean {
  const id = s.shop.charms[index];
  if (!id || !canShop(s)) return false;
  const d = charmDef(id);
  if (s.tickets < d.cost || !gainCharm(s, id)) return false;
  s.tickets -= d.cost;
  s.shop.charms.splice(index, 1);
  s.stats.charmsBought++;
  return true;
}

export function sellValue(s: RunState, id: string): number {
  const d = charmDef(id);
  if (d.cursed) return 0;
  return charmFx(s).sellFull ? d.cost : Math.floor(d.cost * SHOP.sellFraction);
}

/** Sell the charm in a slot (devil charms can't be sold). */
export function sellCharm(s: RunState, slot: number): boolean {
  const id = s.charms[slot];
  if (!id || charmDef(id).cursed || !canShop(s)) return false;
  s.tickets += sellValue(s, id);
  removeCharm(s, slot);
  return true;
}

function removeCharm(s: RunState, slot: number): void {
  const id = s.charms[slot];
  s.charms.splice(slot, 1);
  delete s.charges[id];
}

export function buyContraband(s: RunState, index: number): boolean {
  const id = s.shop.contraband[index];
  if (!id || !canShop(s) || s.contraband.length >= contrabandSlots(s)) return false;
  const price = contrabandPrice(s, id);
  if (s.pocket < price) return false;
  s.pocket -= price;
  s.contraband.push(id);
  s.shop.contraband.splice(index, 1);
  return true;
}

export type ContrabandTarget = { shot?: ShotType; charmSlot?: number };

/** Can this contraband be used right now (between balls, with a valid target)? */
export function canUse(s: RunState, id: string, t: ContrabandTarget = {}): boolean {
  if (s.phase !== 'betweenBalls' && s.phase !== 'buyBalls' && s.phase !== 'pickJob') return false;
  switch (id) {
    case 'smuggledBall':
      return s.phase === 'betweenBalls';
    case 'oilCan':
      return !!t.shot;
    case 'shiv':
      return t.charmSlot !== undefined && !!s.charms[t.charmSlot];
    case 'bribe':
      return !s.sentencesCancelled && s.sentences.length > 0;
    case 'calendar':
      return s.extraRounds === 0;
    case 'chalk':
    case 'rubberCement':
    case 'moonshine':
    case 'lockpick':
      return !s.pending[id];
    case 'forgedReceipt':
      return !s.forgedReceipt;
    default:
      return false;
  }
}

/** Use the contraband at `index` in the stash. */
export function useContraband(s: RunState, index: number, t: ContrabandTarget = {}): boolean {
  const id = s.contraband[index];
  if (!id || !canUse(s, id, t)) return false;
  switch (id) {
    case 'smuggledBall':
      s.ballsThisRound++;
      break;
    case 'chalk':
    case 'rubberCement':
    case 'moonshine':
    case 'lockpick':
      s.pending[id] = true;
      break;
    case 'forgedReceipt':
      s.forgedReceipt = true;
      break;
    case 'oilCan':
      s.shotLevels[t.shot!] += charmFx(s).oilCanLevels || 1;
      break;
    case 'shiv': {
      const charm = s.charms[t.charmSlot!];
      s.tickets += charmDef(charm).cost * SHOP.shivMult;
      removeCharm(s, t.charmSlot!);
      break;
    }
    case 'bribe':
      s.sentencesCancelled = true;
      break;
    case 'calendar':
      s.extraRounds++;
      break;
  }
  s.contraband.splice(index, 1);
  return true;
}
