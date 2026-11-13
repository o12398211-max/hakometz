// מענה בקול: זיהוי דיבור he-IL והתאמה לאפשרויות א/ב/ג
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const voiceSupported = !!SR;

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function norm(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // ניקוד וטעמים
    .replace(/[ךםןףץ]/g, c => FINALS[c])
    .replace(/["'׳״`.,!?;:()\-–_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// מספרים במילים → ספרות (עד 9999)
const UNITS = { 'אפס': 0, 'אחת': 1, 'אחד': 1, 'שתיימ': 2, 'שתימ': 2, 'שנימ': 2, 'שניימ': 2, 'שתי': 2, 'שני': 2, 'שלוש': 3, 'שלושה': 3, 'שלש': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'חמשה': 5, 'שש': 6, 'שישה': 6, 'ששה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10 };
const TENS = { 'עשרימ': 20, 'שלושימ': 30, 'ארבעימ': 40, 'חמישימ': 50, 'שישימ': 60, 'שבעימ': 70, 'שמונימ': 80, 'תשעימ': 90 };
const HUND = { 'מאה': 100, 'מאתיימ': 200, 'שלוש מאות': 300, 'ארבע מאות': 400, 'חמש מאות': 500, 'שש מאות': 600, 'שבע מאות': 700, 'שמונה מאות': 800, 'תשע מאות': 900 };
const THOU = { 'אלפ': 1000, 'אלפיימ': 2000 };
function wordsToNumbers(t) {
  // "שלושים ושבע" → 37, "חמש עשרה" → 15
  let s = ' ' + t + ' ';
  s = s.replace(/ (\S+) עשר(ה)? /g, (m, u) => (UNITS[u] !== undefined && UNITS[u] < 10 ? ` ${UNITS[u] + 10} ` : m));
  for (const [w, v] of Object.entries(HUND)) s = s.split(' ' + w + ' ').join(` ${v} `);
  for (const [w, v] of Object.entries(THOU)) s = s.split(' ' + w + ' ').join(` ${v} `);
  for (const [w, v] of Object.entries(TENS)) s = s.split(' ' + w + ' ').join(` ${v} `);
  s = s.replace(/ ו(\S+) /g, (m, u) => (UNITS[u] !== undefined ? ` ${UNITS[u]} ` : m));
  for (const [w, v] of Object.entries(UNITS)) s = s.split(' ' + w + ' ').join(` ${v} `);
  // חיבור רצפים: 30 7 → 37, 100 20 3 → 123
  s = s.replace(/(\d+)(?: (\d+))+/g, m => {
    const parts = m.split(' ').map(Number);
    let ok = true;
    for (let i = 1; i < parts.length; i++) if (!(parts[i] < smallestPlace(parts[i - 1]))) ok = false;
    return ok ? String(parts.reduce((a, b) => a + b, 0)) : m;
  });
  return s.trim();
}
function smallestPlace(n) { if (n % 1000 === 0) return 1000; if (n % 100 === 0) return 100; if (n % 10 === 0) return 10; return 1; }

const LETTER_WORDS = [
  ['א', 'אלפ', 'אלף', 'אות א', 'תשובה א', 'ראשונה', 'הראשונה', 'ראשונ', 'הראשונ', 'אופציה ראשונה'],
  ['ב', 'בית', 'בי', 'אות ב', 'תשובה ב', 'שנייה', 'השנייה', 'שניה', 'השניה', 'אופציה שנייה'],
  ['ג', 'גימל', 'גמל', 'גימעל', 'אות ג', 'תשובה ג', 'שלישית', 'השלישית', 'שלישי', 'השלישי', 'אופציה שלישית'],
];
const INDEX_NUM = { '1': 0, '2': 1, '3': 2 };
const LOCK_WORDS = ['נועל', 'נועלת', 'סופי', 'סופית', 'תנעל', 'לנעול', 'נעילה'];
const STRIP_PREFIX = ['אני בוחר ב', 'אני בוחרת ב', 'אני בוחר', 'אני בוחרת', 'התשובה היא', 'התשובה', 'תשובה', 'אני אומר', 'אני אומרת', 'אני חושב ש', 'אני חושבת ש', 'בוחר ב', 'בוחרת ב', 'בוחר', 'בוחרת', 'זה', 'כנראה'];

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const sim = (a, b) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length));
// מפתח פונטי בסיסי: אותיות שנשמעות דומה
const PH = { 'ק': 'כ', 'ח': 'כ', 'ט': 'ת', 'ס': 'ש', 'ע': 'א', 'ה': 'א', 'ו': 'ב', 'י': '' };
const phon = s => s.replace(/[קחטסעהוי]/g, c => PH[c]);
const stripPrefix = w => (w.length > 2 && 'הבלוכמש'.includes(w[0]) ? w.slice(1) : w);

function cleanUtterance(t) {
  let s = norm(t);
  for (const p of STRIP_PREFIX) if (s.startsWith(p + ' ') || s === p) s = s.slice(p.length).trim();
  return s;
}

// מחזיר {idx, lock, confident} או {idx:null}
export function matchAnswer(transcript, options, accept = []) {
  const raw = norm(transcript);
  const lock = LOCK_WORDS.some(w => raw.split(' ').includes(w));
  let s = cleanUtterance(transcript);
  for (const w of LOCK_WORDS) s = s.split(' ').filter(x => x !== w).join(' ');
  s = s.trim();
  if (!s) return { idx: null, lock };
  const sNum = wordsToNumbers(s);
  const optNorm = options.map(o => wordsToNumbers(norm(o)));
  const numericOptions = optNorm.some(o => /^\d+(\.\d+)?$/.test(o.replace(/,/g, '')));

  // 1. התאמה לתוכן התשובה (מדויקת ואז מטושטשת)
  const scores = options.map((o, i) => {
    const phrases = [o, ...(accept[i] || [])].map(p => wordsToNumbers(norm(p))).filter(Boolean);
    let best = 0;
    for (const p of phrases) {
      const pp = p.replace(/,/g, '');
      const ss = sNum.replace(/,/g, '');
      if (ss === pp) { best = 1; break; }
      // הביטוי מופיע כמילים שלמות בתוך המשפט
      if ((' ' + ss + ' ').includes(' ' + pp + ' ') && pp.length >= 1) best = Math.max(best, /^\d/.test(pp) ? 0.97 : 0.95);
      const words = ss.split(' ');
      const plen = pp.split(' ').length;
      for (let k = 0; k + plen <= words.length; k++) {
        const win = words.slice(k, k + plen).join(' ');
        if (/^\d/.test(pp)) continue; // מספרים רק בהתאמה מדויקת
        best = Math.max(best, sim(win, pp), sim(win.split(' ').map(stripPrefix).join(' '), pp.split(' ').map(stripPrefix).join(' ')), sim(phon(win), phon(pp)) - 0.04);
      }
    }
    return best;
  });
  const order = scores.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const [top, second] = order;
  if (top[0] >= 0.78 && top[0] - second[0] >= 0.15) return { idx: top[1], lock, confident: true, via: 'content' };

  // 2. אות או מיקום
  const words = s.split(' ');
  for (let i = 0; i < 3; i++) {
    for (const w of LETTER_WORDS[i]) {
      const nw = norm(w);
      if (s === nw || (nw.length > 1 && (' ' + s + ' ').includes(' ' + nw + ' ')) || (nw.length === 1 && words.includes(nw))) return { idx: i, lock, confident: true, via: 'letter' };
    }
  }
  // 3. מספר 1-3 כאינדקס, רק אם התשובות עצמן אינן מספרים
  if (!numericOptions) {
    const n = sNum.match(/^(\d)$/) || sNum.match(/(?:^| )(\d)(?: |$)/);
    if (n && INDEX_NUM[n[1]] !== undefined) return { idx: INDEX_NUM[n[1]], lock, confident: true, via: 'number' };
  }
  if (top[0] >= 0.66 && top[0] - second[0] >= 0.2) return { idx: top[1], lock, confident: false, via: 'fuzzy' };
  return { idx: null, lock };
}

// מאזין רציף. onResult(transcript, isFinal)
export class Listener {
  constructor(onResult, onState) {
    this.onResult = onResult; this.onState = onState || (() => {});
    this.want = false; this.rec = null;
  }
  start() {
    if (!SR) return false;
    this.want = true;
    if (this.rec) return true;
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alts = [...r].map(a => a.transcript);
        this.onResult(alts, r.isFinal);
      }
    };
    rec.onstart = () => this.onState('listening');
    rec.onerror = e => this.onState('error:' + e.error);
    rec.onend = () => { this.rec = null; this.onState('idle'); if (this.want) setTimeout(() => this.want && this.start(), 250); };
    try { rec.start(); this.rec = rec; } catch { this.rec = null; }
    return true;
  }
  stop() { this.want = false; if (this.rec) { try { this.rec.stop(); } catch {} this.rec = null; } }
}
