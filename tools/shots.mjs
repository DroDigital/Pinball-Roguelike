/* global console, document, process */
/**
 * Screenshot tour for visual and UI work. It walks title -> lineup -> deadline -> Jobs ->
 * buy -> cell -> play (the bot plays) -> ball end, then opens the ATM, shop, phone, settings,
 * the Rap Sheet and a knock through the app's own methods. Needs a running server.
 *
 *   node tools/shots.mjs --url http://localhost:5173 --out screenshots/tour
 *     [--size 1280x800] [--touch] [--only play]   (only: stop after the first ball)
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const url = arg('--url', 'http://localhost:5173');
const out = arg('--out', 'screenshots/tour');
const [w, h] = arg('--size', '1280x800').split('x').map(Number);
const touch = process.argv.includes('--touch');
const only = arg('--only', '');
// --text 1.3 renders the tour at a larger text-size setting (the CSS scale the Settings screen sets).
const text = arg('--text', '');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: w, height: h },
  hasTouch: touch,
  isMobile: touch,
});
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const mode = () => page.evaluate(() => globalThis.__game.mode);
const waitMode = async (re, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await mode())) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`timed out waiting for mode ${re}; now ${await mode()}`);
};
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', `${out}/${name}.png`);
};
const enter = () => page.keyboard.press('Enter');
const step = async (re, name, wait = 900) => {
  await enter();
  await waitMode(re);
  await page.waitForTimeout(wait);
  await shot(name);
};

try {
  await page.goto(`${url}/?bot=expert&seed=SHOTS`);
  await waitMode(/title/);
  if (text)
    await page.evaluate((t) => document.documentElement.style.setProperty('--text-scale', t), text);
  await page.waitForTimeout(1800);
  await shot('01-title');
  await step(/lineup/, '02-lineup');
  await step(/intro|deadline/, '03-deadline');
  await step(/jobs/, '04-jobs');
  await step(/buy/, '05-buy');
  await step(/cell/, '06-cell');
  await step(/play/, '07-play', 2500);
  await page.waitForTimeout(2500);
  await shot('08-play');
  await page.evaluate(() => (globalThis.__game.timeScale = 4));
  await waitMode(/tally|ballEnd/, 240000);
  await page.evaluate(() => (globalThis.__game.timeScale = 1));
  await page.waitForTimeout(700);
  await shot('09-tally');
  await waitMode(/ballEnd/, 30000);
  // The tally counts up for about 1.6 s; shoot it settled.
  await page.waitForTimeout(2200);
  await shot('10-ball-end');
  if (only !== 'play') {
    await step(/cell|buy|deadline/, '11-after-ball');
    const visit = async (name, fn) => {
      try {
        await page.evaluate(fn);
        await page.waitForTimeout(1000);
        await shot(name);
      } catch (e) {
        console.log('skip', name, String(e).slice(0, 160));
      }
    };
    await visit('12-atm', () => globalThis.__game.enterAtm('cell'));
    await visit('13-shop', () => globalThis.__game.enterShop());
    await visit('14-phone', () => globalThis.__game['enterPhone']());
    await visit('15-knock', () => globalThis.__game.devKnock());
    await visit('16-settings', () => globalThis.__game.openSettings());
    await visit('17-rapsheet', () => globalThis.__game.enterMeta());
  }
} catch (e) {
  console.log('tour stopped:', String(e).slice(0, 300));
  await shot('zz-stopped');
}
console.log(problems.length ? `console problems:\n${problems.join('\n')}` : 'console clean');
await browser.close();
