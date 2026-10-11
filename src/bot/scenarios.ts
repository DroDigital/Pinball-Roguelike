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

// ------------------------------------------------------------------ techniques

export interface TechniqueResult {
  ok: boolean;
  /** Number of input timings (of those searched) that worked. */
  windows: number;
  searched: number;
  best?: Record<string, number>;
}

function isCradled(sim: PinballSim, side: Side): boolean {
  const f = flipperOf(sim, side);
  const b = sim.balls.find((x) => x.state === 'field');
  if (!b) return false;
  const dx = (b.x - f.def.x) * (side === 'left' ? 1 : -1);
  const r = Math.hypot(dx, b.y - f.def.y);
  return f.progress > 0.9 && r < f.def.len * 0.6 && Math.hypot(b.vx, b.vy) < 0.2;
}

/** Cradle: a ball fed from the inlane onto a held flipper comes to rest at the base. */
export function techniqueCradle(side: Side): TechniqueResult {
  const sim = makeSim(11);
  const hold = holdInput(side);
  stepN(sim, 20, hold);
  const x = side === 'left' ? 2.25 : 18.4 - 2.25;
  sim.spawnBall(x, 11.6, 0, -6);
  for (let i = 0; i < 240 * 4; i++) {
    sim.stepOnce(hold);
    if (i > 60 && isCradled(sim, side)) return { ok: true, windows: 1, searched: 1 };
  }
  return { ok: false, windows: 0, searched: 1 };
}

/**
 * Post pass: from a cradle, drop the flipper, then tap it so the ball bounces across to the
 * other flipper, which holds and traps it.
 */
export function techniquePostPass(from: Side): TechniqueResult {
  const to: Side = from === 'left' ? 'right' : 'left';
  let windows = 0;
  let searched = 0;
  let best: Record<string, number> | undefined;
  for (let d = 10; d <= 150; d += 4) {
    for (let h = 3; h <= 12; h += 3) {
      searched++;
      const sim = makeSim(12);
      if (!cradle(sim, from)) continue;
      const holdTo = holdInput(to);
      const tap = holdInput('both');
      for (let i = 0; i < 240 * 3; i++) {
        sim.stepOnce(i >= d && i < d + h ? tap : holdTo);
        if (!sim.balls.length) break;
      }
      if (isCradled(sim, to)) {
        windows++;
        best ??= { delay: d, tap: h };
      }
    }
  }
  return { ok: windows > 0, windows, searched, best };
}

/**
 * Live catch: a ball dropping fast onto a raised flipper bounces; dropping the flipper as it
 * lands and raising it again moments later kills the rebound and traps it in the cradle.
 * ok = some timing gives a rebound under 40% of the naive hold and ends cradled.
 */
export function techniqueLiveCatch(
  side: Side,
): TechniqueResult & { naiveRebound: number; bestRebound: number } {
  const x = flipperOf(makeSim(13), side).def.x + (side === 'left' ? 1.6 : -1.6);
  const trial = (release: number, down: number) => {
    const sim = makeSim(13);
    stepN(sim, 20, holdInput(side));
    sim.spawnBall(x, 15, 0, -22);
    const up = holdInput(side);
    const none = holdInput('none');
    let touched = false;
    let peak = -1;
    let cursor = sim.events.head;
    for (let i = 0; i < 240 * 3; i++) {
      sim.stepOnce(release >= 0 && i >= release && i < release + down ? none : up);
      cursor = sim.events.read(cursor, (e) => {
        if (e.type === 'flipperHit') touched = true;
      });
      const b = sim.balls[0];
      if (!b) return { rebound: 99, cradled: false };
      if (touched && i < 300) peak = Math.max(peak, b.y);
    }
    const f = flipperOf(sim, side);
    return { rebound: peak - (f.def.y + 1.2), cradled: isCradled(sim, side) };
  };
  const naiveRebound = trial(-1, 0).rebound;
  let windows = 0;
  let searched = 0;
  let bestRebound = 99;
  let best: Record<string, number> | undefined;
  for (let d = 70; d <= 100; d += 1) {
    for (const h of [4, 8, 12, 18, 26]) {
      searched++;
      const r = trial(d, h);
      if (r.cradled && r.rebound < naiveRebound * 0.4) {
        windows++;
        if (r.rebound < bestRebound) {
          bestRebound = r.rebound;
          best = { release: d, down: h };
        }
      }
    }
  }
  return { ok: windows > 0, windows, searched, best, naiveRebound, bestRebound };
}

/** Nudge save: a ball dropping toward the outlane is bumped back toward the inlane. */
export function techniqueNudgeSave(side: Side): TechniqueResult & { naiveDrains: boolean } {
  // Spawn just above the outer shoulder of the outlane post, drifting outward.
  const post = TABLE.posts.find((p) => p.id === (side === 'left' ? 'outPostL' : 'outPostR'))!;
  const x = post.x + (side === 'left' ? -0.35 : 0.35);
  const vx = side === 'left' ? -0.8 : 0.8;
  const runIt = (nudgeAt: number) => {
    const sim = makeSim(14);
    sim.spawnBall(x, 14.0, vx, -2);
    const inp = holdInput('none');
    let drained = false;
    let cursor = sim.events.head;
    for (let i = 0; i < 240 * 3; i++) {
      inp.nudge = i === nudgeAt ? (side === 'left' ? 3 : 2) : 0;
      sim.stepOnce(inp);
      cursor = sim.events.read(cursor, (e) => {
        if ((e.type === 'trigger' && e.id.startsWith('outlane') && e.dir > 0) || e.type === 'drain')
          drained = true;
      });
      if (drained) break;
    }
    return drained;
  };
  const naiveDrains = runIt(-1);
  let windows = 0;
  let searched = 0;
  let best: Record<string, number> | undefined;
  for (let d = 0; d <= 160; d += 2) {
    searched++;
    if (!runIt(d)) {
      windows++;
      best ??= { nudgeAt: d };
    }
  }
  return { ok: naiveDrains && windows > 0, windows, searched, best, naiveDrains };
}
