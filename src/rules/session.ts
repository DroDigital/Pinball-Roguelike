/**
 * BallSession: one ball of play = a fresh PinballSim + TableGame built from a snapshot, stepped
 * with recorded inputs. Re-running a snapshot with its recording reproduces the ball exactly
 * (instant replays, bug reports, the replay determinism test).
 */
import { PinballSim, emptyInput, type SimInput } from '../sim/sim';
import { makeSimConfig, type SimMods } from '../sim/sim-config';
import { StateHasher } from '../core/hash';
import { TABLE } from '../content/table';
import type { TableDef } from '../sim/table-def';
import { TableGame, type BallContext, type MachineState } from './table-game';
import type { GameEventSink } from './types';

export interface BallSnapshot {
  seed: number;
  tags: string[];
  mods: Partial<SimMods>;
  machine: MachineState;
  ctx: BallContext;
}

/**
 * Input encoded as a small integer: bits 0-2 buttons, bits 3-4 nudge, bit 5 analog pull flag,
 * bits 6-8 active-charm press.
 */
export function encodeInput(i: SimInput): number {
  return (
    (i.left ? 1 : 0) |
    (i.right ? 2 : 0) |
    (i.plunger ? 4 : 0) |
    (i.nudge << 3) |
    (i.pull >= 0 ? 32 : 0) |
    ((i.active & 7) << 6)
  );
}

export function decodeInput(code: number, pull: number, out: SimInput): SimInput {
  out.left = (code & 1) !== 0;
  out.right = (code & 2) !== 0;
  out.plunger = (code & 4) !== 0;
  out.nudge = ((code >> 3) & 3) as SimInput['nudge'];
  out.pull = code & 32 ? pull : -1;
  out.active = (code >> 6) & 7;
  return out;
}

/** Run-length input recording: [step, code, pull] whenever the input changes. */
export class InputRecording {
  readonly changes: number[] = [];
  private lastCode = -1;
  private lastPull = -2;

  record(step: number, input: SimInput): void {
    const code = encodeInput(input);
    const pull = input.pull >= 0 ? Math.round(input.pull * 1000) / 1000 : -1;
    if (code === this.lastCode && pull === this.lastPull) return;
    this.lastCode = code;
    this.lastPull = pull;
    this.changes.push(step, code, pull);
  }

  /** Iterator yielding the input for each consecutive step. */
  player(): (step: number) => SimInput {
    const out = emptyInput();
    let idx = 0;
    let code = 0;
    let pull = -1;
    return (step: number) => {
      while (idx < this.changes.length && this.changes[idx] <= step) {
        code = this.changes[idx + 1];
        pull = this.changes[idx + 2];
        idx += 3;
      }
      return decodeInput(code, pull, out);
    };
  }

  toJSON(): number[] {
    return this.changes;
  }

  static fromJSON(a: number[]): InputRecording {
    const r = new InputRecording();
    r.changes.push(...a);
    return r;
  }
}

export class BallSession {
  readonly sim: PinballSim;
  readonly game: TableGame;
  readonly recording = new InputRecording();
  readonly snapshot: BallSnapshot;
  steps = 0;

  constructor(snap: BallSnapshot, emit?: GameEventSink, table: TableDef = TABLE) {
    // Deep-copy so the session never mutates the caller's snapshot.
    this.snapshot = JSON.parse(JSON.stringify(snap)) as BallSnapshot;
    const s = JSON.parse(JSON.stringify(snap)) as BallSnapshot;
    this.sim = new PinballSim({
      table,
      config: makeSimConfig(s.mods),
      tags: new Set(s.tags),
      seed: s.seed,
      drops: s.machine.drops,
    });
    this.game = new TableGame(this.sim, s.ctx, s.machine, emit);
    this.game.start();
  }

  get over(): boolean {
    return this.game.over;
  }

  step(input: SimInput): void {
    if (this.game.over) return;
    // The recording keeps the analog pull to 3 decimals, so simulate that same value:
    // otherwise a touch or gamepad plunge replays slightly differently.
    if (input.pull >= 0) input.pull = Math.round(input.pull * 1000) / 1000;
    this.recording.record(this.steps, input);
    this.game.preStep(input);
    this.sim.stepOnce(input);
    this.game.postStep();
    this.steps++;
  }

  hash(): string {
    const h = this.sim.hash(new StateHasher());
    h.q(this.game.earned).bool(this.game.tilted).int(this.game.tiltWarnings).bool(this.game.over);
    return h.digest();
  }

  /** Re-simulate a recorded ball from its snapshot. */
  static replay(
    snap: BallSnapshot,
    rec: InputRecording,
    steps: number,
    emit?: GameEventSink,
  ): BallSession {
    const s = new BallSession(snap, emit);
    const play = rec.player();
    for (let i = 0; i < steps && !s.over; i++) s.step(play(i));
    return s;
  }
}
