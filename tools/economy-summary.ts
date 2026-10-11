/**
 * Pools the per-archetype economy reports (tools/out/economy-<arch>.json, written by
 * `npm run economy -- --arch <a>`) into one table: clear rates at deadlines 1 and 4, win
 * rate per archetype, and how often each charm appears across all winning builds (the brief:
 * no charm in more than half of them).
 *   npm run economy:summary
 */
import { readdirSync, readFileSync } from 'node:fs';

interface Report {
  arch: string;
  runs: number;
  report: { deadline: number; cleared: number }[];
  winners: { result: string; charms: string[] }[];
}

const files = readdirSync('tools/out').filter((f) => /^economy-.+\.json$/.test(f));
if (!files.length) {
  console.error('No tools/out/economy-<arch>.json yet: run `npm run economy -- --arch <a>`.');
  process.exit(1);
}
const reports = files.map((f) => JSON.parse(readFileSync(`tools/out/${f}`, 'utf8')) as Report);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6);
console.log('archetype |  runs |     d1 |     d4 |   wins');
const all: Report['winners'] = [];
for (const r of reports.sort((a, b) => a.arch.localeCompare(b.arch))) {
  const at = (d: number) => r.report.find((x) => x.deadline === d)?.cleared ?? 0;
  console.log(
    `${r.arch.padEnd(9)} | ${String(r.runs).padStart(5)} | ${pct(at(1))} | ${pct(at(4))} | ${pct(r.winners.length / r.runs)}`,
  );
  all.push(...r.winners);
}
const freq = new Map<string, number>();
for (const w of all) for (const c of w.charms) freq.set(c, (freq.get(c) ?? 0) + 1);
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nWinning builds pooled: ${all.length}`);
console.log(
  top
    .slice(0, 12)
    .map(([c, n]) => `${c} ${Math.round((n / all.length) * 100)}%`)
    .join(', '),
);
const worst = top[0];
if (worst && worst[1] / all.length > 0.5)
  console.log(`\nOVER HALF: ${worst[0]} is in ${Math.round((worst[1] / all.length) * 100)}% of wins`);
else console.log('\nNo charm is in more than half of the winning builds.');
