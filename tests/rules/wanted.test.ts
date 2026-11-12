import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { PA, SCORE, WANTED } from '../../src/content/balance';
import { Lamp } from '../../src/rules/types';
import { WANTED_SHOTS, newMachineState } from '../../src/rules/table-game';

/** Mark the ball as past the shooter lane so its clocks run. */
function launch(h: ReturnType<typeof harness>): void {
  h.serve();
  h.fire('trigger', 'shooterExit', { dir: 1 });
}

describe('WANTED', () => {
  it('a shot always carries the bounty and its arrow flashes', () => {
    const h = harness();
    expect(WANTED_SHOTS).toContain(h.game.wanted);
    h.game.wanted = 'chute';
    h.game.refreshLamps();
    expect(h.game.lamps.arrowChute).toBe(Lamp.Fast);
  });

  it('pays a bounty that grows each time, and moves to another shot', () => {
    const h = harness();
    h.game.wanted = 'chute';
    h.chute();
    const first = h.of('wanted');
    expect(first).toHaveLength(1);
    expect(first[0].amount).toBeCloseTo(WANTED.base * SCORE.scale);
    expect(h.game.wanted).not.toBe('chute');
    h.game.wanted = 'hole';
    h.hole();
    const second = h.of('wanted')[1];
    expect(second.n).toBe(2);
    expect(second.amount).toBeCloseTo((WANTED.base + WANTED.step) * SCORE.scale);
    expect(h.game.stats.bounties).toBe(2);
  });

  it('a shot that is not wanted pays no bounty', () => {
    const h = harness();
    h.game.wanted = 'tower';
    h.chute();
    expect(h.of('wanted')).toHaveLength(0);
  });

  it('the poster moves on if nobody claims it', () => {
    const h = harness();
    launch(h);
    const was = h.game.wanted;
    h.wait(WANTED.rotate + 0.1);
    expect(h.game.wanted).not.toBe(was);
    expect(h.of('wanted').at(-1)?.amount).toBe(0);
  });

  it('a tilt stops bounties', () => {
    const h = harness({ tiltSensitivity: 10 });
    h.game.wanted = 'chute';
    for (let i = 0; i < 4; i++) h.fire('nudge');
    expect(h.game.tilted).toBe(true);
    h.chute();
    expect(h.of('wanted')).toHaveLength(0);
  });
});

describe('PA announcements', () => {
  it('the tannoy speaks during a long single ball, then again later', () => {
    let checked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const h = harness({}, {}, seed);
      launch(h);
      h.wait(PA.first + 0.1);
      expect(h.of('pa')).toHaveLength(1);
      expect(h.game.stats.announcements).toBe(1);
      // An add-a-ball pauses the clock until it is back to one ball (never drains here).
      if (h.of('pa')[0].event === 'arrival') {
        expect(h.sim.ballsInPlay()).toBe(2);
        continue;
      }
      expect(h.game.paClock).toBeGreaterThanOrEqual(PA.minGap - 0.1);
      h.wait(PA.maxGap + 0.1);
      expect(h.of('pa').length).toBeGreaterThanOrEqual(2);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every announcement does something', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const h = harness({}, {}, seed);
      launch(h);
      h.wait(PA.first + 0.1);
      const e = h.of('pa')[0].event;
      const g = h.game;
      switch (e) {
        case 'arrival':
          expect(h.sim.ballsInPlay()).toBe(2);
          break;
        case 'frenzy':
          expect(g.frenzyLeft).toBeGreaterThan(0);
          break;
        case 'asleep':
          expect(g.ballSaveLeft).toBeGreaterThan(0);
          break;
        case 'lockup':
          expect(g.machine.lockLit).toBe(true);
          break;
        case 'hurry':
          expect(g.hurryLeft).toBeGreaterThan(0);
          break;
        case 'manhunt':
          expect(g.manhuntLeft).toBeGreaterThan(0);
          break;
      }
    }
  });

  it('FRENZY pays extra on every switch', () => {
    const h = harness();
    h.game.frenzyLeft = PA.seconds;
    const before = h.game.earned;
    h.fire('sling', 'slingL');
    expect(h.game.earned - before).toBeCloseTo((SCORE.sling + PA.frenzyPerHit) * SCORE.scale);
  });

  it('MANHUNT doubles the bounty', () => {
    const h = harness();
    h.game.manhuntLeft = PA.seconds;
    h.game.wanted = 'chute';
    h.chute();
    expect(h.of('wanted')[0].amount).toBeCloseTo(WANTED.base * SCORE.scale * PA.manhuntMult);
  });

  it('stays quiet before the ball is launched', () => {
    const h = harness();
    h.wait(PA.first + 1);
    expect(h.of('pa')).toHaveLength(0);
  });
});

describe('round start', () => {
  it('every round opens with Lockup lit', () => {
    expect(newMachineState().lockLit).toBe(true);
  });
});
