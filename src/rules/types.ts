import type { ShotType } from '../sim/table-def';

/** Lamp modes for inserts. */
export const enum Lamp {
  Off = 0,
  On = 1,
  Slow = 2,
  Fast = 3,
}

/** Events the rules emit for presentation (DMD, number pops, audio, lamps, camera). */
export type GameEvent =
  | {
      t: 'score';
      shot: ShotType | 'bonus' | 'skill' | 'jackpot';
      amount: number;
      x: number;
      y: number;
    }
  | { t: 'callout'; text: string; sub?: string; priority: number; anim?: string }
  | { t: 'skillShot'; super: boolean }
  | { t: 'ballSaved' }
  | { t: 'tiltWarning'; n: number }
  | { t: 'tilt' }
  | { t: 'drain'; cause: string; x: number; y: number }
  | { t: 'ballOver'; earned: number; tilted: boolean }
  | { t: 'laneComplete' }
  | { t: 'lit'; what: string };

export type GameEventSink = (e: GameEvent) => void;
