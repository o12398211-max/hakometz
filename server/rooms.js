// מנוע המשחק: חדרים ומכונת מצבים לשלושת המצבים (club / duel / solo)
const Q = require('./questions');
const store = require('./store');
const S = require('./script');
const ai = require('./ai');
const { makeNpc, npcCorrectProb } = require('./npc');

const SPEED = Number(process.env.GAME_SPEED || 1); // לבדיקות מהירות
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_CONTESTANTS = 100;
const MAX_ROOM = 130;
const LETTERS = ['א', 'ב', 'ג'];

const rooms = new Map();
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join(''); } while (rooms.has(c));
  return c;
}
const fmt = n => Math.round(n).toLocaleString('en-US');

const DEFAULT_SETTINGS = {
  numQuestions: 10,
  answerTime: 30,
  npcFill: false,
  presenterPos: 'behind', // duel: behind | between
  subtitles: true,
  voiceInClub: false,
  interviews: true,
};

class Room {
  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.players = new Map();
    this.adminId = null;
    this.mode = 'club';
    this.settings = { ...DEFAULT_SETTINGS };
    this.presenterId = null;
    this.duelists = [];
    this.soloId = null;
    this.phase = 'lobby';
    this.phaseEndsAt = null;
    this.phaseDur = 0;
    this.g = null;
    this.timer = null;
    this.pendingNext = null;
    this.subTimers = [];
    this.emitT = null;
    this.lastActive = Date.now();
  }

  // ───────── שחקנים ─────────
  addPlayer(socket, info) {
    let p = this.players.get(info.id);
    if (!p) {
      if (this.players.size >= MAX_ROOM) return { error: 'החדר מלא' };
      p = { id: info.id, joinedAt: Date.now() };
      this.players.set(p.id, p);
    }
    Object.assign(p, {
      socketId: socket.id,
      name: String(info.name || 'שחקן').trim().slice(0, 18) || 'שחקן',
      avatar: info.avatar || { color: '#e6b450', emoji: '🙂' },
      profile: sanitizeProfile(info.profile),
      connected: true,
      mic: !!p.mic,
    });
    p.key = p.id + ':' + p.name;
    if (!this.adminId || !this.players.get(this.adminId)?.connected) this.adminId = p.id;
    socket.join(this.code);
    socket.data.roomCode = this.code;
    socket.data.pid = p.id;
    this.lastActive = Date.now();
    this.emitState();
    return { ok: true, player: p };
  }
  disconnect(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = false;
    p.mic = false;
    if (this.phase === 'lobby') {
      this.players.delete(pid);
      if (this.presenterId === pid) this.presenterId = null;
      this.duelists = this.duelists.filter(x => x !== pid);
      if (this.soloId === pid) this.soloId = null;
    }
    if (this.adminId === pid) {
      const next = [...this.players.values()].find(x => x.connected);
      this.adminId = next ? next.id : null;
    }
    this.emitState();
  }
  isAdmin(pid) { return pid === this.adminId; }
  canControl(pid) { return pid === this.adminId || pid === this.presenterId; }

  // ───────── שידור מצב ─────────
  emitState() {
    clearTimeout(this.emitT);
    this.emitT = setTimeout(() => this._emit(), 60);
  }
  _emit() {
    const base = this.view();
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const s = this.io.sockets.sockets.get(p.socketId);
      if (!s) continue;
      let me = { id: p.id };
      if (this.g) {
        const c = this.g.byId.get(p.id);
        if (c) me = { id: p.id, contestant: true, ans: c.ans, alive: c.alive, skipUsed: c.skipUsed, took: c.took, decision: c.decision };
        if (this.g.votes) me.vote = this.g.votes[p.id];
      }
      s.emit('state', { ...base, me });
    }
  }
  speakers() {
    const sp = new Set();
    if (this.presenterId) sp.add(this.presenterId);
    if (this.g) {
      if (this.mode === 'duel') this.g.contestants.forEach(c => sp.add(c.id));
      if (this.mode === 'solo') this.g.contestants.forEach(c => sp.add(c.id));
      if (this.g.interview && !this.g.interview.npc) sp.add(this.g.interview.id);
    }
    return [...sp].filter(id => this.players.get(id)?.connected);
  }
  view() {
    const g = this.g;
    const revealed = g && ['reveal', 'elim', 'interview', 'decision', 'decided', 'gameover'].includes(this.phase);
    return {
      code: this.code,
      mode: this.mode,
      settings: this.settings,
      adminId: this.adminId,
      presenterId: this.presenterId,
      duelists: this.duelists,
      soloId: this.soloId,
      aiSmart: ai.enabled(),
      ttsServer: ai.ttsEnabled(),
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, profile: p.profile, mic: p.mic, connected: p.connected })),
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      phaseDur: this.phaseDur,
      now: Date.now(),
      speakers: this.speakers(),
      counts: Q.counts(),
      game: g && {
        qIndex: g.qIndex,
        total: g.levels.length,
        levels: g.levels,
        level: g.q ? g.q.level : null,
        question: ['question', 'answering', 'lock', 'reveal', 'elim'].includes(this.phase) ? Q.publicQ(g.q) : null,
        lastQuestion: Q.publicQ(g.q),
        correct: revealed && g.q ? g.q.correct : null,
        explain: revealed && g.q ? g.q.explain : null,
        pot: g.pot,
        share: g.share,
        sudden: !!g.sudden,
        aliveCount: g.contestants.filter(c => c.alive && !c.took).length,
        startCount: g.contestants.length,
        elimThisRound: g.elimThisRound || [],
        skippedThisRound: g.skippedThisRound || [],
        interview: g.interview ? { id: g.interview.id, name: g.interview.name, desc: g.interview.desc, npc: g.interview.npc } : null,
        result: g.result || null,
        votes: g.votes ? tally(g.votes) : null,
        prompter: g.prompter || [],
        contestants: g.contestants.map(c => ({
          id: c.id, n: c.name, av: c.avatar, pr: c.profile, npc: !!c.npc,
          al: c.alive, el: c.elimAt, sk: c.skipUsed, tk: c.took, w: c.winnings, fin: !!c.fin,
          an: c.ans !== null, a: revealed ? c.ans : null, lv: c.lives, sp: c.speed, ok: revealed ? c.lastOk : null,
        })),
      },
    };
  }

  // ───────── הגדרות לובי ─────────
  updateSettings(pid, data) {
    if (!this.isAdmin(pid)) return 'רק המארח יכול לשנות הגדרות';
    if (this.phase !== 'lobby' && this.phase !== 'gameover') return 'לא ניתן לשנות באמצע משחק';
    if (data.mode && ['club', 'duel', 'solo'].includes(data.mode)) {
      this.mode = data.mode;
      if (this.mode === 'duel' && this.settings.answerTime === 30) this.settings.answerTime = 20;
      if (this.mode !== 'duel' && this.settings.answerTime === 20) this.settings.answerTime = 30;
    }
    if (data.settings) {
      const s = data.settings;
      if (s.numQuestions !== undefined) this.settings.numQuestions = clamp(s.numQuestions | 0, 3, 10);
      if (s.answerTime !== undefined) this.settings.answerTime = clamp(s.answerTime | 0, 10, 60);
      for (const k of ['npcFill', 'subtitles', 'voiceInClub', 'interviews']) if (s[k] !== undefined) this.settings[k] = !!s[k];
      if (s.presenterPos && ['behind', 'between'].includes(s.presenterPos)) this.settings.presenterPos = s.presenterPos;
    }
    if (data.presenterId !== undefined) {
      const id = data.presenterId;
      this.presenterId = id && this.players.has(id) ? id : null;
      this.duelists = this.duelists.filter(x => x !== this.presenterId);
      if (this.soloId === this.presenterId) this.soloId = null;
    }
    if (Array.isArray(data.duelists)) {
      this.duelists = data.duelists.filter(id => id && this.players.has(id) && id !== this.presenterId).slice(0, 2);
      if (this.duelists[0] === this.duelists[1]) this.duelists = [this.duelists[0]];
    }
    if (data.soloId !== undefined) {
      this.soloId = data.soloId && this.players.has(data.soloId) && data.soloId !== this.presenterId ? data.soloId : null;
    }
    this.emitState();
    return null;
  }
  setMic(pid, on) { const p = this.players.get(pid); if (p) { p.mic = !!on; this.emitState(); } }
  setProfile(pid, profile) { const p = this.players.get(pid); if (p) { p.profile = sanitizeProfile(profile); this.emitState(); } }

  // ───────── טיימרים ─────────
  setPhase(name, ms, next) {
    clearTimeout(this.timer);
    this.clearSubTimers();
    this.phase = name;
    this.pendingNext = next || null;
    if (ms) {
      const real = Math.max(300, ms * SPEED);
      this.phaseDur = real;
      this.phaseEndsAt = Date.now() + real;
      this.timer = setTimeout(() => this.advance(), real);
    } else { this.phaseEndsAt = null; this.phaseDur = 0; }
    this.emitState();
  }
  advance() {
    clearTimeout(this.timer);
    const f = this.pendingNext;
    this.pendingNext = null;
    if (f) f();
  }
  later(ms, fn) { this.subTimers.push(setTimeout(fn, Math.max(50, ms * SPEED))); }
  clearSubTimers() { this.subTimers.forEach(clearTimeout); this.subTimers = []; }
  hostNext(pid) {
    if (!this.canControl(pid)) return;
    if (this.pendingNext) this.advance();
  }

  // ───────── קריינות / טלפרומפטר ─────────
  say(lines, opts = {}) {
    lines = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!lines.length) return;
    if (this.g) this.g.prompter = (opts.append ? (this.g.prompter || []) : []).concat(lines).slice(-8);
    this.io.to(this.code).emit('host:say', { lines, ai: !this.presenterId, kind: opts.kind || 'host', who: opts.who || null, alts: opts.alts || null });
  }
  alert(msg) {
    const admin = this.players.get(this.adminId);
    if (admin) this.io.to(admin.socketId).emit('alert', msg);
  }
  roomKeys() { return [...this.players.values()].map(p => p.key); }

  // ───────── התחלת משחק ─────────
  start(pid) {
    if (!this.isAdmin(pid)) return 'רק המארח יכול להתחיל';
    if (this.phase !== 'lobby' && this.phase !== 'gameover') return 'המשחק כבר רץ';
    const connected = [...this.players.values()].filter(p => p.connected);
    if (this.presenterId && !this.players.get(this.presenterId)?.connected) this.presenterId = null;
    if (this.presenterId && !this.players.get(this.presenterId).mic && !process.env.ALLOW_PRESENTER_NO_MIC) return 'המנחה האנושי חייב להפעיל מיקרופון לפני שמתחילים (או בחרו מנחה AI)';
    let list = [];
    if (this.mode === 'club') {
      list = connected.filter(p => p.id !== this.presenterId).slice(0, MAX_CONTESTANTS);
      if (!list.length) return 'אין מתמודדים. המנחה לא יכול להיות גם המתמודד היחיד';
    } else if (this.mode === 'duel') {
      let d = this.duelists.filter(id => this.players.get(id)?.connected && id !== this.presenterId);
      if (d.length < 2) {
        const extra = connected.filter(p => p.id !== this.presenterId && !d.includes(p.id)).map(p => p.id);
        d = d.concat(extra).slice(0, 2);
      }
      if (d.length < 2) return 'דו-קרב צריך שני מתמודדים (חוץ מהמנחה)';
      this.duelists = d;
      list = d.map(id => this.players.get(id));
    } else {
      let id = this.soloId && this.players.get(this.soloId)?.connected ? this.soloId : null;
      if (!id) id = (connected.find(p => p.id === this.adminId && p.id !== this.presenterId) || connected.find(p => p.id !== this.presenterId) || {}).id;
      if (!id) return 'אין מתמודד לסולו';
      this.soloId = id;
      list = [this.players.get(id)];
    }
    const contestants = list.map(p => mkContestant(p, false));
    if (this.mode === 'club' && this.settings.npcFill) {
      for (let i = contestants.length; i < MAX_CONTESTANTS; i++) contestants.push(mkContestant(makeNpc(i), true));
    }
    if (this.mode === 'duel') contestants.forEach(c => { c.lives = 3; c.speed = 0; });
    const levels = Q.levelsFor(this.settings.numQuestions);
    const n = contestants.length;
    this.g = {
      contestants,
      byId: new Map(contestants.map(c => [c.id, c])),
      levels,
      qIndex: -1,
      q: null,
      used: new Set(),
      pot: this.mode === 'solo' ? 20000 : Math.max(1000 * n, 20000),
      share: 0,
      decisionDone: false,
      votes: this.mode === 'duel' ? {} : null,
      prompter: [],
      lastInterviewQ: -9,
      soloCorrect: 0,
      bestLevel: 100,
    };
    const names = contestants.map(c => c.name);
    if (this.mode === 'club') this.say(S.line('open_club', { n }));
    else if (this.mode === 'duel') this.say([S.line('open_duel', { a: names[0], b: names[1] }), S.line('duel_ready', { a: names[0], b: names[1] })]);
    else this.say(S.line('open_solo', { name: names[0] }));
    this.setPhase('intro', 11000, () => this.nextQuestion());
    return null;
  }

  // ───────── שאלה ─────────
  nextQuestion() {
    const g = this.g;
    g.qIndex++;
    let level;
    if (g.qIndex < g.levels.length) level = g.levels[g.qIndex];
    else if (this.mode === 'duel' && g.sudden) level = [10, 5, 1][(g.qIndex - g.levels.length) % 3];
    else { g.qIndex--; return this.finish(); }
    const keys = this.roomKeys();
    const { q, reset } = Q.pickQuestion(level, keys, g.used);
    if (reset) this.alert(`נגמרו השאלות החדשות ברמת ${level}% עבור השחקנים בחדר. הרמה הזאת אופסה.`);
    g.used.add(q.id);
    store.markSeen(keys, q.id);
    g.q = q;
    g.elimThisRound = [];
    g.skippedThisRound = [];
    g.interview = null;
    for (const c of g.contestants) { c.ans = null; c.ansAt = 0; c.lastOk = null; }
    const isFinal = level === 1 || (g.qIndex === g.levels.length - 1);
    const lines = [];
    if (g.sudden) lines.push('שאלת מוות פתאומי!');
    if (isFinal && !g.sudden) lines.push(S.line('final_intro'));
    lines.push(S.line('ask_intro', { pct: level, pctText: S.L.pct_text[level] }));
    if (level === 50 && this.mode !== 'duel') lines.push(S.line('skip_open'));
    lines.push(q.text);
    lines.push(q.options.map((o, i) => `${LETTERS[i]}: ${o}`).join('. '));
    this.say(lines, { kind: 'question' });
    const chars = lines.join(' ').length;
    const readMs = clamp(2200 + chars * 62, 5000, 24000);
    this.setPhase('question', readMs, () => this.openAnswers());
  }
  eligible() {
    return this.g.contestants.filter(c => c.alive && !c.took);
  }
  openAnswers() {
    const g = this.g;
    const T = this.settings.answerTime * 1000;
    g.openedAt = Date.now();
    this.say(S.line('lock', { t: this.settings.answerTime }), { kind: 'cue' });
    this.setPhase('answering', T, () => this.lockAnswers());
    // NPC עונים
    const realT = T * SPEED;
    for (const c of this.eligible()) {
      if (!c.npc) continue;
      const delay = realT * (0.15 + Math.random() * 0.75);
      this.subTimers.push(setTimeout(() => {
        if (this.phase !== 'answering') return;
        const lv = g.q.level;
        if (lv <= 50 && !c.skipUsed && Math.random() < (lv <= 10 ? 0.25 : 0.06)) { c.ans = 'skip'; }
        else if (Math.random() < npcCorrectProb(lv)) c.ans = g.q.correct;
        else { const wrong = [0, 1, 2].filter(i => i !== g.q.correct); c.ans = wrong[Math.floor(Math.random() * 2)]; }
        c.ansAt = Date.now() - g.openedAt;
        this.emitState();
      }, delay));
    }
    if (T > 12000) this.later(T - 10000, () => { if (this.phase === 'answering') this.say(S.line('last10'), { kind: 'cue', append: true }); });
  }
  answer(pid, data) {
    if (this.phase !== 'answering') return 'ההצבעה סגורה';
    const c = this.g.byId.get(pid);
    if (!c || !c.alive || c.took) return 'אינך מתמודד בשאלה הזאת';
    const choice = data && data.choice;
    if (choice === 'skip') {
      if (this.mode === 'duel') return 'אין דילוג בדו-קרב';
      if (this.g.q.level > 50) return 'הדילוג נפתח רק משאלת ה-50%';
      if (c.skipUsed) return 'כבר השתמשת בדילוג';
      c.ans = 'skip';
    } else if ([0, 1, 2].includes(choice)) c.ans = choice;
    else return 'תשובה לא חוקית';
    c.ansAt = Date.now() - this.g.openedAt;
    this.emitState();
    // אם כל המתמודדים האמיתיים נעלו בדו-קרב/סולו עם lock - מקצרים
    if (data.lock && this.mode !== 'club') {
      const all = this.eligible().every(x => x.ans !== null);
      if (all && this.phaseEndsAt - Date.now() > 3000 * SPEED) this.later(1500, () => { if (this.phase === 'answering') this.advance(); });
    }
    return null;
  }
  lockAnswers() {
    this.say(S.line('closed'), { kind: 'cue' });
    this.setPhase('lock', 4000, () => this.reveal());
  }

  // ───────── חשיפה ─────────
  reveal() {
    const g = this.g, q = g.q;
    const elig = this.eligible();
    for (const c of elig) {
      if (c.ans === 'skip') { c.lastOk = 'skip'; c.skipUsed = true; g.skippedThisRound.push(c.id); }
      else c.lastOk = c.ans === q.correct;
    }
    const lines = [S.line('reveal', { ans: `${LETTERS[q.correct]}, ${q.options[q.correct]}` })];
    if (q.explain) lines.push(q.explain);
    this.say(lines, { kind: 'reveal' });
    const ms = clamp(3500 + (q.explain || '').length * 60, 6000, 15000);
    this.setPhase('reveal', ms, () => (this.mode === 'duel' ? this.duelDamage() : this.eliminate()));
  }

  // ───────── הדחה (מועדון/סולו) ─────────
  eliminate() {
    const g = this.g, q = g.q;
    const elig = this.eligible();
    const isFinalQ = g.qIndex >= g.levels.length - 1;
    const out = elig.filter(c => c.lastOk === false);
    for (const c of out) { c.alive = false; c.elimAt = q.level; }
    for (const c of elig) if (c.lastOk === true) { c.correctCount = (c.correctCount || 0) + 1; g.bestLevel = Math.min(g.bestLevel, q.level); }
    g.elimThisRound = out.map(c => c.id);
    const left = this.eligible().length;
    const lines = [];
    if (this.mode === 'solo') {
      const c = g.contestants[0];
      if (c.lastOk === true) { g.soloCorrect++; lines.push(S.line('solo_correct', { name: c.name })); }
      else if (c.lastOk === 'skip') lines.push(`${c.name} דילג. הדילוג נוצל, ומכאן אין יותר רשת ביטחון.`);
      else lines.push(S.line('solo_wrong', { name: c.name, pct: q.level }));
    } else {
      if (left === 0 && out.length && !isFinalQ) {
        for (const c of out) { c.alive = true; c.elimAt = null; c.fin = true; }
        g.elimThisRound = [];
        lines.push(S.line('elim_all_reinstated'));
      } else if (!out.length) lines.push(S.line('elim_none'));
      else lines.push(S.line(out.length >= 10 || out.length > elig.length / 2 ? 'elim_many' : 'elim_few', { k: out.length, left }));
      if (g.skippedThisRound.length) lines.push(S.line('skipped', { k: g.skippedThisRound.length }));
    }
    this.say(lines, { kind: 'elim' });
    this.setPhase('elim', 5500, () => this.afterElim());
  }
  afterElim() {
    const g = this.g;
    const isFinalQ = g.qIndex >= g.levels.length - 1;
    if (this.mode === 'solo') {
      const c = g.contestants[0];
      const lv = g.q.level;
      if (!c.alive) return this.startInterview(c, 'solo_wrong', () => this.finish());
      if (!isFinalQ && lv <= 20 && Math.random() < 0.6) return this.startInterview(c, 'solo_chat', () => this.afterInterview());
      return this.afterInterview();
    }
    // מועדון: שיחה עם מודח
    if (this.settings.interviews && g.elimThisRound.length && g.qIndex - g.lastInterviewQ >= 2 && Math.random() < 0.55) {
      const outs = g.elimThisRound.map(id => g.byId.get(id));
      const real = outs.filter(c => !c.npc && this.players.get(c.id)?.connected);
      const withMic = real.filter(c => this.players.get(c.id).mic);
      const pickFrom = withMic.length ? withMic : real.length ? real : outs;
      const c = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      g.lastInterviewQ = g.qIndex;
      return this.startInterview(c, 'interview', () => this.afterInterview());
    }
    this.afterInterview();
  }
  afterInterview() {
    const g = this.g;
    g.interview = null;
    if (this.eligible().length === 0) return this.finish();
    const nextIsFinal = g.qIndex === g.levels.length - 2;
    if (nextIsFinal && !g.decisionDone && g.levels.length >= 2 && this.mode !== 'duel') return this.decision();
    this.nextQuestion();
  }

  // ───────── החלטה אחרי ה-5% ─────────
  decision() {
    const g = this.g;
    g.decisionDone = true;
    const elig = this.eligible();
    g.share = this.mode === 'solo' ? 10000 : Math.round(10000 / elig.length);
    for (const c of elig) c.decision = null;
    this.say([S.line('decision', { share: fmt(g.share), pot: fmt(g.pot) })], { kind: 'decision' });
    this.setPhase('decision', 22000, () => this.resolveDecision());
    for (const c of elig) if (c.npc) this.later(2000 + Math.random() * 12000, () => { if (this.phase === 'decision') { c.decision = Math.random() < 0.45 ? 'take' : 'go'; this.emitState(); } });
  }
  decide(pid, choice) {
    if (this.phase !== 'decision') return 'אין החלטה כרגע';
    const c = this.g.byId.get(pid);
    if (!c || !c.alive || c.took) return 'אינך בשלב ההחלטה';
    if (!['take', 'go'].includes(choice)) return 'בחירה לא חוקית';
    c.decision = choice;
    this.emitState();
    const pending = this.eligible().filter(x => !x.decision);
    if (!pending.length) this.later(1200, () => { if (this.phase === 'decision') this.advance(); });
    return null;
  }
  resolveDecision() {
    const g = this.g;
    const elig = this.eligible();
    let take = 0, go = 0;
    for (const c of elig) {
      if (c.decision === 'take') { c.took = true; c.winnings = g.share; take++; }
      else go++;
    }
    if (this.mode === 'solo') {
      const c = g.contestants[0];
      if (c.took) { this.say(S.line('solo_take', { name: c.name, share: fmt(g.share) })); return this.setPhase('decided', 6000, () => this.finish()); }
      this.say('הולכים על הכל! שאלת האחוז האחד.');
      return this.setPhase('decided', 4500, () => this.nextQuestion());
    }
    if (!go) { this.say(S.line('decision_all_take')); return this.setPhase('decided', 6000, () => this.finish()); }
    this.say(S.line('decision_res', { take, go }));
    this.setPhase('decided', 5500, () => this.nextQuestion());
  }

  // ───────── דו-קרב ─────────
  duelDamage() {
    const g = this.g;
    const [a, b] = g.contestants;
    const lines = [];
    const okA = a.lastOk === true, okB = b.lastOk === true;
    if (!okA) a.lives--;
    if (!okB) b.lives--;
    if (okA && okB) {
      lines.push(S.line('duel_both_right'));
      const fast = a.ansAt <= b.ansAt ? a : b;
      fast.speed++;
      lines.push(S.line('duel_speed', { name: fast.name }));
    } else if (!okA && !okB) lines.push(S.line('duel_both_wrong'));
    else {
      const w = okA ? a : b, l = okA ? b : a;
      w.speed++;
      lines.push(S.line('duel_one_wrong', { winner: w.name, loser: l.name, lives: Math.max(0, l.lives), la: Math.max(0, a.lives), lb: Math.max(0, b.lives) }));
    }
    for (const c of [a, b]) { if (c.lastOk === true) { c.correctCount = (c.correctCount || 0) + 1; } }
    g.elimThisRound = [a, b].filter(c => c.lastOk !== true).map(c => c.id);
    this.say(lines, { kind: 'elim' });
    this.setPhase('elim', 5500, () => this.duelAfter());
  }
  duelAfter() {
    const g = this.g;
    const [a, b] = g.contestants;
    const okA = a.lastOk === true, okB = b.lastOk === true;
    const lastRegular = g.qIndex >= g.levels.length - 1;
    let winner = null;
    if (a.lives <= 0 && b.lives > 0) winner = b;
    else if (b.lives <= 0 && a.lives > 0) winner = a;
    else if ((g.sudden || lastRegular) && okA !== okB) winner = okA ? a : b;
    if (winner) { g.winner = winner.id; return this.finish(); }
    if (a.lives <= 0 && b.lives <= 0) { a.lives = 1; b.lives = 1; }
    if (lastRegular && !g.sudden) {
      g.sudden = true;
      this.say(S.line('duel_sudden'));
      return this.setPhase('decided', 5000, () => this.nextQuestion());
    }
    if (g.sudden && g.qIndex - g.levels.length >= 6) {
      // אחרי 6 שאלות מוות פתאומי: שובר שוויון לפי נקודות מהירות, ואז חיים
      winner = a.speed !== b.speed ? (a.speed > b.speed ? a : b) : a.lives !== b.lives ? (a.lives > b.lives ? a : b) : (a.ansAt <= b.ansAt ? a : b);
      g.winner = winner.id; g.tiebreak = true;
      return this.finish();
    }
    // שיחה קצרה עם מי שטעה
    const wrong = [a, b].filter(c => c.lastOk !== true);
    if (wrong.length === 1 && (g.q.level <= 20 || Math.random() < 0.35)) {
      return this.startInterview(wrong[0], 'duel_chat', () => { this.g.interview = null; this.nextQuestion(); });
    }
    this.nextQuestion();
  }
  vote(pid, target) {
    const g = this.g;
    if (!g || !g.votes || this.mode !== 'duel') return;
    if (g.byId.has(pid)) return; // מתמודדים לא מצביעים
    if (!g.byId.has(target)) return;
    g.votes[pid] = target;
    this.emitState();
  }

  // ───────── שיחות ─────────
  startInterview(c, kind, done) {
    const g = this.g;
    const p = this.players.get(c.id);
    const desc = describe(c);
    const ansTxt = typeof c.ans === 'number' ? `${LETTERS[c.ans]}, ${g.q.options[c.ans]}` : 'שום דבר';
    const vars = { name: c.name, ans: ansTxt, city: c.profile.city || 'הבית', job: c.profile.job || 'מתמודד', pct: g.q.level };
    g.interview = { id: c.id, name: c.name, desc, npc: !!c.npc || !p || !p.connected, kind, history: [], vars, exchanges: 0, done };
    const opener = kind === 'interview' ? S.line('interview_open', vars) : kind === 'solo_wrong' ? `${c.name}, ספר לי, מה עבר לך בראש בשאלה הזאת?` : S.line(kind, vars);
    g.interview.history.push({ who: 'מנחה', text: opener });
    const alts = kind === 'interview' ? S.all('interview_open', vars).concat(S.all('interview_follow', vars)) : S.all('duel_chat', vars).concat(S.all('solo_chat', vars));
    this.say(opener, { kind: 'interview', alts });
    const dur = kind === 'interview' ? 26000 : kind === 'solo_wrong' ? 18000 : 14000;
    this.setPhase('interview', dur, () => {
      if (!this.presenterId) this.io.to(this.code).emit('host:say', { lines: [S.line('interview_close', vars)], ai: true, kind: 'host' });
      done();
    });
    if (g.interview.npc) {
      // שיחה "מבוימת" עם NPC או שחקן מנותק
      this.later(5500, () => this.ivReply(c.id, S.pick(S.CANNED_REPLIES), true));
    } else {
      this.later(10000, () => {
        const iv = this.g && this.g.interview;
        if (iv && iv.id === c.id && iv.exchanges === 0 && !this.presenterId) this.say(S.line('interview_follow', vars), { kind: 'interview', append: true });
      });
    }
  }
  async ivReply(pid, text, canned = false) {
    const g = this.g;
    const iv = g && g.interview;
    if (!iv || iv.id !== pid || this.phase !== 'interview') return;
    text = String(text || '').trim().slice(0, 240);
    if (!text) return;
    iv.history.push({ who: iv.name, text });
    iv.exchanges++;
    this.io.to(this.code).emit('host:say', { lines: [text], ai: false, kind: 'guest', who: iv.name });
    if (this.presenterId || iv.exchanges > 3) return;
    const context = `המתמודד ${iv.name} (${iv.desc}) ${iv.kind === 'interview' ? 'הודח זה עתה' : 'נמצא בדוכן'} בשאלת ${g.q.level} אחוז. השאלה: "${g.q.text}". הוא ענה: ${iv.vars.ans}. התשובה הנכונה: ${g.q.options[g.q.correct]}.`;
    const r = canned || !ai.enabled() ? S.pick(S.CANNED_HOST_REACT) : await ai.reply({ context, history: iv.history });
    if (!this.g || this.g.interview !== iv) return;
    iv.history.push({ who: 'מנחה', text: r });
    this.say(r, { kind: 'interview', append: true });
  }

  // ───────── סיום ─────────
  finish() {
    const g = this.g;
    g.interview = null;
    const lines = [];
    const res = { mode: this.mode, winners: [], took: g.contestants.filter(c => c.took).map(c => ({ id: c.id, n: c.name, w: c.winnings })) };
    if (this.mode === 'duel') {
      const w = g.byId.get(g.winner), l = g.contestants.find(c => c.id !== g.winner);
      res.winners = [{ id: w.id, n: w.name, lives: w.lives, speed: w.speed }];
      res.loser = { id: l.id, n: l.name, lives: Math.max(0, l.lives), speed: l.speed };
      res.tiebreak = !!g.tiebreak;
      lines.push(S.line('duel_win', { name: w.name, loser: l.name, lives: Math.max(0, w.lives), speed: w.speed }));
    } else {
      const finalAsked = g.q && g.qIndex === g.levels.length - 1;
      const winners = finalAsked ? this.eligible().filter(c => c.lastOk === true) : [];
      const each = winners.length ? Math.round(g.pot / winners.length) : 0;
      winners.forEach(c => { c.winnings = each; });
      res.winners = winners.map(c => ({ id: c.id, n: c.name, w: each }));
      res.each = each;
      if (this.mode === 'solo') {
        const c = g.contestants[0];
        const reachedOne = finalAsked && !c.took && (c.alive || c.elimAt === 1);
        if (winners.length) lines.push(S.line('solo_win', { name: c.name }));
        else if (reachedOne) lines.push(S.line('solo_lose_final', { name: c.name }));
        if (!c.npc) {
          res.record = store.recordSolo(c.name, { bestLevel: g.bestLevel, streak: g.soloCorrect, reachedOne, won: winners.length > 0 });
          res.solo = { bestLevel: g.bestLevel, streak: g.soloCorrect, reachedOne, won: winners.length > 0, took: c.took, winnings: c.winnings };
        }
      } else if (winners.length) {
        const names = winners.length > 4 ? `${winners.slice(0, 3).map(c => c.name).join(', ')} ועוד ${winners.length - 3}` : winners.map(c => c.name).join(' ו');
        lines.push(S.line('win_club', { names, pot: fmt(g.pot), each: fmt(each) }));
      } else if (finalAsked) lines.push(S.line('win_none'));
      else if (!res.took.length) lines.push(S.line('end_noone'));
    }
    g.result = res;
    store.flush();
    this.say(lines.length ? lines : ['זהו להערב! תודה שצפיתם ב"הקומץ".'], { kind: 'final' });
    this.setPhase('gameover', 0, null);
  }
  reset(pid) {
    if (!this.isAdmin(pid)) return 'רק המארח';
    clearTimeout(this.timer);
    this.clearSubTimers();
    this.g = null;
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    this.setPhase('lobby', 0, null);
    return null;
  }
}

function mkContestant(p, npc) {
  return { id: p.id, name: p.name, avatar: p.avatar, profile: p.profile || {}, npc, alive: true, elimAt: null, skipUsed: false, ans: null, ansAt: 0, took: false, winnings: 0, decision: null, correctCount: 0 };
}
function describe(c) {
  const pr = c.profile || {};
  return [c.name, pr.age, pr.job, pr.city ? 'מ' + pr.city : ''].filter(Boolean).join(', ');
}
function sanitizeProfile(pr = {}) {
  const s = v => String(v || '').trim().slice(0, 24);
  const age = parseInt(pr.age, 10);
  return { age: age > 0 && age < 120 ? age : '', job: s(pr.job), city: s(pr.city) };
}
function tally(votes) { const t = {}; for (const v of Object.values(votes)) t[v] = (t[v] || 0) + 1; return t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function createRoom(io) { const r = new Room(io, newCode()); rooms.set(r.code, r); return r; }
function getRoom(code) { return rooms.get(String(code || '').toUpperCase().trim()); }

setInterval(() => {
  for (const [code, r] of rooms) {
    const anyone = [...r.players.values()].some(p => p.connected);
    if (anyone) r.lastActive = Date.now();
    else if (Date.now() - r.lastActive > 15 * 60 * 1000) { clearTimeout(r.timer); r.clearSubTimers(); rooms.delete(code); }
  }
}, 60000).unref();

module.exports = { createRoom, getRoom, rooms };
