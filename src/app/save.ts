/**
 * Versioned save data in localStorage: settings, meta progression (tallies, stats, unlocks)
 * and the run in progress. Each schema bump adds a migration so old saves keep working.
 */
import type { RunState } from '../rules/run';
import { defaultSettings, type Settings } from './settings';

export const SAVE_VERSION = 1;
const KEY = 'ball-and-chain/save';

export interface MetaStats {
  runs: number;
  bestDeadline: number;
  biggestPayday: number;
  longestCombo: number;
  balls: number;
  coins: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  /** One tally mark per run ever played. */
  tallies: number;
  stats: MetaStats;
  run: RunState | null;
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: defaultSettings(),
    tallies: 0,
    stats: { runs: 0, bestDeadline: 0, biggestPayday: 0, longestCombo: 0, balls: 0, coins: 0 },
    run: null,
  };
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {};

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
  out.settings = {
    ...base.settings,
    ...(out.settings ?? {}),
    volume: { ...base.settings.volume, ...(out.settings?.volume ?? {}) },
  };
  out.stats = { ...base.stats, ...(out.stats ?? {}) };
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
