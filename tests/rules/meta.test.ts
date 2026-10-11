import { describe, expect, it } from 'vitest';
import {
  checkUnlocks,
  discover,
  endlessUnlocked,
  inmateUnlocked,
  lockedCharms,
  maxHardTime,
  newMeta,
  recordRunEnd,
  unlockedInmates,
} from '../../src/rules/meta';
import { newRun, settleDeadline, startDeadline, type RunState } from '../../src/rules/run';
import { reroll } from '../../src/rules/shop';
import { CHARMS } from '../../src/content/charms';
import { UNLOCKS } from '../../src/content/unlocks';

const won = (seed: string, opts: Parameters<typeof newRun>[1] = {}): RunState => {
  const s = newRun(seed, opts);
  s.deadline = s.deadlines - 1;
  s.phase = 'deadline';
  s.bank = s.debt;
  settleDeadline(s);
  return s;
};

describe('meta progression', () => {
  it('about a third of the charms start locked; only the Debtor is on the lineup', () => {
    const m = newMeta();
    const locked = lockedCharms(m);
    const pool = CHARMS.filter((c) => c.rarity !== 'devil');
    expect(locked.length / pool.length).toBeGreaterThan(0.3);
    expect(locked.length / pool.length).toBeLessThan(0.42);
    for (const id of locked) expect(pool.some((c) => c.id === id)).toBe(true);
    expect(unlockedInmates(m)).toEqual(['debtor']);
    // Every archetype tag keeps unlocked charms.
    for (const tag of ['Money', 'Yard', 'Chute', 'Riot', 'Bonus', 'Luck', 'Lone', 'Iron'])
      expect(pool.some((c) => c.tags.includes(tag as never) && !locked.includes(c.id))).toBe(true);
  });

  it('milestones unlock charms and inmates once their stats are met', () => {
    const m = newMeta();
    m.stats.riots = 5;
    const fresh = checkUnlocks(m);
    expect(fresh.map((u) => u.id)).toEqual(['riots']);
    expect(inmateUnlocked(m, 'brawler')).toBe(true);
    expect(lockedCharms(m)).not.toContain('twinYolk');
    expect(checkUnlocks(m)).toEqual([]);
  });

  it('a win records the ending, unlocks Endless and the next Hard Time for that inmate', () => {
    const m = newMeta();
    expect(endlessUnlocked(m)).toBe(false);
    const fresh = recordRunEnd(m, won('W'), 3);
    expect(m.endings).toHaveLength(1);
    expect(m.endings[0].ending).toBe('paidInFull');
    expect(fresh.some((u) => u.id === 'win')).toBe(true);
    expect(endlessUnlocked(m)).toBe(true);
    expect(maxHardTime(m, 'debtor')).toBe(1);
    // Winning below your best doesn't skip ahead.
    recordRunEnd(m, won('W2'), 4);
    expect(maxHardTime(m, 'debtor')).toBe(1);
    recordRunEnd(m, won('W3', { hardTime: 1 }), 5);
    expect(maxHardTime(m, 'debtor')).toBe(2);
    expect(maxHardTime(m, 'lifer')).toBe(0);
  });

  it('a fall unlocks nothing new for Hard Time', () => {
    const m = newMeta();
    const s = newRun('F');
    s.phase = 'deadline';
    settleDeadline(s);
    expect(s.result).toBe('fell');
    recordRunEnd(m, s, 1);
    expect(m.endings).toHaveLength(0);
    expect(maxHardTime(m, 'debtor')).toBe(0);
  });

  it('endings unlock their own entries', () => {
    const m = newMeta();
    const s = won('B');
    s.result = 'breakout';
    recordRunEnd(m, s, 1);
    expect(m.unlocked).toContain('breakout');
    expect(m.unlocked).not.toContain('cellmate');
  });

  it('discovers what a run shows; locked charms never reach the shop', () => {
    const m = newMeta();
    const locked = lockedCharms(m);
    const s = newRun('D', { locked });
    for (let i = 0; i < 60; i++) {
      s.pocket = 1000;
      reroll(s);
      for (const id of s.shop.charms) expect(locked).not.toContain(id);
      discover(m, s);
    }
    s.deadline = 3;
    startDeadline(s);
    discover(m, s);
    expect(m.discovered.charms.length).toBeGreaterThan(10);
    expect(m.discovered.sentences.length).toBeGreaterThan(0);
    expect(m.discovered.contraband.length).toBeGreaterThan(0);
  });

  it('every unlock names something real', () => {
    const ids = new Set(CHARMS.map((c) => c.id));
    for (const u of UNLOCKS) for (const c of u.charms ?? []) expect(ids.has(c)).toBe(true);
  });
});
