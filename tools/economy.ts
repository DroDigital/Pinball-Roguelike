/**
 * Monte Carlo economy: plays whole runs with a simple money policy and reports how many runs
 * clear each deadline.
 *   npm run economy -- [--runs 2000] [--skill average] [--mode sampled|physics] [--workers N]
 *     [--red] (accept red-call bargains) [--loans] (borrow to cover a shortfall)
 * sampled: ball earnings drawn from tools/out/botstats.json (run `npm run botstats` first).
 *          Fast; good for tuning debt curves, prices and interest.
 * physics: every ball is played by the bot on the real table (slow; use few runs).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Rng } from '../src/core/rng';
import { Bot, type BotSkillName } from '../src/bot/bot';
import { BallSession, type BallSnapshot } from '../src/rules/session';
import { ECONOMY } from '../src/content/balance';
import {
  newRun,
  buyBalls,
  maxAffordableBalls,
  ballPrice,
  ballsLeft,
  nextBall,
  finishBall,
  deposit,
  endRound,
  settleDeadline,
  pickJob,
  canPayEarly,
  payEarly,
  loanAvailable,
  borrow,
  choosePerk,
  acceptBargain,
  hangUp,
  type BallOutcome,
  type RunState,
} from '../src/rules/run';
import { attachBot } from '../src/bot/autoplay';
import { emptyBallStats } from '../src/content/jobs';
import {
  IS_MAIN,
  runPool,
  workerJob,
  ranges,
  quantile,
  argNum,
  argStr,
  defaultWorkers,
} from './lib/pool';

interface Job {
  from: number;
  to: number;
  skill: BotSkillName;
  mode: 'sampled' | 'physics';
  samples: number[];
  /** Sampled mode: multiply sampled ball earnings (what-if for payout tuning). */
  scale: number;
  policy: Policy;
}

interface Policy {
  red: boolean;
  loans: boolean;
}

interface RunRow {
  reached: number;
  result: string;
  balls: number;
  /** Bank + Pocket at each deadline's settlement. */
  funds: number[];
}

const PERK_PREF = ['freeBall', 'levels', 'bonusMax', 'interest', 'ballSave', 'tickets'];

/**
 * Player policy: take the first Job, buy as many balls as possible while keeping enough for
 * next round, pay early when the Bank allows, prefer free balls and levels on the phone,
 * optionally take red-call bargains and cover a shortfall with a loan.
 */
function playRun(
  seed: number,
  ball: (snap: BallSnapshot, r: RunState) => BallOutcome,
  policy: Policy,
): RunRow {
  const r = newRun(`ECON${seed}`);
  const funds: number[] = [];
  while (r.phase !== 'over') {
    if (r.phase === 'pickJob') {
      if (canPayEarly(r)) {
        funds.push(r.bank);
        payEarly(r);
        continue;
      }
      pickJob(r, 0);
      continue;
    }
    if (r.phase === 'buyBalls') {
      buyBalls(r, maxAffordableBalls(r));
      continue;
    }
    if (r.phase === 'betweenBalls' && ballsLeft(r) > 0) {
      finishBall(r, ball(nextBall(r), r));
      continue;
    }
    if (r.phase === 'betweenBalls') {
      // Keep enough for a full rack next round; bank the rest for interest.
      const keep =
        r.round + 1 >= ECONOMY.roundsPerDeadline
          ? 0
          : ballPrice(r) * (ECONOMY.maxBallsPerRound - 1);
      deposit(r, Math.max(0, r.pocket - keep));
      endRound(r);
      continue;
    }
    if (r.phase === 'deadline') {
      deposit(r, r.pocket);
      if (policy.loans && r.bank < r.debt && r.bank + loanAvailable(r) >= r.debt) {
        borrow(r, r.debt - r.bank);
        deposit(r, r.pocket);
      }
      funds.push(r.bank);
      settleDeadline(r);
      continue;
    }
    if (r.phase === 'phone') {
      const call = r.call!;
      if (call.kind === 'perks') {
        let best = 0;
        let rank = 1e9;
        call.offers.forEach((o, i) => {
          const k = PERK_PREF.indexOf(o.id);
          if (k >= 0 && k < rank) {
            rank = k;
            best = i;
          }
        });
        choosePerk(r, best);
      } else if (policy.red) acceptBargain(r, 0);
      else hangUp(r);
    }
  }
  return { reached: r.deadline, result: r.result ?? 'fell', balls: r.stats.balls, funds };
}

function work(job: Job): RunRow[] {
  const rows: RunRow[] = [];
  for (let i = job.from; i < job.to; i++) {
    const rng = new Rng(9001 + i);
    let n = 0;
    const ball =
      job.mode === 'sampled'
        ? (_snap: BallSnapshot, r: RunState): BallOutcome => ({
            // Deadline-1 samples scaled by shot levels gained so far (rough).
            earned: job.samples[rng.int(0, job.samples.length - 1)] * job.scale,
            bonus: 0,
            tilted: false,
            drainCause: 'sampled',
            machine: r.machine,
            stats: emptyBallStats(),
            levelUps: [],
            extraBalls: 0,
            paydayEnd: 0,
          })
        : (snap: BallSnapshot): BallOutcome => {
            const s = new BallSession(snap);
            const bot = attachBot(new Bot(job.skill, i * 1000 + n++), s);
            while (!s.over && s.steps < 240 * 600) s.step(bot.decide(s.sim));
            return s.game.outcome();
          };
    rows.push(playRun(i, ball, job.policy));
  }
  return rows;
}

workerJob(work);

if (IS_MAIN) {
  const args = process.argv.slice(2);
  const mode = argStr(args, '--mode', 'sampled') as Job['mode'];
  const runs = argNum(args, '--runs', mode === 'sampled' ? 2000 : 8);
  const skill = argStr(args, '--skill', 'average') as BotSkillName;
  const workers = argNum(args, '--workers', defaultWorkers());
  const scale = argNum(args, '--scale', 1);
  let samples: number[] = [];
  if (mode === 'sampled') {
    const path = 'tools/out/botstats.json';
    if (!existsSync(path)) {
      console.error(
        'No tools/out/botstats.json; run `npm run botstats` first (or use --mode physics).',
      );
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      { earnedSamples: number[] }
    >;
    samples = data[skill].earnedSamples;
  }
  const t0 = Date.now();
  const jobs = ranges(runs, mode === 'sampled' ? 1 : workers).map((r) => ({
    ...r,
    skill,
    mode,
    samples,
    scale,
    policy: { red: args.includes('--red'), loans: args.includes('--loans') },
  }));
  const rows = (await runPool<Job, RunRow[]>(import.meta.url, jobs)).flat();

  console.log(
    `Economy: ${runs} runs, ${mode} ball earnings (${skill} bot), ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  console.log(
    `Start ${ECONOMY.startCoins}c, debt ${ECONOMY.startDebt}c x${ECONOMY.debtGrowth}/deadline, ball ${ECONOMY.ballPriceBase}+${ECONOMY.ballPricePerDeadline}/deadline, interest ${ECONOMY.interest * 100}%/round\n`,
  );
  console.log('deadline |   debt | cleared | funds p10   p50   p90');
  const report: Record<string, unknown>[] = [];
  for (let d = 0; d < ECONOMY.deadlines; d++) {
    const debt = Math.round(ECONOMY.startDebt * Math.pow(ECONOMY.debtGrowth, d));
    const at = rows.filter((r) => r.funds.length > d);
    const cleared = rows.filter((r) => r.reached > d).length / rows.length;
    const f = at.map((r) => r.funds[d]).sort((a, b) => a - b);
    console.log(
      `${String(d + 1).padStart(8)} | ${String(debt).padStart(6)} | ${(cleared * 100).toFixed(1).padStart(6)}% | ${String(quantile(f, 0.1)).padStart(9)} ${String(quantile(f, 0.5)).padStart(5)} ${String(quantile(f, 0.9)).padStart(5)}`,
    );
    report.push({ deadline: d + 1, debt, cleared, p50: quantile(f, 0.5) });
  }
  const balls = rows.map((r) => r.balls).sort((a, b) => a - b);
  console.log(`\nBalls per run: median ${quantile(balls, 0.5)}, p90 ${quantile(balls, 0.9)}`);
  mkdirSync('tools/out', { recursive: true });
  writeFileSync('tools/out/economy.json', JSON.stringify({ mode, skill, runs, report }, null, 2));
}
