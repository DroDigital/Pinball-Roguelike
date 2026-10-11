import { PinballSim, emptyInput, type SimInput } from '../../src/sim/sim';
import { makeSimConfig, type SimMods } from '../../src/sim/sim-config';
import { TABLE } from '../../src/content/table';
import type { P2 } from '../../src/core/math';

export function newSim(
  seed = 1,
  tags: string[] = ['outlanePosts'],
  mods: Partial<SimMods> = {},
): PinballSim {
  return new PinballSim({ table: TABLE, config: makeSimConfig(mods), tags: new Set(tags), seed });
}

/** Run n steps with a fixed input, recording the first ball's path. */
export function run(
  sim: PinballSim,
  steps: number,
  input: SimInput = emptyInput(),
  path?: P2[],
): void {
  for (let i = 0; i < steps; i++) {
    sim.stepOnce(input);
    if (path && sim.balls[0]) path.push([sim.balls[0].x, sim.balls[0].y]);
  }
}
