// Bottom tier of the audio stack: owns the shared AudioContext, master gain
// and limiter, and synthesizes every garage sound with WebAudio. Sfx (recorded
// clips) and Voice (spoken lines) play through this.master, and callers fall
// back to these synth recipes when a clip is missing — so the game sounds
// complete before any asset pack lands.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    try {
      this.muted = localStorage.getItem('garage_muted') === '1';
    } catch {
      this.muted = false; // storage blocked (private mode) — default to sound on
    }
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // Gentle limiter so stacked effects never clip harshly.
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 8;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('garage_muted', this.muted ? '1' : '0');
    } catch {
      // storage blocked — mute still applies this session
    }
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime + 0.1);
    }
    if (!this.muted) this.ack(); // little confirmation beep on unmute
    return this.muted;
  }

  get ready() {
    return !!this.ctx;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- primitives ---------------------------------------------------------

  tone({ freq = 440, end = null, dur = 0.15, type = 'sine', vol = 0.3, attack = 0.005, delay = 0, curve = 'exp' }) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (end != null) {
      if (curve === 'exp') oscillator.frequency.exponentialRampToValueAtTime(Math.max(end, 20), start + dur);
      else oscillator.frequency.linearRampToValueAtTime(end, start + dur);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.3, delay = 0, from = 800, to = 300, q = 1, type = 'bandpass', attack = 0.01 }) {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(to, 40), start + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + dur + 0.05);
  }

  // ---- workbench recipes (same tone stacks as the old inline synth) --------

  pop() {
    this.tone({ freq: 520, dur: 0.08, type: 'sine', vol: 0.07 });
  }

  ack() {
    this.tone({ freq: 620, dur: 0.08, type: 'sine', vol: 0.06 });
    this.tone({ freq: 850, dur: 0.1, type: 'sine', vol: 0.06, delay: 0.08 });
  }

  happy() {
    [540, 680, 850].forEach((freq, index) => {
      this.tone({ freq, dur: 0.13, type: 'triangle', vol: 0.065, delay: index * 0.09 });
    });
  }

  horn(freq = 320) {
    this.tone({ freq, dur: 0.24, type: 'square', vol: 0.075 });
    this.tone({ freq: freq * 1.02, dur: 0.19, type: 'sawtooth', vol: 0.035, delay: 0.05 });
  }

  backupBeep() {
    this.tone({ freq: 640, end: 600, dur: 0.09, type: 'triangle', vol: 0.025 });
  }

  squeak() {
    this.tone({ freq: 760, dur: 0.08, type: 'triangle', vol: 0.05 });
    this.tone({ freq: 510, dur: 0.1, type: 'triangle', vol: 0.04, delay: 0.07 });
  }

  door() {
    [115, 105, 92].forEach((freq, index) => {
      this.tone({ freq, dur: 0.3, type: 'sawtooth', vol: 0.025, delay: index * 0.13 });
    });
  }

  pickupBell() {
    this.tone({ freq: 920, dur: 0.32, type: 'sine', vol: 0.08 });
    this.tone({ freq: 1380, dur: 0.38, type: 'sine', vol: 0.045, delay: 0.04 });
  }

  rev(freq = 110) {
    this.tone({ freq, dur: 0.7, type: 'sawtooth', vol: 0.04 });
    this.tone({ freq: freq * 2, dur: 0.55, type: 'square', vol: 0.018 });
  }

  magic() {
    [420, 620, 840, 1120].forEach((freq, index) => {
      this.tone({ freq, dur: 0.25, type: 'sine', vol: 0.045, delay: index * 0.08 });
    });
  }

  fanfare() {
    [392, 523, 659, 784].forEach((freq, index) => {
      this.tone({ freq, dur: 0.28, type: 'triangle', vol: 0.055, delay: index * 0.12 });
    });
  }

  boing() {
    this.tone({ freq: 240, dur: 0.24, type: 'sine', vol: 0.07 });
  }

  alarmChirp() {
    this.tone({ freq: 760, dur: 0.08, type: 'square', vol: 0.04 });
    this.tone({ freq: 620, dur: 0.08, type: 'square', vol: 0.04, delay: 0.09 });
  }

  tinyHorn() {
    this.horn(460);
  }

  catChirp() {
    this.tone({ freq: 680, dur: 0.15, type: 'triangle', vol: 0.045 });
    this.tone({ freq: 880, dur: 0.12, type: 'triangle', vol: 0.035, delay: 0.12 });
  }

  // ---- garage extras --------------------------------------------------------

  chime() {
    // soft ding-dong doorbell with a faint sparkle on the first note
    this.tone({ freq: 830, dur: 0.3, type: 'sine', vol: 0.06 });
    this.tone({ freq: 1245, dur: 0.26, type: 'sine', vol: 0.022 });
    this.tone({ freq: 622, dur: 0.42, type: 'sine', vol: 0.055, delay: 0.22 });
  }

  towClunk() {
    // low thunk of the hook landing plus a small metallic tap
    this.tone({ freq: 120, end: 75, dur: 0.12, type: 'sine', vol: 0.09 });
    this.noise({ dur: 0.05, vol: 0.035, from: 700, to: 300, delay: 0.01 });
    this.tone({ freq: 950, dur: 0.05, type: 'square', vol: 0.028, delay: 0.1 });
  }

  sirenChirp() {
    // two polite rising whoops — triangle keeps it friendly, not scary
    this.tone({ freq: 620, end: 930, dur: 0.16, type: 'triangle', vol: 0.05 });
    this.tone({ freq: 700, end: 1050, dur: 0.18, type: 'triangle', vol: 0.05, delay: 0.2 });
  }

  partyToot() {
    // three ascending cheerful horn tones, layered like horn()
    [392, 494, 587].forEach((freq, index) => {
      const last = index === 2;
      this.tone({ freq, dur: last ? 0.3 : 0.16, type: 'square', vol: 0.05, delay: index * 0.15 });
      this.tone({ freq: freq * 1.02, dur: last ? 0.24 : 0.12, type: 'sawtooth', vol: 0.02, delay: index * 0.15 + 0.03 });
    });
  }

  snore() {
    this.noise({ dur: 0.55, vol: 0.04, from: 220, to: 90, q: 1.2, attack: 0.2 });
    this.tone({ freq: 95, end: 62, dur: 0.55, type: 'triangle', vol: 0.05, attack: 0.15 });
  }

  spray() {
    this.noise({ dur: 0.35, vol: 0.055, from: 3200, to: 5200, q: 0.8 });
  }

  pssh() {
    this.noise({ dur: 0.18, vol: 0.05, from: 2600, to: 1100, q: 1 });
  }

  motorHum(dur = 0.8) {
    this.tone({ freq: 90, end: 82, dur, type: 'sawtooth', vol: 0.03, attack: 0.12, curve: 'lin' });
    this.tone({ freq: 180, end: 164, dur: dur * 0.9, type: 'triangle', vol: 0.018, attack: 0.12, curve: 'lin' });
  }

  liftWhirr(dur = 0.7) {
    // servo rising while the lift moves, then a soft stop click at the top
    this.tone({ freq: 180, end: 330, dur, type: 'sawtooth', vol: 0.035, curve: 'lin' });
    this.tone({ freq: 360, end: 660, dur, type: 'square', vol: 0.014, curve: 'lin' });
    this.noise({ dur, vol: 0.02, from: 800, to: 1400, q: 2 });
    this.tone({ freq: 520, dur: 0.05, type: 'square', vol: 0.03, delay: dur });
  }
}
