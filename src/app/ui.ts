/**
 * Minimal DOM overlay toolkit for menus and cell screens. Panels are navigable with the
 * flipper buttons (left/right move focus, plunger/confirm activates), like a real machine's
 * service menu, as well as mouse, touch and gamepad.
 */

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children)
    if (c !== null && c !== undefined && c !== false)
      el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

export class UI {
  private panel: HTMLElement | null = null;
  /** Panels covered by push() (pause, settings), restored by pop(). */
  private readonly stack: HTMLElement[] = [];
  private toastTimer = 0;
  /** Called when any button is activated (for UI sounds). */
  onClick: (() => void) | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly toastEl: HTMLElement,
  ) {}

  get open(): boolean {
    return this.panel !== null;
  }

  show(el: HTMLElement): void {
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
    this.hide();
    this.mount(el);
    if (focusKey)
      el.querySelector<HTMLButtonElement>(`button[data-k="${focusKey}"]`)?.focus({
        preventScroll: true,
      });
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
    if (fresh) el.classList.add('fade');
    this.root.append(el);
    this.panel = el;
    if (fresh && !el.dataset.wired) {
      el.dataset.wired = '1';
      for (const b of Array.from(el.querySelectorAll('button')))
        b.addEventListener('click', () => this.onClick?.(), { capture: true });
    }
    const first =
      el.querySelector<HTMLButtonElement>('button.primary:not([disabled])') ??
      el.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    this.panel?.remove();
    this.panel = null;
  }

  /** Move focus among the panel's buttons (flipper-button navigation). */
  moveFocus(dir: number): void {
    if (!this.panel) return;
    const btns = Array.from(
      this.panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    );
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const n = btns[(i + dir + btns.length) % btns.length];
    n.focus({ preventScroll: true });
  }

  activate(): void {
    if (!this.panel) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && this.panel.contains(el) && el.tagName === 'BUTTON') el.click();
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }
}
