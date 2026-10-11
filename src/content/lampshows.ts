/**
 * Lamp shows: data-driven light sequences played over the playfield inserts. Each show is a
 * list of segments; a segment runs one pattern for a time. Patterns are computed from the
 * lamps' table positions, so new inserts join shows automatically.
 */
export type LampPattern =
  /** Everything on/off together. */
  | 'flash'
  /** A band of light rising up the table (or falling with `down`). */
  | 'sweep'
  /** Lamps lit in turn around the table centre. */
  | 'chase'
  /** Random twinkle. */
  | 'sparkle'
  | 'on'
  | 'off';

export interface LampSegment {
  pattern: LampPattern;
  /** Seconds this segment lasts. */
  dur: number;
  /** Cycles per second (flash, sweep, chase). */
  rate?: number;
  down?: boolean;
  /** Chase: lamps per lit group. */
  every?: number;
}

export interface LampShowDef {
  id: string;
  segments: LampSegment[];
  /** Attract mode loops. */
  loop?: boolean;
}

export const LAMP_SHOWS: LampShowDef[] = [
  {
    id: 'attract',
    loop: true,
    segments: [
      { pattern: 'sweep', dur: 2.4, rate: 0.8 },
      { pattern: 'chase', dur: 3, rate: 6, every: 4 },
      { pattern: 'sparkle', dur: 2 },
      { pattern: 'sweep', dur: 1.8, rate: 1.1, down: true },
      { pattern: 'flash', dur: 0.8, rate: 4 },
    ],
  },
  {
    id: 'riot',
    segments: [
      { pattern: 'flash', dur: 0.6, rate: 10 },
      { pattern: 'chase', dur: 1.2, rate: 14, every: 3 },
      { pattern: 'flash', dur: 0.6, rate: 8 },
    ],
  },
  {
    id: 'payday',
    segments: [
      { pattern: 'flash', dur: 0.7, rate: 9 },
      { pattern: 'sweep', dur: 0.9, rate: 2 },
    ],
  },
  { id: 'skill', segments: [{ pattern: 'sweep', dur: 0.8, rate: 1.4 }] },
  {
    id: 'drain',
    segments: [
      { pattern: 'sweep', dur: 0.7, rate: 1.4, down: true },
      { pattern: 'off', dur: 0.4 },
    ],
  },
  {
    id: 'jailbreak',
    segments: [
      { pattern: 'sparkle', dur: 1 },
      { pattern: 'flash', dur: 1, rate: 12 },
      { pattern: 'chase', dur: 1.5, rate: 16, every: 2 },
    ],
  },
];

export function lampShow(id: string): LampShowDef | undefined {
  return LAMP_SHOWS.find((s) => s.id === id);
}
