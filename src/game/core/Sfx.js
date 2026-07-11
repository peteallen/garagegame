import { publicAssetUrl } from './assetUrl.js';
import { SFX_CLIPS } from './assetManifest.js';

// Recorded sound effects, played through the SoundEngine master so the mute
// button and limiter apply. play() returns false when a clip isn't available —
// callers keep a synth fallback so the game still sounds right without the
// asset pack.
export class Sfx {
  constructor(sound) {
    this.sound = sound;
    this.raw = {};      // name -> ArrayBuffer (fetched)
    this.buffers = {};  // name -> AudioBuffer (decoded once ctx exists)
    this.load();
  }

  async load() {
    await Promise.all(SFX_CLIPS.map(async (name) => {
      try {
        const response = await fetch(publicAssetUrl(`assets/sfx/${name}.mp3`));
        if (response.ok) this.raw[name] = await response.arrayBuffer();
      } catch {
        // clip pack missing — synth fallbacks cover it
      }
    }));
  }

  play(name, { vol = 0.9, rate = 1, jitter = 0.07 } = {}) {
    const sound = this.sound;
    if (!sound.ctx || sound.muted) return true; // muted counts as handled — no fallback beep
    const start = (buffer) => {
      const source = sound.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
      const gain = sound.ctx.createGain();
      gain.gain.value = vol;
      source.connect(gain);
      gain.connect(sound.master);
      source.start();
    };
    if (this.buffers[name]) {
      start(this.buffers[name]);
      return true;
    }
    if (this.raw[name]) {
      sound.ctx.decodeAudioData(this.raw[name].slice(0)).then((buffer) => {
        this.buffers[name] = buffer;
        start(buffer);
      }).catch(() => {});
      return true;
    }
    return false;
  }
}
