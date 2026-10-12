import { describe, expect, it } from 'vitest';
import { LAMP_SHOWS } from '../../src/content/lampshows';
import { TABLE } from '../../src/content/table';
import { LampShowPlayer } from '../../src/present/lampshow';
import { Lamp } from '../../src/rules/types';

const DT = 1 / 240;
/** Photosensitivity: keep every lamp under three changes a second. */
const MAX_CHANGES_PER_SECOND = 3;

/** Plays a show from its start and records each lamp's state changes over the run. */
function changesOf(id: string, reduced: boolean): { perSecond: number; lamps: number } {
  const p = new LampShowPlayer(TABLE.lamps);
  p.reducedFlashing = reduced;
  p.play(id);
  const prev = new Map<string, Lamp>();
  const stamps = new Map<string, number[]>();
  let t = 0;
  const limit = 30;
  while (p.playing !== null && t < limit) {
    const frame = p.apply(null);
    if (frame) {
      for (const [lamp, state] of Object.entries(frame)) {
        if (prev.get(lamp) !== undefined && prev.get(lamp) !== state) {
          const list = stamps.get(lamp) ?? [];
          list.push(t);
          stamps.set(lamp, list);
        }
        prev.set(lamp, state);
      }
    }
    p.update(DT);
    t += DT;
  }
  let worst = 0;
  for (const list of stamps.values()) {
    // Most changes inside any one-second window.
    let lo = 0;
    for (let hi = 0; hi < list.length; hi++) {
      while (list[hi] - list[lo] >= 1) lo++;
      worst = Math.max(worst, hi - lo + 1);
    }
  }
  return { perSecond: worst, lamps: stamps.size };
}

describe('lamp shows under reduced flashing', () => {
  it('enumerates every show and keeps each lamp under three changes a second', () => {
    for (const show of LAMP_SHOWS) {
      const { perSecond, lamps } = changesOf(show.id, true);
      expect(lamps, show.id).toBeGreaterThan(0);
      expect(perSecond, show.id).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
    }
  });

  it('still flashes at full rate when reduced flashing is off', () => {
    // The default look keeps the strobe, so the setting is what changes the show.
    const riot = changesOf('riot', false);
    expect(riot.perSecond).toBeGreaterThan(MAX_CHANGES_PER_SECOND);
  });
});
