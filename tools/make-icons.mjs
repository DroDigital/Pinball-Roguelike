/* global document, Buffer, console */
// Renders the app icons (a chained devil on the backglass red) to public/icons with Chromium.
// Usage: node tools/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const draw = ([size, maskable]) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  const grad = g.createRadialGradient(256 * s, 230 * s, 20 * s, 256 * s, 256 * s, 360 * s);
  grad.addColorStop(0, '#8a2014');
  grad.addColorStop(1, '#120403');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // Keep the art inside the maskable safe zone (80%).
  const k = maskable ? 0.78 : 1;
  g.translate(size / 2, size / 2);
  g.scale(k * s, k * s);
  g.translate(-256, -256);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 40; x < 512; x += 64) g.fillRect(x, 0, 14, 512);
  g.fillStyle = '#d8301e';
  g.beginPath();
  g.ellipse(256, 270, 130, 115, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(160, 210);
  g.lineTo(96, 70);
  g.lineTo(212, 168);
  g.moveTo(352, 210);
  g.lineTo(416, 70);
  g.lineTo(300, 168);
  g.fill();
  g.fillStyle = '#ffd040';
  g.fillRect(180, 240, 56, 18);
  g.fillRect(278, 236, 56, 18);
  g.fillStyle = '#120403';
  g.beginPath();
  g.moveTo(186, 305);
  g.quadraticCurveTo(256, 370, 330, 300);
  g.lineTo(256, 330);
  g.fill();
  g.strokeStyle = '#c8c0b0';
  g.lineWidth = 12;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(120 + i * 68, 440, 26, 15, i % 2 ? 0.9 : 0, 0, Math.PI * 2);
    g.stroke();
  }
  return c.toDataURL('image/png');
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  const url = await page.evaluate(draw, [size, maskable]);
  writeFileSync(`public/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
