/**
 * Drawing kit for the app's own artwork: bevelled steel, brass plates, recessed windows, paper,
 * screws, hazard stripes, chain and ball. Everything is painted on a 2D canvas from code with a
 * seeded Rng, so the same art comes out every time and nothing is fetched.
 */
import { Rng } from '../../core/rng';

export type Ctx = CanvasRenderingContext2D;
/** [x, y, w, h] in canvas pixels. */
export type Box = readonly [x: number, y: number, w: number, h: number];

export const PAL = {
  // dark steel, light to dark
  steelHi: '#46525e',
  steel: '#2a343d',
  steelLo: '#171d23',
  steelEdge: '#0a0d10',
  // brass
  brassHi: '#f6dc8c',
  brass: '#cf9c3e',
  brassLo: '#7d571a',
  // warm signals
  amber: '#ffb24a',
  red: '#d9442c',
  redDeep: '#7c1e14',
  bone: '#f4e8cc',
  // paper
  paperHi: '#faf2dc',
  paper: '#efe2c0',
  paperLo: '#d6c398',
  ink: '#291c12',
  crt: '#72ff99',
} as const;

export const FONT = {
  head: '"Bebas Neue", "Oswald", Impact, sans-serif',
  stencil: '"Saira Stencil One", Impact, sans-serif',
  type: '"Special Elite", "Courier New", monospace',
  mono: 'VT323, "Courier New", monospace',
  sans: 'Inter, system-ui, Arial, sans-serif',
  cond: 'Oswald, "Arial Narrow", sans-serif',
} as const;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Scale of a frame relative to its 1200 px width, so proportions hold at any canvas size. */
export const unit = (w: number): number => w / 1200;

/** Normalised rect -> pixel box. */
export const px = (r: readonly [number, number, number, number], w: number, h: number): Box => [
  r[0] * w,
  r[1] * h,
  r[2] * w,
  r[3] * h,
];

export const grow = (b: Box, dx: number, dy: number = dx): Box => [
  b[0] - dx,
  b[1] - dy,
  b[2] + dx * 2,
  b[3] + dy * 2,
];

// ---- shapes ---------------------------------------------------------------------------------

export function rrPath(g: Ctx, [x, y, w, h]: Box, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function chamferPath(g: Ctx, [x, y, w, h]: Box, c: number): void {
  g.beginPath();
  g.moveTo(x + c, y);
  g.lineTo(x + w - c, y);
  g.lineTo(x + w, y + c);
  g.lineTo(x + w, y + h - c);
  g.lineTo(x + w - c, y + h);
  g.lineTo(x + c, y + h);
  g.lineTo(x, y + h - c);
  g.lineTo(x, y + c);
  g.closePath();
}

export type Shape = (g: Ctx) => void;

export const rr =
  (b: Box, r: number): Shape =>
  (g) =>
    rrPath(g, b, r);
export const chamfer =
  (b: Box, c: number): Shape =>
  (g) =>
    chamferPath(g, b, c);

// ---- texture --------------------------------------------------------------------------------

let tile: HTMLCanvasElement | null = null;

/** A 256 px tile of mid-grey noise, for grain overlays. */
function noiseTile(): HTMLCanvasElement {
  if (tile) return tile;
  tile = makeCanvas(256, 256);
  const g = tile.getContext('2d')!;
  const d = g.createImageData(256, 256);
  const rng = new Rng('art-grain');
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 128 + (rng.next() + rng.next() - 1) * 120;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return tile;
}

/** Fine grain over the current clip (or the given box). */
export function grain(g: Ctx, box: Box, alpha = 0.07, mode: GlobalCompositeOperation = 'overlay'): void {
  const pat = g.createPattern(noiseTile(), 'repeat')!;
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha = alpha;
  g.fillStyle = pat;
  g.fillRect(box[0], box[1], box[2], box[3]);
  g.restore();
}

/** Fine horizontal brushing, as on machined steel. */
export function brushed(g: Ctx, [x, y, w, h]: Box, seed: string, alpha = 0.05): void {
  const rng = new Rng(seed);
  g.save();
  g.lineWidth = 1;
  const n = Math.floor(h / 1.6);
  for (let i = 0; i < n; i++) {
    const yy = y + rng.next() * h;
    const x0 = x + rng.next() * w * 0.3;
    const x1 = x + w - rng.next() * w * 0.3;
    g.strokeStyle = rng.chance(0.5) ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.4})`;
    g.beginPath();
    g.moveTo(x0, yy);
    g.lineTo(x1, yy);
    g.stroke();
  }
  g.restore();
}

export function vgrad(g: Ctx, y0: number, y1: number, stops: readonly [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  return gr;
}

export function hgrad(g: Ctx, x0: number, x1: number, stops: readonly [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  return gr;
}

// ---- plates and wells -----------------------------------------------------------------------

export interface PlateStyle {
  /** Top, mid and bottom fill colours. */
  fill: readonly [string, string, string];
  /** Rim light on the top-left edges, shadow on the bottom-right. */
  rim?: number;
  brush?: boolean;
  grain?: number;
  seed?: string;
  /** Hairline outline outside the shape. */
  edge?: string;
}

export const STEEL: PlateStyle = {
  fill: [PAL.steelHi, PAL.steel, PAL.steelLo],
  rim: 1,
  brush: true,
  grain: 0.08,
  edge: PAL.steelEdge,
};
export const BRASS: PlateStyle = {
  fill: [PAL.brassHi, PAL.brass, PAL.brassLo],
  rim: 1,
  brush: true,
  grain: 0.1,
  edge: '#3b2810',
};

/** A bevelled slab: gradient, brushing, grain, lit rim and a dark outline. */
export function plate(g: Ctx, box: Box, shape: Shape, s: PlateStyle, lw = 2): void {
  const [x, y, w, h] = box;
  g.save();
  shape(g);
  g.fillStyle = vgrad(g, y, y + h, [
    [0, s.fill[0]],
    [0.45, s.fill[1]],
    [1, s.fill[2]],
  ]);
  g.fill();
  g.clip();
  if (s.brush) brushed(g, box, s.seed ?? `${x}-${y}`, 0.06);
  if (s.grain) grain(g, box, s.grain);
  if (s.rim) {
    // Light along the top-left, shadow along the bottom-right: stroke twice as wide as shown,
    // the outer half is clipped away.
    const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
    gr.addColorStop(0, `rgba(255,255,255,${0.5 * s.rim})`);
    gr.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    gr.addColorStop(1, `rgba(0,0,0,${0.55 * s.rim})`);
    shape(g);
    g.lineWidth = lw * 2.4;
    g.strokeStyle = gr;
    g.stroke();
  }
  g.restore();
  if (s.edge) {
    g.save();
    shape(g);
    g.lineWidth = lw * 0.8;
    g.strokeStyle = s.edge;
    g.stroke();
    g.restore();
  }
}

/** A window cut into its surround: dark fill, soft shadow from the top, a lit lower lip. */
export function recess(
  g: Ctx,
  box: Box,
  shape: Shape,
  fill: readonly [string, string] = ['#0b1014', '#12181d'],
  depth = 1,
): void {
  const [x, y, w, h] = box;
  g.save();
  shape(g);
  g.fillStyle = vgrad(g, y, y + h, [
    [0, fill[0]],
    [1, fill[1]],
  ]);
  g.fill();
  g.clip();
  // Shadow cast into the hole: a frame-shaped path with the hole cut out, blurred inwards.
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 26 * depth;
  g.shadowOffsetY = 7 * depth;
  g.fillStyle = '#000';
  g.beginPath();
  g.rect(x - 200, y - 200, w + 400, h + 400);
  shape(g);
  g.fill('evenodd');
  g.restore();
  // Lit lower lip, dark upper lip.
  g.save();
  shape(g);
  g.clip();
  shape(g);
  g.lineWidth = 3;
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, 'rgba(0,0,0,0.7)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.strokeStyle = gr;
  g.stroke();
  g.restore();
}

/** A countersunk hex-socket screw. */
export function screw(g: Ctx, cx: number, cy: number, r: number, turn = 0): void {
  g.save();
  g.translate(cx, cy);
  const base = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  base.addColorStop(0, '#9aa4ae');
  base.addColorStop(0.55, '#4f5a64');
  base.addColorStop(1, '#232a31');
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.arc(0, r * 0.12, r * 1.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = base;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.65)';
  g.lineWidth = Math.max(1, r * 0.12);
  g.stroke();
  // Hex socket.
  g.rotate(turn);
  g.fillStyle = '#10151a';
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * r * 0.42;
    const py = Math.sin(a) * r * 0.42;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Rivet: a domed dot with a highlight. */
export function rivet(g: Ctx, cx: number, cy: number, r: number): void {
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  gr.addColorStop(0, '#c9d1d8');
  gr.addColorStop(0.6, '#5c6772');
  gr.addColorStop(1, '#262d34');
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.arc(cx, cy + r * 0.2, r * 1.05, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

/** Diagonal stripes inside a box (safety striping). */
export function hazard(g: Ctx, box: Box, period: number, a: string, b: string): void {
  const [x, y, w, h] = box;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = b;
  g.fillRect(x, y, w, h);
  g.fillStyle = a;
  for (let sx = x - h; sx < x + w + h; sx += period) {
    g.beginPath();
    g.moveTo(sx, y + h);
    g.lineTo(sx + period / 2, y + h);
    g.lineTo(sx + period / 2 + h, y);
    g.lineTo(sx + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** A soft round glow (lamps, phosphor). */
export function glow(g: Ctx, cx: number, cy: number, r: number, color: string, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.globalCompositeOperation = 'lighter';
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
}

// ---- text -----------------------------------------------------------------------------------

export interface TextStyle {
  font: string;
  fill?: string | CanvasGradient;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Extra space between letters, px. */
  spacing?: number;
  stroke?: string;
  strokeWidth?: number;
  shadow?: string;
  shadowBlur?: number;
  shadowDy?: number;
  alpha?: number;
}

/** Text with letter spacing (done by hand: ctx.letterSpacing is not everywhere). */
export function text(g: Ctx, s: string, x: number, y: number, o: TextStyle): void {
  g.save();
  g.font = o.font;
  g.textBaseline = o.baseline ?? 'alphabetic';
  g.globalAlpha = o.alpha ?? 1;
  const sp = o.spacing ?? 0;
  const align = o.align ?? 'left';
  g.textAlign = 'left';
  const widths = [...s].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (widths.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  if (o.shadow) {
    g.shadowColor = o.shadow;
    g.shadowBlur = o.shadowBlur ?? 0;
    g.shadowOffsetY = o.shadowDy ?? 0;
  }
  [...s].forEach((ch, i) => {
    if (o.stroke) {
      g.lineWidth = o.strokeWidth ?? 2;
      g.lineJoin = 'round';
      g.strokeStyle = o.stroke;
      g.strokeText(ch, cx, y);
    }
    if (o.fill !== undefined || !o.stroke) {
      g.fillStyle = o.fill ?? '#fff';
      g.fillText(ch, cx, y);
    }
    cx += widths[i] + sp;
  });
  g.restore();
}

export function measure(g: Ctx, s: string, font: string, spacing = 0): number {
  g.save();
  g.font = font;
  const w = [...s].reduce((a, ch) => a + g.measureText(ch).width, 0) + spacing * (s.length - 1);
  g.restore();
  return w;
}

// ---- chain and ball -------------------------------------------------------------------------

/** A steel ball with a soft key light, for the logo and the machine art. */
export function steelBall(g: Ctx, cx: number, cy: number, r: number): void {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.ellipse(cx + r * 0.1, cy + r * 1.0, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.18, '#d4dbe2');
  gr.addColorStop(0.55, '#6c7782');
  gr.addColorStop(0.85, '#2a323a');
  gr.addColorStop(1, '#14181c');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  // Environment bounce on the lower edge.
  const rim = g.createLinearGradient(0, cy, 0, cy + r);
  rim.addColorStop(0, 'rgba(255,170,90,0)');
  rim.addColorStop(1, 'rgba(255,170,90,0.35)');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * One chain link, centred on the origin and lying along +x: `len` long, `wid` wide, wire
 * `thick`. Side-on links show their ring; edge-on links are a thin bar.
 */
function link(g: Ctx, len: number, wid: number, thick: number, edgeOn: boolean): void {
  const w = edgeOn ? thick * 1.6 : wid;
  const gr = g.createLinearGradient(0, -w / 2, 0, w / 2);
  gr.addColorStop(0, '#e8edf1');
  gr.addColorStop(0.4, '#8b96a1');
  gr.addColorStop(1, '#2d353d');
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(-len / 2, -w / 2, len, w, Math.min(w / 2, len / 2));
  g.lineWidth = thick + 2.5;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.stroke();
  g.lineWidth = thick;
  g.strokeStyle = gr;
  g.stroke();
}

/**
 * A chain along a path given as a function of t in [0, 1]. Links alternate side-on and
 * edge-on and follow the path's tangent.
 */
export function chain(
  g: Ctx,
  at: (t: number) => readonly [number, number],
  count: number,
  len: number,
  thick: number,
): void {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const [x, y] = at(t);
    const [x2, y2] = at(Math.min(1, t + 0.01));
    const [x1, y1] = at(Math.max(0, t - 0.01));
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(y2 - y1, x2 - x1));
    link(g, len, len * 0.62, thick, i % 2 === 1);
    g.restore();
  }
}

/** A hanging catenary: from (x0, y0) to (x1, y1) with a sag in px. */
export const sagPath =
  (x0: number, y0: number, x1: number, y1: number, sag: number) =>
  (t: number): readonly [number, number] =>
    [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag];

// ---- paper ----------------------------------------------------------------------------------

export interface PaperStyle {
  top?: string;
  mid?: string;
  bottom?: string;
  seed: string;
  fibers?: number;
}

/** A sheet of paper over the shape: warm gradient, fibres, grain and a soft edge vignette. */
export function paper(g: Ctx, box: Box, shape: Shape, s: PaperStyle): void {
  const [x, y, w, h] = box;
  g.save();
  shape(g);
  g.fillStyle = vgrad(g, y, y + h, [
    [0, s.top ?? PAL.paperHi],
    [0.5, s.mid ?? PAL.paper],
    [1, s.bottom ?? PAL.paperLo],
  ]);
  g.fill();
  g.clip();
  const rng = new Rng(s.seed);
  const n = s.fibers ?? Math.round((w * h) / 1800);
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const fx = x + rng.next() * w;
    const fy = y + rng.next() * h;
    const a = rng.next() * Math.PI;
    const l = 3 + rng.next() * 9;
    g.strokeStyle = rng.chance(0.5) ? 'rgba(120,90,50,0.07)' : 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx + Math.cos(a) * l, fy + Math.sin(a) * l);
    g.stroke();
  }
  grain(g, box, 0.05, 'multiply');
  // Soft darkening toward the edges.
  const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(120,80,30,0)');
  v.addColorStop(1, 'rgba(120,80,30,0.22)');
  g.fillStyle = v;
  g.fillRect(x, y, w, h);
  g.restore();
}

/** Strip of semi-transparent tape across a corner or an edge, centred on (cx, cy). */
export function tape(g: Ctx, cx: number, cy: number, w: number, h: number, rot: number): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.fillStyle = 'rgba(232,220,170,0.62)';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) g.lineTo(-w / 2 + ((i % 2) * 2 - 1) * -2, -h / 2 + (i / 6) * h);
  g.lineTo(w / 2, h / 2);
  for (let i = 6; i >= 0; i--) g.lineTo(w / 2 + ((i % 2) * 2 - 1) * 2, -h / 2 + (i / 6) * h);
  g.closePath();
  g.fill();
  g.restore();
}

/** A Code-39-ish barcode: width/height in px, deterministic from the seed. */
export function barcode(g: Ctx, [x, y, w, h]: Box, seed: string, color: string): void {
  const rng = new Rng(seed);
  g.save();
  g.fillStyle = color;
  let cx = x;
  while (cx < x + w - 3) {
    const bw = rng.chance(0.4) ? 4 : rng.chance(0.5) ? 2 : 3;
    if (rng.chance(0.62)) g.fillRect(cx, y, Math.min(bw, x + w - cx), h);
    cx += bw + 1;
  }
  g.restore();
}

/** A rubber stamp: a ring or a frame with a word, tilted, in ink at a low alpha. */
export function stamp(
  g: Ctx,
  cx: number,
  cy: number,
  word: string,
  size: number,
  color: string,
  rot: number,
  alpha = 0.55,
): void {
  // Painted on its own layer so the worn-ink flecks only erase the stamp, not the paper.
  const w = measure(g, word, `${size}px ${FONT.stencil}`, size * 0.08) + size * 0.9;
  const pad = size;
  const layer = makeCanvas(Math.ceil(w + pad * 2), Math.ceil(size * 1.5 + pad * 2));
  const l = layer.getContext('2d')!;
  l.translate(layer.width / 2, layer.height / 2);
  l.strokeStyle = color;
  l.lineWidth = Math.max(2, size * 0.09);
  l.beginPath();
  l.roundRect(-w / 2, -size * 0.75, w, size * 1.5, size * 0.18);
  l.stroke();
  l.lineWidth = Math.max(1, size * 0.04);
  l.beginPath();
  l.roundRect(-w / 2 + size * 0.14, -size * 0.61, w - size * 0.28, size * 1.22, size * 0.1);
  l.stroke();
  text(l, word, 0, size * 0.34, {
    font: `${size}px ${FONT.stencil}`,
    fill: color,
    align: 'center',
    spacing: size * 0.08,
  });
  l.globalCompositeOperation = 'destination-out';
  const rng = new Rng(`stamp-${word}`);
  for (let i = 0; i < 40; i++) {
    l.globalAlpha = rng.range(0.25, 0.8);
    l.beginPath();
    l.arc(rng.range(-w / 2, w / 2), rng.range(-size * 0.8, size * 0.8), rng.range(0.6, size * 0.07), 0, Math.PI * 2);
    l.fill();
  }
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.globalAlpha = alpha;
  g.drawImage(layer, -layer.width / 2, -layer.height / 2);
  g.restore();
}
