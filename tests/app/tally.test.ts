import { describe, expect, it } from 'vitest';
import { tally } from '../../src/app/tally';
import { emptyOutcome, finishBall, newRun } from '../../src/rules/run';

describe('ball-over tally', () => {
  it('adds up: table + bonus + carried in = coins gained + loose change kept', () => {
    const r = newRun('TALLY');
    // Fractions that never sum to a whole number, ball after ball.
    for (const [earned, bonus] of [
      [6.8, 1.9],
      [0.35, 0.4],
      [12.45, 0],
      [3.3, 3.3],
      [0.1, 0.1],
    ]) {
      const o = { ...emptyOutcome(), earned, bonus };
      const before = r.looseChange;
      const res = finishBall(r, o);
      const t = tally(o, res, r.looseChange);
      expect(t.gained).toBe(res.gained);
      expect(t.carried).toBeCloseTo(before, 6);
      expect(t.table + t.bonus + t.carried).toBeCloseTo(t.gained + t.kept, 6);
      expect(t.kept).toBeGreaterThanOrEqual(0);
      expect(t.kept).toBeLessThan(1);
    }
  });

  it('shows the fraction that vanished from the old two-row breakdown', () => {
    const r = newRun('TALLY');
    const o = { ...emptyOutcome(), earned: 6.8, bonus: 1.9 };
    const res = finishBall(r, o);
    const t = tally(o, res, r.looseChange);
    expect(t.gained).toBe(8);
    expect(t.kept).toBeCloseTo(0.7, 6);
    expect(t.carried).toBe(0);
  });

  it('a tilt keeps nothing and marks the rows lost', () => {
    const r = newRun('TALLY');
    r.looseChange = 0.4;
    const o = { ...emptyOutcome(), earned: 9.5, bonus: 2, tilted: true };
    const res = finishBall(r, o);
    const t = tally(o, res, r.looseChange);
    expect(t.lost).toBe(true);
    expect(t.gained).toBe(0);
    expect(t.kept).toBe(0);
    expect(t.carried).toBe(0);
  });
});
