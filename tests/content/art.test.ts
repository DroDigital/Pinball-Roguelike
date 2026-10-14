import { describe, expect, it } from 'vitest';
import {
  ART,
  ART_CRITICAL,
  BACKGLASS_LEVEL_RECT,
  DENSE_SCREENS,
  HEAD_RECT,
  SCREEN_ART,
  type ArtId,
} from '../../src/content/art';
import { CHARMS } from '../../src/content/charms';
import { CONTRABAND } from '../../src/content/contraband';
import { ICON_BODIES } from '../../src/app/icon-paths';

describe('artwork data', () => {
  const ids = Object.keys(ART) as ArtId[];

  it('has positive dimensions for all artwork', () => {
    for (const id of ids) {
      const a = ART[id];
      expect(a.width, `${id} width`).toBeGreaterThan(0);
      expect(a.height, `${id} height`).toBeGreaterThan(0);
      expect(Number.isInteger(a.width)).toBe(true);
      expect(Number.isInteger(a.height)).toBe(true);
    }
  });

  it('keeps content rects inside the canvas', () => {
    for (const id of ids) {
      const c = ART[id].content;
      if (!c) continue;
      const [x, y, w, h] = c;
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(y, id).toBeGreaterThanOrEqual(0);
      expect(w, id).toBeGreaterThan(0);
      expect(h, id).toBeGreaterThan(0);
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
  });

  it('keeps all head rects inside the canvas', () => {
    for (const [screen, rect] of Object.entries(HEAD_RECT)) {
      if (!rect) continue;
      const [x, y, w, h] = rect;
      expect(x, `${screen} head x`).toBeGreaterThanOrEqual(0);
      expect(y, `${screen} head y`).toBeGreaterThanOrEqual(0);
      expect(x + w, `${screen} head x+w`).toBeLessThanOrEqual(1);
      expect(y + h, `${screen} head y+h`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the live level strip inside the backglass', () => {
    const [x, y, w, h] = BACKGLASS_LEVEL_RECT;
    expect(x + w).toBeLessThanOrEqual(1);
    expect(y + h).toBeLessThanOrEqual(1);
  });
});

describe('svg item icons', () => {
  it('has an svg icon for every charm and contraband item', () => {
    for (const charm of CHARMS) {
      expect(ICON_BODIES[charm.id], `icon for charm ${charm.id}`).toBeDefined();
      expect(ICON_BODIES[charm.id].length).toBeGreaterThan(10);
    }
    for (const item of CONTRABAND) {
      expect(ICON_BODIES[item.id], `icon for contraband ${item.id}`).toBeDefined();
      expect(ICON_BODIES[item.id].length).toBeGreaterThan(10);
    }
  });

  it('includes wardensKeyring for the Keys resource', () => {
    expect(ICON_BODIES['wardensKeyring']).toBeDefined();
  });
});
