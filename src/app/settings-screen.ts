/**
 * Settings and pause panels. Every control is a button so the flippers can drive the menu
 * (left/right move, plunger selects): numbers step with − / +, choices cycle.
 */
import { h } from './ui';
import { defaultSettings, type Settings } from './settings';
import { DEFAULT_BINDINGS, type Action } from './input';

const REBINDABLE: [Action, string][] = [
  ['left', 'Left flipper'],
  ['right', 'Right flipper'],
  ['plunger', 'Plunger'],
  ['nudge', 'Nudge up'],
  ['nudgeLeft', 'Nudge left'],
  ['nudgeRight', 'Nudge right'],
  ['lockbar', 'Lockbar'],
  ['lookLeft', 'Look left'],
  ['lookRight', 'Look right'],
  ['pause', 'Pause'],
];

const PIXEL_HEIGHTS = [180, 240, 360, 540, 0];
const TEXT_SIZES = [0.85, 1, 1.15, 1.3];

export interface SettingsHandlers {
  change(s: Settings): void;
  /** Wait for the next key and return its code (rebinding). */
  capture(done: (code: string) => void): void;
  back(): void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const keyName = (code: string) => code.replace(/^Key|^Digit/, '').replace('Arrow', '');

export function settingsPanel(
  s: Settings,
  bindings: Record<Action, string[]>,
  on: SettingsHandlers,
  waiting: Action | null = null,
): HTMLElement {
  const set = (patch: Partial<Settings>) => on.change({ ...s, ...patch });
  const vol = (k: keyof Settings['volume'], d: number) =>
    on.change({
      ...s,
      volume: { ...s.volume, [k]: clamp(Math.round((s.volume[k] + d) * 10) / 10) },
    });
  const stepper = (id: string, label: string, value: string, dec: () => void, inc: () => void) =>
    h(
      'div',
      { class: 'setting' },
      h('span', null, label),
      h('button', { 'data-k': `${id}-`, onclick: dec }, '−'),
      h('b', null, value),
      h('button', { 'data-k': `${id}+`, onclick: inc }, '+'),
    );
  const toggle = (id: string, label: string, value: string, flip: () => void, note = '') =>
    h(
      'div',
      { class: 'setting' },
      h('span', null, label, note ? h('small', null, note) : null),
      h('button', { 'data-k': id, class: 'wide', onclick: flip }, value),
    );
  const cycle = <T>(list: T[], v: T, d: number) =>
    list[(list.indexOf(v) + d + list.length) % list.length] ?? list[0];
  const binds = REBINDABLE.map(([a, label]) =>
    toggle(
      `bind-${a}`,
      label,
      waiting === a ? 'Press a key…' : (bindings[a] ?? []).map(keyName).join(' / ') || '—',
      () => on.capture((code) => rebind(bindings, a, code)),
    ),
  );
  return h(
    'div',
    { class: 'panel settings' },
    h('h2', null, 'Settings'),
    h('h3', null, 'Sound'),
    stepper(
      'master',
      'Master',
      pct(s.volume.master),
      () => vol('master', -0.1),
      () => vol('master', 0.1),
    ),
    stepper(
      'sfx',
      'Effects',
      pct(s.volume.sfx),
      () => vol('sfx', -0.1),
      () => vol('sfx', 0.1),
    ),
    stepper(
      'music',
      'Music',
      pct(s.volume.music),
      () => vol('music', -0.1),
      () => vol('music', 0.1),
    ),
    stepper(
      'ambience',
      'Ambience',
      pct(s.volume.ambience),
      () => vol('ambience', -0.1),
      () => vol('ambience', 0.1),
    ),
    toggle('voice', 'Warden voice', s.voice ? 'On' : 'Off', () => set({ voice: !s.voice })),
    h('h3', null, 'Picture'),
    stepper(
      'shake',
      'Screen shake',
      pct(s.shake),
      () => set({ shake: clamp(s.shake - 0.25) }),
      () => set({ shake: clamp(s.shake + 0.25) }),
    ),
    stepper(
      'crt',
      'Grain and dither',
      pct(s.crt),
      () => set({ crt: clamp(Math.round((s.crt - 0.1) * 10) / 10) }),
      () => set({ crt: clamp(Math.round((s.crt + 0.1) * 10) / 10) }),
    ),
    stepper(
      'px',
      'Resolution',
      s.pixelHeight ? `${s.pixelHeight}p` : 'Native',
      () => set({ pixelHeight: cycle(PIXEL_HEIGHTS, s.pixelHeight, -1) }),
      () => set({ pixelHeight: cycle(PIXEL_HEIGHTS, s.pixelHeight, 1) }),
    ),
    stepper(
      'text',
      'Text size',
      pct(s.textSize),
      () => set({ textSize: cycle(TEXT_SIZES, s.textSize, -1) }),
      () => set({ textSize: cycle(TEXT_SIZES, s.textSize, 1) }),
    ),
    toggle('cam', 'Camera', s.camera === 'play' ? 'Overhead' : 'Seated', () =>
      set({ camera: s.camera === 'play' ? 'seated' : 'play' }),
    ),
    toggle('flash', 'Reduced flashing', s.reducedFlashing ? 'On' : 'Off', () =>
      set({ reducedFlashing: !s.reducedFlashing }),
    ),
    h('h3', null, 'Play'),
    toggle(
      'assist',
      'Assist mode',
      s.assist ? 'On' : 'Off',
      () => set({ assist: !s.assist }),
      'Slower table, longer ball save. Runs started with it don’t count for the daily best.',
    ),
    toggle('vib', 'Vibration', s.vibration ? 'On' : 'Off', () => set({ vibration: !s.vibration })),
    toggle('hints', 'Hint notes', s.hints ? 'On' : 'Off', () => set({ hints: !s.hints })),
    h('h3', null, 'Controls'),
    ...binds,
    toggle('bind-reset', 'Keys', 'Reset to defaults', () => {
      for (const [a] of REBINDABLE) bindings[a] = [...DEFAULT_BINDINGS[a]];
      on.change({ ...s, bindings: null });
    }),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          'data-k': 'defaults',
          onclick: () => on.change({ ...defaultSettings(), bindings: s.bindings }),
        },
        'All defaults',
      ),
      h('button', { 'data-k': 'back', class: 'primary', onclick: () => on.back() }, 'Back'),
    ),
  );
}

/** Make `code` the first key for `a`, taking it away from any other action. */
function rebind(b: Record<Action, string[]>, a: Action, code: string): void {
  for (const k of Object.keys(b) as Action[]) b[k] = b[k].filter((c) => c !== code);
  b[a] = [code, ...b[a]].slice(0, 3);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface PauseHandlers {
  resume(): void;
  settings(): void;
  bugReport(): void;
  quit(): void;
}

/** `quitNote` says what quitting costs (e.g. the ball in play). */
export function pausePanel(on: PauseHandlers, quitNote: string): HTMLElement {
  return h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Paused'),
    h(
      'div',
      { class: 'col' },
      h('button', { class: 'primary', onclick: () => on.resume() }, 'Resume'),
      h('button', { onclick: () => on.settings() }, 'Settings'),
      h('button', { onclick: () => on.bugReport() }, 'Copy bug report'),
      h(
        'button',
        { onclick: () => on.quit() },
        quitNote ? `Quit to title (${quitNote})` : 'Quit to title',
      ),
    ),
  );
}
