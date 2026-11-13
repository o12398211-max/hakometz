// בונה את מאגר השאלות: שאלות ידניות + שאלות שנוצרות אלגוריתמית (התשובה מחושבת בקוד ולכן תמיד נכונה)
// הרצה: node scripts/build-questions.js
const fs = require('fs');
const path = require('path');
const HAND = require('../questions/src/handwritten');

const LEVELS = [90, 80, 70, 60, 50, 40, 20, 10, 5, 1];
const OUT = path.join(__dirname, '..', 'questions');

// RNG דטרמיניסטי כדי שהמאגר יהיה יציב בין בניות
let seed = 1337;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const ALEF = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת'];
const LETTER_NAMES = { 'א': 'אלף', 'ב': 'בית', 'ג': 'גימל', 'ד': 'דלת', 'ה': 'הא', 'ו': 'וו', 'ז': 'זין', 'ח': 'חית', 'ט': 'טית', 'י': 'יוד', 'כ': 'כף', 'ל': 'למד', 'מ': 'מם', 'נ': 'נון', 'ס': 'סמך', 'ע': 'עין', 'פ': 'פא', 'צ': 'צדי', 'ק': 'קוף', 'ר': 'ריש', 'ש': 'שין', 'ת': 'תו' };
const COLOR_HE = { red: 'אדום', blue: 'כחול', gold: 'צהוב', green: 'ירוק' };
const SHAPE_HE = { circle: ['עיגול', 'עיגולים'], square: ['ריבוע', 'ריבועים'], triangle: ['משולש', 'משולשים'], star: ['כוכב', 'כוכבים'] };

const out = Object.fromEntries(LEVELS.map(l => [l, []]));
function add(level, text, correct, wrongs, explain, extra = {}) {
  const opts = [String(correct), ...wrongs.map(String)];
  if (new Set(opts).size !== 3) throw new Error('duplicate options: ' + text + ' ' + opts);
  out[level].push({ text, options: opts, correct: 0, explain, accept: extra.accept || null, image: extra.image || null, gen: true });
}
// מסיחים מספריים: מלכודות קודם, ואז שכנים
function numWrongs(c, traps = [], min = 0) {
  const w = [];
  for (const t of traps) if (t !== c && t >= min && !w.includes(t) && w.length < 2) w.push(t);
  const deltas = shuffle([1, -1, 2, -2, 3, 10, -10, 4]);
  for (const d of deltas) { const v = c + d; if (w.length < 2 && v !== c && v >= min && !w.includes(v)) w.push(v); }
  return w;
}
const dayWrongs = i => [DAYS[(i + 1) % 7], DAYS[(i + 6) % 7]];

// ───── מחוללים: רק סוגים שיש בהם עניין (תמונה, מלכודת, או חשיבה), ובכמות קטנה מכל סוג ─────
// כל תשובה מחושבת בקוד, ולכן תמיד נכונה.
const pad = m => String(m).padStart(2, '0');
const tstr = (h, m) => `${h}:${pad(m)}`;

// שעון במראה (תמונה)
for (const [h, m] of [[2, 0], [4, 15], [10, 20], [8, 5]]) {
  const real = (720 - (h * 60 + m)) % 720; const rh = Math.floor(real / 60) || 12, rm = real % 60;
  add(10, 'זו השתקפות של שעון קיר במראה. מה השעה האמיתית?', tstr(rh, rm), [tstr(h, m), tstr(((rh + 5) % 12) + 1, (rm + 30) % 60)], `במראה ימין ושמאל מתהפכים. השעה האמיתית היא 12:00 פחות ${tstr(h, m)}.`, { image: { fn: 'clock', params: { h, m, mirror: true } } });
}
// עוד כמה דקות (תמונה)
for (const [h, m, d] of [[2, 30, 45], [10, 45, 30]]) {
  const t = h * 60 + m + d, nh = Math.floor(t / 60) % 12 || 12, nm = t % 60;
  add(70, `מה תהיה השעה בעוד ${d} דקות?`, tstr(nh, nm), [tstr(h, (m + d) % 60), tstr((nh % 12) + 1, nm)], `${tstr(h, m)} ועוד ${d} דקות.`, { image: { fn: 'clock', params: { h, m } } });
}
// כמה משולשים / ריבועים (תמונה)
const tri = (k, h) => ((k + 1) * (k + 2) / 2) * (h + 1);
for (const [lv, k, h] of [[60, 1, 0], [40, 2, 0], [20, 1, 1], [10, 2, 1], [10, 3, 0], [5, 3, 1], [1, 3, 2]]) {
  const c = tri(k, h);
  add(lv, 'כמה משולשים יש בציור? (סופרים כל משולש, גם גדולים שמורכבים מקטנים)', c, numWrongs(c, [(k + 1) * (h + 1), (k + 1) * (h + 1) + 1]), `כל זוג קווים שיוצאים מהקודקוד העליון, יחד עם קו רוחבי, יוצר משולש: ${(k + 1) * (k + 2) / 2} זוגות כפול ${h + 1} קווים רוחביים.`, { image: { fn: 'triangles', params: { k, h } } });
}
const sq = (m, n) => { let t = 0; for (let s = 1; s <= Math.min(m, n); s++) t += (m - s + 1) * (n - s + 1); return t; };
for (const [lv, m, n] of [[50, 2, 2], [20, 2, 3], [10, 3, 3], [5, 3, 4], [1, 4, 4]]) {
  const c = sq(m, n);
  add(lv, 'כמה ריבועים יש בציור? (כולל ריבועים גדולים שמורכבים מכמה משבצות)', c, numWrongs(c, [m * n, m * n + 1]), `${m * n} משבצות קטנות, ועוד כל הריבועים הגדולים יותר.`, { image: { fn: 'grid', params: { m, n } } });
}
// משוואות צורות (תמונה)
for (let k = 0; k < 3; k++) {
  const a = ri(2, 9), b = ri(1, 9);
  add(60, 'לפי המשוואות בתמונה, כמה שווה הריבוע?', b, numWrongs(b, [a + b, a]), `העיגול שווה ${a}, ולכן הריבוע שווה ${a + b} פחות ${a}.`, { image: { fn: 'equations', params: { rows: [[['circle', '+', 'circle'], 2 * a], [['circle', '+', 'square'], a + b], [['square'], '?']] } } });
}
for (let k = 0; k < 3; k++) {
  const a = ri(2, 6), b = ri(2, 5), c = ri(1, 4), r = a + b * c;
  add(20, 'לפי המשוואות בתמונה, כמה שווה השורה האחרונה?', r, numWrongs(r, [(a + b) * c, a + b + c]), `עיגול ${a}, משולש ${b}, ריבוע ${c}. כפל לפני חיבור.`, { image: { fn: 'equations', params: { rows: [[['circle', '+', 'circle', '+', 'circle'], 3 * a], [['circle', '+', 'triangle', '+', 'triangle'], a + 2 * b], [['triangle', '+', 'square'], b + c], [['circle', '+', 'triangle', '×', 'square'], '?']] } } });
}
for (let k = 0; k < 3; k++) {
  const a = ri(3, 8), b = ri(2, 6), r = a + b * b;
  add(5, 'לפי המשוואות בתמונה, כמה שווה השורה האחרונה?', r, numWrongs(r, [(a + b) * b, a + 2 * b]), `עיגול ${a}, משולש ${b}. כפל לפני חיבור: ${a} ועוד ${b} כפול ${b}.`, { image: { fn: 'equations', params: { rows: [[['circle', '+', 'circle'], 2 * a], [['triangle', '+', 'triangle', '+', 'triangle'], 3 * b], [['circle', '+', 'triangle', '×', 'triangle'], '?']] } } });
}
// ספירת צורות (תמונה): קלות, והגרסה הקשה דורשת גם צבע וגם צורה
function scatter(items) {
  const cells = shuffle([...Array(24).keys()]).slice(0, items.length);
  return items.map((it, i) => ({ ...it, x: (cells[i] % 6) * 60 + 40 + ri(-8, 8), y: Math.floor(cells[i] / 6) * 55 + 35 + ri(-6, 6) }));
}
for (let k = 0; k < 3; k++) {
  const target = ['star', 'triangle', 'circle'][k], other = ['circle', 'square', 'star'][k];
  const n = ri(4, 7), m = ri(4, 7);
  const items = scatter([...Array(n)].map(() => ({ s: target, c: 'gold' })).concat([...Array(m)].map(() => ({ s: other, c: 'gold' }))));
  add(90, `כמה ${SHAPE_HE[target][1]} יש בתמונה?`, n, numWrongs(n, [n + m, m]), `יש ${n} ${SHAPE_HE[target][1]}.`, { image: { fn: 'shapes', params: { items } } });
}
for (let k = 0; k < 3; k++) {
  const col = ['red', 'blue', 'green'][k], n = ri(4, 8), m = ri(5, 8);
  const items = scatter([...Array(n)].map(() => ({ s: pick(['circle', 'square', 'triangle', 'star']), c: col })).concat([...Array(m)].map(() => ({ s: pick(['circle', 'square', 'triangle', 'star']), c: pick(['red', 'blue', 'green', 'gold'].filter(x => x !== col)) }))));
  add(80, `כמה צורות בצבע ${COLOR_HE[col]} יש בתמונה?`, n, numWrongs(n, [n + 1, n - 1]), `סופרים רק את הצורות בצבע ${COLOR_HE[col]}.`, { image: { fn: 'shapes', params: { items } } });
}
for (let k = 0; k < 3; k++) {
  const col = ['red', 'blue', 'green'][k], shp = ['circle', 'square', 'triangle'][k], n = ri(2, 5);
  const others = [];
  for (let i = 0; i < ri(10, 13); i++) { const s = pick(['circle', 'square', 'triangle', 'star']); let c = pick(['red', 'blue', 'green', 'gold']); if (s === shp && c === col) c = 'gold'; others.push({ s, c }); }
  const items = scatter([...Array(n)].map(() => ({ s: shp, c: col })).concat(others));
  add(60, `כמה ${SHAPE_HE[shp][1]} בצבע ${COLOR_HE[col]} יש בתמונה?`, n, numWrongs(n, [items.filter(x => x.s === shp).length, items.filter(x => x.c === col).length]), 'צריך גם את הצורה וגם את הצבע.', { image: { fn: 'shapes', params: { items } } });
}
// טקסט במראה (תמונה)
for (const [w, a, b] of [['שוקולד', 'שוקו', 'קולד'], ['מטריה', 'מטבע', 'מטרה'], ['גלידה', 'גדילה', 'גלגל'], ['אבטיח', 'אבטחה', 'בטיח']]) add(60, 'הכיתוב בתמונה מופיע הפוך, כמו במראה. מה כתוב?', w, [a, b], `כתוב "${w}".`, { image: { fn: 'mirrorText', params: { text: w } } });
// טבלה עם סכום שורות (תמונה)
for (let k = 0; k < 3; k++) {
  const S = ri(12, 20);
  const rows = [...Array(3)].map(() => { const a = ri(1, S - 4), b = ri(1, S - a - 1); return [a, b, S - a - b]; });
  const r = ri(0, 2), c = ri(0, 2), ans = rows[r][c];
  add(40, 'בכל שורה בטבלה סכום המספרים זהה. איזה מספר חסר?', ans, numWrongs(ans, [ans + 2, ans - 2], 0), `סכום כל שורה הוא ${S}.`, { image: { fn: 'numgrid', params: { cells: rows.map((row, i) => row.map((v, j) => (i === r && j === c ? '?' : v))) } } });
}
// לוח שנה
for (const [s, d] of [[0, 15], [4, 29]]) { const c = (s + d - 1) % 7; add(50, `אם ה-1 בחודש הוא יום ${DAYS[s]}, איזה יום יהיה ה-${d} באותו חודש?`, DAYS[c], [DAYS[(c + 1) % 7], DAYS[(c + 6) % 7]], `${d - 1} ימים אחרי ה-1: ${Math.floor((d - 1) / 7)} שבועות ועוד ${(d - 1) % 7}.`, { image: { fn: 'calendar', params: { start: s, highlight: 1 } } }); }
for (const [s, a, b] of [[3, 3, 24], [1, 9, 31]]) { const c = (s + (b - a)) % 7; add(20, `ה-${a} בחודש חל ביום ${DAYS[s]}. איזה יום יהיה ה-${b} באותו חודש?`, DAYS[c], [DAYS[(c + 1) % 7], DAYS[(c + 6) % 7]], `${b - a} ימים: ${Math.floor((b - a) / 7)} שבועות ועוד ${(b - a) % 7}.`); }
for (const [i] of [[3], [6]]) { const c = (i + 4) % 7; add(40, `אם שלשום היה יום ${DAYS[i]}, איזה יום יהיה מחרתיים?`, DAYS[c], [DAYS[(i + 3) % 7], DAYS[(i + 5) % 7]], `שלשום ${DAYS[i]}, היום ${DAYS[(i + 2) % 7]}, מחרתיים ${DAYS[c]}.`); }
// סדרות קשות
for (let k = 0; k < 3; k++) { const s = ri(2, 5), p = ri(1, 3); const a = [s]; for (let i = 1; i < 5; i++) a.push(a[i - 1] * 2 + p); const n = a[4] * 2 + p; add(10, `מה המספר הבא: ${a.join(', ')}, ?`, n, numWrongs(n, [a[4] * 2, a[4] + (a[4] - a[3])]), `כל מספר: כפול 2 ועוד ${p}.`); }
for (let k = 0; k < 2; k++) { const s1 = ri(1, 5), d1 = ri(2, 4), s2 = ri(20, 30), d2 = ri(1, 3); const a = [s1, s2, s1 + d1, s2 - d2, s1 + 2 * d1, s2 - 2 * d2, s1 + 3 * d1]; const n = s2 - 3 * d2; add(1, `מה המספר הבא: ${a.join(', ')}, ?`, n, numWrongs(n, [s1 + 4 * d1, a[6] + d1]), `שתי סדרות שזורות זו בזו. במקומות הזוגיים יורדים ב-${d2}.`); }
// לחיצות ידיים, גדר, מדרגות, כדורים, שעון מעורר: חידות "מלכודת"
for (const n of [4, 6]) add(10, `${n} חברים נפגשים, וכל אחד לוחץ יד לכל אחד מהאחרים פעם אחת בדיוק. כמה לחיצות ידיים יהיו?`, n * (n - 1) / 2, numWrongs(n * (n - 1) / 2, [n * (n - 1), n * n]), 'כל לחיצה מערבת שניים, אז מחלקים בשתיים.');
for (const n of [10, 12]) add(5, `בחדר ${n} אנשים, וכל אחד לוחץ יד לכל אחד אחר פעם אחת. כמה לחיצות ידיים יהיו?`, n * (n - 1) / 2, numWrongs(n * (n - 1) / 2, [n * (n - 1), n * n]), `${n} כפול ${n - 1}, חלקי 2.`);
for (const [L, d] of [[20, 2], [30, 5]]) add(20, `גדר ישרה באורך ${L} מטר. מציבים עמוד כל ${d} מטר, כולל בשני הקצוות. כמה עמודים צריך?`, L / d + 1, numWrongs(L / d + 1, [L / d, L / d + 2]), 'תמיד יש עמוד אחד יותר ממספר הרווחים.');
for (const [a, s, b] of [[3, 40, 5], [2, 18, 6], [4, 60, 7]]) { const per = s / (a - 1), c = per * (b - 1); add(5, `כדי לעלות ברגל מקומה 1 לקומה ${a} צריך לטפס ${s} מדרגות. כמה מדרגות צריך כדי לעלות מקומה 1 לקומה ${b}?`, c, numWrongs(c, [Math.round(s / a * b), s / a * (b - 1) | 0]), `מקומה 1 לקומה ${a} עולים רק ${a - 1} קומות, כלומר ${per} מדרגות לקומה.`); }
const fmtMin = x => (x % 60 === 0 ? `${x / 60} שעות` : `${x} דקות`).replace(/^1 שעות$/, 'שעה').replace(/^2 שעות$/, 'שעתיים');
for (const [lv, n, m] of [[5, 3, 30], [5, 4, 20], [1, 5, 30], [1, 6, 15]]) { const c = (n - 1) * m; add(lv, `הרופא נתן לך ${n} כדורים, ואמר לקחת אחד כל ${fmtMin(m)}. אחרי כמה זמן תיקח את האחרון?`, fmtMin(c), [fmtMin(n * m), fmtMin((n + 1) * m)], `את הראשון לוקחים מיד, ואז עוד ${n - 1} כדורים.`); }
for (const [bed, al] of [[20, 9], [21, 10], [19, 9]]) { const c = al - (bed - 12); add(5, `הלכתי לישון ב-${bed}:00 וכיוונתי שעון מעורר עם מחוגים (שעון של 12 שעות) ל-${al}:00. כמה שעות ישנתי עד שהשעון צלצל?`, c, numWrongs(c, [al + 24 - bed, al + 23 - bed]), `שעון מחוגים לא יודע אם זה בוקר או ערב. הוא יצלצל כבר ב-${al} בערב.`); }
for (const [c0, cow] of [[4, 3], [6, 2]]) { const t = c0 * 2 + cow * 4 + 4 + 2; add(10, `החקלאי יצא לחצר עם הכלב שלו. בחצר ${c0} תרנגולות ו-${cow} פרות. כמה רגליים יש בחצר?`, t, numWrongs(t, [t - 2, t - 6]), 'אל תשכחו את הכלב, ואת שתי הרגליים של החקלאי עצמו!'); }
// ספירת ספרות
const countDigit = (d, N) => { let t = 0; for (let i = 1; i <= N; i++) t += [...String(i)].filter(x => x === String(d)).length; return t; };
for (const [lv, d, N] of [[5, 1, 20], [5, 2, 30], [1, 3, 40], [1, 0, 60]]) { const c = countDigit(d, N); add(lv, `כותבים את כל המספרים מ-1 עד ${N}. כמה פעמים כותבים את הספרה ${d}?`, c, numWrongs(c, [c - 1, c + 1], 0), 'צריך לספור גם בספרת האחדות וגם בספרת העשרות.'); }
// מטבעות
for (const amt of [18, 39]) { let r = amt, n = 0; for (const c of [10, 5, 2, 1]) { n += Math.floor(r / c); r %= c; } add(40, `יש לכם מטבעות של 1, 2, 5 ו-10 ש"ח. מה המספר הקטן ביותר של מטבעות שצריך כדי לשלם בדיוק ${amt} ש"ח?`, n, numWrongs(n, [n + 1, n - 1], 1), 'לוקחים כמה שיותר מטבעות גדולים.'); }

// ───── מיזוג ובדיקות ─────
const files = {};
for (const lv of LEVELS) {
  const list = [];
  const seen = new Set();
  const hand = (HAND[lv] || []).map(([text, opts, explain, accept, image]) => ({ text, options: opts.map(String), correct: 0, explain, accept: accept || null, image: image || null }));
  for (const q of hand.concat(out[lv])) {
    const key = q.text + '|' + q.options[0] + '|' + JSON.stringify(q.image);
    if (seen.has(key)) continue;
    seen.add(key);
    if (new Set(q.options).size !== 3) throw new Error(`level ${lv}: duplicate options in "${q.text}"`);
    list.push(q);
  }
  files[lv] = list.map((q, i) => ({
    id: `q${lv}-${String(i + 1).padStart(3, '0')}`,
    level: lv,
    text: q.text,
    options: q.options,
    correct: q.correct,
    accept: q.options.map((o, j) => [...new Set([o, ...((q.accept && q.accept[j]) || [])])]),
    explain: q.explain,
    image: q.image,
  }));
  fs.writeFileSync(path.join(OUT, `level-${lv}.json`), JSON.stringify(files[lv], null, 1));
}
const total = Object.values(files).reduce((s, a) => s + a.length, 0);
console.log('שאלות לפי רמה:', Object.fromEntries(LEVELS.map(l => [l, files[l].length])), 'סה"כ', total);
