import { describe, expect, it } from 'vitest';
import {
  newRun,
  pickJob,
  buyBalls,
  finishBall,
  postJobs,
  jobTarget,
  debtScale,
  type BallOutcome,
} from '../../src/rules/run';
import { JOB_DEFS, emptyBallStats, jobDef, type BallStats } from '../../src/content/jobs';
import { newMachineState } from '../../src/rules/table-game';
import { JOBS } from '../../src/content/balance';

const ball = (stats: Partial<BallStats> = {}, extra: Partial<BallOutcome> = {}): BallOutcome => ({
  earned: 1,
  bonus: 0,
  tilted: false,
  drainCause: 'center',
  machine: newMachineState(),
  stats: { ...emptyBallStats(), ...stats },
  levelUps: [],
  extraBalls: 0,
  paydayEnd: 0,
  ...extra,
});

describe('jobs', () => {
  it('the ATM posts three distinct jobs, deterministically per seed', () => {
    const a = newRun('jobs');
    const b = newRun('jobs');
    expect(a.phase).toBe('pickJob');
    expect(a.jobOffers).toHaveLength(JOBS.offers);
    expect(new Set(a.jobOffers.map((o) => o.id)).size).toBe(JOBS.offers);
    expect(a.jobOffers).toEqual(b.jobOffers);
  });

  it('no Key Jobs on the first deadline; they appear later', () => {
    let keys = 0;
    for (let i = 0; i < 200; i++) {
      const s = newRun(`k${i}`);
      expect(s.jobOffers.some((o) => jobDef(o.id).key)).toBe(false);
      s.deadline = 3;
      postJobs(s);
      if (s.jobOffers.some((o) => jobDef(o.id).key)) keys++;
    }
    expect(keys).toBeGreaterThan(10);
    expect(keys).toBeLessThan(80);
  });

  it('coin targets follow the debt curve', () => {
    const def = jobDef('bonus');
    expect(jobTarget(def, 0)).toBe(def.target);
    expect(jobTarget(def, 3)).toBe(Math.round(def.target * debtScale(3)));
    expect(jobTarget(jobDef('chute'), 5)).toBe(jobDef('chute').target);
  });

  it('sum jobs accumulate over the round and pay once', () => {
    const s = newRun('sum');
    s.jobOffers = [{ id: 'chute', target: 5 }];
    pickJob(s, 0);
    buyBalls(s, 3);
    expect(finishBall(s, ball({ chutes: 3 })).jobDone).toBeNull();
    const tickets = s.tickets;
    const r = finishBall(s, ball({ chutes: 2 }));
    expect(r.jobDone?.id).toBe('chute');
    expect(s.tickets).toBe(tickets + JOB_DEFS.find((d) => d.id === 'chute')!.reward.tickets!);
    expect(finishBall(s, ball({ chutes: 9 })).jobDone).toBeNull();
    expect(s.stats.jobsDone).toBe(1);
  });

  it('max jobs need it in a single ball', () => {
    const s = newRun('max');
    s.jobOffers = [{ id: 'combo', target: 4 }];
    pickJob(s, 0);
    buyBalls(s, 3);
    finishBall(s, ball({ maxCombo: 3 }));
    finishBall(s, ball({ maxCombo: 3 }));
    expect(s.job!.done).toBe(false);
    finishBall(s, ball({ maxCombo: 4 }));
    expect(s.job!.done).toBe(true);
  });

  it('Key Jobs award a Key; level rewards raise the shot', () => {
    const s = newRun('key');
    s.jobOffers = [{ id: 'kSuper', target: 1 }];
    pickJob(s, 0);
    buyBalls(s, 1);
    finishBall(s, ball({ superPaydays: 1 }));
    expect(s.keys).toBe(1);
    const t = newRun('lvl');
    t.jobOffers = [{ id: 'hole', target: 1 }];
    pickJob(t, 0);
    buyBalls(t, 1);
    finishBall(t, ball({ holes: 1 }));
    expect(t.shotLevels.hole).toBe(2);
  });

  it('extra balls and Hole level-ups carry into the run', () => {
    const s = newRun('xb');
    pickJob(s, 0);
    buyBalls(s, 1);
    finishBall(s, ball({}, { extraBalls: 1, levelUps: ['chute'] }));
    expect(s.ballsThisRound - s.ballsPlayed).toBe(1);
    expect(s.shotLevels.chute).toBe(2);
  });
});
