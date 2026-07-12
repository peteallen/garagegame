import './style.css';
import { Game } from './game/Game.js';
import { AssetLoader } from './game/core/AssetLoader.js';
import { startVersionWatcher } from './game/core/VersionWatcher.js';

const canvas = document.querySelector('#game');
const assets = new AssetLoader();
assets.loadAll();
let game = new Game(canvas, assets);
startVersionWatcher();

const resize = () => game.resize();
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });

canvas.addEventListener('pointerdown', (event) => {
  const accepted = game.onPointerDown(event.clientX, event.clientY, event.pointerId);
  if (accepted) canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => game.onPointerMove(event.clientX, event.clientY, event.pointerId));
canvas.addEventListener('pointerup', (event) => game.onPointerUp(event.clientX, event.clientY, event.pointerId));
canvas.addEventListener('pointercancel', (event) => game.onPointerCancel(event.pointerId));
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

if (import.meta.hot) {
  // Hot-swap the whole game in place: any edit under game/ bubbles up to
  // Game.js, we rebuild from persisted state, and adoptRuntime carries the
  // unlocked audio context across so sound keeps working without a re-tap.
  import.meta.hot.accept('./game/Game.js', (mod) => {
    if (!mod?.Game) return;
    const previous = game;
    previous.destroy();
    game = new mod.Game(canvas, previous.assets || assets);
    game.adoptRuntime?.(previous);
  });
  import.meta.hot.dispose(() => game.destroy());
}
