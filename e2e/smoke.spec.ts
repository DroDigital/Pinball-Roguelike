import { test, expect, type Page } from '@playwright/test';

interface GameHandle {
  mode: string;
  timeScale: number;
  fps: number;
  run: { pocket: number; ballsPlayed: number; stats: { balls: number } } | null;
  session: { game: { earned: number } } | null;
}

const game = (page: Page) =>
  page.evaluate(() => {
    const g = (globalThis as unknown as { __game: GameHandle }).__game;
    return { mode: g.mode, pocket: g.run?.pocket ?? 0, balls: g.run?.stats.balls ?? 0, fps: g.fps };
  });

test('load, start a run, play a bot ball, console clean', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

  await page.goto('/?bot=expert&seed=SMOKE');
  await expect(page.getByRole('button', { name: 'Wake up' })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/01-title.png' });

  await page.keyboard.press('Enter');
  await expect(page.getByText('Deadline 1 of 8', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'screenshots/02-deadline.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByText('THE ATM POSTS THREE JOBS', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'screenshots/02-jobs.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByText('Buy balls for this round', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'screenshots/02-buy.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Play ball' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/03-cell.png' });
  await page.keyboard.press('Enter');
  expect((await game(page)).mode).toBe('play');

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/04-play.png' });
  // Fast-forward the bot ball.
  await page.evaluate(
    () => ((globalThis as unknown as { __game: GameHandle }).__game.timeScale = 4),
  );
  await page.waitForFunction(
    () => (globalThis as unknown as { __game: GameHandle }).__game.mode === 'ballEnd',
    null,
    {
      timeout: 200_000,
      polling: 500,
    },
  );
  await page.screenshot({ path: 'screenshots/05-ball-over.png' });
  const after = await game(page);
  expect(after.balls).toBe(1);

  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).mode).toMatch(/cell|buy|deadline/);
  await page.screenshot({ path: 'screenshots/06-after-ball.png' });

  expect(problems, problems.join('\n')).toEqual([]);
});
