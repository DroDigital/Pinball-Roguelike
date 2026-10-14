/**
 * The dark-metal menu frames: title, cell, ATM, shop, phone, red call, pause and settings.
 * One frame routine (bevelled steel, a recessed window at the content rect, a label plate at
 * the heading rect) plus a few fittings per screen, so the screens read as one family of
 * machine-room hardware.
 */
import { ART, HEAD_RECT, type ArtId, type Rect } from '../../content/art';
import {
  BRASS,
  FONT,
  PAL,
  STEEL,
  chamfer,
  glow,
  grow,
  hazard,
  hgrad,
  plate,
  px,
  recess,
  rivet,
  rr,
  screw,
  text,
  vgrad,
  type Box,
  type Ctx,
  type PlateStyle,
} from './kit';
import type { Painter } from './index';

type WellKind = 'dark' | 'crt' | 'blood';

export interface FrameSpec {
  content: Rect;
  head?: Rect;
  /** A brass label plate, or a dark window (for the logo). */
  headStyle?: 'brass' | 'dark' | 'enamel';
  accent?: string;
  body?: PlateStyle;
  well?: WellKind;
  /** Corner chamfer, in 1200-px units. */
  corner?: number;
  seed: string;
  /** Fittings, drawn after the frame; u is the scale against a 1200 px frame. */
  extra?: (g: Ctx, w: number, h: number, u: number) => void;
}

const WELLS: Record<WellKind, readonly [string, string]> = {
  dark: ['#080c10', '#0f151a'],
  crt: ['#06150b', '#03100a'],
  blood: ['#140706', '#0c0504'],
};

const BLOOD_STEEL: PlateStyle = {
  ...STEEL,
  fill: ['#5a2a26', '#3a1a18', '#1e0c0b'],
};

/** Text pressed into the metal: a light edge below, a dark body above. */
export function engrave(
  g: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: { font?: string; align?: CanvasTextAlign; spacing?: number; alpha?: number } = {},
): void {
  const font = `${size}px ${opts.font ?? FONT.cond}`;
  const o = { font, align: opts.align ?? 'center', spacing: opts.spacing ?? size * 0.18 };
  text(g, s, x, y + Math.max(1, size * 0.07), { ...o, fill: 'rgba(255,255,255,0.16)' });
  text(g, s, x, y, { ...o, fill: 'rgba(0,0,0,0.55)', alpha: opts.alpha ?? 1 });
}

/** A recessed slot of safety stripes. */
export function hazardSlot(g: Ctx, b: Box, u: number): void {
  recess(g, b, rr(b, 5 * u), ['#050709', '#0c1013'], 0.5);
  const inner = grow(b, -4 * u);
  g.save();
  rr(inner, 3 * u)(g);
  g.clip();
  hazard(g, inner, 20 * u, 'rgba(255,178,74,0.9)', 'rgba(20,24,28,0.95)');
  g.fillStyle = vgrad(g, inner[1], inner[1] + inner[3], [
    [0, 'rgba(0,0,0,0.5)'],
    [0.5, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.35)'],
  ]);
  g.fillRect(...inner);
  g.restore();
}

/** A round indicator lamp with a lit centre and a glow. */
export function lamp(g: Ctx, cx: number, cy: number, r: number, color: string, lit = true): void {
  g.save();
  g.fillStyle = '#05070a';
  g.beginPath();
  g.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = Math.max(1, r * 0.18);
  g.beginPath();
  g.arc(cx, cy, r * 1.35, 0.2, Math.PI - 0.2);
  g.stroke();
  const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  gr.addColorStop(0, lit ? '#ffffff' : '#555');
  gr.addColorStop(0.35, lit ? color : '#2a2f35');
  gr.addColorStop(1, lit ? color : '#14181c');
  g.fillStyle = gr;
  g.globalAlpha = lit ? 1 : 0.8;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (lit) glow(g, cx, cy, r * 4, color, 0.45);
}

export function paintFrame(g: Ctx, w: number, h: number, s: FrameSpec): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  const accent = s.accent ?? PAL.amber;
  const body = s.body ?? STEEL;
  const c = (s.corner ?? 34) * u;
  const m = 6 * u;

  // Outer slab, then the sunk panel inside its rim.
  const outer: Box = [m, m, w - 2 * m, h - 2 * m];
  plate(g, outer, chamfer(outer, c), { ...body, seed: s.seed }, 3 * u);
  const rim = grow(outer, -15 * u);
  plate(
    g,
    rim,
    chamfer(rim, c * 0.72),
    {
      ...body,
      fill: [darker(body.fill[0]), darker(body.fill[1]), darker(body.fill[2])],
      rim: 0.7,
      seed: `${s.seed}-in`,
    },
    2 * u,
  );
  // An inlaid accent line between rim and panel.
  g.save();
  chamfer(grow(outer, -9 * u), c * 0.86)(g);
  g.lineWidth = 1.6 * u;
  g.strokeStyle = accent;
  g.globalAlpha = 0.5;
  g.stroke();
  g.restore();

  // Corner screws sit in the rim, clear of the chamfers.
  const d = c * 0.5 + 15 * u;
  for (const [i, [sx, sy]] of (
    [
      [outer[0] + d, outer[1] + d],
      [outer[0] + outer[2] - d, outer[1] + d],
      [outer[0] + d, outer[1] + outer[3] - d],
      [outer[0] + outer[2] - d, outer[1] + outer[3] - d],
    ] as const
  ).entries())
    screw(g, sx, sy, 6.5 * u, i * 1.3);

  // The window.
  const wb = grow(px(s.content, w, h), 14 * u);
  const wellShape = rr(wb, (s.well === 'crt' ? 44 : 16) * u);
  recess(g, wb, wellShape, WELLS[s.well ?? 'dark'], 1.2);
  if (s.well === 'crt') crtGlass(g, wb, u);
  else surfaceSheen(g, wb, u, wellShape);
  g.save();
  rr(grow(wb, 7 * u), 22 * u)(g);
  g.lineWidth = 1.5 * u;
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.stroke();
  g.restore();

  s.extra?.(g, w, h, u);

  // The heading plate.
  if (s.head) {
    const hb = grow(px(s.head, w, h), 12 * u, 7 * u);
    const style = s.headStyle ?? 'brass';
    if (style === 'brass') {
      plate(g, hb, rr(hb, 8 * u), { ...BRASS, seed: `${s.seed}-h` }, 2 * u);
      g.save();
      rr(grow(hb, -6 * u), 5 * u)(g);
      g.lineWidth = 1.5 * u;
      g.strokeStyle = 'rgba(70,40,5,0.55)';
      g.stroke();
      g.restore();
      screw(g, hb[0] + 15 * u, hb[1] + hb[3] / 2, 4.6 * u, 0.4);
      screw(g, hb[0] + hb[2] - 15 * u, hb[1] + hb[3] / 2, 4.6 * u, 1.9);
    } else if (style === 'enamel') {
      plate(g, hb, rr(hb, 8 * u), { ...BLOOD_STEEL, seed: `${s.seed}-h` }, 2 * u);
      g.save();
      rr(grow(hb, -6 * u), 5 * u)(g);
      g.lineWidth = 1.4 * u;
      g.strokeStyle = 'rgba(255,170,120,0.45)';
      g.stroke();
      g.restore();
    } else {
      // A dark display window with a warm rim light.
      recess(g, hb, rr(hb, 10 * u), ['#0a0d11', '#12171c'], 1);
      const lit = g.createRadialGradient(hb[0] + hb[2] / 2, hb[1] + hb[3] / 2, 0, hb[0] + hb[2] / 2, hb[1] + hb[3] / 2, hb[2] * 0.55);
      lit.addColorStop(0, 'rgba(255,170,70,0.2)');
      lit.addColorStop(1, 'rgba(255,170,70,0)');
      g.save();
      rr(hb, 10 * u)(g);
      g.clip();
      g.fillStyle = lit;
      g.fillRect(...hb);
      g.restore();
      g.save();
      rr(grow(hb, 5 * u), 14 * u)(g);
      g.lineWidth = 2 * u;
      g.strokeStyle = accent;
      g.globalAlpha = 0.6;
      g.stroke();
      g.restore();
    }
  }
}

/** The same colour a step darker, for the sunk panel. */
function darker(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 0.62;
  const r = Math.round(((n >> 16) & 255) * f);
  const gg = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${gg},${b})`;
}

/** A faint diagonal sheen and a fine dot grid so a dark window doesn't read as flat. */
function surfaceSheen(g: Ctx, b: Box, u: number, shape: (g: Ctx) => void): void {
  g.save();
  shape(g);
  g.clip();
  const sheen = g.createLinearGradient(b[0], b[1], b[0] + b[2] * 0.6, b[1] + b[3]);
  sheen.addColorStop(0, 'rgba(255,255,255,0.045)');
  sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(...b);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  const step = 14 * u;
  for (let y = b[1] + step; y < b[1] + b[3]; y += step)
    for (let x = b[0] + step; x < b[0] + b[2]; x += step) g.fillRect(x, y, 1.4 * u, 1.4 * u);
  g.restore();
}

/** Phosphor glass: scanlines, a bright middle, a dark vignette and a reflection. */
function crtGlass(g: Ctx, b: Box, u: number): void {
  const [x, y, w, h] = b;
  g.save();
  rr(b, 44 * u)(g);
  g.clip();
  const bloom = g.createRadialGradient(x + w / 2, y + h * 0.45, 0, x + w / 2, y + h * 0.45, Math.max(w, h) * 0.65);
  bloom.addColorStop(0, 'rgba(60,200,110,0.22)');
  bloom.addColorStop(0.6, 'rgba(30,120,70,0.08)');
  bloom.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = bloom;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let yy = y; yy < y + h; yy += 3 * u) g.fillRect(x, yy, w, 1.2 * u);
  // Glass reflection across the upper left.
  const refl = g.createLinearGradient(x, y, x + w * 0.55, y + h * 0.5);
  refl.addColorStop(0, 'rgba(255,255,255,0.1)');
  refl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = refl;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w * 0.62, y);
  g.lineTo(x, y + h * 0.42);
  g.closePath();
  g.fill();
  g.restore();
}

// ---- screens --------------------------------------------------------------------------------

function ventSlats(g: Ctx, x: number, y: number, w: number, h: number, u: number): void {
  const step = 16 * u;
  for (let yy = y; yy < y + h - 4 * u; yy += step) {
    const b: Box = [x, yy, w, 8 * u];
    recess(g, b, rr(b, 4 * u), ['#04060a', '#0b0f13'], 0.4);
  }
}

function bell(g: Ctx, cx: number, cy: number, r: number): void {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.ellipse(cx, cy + r * 0.2, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.55, r * 0.1, cx, cy, r);
  gr.addColorStop(0, PAL.brassHi);
  gr.addColorStop(0.5, PAL.brass);
  gr.addColorStop(1, PAL.brassLo);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r, Math.PI, 0);
  g.lineTo(cx + r, cy + r * 0.28);
  g.lineTo(cx - r, cy + r * 0.28);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,24,4,0.7)';
  g.lineWidth = r * 0.07;
  g.stroke();
  g.restore();
  rivet(g, cx, cy - r * 0.2, r * 0.13);
}

function pentagram(g: Ctx, cx: number, cy: number, r: number, color: string): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, r * 0.07);
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + ((i * 2) / 5) * Math.PI * 2;
    const px_ = cx + Math.cos(a) * r * 0.92;
    const py_ = cy + Math.sin(a) * r * 0.92;
    if (i === 0) g.moveTo(px_, py_);
    else g.lineTo(px_, py_);
  }
  g.closePath();
  g.stroke();
  g.restore();
}

const titleSpec: FrameSpec = {
  content: ART['menus/title-panel'].content,
  head: HEAD_RECT.title,
  headStyle: 'dark',
  seed: 'title',
  extra(g, w, h, u) {
    // Service strip and nameplate under the window.
    hazardSlot(g, [w * 0.115, h * 0.815, w * 0.77, 26 * u], u);
    engrave(g, "PROPERTY OF DEBTOR'S PRISON  \u00b7  PAY OR FALL", w / 2, h * 0.915, 26 * u);
    lamp(g, w * 0.085, h * 0.89, 7 * u, PAL.red);
    lamp(g, w * 0.915, h * 0.89, 7 * u, PAL.amber);
  },
};

const cellSpec: FrameSpec = {
  content: ART['menus/cell-hub-panel'].content,
  seed: 'cell',
  extra(g, w, h, u) {
    // A readout lamp bank in the top rim, clear of the window.
    for (const [i, col] of [PAL.red, PAL.amber, '#6cf08a'].entries())
      lamp(g, w * 0.5 + (i - 1) * 40 * u, h * 0.055, 6.5 * u, col, i !== 0);
    engrave(g, 'CELL BLOCK  \u00b7  HOUSEKEEPING', w * 0.5, h * 0.968, 18 * u);
  },
};

const shopSpec: FrameSpec = {
  content: ART['menus/shop-cabinet'].content,
  head: HEAD_RECT.shop,
  seed: 'shop',
  extra(g, w, h, u) {
    // The striplight above the glass.
    const tube: Box = [w * 0.13, h * 0.174, w * 0.74, h * 0.032];
    recess(g, grow(tube, 6 * u), rr(grow(tube, 6 * u), 10 * u), ['#05080b', '#0b0f13'], 0.6);
    g.save();
    rr(tube, 8 * u)(g);
    g.fillStyle = vgrad(g, tube[1], tube[1] + tube[3], [
      [0, '#fff3cf'],
      [0.4, '#ffc15e'],
      [1, '#c97a1a'],
    ]);
    g.fill();
    g.restore();
    glow(g, w / 2, tube[1] + tube[3] / 2, w * 0.4, 'rgba(255,170,60,0.5)', 0.7);
    // Vents either side of the glass and a coin return/lock on the right.
    ventSlats(g, w * 0.04, h * 0.26, w * 0.05, h * 0.46, u);
    ventSlats(g, w * 0.91, h * 0.26, w * 0.05, h * 0.22, u);
    const lockC: [number, number] = [w * 0.935, h * 0.6];
    plate(g, [lockC[0] - 20 * u, lockC[1] - 30 * u, 40 * u, 60 * u], rr([lockC[0] - 20 * u, lockC[1] - 30 * u, 40 * u, 60 * u], 8 * u), { ...BRASS, seed: 'lock' }, 1.5 * u);
    g.fillStyle = '#0b0705';
    g.beginPath();
    g.arc(lockC[0], lockC[1] - 6 * u, 7 * u, 0, Math.PI * 2);
    g.fill();
    g.fillRect(lockC[0] - 2.5 * u, lockC[1] - 6 * u, 5 * u, 20 * u);
    // Delivery flap.
    const flap: Box = [w * 0.3, h * 0.84, w * 0.4, h * 0.1];
    recess(g, flap, rr(flap, 12 * u), ['#05070a', '#0d1115'], 0.9);
    engrave(g, 'PUSH', w / 2, h * 0.905, 30 * u, { font: FONT.head, spacing: 8 * u });
  },
};

const phoneSpec: FrameSpec = {
  content: ART['menus/phone-panel'].content,
  head: HEAD_RECT.phone,
  seed: 'phone',
  extra(g, w, h, u) {
    bell(g, w * 0.2, h * 0.095, 50 * u);
    bell(g, w * 0.8, h * 0.095, 50 * u);
    // The earpiece grille.
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 20; k++) {
        const cx = w / 2 + (k - 9.5) * 22 * u;
        const cy = h * 0.865 + i * 22 * u;
        g.fillStyle = '#05070a';
        g.beginPath();
        g.arc(cx, cy, 5.5 * u, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.beginPath();
        g.arc(cx, cy + 1.2 * u, 5.5 * u, 0.2, Math.PI - 0.2);
        g.fill();
        g.fillStyle = '#05070a';
        g.beginPath();
        g.arc(cx, cy, 4.8 * u, 0, Math.PI * 2);
        g.fill();
      }
    engrave(g, 'LINE 1  \u00b7  OUTSIDE', w / 2, h * 0.96, 18 * u);
  },
};

const redCallSpec: FrameSpec = {
  content: ART['menus/red-call-panel'].content,
  head: HEAD_RECT.redCall,
  headStyle: 'enamel',
  accent: '#ff6a4a',
  body: BLOOD_STEEL,
  well: 'blood',
  seed: 'redcall',
  extra(g, w, h, u) {
    // A sigil over the heading: ring and star, lit like a pilot lamp.
    glow(g, w / 2, h * 0.07, 90 * u, 'rgba(255,60,40,0.55)', 0.8);
    pentagram(g, w / 2, h * 0.07, 36 * u, 'rgba(255,140,110,0.9)');
    hazardSlot(g, [w * 0.13, h * 0.865, w * 0.74, 22 * u], u);
    engrave(g, 'DO NOT ANSWER AFTER DARK', w / 2, h * 0.95, 20 * u);
  },
};

const pauseSpec: FrameSpec = {
  content: ART['menus/pause-service-panel'].content,
  head: HEAD_RECT.pause,
  seed: 'pause',
  extra(g, w, h, u) {
    hazardSlot(g, [w * 0.15, h * 0.2, w * 0.7, 20 * u], u);
    hazardSlot(g, [w * 0.15, h * 0.81, w * 0.7, 20 * u], u);
    engrave(g, 'SERVICE MODE  \u00b7  GAME HELD', w / 2, h * 0.925, 22 * u);
    lamp(g, w * 0.085, h * 0.5, 7 * u, PAL.amber);
    lamp(g, w * 0.915, h * 0.5, 7 * u, PAL.amber);
  },
};

const settingsSpec: FrameSpec = {
  content: ART['menus/settings-service-panel'].content,
  head: HEAD_RECT.settings,
  seed: 'settings',
  extra(g, w, h, u) {
    hazardSlot(g, [w * 0.12, h * 0.835, w * 0.76, 18 * u], u);
    engrave(g, 'OPERATOR ADJUSTMENTS', w / 2, h * 0.93, 22 * u);
    for (const sx of [0.075, 0.925])
      for (const sy of [0.3, 0.46, 0.62]) {
        const cx = w * sx;
        const cy = h * sy;
        const gr = g.createRadialGradient(cx - 6 * u, cy - 8 * u, 2 * u, cx, cy, 20 * u);
        gr.addColorStop(0, '#6d7883');
        gr.addColorStop(1, '#1b2128');
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.beginPath();
        g.arc(cx, cy + 3 * u, 21 * u, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, 19 * u, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = PAL.amber;
        g.lineWidth = 2.4 * u;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(sx * 9 + sy * 5) * 14 * u, cy + Math.sin(sx * 9 + sy * 5) * 14 * u);
        g.stroke();
      }
  },
};

const atmSpec: FrameSpec = {
  content: ART['menus/atm-terminal'].content,
  well: 'crt',
  accent: '#72ff99',
  seed: 'atm',
  extra(g, w, h, u) {
    // Keypad on the left, card reader and receipt slot on the right, below the screen.
    const keyW = 62 * u;
    const keyH = 40 * u;
    const gap = 12 * u;
    const kx = w * 0.17;
    const ky = h * 0.79;
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    labels.forEach((l, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      // Two rows of six read better in the space that is left.
      const c2 = i % 6;
      const r2 = Math.floor(i / 6);
      void col;
      void row;
      const b: Box = [kx + c2 * (keyW + gap), ky + r2 * (keyH + gap), keyW, keyH];
      plate(g, b, rr(b, 7 * u), { ...STEEL, fill: ['#56626e', '#37424c', '#232b33'], seed: `key${i}` }, 1.5 * u);
      text(g, l, b[0] + keyW / 2, b[1] + keyH * 0.7, {
        font: `${26 * u}px ${FONT.mono}`,
        fill: 'rgba(240,244,248,0.85)',
        align: 'center',
        shadow: 'rgba(0,0,0,0.6)',
        shadowDy: 1.5,
      });
    });
    // Card slot with an indicator.
    const card: Box = [w * 0.6, h * 0.795, w * 0.2, 16 * u];
    recess(g, card, rr(card, 6 * u), ['#020304', '#090c0f'], 0.6);
    g.fillStyle = 'rgba(114,255,153,0.85)';
    g.fillRect(card[0] + 6 * u, card[1] + card[3] / 2 - 1.5 * u, card[2] - 12 * u, 3 * u);
    glow(g, card[0] + card[2] / 2, card[1] + card[3] / 2, 60 * u, 'rgba(114,255,153,0.35)', 0.5);
    engrave(g, 'INSERT CARD', card[0] + card[2] / 2, card[1] + card[3] + 28 * u, 17 * u);
    // Receipt slot.
    const rec: Box = [w * 0.6, h * 0.9, w * 0.2, 14 * u];
    recess(g, rec, rr(rec, 6 * u), ['#020304', '#090c0f'], 0.6);
    engrave(g, 'RECEIPT', rec[0] + rec[2] / 2, rec[1] + rec[3] + 26 * u, 17 * u);
    lamp(g, w * 0.88, h * 0.82, 7 * u, '#6cf08a');
    lamp(g, w * 0.88, h * 0.9, 7 * u, PAL.red, false);
  },
};

const specs: Partial<Record<ArtId, FrameSpec>> = {
  'menus/title-panel': titleSpec,
  'menus/cell-hub-panel': cellSpec,
  'menus/shop-cabinet': shopSpec,
  'menus/phone-panel': phoneSpec,
  'menus/red-call-panel': redCallSpec,
  'menus/pause-service-panel': pauseSpec,
  'menus/settings-service-panel': settingsSpec,
  'menus/atm-terminal': atmSpec,
};

export const METAL_PAINTERS = Object.fromEntries(
  Object.entries(specs).map(([id, spec]) => [id, ((g, w, h) => paintFrame(g, w, h, spec)) as Painter]),
) as Record<
  | 'menus/title-panel'
  | 'menus/cell-hub-panel'
  | 'menus/shop-cabinet'
  | 'menus/phone-panel'
  | 'menus/red-call-panel'
  | 'menus/pause-service-panel'
  | 'menus/settings-service-panel'
  | 'menus/atm-terminal',
  Painter
>;

// Unused helpers kept in scope for the HUD module.
void hgrad;
