/**
 * The play HUD. Landscape: two columns in the margins beside the table (DMD, debt meter and
 * Pocket on the left; deadline, balls, Job and charms on the right). Portrait phones: a compact
 * band above and below the table. Between rounds a slim status ribbon replaces the columns.
 * Nothing here ever sits over the playfield.
 *
 * Juice hooks for later passes:
 *  - `count(el, value, opts)` / `bump(el)`: animated numbers and a pulse on any element
 *  - `banner(text, opts)`: big event text in the banner layer
 *  - `comboSlot`: the combo meter's container (filled here, free to restyle)
 *  - the cached fields below mean `update` only touches the DOM when a number changes
 */
import './hud.css';
import { h } from './ui';
import { icon } from './icons';
import { countTo, tickCounters, fmtInt, reducedMotion } from './counter';
import { meter, setMeter, bar, pips, ballPips, chip } from './widgets';
import { formatCoins } from '../present/pops';
import { jobDef, jobText } from '../content/jobs';
import { charmDef, RARITY_COLORS } from '../content/charms';
import { JAILBREAK } from '../content/balance';
import { comboName } from '../rules/combo';
import { jailbreakLit, roundsIn, sentenceActive, type RunState } from '../rules/run';
import { Lamp } from '../rules/types';
import type { BallSession } from '../rules/session';
import type { TableGame } from '../rules/table-game';
import type { Action } from './input';

export type HudLayout = 'off' | 'dmd' | 'columns' | 'ribbon';

export interface BannerOpts {
  sub?: string;
  tone?: 'gold' | 'red' | 'green' | 'plain';
  /** Visible time in ms (default 1600). */
  ms?: number;
}

export interface HudHandlers {
  press(a: Action): void;
  release(a: Action): void;
}

const MAX_BANNERS = 3;

// Slots in `Hud.mem`: one per displayed value (see `changed`).
const S_DEBT = 0;
const S_BANK = 1;
const S_POCKET = 2;
const S_EARN = 3;
const S_DEADLINE = 4;
const S_ROUND = 5;
const S_BALLS = 6;
const S_SENTENCE = 7;
const S_BONUS = 8;
const S_LUCK = 9;
const S_COMBO = 10;
const S_COMBOFILL = 11;
const S_JOB = 12;
const S_JOBPROG = 13;
const S_JB = 14;
const S_ACTIVE = 15;
const S_RES = 16;
const S_TIP = 17;
const S_METER = 18;
const S_PLUNGER = 19;
const S_MARK = 20;
const S_RIBBON_RES = 21;
const S_CHARMS = 22;
const SLOTS = 23;

export class Hud {
  /** The combo meter's container: filled by `update`, free for a later pass to restyle. */
  readonly comboSlot: HTMLElement;
  /** Where big event text goes (see `banner`). */
  readonly bannerLayer: HTMLElement;

  private readonly cols: HTMLElement;
  private readonly ribbon: HTMLElement;
  private readonly plunger: HTMLElement;
  private readonly plungerFill: HTMLElement;
  private readonly plungerMark: HTMLElement;
  private layout: HudLayout | '' = '';

  // Left column.
  private readonly debtN = h('span', { class: 'n' }, '0');
  private readonly debtLabel = h('span', { class: 'ledger-label' }, icon('debt'), 'Debt');
  private readonly meterEl = meter('big');
  private readonly bankN = h('b', null, '0');
  private readonly pocketN = h('b', null, '0');
  private readonly needText = h('span', { class: 'lg lg-need' });
  private readonly pocketBig = h('span', { class: 'pocket-n' }, '0');
  private readonly earnEl = h('span', { class: 'pocket-earn' });
  private readonly bonusChip = chip('', 'gold', { icon: 'star', class: 'chip-bonus' });
  private readonly luckChip = chip('', 'good', { icon: 'bolt', class: 'chip-luck' });
  private readonly chips = h('div', { class: 'hc-chips' }, this.bonusChip, this.luckChip);
  private readonly comboName = h('span', { class: 'combo-name' });
  private readonly comboMult = h('span', { class: 'combo-mult' });
  private readonly comboFill = h('span', { class: 'combo-fill' });

  // Right column.
  private readonly deadlineEl = h('span', { class: 'round-deadline' });
  private readonly roundEl = h('span', { class: 'round-round' });
  private readonly ballsEl = h('span', { class: 'round-balls' });
  private readonly sentenceEl = chip('Sentence round', 'bad', {
    icon: 'warn',
    class: 'hc-sentence',
  });
  private readonly jobCard = h('div', { class: 'hc-card hc-job' });
  private readonly jobTitle = h('span', { class: 'job-title' });
  private readonly jobCount = h('span', { class: 'job-count' });
  private jobFill = bar(0, 'job-bar');
  private readonly jbCard = h('div', { class: 'hc-card hc-jb' });
  private readonly activesCard = h('div', { class: 'hc-card hc-actives' });
  private readonly charmsCard = h('div', { class: 'hc-card hc-charms' });
  private readonly resEl = h('div', { class: 'hc-res' });
  private readonly tipEl = h(
    'div',
    { class: 'hc-tip' },
    icon('key'),
    'Tunnel: Cell Block, top to bottom',
  );

  // Ribbon.
  private readonly rbDeadline = h('span', { class: 'rb-deadline' });
  private readonly rbRound = h('span', { class: 'rb-round' });
  private readonly rbDebt = h('span', { class: 'n' }, '0');
  private readonly rbMeter = meter('slim');
  private readonly rbBank = h('b', null, '0');
  private readonly rbPocket = h('b', null, '0');
  private readonly rbNeed = h('span', { class: 'rb-need' });
  private readonly rbRes = h('div', { class: 'rb-res' });

  // What is on screen now: the DOM is only touched when one of these changes. Numbers only,
  // so a steady HUD allocates nothing (see `changed`).
  private readonly mem = new Float64Array(4 * SLOTS).fill(Number.NaN);
  private cJobId = '\0';
  private lastPocket = -1;
  private cPlay = false;
  private bannerCount = 0;

  constructor(
    readonly root: HTMLElement,
    dmd: HTMLCanvasElement,
    on: HudHandlers,
  ) {
    dmd.classList.add('dmd');
    this.comboSlot = h(
      'div',
      { class: 'hc-combo', 'data-slot': 'combo', 'aria-live': 'off' },
      h('div', { class: 'combo-top' }, this.comboName, this.comboMult),
      h('div', { class: 'combo-bar' }, this.comboFill),
    );
    this.pocketBig.dataset.hud = 'pocket';
    this.debtN.dataset.hud = 'debt';

    const ledger = h(
      'div',
      { class: 'hc-card hc-ledger' },
      h(
        'div',
        { class: 'ledger-head' },
        this.debtLabel,
        h('span', { class: 'ledger-debt' }, this.debtN, icon('coin', 'amt-ico')),
      ),
      this.meterEl,
      h(
        'div',
        { class: 'ledger-legend' },
        h('span', { class: 'lg lg-bank' }, icon('bank'), this.bankN, ' banked'),
        h('span', { class: 'lg lg-pocket' }, icon('pocket'), this.pocketN, ' pocket'),
        this.needText,
      ),
    );
    const pocket = h(
      'div',
      { class: 'hc-card hc-pocket' },
      h('span', { class: 'pocket-label' }, 'Pocket'),
      h('span', { class: 'pocket-row' }, this.pocketBig, icon('coin', 'amt-ico')),
      this.earnEl,
    );
    const left = h(
      'div',
      { class: 'hc-left' },
      h('div', { class: 'hc-dmd' }, dmd),
      ledger,
      pocket,
      this.chips,
      this.comboSlot,
    );

    const round = h(
      'div',
      { class: 'hc-card hc-round' },
      h('div', { class: 'round-top' }, this.deadlineEl, this.roundEl),
      this.ballsEl,
      this.sentenceEl,
    );
    this.jobCard.append(
      h('div', { class: 'job-head' }, icon('job'), this.jobTitle),
      this.jobFill,
      this.jobCount,
    );
    const right = h(
      'div',
      { class: 'hc-right' },
      round,
      this.jobCard,
      this.jbCard,
      this.activesCard,
      this.charmsCard,
      this.resEl,
      this.tipEl,
    );
    this.cols = h('div', { class: 'hud-cols' }, left, right);

    this.ribbon = h(
      'div',
      { class: 'hud-ribbon' },
      h('div', { class: 'rb-block rb-where' }, this.rbDeadline, this.rbRound),
      h(
        'div',
        { class: 'rb-block rb-ledger' },
        h(
          'div',
          { class: 'rb-ledger-top' },
          h('span', { class: 'ledger-label' }, icon('debt'), 'Debt ', this.rbDebt),
          h(
            'span',
            { class: 'rb-legend' },
            h('span', { class: 'lg lg-bank' }, icon('bank'), this.rbBank, ' banked'),
            h('span', { class: 'lg lg-pocket' }, icon('pocket'), this.rbPocket, ' pocket'),
            this.rbNeed,
          ),
        ),
        this.rbMeter,
      ),
      this.rbRes,
    );

    this.plungerFill = h('i');
    this.plungerMark = h('em', { style: { bottom: '50%' } });
    this.plunger = h('div', { class: 'hud-plunger' }, this.plungerFill, this.plungerMark);

    const hold = (a: Action) => ({
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        on.press(a);
      },
      onpointerup: () => on.release(a),
      onpointerleave: () => on.release(a),
      onpointercancel: () => on.release(a),
    });
    const touch = h(
      'div',
      { class: 'hud-touch touch-lockbar' },
      h(
        'button',
        {
          class: 'touch-btn',
          'data-touch': 'lockbar',
          'aria-label': 'Lockbar',
          ...hold('lockbar'),
        },
        icon('bolt'),
        h('span', { class: 'touch-label' }, 'Lockbar'),
      ),
      h(
        'button',
        { class: 'touch-btn pause', 'aria-label': 'Pause', ...hold('pause') },
        icon('pause'),
      ),
    );
    root.append(this.cols, this.ribbon, this.plunger, touch);
    this.trackBands(ledger, right);

    this.bannerLayer = h('div', { id: 'banner', 'aria-live': 'polite' });
    document.body.append(this.bannerLayer);
    this.ribbon.hidden = true;
    for (const el of [
      this.jobCard,
      this.jbCard,
      this.activesCard,
      this.charmsCard,
      this.resEl,
      this.tipEl,
      this.sentenceEl,
      this.bonusChip,
      this.luckChip,
    ])
      el.hidden = true;
  }

  /**
   * Publish where the HUD's bands end (`--band-bottom` under the portrait play band,
   * `--ribbon-h` under the between-rounds ribbon) so notes and panels sit just clear of them
   * at any text size. Observers fire on size changes only, never per frame.
   */
  private trackBands(ledger: HTMLElement, right: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    const css = document.documentElement.style;
    const measure = (el: HTMLElement, name: string, extra: number): void => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) css.setProperty(name, `${Math.ceil(r.bottom + extra)}px`);
    };
    new ResizeObserver(() => measure(ledger, '--band-bottom', 0)).observe(ledger);
    new ResizeObserver(() => measure(this.ribbon, '--ribbon-bottom', 0)).observe(this.ribbon);
    // Where the right column ends: the notices stack in the margin below it.
    new ResizeObserver(() => {
      const r = right.getBoundingClientRect();
      css.setProperty('--right-bottom', `${r.height > 0 ? Math.ceil(r.bottom) : 0}px`);
    }).observe(right);
  }

  // ------------------------------------------------------------------ juice hooks

  /** Ease a number in `el` toward `value` (see counter.ts for the options). */
  count = countTo;

  /** A quick pulse on an element (a number that just paid out). */
  bump(el: HTMLElement): void {
    if (reducedMotion()) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** Big event text over the table's upper half; stacks up to three, each fades by itself. */
  banner(text: string, o: BannerOpts = {}): void {
    const layer = this.bannerLayer;
    if (this.bannerCount >= MAX_BANNERS) layer.firstElementChild?.remove();
    const el = h(
      'div',
      { class: `banner-item tone-${o.tone ?? 'gold'}` },
      h('span', { class: 'banner-text' }, text),
      o.sub ? h('span', { class: 'banner-sub' }, o.sub) : null,
    );
    layer.append(el);
    this.bannerCount = layer.childElementCount;
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => {
        el.remove();
        this.bannerCount = layer.childElementCount;
      }, 320);
    }, o.ms ?? 1600);
  }

  /** Forget what is on screen so the next update redraws everything (layout switch). */
  private resetCache(): void {
    this.mem.fill(Number.NaN);
    this.cJobId = '\0';
  }

  /** True when any of up to four numbers differs from last time; remembers the new ones. */
  private changed(slot: number, a: number, b = 0, c = 0, d = 0): boolean {
    const m = this.mem;
    const i = slot * 4;
    if (m[i] === a && m[i + 1] === b && m[i + 2] === c && m[i + 3] === d) return false;
    m[i] = a;
    m[i + 1] = b;
    m[i + 2] = c;
    m[i + 3] = d;
    return true;
  }

  // ------------------------------------------------------------------ per frame

  /**
   * Call once per frame. `shown` is the session on screen (play, tally, replay, attract);
   * `playing` means a live ball of the run.
   */
  update(
    dt: number,
    layout: HudLayout,
    r: RunState | null,
    shown: BallSession | null,
    playing: boolean,
  ): void {
    tickCounters(dt);
    if (layout !== this.layout) {
      this.layout = layout;
      this.resetCache();
      this.root.hidden = layout === 'off';
      this.root.dataset.layout = layout;
      document.body.dataset.hud = layout;
      this.cols.hidden = layout !== 'columns' && layout !== 'dmd';
      this.ribbon.hidden = layout !== 'ribbon';
    }
    const play = playing && layout === 'columns';
    if (play !== this.cPlay) {
      this.cPlay = play;
      this.root.classList.toggle('playing', play);
    }
    if (layout === 'off') return;
    const g = shown && playing ? shown.game : null;
    if (r && layout === 'columns') this.updateCols(r, g, playing);
    else if (r && layout === 'ribbon') this.updateRibbon(r);
    this.updatePlunger(shown, layout === 'columns' && playing);
  }

  private updateCols(r: RunState, g: TableGame | null, playing: boolean): void {
    const paid = r.phase === 'phone';
    this.syncLedger(r, g, paid, this.debtN, this.bankN, this.pocketN, this.meterEl, this.needText);

    // Pocket: the live total, with this ball's share beside it.
    const earned = g ? g.earned : 0;
    const total = Math.floor(r.pocket + earned);
    if (this.changed(S_POCKET, total)) {
      const up = total > this.lastPocket && this.lastPocket >= 0;
      this.lastPocket = total;
      countTo(this.pocketBig, total, { key: 'hud.pocket', ms: 420 });
      if (up) this.bump(this.pocketBig);
    }
    const tenths = Math.round(earned * 10);
    if (this.changed(S_EARN, tenths)) {
      this.earnEl.textContent = earned >= 0.05 ? `+${formatCoins(earned)} this ball` : '';
      this.earnEl.classList.toggle('on', earned >= 0.05);
    }

    // Round, deadline and balls.
    if (this.changed(S_DEADLINE, r.deadline, r.deadlines, r.endless ? 1 : 0))
      this.deadlineEl.textContent = `Deadline ${deadlineText(r)}`;
    const rounds = roundsIn(r);
    if (this.changed(S_ROUND, r.round, rounds))
      this.roundEl.textContent = `Round ${r.round + 1}/${rounds}`;
    const ballNo = Math.min(r.ballsThisRound, r.ballsPlayed + (playing ? 1 : 0));
    if (this.changed(S_BALLS, r.ballsThisRound, ballNo, playing ? 1 : 0, r.ballsPlayed)) {
      this.ballsEl.replaceChildren(
        ballPips(r.ballsThisRound, r.ballsPlayed, playing),
        h('span', { class: 'balls-text' }, `Ball ${ballNo} of ${r.ballsThisRound}`),
      );
    }
    const sentence = sentenceActive(r);
    if (this.changed(S_SENTENCE, sentence ? 1 : 0)) this.sentenceEl.hidden = !sentence;

    // Bonus and luck chips.
    if (this.changed(S_BONUS, g ? Math.round(g.bonus * 10) : -1, g ? g.bonusMult : 0)) {
      // Nothing to say at the start of a ball: the chip appears once a whole coin or a
      // multiplier is in play, not for a fraction of one.
      const show = !!g && (g.bonus >= 1 || g.bonusMult > 1);
      this.bonusChip.hidden = !show;
      if (g && show)
        this.bonusChip.lastChild!.textContent = ` Bonus ${formatCoins(g.bonus)} x${g.bonusMult}`;
    }
    const luck = g ? g.luck : 0;
    if (this.changed(S_LUCK, luck)) {
      this.luckChip.hidden = luck <= 0;
      if (luck > 0) this.luckChip.lastChild!.textContent = ` Luck ${luck}`;
    }

    this.updateCombo(g);
    this.updateJob(r, g);
    this.updateJailbreak(r, g);
    this.updateActives(g);
    this.updateCharms(r);
    this.updateResources(r, g);
  }

  /** The Debt meter and its numbers, for the columns or the ribbon. */
  private syncLedger(
    r: RunState,
    g: TableGame | null,
    paid: boolean,
    debtN: HTMLElement,
    bankN: HTMLElement,
    pocketN: HTMLElement,
    meterEl: HTMLElement,
    needEl: HTMLElement,
  ): void {
    if (this.changed(S_DEBT, r.debt, paid ? 1 : 0)) {
      if (paid) {
        debtN.textContent = 'PAID';
        debtN.dataset.v = '';
      } else countTo(debtN, r.debt, { key: 'hud.debt', ms: 700 });
    }
    if (this.changed(S_BANK, r.bank)) countTo(bankN, r.bank, { key: 'hud.bank', ms: 600 });
    const live = g ? g.earned : 0;
    if (this.changed(S_METER, r.debt, r.bank, r.pocket, Math.round(live * 4) + (paid ? 1e9 : 0))) {
      countTo(pocketN, r.pocket, { key: 'hud.pocketlg', ms: 420 });
      if (paid) setMeter(meterEl, 1, 1, 0);
      else setMeter(meterEl, r.debt, r.bank, r.pocket, live);
      const need = Math.max(0, r.debt - r.bank - r.pocket - live);
      needEl.classList.toggle('ok', paid || need <= 0);
      needEl.textContent = paid
        ? 'Debt paid'
        : need <= 0
          ? r.bank >= r.debt
            ? 'Covered'
            : 'Covered if deposited'
          : `${fmtInt(need)} to go`;
    }
  }

  private updateCombo(g: TableGame | null): void {
    const active = g ? g.combo.active(g.time) : false;
    const count = active && g ? g.combo.count : 0;
    if (this.changed(S_COMBO, count)) {
      this.comboSlot.classList.toggle('on', count >= 2);
      if (g && count >= 2) {
        this.comboName.textContent = comboName(count) || 'Combo';
        this.comboMult.textContent = `x${g.combo.mult}`;
        this.bump(this.comboMult);
      }
    }
    if (active && g && count >= 2) {
      const f = Math.round((g.combo.left(g.time) / Math.max(0.01, g.ctx.comboWindow)) * 50);
      if (this.changed(S_COMBOFILL, f)) this.comboFill.style.transform = `scaleX(${f / 50})`;
    }
  }

  private updateJob(r: RunState, g: TableGame | null): void {
    const job = r.job;
    if (!job) {
      if (this.cJobId !== '') {
        this.cJobId = '';
        this.jobCard.hidden = true;
      }
      return;
    }
    if (job.id !== this.cJobId || this.changed(S_JOB, job.target)) {
      this.cJobId = job.id;
      this.mem.fill(Number.NaN, S_JOBPROG * 4, S_JOBPROG * 4 + 4);
      this.jobCard.hidden = false;
      this.jobTitle.textContent = jobText(jobDef(job.id), job.target);
    }
    const prog = Math.min(job.target, g ? g.jobProgress() : job.progress);
    const done = job.done || (g?.jobDone ?? false);
    const shown = Math.floor(prog);
    if (this.changed(S_JOBPROG, shown, done ? 1 : 0)) {
      (this.jobFill.firstChild as HTMLElement).style.width = `${Math.round(
        (done ? 1 : prog / job.target) * 100,
      )}%`;
      this.jobCount.textContent = done ? 'Done' : `${fmtInt(shown)} / ${fmtInt(job.target)}`;
      this.jobCard.classList.toggle('done', done);
    }
  }

  private updateJailbreak(r: RunState, g: TableGame | null): void {
    const live = !!g?.jailbreak;
    const lit = !live && jailbreakLit(r);
    // 0 nothing, 1 lit at the Hole, 2+ the escape under way (shots made + 2).
    const mode = live ? 2 + g!.jbShots : lit ? 1 : 0;
    if (!this.changed(S_JB, mode)) return;
    this.jbCard.hidden = mode === 0;
    if (live)
      this.jbCard.replaceChildren(
        h('span', { class: 'jb-title' }, 'Jailbreak'),
        h('span', { class: 'jb-count' }, `${g!.jbShots} / ${JAILBREAK.shotsToEscape}`),
        bar(g!.jbShots / JAILBREAK.shotsToEscape, 'jb-bar'),
      );
    else if (lit)
      this.jbCard.replaceChildren(
        h('span', { class: 'jb-title' }, 'Jailbreak lit'),
        h('span', { class: 'jb-sub' }, 'Sink the Hole'),
      );
  }

  private updateActives(g: TableGame | null): void {
    const actives = g ? g.ctx.actives : null;
    let sig = actives && actives.length ? 1 : 0;
    if (actives) for (const a of actives) sig = sig * 31 + a.slot * 7 + a.charges;
    if (!this.changed(S_ACTIVE, sig)) return;
    this.activesCard.hidden = !actives || actives.length === 0;
    if (!actives || actives.length === 0) return;
    this.activesCard.replaceChildren(
      ...actives.map((a) =>
        h(
          'div',
          { class: `active-row${a.charges > 0 ? '' : ' spent'}` },
          h('span', { class: 'active-slot' }, String(a.slot)),
          h('span', { class: 'active-name' }, charmDef(a.id).name),
          pips(a.max, a.charges, 'charge'),
        ),
      ),
      h('div', { class: 'active-hint' }, 'Lockbar fires the first charged'),
    );
  }

  /** The charms that work on their own (the active ones have their own card). */
  private updateCharms(r: RunState): void {
    const ids = r.charms;
    let sig = ids.length;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      for (let j = 0; j < id.length; j++) sig = (sig * 31 + id.charCodeAt(j)) % 1000003;
    }
    if (!this.changed(S_CHARMS, sig, ids.length)) return;
    const passive = ids.map(charmDef).filter((c) => !c.active);
    this.charmsCard.hidden = passive.length === 0;
    this.charmsCard.replaceChildren(
      h('span', { class: 'hc-label' }, 'Charms'),
      h(
        'div',
        { class: 'hc-charm-list' },
        passive.map((c) =>
          h(
            'span',
            {
              class: `charm-chip${c.cursed ? ' cursed' : ''}`,
              style: { '--rar': RARITY_COLORS[c.rarity] },
              title: c.text,
            },
            icon(c.cursed ? 'devil' : 'star'),
            c.name,
          ),
        ),
      ),
    );
  }

  private updateResources(r: RunState, g: TableGame | null): void {
    if (this.changed(S_RES, r.tickets, r.keys)) {
      this.resEl.hidden = r.tickets === 0 && r.keys === 0;
      this.resEl.replaceChildren();
      if (r.tickets)
        this.resEl.append(chip(`${r.tickets}`, 'plain', { icon: 'ticket', class: 'res-ticket' }));
      if (r.keys) this.resEl.append(chip(`${r.keys}`, 'plain', { icon: 'key', class: 'res-key' }));
    }
    const tip = r.neighbor.tip && !g?.jailbreak;
    if (this.changed(S_TIP, tip ? 1 : 0)) this.tipEl.hidden = !tip;
  }

  private updateRibbon(r: RunState): void {
    const paid = r.phase === 'phone';
    if (this.changed(S_DEADLINE, r.deadline, r.deadlines, r.endless ? 1 : 0))
      this.rbDeadline.textContent = `Deadline ${deadlineText(r)}`;
    const rounds = roundsIn(r);
    if (this.changed(S_ROUND, r.round, rounds))
      this.rbRound.textContent = `Round ${r.round + 1}/${rounds}`;
    this.syncLedger(
      r,
      null,
      paid,
      this.rbDebt,
      this.rbBank,
      this.rbPocket,
      this.rbMeter,
      this.rbNeed,
    );
    if (this.changed(S_RIBBON_RES, r.pocket, r.tickets, r.keys)) {
      this.rbRes.replaceChildren(
        chip(`${fmtInt(r.pocket)}`, 'gold', {
          icon: 'pocket',
          title: 'Pocket',
          class: 'res-pocket',
        }),
        chip(`${r.tickets}`, 'plain', { icon: 'ticket', title: 'Tickets', class: 'res-ticket' }),
      );
      if (r.keys)
        this.rbRes.append(
          chip(`${r.keys}`, 'plain', { icon: 'key', title: 'Keys', class: 'res-key' }),
        );
    }
  }

  private updatePlunger(shown: BallSession | null, on: boolean): void {
    let show = false;
    if (on && shown) {
      const balls = shown.sim.balls;
      for (let i = 0; i < balls.length; i++)
        if (balls[i].inShooter && balls[i].state === 'field') show = true;
    }
    if (this.plunger.hidden === show) this.plunger.hidden = !show;
    if (!show || !shown) return;
    const pull = Math.round(shown.sim.plungerPull * 100);
    if (this.changed(S_PLUNGER, pull)) this.plungerFill.style.height = `${pull}%`;
    // Mark the pull that drops into the lit Roll Call lane.
    const armed = shown.game.lamps.skill !== Lamp.Off;
    const mark = armed
      ? Math.round(shown.sim.cfg.plunger.lanePull[shown.game.machine.skillLane] * 100)
      : -1;
    if (this.changed(S_MARK, mark)) {
      this.plungerMark.style.display = armed ? '' : 'none';
      if (armed) this.plungerMark.style.bottom = `${mark}%`;
    }
  }
}

/** "3/8" ("3" in Endless). */
function deadlineText(r: RunState): string {
  return r.endless ? `${r.deadline + 1}` : `${r.deadline + 1}/${r.deadlines}`;
}
