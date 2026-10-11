/**
 * Meta progression across runs: lifetime stats, milestones, per-inmate Hard Time, endings
 * and the collection of everything discovered. Plain serialisable data (part of the save);
 * pure functions so it can be tested headless.
 */
import { INMATES } from '../content/inmates';
import { MAX_HARD_TIME } from '../content/hard-time';
import {
  UNLOCKS,
  emptyLifetimeStats,
  type EndingId,
  type LifetimeStats,
  type UnlockDef,
} from '../content/unlocks';
import type { BallOutcome, RunState } from './run';

export interface EndingRecord {
  ending: EndingId;
  inmate: string;
  hardTime: number;
  /** Which run it was (the tally count at the time). */
  run: number;
  seed: string;
}

export interface MetaState {
  stats: LifetimeStats;
  /** Milestones reached. */
  unlocked: string[];
  /** Highest Hard Time level unlocked per inmate (0: only the base game). */
  hardTime: Record<string, number>;
  endings: EndingRecord[];
  discovered: { charms: string[]; contraband: string[]; sentences: string[] };
}

export function newMeta(): MetaState {
  return {
    stats: emptyLifetimeStats(),
    unlocked: [],
    hardTime: {},
    endings: [],
    discovered: { charms: [], contraband: [], sentences: [] },
  };
}

function reached(meta: MetaState, u: UnlockDef): boolean {
  return meta.unlocked.includes(u.id);
}

/** Charms not yet unlocked (never offered in a run). */
export function lockedCharms(meta: MetaState): string[] {
  const out: string[] = [];
  for (const u of UNLOCKS) if (!reached(meta, u)) out.push(...(u.charms ?? []));
  return out;
}

/** Inmates on the lineup; locked ones show their condition instead. */
export function inmateUnlocked(meta: MetaState, id: string): boolean {
  const u = UNLOCKS.find((x) => x.inmate === id);
  return !u || reached(meta, u);
}

export function unlockedInmates(meta: MetaState): string[] {
  return INMATES.filter((i) => inmateUnlocked(meta, i.id)).map((i) => i.id);
}

export function endlessUnlocked(meta: MetaState): boolean {
  return UNLOCKS.some((u) => u.endless && reached(meta, u));
}

export function maxHardTime(meta: MetaState, inmate: string): number {
  return meta.hardTime[inmate] ?? 0;
}

/** Reach any milestones now met; returns the newly reached ones. */
export function checkUnlocks(meta: MetaState): UnlockDef[] {
  const fresh: UnlockDef[] = [];
  const endings = new Set(meta.endings.map((e) => e.ending));
  for (const u of UNLOCKS) {
    if (reached(meta, u)) continue;
    const met = (u.check && u.check(meta.stats)) || (u.ending && endings.has(u.ending));
    if (met) {
      meta.unlocked.push(u.id);
      fresh.push(u);
    }
  }
  return fresh;
}

function addAll(list: string[], ids: Iterable<string>): void {
  for (const id of ids) if (!list.includes(id)) list.push(id);
}

/** Note everything this run has shown the player (owned, stocked, offered, revealed). */
export function discover(meta: MetaState, run: RunState): void {
  const d = meta.discovered;
  const offered = run.call?.kind === 'red' ? run.call.offers : [];
  addAll(d.charms, [
    ...run.charms,
    ...run.shop.charms,
    ...offered.filter((o) => o.startsWith('charm:')).map((o) => o.slice(6)),
  ]);
  addAll(d.contraband, [...run.contraband, ...run.shop.contraband]);
  addAll(d.sentences, run.sentences);
  meta.stats.maxKeys = Math.max(meta.stats.maxKeys, run.keys);
}

/** Fold a finished ball into the lifetime stats. */
export function recordBall(meta: MetaState, o: BallOutcome, gained: number): void {
  const s = meta.stats;
  s.balls++;
  s.coins += gained;
  s.riots += o.stats.riots;
  s.tunnels += o.stats.tunnels;
  s.biggestPayday = Math.max(s.biggestPayday, Math.round(o.stats.biggestPayday));
  s.longestCombo = Math.max(s.longestCombo, o.stats.maxCombo);
}

/** A run starts: one more tally mark. */
export function recordRunStart(meta: MetaState): void {
  meta.stats.runs++;
}

/** Deadlines paid so far in a run (for best-deadline stats). */
export function recordDeadline(meta: MetaState, run: RunState): void {
  meta.stats.bestDeadline = Math.max(meta.stats.bestDeadline, run.deadline);
}

/** The run is over: endings, Hard Time progress and milestones. Returns new unlocks. */
export function recordRunEnd(meta: MetaState, run: RunState, tally: number): UnlockDef[] {
  recordDeadline(meta, run);
  discover(meta, run);
  meta.stats.jailbreaks += run.stats.jailbreaks;
  const r = run.result;
  if (r && r !== 'fell') {
    meta.stats.wins++;
    meta.endings.push({
      ending: r,
      inmate: run.inmate,
      hardTime: run.hardTime,
      run: tally,
      seed: run.seed,
    });
    // Winning at your highest level opens the next one for this inmate (not in Endless).
    if (!run.endless && run.hardTime >= maxHardTime(meta, run.inmate))
      meta.hardTime[run.inmate] = Math.min(MAX_HARD_TIME, run.hardTime + 1);
  }
  return checkUnlocks(meta);
}

/** The neighbor was answered (helped or refused). */
export function recordKnock(meta: MetaState): void {
  meta.stats.neighborAnswers++;
}
