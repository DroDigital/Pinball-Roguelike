/**
 * Procedural machine artwork:
 * - backglass: 1024x512 (2:1), opaque vintage 70s debtor's prison pinball backglass print.
 *   Leaves the quiet lower strip (BACKGLASS_LEVEL_RECT) clean for live shot ladders.
 * - playfield-illustration: 640x1280 (1:2), transparent vector-like illustration under the wood lamps.
 * - cabinet-side-art: 1536x512 (3:1), opaque side decals with racing stripes, chained ball & bold title.
 */
import { BACKGLASS_LEVEL_RECT } from '../../content/art';
import {
  FONT,
  PAL,
  chain,
  glow,
  sagPath,
  steelBall,
  text,
  vgrad,
  type Ctx,
} from './kit';

/** Backglass Print (1024 x 512) */
export function paintBackglassArt(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1024;

  // 1. Deep moody background: ominous prison cell gloom with searchlights
  const bg = g.createRadialGradient(w / 2, h * 0.42, 20 * u, w / 2, h * 0.42, w * 0.65);
  bg.addColorStop(0, '#58170f');
  bg.addColorStop(0.45, '#280a08');
  bg.addColorStop(0.85, '#120504');
  bg.addColorStop(1, '#080202');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 2. Searchlight beams cutting diagonally through the night sky
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [ox, oy, angle, spread, col] of [
    [w * 0.15, h * 0.85, -0.65, 0.14, 'rgba(255,190,110,0.18)'],
    [w * 0.85, h * 0.85, 0.65, 0.14, 'rgba(255,190,110,0.18)'],
    [w * 0.35, h * 0.85, -0.32, 0.12, 'rgba(255,220,150,0.15)'],
    [w * 0.65, h * 0.85, 0.32, 0.12, 'rgba(255,220,150,0.15)'],
  ] as const) {
    const beamLen = w * 0.8;
    const a1 = -Math.PI / 2 + angle - spread / 2;
    const a2 = -Math.PI / 2 + angle + spread / 2;
    const bGrad = g.createRadialGradient(ox, oy, 10 * u, ox, oy, beamLen);
    bGrad.addColorStop(0, col);
    bGrad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bGrad;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(a1) * beamLen, oy + Math.sin(a1) * beamLen);
    g.lineTo(ox + Math.cos(a2) * beamLen, oy + Math.sin(a2) * beamLen);
    g.closePath();
    g.fill();
  }
  g.restore();

  // 3. Silhouette prison bars rising into the night
  g.save();
  g.fillStyle = 'rgba(12,6,6,0.85)';
  const barCount = 18;
  const barSpacing = w / barCount;
  for (let i = 0; i <= barCount; i++) {
    const bx = i * barSpacing;
    g.fillRect(bx - 3 * u, 0, 6 * u, h * 0.85);
  }
  // Cross bars
  g.fillRect(0, h * 0.22, w, 8 * u);
  g.fillRect(0, h * 0.62, w, 8 * u);
  g.restore();

  // 4. Central dramatic character: Debtor's chained devil silhouette with glowing eyes
  const cx = w / 2;
  const cy = h * 0.45;
  g.save();
  // Devil / warden dark horned silhouette
  g.fillStyle = '#140606';
  g.beginPath();
  g.ellipse(cx, cy, 110 * u, 130 * u, 0, 0, Math.PI * 2);
  g.fill();
  // Horns
  g.beginPath();
  g.moveTo(cx - 70 * u, cy - 60 * u);
  g.quadraticCurveTo(cx - 150 * u, cy - 180 * u, cx - 80 * u, cy - 210 * u);
  g.quadraticCurveTo(cx - 90 * u, cy - 120 * u, cx - 30 * u, cy - 90 * u);
  g.moveTo(cx + 70 * u, cy - 60 * u);
  g.quadraticCurveTo(cx + 150 * u, cy - 180 * u, cx + 80 * u, cy - 210 * u);
  g.quadraticCurveTo(cx + 90 * u, cy - 120 * u, cx + 30 * u, cy - 90 * u);
  g.fill();

  // Red glow behind devil
  glow(g, cx, cy, 220 * u, 'rgba(217,68,44,0.45)', 0.8);

  // Fiery glowing eyes
  glow(g, cx - 42 * u, cy - 25 * u, 35 * u, 'rgba(255,200,60,0.8)', 1);
  glow(g, cx + 42 * u, cy - 25 * u, 35 * u, 'rgba(255,200,60,0.8)', 1);
  g.fillStyle = '#fff4da';
  g.beginPath();
  g.ellipse(cx - 42 * u, cy - 25 * u, 14 * u, 7 * u, -0.2, 0, Math.PI * 2);
  g.ellipse(cx + 42 * u, cy - 25 * u, 14 * u, 7 * u, 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#84261a';
  g.beginPath();
  g.arc(cx - 40 * u, cy - 25 * u, 5 * u, 0, Math.PI * 2);
  g.arc(cx + 40 * u, cy - 25 * u, 5 * u, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 5. Heavy chains crossing from horns down to the corners
  const leftSag = sagPath(cx - 60 * u, cy + 40 * u, w * 0.08, h * 0.8, 40 * u);
  const rightSag = sagPath(cx + 60 * u, cy + 40 * u, w * 0.92, h * 0.8, 40 * u);
  chain(g, leftSag, 12, 36 * u, 9 * u);
  chain(g, rightSag, 12, 36 * u, 9 * u);

  // Giant chrome pinball in lower center
  steelBall(g, cx, h * 0.72, 54 * u);

  // 6. Backglass Main Title: "DEBTOR'S PRISON"
  const titleY = h * 0.2;
  const titleFont = `900 ${72 * u}px ${FONT.head}`;

  // Drop shadow
  text(g, "DEBTOR'S PRISON", cx, titleY + 6 * u, {
    font: titleFont,
    align: 'center',
    spacing: 10 * u,
    fill: 'rgba(0,0,0,0.85)',
  });
  // Black border
  text(g, "DEBTOR'S PRISON", cx, titleY, {
    font: titleFont,
    align: 'center',
    spacing: 10 * u,
    stroke: '#060202',
    strokeWidth: 16 * u,
  });
  // Golden chrome gradient fill
  const titleGrad = vgrad(g, titleY - 60 * u, titleY + 10 * u, [
    [0, '#ffffff'],
    [0.2, '#fff4da'],
    [0.48, PAL.brassHi],
    [0.52, PAL.brass],
    [1, PAL.brassLo],
  ]);
  text(g, "DEBTOR'S PRISON", cx, titleY, {
    font: titleFont,
    align: 'center',
    spacing: 10 * u,
    fill: titleGrad,
  });

  // Subtitle banner: "PAY OR FALL"
  text(g, "— PAY OR FALL —", cx, titleY + 36 * u, {
    font: `bold ${20 * u}px ${FONT.cond}`,
    align: 'center',
    spacing: 6 * u,
    fill: PAL.amber,
    shadow: 'rgba(0,0,0,0.9)',
    shadowBlur: 8,
  });

  // 7. Outer vintage backglass marquee frame
  g.save();
  g.strokeStyle = 'rgba(255,178,74,0.45)';
  g.lineWidth = 3 * u;
  g.strokeRect(12 * u, 12 * u, w - 24 * u, h - 24 * u);

  // Marquee corner brackets
  const cr = 40 * u;
  g.strokeStyle = PAL.amber;
  g.lineWidth = 5 * u;
  for (const [bx, by, dx, dy] of [
    [12 * u, 12 * u, 1, 1],
    [w - 12 * u, 12 * u, -1, 1],
    [12 * u, h - 12 * u, 1, -1],
    [w - 12 * u, h - 12 * u, -1, -1],
  ]) {
    g.beginPath();
    g.moveTo(bx + dx * cr, by);
    g.lineTo(bx, by);
    g.lineTo(bx, by + dy * cr);
    g.stroke();
  }
  g.restore();

  // 8. CRITICAL: Quiet strip for the live shot ladders on bottom (BACKGLASS_LEVEL_RECT)
  const [rx, ry, rw, rh] = BACKGLASS_LEVEL_RECT;
  const qx = rx * w;
  const qy = ry * h;
  const qw = rw * w;
  const qh = rh * h;

  g.save();
  g.fillStyle = '#060303';
  g.beginPath();
  g.roundRect(qx, qy, qw, qh, 6 * u);
  g.fill();
  g.strokeStyle = 'rgba(255,178,74,0.35)';
  g.lineWidth = 1.5 * u;
  g.stroke();
  g.restore();
}

/** Playfield Illustration (640 x 1280, transparent background) */
export function paintPlayfieldIllustration(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 640;
  const cx = w / 2;
  const cy = h * 0.52;

  // Symmetrical occult-prison pinball ornament
  g.save();

  // Radiating searchlight / aura rays
  const rays = 16;
  const rayLen = 380 * u;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const a2 = a + 0.08;
    g.fillStyle = i % 2 === 0 ? 'rgba(217,68,44,0.12)' : 'rgba(255,178,74,0.08)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * rayLen, cy + Math.sin(a) * rayLen);
    g.lineTo(cx + Math.cos(a2) * rayLen, cy + Math.sin(a2) * rayLen);
    g.closePath();
    g.fill();
  }

  // Concentric decorative rings
  for (const r of [80 * u, 140 * u, 210 * u, 280 * u]) {
    g.strokeStyle = 'rgba(255,178,74,0.22)';
    g.lineWidth = 2 * u;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }

  // Central ornate shackle & keyhole emblem
  glow(g, cx, cy, 140 * u, 'rgba(217,68,44,0.35)', 0.7);

  // Big shackle ring
  g.strokeStyle = 'rgba(244,232,204,0.6)';
  g.lineWidth = 16 * u;
  g.beginPath();
  g.arc(cx, cy, 95 * u, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(40,16,12,0.8)';
  g.lineWidth = 2 * u;
  g.beginPath();
  g.arc(cx, cy, 103 * u, 0, Math.PI * 2);
  g.arc(cx, cy, 87 * u, 0, Math.PI * 2);
  g.stroke();

  // Keyhole in center
  g.fillStyle = 'rgba(20,8,6,0.85)';
  g.beginPath();
  g.arc(cx, cy - 14 * u, 22 * u, 0, Math.PI * 2);
  g.moveTo(cx - 14 * u, cy);
  g.lineTo(cx - 24 * u, cy + 45 * u);
  g.lineTo(cx + 24 * u, cy + 45 * u);
  g.lineTo(cx + 14 * u, cy);
  g.closePath();
  g.fill();

  // Symmetrical flanking chains arching up
  const leftPath = sagPath(cx - 95 * u, cy, w * 0.08, h * 0.25, -60 * u);
  const rightPath = sagPath(cx + 95 * u, cy, w * 0.92, h * 0.25, -60 * u);
  chain(g, leftPath, 14, 38 * u, 9 * u);
  chain(g, rightPath, 14, 38 * u, 9 * u);

  // Lower chains draping towards flipper alley
  const lowLeft = sagPath(cx - 95 * u, cy + 40 * u, w * 0.12, h * 0.85, 50 * u);
  const lowRight = sagPath(cx + 95 * u, cy + 40 * u, w * 0.88, h * 0.85, 50 * u);
  chain(g, lowLeft, 16, 42 * u, 10 * u);
  chain(g, lowRight, 16, 42 * u, 10 * u);

  // Stylized watchman eyes above the emblem
  for (const ex of [cx - 160 * u, cx + 160 * u]) {
    g.save();
    g.fillStyle = 'rgba(244,232,204,0.4)';
    g.strokeStyle = 'rgba(40,16,12,0.6)';
    g.lineWidth = 2.5 * u;
    g.beginPath();
    g.moveTo(ex - 40 * u, cy - 150 * u);
    g.quadraticCurveTo(ex, cy - 180 * u, ex + 40 * u, cy - 150 * u);
    g.quadraticCurveTo(ex, cy - 120 * u, ex - 40 * u, cy - 150 * u);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(217,68,44,0.7)';
    g.beginPath();
    g.arc(ex, cy - 150 * u, 14 * u, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  g.restore();
}

/** Cabinet Side Decal (1536 x 512, 3:1) */
export function paintCabinetSide(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1536;

  // 1. Dark matte steel base
  const bg = vgrad(g, 0, h, [
    [0, '#242e37'],
    [0.5, '#171e24'],
    [1, '#0e1216'],
  ]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 2. Bold dynamic 70s racing chevrons / stripes across flank
  const stripes = [
    { color: '#84261a', w: 32 * u },
    { color: '#d9442c', w: 38 * u },
    { color: '#ffb24a', w: 42 * u },
    { color: '#f6dc8c', w: 28 * u },
  ];

  g.save();
  const skew = 0.55;
  for (const [idx, s] of stripes.entries()) {
    const xBase = w * 0.18 + idx * 45 * u;
    g.fillStyle = s.color;
    g.beginPath();
    g.moveTo(xBase, 0);
    g.lineTo(xBase + s.w, 0);
    g.lineTo(xBase + s.w + h * skew, h);
    g.lineTo(xBase + h * skew, h);
    g.closePath();
    g.fill();
  }

  // Reverse chevron accents on right
  for (const [idx, s] of stripes.entries()) {
    const xBase = w * 0.85 - idx * 35 * u;
    g.fillStyle = s.color;
    g.beginPath();
    g.moveTo(xBase, 0);
    g.lineTo(xBase + s.w * 0.7, 0);
    g.lineTo(xBase + s.w * 0.7 - h * skew * 0.6, h);
    g.lineTo(xBase - h * skew * 0.6, h);
    g.closePath();
    g.fill();
  }
  g.restore();

  // 3. Huge chained pinball tearing through the side
  const ballX = w * 0.78;
  const ballY = h * 0.5;
  const ballR = 120 * u;

  // Speed lines behind ball
  g.save();
  g.strokeStyle = 'rgba(255,178,74,0.4)';
  g.lineWidth = 4 * u;
  for (let i = -3; i <= 3; i++) {
    const ly = ballY + i * 28 * u;
    g.beginPath();
    g.moveTo(ballX - 350 * u, ly);
    g.lineTo(ballX - 80 * u, ly);
    g.stroke();
  }
  g.restore();

  // Trailing chain connecting from the left side
  const trailChain = sagPath(w * 0.05, h * 0.5, ballX - 80 * u, ballY, 30 * u);
  chain(g, trailChain, 22, 58 * u, 14 * u);

  // Big chrome steel ball
  glow(g, ballX, ballY, ballR * 1.8, 'rgba(255,178,74,0.3)', 0.6);
  steelBall(g, ballX, ballY, ballR);

  // 4. Cabinet typography: "DEBTOR'S PRISON"
  const titleX = w * 0.38;
  const titleY = h * 0.55;
  const font = `900 ${118 * u}px ${FONT.head}`;

  // Heavy shadow
  text(g, "DEBTOR'S PRISON", titleX, titleY + 8 * u, {
    font,
    align: 'center',
    spacing: 12 * u,
    fill: '#080c10',
  });
  // Black stroke
  text(g, "DEBTOR'S PRISON", titleX, titleY, {
    font,
    align: 'center',
    spacing: 12 * u,
    stroke: '#080c10',
    strokeWidth: 24 * u,
  });
  // Brass/gold gradient
  text(g, "DEBTOR'S PRISON", titleX, titleY, {
    font,
    align: 'center',
    spacing: 12 * u,
    fill: vgrad(g, titleY - 100 * u, titleY + 15 * u, [
      [0, '#ffffff'],
      [0.2, '#fff4da'],
      [0.48, PAL.brassHi],
      [0.52, PAL.brass],
      [1, PAL.brassLo],
    ]),
  });

  // Tagline under title
  text(g, "MODEL 1978 // STATE INDUSTRIAL PINBALL", titleX, titleY + 42 * u, {
    font: `bold ${22 * u}px ${FONT.cond}`,
    align: 'center',
    spacing: 5 * u,
    fill: PAL.amber,
    shadow: 'rgba(0,0,0,0.8)',
    shadowBlur: 6,
  });
}
