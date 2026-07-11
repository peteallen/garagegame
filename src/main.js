import './style.css';
import { Game } from './game/Game.js';
import { startVersionWatcher } from './game/core/VersionWatcher.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
startVersionWatcher();

const resize = () => game.resize();
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  game.onPointerDown(event.clientX, event.clientY);
});
canvas.addEventListener('pointermove', (event) => game.onPointerMove(event.clientX, event.clientY));
canvas.addEventListener('pointerup', (event) => game.onPointerUp(event.clientX, event.clientY));
canvas.addEventListener('pointercancel', (event) => game.onPointerUp(event.clientX, event.clientY));
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy());
}
