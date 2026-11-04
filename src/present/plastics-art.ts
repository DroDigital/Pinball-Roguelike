/**
 * Printed art for everything raised above the playfield: the top faces of the blocks, aprons
 * and the cabinet frame ("plastics"), the sling plates, the drop-target faces, the spinner
 * and the cabinet sides. The plastics sheet shares table coordinates with the playfield, but
 * covers a larger rectangle so the frame around the field can carry art too.
 */
import { TABLE } from '../content/table';
import {
  FONT_STENCIL,
  PALETTE as P,
  drawWarden,
  hazard,
  polygon,
  roundRect,
  skull,
  star,
  text,
  unitSpace,
  type Ctx,
} from './art-kit';

export const PLASTIC_PX = 40;
/** Table-space rectangle the plastics sheet covers. */
export const PLASTIC_RECT = { x0: -2.4, y0: -4.4, w: TABLE.width + 4.8, h: TABLE.height + 6.2 };

export function plasticUv(x: number, y: number, out: [number, number]): [number, number] {
  out[0] = (x - PLASTIC_RECT.x0) / PLASTIC_RECT.w;
  out[1] = (y - PLASTIC_RECT.y0) / PLASTIC_RECT.h;
  return out;
}

export function paintPlastics(canvas: HTMLCanvasElement): void {
  const PX = PLASTIC_PX;
  const W = Math.ceil(PLASTIC_RECT.w * PX);
  const H = Math.ceil(PLASTIC_RECT.h * PX);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  unitSpace(g, PX, H, PLASTIC_RECT.x0, PLASTIC_RECT.y0);
  const T = (
    s: string,
    x: number,
    y: number,
    size: number,
    o: Partial<Parameters<typeof text>[5]> = {},
  ) => text(g, PX, s, x, y, { size, stroke: P.ink, strokeW: size * 0.2, ...o });

  // Default: glossy enamel everywhere, so any top face without bespoke art still looks printed.
  g.fillStyle = '#0d1431';
  g.fillRect(PLASTIC_RECT.x0, PLASTIC_RECT.y0, PLASTIC_RECT.w, PLASTIC_RECT.h);

  const wall = (id: string) => TABLE.walls.find((w) => w.id === id);

  // ---- cabinet frame: navy with orange and cream pinstripes along both edges
  const cab = wall('cabinet');
  if (cab) {
    g.fillStyle = '#10183c';
    g.fillRect(PLASTIC_RECT.x0, PLASTIC_RECT.y0, PLASTIC_RECT.w, PLASTIC_RECT.h);
    g.lineJoin = 'round';
    for (const [w, col] of [
      [0.16, P.orange],
      [0.05, P.cream],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      polygon(g, cab.pts);
      g.stroke();
    }
    const pad = 1.6;
    const x0 = -pad;
    const x1 = TABLE.width + pad;
    const yb = -pad - 2;
    for (const [w, col, inset] of [
      [0.14, P.orange, 0.32],
      [0.05, P.cream, 0.6],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0 + inset, TABLE.height - 8);
      g.lineTo(x0 + inset, yb + inset);
      g.lineTo(x1 - inset, yb + inset);
      g.lineTo(x1 - inset, TABLE.height - 8);
      g.stroke();
    }
    // Apron card strip along the front edge: price and instruction cards.
    cards(g, PX);
  }

  // ---- aprons: red enamel plates with hazard edges
  for (const id of ['apronL', 'apronR']) {
    const w = wall(id);
    if (!w) continue;
    g.save();
    polygon(g, w.pts);
    g.clip();
    const xs = w.pts.map((p) => p[0]);
    const ys = w.pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const gr = g.createLinearGradient(x0, y1, x1, y0);
    gr.addColorStop(0, '#c4161c');
    gr.addColorStop(1, '#7a0b14');
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Guide edge: yellow/black hazard band along the top.
    g.beginPath();
    g.rect(x0, y1 - 1.1, x1 - x0, 1.1);
    hazard(g, x0, y1 - 1.1, x1, y1, P.yellow, P.ink, 0.45, 1);
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0 - 1.15);
    g.restore();
    g.save();
    polygon(g, w.pts);
    g.lineWidth = 0.14;
    g.strokeStyle = P.cream;
    g.stroke();
    g.restore();
    const cx = (x0 + x1) / 2;
    T(id === 'apronL' ? 'NO REFUNDS' : 'PAY UP', cx, (y0 + y1) / 2 - 0.4, 0.95, {
      rot: Math.PI / 2,
      fill: P.cream,
      spacing: 0.08,
      font: FONT_STENCIL,
    });
    skull(g, cx, y1 - 3.0, 0.8, P.cream, P.ink);
  }

  // ---- flanks, the chute fill and the cell roof: navy plates with printed trim
  for (const [id, label, accent] of [
    ['flankL', '', P.orange],
    ['flankR', 'GUARDS ONLY', P.yellow],
    ['chuteFill', '', P.orange],
    ['cellRoof', 'CELL BLOCK', P.jade],
    ['holeBlock', '', P.red],
  ] as const) {
    const w = wall(id);
    if (!w) continue;
    g.save();
    polygon(g, w.pts);
    g.clip();
    const xs = w.pts.map((p) => p[0]);
    const ys = w.pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const gr = g.createLinearGradient(x0, y1, x1, y0);
    gr.addColorStop(0, id === 'holeBlock' ? '#9c1418' : '#1c2f78');
    gr.addColorStop(1, id === 'holeBlock' ? '#5a0a10' : '#0c1646');
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Diagonal pinstripes.
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 0.1;
    for (let s = -(y1 - y0); s < x1 - x0 + 2; s += 0.55) {
      g.beginPath();
      g.moveTo(x0 + s, y0);
      g.lineTo(x0 + s + (y1 - y0), y1);
      g.stroke();
    }
    if (id === 'chuteFill' || id === 'flankL') {
      // Watching eye.
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      eye(g, cx, cy, id === 'flankL' ? 0.55 : 0.9);
    }
    if (id === 'flankR') {
      const cx = (x0 + x1) / 2 + 1;
      const cy = (y0 + y1) / 2 - 0.4;
      drawWarden(g, cx, cy, 2.2, true);
    }
    if (id === 'holeBlock') {
      const cx = (x0 + x1) / 2;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(g, cx - 1.3, y1 - 1.5, 2.6, 0.9, 0.2);
      g.fill();
      T('HOLE', cx, y1 - 1.05, 0.7, { fill: P.yellow, spacing: 0.2, font: FONT_STENCIL });
    }
    if (id === 'cellRoof') {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = x0; x < x1; x += 0.7) g.fillRect(x, y0, 0.14, y1 - y0);
    }
    g.restore();
    g.save();
    polygon(g, w.pts);
    g.lineWidth = 0.14;
    g.strokeStyle = accent;
    g.stroke();
    g.lineWidth = 0.05;
    g.strokeStyle = P.cream;
    g.stroke();
    g.restore();
    if (label) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      T(label, cx, cy, 0.5, { fill: P.cream, spacing: 0.1, rot: id === 'cellRoof' ? 0.5 : 0 });
    }
  }

  // ---- sling plates: red translucent plastic, printed arrow chevrons toward the kick face
  for (const s of TABLE.slings) {
    g.save();
    polygon(g, [s.a, s.b, s.c]);
    g.clip();
    const cx = (s.a[0] + s.b[0] + s.c[0]) / 3;
    const cy = (s.a[1] + s.b[1] + s.c[1]) / 3;
    const gr = g.createLinearGradient(s.c[0], s.c[1], (s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
    gr.addColorStop(0, '#ff8a3a');
    gr.addColorStop(1, '#d4141a');
    g.fillStyle = gr;
    g.fillRect(cx - 4, cy - 6, 8, 12);
    // Kick direction chevrons (from the back corner toward the face midpoint).
    const dx = (s.a[0] + s.b[0]) / 2 - s.c[0];
    const dy = (s.a[1] + s.b[1]) / 2 - s.c[1];
    const ang = Math.atan2(dy, dx);
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate(
        cx - Math.cos(ang) * 0.5 + Math.cos(ang) * k * 0.42,
        cy - Math.sin(ang) * 0.5 + Math.sin(ang) * k * 0.42,
      );
      g.rotate(ang);
      g.strokeStyle = P.cream;
      g.lineWidth = 0.12;
      g.beginPath();
      g.moveTo(-0.15, 0.4);
      g.lineTo(0.15, 0);
      g.lineTo(-0.15, -0.4);
      g.stroke();
      g.restore();
    }
    g.restore();
    g.save();
    polygon(g, [s.a, s.b, s.c]);
    g.lineWidth = 0.1;
    g.strokeStyle = P.cream;
    g.stroke();
    g.restore();
  }
}

function eye(g: Ctx, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(-r, 0);
  g.quadraticCurveTo(0, r * 1.1, r, 0);
  g.quadraticCurveTo(0, -r * 1.1, -r, 0);
  g.closePath();
  g.fillStyle = P.cream;
  g.fill();
  g.lineWidth = r * 0.12;
  g.strokeStyle = P.ink;
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  g.fillStyle = P.red;
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  g.fillStyle = P.ink;
  g.fill();
  g.restore();
}

/** Instruction cards and the price plate on the front of the cabinet frame. */
function cards(g: Ctx, px: number): void {
  const y = -1.85;
  const card = (x: number, w: number, bg: string, fg: string, lines: [string, number][]) => {
    roundRect(g, x - w / 2, y - 0.52, w, 1.04, 0.1);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 0.05;
    g.strokeStyle = P.ink;
    g.stroke();
    let ly = y + 0.14 * (lines.length - 1);
    for (const [s, size] of lines) {
      text(g, px, s, x, ly, { size, fill: fg, font: FONT_STENCIL });
      ly -= 0.34;
    }
  };
  card(3.6, 5.0, P.cream, P.ink, [
    ['PAY THE WARDEN', 0.34],
    ['1 BALL FREE EACH ROUND', 0.22],
  ]);
  card(9.95, 4.0, P.yellow, P.ink, [
    ["DEBTOR'S PRISON", 0.36],
    ['SOLID STATE  1979', 0.2],
  ]);
  card(16.3, 4.6, P.red, P.cream, [
    ['NO REFUNDS', 0.4],
    ['NO EXCUSES', 0.24],
  ]);
}

/** A cell door for one drop target: bars, a number plate and a keyhole. */
export function paintDropFace(canvas: HTMLCanvasElement, n: number): void {
  const W = (canvas.width = 192);
  const H = (canvas.height = 128);
  const g = canvas.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#22d08a');
  bg.addColorStop(1, '#0c7a55');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(8,24,30,0.9)';
  for (let x = 20; x < W - 10; x += 26) g.fillRect(x, 8, 8, H - 40);
  g.fillRect(8, 22, W - 16, 7);
  g.fillRect(8, H - 44, W - 16, 7);
  g.fillStyle = P.cream;
  g.fillRect(0, H - 34, W, 34);
  g.fillStyle = P.ink;
  g.font = '28px "Bebas Neue", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`CELL ${'ABC'[n] ?? n + 1}`, W / 2, H - 16);
  g.lineWidth = 6;
  g.strokeStyle = P.ink;
  g.strokeRect(3, 3, W - 6, H - 6);
}

/** The searchlight spinner: hazard chevrons around a lamp. */
export function paintSpinnerFace(canvas: HTMLCanvasElement): void {
  const W = (canvas.width = 192);
  const H = (canvas.height = 96);
  const g = canvas.getContext('2d')!;
  g.fillStyle = P.yellow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = P.ink;
  for (let x = -H; x < W + H; x += 36) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 18, 0);
    g.lineTo(x + 18 + H * 0.6, H);
    g.lineTo(x + H * 0.6, H);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 8;
  g.strokeStyle = P.ink;
  g.strokeRect(4, 4, W - 8, H - 8);
}

/** Cabinet side art: a flaming sunburst, chain links and the machine's name. */
export function paintCabinetSide(canvas: HTMLCanvasElement, flip: boolean): void {
  const W = (canvas.width = 1536);
  const H = (canvas.height = 210);
  const g = canvas.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#142260');
  bg.addColorStop(1, '#0a1038');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  if (flip) {
    g.translate(W, 0);
    g.scale(-1, 1);
  }
  // Flame tongues sweeping from the front (right) to the back.
  for (let i = 0; i < 8; i++) {
    const y = 38 + i * 19;
    const len = 380 + ((i * 97) % 5) * 110;
    const gr = g.createLinearGradient(W, y, W - len, y);
    gr.addColorStop(0, i % 2 ? '#ffb41e' : '#ff6a1a');
    gr.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(W, y);
    g.bezierCurveTo(W - len * 0.4, y - 30, W - len * 0.7, y + 18, W - len, y - 6);
    g.bezierCurveTo(W - len * 0.7, y + 40, W - len * 0.4, y + 12, W, y + 26);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 6;
  g.strokeStyle = P.cream;
  g.beginPath();
  g.moveTo(0, 22);
  g.lineTo(W, 22);
  g.moveTo(0, H - 22);
  g.lineTo(W, H - 22);
  g.stroke();
  g.strokeStyle = P.orange;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(0, 36);
  g.lineTo(W, 36);
  g.moveTo(0, H - 36);
  g.lineTo(W, H - 36);
  g.stroke();
  g.restore();
  g.font = '104px "Saira Stencil One", "Bebas Neue", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = P.ink;
  g.strokeText("DEBTOR'S PRISON", W / 2, H / 2 + 4);
  g.fillStyle = P.cream;
  g.fillText("DEBTOR'S PRISON", W / 2, H / 2 + 4);
}

/** Cabinet front: navy lacquer, flame tongues from both ends and cream/orange pinstripes. */
export function paintCabinetFront(canvas: HTMLCanvasElement): void {
  const W = (canvas.width = 1536);
  const H = (canvas.height = 400);
  const g = canvas.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a2a78');
  bg.addColorStop(1, '#0a1036');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (const flip of [false, true]) {
    g.save();
    if (flip) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    for (let i = 0; i < 7; i++) {
      const y = 70 + i * 40;
      const len = 170 + ((i * 53) % 4) * 70;
      const gr = g.createLinearGradient(0, y, len, y);
      gr.addColorStop(0, i % 2 ? '#ffb41e' : '#ff6a1a');
      gr.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(len * 0.4, y - 26, len * 0.7, y + 14, len, y - 4);
      g.bezierCurveTo(len * 0.7, y + 32, len * 0.4, y + 12, 0, y + 24);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  for (const [w, col, y] of [
    [12, P.orange, 26],
    [5, P.cream, 46],
    [12, P.orange, H - 26],
    [5, P.cream, H - 46],
  ] as const) {
    g.fillStyle = col;
    g.fillRect(0, y - w / 2, W, w);
  }
}

/** Band around the playfield frame (the wall above the cabinet body): pinstripes and a legend. */
export function paintFrameBand(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  legend: string,
): void {
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1a2c78');
  bg.addColorStop(1, '#0a1138');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (const [y, t, col] of [
    [0.16, 0.1, P.orange],
    [0.3, 0.04, P.cream],
    [0.84, 0.1, P.orange],
    [0.7, 0.04, P.cream],
  ] as const) {
    g.fillStyle = col;
    g.fillRect(0, (y - t / 2) * h, w, t * h);
  }
  g.font = `${h * 0.4}px ${FONT_STENCIL}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = h * 0.08;
  g.strokeStyle = P.ink;
  g.strokeText(legend, w / 2, h / 2 + h * 0.02);
  g.fillStyle = P.cream;
  g.fillText(legend, w / 2, h / 2 + h * 0.02);
  const half = g.measureText(legend).width / 2 + h * 0.5;
  g.fillStyle = P.amber;
  for (const dx of [-half, half]) {
    star(g, w / 2 + dx, h / 2, h * 0.14, h * 0.06);
    g.fill();
  }
}
