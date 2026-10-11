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
  | { t: 'callout'; text: string; sub?: string; priority: number; anim?: string; duration?: number }
  | { t: 'skillShot'; super: boolean }
  | { t: 'ballSaved' }
  | { t: 'tiltWarning'; n: number }
  | { t: 'tilt' }
  | { t: 'drain'; cause: string; x: number; y: number }
  | { t: 'ballOver'; earned: number; tilted: boolean }
  | { t: 'laneComplete' }
  | { t: 'lit'; what: string }
  | { t: 'combo'; count: number; mult: number }
  | { t: 'bonusMult'; mult: number }
  /** End of ball: Bonus x multiplier (after Taxman etc.) about to tally. */
  | { t: 'bonus'; bonus: number; mult: number; total: number }
  | { t: 'lock'; locks: number; needed: number }
  | { t: 'riot'; on: boolean }
  | { t: 'payday'; amount: number; super: boolean }
  | { t: 'award'; award: AwardId; collected: boolean }
  | { t: 'hurry'; on: boolean }
  | { t: 'luck'; kind: 'spark' | 'bounce'; amount: number }
  | { t: 'jobDone'; id: string }
  | { t: 'extraBall' }
  | { t: 'active'; id: string; slot: number; charges: number }
  /** Presentation slows real time (Pocket Watch); the sim is unaffected. */
  /** The neighbor's secret shot. */
  | { t: 'tunnel'; amount: number }
  /**
   * JAILBREAK: started, a lit shot made (n so far), the machine falling apart (posts, lights,
   * glass), escaped, or failed (every ball drained).
   */
  | { t: 'jailbreak'; phase: JailbreakPhase; n: number };

export type JailbreakPhase = 'start' | 'shot' | 'posts' | 'lights' | 'glass' | 'escaped' | 'failed';

export type AwardId = 'bonusX' | 'kickback' | 'hurryUp' | 'shotLevel' | 'extraBall';

export type GameEventSink = (e: GameEvent) => void;
