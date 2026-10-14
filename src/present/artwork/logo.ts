/**
 * The Ball & Chain title logo, drawn edge to edge on a 3:1 canvas (1500 x 500).
 * Features a bold metallic wordmark, an integrated chrome pinball, and heavy industrial chain links.
 */
import {
  FONT,
  PAL,
  chain,
  glow,
  makeCanvas,
  sagPath,
  steelBall,
  text,
  vgrad,
  type Ctx,
} from './kit';

export function paintLogo(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1500;

  // Visual center
  const cy = h * 0.52;

  // 1. Heavy draped chain running across and sagging in the middle
  const sag = sagPath(w * 0.05, cy - 20 * u, w * 0.95, cy - 20 * u, 120 * u);
  chain(g, sag, 26, 56 * u, 14 * u);

  // 2. Anchor chain dropping down to the pinball
  const anchorSag = sagPath(w * 0.5, cy + 25 * u, w * 0.5, h * 0.81, 6 * u);
  chain(g, anchorSag, 5, 46 * u, 12 * u);

  // 3. Chrome pinball emblem resting at bottom center
  const ballR = 64 * u;
  const ballX = w * 0.5;
  const ballY = h * 0.81;
  glow(g, ballX, ballY, ballR * 2.5, 'rgba(255,178,74,0.35)', 0.7);
  steelBall(g, ballX, ballY, ballR);

  // Ball highlight ring
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 3 * u;
  g.beginPath();
  g.arc(ballX, ballY, ballR * 0.85, -Math.PI * 0.75, -Math.PI * 0.25);
  g.stroke();
  g.restore();

  // 4. Large bold typography: "BALL", "&", "CHAIN"
  const textCanvas = makeCanvas(w, h);
  const tg = textCanvas.getContext('2d')!;

  const fontSize = 195 * u;
  const font = `900 ${fontSize}px ${FONT.head}`;

  const ballTextX = w * 0.28;
  const chainTextX = w * 0.72;
  const textY = cy + 42 * u;

  // Multi-layered drop shadow for 3D punch
  for (let s = 1; s <= 6; s++) {
    const shadowDy = s * 4 * u;
    text(g, 'BALL', ballTextX, textY + shadowDy, {
      font,
      align: 'center',
      spacing: 14 * u,
      fill: `rgba(0,0,0,${0.35 - s * 0.04})`,
    });
    text(g, 'CHAIN', chainTextX, textY + shadowDy, {
      font,
      align: 'center',
      spacing: 14 * u,
      fill: `rgba(0,0,0,${0.35 - s * 0.04})`,
    });
  }

  // Black heavy outline
  text(g, 'BALL', ballTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    stroke: '#06080b',
    strokeWidth: 32 * u,
  });
  text(g, 'CHAIN', chainTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    stroke: '#06080b',
    strokeWidth: 32 * u,
  });

  // Brass bevel outline
  text(g, 'BALL', ballTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    stroke: PAL.brassLo,
    strokeWidth: 16 * u,
  });
  text(g, 'CHAIN', chainTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    stroke: PAL.brassLo,
    strokeWidth: 16 * u,
  });

  // Inner metallic gradient
  const grad = vgrad(g, textY - fontSize * 0.88, textY + fontSize * 0.12, [
    [0.0, '#ffffff'],
    [0.15, '#fff6de'],
    [0.44, PAL.brassHi],
    [0.48, '#e0aa40'],
    [0.52, PAL.brass],
    [0.82, PAL.brassLo],
    [1.0, '#2e1906'],
  ]);

  text(g, 'BALL', ballTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    fill: grad,
  });
  text(g, 'CHAIN', chainTextX, textY, {
    font,
    align: 'center',
    spacing: 14 * u,
    fill: grad,
  });

  // Specular top glint
  tg.clearRect(0, 0, w, h);
  text(tg, 'BALL', ballTextX, textY, { font, align: 'center', spacing: 14 * u, fill: '#fff' });
  text(tg, 'CHAIN', chainTextX, textY, { font, align: 'center', spacing: 14 * u, fill: '#fff' });
  g.save();
  g.globalAlpha = 0.45;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.rect(0, textY - fontSize * 0.88, w, fontSize * 0.35);
  g.clip();
  g.drawImage(textCanvas, 0, 0);
  g.restore();

  // 5. The "&" in center - steel bezel with glowing amber glyph
  const ampY = cy + 10 * u;
  const ampFontSize = 100 * u;
  const ampFont = `900 ${ampFontSize}px ${FONT.head}`;

  // Shackle backing circle
  g.save();
  g.fillStyle = '#0a0d10';
  g.beginPath();
  g.arc(w * 0.5, ampY - 26 * u, 54 * u, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAL.amber;
  g.lineWidth = 4 * u;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 1.5 * u;
  g.beginPath();
  g.arc(w * 0.5, ampY - 26 * u, 51 * u, -Math.PI * 0.8, -Math.PI * 0.2);
  g.stroke();
  g.restore();

  text(g, '&', w * 0.5, ampY, {
    font: ampFont,
    align: 'center',
    stroke: '#06080b',
    strokeWidth: 16 * u,
  });
  text(g, '&', w * 0.5, ampY, {
    font: ampFont,
    align: 'center',
    fill: vgrad(g, ampY - ampFontSize * 0.8, ampY, [
      [0, '#fff4da'],
      [0.45, PAL.amber],
      [1, '#9b4212'],
    ]),
  });

  // 6. Subtitle banner plate
  const tagW = 380 * u;
  const tagH = 28 * u;
  const tagX = w * 0.5 - tagW / 2;
  const tagY = cy - fontSize * 0.85;

  g.save();
  g.fillStyle = 'rgba(6,9,12,0.95)';
  g.strokeStyle = PAL.amber;
  g.lineWidth = 1.8 * u;
  g.beginPath();
  g.roundRect(tagX, tagY, tagW, tagH, 5 * u);
  g.fill();
  g.stroke();

  text(g, 'DEBTOR’S ROGUELIKE PINBALL', w * 0.5, tagY + tagH * 0.72, {
    font: `700 ${15 * u}px ${FONT.cond}`,
    align: 'center',
    spacing: 3.5 * u,
    fill: PAL.amber,
  });
  g.restore();
}
