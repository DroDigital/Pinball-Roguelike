/**
 * Settings and pause panels. Every control is a button so the flippers can drive the menu
 * (left/right move, plunger selects): numbers step with - / +, choices cycle, switches flip.
 */
import { h } from './ui';
import { icon } from './icons';
import { btn, keyFor, keyName, kbd, panel, section, type Contents } from './widgets';
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
  const row = (label: string, note: string, control: Contents) =>
    h(
      'div',
      { class: 'setting-row' },
      h('span', { class: 'sr-text' }, h('b', null, label), note ? h('small', null, note) : null),
      control,
    );
  /** - [bar] value + : a number the flippers can step. `fill` is 0..1 for the bar. */
  const stepper = (
    id: string,
    label: string,
    value: string,
    fill: number | null,
    dec: () => void,
    inc: () => void,
    note = '',
  ) =>
    row(
      label,
      note,
      h(
        'div',
        { class: 'stepper' },
        btn(icon('minus'), {
          class: 'small square',
          cue: 'slider',
          k: `${id}-`,
          title: `${label} down`,
          onclick: dec,
        }),
        fill === null
          ? null
          : h(
              'span',
              { class: 'seg', 'aria-hidden': 'true' },
              Array.from({ length: 10 }, (_, i) =>
                h('i', { class: i < Math.round(fill * 10) ? 'on' : '' }),
              ),
            ),
        h('span', { class: 'stepper-value' }, value),
        btn(icon('plus'), {
          class: 'small square',
          cue: 'slider',
          k: `${id}+`,
          title: `${label} up`,
          onclick: inc,
        }),
      ),
    );
  const toggle = (id: string, label: string, on_: boolean, flip: () => void, note = '') =>
    row(
      label,
      note,
      btn(on_ ? 'On' : 'Off', {
        class: `switch${on_ ? ' on' : ''}`,
        cue: on_ ? 'toggleOff' : 'toggleOn',
        k: id,
        onclick: flip,
      }),
    );
  const choice = (id: string, label: string, value: string, flip: () => void, note = '') =>
    row(label, note, btn(value, { class: 'choice', cue: 'slider', k: id, onclick: flip }));
  const cycle = <T>(list: T[], v: T, d: number) =>
    list[(list.indexOf(v) + d + list.length) % list.length] ?? list[0];
  const bind = (a: Action, label: string) => {
    const waitingHere = waiting === a;
    const keys = (bindings[a] ?? []).map(keyName);
    return row(
      label,
      '',
      btn(waitingHere ? 'Press a key…' : keys.length ? keys.map((k) => kbd(k)) : '—', {
        class: `keybind${waitingHere ? ' waiting' : ''}`,
        cue: 'select',
        k: `bind-${a}`,
        onclick: () => on.capture((code) => rebind(bindings, a, code)),
      }),
    );
  };
  const vols = (k: keyof Settings['volume'], id: string, label: string) =>
    stepper(
      id,
      label,
      pct(s.volume[k]),
      s.volume[k],
      () => vol(k, -0.1),
      () => vol(k, 0.1),
    );
  return panel({
    screen: 'settings',
    size: 'xl',
    class: 'settings',
    eyebrow: 'Options',
    title: 'Settings',
    titleIcon: 'gear',
    navHint: true,
    body: [
      h(
        'div',
        { class: 'settings-grid' },
        h(
          'div',
          { class: 'col' },
          section('Sound', [
            vols('master', 'master', 'Master'),
            vols('sfx', 'sfx', 'Effects'),
            vols('music', 'music', 'Music'),
            vols('ambience', 'ambience', 'Ambience'),
            toggle(
              'voice',
              'Warden voice',
              s.voice,
              () => set({ voice: !s.voice }),
              'The Warden reads his lines aloud.',
            ),
          ]),
          section('Picture', [
            stepper(
              'shake',
              'Screen shake',
              pct(s.shake),
              s.shake,
              () => set({ shake: clamp(s.shake - 0.25) }),
              () => set({ shake: clamp(s.shake + 0.25) }),
            ),
            stepper(
              'crt',
              'Grain and dither',
              pct(s.crt),
              s.crt,
              () => set({ crt: clamp(Math.round((s.crt - 0.1) * 10) / 10) }),
              () => set({ crt: clamp(Math.round((s.crt + 0.1) * 10) / 10) }),
            ),
            stepper(
              'px',
              'Resolution',
              s.pixelHeight ? `${s.pixelHeight}p` : 'Native',
              null,
              () => set({ pixelHeight: cycle(PIXEL_HEIGHTS, s.pixelHeight, -1) }),
              () => set({ pixelHeight: cycle(PIXEL_HEIGHTS, s.pixelHeight, 1) }),
              'Lower is more pixelated and faster.',
            ),
            stepper(
              'text',
              'Text size',
              pct(s.textSize),
              null,
              () => set({ textSize: cycle(TEXT_SIZES, s.textSize, -1) }),
              () => set({ textSize: cycle(TEXT_SIZES, s.textSize, 1) }),
            ),
            choice('cam', 'Camera', s.camera === 'play' ? 'Overhead' : 'Seated', () =>
              set({ camera: s.camera === 'play' ? 'seated' : 'play' }),
            ),
            toggle(
              'flash',
              'Reduced flashing',
              s.reducedFlashing,
              () => set({ reducedFlashing: !s.reducedFlashing }),
              'Fewer flashes and calmer number animations.',
            ),
          ]),
        ),
        h(
          'div',
          { class: 'col' },
          section('Play', [
            toggle(
              'assist',
              'Assist mode',
              s.assist,
              () => set({ assist: !s.assist }),
              'Slower table, longer ball save. Runs started with it don’t count for the daily best.',
            ),
            toggle('vib', 'Vibration', s.vibration, () => set({ vibration: !s.vibration })),
            toggle(
              'hints',
              'Hint notes',
              s.hints,
              () => set({ hints: !s.hints }),
              'Short tips the first time something comes up.',
            ),
          ]),
          section('Controls', [
            ...REBINDABLE.map(([a, label]) => bind(a, label)),
            choice('bind-reset', 'Keys', 'Reset to defaults', () => {
              for (const [a] of REBINDABLE) bindings[a] = [...DEFAULT_BINDINGS[a]];
              on.change({ ...s, bindings: null });
            }),
          ]),
        ),
      ),
      h(
        'p',
        { class: 'credits' },
        'Fonts: Inter and Saira Stencil One (SIL Open Font License 1.1), Special Elite (Apache License 2.0). ',
        h('a', { href: './licenses/FONTS.txt', target: '_blank', rel: 'noopener' }, 'Licences'),
      ),
    ],
    foot: [
      btn('All defaults', {
        variant: 'ghost',
        k: 'defaults',
        onclick: () => on.change({ ...defaultSettings(), bindings: s.bindings }),
      }),
      btn('Back', {
        variant: 'primary',
        key: keyFor('pause'),
        cue: 'close',
        k: 'back',
        onclick: () => on.back(),
      }),
    ],
  });
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
export function pausePanel(on: PauseHandlers, quitNote: string, where = ''): HTMLElement {
  return panel({
    screen: 'pause',
    size: 'sm',
    eyebrow: where || undefined,
    title: 'Paused',
    titleIcon: 'pause',
    body: h(
      'div',
      { class: 'menu-list' },
      btn('Resume', {
        variant: 'primary',
        icon: 'chevron',
        key: keyFor('pause'),
        block: true,
        cue: 'close',
        k: 'resume',
        onclick: () => on.resume(),
      }),
      btn('Settings', { icon: 'gear', block: true, k: 'settings', onclick: () => on.settings() }),
      btn('Copy bug report', {
        variant: 'ghost',
        block: true,
        k: 'bug',
        onclick: () => on.bugReport(),
      }),
      btn('Quit to title', {
        variant: 'danger',
        block: true,
        sub: quitNote ? quitNote.charAt(0).toUpperCase() + quitNote.slice(1) : undefined,
        k: 'quit',
        onclick: () => on.quit(),
      }),
    ),
    navHint: true,
  });
}
