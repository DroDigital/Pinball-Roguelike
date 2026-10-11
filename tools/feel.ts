/**
 * Feel targets report (M1 checks). Prints PASS/FAIL per target and writes tools/out/feel.json.
 *   npm run feel [-- --balls 200]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  makeSim,
  cradle,
  holdInput,
  flipperOf,
  shotFromCradle,
  techniqueCradle,
  techniquePostPass,
  techniqueLiveCatch,
  techniqueNudgeSave,
  type Side,
} from '../src/bot/scenarios';
import { SHOT_TABLE } from '../src/bot/shot-table';
import { playSessionBall, defaultSnapshot } from '../src/bot/autoplay';
import { Rng } from '../src/core/rng';

const args = process.argv.slice(2);
const nBalls = Number(args[args.indexOf('--balls') + 1] || 200);
const report: Record<string, unknown> = {};
const lines: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`);
  report[name] = { ok, detail };
};

// 1. Flipper response and upswing.
{
  const sim = makeSim(1);
  stepN(sim, 30);
  const f = sim.flippers[0];
  sim.stepOnce(holdInput('left'));
  const responds = Math.abs(f.body.getAngularVelocity()) > 1;
  let steps = 1;
  while (f.progress < 0.97 && steps < 200) {
    sim.stepOnce(holdInput('left'));
    steps++;
  }
  const ms = (steps / 240) * 1000;
  check(
    'flipper responds next step',
    responds,
    `omega after 1 step = ${f.body.getAngularVelocity().toFixed(1)} rad/s`,
  );
  check('flipper upswing ~45 ms', ms >= 35 && ms <= 55, `${ms.toFixed(1)} ms`);
}
function stepN(sim: ReturnType<typeof makeSim>, n: number) {
  for (let i = 0; i < n; i++) sim.stepOnce(holdInput('none'));
}

// 2. Full tip shot time to the top: a ball fed from the inlane rolls down the lowered bat and
// is flipped when it reaches the tip region; time from flip to the top of the table.
{
  const times: number[] = [];
  for (const side of ['left', 'right'] as Side[]) {
    for (let d = 100; d < 400; d++) {
      const sim = makeSim(5);
      const f = flipperOf(sim, side);
      sim.spawnBall(side === 'left' ? 2.4 : 16.0, 11.6, 0, -6);
      for (let i = 0; i < d; i++) sim.stepOnce(holdInput('none'));
      const b = sim.balls[0];
      if (!b) continue;
      const along = Math.hypot(b.x - f.def.x, b.y - f.def.y) / f.def.len;
      if (along < 0.7 || along > 1.0 || b.y > f.def.y + 0.5) continue;
      for (let i = 0; i < 480; i++) {
        sim.stepOnce(i < 40 ? holdInput(side) : holdInput('none'));
        const bb = sim.balls[0];
        if (!bb) break;
        if (bb.y >= 32) {
          times.push((i + 1) / 240);
          break;
        }
      }
    }
  }
  times.sort((a, b) => a - b);
  const med = times.length ? times[times.length >> 1] : -1;
  check(
    'full tip shot reaches top ~0.7 s',
    med > 0.55 && med < 0.85,
    `median ${med.toFixed(2)} s over ${times.length} tip shots that reach the top`,
  );
}

// 3. Cradle -> major shot success with human timing jitter (+-2 steps = +-8 ms).
{
  const rng = new Rng(99);
  const majors = ['chute', 'perimeter', 'hole'] as const;
  for (const side of ['left', 'right'] as Side[]) {
    let bestRate = 0;
    let bestName = '';
    const parts: string[] = [];
    for (const target of majors) {
      const delay = SHOT_TABLE[side][target];
      if (delay === undefined) continue;
      let ok = 0;
      const N = 60;
      for (let i = 0; i < N; i++) {
        const sim = makeSim(100 + i);
        if (!cradle(sim, side)) continue;
        const d = delay + rng.int(-2, 2);
        if (shotFromCradle(sim, side, d) === target) ok++;
      }
      const rate = ok / N;
      parts.push(`${target} ${(rate * 100).toFixed(0)}%`);
      if (rate > bestRate) {
        bestRate = rate;
        bestName = target;
      }
    }
    check(
      `cradle major shot 70%+ (${side})`,
      bestRate >= 0.7,
      `best ${bestName} ${(bestRate * 100).toFixed(0)}% [${parts.join(', ')}]`,
    );
  }
}

// 4. Techniques.
for (const side of ['left', 'right'] as Side[]) {
  check(`cradle works (${side})`, techniqueCradle(side).ok, '');
  const pp = techniquePostPass(side);
  check(`post pass works (${side})`, pp.ok, `${pp.windows}/${pp.searched} timings`);
  const lc = techniqueLiveCatch(side);
  check(
    `live catch works (${side})`,
    lc.ok,
    `rebound ${lc.naiveRebound.toFixed(2)} -> ${lc.bestRebound.toFixed(2)}`,
  );
  const ns = techniqueNudgeSave(side);
  check(`nudge save works (${side})`, ns.ok, `${ns.windows}/${ns.searched} timings`);
}

// 5. Bot ball time + drain causes with full rules (deadline 1, ball save).
{
  for (const skill of ['novice', 'average', 'expert'] as const) {
    const times: number[] = [];
    const causes: Record<string, number> = {};
    let earned = 0;
    for (let i = 0; i < nBalls; i++) {
      const r = playSessionBall(defaultSnapshot(20000 + i), skill, 777 + i);
      times.push(r.seconds);
      causes[r.cause] = (causes[r.cause] ?? 0) + 1;
      earned += r.earned;
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    times.sort((a, b) => a - b);
    const center = (causes.center ?? 0) / nBalls;
    const hist = Object.entries(causes)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${((v / nBalls) * 100).toFixed(0)}%`)
      .join(', ');
    report[`bot_${skill}`] = {
      mean,
      median: times[times.length >> 1],
      causes,
      coinsPerBall: earned / nBalls,
    };
    lines.push(
      `info  bot ${skill.padEnd(8)} mean ${mean.toFixed(1)} s, median ${times[times.length >> 1].toFixed(1)} s, ${(earned / nBalls).toFixed(1)} coins/ball; drains: ${hist}`,
    );
    if (skill === 'average') {
      // The typical ball must sit in 45-90 s; the mean carries a heavy tail of multiball and
      // marathon balls, so it gets a ceiling instead (see DESIGN.md decisions).
      const median = times[times.length >> 1];
      check(
        'competent bot 45-90 s per ball',
        median >= 45 && median <= 90 && mean <= 100,
        `median ${median.toFixed(1)} s, mean ${mean.toFixed(1)} s (${nBalls} balls)`,
      );
      check('centre drains < 25%', center < 0.25, `${(center * 100).toFixed(0)}%`);
    }
  }
}

console.log(lines.join('\n'));
mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/feel.json', JSON.stringify(report, null, 2));
