// בדיקת זרימה מלאה: מפעיל שרת במהירות גבוהה ומשחק את שלושת המצבים עם כמה לקוחות
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], { env: { ...process.env, PORT, GAME_SPEED: '0.03', DATA_DIR: path.join(__dirname, '../data-test') }, stdio: ['ignore', 'pipe', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) failures++; };

function client(name, profile = {}) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, id: 'test-' + name + '-' + Math.random().toString(36).slice(2, 7), name, state: null, phases: [], says: 0 };
  s.on('state', st => { c.state = st; const last = c.phases[c.phases.length - 1]; const k = st.phase + (st.game ? ':' + st.game.qIndex : ''); if (last !== k) c.phases.push(k); });
  s.on('host:say', () => c.says++);
  c.emit = (ev, data) => new Promise(r => s.emit(ev, data, r));
  c.info = extra => ({ id: c.id, name, avatar: { emoji: '🙂', color: '#e6b450' }, profile, ...extra });
  return c;
}
async function connectAll(cs) { await Promise.all(cs.map(c => new Promise(r => c.s.on('connect', r)))); }
// כל לקוח עונה תשובה אקראית בכל פעם שנפתחת הצבעה, ומחליט "להמשיך" בהחלטה
function autoplay(c, strategy = 'random') {
  let lastQ = -1;
  c.s.on('state', st => {
    if (!st.game) return;
    const me = st.game.contestants.find(x => x.id === c.id);
    if (st.phase === 'answering' && me && me.al && !me.tk && lastQ !== st.game.qIndex) {
      lastQ = st.game.qIndex;
      const choice = strategy === 'skip' && st.game.level <= 50 && !me.sk ? 'skip' : Math.floor(Math.random() * 3);
      setTimeout(() => c.s.emit('game:answer', { choice, lock: true }, () => {}), 20);
    }
    if (st.phase === 'decision' && me && me.al && !me.tk && !st.me.decision) c.s.emit('game:decision', { choice: 'go' }, () => {});
  });
}
async function until(c, pred, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (c.state && pred(c.state)) return true; await wait(50); }
  return false;
}

(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('רץ על') && r()));
  // ───── מועדון ─────
  console.log('\n[מועדון] 3 שחקנים + NPC, מנחה AI');
  const a = client('אבי', { age: 30, job: 'מורה', city: 'חיפה' }), b = client('בתיה'), d = client('דני');
  await connectAll([a, b, d]);
  const cr = await a.emit('room:create', a.info({ mode: 'club' }));
  ok(cr.ok && /^[A-Z0-9]{5}$/.test(cr.code), 'נוצר מועדון עם קוד בן 5 תווים: ' + cr.code);
  ok((await b.emit('room:join', b.info({ code: cr.code }))).ok, 'שחקן 2 הצטרף');
  ok((await d.emit('room:join', d.info({ code: cr.code.toLowerCase() }))).ok, 'שחקן 3 הצטרף (קוד באותיות קטנות)');
  ok((await d.emit('room:join', d.info({ code: 'ZZZZZ' }))).error, 'קוד שגוי נדחה');
  ok((await b.emit('room:settings', { mode: 'duel' })).error, 'רק המארח יכול לשנות הגדרות');
  await a.emit('room:settings', { settings: { npcFill: true } });
  [a, b, d].forEach(c => autoplay(c));
  ok(!(await a.emit('room:start')).error, 'המשחק התחיל');
  await until(a, s => s.phase === 'answering');
  ok(a.state.game.startCount === 100, 'האולם מולא ל-100 מתמודדים (3 אמיתיים + 97 NPC)');
  ok(a.state.game.question && a.state.game.correct === null, 'התשובה הנכונה לא נשלחת ללקוח בזמן ההצבעה');
  ok(!('correct' in (a.state.game.question || {})), 'אובייקט השאלה לא מכיל את האינדקס הנכון');
  ok((await a.emit('game:answer', { choice: 'skip' })).error, 'דילוג חסום לפני שאלת ה-50%');
  await until(a, s => s.phase === 'gameover', 120000);
  ok(a.state.phase === 'gameover', 'המשחק הגיע לסיום');
  const ph = a.phases.join(' ');
  ok(ph.includes('reveal') && ph.includes('elim'), 'עברו שלבי חשיפה והדחה');
  const levelsAsked = [...new Set(a.phases.filter(p => p.startsWith('answering')).map(p => p.split(':')[1]))];
  console.log('    שאלות שנשאלו:', levelsAsked.length, '| שלבים:', a.phases.length, '| קריינות:', a.says);
  ok(a.state.game.result, 'יש תוצאה: זוכים=' + a.state.game.result.winners.length + ', לקחו כסף=' + a.state.game.result.took.length);
  // סיבוב שני: לא חוזרות שאלות
  const firstQs = new Set();
  a.phases.length = 0;
  const qids = [];
  const qWatch = st => { if (st.phase === 'answering' && st.game?.question && !qids.includes(st.game.question.id)) qids.push(st.game.question.id); };
  a.s.on('state', qWatch);
  ok(!(await a.emit('room:start')).error, 'סיבוב שני התחיל');
  await until(a, s => s.phase === 'gameover', 120000);
  a.s.off('state', qWatch);
  const seen = require('../data-test/seen.json');
  const mine = seen[a.id + ':' + a.name] || [];
  ok(mine.length >= qids.length && new Set(mine).size === mine.length, `השרת שמר ${mine.length} שאלות שנראו לשחקן, בלי כפילויות`);
  void firstQs;
  [a, b, d].forEach(c => c.s.close());

  // ───── דו-קרב ─────
  console.log('\n[דו-קרב] 2 מתמודדים + צופה שמנחה');
  const p1 = client('רון'), p2 = client('שירה'), host = client('המנחה'), spec = client('צופה');
  await connectAll([p1, p2, host, spec]);
  const cr2 = await host.emit('room:create', host.info({ mode: 'duel' }));
  for (const c of [p1, p2, spec]) await c.emit('room:join', c.info({ code: cr2.code }));
  await host.emit('room:settings', { presenterId: host.id, duelists: [p1.id, p2.id] });
  ok((await host.emit('room:start')).error, 'מנחה אנושי בלי מיקרופון לא יכול להתחיל');
  host.s.emit('player:mic', { on: true });
  await wait(150);
  ok(host.state.duelists.length === 2 && host.state.settings.answerTime === 20, 'נבחרו 2 דוכנים, זמן ברירת מחדל 20 שניות');
  [p1, p2].forEach(c => autoplay(c));
  ok(!(await host.emit('room:start')).error, 'הדו-קרב התחיל');
  await until(spec, s => s.phase === 'answering');
  spec.s.emit('duel:vote', { id: p1.id });
  await until(spec, s => s.game && s.game.votes && s.game.votes[p1.id] === 1, 3000);
  ok(spec.state.game.votes && spec.state.game.votes[p1.id] === 1, 'צופה הצביע על מנצח');
  ok(spec.state.speakers.includes(p1.id) && spec.state.speakers.includes(host.id), 'המתמודדים והמנחה הם "דוברים" ב-WebRTC');
  host.s.emit('host:next'); // המנחה מקצר שלב
  await until(host, s => s.phase === 'gameover', 120000);
  const r2 = host.state.game.result;
  ok(r2 && r2.winners.length === 1, `יש מנצח בדו-קרב: ${r2 && r2.winners[0].n} (חיים ${r2 && r2.winners[0].lives}, מהירות ${r2 && r2.winners[0].speed})`);
  const g2 = host.state.game;
  ok(g2.contestants.some(c => c.lv <= 0) || g2.sudden || g2.qIndex >= g2.total - 1, 'הסיום חוקי (חיים נגמרו / שאלה אחרונה / מוות פתאומי)');
  console.log('    מוות פתאומי:', g2.sudden ? 'כן' : 'לא', '| שאלות:', g2.qIndex + 1);
  [p1, p2, host, spec].forEach(c => c.s.close());

  // ───── סולו ─────
  console.log('\n[סולו] שחקן אחד עם מנחה AI');
  const so = client('סולו');
  await connectAll([so]);
  const cr3 = await so.emit('room:create', so.info({ mode: 'solo' }));
  ok(cr3.ok, 'נוצר חדר סולו');
  autoplay(so, 'skip');
  ok(!(await so.emit('room:start')).error, 'משחק סולו התחיל');
  await until(so, s => s.phase === 'gameover', 120000);
  const r3 = so.state.game.result;
  ok(r3 && r3.solo, `סולו הסתיים: הכי רחוק ${r3 && r3.solo.bestLevel}%, רצף ${r3 && r3.solo.streak}`);
  const sk = so.state.game.contestants[0].sk;
  ok(typeof sk === 'boolean', 'מצב הדילוג נשמר: ' + (sk ? 'נוצל' : 'לא נוצל'));
  const lb = await (await fetch(URL + '/api/leaderboard')).json();
  ok(lb.some(r => r.name === 'סולו'), 'לוח השיאים בשרת עודכן');
  so.s.close();

  // ───── סולו מלא עם "רמאי" שמקבל את התשובה הנכונה מהבודק, כדי לוודא הגעה ל-1% ─────
  console.log('\n[סולו] הגעה עד שאלת ה-1% והחלטה אחרי ה-5%');
  const Q = {};
  for (const lv of [90, 80, 70, 60, 50, 40, 20, 10, 5, 1]) for (const q of require(`../questions/level-${lv}.json`)) Q[q.id] = q;
  const pro = client('אלוף');
  await connectAll([pro]);
  const cr4 = await pro.emit('room:create', pro.info({ mode: 'solo' }));
  let lq = -1, decided = false;
  pro.s.on('state', st => {
    if (st.phase === 'answering' && st.game.qIndex !== lq) {
      lq = st.game.qIndex;
      const q = st.game.question, base = Q[q.id];
      const idx = q.options.indexOf(base.options[base.correct]);
      pro.s.emit('game:answer', { choice: idx, lock: true }, () => {});
    }
    if (st.phase === 'decision' && !decided) { decided = true; pro.s.emit('game:decision', { choice: 'go' }, () => {}); }
  });
  await pro.emit('room:start');
  await until(pro, s => s.phase === 'gameover', 120000);
  const r4 = pro.state.game.result;
  ok(decided, 'הוצג שלב ההחלטה אחרי שאלת ה-5%');
  ok(r4.winners.length === 1 && r4.solo.reachedOne && r4.solo.bestLevel === 1, 'השחקן ענה נכון על כל 10 השאלות וזכה בשאלת ה-1%');
  ok(r4.winners[0].w === 20000, 'קיבל את הקופה (20,000 ש"ח וירטואליים)');
  pro.s.close();

  // ───── דו-קרב: שניהם צודקים תמיד → מוות פתאומי ─────
  console.log('\n[דו-קרב] שניהם צודקים עד הסוף → מוות פתאומי');
  const x1 = client('יואב'), x2 = client('מאיה');
  await connectAll([x1, x2]);
  const cr5 = await x1.emit('room:create', x1.info({ mode: 'duel' }));
  await x2.emit('room:join', x2.info({ code: cr5.code }));
  await x1.emit('room:settings', { duelists: [x1.id, x2.id], settings: { numQuestions: 3 } });
  const answerer = (c, wrongInSudden) => { let lq = -1; c.s.on('state', st => { if (st.phase === 'answering' && st.game.qIndex !== lq) { lq = st.game.qIndex; const q = st.game.question, base = Q[q.id]; let idx = q.options.indexOf(base.options[base.correct]); if (wrongInSudden && st.game.sudden && st.game.qIndex >= st.game.total + 1) idx = (idx + 1) % 3; setTimeout(() => c.s.emit('game:answer', { choice: idx, lock: true }, () => {}), c === x1 ? 10 : 60); } }); };
  answerer(x1, false); answerer(x2, true);
  await x1.emit('room:start');
  await until(x1, s => s.phase === 'gameover', 120000);
  const g5 = x1.state.game, r5 = g5.result;
  ok(g5.sudden, 'נכנסו למוות פתאומי אחרי שאלת ה-1%');
  ok(r5.winners[0].id === x1.id, 'מי שצדק כשהשני טעה במוות פתאומי ניצח');
  ok(g5.contestants.find(c => c.id === x1.id).sp > 0, 'נקודות מהירות נצברו למי שענה מהר יותר');
  x1.s.close(); x2.s.close();

  // ───── מועדון: כולם טועים → פיינליסטים ─────
  console.log('\n[מועדון] כולם טועים בשאלה → מי שהגיע הכי רחוק ממשיך');
  const w1 = client('טועה1'), w2 = client('טועה2');
  await connectAll([w1, w2]);
  const cr6 = await w1.emit('room:create', w1.info({ mode: 'club' }));
  await w2.emit('room:join', w2.info({ code: cr6.code }));
  await w1.emit('room:settings', { settings: { numQuestions: 3, interviews: false } });
  for (const c of [w1, w2]) { let lq = -1; c.s.on('state', st => { if (st.phase === 'answering' && st.game.qIndex !== lq && st.game.qIndex === 0) { lq = 0; const q = st.game.question, base = Q[q.id]; const idx = (q.options.indexOf(base.options[base.correct]) + 1) % 3; c.s.emit('game:answer', { choice: idx }, () => {}); } }); }
  await w1.emit('room:start');
  await until(w1, s => s.phase === 'elim');
  ok(w1.state.game.aliveCount === 2 && w1.state.game.contestants.every(c => c.fin), 'שני השחקנים טעו וחזרו כפיינליסטים');
  w1.s.close(); w2.s.close();

  // ───── שיחה עם מודח (סולו, טעות) ─────
  console.log('\n[שיחה] מתמודד טועה, מדבר עם מנחה ה-AI');
  const iv = client('מרואיין', { age: 41, job: 'נהג אוטובוס', city: 'אילת' });
  await connectAll([iv]);
  await iv.emit('room:create', iv.info({ mode: 'solo' }));
  const guestLines = [], hostLines = [];
  iv.s.on('host:say', m => (m.kind === 'guest' ? guestLines : hostLines).push(m));
  let lq7 = -1;
  iv.s.on('state', st => { if (st.phase === 'answering' && st.game.qIndex !== lq7) { lq7 = st.game.qIndex; const q = st.game.question, base = Q[q.id]; iv.s.emit('game:answer', { choice: (q.options.indexOf(base.options[base.correct]) + 1) % 3 }, () => {}); } });
  await iv.emit('room:start');
  await until(iv, s => s.phase === 'interview', 60000);
  ok(iv.state.game.interview && iv.state.game.interview.desc.includes('נהג אוטובוס'), 'נפתחה שיחה עם כיתוב: ' + (iv.state.game.interview && iv.state.game.interview.desc));
  const before = hostLines.length;
  iv.s.emit('interview:reply', { text: 'התבלבלתי בין הימים' });
  await wait(600);
  ok(guestLines.some(m => m.lines[0].includes('התבלבלתי')), 'דברי המתמודד שודרו לכולם ככתובית');
  ok(hostLines.length > before, 'המנחה ה-AI הגיב: "' + (hostLines[before] || { lines: [''] }).lines[0] + '"');
  await until(iv, s => s.phase === 'gameover', 60000);
  ok(iv.state.phase === 'gameover', 'אחרי השיחה המשחק הסתיים (סולו: טעות אחת)');
  iv.s.close();

  console.log(failures ? `\n❌ ${failures} בדיקות נכשלו` : '\n✅ כל הבדיקות עברו');
  srv.kill();
  require('fs').rmSync(path.join(__dirname, '../data-test'), { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
