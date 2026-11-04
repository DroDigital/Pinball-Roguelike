/**
 * The UI kit: skin buttons that say why they are locked, chips, pips, the debt meter, bars and
 * tally marks. Pure DOM builders; the look lives in styles.css, skin.css and hud.css.
 */
import { h } from './ui';
import { icon, type IconName } from './icons';
import type { MenuCue } from './cues';

export type Content = Node | string | null | undefined | false;
export type Contents = Content | Content[];

// ------------------------------------------------------------------ key names

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Slash: '/',
  Backspace: '⌫',
  Tab: 'Tab',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
};

export function keyName(code: string): string {
  return KEY_NAMES[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
}

// ------------------------------------------------------------------ buttons

/**
 * A locked button stays clickable (and focusable by mouse) so it can say why it is locked;
 * the UI layer plays the error cue and shows the reason instead of running the action.
 */
function lockAttrs(o: { disabled?: boolean; why?: string }): Record<string, unknown> {
  return o.disabled ? { 'aria-disabled': 'true', 'data-why': o.why } : {};
}

export interface ButtonOpts {
  /** The recommended action (default focus, the brass plate). */
  primary?: boolean;
  disabled?: boolean;
  /** Why a locked button is locked; said when it is pressed. */
  why?: string;
  cue?: MenuCue;
  /** Focus key: the button keeps focus when its panel re-renders. */
  k?: string;
  class?: string;
  title?: string;
  style?: Record<string, string>;
  /** A painted frame for the button itself (job tickets; see skin.ts). */
  skin?: string;
  onclick?: () => void;
}

/**
 * A plain button in the panel skin. A locked one stays focusable, so the flippers and the
 * gamepad can reach it, and pressing it says why instead of running the action (ui.ts).
 */
export function button(o: ButtonOpts, ...children: Contents[]): HTMLButtonElement {
  const cls = [o.primary ? 'primary' : '', o.disabled ? 'is-disabled' : '', o.class ?? '']
    .filter(Boolean)
    .join(' ');
  return h(
    'button',
    {
      type: 'button',
      class: cls || undefined,
      title: o.title,
      style: o.style,
      'data-k': o.k,
      'data-cue': o.cue,
      'data-skin': o.skin,
      onclick: () => {
        if (!o.disabled) o.onclick?.();
      },
      ...lockAttrs(o),
    },
    ...children,
  );
}

// ------------------------------------------------------------------ chips, pips, meters

export type ChipKind = 'plain' | 'good' | 'bad' | 'warn' | 'info' | 'gold' | 'ghost';

export function chip(
  content: Contents,
  kind: ChipKind = 'plain',
  o: { icon?: IconName; title?: string; color?: string; class?: string } = {},
): HTMLElement {
  return h(
    'span',
    {
      class: `chip chip-${kind}${o.class ? ` ${o.class}` : ''}`,
      title: o.title,
      style: o.color ? { '--chip': o.color } : undefined,
    },
    o.icon ? icon(o.icon, 'chip-ico') : null,
    content,
  );
}

/** Dots for balls left / charges. */
export function pips(total: number, filled: number, kind = 'ball'): HTMLElement {
  const dots: HTMLElement[] = [];
  for (let i = 0; i < total; i++)
    dots.push(h('i', { class: `pip pip-${kind} ${i < filled ? 'on' : 'off'}` }));
  return h('span', { class: 'pips', role: 'img', 'aria-label': `${filled} of ${total}` }, dots);
}

/** The round's balls: played ones dim, the one in play lit, the rest ready. */
export function ballPips(total: number, played: number, playing: boolean): HTMLElement {
  const dots: HTMLElement[] = [];
  for (let i = 0; i < total; i++) {
    const state = i < played ? 'off' : i === played && playing ? 'live' : 'on';
    dots.push(h('i', { class: `pip pip-ball ${state}` }));
  }
  return h(
    'span',
    { class: 'pips', role: 'img', 'aria-label': `${Math.max(0, total - played)} balls left` },
    dots,
  );
}

/**
 * The debt bar: Bank (solid) and Pocket (hatched, still to be deposited) filling toward the
 * Debt. `setMeter` moves it (the HUD does that every time a number changes).
 */
export function meter(cls = ''): HTMLElement {
  return h(
    'div',
    { class: `meter${cls ? ` ${cls}` : ''}`, role: 'img' },
    h('div', { class: 'meter-fill bank' }),
    h('div', { class: 'meter-fill pend' }),
    h('div', { class: 'meter-fill live' }),
    h('div', { class: 'meter-edge' }),
  );
}

export function setMeter(
  el: HTMLElement,
  debt: number,
  bank: number,
  pocket: number,
  live = 0,
): void {
  const d = Math.max(1, debt);
  const b = Math.min(1, bank / d);
  const p = Math.min(1 - b, pocket / d);
  const l = Math.min(1 - b - p, live / d);
  const fills = el.children;
  const set = (i: number, left: number, width: number): void => {
    const f = fills[i] as HTMLElement;
    f.style.left = `${(left * 100).toFixed(2)}%`;
    f.style.width = `${(width * 100).toFixed(2)}%`;
  };
  set(0, 0, b);
  set(1, b, p);
  set(2, b + p, l);
  el.classList.toggle('paid', bank >= debt);
  el.classList.toggle('covered', bank < debt && bank + pocket + live >= debt);
  el.setAttribute(
    'aria-label',
    `Bank ${Math.round(bank)} of ${Math.round(debt)} owed, Pocket ${Math.round(pocket)}`,
  );
}

/** A linear progress bar (Jobs). `value` is 0..1. */
export function bar(value: number, cls = ''): HTMLElement {
  const fill = h('span', { class: 'bar-fill' });
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  return h('div', { class: `bar${cls ? ` ${cls}` : ''}` }, fill);
}

export function tallyMarks(n: number): HTMLElement {
  const shown = Math.min(n, 100);
  const groups: HTMLElement[] = [];
  for (let i = 0; i < shown; i += 5) {
    const count = Math.min(5, shown - i);
    const g = h('span', { class: `tally-group${count === 5 ? ' full' : ''}` });
    for (let j = 0; j < Math.min(4, count); j++) g.append(h('i'));
    groups.push(g);
  }
  return h(
    'span',
    { class: 'tally', role: 'img', 'aria-label': `${n} runs` },
    n > 0 ? groups : h('span', { class: 'tally-none' }, 'none yet'),
    n > shown ? h('span', { class: 'tally-more' }, `+${n - shown}`) : null,
  );
}
