/** Quick probe: mean earnings and mode frequency for the average bot (deadline-1 rules). */
import { attachBot, defaultSnapshot } from '../src/bot/autoplay';
import { BallSession } from '../src/rules/session';
import { Bot } from '../src/bot/bot';

const N = Number(process.argv[2] ?? 80);
let earned = 0;
let secs = 0;
const tot: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const s = new BallSession(defaultSnapshot(700000 + i), () => {});
  const bot = new Bot('average', 977 * i + 13);
  attachBot(bot, s);
  while (!s.over && s.steps < 600 * 240) s.step(bot.decide(s.sim));
  const o = s.game.outcome();
  earned += o.earned + o.bonus;
  secs += s.steps / 240;
  for (const [k, v] of Object.entries(o.stats)) tot[k] = (tot[k] ?? 0) + (v as number);
}
const per = (k: string): string => ((tot[k] ?? 0) / N).toFixed(2);
console.log(
  `balls ${N} coins/ball ${(earned / N).toFixed(2)} secs/ball ${(secs / N).toFixed(0)} | bails ${per('bails')} skill ${per('skillShots')} sweeps ${per('sweeps')} brawls ${per('brawls')} shakedowns ${per('shakedowns')} spins ${per('spins')} yard ${per('yardHits')}`,
);
