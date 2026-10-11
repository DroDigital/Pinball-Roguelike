/**
 * The run: deadlines, Sentences, rounds, Jobs, balls, Pocket/Bank/debt, loans, paying early
 * and the phone. Plain serialisable state plus pure-ish functions that mutate it
 * deterministically (all randomness through the run's Rng state).
 */
import { Rng, hashString, type RngState } from '../core/rng';
import {
  ASSIST,
  BALL,
  BONUS,
  CONTRABAND_FX,
  ECONOMY,
  ENDLESS,
  JAILBREAK,
  JOBS,
  LUCK,
  NEIGHBOR,
  PHONE,
  SENTENCE,
} from '../content/balance';
import { CONTRABAND } from '../content/contraband';
import { HARD_TIME, MAX_HARD_TIME } from '../content/hard-time';
import { inmateDef } from '../content/inmates';
import type { NeighborAsk, NeighborOffer } from '../content/neighbor';
import { CHARMS, charmDef } from '../content/charms';
import { foldCharms, type FoldedFx } from './charms';
import { RUN_HOOK } from './charm-hooks';
import { restock } from './shop';
import { JOB_DEFS, emptyBallStats, jobDef, type BallStats, type JobDef } from '../content/jobs';
import { SENTENCES, maxTier, minTier, sentenceDef } from '../content/sentences';
import { BARGAINS, PERKS, PERK_SHOTS, bargainDef, perkDef } from '../content/phone';
import { defaultRunMods, type RunMods } from '../content/mods';
import type { ShotType } from '../sim/table-def';
import type { SimMods } from '../sim/sim-config';
import {
  SHOT_TYPES,
  defaultBallContext,
  newMachineState,
  type BallContext,
  type MachineState,
} from './table-game';
import type { BallSnapshot } from './session';

export type RunPhase =
  | 'pickJob'
  | 'buyBalls'
  | 'ball'
  | 'betweenBalls'
  | 'deadline'
  | 'phone'
  | 'over';
export type RunResult = 'fell' | 'paidInFull' | 'breakout' | 'cellmate' | null;

export interface RunStats {
  balls: number;
  coinsEarned: number;
  biggestBall: number;
  drains: Record<string, number>;
  tilts: number;
  skillShots: number;
  riots: number;
  paydays: number;
  biggestPayday: number;
  longestCombo: number;
  biggestBonus: number;
  jobsDone: number;
  sentencesSurvived: number;
  loans: number;
  earlyPays: number;
  redCalls: number;
  charmsBought: number;
  jailbreaks: number;
  tunnels: number;
}

export interface JobOffer {
  id: string;
  target: number;
}

export interface RunJob extends JobOffer {
  progress: number;
  done: boolean;
}

export interface PerkOffer {
  id: string;
  /** Level perks name a shot type. */
  shot?: ShotType;
}

export type PhoneCall = { kind: 'perks'; offers: PerkOffer[] } | { kind: 'red'; offers: string[] };

export interface ShopState {
  charms: string[];
  contraband: string[];
  rerolls: number;
}

/** A knock on the wall: what the neighbor asks for and what they offer back. */
export interface NeighborKnock {
  ask: NeighborAsk;
  /** Coins or tickets asked. */
  amount: number;
  /** The charm asked for. */
  charm?: string;
  offer: NeighborOffer;
  /** Contraband offered, or tickets offered. */
  item?: string;
  offerAmount?: number;
}

export interface NeighborState {
  asked: number;
  helped: number;
  /** The Tunnel tip has been given. */
  tip: boolean;
  /** Knocked already this deadline. */
  knocked: boolean;
  knock: NeighborKnock | null;
}

export interface RunOptions {
  deadlines?: number;
  inmate?: string;
  hardTime?: number;
  /** Charms still locked by meta progression (never offered). */
  locked?: string[];
  /** Endless: deadlines keep coming (unlocked by Paid in Full). */
  endless?: boolean;
  /** Assist mode: longer ball save (the app also slows the table). */
  assist?: boolean;
  /** How the seed was chosen: random, typed or shared, or today's Daily Sentence. */
  kind?: RunKind;
}

export type RunKind = 'random' | 'seeded' | 'daily';

export const RUN_VERSION = 3;

export interface RunState {
  version: 3;
  seed: string;
  inmate: string;
  hardTime: number;
  endless: boolean;
  assist: boolean;
  kind: RunKind;
  /** Locked charms (meta progression) never appear in the shop or on the phone. */
  locked: string[];
  neighbor: NeighborState;
  rng: RngState;
  deadline: number;
  round: number;
  debt: number;
  bank: number;
  pocket: number;
  /** Fractional coins carried between balls. */
  looseChange: number;
  tickets: number;
  keys: number;
  shotLevels: Record<ShotType, number>;
  mods: RunMods;
  machine: MachineState;
  phase: RunPhase;
  /** This deadline's Sentences (ids) and whether a Bribe cancelled them. */
  sentences: string[];
  sentencesCancelled: boolean;
  /** Borrowed this deadline, and what gets added to the next debt. */
  loanTaken: number;
  loanDue: number;
  /** Jobs posted at round start, and the one taken. */
  jobOffers: JobOffer[];
  job: RunJob | null;
  /** The phone call waiting to be answered (phase 'phone'). */
  call: PhoneCall | null;
  /** Bargains accepted so far. */
  bargains: string[];
  /** Owned charms in slot order, and active charges left. */
  charms: string[];
  charges: Record<string, number>;
  /** Contraband carried (single use). */
  contraband: string[];
  /** The vending cabinet's current stock. */
  shop: ShopState;
  /** Contraband queued for the next ball. */
  pending: { chalk: boolean; rubberCement: boolean; moonshine: boolean; lockpick: boolean };
  /** Forged Receipt: the next deposit is credited extra. */
  forgedReceipt: boolean;
  /** Torn Calendar Page: extra rounds this deadline. */
  extraRounds: number;
  /** Per-round charm state: Wishbone luck, Patron Saint used, balls bought. */
  roundLuck: number;
  patronUsed: boolean;
  boughtThisRound: number;
  /** Balls bought for this round (incl. free and extra balls) and how many have been played. */
  ballsThisRound: number;
  ballsPlayed: number;
  /** PAYDAY value carried between RIOTs (Hoarder's Sack). */
  paydayCarry: number;
  result: RunResult;
  stats: RunStats;
  /** Deadlines in this run (8 normally). */
  deadlines: number;
}

export function debtFor(deadline: number, base = ECONOMY.startDebt): number {
  return Math.round(base * Math.pow(ECONOMY.debtGrowth, deadline));
}

/** How much bigger coin amounts are at this deadline than at the first. */
export function debtScale(deadline: number): number {
  return Math.pow(ECONOMY.debtGrowth, deadline) * JOBS.coinScale;
}

export function newRun(seed: string, opts: RunOptions = {}): RunState {
  const rng = new Rng(hashString(seed));
  const levels = {} as Record<ShotType, number>;
  for (const t of SHOT_TYPES) levels[t] = 1;
  const endless = !!opts.endless;
  const s: RunState = {
    version: RUN_VERSION,
    seed,
    inmate: opts.inmate ?? 'debtor',
    hardTime: Math.max(0, Math.min(MAX_HARD_TIME, opts.hardTime ?? 0)),
    endless,
    assist: !!opts.assist,
    kind: opts.kind ?? 'random',
    locked: [...(opts.locked ?? [])],
    neighbor: { asked: 0, helped: 0, tip: false, knocked: false, knock: null },
    rng: rng.getState(),
    deadline: 0,
    round: 0,
    debt: 0,
    bank: 0,
    pocket: ECONOMY.startCoins,
    looseChange: 0,
    tickets: 0,
    keys: 0,
    shotLevels: levels,
    mods: defaultRunMods(),
    machine: newMachineState(),
    phase: 'pickJob',
    sentences: [],
    sentencesCancelled: false,
    loanTaken: 0,
    loanDue: 0,
    jobOffers: [],
    job: null,
    call: null,
    bargains: [],
    charms: [],
    charges: {},
    contraband: [],
    shop: { charms: [], contraband: [], rerolls: 0 },
    pending: { chalk: false, rubberCement: false, moonshine: false, lockpick: false },
    forgedReceipt: false,
    extraRounds: 0,
    roundLuck: 0,
    patronUsed: false,
    boughtThisRound: 0,
    ballsThisRound: 0,
    ballsPlayed: 0,
    paydayCarry: 0,
    result: null,
    stats: {
      balls: 0,
      coinsEarned: 0,
      biggestBall: 0,
      drains: {},
      tilts: 0,
      skillShots: 0,
      riots: 0,
      paydays: 0,
      biggestPayday: 0,
      longestCombo: 0,
      biggestBonus: 0,
      jobsDone: 0,
      sentencesSurvived: 0,
      loans: 0,
      earlyPays: 0,
      redCalls: 0,
      charmsBought: 0,
      jailbreaks: 0,
      tunnels: 0,
    },
    deadlines: endless ? ENDLESS.deadlines : (opts.deadlines ?? ECONOMY.deadlines),
  };
  applyInmate(s);
  applyHardTime(s);
  startDeadline(s);
  return s;
}

function applyInmate(s: RunState): void {
  const fx = inmateDef(s.inmate).fx;
  const m = s.mods;
  if (fx.charmSlots) m.charmSlots = fx.charmSlots;
  if (fx.flipperStrength) m.flipperStrength *= fx.flipperStrength;
  if (fx.tiltSensitivity) m.tiltSensitivity *= fx.tiltSensitivity;
  if (fx.rerollMult) m.rerollMult *= fx.rerollMult;
  if (fx.debtMult) m.debtMult *= fx.debtMult;
  if (fx.freeBalls) m.freeBalls += fx.freeBalls;
  if (fx.phoneOffersAdd) m.phoneOffers += fx.phoneOffersAdd;
  if (fx.noRedCalls) m.noRedCalls = true;
  if (fx.noNeighbor) m.noNeighbor = true;
  if (fx.keys) s.keys += fx.keys;
  for (const id of fx.charms ?? []) gainCharm(s, id);
  for (const id of fx.contraband ?? []) s.contraband.push(id);
}

/** Hard Time levels stack: level n applies every level up to n. */
function applyHardTime(s: RunState): void {
  const m = s.mods;
  for (const h of HARD_TIME) {
    if (h.level > s.hardTime) break;
    const fx = h.fx;
    if (fx.debtMult) m.debtMult *= fx.debtMult;
    if (fx.sentenceRounds) m.sentenceRounds = fx.sentenceRounds;
    if (fx.ballSaveMult) m.ballSaveMult *= fx.ballSaveMult;
    if (fx.shopCharms) m.shopCharms = fx.shopCharms;
    if (fx.interestAdd) m.interestAdd += fx.interestAdd;
    if (fx.ballPriceMult) m.ballPriceMult *= fx.ballPriceMult;
    if (fx.redChanceAdd) m.redChanceAdd += fx.redChanceAdd;
  }
}

/** Deadline 8: two Sentences, no loans, and JAILBREAK for those holding the Keys. */
export function lastCall(s: RunState): boolean {
  return !s.endless && s.deadline === s.deadlines - 1;
}

/** JAILBREAK is lit at the Hole: Last Call with enough Keys. */
export function jailbreakLit(s: RunState): boolean {
  return lastCall(s) && s.keys >= JAILBREAK.keys;
}

/** Folded static effects of the owned charms. */
export function charmFx(s: RunState): FoldedFx {
  return foldCharms(s.charms);
}

export function owns(s: RunState, id: string): boolean {
  return s.charms.includes(id);
}

/** Rounds in this deadline (3, +1 per Torn Calendar Page). */
export function roundsIn(s: RunState): number {
  return ECONOMY.roundsPerDeadline + s.extraRounds;
}

/** Refill active charm charges (`deadline` refills everything). */
function refill(s: RunState, deadline: boolean): void {
  for (const id of s.charms) {
    const a = charmDef(id).active;
    if (a && (deadline || a.per === 'round')) s.charges[id] = a.charges;
  }
}

/** Gain a charm into the next free slot (shop, red call, inmate). */
export function gainCharm(s: RunState, id: string): boolean {
  if (s.charms.includes(id) || s.charms.length >= s.mods.charmSlots) return false;
  s.charms.push(id);
  const d = charmDef(id);
  if (d.active) s.charges[id] = d.active.charges;
  if (d.fx?.debtMult) s.mods.debtMult *= d.fx.debtMult;
  return true;
}

export function rngOf(s: RunState): Rng {
  const r = new Rng(0);
  r.setState(s.rng);
  return r;
}

// ------------------------------------------------------------------ deadlines and Sentences

/** Set the debt, reveal the Sentences and post round 1's Jobs. */
export function startDeadline(s: RunState): void {
  s.round = 0;
  s.debt = Math.round(debtFor(s.deadline) * s.mods.debtMult) + s.loanDue;
  s.loanDue = 0;
  s.loanTaken = 0;
  s.sentencesCancelled = false;
  const rng = rngOf(s);
  const lo = minTier(s.deadline);
  const hi = maxTier(s.deadline);
  const pool = SENTENCES.filter((d) => d.tier >= lo && d.tier <= hi);
  rng.shuffle(pool);
  const n = lastCall(s) ? SENTENCE.lastCallCount : 1;
  s.sentences = pool.slice(0, n).map((d) => d.id);
  s.rng = rng.getState();
  s.extraRounds = 0;
  s.neighbor.knocked = false;
  s.neighbor.knock = null;
  refill(s, true);
  restock(s);
  resetRoundState(s);
  postJobs(s);
}

function resetRoundState(s: RunState): void {
  s.roundLuck = 0;
  s.patronUsed = false;
  s.boughtThisRound = 0;
}

/** Is a Sentence in force this round? */
export function sentenceActive(s: RunState): boolean {
  return (
    !s.sentencesCancelled &&
    s.sentences.length > 0 &&
    s.round >= roundsIn(s) - s.mods.sentenceRounds
  );
}

/** Active Sentence definitions this round. */
export function activeSentences(s: RunState) {
  return sentenceActive(s) ? s.sentences.map(sentenceDef) : [];
}

// ------------------------------------------------------------------ jobs

export function jobTarget(def: JobDef, deadline: number): number {
  return def.scaled ? Math.max(1, Math.round(def.target * debtScale(deadline))) : def.target;
}

/** The ATM posts this round's Jobs. */
export function postJobs(s: RunState): void {
  const rng = rngOf(s);
  const pool = JOB_DEFS.filter((d) => !d.key && (d.minDeadline ?? 0) <= s.deadline);
  rng.shuffle(pool);
  const picks = pool.slice(0, JOBS.offers);
  if (s.deadline >= JOBS.keyJobMinDeadline && rng.chance(JOBS.keyJobChance)) {
    const keys = JOB_DEFS.filter((d) => d.key);
    picks[picks.length - 1] = rng.pick(keys);
  }
  s.rng = rng.getState();
  s.jobOffers = picks.map((d) => ({ id: d.id, target: jobTarget(d, s.deadline) }));
  s.job = null;
  s.phase = 'pickJob';
}

export function pickJob(s: RunState, index: number): boolean {
  if (s.phase !== 'pickJob') return false;
  const o = s.jobOffers[index];
  if (!o) return false;
  s.job = { ...o, progress: 0, done: false };
  s.phase = 'buyBalls';
  return true;
}

/** Coins a Job's coin reward is worth at this deadline. */
export function jobCoins(def: JobDef, deadline: number): number {
  return def.reward.coins ? Math.round(def.reward.coins * debtScale(deadline)) : 0;
}

function applyJobReward(s: RunState, def: JobDef): void {
  const r = def.reward;
  const k = charmFx(s).jobRewardMult;
  if (r.tickets) s.tickets += r.tickets * k;
  s.pocket += jobCoins(def, s.deadline) * k;
  if (r.level) s.shotLevels[r.level] += k;
  // Keys are never doubled: three of them open JAILBREAK.
  if (r.keys) s.keys += r.keys;
  s.stats.jobsDone++;
}

// ------------------------------------------------------------------ balls

/** The machine's payout multiplier at this deadline (heavier coin mech each deadline). */
export function payScale(s: RunState): number {
  return Math.pow(ECONOMY.payGrowth, s.deadline);
}

export function ballPrice(s: RunState): number {
  let p =
    (ECONOMY.ballPriceBase + ECONOMY.ballPricePerDeadline * s.deadline) * s.mods.ballPriceMult;
  for (const d of activeSentences(s)) p *= d.effect.ballPriceMult ?? 1;
  return Math.round(p);
}

/** Free balls this round. */
export function freeBalls(s: RunState): number {
  return (s.mods.noFreeBall ? 0 : 1) + s.mods.freeBalls + charmFx(s).freeBalls;
}

export function maxBalls(s: RunState): number {
  return ECONOMY.maxBallsPerRound + s.mods.freeBalls + charmFx(s).freeBalls;
}

/** Cost to buy n balls this round (free balls first). */
export function costForBalls(s: RunState, n: number): number {
  return Math.max(0, n - freeBalls(s)) * ballPrice(s);
}

export function maxAffordableBalls(s: RunState): number {
  const p = ballPrice(s);
  return Math.min(maxBalls(s), freeBalls(s) + Math.floor(s.pocket / Math.max(1, p)));
}

/** Buy balls at round start. Returns false if not allowed/affordable. */
export function buyBalls(s: RunState, n: number): boolean {
  if (s.phase !== 'buyBalls' || n < 1 || n > maxBalls(s)) return false;
  const cost = costForBalls(s, n);
  if (cost > s.pocket) return false;
  s.pocket -= cost;
  s.boughtThisRound = Math.max(0, n - freeBalls(s));
  s.ballsThisRound = n;
  s.ballsPlayed = 0;
  s.phase = 'betweenBalls';
  return true;
}

export function ballsLeft(s: RunState): number {
  return s.ballsThisRound - s.ballsPlayed;
}

/** Build the snapshot for the next ball (run mods and active Sentences). Advances the Rng. */
export function nextBall(s: RunState, baseTags: string[] = ['outlanePosts']): BallSnapshot {
  const rng = rngOf(s);
  const seed = rng.nextU32();
  s.rng = rng.getState();
  s.phase = 'ball';
  const m = s.mods;
  const f = charmFx(s);
  const base = defaultBallContext();
  const job = s.job ? jobDef(s.job.id) : null;
  const tags = new Set([...baseTags, ...f.mounts]);
  const sim: Partial<SimMods> = {
    flipperStrength: m.flipperStrength,
    ballMass: 1,
    kickStrength: f.kickStrength,
    nudgeStrength: f.nudgeStrength,
    greasedRail: f.greasedRail,
  };
  const shotMult = { ...base.shotMult };
  for (const [k, v] of Object.entries(m.shotMult) as [ShotType, number][]) shotMult[k] *= v;
  for (const [k, v] of Object.entries(f.shotMult) as [ShotType, number][]) shotMult[k] *= v;
  const ballNumber = s.ballsPlayed + 1;
  const lastBall = ballNumber >= s.ballsThisRound;
  const p = s.pending;
  const ctx: BallContext = {
    ...base,
    shotLevels: { ...s.shotLevels },
    shotMult,
    ballSave: f.noBallSave
      ? 0
      : Math.max(
          0,
          (BALL.ballSave + m.ballSaveAdd + f.ballSaveAdd + (s.assist ? ASSIST.ballSaveAdd : 0)) *
            m.ballSaveMult,
        ),
    tiltSensitivity: m.tiltSensitivity,
    extraWarnings: m.extraWarnings + f.extraWarnings,
    payMult:
      payScale(s) *
      m.payMult *
      f.payMult *
      (owns(s, 'solitary') && s.boughtThisRound === 0 ? RUN_HOOK.solitaryMult : 1),
    luck:
      m.luck +
      f.luck +
      s.roundLuck +
      (owns(s, 'candleStub') && lastBall ? RUN_HOOK.candleLuck : 0) +
      (p.moonshine ? CONTRABAND_FX.moonshineLuck : 0),
    comboStart: f.comboStart || base.comboStart,
    comboStep: f.comboStep || base.comboStep,
    comboWindow: base.comboWindow + f.comboWindowAdd,
    bonusMaxMult: f.noBonusCap ? 999 : BONUS.maxMult + m.bonusMaxAdd + f.bonusMaxAdd,
    bonusShare: base.bonusShare * f.bonusShareMult,
    bonusKeep: f.noBonus ? 0 : 1,
    bonusTimes: owns(s, 'lastRites') && lastBall ? RUN_HOOK.lastRitesTimes : 1,
    holdBonusMult: f.holdBonusMult,
    locksNeeded: f.locksNeeded || base.locksNeeded,
    riotBalls: base.riotBalls + f.riotBallsAdd,
    paydayCarry: owns(s, 'hoarderSack') ? s.paydayCarry : 0,
    sparkMult: f.sparkMult,
    holeHoldAdd: f.holeHoldAdd,
    noKickback: m.noKickback,
    charms: [...s.charms],
    actives: s.charms.flatMap((id, i) => {
      const a = charmDef(id).active;
      return a
        ? [{ slot: i + 1, id, action: a.action, charges: s.charges[id] ?? 0, max: a.charges }]
        : [];
    }),
    chalk: p.chalk,
    moonshine: p.moonshine,
    tunnel: s.neighbor.tip,
    jailbreak: jailbreakLit(s),
    ballNumber,
    ballsInRound: s.ballsThisRound,
    job:
      s.job && job
        ? {
            id: s.job.id,
            stat: job.stat,
            mode: job.mode,
            base: s.job.progress,
            target: s.job.target,
            done: s.job.done,
          }
        : null,
  };
  for (const d of activeSentences(s)) {
    const e = d.effect;
    if (e.sim?.flipperStrength)
      sim.flipperStrength = (sim.flipperStrength ?? 1) * e.sim.flipperStrength;
    if (e.sim?.ballMass) sim.ballMass = (sim.ballMass ?? 1) * e.sim.ballMass;
    for (const t of e.removeTags ?? []) tags.delete(t);
    for (const t of e.addTags ?? []) tags.add(t);
    if (e.yardPays === false) ctx.shotMult.yard = 0;
    if (e.comboWindowMult) ctx.comboWindow *= e.comboWindowMult;
    if (e.tiltSensitivityMult) ctx.tiltSensitivity *= e.tiltSensitivityMult;
    if (e.lockdown) ctx.lockdown = true;
    if (e.bonusKeepMult) ctx.bonusKeep *= e.bonusKeepMult;
    if (e.noBallSave) ctx.ballSave = 0;
    if (e.deadLanes) ctx.deadLanes = true;
    if (e.blackout) ctx.blackout = true;
  }
  const machine = JSON.parse(JSON.stringify(s.machine)) as MachineState;
  if (m.noKickback) machine.kickback = false;
  if (p.rubberCement) tags.add('plugOutlanes');
  if (p.lockpick) machine.locks++;
  s.pending = { chalk: false, rubberCement: false, moonshine: false, lockpick: false };
  return { seed, tags: [...tags], mods: sim, machine, ctx };
}

export interface BallOutcome {
  /** Fractional coins earned on the table (excluding Bonus). */
  earned: number;
  /** Bonus tallied at the drain. */
  bonus: number;
  tilted: boolean;
  drainCause: string;
  machine: MachineState;
  stats: BallStats;
  levelUps: ShotType[];
  extraBalls: number;
  paydayEnd: number;
  /** Active charm charges left after the ball. */
  charges: Record<string, number>;
  /** JAILBREAK this ball: not started, failed, or escaped. */
  jailbreak: 'none' | 'failed' | 'escaped';
}

export interface BallResult {
  /** Whole coins added to the Pocket from the table and Bonus. */
  gained: number;
  /** The Job completed by this ball, if any. */
  jobDone: JobDef | null;
  /** Debt added by Head Count. */
  debtAdded: number;
}

/** Run-level charm hooks for a ball that ended (every ball ends by being lost). */
function ballLost(s: RunState): void {
  if (owns(s, 'wishbone')) s.roundLuck += RUN_HOOK.wishboneLuck;
  if (owns(s, 'patronSaint') && !s.patronUsed) {
    s.patronUsed = true;
    s.ballsThisRound++;
  }
  if (owns(s, 'magpieFeather')) {
    const rng = rngOf(s);
    const luck = s.mods.luck + charmFx(s).luck + s.roundLuck;
    if (rng.chance(Math.min(1, RUN_HOOK.magpieChance + LUCK.perPoint * luck))) s.tickets++;
    s.rng = rng.getState();
  }
}

/** A blank outcome (tools and tests). */
export function emptyOutcome(machine: MachineState = newMachineState()): BallOutcome {
  return {
    earned: 0,
    bonus: 0,
    tilted: false,
    drainCause: 'center',
    machine,
    stats: emptyBallStats(),
    levelUps: [],
    extraBalls: 0,
    paydayEnd: 0,
    charges: {},
    jailbreak: 'none',
  };
}

/** Commit a finished ball. */
export function finishBall(s: RunState, o: BallOutcome): BallResult {
  const total = o.tilted ? 0 : o.earned + o.bonus + s.looseChange;
  const whole = Math.floor(total);
  if (!o.tilted) s.looseChange = total - whole;
  const gained = o.tilted ? 0 : whole;
  s.pocket += gained;
  s.machine = o.machine;
  s.ballsPlayed++;
  s.ballsThisRound += o.extraBalls;
  for (const l of o.levelUps) s.shotLevels[l]++;
  for (const [id, n] of Object.entries(o.charges)) if (id in s.charges) s.charges[id] = n;
  if (owns(s, 'hoarderSack') && o.paydayEnd > 0) s.paydayCarry = o.paydayEnd;
  ballLost(s);
  let debtAdded = 0;
  for (const d of activeSentences(s)) {
    if (d.effect.drainDebt) debtAdded += Math.round(s.debt * d.effect.drainDebt);
  }
  s.debt += debtAdded;
  const st = s.stats;
  st.balls++;
  st.coinsEarned += gained;
  st.biggestBall = Math.max(st.biggestBall, gained);
  st.drains[o.drainCause] = (st.drains[o.drainCause] ?? 0) + 1;
  if (o.tilted) st.tilts++;
  st.skillShots += o.stats.skillShots + o.stats.superSkillShots;
  st.riots += o.stats.riots;
  st.paydays += o.stats.paydays + o.stats.superPaydays;
  st.biggestPayday = Math.max(st.biggestPayday, o.stats.biggestPayday);
  st.longestCombo = Math.max(st.longestCombo, o.stats.maxCombo);
  st.biggestBonus = Math.max(st.biggestBonus, o.bonus);
  st.tunnels += o.stats.tunnels;
  if (o.jailbreak !== 'none') {
    // The Keys open the gate whether or not you make it through.
    s.keys = Math.max(0, s.keys - JAILBREAK.keys);
    st.jailbreaks++;
  }
  let jobDone: JobDef | null = null;
  if (s.job && !s.job.done) {
    const def = jobDef(s.job.id);
    const v = o.stats[def.stat];
    s.job.progress = def.mode === 'sum' ? s.job.progress + v : Math.max(s.job.progress, v);
    if (s.job.progress >= s.job.target) {
      s.job.done = true;
      applyJobReward(s, def);
      jobDone = def;
    }
  }
  s.phase = 'betweenBalls';
  if (o.jailbreak === 'escaped') {
    s.phase = 'over';
    s.result = 'breakout';
  }
  return { gained, jobDone, debtAdded };
}

// ------------------------------------------------------------------ ATM

/** Move coins from Pocket to Bank. Deposits are final. */
export function deposit(s: RunState, amount: number): number {
  const a = Math.max(0, Math.min(Math.floor(amount), s.pocket));
  s.pocket -= a;
  s.bank += a;
  if (a > 0 && s.forgedReceipt) {
    s.forgedReceipt = false;
    s.bank += Math.floor(a * CONTRABAND_FX.forgedReceiptBonus);
  }
  return a;
}

/** Coins still borrowable this deadline (none in the last deadline). */
export function loanAvailable(s: RunState): number {
  if (lastCall(s) || s.phase === 'over') return 0;
  return Math.max(0, Math.floor(s.debt * ECONOMY.loanCap) - s.loanTaken);
}

/** What borrowing `amount` adds to the next deadline's debt. */
export function loanCost(s: RunState, amount: number): number {
  const f = charmFx(s).loanRate;
  const rate = f ? Math.min(f, s.mods.loanRate) : s.mods.loanRate;
  return Math.ceil(amount * rate - 1e-9);
}

/** Borrow into the Pocket; repaid on top of the next debt. */
export function borrow(s: RunState, amount: number): number {
  const a = Math.max(0, Math.min(Math.floor(amount), loanAvailable(s)));
  if (a <= 0) return 0;
  s.pocket += a;
  s.loanTaken += a;
  s.loanDue += loanCost(s, a);
  s.stats.loans++;
  return a;
}

export function interestRate(s: RunState): number {
  return ECONOMY.interest + s.mods.interestAdd + charmFx(s).interestAdd;
}

/** End the round once all balls are played: interest, then next round or the deadline. */
export function endRound(s: RunState): void {
  if (ballsLeft(s) > 0) return;
  if (sentenceActive(s)) {
    s.stats.sentencesSurvived++;
    if (owns(s, 'thickSkin')) {
      s.tickets += RUN_HOOK.thickSkinTickets;
      s.mods.luck += RUN_HOOK.thickSkinLuck;
    }
  }
  s.bank += Math.floor(s.bank * interestRate(s));
  s.pocket += Math.floor(s.pocket * charmFx(s).pocketInterest);
  s.round++;
  s.machine = newMachineState();
  resetRoundState(s);
  refill(s, false);
  if (s.round >= roundsIn(s)) s.phase = 'deadline';
  else {
    postJobs(s);
    maybeKnock(s);
  }
}

/** Paying early is possible at the start of a round once the Bank covers the debt. */
export function canPayEarly(s: RunState): boolean {
  return s.phase === 'pickJob' && s.bank >= s.debt;
}

/** Pay now and skip the rest of the deadline (Sentence round included) for tickets. */
export function payEarly(s: RunState): boolean {
  if (!canPayEarly(s)) return false;
  const skipped = roundsIn(s) - s.round;
  s.tickets += ECONOMY.payEarlyTickets * skipped + charmFx(s).payEarlyTickets;
  if (owns(s, 'wardensKeyring')) s.keys++;
  s.stats.earlyPays++;
  s.phase = 'deadline';
  return settleDeadline(s);
}

/** Settle the deadline. Returns true if paid (the phone rings), false if the floor opens. */
export function settleDeadline(s: RunState): boolean {
  if (s.bank >= s.debt) {
    s.bank -= s.debt;
    s.deadline++;
    s.round = 0;
    s.job = null;
    if (s.deadline >= s.deadlines) {
      s.phase = 'over';
      s.result = cellmate(s) ? 'cellmate' : 'paidInFull';
    } else ring(s);
    return true;
  }
  s.phase = 'over';
  s.result = 'fell';
  return false;
}

// ------------------------------------------------------------------ the phone

/** Helped the neighbor every time they asked (and they asked enough). */
export function cellmate(s: RunState): boolean {
  const n = s.neighbor;
  return n.asked >= NEIGHBOR.cellmateMinAsks && n.helped === n.asked;
}

function ring(s: RunState): void {
  const rng = rngOf(s);
  const odds =
    (s.mods.redAccepted > 0 ? PHONE.redChanceAfterAccept : PHONE.redChance) + s.mods.redChanceAdd;
  // Bargains plus devil charms (as "charm:<id>", only with a free slot).
  const offers = BARGAINS.filter((b) => !s.bargains.includes(b.id)).map((b) => b.id);
  if (s.charms.length < s.mods.charmSlots)
    for (const c of CHARMS)
      if (c.rarity === 'devil' && !s.charms.includes(c.id) && !s.locked.includes(c.id))
        offers.push(`charm:${c.id}`);
  if (!s.mods.noRedCalls && offers.length >= PHONE.bargainOffers && rng.chance(odds)) {
    rng.shuffle(offers);
    s.call = { kind: 'red', offers: offers.slice(0, PHONE.bargainOffers) };
    s.stats.redCalls++;
  } else {
    const pool = [...PERKS];
    rng.shuffle(pool);
    s.call = {
      kind: 'perks',
      offers: pool
        .slice(0, s.mods.phoneOffers)
        .map((p) =>
          p.effect.kind === 'levels' ? { id: p.id, shot: rng.pick(PERK_SHOTS) } : { id: p.id },
        ),
    };
  }
  s.rng = rng.getState();
  s.phase = 'phone';
}

export function choosePerk(s: RunState, index: number): boolean {
  if (s.phase !== 'phone' || s.call?.kind !== 'perks') return false;
  const o = s.call.offers[index];
  if (!o) return false;
  const e = perkDef(o.id).effect;
  const m = s.mods;
  switch (e.kind) {
    case 'charmSlot':
      m.charmSlots++;
      break;
    case 'contrabandSlot':
      m.contrabandSlots++;
      break;
    case 'freeBall':
      m.freeBalls++;
      break;
    case 'levels':
      s.shotLevels[o.shot ?? 'chute'] += e.amount;
      break;
    case 'ballSave':
      m.ballSaveAdd += e.seconds;
      break;
    case 'bonusMax':
      m.bonusMaxAdd++;
      break;
    case 'tickets':
      s.tickets += e.amount;
      break;
    case 'interest':
      m.interestAdd += e.amount;
      break;
    case 'rerolls':
      m.rerollDiscount++;
      break;
  }
  return hangUp(s);
}

export function acceptBargain(s: RunState, index: number): boolean {
  if (s.phase !== 'phone' || s.call?.kind !== 'red') return false;
  const id = s.call.offers[index];
  if (!id) return false;
  if (id.startsWith('charm:')) {
    if (!gainCharm(s, id.slice(6))) return false;
    s.mods.redAccepted++;
    s.bargains.push(id);
    return hangUp(s);
  }
  const e = bargainDef(id).effect;
  const m = s.mods;
  if (e.payMult) m.payMult *= e.payMult;
  if (e.debtMult) m.debtMult *= e.debtMult;
  if (e.tickets) s.tickets += e.tickets;
  if (e.keys) s.keys += e.keys;
  if (e.luck) m.luck += e.luck;
  if (e.ballSaveAdd) m.ballSaveAdd += e.ballSaveAdd;
  if (e.tiltSensitivity) m.tiltSensitivity *= e.tiltSensitivity;
  if (e.extraWarnings) m.extraWarnings += e.extraWarnings;
  if (e.flipperStrength) m.flipperStrength *= e.flipperStrength;
  for (const [k, v] of Object.entries(e.levels ?? {}) as [ShotType, number][]) s.shotLevels[k] += v;
  if (e.noFreeBall) m.noFreeBall = true;
  if (e.noKickback) m.noKickback = true;
  m.redAccepted++;
  s.bargains.push(id);
  return hangUp(s);
}

/** Put the receiver down (declining a red call) and start the next deadline. */
export function hangUp(s: RunState): boolean {
  if (s.phase !== 'phone') return false;
  s.call = null;
  startDeadline(s);
  return true;
}

// ------------------------------------------------------------------ the neighbor

/** Maybe a knock at this round break (at most once per deadline). */
function maybeKnock(s: RunState): void {
  const n = s.neighbor;
  if (s.mods.noNeighbor || n.knocked || s.deadline < NEIGHBOR.fromDeadline) return;
  const rng = rngOf(s);
  if (rng.chance(NEIGHBOR.knockChance)) {
    n.knocked = true;
    n.asked++;
    n.knock = makeKnock(s, rng);
  }
  s.rng = rng.getState();
}

function makeKnock(s: RunState, rng: Rng): NeighborKnock {
  const coins = Math.max(2, Math.round(debtFor(s.deadline) * NEIGHBOR.coinShare));
  const charms = s.charms.filter((id) => !charmDef(id).cursed);
  // Ask for something you have when possible: the choice should be a real one.
  const asks: NeighborAsk[] = [];
  if (s.pocket + s.bank >= coins) asks.push('coins');
  if (s.tickets >= NEIGHBOR.ticketsAsked) asks.push('tickets');
  if (charms.length) asks.push('charm');
  const ask = asks.length ? rng.pick(asks) : 'coins';
  const w = NEIGHBOR.offerWeights;
  const offers: [NeighborOffer, number][] = [
    ['key', w.key],
    ['contraband', w.contraband],
    ['tickets', w.tickets],
  ];
  if (!s.neighbor.tip) offers.push(['tip', w.tip]);
  const offer = rng.weighted(offers, (o) => o[1])[0];
  const k: NeighborKnock = {
    ask,
    amount: ask === 'coins' ? coins : ask === 'tickets' ? NEIGHBOR.ticketsAsked : 1,
    offer,
  };
  if (ask === 'charm') k.charm = rng.pick(charms);
  if (offer === 'contraband') k.item = rng.pick(CONTRABAND.filter((c) => !c.target)).id;
  if (offer === 'tickets') k.offerAmount = NEIGHBOR.ticketsOffered;
  return k;
}

/** Can the player give what the neighbor asks? */
export function canHelp(s: RunState): boolean {
  const k = s.neighbor.knock;
  if (!k) return false;
  if (k.ask === 'coins') return s.pocket + s.bank >= k.amount;
  if (k.ask === 'tickets') return s.tickets >= k.amount;
  return !!k.charm && s.charms.includes(k.charm);
}

/** Answer the knock: help (pay, receive the offer) or refuse. */
export function answerKnock(s: RunState, help: boolean): boolean {
  const n = s.neighbor;
  const k = n.knock;
  if (!k || (help && !canHelp(s))) return false;
  n.knock = null;
  if (!help) return true;
  if (k.ask === 'coins') {
    // From the Pocket first, then the Bank.
    const fromPocket = Math.min(s.pocket, k.amount);
    s.pocket -= fromPocket;
    s.bank -= k.amount - fromPocket;
  } else if (k.ask === 'tickets') s.tickets -= k.amount;
  else if (k.charm) {
    s.charms = s.charms.filter((id) => id !== k.charm);
    delete s.charges[k.charm];
    const d = charmDef(k.charm);
    if (d.fx?.debtMult) s.mods.debtMult /= d.fx.debtMult;
  }
  switch (k.offer) {
    case 'key':
      s.keys++;
      break;
    case 'contraband':
      if (k.item && s.contraband.length < s.mods.contrabandSlots) s.contraband.push(k.item);
      else s.tickets += NEIGHBOR.ticketsOffered;
      break;
    case 'tickets':
      s.tickets += k.offerAmount ?? NEIGHBOR.ticketsOffered;
      break;
    case 'tip':
      n.tip = true;
      break;
  }
  n.helped++;
  return true;
}
