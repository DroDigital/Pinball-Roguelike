import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notices, type NoticeKind } from '../../src/app/notices';

/** The few bits of DOM the notice center touches. */
class FakeEl {
  classes = new Set<string>();
  parent: FakeRoot | null = null;
  offsetWidth = 0;
  style = { setProperty: () => undefined };
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    contains: (c: string) => this.classes.has(c),
  };
  remove(): void {
    this.parent?.kids.delete(this);
    this.parent = null;
  }
}
class FakeRoot {
  kids = new Set<FakeEl>();
  append(el: FakeEl): void {
    el.parent = this;
    this.kids.add(el);
  }
}

const flags = { portrait: false, short: false, narrow: false };
const OUT_MS = 300;

function setup(menu = false) {
  const root = new FakeRoot();
  const state = { menu };
  const n = new Notices(root as unknown as HTMLElement, () => state.menu);
  const el = () => new FakeEl() as unknown as HTMLElement;
  const post = (kind: NoticeKind, ms = 3000, o: Partial<Parameters<Notices['post']>[0]> = {}) => {
    const e = el();
    n.post({ kind, el: e, ms, ...o });
    return e as unknown as FakeEl;
  };
  const shown = () => [...root.kids];
  return { n, root, post, shown, state };
}

describe('notice center', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flags.portrait = flags.short = flags.narrow = false;
    const g = globalThis as unknown as Record<string, unknown>;
    g.window = globalThis;
    g.matchMedia = (q: string) => ({
      get matches() {
        return q.includes('aspect')
          ? flags.portrait
          : q.includes('height')
            ? flags.short
            : flags.narrow;
      },
      addEventListener: () => undefined,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('fits three in play on a wide screen, two in a menu, one on a portrait phone', () => {
    expect(setup(false).n.capacity).toBe(3);
    expect(setup(true).n.capacity).toBe(2);
    flags.portrait = true;
    expect(setup(false).n.capacity).toBe(1);
    expect(setup(true).n.capacity).toBe(1);
  });

  it('a toast bumps a tip on a phone, and the tip comes back afterwards', () => {
    flags.portrait = true;
    const { post, shown } = setup();
    const tip = post('tip', 6000);
    expect(shown()).toEqual([tip]);
    const toast = post('toast', 1000);
    expect(shown()).toEqual([toast]);
    vi.advanceTimersByTime(1000 + OUT_MS);
    expect(shown()).toEqual([tip]);
  });

  it('shows one tip at a time and the next when it ends', () => {
    const { post, shown } = setup();
    const a = post('tip', 2000);
    const b = post('tip', 2000);
    expect(shown()).toEqual([a]);
    vi.advanceTimersByTime(2000 + OUT_MS);
    expect(shown()).toEqual([b]);
  });

  it('a new toast replaces the oldest toast when the slot is full', () => {
    flags.portrait = true;
    const { post, shown } = setup();
    post('toast', 5000);
    const second = post('toast', 5000);
    expect(shown()).toEqual([second]);
  });

  it('the same toast text nudges the one on screen instead of stacking', () => {
    const { post, shown } = setup();
    const a = post('toast', 2000, { key: 'same' });
    const b = post('toast', 2000, { key: 'same' });
    expect(shown()).toEqual([a]);
    expect(b.parent).toBeNull();
    expect(a.classes.has('bump')).toBe(true);
  });

  it('a gated tip waits until its gate opens', () => {
    const { n, post, shown } = setup();
    let open = false;
    const tip = post('tip', 5000, { gate: () => open });
    expect(shown()).toEqual([]);
    open = true;
    vi.advanceTimersByTime(500);
    expect(shown()).toEqual([tip]);
    void n;
  });

  it('dropWhere removes waiting tips and fades live ones, and reports they never showed', () => {
    flags.portrait = true;
    const { n, post, shown } = setup();
    const ended: boolean[] = [];
    post('caption', 5000, { key: 'caption' });
    post('tip', 5000, { key: 'jobs', onEnd: (s) => ended.push(s) });
    expect(shown().length).toBe(1);
    n.dropWhere('tip', (k) => k === 'jobs');
    expect(ended).toEqual([false]);
    vi.advanceTimersByTime(6000 + OUT_MS);
    expect(shown()).toEqual([]);
  });

  it('a caption replaces the previous caption', () => {
    const { post, shown } = setup();
    post('caption', 5000, { key: 'caption' });
    const next = post('caption', 5000, { key: 'caption' });
    expect(shown()).toEqual([next]);
  });
});
