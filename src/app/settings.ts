/** Player settings, persisted with the save. */
export interface Settings {
  volume: { master: number; sfx: number; music: number; ambience: number };
  /** Screen shake multiplier 0..1. */
  shake: number;
  /** CRT / grain / dither strength 0..1. */
  crt: number;
  /** Internal render height (240 authentic .. 0 native). */
  pixelHeight: number;
  reducedFlashing: boolean;
  /** UI text scale. */
  textSize: number;
  camera: 'play' | 'seated';
  /** Assist mode: slower table, longer ball save; excluded from the daily best. */
  assist: boolean;
  vibration: boolean;
  voice: boolean;
  bindings: Record<string, string[]> | null;
}

export function defaultSettings(): Settings {
  return {
    volume: { master: 0.8, sfx: 0.9, music: 0.6, ambience: 0.7 },
    shake: 1,
    crt: 0.7,
    pixelHeight: 240,
    reducedFlashing: false,
    textSize: 1,
    camera: 'play',
    assist: false,
    vibration: true,
    voice: false,
    bindings: null,
  };
}
