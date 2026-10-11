/**
 * The Daily Sentence: one seeded run per (UTC) day, the same for everyone, with a local best.
 * Seeded and daily runs use the full charm collection so a seed plays the same for anyone.
 */
import type { RunState } from './run';

export interface DailyScore {
  /** Deadlines paid. */
  deadlines: number;
  /** Coins earned on the table over the run. */
  coins: number;
}

export interface DailyRecord {
  date: string;
  best: DailyScore | null;
  plays: number;
}

/** UTC date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dailySeed(d: Date): string {
  return `DAILY-${dayKey(d)}`;
}

export function dailyScore(r: RunState): DailyScore {
  return { deadlines: r.deadline, coins: r.stats.coinsEarned };
}

/** Deadlines first, then coins. */
export function beats(a: DailyScore, b: DailyScore | null): boolean {
  if (!b) return true;
  return a.deadlines !== b.deadlines ? a.deadlines > b.deadlines : a.coins > b.coins;
}

/**
 * Record a finished daily run. Assisted runs and runs from another day don't count.
 * Returns true if it set a new best.
 */
export function recordDaily(rec: DailyRecord, r: RunState, today: string): boolean {
  if (r.kind !== 'daily' || r.seed !== `DAILY-${today}`) return false;
  if (rec.date !== today) {
    rec.date = today;
    rec.best = null;
    rec.plays = 0;
  }
  rec.plays++;
  if (r.assist) return false;
  const s = dailyScore(r);
  if (!beats(s, rec.best)) return false;
  rec.best = s;
  return true;
}

/** A share code is just the seed; links carry the inmate and Hard Time too. */
export function shareLink(base: string, r: RunState): string {
  let q = `seed=${encodeURIComponent(r.seed)}`;
  if (r.inmate !== 'debtor') q += `&inmate=${encodeURIComponent(r.inmate)}`;
  if (r.hardTime) q += `&ht=${r.hardTime}`;
  return `${base}?${q}`;
}
