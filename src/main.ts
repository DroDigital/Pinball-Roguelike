import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/saira-stencil-one/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import { GameApp } from './app/game-app';
import { startArtLoad } from './present/art';
import bebas from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';
import vt323 from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';
import specialElite from '@fontsource/special-elite/files/special-elite-latin-400-normal.woff2?url';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import interSemi from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';

// The faces the first screen needs are fetched with the page, not when the CSS reaches them.
for (const href of [bebas, vt323, specialElite, interRegular, interSemi]) {
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

// Start the skin's faces loading now and keep the UI hidden until they are in (or 1.5 s pass), so
// the headings and CRT figures never flash in a fallback face.
const root = document.documentElement;
root.classList.add('fonts-wait');
const faces = [
  '400 1em "Bebas Neue"',
  '400 1em VT323',
  '400 1em "Special Elite"',
  '400 1em Inter',
  '600 1em Inter',
];
void Promise.race([
  Promise.all(faces.map((f) => document.fonts.load(f))),
  new Promise((done) => window.setTimeout(done, 1500)),
]).then(() => root.classList.remove('fonts-wait'));

startArtLoad();
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
