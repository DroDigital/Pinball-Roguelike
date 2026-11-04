/**
 * Which menu cue a control makes. Every button press in the game goes through here (audio.ts
 * listens once at the document), so a toggle clicks on/off, a Settings stepper ticks, Back
 * sighs and a disabled control buzzes, without each screen wiring its own sound. A screen can
 * still name a cue explicitly with `data-cue`. Pure: it reads a few attributes, so tests run
 * without a DOM.
 */

/** Menu and screen cues, played by name from the UI layer (audio.ui). */
export const UI_CUE_NAMES = [
  'move',
  'select',
  'back',
  'open',
  'close',
  'error',
  'buy',
  'sell',
  'reward',
  'toggleOn',
  'toggleOff',
  'deposit',
  'tick',
  'hover',
  'slider',
  'lock',
  'unlock',
  'success',
  'warning',
  'notify',
  'pause',
  'resume',
] as const;

export type UiCue = (typeof UI_CUE_NAMES)[number];

/** The few element fields the rules read (a DOM button satisfies this). */
export interface ControlEl {
  disabled?: boolean;
  textContent: string | null;
  dataset?: { k?: string; cue?: string };
}

const CUES = new Set<string>(UI_CUE_NAMES);

/** The cue for a press on an enabled control. */
export function controlCue(el: ControlEl): UiCue {
  const named = el.dataset?.cue;
  if (named && CUES.has(named)) return named as UiCue;
  // The Settings screen's keys: 'back' leaves, '<id>+' and '<id>-' step a value.
  const k = el.dataset?.k ?? '';
  if (k === 'back') return 'back';
  if (/[+-]$/.test(k)) return 'slider';
  const text = (el.textContent ?? '').trim().toLowerCase();
  if (text === 'on') return 'toggleOn';
  if (text === 'off') return 'toggleOff';
  return 'select';
}
