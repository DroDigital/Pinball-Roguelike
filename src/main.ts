import { GameApp } from './app/game-app';
import sairaStencil from '@fontsource/saira-stencil-one/files/saira-stencil-one-latin-400-normal.woff2?url';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import interSemi from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import interBold from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';

// The faces the first screen needs are fetched with the page, not when the CSS reaches them.
for (const href of [sairaStencil, interRegular, interSemi, interBold]) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = '';
  link.href = href;
  document.head.append(link);
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;
const notices = document.getElementById('notices') as HTMLElement;

// Start the three faces loading now and keep the UI hidden until they are in (or 1.5 s pass), so
// the stencil title never flashes in a fallback face.
const root = document.documentElement;
root.classList.add('fonts-wait');
const faces = [
  '400 1em "Saira Stencil One"',
  '600 1em Inter',
  '800 1em Inter',
  '400 1em "Special Elite"',
];
void Promise.race([
  Promise.all(faces.map((f) => document.fonts.load(f))),
  new Promise((done) => window.setTimeout(done, 1500)),
]).then(() => root.classList.remove('fonts-wait'));

const app = new GameApp(canvas, hud, ui, notices);
(window as unknown as { __game: GameApp }).__game = app;
app.start();

// Offline play once installed (production builds only; dev uses Vite's live modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

if (new URLSearchParams(location.search).has('dev')) {
  void import('./app/dev-panel').then((m) => m.attachDevPanel(app));
}
