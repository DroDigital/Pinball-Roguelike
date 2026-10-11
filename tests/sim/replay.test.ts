import { describe, expect, it } from 'vitest';
import { BallSession, InputRecording } from '../../src/rules/session';
import { defaultSnapshot } from '../../src/bot/autoplay';
import { Bot } from '../../src/bot/bot';

function playRecorded(seed: number, steps: number) {
  const snap = defaultSnapshot(seed);
  const s = new BallSession(snap);
  const bot = new Bot('expert', seed + 1);
  while (!s.over && s.steps < steps) s.step(bot.decide(s.sim));
  return { snap, s };
}

describe('replay determinism', () => {
  it('re-simulating a recorded ball reproduces the same final state hash', () => {
    for (const seed of [11, 12, 13]) {
      const { snap, s } = playRecorded(seed, 240 * 40);
      const replay = BallSession.replay(snap, s.recording, s.steps);
      expect(replay.steps).toBe(s.steps);
      expect(replay.hash()).toBe(s.hash());
      expect(replay.game.earned).toBeCloseTo(s.game.earned, 10);
    }
  });

  it('recordings survive JSON round-trips', () => {
    const { snap, s } = playRecorded(21, 240 * 20);
    const rec = InputRecording.fromJSON(JSON.parse(JSON.stringify(s.recording)));
    const snap2 = JSON.parse(JSON.stringify(snap));
    expect(BallSession.replay(snap2, rec, s.steps).hash()).toBe(s.hash());
  });

  it('different seeds diverge', () => {
    const a = playRecorded(31, 240 * 10).s.hash();
    const b = playRecorded(32, 240 * 10).s.hash();
    expect(a).not.toBe(b);
  });
});
