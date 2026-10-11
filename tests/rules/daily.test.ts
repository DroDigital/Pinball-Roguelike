import { describe, expect, it } from 'vitest';
import {
  beats,
  dailySeed,
  dayKey,
  recordDaily,
  shareLink,
  type DailyRecord,
} from '../../src/rules/daily';
import { newRun } from '../../src/rules/run';

describe('Daily Sentence', () => {
  const day = new Date(Date.UTC(2026, 9, 11, 23, 30));

  it('one seed per UTC day; the same seed builds the same run', () => {
    expect(dayKey(day)).toBe('2026-10-11');
    expect(dailySeed(day)).toBe('DAILY-2026-10-11');
    const a = newRun(dailySeed(day), { kind: 'daily' });
    const b = newRun(dailySeed(day), { kind: 'daily' });
    expect(a.shop).toEqual(b.shop);
    expect(a.sentences).toEqual(b.sentences);
    expect(a.jobOffers).toEqual(b.jobOffers);
  });

  it('keeps the best of the day: deadlines first, then coins; resets on a new day', () => {
    const rec: DailyRecord = { date: '', best: null, plays: 0 };
    const r = newRun('DAILY-2026-10-11', { kind: 'daily' });
    r.deadline = 2;
    r.stats.coinsEarned = 300;
    expect(recordDaily(rec, r, '2026-10-11')).toBe(true);
    r.deadline = 1;
    r.stats.coinsEarned = 900;
    expect(recordDaily(rec, r, '2026-10-11')).toBe(false);
    expect(rec.best).toEqual({ deadlines: 2, coins: 300 });
    expect(rec.plays).toBe(2);
    expect(beats({ deadlines: 2, coins: 301 }, rec.best)).toBe(true);
    const next = newRun('DAILY-2026-10-12', { kind: 'daily' });
    expect(recordDaily(rec, next, '2026-10-12')).toBe(true);
    expect(rec.plays).toBe(1);
  });

  it('escaping through JAILBREAK beats falling at Last Call, even with fewer coins', () => {
    const rec: DailyRecord = { date: '', best: null, plays: 0 };
    const fell = newRun('DAILY-2026-10-11', { kind: 'daily' });
    fell.deadline = fell.deadlines - 1;
    fell.stats.coinsEarned = 5000;
    expect(recordDaily(rec, fell, '2026-10-11')).toBe(true);
    const out = newRun('DAILY-2026-10-11', { kind: 'daily' });
    out.deadline = out.deadlines - 1;
    out.result = 'breakout';
    out.stats.coinsEarned = 4000;
    expect(recordDaily(rec, out, '2026-10-11')).toBe(true);
    expect(rec.best?.deadlines).toBe(out.deadlines);
  });

  it("assisted runs, other days and ordinary runs don't count", () => {
    const rec: DailyRecord = { date: '2026-10-11', best: null, plays: 0 };
    expect(
      recordDaily(rec, newRun('DAILY-2026-10-11', { kind: 'daily', assist: true }), '2026-10-11'),
    ).toBe(false);
    expect(rec.best).toBeNull();
    expect(recordDaily(rec, newRun('DAILY-2026-10-10', { kind: 'daily' }), '2026-10-11')).toBe(
      false,
    );
    expect(recordDaily(rec, newRun('X'), '2026-10-11')).toBe(false);
  });

  it('share links carry the seed, inmate and Hard Time', () => {
    const r = newRun('ABC123', { inmate: 'brawler', hardTime: 2 });
    expect(shareLink('https://x.test/', r)).toBe('https://x.test/?seed=ABC123&inmate=brawler&ht=2');
    expect(shareLink('https://x.test/', newRun('Q'))).toBe('https://x.test/?seed=Q');
  });
});
