import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, freshSave, loadSave, migrate, writeSave } from '../../src/app/save';
import { newRun } from '../../src/rules/run';

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('saves', () => {
  it('round-trips through storage', () => {
    const st = store();
    const d = freshSave();
    d.tallies = 7;
    d.meta.unlocked.push('firstDeadline');
    d.run = newRun('SAVE');
    writeSave(d, st);
    const back = loadSave(st);
    expect(back.tallies).toBe(7);
    expect(back.meta.unlocked).toEqual(['firstDeadline']);
    expect(back.run?.seed).toBe('SAVE');
    expect(back.run?.debt).toBe(d.run.debt);
  });

  it('migrates a version 1 save: stats move into meta, the old run is dropped', () => {
    const v1 = {
      version: 1,
      settings: { shake: 0.5, volume: { music: 0.1 } },
      tallies: 12,
      stats: {
        runs: 12,
        bestDeadline: 3,
        biggestPayday: 40,
        longestCombo: 4,
        balls: 90,
        coins: 800,
      },
      run: { version: 2, seed: 'OLD' },
    };
    const d = migrate(v1);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.tallies).toBe(12);
    expect(d.meta.stats.runs).toBe(12);
    expect(d.meta.stats.bestDeadline).toBe(3);
    expect(d.meta.stats.riots).toBe(0);
    expect(d.meta.unlocked).toEqual([]);
    expect(d.run).toBeNull();
    expect(d.settings.shake).toBe(0.5);
    expect(d.settings.volume.music).toBe(0.1);
    expect(d.settings.volume.master).toBe(freshSave().settings.volume.master);
    expect('stats' in d).toBe(false);
  });

  it('unversioned or broken saves start fresh', () => {
    expect(migrate({}).meta.stats.runs).toBe(0);
    const st = store();
    st.setItem('ball-and-chain/save', '{not json');
    expect(loadSave(st).tallies).toBe(0);
  });

  it('fills fields added to the meta record later', () => {
    const d = migrate({
      version: SAVE_VERSION,
      meta: { unlocked: ['tunnel'], stats: { runs: 2 } },
    });
    expect(d.meta.unlocked).toEqual(['tunnel']);
    expect(d.meta.stats.runs).toBe(2);
    expect(d.meta.stats.maxKeys).toBe(0);
    expect(d.meta.discovered.charms).toEqual([]);
    expect(d.meta.hardTime).toEqual({});
  });
});
