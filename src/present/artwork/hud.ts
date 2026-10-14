/**
 * Procedural in-game HUD bezels:
 * - hud/score-panel (machined steel frame housing DMD display and score)
 * - hud/ledger-panel (phosphor CRT monitor frame with green bloom for pocket/bank/debt)
 * - hud/status-panel (tactical rack frame with brass STATUS nameplate)
 */
import { HEAD_RECT } from '../../content/art';
import {
  BRASS,
  FONT,
  PAL,
  chamfer,
  grow,
  plate,
  px,
  recess,
  rr,
  screw,
  text,
  type Box,
  type Ctx,
} from './kit';
import { hazardSlot, lamp } from './metal';
import type { Painter } from './index';

/** HUD Score & DMD Bezel */
function paintHudScore(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;

  // Outer steel bezel
  const m = 12 * u;
  const outer: Box = [m, m, w - 2 * m, h - 2 * m];
  plate(
    g,
    outer,
    chamfer(outer, 24 * u),
    {
      fill: [PAL.steelHi, PAL.steel, PAL.steelLo],
      seed: 'hud-score',
      brush: true,
      grain: 0.08,
      rim: 1,
    },
    2.5 * u,
  );

  // Inner recessed bezel around content
  const contentBox = grow(px([0.11, 0.245, 0.78, 0.49], w, h), 16 * u);
  recess(g, contentBox, rr(contentBox, 16 * u), ['#06080b', '#0d1116'], 1.2);

  // Screws at corners
  const d = 34 * u;
  screw(g, outer[0] + d, outer[1] + d, 6 * u, 0.4);
  screw(g, outer[0] + outer[2] - d, outer[1] + d, 6 * u, 1.8);
  screw(g, outer[0] + d, outer[1] + outer[3] - d, 6 * u, 2.7);
  screw(g, outer[0] + outer[2] - d, outer[1] + outer[3] - d, 6 * u, 0.9);

  // Top nameplate badge
  const badgeW = 280 * u;
  const badgeH = 28 * u;
  const badgeBox: Box = [w / 2 - badgeW / 2, outer[1] + 16 * u, badgeW, badgeH];
  plate(g, badgeBox, rr(badgeBox, 5 * u), { ...BRASS, seed: 'score-badge' }, 1.5 * u);
  text(g, "DEBTOR'S PRISON // DMD", w / 2, badgeBox[1] + badgeH * 0.72, {
    font: `bold ${14 * u}px ${FONT.cond}`,
    align: 'center',
    spacing: 2 * u,
    fill: '#2a1a08',
  });

  // Pilot lamps on both sides
  lamp(g, outer[0] + 55 * u, h / 2, 8 * u, PAL.amber, true);
  lamp(g, outer[0] + outer[2] - 55 * u, h / 2, 8 * u, PAL.red, false);

  // Lower ventilation / hazard accent
  hazardSlot(g, [w * 0.2, outer[1] + outer[3] - 28 * u, w * 0.6, 14 * u], u);
}

/** HUD Ledger Bezel (green phosphor CRT display) */
function paintHudLedger(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 900;

  const m = 10 * u;
  const outer: Box = [m, m, w - 2 * m, h - 2 * m];
  plate(
    g,
    outer,
    chamfer(outer, 28 * u),
    {
      fill: ['#37424c', '#222a31', '#141a20'],
      seed: 'hud-ledger',
      brush: true,
      grain: 0.08,
      rim: 1,
    },
    2.5 * u,
  );

  // Inner phosphor screen window
  const contentBox = grow(px([0.165, 0.245, 0.67, 0.5], w, h), 16 * u);
  recess(g, contentBox, rr(contentBox, 32 * u), ['#020b05', '#04150a'], 1.4);

  // CRT scanlines & phosphor bloom over window
  g.save();
  rr(contentBox, 32 * u)(g);
  g.clip();
  const bloom = g.createRadialGradient(
    contentBox[0] + contentBox[2] / 2,
    contentBox[1] + contentBox[3] / 2,
    0,
    contentBox[0] + contentBox[2] / 2,
    contentBox[1] + contentBox[3] / 2,
    contentBox[2] * 0.7,
  );
  bloom.addColorStop(0, 'rgba(114,255,153,0.18)');
  bloom.addColorStop(0.7, 'rgba(20,80,35,0.06)');
  bloom.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = bloom;
  g.fillRect(...contentBox);

  // Scanlines
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = contentBox[1]; y < contentBox[1] + contentBox[3]; y += 3 * u) {
    g.fillRect(contentBox[0], y, contentBox[2], 1.2 * u);
  }

  // Curved glass sheen reflection
  const refl = g.createLinearGradient(
    contentBox[0],
    contentBox[1],
    contentBox[0] + contentBox[2] * 0.6,
    contentBox[1] + contentBox[3] * 0.5,
  );
  refl.addColorStop(0, 'rgba(255,255,255,0.12)');
  refl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = refl;
  g.beginPath();
  g.moveTo(contentBox[0], contentBox[1]);
  g.lineTo(contentBox[0] + contentBox[2] * 0.6, contentBox[1]);
  g.lineTo(contentBox[0], contentBox[1] + contentBox[3] * 0.45);
  g.closePath();
  g.fill();
  g.restore();

  // Corner screws
  const d = 34 * u;
  screw(g, outer[0] + d, outer[1] + d, 6 * u, 0.8);
  screw(g, outer[0] + outer[2] - d, outer[1] + d, 6 * u, 1.4);
  screw(g, outer[0] + d, outer[1] + outer[3] - d, 6 * u, 2.1);
  screw(g, outer[0] + outer[2] - d, outer[1] + outer[3] - d, 6 * u, 0.3);

  // Header plate: "COIN LEDGER"
  const headW = 240 * u;
  const headH = 26 * u;
  const headBox: Box = [w / 2 - headW / 2, outer[1] + 20 * u, headW, headH];
  plate(
    g,
    headBox,
    rr(headBox, 4 * u),
    {
      fill: ['#203024', '#121e15', '#0a120c'],
      rim: 0.6,
      seed: 'ledger-head',
      edge: '#040805',
    },
    1.5 * u,
  );
  text(g, 'VAULT COIN LEDGER', w / 2, headBox[1] + headH * 0.72, {
    font: `bold ${13 * u}px ${FONT.mono}`,
    align: 'center',
    spacing: 2 * u,
    fill: '#72ff99',
  });

  // Power status lamp below CRT
  lamp(g, w / 2, outer[1] + outer[3] - 40 * u, 7 * u, '#72ff99', true);
  text(g, 'TERMINAL ACTIVE', w / 2, outer[1] + outer[3] - 18 * u, {
    font: `${11 * u}px ${FONT.mono}`,
    align: 'center',
    spacing: 1 * u,
    fill: '#a8f6b5',
  });
}

/** HUD Status Panel Bezel */
function paintHudStatus(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 900;

  const m = 10 * u;
  const outer: Box = [m, m, w - 2 * m, h - 2 * m];
  plate(
    g,
    outer,
    chamfer(outer, 28 * u),
    {
      fill: [PAL.steelHi, PAL.steel, PAL.steelLo],
      seed: 'hud-status',
      brush: true,
      grain: 0.08,
      rim: 1,
    },
    2.5 * u,
  );

  // Recessed status well
  const contentBox = grow(px([0.125, 0.255, 0.75, 0.56], w, h), 14 * u);
  recess(g, contentBox, rr(contentBox, 18 * u), ['#06090c', '#0d1217'], 1.2);

  // Brass STATUS nameplate at HEAD_RECT.hudStatus
  const headRect = HEAD_RECT.hudStatus!;
  const headBox = grow(px(headRect, w, h), 10 * u, 4 * u);
  plate(g, headBox, rr(headBox, 6 * u), { ...BRASS, seed: 'status-plate' }, 1.8 * u);
  screw(g, headBox[0] + 16 * u, headBox[1] + headBox[3] / 2, 4.5 * u, 0.5);
  screw(g, headBox[0] + headBox[2] - 16 * u, headBox[1] + headBox[3] / 2, 4.5 * u, 1.9);

  // Corner screws
  const d = 34 * u;
  screw(g, outer[0] + d, outer[1] + d, 6 * u, 0.6);
  screw(g, outer[0] + outer[2] - d, outer[1] + d, 6 * u, 1.7);
  screw(g, outer[0] + d, outer[1] + outer[3] - d, 6 * u, 2.5);
  screw(g, outer[0] + outer[2] - d, outer[1] + outer[3] - d, 6 * u, 0.2);

  // Bottom rack slots
  hazardSlot(g, [w * 0.16, outer[1] + outer[3] - 32 * u, w * 0.68, 16 * u], u);
}

export const HUD_PAINTERS: Record<'hud/score-panel' | 'hud/ledger-panel' | 'hud/status-panel', Painter> = {
  'hud/score-panel': paintHudScore,
  'hud/ledger-panel': paintHudLedger,
  'hud/status-panel': paintHudStatus,
};
