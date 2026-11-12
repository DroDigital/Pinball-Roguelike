/**
 * REP and Ink: REP from earnings, level-ups, the offer (Sleeves, maxed tattoos, the cash
 * fallback), inking, and one test per tattoo and Sleeve proving its effect lands.
 */
import { describe, expect, it } from 'vitest';
import { harness, harnessSnap } from './harness';
import {
  ballPrice,
  buyBalls,
  charmFx,
  debtFor,
  emptyOutcome,
  finishBall,
  interestRate,
  newRun,
  nextBall,
  payScale,
  pickJob,
  startDeadline,
  type RunState,
} from '../../src/rules/run';
import {
  chooseInk,
  gainRep,
  rankOf,
  repRate,
  repToNext,
  rollInk,
  sleeveReady,
} from '../../src/rules/ink';
import { TATTOOS, tattooDef } from '../../src/content/tattoos';
import {
  AWARDS,
  BALL,
  BONUS,
  BRAWL,
  COMBO,
  PA,
  REP,
  RIOT,
  SWEEP,
  WANTED,
} from '../../src/content/balance';
import { SHOT_TYPES } from '../../src/rules/table-game';

/** A run wearing this ink, between balls with `balls` bought. */
function runWith(ink: Record<string, number>, balls = 1): RunState {
  const s = newRun(`ink-${JSON.stringify(ink)}`);
  s.ink = { ...ink };
  pickJob(s, 0);
  s.pocket = 500;
  buyBalls(s, balls);
  return s;
}
const ctxOf = (ink: Record<string, number>, balls = 1) => nextBall(runWith(ink, balls)).ctx;

describe('REP', () => {
  it('levels cost more each time', () => {
    expect(repToNext(1)).toBe(REP.base);
    expect(repToNext(3)).toBe(Math.round(REP.base * REP.growth * REP.growth));
    expect(repToNext(3)).toBeGreaterThan(repToNext(2));
  });

  it('a ball earns REP in deadline-1 coins and queues a pick per level', () => {
    const s = runWith({});
    s.deadline = 2;
    nextBall(s);
    const coins = (repToNext(1) + repToNext(2) + 1) * payScale(s);
    const res = finishBall(s, { ...emptyOutcome(s.machine), earned: coins });
    expect(res.rep).toBeCloseTo(repToNext(1) + repToNext(2) + 1, 6);
    expect(res.levels).toBe(2);
    expect(s.rep.level).toBe(3);
    expect(s.rep.picks).toBe(2);
    expect(s.rep.offer).toHaveLength(REP.offers);
  });

  it('a tilt earns no REP', () => {
    const s = runWith({});
    nextBall(s);
    const res = finishBall(s, { ...emptyOutcome(s.machine), earned: 999, tilted: true });
    expect(res.rep).toBe(0);
    expect(s.rep.level).toBe(1);
  });

  it('the live ball calls the level-up as it is crossed', () => {
    const g = harness({ repLevel: 1, repXp: 0, repRate: 1 });
    g.serve();
    g.fire('chuteMade', 'chute', { value: 30 });
    g.game['payRaw'](REP.base, 9, 20);
    expect(g.of('repLevel').map((e) => e.level)).toEqual([2]);
    expect(g.game.repLevel).toBe(2);
  });

  it('inking takes a rank and rolls the next offer while picks remain', () => {
    const s = runWith({});
    gainRep(s, repToNext(1) + repToNext(2));
    const first = s.rep.offer![0].id;
    expect(chooseInk(s, 0)).toBe(true);
    expect(rankOf(s, first)).toBe(1);
    expect(s.rep.picks).toBe(1);
    expect(s.rep.offer).toHaveLength(REP.offers);
    expect(chooseInk(s, 1)).toBe(true);
    expect(s.rep.picks).toBe(0);
    expect(s.rep.offer).toBeNull();
    expect(chooseInk(s, 0)).toBe(false);
  });

  it('offers never repeat and never include a maxed tattoo', () => {
    const s = runWith({});
    for (const t of TATTOOS) if (t.id !== 'knuckles') s.ink[t.id] = t.ranks.length;
    s.rep.picks = 1;
    rollInk(s);
    const ids = s.rep.offer!.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('knuckles');
    expect(ids.filter((id) => id !== 'knuckles' && id !== 'cash')).toHaveLength(0);
  });

  it('with nothing left, a level pays cash', () => {
    const s = runWith({});
    for (const t of TATTOOS) s.ink[t.id] = t.ranks.length;
    s.rep.picks = 1;
    rollInk(s);
    expect(s.rep.offer).toEqual([
      { id: 'cash', cash: Math.round(debtFor(s.deadline) * REP.cashShare) },
    ]);
    const before = s.pocket;
    chooseInk(s, 0);
    expect(s.pocket).toBe(before + Math.round(debtFor(s.deadline) * REP.cashShare));
  });

  it('a Sleeve is offered once both its tattoos reach the rank, and only then', () => {
    const s = runWith({ crown: 2, knuckles: 1 });
    expect(sleeveReady(s, tattooDef('kingpin'))).toBe(false);
    s.ink.knuckles = 2;
    expect(sleeveReady(s, tattooDef('kingpin'))).toBe(true);
    s.rep.picks = 1;
    rollInk(s);
    expect(s.rep.offer!.map((o) => o.id)).toContain('kingpin');
    chooseInk(
      s,
      s.rep.offer!.findIndex((o) => o.id === 'kingpin'),
    );
    expect(sleeveReady(s, tattooDef('kingpin'))).toBe(false);
    expect(charmFx(s).sleeves).toEqual(['kingpin']);
  });

  it('every Sleeve names two real tattoos', () => {
    for (const t of TATTOOS.filter((x) => x.rarity === 'sleeve')) {
      expect(t.needs, t.id).toHaveLength(2);
      for (const id of t.needs!) expect(tattooDef(id).rarity).not.toBe('sleeve');
    }
  });

  it('the rest of the run is deterministic', () => {
    const a = runWith({});
    const b = runWith({});
    gainRep(a, 500);
    gainRep(b, 500);
    expect(a.rep).toEqual(b.rep);
  });
});

// ------------------------------------------------------------------ one test per tattoo

const tested = new Set<string>();
const t = (id: string, fn: () => void) =>
  it(`${id}: ${tattooDef(id).ranks[0].text}`, () => {
    tested.add(id);
    fn();
  });

describe('tattoos', () => {
  const base = ctxOf({});

  t('knuckles', () => {
    expect(ctxOf({ knuckles: 2 }).payMult).toBeCloseTo(base.payMult * 1.08 * 1.08, 6);
  });
  t('swallow', () => {
    expect(ctxOf({ swallow: 3 }).ballSave).toBe(BALL.ballSave + 9);
  });
  t('star', () => {
    const s = runWith({ star: 2 });
    expect(repRate(s)).toBeCloseTo(1.15 * 1.15, 6);
  });
  t('dots', () => {
    expect(ctxOf({ dots: 3 }).luck).toBe(base.luck + 12);
  });
  t('dollar', () => {
    const plain = runWith({});
    const s = runWith({ dollar: 1 });
    expect(interestRate(s)).toBeCloseTo(interestRate(plain) + 0.03, 6);
    s.deadline = plain.deadline = 3;
    expect(ballPrice(s)).toBe(Math.round(ballPrice(plain) * 0.9));
  });
  t('anchor', () => {
    const c = ctxOf({ anchor: 1 });
    expect(c.shotMult.yard).toBeCloseTo(1.3, 6);
    expect(c.brawlSecondsAdd).toBe(3);
  });
  t('snake', () => {
    const c = ctxOf({ snake: 2 });
    expect(c.shotMult.chute).toBeCloseTo(1.5625, 6);
    expect(c.shotMult.perimeter).toBeCloseTo(1.5625, 6);
  });
  t('clock', () => {
    const c = ctxOf({ clock: 2 });
    expect(c.comboWindow).toBeCloseTo(COMBO.window + 1.5, 6);
    expect(c.comboStep).toBeCloseTo(COMBO.step + 1, 6);
  });
  t('web', () => {
    const c = ctxOf({ web: 1 });
    expect(c.bonusMaxMult).toBe(BONUS.maxMult + 2);
    expect(c.bonusShare).toBeCloseTo(BONUS.share * 1.25, 6);
  });
  t('crown', () => {
    const c = ctxOf({ crown: 2 });
    expect(c.bountyMult).toBeCloseTo(1.69, 6);
    expect(c.mostWantedSooner).toBe(1);
    // A bounty with Crown pays its multiple.
    const plain = harness({});
    const inked = harness({ bountyMult: 1.69 });
    for (const g of [plain, inked]) {
      g.serve();
      g.game.wanted = 'chute';
      g.chute();
    }
    expect(inked.of('wanted')[0].amount).toBeCloseTo(plain.of('wanted')[0].amount * 1.69, 6);
    // MOST WANTED one bounty sooner.
    const g = harness({ mostWantedSooner: 1 });
    g.serve();
    for (let i = 0; i < WANTED.mostWantedEvery - 1; i++) {
      g.game.wanted = 'chute';
      g.chute();
      g.wait(COMBO.window + 1);
    }
    expect(g.game.mostWantedLeft).toBeGreaterThan(0);
  });
  t('wire', () => {
    expect(ctxOf({ wire: 1 }).riotBalls).toBe(RIOT.balls + 1);
    const c = ctxOf({ wire: 3 });
    expect(c.locksNeeded).toBe(1);
    expect(c.paydayMult).toBeCloseTo(1.5, 6);
  });
  t('lightning', () => {
    const c = ctxOf({ lightning: 1 });
    expect(c.modeSecondsMult).toBeCloseTo(1.4, 6);
    const g = harness({ modeSecondsMult: 1.4 });
    g.serve();
    g.fire('spin', 'searchlight', { value: SWEEP.spins });
    expect(g.game.sweepLeft).toBeCloseTo(SWEEP.seconds * 1.4, 1);
  });
  t('eye', () => {
    expect(ctxOf({ eye: 2 }).paGapMult).toBeCloseTo(0.5625, 6);
    const g = harness({ paGapMult: 0.5 });
    expect(g.game.paClock).toBeCloseTo(PA.first * 0.5, 6);
  });
  t('chains', () => {
    const s = runWith({ chains: 1 });
    const g = harnessSnap(nextBall(s));
    expect(g.game.machine.kickback).toBe(true);
    expect(ctxOf({ chains: 2 }).extraBallCapAdd).toBe(1);
    // A second extra ball on one ball.
    const h = harness({ extraBallCapAdd: 1 }, { award: AWARDS.ladder.indexOf('extraBall') });
    h.serve();
    h.game.extraBalls = AWARDS.maxExtraPerBall;
    h.game.machine.awardLit = true;
    h.hole();
    expect(h.game.extraBalls).toBe(AWARDS.maxExtraPerBall + 1);
  });
  t('heart', () => {
    expect(charmFx(runWith({ heart: 1 })).jobRewardMult).toBe(2);
  });
  t('teardrop', () => {
    const c = ctxOf({ teardrop: 1 });
    expect(c.payMult).toBeCloseTo(base.payMult * 1.2, 6);
    expect(c.ballSave).toBe(BALL.ballSave - 4);
  });
  t('skull', () => {
    const s = runWith({ skull: 1 }, 3);
    nextBall(s);
    finishBall(s, emptyOutcome(s.machine));
    nextBall(s);
    finishBall(s, emptyOutcome(s.machine));
    expect(nextBall(s).ctx.payMult).toBeCloseTo(base.payMult * 1.4, 6);
  });
  t('joker', () => {
    expect(ctxOf({ joker: 4 }).twinChance).toBe(1);
    const g = harness({ twinChance: 1 });
    g.serve();
    const before = g.sim.ballsInPlay();
    g.fire('trigger', 'shooterExit', { dir: 1 });
    expect(g.sim.ballsInPlay()).toBe(before + 1);
    expect(g.of('ink').map((e) => e.id)).toEqual(['joker']);
    // Once per ball.
    g.fire('trigger', 'shooterExit', { dir: 1 });
    expect(g.sim.ballsInPlay()).toBe(before + 1);
  });
  t('hourglass', () => {
    const s = runWith({ hourglass: 2 });
    s.rep.level = 10;
    expect(nextBall(s).ctx.payMult).toBeCloseTo(base.payMult * (1 + 0.04 * 10), 6);
  });
  t('barcode', () => {
    const s = runWith({ barcode: 1 });
    expect(charmFx(s).freeBalls).toBe(1);
  });
  t('compass', () => {
    const s = runWith({});
    s.rep.offer = [{ id: 'compass' }];
    s.rep.picks = 1;
    chooseInk(s, 0);
    for (const shot of SHOT_TYPES) expect(s.shotLevels[shot]).toBe(2);
  });
  t('scales', () => {
    const s = runWith({});
    s.rep.offer = [{ id: 'scales' }];
    s.rep.picks = 1;
    chooseInk(s, 0);
    s.deadline = 3;
    startDeadline(s);
    expect(s.debt).toBe(Math.round(debtFor(3) * 0.92));
  });

  // ---------------------------------------------------------------- sleeves
  t('kingpin', () => {
    const g = harness({ sleeves: ['kingpin'] });
    g.serve();
    g.game.wanted = 'chute';
    g.chute();
    expect(g.game.kingpin).toBeCloseTo(REP.kingpinStep, 6);
    expect(g.game.inkMult()).toBeCloseTo(1 + REP.kingpinStep, 6);
    for (let i = 0; i < 30; i++) {
      g.game.wanted = 'chute';
      g.chute();
    }
    expect(g.game.kingpin).toBeCloseTo(REP.kingpinMax, 6);
  });
  t('jailhouseRock', () => {
    const g = harness({ sleeves: ['jailhouseRock'] });
    g.serve();
    expect(g.game.inkMult()).toBe(1);
    g.serve();
    expect(g.game.inkMult()).toBe(REP.multiballMult);
  });
  t('lifeSentence', () => {
    const s = runWith({ lifeSentence: 1 });
    s.rep.level = 9;
    const c = nextBall(s).ctx;
    expect(c.bonusMaxMult).toBeGreaterThan(100);
    expect(c.bonusStart).toBe(1 + Math.floor(9 / REP.lifeSentenceLevels));
  });
  t('luckyDevil', () => {
    const g = harness({ sleeves: ['luckyDevil'], luck: -100 });
    g.serve();
    g.fire('trigger', 'outlaneR', { dir: 1 });
    g.fire('trigger', 'outlaneR', { dir: 1 });
    expect(g.game.stats.luckyBounces).toBe(1);
  });
  t('yardDog', () => {
    const g = harness({ sleeves: ['yardDog'] });
    g.serve();
    g.fire('pop', 'pop1');
    expect(g.game.brawlLeft).toBeCloseTo(BRAWL.seconds, 1);
    const before = g.game.earned;
    g.fire('pop', 'pop1');
    const plain = harness({});
    plain.serve();
    plain.fire('pop', 'pop1');
    expect(g.game.earned - before).toBeCloseTo(plain.game.earned * REP.yardDogMult, 6);
  });
  t('whiteCollar', () => {
    const s = runWith({ whiteCollar: 1 });
    s.bank = 1000;
    nextBall(s);
    const res = finishBall(s, emptyOutcome(s.machine));
    expect(res.interest).toBe(Math.floor(1000 * interestRate(s) * REP.whiteCollarRate));
    expect(s.bank).toBe(1000 + res.interest);
  });
  t('serpent', () => {
    const g = harness({ sleeves: ['serpent'], comboWindow: 99 });
    g.serve();
    g.chute();
    g.chute();
    expect(g.game.levels.chute).toBe(1);
    g.chute();
    expect(g.game.levels.chute).toBe(2);
    for (let i = 0; i < 5; i++) g.chute();
    expect(g.game.levels.chute).toBe(1 + REP.serpentPerBall);
    // This ball only: nothing carries into the run.
    expect(g.game.levelUps).toEqual([]);
  });
  t('deadManWalking', () => {
    const s = runWith({ deadManWalking: 1 }, 2);
    const first = nextBall(s).ctx.payMult;
    finishBall(s, emptyOutcome(s.machine));
    expect(nextBall(s).ctx.payMult).toBeCloseTo(first * REP.deadManMult, 6);
  });

  it('every tattoo and Sleeve has a test', () => {
    for (const d of TATTOOS) expect(tested, d.id).toContain(d.id);
  });
});

describe('ink balance guards', () => {
  it('no tattoo leaves the ball without a ball save below zero', () => {
    expect(ctxOf({ teardrop: 3 }).ballSave).toBe(Math.max(0, BALL.ballSave - 12));
  });

  it('an un-inked run pays exactly as before', () => {
    const s = runWith({});
    const c = nextBall(s).ctx;
    expect(c.payMult).toBeCloseTo(payScale(s), 9);
    expect(c.bountyMult).toBe(1);
    expect(c.sleeves).toEqual([]);
  });
});
