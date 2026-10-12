import { describe, expect, it } from 'vitest';
import {
  MIN_PIXEL_HEIGHT,
  capAfterSettings,
  effectivePixelHeight,
  nextQualityStep,
} from '../../src/present/quality';

describe('resolution watchdog', () => {
  it('steps down one tier at a time and stops at the floor', () => {
    expect(nextQualityStep(540)).toBe(360);
    expect(nextQualityStep(360)).toBe(240);
    expect(nextQualityStep(240)).toBe(MIN_PIXEL_HEIGHT);
    expect(nextQualityStep(MIN_PIXEL_HEIGHT)).toBeNull();
    expect(nextQualityStep(0)).toBe(360);
  });

  it('keeps a watchdog drop when settings are re-applied', () => {
    // Saved 540p, dropped to 360p by the watchdog: any re-apply still renders at 360p.
    const cap = nextQualityStep(540) ?? 0;
    expect(effectivePixelHeight(540, cap)).toBe(360);
    expect(effectivePixelHeight(0, cap)).toBe(360);
  });

  it('lets a lower saved choice win over the cap', () => {
    expect(effectivePixelHeight(240, 360)).toBe(240);
    expect(effectivePixelHeight(540, 0)).toBe(540);
  });

  it('clears the cap only when the player changes the resolution', () => {
    const cap = 360;
    // Other settings (volume, grain) keep the drop.
    expect(capAfterSettings(cap, 540, 540)).toBe(360);
    // An explicit resolution change hands control back to the player.
    expect(capAfterSettings(cap, 540, 240)).toBe(0);
  });
});
