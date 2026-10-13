/**
 * The backglass. The art pack's print is the base; the shot-level ladders are drawn live on
 * its quiet lower strip so the player can read their build from the seat. Until the print has
 * decoded, the old procedural art (a chained devil, eyes, keys, guards behind bars) stands in,
 * with its ladders along the bottom.
 */
import { BACKGLASS_LEVEL_RECT } from '../content/art';
import { readyArt } from './art';

const SHOTS = ['yard', 'sling', 'lanes', 'cellblock', 'chute', 'perimeter', 'searchlight', 'hole'];
const LABEL: Record<string, string> = {
  yard: 'YARD',
  sling: 'SLING',
  lanes: 'LANES',
  cellblock: 'CELLS',
  chute: 'CHUTE',
  perimeter: 'PERIM',
  searchlight: 'LIGHT',
  hole: 'HOLE',
};

/** Texture size: 2:1 like the print (1774 x 887) and the glass plane. Fixed, so it can be repainted in place. */
export const GLASS_W = 1024;
export const GLASS_H = 512;

/** The print scaled to texture size, made once when it has decoded. */
let print: HTMLCanvasElement | null = null;

function printBase(): HTMLCanvasElement | null {
  if (print) return print;
  const img = readyArt('machine/backglass');
  if (!img) return null;
  print = document.createElement('canvas');
  print.width = GLASS_W;
  print.height = GLASS_H;
  const g = print.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, GLASS_W, GLASS_H);
  return print;
}

export function paintBackglass(c: HTMLCanvasElement, levels: Record<string, number> | null): void {
  if (c.width !== GLASS_W || c.height !== GLASS_H) {
    c.width = GLASS_W;
    c.height = GLASS_H;
  }
  const g = c.getContext('2d')!;
  const base = printBase();
  if (base) {
    g.clearRect(0, 0, GLASS_W, GLASS_H);
    g.drawImage(base, 0, 0);
    paintLevels(g, levels);
  } else {
    g.save();
    g.scale(GLASS_W / 256, GLASS_H / 128);
    paintProcedural(g, levels);
    g.restore();
  }
}

/** The live ladders on the print's quiet lower strip: one column per shot, a bar per level. */
function paintLevels(g: CanvasRenderingContext2D, levels: Record<string, number> | null): void {
  const [rx, ry, rw, rh] = BACKGLASS_LEVEL_RECT;
  const x0 = rx * GLASS_W;
  const y0 = ry * GLASS_H;
  const w = rw * GLASS_W;
  const h = rh * GLASS_H;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.roundRect(x0, y0, w, h, 8);
  g.fill();
  const colW = w / SHOTS.length;
  const bar = { w: 15, h: 17, gap: 5 };
  const ladder = 5 * bar.w + 4 * bar.gap;
  g.textAlign = 'center';
  SHOTS.forEach((s, i) => {
    const lv = levels?.[s] ?? 1;
    const cx = x0 + colW * i + colW / 2;
    for (let k = 0; k < 5; k++) {
      g.fillStyle = lv >= k + 2 ? '#ffd050' : 'rgba(242,223,178,0.14)';
      g.fillRect(cx - ladder / 2 + k * (bar.w + bar.gap), y0 + 7, bar.w, bar.h);
    }
    g.font = '600 15px Oswald, "Arial Narrow", sans-serif';
    g.fillStyle = 'rgba(242,223,178,0.9)';
    g.fillText(LABEL[s], cx, y0 + h - 7);
    if (lv > 6) {
      g.font = 'bold 14px "Courier New", monospace';
      g.fillStyle = '#ffd050';
      g.textAlign = 'left';
      g.fillText(`+${lv - 6}`, cx + ladder / 2 + 4, y0 + 7 + bar.h - 2);
      g.textAlign = 'center';
    }
  });
}

/** The stand-in art (and its ladders) drawn in a 256 x 128 space while the print loads. */
function paintProcedural(g: CanvasRenderingContext2D, levels: Record<string, number> | null): void {
  const W = 256;
  const H = 128;
  // Smoky red-black ground.
  const grad = g.createRadialGradient(W / 2, H * 0.45, 8, W / 2, H * 0.45, W * 0.7);
  grad.addColorStop(0, '#7a1c10');
  grad.addColorStop(0.5, '#3a0c08');
  grad.addColorStop(1, '#0c0403');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Prison bars.
  g.fillStyle = 'rgba(20,12,10,0.8)';
  for (let x = 8; x < W; x += 22) g.fillRect(x, 0, 4, H * 0.72);
  // The chained devil: horns, slit eyes, a grin, chains to both corners.
  const cx = W / 2;
  const cy = 46;
  g.fillStyle = '#b8261a';
  g.beginPath();
  g.ellipse(cx, cy, 30, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx - 24, cy - 14);
  g.lineTo(cx - 40, cy - 40);
  g.lineTo(cx - 14, cy - 22);
  g.moveTo(cx + 24, cy - 14);
  g.lineTo(cx + 42, cy - 38);
  g.lineTo(cx + 14, cy - 22);
  g.fill();
  g.fillStyle = '#ffd040';
  g.fillRect(cx - 18, cy - 6, 12, 4);
  g.fillRect(cx + 7, cy - 7, 12, 4);
  g.fillStyle = '#100404';
  g.fillRect(cx - 13, cy - 6, 2, 4);
  g.fillRect(cx + 12, cy - 7, 2, 4);
  g.beginPath();
  g.moveTo(cx - 14, cy + 9);
  g.quadraticCurveTo(cx, cy + 22, cx + 15, cy + 8);
  g.lineTo(cx, cy + 14);
  g.fill();
  g.strokeStyle = '#a8a098';
  g.lineWidth = 2;
  for (const [x0, y0, x1, y1] of [
    [cx - 28, cy + 10, 10, 96],
    [cx + 28, cy + 10, W - 10, 96],
  ]) {
    for (let i = 0; i <= 8; i++) {
      const x = x0 + ((x1 - x0) * i) / 8;
      const y = y0 + ((y1 - y0) * i) / 8;
      g.beginPath();
      g.ellipse(x, y, 4, 2.5, Math.atan2(y1 - y0, x1 - x0) + (i % 2) * 1.2, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Watching eyes in the dark corners; keys hanging out of reach.
  g.fillStyle = '#e8e0c0';
  for (const [x, y] of [
    [26, 18],
    [W - 30, 22],
    [40, 60],
    [W - 44, 58],
  ]) {
    g.beginPath();
    g.ellipse(x, y, 5, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#100404';
    g.fillRect(x - 1, y - 2, 2, 4);
    g.fillStyle = '#e8e0c0';
  }
  g.strokeStyle = '#d8b040';
  g.lineWidth = 2;
  for (const x of [70, W - 70]) {
    g.beginPath();
    g.arc(x, 14, 4, 0, Math.PI * 2);
    g.moveTo(x, 18);
    g.lineTo(x, 30);
    g.lineTo(x + 4, 30);
    g.moveTo(x, 26);
    g.lineTo(x + 3, 26);
    g.stroke();
  }
  // Title, hand-lettered and slightly crooked.
  g.save();
  g.translate(cx, 84);
  g.rotate(-0.025);
  g.font = 'bold 15px Georgia, serif';
  g.textAlign = 'center';
  g.fillStyle = '#100404';
  g.fillText("DEBTOR'S PRISON", 2, 2);
  g.fillStyle = '#f0c040';
  g.fillText("DEBTOR'S PRISON", 0, 0);
  g.restore();
  // Shot level ladders.
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(0, 92, W, H - 92);
  const colW = W / SHOTS.length;
  g.font = 'bold 7px monospace';
  g.textAlign = 'center';
  SHOTS.forEach((s, i) => {
    const lv = levels?.[s] ?? 1;
    const x = colW * i + colW / 2;
    g.fillStyle = '#c8b890';
    g.fillText(LABEL[s], x, 124);
    for (let k = 0; k < 5; k++) {
      const lit = lv >= k + 2;
      g.fillStyle = lit ? '#ffd050' : '#3a2a18';
      g.fillRect(x - 9 + k * 4, 104 - 0, 3, 8 + k * 0);
    }
    if (lv > 6) {
      g.fillStyle = '#ffd050';
      g.fillText(`+${lv - 6}`, x, 100);
    }
  });
}
