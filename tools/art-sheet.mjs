// Paints every piece of the app's artwork in headless Chromium and writes it to tools/out/art,
// so a change to src/present/artwork can be looked at without running the game.
//   node tools/art-sheet.mjs [art id ...]      e.g. node tools/art-sheet.mjs menus/title-panel
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const only = process.argv.slice(2);
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log(`[browser ${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(`${base}tools/art/index.html`);
  await page.waitForFunction(() => window.ready === true);
  const out = await page.evaluate((ids) => window.paintAll(ids.length ? ids : null), only);
  mkdirSync('tools/out/art', { recursive: true });
  for (const [id, r] of Object.entries(out)) {
    if (!r) {
      console.log(`${id}: FAILED`);
      continue;
    }
    const file = `tools/out/art/${id.replace('/', '__')}.png`;
    writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
    console.log(`${id}: ${r.ms} ms -> ${file}`);
  }
} finally {
  await browser.close();
  await server.close();
}
