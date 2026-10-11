import { describe, expect, it } from 'vitest';
import {
  makeSim,
  holdInput,
  techniqueCradle,
  techniqueLiveCatch,
  techniqueNudgeSave,
  techniquePostPass,
} from '../../src/bot/scenarios';

describe('flippers', () => {
  it('respond on the next physics step and finish the upswing in ~45 ms', () => {
    const sim = makeSim(1);
    for (let i = 0; i < 30; i++) sim.stepOnce(holdInput('none'));
    const f = sim.flippers[0];
    sim.stepOnce(holdInput('left'));
    expect(Math.abs(f.body.getAngularVelocity())).toBeGreaterThan(1);
    let steps = 1;
    while (f.progress < 0.97 && steps < 100) {
      sim.stepOnce(holdInput('left'));
      steps++;
    }
    const ms = (steps / 240) * 1000;
    expect(ms).toBeGreaterThan(35);
    expect(ms).toBeLessThan(56);
  });
});

describe.each(['left', 'right'] as const)('technique (%s flipper)', (side) => {
  it('cradle', () => expect(techniqueCradle(side).ok).toBe(true));
  it('post pass', () => expect(techniquePostPass(side).ok).toBe(true));
  it('live catch', () => expect(techniqueLiveCatch(side).ok).toBe(true));
  it('nudge save', () => expect(techniqueNudgeSave(side).ok).toBe(true));
});
