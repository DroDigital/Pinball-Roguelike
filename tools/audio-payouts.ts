/**
 * What the payout sounds would do on real balls: plays bot balls headless and counts the
 * payouts by sound tier (src/present/sfx-payout.ts), so the tier thresholds can be judged
 * against actual play.
 *   npx tsx tools/audio-payouts.ts [--balls 6] [--skill expert]
 */
import { attachBot, defaultSnapshot } from '../src/bot/autoplay';
import { Bot, type BotSkillName } from '../src/bot/bot';
import { SCORE } from '../src/content/balance';
import { BallSession } from '../src/rules/session';
import type { GameEvent } from '../src/rules/types';
import { payoutTier } from '../src/present/sfx-payout';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const balls = Number(arg('--balls', '6'));
const skill = arg('--skill', 'expert') as BotSkillName;
const LABEL = ['silent', 'tick', 'minor', 'major', 'big'];

const total = [0, 0, 0, 0, 0];
const byShot: Record<string, number[]> = {};
let seconds = 0;
for (let i = 0; i < balls; i++) {
  const s = new BallSession(defaultSnapshot(500000 + i), (e: GameEvent) => {
    if (e.t !== 'score') return;
    const tier = payoutTier(e.amount);
    total[tier]++;
    (byShot[e.shot] ??= [0, 0, 0, 0, 0])[tier]++;
  });
  const bot = new Bot(skill, 977 * i + 13);
  attachBot(bot, s);
  while (!s.over && s.steps < 240 * 300) s.step(bot.decide(s.sim));
  seconds += s.steps / 240;
}
const n = total.reduce((a, b) => a + b, 0);
console.log(
  `${balls} ${skill} balls, ${seconds.toFixed(0)} s, ${n} payouts (scale ${SCORE.scale}): ` +
    total.map((c, t) => `${LABEL[t]} ${c} (${((c / n) * 100).toFixed(0)}%)`).join(', '),
);
console.log(`audible payouts per second: ${((n - total[0]) / seconds).toFixed(2)}`);
for (const [shot, t] of Object.entries(byShot).sort())
  console.log(`  ${shot.padEnd(12)} ${t.map((c, i) => `${LABEL[i]} ${c}`).join('  ')}`);
