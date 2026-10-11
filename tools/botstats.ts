/**
 * Per-ball stat distributions at the three bot skill levels, on deadline-1 rules.
 *   npm run botstats -- [--balls 300] [--workers N] [--max-seconds 600]
 * Writes tools/out/botstats.json (per-ball earnings samples feed `npm run economy`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { defaultSnapshot } from '../src/bot/autoplay';
import type { BotSkillName } from '../src/bot/bot';
import type { GameEvent } from '../src/rules/types';
import { BallSession } from '../src/rules/session';
import { Bot } from '../src/bot/bot';
import { IS_MAIN, runPool, workerJob, ranges, quantile, argNum, defaultWorkers } from './lib/pool';

interface Job {
  skill: BotSkillName;
  from: number;
  to: number;
  maxSeconds: number;
}

interface BallRow {
  earned: number;
  seconds: number;
  cause: string;
  skillShots: number;
  saves: number;
  byShot: Record<string, number>;
}

function play(job: Job): BallRow[] {
  const rows: BallRow[] = [];
  for (let i = job.from; i < job.to; i++) {
    const byShot: Record<string, number> = {};
    let cause = 'timeout';
    let skillShots = 0;
    let saves = 0;
    const s = new BallSession(defaultSnapshot(500000 + i), (e: GameEvent) => {
      if (e.t === 'score') byShot[e.shot] = (byShot[e.shot] ?? 0) + e.amount;
      else if (e.t === 'drain') cause = e.cause;
      else if (e.t === 'skillShot') skillShots++;
      else if (e.t === 'ballSaved') saves++;
    });
    const bot = new Bot(job.skill, 977 * i + 13);
    bot.skillLane = () => s.game.machine.skillLane;
    const max = job.maxSeconds * 240;
    while (!s.over && s.steps < max) s.step(bot.decide(s.sim));
    rows.push({ earned: s.game.earned, seconds: s.steps / 240, cause, skillShots, saves, byShot });
  }
  return rows;
}

workerJob(play);

if (IS_MAIN) {
  const args = process.argv.slice(2);
  const balls = argNum(args, '--balls', 300);
  const workers = argNum(args, '--workers', defaultWorkers());
  const maxSeconds = argNum(args, '--max-seconds', 600);
  const skills: BotSkillName[] = ['novice', 'average', 'expert'];
  const t0 = Date.now();
  const jobs: Job[] = [];
  const per = Math.max(1, Math.floor(workers / skills.length));
  for (const skill of skills)
    for (const r of ranges(balls, per)) jobs.push({ skill, ...r, maxSeconds });
  const results = await runPool<Job, BallRow[]>(import.meta.url, jobs);
  const by: Record<string, BallRow[]> = {};
  results.forEach((rows, i) => (by[jobs[i].skill] ??= []).push(...rows));

  const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`;
  const out: Record<string, unknown> = {};
  console.log(
    `Bot stats: ${balls} balls per skill, deadline-1 rules (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`,
  );
  console.log(
    'skill    | coins mean  p10  p50  p90 | secs mean  p50 | coins/min | skill% saves | drains',
  );
  for (const skill of skills) {
    const rows = by[skill];
    const earned = rows.map((r) => r.earned).sort((a, b) => a - b);
    const secs = rows.map((r) => r.seconds).sort((a, b) => a - b);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const causes: Record<string, number> = {};
    for (const r of rows) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
    const shots: Record<string, number> = {};
    for (const r of rows)
      for (const [k, v] of Object.entries(r.byShot)) shots[k] = (shots[k] ?? 0) + v / rows.length;
    const skillPct = rows.filter((r) => r.skillShots > 0).length / rows.length;
    const saves = mean(rows.map((r) => r.saves));
    console.log(
      `${skill.padEnd(8)} | ${mean(earned).toFixed(1).padStart(10)} ${quantile(earned, 0.1).toFixed(1).padStart(4)} ${quantile(earned, 0.5).toFixed(1).padStart(4)} ${quantile(earned, 0.9).toFixed(1).padStart(4)} | ${mean(secs).toFixed(0).padStart(9)} ${quantile(secs, 0.5).toFixed(0).padStart(4)} | ${((mean(earned) / mean(secs)) * 60).toFixed(1).padStart(9)} | ${pct(skillPct, 1).padStart(6)} ${saves.toFixed(2).padStart(5)} | ${Object.entries(
        causes,
      )
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${pct(v, rows.length)}`)
        .join(', ')}`,
    );
    console.log(
      `${''.padEnd(8)}   coins per ball by source: ${Object.entries(shots)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v.toFixed(2)}`)
        .join(', ')}`,
    );
    out[skill] = {
      meanEarned: mean(earned),
      meanSeconds: mean(secs),
      causes,
      byShot: shots,
      earnedSamples: earned.map((e) => Math.round(e * 100) / 100),
    };
  }
  mkdirSync('tools/out', { recursive: true });
  writeFileSync('tools/out/botstats.json', JSON.stringify(out, null, 1));
  console.log('\nWrote tools/out/botstats.json');
}
