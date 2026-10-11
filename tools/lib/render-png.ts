/** Render an SVG/HTML string to PNG with the pre-installed Chromium (Playwright). */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

export async function svgToPng(svg: string, outPath: string): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.setContent(`<html><body style="margin:0;background:#111">${svg}</body></html>`);
  const el = await page.$('svg');
  const buf = await el!.screenshot();
  writeFileSync(outPath, buf);
  await browser.close();
}
