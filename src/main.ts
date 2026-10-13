import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import { GameApp } from './app/game-app';
import { startArtLoad } from './app/art';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;
const toast = document.getElementById('toast') as HTMLElement;

startArtLoad();
const app = new GameApp(canvas, hud, ui, toast);
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
