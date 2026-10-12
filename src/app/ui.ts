/**
 * DOM overlay toolkit for menus and cell screens. Panels are navigable with the flipper
 * buttons (left/right move focus, plunger/confirm activates), like a real machine's service
 * menu, as well as mouse, touch and gamepad. The panel stack (push/pop/replace) and the
 * focus semantics are the contract the game flow relies on; everything else is look and feel.
 */
import type { MenuCue } from './cues';
import { icon, type IconName } from './icons';
import { reducedMotion } from './counter';
import type { Notices } from './notices';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') {
        // Custom properties (--rar) need setProperty; Object.assign would drop them.
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else (el.style as unknown as Record<string, unknown>)[sk] = sv;
        }
      } else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  const add = (c: Child | Child[]): void => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c !== null && c !== undefined && c !== false)
      el.append(c instanceof Node ? c : document.createTextNode(c));
  };
  children.forEach(add);
  return el;
}

export type ToastKind = 'info' | 'good' | 'bad' | 'warn' | 'unlock';

const TOAST_ICON: Record<ToastKind, IconName | null> = {
  info: null,
  good: 'check',
  bad: 'warn',
  warn: 'warn',
  unlock: 'trophy',
};
/** A hover sound is skipped inside this window (mouse sweeps). */
const HOVER_CUE_MS = 90;

/**
 * Locked buttons stay focusable so the flippers and the gamepad can reach them: pressing one
 * runs the error cue and says why (see the click handler). They come after the usable ones.
 */
const FOCUSABLE = 'button:not([disabled]):not([data-nofocus])';
const isLocked = (b: Element): boolean => b.getAttribute('aria-disabled') === 'true';

export class UI {
  private panel: HTMLElement | null = null;
  /** Panels covered by push() (pause, settings), restored by pop(). */
  private readonly stack: HTMLElement[] = [];
  /** Called with the cue to play for a UI interaction (move, select, buy, ...). */
  onCue: ((cue: MenuCue) => void) | null = null;
  private hovered: Element | null = null;
  private hoverAt = 0;
  private enterTimer = 0;

  constructor(
    readonly root: HTMLElement,
    readonly notices: Notices,
  ) {
    // One delegated listener for every panel: sounds, and the reason a locked button is locked.
    root.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element | null)?.closest('button');
        if (!b || !root.contains(b)) return;
        if (isLocked(b)) {
          e.stopPropagation();
          e.preventDefault();
          this.cue('error');
          this.shake(b);
          const why = b.dataset.why;
          if (why) this.toast(why, 2600, 'warn');
          return;
        }
        this.cue((b.dataset.cue as MenuCue | undefined) ?? 'select');
      },
      true,
    );
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = (e.target as Element | null)?.closest('button');
      if (!b || b === this.hovered || !this.panel?.contains(b)) return;
      this.hovered = b;
      const now = performance.now();
      if (now - this.hoverAt > HOVER_CUE_MS && !isLocked(b)) {
        this.hoverAt = now;
        this.cue('hover');
      }
    });
    root.addEventListener('pointerleave', () => (this.hovered = null));
    window.addEventListener('resize', () =>
      this.panel?.querySelector<HTMLElement>('.scroll')?.dispatchEvent(new Event('scroll')),
    );
    // The focus ring shows for keyboard, flipper and gamepad navigation, not for the mouse.
    window.addEventListener('pointerdown', () => root.classList.remove('nav'), { capture: true });
  }

  get open(): boolean {
    return this.panel !== null;
  }

  cue(c: MenuCue): void {
    this.onCue?.(c);
  }

  /** Show a panel. The same screen again (a re-render after buying) swaps in place. */
  show(el: HTMLElement): void {
    const cur = this.panel;
    if (
      cur &&
      el.dataset.screen &&
      cur.dataset.screen === el.dataset.screen &&
      !this.stack.length
    ) {
      this.replace(el, this.focusKey());
      return;
    }
    this.hide();
    this.stack.length = 0;
    this.mount(el);
  }

  /** Show a panel over the current one (or over play). */
  push(el: HTMLElement): void {
    if (this.panel) {
      this.stack.push(this.panel);
      this.panel.remove();
      this.panel = null;
    }
    this.mount(el);
  }

  /** Swap the top panel in place (a panel re-rendering itself), keeping the stack. */
  replace(el: HTMLElement, focusKey?: string | null): void {
    const scroll = this.panel?.querySelector<HTMLElement>('.scroll')?.scrollTop ?? 0;
    this.hide();
    this.mount(el, false);
    const sc = el.querySelector<HTMLElement>('.scroll');
    if (sc && scroll) sc.scrollTop = scroll;
    const f = focusKey
      ? el.querySelector<HTMLButtonElement>(`button[data-k="${focusKey}"]:not([disabled])`)
      : null;
    if (f) f.focus({ preventScroll: true });
  }

  /** Close the top panel and bring back the one beneath (if any). */
  pop(): void {
    this.hide();
    const prev = this.stack.pop();
    if (prev) this.mount(prev, false);
  }

  /** The panel on screen (to show it again later). */
  get current(): HTMLElement | null {
    return this.panel;
  }

  get depth(): number {
    return this.stack.length;
  }

  /** The focused button's data-k (to keep focus across a re-render). */
  focusKey(): string | null {
    const el = document.activeElement as HTMLElement | null;
    return el && this.panel?.contains(el) ? (el.dataset.k ?? null) : null;
  }

  private mount(el: HTMLElement, fresh = true): void {
    window.clearTimeout(this.enterTimer);
    if (fresh) {
      let i = 0;
      for (const c of Array.from(el.querySelectorAll<HTMLElement>('.stagger')))
        c.style.setProperty('--i', String(i++));
      el.classList.add('enter');
      this.enterTimer = window.setTimeout(() => el.classList.remove('enter'), 1400);
    }
    this.root.append(el);
    this.panel = el;
    this.watchScroll(el);
    // Start on the primary action, else the first button that works, else any button.
    const first =
      el.querySelector<HTMLButtonElement>(`button.primary:not([disabled]):not([aria-disabled])`) ??
      el.querySelector<HTMLButtonElement>(`${FOCUSABLE}:not([aria-disabled="true"])`) ??
      el.querySelector<HTMLButtonElement>(FOCUSABLE);
    if (first) {
      first.focus({ preventScroll: true });
      // A new screen shows what Enter would do; a re-render keeps whatever mode it was in.
      if (fresh) this.root.classList.add('nav');
    }
  }

  hide(): void {
    this.panel?.remove();
    this.panel = null;
  }

  /** Fade the edge of a scrolling panel body that has more beyond it (a hint to scroll). */
  private watchScroll(el: HTMLElement): void {
    const sc = el.querySelector<HTMLElement>('.scroll');
    if (!sc) return;
    const update = (): void => {
      sc.classList.toggle('more-below', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
      sc.classList.toggle('more-above', sc.scrollTop > 4);
      // A panel that scrolls shows its jump row (the shop) and says so.
      el.classList.toggle('scrolls', sc.scrollHeight > sc.clientHeight + 4);
    };
    sc.addEventListener('scroll', update, { passive: true });
    requestAnimationFrame(update);
    // Fonts arriving or a count-up settling can change the height a moment later.
    window.setTimeout(update, 500);
  }

  /** Move focus among the panel's buttons (flipper-button navigation). */
  moveFocus(dir: number): void {
    if (!this.panel) return;
    const all = Array.from(this.panel.querySelectorAll<HTMLButtonElement>(FOCUSABLE));
    // Usable buttons first (in reading order), locked ones after them.
    const btns = all.filter((b) => !isLocked(b)).concat(all.filter(isLocked));
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const n = btns[(i + dir + btns.length) % btns.length];
    this.root.classList.add('nav');
    n.focus({ preventScroll: true });
    n.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    this.cue('move');
  }

  activate(): void {
    if (!this.panel) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && this.panel.contains(el) && el.tagName === 'BUTTON') {
      // A programmatic click has no :active state, so give the press its own beat.
      el.classList.add('is-pressed');
      window.setTimeout(() => el.classList.remove('is-pressed'), 150);
      el.click();
    }
  }

  /** A short shake on an element that refused (a locked button). */
  shake(el: Element): void {
    el.classList.remove('shake');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('shake');
    window.setTimeout(() => el.classList.remove('shake'), 420);
  }

  /** A message in the notice slot; it fades by itself. The same text again just nudges. */
  toast(content: string | HTMLElement, ms = 2200, kind: ToastKind = 'info'): void {
    const text = typeof content === 'string' ? content : (content.textContent ?? '');
    const ic = TOAST_ICON[kind];
    const el = h(
      'div',
      { class: `toast ${kind}`, role: 'status' },
      ic ? icon(ic, 'toast-ico') : null,
      typeof content === 'string' ? h('span', { class: 'toast-text' }, content) : content,
    );
    this.notices.post({ kind: 'toast', el, ms, key: text });
  }
}
