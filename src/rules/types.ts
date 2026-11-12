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
  /** REINFORCEMENTS: a ball added to the RIOT. */
  | { t: 'addABall' }
  /** A timed table mode started or ended (Searchlight SWEEP, Yard BRAWL, DOUBLE SHIFT). */
  | { t: 'mode'; mode: TableMode; on: boolean }
  /** WANTED: a bounty collected (n this ball), or the poster moved (amount 0). */
  | { t: 'wanted'; shot: WantedShot; amount: number; n: number }
  /** A PA announcement from the Warden's tannoy. */
  | { t: 'pa'; event: PaEvent }
  /** SHAKEDOWN: the mystery lit at the inlanes, or was collected. */
  | { t: 'mystery'; award: MysteryAward | null }
  /** REP reached a new level this ball (the Ink pick waits for the drain). */
  | { t: 'repLevel'; level: number }
  /** A tattoo or Sleeve's behaviour fired. */
  | { t: 'ink'; id: string }
  /** A charm's behaviour fired (its relic reacts). */
  | { t: 'charm'; id: string }
  /**
   * JAILBREAK: started, a lit shot made (n so far), the machine falling apart (posts, lights,
   * glass), escaped, or failed (every ball drained).
   */
  | { t: 'jailbreak'; phase: JailbreakPhase; n: number };

export type JailbreakPhase = 'start' | 'shot' | 'posts' | 'lights' | 'glass' | 'escaped' | 'failed';

export type MysteryAward =
  | 'coins'
  | 'bigCoins'
  | 'bonusX'
  | 'ballSave'
  | 'luck'
  | 'kickback'
  | 'lockup';

export type TableMode = 'sweep' | 'brawl' | 'shift' | 'frenzy' | 'manhunt' | 'mostWanted';

export type WantedShot = 'chute' | 'perimL' | 'perimR' | 'hole' | 'cellblock' | 'tower';

export type PaEvent = 'arrival' | 'frenzy' | 'asleep' | 'lockup' | 'hurry' | 'manhunt';

export type AwardId = 'bonusX' | 'kickback' | 'hurryUp' | 'shotLevel' | 'extraBall';

export type GameEventSink = (e: GameEvent) => void;
