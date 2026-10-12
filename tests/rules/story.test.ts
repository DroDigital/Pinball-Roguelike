import { describe, expect, it } from 'vitest';
import {
  answerKnock,
  ballPrice,
  buyBalls,
  canHelp,
  cellmate,
  emptyOutcome,
  endRound,
  finishBall,
  freeBalls,
  gainCharm,
  interestRate,
  jailbreakLit,
  lastCall,
  newRun,
  nextBall,
  pickJob,
  roundsIn,
  sentenceActive,
  settleDeadline,
  startDeadline,
  type RunState,
} from '../../src/rules/run';
import { rerollCost } from '../../src/rules/shop';
import { BALL, COMBO, JAILBREAK, NEIGHBOR, SCORE, SECRET } from '../../src/content/balance';
import { INMATES } from '../../src/content/inmates';
import { emptyInput } from '../../src/sim/sim';
import { harness } from './harness';

const atDeadline = (s: RunState) => s.phase === 'deadline';

/** Play out a round of the run with empty balls. */
function playRound(s: RunState): void {
  pickJob(s, 0);
  buyBalls(s, 1);
  nextBall(s);
  finishBall(s, emptyOutcome());
  endRound(s);
}

describe('inmates', () => {
  it('every inmate starts a valid run', () => {
    for (const d of INMATES) {
      const s = newRun('INMATE', { inmate: d.id });
      expect(s.inmate).toBe(d.id);
      expect(s.charms.length).toBeLessThanOrEqual(s.mods.charmSlots);
    }
  });

  it('the Embezzler starts with the Piggy Bank and a Forged Receipt; rerolls cost double', () => {
    const base = newRun('E');
    const s = newRun('E', { inmate: 'embezzler' });
    expect(s.charms).toContain('piggyBank');
    expect(s.contraband).toContain('forgedReceipt');
    expect(rerollCost(s)).toBe(rerollCost(base) * 2);
  });

  it('the Brawler hits harder and tilts sooner', () => {
    const s = newRun('B', { inmate: 'brawler' });
    expect(s.charms).toContain('jarOfTeeth');
    pickJob(s, 0);
    buyBalls(s, 1);
    const snap = nextBall(s);
    expect(snap.mods.flipperStrength).toBeCloseTo(1.1);
    expect(snap.ctx.tiltSensitivity).toBe(2);
  });

  it('the Lifer gets a free ball every round but owes 20% more', () => {
    const s = newRun('L', { inmate: 'lifer' });
    expect(freeBalls(s)).toBe(2);
    expect(s.debt).toBe(90);
  });

  it('the Escape Artist starts with a Key and a Lockpick, and only 4 charm slots', () => {
    const s = newRun('X', { inmate: 'escapeArtist' });
    expect(s.keys).toBe(1);
    expect(s.contraband).toContain('lockpick');
    expect(s.mods.charmSlots).toBe(4);
  });

  it('the Snitch gets 4 perks, never a red call, and no knocks', () => {
    for (let i = 0; i < 20; i++) {
      const s = newRun(`S${i}`, { inmate: 'snitch' });
      s.mods.redAccepted = 5;
      for (let d = 0; d < 3; d++) {
        while (s.phase !== 'deadline') {
          playRound(s);
          expect(s.neighbor.knock).toBeNull();
        }
        s.bank = s.debt;
        settleDeadline(s);
        expect(s.call?.kind).toBe('perks');
        if (s.call?.kind === 'perks') expect(s.call.offers).toHaveLength(4);
        s.call = null;
        s.phase = 'pickJob';
        startDeadline(s);
      }
      expect(s.neighbor.asked).toBe(0);
    }
  });
});

describe('Hard Time', () => {
  it('stacks every level up to the chosen one', () => {
    const at = (hardTime: number) => newRun('HT', { hardTime });
    expect(at(1).debt).toBe(94);
    expect(at(8).debt).toBe(188);
    const s2 = at(2);
    s2.round = 1;
    expect(sentenceActive(s2)).toBe(true);
    const s0 = at(0);
    s0.round = 1;
    expect(sentenceActive(s0)).toBe(false);
    const s3 = at(3);
    pickJob(s3, 0);
    buyBalls(s3, 1);
    expect(nextBall(s3).ctx.ballSave).toBeCloseTo(BALL.ballSave / 2);
    expect(at(3).shop.charms).toHaveLength(5);
    expect(at(4).shop.charms).toHaveLength(4);
    expect(interestRate(at(4))).toBeCloseTo(0.1);
    expect(interestRate(at(5))).toBeCloseTo(0.05);
    expect(ballPrice(at(5))).toBe(3);
    expect(ballPrice(at(6))).toBe(5);
    expect(at(6).mods.redChanceAdd).toBe(0);
    expect(at(7).mods.redChanceAdd).toBeCloseTo(0.15);
  });
});

describe('the neighbor', () => {
  it('knocks between rounds (never in deadline 1), at most once per deadline', () => {
    let knocks = 0;
    for (let i = 0; i < 40; i++) {
      const s = newRun(`N${i}`);
      while (s.phase !== 'deadline') {
        playRound(s);
        expect(s.neighbor.knock).toBeNull();
      }
      s.bank = s.debt;
      settleDeadline(s);
      // Hang up and start deadline 2.
      s.call = null;
      startDeadline(s);
      let here = 0;
      while (!atDeadline(s)) {
        playRound(s);
        if (s.neighbor.knock) {
          here++;
          answerKnock(s, false);
        }
      }
      expect(here).toBeLessThanOrEqual(1);
      knocks += here;
    }
    // Two round breaks per deadline at 30% each, one knock at most: ~51%.
    expect(knocks).toBeGreaterThan(10);
    expect(knocks).toBeLessThan(32);
  });

  it('helping pays from the Pocket, then the Bank, and delivers the offer', () => {
    const s = newRun('H');
    s.pocket = 3;
    s.bank = 20;
    s.neighbor.asked = 1;
    s.neighbor.knock = { ask: 'coins', amount: 10, offer: 'key' };
    expect(canHelp(s)).toBe(true);
    expect(answerKnock(s, true)).toBe(true);
    expect(s.pocket).toBe(0);
    expect(s.bank).toBe(13);
    expect(s.keys).toBe(1);
    expect(s.neighbor.helped).toBe(1);
    expect(s.neighbor.knock).toBeNull();
  });

  it("can't help without what they ask for; refusing is always possible", () => {
    const s = newRun('R');
    s.tickets = 1;
    s.neighbor.knock = { ask: 'tickets', amount: NEIGHBOR.ticketsAsked, offer: 'tickets' };
    expect(canHelp(s)).toBe(false);
    expect(answerKnock(s, true)).toBe(false);
    expect(answerKnock(s, false)).toBe(true);
    expect(s.tickets).toBe(1);
    expect(s.neighbor.helped).toBe(0);
  });

  it('giving a charm removes it; the tip lights the Tunnel on every later ball', () => {
    const s = newRun('T', { inmate: 'brawler' });
    s.neighbor.knock = { ask: 'charm', amount: 1, charm: 'jarOfTeeth', offer: 'tip' };
    expect(answerKnock(s, true)).toBe(true);
    expect(s.charms).not.toContain('jarOfTeeth');
    expect(s.neighbor.tip).toBe(true);
    pickJob(s, 0);
    buyBalls(s, 1);
    expect(nextBall(s).ctx.tunnel).toBe(true);
  });

  it("the neighbor's contraband fits the slot a Stash Box adds", () => {
    const s = newRun('SB');
    gainCharm(s, 'stashBox');
    s.contraband = ['chalk', 'bribe'];
    s.tickets = 5;
    s.neighbor.knock = { ask: 'tickets', amount: 2, offer: 'contraband', item: 'moonshine' };
    expect(answerKnock(s, true)).toBe(true);
    expect(s.contraband).toEqual(['chalk', 'bribe', 'moonshine']);
    expect(s.tickets).toBe(3);
  });

  it('Cellmate needs enough asks, every one helped', () => {
    const s = newRun('C');
    s.neighbor.asked = NEIGHBOR.cellmateMinAsks;
    s.neighbor.helped = NEIGHBOR.cellmateMinAsks;
    expect(cellmate(s)).toBe(true);
    s.neighbor.helped--;
    expect(cellmate(s)).toBe(false);
    s.neighbor.asked = s.neighbor.helped = 1;
    expect(cellmate(s)).toBe(false);
  });
});

describe('endings', () => {
  const finalDeadline = (s: RunState) => {
    s.deadline = s.deadlines - 1;
    s.phase = 'deadline';
    s.bank = s.debt = 100;
  };

  it('clearing deadline 8 is Paid in Full, or Cellmate if you always helped', () => {
    const a = newRun('P');
    finalDeadline(a);
    expect(settleDeadline(a)).toBe(true);
    expect(a.result).toBe('paidInFull');
    expect(a.phase).toBe('over');
    const b = newRun('P');
    b.neighbor.asked = b.neighbor.helped = 4;
    finalDeadline(b);
    settleDeadline(b);
    expect(b.result).toBe('cellmate');
  });

  it('Endless never ends on deadline 8 and has no Last Call', () => {
    const s = newRun('EN', { endless: true });
    s.deadline = 7;
    expect(lastCall(s)).toBe(false);
    s.phase = 'deadline';
    s.bank = s.debt;
    settleDeadline(s);
    expect(s.phase).toBe('phone');
    expect(s.deadline).toBe(8);
  });

  it('JAILBREAK is lit on Last Call with 3 Keys; escaping is Breakout, the Keys are spent', () => {
    const s = newRun('J');
    s.deadline = s.deadlines - 1;
    startDeadline(s);
    s.keys = JAILBREAK.keys - 1;
    expect(jailbreakLit(s)).toBe(false);
    s.keys = JAILBREAK.keys;
    expect(jailbreakLit(s)).toBe(true);
    pickJob(s, 0);
    buyBalls(s, 2);
    expect(nextBall(s).ctx.jailbreak).toBe(true);
    finishBall(s, { ...emptyOutcome(), jailbreak: 'failed' });
    expect(s.keys).toBe(0);
    expect(s.phase).toBe('betweenBalls');
    expect(s.stats.jailbreaks).toBe(1);
    s.keys = JAILBREAK.keys;
    nextBall(s);
    finishBall(s, { ...emptyOutcome(), jailbreak: 'escaped' });
    expect(s.phase).toBe('over');
    expect(s.result).toBe('breakout');
  });

  it('JAILBREAK is not lit while a Sentence bolts the Hole', () => {
    const s = newRun('JB');
    s.deadline = s.deadlines - 1;
    startDeadline(s);
    s.keys = JAILBREAK.keys;
    s.sentences = ['boltedHole'];
    s.round = roundsIn(s) - 1;
    expect(jailbreakLit(s)).toBe(false);
    s.round = 0;
    expect(jailbreakLit(s)).toBe(true);
  });
});

describe('the Tunnel (secret shot)', () => {
  const knock = (h: ReturnType<typeof harness>, order: number[]) => {
    for (const i of order) {
      h.sim.knockDrop(i);
      h.game.postStep();
    }
  };

  it('pays when the Cell Block falls top to bottom, once tipped', () => {
    const h = harness({ tunnel: true });
    knock(h, [2, 1, 0]);
    const t = h.of('tunnel');
    expect(t).toHaveLength(1);
    expect(t[0].amount).toBeCloseTo(SECRET.tunnel * SCORE.scale);
    expect(h.game.stats.tunnels).toBe(1);
  });

  it('nothing for another order, or without the tip', () => {
    const h = harness({ tunnel: true });
    knock(h, [0, 1, 2]);
    expect(h.of('tunnel')).toHaveLength(0);
    const u = harness({ tunnel: false });
    knock(u, [2, 1, 0]);
    expect(u.of('tunnel')).toHaveLength(0);
  });

  it('two targets falling in the clearing step do not spoil the next bank', () => {
    const h = harness({ tunnel: true });
    h.sim.knockDrop(2);
    h.game.postStep();
    // The Crowbar (or one hit across the gap) drops the last two in the same step.
    h.sim.knockDrop(0);
    h.sim.knockDrop(1);
    h.game.postStep();
    h.sim.stepOnce(emptyInput());
    h.game.postStep();
    knock(h, [2, 1, 0]);
    expect(h.of('tunnel')).toHaveLength(1);
  });

  it('a bank that starts part-down cannot be a Tunnel', () => {
    const h = harness({ tunnel: true }, { drops: [true, true, false] });
    knock(h, [1, 0]);
    expect(h.of('tunnel')).toHaveLength(0);
  });
});

describe('JAILBREAK', () => {
  const start = () => {
    const h = harness({ jailbreak: true }, { awardLit: false });
    h.serve();
    h.sim.clearBalls();
    h.hole();
    return h;
  };
  const perim = (h: ReturnType<typeof harness>, side: 'L' | 'R') => {
    h.fire('trigger', `perim${side}`, { dir: 1 });
    h.fire('trigger', `perim${side}Top`, { dir: 1 });
  };
  const gap = () => COMBO.window + 0.1;

  it('a tilted ball falling into the Hole does not start it', () => {
    const h = harness({ jailbreak: true }, { awardLit: false });
    h.serve();
    while (!h.game.tilted) h.fire('nudge');
    h.sim.clearBalls();
    h.hole();
    expect(h.game.jailbreak).toBe(false);
    expect(h.game.outcome().jailbreak).toBe('none');
  });

  it('starts at the Hole: four balls, every shot lit', () => {
    const h = start();
    expect(h.game.jailbreak).toBe(true);
    expect(h.of('jailbreak')[0].phase).toBe('start');
    expect(h.game.jbLit.size).toBe(5);
    expect(h.game.lamps.arrowChute).toBe(3);
    h.wait(8);
    const out = h.sim.balls.length + h.sim.pendingServes;
    expect(out).toBeGreaterThanOrEqual(JAILBREAK.balls - 1);
  });

  it('a made shot goes dark until every shot is made; the posts drop at 3', () => {
    const h = start();
    h.chute();
    expect(h.game.jbShots).toBe(1);
    h.wait(gap());
    h.chute();
    expect(h.game.jbShots).toBe(1);
    perim(h, 'L');
    h.wait(gap());
    expect(h.sim.tags.has('outlanePosts')).toBe(true);
    perim(h, 'R');
    expect(h.game.jbShots).toBe(3);
    expect(h.sim.tags.has('outlanePosts')).toBe(false);
    expect(h.of('jailbreak').some((e) => e.phase === 'posts')).toBe(true);
    h.wait(gap());
    h.hole();
    h.wait(gap());
    h.sim.knockDrop(0);
    h.game.postStep();
    expect(h.game.jbShots).toBe(5);
    // All five made: every shot relights.
    expect(h.game.jbLit.size).toBe(5);
  });

  it('twelve lit shots and you are out', () => {
    const h = start();
    for (let i = 0; i < JAILBREAK.shotsToEscape && !h.game.over; i++) {
      if (i % 5 === 0) h.chute();
      else if (i % 5 === 1) perim(h, 'L');
      else if (i % 5 === 2) perim(h, 'R');
      else if (i % 5 === 3) h.hole();
      else {
        h.sim.stepOnce(emptyInput());
        h.sim.knockDrop(i % 3);
        h.game.postStep();
      }
      h.wait(gap());
    }
    expect(h.game.jbShots).toBe(JAILBREAK.shotsToEscape);
    expect(h.game.over).toBe(true);
    expect(h.game.outcome().jailbreak).toBe('escaped');
    expect(h.of('jailbreak').map((e) => e.phase)).toContain('glass');
  });

  it('every ball drained: caught, back to paying', () => {
    const h = start();
    h.chute();
    h.wait(JAILBREAK.ballSave + 12);
    h.sim.clearBalls();
    h.drain();
    expect(h.game.over).toBe(true);
    expect(h.game.outcome().jailbreak).toBe('failed');
    expect(h.of('jailbreak').at(-1)?.phase).toBe('failed');
  });
});
