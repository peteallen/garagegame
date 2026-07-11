import { publicAssetUrl } from './assetUrl.js';
import { SPRITE_MANIFEST } from './assetManifest.js';

// Loads sprite images. Every sprite is optional: entities fall back to
// procedural canvas drawing until the generated art lands in public/assets.
export class AssetLoader {
  constructor() {
    this.images = {};
  }

  async loadAll(onProgress) {
    const names = Object.keys(SPRITE_MANIFEST);
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        this.images[name] = await loadImage(publicAssetUrl(`assets/sprites/${SPRITE_MANIFEST[name]}`));
        done++;
        onProgress?.(done / names.length);
      })
    );
    return this.images;
  }

  get(name) {
    return this.images[name] || null;
  }

  // Tinted copy of a sprite (multiply keeps shading, alpha restored after).
  // Cached per name+tint. Returns null if the sprite is missing.
  getTinted(name, tint) {
    const img = this.get(name);
    if (!img) return null;
    if (!tint) return img;
    this._tinted = this._tinted || {};
    const key = `${name}|${tint}`;
    if (this._tinted[key]) return this._tinted[key];
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    this._tinted[key] = canvas;
    return canvas;
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // missing art is fine — procedural fallback
    img.src = src;
  });
}
