/// <reference lib="dom" />
// The sound modules type against Web Audio; the tools project has no DOM lib of its own.
import { describe, expect, it } from 'vitest';
import type { Core } from '../../src/present/sfx-core';
import { SFX, type SfxName } from '../../src/present/sfx-manifest';
import { CellSounds } from '../../src/present/sfx-cell';
import { RewardSounds } from '../../src/present/sfx-reward';
import { StorySounds } from '../../src/present/sfx-story';

interface Call {
  at: number;
  name: SfxName;
}

/** A Core that records what is scheduled instead of making sound. */
function recorder(): { core: Core; calls: Call[]; ducks: number[] } {
  const calls: Call[] = [];
  const ducks: number[] = [];
  const core = {
    now: 0,
    mix: { now: 0, duck: (depth: number) => ducks.push(depth) },
    play: (name: SfxName) => (calls.push({ at: 0, name }), true),
    at: (delay: number, name: SfxName) => (calls.push({ at: delay, name }), true),
    pan: () => 0,
    stop: () => {},
  } as unknown as Core;
  return { core, calls, ducks };
}

function story() {
  const r = recorder();
  const reward = new RewardSounds(r.core);
  const cell = new CellSounds(r.core);
  return { ...r, story: new StorySounds(r.core, reward, cell) };
}

describe('story sounds', () => {
  it('schedules only manifest sounds, never in the past', () => {
    const s = story();
    s.story.runStart();
    s.story.atmAlarm();
    for (const k of ['paidInFull', 'breakout', 'cellmate'] as const) s.story.ending(k);
    for (const p of ['start', 'shot', 'posts', 'lights', 'glass', 'escaped', 'failed'])
      s.story.jailbreak(p, 3);
    expect(s.calls.length).toBeGreaterThan(40);
    for (const c of s.calls) {
      expect(SFX[c.name], c.name).toBeDefined();
      expect(c.at).toBeGreaterThanOrEqual(0);
    }
  });

  it('fits each ending inside its scripted length', () => {
    // endings.ts: 10.5 s, 9.5 s and 13 s, plus a tail for the reverb to ring out.
    const limits = { paidInFull: 10.5, breakout: 9.5, cellmate: 13 } as const;
    for (const [kind, len] of Object.entries(limits)) {
      const s = story();
      s.story.ending(kind as keyof typeof limits);
      const last = Math.max(...s.calls.map((c) => c.at));
      expect(last, kind).toBeLessThan(len);
    }
  });

  it('ducks the music under the big beats', () => {
    const s = story();
    s.story.ending('breakout');
    s.story.jailbreak('escaped');
    expect(s.ducks.length).toBeGreaterThanOrEqual(2);
    for (const d of s.ducks) expect(d).toBeLessThan(1);
  });
});

describe('hurry-up pulse', () => {
  it('beats faster as the seconds run out and stops at zero', () => {
    const r = recorder();
    const reward = new RewardSounds(r.core);
    const core = r.core as { now: number };
    const beats = (left: number): number => {
      const n0 = r.calls.length;
      core.now = 0;
      reward.hurryTick(0);
      for (let t = 0; t < 3; t += 1 / 60) {
        core.now = t;
        reward.hurryTick(left);
      }
      return r.calls.length - n0;
    };
    const early = beats(14);
    const late = beats(2);
    expect(late).toBeGreaterThan(early);
    expect(beats(0)).toBe(0);
  });
});
