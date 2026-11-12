import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { ADD_A_BALL, BRAWL, SHAKEDOWN, SHIFT } from '../../src/content/balance';
import { charmDef } from '../../src/content/charms';
import { jobDef } from '../../src/content/jobs';

/** Lock two balls so the next Hole shot starts RIOT. */
function riot(h: ReturnType<typeof harness>): void {
  h.serve();
  for (let i = 0; i < 2; i++) {
    h.clearCellBlock();
    h.hole();
  }
  h.clearCellBlock();
  h.hole();
}

describe('REINFORCEMENTS', () => {
  it('a Cell Block clear during RIOT adds one ball, once per RIOT', () => {
    const h = harness();
    riot(h);
    expect(h.game.riot).toBe(true);
    h.clearCellBlock();
    expect(h.of('addABall')).toHaveLength(1);
    expect(h.game.riotSaveLeft).toBeGreaterThanOrEqual(ADD_A_BALL.save - 0.01);
    h.clearCellBlock();
    expect(h.of('addABall')).toHaveLength(ADD_A_BALL.perRiot);
    expect(h.game.stats.addABalls).toBe(1);
  });

  it('outside RIOT a clear lights Lockup as before', () => {
    const h = harness();
    h.clearCellBlock();
    expect(h.of('addABall')).toHaveLength(0);
    expect(h.game.machine.lockLit).toBe(true);
  });
});

describe('Mess Hall charms', () => {
  it('Brass Megaphone lengthens a Yard Brawl', () => {
    const add = charmDef('brassMegaphone').fx!.brawlSecondsAdd!;
    const h = harness({ brawlSecondsAdd: add });
    for (let i = 0; i <= BRAWL.heatToStart; i++) h.fire('pop', 'pop1');
    expect(h.game.brawlLeft).toBeCloseTo(BRAWL.seconds + add, 1);
  });

  it('Prison Clock lengthens DOUBLE SHIFT', () => {
    const add = charmDef('prisonClock').fx!.shiftSecondsAdd!;
    const h = harness({ shiftSecondsAdd: add });
    for (let i = 0; i < 4; i++) h.fire('trigger', `bail${i}`, { dir: 1 });
    expect(h.game.shiftLeft).toBeCloseTo(SHIFT.seconds + add, 1);
  });

  it('Bolt Cutters light SHAKEDOWN sooner', () => {
    const add = charmDef('boltCutters').fx!.shakedownSlingsAdd!;
    const h = harness({ shakedownSlingsAdd: add });
    for (let i = 0; i < SHAKEDOWN.slings + add; i++) h.fire('sling', 'slingL');
    expect(h.game.mysteryLit).toBe(true);
  });
});

describe('Jobs for the new modes', () => {
  it('read the stats the modes keep', () => {
    expect(jobDef('brawl').stat).toBe('brawls');
    expect(jobDef('shakedown').stat).toBe('shakedowns');
    expect(jobDef('bail').stat).toBe('bails');
  });
});
