/**
 * Headless single-ball runner (physics only, no rules): the bot plays one ball until it drains.
 * Used by the soak, feel tests and bot stats. Node-safe.
 */
import { makeSim } from './scenarios';
import { Bot, type BotSkillName } from './bot';
import type { PinballSim } from '../sim/sim';

export interface BallResult {
  seconds: number;
  cause: string;
  steps: number;
  counts: Record<string, number>;
  tunnelled: number;
  escapes: number;
  rescues: number;
  reserves: number;
  maxStuck: number;
  timedOut: boolean;
}

export interface PlayOptions {
  seed: number;
  skill: BotSkillName;
  /** Safety cap on ball length (seconds). */
  maxSeconds?: number;
  /** Check for tunnelling every N steps (0 = never). */
  tunnelCheckEvery?: number;
  tags?: string[];
  onStep?: (sim: PinballSim) => void;
}

export function playBall(o: PlayOptions): BallResult {
  const sim = makeSim(o.seed, o.tags ?? ['outlanePosts']);
  const bot = new Bot(o.skill, o.seed * 7919 + 13);
  sim.serveBall(false);
  const maxSteps = Math.round((o.maxSeconds ?? 600) * 240);
  const counts: Record<string, number> = {};
  let cause = '';
  let tunnelled = 0;
  let escapes = 0;
  let rescues = 0;
  let reserves = 0;
  let maxStuck = 0;
  let cursor = 0;
  let step = 0;
  const every = o.tunnelCheckEvery ?? 0;
  for (; step < maxSteps; step++) {
    sim.stepOnce(bot.decide(sim));
    o.onStep?.(sim);
    cursor = sim.events.read(cursor, (e) => {
      const k =
        e.type === 'trigger'
          ? `t:${e.id}${e.dir > 0 ? '+' : '-'}`
          : e.type === 'hit'
            ? 'hit'
            : e.type;
      counts[k] = (counts[k] ?? 0) + 1;
      if (e.type === 'drain') cause = e.id;
      else if (e.type === 'escape') escapes++;
      else if (e.type === 'rescue') rescues++;
      else if (e.type === 'reserve') reserves++;
    });
    for (const b of sim.balls) if (b.stuckTime > maxStuck) maxStuck = b.stuckTime;
    if (every && step % every === 0) tunnelled += sim.findTunnelled().length;
    // Held balls (the Hole) are ejected after the hold time; physics-only harness does it here.
    for (const b of sim.balls)
      if (b.state === 'held' && b.heldSteps > sim.cfg.hole.holdTime * 240) sim.ejectHeld(b.id);
    if (cause && sim.ballsInPlay() === 0) break;
  }
  return {
    seconds: step / 240,
    cause,
    steps: step,
    counts,
    tunnelled,
    escapes,
    rescues,
    reserves,
    maxStuck,
    timedOut: step >= maxSteps,
  };
}
