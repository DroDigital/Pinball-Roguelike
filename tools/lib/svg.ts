/** Debug SVG rendering of a TableDef (+ optional ball paths) for visual inspection. */
import type { TableDef } from '../../src/sim/table-def';
import type { P2 } from '../../src/core/math';
import { DEG } from '../../src/core/math';

export interface SvgOptions {
  scale?: number;
  showTagged?: boolean;
  paths?: { pts: P2[]; color: string }[];
  dots?: { x: number; y: number; r: number; color: string }[];
  labels?: boolean;
  /** Crop to [x0, y0, x1, y1] in table units. */
  crop?: [number, number, number, number];
}

export function tableSvg(t: TableDef, o: SvgOptions = {}): string {
  const s = o.scale ?? 24;
  const W = t.width + 1;
  const H = t.height + 2;
  const X = (x: number) => ((x + 0.5) * s).toFixed(1);
  const Y = (y: number) => ((H - 1 - y) * s).toFixed(1);
  const poly = (pts: readonly P2[], loop: boolean) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('') + (loop ? 'Z' : '');
  const out: string[] = [];
  if (o.crop) {
    const [x0, y0, x1, y1] = o.crop;
    const vx = Number(X(x0));
    const vy = Number(Y(y1));
    const vw = (x1 - x0) * s;
    const vh = (y1 - y0) * s;
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${vw * 3}" height="${vh * 3}" viewBox="${vx} ${vy} ${vw} ${vh}" style="background:#111">`,
    );
  } else
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W * s}" height="${H * s}" style="background:#111">`,
    );
  // grid
  for (let y = 0; y <= 40; y += 5)
    out.push(
      `<line x1="${X(0)}" y1="${Y(y)}" x2="${X(t.width)}" y2="${Y(y)}" stroke="#222" stroke-width="1"/><text x="2" y="${Y(y)}" fill="#555" font-size="10">${y}</text>`,
    );
  for (let x = 0; x <= 20; x += 5)
    out.push(
      `<line x1="${X(x)}" y1="${Y(-0.5)}" x2="${X(x)}" y2="${Y(40)}" stroke="#222" stroke-width="1"/><text x="${X(x)}" y="${Y(-1)}" fill="#555" font-size="10">${x}</text>`,
    );
  const tagOk = (tag?: string) => !tag || o.showTagged;
  for (const w of t.walls) {
    if (!tagOk(w.tag)) continue;
    const col = w.tag
      ? '#c6f'
      : w.look === 'block'
        ? '#a86'
        : w.look === 'apron'
          ? '#889'
          : w.look === 'rail'
            ? '#6cf'
            : '#ccc';
    out.push(
      `<path d="${poly(w.pts, !!w.loop)}" fill="${w.loop && w.look !== 'cabinet' ? col + '44' : 'none'}" stroke="${col}" stroke-width="1.5"/>`,
    );
  }
  for (const ow of t.oneWays)
    out.push(
      `<path d="${poly([ow.a, ow.b], false)}" stroke="#f80" stroke-width="2" stroke-dasharray="4 2"/>`,
    );
  for (const p of t.posts) {
    if (!tagOk(p.tag)) continue;
    out.push(
      `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r * s}" fill="${p.tag ? '#c6f8' : '#eee8'}" stroke="#fff"/>`,
    );
  }
  for (const b of t.bumpers) {
    if (!tagOk(b.tag)) continue;
    out.push(
      `<circle cx="${X(b.x)}" cy="${Y(b.y)}" r="${b.r * s}" fill="#d33a" stroke="#f66" stroke-width="2"/>`,
    );
  }
  for (const sl of t.slings) {
    out.push(
      `<path d="${poly([sl.a, sl.b, sl.c], true)}" fill="#fa04" stroke="#fa0" stroke-width="2"/>`,
    );
    out.push(`<path d="${poly([sl.a, sl.b], false)}" stroke="#ff0" stroke-width="4"/>`);
    for (const p of [sl.a, sl.b, sl.c])
      out.push(
        `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${sl.postR * s}" fill="none" stroke="#fa0"/>`,
      );
  }
  for (const bank of t.dropBanks)
    for (const d of bank.targets)
      out.push(`<path d="${poly([d.a, d.b], false)}" stroke="#3f3" stroke-width="5"/>`);
  for (const sp of t.spinners)
    out.push(
      `<path d="${poly([sp.a, sp.b], false)}" stroke="#ff0" stroke-width="3" stroke-dasharray="2 2"/>`,
    );
  for (const f of t.flippers) {
    if (!tagOk(f.tag)) continue;
    for (const [ang, col] of [
      [f.restDeg, '#4af'],
      [f.upDeg, '#4af6'],
    ] as const) {
      const a = (f.side === 'left' ? ang : 180 - ang) * DEG;
      const tx = f.x + Math.cos(a) * f.len;
      const ty = f.y + Math.sin(a) * f.len;
      out.push(
        `<circle cx="${X(f.x)}" cy="${Y(f.y)}" r="${f.r0 * s}" fill="${col}"/><circle cx="${X(tx)}" cy="${Y(ty)}" r="${f.r1 * s}" fill="${col}"/>`,
      );
      out.push(
        `<line x1="${X(f.x)}" y1="${Y(f.y)}" x2="${X(tx)}" y2="${Y(ty)}" stroke="${col}" stroke-width="${(f.r0 + f.r1) * s}"/>`,
      );
    }
  }
  const trig = (id: string, a: P2, b: P2, col: string) => {
    out.push(`<path d="${poly([a, b], false)}" stroke="${col}" stroke-width="1.5"/>`);
    // arrow for positive direction (left normal)
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    out.push(
      `<line x1="${X(mx)}" y1="${Y(my)}" x2="${X(mx - (dy / l) * 0.5)}" y2="${Y(my + (dx / l) * 0.5)}" stroke="${col}" stroke-width="1.5"/>`,
    );
    if (o.labels)
      out.push(`<text x="${X(mx)}" y="${Y(my)}" fill="${col}" font-size="9">${id}</text>`);
  };
  for (const tg of t.triggers) trig(tg.id, tg.a, tg.b, '#0f8');
  trig('mouth', t.chute.mouth.a, t.chute.mouth.b, '#0ff');
  trig('commit', t.chute.commit.a, t.chute.commit.b, '#0ff');
  trig('kick', t.kickback.trigger.a, t.kickback.trigger.b, '#f80');
  trig('div', t.diverter.trigger.a, t.diverter.trigger.b, '#f80');
  out.push(`<path d="${poly(t.chute.incline, true)}" fill="#0ff2" stroke="none"/>`);
  out.push(
    `<circle cx="${X(t.hole.x)}" cy="${Y(t.hole.y)}" r="${t.hole.captureR * s}" fill="#f008" stroke="#f00"/>`,
  );
  for (const tp of t.transports) {
    out.push(
      `<path d="${poly(
        tp.path.map((p) => [p[0], p[1]] as P2),
        false,
      )}" stroke="#88f" stroke-width="2" fill="none" stroke-dasharray="6 3"/>`,
    );
    out.push(
      `<circle cx="${X(tp.exit[0])}" cy="${Y(tp.exit[1])}" r="${0.5 * s}" fill="none" stroke="#88f"/>`,
    );
  }
  for (const l of t.lamps)
    out.push(
      `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="${l.size * s * 0.6}" fill="none" stroke="#ff08" stroke-dasharray="2 2"/>`,
    );
  out.push(`<circle cx="${X(t.plunger.x)}" cy="${Y(t.plunger.y)}" r="${0.5 * s}" fill="#ccc"/>`);
  for (const p of o.paths ?? [])
    out.push(
      `<path d="${poly(p.pts, false)}" stroke="${p.color}" stroke-width="1" fill="none" opacity="0.7"/>`,
    );
  for (const d of o.dots ?? [])
    out.push(`<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="${d.r * s}" fill="${d.color}"/>`);
  out.push('</svg>');
  return out.join('\n');
}
