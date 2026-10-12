/**
 * Versioned save data in localStorage: settings, meta progression (tallies, stats, unlocks)
 * and the run in progress. Each schema bump adds a migration so old saves keep working.
 */
import { RUN_VERSION, type RunState } from '../rules/run';
import { newMeta, type MetaState } from '../rules/meta';
import { emptyLifetimeStats } from '../content/unlocks';
import type { DailyRecord } from '../rules/daily';
import { defaultSettings, upgradeGraphics, type Settings } from './settings';

export const SAVE_VERSION = 2;
const KEY = 'ball-and-chain/save';

export interface SaveData {
  version: number;
  settings: Settings;
  /** One tally mark per run ever played. */
  tallies: number;
  meta: MetaState;
  /** The run in progress, autosaved at the start of every round (null: none). */
  run: RunState | null;
  /** Last pick on the mugshot lineup. */
  lastInmate: string;
  lastHardTime: number;
  /** Hint notes already shown. */
  seenHints: string[];
  /** Today's Daily Sentence: best and plays. */
  daily: DailyRecord;
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: defaultSettings(),
    tallies: 0,
    meta: newMeta(),
    run: null,
    lastInmate: 'debtor',
    lastHardTime: 0,
    seenHints: [],
    daily: { date: '', best: null, plays: 0 },
  };
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 kept a flat stats record and no meta progression; its run format can't be resumed.
  1: (d) => {
    const { stats, ...rest } = d;
    const meta = newMeta();
    meta.stats = { ...emptyLifetimeStats(), ...(stats as object | undefined) };
    return { ...rest, meta, run: null };
  },
};

export function migrate(raw: Record<string, unknown>): SaveData {
  let d = raw;
  let v = typeof d.version === 'number' ? d.version : 0;
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    d = m ? m(d) : { ...freshSave(), ...d };
    v++;
    d.version = v;
  }
  const base = freshSave();
  const out = { ...base, ...d } as SaveData;
  const rawSettings = (out.settings ?? {}) as Partial<Settings>;
  out.settings = upgradeGraphics(rawSettings, {
    ...base.settings,
    ...rawSettings,
    volume: { ...base.settings.volume, ...(rawSettings.volume ?? {}) },
  });
  const m = (out.meta ?? {}) as Partial<MetaState>;
  out.meta = {
    ...base.meta,
    ...m,
    stats: { ...base.meta.stats, ...(m.stats ?? {}) },
    discovered: { ...base.meta.discovered, ...(m.discovered ?? {}) },
  };
  // A run saved by another version of the rules can't be resumed safely.
  if (out.run && out.run.version !== RUN_VERSION) out.run = null;
  return out;
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveData {
  try {
    const s = storage?.getItem(KEY);
    if (!s) return freshSave();
    return migrate(JSON.parse(s) as Record<string, unknown>);
  } catch {
    return freshSave();
  }
}

export function writeSave(
  d: SaveData,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: play on without persistence */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
