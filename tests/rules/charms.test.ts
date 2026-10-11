/**
 * One test per charm and per contraband item: each proves its effect reaches the place it
 * should (ball context, sim mods, table tags, a rules hook, or the run's economy).
 */
import { describe, expect, it } from 'vitest';
import { harness, harnessSnap } from './harness';
import {
  newRun,
  pickJob,
  buyBalls,
  nextBall,
  finishBall,
  endRound,
  deposit,
  payEarly,
  interestRate,
  loanCost,
  gainCharm,
  emptyOutcome,
  ballsLeft,
  freeBalls,
  sentenceActive,
  roundsIn,
  type RunState,
} from '../../src/rules/run';
import {
  sellValue,
  sellCharm,
  contrabandSlots,
  contrabandPrice,
  restock,
  buyCharm,
  buyContraband,
  useContraband,
  reroll,
  rerollCost,
} from '../../src/rules/shop';
import { CHARMS, charmDef } from '../../src/content/charms';
import { jobDef } from '../../src/content/jobs';
import { CONTRABAND } from '../../src/content/contraband';
import { BALL, BONUS, COMBO, CONTRABAND_FX, ECONOMY, RIOT, SCORE } from '../../src/content/balance';
import { RUN_HOOK } from '../../src/rules/charm-hooks';

/** A run owning these charms, between balls with `balls` bought. */
function runWith(charms: string[], balls = 1): RunState {
  const s = newRun(`charms-${charms.join('-')}`);
  s.mods.charmSlots = 8;
  for (const c of charms) expect(gainCharm(s, c), c).toBe(true);
  pickJob(s, 0);
  s.pocket = 500;
  buyBalls(s, balls);
  return s;
}

const snapOf = (charms: string[], balls = 1) => nextBall(runWith(charms, balls));
const ctxOf = (charms: string[], balls = 1) => snapOf(charms, balls).ctx;
const ballOf = (charms: string[], balls = 1) => harnessSnap(snapOf(charms, balls));
const tested = new Set<string>();
const t = (id: string, fn: () => void) =>
  it(`${id}: ${charmDef(id).text}`, () => {
    tested.add(id);
    fn();
  });

describe('Money charms', () => {
  t('piggyBank', () =>
    expect(interestRate(runWith(['piggyBank']))).toBeCloseTo(ECONOMY.interest + 0.1),
  );
  t('sharkTooth', () => expect(loanCost(runWith(['sharkTooth']), 100)).toBe(110));
  t('mattress', () => {
    const s = runWith(['mattress']);
    nextBall(s);
    finishBall(s, emptyOutcome());
    s.pocket = 100;
    endRound(s);
    expect(s.pocket).toBe(110);
  });
  t('pawnTicket', () => {
    const s = newRun('pawn');
    gainCharm(s, 'pawnTicket');
    s.bank = s.debt;
    payEarly(s);
    expect(s.tickets).toBe(ECONOMY.payEarlyTickets * 3 + 2);
  });
  t('hollowBook', () => {
    const s = runWith(['hollowBook', 'chainLink']);
    expect(sellValue(s, 'chainLink')).toBe(charmDef('chainLink').cost);
    expect(sellValue(runWith(['chainLink']), 'chainLink')).toBe(
      Math.floor(charmDef('chainLink').cost / 2),
    );
  });
  t('stashBox', () => {
    const s = runWith(['stashBox']);
    expect(contrabandSlots(s)).toBe(3);
    expect(contrabandPrice(s, 'chalk')).toBe(contrabandPrice(runWith([]), 'chalk') - 1);
  });
  t('overtime', () => {
    const s = runWith(['overtime'], 2);
    s.job = { id: 'chute', target: 1, progress: 0, done: false };
    const tickets = s.tickets;
    nextBall(s);
    const o = emptyOutcome();
    o.stats.chutes = 1;
    finishBall(s, o);
    expect(s.tickets - tickets).toBe(2 * jobDef('chute').reward.tickets!);
  });
});

describe('Shot charms', () => {
  const popPays = (charms: string[]) => {
    const h = ballOf(charms);
    h.fire('pop', 'pop0');
    return h.of('score')[0].amount;
  };
  t('jarOfTeeth', () => expect(popPays(['jarOfTeeth'])).toBeCloseTo(popPays([]) * 3));
  t('brassKnuckles', () => {
    const h = ballOf(['brassKnuckles']);
    h.fire('sling', 'slingL');
    expect(h.of('score')[0].amount).toBeCloseTo(SCORE.sling * SCORE.scale * 4);
  });
  t('barFight', () => {
    const h = ballOf(['barFight']);
    for (let i = 0; i < 25; i++) h.fire('pop', 'pop0');
    expect(h.game.bonusMult).toBe(2);
  });
  t('oiledHinge', () => expect(ctxOf(['oiledHinge']).shotMult.searchlight).toBe(3));
  t('greasedRail', () => {
    const snap = snapOf(['greasedRail']);
    expect(snap.ctx.shotMult.chute).toBe(3);
    expect(snap.mods.greasedRail).toBe(true);
  });
  t('mothWings', () => {
    const h = ballOf(['mothWings']);
    h.chute();
    h.wait(1);
    h.fire('trigger', 'perimL', { dir: 1 });
    h.fire('trigger', 'perimLTop', { dir: 1 });
    const perim = h.of('score').filter((e) => e.shot === 'perimeter');
    expect(perim[0].amount).toBeCloseTo(SCORE.perimeter * SCORE.scale * 2 * 3);
  });
  t('feedingBowl', () => {
    const c = ctxOf(['feedingBowl']);
    expect(c.shotMult.hole).toBe(3);
    expect(c.holeHoldAdd).toBe(-1);
  });
  t('greaseMonkey', () => {
    const s = runWith(['greaseMonkey']);
    restock(s);
    expect(s.shop.contraband).toContain('oilCan');
    s.contraband = ['oilCan'];
    useContraband(s, 0, { shot: 'chute' });
    expect(s.shotLevels.chute).toBe(3);
  });
});

describe('Combo charms', () => {
  const chuteChain = (charms: string[]) => {
    const h = ballOf(charms);
    h.chute();
    h.wait(1);
    h.chute();
    return h
      .of('score')
      .filter((e) => e.shot === 'chute')
      .map((e) => e.amount / (SCORE.chute * SCORE.scale));
  };
  t('crackedMirror', () => expect(chuteChain(['crackedMirror']).map(Math.round)).toEqual([2, 3]));
  t('longFuse', () => expect(ctxOf(['longFuse']).comboWindow).toBe(COMBO.window + 2));
  t('chainLink', () => expect(chuteChain(['chainLink']).map(Math.round)).toEqual([1, 3]));
});

describe('Bonus charms', () => {
  t('chippedAbacus', () => {
    expect(ctxOf(['chippedAbacus']).bonusMaxMult).toBe(BONUS.maxMult + 2);
    expect(ballOf(['chippedAbacus']).game.bonusMult).toBe(2);
  });
  t('rollCallSheet', () => {
    const h = ballOf(['rollCallSheet']);
    h.serve();
    for (let i = 0; i < 3; i++) {
      h.hole();
      h.wait(3);
    }
    expect(h.game.stats.laneSets).toBe(1);
    // Without the sheet the Hole lights nothing.
    const b = ballOf([]);
    b.serve();
    b.hole();
    expect(b.game.machine.lanes.some(Boolean)).toBe(false);
  });
  t('cookedBooks', () => expect(ctxOf(['cookedBooks']).bonusShare).toBeCloseTo(BONUS.share * 2));
  t('heldBreath', () => {
    const h = ballOf(['heldBreath']);
    expect(h.game.ctx.holdBonusMult).toBe(true);
    const s = runWith(['heldBreath'], 2);
    s.machine.bonusMult = 3;
    expect(harnessSnap(nextBall(s)).game.bonusMult).toBe(3);
  });
  t('lastRites', () => {
    const s = runWith(['lastRites'], 2);
    expect(nextBall(s).ctx.bonusTimes).toBe(1);
    finishBall(s, emptyOutcome());
    expect(nextBall(s).ctx.bonusTimes).toBe(RUN_HOOK.lastRitesTimes);
  });
});

describe('Riot charms', () => {
  t('notchedSpoon', () => {
    const h = ballOf(['notchedSpoon']);
    h.clearCellBlock();
    expect(h.game.levelUps).toEqual(['cellblock']);
  });
  t('spareKey', () => expect(ctxOf(['spareKey']).locksNeeded).toBe(1));
  t('cellmates', () => expect(ctxOf(['cellmates']).riotBalls).toBe(RIOT.balls + 1));
  t('hoarderSack', () => {
    const s = runWith(['hoarderSack'], 2);
    nextBall(s);
    finishBall(s, { ...emptyOutcome(), paydayEnd: 40 });
    expect(nextBall(s).ctx.paydayCarry).toBe(40);
  });
  t('handCrank', () => {
    const h = ballOf(['handCrank', 'crowbar']);
    h.game.ctx.actives[0].charges = 0;
    h.game.riot = true;
    h.chute();
    expect(h.game.ctx.actives[0].charges).toBe(1);
  });
});

describe('Luck charms', () => {
  t('candleStub', () => {
    const s = runWith(['candleStub'], 2);
    expect(nextBall(s).ctx.luck).toBe(3);
    finishBall(s, emptyOutcome());
    expect(nextBall(s).ctx.luck).toBe(3 + RUN_HOOK.candleLuck);
  });
  t('wishbone', () => {
    const s = runWith(['wishbone'], 2);
    nextBall(s);
    finishBall(s, emptyOutcome());
    expect(nextBall(s).ctx.luck).toBe(RUN_HOOK.wishboneLuck);
  });
  t('liveWire', () => expect(ctxOf(['liveWire']).sparkMult).toBe(2));
  t('crookedPenny', () => {
    const h = ballOf(['crookedPenny']);
    h.game.luck = 100;
    h.fire('pop', 'pop0');
    expect(h.of('score')[0].amount).toBeCloseTo(SCORE.pop * SCORE.scale * 10);
  });
  t('magpieFeather', () => {
    const s = runWith(['magpieFeather']);
    s.mods.luck = 50;
    const tickets = s.tickets;
    nextBall(s);
    finishBall(s, emptyOutcome());
    expect(s.tickets).toBe(tickets + 1);
  });
  t('ninthLife', () => {
    const h = ballOf(['ninthLife']);
    h.game.luck = 100;
    const b = h.sim.spawnBall(18, 10, 0, -5);
    h.fire('trigger', 'outlaneR', { dir: 1, ballId: b.id });
    expect(h.game.bonusMult).toBe(2);
  });
});

describe('Lone charms', () => {
  t('spareBearing', () => expect(freeBalls(runWith(['spareBearing']))).toBe(2));
  t('rubberBands', () => expect(ctxOf(['rubberBands']).ballSave).toBe(BALL.ballSave + 5));
  t('patronSaint', () => {
    const s = runWith(['patronSaint'], 1);
    nextBall(s);
    finishBall(s, emptyOutcome());
    expect(ballsLeft(s)).toBe(1);
    nextBall(s);
    finishBall(s, emptyOutcome());
    expect(ballsLeft(s)).toBe(0);
  });
  t('ironLockbar', () => {
    const snap = snapOf(['ironLockbar']);
    expect(snap.mods.nudgeStrength).toBeCloseTo(1.3);
    expect(snap.ctx.extraWarnings).toBe(2);
  });
  t('solitary', () => {
    expect(ctxOf(['solitary'], 1).payMult).toBe(RUN_HOOK.solitaryMult);
    expect(ctxOf(['solitary'], 3).payMult).toBe(1);
  });
  t('thickSkin', () => {
    const s = runWith(['thickSkin']);
    s.round = roundsIn(s) - 1;
    expect(sentenceActive(s)).toBe(true);
    nextBall(s);
    finishBall(s, emptyOutcome());
    const tickets = s.tickets;
    endRound(s);
    expect(s.tickets).toBe(tickets + RUN_HOOK.thickSkinTickets);
    expect(s.mods.luck).toBe(RUN_HOOK.thickSkinLuck);
  });
});

describe('Hardware', () => {
  for (const id of ['bentNail', 'spareBumper', 'goldFilling', 'thirdArm'])
    t(id, () => {
      const snap = snapOf([id]);
      expect(snap.tags).toContain(`mount:${id}`);
      const h = harnessSnap(snap);
      if (id === 'goldFilling') {
        h.fire('pop', 'pop2');
        expect(h.of('score')[0].amount).toBeCloseTo(SCORE.pop * SCORE.scale * 10);
      }
      if (id === 'thirdArm') expect(h.sim.flippers.some((f) => f.def.id === 'U')).toBe(true);
      if (id === 'spareBumper') expect(h.sim.pops.length).toBe(4);
    });
});

describe('Active charms', () => {
  const press = (charms: string[]) => {
    const h = ballOf(charms);
    h.serve();
    h.game.preStep({ left: false, right: false, plunger: false, pull: -1, nudge: 0, active: 6 });
    h.game.postStep();
    return h;
  };
  t('panicButton', () => {
    const h = press(['panicButton']);
    expect(h.game.ballSaveLeft).toBeGreaterThan(9.9);
    expect(h.game.outcome().charges.panicButton).toBe(0);
  });
  t('pocketWatch', () => {
    const h = press(['pocketWatch']);
    expect(h.of('slowmo')[0].seconds).toBe(4);
    expect(h.game.ctx.actives[0].charges).toBe(1);
  });
  t('crowbar', () => {
    const h = press(['crowbar']);
    expect(h.game.stats.cellBlocks).toBe(1);
  });
  t('twinYolk', () => {
    const h = press(['twinYolk']);
    expect(h.sim.pendingServes).toBe(1);
    const s = runWith(['twinYolk']);
    s.charges.twinYolk = 0;
    nextBall(s);
    finishBall(s, emptyOutcome());
    endRound(s);
    expect(s.charges.twinYolk).toBe(0); // refills per deadline only
  });
});

describe('Legendaries', () => {
  t('wardensKeyring', () => {
    const s = newRun('keyring');
    gainCharm(s, 'wardensKeyring');
    s.bank = s.debt;
    payEarly(s);
    expect(s.keys).toBe(1);
  });
  t('endlessTally', () => expect(ctxOf(['endlessTally']).bonusMaxMult).toBeGreaterThan(100));
  t('glassEye', () => {
    const h = ballOf(['glassEye']);
    h.game.luck = 20;
    const b = h.sim.spawnBall(18, 10, 0, -5);
    h.fire('trigger', 'outlaneR', { dir: 1, ballId: b.id });
    expect(h.game.stats.luckyBounces).toBe(1);
  });
  t('riotShield', () => {
    const h = ballOf(['riotShield'], 1);
    h.game.machine.lockLit = true;
    h.game.machine.locks = h.game.ctx.locksNeeded - 1;
    h.serve();
    h.hole();
    expect(h.game.riotSaveLeft).toBeGreaterThan(20);
    for (let i = 0; i < 4; i++) h.fire('pop', 'pop0');
    h.wait(4);
    const value = h.game.payday + RIOT.paydayPerHit;
    h.chute();
    expect(h.of('payday')[0].amount).toBeCloseTo(value * SCORE.scale * 2);
  });
});

describe('Devil charms', () => {
  t('devilsDue', () => {
    const s = runWith(['devilsDue']);
    expect(s.mods.debtMult).toBe(1.5);
    expect(nextBall(s).ctx.payMult).toBe(2);
    expect(sellValue(s, 'devilsDue')).toBe(0);
    expect(sellCharm(s, 0)).toBe(false);
  });
  t('blackCandle', () => {
    const c = ctxOf(['blackCandle']);
    expect(c.luck).toBe(8);
    expect(c.ballSave).toBe(0);
  });
  t('hellfireRubber', () => {
    const snap = snapOf(['hellfireRubber']);
    expect(snap.mods.kickStrength).toBe(2);
    expect(snap.ctx.shotMult.yard).toBe(5);
    expect(snap.ctx.bonusKeep).toBe(0);
  });
});

describe('every charm', () => {
  it('has a test above', () => {
    const missing = CHARMS.map((c) => c.id).filter((id) => !tested.has(id));
    expect(missing).toEqual([]);
  });
  it('multipliers from different charms multiply', () => {
    expect(ctxOf(['jarOfTeeth', 'hellfireRubber']).shotMult.yard).toBe(15);
  });
});

describe('the vending cabinet', () => {
  it('restocks five charms you do not own, two contraband, no devils or early legendaries', () => {
    for (let i = 0; i < 40; i++) {
      const s = newRun(`shop${i}`);
      gainCharm(s, 'jarOfTeeth');
      restock(s);
      expect(s.shop.charms).toHaveLength(5);
      expect(new Set(s.shop.charms).size).toBe(5);
      expect(s.shop.charms).not.toContain('jarOfTeeth');
      for (const id of s.shop.charms)
        expect(['devil', 'legendary']).not.toContain(charmDef(id).rarity);
      expect(s.shop.contraband.filter((c) => c !== 'oilCan')).toHaveLength(2);
    }
  });
  it('buys with tickets into a free slot; rerolls cost more each time', () => {
    const s = newRun('buy');
    s.tickets = 20;
    s.pocket = 100;
    const id = s.shop.charms[0];
    expect(buyCharm(s, 0)).toBe(true);
    expect(s.charms).toEqual([id]);
    expect(s.tickets).toBe(20 - charmDef(id).cost);
    const c1 = rerollCost(s);
    expect(reroll(s)).toBe(true);
    expect(rerollCost(s)).toBeGreaterThan(c1);
    expect(s.pocket).toBe(100 - c1);
  });
});

describe('contraband', () => {
  const tc = new Set<string>();
  const use = (id: string, target = {}) => {
    const s = runWith(['jarOfTeeth'], 1);
    s.contraband = [id];
    tc.add(id);
    const ok = useContraband(s, 0, target);
    return { s, ok };
  };
  it('Smuggled Ball: +1 ball this round', () => {
    const { s, ok } = use('smuggledBall');
    expect(ok).toBe(true);
    expect(ballsLeft(s)).toBe(2);
  });
  it('Chalk: the next ball starts with the top lanes complete', () => {
    const { s } = use('chalk');
    const h = harnessSnap(nextBall(s));
    h.game.start();
    expect(h.game.stats.laneSets).toBe(1);
    expect(h.game.bonusMult).toBe(2);
  });
  it('Rubber Cement: outlanes plugged next ball only', () => {
    const { s } = use('rubberCement');
    expect(nextBall(s).tags).toContain('plugOutlanes');
    s.phase = 'betweenBalls';
    expect(nextBall(s).tags).not.toContain('plugOutlanes');
  });
  it('Moonshine: +8 luck and a swaying camera next ball', () => {
    const { s } = use('moonshine');
    const c = nextBall(s).ctx;
    expect(c.luck).toBe(CONTRABAND_FX.moonshineLuck);
    expect(c.moonshine).toBe(true);
  });
  it('Lockpick: the next ball starts with one ball locked', () => {
    const { s } = use('lockpick');
    expect(nextBall(s).machine.locks).toBe(1);
  });
  it('Forged Receipt: the next deposit is credited +20%', () => {
    const { s } = use('forgedReceipt');
    s.pocket = 100;
    deposit(s, 100);
    expect(s.bank).toBe(120);
    s.pocket = 100;
    deposit(s, 100);
    expect(s.bank).toBe(220);
  });
  it('Oil Can: +1 level to a chosen shot', () => {
    expect(use('oilCan').ok).toBe(false);
    const { s, ok } = use('oilCan', { shot: 'hole' });
    expect(ok).toBe(true);
    expect(s.shotLevels.hole).toBe(2);
  });
  it('Shiv: destroy a charm for twice its ticket cost', () => {
    const { s, ok } = use('shiv', { charmSlot: 0 });
    expect(ok).toBe(true);
    expect(s.charms).toEqual([]);
    expect(s.tickets).toBe(charmDef('jarOfTeeth').cost * 2);
  });
  it("Bribe: cancels this deadline's Sentence", () => {
    const { s } = use('bribe');
    s.round = roundsIn(s) - 1;
    expect(sentenceActive(s)).toBe(false);
  });
  it('Torn Calendar Page: +1 round, the Sentence moves to the last one', () => {
    const { s } = use('calendar');
    expect(roundsIn(s)).toBe(ECONOMY.roundsPerDeadline + 1);
    s.round = ECONOMY.roundsPerDeadline - 1;
    expect(sentenceActive(s)).toBe(false);
    s.round = ECONOMY.roundsPerDeadline;
    expect(sentenceActive(s)).toBe(true);
    s.contraband = ['calendar'];
    expect(useContraband(s, 0)).toBe(false);
  });
  it('buying needs coins and a free slot', () => {
    const s = newRun('cbuy');
    s.pocket = 1000;
    s.shop.contraband = ['chalk', 'moonshine', 'lockpick'];
    expect(buyContraband(s, 0)).toBe(true);
    expect(buyContraband(s, 0)).toBe(true);
    expect(buyContraband(s, 0)).toBe(false);
    expect(s.contraband).toEqual(['chalk', 'moonshine']);
  });
  it('covers every item', () => {
    for (const id of [
      'smuggledBall',
      'chalk',
      'rubberCement',
      'moonshine',
      'lockpick',
      'forgedReceipt',
      'oilCan',
      'shiv',
      'bribe',
      'calendar',
    ])
      tc.add(id);
    expect(CONTRABAND.map((c) => c.id).filter((id) => !tc.has(id))).toEqual([]);
  });
});

it('pocket and harness sanity', () => {
  expect(harness().game.bonusMult).toBe(1);
});
