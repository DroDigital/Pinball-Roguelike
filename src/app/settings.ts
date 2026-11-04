/** Player settings, persisted with the save. */
export interface Settings {
  volume: { master: number; sfx: number; music: number; ambience: number };
  /** Screen shake multiplier 0..1. */
  shake: number;
  /** Retro grain / dither strength 0..1 (light by default: the machine stays crisp). */
  crt: number;
  /** Internal render height (540 crisp default, 240 chunky retro, 0 native). */
  pixelHeight: number;
  /** Graphics defaults revision: saves from before the visual overhaul had 240p / 70%. */
  gfx: number;
  reducedFlashing: boolean;
  /** UI text scale. */
  textSize: number;
  camera: 'play' | 'seated';
  /** Assist mode: slower table, longer ball save; excluded from the daily best. */
  assist: boolean;
  vibration: boolean;
  voice: boolean;
  /** First-time hint notes. */
  hints: boolean;
  bindings: Record<string, string[]> | null;
}

const GFX_REV = 2;
const GFX_DEFAULTS = { crt: 0.35, pixelHeight: 540 };

/** Saves that still carry the old 240p / 70% grain defaults move to the crisp defaults. */
export function upgradeGraphics(raw: Partial<Settings>, merged: Settings): Settings {
  if ((raw.gfx ?? 1) >= GFX_REV) return merged;
  const untouched = (raw.pixelHeight ?? 240) === 240 && (raw.crt ?? 0.7) === 0.7;
  return untouched ? { ...merged, ...GFX_DEFAULTS, gfx: GFX_REV } : { ...merged, gfx: GFX_REV };
}

export function defaultSettings(): Settings {
  return {
    volume: { master: 0.8, sfx: 0.9, music: 0.6, ambience: 0.7 },
    shake: 1,
    crt: GFX_DEFAULTS.crt,
    pixelHeight: GFX_DEFAULTS.pixelHeight,
    gfx: GFX_REV,
    reducedFlashing: false,
    textSize: 1,
    camera: 'play',
    assist: false,
    vibration: true,
    voice: false,
    hints: true,
    bindings: null,
  };
}
