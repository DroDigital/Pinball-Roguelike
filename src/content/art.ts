/**
 * Ball & Chain artwork: the frames, prints and logo that the app paints itself on a 2D canvas
 * (src/present/artwork), their geometry, and which screen sits on which one. Node-safe data;
 * src/present/art.ts paints and caches the images and tests check this file for consistency.
 *
 * Content rects are [x, y, w, h] normalised to the whole canvas, top-left origin. The painters
 * draw their windows, label plates and sockets at exactly these rects, so a change here means a
 * change there.
 */

export type Rect = readonly [x: number, y: number, w: number, h: number];

export interface ArtDef {
  /** Canvas size in pixels: the aspect ratio is the frame's, the size is the sharpness. */
  width: number;
  height: number;
  /** Where live text and controls go, or null for pure artwork. */
  content: Rect | null;
  /** The text colour that reads on this art: dark ink on paper, bone on metal, green on the CRT. */
  ink: string;
}

export const ART = {
  'machine/backglass': {
    width: 1024,
    height: 512,
    content: null,
    ink: '#f2dfb2',
  },
  'branding/title-logo': {
    width: 1500,
    height: 500,
    content: null,
    ink: '#f2dfb2',
  },
  'menus/title-panel': {
    width: 1200,
    height: 900,
    content: [0.115, 0.3, 0.77, 0.46],
    ink: '#f2dfb2',
  },
  'menus/atm-terminal': {
    width: 1200,
    height: 900,
    content: [0.14, 0.145, 0.72, 0.61],
    ink: '#a8f6b5',
  },
  'menus/booking-dossier': {
    width: 1200,
    height: 900,
    content: [0.08, 0.15, 0.84, 0.74],
    ink: '#291c12',
  },
  'menus/deadline-notice': {
    width: 1200,
    height: 900,
    content: [0.08, 0.23, 0.84, 0.64],
    ink: '#291c12',
  },
  'menus/job-ticket': {
    width: 1200,
    height: 720,
    content: [0.08, 0.13, 0.84, 0.74],
    ink: '#291c12',
  },
  'menus/buy-balls-panel': {
    width: 1200,
    height: 900,
    content: [0.08, 0.20, 0.84, 0.58],
    ink: '#291c12',
  },
  'menus/cell-hub-panel': {
    width: 1200,
    height: 900,
    content: [0.095, 0.12, 0.81, 0.76],
    ink: '#f2dfb2',
  },
  'menus/shop-cabinet': {
    width: 1200,
    height: 900,
    content: [0.12, 0.23, 0.76, 0.56],
    ink: '#f2dfb2',
  },
  'menus/phone-panel': {
    width: 1200,
    height: 900,
    content: [0.13, 0.20, 0.74, 0.61],
    ink: '#f2dfb2',
  },
  'menus/red-call-panel': {
    width: 1200,
    height: 900,
    content: [0.13, 0.22, 0.74, 0.59],
    ink: '#f2dfb2',
  },
  'menus/ball-receipt': {
    width: 900,
    height: 1200,
    content: [0.24, 0.16, 0.52, 0.73],
    ink: '#291c12',
  },
  'menus/pause-service-panel': {
    width: 1200,
    height: 900,
    content: [0.15, 0.275, 0.7, 0.49],
    ink: '#f2dfb2',
  },
  'menus/settings-service-panel': {
    width: 1200,
    height: 900,
    content: [0.12, 0.19, 0.76, 0.61],
    ink: '#f2dfb2',
  },
  'menus/rap-sheet': {
    width: 1200,
    height: 900,
    content: [0.13, 0.19, 0.74, 0.6],
    ink: '#291c12',
  },
  'menus/neighbor-letter': {
    width: 1200,
    height: 900,
    content: [0.13, 0.19, 0.74, 0.62],
    ink: '#291c12',
  },
  'menus/ending-panel': {
    width: 1200,
    height: 900,
    content: [0.155, 0.18, 0.69, 0.62],
    ink: '#291c12',
  },
  'machine/playfield-illustration': {
    width: 640,
    height: 1280,
    content: null,
    ink: '#f2dfb2',
  },
  'machine/cabinet-side-art': {
    width: 1536,
    height: 512,
    content: null,
    ink: '#f2dfb2',
  },
  'hud/score-panel': {
    width: 1200,
    height: 800,
    content: [0.11, 0.245, 0.78, 0.49],
    ink: '#f2dfb2',
  },
  'hud/ledger-panel': {
    width: 900,
    height: 1200,
    content: [0.165, 0.245, 0.67, 0.5],
    ink: '#a8f6b5',
  },
  'hud/status-panel': {
    width: 900,
    height: 1200,
    content: [0.125, 0.255, 0.75, 0.56],
    ink: '#f2dfb2',
  },
} as const satisfies Record<string, ArtDef>;

export type ArtId = keyof typeof ART;

/** Which art each screen sits on. */
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
  // The live HUD: score and DMD, the ledger of coins, and the status rack.
  hudScore: 'hud/score-panel',
  hudLedger: 'hud/ledger-panel',
  hudStatus: 'hud/status-panel',
} as const satisfies Record<string, ArtId>;

export type ScreenKey = keyof typeof SCREEN_ART;

/** The strip of the backglass print left quiet for the live shot-level indicators. */
export const BACKGLASS_LEVEL_RECT: Rect = [0.04, 0.873, 0.92, 0.1];

/**
 * Label plates and banners painted on the art, where a screen's heading sits (same units as
 * the content rect). Screens without one keep the heading in the content window.
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
  hudStatus: [0.1, 0.125, 0.8, 0.07],
};

/**
 * A framed screen keeps its art's aspect ratio, so on small viewports its content window
 * shrinks. Below these sizes (CSS px, before text scaling) the screen keeps the plain panel
 * instead: dense screens need room for long lists, the rest only for a few lines.
 */
export const SKIN_FIT = {
  normal: { width: 340, height: 150 },
  dense: { width: 480, height: 300 },
} as const;

/**
 * The cabinet side print is a 3:1 panel on each flank, `height` tall, on the
 * body's face, set `fromFront` back from the player's end (where the cell's
 * cameras can see it), with `glow` of its own colour added to the lighting. Table-root units.
 */
export const CABINET_ART = { height: 5.4, fromFront: 1.5, glow: 0.4 } as const;

/**
 * Where the playfield illustration prints on the table, in table units (y up), and how
 * strongly. Presentation only: colliders and lamp positions don't move for it. The art is 1:2
 * like the table, so `width` alone fixes its size (half of the table's 20 units).
 */
export const PLAYFIELD_ART = { centerX: 9.2, centerY: 21, width: 10, alpha: 0.62 } as const;

/**
 * The HUD frames go in the side gutters in landscape and across the top in portrait, and
 * only where they stay readable; phones keep the plain text HUD (CSS px).
 */
export const HUD_FIT = {
  landscape: { width: 900, height: 521 },
  portraitMinWidth: 600,
} as const;

/** The three live HUD frames (they switch on and off together). */
export const HUD_SCREENS: ReadonlySet<ScreenKey> = new Set<ScreenKey>([
  'hudScore',
  'hudLedger',
  'hudStatus',
  'replayHud',
]);

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

/** Art the title screen and the machine need at once; everything else is painted while idle. */
export const ART_CRITICAL: readonly ArtId[] = [
  'menus/title-panel',
  'branding/title-logo',
  'machine/backglass',
  'machine/playfield-illustration',
  'machine/cabinet-side-art',
];
