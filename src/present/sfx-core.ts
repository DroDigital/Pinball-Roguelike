import type { SfxName } from './sfx-manifest';
import type { PlayOpts } from './sfx-engine';
import type { Mix } from './sfx-mix';
import type { Synth } from './sfx-synth';

/** What the sound modules (machine, rewards, cell) need from the audio facade. */
export interface Core {
  readonly ctx: BaseAudioContext;
  readonly mix: Mix;
  readonly synth: Synth;
  /** Current time on the audio clock. */
  readonly now: number;
  play(name: SfxName, o?: PlayOpts): boolean;
  /** Play after `delay` seconds. */
  at(delay: number, name: SfxName, o?: PlayOpts): boolean;
  /** Table x (0..18.4) -> stereo pan. */
  pan(x: number): number;
  stop(name: SfxName): void;
}
