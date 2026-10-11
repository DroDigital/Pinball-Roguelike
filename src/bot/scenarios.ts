/**
 * Scripted physics scenarios: the building blocks of the feel tests, technique tests and the
 * bot's shot calibration. Node-safe and deterministic.
 */
import { PinballSim, emptyInput, type SimInput } from '../sim/sim';
import { makeSimConfig, type SimMods } from '../sim/sim-config';
import { TABLE } from '../content/table';
import type { TableDef } from '../sim/table-def';
import type { SimEvent } from '../sim/events';

export type Side = 'left' | 'right';
export type ShotOutcome =
  | 'chute'
  | 'perimeter'
  | 'hole'
  | 'cellblock'
  | 'yard'
  | 'lanes'
  | 'drain'
  | 'flipper'
  | 'none';

export function makeSim(
  seed = 1,
  tags: string[] = ['outlanePosts'],
  mods: Partial<SimMods> = {},
  table: TableDef = TABLE,
): PinballSim {
  return new PinballSim({ table, config: makeSimConfig(mods), tags: new Set(tags), seed });
}

export function holdInput(side: Side | 'both' | 'none'): SimInput {
  const i = emptyInput();
  i.left = side === 'left' || side === 'both';
  i.right = side === 'right' || side === 'both';
  return i;
}

export function stepN(sim: PinballSim, n: number, input: SimInput): void {
  for (let i = 0; i < n; i++) sim.stepOnce(input);
}

/** Flipper runtime for a side (main flippers only). */
export function flipperOf(sim: PinballSim, side: Side) {
  return sim.flippers.find((f) => f.def.id === (side === 'left' ? 'L' : 'R'))!;
}

/**
 * Put a ball in the cradle of a held flipper and let it settle.
 * Returns false if it didn't settle (which itself is a failure of cradling).
 */
export function cradle(sim: PinballSim, side: Side, maxSteps = 2400): boolean {
  const f = flipperOf(sim, side);
  const hold = holdInput(side);
  stepN(sim, 20, hold);
  const dx = side === 'left' ? 0.9 : -0.9;
  sim.spawnBall(f.def.x + dx, f.def.y + 2.2, 0, 0);
  for (let i = 0; i < maxSteps; i++) {
    sim.stepOnce(hold);
    const b = sim.balls[0];
    if (!b || b.state !== 'field') return false;
    if (i > 60 && Math.abs(b.vx) + Math.abs(b.vy) < 0.05) return true;
  }
  return false;
}

/**
 * Step with `inputAt(step)` until a shot outcome is decided or time runs out.
 * A Perimeter counts when the ball enters an orbit going up and then crosses the arch top.
 */
export function watchOutcome(
  sim: PinballSim,
  inputAt: (step: number) => SimInput,
  maxSteps: number,
): { outcome: ShotOutcome; steps: number } {
  let cursor = sim.events.head;
  let outcome: ShotOutcome = 'none';
  let perimArmed = 0;
  let steps = 0;
  const on = (e: SimEvent) => {
    if (outcome !== 'none') return;
    switch (e.type) {
      case 'chuteMade':
        outcome = 'chute';
        break;
      case 'holeCapture':
        outcome = 'hole';
        break;
      case 'drop':
        outcome = 'cellblock';
        break;
      case 'pop':
        outcome = 'yard';
        break;
      case 'drain':
        outcome = 'drain';
        break;
      case 'trigger':
        if ((e.id === 'perimL' || e.id === 'perimR') && e.dir > 0) perimArmed = e.step;
        else if (
          (e.id === 'perimLTop' || e.id === 'perimRTop') &&
          e.dir > 0 &&
          perimArmed &&
          e.step - perimArmed < 480
        )
          outcome = 'perimeter';
        else if (/^lane[ABC]$/.test(e.id)) outcome = 'lanes';
        break;
    }
  };
  for (; steps < maxSteps && outcome === 'none'; steps++) {
    sim.stepOnce(inputAt(steps));
    cursor = sim.events.read(cursor, on);
  }
  return { outcome, steps };
}

/**
 * From a settled cradle: drop the flipper, wait `delay` steps, flip and hold for `hold` steps.
 */
export function shotFromCradle(
  sim: PinballSim,
  side: Side,
  delay: number,
  hold = 48,
  maxSteps = 900,
): ShotOutcome {
  const none = holdInput('none');
  const flip = holdInput(side);
  return watchOutcome(sim, (s) => (s >= delay && s < delay + hold ? flip : none), maxSteps).outcome;
}
