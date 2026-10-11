/**
 * Full-rules headless play: the bot plays BallSessions (sim + TableGame) and whole runs.
 * Used by feel/soak/botstats tools, tests and attract mode logic. Node-safe.
 */
import { Bot, type BotSkillName } from './bot';
import { BallSession, type BallSnapshot } from '../rules/session';
import type { GameEvent } from '../rules/types';
import { defaultBallContext, newMachineState } from '../rules/table-game';

export interface SessionBallResult {
  earned: number;
  seconds: number;
  steps: number;
  tilted: boolean;
  /** Cause of the drain that ended the ball. */
  cause: string;
  saves: number;
  skillShots: number;
  counts: Record<string, number>;
  session: BallSession;
}

export function defaultSnapshot(seed: number): BallSnapshot {
  return {
    seed,
    tags: ['outlanePosts'],
    mods: {},
    machine: newMachineState(),
    ctx: defaultBallContext(),
  };
}

export function playSessionBall(
  snap: BallSnapshot,
  skill: BotSkillName,
  botSeed: number,
  maxSeconds = 900,
): SessionBallResult {
  const counts: Record<string, number> = {};
  let cause = '';
  let saves = 0;
  let skillShots = 0;
  const onEvent = (e: GameEvent) => {
    counts[e.t] = (counts[e.t] ?? 0) + 1;
    if (e.t === 'drain') cause = e.cause;
    else if (e.t === 'ballSaved') saves++;
    else if (e.t === 'skillShot') skillShots++;
  };
  const session = new BallSession(snap, onEvent);
  const bot = new Bot(skill, botSeed);
  bot.skillLane = () => session.game.machine.skillLane;
  const max = maxSeconds * 240;
  while (!session.over && session.steps < max) session.step(bot.decide(session.sim));
  return {
    earned: session.game.earned,
    seconds: session.steps / 240,
    steps: session.steps,
    tilted: session.game.tilted,
    cause: session.over ? cause : 'timeout',
    saves,
    skillShots,
    counts,
    session,
  };
}
