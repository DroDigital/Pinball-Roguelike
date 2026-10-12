import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SFX, allStems, type SfxDef, type SfxName } from '../../src/present/sfx-manifest';
import { FALLBACKS, NO_FALLBACK } from '../../src/present/sfx-synth';

const dir = fileURLToPath(new URL('../../public/sfx/', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.mp3'));

describe('sample bank', () => {
  it('has a file for every stem the manifest names', () => {
    const have = new Set(files.map((f) => f.replace(/\.mp3$/, '')));
    const missing = allStems().filter((s) => !have.has(s));
    expect(missing).toEqual([]);
  });

  it('ships no file the manifest does not use', () => {
    const used = new Set(allStems());
    const extra = files.map((f) => f.replace(/\.mp3$/, '')).filter((s) => !used.has(s));
    expect(extra).toEqual([]);
  });

  it('credits every shipped file in CREDITS.md', () => {
    const credits = readFileSync(`${root}CREDITS.md`, 'utf8');
    const uncredited = files.filter((f) => !credits.includes(f));
    expect(uncredited).toEqual([]);
  });

  it('lists its files for the service worker', () => {
    const list = JSON.parse(readFileSync(`${dir}files.json`, 'utf8')) as string[];
    expect([...list].sort()).toEqual([...files].sort());
    const sw = readFileSync(`${root}public/sw.js`, 'utf8');
    expect(sw).toContain('sfx/files.json');
  });

  it('stays small', () => {
    const bytes = files.reduce((n, f) => n + statSync(`${dir}${f}`).size, 0);
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('gives every sound a live-synthesis fallback, or lists it as silent on purpose', () => {
    const silent = new Set<string>(NO_FALLBACK);
    const bare = (Object.keys(SFX) as SfxName[]).filter((n) => !FALLBACKS[n] && !silent.has(n));
    expect(bare).toEqual([]);
  });

  it('carries the licence text', () => {
    expect(readFileSync(`${dir}LICENSE.txt`, 'utf8')).toContain('CC0');
  });
});

/**
 * Walk an mp3's frames the way a strict decoder's format sniffer does: the file must open on a
 * frame header and the frame lengths must land exactly on the end of the file. A few very short
 * files once failed ffprobe's probe (it decoded only when told the format), and Safari and
 * Firefox are pickier than Chromium.
 */
function mp3Frames(b: Buffer): { frames: number; endsAt: number } {
  const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let at = 0;
  let frames = 0;
  while (at + 4 <= b.length) {
    const h = b.readUInt32BE(at);
    if (h >>> 21 !== 0x7ff) break;
    const version = (h >>> 19) & 3;
    const layer = (h >>> 17) & 3;
    const brIdx = (h >>> 12) & 15;
    const srIdx = (h >>> 10) & 3;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) break;
    const rate = RATES[version as 0 | 2 | 3][srIdx];
    const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[brIdx];
    const pad = (h >>> 9) & 1;
    const len = Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + pad;
    at += len;
    frames++;
  }
  return { frames, endsAt: at };
}

describe('sample bank encoding', () => {
  it('opens every file on a frame header and chains frames to the end', () => {
    const bad: string[] = [];
    for (const f of files) {
      const b = readFileSync(`${dir}${f}`);
      const { frames, endsAt } = mp3Frames(b);
      if (frames < 3 || endsAt !== b.length)
        bad.push(`${f} (${frames} frames, ends ${endsAt}/${b.length})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('sfx manifest', () => {
  const defs = Object.entries(SFX) as [string, SfxDef][];

  it('keeps levels, sends and voice limits in range', () => {
    for (const [name, d] of defs) {
      expect(d.files.length, name).toBeGreaterThan(0);
      expect(d.gain ?? 1, name).toBeGreaterThan(0);
      // Files are levelled per class (tools/build-sfx.mjs), so a contact can sit above unity.
      expect(d.gain ?? 1, name).toBeLessThanOrEqual(2);
      expect(d.send ?? 0, name).toBeGreaterThanOrEqual(0);
      expect(d.send ?? 0, name).toBeLessThanOrEqual(1);
      expect(d.voices ?? 4, name).toBeGreaterThanOrEqual(1);
      expect(d.prio ?? 5, name).toBeLessThanOrEqual(10);
      expect(d.pitchVar ?? 0, name).toBeLessThanOrEqual(2);
    }
  });

  it('puts the machine on the table bus (so it muffles) and the UI off it', () => {
    expect((SFX.pop as SfxDef).bus ?? 'table').toBe('table');
    expect((SFX.uiSelect as SfxDef).bus).toBe('sfx');
  });
});
