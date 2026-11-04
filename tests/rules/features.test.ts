import { afterEach, describe, expect, it } from 'vitest';
import { harness } from './harness';
import { ADD_A_BALL, COMBO, FRENZY, MYSTERY, PLAYFIELD_X, SCORE } from '../../src/content/balance';
import { Lamp, type MysteryId } from '../../src/rules/types';

type H = ReturnType<typeof harness>;

const laneSet = (h: H) => {
  for (const id of ['laneA', 'laneB', 'laneC']) h.fire('trigger', id, { dir: 1 });
};
const perimeter = (h: H, side: 'L' | 'R' = 'R') => {
  h.fire('trigger', `perim${side}`, { dir: 1 });
  h.fire('trigger', `perim${side}Top`, { dir: 1 });
};
const spins = (h: H, n: number) => {
  for (let i = 0; i < n; i += 10) h.fire('spin', 'spinner', { value: Math.min(10, n - i) });
};
const popPay = (h: H) => {
  h.fire('pop', 'pop0');
  const s = h.of('score');
  return s[s.length - 1].amount;
};

describe('DOUBLE TIME (playfield multiplier)', () => {
  it('every few lane sets raise it, it multiplies payouts and runs out', () => {
    const h = harness();
    const base = popPay(h);
    for (let i = 0; i < PLAYFIELD_X.laneSetsPer; i++) laneSet(h);
    expect(h.game.playfieldX).toBe(2);
    expect(h.of('playfieldX')[0]).toMatchObject({ mult: 2, on: true });
    expect(popPay(h)).toBeCloseTo(base * 2);
    h.wait(PLAYFIELD_X.seconds + 0.1);
    expect(h.game.playfieldX).toBe(1);
    expect(h.of('playfieldX').at(-1)).toMatchObject({ mult: 1, on: false });
    expect(popPay(h)).toBeCloseTo(base);
  });

  it('caps at the maximum', () => {
    const h = harness();
    for (let i = 0; i < PLAYFIELD_X.laneSetsPer * (PLAYFIELD_X.max + 2); i++) laneSet(h);
    expect(h.game.playfieldX).toBe(PLAYFIELD_X.max);
    expect(h.game.stats.maxPlayfieldX).toBe(PLAYFIELD_X.max);
  });
});

describe('YARD BRAWL (frenzy)', () => {
  it('starts after enough pop hits; every switch pays extra until it ends', () => {
    const h = harness();
    const sling = () => {
      h.fire('sling', 'slingL');
      return h.of('score').at(-1)!.amount;
    };
    const plain = sling();
    for (let i = 0; i < FRENZY.popsToStart; i++) h.fire('pop', 'pop0');
    expect(h.game.frenzyLeft).toBeGreaterThan(0);
    expect(h.of('frenzy')).toEqual([{ t: 'frenzy', on: true }]);
    expect(h.game.stats.frenzies).toBe(1);
    expect(sling()).toBeCloseTo(plain + h.game.shotValue('yard', FRENZY.perSwitch));
    h.wait(FRENZY.seconds + 0.1);
    expect(h.of('frenzy').at(-1)).toEqual({ t: 'frenzy', on: false });
    expect(sling()).toBeCloseTo(plain);
  });
});

describe('CONTRABAND CRATE (mystery award)', () => {
  const saved = { ...MYSTERY.weights };
  afterEach(() => Object.assign(MYSTERY.weights, saved));
  const only = (id: MysteryId) => {
    for (const k of Object.keys(MYSTERY.weights) as MysteryId[]) MYSTERY.weights[k] = 0;
    MYSTERY.weights[id] = 1;
  };
  const lit = () => {
    const h = harness({}, { awardLit: false });
    spins(h, MYSTERY.spinsToLight);
    return h;
  };

  it('spinner spins light it at both Perimeters; an orbit opens it', () => {
    const h = lit();
    expect(h.game.crateLit).toBe(true);
    expect(h.of('crateLit')).toHaveLength(1);
    expect(h.game.lamps.arrowPerimL).toBe(Lamp.Slow);
    expect(h.game.lamps.arrowPerimR).toBe(Lamp.Slow);
    perimeter(h, 'L');
    expect(h.of('mystery')).toHaveLength(1);
    expect(h.game.crateLit).toBe(false);
    expect(h.game.stats.crates).toBe(1);
    expect(h.game.lamps.arrowPerimR).toBe(Lamp.Off);
  });

  it('cash pays a few Perimeter values', () => {
    only('cash');
    const h = lit();
    perimeter(h);
    const m = h.of('mystery')[0];
    const v = h.game.shotValue('perimeter', SCORE.perimeter);
    expect(m.amount).toBeGreaterThanOrEqual(v * MYSTERY.cashMin - 1e-9);
    expect(m.amount).toBeLessThanOrEqual(v * MYSTERY.cashMax + 1e-9);
  });

  it('every award does what it says', () => {
    const run = (id: MysteryId) => {
      only(id);
      const h = lit();
      perimeter(h);
      expect(h.of('mystery')[0].award).toBe(id);
      return h;
    };
    expect(run('bonusX').game.bonusMult).toBe(2);
    expect(run('ballSave').game.ballSaveLeft).toBeGreaterThan(MYSTERY.ballSave - 0.1);
    expect(run('frenzy').game.frenzyLeft).toBeGreaterThan(0);
    expect(run('double').game.playfieldX).toBe(2);
    expect(run('lockup').game.machine.lockLit).toBe(true);
    const lucky = run('luck');
    expect(lucky.game.luck).toBe(harness().game.luck + MYSTERY.luck);
  });

  it('an award that cannot apply pays cash instead', () => {
    only('lockup');
    const h = harness({ lockdown: true }, { awardLit: false });
    spins(h, MYSTERY.spinsToLight);
    perimeter(h);
    expect(h.of('mystery')[0].award).toBe('cash');
  });

  it('rolls deterministically from the ball seed', () => {
    const roll = () => {
      const h = lit();
      perimeter(h);
      return h.of('mystery')[0];
    };
    expect(roll()).toEqual(roll());
  });
});

describe('REINFORCEMENTS (add-a-ball)', () => {
  it('a Cell Block clear during RIOT adds one ball per RIOT', () => {
    const h = harness({}, { awardLit: false });
    h.clearCellBlock();
    h.serve();
    h.sim.clearBalls();
    h.hole();
    h.wait(COMBO.window + 0.1);
    h.clearCellBlock();
    h.wait(COMBO.window + 0.1);
    h.hole();
    expect(h.game.riot).toBe(true);
    h.clearCellBlock();
    expect(h.of('addABall')).toHaveLength(1);
    expect(h.game.riotSaveLeft).toBeGreaterThan(ADD_A_BALL.save - 0.1);
    for (let i = 0; i < ADD_A_BALL.perRiot + 1; i++) h.clearCellBlock();
    expect(h.of('addABall')).toHaveLength(ADD_A_BALL.perRiot);
  });
});
