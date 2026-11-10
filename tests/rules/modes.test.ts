import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { BRAWL, SCORE, SHAKEDOWN, SHIFT, SWEEP } from '../../src/content/balance';
import { Lamp } from '../../src/rules/types';

describe('Searchlight SWEEP', () => {
  it('a full meter starts the sweep and every other switch pays extra', () => {
    const h = harness();
    h.fire('spin', 'searchlight', { value: SWEEP.spins - 1 });
    expect(h.game.sweepLeft).toBe(0);
    h.fire('spin', 'searchlight', { value: 1 });
    expect(h.game.sweepLeft).toBeCloseTo(SWEEP.seconds);
    expect(h.of('mode')).toEqual([{ t: 'mode', mode: 'sweep', on: true }]);
    const before = h.game.earned;
    h.fire('sling', 'slingL');
    const extra = SWEEP.perHit * SCORE.scale;
    expect(h.game.earned - before).toBeCloseTo(SCORE.sling * SCORE.scale + extra);
    // The Searchlight itself pays no sweep extra and doesn't refill the meter meanwhile.
    const mid = h.game.earned;
    h.fire('spin', 'searchlight', { value: 2 });
    expect(h.game.earned - mid).toBeCloseTo(SCORE.searchlightSpin * 2 * SCORE.scale);
    expect(h.game.sweepMeter).toBe(0);
  });

  it('ends after its time', () => {
    const h = harness();
    h.fire('spin', 'searchlight', { value: SWEEP.spins });
    h.wait(SWEEP.seconds + 0.1);
    expect(h.game.sweepLeft).toBe(0);
    expect(h.of('mode').at(-1)).toEqual({ t: 'mode', mode: 'sweep', on: false });
  });
});

describe('Yard BRAWL', () => {
  it('quick bumper hits start a brawl that multiplies the Yard', () => {
    const h = harness();
    // Heat cools a hair between hits, so it takes one more than the bare threshold.
    for (let i = 0; i <= BRAWL.heatToStart; i++) h.fire('pop', 'pop1');
    expect(h.game.brawlLeft).toBeCloseTo(BRAWL.seconds, 1);
    const before = h.game.earned;
    h.fire('pop', 'pop1');
    expect(h.game.earned - before).toBeCloseTo(SCORE.pop * SCORE.scale * BRAWL.popMult);
    expect(h.game.stats.brawls).toBe(1);
  });

  it('heat cools between hits', () => {
    const h = harness();
    for (let i = 0; i < BRAWL.heatToStart - 1; i++) h.fire('pop', 'pop1');
    h.wait(BRAWL.heatToStart / BRAWL.decay + 1);
    expect(h.game.heat).toBe(0);
    h.fire('pop', 'pop1');
    expect(h.game.brawlLeft).toBe(0);
  });
});

describe('SHAKEDOWN', () => {
  it('slings light the mystery and an inlane collects exactly one award', () => {
    const h = harness();
    for (let i = 0; i < SHAKEDOWN.slings; i++) h.fire('sling', 'slingL');
    expect(h.game.mysteryLit).toBe(true);
    expect(h.game.lamps.mysteryL).toBe(Lamp.Fast);
    h.fire('trigger', 'inlaneL', { dir: 1 });
    expect(h.game.mysteryLit).toBe(false);
    const awards = h.of('mystery').filter((e) => e.award !== null);
    expect(awards).toHaveLength(1);
    expect(h.game.stats.shakedowns).toBe(1);
    h.fire('trigger', 'inlaneR', { dir: 1 });
    expect(h.game.stats.shakedowns).toBe(1);
  });

  it('awards the machine cannot give become cash', () => {
    // Every seed must leave the ball better off in some visible way.
    for (let seed = 1; seed <= 25; seed++) {
      const h = harness({ noKickback: true, lockdown: true, bonusMaxMult: 1 }, {}, seed);
      for (let i = 0; i < SHAKEDOWN.slings; i++) h.fire('sling', 'slingL');
      h.fire('trigger', 'inlaneL', { dir: 1 });
      const award = h.of('mystery').find((e) => e.award !== null)!.award;
      expect(['coins', 'bigCoins', 'ballSave', 'luck']).toContain(award);
    }
  });

  it('a tilt puts everything out', () => {
    const h = harness();
    for (let i = 0; i < SHAKEDOWN.slings; i++) h.fire('sling', 'slingL');
    h.fire('spin', 'searchlight', { value: SWEEP.spins });
    for (let i = 0; i < 12; i++) h.fire('nudge');
    expect(h.game.tilted).toBe(true);
    expect(h.game.mysteryLit).toBe(false);
    expect(h.game.sweepLeft).toBe(0);
  });
});

describe('The Tower', () => {
  it('each BAIL target pays once lit or not, and the fourth posts bail', () => {
    const h = harness();
    for (let i = 0; i < 3; i++) h.fire('trigger', `bail${i}`, { dir: 1 });
    expect(h.game.bail).toEqual([true, true, true, false]);
    expect(h.game.lamps.bail0).toBe(Lamp.On);
    expect(h.game.lamps.bail3).toBe(Lamp.Slow);
    // A ball leaving the bank crosses the line the other way: nothing.
    const before = h.game.earned;
    h.fire('trigger', 'bail3', { dir: -1 });
    expect(h.game.earned).toBe(before);
    h.fire('trigger', 'bail3', { dir: 1 });
    expect(h.game.stats.bails).toBe(1);
    expect(h.game.bail).toEqual([false, false, false, false]);
    expect(h.game.shiftLeft).toBeCloseTo(SHIFT.seconds);
    expect(h.game.earned - before).toBeCloseTo((SCORE.bail + SCORE.bailSet) * SCORE.scale);
  });

  it('DOUBLE SHIFT doubles hits until it runs out', () => {
    const h = harness();
    for (let i = 0; i < 4; i++) h.fire('trigger', `bail${i}`, { dir: 1 });
    const before = h.game.earned;
    h.fire('sling', 'slingL');
    expect(h.game.earned - before).toBeCloseTo(SCORE.sling * SCORE.scale * SHIFT.mult);
    h.wait(SHIFT.seconds + 0.1);
    const after = h.game.earned;
    h.fire('sling', 'slingL');
    expect(h.game.earned - after).toBeCloseTo(SCORE.sling * SCORE.scale);
    expect(h.game.lamps.doubleShift).toBe(Lamp.Off);
  });

  it('the tower rollover pays and spots a top lane', () => {
    const h = harness();
    h.fire('trigger', 'towerTop', { dir: 1 });
    expect(h.game.machine.lanes.filter(Boolean)).toHaveLength(1);
    expect(h.of('score').some((e) => e.shot === 'tower')).toBe(true);
  });
});
