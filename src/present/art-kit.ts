/**
 * Drawing helpers for the printed artwork (playfield, plastics, backglass, cabinet sides).
 * Everything paints in a y-up unit space set by `unitSpace`, so art is placed with the same
 * table coordinates the geometry uses.
 */
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/saira-stencil-one/latin-400.css';

export type Ctx = CanvasRenderingContext2D;

export const PALETTE = {
  ink: '#07091a',
  navy0: '#070c26',
  navy1: '#0e1b4d',
  navy2: '#18307a',
  blue: '#2f64d0',
  sky: '#7fb6ff',
  orange: '#ff8420',
  amber: '#ffb41e',
  yellow: '#ffe24a',
  cream: '#fff0cc',
  red: '#e5281c',
  deepRed: '#8c0f14',
  jade: '#17b27a',
  violet: '#9a55e6',
  steel: '#aeb6c6',
} as const;

export const FONT_DISPLAY = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
export const FONT_STENCIL = '"Saira Stencil One", "Bebas Neue", Impact, sans-serif';

/** Fonts the art uses; resolves once they can be drawn to a canvas. */
export function loadArtFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  // Offline or blocked: the art keeps its fallback faces instead of an unhandled rejection.
  return Promise.all([
    document.fonts.load('40px "Bebas Neue"'),
    document.fonts.load('40px "Saira Stencil One"'),
  ])
    .then(() => undefined)
    .catch(() => undefined);
}

/** y-up unit space: 1 unit = px device pixels, origin at the bottom-left of the canvas. */
export function unitSpace(g: Ctx, px: number, height: number, ox = 0, oy = 0): void {
  g.setTransform(px, 0, 0, -px, -ox * px, height + oy * px);
}

export interface TextOpts {
  size: number;
  font?: string;
  fill?: string | CanvasGradient;
  stroke?: string;
  strokeW?: number;
  rot?: number;
  align?: CanvasTextAlign;
  shadow?: string;
  shadowOff?: number;
  spacing?: number;
}

/** Text in unit space (size in units); glyphs upright, rotation CCW in radians. */
export function text(g: Ctx, px: number, str: string, x: number, y: number, o: TextOpts): void {
  g.save();
  g.translate(x, y);
  g.rotate(o.rot ?? 0);
  g.scale(1 / px, -1 / px);
  g.font = `${Math.round(o.size * px)}px ${o.font ?? FONT_DISPLAY}`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  const ls = o.spacing ?? 0;
  if ('letterSpacing' in g)
    (g as unknown as { letterSpacing: string }).letterSpacing = `${ls * px}px`;
  const so = (o.shadowOff ?? 0.07) * px;
  if (o.shadow) {
    g.fillStyle = o.shadow;
    g.fillText(str, so, so);
  }
  if (o.stroke) {
    g.strokeStyle = o.stroke;
    g.lineWidth = (o.strokeW ?? 0.12) * px;
    g.strokeText(str, 0, 0);
  }
  g.fillStyle = o.fill ?? PALETTE.cream;
  g.fillText(str, 0, 0);
  g.restore();
}

/**
 * Text bent along a circle centred at angle `mid` (radians, CCW from +x). Outside text arches
 * over the top reading clockwise; `inside` text hugs the bottom of the circle and reads
 * counter-clockwise, so both stay upright for a viewer looking up the table.
 */
export function arcText(
  g: Ctx,
  px: number,
  str: string,
  cx: number,
  cy: number,
  r: number,
  mid: number,
  o: TextOpts & { inside?: boolean },
): void {
  g.save();
  g.font = `${Math.round(o.size * px)}px ${o.font ?? FONT_DISPLAY}`;
  const gap = o.spacing ?? 0.04;
  const widths = [...str].map((ch) => g.measureText(ch).width / px + gap);
  g.restore();
  const total = widths.reduce((a, b) => a + b, 0);
  const sgn = o.inside ? 1 : -1;
  const start = mid - (sgn * total) / (2 * r);
  let cum = 0;
  [...str].forEach((ch, i) => {
    const w = widths[i];
    const ang = start + (sgn * (cum + w / 2)) / r;
    cum += w;
    text(g, px, ch, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, {
      ...o,
      rot: ang + (o.inside ? Math.PI / 2 : -Math.PI / 2),
      spacing: 0,
    });
  });
}

export function polygon(g: Ctx, pts: readonly (readonly number[])[], close = true): void {
  g.beginPath();
  pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
  if (close) g.closePath();
}

/** Alternating wedges around (cx, cy), from angle a0 to a1. */
export function rays(
  g: Ctx,
  cx: number,
  cy: number,
  r: number,
  n: number,
  a0: number,
  a1: number,
  fill: string,
): void {
  g.fillStyle = fill;
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i += 2) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a0 + i * step, a0 + (i + 1) * step);
    g.closePath();
    g.fill();
  }
}

export function star(g: Ctx, x: number, y: number, ro: number, ri: number, n = 5, rot = 0): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Diagonal hazard stripes clipped to the current path. */
export function hazard(
  g: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  a: string,
  b: string,
  w = 0.7,
  slope = 1,
): void {
  g.save();
  g.clip();
  g.fillStyle = a;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = b;
  const span = x1 - x0 + (y1 - y0) * Math.abs(slope);
  for (let s = -span; s < span * 2; s += w * 2) {
    g.beginPath();
    g.moveTo(x0 + s, y0);
    g.lineTo(x0 + s + w, y0);
    g.lineTo(x0 + s + w + (y1 - y0) * slope, y1);
    g.lineTo(x0 + s + (y1 - y0) * slope, y1);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** The chained devil / Warden: bold, symmetrical, readable at small sizes. Unit s = head width. */
export function drawWarden(g: Ctx, x: number, y: number, s: number, glow = true): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Backdrop aura.
  if (glow) {
    const a = g.createRadialGradient(0, 0.05, 0.1, 0, 0.05, 0.95);
    a.addColorStop(0, 'rgba(255,170,40,0.55)');
    a.addColorStop(0.6, 'rgba(255,90,20,0.18)');
    a.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = a;
    g.beginPath();
    g.arc(0, 0.05, 0.95, 0, Math.PI * 2);
    g.fill();
  }
  const ink = PALETTE.ink;
  const horn = (sx: number) => {
    g.beginPath();
    g.moveTo(sx * 0.2, 0.3);
    g.bezierCurveTo(sx * 0.46, 0.38, sx * 0.62, 0.55, sx * 0.5, 0.86);
    g.bezierCurveTo(sx * 0.52, 0.64, sx * 0.34, 0.52, sx * 0.14, 0.46);
    g.closePath();
    g.fillStyle = PALETTE.cream;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 0.035;
    g.stroke();
  };
  horn(-1);
  horn(1);
  // Head.
  g.beginPath();
  g.moveTo(-0.34, 0.2);
  g.bezierCurveTo(-0.4, -0.1, -0.3, -0.36, 0, -0.42);
  g.bezierCurveTo(0.3, -0.36, 0.4, -0.1, 0.34, 0.2);
  g.bezierCurveTo(0.22, 0.38, -0.22, 0.38, -0.34, 0.2);
  g.closePath();
  const hg = g.createLinearGradient(0, 0.4, 0, -0.42);
  hg.addColorStop(0, '#ff5a2a');
  hg.addColorStop(1, '#b0141a');
  g.fillStyle = hg;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 0.04;
  g.stroke();
  // Brow and eyes.
  g.strokeStyle = ink;
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(-0.28, 0.12);
  g.lineTo(-0.06, 0.04);
  g.moveTo(0.28, 0.12);
  g.lineTo(0.06, 0.04);
  g.stroke();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 0.07, 0.0);
    g.quadraticCurveTo(sx * 0.17, 0.09, sx * 0.27, 0.02);
    g.quadraticCurveTo(sx * 0.17, -0.07, sx * 0.07, 0.0);
    g.closePath();
    g.fillStyle = PALETTE.yellow;
    g.fill();
    g.lineWidth = 0.025;
    g.stroke();
    g.fillStyle = ink;
    g.fillRect(sx * 0.17 - 0.012, -0.045, 0.024, 0.09);
  }
  // Nose and grin with fangs.
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(-0.035, -0.07);
  g.lineTo(0.035, -0.07);
  g.lineTo(0, -0.13);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-0.22, -0.2);
  g.quadraticCurveTo(0, -0.36, 0.22, -0.2);
  g.quadraticCurveTo(0, -0.28, -0.22, -0.2);
  g.closePath();
  g.fill();
  g.fillStyle = PALETTE.cream;
  for (const sx of [-0.13, -0.05, 0.05, 0.13]) {
    g.beginPath();
    g.moveTo(sx - 0.025, -0.235 - Math.abs(sx) * 0.1);
    g.lineTo(sx + 0.025, -0.235 - Math.abs(sx) * 0.1);
    g.lineTo(sx, -0.31 - Math.abs(sx) * 0.1);
    g.closePath();
    g.fill();
  }
  // Warden's peaked cap: prison authority over the horns.
  g.beginPath();
  g.moveTo(-0.3, 0.28);
  g.quadraticCurveTo(0, 0.52, 0.3, 0.28);
  g.lineTo(0.3, 0.22);
  g.quadraticCurveTo(0, 0.4, -0.3, 0.22);
  g.closePath();
  g.fillStyle = '#1c2a66';
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 0.03;
  g.stroke();
  g.fillStyle = PALETTE.amber;
  star(g, 0, 0.33, 0.045, 0.02, 5);
  g.fill();
  g.restore();
}

/** A chain of oval links between two points, sagging by `sag` units. */
export function chain(
  g: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sag: number,
  link = 0.32,
  color: string = PALETTE.steel,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(3, Math.round(len / (link * 0.78)));
  g.save();
  g.lineWidth = link * 0.2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    const ang = Math.atan2(y1 - y0 - Math.cos(t * Math.PI) * Math.PI * sag, x1 - x0);
    g.beginPath();
    g.ellipse(x, y, link * 0.5, link * 0.3, ang + (i % 2 ? Math.PI / 2 : 0) * 0.0, 0, Math.PI * 2);
    g.strokeStyle = PALETTE.ink;
    g.lineWidth = link * 0.3;
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = link * 0.16;
    g.stroke();
  }
  g.restore();
}

export function key(g: Ctx, x: number, y: number, s: number, rot: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [col, w] of [
    [PALETTE.ink, 0.17],
    [color, 0.09],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.arc(-0.45, 0, 0.2, 0, Math.PI * 2);
    g.moveTo(-0.25, 0);
    g.lineTo(0.5, 0);
    g.moveTo(0.3, 0);
    g.lineTo(0.3, -0.16);
    g.moveTo(0.46, 0);
    g.lineTo(0.46, -0.12);
    g.stroke();
  }
  g.restore();
}

export function skull(g: Ctx, x: number, y: number, s: number, fill: string, ink: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = fill;
  g.strokeStyle = ink;
  g.lineWidth = 0.06;
  g.beginPath();
  g.arc(0, 0.1, 0.38, 0, Math.PI * 2);
  g.rect(-0.22, -0.34, 0.44, 0.34);
  g.fill();
  g.stroke();
  g.fillStyle = ink;
  g.beginPath();
  g.arc(-0.15, 0.1, 0.1, 0, Math.PI * 2);
  g.arc(0.15, 0.1, 0.1, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(0, -0.02);
  g.lineTo(-0.05, -0.1);
  g.lineTo(0.05, -0.1);
  g.closePath();
  g.fill();
  for (const sx of [-0.12, -0.04, 0.04, 0.12]) g.fillRect(sx - 0.012, -0.34, 0.024, 0.14);
  g.restore();
}

/** Seeded grain: cheap texture feel without a noise library. */
export function speckle(
  g: Ctx,
  rnd: () => number,
  w: number,
  h: number,
  n: number,
  size: number,
  color: (a: number) => string,
): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color(rnd());
    g.fillRect(rnd() * w, rnd() * h, size * (0.4 + rnd()), size * (0.4 + rnd()));
  }
}
