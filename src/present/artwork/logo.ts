/**
 * The Ball & Chain title logo: hard-edged pixel lettering. BALL in red and CHAIN in teal,
 * staggered with bobbing letters, a steel ball on a chain hanging between them, and an
 * "A PINBALL ROGUELIKE" plate. Painted on a small grid (every glyph thresholded to 0/1 so no
 * pixel is half-lit), then scaled up by a whole number with nearest-neighbour sampling.
 */
import { FONT, makeCanvas, type Ctx } from './kit';

/** The pixel grid the logo is drawn on (before scaling up). */
const GRID_W = 300;
const GRID_H = 170;
const SIZE = 56;
const KERN = -9;
const BOB = [0, -2, 1, -1, 2, -2];
const BALL_R = 15;
const TAGLINE = 'A PINBALL ROGUELIKE';

type Rgb = readonly [number, number, number];

const hex = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

const OUTLINE = hex('#140a1f');
const SHADOW = hex('#2a1640');
const RED = ['#ff5a4a', '#e8302a', '#a8142a', '#ffc2a8'].map(hex);
const TEAL = ['#4fe6d4', '#22b8b0', '#137a86', '#d6fff6'].map(hex);
const LINK_HI = hex('#e4dfee');
const LINK_LO = hex('#7a7290');
const STEEL = ['#2c2638', '#4d4660', '#7c7591', '#b4aec4', '#e9e5f2', '#ffffff'].map(hex);
const PLATE = '#ffd23f';

export function paintLogo(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const art = paintGrid();
  // Crop to the drawn pixels, then scale by the largest whole factor that fits.
  const box = opaqueBox(art);
  const scale = Math.max(1, Math.floor(Math.min(w / box.w, h / box.h)));
  const dw = box.w * scale;
  const dh = box.h * scale;
  g.imageSmoothingEnabled = false;
  g.drawImage(
    art,
    box.x,
    box.y,
    box.w,
    box.h,
    Math.round((w - dw) / 2),
    Math.round((h - dh) / 2),
    dw,
    dh,
  );
}

function paintGrid(): HTMLCanvasElement {
  const w = GRID_W;
  const h = GRID_H;
  const art = makeCanvas(w, h);
  const g = art.getContext('2d', { willReadFrequently: true })!;
  const img = g.createImageData(w, h);
  const px = img.data;

  const set = (x: number, y: number, c: Rgb): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;

  const measure = makeCanvas(8, 8).getContext('2d', { willReadFrequently: true })!;
  measure.font = `700 ${SIZE}px ${FONT.pixel}`;
  const widthOf = (text: string): number =>
    [...text].reduce((a, ch) => a + measure.measureText(ch).width + KERN, -KERN);

  const word = (text: string, x: number, y: number, colors: Rgb[]): void => {
    const m = mask(w, h, (mg) => {
      mg.font = `700 ${SIZE}px ${FONT.pixel}`;
      mg.textBaseline = 'alphabetic';
      let cx = x;
      for (let i = 0; i < text.length; i++) {
        mg.fillText(text[i], Math.round(cx), Math.round(y + BOB[i % BOB.length]));
        cx += mg.measureText(text[i]).width + KERN;
      }
    });
    paintMask(m, w, h, set, colors);
  };

  // BALL and CHAIN staggered; the ball hangs between them.
  const wBall = widthOf('BALL');
  const wChain = widthOf('CHAIN');
  const total = Math.max(wBall + 70, wChain + 60);
  const left = Math.round((w - total) / 2);
  const chainX = left + total - wChain;
  word('BALL', left, 72, RED);
  word('CHAIN', chainX, 140, TEAL);

  // The "&": a steel ball on a chain hanging off the last L.
  const bx = left + Math.round(wBall) + 38;
  const by = 86;
  const ax = left + Math.round(wBall) - 4;
  const ay = 36;
  const links = 7;
  for (let i = 0; i < links; i++) {
    const t = i / (links - 1);
    const lx = Math.round(ax + (bx - ax) * t);
    const ly = Math.round(ay + (by - BALL_R - 4 - ay) * t + Math.sin(t * Math.PI) * 6);
    const tall = i % 2 === 0;
    const rx = tall ? 3 : 5;
    const ry = tall ? 5 : 3;
    for (let yy = -ry - 1; yy <= ry + 1; yy++)
      for (let xx = -rx - 1; xx <= rx + 1; xx++) {
        const e = (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry);
        if (e <= 1.25 && e >= 0.35) set(lx + xx, ly + yy, xx + yy < 0 ? LINK_HI : LINK_LO);
        else if (e < 2.1 && e > 1.25) set(lx + xx, ly + yy, OUTLINE);
      }
  }
  for (let yy = -BALL_R - 1; yy <= BALL_R + 1; yy++)
    for (let xx = -BALL_R - 1; xx <= BALL_R + 1; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > BALL_R + 1.2) continue;
      if (d > BALL_R) {
        set(bx + xx, by + yy, OUTLINE);
        continue;
      }
      // Lit from the upper left, brighter toward the middle.
      const l = (-xx * 0.55 - yy * 0.8) / BALL_R;
      const k = Math.max(0, Math.min(5, Math.round((l + 1) * 2.4 + (1 - d / BALL_R) * 1.2)));
      set(bx + xx, by + yy, STEEL[k]);
    }
  for (let yy = -BALL_R; yy <= BALL_R; yy++)
    for (let xx = -BALL_R; xx <= BALL_R; xx++)
      if (Math.hypot(xx, yy) <= BALL_R && !filled(bx + xx + 3, by + yy + 4))
        set(bx + xx + 3, by + yy + 4, SHADOW);

  // The tagline on a gold plate, its text thresholded like the words.
  g.putImageData(img, 0, 0);
  g.font = `400 8px ${FONT.pixelSmall}`;
  g.textBaseline = 'top';
  const tw = Math.ceil(g.measureText(TAGLINE).width);
  const tx = Math.round((w - tw) / 2);
  const ty = 160;
  g.fillStyle = `rgb(${OUTLINE.join(',')})`;
  g.fillRect(tx - 4, ty - 4, tw + 8, 16);
  g.fillStyle = PLATE;
  g.fillRect(tx - 3, ty - 3, tw + 6, 14);
  const tm = mask(w, h, (mg) => {
    mg.font = `400 8px ${FONT.pixelSmall}`;
    mg.textBaseline = 'top';
    mg.fillText(TAGLINE, tx, ty);
  });
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++)
    if (tm[i]) {
      d.data[i * 4] = OUTLINE[0];
      d.data[i * 4 + 1] = OUTLINE[1];
      d.data[i * 4 + 2] = OUTLINE[2];
      d.data[i * 4 + 3] = 255;
    }
  g.putImageData(d, 0, 0);
  return art;
}

/** Draw into a scratch canvas and threshold its alpha to a hard 0/1 mask. */
function mask(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Uint8Array {
  const g = makeCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return out;
}

/** A glyph mask: hard drop shadow, 1px outline, a lit top row and three bands down the face. */
function paintMask(
  m: Uint8Array,
  w: number,
  h: number,
  set: (x: number, y: number, c: Rgb) => void,
  [top, mid, bot, hi]: Rgb[],
): void {
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (at(x - 3, y - 4) || at(x - 2, y - 3)) set(x, y, SHADOW);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (at(x, y)) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && at(x + dx, y + dy)) {
            set(x, y, OUTLINE);
            dy = 2;
            break;
          }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      let up = 0;
      while (at(x, y - up - 1)) up++;
      let down = 0;
      while (at(x, y + down + 1)) down++;
      const k = up / Math.max(1, up + down);
      set(x, y, up === 0 ? hi : k < 0.42 ? top : k < 0.75 ? mid : bot);
    }
}

/** The bounding box of the opaque pixels. */
function opaqueBox(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const d = c
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: c.width, h: c.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
