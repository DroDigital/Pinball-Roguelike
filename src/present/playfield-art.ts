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
  ox: '#5e1410',
  red: '#b3261a',
  mustard: '#d59a2a',
  cream: '#ecdcb4',
  teal: '#1f5a55',
  navy: '#141c38',
  asphalt: '#2c3038',
  rust: '#7a3a18',
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

  // ---- shot roads: painted lanes from each flipper to the shots it makes
  const road = (pts: [number, number][], color: string, w = 0.8) => {
    const line = (lw: number, style: string, dash: number[] = []) => {
      g.strokeStyle = style;
      g.lineWidth = lw * U;
      g.setLineDash(dash.map((d) => d * U));
      g.lineCap = 'butt';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
    };
    line(w + 0.22, INK.black);
    line(w, color);
    line(0.07, INK.black, [0.5, 0.42]);
    g.setLineDash([]);
  };
  road(
    [
      [9.0, 13.2],
      [5.6, 20.2],
    ],
    INK.mustard,
  );
  road(
    [
      [7.7, 14.2],
      [7.9, 23.0],
    ],
    INK.red,
  );
  road(
    [
      [11.2, 13.6],
      [15.9, 19.6],
    ],
    INK.teal,
  );
  road(
    [
      [7.2, 13.8],
      [2.3, 19.8],
    ],
    INK.teal,
  );
  road(
    [
      [9.8, 13.8],
      [12.6, 19.4],
    ],
    '#3c8a48',
  );

  // The panopticon: rings, cell wings and an eye that never shuts.
  g.save();
  g.translate(X(9.2), Y(17.6));
  for (const [r, c] of [
    [3.3, INK.black],
    [3.05, INK.mustard],
    [2.55, INK.black],
    [2.3, INK.ox],
  ] as const) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, r * U, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = INK.cream;
  g.lineWidth = U * 0.07;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * U * 1.15, Math.sin(a) * U * 1.15);
    g.lineTo(Math.cos(a) * U * 2.28, Math.sin(a) * U * 2.28);
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
  banner('THE CHUTE', 3.5, 20.6, -1.2, 0.62, INK.mustard);
  banner('THE HOLE', 7.9, 21.6, 0, 0.62, INK.red, INK.cream);
  banner('CELL BLOCK', 13.9, 18.3, -0.53, 0.56, '#3c8a48', INK.cream);
  banner('PERIMETER', 15.9, 16.3, 1.03, 0.5, INK.teal, INK.cream);
  banner('PERIMETER', 3.2, 16.6, -0.95, 0.5, INK.teal, INK.cream);
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

  // Key-lines between the zones' art and the wood: a cream pinstripe inside the rails.
  g.strokeStyle = 'rgba(236,220,180,0.55)';
  g.lineWidth = U * 0.06;
  g.strokeRect(X(1.95), Y(46.4), X(18.2) - X(1.95), Y(13.2) - Y(46.4));

  // Halftone and wear: the print is forty years old.
  g.fillStyle = 'rgba(0,0,0,0.1)';
  for (let y = 0; y < H; y += 6)
    for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) g.fillRect(x, y, 2, 2);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '236,220,180'},${rng.range(0.03, 0.12)})`;
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
