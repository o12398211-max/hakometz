// טעינת מאגר השאלות ובחירה ללא חזרות
const fs = require('fs');
const path = require('path');
const store = require('./store');

const LEVELS = [90, 80, 70, 60, 50, 40, 20, 10, 5, 1];
const DIR = path.join(__dirname, '..', 'questions');
const bank = {};
for (const lv of LEVELS) {
  try { bank[lv] = JSON.parse(fs.readFileSync(path.join(DIR, `level-${lv}.json`), 'utf8')); }
  catch { bank[lv] = []; console.warn('missing question file for level', lv); }
}
const byId = new Map();
for (const lv of LEVELS) for (const q of bank[lv]) byId.set(q.id, q);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// בחירת שאלה ברמה מסוימת שאף אחד מהשחקנים לא ראה. מחזיר {q, reset}
function pickQuestion(level, keys, exclude = new Set()) {
  const seen = new Set();
  for (const k of keys) for (const id of store.seenSet(k)) seen.add(id);
  let pool = bank[level].filter(q => !seen.has(q.id) && !exclude.has(q.id));
  let reset = false;
  if (!pool.length) {
    store.resetLevel(keys, level);
    reset = true;
    pool = bank[level].filter(q => !exclude.has(q.id));
  }
  if (!pool.length) pool = bank[level];
  const base = pool[Math.floor(Math.random() * pool.length)];
  return { q: prepare(base), reset };
}

// ערבוב סדר התשובות (חוץ משאלות שמסמנות keepOrder)
function prepare(base) {
  const idx = [0, 1, 2];
  if (!base.keepOrder) shuffle(idx);
  return {
    id: base.id,
    level: base.level,
    text: base.text,
    options: idx.map(i => base.options[i]),
    accept: idx.map(i => (base.accept && base.accept[i]) || []),
    correct: idx.indexOf(base.correct),
    explain: base.explain || '',
    image: base.image || null,
  };
}

function publicQ(q) {
  if (!q) return null;
  return { id: q.id, level: q.level, text: q.text, options: q.options, accept: q.accept, image: q.image };
}

function levelsFor(n) {
  n = Math.max(1, Math.min(10, n | 0));
  if (n === 10) return LEVELS.slice();
  if (n === 1) return [1];
  const out = [];
  for (let i = 0; i < n; i++) out.push(LEVELS[Math.round((i * 9) / (n - 1))]);
  return [...new Set(out)];
}

const counts = () => Object.fromEntries(LEVELS.map(l => [l, bank[l].length]));
module.exports = { LEVELS, bank, pickQuestion, publicQ, levelsFor, counts, byId };
