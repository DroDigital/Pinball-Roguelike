import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  newRun,
  buyBalls,
  costForBalls,
  finishBall,
  deposit,
  endRound,
  settleDeadline,
  debtFor,
  ballsLeft,
  nextBall,
  pickJob,
  type BallOutcome,
  type RunState,
} from '../../src/rules/run';
import { emptyBallStats } from '../../src/content/jobs';
import { ECONOMY } from '../../src/content/balance';
import { newMachineState } from '../../src/rules/table-game';

const outcome = (earned: number, tilted = false, bonus = 0): BallOutcome => ({
  earned,
  bonus,
  tilted,
  drainCause: 'center',
  machine: newMachineState(),
  stats: emptyBallStats(),
  levelUps: [],
  extraBalls: 0,
  paydayEnd: 0,
  charges: {},
});

/** New run with the first Job taken, ready to buy balls. */
const started = (seed: string): RunState => {
  const s = newRun(seed);
  pickJob(s, 0);
  return s;
};

describe('run economy', () => {
  it('starts with the brief numbers', () => {
    const s = started('seed');
    expect(s.pocket).toBe(15);
    expect(s.debt).toBe(75);
    expect(debtFor(1)).toBe(Math.round(75 * ECONOMY.debtGrowth));
  });

  it('first ball each round is free, the rest cost the ball price', () => {
    const s = started('seed');
    expect(costForBalls(s, 1)).toBe(0);
    expect(costForBalls(s, 3)).toBe(2 * ECONOMY.ballPriceBase);
    expect(buyBalls(s, 3)).toBe(true);
    expect(s.pocket).toBe(15 - 6);
    expect(ballsLeft(s)).toBe(3);
  });

  it('cannot buy more balls than affordable or than the max', () => {
    const s = started('seed');
    s.pocket = 2;
    expect(buyBalls(s, 2)).toBe(false);
    expect(buyBalls(s, 6)).toBe(false);
    expect(buyBalls(s, 1)).toBe(true);
  });

  it('commits whole coins and carries loose change; tilts forfeit', () => {
    const s = started('seed');
    buyBalls(s, 3);
    expect(finishBall(s, outcome(4.7)).gained).toBe(4);
    expect(s.looseChange).toBeCloseTo(0.7);
    expect(finishBall(s, outcome(0.4)).gained).toBe(1);
    expect(s.looseChange).toBeCloseTo(0.1);
    expect(finishBall(s, outcome(50, true, 9)).gained).toBe(0);
  });

  it('deadline pays from the bank or the floor opens', () => {
    const s = started('seed');
    for (let r = 0; r < 3; r++) {
      if (s.phase === 'pickJob') pickJob(s, 0);
      buyBalls(s, 1);
      finishBall(s, outcome(40));
      deposit(s, s.pocket);
      endRound(s);
    }
    expect(s.phase).toBe('deadline');
    const bank = s.bank;
    expect(settleDeadline(s)).toBe(bank >= 75);
  });

  it('snapshots use the run rng deterministically', () => {
    const a = started('x');
    const b = started('x');
    buyBalls(a, 1);
    buyBalls(b, 1);
    expect(nextBall(a).seed).toBe(nextBall(b).seed);
  });

  it('property: balances never go negative and coins are conserved by deposits', () => {
    const action = fc.oneof(
      fc.record({ k: fc.constant('buy'), n: fc.integer({ min: 0, max: 7 }) }),
      fc.record({
        k: fc.constant('ball'),
        e: fc.double({ min: 0, max: 200, noNaN: true }),
        b: fc.double({ min: 0, max: 200, noNaN: true }),
        t: fc.boolean(),
      }),
      fc.record({ k: fc.constant('dep'), a: fc.integer({ min: -10, max: 500 }) }),
      fc.record({ k: fc.constant('end') }),
      fc.record({ k: fc.constant('settle') }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 80 }), (acts) => {
        const s: RunState = started('prop');
        for (const a of acts) {
          if (s.phase === 'over') break;
          const before = s.pocket + s.bank;
          if (s.phase === 'pickJob') pickJob(s, 0);
          if (a.k === 'buy') buyBalls(s, a.n);
          else if (a.k === 'ball' && s.phase !== 'buyBalls' && ballsLeft(s) > 0)
            finishBall(s, outcome(a.e, a.t, a.b));
          else if (a.k === 'dep') {
            deposit(s, a.a);
            expect(s.pocket + s.bank).toBe(before);
          } else if (a.k === 'end') endRound(s);
          else if (a.k === 'settle' && s.phase === 'deadline') settleDeadline(s);
          expect(s.pocket).toBeGreaterThanOrEqual(0);
          expect(s.bank).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(s.pocket)).toBe(true);
          expect(Number.isInteger(s.bank)).toBe(true);
          expect(s.looseChange).toBeGreaterThanOrEqual(0);
          expect(s.looseChange).toBeLessThan(1);
        }
      }),
      { numRuns: 300 },
    );
  });
});
