/**
 * Hint notes: small paper notes in the notice slot (never over the flippers or the HUD). Each
 * shows once per save, and only on the screens it is about: when the game moves on, a note that
 * is still waiting is dropped (it was never seen, so it comes back next time) and one that is up
 * fades. It dismisses itself, or on its close button.
 */
import { HINTS, type HintId } from '../content/hints';
import type { Notices } from './notices';
import { h } from './ui';

const MIN_MS = 4500;
const MAX_MS = 9000;
const MS_PER_CHAR = 55;

/** The modes (see AppMode) each hint belongs to. */
const WHERE: Record<HintId, readonly string[]> = {
  flippers: ['play'],
  plunger: ['play'],
  nudge: ['play'],
  pocket: ['ballEnd'],
  jobs: ['jobs'],
  buy: ['buy'],
  atm: ['atm'],
  shop: ['shop'],
  phone: ['phone'],
  redCall: ['phone'],
  knock: ['knock'],
  lockup: ['play'],
  riot: ['play'],
  sentence: ['jobs'],
  keys: ['play'],
  actives: ['play'],
};

export class Hints {
  enabled = true;
  /** Set by the game: false while a note would land where the player is looking (play). */
  gate: (() => boolean) | null = null;
  private readonly pending = new Set<HintId>();

  constructor(
    private readonly notices: Notices,
    private readonly seen: string[],
    private readonly onSeen: () => void,
  ) {}

  /** Show a hint the first time it comes up; notes raised together queue in order. */
  show(id: HintId): void {
    if (!this.enabled || this.seen.includes(id) || this.pending.has(id)) return;
    const d = HINTS[id] as { text: string; touch?: string };
    const text = (matchMedia('(pointer: coarse)').matches && d.touch) || d.text;
    const ms = Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHAR));
    this.pending.add(id);
    const close = h(
      'button',
      { type: 'button', class: 'note-x', 'aria-label': 'Dismiss tip' },
      '×',
    );
    const el = h(
      'div',
      { class: 'note tip', role: 'status' },
      h('b', { class: 'note-tag' }, 'Tip'),
      h('span', { class: 'note-text' }, text),
      close,
    );
    const handle = this.notices.post({
      kind: 'tip',
      key: id,
      el,
      ms,
      gate: () => !this.gate || this.gate(),
      onShown: () => {
        this.seen.push(id);
        this.onSeen();
      },
      onEnd: () => this.pending.delete(id),
    });
    close.addEventListener('click', () => handle.close());
    // A mouse can dismiss with a click anywhere on the note; touch uses the close button.
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') handle.close();
    });
  }

  /** The game moved to another screen: notes about the old one go. */
  modeChanged(mode: string): void {
    this.notices.dropWhere('tip', (id) => !WHERE[id as HintId]?.includes(mode));
  }
}
