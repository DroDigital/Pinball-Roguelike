/**
 * Meta screens built from plain data: the mugshot lineup (inmate, Hard Time, Endless) and
 * the Rap Sheet (lifetime stats, endings, milestones, the collection).
 */
import { h } from './ui';
import { icon } from './icons';
import { btn, chip, keyFor, panel, section, stat } from './widgets';
import { fmtInt } from './counter';
import { paintMugshot } from '../present/mugshot';
import { INMATES, inmateDef } from '../content/inmates';
import { HARD_TIME } from '../content/hard-time';
import { CHARMS, RARITY_COLORS } from '../content/charms';
import { CONTRABAND } from '../content/contraband';
import { SENTENCES } from '../content/sentences';
import { ENDING_NAMES, UNLOCKS } from '../content/unlocks';
import {
  endlessUnlocked,
  inmateUnlocked,
  lockedCharms,
  maxHardTime,
  type MetaState,
} from '../rules/meta';

export interface LineupChoice {
  inmate: string;
  hardTime: number;
  endless: boolean;
  /** Typed or shared seed ('' = random). */
  seed: string;
}

export interface LineupHandlers {
  change(c: LineupChoice): void;
  start(): void;
  back(): void;
}

/** The mugshot lineup: pick who you are this time. */
export function lineupPanel(meta: MetaState, c: LineupChoice, on: LineupHandlers): HTMLElement {
  const cards = INMATES.map((d) => {
    const open = inmateUnlocked(meta, d.id);
    const canvas = h('canvas', { class: 'mug' });
    paintMugshot(canvas, d.id, d.number, !open);
    const why = UNLOCKS.find((u) => u.inmate === d.id)?.text ?? '';
    const sel = c.inmate === d.id;
    return h(
      'button',
      {
        type: 'button',
        class: `mugcard stagger${sel ? ' sel' : ''}${open ? '' : ' locked'}`,
        'data-k': `inmate-${d.id}`,
        'aria-pressed': sel ? 'true' : 'false',
        ...(open ? {} : { 'aria-disabled': 'true', 'data-why': `Locked: ${why}` }),
        title: open ? d.name : `Locked: ${why}`,
        onclick: () => {
          if (open) on.change({ ...c, inmate: d.id, hardTime: 0 });
        },
      },
      h('span', { class: 'mug-frame' }, canvas, open ? null : icon('lock', 'mug-lock')),
      h('b', null, open ? d.name.replace('The ', '') : '???'),
      h('small', null, open ? `No. ${d.number}` : why),
      sel ? h('span', { class: 'mug-tag' }, icon('check'), 'Selected') : null,
    );
  });
  const d = inmateDef(c.inmate);
  const maxHt = maxHardTime(meta, c.inmate);
  const ht = Math.min(c.hardTime, maxHt);
  const htRows = HARD_TIME.filter((l) => l.level <= ht).map((l) =>
    h('li', null, h('b', null, String(l.level)), l.text),
  );
  const endless = endlessUnlocked(meta);
  return panel({
    screen: 'lineup',
    size: 'xl',
    eyebrow: 'Intake',
    title: 'Booking',
    lede: 'Pick who you are this time. Each inmate starts with a different loadout.',
    body: h(
      'div',
      { class: 'two-col lineup-cols' },
      h('div', { class: 'col' }, h('div', { class: 'mugs' }, cards)),
      h(
        'div',
        { class: 'col dossier' },
        h(
          'div',
          { class: 'dossier-head' },
          h('h3', null, d.name),
          chip(`No. ${d.number}`, 'ghost'),
        ),
        h('p', { class: 'charge' }, `Charge: ${d.charge}`),
        h('p', { class: 'perk up' }, icon('plus'), d.upside),
        h('p', { class: 'perk down' }, icon('minus'), d.downside),
        section('Hard Time', [
          h(
            'div',
            { class: 'stepper' },
            btn(icon('minus'), {
              class: 'small square',
              disabled: ht <= 0,
              why: 'Hard Time is already at its lowest.',
              cue: 'slider',
              k: 'ht-',
              onclick: () => on.change({ ...c, hardTime: ht - 1 }),
            }),
            h(
              'span',
              { class: 'stepper-value' },
              ht ? `Level ${ht}` : 'Off',
              maxHt ? h('small', null, ` of ${maxHt}`) : null,
            ),
            btn(icon('plus'), {
              class: 'small square',
              disabled: ht >= maxHt,
              why: maxHt
                ? 'Hard Time is at your highest unlocked level.'
                : 'Win with this inmate to unlock Hard Time.',
              cue: 'slider',
              k: 'ht+',
              onclick: () => on.change({ ...c, hardTime: ht + 1 }),
            }),
          ),
          ht
            ? h('ul', { class: 'htlist' }, htRows)
            : h(
                'p',
                { class: 'dim' },
                maxHt
                  ? 'Harder debts and tougher rules, for a better ending.'
                  : 'Win with this inmate to unlock Hard Time.',
              ),
        ]),
        endless
          ? h(
              'div',
              { class: 'setting-row' },
              h(
                'span',
                { class: 'sr-text' },
                h('b', null, 'Endless'),
                h('small', null, 'Deadlines keep coming after the last one.'),
              ),
              btn(c.endless ? 'On' : 'Off', {
                class: `switch${c.endless ? ' on' : ''}`,
                cue: c.endless ? 'toggleOff' : 'toggleOn',
                k: 'endless',
                onclick: () => on.change({ ...c, endless: !c.endless }),
              }),
            )
          : null,
        h(
          'label',
          { class: 'setting-row seed' },
          h(
            'span',
            { class: 'sr-text' },
            h('b', null, 'Seed'),
            h('small', null, 'Same seed, same inmate: same run. Leave empty for a random one.'),
          ),
          h('input', {
            type: 'text',
            value: c.seed,
            maxlength: 24,
            placeholder: 'random',
            spellcheck: 'false',
            autocomplete: 'off',
            // Typing doesn't re-render (it would steal focus); the choice is read on start.
            oninput: (e: Event) => {
              c.seed = (e.target as HTMLInputElement).value.trim().toUpperCase();
            },
          }),
        ),
      ),
    ),
    foot: [
      btn('Back', { variant: 'ghost', cue: 'back', k: 'back', onclick: () => on.back() }),
      btn('Wake up', {
        variant: 'primary',
        icon: 'chevron',
        key: keyFor('confirm'),
        k: 'start',
        onclick: () => on.start(),
      }),
    ],
  });
}

/** Lifetime Rap Sheet: stats, endings, milestones and everything found so far. */
export function rapSheetPanel(meta: MetaState, tallies: number, back: () => void): HTMLElement {
  const s = meta.stats;
  const locked = new Set(lockedCharms(meta));
  const found = new Set(meta.discovered.charms);
  const charms = CHARMS.map((c) =>
    h(
      'span',
      {
        class: `chip chip-plain${found.has(c.id) ? '' : ' unknown'}`,
        style: found.has(c.id) ? { '--chip': RARITY_COLORS[c.rarity] } : undefined,
        title: found.has(c.id) ? c.text : locked.has(c.id) ? 'Locked' : 'Not found yet',
      },
      found.has(c.id)
        ? icon('star', 'chip-ico')
        : locked.has(c.id)
          ? icon('lock', 'chip-ico')
          : null,
      found.has(c.id) ? c.name : locked.has(c.id) ? 'locked' : '???',
    ),
  );
  const list = (all: { id: string; name: string }[], seen: string[]) =>
    all.map((x) =>
      h(
        'span',
        { class: `chip chip-plain${seen.includes(x.id) ? '' : ' unknown'}` },
        seen.includes(x.id) ? x.name : '???',
      ),
    );
  const done = UNLOCKS.filter((u) => meta.unlocked.includes(u.id)).length;
  return panel({
    screen: 'meta',
    size: 'xl',
    class: 'rapsheet',
    eyebrow: 'Lifetime',
    title: 'Rap sheet',
    titleIcon: 'trophy',
    body: [
      h(
        'div',
        { class: 'stats four' },
        stat({ label: 'Runs on the wall', value: fmtInt(tallies) }),
        stat({ label: 'Most deadlines paid', value: String(s.bestDeadline), tone: 'gold' }),
        stat({ label: 'Biggest PAYDAY', value: fmtInt(s.biggestPayday), tone: 'gold' }),
        stat({ label: 'Longest combo', value: String(s.longestCombo) }),
        stat({ label: 'Balls played', value: fmtInt(s.balls) }),
        stat({ label: 'Coins earned', value: fmtInt(s.coins), tone: 'gold' }),
        stat({ label: 'RIOTs', value: String(s.riots) }),
        stat({ label: 'Ways out', value: String(s.wins), tone: 'green' }),
      ),
      section(
        'Endings',
        meta.endings.length
          ? h(
              'ul',
              { class: 'endings' },
              meta.endings.map((e) =>
                h(
                  'li',
                  null,
                  h('b', null, ENDING_NAMES[e.ending]),
                  ` run ${e.run}, ${inmateDef(e.inmate).name}${e.hardTime ? `, Hard Time ${e.hardTime}` : ''}`,
                  h('small', null, ` seed ${e.seed}`),
                ),
              ),
            )
          : h('p', { class: 'dim' }, 'None yet. Nobody gets out on the first try.'),
      ),
      section(
        'Milestones',
        h(
          'ul',
          { class: 'milestones' },
          UNLOCKS.map((u) => {
            const ok = meta.unlocked.includes(u.id);
            return h(
              'li',
              { class: ok ? 'done' : '' },
              icon(ok ? 'check' : 'lock', 'ms-ico'),
              u.text,
            );
          }),
        ),
        { aside: `${done} / ${UNLOCKS.length}` },
      ),
      section('Charms', h('div', { class: 'chips' }, charms), {
        aside: `${found.size} / ${CHARMS.length}`,
      }),
      section(
        'Contraband',
        h('div', { class: 'chips' }, list(CONTRABAND, meta.discovered.contraband)),
        {
          aside: `${meta.discovered.contraband.length} / ${CONTRABAND.length}`,
        },
      ),
      section(
        'Sentences',
        h('div', { class: 'chips' }, list(SENTENCES, meta.discovered.sentences)),
        {
          aside: `${meta.discovered.sentences.length} / ${SENTENCES.length}`,
        },
      ),
    ],
    foot: btn('Back', {
      variant: 'primary',
      key: keyFor('confirm'),
      cue: 'back',
      k: 'back',
      onclick: back,
    }),
  });
}
