/**
 * Procedural playfield artwork for DEBTOR'S PRISON: a screen-printed late-70s playfield in
 * navy, prison-jumpsuit orange and cream, with a zone for every shot, bold labels, the
 * Warden's crest and printed insert sockets. Painted at 52 px per ball diameter (about 1035 x
 * 2026) in table coordinates, so the art always lines up with the physics geometry.
 */
import { TABLE } from '../content/table';
import { Rng } from '../core/rng';
import type { LampDef } from '../sim/table-def';
import {
  PALETTE as P,
  arcText,
  chain,
  drawWarden,
  key,
  polygon,
  rays,
  roundRect,
  star,
  text,
  unitSpace,
  type Ctx,
} from './art-kit';

export const ART_PX = 52; // pixels per table unit

const ARCH = { x: 9.95, y: 29, r: 9.95 };
const LANE_SEP_X = [12.55, 14.05, 15.55, 16.93];
const laneTopAt = (x: number): number => ARCH.y + Math.sqrt(8.55 ** 2 - (x - ARCH.x) ** 2);

export function paintPlayfield(canvas: HTMLCanvasElement): void {
  const PX = ART_PX;
  const W = Math.ceil(TABLE.width * PX);
  const H = Math.ceil(TABLE.height * PX);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const rng = new Rng('playfield-art-2');
  unitSpace(g, PX, H);
  const TW = W / PX;
  const TH = H / PX;
  const T = (
    s: string,
    x: number,
    y: number,
    size: number,
    o: Partial<Parameters<typeof text>[5]> = {},
  ) => text(g, PX, s, x, y, { size, stroke: P.ink, strokeW: size * 0.2, ...o });

  // ---- base field: deep navy with a soft glow from the middle, then a printed sunburst
  const bg = g.createRadialGradient(9.6, 17, 1, 9.6, 17, 27);
  bg.addColorStop(0, '#24479e');
  bg.addColorStop(0.5, '#162c70');
  bg.addColorStop(1, '#0a1442');
  g.fillStyle = bg;
  g.fillRect(0, 0, TW, TH);
  g.save();
  rays(g, 9.2, 3, 60, 52, 0.05, Math.PI - 0.05, 'rgba(110,160,255,0.075)');
  g.restore();
  // Halftone dots: the screen-print texture.
  g.fillStyle = 'rgba(140,185,255,0.07)';
  for (let y = 0.2; y < TH; y += 0.34)
    for (let x = (Math.round(y / 0.34) % 2) * 0.17 + 0.1; x < TW; x += 0.34) {
      g.beginPath();
      g.arc(x, y, 0.045, 0, Math.PI * 2);
      g.fill();
    }

  // ---- the arch: concentric printed rings, a field of stars, PAY OR FALL
  g.lineCap = 'round';
  for (const [r, col, w] of [
    [9.55, P.cream, 0.1],
    [9.15, P.orange, 0.2],
    [8.78, P.cream, 0.05],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.arc(ARCH.x, ARCH.y, r, 0, Math.PI);
    g.stroke();
  }
  // Left and right walls get the same two-tone rail print down the sides.
  for (const [x, col, w] of [
    [0.45, P.cream, 0.1],
    [0.8, P.orange, 0.18],
    [TW - 0.45, P.cream, 0.1],
    [TW - 0.8, P.orange, 0.18],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0.6);
    g.lineTo(x, ARCH.y);
    g.stroke();
  }
  g.fillStyle = P.yellow;
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0.15, Math.PI - 0.15);
    const r = rng.range(5.2, 8.4);
    star(g, ARCH.x + Math.cos(a) * r, ARCH.y + Math.sin(a) * r, rng.range(0.08, 0.2), 0.04, 4);
    g.globalAlpha = rng.range(0.35, 0.8);
    g.fill();
    g.globalAlpha = 1;
  }
  arcText(g, PX, 'PAY  OR  FALL', ARCH.x, ARCH.y, 7.95, (151 * Math.PI) / 180, {
    size: 0.7,
    fill: P.cream,
    stroke: P.ink,
    strokeW: 0.15,
    spacing: 0.12,
    shadow: 'rgba(0,0,0,0.4)',
  });

  // ---- the Yard: the pop bumpers sit in an orange sunburst
  {
    const cx = 12.55;
    const cy = 29.05;
    const burst = g.createRadialGradient(cx, cy, 0.5, cx, cy, 4.9);
    burst.addColorStop(0, 'rgba(255,200,60,0.75)');
    burst.addColorStop(0.6, 'rgba(255,120,30,0.5)');
    burst.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = burst;
    g.beginPath();
    g.arc(cx, cy, 4.9, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(cx, cy, 4.6, 0, Math.PI * 2);
    g.clip();
    rays(g, cx, cy, 6, 28, 0, Math.PI * 2, 'rgba(255,230,120,0.22)');
    g.restore();
    for (const b of TABLE.bumpers) {
      const spare = !!b.tag;
      const k = spare ? 0.82 : 1;
      g.lineWidth = 0.09;
      g.strokeStyle = P.cream;
      g.beginPath();
      g.arc(b.x, b.y, b.r * 1.95 * k, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(200,28,24,0.95)';
      g.beginPath();
      g.arc(b.x, b.y, b.r * 1.7 * k, 0, Math.PI * 2);
      g.arc(b.x, b.y, b.r * 1.38 * k, 0, Math.PI * 2, true);
      g.fill();
      const well = g.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 1.4 * k);
      well.addColorStop(0, '#0a1038');
      well.addColorStop(1, '#16286e');
      g.fillStyle = well;
      g.beginPath();
      g.arc(b.x, b.y, b.r * 1.38 * k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = P.yellow;
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * Math.PI * 2;
        g.beginPath();
        g.arc(
          b.x + Math.cos(a) * b.r * 1.54 * k,
          b.y + Math.sin(a) * b.r * 1.54 * k,
          0.055,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
    }
    // The Yard banner.
    g.save();
    g.translate(13.7, 24.95);
    g.rotate(0.0);
    roundRect(g, -2.0, -0.5, 4.0, 1.0, 0.25);
    g.fillStyle = P.red;
    g.fill();
    g.lineWidth = 0.08;
    g.strokeStyle = P.cream;
    g.stroke();
    g.restore();
    T('THE YARD', 13.7, 24.97, 0.78, { fill: P.cream, spacing: 0.06 });
  }

  // ---- the Warden's medallion in the upper left
  {
    const cx = 8.5;
    const cy = 34.7;
    const R = 2.25;
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0d1640';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    rays(g, cx, cy, R * 1.2, 24, 0, Math.PI * 2, 'rgba(255,170,40,0.5)');
    const aura = g.createRadialGradient(cx, cy, 0.2, cx, cy, R);
    aura.addColorStop(0, 'rgba(255,200,80,0.65)');
    aura.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = aura;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.restore();
    drawWarden(g, cx, cy - 0.12, 3.5, false);
    for (const [r, col, w] of [
      [R, P.cream, 0.1],
      [R + 0.17, P.orange, 0.2],
      [R + 0.36, P.cream, 0.06],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
    arcText(g, PX, 'THE WARDEN', cx, cy, R + 0.95, Math.PI / 2, {
      size: 0.44,
      fill: P.amber,
      stroke: P.ink,
      strokeW: 0.1,
      spacing: 0.16,
    });
    chain(g, cx - R - 0.3, cy - 0.5, 4.2, 31.6, 0.6);
    chain(g, cx + R + 0.3, cy - 0.5, 11.9, 33.4, 0.5);
    key(g, 4.1, 35.2, 0.9, 0.6, P.amber);
    key(g, 12.2, 36.2, 0.8, -0.5, P.amber);
  }

  // ---- ABC lanes: coloured channels with big letters
  {
    const cols = [P.orange, P.yellow, P.orange];
    for (let i = 0; i < 3; i++) {
      const x0 = LANE_SEP_X[i] + 0.12;
      const x1 = LANE_SEP_X[i + 1] - 0.12;
      const c = (x0 + x1) / 2;
      const top = laneTopAt(c);
      polygon(g, [
        [x0, top - 2.35],
        [x1, top - 2.35],
        [x1, top + 0.15],
        [x0, top + 0.15],
      ]);
      g.fillStyle = cols[i];
      g.globalAlpha = 0.9;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 0.06;
      g.strokeStyle = P.ink;
      g.stroke();
      T('ABC'[i], c, top - 0.75, 1.0, { fill: P.cream, strokeW: 0.22 });
      // Chevrons down the channel.
      g.strokeStyle = P.ink;
      g.lineWidth = 0.08;
      g.beginPath();
      g.moveTo(c - 0.3, top - 1.65);
      g.lineTo(c, top - 1.95);
      g.lineTo(c + 0.3, top - 1.65);
      g.stroke();
    }
  }
  T('SKILL', 14.55, 31.75, 0.46, { fill: P.cream, rot: -0.55 });

  // ---- the left orbit (Perimeter): a pale lane band with chevrons running up the wall
  {
    const pts: [number, number][] = [[0.87, 30.2]];
    const cx = 5.87;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + ((i / 10) * (36 * Math.PI)) / 180;
      pts.push([cx + Math.cos(a) * 5, 22.2 + Math.sin(a) * 5]);
    }
    pts.unshift([0.87, 30.5]);
    pts.push([2.55, 18.3]);
    g.save();
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    for (const [w, col] of [
      [1.9, P.ink],
      [1.62, '#2c6fd6'],
      [0.12, P.cream],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
      g.stroke();
    }
    g.restore();
    T('PERIMETER', 0.9, 26.3, 0.72, { rot: Math.PI / 2, fill: P.cream, spacing: 0.08 });
  }

  // ---- the Chute: a yellow arrow lane below the funnel mouth
  {
    const mx = 4.75;
    const my = 22.0;
    const dir = (111 * Math.PI) / 180;
    g.save();
    g.translate(mx, my);
    g.rotate(dir + Math.PI);
    polygon(g, [
      [0.1, -0.85],
      [4.6, -0.85],
      [4.6, -1.35],
      [5.9, 0],
      [4.6, 1.35],
      [4.6, 0.85],
      [0.1, 0.85],
    ]);
    g.fillStyle = 'rgba(255,215,60,0.92)';
    g.fill();
    g.lineWidth = 0.08;
    g.strokeStyle = P.ink;
    g.stroke();
    g.restore();
    T('THE CHUTE', 3.35, 19.9, 0.6, { rot: 1.2, fill: P.yellow, spacing: 0.06 });
  }

  // ---- the Hole: bullseye rings, a pit, and a label under the ladder
  {
    const hx = 7.9;
    const hy = 25.2;
    for (const [r, col] of [
      [3.45, P.cream],
      [3.0, P.red],
      [2.55, P.cream],
      [2.1, P.red],
    ] as const) {
      g.beginPath();
      g.arc(hx, hy, r, 0, Math.PI * 2);
      g.fillStyle = col;
      g.globalAlpha = 0.9;
      g.fill();
      g.globalAlpha = 1;
    }
    g.lineWidth = 0.06;
    g.strokeStyle = P.ink;
    for (const r of [3.45, 3.0, 2.55, 2.1]) {
      g.beginPath();
      g.arc(hx, hy, r, 0, Math.PI * 2);
      g.stroke();
    }
    // The pit itself: a black well with a bright rim, partly roofed by the scoop block.
    g.beginPath();
    g.arc(hx, hy - 0.3, 0.95, 0, Math.PI * 2);
    g.fillStyle = '#04050e';
    g.fill();
    g.lineWidth = 0.1;
    g.strokeStyle = P.cream;
    g.stroke();
    arcText(g, PX, 'THE HOLE', hx, hy, 3.12, Math.PI / 2, {
      size: 0.4,
      fill: P.ink,
      spacing: 0.12,
    });
  }

  // ---- Cell Block: a jade plate with bars under the drop targets
  {
    g.save();
    g.translate(12.95, 20.2);
    g.rotate(Math.atan2(1.5, -2.55) + Math.PI);
    roundRect(g, -1.95, -2.15, 3.9, 1.45, 0.2);
    g.fillStyle = '#0f6f55';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = -1.8; x < 1.9; x += 0.5) g.fillRect(x, -2.3, 0.14, 1.8);
    g.restore();
    g.lineWidth = 0.07;
    g.strokeStyle = P.cream;
    roundRect(g, -1.95, -2.15, 3.9, 1.45, 0.2);
    g.stroke();
    g.restore();
    T('CELL BLOCK', 13.75, 18.45, 0.64, { rot: -0.51, fill: P.cream, spacing: 0.06 });
  }

  // ---- Perimeter arrows' lane labels
  T('PERIMETER', 14.9, 20.1, 0.42, { rot: 1.03, fill: P.sky, spacing: 0.05 });

  // ---- mid-field: the award ladder banner and the bonus multiplier plate
  {
    roundRect(g, 5.95, 17.5, 5.2, 0.9, 0.3);
    g.fillStyle = 'rgba(100,40,180,0.92)';
    g.fill();
    g.lineWidth = 0.06;
    g.strokeStyle = P.cream;
    g.stroke();
    T('HOLE AWARDS', 8.55, 17.98, 0.5, { fill: P.cream, spacing: 0.1 });
    roundRect(g, 6.35, 12.35, 5.3, 2.3, 0.4);
    g.fillStyle = 'rgba(8,16,60,0.8)';
    g.fill();
    g.lineWidth = 0.07;
    g.strokeStyle = P.amber;
    g.stroke();
    T('BONUS  MULTIPLIER', 9.0, 14.25, 0.4, { fill: P.amber, spacing: 0.1 });
  }

  // ---- lower field: the crest and the shoot-again lamps
  {
    const cx = 9.2;
    const cy = 8.65;
    const R = 2.0;
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0d1640';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    rays(g, cx, cy, R * 1.3, 20, 0, Math.PI * 2, 'rgba(255,170,40,0.5)');
    g.restore();
    drawWarden(g, cx, cy - 0.1, 3.4, false);
    for (const [r, col, w] of [
      [R, P.cream, 0.1],
      [R + 0.16, P.red, 0.2],
      [R + 0.34, P.cream, 0.06],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
    arcText(g, PX, "DEBTOR'S  PRISON", cx, cy, R + 0.9, Math.PI / 2, {
      size: 0.66,
      fill: P.yellow,
      stroke: P.ink,
      strokeW: 0.15,
      spacing: 0.12,
    });
    T('BALL SAVE', 9.2, 3.95, 0.4, { fill: P.cream, spacing: 0.08 });
    T('SHOOT AGAIN', 9.2, 0.95, 0.46, { fill: P.red, stroke: P.cream, strokeW: 0.1, spacing: 0.1 });
  }
  // Shooter lane.
  T('SHOOT', 19.25, 9.3, 0.5, { rot: Math.PI / 2, fill: P.amber, spacing: 0.1 });
  g.fillStyle = P.orange;
  polygon(g, [
    [19.25, 13.2],
    [18.8, 12.5],
    [19.7, 12.5],
  ]);
  g.fill();
  // Outlane and inlane warnings.
  for (const x of [0.78, TW - 3.28]) {
    T('OUT', x + 0.5, 6.4, 0.36, { fill: P.red, rot: Math.PI / 2 });
  }

  // ---- ambient occlusion: every raised thing sinks softly into the playfield
  {
    const HUGE = 200;
    const shade = (draw: () => void, h: number) => {
      g.save();
      g.translate(-HUGE, 0);
      g.shadowColor = `rgba(0,2,14,${Math.min(0.8, 0.42 + h * 0.18)})`;
      g.shadowBlur = (0.16 + h * 0.2) * PX;
      g.shadowOffsetX = (HUGE + 0.1 * h) * PX;
      g.shadowOffsetY = 0.14 * h * PX;
      g.fillStyle = '#000';
      draw();
      g.restore();
    };
    for (const w of TABLE.walls) {
      if (w.look === 'invisible' || w.look === 'cabinet' || w.tag || !w.loop) continue;
      shade(() => {
        polygon(g, w.pts);
        g.fill();
      }, w.h ?? 1);
    }
    for (const p of TABLE.posts) {
      if (p.tag) continue;
      shade(() => {
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }, 0.8);
    }
    for (const b of TABLE.bumpers) {
      shade(() => {
        g.beginPath();
        g.arc(b.x, b.y, b.r * 0.95, 0, Math.PI * 2);
        g.fill();
      }, 1.2);
    }
    for (const s of TABLE.slings)
      shade(() => {
        polygon(g, [s.a, s.b, s.c]);
        g.fill();
      }, 0.9);
    for (const f of TABLE.flippers) {
      if (f.tag) continue;
      shade(() => {
        g.beginPath();
        g.arc(f.x, f.y, f.r0 * 1.05, 0, Math.PI * 2);
        g.fill();
      }, 0.5);
    }
  }

  // ---- insert sockets: printed rim, dark well, a hint of reflector
  for (const l of TABLE.lamps) socket(g, l);
  // Insert captions.
  for (const l of TABLE.lamps) {
    if (!l.label) continue;
    if (/^\dX$/.test(l.label)) T(l.label, l.x, l.y - 0.72, 0.38, { fill: P.cream });
    if (l.label === 'LOCK') T('LOCK', l.x + 1.3, l.y, 0.36, { fill: P.cream });
  }

  // ---- wear: faint scuffs along the usual ball paths, then a fine speckle
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 70; i++) {
    const x = rng.range(1, TW - 1);
    const y = rng.range(2, TH - 2);
    g.lineWidth = rng.range(0.02, 0.06);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-0.8, 0.8), y + rng.range(-1.2, 1.2));
    g.stroke();
  }
  g.restore();
}

function socket(g: Ctx, l: LampDef): void {
  g.save();
  g.translate(l.x, l.y);
  g.rotate((l.rot * Math.PI) / 180);
  const s = l.size;
  // Cream printed rim, then the black well the lamp insert sits in.
  shapePath(g, l.shape, s * 1.42);
  g.fillStyle = 'rgba(255,240,200,0.92)';
  g.fill();
  g.lineWidth = 0.05;
  g.strokeStyle = P.ink;
  g.stroke();
  shapePath(g, l.shape, s * 1.2);
  g.fillStyle = '#05060f';
  g.fill();
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
