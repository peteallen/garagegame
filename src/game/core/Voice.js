import { publicAssetUrl } from './assetUrl.js';
import { VOICE_LINES } from './assetManifest.js';

// Spoken lines, played through the SoundEngine master so the mute button and
// limiter apply. A line can ship in per-register takes (`${key}_${register}`)
// so the bus sounds big and the sports car sounds bright, with an optional
// bare `key` take shared by everyone.
export const VOICE_REGISTERS = Object.freeze({
  sports: 'bright',
  taxi: 'bright',
  ev: 'bright',
  icecream: 'bright',
  pickup: 'warm',
  police: 'warm',
  bus: 'deep',
  fire: 'deep',
  tow: 'deep',
});

const DEFAULT_REGISTER = 'warm';

export class Voice {
  constructor(sound) {
    this.sound = sound;
    this.raw = {};      // clip -> ArrayBuffer (fetched)
    this.buffers = {};  // clip -> AudioBuffer (decoded once ctx exists)
    this.speaking = false;
    this.lastSaid = {}; // clip -> performance.now() of last playback
    this.load();
  }

  async load() {
    await Promise.all(VOICE_LINES.map(async (name) => {
      try {
        const response = await fetch(publicAssetUrl(`assets/voice/${name}.wav`));
        if (response.ok) this.raw[name] = await response.arrayBuffer();
      } catch {
        // voice pack missing — synth blips only, still fine
      }
    }));
  }

  // Clip name for a line: the register take when the manifest has one, the
  // bare key when it has a shared take, null when the line doesn't exist.
  resolve(key, vehicleType) {
    const register = VOICE_REGISTERS[vehicleType] || DEFAULT_REGISTER;
    const registered = `${key}_${register}`;
    if (VOICE_LINES.includes(registered)) return registered;
    if (VOICE_LINES.includes(key)) return key;
    return null;
  }

  // Returns false only when no clip exists for the line, so the caller can
  // fall back to a synth blip. Suppression (muted, already speaking, or on
  // cooldown) returns true — staying quiet was the point.
  say(key, { vehicleType = null, force = false, cooldown = 4000 } = {}) {
    const sound = this.sound;
    const name = this.resolve(key, vehicleType);
    if (!name) return false;
    if (!sound.ctx || sound.muted) return true;
    if (this.speaking && !force) return true;
    const now = performance.now();
    if (this.lastSaid[name] && now - this.lastSaid[name] < cooldown) return true;
    const play = (buffer) => {
      this.lastSaid[name] = now;
      this.speaking = true;
      const source = sound.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = sound.ctx.createGain();
      gain.gain.value = 0.95;
      source.connect(gain);
      gain.connect(sound.master);
      source.onended = () => { this.speaking = false; };
      source.start();
      // safety: never wedge the speaking flag
      setTimeout(() => { this.speaking = false; }, buffer.duration * 1000 + 300);
    };
    if (this.buffers[name]) {
      play(this.buffers[name]);
      return true;
    }
    if (this.raw[name]) {
      sound.ctx.decodeAudioData(this.raw[name].slice(0)).then((buffer) => {
        this.buffers[name] = buffer;
        play(buffer);
      }).catch(() => {});
      return true;
    }
    return false; // manifest lists the line but its file never arrived
  }
}
