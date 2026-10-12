/**
 * The backglass: the Warden behind bars under a blazing sunburst, chains, keys, raining coins
 * and the machine's name in big stencil letters, with the shot-level ladders along the bottom
 * so the player can read their build from the seat. Painted at 1024x512 and lit from behind.
 */
import {
  FONT_DISPLAY,
  FONT_STENCIL,
  PALETTE as P,
  chain,
  drawWarden,
  key,
  rays,
  roundRect,
  star,
  text,
  unitSpace,
  type Ctx,
} from './art-kit';

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

export function paintBackglass(c: HTMLCanvasElement, levels: Record<string, number> | null): void {
  const W = (c.width = 1024);
  const H = (c.height = 512);
  const g = c.getContext('2d')!;
  unitSpace(g, 1, H);
  const LADDER = 96;

  // ---- sky and sunburst
  const sky = g.createLinearGradient(0, H, 0, 0);
  sky.addColorStop(0, '#1a1048');
  sky.addColorStop(0.55, '#4a1466');
  sky.addColorStop(1, '#a8203a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.rect(0, LADDER, W, H - LADDER);
  g.clip();
  rays(g, W / 2, 300, 900, 36, 0, Math.PI * 2, 'rgba(255,200,70,0.42)');
  const halo = g.createRadialGradient(W / 2, 300, 20, W / 2, 300, 420);
  halo.addColorStop(0, 'rgba(255,230,120,0.85)');
  halo.addColorStop(0.35, 'rgba(255,140,40,0.45)');
  halo.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = halo;
  g.fillRect(0, LADDER, W, H);
  // A fat red moon and a scatter of stars.
  g.fillStyle = '#ff5a3a';
  g.beginPath();
  g.arc(130, 410, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (const [x, y, r] of [
    [112, 420, 12],
    [150, 396, 8],
    [140, 432, 6],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = P.yellow;
  for (let i = 0; i < 34; i++) {
    const x = (i * 197) % W;
    const y = LADDER + 40 + ((i * 89) % (H - LADDER - 60));
    star(g, x, y, 3 + (i % 4), 1.4, 4);
    g.globalAlpha = 0.35 + (i % 5) * 0.12;
    g.fill();
    g.globalAlpha = 1;
  }
  g.restore();

  // ---- the cell's bars behind the Warden, with a chrome highlight
  for (let x = 40; x < W; x += 88) {
    const bar = g.createLinearGradient(x - 8, 0, x + 8, 0);
    bar.addColorStop(0, '#05060f');
    bar.addColorStop(0.35, '#3c4660');
    bar.addColorStop(0.5, '#8d9ab8');
    bar.addColorStop(1, '#05060f');
    g.fillStyle = bar;
    g.fillRect(x - 8, LADDER, 16, H - LADDER);
  }
  g.fillStyle = '#05060f';
  g.fillRect(0, 392, W, 14);
  g.fillRect(0, LADDER + 6, W, 12);

  // ---- the Warden
  drawWarden(g, W / 2, 306, 236, true);
  chain(g, W / 2 - 100, 250, 60, 330, 40, 26);
  chain(g, W / 2 + 100, 250, W - 60, 330, 40, 26);
  key(g, 150, 240, 80, 0.5, P.amber);
  key(g, W - 150, 245, 80, -0.5, P.amber);

  // ---- coins raining from the corners
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const x = W / 2 + side * (230 + ((i * 53) % 250));
    const y = LADDER + 60 + ((i * 71) % 300);
    const r = 17 + (i % 3) * 5;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#ffcc3a';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = P.ink;
    g.stroke();
    g.beginPath();
    g.arc(x, y, r * 0.68, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(160,90,0,0.8)';
    g.stroke();
    text(g, 1, '$', x, y + 1, { size: r * 1.05, fill: '#a35a00', font: FONT_STENCIL });
  }

  // ---- title banner
  g.save();
  roundRect(g, 170, 106, W - 340, 96, 22);
  g.fillStyle = 'rgba(8,10,34,0.9)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = P.orange;
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = P.cream;
  roundRect(g, 178, 114, W - 356, 80, 16);
  g.stroke();
  g.restore();
  text(g, 1, "DEBTOR'S PRISON", W / 2, 160, {
    size: 64,
    font: FONT_STENCIL,
    fill: P.cream,
    stroke: P.ink,
    strokeW: 8,
    shadow: P.red,
    shadowOff: 4,
    spacing: 3,
  });
  text(g, 1, 'PAY OR FALL', W / 2, 126, {
    size: 24,
    font: FONT_DISPLAY,
    fill: P.amber,
    spacing: 10,
  });

  // ---- frame
  g.lineWidth = 12;
  g.strokeStyle = P.ink;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.lineWidth = 4;
  g.strokeStyle = P.orange;
  g.strokeRect(14, 14, W - 28, H - 28);

  // ---- shot level ladders: bulbs under the glass
  g.fillStyle = 'rgba(4,4,16,0.88)';
  g.fillRect(0, 0, W, LADDER);
  g.fillStyle = P.orange;
  g.fillRect(0, LADDER - 3, W, 3);
  const colW = W / SHOTS.length;
  SHOTS.forEach((s, i) => {
    const lv = levels?.[s] ?? 1;
    const cx = colW * i + colW / 2;
    // Each label sits on its own dark plate with an ink outline, readable at phone size.
    roundRect(g, colW * i + 8, 9, colW - 16, 34, 8);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fill();
    text(g, 1, LABEL[s], cx, 26, {
      size: 34,
      fill: P.cream,
      font: FONT_DISPLAY,
      spacing: 3,
      stroke: P.ink,
      strokeW: 6,
    });
    for (let k = 0; k < 5; k++) {
      pip(g, cx - 40 + k * 20, 62, lv >= k + 2);
    }
    if (lv > 6)
      text(g, 1, `+${lv - 6}`, cx + 56, 24, { size: 26, fill: P.yellow, font: FONT_DISPLAY });
  });
  void W;
}

function pip(g: Ctx, x: number, y: number, lit: boolean): void {
  if (lit) {
    const gl = g.createRadialGradient(x, y, 1, x, y, 15);
    gl.addColorStop(0, 'rgba(255,230,120,0.9)');
    gl.addColorStop(1, 'rgba(255,150,30,0)');
    g.fillStyle = gl;
    g.fillRect(x - 15, y - 15, 30, 30);
  }
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.fillStyle = lit ? '#fff2a0' : '#3a2616';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = lit ? '#ff9a20' : '#150c06';
  g.stroke();
}
