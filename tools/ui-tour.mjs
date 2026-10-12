/* global console, process, document */
/**
 * UI tour: drives the app through its own methods and screenshots every screen, including
 * states the plain tour does not reach (rich HUD, toasts and captions, pause, large text,
 * the Rap Sheet, a knock, the red phone). Needs a running server.
 *
 *   node tools/ui-tour.mjs --url http://localhost:5173 --out screenshots/ui
 *     [--size 1280x800] [--touch] [--steps title,cellrich,play,hudstates,shop,...]
 *
 * Steps (all by default; they run in this order): title lineup intro jobs buy cell cellrich
 * bigtext pause play bigplay hudstates tally ballend titlesaved toasts atm shop shopbottom
 * shopbroke phone redphone knock deadline settings rapsheet meta
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const url = arg('--url', 'http://localhost:5173');
const out = arg('--out', 'screenshots/ui');
const [w, h] = arg('--size', '1280x800').split('x').map(Number);
const touch = process.argv.includes('--touch');
const want = arg('--steps', '').split(',').filter(Boolean);
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
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
});

const mode = () => page.evaluate(() => globalThis.__game.mode);
const waitMode = async (re, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await mode())) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${re}; now ${await mode()}`);
};
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const g = (fn, arg) => page.evaluate(fn, arg);
const on = (name) => want.length === 0 || want.includes(name);
const enter = () => page.keyboard.press('Enter');
const settle = (ms = 700) => page.waitForTimeout(ms);

// Rich run state so the shop, HUD and cell have something to show.
const richRun = () =>
  g(() => {
    const r = globalThis.__game.run;
    r.tickets = 7;
    r.keys = 1;
    r.pocket = Math.max(r.pocket, 24);
    r.bank = 18;
    r.charms = ['piggyBank', 'crookedPenny', 'panicButton'];
    r.charges = { panicButton: 2 };
    r.contraband = ['chalk', 'shiv'];
  });

try {
  await page.goto(`${url}/?bot=expert&seed=SHOTS`);
  await waitMode(/title/);
  await settle(1800);
  if (on('title')) await shot('01-title');
  await enter();
  await waitMode(/lineup/);
  await settle();
  if (on('lineup')) await shot('02-lineup');
  await enter();
  await waitMode(/intro/);
  await settle();
  if (on('intro')) await shot('03-deadline');
  await enter();
  await waitMode(/jobs/);
  await settle();
  if (on('jobs')) await shot('04-jobs');
  await enter();
  await waitMode(/buy/);
  await settle();
  if (on('buy')) await shot('05-buy');
  await enter();
  await waitMode(/cell/);
  await settle();
  if (on('cell')) await shot('06-cell');
  if (on('cellrich')) {
    await richRun();
    await g(() => globalThis.__game['enterCell']());
    await settle();
    await shot('06b-cell-rich');
  }
  if (on('bigtext')) {
    await g(() => {
      const a = globalThis.__game;
      a.save.settings.textSize = 1.3;
      a.applySettings();
    });
    await richRun();
    await g(() => globalThis.__game['enterCell']());
    await settle();
    await shot('06d-cell-big');
    await g(() => globalThis.__game.enterShop());
    await settle();
    await shot('06e-shop-big');
    await g(() => {
      const a = globalThis.__game;
      a.save.settings.textSize = 1;
      a.applySettings();
      a['enterCell']();
    });
  }
  if (on('pause')) {
    await g(() => globalThis.__game.openPause());
    await settle();
    await shot('06c-pause');
    await page.keyboard.press('Escape');
    await settle(300);
  }
  if (on('play') || on('tally') || on('ballend')) {
    await g(() => globalThis.__game.run && (globalThis.__game.run.tickets = 3));
    await enter();
    await waitMode(/play/);
    await settle(2500);
    if (on('play')) await shot('07-play');
    await g(() => (globalThis.__game.timeScale = 3));
    await settle(4500);
    if (on('play')) await shot('08-play-later');
    if (on('bigplay')) {
      // Large text with a rich build and a toast + tip up: the right column against the notices.
      await g(() => {
        const a = globalThis.__game;
        a.save.settings.textSize = 1.3;
        a.applySettings();
        a.ui.toast('Panic Button: 1 left', 6000, 'good');
        a.hints.show('actives');
      });
      await settle(1200);
      await shot('08a-play-big');
      await g(() => {
        const a = globalThis.__game;
        a.save.settings.textSize = 1;
        a.applySettings();
      });
      await settle(400);
    }
    if (on('hudstates')) {
      await g(() => {
        const a = globalThis.__game;
        const gm = a.session.game;
        gm.combo.hit(gm.time);
        gm.combo.hit(gm.time);
        gm.combo.hit(gm.time);
        gm.luck = 4;
        gm.jailbreak = true;
        gm.jbShots = 2;
        a.hud.banner('Extra ball', { tone: 'green', sub: 'Shoot again' });
        a.ui.toast('Panic Button: 1 left', 6000, 'good');
      });
      await settle(900);
      await shot('08b-hud-states');
    }
    if (on('tally') || on('ballend')) {
      await g(() => (globalThis.__game.timeScale = 4));
      await waitMode(/tally|ballEnd/, 240000);
      await g(() => (globalThis.__game.timeScale = 1));
      await settle(700);
      if (on('tally')) await shot('09-tally');
      await waitMode(/ballEnd/, 30000);
      await settle(2600);
      if (on('ballend')) await shot('10-ball-end');
    }
  }
  const visit = async (name, fn, wait = 900, arg) => {
    try {
      await g(fn, arg);
      await settle(wait);
      await shot(name);
    } catch (e) {
      console.log('skip', name, String(e).slice(0, 200));
    }
  };
  const ensureRun = async () => {
    const has = await g(() => !!globalThis.__game.run);
    if (!has) {
      await g(() => globalThis.__game.newRunFlow('SHOTS'));
      await settle(300);
    }
    await richRun();
  };
  await ensureRun();
  if (on('titlesaved'))
    await visit(
      '00-title-saved',
      () => {
        const a = globalThis.__game;
        a.save.run = JSON.parse(JSON.stringify(a.run));
        a.save.tallies = 7;
        a.save.daily = {
          date: new Date().toISOString().slice(0, 10),
          best: { deadlines: 3, coins: 120 },
        };
        a.enterTitle();
      },
      1200,
    );
  if (on('toasts'))
    await visit(
      '10c-toasts',
      () => {
        const a = globalThis.__game;
        a.enterCell();
        a.announceUnlock({ id: 'x', text: 'Reach deadline 4', charms: ['crookedPenny'] });
        a.ui.toast('Not enough coins: 3 balls costs 6, you have 2.', 6000, 'warn');
        a.ui.toast('Link copied: anyone who opens it plays this run', 6000, 'good');
        a.subs.say(
          'THE WARDEN',
          'Flip, plunge, deposit. Miss the deadline and the floor remembers you.',
        );
        a.hints.show('atm');
      },
      700,
    );
  if (on('atm')) await visit('11-atm', () => globalThis.__game.enterAtm('cell'));
  if (on('shop')) await visit('12-shop', () => globalThis.__game.enterShop());
  if (on('shopbottom')) {
    await visit('12a-shop', () => globalThis.__game.enterShop());
    await g(() => (document.querySelector('.panel-body').scrollTop = 99999));
    await settle(600);
    await shot('12c-shop-bottom');
  }
  if (on('shopbroke'))
    await visit('12b-shop-broke', () => {
      const r = globalThis.__game.run;
      r.tickets = 0;
      r.pocket = 1;
      globalThis.__game.enterShop();
    });
  if (on('phone'))
    await visit('13-phone', () => {
      const r = globalThis.__game.run;
      r.call = {
        kind: 'perks',
        offers: [{ id: 'charmSlot' }, { id: 'levels', shot: 'chute' }, { id: 'tickets' }],
      };
      globalThis.__game['enterPhone']();
    });
  if (on('redphone'))
    await visit('13b-redphone', () => {
      const r = globalThis.__game.run;
      r.call = { kind: 'red', offers: ['bloodMoney', 'charm:blackCandle', 'ironCollar'] };
      globalThis.__game['enterPhone']();
    });
  if (on('knock'))
    await visit('14-knock', () => {
      globalThis.__game.devKnock();
      globalThis.__game['enterKnock']();
    });
  if (on('deadline'))
    await visit('15-deadline', () => {
      const r = globalThis.__game.run;
      r.phase = 'deadline';
      r.bank = r.debt;
      globalThis.__game['enterDeadline']();
    });
  if (on('settings')) await visit('16-settings', () => globalThis.__game.openSettings());
  if (on('settings')) {
    await page.keyboard.press('Escape');
    await settle(300);
    await page.keyboard.press('Escape');
    await settle(300);
  }
  if (on('rapsheet'))
    await visit(
      '17-rapsheet-run',
      () => {
        const r = globalThis.__game.run;
        r.result = 'fell';
        r.phase = 'over';
        globalThis.__game['rapSheet']();
      },
      2600,
    );
  if (on('meta')) await visit('18-meta', () => globalThis.__game.enterMeta());
} catch (e) {
  console.log('tour stopped:', String(e).slice(0, 300));
  await shot('zz-stopped');
}
console.log(problems.length ? `console problems:\n${problems.join('\n')}` : 'console clean');
await browser.close();
