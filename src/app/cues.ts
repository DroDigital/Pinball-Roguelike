/**
 * The menu cues the UI raises, and which sound each one plays. The names are the richer set
 * (hover for the mouse, slider for - / +, close for leaving an overlay, toggleOn / toggleOff for
 * switches); `AUDIO_CUE` maps them onto the cues the audio module has today. When audio.ts
 * grows the same names, make every entry map to itself.
 */
import type { UiCue } from '../present/audio';

export type MenuCue = UiCue | 'hover' | 'slider' | 'close' | 'toggleOn' | 'toggleOff';

export const AUDIO_CUE: Record<MenuCue, UiCue | null> = {
  move: 'move',
  select: 'select',
  back: 'back',
  open: 'open',
  close: 'close',
  error: 'error',
  buy: 'buy',
  sell: 'sell',
  reward: 'reward',
  deposit: 'deposit',
  tick: 'tick',
  lock: 'lock',
  unlock: 'unlock',
  success: 'success',
  warning: 'warning',
  notify: 'notify',
  pause: 'pause',
  resume: 'resume',
  slider: 'slider',
  toggleOn: 'toggleOn',
  toggleOff: 'toggleOff',
  // A mouse sweep would be a stream of identical beeps: silent until there is a soft hover cue.
  hover: null,
};
