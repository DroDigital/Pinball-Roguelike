/**
 * The UI kit: buttons with key hints, cards, chips, currency amounts, meters, stat tiles and
 * the panel frame every screen uses. Pure DOM builders; the look lives in styles.css.
 */
import { h } from './ui';
import { icon, type IconName } from './icons';
import { fmtInt } from './counter';
import type { MenuCue } from './cues';
import type { Action } from './input';

export type Content = Node | string | null | undefined | false;
export type Contents = Content | Content[];

// ------------------------------------------------------------------ key hints

let bindingsOf: (() => Record<Action, string[]>) | null = null;

/** Lets key hints follow the player's remapped keys. */
export function setKeyBindings(get: () => Record<Action, string[]>): void {
  bindingsOf = get;
}

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

/** The first key bound to an action, as printed on a key cap. */
export function keyFor(a: Action, index = 0): string {
  const codes = bindingsOf?.()[a] ?? [];
  const code = codes[index] ?? codes[0];
  return code ? keyName(code) : '';
}

export function kbd(label: string): HTMLElement {
  return h('kbd', { class: 'kbd', 'aria-hidden': 'true' }, label);
}

// ------------------------------------------------------------------ buttons and cards

export interface BtnOpts {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  /** Key cap shown on the button (hidden on touch screens). */
  key?: string | null;
  /** A second line under the label (a cost, an effect). */
  sub?: Contents;
  disabled?: boolean;
  /** Why a disabled button is disabled; shown when it is pressed. */
  why?: string;
  cue?: MenuCue;
  /** Focus key: the button keeps focus when its panel re-renders. */
  k?: string;
  class?: string;
  title?: string;
  block?: boolean;
  onclick?: (e: MouseEvent) => void;
}

/**
 * A locked button stays clickable (and focusable by mouse) so it can say why it is locked;
 * the UI layer plays the error cue and shows the reason instead of running the action.
 */
function lockAttrs(o: { disabled?: boolean; why?: string }): Record<string, unknown> {
  return o.disabled ? { 'aria-disabled': 'true', 'data-why': o.why } : {};
}

export function btn(label: Contents, o: BtnOpts = {}): HTMLButtonElement {
  const variant = o.variant ?? 'secondary';
  const el = h(
    'button',
    {
      type: 'button',
      class: `btn ${variant}${o.block ? ' block' : ''}${
        o.disabled ? ' is-disabled' : ''
      }${o.class ? ` ${o.class}` : ''}`,
      title: o.title,
      'data-k': o.k,
      'data-cue': o.cue,
      onclick: (e: MouseEvent) => {
        if (!o.disabled) o.onclick?.(e);
      },
      ...lockAttrs(o),
    },
    h(
      'span',
      { class: 'btn-body' },
      h(
        'span',
        { class: 'btn-main' },
        o.icon ? icon(o.icon, 'btn-ico') : null,
        h('span', { class: 'btn-label' }, label),
      ),
      o.sub ? h('span', { class: 'btn-sub' }, o.sub) : null,
    ),
    o.key ? kbd(o.key) : null,
  );
  return el;
}

export interface CardOpts {
  class?: string;
  /** Default focus target and the recommended choice. */
  primary?: boolean;
  disabled?: boolean;
  why?: string;
  cue?: MenuCue;
  k?: string;
  title?: string;
  /** CSS colour for the card's accent edge (rarity, red for a bargain). */
  accent?: string;
  onclick?: (e: MouseEvent) => void;
}

/** A whole-card button: a job, a perk, a charm, a number of balls. */
export function card(children: Contents, o: CardOpts = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      class: `card stagger${o.primary ? ' primary' : ''}${o.disabled ? ' is-disabled' : ''}${
        o.class ? ` ${o.class}` : ''
      }`,
      title: o.title,
      'data-k': o.k,
      'data-cue': o.cue,
      style: o.accent ? { '--accent': o.accent } : undefined,
      onclick: (e: MouseEvent) => {
        if (!o.disabled) o.onclick?.(e);
      },
      ...lockAttrs(o),
    },
    children,
  );
}

// ------------------------------------------------------------------ chips, currency, tiles

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

export type Currency = 'coin' | 'ticket' | 'key';

/** A number with its currency icon: 12 [coin]. */
export function amount(
  kind: Currency,
  value: number | string,
  o: { sign?: boolean; big?: boolean; class?: string } = {},
): HTMLElement {
  const text =
    typeof value === 'number' ? `${o.sign && value > 0 ? '+' : ''}${fmtInt(value)}` : value;
  return h(
    'span',
    { class: `amt amt-${kind}${o.big ? ' big' : ''}${o.class ? ` ${o.class}` : ''}` },
    h('span', { class: 'amt-n' }, text),
    icon(kind, 'amt-ico'),
  );
}

export interface StatOpts {
  label: string;
  value: Contents;
  icon?: IconName;
  tone?: 'plain' | 'gold' | 'red' | 'green' | 'teal';
  sub?: Contents;
  class?: string;
}

export function stat(o: StatOpts): HTMLElement {
  return h(
    'div',
    { class: `stat stagger tone-${o.tone ?? 'plain'}${o.class ? ` ${o.class}` : ''}` },
    h('span', { class: 'stat-label' }, o.icon ? icon(o.icon) : null, o.label),
    h('span', { class: 'stat-value' }, o.value),
    o.sub ? h('span', { class: 'stat-sub' }, o.sub) : null,
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

/** The Warden (or anyone) speaking: a typed slip of paper. */
export function quote(who: string, text: string, cls = ''): HTMLElement {
  return h(
    'figure',
    { class: `quote${cls ? ` ${cls}` : ''}` },
    h('blockquote', null, `“${text}”`),
    h('figcaption', null, who),
  );
}

/** Scratches on the wall: groups of five (four strokes and a strike). */
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

// ------------------------------------------------------------------ the panel frame

export interface PanelOpts {
  /** Identifies the screen: showing it again swaps in place instead of replaying the entrance. */
  screen: string;
  tone?: 'default' | 'red';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  eyebrow?: Contents;
  title?: Contents;
  titleIcon?: IconName;
  lede?: Contents;
  body: Contents;
  /** Footer actions, secondary first and the primary last. */
  foot?: Contents;
  /** Show the "move / select" key hints beside the actions. */
  navHint?: boolean;
  class?: string;
  /** Text-only title for assistive tech when `title` is a node. */
  label?: string;
}

/** How to drive the menus, from the player's own bindings. */
export function navHint(): HTMLElement {
  const l = keyFor('left');
  const r = keyFor('right');
  const sel = keyFor('plunger');
  return h(
    'div',
    { class: 'navhint' },
    h('span', null, kbd(l), kbd(r), ' move'),
    h('span', null, kbd(sel), ' select'),
  );
}

export function panel(o: PanelOpts): HTMLElement {
  const head =
    o.eyebrow || o.title || o.lede
      ? h(
          'header',
          { class: 'panel-head' },
          o.eyebrow ? h('div', { class: 'eyebrow' }, o.eyebrow) : null,
          o.title
            ? h(
                'h2',
                { class: 'panel-title' },
                o.titleIcon ? icon(o.titleIcon, 'title-ico') : null,
                o.title,
              )
            : null,
          o.lede ? h('p', { class: 'lede' }, o.lede) : null,
        )
      : null;
  return h(
    'div',
    {
      class: `panel size-${o.size ?? 'md'} tone-${o.tone ?? 'default'}${o.class ? ` ${o.class}` : ''}`,
      'data-screen': o.screen,
      role: 'dialog',
      'aria-label': o.label ?? (typeof o.title === 'string' ? o.title : o.screen),
    },
    head,
    h('div', { class: 'panel-body scroll' }, o.body),
    o.foot || o.navHint !== false
      ? h(
          'footer',
          { class: 'panel-foot' },
          o.navHint === false ? null : navHint(),
          o.foot ? h('div', { class: 'actions' }, o.foot) : null,
        )
      : null,
  );
}

/** A labelled group inside a panel body. */
export function section(
  title: Contents,
  body: Contents,
  o: { class?: string; aside?: Contents } = {},
): HTMLElement {
  return h(
    'section',
    { class: `section${o.class ? ` ${o.class}` : ''}` },
    h(
      'div',
      { class: 'section-head' },
      h('h3', null, title),
      o.aside ? h('span', { class: 'aside' }, o.aside) : null,
    ),
    body,
  );
}
