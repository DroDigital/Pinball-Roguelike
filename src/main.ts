import { GameApp } from './app/game-app';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;
const toast = document.getElementById('toast') as HTMLElement;

const app = new GameApp(canvas, hud, ui, toast);
(window as unknown as { __game: GameApp }).__game = app;
app.start();

if (new URLSearchParams(location.search).has('dev')) {
  void import('./app/dev-panel').then((m) => m.attachDevPanel(app));
}
