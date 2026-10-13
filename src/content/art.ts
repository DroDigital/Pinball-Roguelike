/**
 * Ball & Chain art pack: the PNGs under public/assets/ball-and-chain/images, their geometry,
 * and which screen sits on which one. Node-safe data; the app builds URLs and loads the
 * images (src/app/art.ts) and tests check this file against the files on disk.
 *
 * Content rects are [x, y, w, h] normalised to the whole PNG canvas (transparent margins
 * included), top-left origin. Atlas rects are integer source pixels.
 */

/** Where the images live, relative to the site base (Vite's BASE_URL). */
export const ART_DIR = 'assets/ball-and-chain/images';

export type Rect = readonly [x: number, y: number, w: number, h: number];

export interface ArtDef {
  /** Path under ART_DIR. */
  file: string;
  width: number;
  height: number;
  transparent: boolean;
  /** Where live text and controls go, or null for pure artwork. */
  content: Rect | null;
  /** The text colour that reads on this art: dark ink on paper, bone on metal, green on the CRT. */
  ink: string;
}

export const ART = {
  'machine/backglass': {
    file: 'machine/backglass.png',
    width: 1774,
    height: 887,
    transparent: false,
    content: null,
    ink: '#f2dfb2',
  },
  'branding/title-logo': {
    file: 'branding/title-logo.png',
    width: 2172,
    height: 724,
    transparent: true,
    content: null,
    ink: '#f2dfb2',
  },
  'menus/title-panel': {
    file: 'menus/title-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.115, 0.3, 0.77, 0.46],
    ink: '#f2dfb2',
  },
  'menus/atm-terminal': {
    file: 'menus/atm-terminal.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.15, 0.16, 0.7, 0.57],
    ink: '#a8f6b5',
  },
  'menus/booking-dossier': {
    file: 'menus/booking-dossier.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.105, 0.19, 0.79, 0.64],
    ink: '#291c12',
  },
  'menus/deadline-notice': {
    file: 'menus/deadline-notice.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.12, 0.24, 0.76, 0.55],
    ink: '#291c12',
  },
  'menus/job-ticket': {
    file: 'menus/job-ticket.png',
    width: 1619,
    height: 972,
    transparent: true,
    content: [0.12, 0.34, 0.76, 0.32],
    ink: '#291c12',
  },
  'menus/buy-balls-panel': {
    file: 'menus/buy-balls-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.115, 0.265, 0.77, 0.45],
    ink: '#291c12',
  },
  'menus/cell-hub-panel': {
    file: 'menus/cell-hub-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.13, 0.26, 0.74, 0.55],
    ink: '#f2dfb2',
  },
  'menus/shop-cabinet': {
    file: 'menus/shop-cabinet.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.145, 0.27, 0.71, 0.47],
    ink: '#f2dfb2',
  },
  'menus/phone-panel': {
    file: 'menus/phone-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.155, 0.29, 0.69, 0.5],
    ink: '#f2dfb2',
  },
  'menus/red-call-panel': {
    file: 'menus/red-call-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.145, 0.29, 0.71, 0.51],
    ink: '#f2dfb2',
  },
  'menus/ball-receipt': {
    file: 'menus/ball-receipt.png',
    width: 1086,
    height: 1448,
    transparent: true,
    content: [0.26, 0.17, 0.48, 0.71],
    ink: '#291c12',
  },
  'menus/pause-service-panel': {
    file: 'menus/pause-service-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.15, 0.275, 0.7, 0.49],
    ink: '#f2dfb2',
  },
  'menus/settings-service-panel': {
    file: 'menus/settings-service-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.12, 0.19, 0.76, 0.61],
    ink: '#f2dfb2',
  },
  'menus/rap-sheet': {
    file: 'menus/rap-sheet.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.13, 0.19, 0.74, 0.6],
    ink: '#291c12',
  },
  'menus/neighbor-letter': {
    file: 'menus/neighbor-letter.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.13, 0.19, 0.74, 0.62],
    ink: '#291c12',
  },
  'menus/ending-panel': {
    file: 'menus/ending-panel.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: [0.155, 0.18, 0.69, 0.62],
    ink: '#291c12',
  },
  'machine/playfield-illustration': {
    file: 'machine/playfield-illustration.png',
    width: 887,
    height: 1774,
    transparent: true,
    content: null,
    ink: '#f2dfb2',
  },
  'machine/cabinet-side-art': {
    file: 'machine/cabinet-side-art.png',
    width: 2172,
    height: 724,
    transparent: false,
    content: null,
    ink: '#f2dfb2',
  },
  'hud/score-panel': {
    file: 'hud/score-panel.png',
    width: 1536,
    height: 1024,
    transparent: true,
    content: [0.11, 0.245, 0.78, 0.49],
    ink: '#f2dfb2',
  },
  'hud/ledger-panel': {
    file: 'hud/ledger-panel.png',
    width: 1086,
    height: 1448,
    transparent: true,
    content: [0.165, 0.245, 0.67, 0.5],
    ink: '#a8f6b5',
  },
  'hud/status-panel': {
    file: 'hud/status-panel.png',
    width: 1086,
    height: 1448,
    transparent: true,
    content: [0.125, 0.255, 0.75, 0.56],
    ink: '#f2dfb2',
  },
  'ui/button-plate': {
    file: 'ui/button-plate.png',
    width: 2172,
    height: 724,
    transparent: true,
    content: [0.1, 0.25, 0.8, 0.47],
    ink: '#f2dfb2',
  },
  'ui/charm-icon-atlas': {
    file: 'ui/charm-icon-atlas.png',
    width: 1448,
    height: 1086,
    transparent: true,
    content: null,
    ink: '#f2dfb2',
  },
} as const satisfies Record<string, ArtDef>;

export type ArtId = keyof typeof ART;

/** Which art each screen sits on (the pack's own mapping). */
export const SCREEN_ART = {
  title: 'menus/title-panel',
  intro: 'menus/title-panel',
  lineup: 'menus/booking-dossier',
  deadline: 'menus/deadline-notice',
  jobs: 'menus/job-ticket',
  buy: 'menus/buy-balls-panel',
  cell: 'menus/cell-hub-panel',
  atm: 'menus/atm-terminal',
  shop: 'menus/shop-cabinet',
  phone: 'menus/phone-panel',
  redCall: 'menus/red-call-panel',
  tally: 'menus/ball-receipt',
  ballEnd: 'menus/ball-receipt',
  pause: 'menus/pause-service-panel',
  settings: 'menus/settings-service-panel',
  rapsheet: 'menus/rap-sheet',
  meta: 'menus/rap-sheet',
  knock: 'menus/neighbor-letter',
  endingResult: 'menus/ending-panel',
  replayHud: 'hud/status-panel',
} as const satisfies Record<string, ArtId>;

export type ScreenKey = keyof typeof SCREEN_ART;

/** The strip of the backglass print left quiet for the live shot-level indicators. */
export const BACKGLASS_LEVEL_RECT: Rect = [0.04, 0.873, 0.92, 0.1];

export interface AtlasIcon {
  kind: 'charm' | 'contraband';
  /** Tight source rectangle (visible pixels only) in atlas pixels. */
  source: Rect;
}

export const ATLAS = {
  file: 'ui/charm-icon-atlas.png',
  columns: 4,
  rows: 3,
  cellWidth: 362,
  cellHeight: 362,
} as const;

/** The twelve supplied item visuals by content id (charms, plus the Oil Can contraband). */
export const ATLAS_ICONS: Record<string, AtlasIcon> = {
  pocketWatch: { kind: 'charm', source: [32, 58, 323, 304] },
  chippedAbacus: { kind: 'charm', source: [403, 45, 319, 317] },
  candleStub: { kind: 'charm', source: [776, 63, 253, 299] },
  feedingBowl: { kind: 'charm', source: [1089, 113, 339, 231] },
  piggyBank: { kind: 'charm', source: [35, 428, 314, 269] },
  brassKnuckles: { kind: 'charm', source: [387, 362, 337, 323] },
  bentNail: { kind: 'charm', source: [750, 398, 302, 326] },
  patronSaint: { kind: 'charm', source: [1113, 399, 304, 325] },
  crookedPenny: { kind: 'charm', source: [44, 744, 295, 286] },
  rubberBands: { kind: 'charm', source: [384, 753, 340, 262] },
  oilCan: { kind: 'contraband', source: [749, 724, 316, 319] },
  wardensKeyring: { kind: 'charm', source: [1157, 724, 261, 319] },
};

/**
 * Label plates and banners printed on the art, where a screen's heading sits (same units as
 * the content rect). Measured against the PNGs; screens without one keep the heading in the
 * content window.
 */
export const HEAD_RECT: Partial<Record<ScreenKey, Rect>> = {
  title: [0.1, 0.075, 0.8, 0.185],
  deadline: [0.14, 0.145, 0.72, 0.058],
  shop: [0.16, 0.085, 0.68, 0.07],
  phone: [0.31, 0.045, 0.46, 0.09],
  redCall: [0.26, 0.12, 0.48, 0.08],
  pause: [0.31, 0.115, 0.38, 0.075],
  settings: [0.27, 0.065, 0.46, 0.068],
  replayHud: [0.1, 0.125, 0.8, 0.07],
};

/**
 * A framed screen keeps its PNG's aspect ratio, so on small viewports its content window
 * shrinks. Below these sizes (CSS px, before text scaling) the screen keeps the plain panel
 * instead: dense screens need room for long lists, the rest only for a few lines.
 */
export const SKIN_FIT = {
  normal: { width: 340, height: 150 },
  dense: { width: 480, height: 300 },
} as const;

/** Frames whose shape differs from the 4:3 norm need their own floor (the receipt is a tall slip). */
export const SKIN_FIT_FOR: Partial<Record<ScreenKey, { width: number; height: number }>> = {
  tally: { width: 250, height: 250 },
  ballEnd: { width: 250, height: 250 },
};

/** Screens with long lists, many controls or several tap targets in a row. */
export const DENSE_SCREENS: ReadonlySet<ScreenKey> = new Set<ScreenKey>([
  'lineup',
  'deadline',
  'buy',
  'cell',
  'atm',
  'shop',
  'phone',
  'redCall',
  'pause',
  'settings',
  'rapsheet',
  'meta',
  'endingResult',
]);

/** Art the title screen and the machine need at once; everything else loads while idle. */
export const ART_CRITICAL: readonly ArtId[] = [
  'menus/title-panel',
  'branding/title-logo',
  'ui/button-plate',
  'machine/backglass',
  'machine/playfield-illustration',
  'machine/cabinet-side-art',
];

/** Every art file, for cache warming. */
export const ART_FILES: readonly string[] = Object.values(ART).map((a) => a.file);
