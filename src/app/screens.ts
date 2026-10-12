/**
 * The run's screens as pure view builders: title, deadline intro, Jobs, buy balls, the cell,
 * ATM, vending cabinet, phone, knock, ball over, payment and the end-of-run Rap Sheet. Each
 * takes the run's state plus callbacks and returns a panel; the game flow (game-app.ts) owns
 * what happens next. Locked buttons say why (see `btn`), numbers count up from what the
 * previous render showed (see counter.ts).
 */
import { h } from './ui';
import { icon, type IconName } from './icons';
import {
  amount,
  ballPips,
  bar,
  btn,
  card,
  chip,
  kbd,
  keyFor,
  panel,
  quote,
  section,
  stat,
  tallyMarks,
  type Contents,
} from './widgets';
import { countTo, fmtInt } from './counter';
import { formatCoins } from '../present/pops';
import { ECONOMY } from '../content/balance';
import { charmDef, RARITY_COLORS, type CharmDef } from '../content/charms';
import { contrabandDef } from '../content/contraband';
import { inmateDef } from '../content/inmates';
import { jobDef, jobText, type JobDef } from '../content/jobs';
import { bargainDef, perkDef, type PerkEffect } from '../content/phone';
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
import type { NeighborKnock } from '../rules/run';

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
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Deadline 2 of 8 · Round 1 of 3" */
export function where(r: RunState): string {
  return `Deadline ${r.deadline + 1}${r.endless ? '' : ` of ${r.deadlines}`} · Round ${r.round + 1} of ${roundsIn(r)}`;
}

/** A number that counts on from the last value shown under `key`. */
function num(
  value: number,
  key: string,
  o: { ms?: number; delay?: number; decimals?: number } = {},
): HTMLElement {
  const el = h('span', { class: 'n' });
  countTo(el, value, { key, ms: o.ms ?? 650, delay: o.delay, decimals: o.decimals });
  return el;
}

function money(
  value: number,
  key: string,
  kind: 'coin' | 'ticket' | 'key' = 'coin',
  ms?: number,
): HTMLElement {
  return h('span', { class: `amt amt-${kind}` }, num(value, key, { ms }), icon(kind, 'amt-ico'));
}

/** Reward chips for a Job. */
function rewardChips(def: JobDef, deadline: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  const rw = def.reward;
  if (rw.keys) out.push(chip(plural(rw.keys, 'key'), 'gold', { icon: 'key' }));
  if (rw.tickets) out.push(chip(plural(rw.tickets, 'ticket'), 'info', { icon: 'ticket' }));
  const coins = jobCoins(def, deadline);
  if (coins) out.push(chip(plural(coins, 'coin'), 'gold', { icon: 'coin' }));
  if (rw.level) out.push(chip(`+1 ${shotName(rw.level)} level`, 'good', { icon: 'up' }));
  return out;
}

/** Where the player stands against the debt, in one plain sentence. */
function standing(r: RunState): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const short = r.debt - r.bank;
  if (short <= 0) return { tone: 'good', text: 'The Bank covers the debt.' };
  if (r.pocket >= short)
    return { tone: 'warn', text: `Deposit ${fmtInt(short)} from your Pocket to cover the debt.` };
  return {
    tone: 'bad',
    text: `${fmtInt(short - r.pocket)} short, even if you deposit your whole Pocket.`,
  };
}

/**
 * The verdict as a call-out. The status ribbon above every screen already shows Debt, Bank and
 * Pocket, so the panels only say what it means.
 */
function verdict(r: RunState): HTMLElement {
  const v = standing(r);
  return h(
    'div',
    { class: `callout-box ${v.tone === 'good' ? 'good' : v.tone === 'warn' ? 'warn' : 'bad'}` },
    icon(v.tone === 'good' ? 'check' : v.tone === 'warn' ? 'bank' : 'warn'),
    h('div', { class: 'cb-text' }, h('b', null, v.text)),
  );
}

/** The Warden's warning for a Sentence (a card per Sentence). */
function sentenceCards(r: RunState): HTMLElement[] {
  return r.sentences.map((id) => {
    const d = sentenceDef(id);
    return h(
      'div',
      { class: 'sentence-card stagger' },
      h('div', { class: 'sentence-top' }, icon('warn'), h('b', null, d.name)),
      h('p', null, d.text),
    );
  });
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

export function titlePanel(o: TitleOpts, on: TitleHandlers): HTMLElement {
  const s = o.saved;
  const help = o.touch
    ? h(
        'p',
        { class: 'help' },
        'Touch the left or right half of the screen to flip. Drag down in the bottom-right corner to pull the plunger.',
      )
    : h(
        'div',
        { class: 'help keys' },
        h('span', null, kbd(keyFor('left')), kbd(keyFor('right')), ' flippers'),
        h('span', null, kbd(keyFor('plunger')), ' hold to plunge'),
        h('span', null, kbd(keyFor('nudge')), ' nudge'),
        h('span', null, kbd(keyFor('pause')), ' pause'),
      );
  return panel({
    screen: 'title',
    size: 'sm',
    class: 'title-card',
    label: 'Ball & Chain',
    navHint: false,
    body: [
      h(
        'div',
        { class: 'title-hero' },
        h('div', { class: 'title-eyebrow' }, icon('debt'), "Debtor's Prison"),
        h('h1', { class: 'logo' }, 'Ball ', h('span', null, '&'), ' Chain'),
        h('p', { class: 'tagline' }, 'You owe the Warden. The machine is the only way out.'),
      ),
      h(
        'div',
        { class: 'title-menu' },
        s
          ? btn('Continue', {
              variant: 'primary',
              icon: 'chevron',
              key: keyFor('confirm'),
              sub: `Deadline ${s.deadline + 1}, round ${s.round + 1} · owing ${fmtInt(s.debt)}`,
              block: true,
              k: 'continue',
              onclick: on.continueRun,
            })
          : null,
        btn(s ? 'New run' : 'Wake up', {
          variant: s ? 'secondary' : 'primary',
          icon: s ? undefined : 'chevron',
          key: s ? null : keyFor('confirm'),
          block: true,
          k: 'new',
          onclick: on.newRun,
        }),
        btn('Daily Sentence', {
          sub: o.dailyBest || 'The same run for everyone, today only',
          block: true,
          k: 'daily',
          onclick: on.daily,
        }),
        h(
          'div',
          { class: 'title-row' },
          btn('Rap sheet', { icon: 'trophy', k: 'meta', onclick: on.rapSheet }),
          btn('Settings', { icon: 'gear', k: 'settings', onclick: on.settings }),
        ),
      ),
      h(
        'div',
        { class: 'title-foot' },
        h(
          'div',
          { class: 'wall' },
          h('span', { class: 'wall-label' }, 'Runs on the wall'),
          tallyMarks(o.tallies),
        ),
        help,
      ),
    ],
  });
}

// ------------------------------------------------------------------ deadline intro

export function introPanel(r: RunState, line: string, on: { next(): void }): HTMLElement {
  const last = lastCall(r);
  const rounds = roundsIn(r);
  const cards = sentenceCards(r);
  return panel({
    screen: 'intro',
    size: 'md',
    eyebrow: last ? 'The final debt' : 'A new debt',
    title: last
      ? `Deadline ${r.deadline + 1}: Last Call`
      : `Deadline ${r.deadline + 1} of ${r.deadlines}`,
    body: [
      h(
        'div',
        { class: 'owe stagger' },
        h('span', { class: 'owe-label' }, 'You owe the Warden'),
        h(
          'span',
          { class: 'owe-n' },
          num(r.debt, 'intro.debt', { ms: 900 }),
          icon('coin', 'amt-ico'),
        ),
        h('span', { class: 'owe-sub' }, `due after round ${rounds}`),
      ),
      quote('The Warden', line),
      r.deadline > 0
        ? h(
            'p',
            { class: 'callout good stagger' },
            icon('up'),
            `A heavier coin mech: the machine now pays x${formatCoins(payScale(r))}.`,
          )
        : null,
      section(
        r.sentences.length > 1 ? 'Sentences' : 'Sentence',
        [
          h(
            'p',
            { class: 'dim' },
            `Applies to round ${ECONOMY.roundsPerDeadline}. It changes the table for that round only.`,
          ),
          h('div', { class: 'sentences' }, cards),
        ],
        { class: 'sentence-section' },
      ),
    ],
    foot: btn('To the ATM', {
      variant: 'primary',
      key: keyFor('confirm'),
      icon: 'chevron',
      k: 'next',
      onclick: on.next,
    }),
  });
}

// ------------------------------------------------------------------ jobs

export interface JobsHandlers {
  take(i: number): void;
  payEarly(): void;
}

export function jobsPanel(r: RunState, on: JobsHandlers): HTMLElement {
  const sentence = sentenceActive(r);
  const cards = r.jobOffers.map((o, i) => {
    const def = jobDef(o.id);
    return card(
      [
        h(
          'span',
          { class: 'card-top' },
          icon(def.key ? 'key' : 'job', 'card-ico'),
          def.key ? chip('Key job', 'gold') : null,
        ),
        h('span', { class: 'card-title' }, jobText(def, o.target)),
        h('span', { class: 'card-label' }, 'Reward'),
        h('span', { class: 'chips' }, rewardChips(def, r.deadline)),
      ],
      {
        class: `job-card${def.key ? ' key' : ''}`,
        primary: i === 0,
        k: `job${i}`,
        onclick: () => on.take(i),
      },
    );
  });
  const early = canPayEarly(r)
    ? h(
        'div',
        { class: 'callout-box good stagger' },
        h(
          'div',
          { class: 'cb-text' },
          h('b', null, 'Your Bank already covers the debt.'),
          h(
            'span',
            null,
            'Pay now to skip the rest of this deadline, Sentence and all, and collect tickets.',
          ),
        ),
        btn('Pay the debt now', {
          icon: 'ticket',
          sub: `+${plural(payEarlyReward(r), 'ticket')}`,
          cue: 'reward',
          k: 'early',
          onclick: on.payEarly,
        }),
      )
    : null;
  return panel({
    screen: 'jobs',
    size: 'lg',
    eyebrow: where(r),
    title: 'Take a job',
    titleIcon: 'job',
    lede: 'The ATM posts three jobs. Take one, then do it on the table for the reward.',
    body: [
      sentence
        ? h(
            'div',
            { class: 'callout-box bad' },
            icon('warn'),
            h(
              'div',
              { class: 'cb-text' },
              h('b', null, 'Sentence round'),
              h('span', null, r.sentences.map((id) => sentenceDef(id).name).join(' + ')),
            ),
          )
        : null,
      h('div', { class: 'cards cols-3' }, cards),
      early,
    ],
    foot: null,
  });
}

// ------------------------------------------------------------------ buy balls

export function buyPanel(r: RunState, on: { buy(n: number): void }): HTMLElement {
  const price = ballPrice(r);
  const free = freeBalls(r);
  const max = maxAffordableBalls(r);
  const cards: HTMLElement[] = [];
  for (let n = 1; n <= ECONOMY.maxBallsPerRound; n++) {
    const cost = costForBalls(r, n);
    const short = cost - r.pocket;
    cards.push(
      card(
        [
          h('span', { class: 'ball-row' }, ballPips(n, 0, false)),
          h('span', { class: 'card-title' }, plural(n, 'ball')),
          h(
            'span',
            { class: 'ball-cost' },
            cost ? amount('coin', cost) : h('span', { class: 'free' }, 'Free'),
          ),
          h(
            'span',
            { class: 'card-foot' },
            n > max
              ? h('span', { class: 'bad' }, `Need ${fmtInt(short)} more`)
              : h('span', { class: 'dim' }, `${fmtInt(r.pocket - cost)} left in Pocket`),
          ),
        ],
        {
          class: 'ball-card',
          primary: n === Math.min(3, max),
          disabled: n > max,
          why: `Not enough coins: ${plural(n, 'ball')} costs ${cost}, you have ${r.pocket}.`,
          cue: cost ? 'buy' : 'select',
          k: `balls${n}`,
          onclick: () => on.buy(n),
        },
      ),
    );
  }
  return panel({
    screen: 'buy',
    size: 'lg',
    eyebrow: where(r),
    title: 'Buy balls',
    titleIcon: 'ball',
    lede: `Buy balls for this round. ${
      free > 1 ? `The first ${free} are free` : 'The first is free'
    }; each extra costs ${plural(price, 'coin')}.`,
    body: [
      h('div', { class: 'cards cols-5' }, cards),
      h(
        'p',
        { class: 'dim note-line' },
        icon('pocket'),
        `You have ${plural(r.pocket, 'coin')} in your Pocket. Coins you don't spend can go to the ATM.`,
      ),
    ],
  });
}

// ------------------------------------------------------------------ the cell

export interface CellHandlers {
  play(): void;
  atm(): void;
  shop(): void;
  /** Use a Contraband item (some need a shot or a charm slot as target). */
  use(i: number, target?: { shot?: ShotType; charmSlot?: number }): void;
}

function charmChips(r: RunState): HTMLElement {
  const items = r.charms.map((id, i) => {
    const c = charmDef(id);
    const ch = c.active ? (r.charges[id] ?? 0) : 0;
    return h(
      'span',
      {
        class: `charm-chip${c.cursed ? ' cursed' : ''}`,
        style: { '--rar': RARITY_COLORS[c.rarity] },
        title: c.text,
      },
      icon(c.cursed ? 'devil' : 'star'),
      h('span', { class: 'cc-name' }, c.name),
      c.active
        ? h(
            'span',
            { class: 'cc-active' },
            kbd(String(i + 1)),
            ballPips(c.active.charges, ch, false),
          )
        : null,
    );
  });
  const empty = Array.from({ length: Math.max(0, r.mods.charmSlots - r.charms.length) }, () =>
    h('span', { class: 'charm-chip empty' }, 'empty slot'),
  );
  return h('div', { class: 'charm-chips' }, items, empty);
}

function stashList(r: RunState, on: CellHandlers): HTMLElement | null {
  if (!r.contraband.length) return null;
  const rows = r.contraband.map((id, i) => {
    const d = contrabandDef(id);
    let actions: Contents;
    if (d.target === 'shot')
      actions = h(
        'div',
        { class: 'targets' },
        (['chute', 'perimeter', 'hole', 'cellblock', 'yard', 'lanes'] as const).map((shot) =>
          btn(shotName(shot), {
            class: 'small',
            k: `use${i}-${shot}`,
            onclick: () => on.use(i, { shot }),
          }),
        ),
      );
    else if (d.target === 'charm')
      actions = h(
        'div',
        { class: 'targets' },
        r.charms.length
          ? r.charms.map((cid, slot) =>
              btn(charmDef(cid).name, {
                class: 'small',
                k: `use${i}-c${slot}`,
                onclick: () => on.use(i, { charmSlot: slot }),
              }),
            )
          : h('span', { class: 'dim' }, 'You have no charms to use it on.'),
      );
    else
      actions = btn('Use', {
        class: 'small',
        disabled: !canUse(r, id),
        why: `${d.name} can't be used right now.`,
        k: `use${i}`,
        onclick: () => on.use(i),
      });
    return h(
      'div',
      { class: 'stash-item' },
      h('div', { class: 'si-text' }, h('b', null, d.name), h('span', null, d.text)),
      actions,
    );
  });
  return section('Contraband', h('div', { class: 'stash' }, rows), {
    aside: `${r.contraband.length} / ${contrabandSlots(r)}`,
  });
}

export function cellPanel(r: RunState, on: CellHandlers): HTMLElement {
  const left = ballsLeft(r);
  const job = r.job;
  const levels = (Object.entries(r.shotLevels) as [ShotType, number][]).map(([k, v]) =>
    h(
      'span',
      { class: `lvl${v > 1 ? ' up' : ''}` },
      h('span', { class: 'lvl-name' }, shotName(k)),
      h('b', null, String(v)),
    ),
  );
  const sentence = sentenceActive(r);
  return panel({
    screen: 'cell',
    size: 'xl',
    eyebrow: where(r),
    title: 'The cell',
    lede:
      left > 0
        ? `${plural(left, 'ball')} left this round. Spend or deposit coins first if you want to, then play.`
        : 'No balls left this round.',
    body: h(
      'div',
      { class: 'two-col' },
      h(
        'div',
        { class: 'col' },
        verdict(r),
        job
          ? h(
              'div',
              { class: `job-line${job.done ? ' done' : ''}` },
              icon('job'),
              h(
                'div',
                { class: 'jl-text' },
                h('b', null, jobText(jobDef(job.id), job.target)),
                bar(job.done ? 1 : job.progress / job.target, 'job-bar'),
                h(
                  'span',
                  { class: 'dim' },
                  job.done ? 'Done' : `${formatCoins(job.progress)} / ${job.target}`,
                ),
              ),
            )
          : null,
        h(
          'div',
          { class: `callout-box ${sentence ? 'bad' : 'plain'}` },
          icon(sentence ? 'warn' : 'clock'),
          h(
            'div',
            { class: 'cb-text' },
            h('b', null, sentence ? 'Sentence in force' : `Sentence in round ${roundsIn(r)}`),
            h('span', null, r.sentences.map((id) => sentenceDef(id).name).join(', ')),
          ),
        ),
        section('Shot levels', h('div', { class: 'levels' }, levels), {
          aside: 'Jobs and perks raise them',
        }),
      ),
      h(
        'div',
        { class: 'col' },
        section(
          'Charms',
          [
            charmChips(r),
            r.charms.length
              ? null
              : h(
                  'p',
                  { class: 'dim note-line' },
                  'Charms change how the table pays. Buy them at the vending cabinet with tickets.',
                ),
          ],
          { aside: `${r.charms.length} / ${r.mods.charmSlots}` },
        ),
        stashList(r, on),
      ),
    ),
    foot: [
      btn('ATM', { icon: 'bank', sub: 'Deposit, borrow', k: 'atm', onclick: on.atm }),
      btn('Vending cabinet', {
        icon: 'ticket',
        sub: 'Charms, contraband',
        k: 'shop',
        onclick: on.shop,
      }),
      btn('Play ball', {
        variant: 'primary',
        icon: 'ball',
        key: keyFor('confirm'),
        sub: `Ball ${r.ballsPlayed + 1} of ${r.ballsThisRound}`,
        disabled: left <= 0,
        why: 'No balls left this round.',
        k: 'play',
        onclick: on.play,
      }),
    ],
  });
}

// ------------------------------------------------------------------ ATM

export interface AtmHandlers {
  deposit(n: number): void;
  borrow(n: number): void;
  done(): void;
}

export function atmPanel(r: RunState, back: 'cell' | 'deadline', on: AtmHandlers): HTMLElement {
  const need = Math.max(0, r.debt - r.bank);
  const covers = need > 0 && r.pocket >= need;
  /** A deposit button that says what it does to the debt, and locks if the Pocket cannot cover it. */
  const quick = (label: string, n: number, k: string, sub?: string, cls = '') =>
    btn(label, {
      sub,
      disabled: n < 1 || r.pocket < n,
      why:
        r.pocket < 1
          ? 'Your Pocket is empty.'
          : `You only have ${fmtInt(r.pocket)} in your Pocket.`,
      cue: 'deposit',
      k,
      class: `quick${cls ? ` ${cls}` : ''}`,
      onclick: () => on.deposit(n),
    });
  const owedAfter = (n: number) =>
    need - n <= 0 ? 'covers the debt' : `${fmtInt(need - n)} still owed`;
  const deposits = [
    quick('+1', 1, 'dep1'),
    quick('+5', 5, 'dep5'),
    quick('+10', 10, 'dep10'),
    // Only offered when it can actually settle the debt (otherwise it is the same as Everything).
    covers
      ? quick('Cover the debt', need, 'depOwed', `${fmtInt(need)} coins · covers it`, 'cover')
      : null,
    covers && r.pocket === need
      ? null
      : quick(
          'Everything',
          r.pocket,
          'depAll',
          r.pocket > 0
            ? `${fmtInt(r.pocket)} coins · ${need > 0 ? owedAfter(r.pocket) : 'earns interest'}`
            : undefined,
        ),
  ];
  const avail = loanAvailable(r);
  const half = Math.max(1, Math.floor(avail / 2));
  const loan = (n: number, k: string, label: string) =>
    card(
      [
        h('span', { class: 'card-label' }, label),
        h('span', { class: 'card-title' }, amount('coin', n, { big: true })),
        h(
          'span',
          { class: 'card-foot bad' },
          `Adds ${fmtInt(loanCost(r, n))} to next deadline's debt`,
        ),
      ],
      { class: 'loan-card', k, cue: 'deposit', onclick: () => on.borrow(n) },
    );
  const loanBody =
    avail > 0
      ? [
          h(
            'p',
            { class: 'dim' },
            `Borrow into your Pocket now; it is repaid at ${loanCost(r, 100)}% with the next debt. You can borrow ${fmtInt(avail)} more this deadline.`,
          ),
          h('div', { class: 'cards cols-2' }, [
            loan(half, 'loan-half', 'Small loan'),
            loan(avail, 'loan-all', 'Biggest loan'),
          ]),
        ]
      : [
          h(
            'p',
            { class: 'dim' },
            lastCall(r) ? 'No loans on Last Call.' : 'You have borrowed all you can this deadline.',
          ),
        ];
  // The ribbon already shows Debt, Bank and Pocket, so the terminal says only what they mean.
  return panel({
    screen: 'atm',
    size: 'lg',
    class: 'atm',
    eyebrow: back === 'deadline' ? 'Final deposit' : where(r),
    title: 'Automated Teller',
    titleIcon: 'bank',
    lede:
      back === 'deadline'
        ? 'Whatever is in the Bank when the Warden calls decides it. Deposits are final.'
        : 'Only banked coins pay the debt. Deposits are final, and the Bank pays interest at the end of every round.',
    body: [
      verdict(r),
      h(
        'div',
        { class: 'two-col atm-cols' },
        section(
          'Deposit',
          [
            h('div', { class: 'quick-grid' }, deposits),
            h(
              'p',
              { class: 'dim note-line' },
              icon('bank'),
              `The Bank pays ${Math.round(interestRate(r) * 100)}% interest when a round ends.${
                r.bank >= r.debt ? ' It covers the debt now: pay early next round for tickets.' : ''
              }`,
            ),
          ],
          { aside: `${fmtInt(r.pocket)} in Pocket` },
        ),
        section('Loan', loanBody, {
          aside: r.loanDue ? `Owed with next debt: ${fmtInt(r.loanDue)}` : undefined,
        }),
      ),
    ],
    foot: btn('Done', {
      variant: 'primary',
      key: keyFor('confirm'),
      cue: 'back',
      k: 'done',
      onclick: on.done,
    }),
  });
}

// ------------------------------------------------------------------ vending cabinet

export interface ShopHandlers {
  buyCharm(i: number): void;
  buyContraband(i: number): void;
  sell(slot: number): void;
  reroll(): void;
  done(): void;
}

/** A price tag in the corner of a shop card; red when it is out of reach. */
function priceTag(kind: 'ticket' | 'coin', cost: number, out: boolean): HTMLElement {
  return h(
    'span',
    { class: `sc-cost ${kind}${out ? ' out' : ''}` },
    h('span', { class: 'n' }, fmtInt(cost)),
    icon(kind, 'amt-ico'),
  );
}

function charmCard(
  r: RunState,
  c: CharmDef,
  i: number,
  tags: Set<string>,
  on: ShopHandlers,
): HTMLElement {
  const full = r.charms.length >= r.mods.charmSlots;
  const short = c.cost - r.tickets;
  const why = full
    ? `Your charm slots are full (${r.charms.length} / ${r.mods.charmSlots}). Sell a charm first.`
    : `You need ${plural(short, 'more ticket')} for ${c.name}.`;
  const synergy = c.tags.some((t) => tags.has(t));
  return card(
    [
      h(
        'span',
        { class: 'sc-head' },
        h('span', { class: 'card-title' }, c.name),
        priceTag('ticket', c.cost, short > 0),
      ),
      h('span', { class: 'card-text' }, c.text),
      h(
        'span',
        { class: 'sc-meta' },
        h('span', { class: 'rarity' }, c.rarity),
        c.tags.map((t) => chip(t, tags.has(t) ? 'gold' : 'ghost')),
        synergy
          ? chip('Synergy', 'gold', { icon: 'star', title: 'Shares a tag with a charm you own' })
          : null,
        full
          ? h('span', { class: 'sc-status' }, 'Slots full')
          : short > 0
            ? h('span', { class: 'sc-status' }, `Need ${short} more`)
            : null,
      ),
    ],
    {
      class: `shop-card charm-card${synergy ? ' synergy' : ''}`,
      accent: RARITY_COLORS[c.rarity],
      disabled: r.tickets < c.cost || full,
      why,
      cue: 'buy',
      k: `charm${i}`,
      onclick: () => on.buyCharm(i),
    },
  );
}

export function shopPanel(r: RunState, on: ShopHandlers): HTMLElement {
  const tags = ownedTags(r);
  const charms = r.shop.charms.map((id, i) => charmCard(r, charmDef(id), i, tags, on));
  const slots = contrabandSlots(r);
  const slotsFull = r.contraband.length >= slots;
  const stock = r.shop.contraband.map((id, i) => {
    const d = contrabandDef(id);
    const price = contrabandPrice(r, id);
    const short = price - r.pocket;
    return card(
      [
        h(
          'span',
          { class: 'sc-head' },
          h('span', { class: 'card-title' }, d.name),
          priceTag('coin', price, short > 0),
        ),
        h('span', { class: 'card-text' }, d.text),
        h(
          'span',
          { class: 'sc-meta' },
          d.rare ? h('span', { class: 'rarity' }, 'Rare') : null,
          slotsFull
            ? h('span', { class: 'sc-status' }, 'Slots full')
            : short > 0
              ? h('span', { class: 'sc-status' }, `Need ${fmtInt(short)} more`)
              : null,
        ),
      ],
      {
        class: 'shop-card contra-card',
        accent: d.rare ? RARITY_COLORS.legendary : undefined,
        disabled: r.pocket < price || slotsFull,
        why: slotsFull
          ? `Your contraband slots are full (${r.contraband.length} / ${slots}). Use something first.`
          : `You need ${plural(short, 'more coin')} for ${d.name}.`,
        cue: 'buy',
        k: `contra${i}`,
        onclick: () => on.buyContraband(i),
      },
    );
  });
  const owned = r.charms.map((id, slot) => {
    const c = charmDef(id);
    return h(
      'div',
      {
        class: `owned-charm stagger${c.cursed ? ' cursed' : ''}`,
        style: { '--rar': RARITY_COLORS[c.rarity] },
      },
      h(
        'div',
        { class: 'oc-text' },
        h('b', null, c.name),
        h('span', { class: 'rarity' }, c.rarity),
      ),
      btn('Sell', {
        class: 'small',
        sub: c.cursed ? 'Cursed' : `+${plural(sellValue(r, id), 'ticket')}`,
        disabled: !!c.cursed,
        why: `${c.name} is a devil's charm: it can't be sold.`,
        cue: 'sell',
        k: `sell${slot}`,
        onclick: () => on.sell(slot),
      }),
    );
  });
  const cost = rerollCost(r);
  const charmSection = section('Charms', h('div', { class: 'cards cols-3' }, charms), {
    aside: `Paid in tickets · ${r.charms.length} of ${r.mods.charmSlots} slots`,
  });
  const contraSection = section(
    'Contraband',
    stock.length
      ? h('div', { class: 'cards cols-3' }, stock)
      : h('p', { class: 'dim' }, 'Sold out.'),
    { aside: `Paid in coins · ${r.contraband.length} of ${slots} slots` },
  );
  const ownedSection = owned.length
    ? section('Your charms', h('div', { class: 'owned' }, owned), { aside: 'Sell for tickets' })
    : null;
  // When the panel scrolls (small screens, large text) a sticky row jumps between its sections.
  const jump = (label: string, to: HTMLElement | null) =>
    to
      ? h(
          'button',
          {
            type: 'button',
            class: 'jump',
            tabindex: -1,
            'data-nofocus': '',
            'data-cue': 'move',
            onclick: () => to.scrollIntoView({ block: 'start', behavior: 'smooth' }),
          },
          label,
        )
      : null;
  return panel({
    screen: 'shop',
    size: 'xl',
    eyebrow: where(r),
    title: 'Vending cabinet',
    titleIcon: 'ticket',
    body: [
      h(
        'div',
        { class: 'jump-row' },
        jump('Charms', charmSection),
        jump('Contraband', contraSection),
        jump('Sell', ownedSection),
      ),
      charmSection,
      contraSection,
      ownedSection,
    ],
    foot: [
      btn('Reroll', {
        icon: 'reroll',
        sub: amount('coin', cost),
        disabled: r.pocket < cost,
        why: `A reroll costs ${plural(cost, 'coin')}; you have ${r.pocket}.`,
        cue: 'buy',
        k: 'reroll',
        onclick: on.reroll,
      }),
      btn('Done', {
        variant: 'primary',
        key: keyFor('confirm'),
        cue: 'back',
        k: 'done',
        onclick: on.done,
      }),
    ],
  });
}

// ------------------------------------------------------------------ the phone

const PERK_ICON: Record<PerkEffect['kind'], IconName> = {
  charmSlot: 'star',
  contrabandSlot: 'box',
  freeBall: 'ball',
  levels: 'up',
  ballSave: 'shield',
  bonusMax: 'bolt',
  tickets: 'ticket',
  interest: 'bank',
  rerolls: 'reroll',
};

export function phonePanel(
  r: RunState,
  line: string,
  on: { choose(i: number): void },
): HTMLElement {
  const call = r.call;
  const offers = call && call.kind === 'perks' ? call.offers : [];
  const cards = offers.map((o, i) => {
    const d = perkDef(o.id);
    return card(
      [
        h('span', { class: 'card-top' }, icon(PERK_ICON[d.effect.kind], 'card-ico big')),
        h(
          'span',
          { class: 'card-title' },
          d.text.replace('{shot}', o.shot ? shotName(o.shot) : ''),
        ),
      ],
      {
        class: 'perk-card',
        primary: i === 0,
        cue: 'reward',
        k: `perk${i}`,
        onclick: () => on.choose(i),
      },
    );
  });
  return panel({
    screen: 'phone',
    size: 'lg',
    eyebrow: 'The phone rings',
    title: 'Choose a perk',
    titleIcon: 'phone',
    lede: 'The debt is paid. Pick one perk: you keep it for the rest of your stay.',
    body: [quote('The Warden', line), h('div', { class: 'cards cols-3' }, cards)],
  });
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
    let accent = '#ff4a3a';
    if (id.startsWith('charm:')) {
      const c = charmDef(id.slice(6));
      name = `${c.name} (devil charm)`;
      gain = c.text;
      cost = 'Takes a charm slot. It cannot be sold.';
      accent = RARITY_COLORS.devil;
    } else {
      const b = bargainDef(id);
      name = b.name;
      gain = b.gain;
      cost = b.cost;
    }
    return card(
      [
        h('span', { class: 'card-top' }, icon('devil', 'card-ico')),
        h('span', { class: 'card-title' }, name),
        h('span', { class: 'bargain gain' }, h('i', null, 'You get'), gain),
        h('span', { class: 'bargain cost' }, h('i', null, 'It costs'), cost),
      ],
      { class: 'bargain-card', accent, cue: 'select', k: `deal${i}`, onclick: () => on.accept(i) },
    );
  });
  return panel({
    screen: 'redphone',
    tone: 'red',
    size: 'lg',
    eyebrow: 'Do not pick up',
    title: 'The red phone rings',
    titleIcon: 'devil',
    lede: 'Every deal here has a price. Hanging up costs nothing.',
    body: [quote('The Red Phone', line, 'red'), h('div', { class: 'cards cols-3' }, cards)],
    foot: btn('Hang up', {
      variant: 'primary',
      key: keyFor('confirm'),
      cue: 'back',
      k: 'hangup',
      onclick: on.hangUp,
    }),
  });
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
  return panel({
    screen: 'knock',
    size: 'md',
    class: 'knock',
    eyebrow: 'Through the wall',
    title: 'Someone is knocking',
    body: [
      quote('The neighbor', text.ask, 'neighbor'),
      h(
        'div',
        { class: 'trade stagger' },
        h(
          'div',
          { class: 'trade-side give' },
          h('span', { class: 'card-label' }, 'You give'),
          h('b', null, text.give),
        ),
        icon('chevron', 'trade-arrow'),
        h(
          'div',
          { class: 'trade-side get' },
          h('span', { class: 'card-label' }, 'You get'),
          h('b', null, text.get),
        ),
      ),
      h('p', { class: 'neighbor-offer' }, `“${text.offer}”`),
      h(
        'p',
        { class: 'dim' },
        `The neighbor has asked ${plural(r.neighbor.asked, 'time')}. You helped ${r.neighbor.helped}. You don't have to answer.`,
      ),
    ],
    foot: [
      btn('Ignore it', {
        variant: can ? 'secondary' : 'primary',
        k: 'ignore',
        onclick: () => on.answer(false),
      }),
      btn(`Slide over ${text.give}`, {
        variant: can ? 'primary' : 'secondary',
        key: can ? keyFor('confirm') : null,
        disabled: !can,
        why,
        cue: 'select',
        k: 'help',
        onclick: () => on.answer(true),
      }),
    ],
  });
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
  const tilted = o.tilted;
  const left = ballsLeft(r);
  const row = (
    label: string,
    value: number,
    key: string,
    delay: number,
    decimals = 0,
    cls = '',
    prefix = '',
  ) => {
    const n = h('span', { class: 'n' });
    countTo(n, value, {
      key,
      from: 0,
      ms: 900,
      delay,
      decimals,
      prefix,
      onStep: decimals ? undefined : on.tick,
    });
    return h(
      'div',
      { class: `tally-row stagger${cls ? ` ${cls}` : ''}` },
      h('span', { class: 'tr-label' }, label),
      h('span', { class: 'tr-value amt amt-coin' }, n, icon('coin', 'amt-ico')),
    );
  };
  // The Pocket takes whole coins; the fraction rides along to the next ball. The rows show it
  // both ways so the sum is honest: table + bonus + last ball's change = whole coins + new change.
  const kept = tilted ? 0 : r.looseChange;
  const carried = tilted ? 0 : Math.max(0, res.gained + kept - o.earned - o.bonus);
  const total = o.earned + o.bonus + carried;
  const lost = tilted ? 'lost' : '';
  const notes: HTMLElement[] = [];
  if (o.extraBalls)
    notes.push(chip(`Extra ball: +${o.extraBalls} this round`, 'good', { icon: 'ball' }));
  for (const l of o.levelUps)
    notes.push(chip(`${shotName(l)} is now level ${r.shotLevels[l]}`, 'good', { icon: 'up' }));
  if (res.debtAdded)
    notes.push(chip(`Head count: +${fmtInt(res.debtAdded)} debt`, 'bad', { icon: 'warn' }));
  let job: HTMLElement | null = null;
  if (res.jobDone) {
    job = h(
      'div',
      { class: 'callout-box good stagger' },
      icon('check'),
      h(
        'div',
        { class: 'cb-text' },
        h('b', null, 'Job done'),
        h('span', null, jobText(res.jobDone, r.job!.target)),
        h('span', { class: 'chips' }, rewardChips(res.jobDone, r.deadline)),
      ),
    );
  } else if (r.job && !r.job.done) {
    const def = jobDef(r.job.id);
    job = h(
      'div',
      { class: 'job-line stagger' },
      icon('job'),
      h(
        'div',
        { class: 'jl-text' },
        h('b', null, jobText(def, r.job.target)),
        bar(r.job.progress / r.job.target, 'job-bar'),
        h('span', { class: 'dim' }, `${formatCoins(r.job.progress)} / ${r.job.target}`),
      ),
    );
  }
  return panel({
    screen: 'ballend',
    tone: tilted ? 'red' : 'default',
    size: 'sm',
    eyebrow: `Ball ${Math.min(r.ballsPlayed, r.ballsThisRound)} of ${r.ballsThisRound}`,
    title: tilted ? 'Tilt' : 'Ball over',
    titleIcon: tilted ? 'warn' : 'ball',
    lede: tilted ? 'The machine keeps everything that ball earned.' : undefined,
    body: [
      h(
        'div',
        { class: `tally-rows${tilted ? ' tilted' : ''}` },
        row('Table', o.earned, 'end.table', 0.1, 1, lost),
        row('Bonus', o.bonus, 'end.bonus', 0.35, 1, lost),
        carried >= 0.05
          ? row('Loose change from last ball', carried, 'end.carried', 0.5, 1, 'minor', '+')
          : null,
        // Only when the fraction matters: Total = Pocket + the change kept for the next ball.
        !tilted && (carried >= 0.05 || kept >= 0.05)
          ? row('Total', total, 'end.total', 0.6, 1, 'sum')
          : null,
        row('Into your Pocket', res.gained, 'end.gained', 0.7, 0, 'total'),
        kept >= 0.05 ? row('Kept for next ball', kept, 'end.kept', 0.8, 1, 'minor') : null,
      ),
      h(
        'div',
        { class: 'tally-after stagger' },
        h('span', null, 'Pocket now'),
        h('b', null, money(r.pocket, 'end.pocket', 'coin', 900)),
        h(
          'span',
          { class: 'balls-left' },
          ballPips(r.ballsThisRound, r.ballsPlayed, false),
          left > 0 ? `${plural(left, 'ball')} left` : 'Round over',
        ),
      ),
      notes.length ? h('div', { class: 'chips notes' }, notes) : null,
      job,
    ],
    foot: [
      replay,
      btn('Continue', {
        variant: 'primary',
        icon: 'chevron',
        key: keyFor('confirm'),
        k: 'next',
        onclick: on.next,
      }),
    ],
  });
}

// ------------------------------------------------------------------ payment

export function deadlinePanel(r: RunState, on: { deposit(): void; pay(): void }): HTMLElement {
  const canPay = r.bank >= r.debt;
  const couldPay = r.bank + r.pocket >= r.debt;
  return panel({
    screen: 'deadline',
    size: 'md',
    class: 'atm',
    eyebrow: 'Payment due',
    title: `Deadline ${r.deadline + 1}`,
    titleIcon: 'clock',
    lede: 'The ATM chirps. The Warden has come for the debt.',
    body: [
      r.bank >= r.debt
        ? h(
            'div',
            { class: 'owe paid stagger' },
            h('span', { class: 'owe-label' }, 'Debt covered'),
            h('span', { class: 'owe-n' }, icon('check', 'owe-check'), 'Paid up'),
            h('span', { class: 'owe-sub' }, standing(r).text),
          )
        : h(
            'div',
            { class: 'owe stagger' },
            h('span', { class: 'owe-label' }, 'Still owed'),
            h(
              'span',
              { class: 'owe-n' },
              num(r.debt - r.bank, 'due.need', { ms: 900 }),
              icon('coin', 'amt-ico'),
            ),
            h('span', { class: 'owe-sub' }, standing(r).text),
          ),
      h(
        'div',
        { class: 'outcomes stagger' },
        h(
          'div',
          { class: 'outcome good' },
          icon('phone'),
          h('span', null, h('b', null, 'Pay'), ' and the phone rings: pick a perk.'),
        ),
        h(
          'div',
          { class: 'outcome bad' },
          icon('warn'),
          h('span', null, h('b', null, 'Fail'), ' and the floor opens. The run ends.'),
        ),
      ),
    ],
    foot: [
      btn('Deposit', {
        variant: couldPay && !canPay ? 'primary' : 'secondary',
        icon: 'bank',
        sub: r.pocket > 0 ? `${fmtInt(r.pocket)} in Pocket` : undefined,
        disabled: r.pocket < 1,
        why: 'Your Pocket is empty.',
        k: 'deposit',
        onclick: on.deposit,
      }),
      canPay
        ? btn('Pay the debt', {
            variant: 'primary',
            icon: 'check',
            key: keyFor('confirm'),
            cue: 'reward',
            k: 'pay',
            onclick: on.pay,
          })
        : btn('Face it', {
            variant: couldPay ? 'danger' : 'primary',
            class: couldPay ? '' : 'danger-primary',
            sub: 'The floor opens',
            k: 'pay',
            onclick: on.pay,
          }),
    ],
  });
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
  const drains = Object.entries(r.stats.drains);
  const t = (label: string, value: Contents, tone: 'plain' | 'gold' | 'red' | 'green' = 'plain') =>
    stat({ label, value, tone });
  return panel({
    screen: 'runend',
    tone: fell ? 'red' : 'default',
    size: 'lg',
    class: 'rapsheet',
    eyebrow: 'Rap sheet',
    title: fell ? 'You fell' : (ENDING_TEXT[r.result ?? '']?.split('.')[0] ?? 'Free'),
    titleIcon: fell ? 'warn' : 'trophy',
    lede: fell
      ? `Fell at deadline ${r.deadline + 1}${r.endless ? ' (Endless)' : ` of ${r.deadlines}`}, still owing ${fmtInt(r.debt)}.`
      : ENDING_TEXT[r.result ?? ''],
    body: [
      h(
        'p',
        { class: 'dim run-id' },
        `${inmateDef(r.inmate).name}${r.hardTime ? `, Hard Time ${r.hardTime}` : ''} · seed ${r.seed}${r.assist ? ' · assist' : ''}`,
      ),
      r.kind === 'daily' && d.dailyLine
        ? h(
            'p',
            { class: `callout ${d.dailyBest ? 'good' : 'plain'}` },
            icon('trophy'),
            d.dailyLine,
          )
        : null,
      d.fresh.length
        ? h(
            'div',
            { class: 'unlocks' },
            h('b', null, icon('trophy'), 'Unlocked'),
            d.fresh.map((u) => h('p', { class: 'stagger' }, d.unlockText(u))),
          )
        : null,
      h(
        'div',
        { class: 'stats four' },
        t('Balls played', String(r.stats.balls)),
        t('Coins earned', fmtInt(r.stats.coinsEarned), 'gold'),
        t('Best ball', `${fmtInt(r.stats.biggestBall)}`, 'gold'),
        t('Biggest PAYDAY', fmtInt(Math.round(r.stats.biggestPayday)), 'gold'),
        t('Longest combo', String(r.stats.longestCombo)),
        t('Skill shots', String(r.stats.skillShots)),
        t('RIOTs', String(r.stats.riots)),
        t('Jobs done', String(r.stats.jobsDone)),
        t('Sentences survived', String(r.stats.sentencesSurvived)),
        t('Loans', String(r.stats.loans)),
        t('Paid early', String(r.stats.earlyPays)),
        t('Tilts', String(r.stats.tilts), r.stats.tilts ? 'red' : 'plain'),
      ),
      section(
        'How the balls ended',
        h(
          'div',
          { class: 'chips' },
          drains.length
            ? drains.map(([k, v]) => chip(`${cap(k)} ${v}`, 'ghost'))
            : chip('None', 'ghost'),
        ),
      ),
      section(
        'Your build',
        h(
          'div',
          { class: 'chips' },
          r.charms.length
            ? r.charms.map((id) => {
                const c = charmDef(id);
                return chip(c.name, 'plain', { color: RARITY_COLORS[c.rarity], icon: 'star' });
              })
            : chip('No charms', 'ghost'),
        ),
        { aside: `Red calls: ${r.stats.redCalls} (${r.bargains.length} taken)` },
      ),
      h(
        'div',
        { class: 'wall' },
        h('span', { class: 'wall-label' }, 'A new mark is scratched into the wall'),
        tallyMarks(d.tallies),
      ),
    ],
    foot: [
      replay,
      btn('Copy seed link', { icon: 'chevron', k: 'link', onclick: on.copyLink }),
      btn('Again', {
        variant: 'primary',
        key: keyFor('confirm'),
        icon: 'chevron',
        cue: 'select',
        k: 'again',
        onclick: on.again,
      }),
    ],
  });
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
