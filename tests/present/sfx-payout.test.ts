/// <reference lib="dom" />
// RewardSounds types against Web Audio; the tools project has no DOM lib of its own.
import { describe, expect, it } from 'vitest';
import { attachBot, defaultSnapshot } from '../../src/bot/autoplay';
import { Bot } from '../../src/bot/bot';
import { SCORE } from '../../src/content/balance';
import { BallSession } from '../../src/rules/session';
import type { GameEvent } from '../../src/rules/types';
import type { Core } from '../../src/present/sfx-core';
import type { SfxName } from '../../src/present/sfx-manifest';
import { PAYOUT_POINTS, crowdGain, payoutTier } from '../../src/present/sfx-payout';
import { RewardSounds } from '../../src/present/sfx-reward';

function recorder(): { core: Core; calls: SfxName[]; clock: { now: number } } {
  const calls: SfxName[] = [];
  const clock = { now: 0 };
  const core = {
    get now() {
      return clock.now;
    },
    mix: {
      get now() {
        return clock.now;
      },
      duck: () => {},
    },
    play: (name: SfxName) => (calls.push(name), true),
    at: (_d: number, name: SfxName) => (calls.push(name), true),
    pan: () => 0,
    stop: () => {},
  } as unknown as Core;
  return { core, calls, clock };
}

const pts = (n: number) => n * SCORE.scale;

describe('payout tiers', () => {
  it('follow the shot value, whatever the economy scale is', () => {
    expect(payoutTier(pts(SCORE.sling))).toBe(0);
    expect(payoutTier(pts(SCORE.inlane))).toBe(0);
    expect(payoutTier(pts(SCORE.pop))).toBe(1);
    expect(payoutTier(pts(SCORE.lane))).toBe(1);
    expect(payoutTier(pts(SCORE.drop))).toBe(1);
    expect(payoutTier(pts(SCORE.outlane))).toBe(2);
    expect(payoutTier(pts(SCORE.hole))).toBe(2);
    expect(payoutTier(pts(SCORE.chute))).toBe(3);
    expect(payoutTier(pts(SCORE.perimeter))).toBe(3);
    expect(payoutTier(pts(SCORE.cellBlock))).toBe(3);
    expect(payoutTier(pts(SCORE.skillShot))).toBe(3);
    expect(payoutTier(pts(SCORE.superSkillShot))).toBe(4);
    // A chained Chute (combo x3) and a levelled Hole climb a tier.
    expect(payoutTier(pts(SCORE.chute * 3))).toBe(4);
    expect(payoutTier(pts(SCORE.hole * 3))).toBe(3);
  });

  it('are ordered', () => {
    const t = PAYOUT_POINTS;
    expect(t.tick).toBeLessThan(t.minor);
    expect(t.minor).toBeLessThan(t.major);
    expect(t.major).toBeLessThan(t.big);
  });

  it('back off as payouts pile up', () => {
    expect(crowdGain(0)).toBe(1);
    expect(crowdGain(2)).toBe(1);
    expect(crowdGain(6)).toBeLessThan(crowdGain(3));
    expect(crowdGain(50)).toBeGreaterThan(0.1);
  });
});

describe('payouts on a real ball', () => {
  // The first expert-bot ball of the soak seed: with the old 1-coin gate it made no payout sound.
  const events: { e: Extract<GameEvent, { t: 'score' }>; combo: number }[] = [];
  const s = new BallSession(defaultSnapshot(500001), (e: GameEvent) => {
    if (e.t === 'score') events.push({ e, combo: s.game.combo.count });
  });
  const bot = new Bot('expert', 977 + 13);
  attachBot(bot, s);
  while (!s.over && s.steps < 240 * 120) s.step(bot.decide(s.sim));

  it('plays a coin or a bell for the shots that matter', () => {
    expect(events.length).toBeGreaterThan(5);
    const r = recorder();
    const reward = new RewardSounds(r.core);
    let major = 0;
    let majorSilent = 0;
    for (const { e, combo } of events) {
      r.clock.now += 0.4;
      const before = r.calls.length;
      reward.score(e.amount, combo, e.amount >= 3 || e.shot === 'jackpot');
      const played = r.calls.length - before;
      if (payoutTier(e.amount) >= 2) {
        major++;
        if (played === 0) majorSilent++;
      }
    }
    expect(majorSilent).toBe(0);
    // The bell ladder is reached on this ball, not just coins.
    expect(r.calls.filter((n) => n.startsWith('bell')).length).toBeGreaterThan(0);
    expect(r.calls.filter((n) => n === 'coin').length).toBeGreaterThan(0);
    expect(major).toBeGreaterThan(0);
  });

  it('keeps a pop bumper rally from rattling', () => {
    const r = recorder();
    const reward = new RewardSounds(r.core);
    // Eight bumper hits a second for five seconds.
    for (let i = 0; i < 40; i++) {
      r.clock.now = i * 0.125;
      reward.score(pts(SCORE.pop), 0, false);
    }
    const coins = r.calls.filter((n) => n === 'coin').length;
    expect(coins).toBeGreaterThan(10);
    expect(coins).toBeLessThanOrEqual(40);
    // Ticks are spaced: never two inside the tick gap.
    r.calls.length = 0;
    for (let i = 0; i < 20; i++) {
      r.clock.now = 10 + i * 0.02;
      reward.score(pts(SCORE.pop), 0, false);
    }
    expect(r.calls.length).toBeLessThanOrEqual(5);
  });
});
