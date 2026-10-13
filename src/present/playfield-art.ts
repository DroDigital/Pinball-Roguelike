/**
 * Procedural playfield artwork for DEBTOR'S PRISON, painted on a 2D canvas: grimy wood,
 * occult-prison motifs (a chained devil, eyes, keys, guards), shot labels and insert sockets.
 * Deliberately crude and a little wrong, like a cheap 70s screen print.
 */
import { PLAYFIELD_ART } from '../content/art';
import { TABLE } from '../content/table';
import { Rng } from '../core/rng';
import type { LampDef } from '../sim/table-def';

export const ART_PX = 32; // pixels per table unit

type Ctx = CanvasRenderingContext2D;

export function paintPlayfield(
  canvas: HTMLCanvasElement,
  art: HTMLImageElement | null = null,
): void {
  const W = Math.ceil(TABLE.width * ART_PX);
  const H = Math.ceil(TABLE.height * ART_PX);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const rng = new Rng('playfield-art');
  const X = (x: number) => x * ART_PX;
  const Y = (y: number) => H - y * ART_PX;

  // Base: stained wood with streaks.
  g.fillStyle = '#3a2618';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, W);
    g.strokeStyle = `rgba(${rng.int(20, 60)},${rng.int(10, 30)},${rng.int(5, 15)},${rng.range(0.05, 0.2)})`;
    g.lineWidth = rng.range(1, 4);
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(
      x + rng.range(-30, 30),
      H * 0.3,
      x + rng.range(-30, 30),
      H * 0.6,
      x + rng.range(-20, 20),
      H,
    );
    g.stroke();
  }

  // Painted fields: a dark central band, rust-red lower area, sickly green top.
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(40,70,40,0.55)');
  grad.addColorStop(0.35, 'rgba(25,20,30,0.6)');
  grad.addColorStop(0.7, 'rgba(90,20,15,0.55)');
  grad.addColorStop(1, 'rgba(60,15,10,0.7)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  if (art) {
    // The printed illustration: native aspect ratio, centred on the pack's suggested spot.
    const w = PLAYFIELD_ART.width * ART_PX;
    const h = (w * art.naturalHeight) / art.naturalWidth;
    g.save();
    g.globalAlpha = PLAYFIELD_ART.alpha;
    g.imageSmoothingQuality = 'high';
    g.drawImage(art, X(PLAYFIELD_ART.centerX) - w / 2, Y(PLAYFIELD_ART.centerY) - h / 2, w, h);
    g.restore();
  } else {
    // Prison bars motif behind the Yard.
    g.strokeStyle = 'rgba(10,8,8,0.55)';
    g.lineWidth = 6;
    for (let x = 9.8; x < 17; x += 0.9) {
      g.beginPath();
      g.moveTo(X(x), Y(25));
      g.lineTo(X(x), Y(35.5));
      g.stroke();
    }
    // The chained devil in the lower centre (between slings), crude and staring.
    drawDevil(g, X(9.2), Y(15.8), ART_PX * 2.6);
    // Chains across the lower playfield.
    drawChain(g, X(3.6), Y(14.2), X(14.8), Y(14.2), rng);
  }
  // Eyes watching from the upper left and around the Hole.
  drawEye(g, X(4.2), Y(31.5), 26);
  drawEye(g, X(6.2), Y(33.4), 18);
  drawEye(g, X(3.4), Y(34.6), 14);
  // Keys near the Hole and in the lanes area (the illustration has its own).
  if (!art) {
    drawKey(g, X(5.0), Y(19.6), 0.6);
    drawKey(g, X(13.5), Y(17.2), -0.5);
  }
  // Guards' silhouettes on the flanks.
  drawGuard(g, X(1.4), Y(26.0), 46);
  drawGuard(g, X(16.2), Y(26.5), 46);

  // Shot labels.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  label(g, 'THE CHUTE', X(3.2), Y(20.5), -1.2, 15);
  label(g, 'THE HOLE', X(7.9), Y(21.3), 0, 15);
  label(g, 'CELL BLOCK', X(12.6), Y(18.0), -0.52, 14);
  label(g, 'PERIMETER', X(15.6), Y(16.6), 1.0, 13);
  label(g, 'PERIMETER', X(3.4), Y(16.2), -0.95, 13);
  label(g, 'THE YARD', X(12.8), Y(24.4), 0, 14);
  label(g, 'ROLL CALL', X(14.4), Y(31.6), 0.45, 12);

  // Apron title.
  g.font = `bold ${Math.round(ART_PX * 0.95)}px Georgia, serif`;
  g.fillStyle = 'rgba(210,170,90,0.9)';
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.lineWidth = 4;
  g.strokeText("DEBTOR'S PRISON", X(9.2), Y(10.6));
  g.fillText("DEBTOR'S PRISON", X(9.2), Y(10.6));
  g.font = `${Math.round(ART_PX * 0.42)}px Georgia, serif`;
  g.fillStyle = 'rgba(200,150,80,0.8)';
  g.fillText('PAY OR FALL', X(9.2), Y(9.7));

  // Insert sockets: dark holes the lamp meshes sit in.
  for (const l of TABLE.lamps) socket(g, l, X(l.x), Y(l.y));

  // Grime: scuffs, ball trails around the flippers and under the Yard.
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    g.fillStyle = `rgba(0,0,0,${rng.range(0.03, 0.12)})`;
    g.fillRect(x, y, rng.range(1, 6), rng.range(1, 6));
  }
  g.strokeStyle = 'rgba(200,200,190,0.05)';
  g.lineWidth = 10;
  for (const [cx, cy] of [
    [7.2, 6.5],
    [11.2, 6.5],
    [12.7, 29.5],
  ]) {
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(X(cx), Y(cy), ART_PX * (1.4 + k * 0.6), 0, Math.PI * 2);
      g.stroke();
    }
  }
}

function label(g: Ctx, text: string, x: number, y: number, rot: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `bold ${Math.round((size / 32) * ART_PX)}px "Courier New", monospace`;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillText(text, 2, 2);
  g.fillStyle = 'rgba(225,200,150,0.85)';
  g.fillText(text, 0, 0);
  g.restore();
}

function socket(g: Ctx, l: LampDef, x: number, y: number): void {
  const s = l.size * ART_PX;
  g.save();
  g.translate(x, y);
  g.rotate((-l.rot * Math.PI) / 180);
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.strokeStyle = 'rgba(190,160,110,0.6)';
  g.lineWidth = 2;
  shapePath(g, l.shape, s * 1.15);
  g.fill();
  g.stroke();
  g.restore();
}

export function shapePath(g: Ctx, shape: LampDef['shape'], s: number): void {
  g.beginPath();
  switch (shape) {
    case 'circle':
      g.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      break;
    case 'arrow':
      g.moveTo(s * 0.7, 0);
      g.lineTo(-s * 0.5, s * 0.45);
      g.lineTo(-s * 0.25, 0);
      g.lineTo(-s * 0.5, -s * 0.45);
      g.closePath();
      break;
    case 'triangle':
      g.moveTo(s * 0.6, 0);
      g.lineTo(-s * 0.45, s * 0.5);
      g.lineTo(-s * 0.45, -s * 0.5);
      g.closePath();
      break;
    case 'rect':
      g.rect(-s * 0.5, -s * 0.3, s, s * 0.6);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.28 : s * 0.65;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      break;
    case 'key':
      g.arc(-s * 0.3, 0, s * 0.25, 0, Math.PI * 2);
      g.rect(-s * 0.1, -s * 0.08, s * 0.7, s * 0.16);
      break;
  }
}

function drawDevil(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(120,20,15,0.75)';
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 3;
  // Head
  g.beginPath();
  g.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Horns (uneven, a little wrong)
  g.beginPath();
  g.moveTo(-s * 0.3, -s * 0.35);
  g.quadraticCurveTo(-s * 0.65, -s * 0.85, -s * 0.2, -s * 1.0);
  g.quadraticCurveTo(-s * 0.35, -s * 0.6, -s * 0.12, -s * 0.45);
  g.moveTo(s * 0.28, -s * 0.38);
  g.quadraticCurveTo(s * 0.75, -s * 0.7, s * 0.32, -s * 0.95);
  g.quadraticCurveTo(s * 0.4, -s * 0.6, s * 0.1, -s * 0.45);
  g.fill();
  g.stroke();
  // Eyes
  g.fillStyle = 'rgba(240,210,80,0.95)';
  g.beginPath();
  g.ellipse(-s * 0.16, -s * 0.08, s * 0.09, s * 0.05, -0.3, 0, Math.PI * 2);
  g.ellipse(s * 0.17, -s * 0.1, s * 0.07, s * 0.05, 0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  g.fillRect(-s * 0.17, -s * 0.12, s * 0.03, s * 0.08);
  g.fillRect(s * 0.16, -s * 0.13, s * 0.03, s * 0.08);
  // Grin
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.beginPath();
  g.moveTo(-s * 0.22, s * 0.18);
  g.quadraticCurveTo(0, s * 0.36, s * 0.24, s * 0.16);
  g.stroke();
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(i * s * 0.06, s * 0.22 + Math.abs(i) * -s * 0.015);
    g.lineTo(i * s * 0.06, s * 0.27);
    g.stroke();
  }
  // Shackle collar
  g.strokeStyle = 'rgba(150,150,150,0.8)';
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(0, s * 0.52, s * 0.32, s * 0.1, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawChain(g: Ctx, x0: number, y0: number, x1: number, y1: number, rng: Rng): void {
  const n = 18;
  g.strokeStyle = 'rgba(150,145,140,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const sag = Math.sin(t * Math.PI) * 26;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + sag;
    g.beginPath();
    g.ellipse(x, y, 9, 5 + rng.range(-1, 1), i % 2 ? 0.2 : 1.4, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawEye(g: Ctx, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = 'rgba(220,210,180,0.75)';
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x - r, y);
  g.quadraticCurveTo(x, y - r * 0.8, x + r, y);
  g.quadraticCurveTo(x, y + r * 0.8, x - r, y);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(120,20,10,0.9)';
  g.beginPath();
  g.arc(x + r * 0.1, y, r * 0.38, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(x + r * 0.12, y, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawKey(g: Ctx, x: number, y: number, rot: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = 'rgba(200,170,60,0.7)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(-20, 0, 11, 0, Math.PI * 2);
  g.moveTo(-9, 0);
  g.lineTo(26, 0);
  g.moveTo(18, 0);
  g.lineTo(18, 9);
  g.moveTo(24, 0);
  g.lineTo(24, 7);
  g.stroke();
  g.restore();
}

function drawGuard(g: Ctx, x: number, y: number, h: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(15,15,20,0.6)';
  g.beginPath();
  g.arc(0, -h * 0.75, h * 0.13, 0, Math.PI * 2);
  g.rect(-h * 0.2, -h * 0.92, h * 0.4, h * 0.06);
  g.moveTo(-h * 0.22, -h * 0.6);
  g.lineTo(h * 0.22, -h * 0.6);
  g.lineTo(h * 0.16, 0);
  g.lineTo(-h * 0.16, 0);
  g.closePath();
  g.fill();
  // Baton
  g.strokeStyle = 'rgba(15,15,20,0.6)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(h * 0.2, -h * 0.4);
  g.lineTo(h * 0.45, -h * 0.05);
  g.stroke();
  g.restore();
}
