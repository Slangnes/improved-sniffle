const NOTE = {
  C3: 130.81, E3: 164.81, G3: 196.0, A3: 220.0, B1: 61.74, E2: 82.41, B2: 123.47,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, E6: 1318.51,
};

// 16th-note pentatonic music-box loop for the box scene.
const BOX_PATTERN = [
  'C5', null, 'E5', null, 'D5', 'G4', null, 'A4',
  null, 'C5', null, 'G4', 'E5', null, 'D5', null,
];
const BOX_STEP = 0.16;

// Slow, sparse minor-pentatonic loop for the maze - simple repeating tune, kept quiet.
const MAZE_PATTERN = [
  'A3', null, null, null, 'C4', null, null, null,
  'E4', null, null, 'D4', null, null, 'A3', null,
  null, null, 'G3', null, null, null, 'A3', null,
];
const MAZE_STEP = 0.34;

const STEP_INTERVAL = 0.36;

function loadNum(key, fallback) {
  const raw = localStorage.getItem(key);
  const v = raw === null ? fallback : parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicVolume = loadNum('box-and-bones:musicVolume', 0.45);
    this.sfxVolume = loadNum('box-and-bones:sfxVolume', 0.7);
    this.muted = localStorage.getItem('box-and-bones:muted') === '1';

    this._currentTrack = null;
    this._active = null;
    this._footstepTimer = 0;
    this._footstepFoot = 0;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.6;
    this.reverb = this._buildReverb();
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.sfxGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildReverb() {
    const len = Math.floor(this.ctx.sampleRate * 1.8);
    const buffer = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = buffer;
    return conv;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
    localStorage.setItem('box-and-bones:musicVolume', String(v));
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
    localStorage.setItem('box-and-bones:sfxVolume', String(v));
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
    localStorage.setItem('box-and-bones:muted', m ? '1' : '0');
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---------- low-level sound primitives ----------

  _tone({ freq, type = 'sine', time = null, duration = 0.15, gain = 0.2, attack = 0.006, release = 0.1, detune = 0, filterFreq = null, pan = 0, reverb = 0 }) {
    if (!this.ctx) return;
    const t0 = time ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + attack + duration + release);

    let tail = osc;
    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(env);

    const out = this._pan(env, pan, reverb);
    osc.start(t0);
    osc.stop(t0 + attack + duration + release + 0.05);
    return out;
  }

  _pan(node, pan, reverb) {
    let dest = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      dest = p;
    }
    dest.connect(this.sfxGain);
    if (reverb) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      dest.connect(send);
      send.connect(this.reverbSend);
    }
    return dest;
  }

  _noiseBurst({ duration = 0.12, gain = 0.18, filterFreq = 1200, filterType = 'lowpass', pan = 0, reverb = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const bufferLen = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);

    src.connect(filter);
    filter.connect(env);
    this._pan(env, pan, reverb);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  // ---------- sound effects ----------

  footstep(surface = 'stone') {
    this._footstepFoot = 1 - this._footstepFoot;
    const detune = this._footstepFoot ? 40 : -40;
    if (surface === 'wood') {
      this._noiseBurst({ duration: 0.06, gain: 0.14, filterFreq: 1800, pan: detune / 200 });
      this._tone({ freq: 180, type: 'triangle', duration: 0.03, gain: 0.05, detune, filterFreq: 900 });
    } else {
      this._noiseBurst({ duration: 0.09, gain: 0.16, filterFreq: 700, pan: detune / 200, reverb: 0.25 });
      this._tone({ freq: 90, type: 'sine', duration: 0.05, gain: 0.09, detune, filterFreq: 300 });
    }
  }

  updateFootsteps(moving, surface, dt) {
    if (!moving) {
      this._footstepTimer = 0;
      return;
    }
    this._footstepTimer -= dt;
    if (this._footstepTimer <= 0) {
      this.footstep(surface);
      this._footstepTimer = STEP_INTERVAL;
    }
  }

  playBump() {
    this._noiseBurst({ duration: 0.05, gain: 0.12, filterFreq: 350, filterType: 'lowpass' });
    this._tone({ freq: 70, type: 'triangle', duration: 0.03, gain: 0.08, filterFreq: 200 });
  }

  playPickup() {
    this._tone({ freq: NOTE.A4, type: 'triangle', duration: 0.08, gain: 0.16, filterFreq: 3000, reverb: 0.15 });
    this._tone({ freq: NOTE.E5, type: 'triangle', duration: 0.12, gain: 0.14, time: (this.ctx?.currentTime ?? 0) + 0.07, filterFreq: 3500, reverb: 0.2 });
  }

  playDrop() {
    this._tone({ freq: NOTE.E4, type: 'sine', duration: 0.1, gain: 0.14, filterFreq: 1200 });
    this._tone({ freq: NOTE.C4, type: 'sine', duration: 0.14, gain: 0.12, time: (this.ctx?.currentTime ?? 0) + 0.05, filterFreq: 900 });
  }

  playInteract() {
    this._noiseBurst({ duration: 0.05, gain: 0.09, filterFreq: 2600, filterType: 'highpass' });
    this._tone({ freq: NOTE.G4, type: 'triangle', duration: 0.05, gain: 0.08, filterFreq: 2200 });
  }

  playModalOpen() {
    this._noiseBurst({ duration: 0.14, gain: 0.1, filterFreq: 2000, filterType: 'bandpass' });
    this._tone({ freq: NOTE.C4, type: 'triangle', duration: 0.1, gain: 0.09, filterFreq: 1500 });
  }

  playModalClose() {
    this._noiseBurst({ duration: 0.1, gain: 0.08, filterFreq: 1400, filterType: 'bandpass' });
  }

  playToggle(on) {
    this._tone({ freq: on ? NOTE.G4 : NOTE.E4, type: 'square', duration: 0.05, gain: 0.06, filterFreq: 2500 });
  }

  playRebindConfirm() {
    this._tone({ freq: NOTE.C5, type: 'triangle', duration: 0.06, gain: 0.1, filterFreq: 3000 });
  }

  playClimb() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this._noiseBurst({ duration: 1.0, gain: 0.1, filterFreq: 2200, filterType: 'lowpass', reverb: 0.3 });
    for (let i = 0; i < 4; i++) {
      this._tone({
        freq: 140 + i * 60,
        type: 'triangle',
        time: t0 + i * 0.11,
        duration: 0.08,
        gain: 0.07,
        filterFreq: 1200,
      });
    }
  }

  playLayerExtend() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this._noiseBurst({ duration: 1.6, gain: 0.16, filterFreq: 350, filterType: 'lowpass', reverb: 0.5 });
    this._tone({ freq: 60, type: 'sawtooth', time: t0, duration: 1.3, gain: 0.1, filterFreq: 220, attack: 0.3, release: 0.5, reverb: 0.4 });
    this._tone({ freq: NOTE.A3, type: 'triangle', time: t0 + 0.4, duration: 0.6, gain: 0.08, filterFreq: 1500, reverb: 0.4 });
    this._tone({ freq: NOTE.E4, type: 'triangle', time: t0 + 0.75, duration: 0.7, gain: 0.08, filterFreq: 1800, reverb: 0.4 });
  }

  playRunComplete() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    ['C4', 'E4', 'G4', 'C5'].forEach((n, i) => {
      this._tone({ freq: NOTE[n], type: 'triangle', time: t0 + i * 0.13, duration: 0.22, gain: 0.14, filterFreq: 3200, reverb: 0.3 });
    });
  }

  // ---------- music ----------

  startMusic(track) {
    if (this._currentTrack === track) return;
    const previous = this._active;
    this._currentTrack = track;

    const gainNode = this.ctx ? this.ctx.createGain() : null;
    if (gainNode) {
      gainNode.gain.value = 0;
      gainNode.connect(this.musicGain);
      gainNode.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    }

    const cleanup = track === 'box' ? this._startBoxMusic(gainNode) : this._startMazeMusic(gainNode);
    this._active = { track, gainNode, cleanup };

    if (previous) {
      const { gainNode: prevGain, cleanup: prevCleanup } = previous;
      if (prevGain && this.ctx) {
        prevGain.gain.cancelScheduledValues(this.ctx.currentTime);
        prevGain.gain.setValueAtTime(prevGain.gain.value, this.ctx.currentTime);
        prevGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);
      }
      setTimeout(() => prevCleanup && prevCleanup(), 1300);
    }
  }

  stopMusic() {
    this._currentTrack = null;
    if (this._active) {
      const { gainNode, cleanup } = this._active;
      if (gainNode && this.ctx) {
        gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
      }
      setTimeout(() => cleanup && cleanup(), 1100);
      this._active = null;
    }
  }

  _startBoxMusic(out) {
    if (!this.ctx || !out) return () => {};
    let step = 0;
    let nextNoteTime = this.ctx.currentTime + 0.05;
    let stopped = false;

    const scheduleNote = (name, time) => {
      const freq = NOTE[name];
      const pan = ((step % 4) - 1.5) / 3;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 6;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.16, time + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0006, time + 0.55);

      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;

      const send = this.ctx.createGain();
      send.gain.value = 0.22;

      osc.connect(env);
      env.connect(p);
      p.connect(out);
      env.connect(send);
      send.connect(this.reverbSend);

      osc.start(time);
      osc.stop(time + 0.6);
    };

    const intervalId = setInterval(() => {
      if (stopped || !this.ctx) return;
      while (nextNoteTime < this.ctx.currentTime + 0.15) {
        const name = BOX_PATTERN[step % BOX_PATTERN.length];
        if (name) scheduleNote(name, nextNoteTime);
        nextNoteTime += BOX_STEP;
        step += 1;
      }
    }, 40);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }

  _startMazeMusic(out) {
    if (!this.ctx || !out) return () => {};
    let step = 0;
    let nextNoteTime = this.ctx.currentTime + 0.05;
    let stopped = false;

    const scheduleNote = (name, time) => {
      const freq = NOTE[name];
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.055, time + 0.04);
      env.gain.exponentialRampToValueAtTime(0.0006, time + 0.9);

      const send = this.ctx.createGain();
      send.gain.value = 0.5;

      osc.connect(filter);
      filter.connect(env);
      env.connect(out);
      env.connect(send);
      send.connect(this.reverbSend);

      osc.start(time);
      osc.stop(time + 1.0);
    };

    const intervalId = setInterval(() => {
      if (stopped || !this.ctx) return;
      while (nextNoteTime < this.ctx.currentTime + 0.15) {
        const name = MAZE_PATTERN[step % MAZE_PATTERN.length];
        if (name) scheduleNote(name, nextNoteTime);
        nextNoteTime += MAZE_STEP;
        step += 1;
      }
    }, 60);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }
}
