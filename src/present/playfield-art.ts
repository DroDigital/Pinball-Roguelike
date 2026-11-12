/**
 * The playfield print for DEBTOR'S PRISON, painted on a 2D canvas from the table's own
 * geometry: flat zone fields in a five-ink palette, cream key-lines, painted shot roads from
 * the flippers to every major shot, starbursts under the bumpers, searchlight beams across the
 * upper deck and a night sky in the arch. A late-70s screen print: bold, a little off-register.
 */
import { TABLE } from '../content/table';
import { Rng } from '../core/rng';
import type { LampDef } from '../sim/table-def';

export const ART_PX = 48; // pixels per table unit

type Ctx = CanvasRenderingContext2D;

const INK = {
  black: '#120c0a',
  ox: '#7a1c14',
  red: '#cc2c1e',
  mustard: '#e8a82c',
  cream: '#f2e4be',
  teal: '#237068',
  navy: '#1b2550',
  asphalt: '#363c4a',
  rust: '#8a4420',
  iron: '#2a2e33',
};

/** Shot stripes take the colour of their arrow insert, so a lit arrow sits on its own lane. */
const LAMP_INK: Record<string, string> = {
  yellow: '#e8c22a',
  blue: '#2f74e0',
  red: '#d42a1e',
  green: '#2fa04e',
};
const HEAD = '"Saira Stencil One", "Bebas Neue", Impact, sans-serif';
const BODY = '"Bebas Neue", "Oswald", Impact, sans-serif';

/** The image argument is the old illustration: the print no longer uses it. */
export function paintPlayfield(
  canvas: HTMLCanvasElement,
  _art: HTMLImageElement | null = null,
): void {
  const W = Math.ceil(TABLE.width * ART_PX);
  const H = Math.ceil(TABLE.height * ART_PX);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const rng = new Rng('playfield-print');
  const U = ART_PX;
  const X = (x: number) => x * U;
  const Y = (y: number) => H - y * U;
  const poly = (pts: readonly (readonly number[])[]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.closePath();
  };
  const rivet = (x: number, y: number) => {
    g.fillStyle = INK.black;
    g.beginPath();
    g.arc(X(x), Y(y), U * 0.11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a929c';
    g.beginPath();
    g.arc(X(x) - U * 0.02, Y(y) - U * 0.02, U * 0.07, 0, Math.PI * 2);
    g.fill();
  };
  const band = (y0: number, y1: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(0, Y(y1), W, Y(y0) - Y(y1));
  };

  // ---- zone fields, bottom to top
  band(-1, 14, INK.black);
  band(14, 23.4, INK.ox);
  band(23.4, 33.4, INK.asphalt);
  band(33.4, 41.5, INK.teal);
  band(41.5, 48, INK.navy);

  // The Pit: a sunburst rising from the drain between the flippers.
  g.save();
  g.beginPath();
  g.rect(0, Y(14), W, Y(-1) - Y(14));
  g.clip();
  for (let i = 0; i < 22; i++) {
    const a0 = Math.PI + (i / 22) * Math.PI;
    const a1 = Math.PI + ((i + 0.5) / 22) * Math.PI;
    g.fillStyle = i % 2 ? INK.ox : INK.red;
    g.beginPath();
    g.moveTo(X(9.2), Y(1.2));
    g.lineTo(X(9.2) + Math.cos(a0) * U * 22, Y(1.2) + Math.sin(a0) * U * 22);
    g.lineTo(X(9.2) + Math.cos(a1) * U * 22, Y(1.2) + Math.sin(a1) * U * 22);
    g.closePath();
    g.fill();
  }
  const pit = g.createRadialGradient(X(9.2), Y(1.2), U, X(9.2), Y(1.2), U * 14);
  pit.addColorStop(0, 'rgba(0,0,0,0.85)');
  pit.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  pit.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = pit;
  g.fillRect(0, Y(14), W, Y(-1) - Y(14));
  g.restore();

  // The trapdoor under the flippers: two riveted iron leaves, the seam glowing red from the
  // drop below, hazard tape along the top. Pay, or this is where you go.
  {
    const x0 = 5.0;
    const x1 = 13.4;
    const y0 = 0.2;
    const y1 = 8.7;
    const mid = (x0 + x1) / 2;
    g.fillStyle = INK.black;
    g.fillRect(
      X(x0 - 0.18),
      Y(y1 + 0.18),
      X(x1 + 0.18) - X(x0 - 0.18),
      Y(y0 - 0.18) - Y(y1 + 0.18),
    );
    const plate = g.createLinearGradient(0, Y(y1), 0, Y(y0));
    plate.addColorStop(0, '#4a5059');
    plate.addColorStop(1, '#22262c');
    g.fillStyle = plate;
    g.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
    // Diamond tread.
    g.save();
    g.beginPath();
    g.rect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
    g.clip();
    for (let y = y0 + 0.3; y < y1; y += 0.55)
      for (let x = x0 + 0.3 + (Math.round((y - y0) / 0.55) % 2) * 0.32; x < x1; x += 0.64) {
        g.save();
        g.translate(X(x), Y(y));
        g.rotate(((Math.round(x * 3) % 2 ? 1 : -1) * Math.PI) / 4);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(-U * 0.18, -U * 0.05, U * 0.36, U * 0.1);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(-U * 0.18, U * 0.03, U * 0.36, U * 0.04);
        g.restore();
      }
    g.restore();
    // Hinges on the outer edges.
    for (const hx of [x0 + 0.25, x1 - 0.25])
      for (const hy of [y0 + 1.6, y1 - 2.2]) {
        g.fillStyle = INK.black;
        g.fillRect(X(hx - 0.22), Y(hy + 0.9), U * 0.44, U * 1.8);
        g.fillStyle = '#6a717b';
        g.fillRect(X(hx - 0.14), Y(hy + 0.82), U * 0.28, U * 1.64);
      }
    // The seam: light from the drop leaking up between the leaves.
    const seam = g.createLinearGradient(X(mid - 0.6), 0, X(mid + 0.6), 0);
    seam.addColorStop(0, 'rgba(255,60,20,0)');
    seam.addColorStop(0.5, 'rgba(255,90,30,0.55)');
    seam.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = seam;
    g.fillRect(X(mid - 0.6), Y(y1), U * 1.2, Y(y0) - Y(y1));
    g.fillStyle = INK.black;
    g.fillRect(X(mid - 0.06), Y(y1), U * 0.12, Y(y0) - Y(y1));
    g.fillStyle = '#ff7a3a';
    g.fillRect(X(mid - 0.02), Y(y1 - 0.4), U * 0.04, Y(y0 + 0.4) - Y(y1 - 0.4));
    // Rivets round the frame.
    for (let x = x0 + 0.25; x <= x1 - 0.2; x += 0.6)
      for (const y of [y0 + 0.22, y1 - 0.22]) rivet(x, y);
    for (let y = y0 + 0.8; y <= y1 - 0.6; y += 0.6)
      for (const x of [x0 + 0.22, x1 - 0.22, mid - 0.3, mid + 0.3]) rivet(x, y);
    // Hazard tape along the top edge.
    g.save();
    g.beginPath();
    g.rect(X(x0), Y(y1), X(x1) - X(x0), U * 0.5);
    g.clip();
    g.fillStyle = INK.mustard;
    g.fillRect(X(x0), Y(y1), X(x1) - X(x0), U * 0.5);
    g.fillStyle = INK.black;
    for (let x = x0 - 1; x < x1 + 1; x += 0.6) {
      g.beginPath();
      g.moveTo(X(x), Y(y1));
      g.lineTo(X(x + 0.3), Y(y1));
      g.lineTo(X(x + 0.8), Y(y1 - 0.5));
      g.lineTo(X(x + 0.5), Y(y1 - 0.5));
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // Cell block floor: mustard tiles laid diagonally over the oxblood.
  g.save();
  g.beginPath();
  g.rect(0, Y(23.4), W, Y(14) - Y(23.4));
  g.clip();
  g.translate(X(9.2), Y(18.7));
  g.rotate(Math.PI / 4);
  for (let i = -14; i <= 14; i++)
    for (let j = -14; j <= 14; j++) {
      if ((i + j) & 1) continue;
      g.fillStyle = 'rgba(213,154,42,0.16)';
      g.fillRect(i * U * 1.1, j * U * 1.1, U * 1.1, U * 1.1);
    }
  g.restore();

  // ---- shot stripes: a painted lane behind each major arrow, in the arrow's own colour,
  // carrying its level ladder and ending in chevrons that point at the shot.
  const stripe = (id: string, len: number, back: number): void => {
    const l = TABLE.lamps.find((x) => x.id === id);
    if (!l) return;
    const a = (l.rot * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const ink = LAMP_INK[l.color] ?? INK.mustard;
    g.save();
    g.translate(X(l.x - dx * back), Y(l.y - dy * back));
    g.rotate(-a);
    const w = 1.15 * U;
    const L = len * U;
    const tip = 0.75 * U;
    const shape = (pad: number) => {
      g.beginPath();
      g.moveTo(-pad, -w / 2 - pad);
      g.lineTo(L, -w / 2 - pad);
      g.lineTo(L + tip + pad * 1.4, 0);
      g.lineTo(L, w / 2 + pad);
      g.lineTo(-pad, w / 2 + pad);
      g.closePath();
    };
    shape(0.12 * U);
    g.fillStyle = INK.black;
    g.fill();
    shape(0);
    const grad = g.createLinearGradient(0, 0, L + tip, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.25, ink);
    grad.addColorStop(1, ink);
    g.fillStyle = INK.black;
    g.fill();
    g.fillStyle = grad;
    g.fill();
    // Chevrons running toward the shot along the tail.
    g.fillStyle = 'rgba(18,12,10,0.55)';
    for (let k = 0; k < 3; k++) {
      const x = L * 0.12 + k * 0.42 * U;
      g.beginPath();
      g.moveTo(x, -w * 0.32);
      g.lineTo(x + 0.22 * U, 0);
      g.lineTo(x, w * 0.32);
      g.lineTo(x + 0.12 * U, w * 0.32);
      g.lineTo(x + 0.34 * U, 0);
      g.lineTo(x + 0.12 * U, -w * 0.32);
      g.closePath();
      g.fill();
    }
    // A cream key-line down the middle of the painted part.
    g.strokeStyle = 'rgba(242,228,190,0.35)';
    g.lineWidth = 0.05 * U;
    g.strokeRect(L * 0.3, -w / 2 + 0.12 * U, L * 0.7, w - 0.24 * U);
    g.restore();
  };
  // The panopticon: rings, cell wings and an eye that never shuts.
  g.save();
  g.translate(X(9.2), Y(17.6));
  for (const [r, c] of [
    [2.9, INK.black],
    [2.68, INK.mustard],
    [2.25, INK.black],
    [2.05, INK.ox],
  ] as const) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, r * U, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = INK.cream;
  g.lineWidth = U * 0.07;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * U * 1.35, Math.sin(a) * U * 1.35);
    g.lineTo(Math.cos(a) * U * 1.95, Math.sin(a) * U * 1.95);
    g.stroke();
  }
  g.fillStyle = INK.cream;
  g.beginPath();
  g.moveTo(-U * 1.25, 0);
  g.quadraticCurveTo(0, -U * 0.95, U * 1.25, 0);
  g.quadraticCurveTo(0, U * 0.95, -U * 1.25, 0);
  g.fill();
  g.fillStyle = INK.red;
  g.beginPath();
  g.arc(0, 0, U * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK.black;
  g.beginPath();
  g.arc(0, 0, U * 0.26, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Stripes go over the panopticon's rim so every lane reads to its arrow.
  stripe('arrowChute', 3.4, 2.6);
  stripe('arrowPerimL', 3.4, 2.6);
  stripe('arrowPerimR', 3.4, 2.6);
  stripe('arrowHole', 2.9, 2.4);
  stripe('arrowCell', 2.6, 2.3);
  stripe('arrowTower', 3.0, 2.5);

  // The Hole: a hazard-striped rim around the scoop.
  const hole = TABLE.hole;
  g.save();
  g.translate(X(hole.x), Y(hole.y - 0.6));
  g.beginPath();
  g.arc(0, 0, U * 2.1, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = INK.mustard;
  g.fillRect(-U * 3, -U * 3, U * 6, U * 6);
  g.fillStyle = INK.black;
  for (let i = -8; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * U * 0.7, -U * 3);
    g.lineTo(i * U * 0.7 + U * 0.35, -U * 3);
    g.lineTo(i * U * 0.7 + U * 0.35 + U * 3, U * 3);
    g.lineTo(i * U * 0.7 + U * 3, U * 3);
    g.fill();
  }
  g.restore();
  g.fillStyle = INK.black;
  g.beginPath();
  g.arc(X(hole.x), Y(hole.y - 0.6), U * 1.45, 0, Math.PI * 2);
  g.fill();

  // The Yard: court markings and a starburst under every bumper.
  g.strokeStyle = 'rgba(236,220,180,0.5)';
  g.lineWidth = U * 0.09;
  g.strokeRect(X(9.6), Y(32.6), X(17.6) - X(9.6), Y(25.6) - Y(32.6));
  g.beginPath();
  g.arc(X(12.7), Y(29.4), U * 3.4, 0, Math.PI * 2);
  g.stroke();
  for (const b of TABLE.bumpers) {
    if (b.tag) continue;
    g.save();
    g.translate(X(b.x), Y(b.y));
    const n = 14;
    for (const [r0, r1, c] of [
      [b.r * 2.05, b.r * 1.45, INK.black],
      [b.r * 1.9, b.r * 1.35, b.y > 33 ? INK.cream : INK.mustard],
      [b.r * 1.45, b.r * 1.1, INK.red],
    ] as const) {
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = (i % 2 ? r1 : r0) * U;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // Cell Block: numbered doors behind the drop targets.
  for (const [i, d] of TABLE.dropBanks[0].targets.entries()) {
    const cx = (d.a[0] + d.b[0]) / 2;
    const cy = (d.a[1] + d.b[1]) / 2;
    g.save();
    g.translate(X(cx - 0.75), Y(cy - 1.25));
    g.rotate(0.53);
    g.fillStyle = INK.black;
    g.fillRect(-U * 0.5, -U * 0.75, U, U * 1.5);
    g.strokeStyle = INK.cream;
    g.lineWidth = U * 0.06;
    g.strokeRect(-U * 0.5, -U * 0.75, U, U * 1.5);
    g.fillStyle = INK.cream;
    g.font = `${Math.round(U * 0.8)}px ${HEAD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), 0, U * 0.05);
    g.restore();
  }

  // ---- The Tower: searchlight beams sweep down the deck from the watchtower
  g.save();
  g.beginPath();
  g.rect(0, Y(46.5), W, Y(33.4) - Y(46.5));
  g.clip();
  for (const [a, w] of [
    [-2.25, 0.2],
    [-1.6, 0.16],
    [-0.95, 0.2],
  ] as const) {
    const grad = g.createRadialGradient(X(9.7), Y(44.4), U, X(9.7), Y(44.4), U * 13);
    grad.addColorStop(0, 'rgba(255,240,170,0.5)');
    grad.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(X(9.7), Y(44.4));
    g.arc(X(9.7), Y(44.4), U * 13, -a - w, -a + w);
    g.closePath();
    g.fill();
  }
  g.restore();
  // The watchtower itself, squat and black against the sky.
  g.fillStyle = INK.black;
  poly([
    [8.9, 43.6],
    [10.5, 43.6],
    [10.9, 45.2],
    [8.5, 45.2],
  ]);
  g.fill();
  g.fillRect(X(8.3), Y(45.7), X(11.1) - X(8.3), Y(45.2) - Y(45.7));
  g.fillStyle = INK.mustard;
  g.fillRect(X(9.2), Y(44.9), U * 0.4, U * 0.5);
  g.fillRect(X(9.9), Y(44.9), U * 0.4, U * 0.5);
  // Night sky in the arch: stars and a thin moon.
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, TABLE.width);
    const y = rng.range(41.8, 47);
    g.fillStyle = `rgba(236,220,180,${rng.range(0.25, 0.9)})`;
    const r = rng.range(0.03, 0.08) * U;
    g.fillRect(X(x) - r, Y(y) - r, r * 2, r * 2);
  }
  g.fillStyle = INK.cream;
  g.beginPath();
  g.arc(X(4.6), Y(44.6), U * 0.8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK.navy;
  g.beginPath();
  g.arc(X(4.95), Y(44.8), U * 0.7, 0, Math.PI * 2);
  g.fill();
  // Barbed wire where the deck meets the Yard, and where the sky meets the deck.
  const wire = (y: number) => {
    g.strokeStyle = INK.black;
    g.lineWidth = U * 0.16;
    g.beginPath();
    g.moveTo(0, Y(y));
    g.lineTo(W, Y(y));
    g.stroke();
    g.strokeStyle = INK.cream;
    g.lineWidth = U * 0.06;
    g.beginPath();
    for (let x = 0; x <= TABLE.width; x += 0.25) g.lineTo(X(x), Y(y + Math.sin(x * 9) * 0.12));
    g.stroke();
    for (let x = 0.4; x < TABLE.width; x += 0.8) {
      g.beginPath();
      g.moveTo(X(x - 0.14), Y(y - 0.2));
      g.lineTo(X(x + 0.14), Y(y + 0.2));
      g.moveTo(X(x + 0.14), Y(y - 0.2));
      g.lineTo(X(x - 0.14), Y(y + 0.2));
      g.stroke();
    }
  };
  wire(33.4);
  wire(41.5);
  wire(23.4);

  // The Perimeter: chain-link fence down both orbit lanes.
  const fence = (x0: number, x1: number, y0: number, y1: number) => {
    g.save();
    g.beginPath();
    g.rect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
    g.clip();
    g.fillStyle = INK.black;
    g.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
    g.strokeStyle = 'rgba(236,220,180,0.4)';
    g.lineWidth = U * 0.04;
    for (let k = -60; k < 60; k++) {
      g.beginPath();
      g.moveTo(X(x0) + k * U * 0.4, Y(y1));
      g.lineTo(X(x0) + k * U * 0.4 + (Y(y0) - Y(y1)), Y(y0));
      g.moveTo(X(x0) + k * U * 0.4, Y(y0));
      g.lineTo(X(x0) + k * U * 0.4 + (Y(y0) - Y(y1)), Y(y1));
      g.stroke();
    }
    g.restore();
  };
  fence(0, 1.75, 22, 40);
  fence(18.45, TABLE.width, 0, 40);

  // Outlanes run red; inlanes carry a cream chevron ladder down to the flippers.
  for (const side of [0, 1]) {
    const m = (x: number) => (side ? 18.4 - x : x);
    g.fillStyle = INK.red;
    poly([
      [m(0), 13],
      [m(1.55), 13],
      [m(1.55), 4],
      [m(0), 4],
    ]);
    g.fill();
    g.fillStyle = INK.cream;
    for (let k = 0; k < 4; k++) {
      const y = 12.2 - k * 0.75;
      poly([
        [m(1.95), y],
        [m(2.51), y - 0.35],
        [m(3.07), y],
        [m(3.07), y - 0.3],
        [m(2.51), y - 0.65],
        [m(1.95), y - 0.3],
      ]);
      g.fill();
    }
  }

  // ---- lettering
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const banner = (
    text: string,
    x: number,
    y: number,
    rot: number,
    size: number,
    bg = INK.cream,
    fg = INK.black,
  ) => {
    g.save();
    g.translate(X(x), Y(y));
    g.rotate(rot);
    g.font = `${Math.round(size * U)}px ${HEAD}`;
    const w = g.measureText(text).width + size * U * 0.7;
    const h = size * U * 1.25;
    g.fillStyle = INK.black;
    g.fillRect(-w / 2 - U * 0.08, -h / 2 - U * 0.08, w + U * 0.16, h + U * 0.16);
    g.fillStyle = bg;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = fg;
    g.fillText(text, 0, size * U * 0.06);
    g.restore();
  };
  banner('THE CHUTE', 4.0, 23.0, 0, 0.5, LAMP_INK.yellow);
  banner('THE HOLE', 9.75, 24.3, 0, 0.5, LAMP_INK.red, INK.cream);
  banner('CELL BLOCK', 14.3, 22.2, -0.53, 0.46, LAMP_INK.green, INK.cream);
  banner('PERIMETER', 16.6, 15.4, 1.03, 0.42, LAMP_INK.blue, INK.cream);
  banner('PERIMETER', 1.9, 15.3, -0.95, 0.42, LAMP_INK.blue, INK.cream);
  banner('THE YARD', 13.6, 25.0, 0, 0.7);
  banner('ROLL CALL', 14.8, 39.0, 0.42, 0.5, INK.mustard);
  banner('THE TOWER', 9.2, 38.7, 0, 0.8, INK.black, INK.cream);
  banner('MESS HALL', 13.6, 35.8, 0, 0.5);
  banner('TURNSTILE', 2.75, 36.6, -Math.PI / 2, 0.42, INK.teal, INK.cream);
  banner('POST BAIL', 6.9, 39.6, -0.6, 0.5, '#3c8a48', INK.cream);
  banner('SHAKEDOWN', 9.2, 12.6, 0, 0.45, '#7a3ab0', INK.cream);

  // The title ribbon across the pit.
  g.save();
  g.translate(X(9.2), Y(10.5));
  g.fillStyle = INK.black;
  g.fillRect(-U * 5.3, -U * 0.95, U * 10.6, U * 1.9);
  g.fillStyle = INK.cream;
  g.fillRect(-U * 5.15, -U * 0.8, U * 10.3, U * 1.6);
  g.fillStyle = INK.red;
  g.fillRect(-U * 5.15, U * 0.5, U * 10.3, U * 0.3);
  g.fillStyle = INK.black;
  g.font = `${Math.round(U * 1.12)}px ${HEAD}`;
  g.fillText("DEBTOR'S PRISON", 0, -U * 0.1);
  g.fillStyle = INK.cream;
  g.font = `${Math.round(U * 0.3)}px ${BODY}`;
  g.fillText('P A Y   O R   F A L L', 0, U * 0.66);
  g.restore();

  // Halftone and wear: the print is forty years old.
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < H; y += 6)
    for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) g.fillRect(x, y, 2, 2);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '236,220,180'},${rng.range(0.02, 0.08)})`;
    g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(1, 7), rng.range(1, 7));
  }
  // Ball tracks worn pale around the flippers and through the Yard.
  g.strokeStyle = 'rgba(236,220,180,0.05)';
  g.lineWidth = U * 0.3;
  for (const [cx, cy] of [
    [7.2, 6.5],
    [11.2, 6.5],
    [12.7, 29.5],
    [9.2, 36.5],
  ])
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(X(cx), Y(cy), U * (1.4 + k * 0.6), 0, Math.PI * 2);
      g.stroke();
    }

  // Insert sockets: black wells in cream rings for the lamp meshes to sit in.
  for (const l of TABLE.lamps) socket(g, l, X(l.x), Y(l.y));
}

function socket(g: Ctx, l: LampDef, x: number, y: number): void {
  const s = l.size * ART_PX;
  g.save();
  g.translate(x, y);
  g.rotate((-l.rot * Math.PI) / 180);
  g.fillStyle = INK.black;
  g.strokeStyle = INK.cream;
  g.lineWidth = ART_PX * 0.07;
  g.lineJoin = 'round';
  shapePath(g, l.shape, s * 1.22);
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
