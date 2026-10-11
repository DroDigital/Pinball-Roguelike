/**
 * DEBTOR'S PRISON — the one table, defined as data.
 *
 * Coordinates: 1 unit = 1 ball diameter (27 mm). x right, y up the table.
 * Main field x in [0, 18.4]; shooter lane x in [18.6, 19.9]. Left/right features
 * are mirrored about the main field centre (x = 9.2).
 */
import { arc, DEG, type P2 } from '../core/math';
import type {
  FlipperDef,
  LampDef,
  PostDef,
  SlingDef,
  TableDef,
  TransportDef,
  TriggerDef,
  WallDef,
} from '../sim/table-def';

const MX = 18.4; // main field right edge (shooter wall, field side)
const OUT = 19.9; // cabinet right wall
const ARCH_C: P2 = [9.95, 29];
const ARCH_R = 9.95;
const BOTTOM = -0.5;

const mx = (x: number): number => MX - x;
const mp = (p: P2): P2 => [MX - p[0], p[1]];
const mps = (pts: P2[]): P2[] => pts.map(mp);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const rp = (p: readonly number[]): P2 => [r3(p[0]), r3(p[1])];

/** A closed polygon around a polyline with the given thickness (offset to the right side). */
function thickLine(pts: P2[], t: number): P2[] {
  const right: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const l = Math.hypot(dx, dy) || 1;
    right.push([pts[i][0] + (dy / l) * t, pts[i][1] - (dx / l) * t]);
  }
  return [...pts, ...right.reverse()].map(rp);
}

/** Lane centreline: straight down from top to `bendY`, arc turning to `exitDeg`, then a straight. */
function laneCentre(
  x: number,
  topY: number,
  bendY: number,
  exitDeg: number,
  radius: number,
  straight: number,
) {
  const turnLeft = exitDeg > -90; // heading from -90 towards exitDeg
  const sign = turnLeft ? 1 : -1;
  const cx = x + sign * radius;
  const a0 = turnLeft ? Math.PI : 0;
  const delta = (exitDeg + 90) * DEG; // positive = CCW turn
  const pts: P2[] = [[x, topY]];
  const arcPts = arc(cx, bendY, radius, a0, a0 + delta, 10);
  pts.push(...arcPts.map(rp));
  const end = arcPts[arcPts.length - 1];
  const ex = Math.cos(exitDeg * DEG);
  const ey = Math.sin(exitDeg * DEG);
  pts.push(rp([end[0] + ex * straight, end[1] + ey * straight]));
  return { pts, centre: [cx, bendY] as P2, delta, a0 };
}

/** Lane wall offset from the centreline arc geometry (positive = away from turn centre). */
function laneWall(
  x: number,
  topY: number,
  bendY: number,
  exitDeg: number,
  radius: number,
  straight: number,
  offset: number,
): P2[] {
  const turnLeft = exitDeg > -90;
  const sign = turnLeft ? 1 : -1;
  const cx = x + sign * radius;
  const a0 = turnLeft ? Math.PI : 0;
  const delta = (exitDeg + 90) * DEG;
  const r = radius + offset;
  const wx = cx - sign * r;
  const pts: P2[] = [[r3(wx), topY]];
  const arcPts = arc(cx, bendY, r, a0, a0 + delta, 10);
  pts.push(...arcPts.map(rp));
  const end = arcPts[arcPts.length - 1];
  const ex = Math.cos(exitDeg * DEG);
  const ey = Math.sin(exitDeg * DEG);
  pts.push(rp([end[0] + ex * straight, end[1] + ey * straight]));
  return pts;
}

// ---------------------------------------------------------------- flippers
const FLIP_Y = 5.2;
const FLIP_LX = 5.86;
const FLIP_LEN = 2.6;
const FLIP_R0 = 0.48;
const FLIP_R1 = 0.24;
const FLIP_REST = -30;
const FLIP_UP = 22;

const flippers: FlipperDef[] = [
  {
    id: 'L',
    x: FLIP_LX,
    y: FLIP_Y,
    len: FLIP_LEN,
    r0: FLIP_R0,
    r1: FLIP_R1,
    restDeg: FLIP_REST,
    upDeg: FLIP_UP,
    side: 'left',
    button: 'left',
  },
  {
    id: 'R',
    x: mx(FLIP_LX),
    y: FLIP_Y,
    len: FLIP_LEN,
    r0: FLIP_R0,
    r1: FLIP_R1,
    restDeg: FLIP_REST,
    upDeg: FLIP_UP,
    side: 'right',
    button: 'right',
  },
  // Third Arm hardware mount: upper-right flipper on the right button.
  {
    id: 'U',
    // Against the column wall, clear of the Cell Block roof: balls roll off its back.
    x: 18.05,
    y: 26.4,
    len: 2.0,
    r0: 0.38,
    r1: 0.2,
    restDeg: -28,
    upDeg: 18,
    side: 'right',
    button: 'right',
    tag: 'mount:thirdArm',
  },
];

// ---------------------------------------------------------------- lower playfield (left side, mirrored)
// The inlane guide surface is collinear with the flipper's top tangent at rest so the
// ball rolls cleanly from guide to flipper, stepping down by a hair, never up.
const phi = Math.asin((FLIP_R0 - FLIP_R1) / FLIP_LEN);
const tanDir = FLIP_REST * DEG - phi; // top tangent direction
const tanN = tanDir + Math.PI / 2;
const tanPt: P2 = [FLIP_LX + FLIP_R0 * Math.cos(tanN), FLIP_Y + FLIP_R0 * Math.sin(tanN)];
const gdx = -Math.cos(tanDir); // up-left along the guide
const gdy = -Math.sin(tanDir);
const GUIDE_STEP = 0.04;
const guideBase: P2 = [
  tanPt[0] + Math.cos(tanN) * GUIDE_STEP,
  tanPt[1] + Math.sin(tanN) * GUIDE_STEP,
];
const guideAt = (s: number): P2 => [guideBase[0] + gdx * s, guideBase[1] + gdy * s];
const GUIDE_END = guideAt(0.6);
const DIV_X = 1.82; // inlane side of the inlane/outlane divider
const DIV_T = 0.25; // divider thickness
const sCorner = (DIV_X - guideBase[0]) / gdx;
const GUIDE_CORNER = guideAt(sCorner);
const DIV_TOP = 10.9; // permanent divider top
const POST_Y = 12.5; // outlane post (removable by Wide Open), level with the sling tops
const POST_R = 0.3;
/** Rubber Cement plug (left side): a sloped top running over the outlane post. */
const PLUG_POST_X = DIV_X - DIV_T / 2;
const PLUG_PTS: P2[] = [
  [0, 12.35],
  [PLUG_POST_X - 0.25, 12.35],
  // Past the post's top, so a ball rolls over it into the inlane instead of wedging.
  [PLUG_POST_X + 0.1, POST_Y + POST_R + 0.02],
  [0, 13.55],
];

// Clearance arc around the flipper pivot so the apron never touches the flipper base.
const pivotArc = arc(
  FLIP_LX,
  FLIP_Y,
  FLIP_R0 + 0.14,
  Math.atan2(GUIDE_END[1] - FLIP_Y, GUIDE_END[0] - FLIP_LX),
  235 * DEG,
  6,
).map(rp);

const apronL: P2[] = [
  [DIV_X - DIV_T, DIV_TOP],
  [DIV_X, DIV_TOP],
  rp(GUIDE_CORNER),
  rp(GUIDE_END),
  ...pivotArc.slice(1),
  [r3(pivotArc[pivotArc.length - 1][0]), BOTTOM],
  [DIV_X - DIV_T, BOTTOM],
];

// Outlane post extension (removable).
const postExtL: P2[] = [
  [DIV_X - DIV_T, DIV_TOP - 0.1],
  [DIV_X, DIV_TOP - 0.1],
  [DIV_X, POST_Y],
  [DIV_X - DIV_T, POST_Y],
];

// Slingshot: posts centred on the triangle corners; inlane clear width 1.3.
const INLANE_W = 1.38;
const SLING_POST_R = 0.3;
const slingX = DIV_X + INLANE_W + SLING_POST_R;
const gnx = Math.cos(tanN);
const gny = Math.sin(tanN);
const off = INLANE_W + SLING_POST_R;
const slingLineAt = (x: number): P2 => {
  // line parallel to the guide diagonal, offset by `off`
  const p0: P2 = [GUIDE_CORNER[0] + gnx * off, GUIDE_CORNER[1] + gny * off];
  const t = (x - p0[0]) / -gdx;
  return [x, p0[1] - gdy * t];
};
const SL_BL = rp(slingLineAt(slingX));
const SL_BR = rp(slingLineAt(5.4));
const SL_T: P2 = [r3(slingX), 12.75];

const slings: SlingDef[] = [
  { id: 'slingL', side: 'left', a: SL_T, b: SL_BR, c: SL_BL, postR: SLING_POST_R },
  { id: 'slingR', side: 'right', a: mp(SL_BR), b: mp(SL_T), c: mp(SL_BL), postR: SLING_POST_R },
];

// ---------------------------------------------------------------- orbits (The Perimeter)
const LANE_HALF = 0.85;
const ORBIT_L = { x: 0.87, top: 30.5, bend: 22.2, exit: -54, r: 5, straight: 1.2 };
// The right Perimeter is the shooter column: the plunger lane runs up into it through a
// one-way gate, and orbit shots enter through a funnel on the column's lower left, then
// bend once into the column and meet the arch tangentially (like classic machines).
const SHOOTER_TOP = 21.0;
const COL_WALL_X = 18.45; // centreline of the column's left wall
const COL_WALL_TOP = 30.2;
const PERIM_R_DIR = 59; // shot direction from the left flipper
const funnelPerp: P2 = [Math.cos((PERIM_R_DIR - 90) * DEG), Math.sin((PERIM_R_DIR - 90) * DEG)];
const FUNNEL_W = 2.45;
// Lower lip = shooter wall top; upper lip offset across the shot direction.
const funnelLow: P2 = [MX, SHOOTER_TOP];
const funnelUp: P2 = rp([
  funnelLow[0] - funnelPerp[0] * FUNNEL_W,
  funnelLow[1] - funnelPerp[1] * FUNNEL_W,
]);
const colWall: P2[] = [[COL_WALL_X, COL_WALL_TOP], [COL_WALL_X, 24.4], funnelUp];
const rFlankTip: P2 = rp([
  funnelLow[0] - 3.6 * Math.cos(PERIM_R_DIR * DEG),
  funnelLow[1] - 3.6 * Math.sin(PERIM_R_DIR * DEG),
]);

// Funnel mouth: the inner wall stops at the end of the bend; the outer lip runs on.
const orbitLInner = laneWall(
  ORBIT_L.x,
  ORBIT_L.top,
  ORBIT_L.bend,
  ORBIT_L.exit,
  ORBIT_L.r,
  0.15,
  -LANE_HALF,
);
const orbitLOuter = laneWall(
  ORBIT_L.x,
  ORBIT_L.bend,
  ORBIT_L.bend,
  ORBIT_L.exit,
  ORBIT_L.r,
  ORBIT_L.straight + 0.8,
  LANE_HALF,
);
const orbitLMouth = laneCentre(
  ORBIT_L.x,
  ORBIT_L.top,
  ORBIT_L.bend,
  ORBIT_L.exit,
  ORBIT_L.r,
  ORBIT_L.straight,
);

// Flank blocks fill between each orbit's outer guide and the cabinet; their lower faces
// slope toward the outlanes so balls that get up there come back down to the slings.
// Flank lower faces slope down toward the inlanes so balls that land on them are fed to the
// flippers rather than funnelled into the outlanes.
// Below each flank a shield face bounces cross-table traffic back toward the slings; the
// outlanes stay open beneath it (reachable by balls that get past the sling tops).
const SHIELD: P2 = [1.15, 15.0];
const flankL: P2[] = [[0, ORBIT_L.bend], ...orbitLOuter, SHIELD, [0, 14.6]];
const flankR: P2[] = [funnelLow, rFlankTip, mp(SHIELD), [MX, 14.6]];

// ---------------------------------------------------------------- top lanes and the Yard
// Lanes sit under the arch's right shoulder, where a plunged ball leaves the arch.
// Separator tops keep a constant 1.25+ clearance to the arch so orbit balls pass over.
const LANE_SEP_X = [12.55, 14.05, 15.55, 16.93];
const LANE_CLEAR_R = 8.55; // separator tops lie on this radius from the arch centre
const LANE_LEN = 2.2;
const laneTopAt = (x: number): number =>
  ARCH_C[1] + Math.sqrt(LANE_CLEAR_R ** 2 - (x - ARCH_C[0]) ** 2);
const laneSeps: WallDef[] = LANE_SEP_X.map((x, i) => {
  const top = laneTopAt(x);
  return {
    id: `laneSep${i}`,
    pts: [
      [r3(x - 0.1), r3(top - LANE_LEN)],
      [r3(x + 0.1), r3(top - LANE_LEN)],
      [r3(x + 0.1), r3(top - 0.1)],
      [r3(x), r3(top + 0.02)],
      [r3(x - 0.1), r3(top - 0.1)],
    ],
    loop: true,
    mat: 'metal',
    look: 'lane',
    h: 0.9,
  };
});
const laneEdges = LANE_SEP_X;
const laneCentres = [0, 1, 2].map((i) => (laneEdges[i] + laneEdges[i + 1]) / 2);
const laneMidY = laneCentres.map((c) => laneTopAt(c) - LANE_LEN / 2 - 0.2);

// ---------------------------------------------------------------- The Chute entrance
// A funnel aligned with a right-flipper shot: wide lips, narrowing to the incline channel.
const CHUTE_DIR = 111 * DEG;
const cdx = Math.cos(CHUTE_DIR);
const cdy = Math.sin(CHUTE_DIR);
const CHUTE_M: P2 = [4.75, 22.0];
const CHUTE_MOUTH_HW = 1.45;
const CHUTE_HW = 0.92;
const CHUTE_NECK = 1.5;
const CHUTE_LEN = 3.7;
const CHUTE_COMMIT = 3.0;
const cpx = Math.sin(CHUTE_DIR); // perpendicular (right side when facing uphill)
const cpy = -Math.cos(CHUTE_DIR);
const cAt = (s: number, side: number): P2 =>
  rp([CHUTE_M[0] + cdx * s + cpx * side, CHUTE_M[1] + cdy * s + cpy * side]);
const chuteLeftWall = thickLine(
  [cAt(0, -CHUTE_MOUTH_HW), cAt(CHUTE_NECK, -CHUTE_HW), cAt(CHUTE_LEN, -CHUTE_HW)],
  -0.18,
);
const chuteRightWall = thickLine(
  [cAt(0, CHUTE_MOUTH_HW), cAt(CHUTE_NECK, CHUTE_HW), cAt(CHUTE_LEN, CHUTE_HW)],
  0.18,
);

// ---------------------------------------------------------------- The Hole (scoop)
const HOLE_X = 7.9;
const HOLE: P2 = [HOLE_X, 25.2];
const HOLE_HW = 0.98; // cavity half-width
const HOLE_WALL = 0.27;
// Outer lower corners are chamfered so near-misses rebound toward the flippers, not down the middle.
const holeBlock: P2[] = [
  [HOLE_X - HOLE_HW - HOLE_WALL - 0.35, 24.6],
  [HOLE_X - HOLE_HW, 24.35],
  [HOLE_X - HOLE_HW, 25.75],
  [HOLE_X + HOLE_HW, 25.75],
  [HOLE_X + HOLE_HW, 24.35],
  [HOLE_X + HOLE_HW + HOLE_WALL + 0.35, 24.6],
  [HOLE_X + HOLE_HW + HOLE_WALL + 0.35, 26.3],
  [HOLE_X, 27.0],
  [HOLE_X - HOLE_HW - HOLE_WALL - 0.35, 26.3],
];

// ---------------------------------------------------------------- Cell Block drop targets
const DROP_A: P2 = [14.25, 20.3];
const DROP_B: P2 = [11.7, 21.8];
const dropDir: P2 = [(DROP_B[0] - DROP_A[0]) / 3, (DROP_B[1] - DROP_A[1]) / 3];
const dropTargets = [0, 1, 2].map((i) => {
  const a: P2 = rp([DROP_A[0] + dropDir[0] * (i + 0.08), DROP_A[1] + dropDir[1] * (i + 0.08)]);
  const b: P2 = rp([DROP_A[0] + dropDir[0] * (i + 0.92), DROP_A[1] + dropDir[1] * (i + 0.92)]);
  return { id: `drop${i}`, a, b };
});
const dlen = Math.hypot(DROP_B[0] - DROP_A[0], DROP_B[1] - DROP_A[1]);
const dnx = -(DROP_B[1] - DROP_A[1]) / dlen; // left normal of A->B (front face, toward flippers)
const dny = (DROP_B[0] - DROP_A[0]) / dlen;

// ---------------------------------------------------------------- walls
const cabinet: P2[] = [
  [0, BOTTOM],
  [0, ARCH_C[1]],
  ...arc(ARCH_C[0], ARCH_C[1], ARCH_R, Math.PI, 0, 48).slice(1, -1).map(rp),
  [OUT, ARCH_C[1]],
  [OUT, BOTTOM],
];

const shooterWall: P2[] = [
  [MX, BOTTOM],
  [MX + 0.2, BOTTOM],
  [MX + 0.2, SHOOTER_TOP - 0.15],
  [MX + 0.1, SHOOTER_TOP],
  [MX, SHOOTER_TOP - 0.15],
];

const walls: WallDef[] = [
  { id: 'cabinet', pts: cabinet, loop: true, mat: 'wood', look: 'cabinet', h: 2.2 },
  { id: 'shooterWall', pts: shooterWall, loop: true, mat: 'wood', look: 'guide', h: 1.2 },
  {
    id: 'plungerTip',
    pts: [
      [MX + 0.2, 1.0],
      [OUT, 1.0],
      [OUT, 1.6],
      [MX + 0.2, 1.6],
    ],
    loop: true,
    mat: 'rubber',
    look: 'invisible',
  },
  { id: 'apronL', pts: apronL, loop: true, mat: 'metal', look: 'apron', h: 1.0 },
  { id: 'apronR', pts: mps(apronL), loop: true, mat: 'metal', look: 'apron', h: 1.0 },
  {
    id: 'postExtL',
    pts: postExtL,
    loop: true,
    mat: 'metal',
    look: 'guide',
    h: 1.0,
    tag: 'outlanePosts',
  },
  {
    id: 'postExtR',
    pts: mps(postExtL),
    loop: true,
    mat: 'metal',
    look: 'guide',
    h: 1.0,
    tag: 'outlanePosts',
  },
  { id: 'flankL', pts: flankL, loop: true, mat: 'wood', look: 'block', h: 1.4 },
  { id: 'flankR', pts: flankR, loop: true, mat: 'wood', look: 'block', h: 1.4 },
  {
    id: 'orbitLInner',
    pts: thickLine(orbitLInner, -0.2),
    loop: true,
    mat: 'metal',
    look: 'guide',
    h: 1.0,
  },
  {
    id: 'orbitRWall',
    pts: thickLine(colWall, 0.18),
    loop: true,
    mat: 'metal',
    look: 'guide',
    h: 1.0,
  },
  ...laneSeps,
  { id: 'chuteWallL', pts: chuteLeftWall, loop: true, mat: 'plastic', look: 'rail', h: 1.0 },
  { id: 'chuteWallR', pts: chuteRightWall, loop: true, mat: 'plastic', look: 'rail', h: 1.0 },
  // Fills the slot between the Chute's left wall and the left orbit guide (a ball trap) and
  // roofs over the Chute's back so anything landing there rolls off to the right.
  {
    id: 'chuteFill',
    pts: [
      [r3(ORBIT_L.x + LANE_HALF + 0.2), 27.7],
      rp([cAt(CHUTE_LEN, CHUTE_HW + 0.18)[0] + 0.35, cAt(CHUTE_LEN, CHUTE_HW + 0.18)[1] + 0.12]),
      cAt(CHUTE_LEN, CHUTE_HW),
      cAt(CHUTE_LEN, -CHUTE_HW),
      cAt(CHUTE_NECK, -CHUTE_HW - 0.18),
      cAt(0, -CHUTE_MOUTH_HW - 0.18),
      [r3(ORBIT_L.x + LANE_HALF + 0.25), 22.3],
    ],
    loop: true,
    mat: 'wood',
    look: 'block',
    h: 1.2,
  },

  { id: 'holeBlock', pts: holeBlock, loop: true, mat: 'wood', look: 'block', h: 1.4 },
  {
    id: 'holeBolt',
    pts: [
      [HOLE_X - HOLE_HW, 24.45],
      [HOLE_X + HOLE_HW, 24.45],
      [HOLE_X + HOLE_HW, 24.75],
      [HOLE_X - HOLE_HW, 24.75],
    ],
    loop: true,
    mat: 'metal',
    look: 'plug',
    h: 1.0,
    tag: 'boltedHole',
  },
  // Roof over the Cell Block: rolls traffic from the Yard back into the centre corridor
  // (instead of down the right side into the outlane).
  {
    id: 'cellRoof',
    pts: [
      // Nose: the low end turns down so balls drop toward the flippers, not across the table.
      [11.6, 21.8],
      [12.4, 22.38],
      // Covers the funnel's upper lip: balls falling down the right side land on this gentle
      // slope instead of a 45-degree metal face that fired them into the left outlane.
      [COL_WALL_X - 0.05, 24.42],
      funnelUp,
      rp([DROP_A[0] - dnx * 0.5, DROP_A[1] - dny * 0.5]),
    ],
    loop: true,
    mat: 'wood',
    look: 'block',
    h: 1.2,
  },
  // Rubber Cement: plugs over both outlane entrances.
  {
    id: 'plugL',
    // Sloped top running over the outlane post, so balls roll into the inlane.
    pts: PLUG_PTS,
    loop: true,
    mat: 'rubber',
    look: 'plug',
    h: 0.8,
    tag: 'plugOutlanes',
  },
  {
    id: 'plugR',
    pts: mps(PLUG_PTS),
    loop: true,
    mat: 'rubber',
    look: 'plug',
    h: 0.8,
    tag: 'plugOutlanes',
  },
];

// ---------------------------------------------------------------- posts
const posts: PostDef[] = [
  { id: 'outPostL', x: DIV_X - DIV_T / 2, y: POST_Y, r: POST_R, mat: 'post', tag: 'outlanePosts' },
  {
    id: 'outPostR',
    x: mx(DIV_X - DIV_T / 2),
    y: POST_Y,
    r: POST_R,
    mat: 'post',
    tag: 'outlanePosts',
  },
  { id: 'divCapL', x: DIV_X - DIV_T / 2, y: DIV_TOP, r: DIV_T / 2 + 0.02, mat: 'metal' },
  { id: 'divCapR', x: mx(DIV_X - DIV_T / 2), y: DIV_TOP, r: DIV_T / 2 + 0.02, mat: 'metal' },
  {
    id: 'chuteLipL',
    x: cAt(0, -CHUTE_MOUTH_HW - 0.12)[0],
    y: cAt(0, -CHUTE_MOUTH_HW - 0.12)[1],
    r: 0.2,
    mat: 'post',
  },
  {
    id: 'chuteLipR',
    x: cAt(0, CHUTE_MOUTH_HW + 0.12)[0],
    y: cAt(0, CHUTE_MOUTH_HW + 0.12)[1],
    r: 0.2,
    mat: 'post',
  },
  { id: 'holeLipL', x: HOLE_X - HOLE_HW - 0.14, y: 24.35, r: 0.16, mat: 'post' },
  { id: 'holeLipR', x: HOLE_X + HOLE_HW + 0.14, y: 24.35, r: 0.16, mat: 'post' },
  { id: 'orbitLTop', x: orbitLInner[0][0] + 0.1, y: orbitLInner[0][1], r: 0.12, mat: 'metal' },
  { id: 'orbitRTop', x: COL_WALL_X - 0.09, y: COL_WALL_TOP, r: 0.12, mat: 'metal' },
  // Bent Nail hardware mount: narrows the left outlane entrance.
  { id: 'bentNail', x: 0.05, y: 12.3, r: 0.27, mat: 'metal', tag: 'mount:bentNail' },
];

// ---------------------------------------------------------------- triggers
const tr = (id: string, a: P2, b: P2): TriggerDef => ({ id, a: rp(a), b: rp(b) });
// Orientation convention: a ball crossing toward the LEFT side of a->b reports dir = +1.
// Each trigger is oriented so its "expected" crossing is +1 (lanes/inlanes/outlanes: down;
// orbit entries/shooter exit: up; archTop: +1 when travelling right-to-left over the top).
const triggers: TriggerDef[] = [
  ...laneCentres.map((c, i) =>
    tr(`lane${'ABC'[i]}`, [c + 0.6, laneMidY[i]], [c - 0.6, laneMidY[i]]),
  ),
  tr('inlaneL', [slingX - SLING_POST_R, 11.2], [DIV_X, 11.2]),
  tr('inlaneR', [mx(DIV_X), 11.2], [mx(slingX - SLING_POST_R), 11.2]),
  tr('outlaneL', [DIV_X - DIV_T, 10.0], [0, 10.0]),
  tr('outlaneR', [MX, 10.0], [mx(DIV_X - DIV_T), 10.0]),
  tr('centerDrain', [mx(FLIP_LX - 0.5), 2.2], [FLIP_LX - 0.5, 2.2]),
  tr('perimL', [0, 24.6], [orbitLInner[0][0], 24.6]),
  tr('perimLTop', [0, 28.8], [orbitLInner[0][0], 28.8]),
  tr('perimRTop', [COL_WALL_X, 28.8], [OUT, 28.8]),
  tr(
    'perimR',
    [
      funnelUp[0] + 0.55 * Math.cos(PERIM_R_DIR * DEG),
      funnelUp[1] + 0.55 * Math.sin(PERIM_R_DIR * DEG),
    ],
    [
      funnelLow[0] + 0.55 * Math.cos(PERIM_R_DIR * DEG),
      funnelLow[1] + 0.55 * Math.sin(PERIM_R_DIR * DEG),
    ],
  ),
  tr('archTop', [ARCH_C[0], 35.6], [ARCH_C[0], ARCH_C[1] + ARCH_R]),
  tr('shooterExit', [MX + 0.2, 20.0], [OUT, 20.0]),
];

const chuteMouth = tr('chuteMouth', cAt(0.3, -CHUTE_MOUTH_HW), cAt(0.3, CHUTE_MOUTH_HW));
const chuteCommit = tr('chuteCommit', cAt(CHUTE_COMMIT, -CHUTE_HW), cAt(CHUTE_COMMIT, CHUTE_HW));

// ---------------------------------------------------------------- transports
const INLANE_CX = DIV_X + INLANE_W / 2;
const transports: TransportDef[] = [
  {
    id: 'chute',
    look: 'ramp',
    time: 1.05,
    path: [
      [...cAt(CHUTE_COMMIT, 0), 0.25],
      [...cAt(CHUTE_LEN + 1.0, 0), 1.1],
      [4.3, 28.3, 1.9],
      [3.2, 29.6, 2.4],
      [1.9, 29.0, 2.6],
      [1.35, 26.8, 2.6],
      [1.5, 22.5, 2.4],
      [2.0, 18.0, 1.9],
      [INLANE_CX, 14.0, 1.1],
      [INLANE_CX, 11.9, 0.35],
    ],
    exit: [r3(INLANE_CX), 11.6],
    exitVel: [0, -9],
  },
  {
    id: 'holeWire',
    look: 'wire',
    time: 1.3,
    path: [
      [HOLE[0], HOLE[1], 0],
      [HOLE_X + 0.1, 25.6, 1.4],
      [9.8, 27.6, 2.6],
      [12.2, 31.8, 3.0],
      [15.2, 32.6, 3.0],
      [16.25, 29.5, 2.8],
      [16.2, 22.0, 2.4],
      [mx(INLANE_CX) + 0.05, 15.0, 1.4],
      [mx(INLANE_CX), 12.2, 0.4],
    ],
    exit: [r3(mx(INLANE_CX)), 11.6],
    exitVel: [0, -9],
  },
  {
    // Balls coming back down the shooter column return to the right inlane over a wire.
    id: 'colWire',
    look: 'wire',
    time: 1.0,
    path: [
      [19.25, 22.6, 0.6],
      [19.2, 21.2, 1.4],
      [18.6, 19.6, 2.0],
      [17.4, 18.0, 2.1],
      [mx(INLANE_CX) + 0.05, 15.0, 1.4],
      [mx(INLANE_CX), 12.2, 0.4],
    ],
    exit: [r3(mx(INLANE_CX)), 11.6],
    exitVel: [0, -9],
  },
  {
    id: 'skillWire',
    look: 'wire',
    time: 1.2,
    path: [
      [19.25, 17.6, 0.3],
      [19.25, 20.5, 1.1],
      [19.25, 25.0, 2.0],
      [18.9, 28.4, 2.4],
      [17.6, 29.2, 2.8],
      [16.6, 27.5, 2.8],
      [16.2, 22.0, 2.4],
      [mx(INLANE_CX) + 0.05, 15.0, 1.4],
      [mx(INLANE_CX), 12.2, 0.4],
    ],
    exit: [r3(mx(INLANE_CX)), 11.6],
    exitVel: [0, -9],
  },
];

// ---------------------------------------------------------------- lamps (inserts)
const lamps: LampDef[] = [
  ...laneCentres.map(
    (c, i): LampDef => ({
      id: `lane${'ABC'[i]}`,
      x: r3(c),
      y: r3(laneMidY[i] - 1.6),
      shape: 'circle',
      size: 0.4,
      rot: 0,
      color: 'amber',
      label: 'ABC'[i],
    }),
  ),
  {
    id: 'arrowChute',
    x: cAt(-1.6, 0)[0],
    y: cAt(-1.6, 0)[1],
    shape: 'arrow',
    size: 0.9,
    rot: 107,
    color: 'yellow',
  },
  { id: 'arrowPerimL', x: 3.3, y: 17.6, shape: 'arrow', size: 0.85, rot: 127, color: 'blue' },
  { id: 'arrowPerimR', x: 15.3, y: 17.9, shape: 'arrow', size: 0.85, rot: 59, color: 'blue' },
  { id: 'arrowHole', x: HOLE_X, y: 22.6, shape: 'arrow', size: 0.85, rot: 90, color: 'red' },
  { id: 'arrowCell', x: 11.9, y: 18.6, shape: 'arrow', size: 0.85, rot: 65, color: 'green' },
  ...dropTargets.map(
    (d, i): LampDef => ({
      id: `drop${i}`,
      x: r3((d.a[0] + d.b[0]) / 2 + dnx * 0.9),
      y: r3((d.a[1] + d.b[1]) / 2 + dny * 0.9),
      shape: 'rect',
      size: 0.38,
      rot: 0,
      color: 'green',
    }),
  ),
  {
    id: 'lockup',
    x: HOLE_X,
    y: 23.6,
    shape: 'circle',
    size: 0.42,
    rot: 0,
    color: 'red',
    label: 'LOCK',
  },
  { id: 'kickback', x: 0.75, y: 7.4, shape: 'triangle', size: 0.45, rot: 90, color: 'orange' },
  { id: 'shootAgain', x: 9.2, y: 1.6, shape: 'star', size: 0.55, rot: 0, color: 'red' },
  { id: 'ballSave', x: 9.2, y: 3.0, shape: 'circle', size: 0.38, rot: 0, color: 'white' },
  { id: 'skill', x: 14.6, y: 31.0, shape: 'arrow', size: 0.6, rot: 150, color: 'white' },
  // Bonus multiplier row above the flippers.
  ...[2, 3, 4, 5].map(
    (m, i): LampDef => ({
      id: `bonusX${m}`,
      x: r3(7.4 + i * 1.2),
      y: 13.7,
      shape: 'circle',
      size: 0.34,
      rot: 0,
      color: 'amber',
      label: `${m}X`,
    }),
  ),
  // The Hole's award ladder (lit = next award, collect at the Hole).
  ...['bonusX', 'kickback', 'hurryUp', 'shotLevel', 'extraBall'].map(
    (a, i): LampDef => ({
      id: `award_${a}`,
      x: r3(6.6 + i * 1.1),
      y: r3(16.9 + Math.sin((i / 4) * Math.PI) * 0.45),
      shape: 'circle',
      size: 0.3,
      rot: 0,
      color: 'violet',
    }),
  ),
  // Shot level ladders behind each major arrow: lit for levels 2, 3 and 4+.
  ...levelLadder('chute', cAt(-1.6, 0), 107),
  ...levelLadder('perimeter', [3.3, 17.6], 127),
  ...levelLadder('hole', [HOLE_X, 22.6], 90),
  ...levelLadder('cellblock', [11.9, 18.6], 65),
];

function levelLadder(shot: string, at: readonly number[], rot: number): LampDef[] {
  const dx = Math.cos(rot * DEG);
  const dy = Math.sin(rot * DEG);
  return [0, 1, 2].map((k) => ({
    id: `lvl_${shot}_${k + 2}`,
    x: r3(at[0] - dx * (0.95 + 0.5 * k)),
    y: r3(at[1] - dy * (0.95 + 0.5 * k)),
    shape: 'circle',
    size: 0.17,
    rot: 0,
    color: 'white',
  }));
}

// ---------------------------------------------------------------- assembled table
export const TABLE: TableDef = {
  name: "DEBTOR'S PRISON",
  width: OUT,
  height: ARCH_C[1] + ARCH_R,
  walls,
  posts,
  oneWays: [
    { id: 'shooterGate', a: [MX + 0.1, SHOOTER_TOP], b: [OUT, SHOOTER_TOP + 0.85], mat: 'metal' },
  ],
  flippers,
  bumpers: [
    { id: 'pop0', x: 11.0, y: 30.6, r: 1.1 },
    { id: 'pop1', x: 14.4, y: 30.4, r: 1.1 },
    { id: 'pop2', x: 12.7, y: 27.5, r: 1.1 },
    { id: 'pop3', x: 7.9, y: 30.8, r: 1.1, tag: 'mount:spareBumper' },
  ],
  slings,
  dropBanks: [{ id: 'cellBlock', targets: dropTargets }],
  spinners: [{ id: 'searchlight', a: [COL_WALL_X + 0.1, 26.5], b: [OUT, 26.5] }],
  triggers,
  transports,
  chute: {
    incline: [
      cAt(0.2, -CHUTE_MOUTH_HW),
      cAt(0.2, CHUTE_MOUTH_HW),
      cAt(CHUTE_NECK, CHUTE_HW),
      cAt(CHUTE_LEN + 0.3, CHUTE_HW),
      cAt(CHUTE_LEN + 0.3, -CHUTE_HW),
      cAt(CHUTE_NECK, -CHUTE_HW),
    ],
    downhill: [r3(-cdx), r3(-cdy)],
    mouth: chuteMouth,
    commit: chuteCommit,
    transport: 'chute',
  },
  hole: {
    id: 'hole',
    x: HOLE[0],
    y: HOLE[1],
    captureR: 0.7,
    boltTag: 'boltedHole',
    transport: 'holeWire',
  },
  plunger: { x: 19.25, y: 2.1, minX: MX + 0.2, maxX: OUT, maxY: 3.2 },
  kickback: {
    id: 'kickback',
    trigger: tr('kickbackL', [DIV_X - DIV_T, 6.2], [0, 6.2]),
    x: 0.75,
    y: 4.6,
  },
  diverter: { trigger: tr('diverter', [MX + 0.2, 18.6], [OUT, 18.6]), transport: 'skillWire' },
  returns: [{ trigger: tr('colReturn', [OUT, 22.6], [COL_WALL_X, 22.6]), transport: 'colWire' }],
  drainY: 0.6,
  bounds: cabinet,
  mounts: [
    { id: 'bentNail', kind: 'post', tag: 'mount:bentNail' },
    { id: 'spareBumper', kind: 'bumper', tag: 'mount:spareBumper' },
    { id: 'goldFilling', kind: 'gold', tag: 'mount:goldFilling', ref: 'pop2' },
    { id: 'thirdArm', kind: 'flipper', tag: 'mount:thirdArm' },
  ],
  lamps,
  restSpots: [
    { x: 19.25, y: 2.1, r: 0.6 },
    { x: GUIDE_END[0] + 0.3, y: GUIDE_END[1] + 0.6, r: 1.2 },
    { x: mx(GUIDE_END[0] + 0.3), y: GUIDE_END[1] + 0.6, r: 1.2 },
  ],
};

/** Exposed for tools/tests that want derived geometry. */
export const TABLE_GEOM = {
  orbitLMouth: orbitLMouth.pts[orbitLMouth.pts.length - 1],
  orbitRMouth: [(funnelUp[0] + funnelLow[0]) / 2, (funnelUp[1] + funnelLow[1]) / 2] as P2,
  guideEnd: GUIDE_END,
  chuteMouth: CHUTE_M,
  hole: HOLE,
  laneCentres,
};
