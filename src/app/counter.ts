/**
 * Animated numbers (count-up / count-down) and the shared reduced-motion switch.
 *
 * `countTo(el, value, opts)` eases an element's text from what it shows now to `value`.
 * Give it a `key` and a re-rendered panel counts on from the last value shown under that key.
 * `tickCounters(dt)` runs once per frame (the HUD calls it); tweens are pooled and the DOM is
 * only touched when the visible number changes, so a steady HUD costs nothing.
 */
const osReduce =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let settingReduce = false;

/** Reduced motion: the OS preference, or the player's "reduced flashing" setting. */
export function reducedMotion(): boolean {
  return settingReduce || !!osReduce?.matches;
}

export function setReducedMotion(on: boolean): void {
  settingReduce = on;
  document.body.classList.toggle('reduce-motion', reducedMotion());
}

export interface CountOpts {
  /** Animation length in ms (default 650). */
  ms?: number;
  /** Decimal places shown (default 0). */
  decimals?: number;
  /** Full control of the text; receives the eased value. */
  format?: (v: number) => string;
  /** Count on from the last value shown under this key (survives a panel re-render). */
  key?: string;
  /** Count from this value instead. */
  from?: number;
  /** Prefix (e.g. '+') kept in front of the number. */
  prefix?: string;
  /** Seconds to wait before starting. */
  delay?: number;
  /** Called on each visible step while counting (a tick sound). */
  onStep?: (v: number) => void;
}

interface Tween {
  el: HTMLElement;
  from: number;
  to: number;
  /** The value on screen now (a retarget continues from here). */
  cur: number;
  t: number;
  dur: number;
  delay: number;
  decimals: number;
  mult: number;
  prefix: string;
  last: number;
  format: ((v: number) => string) | null;
  onStep: ((v: number) => void) | null;
}

const remembered = new Map<string, number>();
const live: Tween[] = [];
const spare: Tween[] = [];

const nf = new Intl.NumberFormat('en-US');

/** Whole numbers with thousands separators (debts run into the tens of thousands). */
export function fmtInt(v: number): string {
  return nf.format(Math.round(v));
}

function text(
  v: number,
  decimals: number,
  prefix: string,
  format: ((v: number) => string) | null,
): string {
  return format
    ? format(v)
    : decimals > 0
      ? `${prefix}${v.toFixed(decimals)}`
      : `${prefix}${nf.format(Math.round(v))}`;
}

function show(
  el: HTMLElement,
  v: number,
  decimals: number,
  prefix: string,
  format: ((v: number) => string) | null,
): void {
  const t = text(v, decimals, prefix, format);
  if (el.textContent !== t) el.textContent = t;
}

/** Text width in `ch`: digits count one, separators and signs half (the stencil's are narrow). */
function chars(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++)
    w += text.charCodeAt(i) >= 48 && text.charCodeAt(i) <= 57 ? 1 : 0.5;
  return w;
}

/**
 * Hold the width of the longest number a count will show, right-aligned, so what sits beside
 * it (a coin icon) does not shuffle as digits are added on the way up.
 */
function reserve(el: HTMLElement, a: string, b: string): void {
  const w = Math.max(chars(a), chars(b));
  if (!el.classList.contains('count')) el.classList.add('count');
  const cur = Number(el.dataset.w ?? 0);
  if (w > cur || cur === 0) {
    el.dataset.w = String(w);
    el.style.minWidth = `${w}ch`;
  }
}

function tweenOn(el: HTMLElement): Tween | undefined {
  for (let i = 0; i < live.length; i++) if (live[i].el === el) return live[i];
  return undefined;
}

/** Ease the number in `el` to `value`. Call again to retarget. */
export function countTo(el: HTMLElement, value: number, opts: CountOpts = {}): void {
  const decimals = opts.decimals ?? 0;
  const prefix = opts.prefix ?? '';
  const format = opts.format ?? null;
  const key = opts.key ?? '';
  const known = key ? remembered.get(key) : undefined;
  let tw = tweenOn(el);
  const from = opts.from ?? tw?.cur ?? known ?? (el.dataset.v ? Number(el.dataset.v) : value);
  if (key) remembered.set(key, value);
  el.dataset.v = String(value);
  const ms = opts.ms ?? 650;
  reserve(el, text(from, decimals, prefix, format), text(value, decimals, prefix, format));
  if (reducedMotion() || from === value || ms <= 0) {
    if (tw) {
      live.splice(live.indexOf(tw), 1);
      spare.push(tw);
    }
    show(el, value, decimals, prefix, format);
    return;
  }
  if (!tw) {
    tw = spare.pop() ?? ({} as Tween);
    live.push(tw);
  }
  tw.el = el;
  tw.from = from;
  tw.to = value;
  tw.cur = from;
  tw.t = 0;
  tw.dur = Math.max(0.05, ms / 1000);
  tw.delay = opts.delay ?? 0;
  tw.decimals = decimals;
  tw.mult = Math.pow(10, decimals);
  tw.prefix = prefix;
  tw.last = Number.NaN;
  tw.format = format;
  tw.onStep = opts.onStep ?? null;
  show(el, from, decimals, prefix, format);
}

/** Jump straight to a value without animating (and remember it under `key`). */
export function setNumber(el: HTMLElement, value: number, opts: CountOpts = {}): void {
  countTo(el, value, { ...opts, from: value, ms: 0 });
}

/** Advance every running count. Call once per frame. */
export function tickCounters(dt: number): void {
  for (let i = live.length - 1; i >= 0; i--) {
    const tw = live[i];
    if (!tw.el.isConnected) {
      live.splice(i, 1);
      spare.push(tw);
      continue;
    }
    if (tw.delay > 0) {
      tw.delay -= dt;
      continue;
    }
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    // Ease-out cubic: fast at first, settling on the total.
    const e = 1 - Math.pow(1 - k, 3);
    const v = k >= 1 ? tw.to : tw.from + (tw.to - tw.from) * e;
    tw.cur = v;
    const step = Math.round(v * tw.mult);
    if (step !== tw.last) {
      tw.last = step;
      show(tw.el, v, tw.decimals, tw.prefix, tw.format);
      tw.onStep?.(v);
    }
    if (k >= 1) {
      live.splice(i, 1);
      spare.push(tw);
    }
  }
}
