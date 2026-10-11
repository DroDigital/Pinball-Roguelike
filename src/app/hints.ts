/**
 * Hint notes: one at a time, bottom-left, never blocking play. Each shows once per save;
 * tap or click to dismiss early.
 */
import { HINTS, type HintId } from '../content/hints';

const MIN_MS = 5500;
/** Hints raised within this many ms belong to the same moment and queue. */
const SAME_MOMENT_MS = 250;
const MS_PER_CHAR = 65;

export class Hints {
  readonly el: HTMLElement;
  enabled = true;
  private readonly queue: HintId[] = [];
  private timer = 0;
  private lastShow = -1e9;

  constructor(
    parent: HTMLElement,
    private readonly seen: string[],
    private readonly onSeen: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'hint';
    this.el.addEventListener('pointerdown', () => this.next());
    parent.append(this.el);
  }

  /**
   * Show a hint the first time it comes up. Hints raised together queue; a new moment
   * replaces whatever is still waiting (it was never shown, so it comes back next time).
   */
  show(id: HintId): void {
    if (!this.enabled || this.seen.includes(id) || this.queue.includes(id)) return;
    const now = performance.now();
    const fresh = now - this.lastShow > SAME_MOMENT_MS;
    this.lastShow = now;
    if (fresh) this.queue.length = 0;
    this.queue.push(id);
    if (fresh || !this.el.classList.contains('on')) this.next();
  }

  private next(): void {
    window.clearTimeout(this.timer);
    const id = this.queue.shift();
    if (!id) {
      this.el.classList.remove('on');
      return;
    }
    this.seen.push(id);
    this.onSeen();
    const d = HINTS[id] as { text: string; touch?: string };
    const touch = matchMedia('(pointer: coarse)').matches;
    const text = (touch && d.touch) || d.text;
    this.el.replaceChildren();
    const tag = document.createElement('b');
    tag.textContent = 'NOTE';
    this.el.append(tag, text);
    this.el.classList.add('on');
    this.timer = window.setTimeout(() => this.next(), Math.max(MIN_MS, text.length * MS_PER_CHAR));
  }
}
