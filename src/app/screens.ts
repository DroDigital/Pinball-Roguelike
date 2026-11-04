/**
 * The run's screens as pure view builders: title, deadline intro, Jobs, buy balls, the cell,
 * ATM, vending cabinet, phone, knock, ball over, payment and the end-of-run Rap Sheet. Each
 * takes the run's state plus callbacks and returns a panel; the game flow (game-app.ts) owns
 * what happens next. Panels marked `data-skin` sit on their painted frames (skin.ts); locked
 * buttons say why they are locked (see `button`), and numbers count on from what the previous
 * render showed (counter.ts).
 */
import { h } from './ui';
import { icon, itemIcon, keysIcon } from './icons';
import { button, tallyMarks } from './widgets';
import { titleLogo } from './skin';
import { countTo, fmtInt } from './counter';
import { tally } from './tally';
import { formatCoins } from '../present/pops';
import { ECONOMY } from '../content/balance';
import { charmDef, RARITY_COLORS } from '../content/charms';
import { contrabandDef } from '../content/contraband';
import { inmateDef } from '../content/inmates';
import { jobDef, jobText, type JobDef } from '../content/jobs';
import { bargainDef, perkDef } from '../content/phone';
import { sentenceDef } from '../content/sentences';
import type { UnlockDef } from '../content/unlocks';
import type { ShotType } from '../sim/table-def';
import {
  ballPrice,
  ballsLeft,
  canHelp,
  canPayEarly,
  costForBalls,
  freeBalls,
  interestRate,
  jobCoins,
  lastCall,
  loanAvailable,
  loanCost,
  maxAffordableBalls,
  payEarlyReward,
  payScale,
  roundsIn,
  sentenceActive,
  type BallOutcome,
  type BallResult,
  type NeighborKnock,
  type RunState,
} from '../rules/run';
import {
  canUse,
  contrabandPrice,
  contrabandSlots,
  ownedTags,
  rerollCost,
  sellValue,
} from '../rules/shop';

// ------------------------------------------------------------------ small helpers

const SHOT_NAME: Record<ShotType, string> = {
  yard: 'Yard',
  sling: 'Sling',
  lanes: 'Lanes',
  cellblock: 'Cell Block',
  chute: 'Chute',
  perimeter: 'Perimeter',
  searchlight: 'Searchlight',
  hole: 'Hole',
};

export const shotName = (s: ShotType | string): string => SHOT_NAME[s as ShotType] ?? s;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "Deadline 2 of 8 · Round 1 of 3" */
export function where(r: RunState): string {
  return `Deadline ${r.deadline + 1}${r.endless ? '' : ` of ${r.deadlines}`} · Round ${r.round + 1} of ${roundsIn(r)}`;
}

/** A coin amount ("12c") that counts on from the last value shown under `key`. */
function coins(value: number, key: string, ms = 650): HTMLElement {
  const el = h('span', { class: 'n' });
  countTo(el, value, { key, ms, format: (v) => `${fmtInt(v)}c` });
  return el;
}

type Tone = 'amber' | 'green' | 'red' | 'balls';

/** A recessed gauge: label over a big number. */
function gauge(label: string, value: HTMLElement | string, tone: Tone, extra?: HTMLElement) {
  return h(
    'div',
    { class: 'cell-gauge-box stagger' },
    h('div', { class: 'cell-gauge-label' }, label),
    h('div', { class: `cell-gauge-val ${tone}` }, value),
    extra ?? null,
  );
}

/** An ATM readout: label beside a big CRT number. */
function readout(label: string, value: HTMLElement | string, tone: Tone, cls = '') {
  return h(
    'div',
    { class: `atm-readout-box${cls ? ` ${cls}` : ''}` },
    h('span', { class: 'atm-readout-label' }, label),
    h('span', { class: `atm-readout-val ${tone}` }, value),
  );
}

function rewardText(def: JobDef, deadline: number): string {
  const rw = def.reward;
  const parts: string[] = [];
  if (rw.keys) parts.push(plural(rw.keys, 'key'));
  if (rw.tickets) parts.push(plural(rw.tickets, 'ticket'));
  const c = jobCoins(def, deadline);
  if (c) parts.push(`${c}c`);
  if (rw.level) parts.push(`+1 ${shotName(rw.level)} level`);
  return `Reward: ${parts.join(', ')}`;
}

/** Where the player stands against the debt, in one plain sentence. */
function standing(r: RunState): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const short = r.debt - r.bank;
  if (short <= 0) return { tone: 'good', text: 'The Bank covers the debt.' };
  if (r.pocket >= short)
    return { tone: 'warn', text: `Deposit ${fmtInt(short)}c from your Pocket to cover the debt.` };
  return {
    tone: 'bad',
    text: `${fmtInt(short - r.pocket)}c short, even if you deposit your whole Pocket.`,
  };
}

/** The verdict under the gauges: what the numbers mean for the debt. */
function verdict(r: RunState): HTMLElement {
  const v = standing(r);
  return h('div', { class: `bc-verdict ${v.tone} stagger` }, v.text);
}

function sentenceNames(r: RunState): string {
  return r.sentences.map((id) => sentenceDef(id).name.toUpperCase()).join(' + ');
}

// ------------------------------------------------------------------ title

export interface TitleOpts {
  saved: RunState | null;
  tallies: number;
  dailyBest: string;
  touch: boolean;
}

export interface TitleHandlers {
  continueRun(): void;
  newRun(): void;
  daily(): void;
  rapSheet(): void;
  settings(): void;
}

/** The run in four steps, lit in turn like an attract-mode lamp chase. */
function titleReel(): HTMLElement {
  const step = (n: number, glyph: HTMLElement | null, head: string, text: string) =>
    h(
      'div',
      { class: 'reel-step', style: { '--i': String(n) } },
      h('span', { class: 'reel-bulb' }),
      h('span', { class: 'reel-glyph' }, glyph),
      h('b', null, head),
      h('small', null, text),
    );
  return h(
    'div',
    { class: 'title-reel', 'aria-label': 'How a run works' },
    step(0, icon('debt'), 'Owe', 'Every deadline the Warden names a debt.'),
    step(1, icon('ball'), 'Play', 'Every shot pays coins. Bank them.'),
    step(2, itemIcon('brassKnuckles'), 'Build', 'Charms bend the table rules.'),
    step(3, icon('key'), 'Escape', 'Clear the last deadline and walk out.'),
  );
}

export function titlePanel(o: TitleOpts, on: TitleHandlers): HTMLElement {
  const s = o.saved;
  return h(
    'div',
    { class: 'panel title', 'data-skin': 'title', 'data-screen': 'title' },
    titleLogo(),
    h('p', { class: 'title-tagline' }, '“You owe the Warden. The machine is the only way out.”'),
    titleReel(),
    o.tallies > 0 ? h('div', { class: 'title-wall' }, `RUNS ON THE CELL WALL: ${o.tallies}`) : null,
    o.tallies > 0 ? tallyMarks(o.tallies) : null,
    h(
      'div',
      { class: 'cell-dock', style: { flexWrap: 'wrap', gap: '10px' } },
      s
        ? button(
            {
              primary: true,
              k: 'continue',
              title: `Deadline ${s.deadline + 1}, round ${s.round + 1} · owing ${fmtInt(s.debt)}c`,
              onclick: on.continueRun,
            },
            'Continue',
          )
        : null,
      button({ primary: !s, k: 'new', onclick: on.newRun }, s ? 'New Run' : 'Wake Up'),
      button({ k: 'daily', title: o.dailyBest || undefined, onclick: on.daily }, 'Daily Sentence'),
      button({ k: 'meta', onclick: on.rapSheet }, 'Rap Sheet'),
      button({ k: 'settings', onclick: on.settings }, 'Settings'),
    ),
    o.dailyBest ? h('div', { class: 'title-daily' }, o.dailyBest.toUpperCase()) : null,
    h(
      'div',
      { class: 'title-controls' },
      o.touch
        ? 'TOUCH: LEFT / RIGHT HALF FLIPS · DRAG DOWN BOTTOM-RIGHT TO PLUNGE'
        : 'CONTROLS: [Z / /] FLIPPERS · [SPACE] PLUNGER · [X] NUDGE TABLE',
    ),
  );
}

// ------------------------------------------------------------------ deadline intro

export function introPanel(r: RunState, line: string, on: { next(): void }): HTMLElement {
  const last = lastCall(r);
  const cards = r.sentences.map((id) => {
    const d = sentenceDef(id);
    return h('div', { class: 'sentence stagger' }, h('b', null, d.name), h('small', null, d.text));
  });
  return h(
    'div',
    { class: 'panel', 'data-skin': 'deadline', 'data-screen': 'intro' },
    h(
      'h2',
      { 'data-slot': 'head' },
      last
        ? `Deadline ${r.deadline + 1}: Last Call`
        : `Deadline ${r.deadline + 1} of ${r.deadlines}`,
    ),
    h(
      'div',
      { class: 'bc-stack' },
      h('p', { class: 'warden' }, `“${line}”`),
      r.deadline > 0
        ? h(
            'div',
            { class: 'receipt-alert-box' },
            `★ HEAVIER COIN MECH: TABLE PAYOUTS MULTIPLIED AT x${formatCoins(payScale(r))}`,
          )
        : null,
      h(
        'div',
        { class: 'cell-gauges-grid' },
        gauge('Debt Target', coins(r.debt, 'g.debt', 900), 'red'),
        gauge('Bank Vault', coins(r.bank, 'g.bank'), 'green'),
        gauge('Pocket Cash', coins(r.pocket, 'g.pocket'), 'amber'),
      ),
      h(
        'div',
        { class: 'cell-rack-hdr' },
        `MANDATORY ${r.sentences.length > 1 ? 'SENTENCES' : 'SENTENCE'} (ROUND ${ECONOMY.roundsPerDeadline}):`,
      ),
      ...cards,
      h(
        'div',
        { class: 'cell-dock' },
        button({ primary: true, k: 'next', onclick: on.next }, 'Proceed To The ATM'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ jobs

export interface JobsHandlers {
  take(i: number): void;
  payEarly(): void;
}

export function jobsPanel(r: RunState, on: JobsHandlers): HTMLElement {
  const cards = r.jobOffers.map((o, i) => {
    const def = jobDef(o.id);
    const serial = String(((o.id.charCodeAt(0) * 17 + o.target * 3 + r.round * 7) % 900) + 100);
    return button(
      {
        class: `job${def.key ? ' key' : ''}`,
        primary: i === 0,
        skin: 'jobs',
        k: `job${i}`,
        onclick: () => on.take(i),
      },
      h('div', { class: 'ticket-head' }, `PRISON LABOR DEPT // WORK ORDER #${serial}`),
      h('div', { class: 'ticket-task' }, jobText(def, o.target)),
      h('div', { class: 'ticket-seal' }, `★ ${rewardText(def, r.deadline).toUpperCase()} ★`),
    );
  });
  return h(
    'div',
    { class: 'panel atm jobs', 'data-screen': 'jobs' },
    h('div', { class: 'plaque' }, h('h2', null, `Round ${r.round + 1}: Work Orders`)),
    sentenceActive(r)
      ? h('div', { class: 'cell-warning-strip' }, `⚠ SENTENCE ROUND: ${sentenceNames(r)}`)
      : null,
    h(
      'p',
      { class: 'jobs-prompt' },
      'TAKE ONE WORK ORDER, THEN DO IT ON THE TABLE FOR THE REWARD:',
    ),
    h('div', { class: 'col' }, ...cards),
    canPayEarly(r)
      ? h(
          'div',
          { class: 'cell-dock jobs-early' },
          h(
            'p',
            null,
            'YOUR BANK ALREADY COVERS THE DEBT: PAY NOW TO SKIP THE REST OF THIS DEADLINE.',
          ),
          button(
            { cue: 'reward', k: 'early', onclick: on.payEarly },
            `★ Pay The Debt Now (+${plural(payEarlyReward(r), 'Ticket')})`,
          ),
        )
      : null,
  );
}

// ------------------------------------------------------------------ buy balls

export function buyPanel(r: RunState, on: { buy(n: number): void }): HTMLElement {
  const price = ballPrice(r);
  const free = freeBalls(r);
  const max = maxAffordableBalls(r);
  const opts: HTMLElement[] = [];
  for (let n = 1; n <= ECONOMY.maxBallsPerRound; n++) {
    const cost = costForBalls(r, n);
    opts.push(
      button(
        {
          primary: n === Math.min(3, max),
          disabled: n > max,
          why: `Not enough coins: ${plural(n, 'ball')} costs ${cost}c, you have ${r.pocket}c.`,
          cue: cost ? 'buy' : 'select',
          k: `balls${n}`,
          onclick: () => on.buy(n),
        },
        `${plural(n, 'Ball')} — ${cost ? `${cost}c` : 'Free'}`,
      ),
    );
  }
  return h(
    'div',
    { class: 'panel', 'data-skin': 'buy', 'data-screen': 'buy' },
    h(
      'div',
      { class: 'bc-stack' },
      h(
        'div',
        { class: 'cell-cockpit-bar' },
        h('h2', { class: 'cell-cockpit-title' }, 'Procure Pinballs'),
        h(
          'span',
          { class: 'cell-cockpit-prog' },
          `DEADLINE ${r.deadline + 1} · ROUND ${r.round + 1}/${roundsIn(r)}`,
        ),
      ),
      h(
        'div',
        { class: 'cell-gauges-grid' },
        gauge('Pocket Cash', coins(r.pocket, 'g.pocket'), 'amber'),
        gauge('Bank Vault', coins(r.bank, 'g.bank'), 'green'),
        gauge('Debt Target', coins(r.debt, 'g.debt'), 'red'),
      ),
      h(
        'p',
        { class: 'bc-type' },
        `LOAD PINBALL RACK: ${free > 1 ? `the first ${free} balls are free` : 'the first ball is free'}; each extra ball costs ${price}c from your Pocket.`,
      ),
      h('div', { class: 'cell-dock', style: { flexWrap: 'wrap' } }, ...opts),
      h(
        'div',
        { class: 'bc-directive' },
        h('b', null, 'WARDEN DIRECTIVE #09: BALL PROCUREMENT & SOLVENCY'),
        `Extra balls give you more attempts to work the table and finish your Work Order. Coins you don't spend stay in your Pocket for the ATM, where the Bank pays ${Math.round(interestRate(r) * 100)}% interest when a round ends.`,
      ),
    ),
  );
}

// ------------------------------------------------------------------ the cell

export interface CellHandlers {
  play(): void;
  atm(): void;
  shop(): void;
  /** Use a Contraband item (some need a shot or a charm slot as target). */
  use(i: number, target?: { shot?: ShotType; charmSlot?: number }): void;
}

function charmRack(r: RunState): HTMLElement {
  const items = r.charms.map((id) => {
    const c = charmDef(id);
    const charges = c.active
      ? `${'●'.repeat(r.charges[id] ?? 0)}${'○'.repeat(c.active.charges - (r.charges[id] ?? 0))}`
      : '';
    return h(
      'span',
      { class: 'cell-token', style: { borderColor: RARITY_COLORS[c.rarity] }, title: c.text },
      itemIcon(id),
      h('span', null, c.name),
      charges ? h('span', { class: 'cell-gauge-pips' }, charges) : null,
    );
  });
  return h(
    'div',
    { class: 'cell-equipment-rack' },
    h(
      'div',
      { class: 'cell-rack-hdr' },
      `EQUIPMENT RACK · SLOTS ${r.charms.length}/${r.mods.charmSlots} · TICKETS: ${r.tickets} · KEYS: `,
      keysIcon(),
      ` ${r.keys}`,
    ),
    h(
      'div',
      { class: 'cell-rack-shelf' },
      ...items,
      ...Array.from({ length: Math.max(0, r.mods.charmSlots - items.length) }, () =>
        h('span', { class: 'cell-slot-empty', title: 'Buy charms at the vending cabinet.' }),
      ),
    ),
    items.length
      ? null
      : h('div', { class: 'cell-rack-hint' }, 'Empty rack: buy charms at the vending cabinet.'),
  );
}

/** One plate per shot, its upgrade level as a number and a row of pips. */
function shotPlates(r: RunState): HTMLElement {
  const plates = (Object.entries(r.shotLevels) as [ShotType, number][]).map(([k, v]) =>
    h(
      'div',
      { class: `cell-plate${v > 1 ? ' up' : ''}`, title: `${shotName(k)} level ${v}` },
      h('small', null, shotName(k)),
      h('b', null, String(v)),
      h(
        'span',
        { class: 'cell-plate-pips' },
        ...Array.from({ length: 5 }, (_, i) => h('i', { class: i < v ? 'on' : '' })),
      ),
    ),
  );
  return h(
    'div',
    { class: 'cell-plates-wrap' },
    h('div', { class: 'cell-rack-hdr' }, 'Shot upgrades'),
    h('div', { class: 'cell-plates' }, ...plates),
  );
}

function stash(r: RunState, on: CellHandlers): HTMLElement | null {
  if (!r.contraband.length) return null;
  const rows = r.contraband.map((id, i) => {
    const d = contrabandDef(id);
    if (d.target === 'shot')
      return h(
        'div',
        { class: 'cell-contraband-row' },
        h('span', { class: 'dim', title: d.text }, itemIcon(id), `${d.name}:`),
        ...(['chute', 'perimeter', 'hole', 'cellblock', 'yard', 'lanes'] as const).map((shot) =>
          button({ k: `use${i}-${shot}`, onclick: () => on.use(i, { shot }) }, shotName(shot)),
        ),
      );
    if (d.target === 'charm')
      return h(
        'div',
        { class: 'cell-contraband-row' },
        h('span', { class: 'dim', title: d.text }, itemIcon(id), `${d.name}:`),
        ...(r.charms.length
          ? r.charms.map((cid, slot) =>
              button(
                { k: `use${i}-c${slot}`, onclick: () => on.use(i, { charmSlot: slot }) },
                charmDef(cid).name,
              ),
            )
          : [h('span', { class: 'dim' }, 'You have no charms to use it on.')]),
      );
    return button(
      {
        disabled: !canUse(r, id),
        why: `${d.name} can't be used right now.`,
        title: d.text,
        k: `use${i}`,
        onclick: () => on.use(i),
      },
      itemIcon(id),
      `Use ${d.name}`,
    );
  });
  return h(
    'div',
    { class: 'cell-contraband-shelf' },
    h(
      'div',
      { class: 'cell-rack-hdr' },
      `CONTRABAND STASH · ${r.contraband.length}/${contrabandSlots(r)}`,
    ),
    h('div', { class: 'cell-contraband-row' }, ...rows),
  );
}

export function cellPanel(r: RunState, on: CellHandlers): HTMLElement {
  const left = ballsLeft(r);
  const pips = '● '.repeat(Math.min(5, left)) + '○ '.repeat(Math.max(0, 5 - left));
  return h(
    'div',
    { class: 'panel', 'data-skin': 'cell', 'data-screen': 'cell' },
    h(
      'div',
      { class: 'cell-cockpit' },
      h(
        'div',
        { class: 'cell-cockpit-bar' },
        h('h2', { class: 'cell-cockpit-title' }, 'Cell Block 9'),
        h(
          'span',
          { class: 'cell-cockpit-prog' },
          `DEADLINE ${r.deadline + 1}${r.endless ? '' : `/${r.deadlines}`} · ROUND ${r.round + 1}/${roundsIn(r)}`,
        ),
      ),
      h(
        'div',
        { class: 'cell-gauges-grid' },
        gauge('Pocket Coins', coins(r.pocket, 'g.pocket'), 'amber'),
        gauge('Bank Vault', coins(r.bank, 'g.bank'), 'green'),
        gauge('Debt Target', coins(r.debt, 'g.debt'), 'red'),
        gauge(
          'Balls Ready',
          String(left),
          'balls',
          h('div', { class: 'cell-gauge-pips' }, pips.trim()),
        ),
      ),
      verdict(r),
      r.job
        ? h(
            'div',
            { class: 'cell-order-banner' },
            h(
              'span',
              { class: 'cell-order-title' },
              `WORK ORDER: ${jobText(jobDef(r.job.id), r.job.target)}`,
            ),
            h(
              'span',
              { class: `cell-order-status${r.job.done ? ' done' : ''}` },
              r.job.done ? '✓ COMPLETED' : `${formatCoins(r.job.progress)}/${r.job.target}`,
            ),
          )
        : null,
      charmRack(r),
      shotPlates(r),
      stash(r, on),
      sentenceActive(r)
        ? h('div', { class: 'cell-warning-strip' }, `⚠ SENTENCE IN FORCE: ${sentenceNames(r)}`)
        : h(
            'div',
            { class: 'cell-sentence-tag' },
            h('span', null, `Sentence in round ${roundsIn(r)}`),
            h('b', null, sentenceNames(r)),
          ),
      h(
        'div',
        { class: 'cell-dock' },
        button(
          {
            class: 'play-ball-btn',
            primary: left > 0,
            disabled: left <= 0,
            why: 'No balls left this round.',
            k: 'play',
            onclick: on.play,
          },
          'Play Ball',
        ),
        button({ k: 'atm', onclick: on.atm }, 'ATM Terminal'),
        button({ k: 'shop', onclick: on.shop }, 'Vending Cabinet'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ ATM

export interface AtmHandlers {
  deposit(n: number): void;
  borrow(n: number): void;
  done(): void;
}

export function atmPanel(r: RunState, back: 'cell' | 'deadline', on: AtmHandlers): HTMLElement {
  const need = Math.max(0, r.debt - r.bank);
  const solvent = need <= 0;
  const empty = 'Your Pocket is empty.';
  const dep = (label: string, n: number, k: string, primary = false) =>
    button(
      {
        primary,
        disabled: n < 1 || r.pocket < n,
        why: r.pocket < 1 ? empty : `You only have ${fmtInt(r.pocket)}c in your Pocket.`,
        cue: 'deposit',
        k,
        onclick: () => on.deposit(n),
      },
      label,
    );
  const covers = need > 0 && r.pocket >= need;
  const v = standing(r);
  return h(
    'div',
    { class: 'panel atm', 'data-skin': 'atm', 'data-screen': 'atm' },
    h(
      'div',
      { class: 'atm-terminal-screen' },
      h(
        'div',
        { class: 'atm-header-banner' },
        h('h2', null, 'AUTOMATED TELLER // FIRMWARE v4.19'),
        h(
          'div',
          { class: 'atm-header-sub' },
          back === 'deadline'
            ? '★ FINAL DEPOSIT: THE BANK DECIDES IT WHEN THE WARDEN CALLS ★'
            : `DEPOSITS ARE FINAL · ONLY BANKED COINS PAY THE DEBT · +${Math.round(interestRate(r) * 100)}% INTEREST EACH ROUND`,
        ),
      ),
      h(
        'div',
        { class: 'atm-readouts' },
        readout('Pocket Cash', coins(r.pocket, 'g.pocket'), 'amber'),
        readout(
          `Bank Vault (+${Math.round(interestRate(r) * 100)}%)`,
          coins(r.bank, 'g.bank'),
          'green',
        ),
        readout('Debt Target', coins(r.debt, 'g.debt'), 'red'),
        readout(
          'Payment Status',
          solvent ? 'SOLVENT [PAID]' : `SHORTFALL: -${need}c`,
          solvent ? 'green' : 'red',
          solvent ? 'status-solvent' : 'status-shortfall',
        ),
      ),
      h('div', { class: `atm-verdict ${v.tone}` }, `> ${v.text.toUpperCase()}`),
      h(
        'div',
        { class: 'atm-keypad-panel' },
        dep('+1c', 1, 'dep1'),
        dep('+5c', 5, 'dep5'),
        dep('+10c', 10, 'dep10'),
        // Only when it settles the debt (otherwise it is the same as Deposit All).
        covers ? dep(`Cover The Debt (${need}c)`, need, 'depOwed', true) : null,
        covers && r.pocket === need ? null : dep('Deposit All', r.pocket, 'depAll'),
      ),
      loanRow(r, on),
      h(
        'div',
        { class: 'cell-dock' },
        button(
          { primary: true, cue: 'back', k: 'done', onclick: on.done },
          back === 'deadline' ? 'Return to Deadline' : 'Return to Cell',
        ),
      ),
    ),
  );
}

function loanRow(r: RunState, on: AtmHandlers): HTMLElement {
  const avail = loanAvailable(r);
  const owed = r.loanDue
    ? h('div', { class: 'atm-credit-hdr owed' }, `LOAN ADDED TO NEXT DEBT: ${r.loanDue}c`)
    : null;
  if (avail <= 0)
    return h(
      'div',
      { class: 'atm-credit-facility' },
      h(
        'div',
        { class: 'atm-credit-hdr' },
        lastCall(r)
          ? 'CREDIT LINE: NO LOANS ON LAST CALL'
          : 'CREDIT LINE: LIMIT REACHED THIS DEADLINE',
      ),
      owed,
    );
  const half = Math.max(1, Math.floor(avail / 2));
  const take = (n: number, k: string) =>
    button(
      { cue: 'deposit', k, onclick: () => on.borrow(n) },
      `Borrow ${n}c (Owe ${loanCost(r, n)}c)`,
    );
  return h(
    'div',
    { class: 'atm-credit-facility' },
    h(
      'div',
      { class: 'atm-credit-hdr' },
      `EMERGENCY CREDIT (WARDEN CAPITAL): BORROW UP TO ${avail}c INTO YOUR POCKET, REPAID AT ${Math.round(r.mods.loanRate * 100)}% WITH THE NEXT DEBT`,
    ),
    h(
      'div',
      { class: 'atm-credit-btns' },
      take(half, 'loan-half'),
      avail > half ? take(avail, 'loan-all') : null,
    ),
    owed,
  );
}

// ------------------------------------------------------------------ vending cabinet

export interface ShopHandlers {
  buyCharm(i: number): void;
  buyContraband(i: number): void;
  sell(slot: number): void;
  reroll(): void;
  done(): void;
}

export function shopPanel(r: RunState, on: ShopHandlers): HTMLElement {
  const tags = ownedTags(r);
  const full = r.charms.length >= r.mods.charmSlots;
  const charmCards = r.shop.charms.map((id, i) => {
    const c = charmDef(id);
    const synergy = c.tags.some((t) => tags.has(t));
    const short = c.cost - r.tickets;
    const status = full ? 'SLOTS FULL' : short > 0 ? `NEED ${short} MORE` : '';
    return button(
      {
        class: `shop-card-tile${synergy ? ' synergy-glow' : ''}`,
        style: { borderColor: RARITY_COLORS[c.rarity] },
        disabled: short > 0 || full,
        why: full
          ? `Your charm slots are full (${r.charms.length}/${r.mods.charmSlots}). Pawn a charm first.`
          : `You need ${plural(short, 'more ticket')} for ${c.name}.`,
        cue: 'buy',
        k: `charm${i}`,
        onclick: () => on.buyCharm(i),
      },
      h(
        'div',
        { class: 'shop-card-meta' },
        h('span', { class: 'shop-card-tier', style: { color: RARITY_COLORS[c.rarity] } }, c.rarity),
        h('span', { class: 'shop-card-price' }, plural(c.cost, 'ticket')),
      ),
      h(
        'div',
        { class: 'shop-card-body' },
        itemIcon(id),
        h(
          'div',
          null,
          h(
            'div',
            { class: 'shop-card-heading' },
            c.name,
            synergy ? h('span', { class: 'shop-synergy-tag' }, '✦ SYNERGY') : null,
          ),
          h('p', { class: 'shop-card-lore' }, c.text),
          status ? h('div', { class: 'shop-card-status' }, status) : null,
        ),
      ),
    );
  });
  const slots = contrabandSlots(r);
  const slotsFull = r.contraband.length >= slots;
  const cbCards = r.shop.contraband.map((id, i) => {
    const d = contrabandDef(id);
    const price = contrabandPrice(r, id);
    const short = price - r.pocket;
    const status = slotsFull ? 'SLOTS FULL' : short > 0 ? `NEED ${fmtInt(short)}c MORE` : '';
    return button(
      {
        class: 'shop-card-tile',
        disabled: short > 0 || slotsFull,
        why: slotsFull
          ? `Your contraband slots are full (${r.contraband.length}/${slots}). Use something first.`
          : `You need ${fmtInt(short)}c more for ${d.name}.`,
        cue: 'buy',
        k: `contra${i}`,
        onclick: () => on.buyContraband(i),
      },
      h(
        'div',
        { class: 'shop-card-meta' },
        h('span', { class: 'shop-card-tier' }, d.rare ? 'RARE CONTRABAND' : 'CONTRABAND'),
        h('span', { class: 'shop-card-price' }, `${price}c`),
      ),
      h(
        'div',
        { class: 'shop-card-body' },
        itemIcon(id),
        h(
          'div',
          null,
          h('div', { class: 'shop-card-heading' }, d.name),
          h('p', { class: 'shop-card-lore' }, d.text),
          status ? h('div', { class: 'shop-card-status' }, status) : null,
        ),
      ),
    );
  });
  const sells = r.charms.map((id, slot) => {
    const c = charmDef(id);
    return button(
      {
        disabled: !!c.cursed,
        why: `${c.name} is a devil's charm: it can't be sold.`,
        cue: 'sell',
        k: `sell${slot}`,
        onclick: () => on.sell(slot),
      },
      itemIcon(id),
      c.cursed ? `${c.name} (CURSED)` : `Pawn ${c.name} (+${plural(sellValue(r, id), 'ticket')})`,
    );
  });
  const cost = rerollCost(r);
  return h(
    'div',
    { class: 'panel shop', 'data-skin': 'shop', 'data-screen': 'shop' },
    h('h2', { 'data-slot': 'head' }, 'Vending cabinet'),
    h(
      'div',
      { class: 'shop-cockpit' },
      h(
        'div',
        { class: 'shop-counters-bar' },
        h('div', null, 'TICKETS: ', h('b', { class: 'amber-badge' }, String(r.tickets))),
        h('div', null, 'POCKET: ', h('b', { class: 'amber-badge' }, coins(r.pocket, 'g.pocket'))),
        h('div', null, 'SLOTS: ', h('b', null, `${r.charms.length}/${r.mods.charmSlots}`)),
        h('div', null, 'CONTRABAND: ', h('b', null, `${r.contraband.length}/${slots}`)),
      ),
      h('div', { class: 'shop-section-label' }, 'LUCKY CHARMS (TICKETS)'),
      h('div', { class: 'shop-charms-grid' }, ...charmCards),
      h('div', { class: 'shop-section-label' }, 'CONTRABAND CACHE (COINS)'),
      cbCards.length
        ? h('div', { class: 'shop-charms-grid' }, ...cbCards)
        : h('p', { class: 'dim' }, 'Sold out.'),
      sells.length
        ? h(
            'div',
            { class: 'shop-pawn-drawer' },
            h('div', { class: 'shop-section-label' }, 'PAWN & RESALE (REFUND TICKETS)'),
            h('div', { class: 'shop-pawn-cards' }, ...sells),
          )
        : null,
      h(
        'div',
        { class: 'cell-dock' },
        button(
          {
            disabled: r.pocket < cost,
            why: `A reroll costs ${cost}c; you have ${r.pocket}c.`,
            cue: 'buy',
            k: 'reroll',
            onclick: on.reroll,
          },
          `Reroll Shelf (${cost}c)`,
        ),
        button({ primary: true, cue: 'back', k: 'done', onclick: on.done }, 'Leave Cabinet'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ the phone

export function phonePanel(
  r: RunState,
  line: string,
  on: { choose(i: number): void },
): HTMLElement {
  const call = r.call;
  const offers = call && call.kind === 'perks' ? call.offers : [];
  const cards = offers.map((o, i) =>
    button(
      {
        class: 'job',
        primary: i === 0,
        style: { minHeight: '52px', fontSize: '1.2em' },
        cue: 'reward',
        k: `perk${i}`,
        onclick: () => on.choose(i),
      },
      h('b', null, perkDef(o.id).text.replace('{shot}', o.shot ? shotName(o.shot) : '')),
    ),
  );
  return h(
    'div',
    { class: 'panel', 'data-skin': 'phone', 'data-screen': 'phone' },
    h('h2', { 'data-slot': 'head' }, 'The phone rings'),
    h(
      'div',
      { class: 'bc-stack' },
      h('p', { class: 'warden' }, `“${line} Pick one. It is yours for the rest of your stay.”`),
      h('div', { class: 'col' }, ...cards),
    ),
  );
}

export function redPhonePanel(
  r: RunState,
  line: string,
  on: { accept(i: number): void; hangUp(): void },
): HTMLElement {
  const call = r.call;
  const offers = call && call.kind === 'red' ? call.offers : [];
  const cards = offers.map((id, i) => {
    let name: string;
    let gain: string;
    let cost: string;
    if (id.startsWith('charm:')) {
      const c = charmDef(id.slice(6));
      name = `${c.name} (DEVIL CHARM)`;
      gain = `Gain: ${c.text}`;
      cost = 'Blood Price: Permanently binds to a charm slot. Cannot be sold.';
    } else {
      const b = bargainDef(id);
      name = b.name;
      gain = `The Boon: ${b.gain}`;
      cost = `Blood Sacrifice: ${b.cost}`;
    }
    return button(
      { class: 'red-bargain-box', cue: 'select', k: `deal${i}`, onclick: () => on.accept(i) },
      h('div', { class: 'red-bargain-name' }, `⛧ ${name}`),
      h('div', { class: 'red-bargain-gain' }, gain),
      h('div', { class: 'red-bargain-cost' }, cost),
    );
  });
  return h(
    'div',
    { class: 'panel red', 'data-skin': 'redCall', 'data-screen': 'redphone' },
    h('h2', { 'data-slot': 'head' }, 'The red phone rings'),
    h(
      'div',
      { class: 'bc-stack' },
      h('p', { class: 'warden red' }, `“${line}”`),
      h('div', { class: 'col' }, ...cards),
      h(
        'div',
        { class: 'cell-dock' },
        button(
          { primary: true, cue: 'back', k: 'hangup', onclick: on.hangUp },
          'Slam The Receiver (Hang Up)',
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ the neighbor

export function knockPanel(
  r: RunState,
  k: NeighborKnock,
  text: { ask: string; offer: string; give: string; get: string },
  on: { answer(help: boolean): void },
): HTMLElement {
  const can = canHelp(r);
  const why =
    k.ask === 'coins'
      ? `You need ${plural(k.amount, 'coin')} between your Pocket and Bank.`
      : k.ask === 'tickets'
        ? `You need ${plural(k.amount, 'ticket')}.`
        : 'You no longer have that charm.';
  return h(
    'div',
    { class: 'panel knock', 'data-skin': 'knock', 'data-screen': 'knock' },
    h(
      'div',
      { class: 'bc-letter' },
      h('div', { class: 'bc-letter-head' }, 'SMUGGLED NOTE THROUGH THE BRICKS'),
      h('p', { class: 'neighbor' }, `“${text.ask}”`),
      h('p', { class: 'neighbor offer' }, `“${text.offer}”`),
      h('p', { class: 'bc-trade' }, `YOU GIVE: ${text.give} · YOU GET: ${text.get}`),
      h(
        'div',
        { class: 'cell-dock' },
        button(
          {
            primary: can,
            disabled: !can,
            why,
            cue: 'select',
            k: 'help',
            onclick: () => on.answer(true),
          },
          `Slide Over ${text.give}`,
        ),
        button(
          { primary: !can, k: 'ignore', onclick: () => on.answer(false) },
          'Ignore The Tapping',
        ),
      ),
      h(
        'div',
        { class: 'bc-letter-foot' },
        `The neighbor has knocked ${plural(r.neighbor.asked, 'time')} · You helped ${plural(r.neighbor.helped, 'time')}`,
      ),
    ),
  );
}

// ------------------------------------------------------------------ ball over

export interface BallEndData {
  r: RunState;
  o: BallOutcome;
  res: BallResult;
}

export function ballEndPanel(
  d: BallEndData,
  on: { next(): void; tick(): void },
  replay: HTMLElement | null,
): HTMLElement {
  const { r, o, res } = d;
  const t = tally(o, res, r.looseChange);
  /** A receipt line whose figure counts up from zero, a beat after the one above it. */
  const row = (
    label: string,
    value: number,
    key: string,
    delay: number,
    o2: { decimals?: number; prefix?: string; cls?: string; tick?: boolean } = {},
  ) => {
    const n = h('span', { class: 'n' });
    const dec = o2.decimals ?? 0;
    countTo(n, value, {
      key,
      from: 0,
      ms: 900,
      delay,
      decimals: dec,
      prefix: o2.prefix,
      format: (v) => `${o2.prefix ?? ''}${dec ? formatCoins(v) : fmtInt(v)}c`,
      onStep: o2.tick ? on.tick : undefined,
    });
    return h(
      'div',
      { class: `receipt-row stagger${o2.cls ? ` ${o2.cls}` : ''}` },
      h('span', { class: 'receipt-row-label' }, label),
      h('span', { class: 'receipt-row-dots' }),
      h('span', { class: `receipt-row-val${o2.cls === 'total' ? ' highlight' : ''}` }, n),
    );
  };
  const lost = t.lost ? 'lost' : '';
  const lines: (HTMLElement | null)[] = [
    h(
      'div',
      { class: 'receipt-header' },
      h('h2', { class: 'receipt-title' }, 'PENITENTIARY LABOR LOG'),
      h(
        'div',
        { class: 'receipt-sub' },
        `DEADLINE ${r.deadline + 1} · ROUND ${r.round + 1} · BALL ${Math.min(r.ballsPlayed, r.ballsThisRound)} OF ${r.ballsThisRound}`,
      ),
    ),
    h(
      'div',
      { class: 'receipt-stamp-box' },
      h(
        'span',
        { class: `receipt-stamp ${t.lost ? 'tilted' : 'settled'}` },
        t.lost ? 'FORFEIT / TILTED' : 'BALL SETTLED',
      ),
    ),
    t.lost
      ? h('div', { class: 'receipt-sub' }, 'The machine keeps everything that ball earned.')
      : null,
    row('Table Earnings', t.table, 'end.table', 0.1, { decimals: 1, cls: lost }),
    row('Bonus', t.bonus, 'end.bonus', 0.35, { decimals: 1, cls: lost }),
    t.carried >= 0.05
      ? row('Loose Change From Last Ball', t.carried, 'end.carried', 0.5, {
          decimals: 1,
          prefix: '+',
          cls: 'minor',
        })
      : null,
    // The honest sum, when the fractions matter: Total = into the Pocket + change kept.
    !t.lost && (t.carried >= 0.05 || t.kept >= 0.05)
      ? row('Total', t.table + t.bonus + t.carried, 'end.total', 0.6, { decimals: 1, cls: 'sum' })
      : null,
    row('Net Credited To Pocket', t.gained, 'end.gained', 0.7, {
      prefix: '+',
      cls: 'total',
      tick: true,
    }),
    t.kept >= 0.05
      ? row('Kept For Next Ball', t.kept, 'end.kept', 0.8, { decimals: 1, cls: 'minor' })
      : null,
    h(
      'div',
      { class: 'receipt-row stagger' },
      h('span', { class: 'receipt-row-label' }, 'Total Inmate Pocket'),
      h('span', { class: 'receipt-row-dots' }),
      h('span', { class: 'receipt-row-val' }, coins(r.pocket, 'g.pocket', 900)),
    ),
    h(
      'div',
      { class: 'receipt-row stagger' },
      h('span', { class: 'receipt-row-label' }, 'Balls Remaining In Rack'),
      h('span', { class: 'receipt-row-dots' }),
      h('span', { class: 'receipt-row-val' }, String(ballsLeft(r))),
    ),
  ];
  if (o.extraBalls)
    lines.push(
      h('div', { class: 'receipt-alert-box' }, `★ EXTRA BALL AWARDED: +${o.extraBalls} THIS ROUND`),
    );
  for (const l of o.levelUps)
    lines.push(
      h(
        'div',
        { class: 'receipt-alert-box' },
        `▲ SHOT UPGRADE: ${shotName(l).toUpperCase()} NOW LVL ${r.shotLevels[l]}`,
      ),
    );
  if (res.debtAdded)
    lines.push(
      h(
        'div',
        { class: 'receipt-alert-box bad' },
        `⚠ HEAD COUNT: +${fmtInt(res.debtAdded)}c DEBT`,
      ),
    );
  if (res.jobDone)
    lines.push(
      h(
        'div',
        { class: 'receipt-alert-box' },
        `★ WORK ORDER COMPLETE: ${jobText(res.jobDone, r.job!.target)} (${rewardText(res.jobDone, r.deadline)})`,
      ),
    );
  else if (r.job && !r.job.done)
    lines.push(
      h(
        'div',
        { class: 'receipt-sub', style: { textAlign: 'center', marginTop: '6px' } },
        `Active Job: ${jobText(jobDef(r.job.id), r.job.target)} (${formatCoins(r.job.progress)}/${r.job.target})`,
      ),
    );
  return h(
    'div',
    { class: 'panel', 'data-skin': 'tally', 'data-screen': 'ballend' },
    ...lines,
    h(
      'div',
      { class: 'cell-dock' },
      button({ primary: true, k: 'next', onclick: on.next }, 'Continue'),
      replay,
    ),
  );
}

// ------------------------------------------------------------------ payment

export function deadlinePanel(r: RunState, on: { deposit(): void; pay(): void }): HTMLElement {
  const canPay = r.bank >= r.debt;
  const couldPay = r.bank + r.pocket >= r.debt;
  const shortfall = Math.max(0, r.debt - r.bank);
  return h(
    'div',
    { class: 'panel atm', 'data-skin': 'atm', 'data-screen': 'deadline' },
    h(
      'div',
      { class: 'atm-terminal-screen' },
      h(
        'div',
        { class: 'atm-header-banner' },
        h('h2', null, `DEADLINE ${r.deadline + 1} RECONCILIATION`),
        h(
          'div',
          { class: 'atm-header-sub' },
          canPay
            ? '★ ACCOUNT SOLVENT: PROCEED WITH REPAYMENT ★'
            : '⚠ DEBT SHORTFALL: TRAPDOOR ARMED ⚠',
        ),
      ),
      h(
        'div',
        { class: 'atm-readouts' },
        readout('Bank Vault Balance', coins(r.bank, 'g.bank'), 'green'),
        readout('Debt Target', coins(r.debt, 'g.debt'), 'red'),
        readout('Pocket Cash', coins(r.pocket, 'g.pocket'), 'amber'),
        readout(
          'Settlement Status',
          canPay ? 'READY TO SETTLE' : `SHORTFALL: -${shortfall}c`,
          canPay ? 'green' : 'red',
          canPay ? 'status-solvent' : 'status-shortfall',
        ),
      ),
      h('div', { class: `atm-verdict ${standing(r).tone}` }, `> ${standing(r).text.toUpperCase()}`),
      h(
        'div',
        { class: 'atm-outcomes' },
        h('span', { class: 'good' }, 'PAY: THE PHONE RINGS, PICK A PERK.'),
        h('span', { class: 'bad' }, 'FAIL: THE FLOOR OPENS. THE RUN ENDS.'),
      ),
      h(
        'div',
        { class: 'cell-dock' },
        button(
          {
            primary: couldPay && !canPay,
            disabled: r.pocket < 1,
            why: 'Your Pocket is empty.',
            k: 'deposit',
            onclick: on.deposit,
          },
          'Make Final Deposit',
        ),
        canPay
          ? button({ primary: true, cue: 'reward', k: 'pay', onclick: on.pay }, 'Pay Debt & Settle')
          : button(
              { primary: !couldPay, class: 'danger', k: 'pay', onclick: on.pay },
              'Face The Warden',
            ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ end of run

export interface RunEndData {
  r: RunState;
  fresh: UnlockDef[];
  tallies: number;
  dailyBest: boolean;
  dailyLine: string | null;
  unlockText(u: UnlockDef): string;
}

const ENDING_TEXT: Record<string, string> = {
  paidInFull: 'Paid in full. The door opens.',
  breakout: 'Escaped through the drain. JAILBREAK.',
  cellmate: 'Paid in full. The wall came down.',
};

export function runEndPanel(
  d: RunEndData,
  on: { again(): void; copyLink(): void },
  replay: HTMLElement | null,
): HTMLElement {
  const { r } = d;
  const fell = r.result === 'fell';
  const drains = Object.entries(r.stats.drains)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  const stat = (label: string, value: string) => [label, h('b', null, value)];
  return h(
    'div',
    {
      class: 'panel rapsheet',
      'data-skin': fell ? 'rapsheet' : 'endingResult',
      'data-screen': 'runend',
    },
    h('h1', null, 'Rap sheet'),
    h(
      'p',
      null,
      fell
        ? `Fell at deadline ${r.deadline + 1}${r.endless ? ' (Endless)' : ` of ${r.deadlines}`}, still owing ${fmtInt(r.debt)}c.`
        : (ENDING_TEXT[r.result ?? ''] ?? ''),
    ),
    h(
      'p',
      { class: 'dim' },
      `${inmateDef(r.inmate).name}${r.hardTime ? `, Hard Time ${r.hardTime}` : ''} · seed ${r.seed}${r.assist ? ' · assist' : ''}`,
    ),
    d.dailyLine ? h('p', { class: d.dailyBest ? 'good' : 'dim' }, d.dailyLine) : null,
    d.fresh.length
      ? h(
          'div',
          { class: 'unlocks' },
          h('b', null, 'Unlocked'),
          ...d.fresh.map((u) => h('p', { class: 'stagger' }, d.unlockText(u))),
        )
      : null,
    h(
      'div',
      { class: 'grid' },
      ...stat('Balls played', String(r.stats.balls)),
      ...stat('Coins earned', `${fmtInt(r.stats.coinsEarned)}c`),
      ...stat('Best ball', `${fmtInt(r.stats.biggestBall)}c`),
      ...stat('Biggest PAYDAY', `${fmtInt(Math.round(r.stats.biggestPayday))}c`),
      ...stat('Longest combo', String(r.stats.longestCombo)),
      ...stat('Skill shots', String(r.stats.skillShots)),
      ...stat('RIOTs', String(r.stats.riots)),
      ...stat('Jobs done', String(r.stats.jobsDone)),
      ...stat('Sentences survived', String(r.stats.sentencesSurvived)),
      ...stat('Loans', String(r.stats.loans)),
      ...stat('Paid early', String(r.stats.earlyPays)),
      ...stat('Red calls', `${r.stats.redCalls} (${r.bargains.length} taken)`),
      ...stat('Tilts', String(r.stats.tilts)),
    ),
    h('p', { class: 'dim' }, `Drains: ${drains || 'none'}`),
    h(
      'p',
      { class: 'dim' },
      `Build: ${r.charms.map((id) => charmDef(id).name).join(', ') || 'no charms'}`,
    ),
    h('p', { class: 'dim' }, 'A new mark is scratched into the wall.'),
    tallyMarks(d.tallies),
    h(
      'div',
      { class: 'row' },
      button({ primary: true, cue: 'select', k: 'again', onclick: on.again }, 'Again'),
      button({ k: 'link', onclick: on.copyLink }, 'Copy seed link'),
      replay,
    ),
  );
}

// ------------------------------------------------------------------ unlock toast

export function unlockToast(title: string, what: string): HTMLElement {
  return h(
    'div',
    { class: 'unlock-body' },
    h('span', { class: 'unlock-title' }, title),
    h('span', { class: 'unlock-what' }, what),
  );
}
