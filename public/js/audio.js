// מוזיקה ואפקטים מסונתזים ב-Web Audio (ללא זכויות יוצרים).
// אפשר להחליף כל טראק בקובץ: assets/music/{intro|lobby|tension|decision|win}.mp3
const N = f => 440 * Math.pow(2, (f - 69) / 12); // MIDI → Hz

class Engine {
  constructor() {
    this.ctx = null; this.track = null; this.timer = null; this.files = new Set();
    this.musicVol = 0.55; this.sfxVol = 0.8; this.muted = false;
    this.intensity = 0.3; this.urgent = false; this.step = 0; this.nextTime = 0;
    this.mediaEl = null;
  }
  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    const c = this.ctx;
    this.out = c.createDynamicsCompressor();
    this.out.threshold.value = -14; this.out.ratio.value = 4;
    this.out.connect(c.destination);
    this.master = c.createGain(); this.master.connect(this.out);
    this.music = c.createGain(); this.music.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.applyVol();
    // הד קצר לתחושת אולפן
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.2); const vg = c.createGain(); vg.gain.value = 0.25;
    this.verb.connect(vg); vg.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    try { const r = await fetch('/api/music'); (await r.json()).forEach(f => this.files.add(f.replace('.mp3', ''))); } catch {}
  }
  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
  }
  applyVol() {
    if (!this.ctx) return;
    this.music.gain.value = this.muted ? 0 : this.musicVol;
    this.sfx.gain.value = this.muted ? 0 : this.sfxVol;
    if (this.mediaEl) this.mediaEl.volume = this.muted ? 0 : this.musicVol;
  }
  setVolumes(m, s) { if (m !== undefined) this.musicVol = m; if (s !== undefined) this.sfxVol = s; this.applyVol(); }
  setMuted(v) { this.muted = v; this.applyVol(); }

  // ───── כלים ─────
  env(g, t, a, peak, d, sus = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); }
  kick(t, v = 0.9, dest = this.music) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    this.env(g, t, 0.004, v, 0.3); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
  }
  heart(t, v = 0.7) { this.kick(t, v * 0.8); this.kick(t + 0.17, v * 0.55); }
  noise(t, dur, v, type = 'highpass', f = 7000, dest = this.music, q = 0.7) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this.env(g, t, 0.002, v, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05);
    return fl;
  }
  tone(t, freq, dur, v, type = 'sawtooth', cutoff = 1200, dest = this.music, attack = 0.01) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = freq; fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = 2;
    this.env(g, t, attack, v, dur); o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + attack + dur + 0.1);
    return { o, fl, g };
  }
  chord(t, notes, dur, v, type = 'sawtooth', cutoff = 1800, wet = true) {
    for (const n of notes) for (const det of [-6, 6]) {
      const x = this.tone(t, N(n), dur, v / notes.length, type, cutoff, this.music, 0.05);
      x.o.detune.value = det;
      if (wet) x.g.connect(this.verb);
    }
  }

  // ───── טראקים ─────
  play(name, opts = {}) {
    if (!this.ctx) return;
    if (this.track === name && !opts.restart) return;
    this.stop(0.25);
    this.track = name;
    if (this.files.has(name)) return this.playFile(name);
    const bpm = { intro: 108, lobby: 96, tension: 92, decision: 68, win: 138 }[name] || 100;
    this.bpm = bpm; this.step = 0; this.urgent = false;
    if (opts.intensity !== undefined) this.intensity = opts.intensity;
    this.nextTime = this.ctx.currentTime + 0.08;
    if (name === 'tension' || name === 'decision') this.startDrone();
    this.timer = setInterval(() => this.schedule(), 25);
  }
  playFile(name) {
    const el = new Audio(`/assets/music/${name}.mp3`);
    el.loop = name !== 'win'; el.volume = this.muted ? 0 : this.musicVol; el.play().catch(() => {});
    this.mediaEl = el;
  }
  stop(fade = 0.15) {
    clearInterval(this.timer); this.timer = null; this.track = null;
    if (this.mediaEl) { const el = this.mediaEl; this.mediaEl = null; let v = el.volume; const iv = setInterval(() => { v -= 0.1; if (v <= 0) { el.pause(); clearInterval(iv); } else el.volume = v; }, fade * 100); }
    if (this.drone) { const d = this.drone; this.drone = null; const t = this.ctx.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0.0001, t, fade / 3); setTimeout(() => d.oscs.forEach(o => o.stop()), fade * 1000 + 300); }
  }
  cut() { // חיתוך פתאומי לשקט
    clearInterval(this.timer); this.timer = null; this.track = null;
    if (this.mediaEl) { this.mediaEl.pause(); this.mediaEl = null; }
    if (this.drone) { const d = this.drone; this.drone = null; d.g.gain.cancelScheduledValues(this.ctx.currentTime); d.g.gain.setValueAtTime(0.0001, this.ctx.currentTime + 0.01); setTimeout(() => d.oscs.forEach(o => o.stop()), 200); }
  }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); if (this.drone) this.drone.fl.frequency.setTargetAtTime(300 + this.intensity * 1400, this.ctx.currentTime, 1.5); }
  setUrgent(v) { this.urgent = v; if (this.drone && v) this.drone.fl.frequency.setTargetAtTime(2600, this.ctx.currentTime, 4); }
  startDrone() {
    const c = this.ctx, g = c.createGain(), fl = c.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 300 + this.intensity * 1400; fl.Q.value = 6;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.16, c.currentTime, 1.2);
    fl.connect(g); g.connect(this.music); g.connect(this.verb);
    const notes = this.track === 'decision' ? [38, 45, 50, 53] : [38, 50, 53, 57];
    const oscs = [];
    notes.forEach((n, i) => { for (const det of [-9, 9]) { const o = c.createOscillator(); o.type = i ? 'sawtooth' : 'triangle'; o.frequency.value = N(n); o.detune.value = det; const og = c.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(fl); o.start(); oscs.push(o); } });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.15; lg.gain.value = 180; lfo.connect(lg); lg.connect(fl.frequency); lfo.start(); oscs.push(lfo);
    this.drone = { g, fl, oscs };
  }
  schedule() {
    const c = this.ctx;
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      const bpm = this.bpm * (this.track === 'tension' ? (1 + this.intensity * 0.3) * (this.urgent ? 1.35 : 1) : 1);
      this.nextTime += 60 / bpm / 4;
      this.step++;
    }
  }
  playStep(s, t) {
    const b16 = s % 16, bar = Math.floor(s / 16);
    const I = this.intensity;
    if (this.track === 'tension') {
      if (b16 % 4 === 0) this.kick(t, 0.55 + I * 0.35);
      if (I > 0.45 && b16 % 8 === 4) this.heart(t, 0.35 + I * 0.4);
      if (b16 % 2 === 0) this.tone(t, N(b16 % 8 === 6 ? 50 : 38), 0.16, 0.22 + I * 0.15, 'sawtooth', 220 + I * 900 + (this.urgent ? 700 : 0));
      if (this.urgent || I > 0.65) this.noise(t, 0.03, 0.06 + (this.urgent ? 0.06 : 0), 'highpass', 8000);
      if (b16 % 4 === 2) this.tone(t, N(86), 0.05, 0.05 + I * 0.04, 'square', 4000);
      if (b16 === 0 && bar % 2 === 1) { const f = this.noise(t, 60 / this.bpm * 2, 0.05 + I * 0.08, 'bandpass', 400, this.music, 4); f.frequency.exponentialRampToValueAtTime(5000, t + 60 / this.bpm * 2); }
      if (this.urgent && b16 % 4 === 0) this.tone(t, N(74 + (bar % 2)), 0.08, 0.08, 'triangle', 6000);
    } else if (this.track === 'intro' || this.track === 'lobby') {
      const prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
      const ch = prog[bar % 4];
      const loud = this.track === 'intro' ? 1 : 0.55;
      if (b16 === 0) this.chord(t, ch.map(n => n + 12), 60 / this.bpm * 3.6, 0.22 * loud, 'sawtooth', 1600);
      if (b16 % 2 === 0) this.tone(t, N(ch[[0, 1, 2, 1][(b16 / 2) % 4]] + 24), 0.12, 0.07 * loud, 'triangle', 5000).g.connect(this.verb);
      if (b16 % 4 === 0) this.tone(t, N(ch[0] - 12), 0.3, 0.22 * loud, 'sawtooth', 500);
      if (this.track === 'intro') { if (b16 % 4 === 0) this.kick(t, 0.6); if (b16 % 8 === 4) this.noise(t, 0.12, 0.18, 'bandpass', 1800); if (b16 % 2 === 1) this.noise(t, 0.03, 0.05, 'highpass', 9000); }
    } else if (this.track === 'decision') {
      if (b16 % 4 === 0) this.tone(t, N(b16 === 0 ? 93 : 88), 0.04, 0.08, 'square', 5000);
      if (b16 === 0) this.heart(t, 0.5);
      if (b16 === 8 && bar % 2) this.tone(t, N(26), 1.2, 0.3, 'sawtooth', 300);
    } else if (this.track === 'win') {
      const prog = [[62, 66, 69], [67, 71, 74], [69, 73, 76], [62, 66, 69]];
      const ch = prog[bar % 4];
      if (b16 === 0 || b16 === 8) this.chord(t, ch, 0.5, 0.3, 'sawtooth', 3000);
      this.tone(t, N(ch[b16 % 3] + 12), 0.09, 0.07, 'square', 6000);
      if (b16 % 4 === 0) this.kick(t, 0.8);
      if (b16 % 8 === 4) this.noise(t, 0.15, 0.3, 'bandpass', 2200);
      if (b16 % 2 === 0) this.tone(t, N(ch[0] - 24), 0.15, 0.25, 'sawtooth', 600);
      if (bar >= 8 && b16 === 15) { this.stop(1.5); }
    }
  }

  // ───── אפקטים ─────
  fx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01, S = this.sfx;
    switch (name) {
      case 'click': this.tone(t, 1400, 0.05, 0.2, 'square', 5000, S); break;
      case 'lock': this.tone(t, 660, 0.08, 0.25, 'triangle', 6000, S); this.tone(t + 0.07, 990, 0.18, 0.25, 'triangle', 6000, S); break;
      case 'beep': this.tone(t, 880, 0.15, 0.3, 'square', 3000, S); break;
      case 'beepHi': this.tone(t, 1320, 0.35, 0.35, 'square', 3000, S); break;
      case 'whoosh': { const f = this.noise(t, 0.6, 0.25, 'bandpass', 300, S, 3); f.frequency.exponentialRampToValueAtTime(4000, t + 0.5); break; }
      case 'gold': {
        this.kick(t, 1, S);
        [62, 66, 69, 74, 78].forEach((n, i) => { const x = this.tone(t + i * 0.035, N(n), 1.6, 0.16, 'sawtooth', 3500, S, 0.02); x.g.connect(this.verb); });
        for (let i = 0; i < 8; i++) this.tone(t + 0.1 + i * 0.05, N(86 + (i % 4) * 3), 0.25, 0.05, 'triangle', 8000, S).g.connect(this.verb);
        break;
      }
      case 'blue': {
        this.kick(t, 1, S); this.kick(t + 0.02, 0.7, S);
        const o = this.tone(t, N(45), 1.6, 0.35, 'sawtooth', 900, S, 0.01); o.o.frequency.exponentialRampToValueAtTime(N(26), t + 1.4); o.g.connect(this.verb);
        [45, 48, 52].forEach(n => this.tone(t, N(n), 1.4, 0.1, 'sawtooth', 700, S).g.connect(this.verb));
        this.noise(t, 0.8, 0.25, 'lowpass', 800, S);
        break;
      }
      case 'elim': { const o = this.tone(t, 900, 0.5, 0.2, 'square', 3000, S); o.o.frequency.exponentialRampToValueAtTime(120, t + 0.45); break; }
      case 'hit': this.kick(t, 1, S); this.noise(t, 0.4, 0.3, 'lowpass', 1200, S); break;
      case 'riser': { const f = this.noise(t, 3, 0.25, 'bandpass', 200, S, 5); f.frequency.exponentialRampToValueAtTime(6000, t + 3); break; }
      case 'applause': for (let i = 0; i < 60; i++) this.noise(t + Math.random() * 2.5, 0.05, 0.05 + Math.random() * 0.05, 'bandpass', 1500 + Math.random() * 2500, S, 1); break;
    }
  }
}

export const audio = new Engine();
