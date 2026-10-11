/**
 * Physics soak: the bot plays N balls (full rules, mixed skills) across worker threads.
 * Fails on tunnelling, escapes, or a stuck ball the watchdog missed. Prints a drain-cause
 * histogram.  npm run soak -- --balls 10000 [--workers 4] [--max-seconds 300]
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { BallSession } from '../src/rules/session';
import { defaultSnapshot } from '../src/bot/autoplay';
import { Bot, type BotSkillName } from '../src/bot/bot';

interface Job {
  from: number;
  to: number;
  maxSeconds: number;
  skill: string;
}

interface Tally {
  balls: number;
  seconds: number;
  times: number[];
  causes: Record<string, number>;
  tunnelled: number;
  escapes: number;
  rescues: number;
  reserves: number;
  /** Balls stuck longer than the watchdog allows without being rescued. */
  missedStuck: number;
  timeouts: number;
  maxSpeed: number;
  failures: string[];
}

const SKILLS: BotSkillName[] = ['novice', 'average', 'expert'];

function runRange(job: Job): Tally {
  const t: Tally = {
    balls: 0,
    seconds: 0,
    times: [],
    causes: {},
    tunnelled: 0,
    escapes: 0,
    rescues: 0,
    reserves: 0,
    missedStuck: 0,
    timeouts: 0,
    maxSpeed: 0,
    failures: [],
  };
  for (let i = job.from; i < job.to; i++) {
    const skill = job.skill === 'mixed' ? SKILLS[i % 3] : (job.skill as BotSkillName);
    let cause = '';
    const s = new BallSession(defaultSnapshot(100000 + i), (e) => {
      if (e.t === 'drain') cause = e.cause;
    });
    const bot = new Bot(skill, 31 * i + 7);
    bot.skillLane = () => s.game.machine.skillLane;
    const max = job.maxSeconds * 240;
    let cursor = 0;
    const stuckLimit = (s.sim.cfg.watchdog.stuckTime + 1.0) * 240;
    const still = new Map<number, number>();
    while (!s.over && s.steps < max) {
      s.step(bot.decide(s.sim));
      cursor = s.sim.events.read(cursor, (e) => {
        if (e.type === 'escape') {
          t.escapes++;
          t.failures.push(`escape ball ${i} @${e.x.toFixed(2)},${e.y.toFixed(2)}`);
        } else if (e.type === 'rescue') t.rescues++;
        else if (e.type === 'reserve') t.reserves++;
      });
      if (s.steps % 12 === 0) {
        const tun = s.sim.findTunnelled();
        if (tun.length) {
          t.tunnelled += tun.length;
          for (const b of tun)
            t.failures.push(`tunnel ball ${i} @${b.x.toFixed(2)},${b.y.toFixed(2)}`);
        }
      }
      for (const b of s.sim.balls) {
        if (b.state !== 'field') continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > t.maxSpeed) t.maxSpeed = sp;
        // Independent stuck check: a ball barely moving outside rest spots for too long.
        const inRest = s.sim.table.restSpots.some(
          (r) => (b.x - r.x) ** 2 + (b.y - r.y) ** 2 < r.r * r.r,
        );
        if (sp < 0.3 && !inRest) {
          const n = (still.get(b.id) ?? 0) + 1;
          still.set(b.id, n);
          if (n === stuckLimit) {
            t.missedStuck++;
            t.failures.push(`stuck ball ${i} @${b.x.toFixed(2)},${b.y.toFixed(2)}`);
          }
        } else still.delete(b.id);
      }
    }
    if (!s.over) t.timeouts++;
    t.balls++;
    t.seconds += s.steps / 240;
    t.times.push(s.steps / 240);
    const c = s.over ? cause || 'unknown' : 'timeout';
    t.causes[c] = (t.causes[c] ?? 0) + 1;
  }
  return t;
}

function merge(a: Tally, b: Tally): Tally {
  for (const [k, v] of Object.entries(b.causes)) a.causes[k] = (a.causes[k] ?? 0) + v;
  a.balls += b.balls;
  a.seconds += b.seconds;
  a.times.push(...b.times);
  a.tunnelled += b.tunnelled;
  a.escapes += b.escapes;
  a.rescues += b.rescues;
  a.reserves += b.reserves;
  a.missedStuck += b.missedStuck;
  a.timeouts += b.timeouts;
  a.maxSpeed = Math.max(a.maxSpeed, b.maxSpeed);
  a.failures.push(...b.failures);
  return a;
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const arg = (k: string, d: number) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
  const balls = arg('--balls', 1000);
  const workers = arg('--workers', Math.max(1, cpus().length));
  const maxSeconds = arg('--max-seconds', 300);
  const skill = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : 'mixed';
  const t0 = Date.now();
  const per = Math.ceil(balls / workers);
  const jobs: Promise<Tally>[] = [];
  for (let w = 0; w < workers; w++) {
    const job: Job = { from: w * per, to: Math.min(balls, (w + 1) * per), maxSeconds, skill };
    if (job.from >= job.to) continue;
    jobs.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./lib/worker-entry.mjs', import.meta.url), {
          workerData: { ...job, __module: import.meta.url },
        });
        worker.on('message', resolve);
        worker.on('error', reject);
      }),
    );
  }
  const total = (await Promise.all(jobs)).reduce(merge);
  const wall = (Date.now() - t0) / 1000;
  const hist = Object.entries(total.causes)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `  ${k.padEnd(10)} ${String(v).padStart(6)}  ${((v / total.balls) * 100).toFixed(1)}%`,
    )
    .join('\n');
  console.log(
    `Soak: ${total.balls} balls, ${(total.seconds / 3600).toFixed(1)} h simulated in ${wall.toFixed(0)} s (${(total.seconds / wall).toFixed(0)}x)`,
  );
  total.times.sort((a, b) => a - b);
  console.log(
    `Bot skill: ${skill}. Mean ball ${(total.seconds / total.balls).toFixed(1)} s, median ${total.times[total.times.length >> 1].toFixed(1)} s, max ball speed ${total.maxSpeed.toFixed(1)} u/s`,
  );
  console.log(`Drain causes:\n${hist}`);
  console.log(
    `Watchdog rescues ${total.rescues}, re-serves ${total.reserves}, timeouts ${total.timeouts}`,
  );
  console.log(
    `Tunnelling ${total.tunnelled}, escapes ${total.escapes}, missed stuck ${total.missedStuck}`,
  );
  const clean = total.tunnelled === 0 && total.escapes === 0 && total.missedStuck === 0;
  if (!clean) console.log(total.failures.slice(0, 30).join('\n'));
  mkdirSync('tools/out', { recursive: true });
  writeFileSync(
    'tools/out/soak.json',
    JSON.stringify(
      { ...total, times: undefined, failures: total.failures.slice(0, 200), wall },
      null,
      2,
    ),
  );
  console.log(clean ? 'SOAK CLEAN' : 'SOAK FAILED');
  process.exit(clean ? 0 : 1);
} else {
  parentPort!.postMessage(runRange(workerData as Job));
}
