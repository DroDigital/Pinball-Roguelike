import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ART,
  ART_CRITICAL,
  ART_DIR,
  ART_FILES,
  ATLAS,
  ATLAS_ICONS,
  BACKGLASS_LEVEL_RECT,
  DENSE_SCREENS,
  SCREEN_ART,
  type ArtId,
} from '../../src/content/art';
import { CHARMS } from '../../src/content/charms';
import { CONTRABAND } from '../../src/content/contraband';

const dir = join(__dirname, '../../public', ART_DIR);

/** Width and height from a PNG's IHDR chunk, plus whether it has an alpha channel. */
function pngInfo(file: string): { width: number; height: number; alpha: boolean } {
  const b = readFileSync(join(dir, file));
  expect(b.subarray(1, 4).toString('ascii'), `${file} is a PNG`).toBe('PNG');
  const colorType = b[25];
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: colorType === 6 };
}

describe('art pack', () => {
  const ids = Object.keys(ART) as ArtId[];

  it('has all 25 files, at the sizes the data says', () => {
    expect(ids).toHaveLength(25);
    for (const id of ids) {
      const a = ART[id];
      expect(existsSync(join(dir, a.file)), a.file).toBe(true);
      const info = pngInfo(a.file);
      expect([info.width, info.height], a.file).toEqual([a.width, a.height]);
      expect(info.alpha, `${a.file} transparency`).toBe(a.transparent);
    }
  });

  it('keeps content rects inside the canvas', () => {
    for (const id of ids) {
      const c = ART[id].content;
      if (!c) continue;
      const [x, y, w, h] = c;
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(y, id).toBeGreaterThanOrEqual(0);
      expect(x + w, id).toBeLessThanOrEqual(1);
      expect(y + h, id).toBeLessThanOrEqual(1);
    }
  });

  it('maps every screen to a real piece of art with a content rect', () => {
    for (const [screen, id] of Object.entries(SCREEN_ART)) {
      expect(ART[id as ArtId], screen).toBeDefined();
      expect(ART[id as ArtId].content, screen).not.toBeNull();
    }
    for (const s of DENSE_SCREENS) expect(SCREEN_ART[s], s).toBeDefined();
    for (const id of ART_CRITICAL) expect(ART[id], id).toBeDefined();
    expect(new Set(ART_FILES).size).toBe(ART_FILES.length);
  });

  it('keeps the live level strip inside the backglass', () => {
    const [x, y, w, h] = BACKGLASS_LEVEL_RECT;
    expect(x + w).toBeLessThanOrEqual(1);
    expect(y + h).toBeLessThanOrEqual(1);
  });
});

describe('icon atlas', () => {
  const info = pngInfo(ART['ui/charm-icon-atlas'].file);

  it('is the grid the data says', () => {
    expect(info.width).toBe(ATLAS.columns * ATLAS.cellWidth);
    expect(info.height).toBe(ATLAS.rows * ATLAS.cellHeight);
  });

  it('names real content ids and keeps each source rect inside its own cell', () => {
    const ids = Object.keys(ATLAS_ICONS);
    expect(ids).toHaveLength(ATLAS.columns * ATLAS.rows);
    const taken = new Set<string>();
    for (const id of ids) {
      const icon = ATLAS_ICONS[id];
      const known =
        icon.kind === 'charm'
          ? CHARMS.some((c) => c.id === id)
          : CONTRABAND.some((c) => c.id === id);
      expect(known, `${id} is a ${icon.kind}`).toBe(true);
      const [x, y, w, h] = icon.source;
      const col = Math.floor(x / ATLAS.cellWidth);
      const row = Math.floor(y / ATLAS.cellHeight);
      expect(Math.floor((x + w - 1) / ATLAS.cellWidth), `${id} column`).toBe(col);
      expect(Math.floor((y + h - 1) / ATLAS.cellHeight), `${id} row`).toBe(row);
      taken.add(`${col},${row}`);
    }
    expect(taken.size, 'one icon per cell').toBe(ids.length);
  });
});
