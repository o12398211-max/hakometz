// קול המנחה AI: Web Speech Synthesis בעברית, או קול משופר מהשרת (OpenAI TTS) אם זמין
let voice = null;
let serverTTS = false;
let enabled = true;
let volume = 1;
const queue = [];
let speaking = false;
let audioEl = null;
const listeners = new Set();

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /he[-_]IL/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /he[-_]IL/i.test(v.lang)) || vs.find(v => /^he/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export const tts = {
  setServer(v) { serverTTS = !!v; },
  setEnabled(v) { enabled = !!v; if (!enabled) this.cancel(); },
  setVolume(v) { volume = v; if (audioEl) audioEl.volume = v; },
  get hasHebrewVoice() { return !!voice || serverTTS; },
  onSpeaking(fn) { listeners.add(fn); },
  say(text) {
    if (!enabled || !text) return;
    queue.push(String(text));
    if (!speaking) next();
  },
  cancel() {
    queue.length = 0;
    try { speechSynthesis.cancel(); } catch {}
    if (audioEl) { audioEl.pause(); audioEl = null; }
    setSpeaking(false);
  },
  get speaking() { return speaking; },
};
function setSpeaking(v) { speaking = v; listeners.forEach(f => f(v)); }

async function next() {
  const text = queue.shift();
  if (!text) { setSpeaking(false); return; }
  setSpeaking(true);
  if (serverTTS) {
    try {
      audioEl = new Audio('/api/tts?text=' + encodeURIComponent(text));
      audioEl.volume = volume;
      await new Promise((res, rej) => { audioEl.onended = res; audioEl.onerror = rej; audioEl.play().catch(rej); });
      audioEl = null;
      return next();
    } catch { audioEl = null; /* נופלים לקול הדפדפן */ }
  }
  if (!('speechSynthesis' in window)) return next();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL';
  if (voice) u.voice = voice;
  u.rate = 1.07;
  u.pitch = 0.95;
  u.volume = volume;
  let done = false;
  const fin = () => { if (done) return; done = true; next(); };
  u.onend = fin; u.onerror = fin;
  // הגנה: חלק מהדפדפנים לא מפעילים onend
  setTimeout(fin, 2500 + text.length * 110);
  speechSynthesis.speak(u);
}
