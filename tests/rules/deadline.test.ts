import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  newRun,
  pickJob,
  buyBalls,
  finishBall,
  deposit,
  endRound,
  settleDeadline,
  nextBall,
  ballPrice,
  costForBalls,
  sentenceActive,
  loanAvailable,
  borrow,
  loanCost,
  canPayEarly,
  payEarly,
  choosePerk,
  acceptBargain,
  hangUp,
  debtFor,
  ballsLeft,
  startDeadline,
  payScale,
  type BallOutcome,
  type RunState,
} from '../../src/rules/run';
import { emptyBallStats } from '../../src/content/jobs';
import { newMachineState } from '../../src/rules/table-game';
import { SENTENCES, sentenceDef } from '../../src/content/sentences';
import { BALL, ECONOMY, PHONE } from '../../src/content/balance';
import { bargainDef } from '../../src/content/phone';

const ball = (earned = 1, tilted = false): BallOutcome => ({
  earned,
  bonus: 0,
  tilted,
  drainCause: 'center',
  machine: newMachineState(),
  stats: emptyBallStats(),
  levelUps: [],
  extraBalls: 0,
  paydayEnd: 0,
  charges: {},
  jailbreak: 'none',
});

/** Play a round with n balls each earning `earned`, then end it. */
function playRound(s: RunState, n = 1, earned = 1): void {
  if (s.phase === 'pickJob') pickJob(s, 0);
  buyBalls(s, n);
  while (ballsLeft(s) > 0) {
    nextBall(s);
    finishBall(s, ball(earned));
  }
  endRound(s);
}

/** Run with a chosen Sentence. */
function withSentence(id: string): RunState {
  const s = newRun(`s-${id}`);
  s.sentences = [id];
  return s;
}

describe('Sentences', () => {
  it('each deadline reveals one Sentence (two on Last Call), active only on its last round', () => {
    const s = newRun('sent');
    expect(s.sentences).toHaveLength(1);
    expect(sentenceActive(s)).toBe(false);
    playRound(s);
    playRound(s);
    expect(s.round).toBe(2);
    expect(sentenceActive(s)).toBe(true);
    const last = newRun('last');
    last.deadline = last.deadlines - 1;
    startDeadline(last);
    expect(last.sentences).toHaveLength(2);
    expect(new Set(last.sentences).size).toBe(2);
  });

  it('later deadlines draw harsher Sentences', () => {
    for (let i = 0; i < 50; i++) {
      const s = newRun(`tier${i}`);
      expect(sentenceDef(s.sentences[0]).tier).toBe(1);
      s.deadline = 6;
      startDeadline(s);
      expect(sentenceDef(s.sentences[0]).tier).toBeGreaterThanOrEqual(2);
    }
  });

  it('ball effects reach the snapshot only in the Sentence round', () => {
    const cases: [string, (snap: ReturnType<typeof nextBall>) => unknown, unknown][] = [
      ['greased', (b) => b.mods.flipperStrength, 0.85],
      ['wideOpen', (b) => b.tags.includes('outlanePosts'), false],
      ['boltedHole', (b) => b.tags.includes('boltedHole'), true],
      ['rustedYard', (b) => b.ctx.shotMult.yard, 0],
      ['shortFuse', (b) => b.ctx.comboWindow, 1.5],
      ['leadBall', (b) => b.mods.ballMass, 1.6],
      ['shakedown', (b) => b.ctx.tiltSensitivity, 2],
      ['lockdown', (b) => b.ctx.lockdown, true],
      ['taxman', (b) => b.ctx.bonusKeep, 0.75],
      ['noMercy', (b) => b.ctx.ballSave, 0],
      ['deadLanes', (b) => b.ctx.deadLanes, true],
      ['blackout', (b) => b.ctx.blackout, true],
    ];
    for (const [id, read, value] of cases) {
      const s = withSentence(id);
      pickJob(s, 0);
      buyBalls(s, 1);
      const early = read(nextBall(s));
      expect(early, id).not.toEqual(value);
      s.round = 2;
      expect(read(nextBall(s)), id).toEqual(value);
    }
  });

  it('Inflation doubles the ball price; Head Count adds 3% per ball lost', () => {
    const s = withSentence('inflation');
    const p = ballPrice(s);
    s.round = 2;
    expect(ballPrice(s)).toBe(p * 2);
    const h = withSentence('headCount');
    h.round = 2;
    pickJob(h, 0);
    buyBalls(h, 1);
    const debt = h.debt;
    nextBall(h);
    expect(finishBall(h, ball()).debtAdded).toBe(Math.round(debt * 0.03));
    expect(h.debt).toBe(debt + Math.round(debt * 0.03));
  });

  it('every Sentence has a working effect', () => {
    for (const d of SENTENCES) expect(Object.keys(d.effect).length, d.id).toBeGreaterThan(0);
  });
});

describe('loans', () => {
  it('borrow up to half the debt; 150% is added to the next debt', () => {
    const s = newRun('loan');
    const cap = Math.floor(s.debt * ECONOMY.loanCap);
    expect(loanAvailable(s)).toBe(cap);
    expect(borrow(s, cap + 50)).toBe(cap);
    expect(s.pocket).toBe(ECONOMY.startCoins + cap);
    expect(loanAvailable(s)).toBe(0);
    expect(s.loanDue).toBe(loanCost(s, cap));
    expect(loanCost(s, 10)).toBe(15);
    deposit(s, s.pocket);
    s.bank = s.debt;
    s.phase = 'deadline';
    expect(settleDeadline(s)).toBe(true);
    hangUp(s);
    expect(s.debt).toBe(debtFor(1) + Math.ceil(cap * 1.5));
    expect(s.loanDue).toBe(0);
  });

  it('no loans on Last Call', () => {
    const s = newRun('nolast');
    s.deadline = s.deadlines - 1;
    startDeadline(s);
    expect(loanAvailable(s)).toBe(0);
    expect(borrow(s, 10)).toBe(0);
  });
});

describe('paying early', () => {
  it('skips the rest of the deadline for 2 tickets per skipped round', () => {
    const s = newRun('early');
    playRound(s);
    expect(s.round).toBe(1);
    expect(canPayEarly(s)).toBe(false);
    s.bank = s.debt + 7;
    expect(canPayEarly(s)).toBe(true);
    expect(payEarly(s)).toBe(true);
    expect(s.tickets).toBe(ECONOMY.payEarlyTickets * 2);
    expect(s.deadline).toBe(1);
    expect(s.bank).toBe(7);
    expect(s.phase).toBe('phone');
  });
});

describe('the phone', () => {
  const paid = (seed: string): RunState => {
    const s = newRun(seed);
    s.bank = s.debt;
    s.phase = 'deadline';
    settleDeadline(s);
    return s;
  };

  it('rings after every paid deadline with perks or a red call', () => {
    let red = 0;
    for (let i = 0; i < 200; i++) {
      const s = paid(`ring${i}`);
      expect(s.phase).toBe('phone');
      if (s.call!.kind === 'red') {
        red++;
        expect(s.call!.offers).toHaveLength(PHONE.bargainOffers);
      } else expect(s.call!.offers).toHaveLength(PHONE.perkOffers);
    }
    expect(red).toBeGreaterThan(25);
    expect(red).toBeLessThan(80);
  });

  it('perks apply permanently, then the next deadline starts', () => {
    let s = paid('perk');
    for (
      let i = 0;
      s.call!.kind !== 'perks' || !s.call!.offers.some((o) => o.id === 'freeBall');
      i++
    )
      s = paid(`perk${i}`);
    const idx =
      s.call!.kind === 'perks' ? s.call!.offers.findIndex((o) => o.id === 'freeBall') : -1;
    expect(choosePerk(s, idx)).toBe(true);
    expect(s.mods.freeBalls).toBe(1);
    expect(s.phase).toBe('pickJob');
    expect(s.deadline).toBe(1);
    pickJob(s, 0);
    expect(costForBalls(s, 2)).toBe(0);
  });

  it('bargains apply both sides and make red calls likelier', () => {
    let s = paid('red');
    const plain = (r: RunState) =>
      r.call!.kind === 'red' ? r.call!.offers.findIndex((o) => !o.startsWith('charm:')) : -1;
    for (let i = 0; plain(s) < 0; i++) s = paid(`red${i}`);
    const idx = plain(s);
    const id = s.call!.kind === 'red' ? s.call!.offers[idx] : '';
    const e = bargainDef(id).effect;
    expect(acceptBargain(s, idx)).toBe(true);
    expect(s.bargains).toEqual([id]);
    expect(s.mods.redAccepted).toBe(1);
    if (e.payMult) expect(s.mods.payMult).toBe(e.payMult);
    if (e.ballSaveAdd) expect(nextBallCtx(s).ballSave).toBe(BALL.ballSave + e.ballSaveAdd);
    if (e.noFreeBall) {
      pickJob(s, 0);
      expect(costForBalls(s, 1)).toBeGreaterThan(0);
    }
  });

  it('red calls can offer devil charms, which take a slot and raise debts', () => {
    let s = paid('devil');
    const devil = (r: RunState) =>
      r.call!.kind === 'red' ? r.call!.offers.indexOf('charm:devilsDue') : -1;
    for (let i = 0; devil(s) < 0; i++) s = paid(`devil${i}`);
    const next = Math.round(debtFor(1) * 1.5);
    expect(acceptBargain(s, devil(s))).toBe(true);
    expect(s.charms).toEqual(['devilsDue']);
    expect(s.debt).toBe(next);
    expect(nextBallCtx(s).payMult).toBeCloseTo(2 * payScale(s));
  });

  it('hanging up gives nothing and moves on', () => {
    let s = paid('hang');
    for (let i = 0; s.call!.kind !== 'red'; i++) s = paid(`hang${i}`);
    const tickets = s.tickets;
    expect(hangUp(s)).toBe(true);
    expect(s.tickets).toBe(tickets);
    expect(s.bargains).toEqual([]);
  });
});

function nextBallCtx(s: RunState) {
  if (s.phase === 'pickJob') pickJob(s, 0);
  if (s.phase === 'buyBalls') buyBalls(s, 1);
  return nextBall(s).ctx;
}

describe('economy invariants', () => {
  it('property: no negative balances, debt math holds through loans, early pays and calls', () => {
    const act = fc.oneof(
      fc.record({
        k: fc.constant('round'),
        n: fc.integer({ min: 1, max: 6 }),
        e: fc.double({ min: 0, max: 80, noNaN: true }),
      }),
      fc.record({ k: fc.constant('dep'), a: fc.integer({ min: -5, max: 400 }) }),
      fc.record({ k: fc.constant('loan'), a: fc.integer({ min: -5, max: 400 }) }),
      fc.record({ k: fc.constant('early') }),
      fc.record({ k: fc.constant('settle') }),
      fc.record({ k: fc.constant('phone'), i: fc.integer({ min: -1, max: 3 }) }),
    );
    fc.assert(
      fc.property(fc.array(act, { maxLength: 60 }), (acts) => {
        const s = newRun('inv');
        for (const a of acts) {
          if (s.phase === 'over') break;
          if (a.k === 'round' && (s.phase === 'pickJob' || s.phase === 'buyBalls')) {
            if (s.phase === 'pickJob') pickJob(s, 0);
            if (!buyBalls(s, a.n)) buyBalls(s, 1);
            while (ballsLeft(s) > 0) {
              nextBall(s);
              finishBall(s, ball(a.e));
            }
            endRound(s);
          } else if (a.k === 'dep') deposit(s, a.a);
          else if (a.k === 'loan') {
            const due = s.loanDue;
            const got = borrow(s, a.a);
            expect(s.loanDue - due).toBe(got > 0 ? loanCost(s, got) : 0);
          } else if (a.k === 'early') payEarly(s);
          else if (a.k === 'settle' && s.phase === 'deadline') settleDeadline(s);
          else if (a.k === 'phone' && s.phase === 'phone') {
            if (a.i < 0) hangUp(s);
            else if (s.call?.kind === 'perks') choosePerk(s, a.i % s.call.offers.length);
            else acceptBargain(s, a.i % 2);
          }
          expect(s.pocket).toBeGreaterThanOrEqual(0);
          expect(s.bank).toBeGreaterThanOrEqual(0);
          expect(
            Number.isInteger(s.pocket) && Number.isInteger(s.bank) && Number.isInteger(s.debt),
          ).toBe(true);
          // The debt never shrinks within a deadline, so the loan cap holds throughout.
          expect(s.loanTaken).toBeLessThanOrEqual(Math.floor(s.debt * ECONOMY.loanCap));
          expect(s.debt).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
