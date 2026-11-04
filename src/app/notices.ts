/**
 * The notice center: toasts, tips and the Warden's captions share one reserved slot per layout
 * (see the notices section of styles.css), so a message never lands on a panel header, a HUD
 * card or the flippers. How many can be on screen at once depends on the room the layout has:
 * a wide menu fits a toast beside a note, a phone fits one at a time and the rest wait.
 *
 * A toast is feedback for something the player just did, so it jumps the queue; a caption comes
 * before a tip; tips run one at a time; whatever is bumped goes back to waiting with the time it
 * had left.
 */
export type NoticeKind = 'toast' | 'caption' | 'tip';

const PRIORITY: Record<NoticeKind, number> = { toast: 3, caption: 2, tip: 1 };
const OUT_MS = 260;
/** A bumped note comes back for at least this long. */
const MIN_RESUME_MS = 1800;
const PUMP_MS = 400;

export interface Notice {
  kind: NoticeKind;
  el: HTMLElement;
  ms: number;
  /** The same key replaces (a caption, a tip) or bumps (a toast) the one already up. */
  key?: string;
  /** Checked before it appears and while it is up; false puts it back in the queue. */
  gate?: () => boolean;
  /** First time it reaches the screen. */
  onShown?: () => void;
  /** However it ends: timed out, closed, or dropped before it was ever shown (`shown` false). */
  onEnd?: (shown: boolean) => void;
}

interface Item extends Notice {
  seq: number;
  left: number;
  at: number;
  timer: number;
  shown: boolean;
  live: boolean;
}

export interface NoticeHandle {
  close(): void;
}

export class Notices {
  private readonly live: Item[] = [];
  private waiting: Item[] = [];
  private seq = 0;
  private readonly portrait = matchMedia('(max-aspect-ratio: 6/5)');
  private readonly short = matchMedia('(max-height: 520px)');
  private readonly narrow = matchMedia('(max-width: 860px)');

  /** `menu` says whether a panel is up (menus and play have different slots). */
  constructor(
    readonly root: HTMLElement,
    private readonly menu: () => boolean,
  ) {
    for (const q of [this.portrait, this.short, this.narrow])
      q.addEventListener('change', () => this.pump());
    // Gates (a tip waiting for the plunger) and a panel opening change what fits.
    window.setInterval(() => this.pump(), PUMP_MS);
  }

  /** How many fit at once in the layout showing now. */
  get capacity(): number {
    if (this.portrait.matches) return 1;
    if (this.menu()) return this.narrow.matches || this.short.matches ? 1 : 2;
    return this.short.matches ? 2 : 3;
  }

  post(n: Notice): NoticeHandle {
    if (n.key) {
      const up = this.live.find((i) => i.kind === n.kind && i.key === n.key);
      if (up && n.kind === 'toast') {
        // The same message again: restart its clock and nudge it instead of stacking.
        window.clearTimeout(up.timer);
        up.left = n.ms;
        up.at = performance.now();
        up.el.classList.remove('out', 'bump');
        void up.el.offsetWidth;
        up.el.classList.add('bump');
        up.timer = window.setTimeout(() => this.end(up), n.ms);
        return { close: () => this.end(up) };
      }
      if (up) this.end(up, true);
      this.waiting = this.waiting.filter((w) => {
        const same = w.kind === n.kind && w.key === n.key;
        if (same) w.onEnd?.(false);
        return !same;
      });
    }
    const item: Item = {
      ...n,
      seq: this.seq++,
      left: n.ms,
      at: 0,
      timer: 0,
      shown: false,
      live: false,
    };
    this.waiting.push(item);
    this.pump();
    return { close: () => this.end(item) };
  }

  /** Drop every notice of a kind (live ones fade, waiting ones never appear). */
  clear(kind: NoticeKind): void {
    for (const i of this.live.filter((l) => l.kind === kind)) this.end(i);
    this.drop((w) => w.kind === kind);
  }

  /** Drop the waiting notices `test` picks, and fade the live ones it picks. */
  dropWhere(kind: NoticeKind, test: (key: string) => boolean): void {
    for (const i of this.live.filter((l) => l.kind === kind && l.key && test(l.key))) this.end(i);
    this.drop((w) => w.kind === kind && !!w.key && test(w.key));
  }

  private drop(test: (w: Item) => boolean): void {
    this.waiting = this.waiting.filter((w) => {
      const gone = test(w);
      if (gone) w.onEnd?.(false);
      return !gone;
    });
  }

  private ok(i: Item): boolean {
    return !i.gate || i.gate();
  }

  /** The least important live notice (the oldest of its kind). */
  private lowest(): Item | null {
    let v: Item | null = null;
    for (const l of this.live)
      if (!v || PRIORITY[l.kind] < PRIORITY[v.kind] || (l.kind === v.kind && l.seq < v.seq)) v = l;
    return v;
  }

  /** The live notice a newcomer of this kind may bump, if any. */
  private victimFor(kind: NoticeKind): Item | null {
    // A new toast takes the place of an older one before it displaces a note.
    if (kind === 'toast') {
      const t = this.live.find((l) => l.kind === 'toast');
      if (t) return t;
    }
    const v = this.lowest();
    return v && PRIORITY[kind] > PRIORITY[v.kind] ? v : null;
  }

  private pump(): void {
    const cap = this.capacity;
    // The layout shrank (a panel opened over play): the least important step aside.
    for (const l of this.live.slice()) if (!this.ok(l)) this.suspend(l);
    while (this.live.length > cap) this.suspend(this.lowest()!);
    for (let guard = 0; guard < 12; guard++) {
      let next: Item | null = null;
      // Tips come one at a time, however much room there is.
      const tipUp = this.live.some((l) => l.kind === 'tip');
      for (const w of this.waiting) {
        if (!this.ok(w) || (tipUp && w.kind === 'tip')) continue;
        if (
          !next ||
          PRIORITY[w.kind] > PRIORITY[next.kind] ||
          (w.kind === next.kind && w.seq < next.seq)
        )
          next = w;
      }
      if (!next) return;
      if (this.live.length >= cap) {
        const v = this.victimFor(next.kind);
        if (!v) return;
        this.suspend(v);
      }
      this.waiting.splice(this.waiting.indexOf(next), 1);
      this.show(next);
    }
  }

  private show(i: Item): void {
    i.live = true;
    i.at = performance.now();
    i.el.classList.remove('out');
    i.el.style.setProperty('--note-ms', `${i.left}ms`);
    this.root.append(i.el);
    this.live.push(i);
    i.timer = window.setTimeout(() => this.end(i), i.left);
    if (!i.shown) {
      i.shown = true;
      i.onShown?.();
    }
  }

  /** Take a live notice off screen and, unless it is a toast, queue it for the time it has left. */
  private suspend(i: Item): void {
    if (i.kind === 'toast') {
      this.end(i, true);
      return;
    }
    window.clearTimeout(i.timer);
    this.live.splice(this.live.indexOf(i), 1);
    i.live = false;
    i.left = Math.max(MIN_RESUME_MS, i.left - (performance.now() - i.at));
    i.el.remove();
    this.waiting.push(i);
  }

  private end(i: Item, quick = false): void {
    const at = this.live.indexOf(i);
    if (at < 0) {
      // Closed while waiting.
      const w = this.waiting.indexOf(i);
      if (w >= 0) {
        this.waiting.splice(w, 1);
        i.onEnd?.(false);
      }
      return;
    }
    window.clearTimeout(i.timer);
    this.live.splice(at, 1);
    i.live = false;
    if (quick) i.el.remove();
    else {
      i.el.classList.add('out');
      window.setTimeout(() => i.el.remove(), OUT_MS);
    }
    i.onEnd?.(true);
    this.pump();
  }
}
