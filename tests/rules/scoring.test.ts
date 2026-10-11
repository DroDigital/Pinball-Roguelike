import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { ComboTracker } from '../../src/rules/combo';
import { bonusTotal } from '../../src/rules/bonus';
import { BONUS, COMBO, HURRY, RIOT, SCORE } from '../../src/content/balance';

describe('combos', () => {
  it('tracker builds within the window and resets outside it', () => {
    const c = new ComboTracker(3, 1, 1);
    expect(c.hit(0)).toBe(1);
    expect(c.hit(2.9)).toBe(2);
    expect(c.hit(5.8)).toBe(3);
    expect(c.hit(9.0)).toBe(1);
    const chain = new ComboTracker(3, 2, 2); // Cracked Mirror + Chain Link
    expect(chain.hit(0)).toBe(2);
    expect(chain.hit(1)).toBe(4);
  });

  it('a stopped clock (Pocket Watch) keeps the chain alive past the window', () => {
    const c = new ComboTracker(3, 1, 1);
    c.hit(0);
    c.hold(10);
    expect(c.active(8)).toBe(true);
    expect(c.left(8)).toBeCloseTo(2);
    expect(c.hit(9)).toBe(2);
    expect(c.hit(14)).toBe(1);
    c.reset();
    expect(c.held(5)).toBe(false);
  });

  it('major shots in a chain pay the combo multiplier', () => {
    const h = harness();
    h.chute();
    h.wait(1);
    h.chute();
    h.wait(1);
    h.chute();
    const chute = h
      .of('score')
      .filter((e) => e.shot === 'chute')
      .map((e) => e.amount);
    const v = SCORE.chute * SCORE.scale;
    expect(chute[0]).toBeCloseTo(v);
    expect(chute[1]).toBeCloseTo(v * 2);
    expect(chute[2]).toBeCloseTo(v * 3);
    expect(h.of('combo').map((e) => e.count)).toEqual([2, 3]);
    expect(h.game.stats.maxCombo).toBe(3);
  });

  it('the chain breaks after the window', () => {
    const h = harness();
    h.chute();
    h.wait(COMBO.window + 0.1);
    h.chute();
    expect(h.of('combo')).toHaveLength(0);
  });

  it('Short Fuse style windows are respected', () => {
    const h = harness({ comboWindow: 1.5 });
    h.chute();
    h.wait(2);
    h.chute();
    expect(h.of('combo')).toHaveLength(0);
  });
});

describe('bonus', () => {
  it('every hit adds its share; the drain tallies bonus x multiplier', () => {
    const h = harness();
    h.fire('pop', 'pop0');
    h.fire('pop', 'pop1');
    expect(h.game.bonus).toBeCloseTo(SCORE.pop * SCORE.scale * 2 * BONUS.share);
    expect(bonusTotal(10, 3, { keep: 0.75, times: 2 })).toBeCloseTo(45);
  });

  it('completing the top lanes raises the multiplier up to the cap', () => {
    const h = harness({ bonusMaxMult: 3 });
    for (let set = 0; set < 3; set++)
      for (const id of ['laneA', 'laneB', 'laneC']) h.fire('trigger', id, { dir: 1 });
    expect(h.game.bonusMult).toBe(3);
    expect(h.game.stats.laneSets).toBe(3);
  });

  it('Dead Lanes stops lanes raising the multiplier', () => {
    const h = harness({ deadLanes: true });
    for (const id of ['laneA', 'laneB', 'laneC']) h.fire('trigger', id, { dir: 1 });
    expect(h.game.bonusMult).toBe(1);
  });

  it('the ball end pays the tally; Taxman keeps 75%; tilt forfeits everything', () => {
    for (const [keep, tilt] of [
      [1, false],
      [0.75, false],
      [1, true],
    ] as const) {
      const h = harness({ bonusKeep: keep });
      h.serve();
      for (let i = 0; i < 10; i++) h.fire('pop', 'pop0');
      if (tilt) for (let i = 0; i < 8; i++) h.fire('nudge');
      h.sim.clearBalls();
      h.wait(1 / 240);
      expect(h.game.over).toBe(true);
      const expected = tilt ? 0 : SCORE.pop * SCORE.scale * 10 * BONUS.share * keep;
      expect(h.game.bonusPaid).toBeCloseTo(expected);
      if (tilt) expect(h.game.earned).toBe(0);
    }
  });
});

describe('Cell Block, Lockup and RIOT', () => {
  it('clearing Cell Block lights Lockup (unless Lockdown)', () => {
    const h = harness();
    h.clearCellBlock();
    expect(h.game.machine.lockLit).toBe(true);
    expect(h.game.stats.cellBlocks).toBe(1);
    const locked = harness({ lockdown: true });
    locked.clearCellBlock();
    expect(locked.game.machine.lockLit).toBe(false);
  });

  it('two locks start RIOT, which releases the balls and grows PAYDAY', () => {
    const h = harness({}, { awardLit: false });
    h.clearCellBlock();
    h.serve();
    h.sim.clearBalls(); // the only ball is the one that drops into the Hole
    h.hole();
    expect(h.of('lock')).toHaveLength(1);
    expect(h.sim.pendingServes).toBe(1); // replacement ball to the plunger
    // Each lock needs Lockup relit by another Cell Block clear.
    expect(h.game.machine.lockLit).toBe(false);
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.of('lock')).toHaveLength(1);
    h.clearCellBlock();
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.game.riot).toBe(true);
    expect(h.of('riot')[0].on).toBe(true);
    const before = h.game.payday;
    h.fire('pop', 'pop0');
    expect(h.game.payday).toBeCloseTo(before + RIOT.paydayPerHit);
    h.wait(5);
    // Captured ball ejected, one more from the Hole, one auto-launched.
    expect(
      h.sim.balls.filter((b) => b.state === 'transport' || b.state === 'held').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('PAYDAY at the Chute lights SUPER PAYDAY (3x) at the Hole and resets', () => {
    const h = harness({}, { awardLit: false, lockLit: true, locks: 1 });
    h.serve();
    h.hole(); // second lock -> RIOT
    for (let i = 0; i < 20; i++) h.fire('pop', 'pop0');
    h.wait(COMBO.window + 0.1);
    // The Chute hit itself grows PAYDAY once more before collecting it.
    const value = h.game.payday + RIOT.paydayPerHit;
    h.chute();
    const pays = h.of('payday');
    expect(pays).toHaveLength(1);
    expect(pays[0].amount).toBeCloseTo(value * SCORE.scale);
    expect(h.game.superLit).toBe(true);
    expect(h.game.payday).toBe(RIOT.paydayBase);
    h.wait(COMBO.window + 0.1);
    h.hole();
    const sup = h.of('payday')[1];
    expect(sup.super).toBe(true);
    expect(sup.amount).toBeCloseTo(value * SCORE.scale * RIOT.superMult);
  });

  it('Spare Key: RIOT after one lock', () => {
    const h = harness({ locksNeeded: 1 }, { lockLit: true, awardLit: false });
    h.serve();
    h.hole();
    expect(h.game.riot).toBe(true);
  });
});

describe('Hole awards', () => {
  it('collects the lit award, advances, and a completed set relights it', () => {
    const h = harness();
    expect(h.game.machine.awardLit).toBe(true);
    h.hole();
    expect(h.of('award')[0]).toMatchObject({ award: 'bonusX', collected: true });
    expect(h.game.bonusMult).toBe(2);
    expect(h.game.machine.awardLit).toBe(false);
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.of('award')).toHaveLength(1);
    for (const id of ['laneA', 'laneB', 'laneC']) h.fire('trigger', id, { dir: 1 });
    expect(h.game.machine.awardLit).toBe(true);
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.of('award')[2]).toMatchObject({ award: 'kickback', collected: true });
    expect(h.sim.kickbackArmed).toBe(true);
  });

  it('hurry-up pays a countdown at the Chute', () => {
    const h = harness({}, { award: 2 });
    h.hole();
    expect(h.game.hurryLeft).toBeGreaterThan(0);
    h.wait(COMBO.window + 0.1);
    h.chute();
    const jackpot = h.of('score').filter((e) => e.shot === 'jackpot');
    expect(jackpot).toHaveLength(1);
    expect(jackpot[0].amount).toBeLessThan(HURRY.start * SCORE.scale);
    expect(jackpot[0].amount).toBeGreaterThan(HURRY.end * SCORE.scale);
  });

  it('level up goes to the most-made major shot; extra ball counts', () => {
    const h = harness({}, { award: 3 });
    for (let i = 0; i < 5; i++) h.fire('pop', 'pop0');
    h.chute();
    h.wait(COMBO.window + 0.1);
    h.chute();
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.game.levelUps).toEqual(['chute']);
    expect(h.game.levels.chute).toBe(2);
    const x = harness({}, { award: 4 });
    x.hole();
    expect(x.game.extraBalls).toBe(1);
  });
});

describe('kickback and luck', () => {
  it('the kickback starts unlit, and unlights when it fires', () => {
    expect(harness().sim.kickbackArmed).toBe(false);
    const h = harness({}, { kickback: true });
    expect(h.sim.kickbackArmed).toBe(true);
    h.fire('kickback');
    expect(h.sim.kickbackArmed).toBe(false);
    expect(h.game.machine.kickback).toBe(false);
  });

  it('luck adds 2 points per point to chances; lucky bounces kick outlaned balls', () => {
    const h = harness({ luck: 50 }, { kickback: false });
    expect(h.game.chance(0.04)).toBe(1);
    const b = h.sim.spawnBall(18, 10, 0, -5);
    h.fire('trigger', 'outlaneR', { dir: 1, ballId: b.id });
    expect(h.of('luck')[0]).toMatchObject({ kind: 'bounce' });
    expect(h.game.stats.luckyBounces).toBe(1);
  });

  it('no lucky bounce on the left while the kickback is lit', () => {
    const h = harness({ luck: 50 }, { kickback: true });
    const b = h.sim.spawnBall(1, 10, 0, -5);
    h.fire('trigger', 'outlaneL', { dir: 1, ballId: b.id });
    expect(h.of('luck')).toHaveLength(0);
  });
});

describe('job tracking', () => {
  it('fires jobDone when the round total reaches the target', () => {
    const h = harness({
      job: { id: 'chute', stat: 'chutes', mode: 'sum', base: 3, target: 5, done: false },
    });
    h.chute();
    expect(h.of('jobDone')).toHaveLength(0);
    h.wait(COMBO.window + 0.1);
    h.chute();
    expect(h.of('jobDone')).toHaveLength(1);
    expect(h.game.jobProgress()).toBe(5);
  });
});

describe('top lanes', () => {
  it('a Perimeter orbit spots the next top lane; three complete the set', () => {
    const h = harness();
    h.serve();
    for (let i = 0; i < 3; i++) {
      h.fire('trigger', 'perimL', { dir: 1 });
      h.fire('trigger', 'perimLTop', { dir: 1 });
      h.wait(3);
    }
    expect(h.game.stats.perimeters).toBe(3);
    expect(h.game.stats.laneSets).toBe(1);
    expect(h.game.bonusMult).toBe(2);
  });
});
