/**
 * Meta screens built from plain data: the mugshot lineup (inmate, Hard Time, Endless) and
 * the Rap Sheet (lifetime stats, endings, milestones, the collection).
 */
import { h } from './ui';
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
    return h(
      'button',
      {
        class: `mugcard${c.inmate === d.id ? ' sel' : ''}`,
        disabled: !open,
        title: open ? d.name : `Locked: ${why}`,
        onclick: () => on.change({ ...c, inmate: d.id, hardTime: 0 }),
      },
      canvas,
      h('b', null, open ? d.name.replace('The ', '') : '???'),
      h('small', null, open ? `No. ${d.number}` : why),
    );
  });
  const d = inmateDef(c.inmate);
  const maxHt = maxHardTime(meta, c.inmate);
  const ht = Math.min(c.hardTime, maxHt);
  const htRows = HARD_TIME.filter((l) => l.level <= ht).map((l) =>
    h('li', null, `${l.level}. ${l.text}`),
  );
  return h(
    'div',
    { class: 'panel lineup', 'data-skin': 'lineup' },
    h('h2', null, 'Booking'),
    h('div', { class: 'mugs' }, ...cards),
    h(
      'div',
      { class: 'inmate' },
      h('b', null, `${d.name}, No. ${d.number}`),
      h('p', { class: 'dim' }, `Charge: ${d.charge}`),
      h('p', { class: 'up' }, `+ ${d.upside}`),
      h('p', { class: 'down' }, `− ${d.downside}`),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { disabled: ht <= 0, onclick: () => on.change({ ...c, hardTime: ht - 1 }) }, '−'),
      h('span', { class: 'ht' }, `Hard Time ${ht}${maxHt ? ` / ${maxHt}` : ''}`),
      h(
        'button',
        { disabled: ht >= maxHt, onclick: () => on.change({ ...c, hardTime: ht + 1 }) },
        '+',
      ),
      endlessUnlocked(meta)
        ? h(
            'button',
            { onclick: () => on.change({ ...c, endless: !c.endless }) },
            c.endless ? 'Endless: on' : 'Endless: off',
          )
        : null,
    ),
    h(
      'div',
      { class: 'row seed' },
      h('span', null, 'Seed'),
      h('input', {
        type: 'text',
        value: c.seed,
        maxlength: 24,
        placeholder: 'random',
        spellcheck: 'false',
        // Typing doesn't re-render (it would steal focus); the choice is read on start.
        oninput: (e: Event) => {
          c.seed = (e.target as HTMLInputElement).value.trim().toUpperCase();
        },
      }),
    ),
    ht
      ? h('ul', { class: 'htlist' }, ...htRows)
      : h(
          'p',
          { class: 'dim' },
          maxHt ? 'No Hard Time.' : 'Win with this inmate to unlock Hard Time.',
        ),
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => on.back() }, 'Back'),
      h('button', { class: 'primary', onclick: () => on.start() }, 'Wake up'),
    ),
  );
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
        class: `chip${found.has(c.id) ? '' : ' unknown'}`,
        style: found.has(c.id) ? { borderColor: RARITY_COLORS[c.rarity] } : undefined,
        title: found.has(c.id) ? c.text : locked.has(c.id) ? 'Locked' : 'Not found yet',
      },
      found.has(c.id) ? c.name : locked.has(c.id) ? 'locked' : '???',
    ),
  );
  const list = (all: { id: string; name: string }[], seen: string[]) =>
    all.map((x) =>
      h(
        'span',
        { class: `chip${seen.includes(x.id) ? '' : ' unknown'}` },
        seen.includes(x.id) ? x.name : '???',
      ),
    );
  return h(
    'div',
    { class: 'panel rapsheet', 'data-skin': 'meta' },
    h('h1', null, 'Rap sheet'),
    h(
      'div',
      { class: 'grid' },
      'Runs (marks on the wall)',
      h('b', null, String(tallies)),
      'Most deadlines paid',
      h('b', null, String(s.bestDeadline)),
      'Biggest PAYDAY',
      h('b', null, `${s.biggestPayday}c`),
      'Longest combo',
      h('b', null, String(s.longestCombo)),
      'Balls played',
      h('b', null, String(s.balls)),
      'Coins earned',
      h('b', null, String(s.coins)),
      'RIOTs',
      h('b', null, String(s.riots)),
      'Ways out',
      h('b', null, String(s.wins)),
    ),
    h('h3', null, 'Endings'),
    meta.endings.length
      ? h(
          'ul',
          null,
          ...meta.endings.map((e) =>
            h(
              'li',
              null,
              `Run ${e.run}: ${ENDING_NAMES[e.ending]} — ${inmateDef(e.inmate).name}${e.hardTime ? `, Hard Time ${e.hardTime}` : ''} (seed ${e.seed})`,
            ),
          ),
        )
      : h('p', { class: 'dim' }, 'None yet. Nobody gets out on the first try.'),
    h('h3', null, 'Milestones'),
    h(
      'ul',
      { class: 'milestones' },
      ...UNLOCKS.map((u) => {
        const done = meta.unlocked.includes(u.id);
        return h('li', { class: done ? 'done' : '' }, `${done ? '■' : '□'} ${u.text}`);
      }),
    ),
    h('h3', null, `Charms ${found.size}/${CHARMS.length}`),
    h('div', { class: 'chips' }, ...charms),
    h('h3', null, `Contraband ${meta.discovered.contraband.length}/${CONTRABAND.length}`),
    h('div', { class: 'chips' }, ...list(CONTRABAND, meta.discovered.contraband)),
    h('h3', null, `Sentences ${meta.discovered.sentences.length}/${SENTENCES.length}`),
    h('div', { class: 'chips' }, ...list(SENTENCES, meta.discovered.sentences)),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: back }, 'Back')),
  );
}
