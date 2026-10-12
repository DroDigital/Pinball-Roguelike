/**
 * The story beats: the cell door shutting on a new run, the ATM chirping at the deadline, the
 * JAILBREAK on the table and the three endings. These stitch the other modules' sounds into
 * timed sequences on the audio clock, so a long cue stays in time however the frames land.
 */
import type { Core } from './sfx-core';
import type { CellSounds } from './sfx-cell';
import type { RewardSounds } from './sfx-reward';

export type EndingSound = 'paidInFull' | 'breakout' | 'cellmate';

export class StorySounds {
  constructor(
    private readonly a: Core,
    private readonly reward: RewardSounds,
    private readonly cell: CellSounds,
  ) {}

  /** A new run: the door slams, the lock turns, the chain settles. */
  runStart(): void {
    const a = this.a;
    a.at(0, 'doorClang', { gain: 0.85, rate: 0.95 });
    a.at(0.3, 'doorLock');
    a.at(0.75, 'chain', { gain: 0.55 });
    a.mix.duck(0.5, 0.8, 0.9);
  }

  /** The ATM chirps when a deadline is due: three insistent beeps and a low buzz. */
  atmAlarm(): void {
    const a = this.a;
    for (let i = 0; i < 3; i++) a.at(i * 0.17, 'atmKey', { variant: 3, rate: 1.55, gain: 1.7 });
    a.at(0.58, 'atmNo', { gain: 1.2 });
  }

  /**
   * An ending's soundscape, timed to the cues in endings.ts (the TITLE sting and the wall coming
   * down are fired from the cues themselves). Call when the ending starts.
   */
  ending(kind: EndingSound): void {
    const a = this.a;
    switch (kind) {
      case 'paidInFull': {
        // The lock turns, the door swings open on its hinges, then footsteps walk away down a
        // corridor of identical cells (each a little softer and wetter than the last).
        a.at(1.35, 'doorLock', { gain: 0.8 });
        a.at(1.65, 'creak', { gain: 0.9, rate: 0.85, variant: 0 });
        a.at(3.0, 'doorClang', { gain: 0.45, rate: 0.8 });
        a.at(4.6, 'riser', { gain: 0.3, variant: 1 });
        for (let i = 0; i < 12; i++) {
          const k = i / 11;
          a.at(3.7 + i * 0.6, 'knock', {
            gain: 0.4 * (1 - k * 0.7),
            rate: 0.5 + (i % 2) * 0.05,
            pan: (i % 2 ? 1 : -1) * 0.12,
            send: 1.1 + k * 0.9,
          });
        }
        a.mix.duck(0.55, 8, 2);
        break;
      }
      case 'breakout': {
        // Down the drain: a fall and a rolling chute, a riser to the light, then daylight as a
        // run of bells in the open air and a telephone somewhere behind the wall.
        a.at(0.3, 'whoosh', { gain: 0.8, variant: 1, rate: 0.7 });
        a.at(0.4, 'chute', { gain: 0.8, rate: 0.9 });
        a.at(0.7, 'fall', { gain: 0.5, rate: 1.25 });
        a.at(1.9, 'riser', { gain: 0.5, variant: 1 });
        this.reward.run([0, 2, 4, 5, 7, 8], 0.16, 0.8, 3.55, 0, 'sfx');
        a.at(3.55, 'stAchievement', { gain: 0.75 });
        a.at(6.35, 'phoneRing', { gain: 0.3, pan: -0.7, send: 2.2 });
        a.mix.duck(0.35, 7, 2);
        break;
      }
      case 'cellmate': {
        // The knocking stops, the wall comes down (fired by its cue), and at the end someone
        // starts to knock behind you.
        this.cell.knock(4);
        a.at(10.2, 'chain', { gain: 0.6 });
        for (let i = 0; i < 3; i++)
          a.at(11.1 + i * 0.32, 'knock', { gain: 0.75, pan: 0.65, send: 1.4 });
        a.mix.duck(0.6, 11, 2);
        break;
      }
    }
  }

  /** An ending's title card: the Warden's bell and a low swell (no replay knock). */
  titleCard(): void {
    const a = this.a;
    a.at(0, 'toll', { gain: 0.7, variant: 0 });
    a.at(0.03, 'boom', { gain: 0.45 });
    a.mix.duck(0.5, 2, 1.5);
  }

  /** JAILBREAK on the table, by phase. */
  jailbreak(phase: string, n = 0): void {
    const a = this.a;
    const t = this.reward;
    switch (phase) {
      case 'start':
        a.at(0, 'kick', { gain: 0.9, rate: 0.8 });
        a.at(0.03, 'boom', { gain: 0.9 });
        for (let i = 0; i < 5; i++) a.at(0.14 + i * 0.4, 'alarm', { gain: 0.85 - i * 0.1 });
        a.at(0.12, 'riser', { variant: 1 });
        a.at(0.3, 'doorClang', { gain: 0.6, rate: 0.9 });
        a.mix.duck(0.3, 2, 1.2);
        break;
      case 'shot':
        this.cell.creak();
        a.at(0.05, 'chain', { gain: 0.5 + Math.min(0.5, n * 0.08) });
        t.note(Math.min(6, n), { gain: 0.5, delay: 0.1 });
        break;
      case 'posts':
        this.cell.clang();
        a.at(0.1, 'rubble', { gain: 0.35 });
        break;
      case 'lights':
        // The power sagging: a falling whoosh, a dark boom and flickering relay ticks.
        a.at(0, 'whoosh', { gain: 0.8, variant: 1, rate: 0.6 });
        a.at(0.1, 'boom', { gain: 0.6, variant: 1 });
        for (let i = 0; i < 6; i++)
          a.at(0.05 + i * 0.09 + (i % 2) * 0.03, 'lane', { gain: 1 - i * 0.12, rate: 0.7 });
        break;
      case 'glass':
        this.cell.glassCrack();
        a.at(0.1, 'crumble', { gain: 0.4 });
        break;
      case 'escaped':
        this.cell.doorLock();
        a.at(0.35, 'doorClang', { gain: 0.9, rate: 0.85 });
        a.at(0.4, 'riser', { variant: 0, gain: 0.6 });
        t.run([0, 2, 4, 5, 7, 8, 8], 0.09, 1, 0.9);
        a.at(0.92, 'stAchievement');
        a.at(1.0, 'coinShower');
        a.mix.duck(0.2, 3, 1.5);
        break;
      case 'failed':
        a.at(0, 'ssGameover');
        a.at(0.1, 'toll', { variant: 0 });
        a.at(0.1, 'boom', { gain: 0.6 });
        a.mix.duck(0.3, 2, 1.2);
        break;
      default:
        break;
    }
  }
}
