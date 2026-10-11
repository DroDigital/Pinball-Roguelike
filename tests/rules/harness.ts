/**
 * Rules test harness: a real PinballSim (never stepped) feeding hand-made SimEvents into a
 * TableGame, so scoring rules are tested without physics noise.
 */
import { makeSim } from '../../src/bot/scenarios';
import {
  TableGame,
  defaultBallContext,
  newMachineState,
  type BallContext,
  type MachineState,
} from '../../src/rules/table-game';
import type { GameEvent } from '../../src/rules/types';
import type { SimEventType } from '../../src/sim/events';
import { emptyInput, type PinballSim } from '../../src/sim/sim';
import type { SimMods } from '../../src/sim/sim-config';
import type { BallSnapshot } from '../../src/rules/session';

export interface Harness {
  sim: PinballSim;
  game: TableGame;
  events: GameEvent[];
  /** Push one sim event and let the rules consume it. */
  fire(
    type: SimEventType,
    id?: string,
    opts?: { ballId?: number; dir?: number; value?: number },
  ): void;
  /** Advance rules time by `seconds` (no physics). */
  wait(seconds: number): void;
  /** Events of one kind emitted so far. */
  of<T extends GameEvent['t']>(t: T): Extract<GameEvent, { t: T }>[];
  /** A held ball sitting in the Hole, captured. */
  hole(): number;
  chute(): void;
  /** Put a ball on the field and mark the ball as launched. */
  serve(): number;
  drain(cause?: string): void;
  clearCellBlock(): void;
}

/** Harness for a ball built by the run (tags, sim mods and context from charms etc.). */
export function harnessSnap(snap: BallSnapshot): Harness {
  return harness(snap.ctx, snap.machine, snap.seed, snap.tags, snap.mods);
}

export function harness(
  ctx: Partial<BallContext> = {},
  machine: Partial<MachineState> = {},
  seed = 1,
  tags: string[] = ['outlanePosts'],
  mods: Partial<SimMods> = {},
): Harness {
  const sim = makeSim(seed, tags, mods);
  const events: GameEvent[] = [];
  const game = new TableGame(
    sim,
    { ...defaultBallContext(), ...ctx },
    { ...newMachineState(), ...machine },
    (e) => events.push(e),
  );
  const fire: Harness['fire'] = (type, id = '', o = {}) => {
    sim.events.push(type, id, o.ballId ?? -1, o.dir ?? 0, o.value ?? 0, 9, 20, sim.step);
    game.postStep();
  };
  const h: Harness = {
    sim,
    game,
    events,
    fire,
    wait(seconds) {
      const n = Math.round(seconds * 240);
      for (let i = 0; i < n; i++) {
        sim.step++;
        game.postStep();
      }
    },
    of: <T extends GameEvent['t']>(t: T) =>
      events.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t),
    hole() {
      const b = sim.spawnHeld();
      fire('holeCapture', 'hole', { ballId: b.id });
      return b.id;
    },
    chute() {
      fire('chuteMade', 'chute', { value: 30 });
    },
    serve() {
      const b = sim.spawnBall(9, 20);
      fire('served', '', { ballId: b.id });
      return b.id;
    },
    drain(cause = 'center') {
      fire('drain', cause);
    },
    clearCellBlock() {
      // Apply any pending drop reset (the sim does it after a step), then knock them down;
      // knockDrop emits the drop event like a real hit.
      if (sim.dropStates().some((u) => !u)) sim.stepOnce(emptyInput());
      for (let i = 0; i < 3; i++) {
        sim.knockDrop(i);
        game.postStep();
      }
    },
  };
  return h;
}
