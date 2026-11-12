/**
 * The sample bank: sound names -> files in public/sfx/ plus how each plays (level, random
 * variation, reverb send, voice limit, priority). Pure data, so tests can check it against the
 * folder and CREDITS.md. To drop in better foley later, replace the mp3 (keep the stem) or add
 * variant stems here: nothing else needs to change. Files are built by tools/build-sfx.mjs.
 *
 * Buses: 'table' = the machine (muffled when the camera looks away), 'sfx' = UI and cell
 * foreground, 'amb' = background beds and distant sounds, 'music'.
 */
export type SfxBus = 'table' | 'sfx' | 'amb' | 'music';

export interface SfxDef {
  /** File stems under /sfx/ (variants are rotated, never the same twice in a row). */
  files: readonly string[];
  /** Relative level (linear) on top of the file's own class level (tools/build-sfx.mjs). */
  gain?: number;
  /** +- random level, as a fraction. */
  gainVar?: number;
  /** +- random pitch in semitones. */
  pitchVar?: number;
  /** Base playback rate (1 = as recorded). */
  rate?: number;
  bus?: SfxBus;
  /** Reverb send (0..1): the table is dry, the cell is wet. */
  send?: number;
  /** Max simultaneous voices of this sound; the oldest is faded out beyond it. */
  voices?: number;
  /** 0..10. A full pool only steals voices of equal or lower priority. */
  prio?: number;
  /** Ignore re-triggers sooner than this many seconds. */
  minGap?: number;
}

const n = (stem: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${stem}-${i + 1}`);

function bank<const T extends Record<string, SfxDef>>(defs: T): T {
  return defs;
}

export const SFX = bank({
  // ---- flippers and the ball
  flipUp: {
    files: n('flip-up', 3),
    gain: 1.25,
    gainVar: 0.06,
    pitchVar: 0.5,
    send: 0.05,
    voices: 4,
    prio: 8,
  },
  flipDown: {
    files: n('flip-down', 2),
    gain: 0.8,
    gainVar: 0.08,
    pitchVar: 0.5,
    send: 0.04,
    voices: 4,
    prio: 6,
  },
  flipHit: {
    files: n('flip-hit', 3),
    gain: 1.1,
    gainVar: 0.08,
    pitchVar: 0.6,
    send: 0.05,
    voices: 3,
    prio: 5,
    minGap: 0.03,
  },
  rubber: {
    files: n('rubber', 3),
    gain: 1.4,
    gainVar: 0.1,
    pitchVar: 0.8,
    send: 0.04,
    voices: 4,
    prio: 3,
    minGap: 0.03,
  },
  metal: {
    files: n('metal', 4),
    gain: 1.4,
    gainVar: 0.12,
    pitchVar: 0.7,
    send: 0.09,
    voices: 4,
    prio: 3,
    minGap: 0.03,
  },
  plastic: {
    files: n('plastic', 3),
    gain: 1.3,
    gainVar: 0.1,
    pitchVar: 0.8,
    send: 0.05,
    voices: 3,
    prio: 2,
    minGap: 0.04,
  },
  wood: {
    files: n('wood', 3),
    gain: 1.4,
    gainVar: 0.1,
    pitchVar: 0.6,
    send: 0.08,
    voices: 3,
    prio: 4,
    minGap: 0.05,
  },
  ballBall: {
    files: n('ball-ball', 2),
    gain: 1.4,
    gainVar: 0.12,
    pitchVar: 1.2,
    send: 0.1,
    voices: 3,
    prio: 3,
    minGap: 0.04,
  },
  // ---- bumpers, targets, switches
  pop: {
    files: n('pop', 3),
    gain: 0.8,
    gainVar: 0.06,
    pitchVar: 0.7,
    send: 0.09,
    voices: 5,
    prio: 7,
    minGap: 0.025,
  },
  sling: {
    files: n('sling', 3),
    gain: 0.8,
    gainVar: 0.06,
    pitchVar: 0.6,
    send: 0.07,
    voices: 4,
    prio: 7,
    minGap: 0.04,
  },
  drop: {
    files: n('drop', 3),
    gain: 0.9,
    gainVar: 0.06,
    pitchVar: 0.3,
    send: 0.07,
    voices: 4,
    prio: 6,
  },
  dropReset: { files: ['drop-reset'], gain: 0.9, send: 0.08, voices: 1, prio: 6 },
  spin: {
    files: n('spin', 3),
    gain: 1.2,
    gainVar: 0.15,
    pitchVar: 0.8,
    send: 0.05,
    voices: 5,
    prio: 2,
    minGap: 0.018,
  },
  lane: {
    files: n('switch', 2),
    gain: 1.4,
    gainVar: 0.1,
    pitchVar: 0.6,
    send: 0.04,
    voices: 3,
    prio: 2,
    minGap: 0.05,
  },
  // ---- plunger, kickers, holes
  plungerTick: {
    files: n('plunger-tick', 3),
    gain: 0.9,
    gainVar: 0.1,
    pitchVar: 0.3,
    send: 0.02,
    voices: 3,
    prio: 1,
    minGap: 0.03,
  },
  launch: {
    files: n('launch', 2),
    gain: 0.72,
    gainVar: 0.05,
    pitchVar: 0.5,
    send: 0.08,
    voices: 2,
    prio: 7,
  },
  kick: {
    files: n('kick', 3),
    gain: 0.8,
    gainVar: 0.06,
    pitchVar: 0.5,
    send: 0.08,
    voices: 3,
    prio: 7,
  },
  hole: {
    files: n('hole', 2),
    gain: 0.8,
    gainVar: 0.05,
    pitchVar: 0.5,
    send: 0.11,
    voices: 2,
    prio: 7,
  },
  lock: { files: ['lock'], gain: 0.8, send: 0.1, voices: 2, prio: 8 },
  chute: {
    files: n('chute', 2),
    gain: 0.6,
    gainVar: 0.08,
    pitchVar: 0.4,
    send: 0.06,
    voices: 2,
    prio: 4,
  },
  knocker: {
    files: n('knocker', 2),
    gain: 1,
    gainVar: 0.03,
    pitchVar: 0.3,
    send: 0.14,
    voices: 2,
    prio: 10,
  },
  drain: {
    files: n('drain', 2),
    gain: 0.85,
    gainVar: 0.04,
    pitchVar: 0.4,
    send: 0.16,
    voices: 2,
    prio: 9,
  },
  tilt: { files: ['tilt'], gain: 0.7, send: 0.1, voices: 1, prio: 10 },
  warn: { files: ['warn'], gain: 0.6, send: 0.08, voices: 2, prio: 9 },
  // ---- bells, coins, cash (the reward layer)
  bellC: {
    files: ['bell-c'],
    gain: 0.9,
    gainVar: 0.05,
    pitchVar: 0.08,
    bus: 'table',
    send: 0.24,
    voices: 6,
    prio: 6,
  },
  bellE: {
    files: ['bell-e'],
    gain: 0.9,
    gainVar: 0.05,
    pitchVar: 0.08,
    bus: 'table',
    send: 0.24,
    voices: 6,
    prio: 6,
  },
  bellG: {
    files: ['bell-g'],
    gain: 0.9,
    gainVar: 0.05,
    pitchVar: 0.08,
    bus: 'table',
    send: 0.24,
    voices: 6,
    prio: 6,
  },
  toll: {
    files: n('toll', 2),
    gain: 0.8,
    gainVar: 0.03,
    bus: 'sfx',
    send: 0.5,
    voices: 2,
    prio: 9,
  },
  coin: {
    files: n('coin', 5),
    gain: 0.75,
    gainVar: 0.12,
    pitchVar: 0.25,
    send: 0.12,
    voices: 6,
    prio: 4,
    minGap: 0.02,
  },
  coinSpin: {
    files: n('coin-spin', 2),
    gain: 0.6,
    gainVar: 0.1,
    pitchVar: 0.5,
    send: 0.14,
    voices: 2,
    prio: 3,
  },
  coinTray: {
    files: n('coin-tray', 5),
    gain: 0.35,
    gainVar: 0.2,
    pitchVar: 1.5,
    send: 0.12,
    voices: 8,
    prio: 1,
    minGap: 0.025,
  },
  coinShower: {
    files: n('coin-shower', 2),
    gain: 0.6,
    gainVar: 0.05,
    send: 0.16,
    voices: 2,
    prio: 5,
  },
  hurryTick: {
    files: n('atm-key', 4),
    gain: 0.65,
    bus: 'table',
    send: 0.06,
    voices: 2,
    prio: 5,
    minGap: 0.08,
  },
  cash: { files: ['cash'], gain: 0.7, send: 0.15, bus: 'sfx', voices: 2, prio: 6 },
  cashCount: { files: ['cash-count'], gain: 0.6, send: 0.1, bus: 'sfx', voices: 2, prio: 3 },
  // ---- impacts, risers, alarms
  boom: { files: n('boom', 2), gain: 0.9, bus: 'sfx', send: 0.4, voices: 2, prio: 9 },
  riser: { files: n('riser', 2), gain: 0.5, bus: 'sfx', send: 0.3, voices: 2, prio: 5 },
  whoosh: {
    files: n('whoosh', 2),
    gain: 0.4,
    gainVar: 0.1,
    pitchVar: 1,
    bus: 'sfx',
    send: 0.15,
    voices: 3,
    prio: 3,
  },
  alarm: { files: ['alarm'], gain: 0.8, bus: 'sfx', send: 0.3, voices: 3, prio: 8 },
  // ---- the cell
  doorClang: {
    files: n('door-clang', 2),
    gain: 1.1,
    gainVar: 0.04,
    pitchVar: 0.3,
    bus: 'sfx',
    send: 0.55,
    voices: 2,
    prio: 9,
  },
  doorLock: { files: ['door-lock'], gain: 0.9, bus: 'sfx', send: 0.45, voices: 2, prio: 7 },
  creak: {
    files: n('creak', 3),
    gain: 0.6,
    gainVar: 0.1,
    pitchVar: 1,
    bus: 'sfx',
    send: 0.45,
    voices: 2,
    prio: 4,
  },
  chain: {
    files: n('chain', 3),
    gain: 0.6,
    gainVar: 0.1,
    pitchVar: 0.5,
    bus: 'sfx',
    send: 0.4,
    voices: 2,
    prio: 4,
  },
  knock: {
    files: n('knock', 3),
    gain: 1.2,
    gainVar: 0.06,
    pitchVar: 0.6,
    bus: 'sfx',
    send: 0.5,
    voices: 3,
    prio: 8,
  },
  trapdoor: { files: ['trapdoor'], gain: 1, bus: 'sfx', send: 0.45, voices: 1, prio: 10 },
  fall: { files: ['fall'], gain: 0.7, bus: 'sfx', send: 0.3, voices: 1, prio: 9 },
  phoneRing: { files: ['phone-ring'], gain: 1.0, bus: 'sfx', send: 0.35, voices: 2, prio: 8 },
  phonePick: { files: ['phone-pick'], gain: 0.6, bus: 'sfx', send: 0.25, voices: 1, prio: 7 },
  atmKey: { files: n('atm-key', 4), gain: 1.0, bus: 'sfx', send: 0.2, voices: 3, prio: 5 },
  atmOk: { files: ['atm-ok'], gain: 0.9, bus: 'sfx', send: 0.2, voices: 2, prio: 5 },
  atmNo: { files: ['atm-no'], gain: 0.9, bus: 'sfx', send: 0.2, voices: 2, prio: 5 },
  cashOut: { files: ['cash-out'], gain: 0.7, bus: 'sfx', send: 0.25, voices: 1, prio: 6 },
  vendCoin: { files: ['vend-coin'], gain: 0.8, bus: 'sfx', send: 0.25, voices: 1, prio: 5 },
  vendSpiral: { files: ['vend-spiral'], gain: 0.7, bus: 'sfx', send: 0.25, voices: 1, prio: 5 },
  vendDrop: { files: ['vend-drop'], gain: 0.9, bus: 'sfx', send: 0.3, voices: 1, prio: 6 },
  glassCrack: {
    files: n('glass-crack', 2),
    gain: 1.0,
    gainVar: 0.05,
    pitchVar: 0.5,
    bus: 'sfx',
    send: 0.3,
    voices: 3,
    prio: 8,
  },
  rubble: { files: ['rubble'], gain: 0.9, bus: 'sfx', send: 0.4, voices: 1, prio: 9 },
  crumble: { files: ['ss-crumble'], gain: 0.7, bus: 'sfx', send: 0.4, voices: 1, prio: 8 },
  // ---- ambience one-shots and the cell clock
  drip: {
    files: n('drip', 3),
    gain: 0.8,
    gainVar: 0.2,
    pitchVar: 1.5,
    bus: 'amb',
    send: 0.75,
    voices: 3,
    prio: 1,
  },
  pipe: {
    files: n('pipe', 2),
    gain: 0.7,
    gainVar: 0.15,
    pitchVar: 1,
    bus: 'amb',
    send: 0.8,
    voices: 2,
    prio: 1,
  },
  farDoor: {
    files: ['far-door'],
    gain: 0.55,
    gainVar: 0.1,
    bus: 'amb',
    send: 0.85,
    voices: 1,
    prio: 1,
  },
  clock: { files: n('clock', 2), gain: 0.9, bus: 'amb', send: 0.25, voices: 2, prio: 2 },
  // ---- music kit
  mKick: { files: ['m-kick'], gain: 1, bus: 'music', send: 0, voices: 3, prio: 5 },
  mSnare: {
    files: ['m-snare'],
    gain: 0.6,
    gainVar: 0.05,
    bus: 'music',
    send: 0.12,
    voices: 3,
    prio: 5,
  },
  mHat: {
    files: ['m-hat'],
    gain: 0.5,
    gainVar: 0.15,
    bus: 'music',
    send: 0.03,
    voices: 4,
    prio: 3,
  },
  mOhat: { files: ['m-ohat'], gain: 0.45, bus: 'music', send: 0.06, voices: 2, prio: 3 },
  mRim: { files: ['m-rim'], gain: 0.6, gainVar: 0.1, bus: 'music', send: 0.1, voices: 3, prio: 3 },
  mTom: { files: ['m-tom'], gain: 0.7, bus: 'music', send: 0.1, voices: 3, prio: 4 },
  // ---- menus (uisfx mechanical)
  uiMove: {
    files: ['ui-move'],
    gain: 0.7,
    gainVar: 0.06,
    pitchVar: 0.35,
    bus: 'sfx',
    send: 0.06,
    voices: 3,
    prio: 4,
    minGap: 0.03,
  },
  uiHover: {
    files: ['ui-hover'],
    gain: 0.6,
    gainVar: 0.06,
    pitchVar: 0.35,
    bus: 'sfx',
    send: 0.05,
    voices: 2,
    prio: 2,
    minGap: 0.05,
  },
  uiTick: {
    files: ['ui-tick'],
    gain: 0.7,
    gainVar: 0.06,
    pitchVar: 0.5,
    bus: 'sfx',
    send: 0.04,
    voices: 4,
    prio: 3,
    minGap: 0.02,
  },
  uiSlider: {
    files: ['ui-slider'],
    gain: 0.7,
    gainVar: 0.05,
    pitchVar: 0.3,
    bus: 'sfx',
    send: 0.05,
    voices: 3,
    prio: 3,
    minGap: 0.03,
  },
  uiSelect: {
    files: ['ui-select'],
    gain: 0.85,
    gainVar: 0.04,
    pitchVar: 0.2,
    bus: 'sfx',
    send: 0.08,
    voices: 3,
    prio: 6,
  },
  uiBack: {
    files: ['ui-back'],
    gain: 0.85,
    gainVar: 0.04,
    pitchVar: 0.2,
    bus: 'sfx',
    send: 0.08,
    voices: 2,
    prio: 6,
  },
  uiOpen: { files: ['ui-open'], gain: 0.8, bus: 'sfx', send: 0.1, voices: 2, prio: 6 },
  uiClose: { files: ['ui-close'], gain: 0.8, bus: 'sfx', send: 0.1, voices: 2, prio: 6 },
  uiError: { files: ['ui-error'], gain: 0.85, bus: 'sfx', send: 0.1, voices: 2, prio: 7 },
  uiBuy: { files: ['ui-buy'], gain: 0.85, bus: 'sfx', send: 0.12, voices: 2, prio: 7 },
  uiSell: { files: ['ui-sell'], gain: 0.85, bus: 'sfx', send: 0.12, voices: 2, prio: 7 },
  uiDeposit: { files: ['ui-deposit'], gain: 0.85, bus: 'sfx', send: 0.12, voices: 2, prio: 7 },
  uiReward: { files: ['ui-reward'], gain: 0.85, bus: 'sfx', send: 0.15, voices: 2, prio: 7 },
  uiToggleOn: { files: ['ui-toggle-on'], gain: 0.8, bus: 'sfx', send: 0.08, voices: 2, prio: 6 },
  uiToggleOff: { files: ['ui-toggle-off'], gain: 0.8, bus: 'sfx', send: 0.08, voices: 2, prio: 6 },
  uiLock: { files: ['ui-lock'], gain: 0.8, bus: 'sfx', send: 0.1, voices: 2, prio: 6 },
  uiUnlock: { files: ['ui-unlock'], gain: 0.8, bus: 'sfx', send: 0.12, voices: 2, prio: 6 },
  uiSuccess: { files: ['ui-success'], gain: 0.8, bus: 'sfx', send: 0.12, voices: 2, prio: 6 },
  uiWarning: { files: ['ui-warning'], gain: 0.85, bus: 'sfx', send: 0.1, voices: 2, prio: 7 },
  uiNotify: { files: ['ui-notify'], gain: 0.8, bus: 'sfx', send: 0.12, voices: 2, prio: 6 },
  uiPause: { files: ['ui-pause'], gain: 0.8, bus: 'sfx', send: 0.08, voices: 1, prio: 8 },
  uiResume: { files: ['ui-resume'], gain: 0.8, bus: 'sfx', send: 0.08, voices: 1, prio: 8 },
  // ---- stingers (uisfx cinematic) and solid-state accents (Kenney)
  stAchievement: {
    files: ['st-achievement'],
    gain: 0.42,
    bus: 'sfx',
    send: 0.3,
    voices: 2,
    prio: 9,
  },
  stLevelUp: { files: ['st-levelup'], gain: 0.42, bus: 'sfx', send: 0.3, voices: 2, prio: 8 },
  stBonus: { files: ['st-bonus'], gain: 0.42, bus: 'sfx', send: 0.3, voices: 2, prio: 8 },
  stReward: { files: ['st-reward'], gain: 0.42, bus: 'sfx', send: 0.3, voices: 2, prio: 8 },
  stWarning: { files: ['st-warning'], gain: 0.45, bus: 'sfx', send: 0.35, voices: 2, prio: 9 },
  stError: { files: ['st-error'], gain: 0.45, bus: 'sfx', send: 0.35, voices: 2, prio: 9 },
  stLock: { files: ['st-lock'], gain: 0.45, bus: 'sfx', send: 0.3, voices: 2, prio: 8 },
  ssCoin: {
    files: ['ss-coin'],
    gain: 0.55,
    pitchVar: 0.2,
    bus: 'table',
    send: 0.08,
    voices: 3,
    prio: 4,
    minGap: 0.04,
  },
  ssCoinHi: {
    files: ['ss-coin-hi'],
    gain: 0.55,
    pitchVar: 0.2,
    bus: 'table',
    send: 0.08,
    voices: 3,
    prio: 4,
    minGap: 0.04,
  },
  ssUpgrade: { files: ['ss-upgrade'], gain: 0.6, bus: 'sfx', send: 0.12, voices: 2, prio: 7 },
  ssSecret: { files: ['ss-secret'], gain: 0.6, bus: 'sfx', send: 0.25, voices: 1, prio: 7 },
  ssLose: { files: ['ss-lose'], gain: 0.6, bus: 'sfx', send: 0.3, voices: 1, prio: 8 },
  ssGameover: { files: ['ss-gameover'], gain: 0.6, bus: 'sfx', send: 0.3, voices: 1, prio: 9 },
});

export type SfxName = keyof typeof SFX;

/** Every file stem the manifest uses (for the loader and the bank test). */
export function allStems(): string[] {
  const out = new Set<string>();
  for (const d of Object.values(SFX) as SfxDef[]) for (const f of d.files) out.add(f);
  return [...out];
}

/**
 * Stems that are decoded first: whatever the first seconds of play need (menu clicks, the
 * flippers, the bumpers) so the live-synthesis fallback never covers more than a moment.
 */
const LOAD_FIRST = [
  'ui-select',
  'ui-move',
  'ui-back',
  'ui-',
  'flip-',
  'pop-',
  'sling-',
  'rubber-',
  'metal-',
  'drop-',
  'coin-',
  'bell-',
  'switch-',
  'launch-',
  'kick-',
  'knocker-',
  'drain-',
  'm-',
];

/** allStems() in decode order: the stems the opening needs first, the long tails last. */
export function loadOrder(): string[] {
  const rank = (stem: string) => {
    const i = LOAD_FIRST.findIndex((p) => stem.startsWith(p));
    return i < 0 ? LOAD_FIRST.length : i;
  };
  return allStems()
    .map((stem, i) => ({ stem, i, r: rank(stem) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.stem);
}
