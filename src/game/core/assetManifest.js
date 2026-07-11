// Single source of truth for every shipped asset. The browser loaders
// (AssetLoader, Sfx, Voice) and scripts/check_assets.mjs both read this file;
// the build fails when public/assets and these tables drift apart.

// Vehicle sprite registration contract, shared by Vehicle.js drawing and the
// check:assets dimension validator. scripts/process_art.py mirrors these two
// numbers: sprites are (length + 2*overhang) x (width + 2*overhang) world
// units at SPRITE_PX_PER_UNIT pixels per unit, painted body centered, so the
// art and the collision footprint coincide exactly at any heading.
export const SPRITE_PX_PER_UNIT = 2;
export const SPRITE_OVERHANG = 6;

export const SPRITE_MANIFEST = Object.freeze({});

export const VOICE_LINES = Object.freeze([]);

export const SFX_CLIPS = Object.freeze([]);
