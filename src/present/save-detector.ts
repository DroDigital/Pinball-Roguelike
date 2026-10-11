/**
 * Spots last-second saves: a ball falling through the drain gap (or low in an inlane/outlane
 * mouth) that is sent back up the table within a heartbeat. The app answers with a brief
 * slow-motion beat. Presentation-only: reads sim ball state, never touches it.
 */
import type { SimBall } from '../sim/sim';

/** Centre of the flipper gap and the rest-position tip line. */
const GAP_X = 9.2;
const GAP_HALF = 1.7;
const DEATH_Y = 5.6;
/** Falling at least this fast to count as doomed (units/s). */
const FALL_VY = -2.5;
/** Back up the table at least this fast. */
const SAVE_VY = 5.5;
/** How long after the doomed moment a save still counts (sim seconds). */
const WINDOW = 0.35;
const MAX_BALLS = 16;

export class SaveDetector {
  /** Sim time a ball was last doomed, by ball id slot. */
  private readonly doomedAt = new Float64Array(MAX_BALLS).fill(-1e9);

  /** Returns true on the frame a save happens. `t` is sim seconds. */
  update(balls: readonly SimBall[], t: number): boolean {
    let saved = false;
    for (const b of balls) {
      if (b.state !== 'field' || b.inShooter) continue;
      const k = b.id % MAX_BALLS;
      if (b.y < DEATH_Y && Math.abs(b.x - GAP_X) < GAP_HALF && b.vy < FALL_VY) {
        this.doomedAt[k] = t;
      } else if (t - this.doomedAt[k] < WINDOW && b.vy > SAVE_VY) {
        this.doomedAt[k] = -1e9;
        saved = true;
      }
    }
    return saved;
  }

  reset(): void {
    this.doomedAt.fill(-1e9);
  }
}
