import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots of every major screen at desktop and phone sizes, for before/after comparison
 * of visual passes. Set SHOT_DIR to choose where they land (default screenshots/screens).
 * Screens are reached through the `__game` handle, so no ball has to be played.
 */

// The handle is only poked from here; its private screen methods are reachable at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = Record<string, any>;

const SHOT_DIR = process.env.SHOT_DIR ?? 'screenshots/screens';

const call = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(
    ([m, a]) => {
      const g = (globalThis as unknown as { __game: Game }).__game;
      return g[m as string](...(a as unknown[]));
    },
    [method, args] as const,
  );

const SIZES = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
  { name: 'phone-portrait', width: 390, height: 844, mobile: true },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      isMobile: size.mobile,
      hasTouch: size.mobile,
    });

    test(`every screen at ${size.name}`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning')
          problems.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

      let n = 0;
      const shot = async (name: string) => {
        await page.waitForTimeout(1100);
        n++;
        await page.screenshot({
          path: `${SHOT_DIR}/${size.name}/${String(n).padStart(2, '0')}-${name}.jpg`,
          type: 'jpeg',
          quality: 82,
        });
      };

      await page.goto('/?seed=SCREENS');
      await expect(page.getByRole('button', { name: 'Wake up' })).toBeVisible();
      await page.waitForTimeout(1500);
      await shot('title');

      await call(page, 'enterLineup');
      await shot('lineup');

      await call(page, 'newRunFlow');
      await shot('deadline-intro');

      await call(page, 'enterJobs');
      await shot('jobs');

      await call(page, 'takeJob', 0);
      await shot('buy');

      await call(page, 'buy', 3);
      await shot('cell');

      await call(page, 'enterAtm', 'cell');
      await shot('atm');

      await call(page, 'enterShop');
      await shot('shop');

      await call(page, 'devKnock');
      await call(page, 'enterJobs');
      await shot('knock');

      await page.evaluate(() => {
        const g = (globalThis as unknown as { __game: Game }).__game;
        g.run.call = {
          kind: 'perks',
          offers: [{ id: 'charmSlot' }, { id: 'freeBall' }, { id: 'tickets' }],
        };
        g.enterPhone();
      });
      await shot('phone');

      await page.evaluate(() => {
        const g = (globalThis as unknown as { __game: Game }).__game;
        g.run.call = { kind: 'red', offers: ['bloodMoney', 'borrowedLuck'] };
        g.enterPhone();
      });
      await shot('red-call');

      await call(page, 'enterDeadline');
      await shot('deadline');

      // A ball on the plunger: the HUD in play.
      await call(page, 'enterCell');
      await call(page, 'startBall');
      await page.waitForTimeout(800);
      await shot('play');

      await call(page, 'openPause');
      await shot('pause');

      await call(page, 'openSettings');
      await shot('settings');

      // Back out of the overlays, end the ball: the tally slip.
      await page.evaluate(() => {
        const g = (globalThis as unknown as { __game: Game }).__game;
        g.ui.pop();
        g.ui.pop();
        g.overlays = 0;
        g.menuOpen = false;
        g.onBallOver();
      });
      await shot('ball-end');

      await call(page, 'enterMeta');
      await shot('rap-sheet-lifetime');

      await page.evaluate(() => {
        const g = (globalThis as unknown as { __game: Game }).__game;
        g.run.phase = 'over';
        g.run.result = 'fell';
        g.rapSheet();
      });
      await shot('run-ended-fell');

      await page.evaluate(() => {
        const g = (globalThis as unknown as { __game: Game }).__game;
        g.run.result = 'paidInFull';
        g.rapSheet();
      });
      await shot('run-ended-ending');

      expect(problems, problems.join('\n')).toEqual([]);
    });
  });
}
