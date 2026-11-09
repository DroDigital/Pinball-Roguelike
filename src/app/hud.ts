/**
 * The play HUD: instruments hung on chains either side of the machine. Left: the DMD marquee
 * and the ledger (rolling coin reels, the debt gauge, round lamps). Right: balls, the combo
 * clock, Bonus lamps, status jewels, the Job ticket and the relic rail. Over the table: stamped
 * banners for the big moments and coins that fly from a hit into the ledger.
 *
 * Built once; every frame only the values that changed touch the DOM.
 */
import { h } from './ui';
import { itemIconHtml } from './icons';
import { charmDef } from '../content/charms';
import { jobDef, jobText } from '../content/jobs';
import { BRAWL, JAILBREAK, SWEEP } from '../content/balance';
import { formatCoins } from '../present/pops';
import { ballsLeft, jailbreakLit, roundsIn, type RunState } from '../rules/run';
import type { TableGame } from '../rules/table-game';

export type BannerKind = 'gold' | 'red' | 'green' | 'violet' | 'bone';

interface Reel {
  root: HTMLElement;
  cols: HTMLElement[];
  value: number;
}

const LAMPS = [
  'save',
  'kick',
  'lock',
  'riot',
  'hurry',
  'sweep',
  'brawl',
  'shift',
  'mystery',
  'luck',
  'again',
] as const;
type LampId = (typeof LAMPS)[number];

const LAMP_LABEL: Record<LampId, string> = {
  save: 'SAVE',
  kick: 'KICK',
  lock: 'LOCK',
  riot: 'RIOT',
  hurry: 'HURRY',
  sweep: 'SWEEP',
  brawl: 'BRAWL',
  shift: '2X',
  mystery: '???',
  luck: 'LUCK',
  again: 'AGAIN',
};

const MAX_FLYERS = 28;

export interface HudFlags {
  mode: string;
  playing: boolean;
  replay: string | null;
  ending: boolean;
  menu: boolean;
}

export class Hud {
  readonly plunger: HTMLElement;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly ledger: HTMLElement;
  private readonly status: HTMLElement;
  private readonly ballLine: HTMLElement;
  private readonly pocket: Reel;
  private readonly ball: Reel;
  private readonly ballRow: HTMLElement;
  private readonly bank: HTMLElement;
  private readonly debt: HTMLElement;
  private readonly gauge: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly rounds: HTMLElement;
  private readonly deadline: HTMLElement;
  private readonly balls: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly comboX: HTMLElement;
  private readonly comboBar: HTMLElement;
  private readonly bonus: HTMLElement;
  private readonly bonusVal: HTMLElement;
  private readonly lamps = {} as Record<LampId, { el: HTMLElement; sub: HTMLElement }>;
  private readonly job: HTMLElement;
  private readonly extra: HTMLElement;
  private readonly relics: HTMLElement;
  private readonly banners: HTMLElement;
  private readonly flyers: HTMLElement;
  private readonly cache = new Map<string, string>();
  private flying = 0;
  private relicKey = '';
  /** Called as each flying coin lands in the ledger. */
  onCoinLand: (() => void) | null = null;
  reducedMotion = false;

  constructor(
    readonly root: HTMLElement,
    dmd: HTMLCanvasElement,
    touch: HTMLElement,
  ) {
    dmd.className = 'hx-dmd';
    this.ballLine = h('div', { class: 'hx-ball-line' });
    const marquee = h(
      'div',
      { class: 'hx-box hx-marquee' },
      h('div', { class: 'hx-plate' }, "DEBTOR'S PRISON"),
      h('div', { class: 'hx-dmd-well' }, dmd),
      this.ballLine,
    );
    this.pocket = makeReel(5, false);
    this.ball = makeReel(5, true);
    this.ballRow = h(
      'div',
      { class: 'hx-reel-row hx-ball-row' },
      h('span', { class: 'hx-tag' }, 'THIS BALL'),
      this.ball.root,
    );
    this.bank = h('b');
    this.debt = h('b');
    this.gaugeFill = h('i');
    this.gauge = h('div', { class: 'hx-gauge' }, this.gaugeFill, h('em'));
    this.rounds = h('div', { class: 'hx-rounds' });
    this.deadline = h('div', { class: 'hx-deadline' });
    this.ledger = h(
      'div',
      { class: 'hx-box hx-ledger' },
      h(
        'div',
        { class: 'hx-reel-row' },
        h('span', { class: 'hx-tag' }, 'POCKET'),
        this.pocket.root,
      ),
      this.ballRow,
      h(
        'div',
        { class: 'hx-owed' },
        h('span', { class: 'hx-bank' }, 'BANK ', this.bank),
        h('span', { class: 'hx-debt' }, 'DEBT ', this.debt),
      ),
      this.gauge,
      h('div', { class: 'hx-when' }, this.rounds, this.deadline),
    );
    this.left = h('div', { class: 'hx-left' }, marquee, this.ledger);

    this.balls = h('div', { class: 'hx-balls' });
    this.comboX = h('b');
    this.comboBar = h('i');
    this.combo = h(
      'div',
      { class: 'hx-combo' },
      h('span', { class: 'hx-tag' }, 'COMBO'),
      this.comboX,
      h('div', { class: 'hx-combo-bar' }, this.comboBar),
    );
    this.bonusVal = h('b');
    this.bonus = h('div', { class: 'hx-bonus' });
    for (let m = 1; m <= 5; m++) this.bonus.append(h('i', null, `${m}X`));
    const lampRack = h('div', { class: 'hx-lamps' });
    for (const id of LAMPS) {
      const sub = h('small');
      const el = h('div', { class: 'hx-lamp', 'data-lamp': id }, LAMP_LABEL[id], sub);
      lampRack.append(el);
      this.lamps[id] = { el, sub };
    }
    this.job = h('div', { class: 'hx-job' });
    this.extra = h('div', { class: 'hx-extra' });
    this.status = h(
      'div',
      { class: 'hx-box hx-status' },
      h('div', { class: 'hx-plate' }, 'STATUS'),
      this.balls,
      this.combo,
      h(
        'div',
        { class: 'hx-bonus-row' },
        h('span', { class: 'hx-tag' }, 'BONUS'),
        this.bonusVal,
        this.bonus,
      ),
      lampRack,
      this.job,
      this.extra,
    );
    this.relics = h('div', { class: 'hx-relics' });
    this.right = h('div', { class: 'hx-right' }, this.status, this.relics);
    this.banners = h('div', { class: 'hx-banners' });
    this.flyers = h('div', { class: 'hx-flyers' });
    this.plunger = h('div', { class: 'plunger' }, h('i'), h('em', { style: { bottom: '50%' } }));
    root.append(this.left, this.right, this.banners, this.flyers, this.plunger, touch);
  }

  // ------------------------------------------------------------------ helpers

  private text(key: string, el: HTMLElement, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.textContent = v;
  }

  private html(key: string, el: HTMLElement, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.innerHTML = v;
  }

  private cls(key: string, el: HTMLElement, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.className = v;
  }

  private css(key: string, el: HTMLElement, prop: string, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.style.setProperty(prop, v);
  }

  private lamp(id: LampId, state: '' | 'on' | 'blink' | 'fill', sub = '', p = 0): void {
    const l = this.lamps[id];
    this.cls(`lamp:${id}`, l.el, `hx-lamp${state ? ` ${state}` : ''}`);
    this.text(`lampsub:${id}`, l.sub, sub);
    if (state === 'fill') this.css(`lampp:${id}`, l.el, '--p', p.toFixed(2));
  }

  // ------------------------------------------------------------------ per frame

  update(r: RunState | null, g: TableGame | null, f: HudFlags): void {
    const hidden = f.mode === 'title' || f.mode === 'meta' || f.mode === 'lineup';
    this.css('root:display', this.root, 'display', hidden ? 'none' : '');
    if (hidden) return;
    this.cls(
      'root:class',
      this.root,
      `${f.playing && f.mode === 'play' ? 'playing ' : ''}${f.menu ? 'menu ' : ''}${f.ending ? 'ending ' : ''}${f.replay !== null ? 'replaying' : ''}`.trim(),
    );
    if (!r) return;
    const live = g && f.playing ? g : null;

    // Ledger.
    setReel(this.pocket, r.pocket);
    this.css('ballrow', this.ballRow, 'display', live ? '' : 'none');
    if (live) setReel(this.ball, live.earned);
    const paid = r.phase === 'phone';
    this.text('bank', this.bank, `${r.bank}`);
    this.text('debt', this.debt, paid ? 'PAID' : `${r.debt}`);
    const cover = paid ? 1 : Math.min(1, (r.bank + r.pocket) / Math.max(1, r.debt));
    this.css('gauge', this.gaugeFill, 'width', `${Math.round(cover * 100)}%`);
    const lastRound = r.round + 1 >= roundsIn(r);
    this.cls(
      'gaugec',
      this.gauge,
      `hx-gauge${cover >= 1 ? ' full' : lastRound || r.phase === 'deadline' ? ' danger' : ''}`,
    );
    let lamps = '';
    for (let i = 0; i < roundsIn(r); i++)
      lamps += `<i class="${i < r.round ? 'done' : i === r.round ? 'now' : ''}"></i>`;
    this.html('rounds', this.rounds, lamps);
    this.text(
      'deadline',
      this.deadline,
      `DEADLINE ${r.deadline + 1}${r.endless ? '' : `/${r.deadlines}`}`,
    );
    this.text(
      'ballline',
      this.ballLine,
      f.replay !== null
        ? `INSTANT REPLAY · ${f.replay}`
        : live
          ? `ROUND ${r.round + 1}/${roundsIn(r)} · BALL ${Math.min(r.ballsThisRound, r.ballsPlayed + 1)}/${r.ballsThisRound}`
          : `ROUND ${r.round + 1}/${roundsIn(r)}`,
    );

    // Balls: one steel pip per ball left this round (the one in play glows).
    const left = ballsLeft(r);
    let pips = live ? '<i class="live"></i>' : '';
    for (let i = 0; i < Math.min(6, left); i++) pips += '<i></i>';
    if (live && live.extraBalls > 0) pips += '<i class="extra"></i>';
    this.html('balls', this.balls, pips || '<span>NO BALLS</span>');

    // Combo clock.
    const t = live ? live.time : 0;
    const chain = live && live.combo.count >= 1 && live.combo.active(t) ? live.combo : null;
    this.cls(
      'combo',
      this.combo,
      `hx-combo${chain ? (chain.count >= 4 ? ' hot on' : chain.count >= 2 ? ' on' : ' armed') : ''}`,
    );
    this.text('combox', this.comboX, chain ? `X${chain.count >= 2 ? chain.mult : 1}` : 'X1');
    this.css(
      'combobar',
      this.comboBar,
      'width',
      chain ? `${Math.round(Math.min(1, chain.left(t) / chain.window) * 100)}%` : '0%',
    );

    // Bonus lamps.
    const bm = live ? live.bonusMult : 1;
    this.text('bonusval', this.bonusVal, live ? formatCoins(live.bonus) : '0');
    this.css('bonusm', this.bonus, '--m', String(Math.min(5, bm)));
    this.cls('bonusc', this.bonus, `hx-bonus m${Math.min(5, bm)}${bm > 5 ? ' over' : ''}`);

    // Status jewels.
    if (live) {
      const save = Math.max(live.ballSaveLeft, live.riotSaveLeft);
      this.lamp(
        'save',
        save > 0 ? (save < 2 ? 'blink' : 'on') : '',
        save > 0 ? `${Math.ceil(save)}s` : '',
      );
      this.lamp('kick', live.machine.kickback ? 'on' : '');
      this.lamp(
        'lock',
        live.machine.lockLit ? 'blink' : live.machine.locks > 0 ? 'on' : '',
        `${live.machine.locks}/${live.ctx.locksNeeded}`,
      );
      this.lamp(
        'riot',
        live.riot ? 'blink' : '',
        live.riot ? `${live.superLit ? 'SUPER ' : ''}${formatCoins(live.payday)}` : '',
      );
      this.lamp(
        'hurry',
        live.hurryLeft > 0 ? 'blink' : '',
        live.hurryLeft > 0 ? `${Math.ceil(live.hurryLeft)}s` : '',
      );
      if (live.sweepLeft > 0) this.lamp('sweep', 'blink', `${Math.ceil(live.sweepLeft)}s`);
      else this.lamp('sweep', live.sweepMeter > 0 ? 'fill' : '', '', live.sweepMeter / SWEEP.spins);
      if (live.brawlLeft > 0) this.lamp('brawl', 'blink', `${Math.ceil(live.brawlLeft)}s`);
      else this.lamp('brawl', live.heat > 0.2 ? 'fill' : '', '', live.heat / BRAWL.heatToStart);
      this.lamp(
        'shift',
        live.shiftLeft > 0 ? 'blink' : '',
        live.shiftLeft > 0 ? `${Math.ceil(live.shiftLeft)}s` : '',
      );
      this.lamp('mystery', live.mysteryLit ? 'blink' : '');
      this.lamp('luck', live.luck > 0 ? 'on' : '', live.luck > 0 ? `${live.luck}` : '');
      this.lamp('again', live.extraBalls > 0 ? 'on' : '');
    } else for (const id of LAMPS) this.lamp(id, '');

    // The round's Job as a punched ticket.
    let job = '';
    if (g?.jailbreak)
      job = `<div class="hx-ticket jb"><span>JAILBREAK</span><b>${g.jbShots}/${JAILBREAK.shotsToEscape}</b><u style="--p:${g.jbShots / JAILBREAK.shotsToEscape}"></u></div>`;
    else if (jailbreakLit(r))
      job = `<div class="hx-ticket jb"><span>JAILBREAK IS LIT</span><b>AT THE HOLE</b></div>`;
    if (r.job) {
      const def = jobDef(r.job.id);
      const prog = live ? live.jobProgress() : r.job.progress;
      const done = r.job.done || (live?.jobDone ?? false);
      const p = Math.min(1, prog / Math.max(1, r.job.target));
      job += `<div class="hx-ticket${done ? ' done' : ''}"><span>${jobText(def, r.job.target)}</span><b>${done ? 'DONE' : `${formatCoins(Math.min(prog, r.job.target))}/${r.job.target}`}</b><u style="--p:${p.toFixed(3)}"></u></div>`;
    }
    this.html('job', this.job, job);
    let extra = '';
    if (r.tickets || r.keys)
      extra += `<span>TICKETS <b>${r.tickets}</b></span>${r.keys ? `<span>KEYS <b>${r.keys}</b></span>` : ''}`;
    if (r.neighbor.tip && !g?.jailbreak) extra += `<small>Tunnel: Cell Block top to bottom</small>`;
    this.html('extra', this.extra, extra);

    // Relic rail: every owned charm in its socket; actives show their key and charges.
    const actives = live ? live.ctx.actives : [];
    const key = `${r.charms.join()}|${actives.map((a) => a.charges).join()}`;
    if (key !== this.relicKey) {
      this.relicKey = key;
      this.relics.innerHTML = r.charms
        .map((id, i) => {
          const c = charmDef(id);
          const a = actives.find((x) => x.id === id);
          const pips = a
            ? `<em>${'●'.repeat(a.charges)}${'○'.repeat(a.max - a.charges)}</em><kbd>${i + 1}</kbd>`
            : '';
          return `<div class="hx-relic r-${c.rarity}${a ? ' active' : ''}" data-id="${id}" title="${c.name}">${itemIconHtml(id)}${pips}</div>`;
        })
        .join('');
    }
  }

  // ------------------------------------------------------------------ moments

  /** Stamp a banner over the table. */
  banner(text: string, sub = '', kind: BannerKind = 'gold', big = false): void {
    while (this.banners.childElementCount >= 2) this.banners.firstElementChild?.remove();
    const el = h(
      'div',
      { class: `hx-banner k-${kind}${big ? ' big' : ''}` },
      h('b', null, text),
      sub ? h('span', null, sub) : null,
    );
    el.addEventListener('animationend', (e) => {
      if (e.target === el) el.remove();
    });
    this.banners.append(el);
  }

  /** A charm fired: its socket on the rail flashes. */
  pulseRelic(id: string): void {
    const el = this.relics.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  /** The ledger jolts (coins landing, a deposit). */
  bump(strong = false): void {
    const el = this.ledger;
    el.classList.remove('bump', 'bump2');
    void el.offsetWidth;
    el.classList.add(strong ? 'bump2' : 'bump');
  }

  /** The whole cluster swings on its chains (a nudge, a jackpot). */
  swing(amount: number): void {
    if (this.reducedMotion) return;
    for (const el of [this.left, this.right]) {
      el.style.setProperty('--swing', `${Math.max(-3, Math.min(3, amount)).toFixed(2)}deg`);
      el.classList.remove('swing');
      void el.offsetWidth;
      el.classList.add('swing');
    }
  }

  /** Coins fly from a point on screen (CSS px) into the ledger's reels. */
  coins(x: number, y: number, n: number): void {
    if (this.reducedMotion || !this.ballRow.isConnected) return;
    const target = (this.ballRow.style.display === 'none' ? this.pocket : this.ball).root;
    const tr = target.getBoundingClientRect();
    if (tr.width === 0) return;
    const tx = tr.left + tr.width * 0.5;
    const ty = tr.top + tr.height * 0.5;
    for (let i = 0; i < n && this.flying < MAX_FLYERS; i++) {
      const c = document.createElement('i');
      this.flyers.append(c);
      this.flying++;
      const sx = x + (Math.random() - 0.5) * 30;
      const sy = y + (Math.random() - 0.5) * 30;
      // Each coin lobs up and out before it is pulled into the ledger.
      const mx = sx + (Math.random() - 0.5) * 140;
      const my = sy - 50 - Math.random() * 90;
      const anim = c.animate(
        [
          { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.55)`, opacity: 1 },
        ],
        {
          duration: 520 + Math.random() * 260 + i * 45,
          easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)',
        },
      );
      anim.onfinish = () => {
        c.remove();
        this.flying--;
        this.bump();
        this.onCoinLand?.();
      };
    }
  }
}

// ---------------------------------------------------------------------------- reels

/** An odometer: one strip of 0-9 per place; `tenths` adds a red decimal reel. */
function makeReel(places: number, tenths: boolean): Reel {
  const cols: HTMLElement[] = [];
  const root = h('div', { class: `hx-reel${tenths ? ' tenths' : ''}` });
  const n = places + (tenths ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const strip = h('span');
    strip.textContent = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9';
    const col = h('div', { class: `hx-digit${tenths && i === n - 1 ? ' red' : ''}` }, strip);
    cols.push(strip);
    root.append(col);
  }
  return { root, cols, value: -1 };
}

function setReel(r: Reel, v: number): void {
  const tenths = r.root.classList.contains('tenths');
  const scaled = Math.max(0, Math.floor(tenths ? v * 10 + 1e-6 : v));
  if (scaled === r.value) return;
  r.value = scaled;
  const max = 10 ** r.cols.length - 1;
  let x = Math.min(max, scaled);
  let leading = true;
  const digits: number[] = [];
  for (let i = 0; i < r.cols.length; i++) {
    digits.unshift(x % 10);
    x = Math.floor(x / 10);
  }
  const keep = tenths ? 2 : 1;
  digits.forEach((d, i) => {
    if (d !== 0 || i >= digits.length - keep) leading = false;
    r.cols[i].style.transform = `translateY(${-d * 10}%)`;
    r.cols[i].parentElement!.classList.toggle('lead', leading);
  });
}
