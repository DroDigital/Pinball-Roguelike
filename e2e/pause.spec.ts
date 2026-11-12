import { test, expect, type Page } from '@playwright/test';

interface GameHandle {
  mode: string;
  timeScale: number;
  ui: { open: boolean };
}

const state = (page: Page) =>
  page.evaluate(() => {
    const g = (globalThis as unknown as { __game: GameHandle }).__game;
    return { mode: g.mode, uiOpen: g.ui.open };
  });

// Regression: Settings opened during the Bonus tally used to be replaced by the ball receipt,
// and the next Back popped the receipt too, leaving no screen and no way on.
test('pausing between balls never strands the game', async ({ page }) => {
  await page.goto('/?bot=expert&seed=PAUSE');
  await expect(page.getByRole('button', { name: 'Wake up' })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
  }
  expect((await state(page)).mode).toBe('play');
  // The veil behind menus is driven by a class, not :has() (Safari left it over the game).
  const veiled = () =>
    page.evaluate(() =>
      (
        globalThis as unknown as {
          document: { getElementById(id: string): { classList: { contains(c: string): boolean } } };
        }
      ).document
        .getElementById('ui')
        .classList.contains('open'),
    );
  await page.keyboard.press('Escape');
  expect(await veiled()).toBe(true);
  await page.keyboard.press('Escape');
  expect(await veiled()).toBe(false);
  await page.evaluate(
    () => ((globalThis as unknown as { __game: GameHandle }).__game.timeScale = 8),
  );
  await page.waitForFunction(
    () => (globalThis as unknown as { __game: GameHandle }).__game.mode === 'tally',
    null,
    { timeout: 420_000, polling: 50 },
  );

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  // The tally holds while the menu is open.
  await page.waitForTimeout(4000);
  expect(await state(page)).toEqual({ mode: 'tally', uiOpen: true });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Closed again: the tally finishes and the receipt offers a way on.
  await expect.poll(async () => (await state(page)).mode, { timeout: 20_000 }).toBe('ballEnd');
  expect((await state(page)).uiOpen).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).mode).toMatch(/cell|buy|deadline/);
  expect((await state(page)).uiOpen).toBe(true);
});
