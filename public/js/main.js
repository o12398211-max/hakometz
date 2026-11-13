// "הקומץ" – לקוח
import { Studio } from './studio.js';
import { makeDirector } from './director.js';
import { audio } from './audio.js';
import { tts } from './tts.js';
import { Voice } from './rtc.js';
import { renderImage } from './images.js';
import { matchAnswer, Listener, voiceSupported } from './voice.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LET = ['א', 'ב', 'ג'];
const LEVELS = [90, 80, 70, 60, 50, 40, 20, 10, 5, 1];
const fmt = n => Math.round(n || 0).toLocaleString('en-US');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// ───────── פרופיל ─────────
const me = store.get('me', null) || { id: uid(), name: '', avatar: { emoji: '🙂', color: '#e6b450' }, profile: { age: '', job: '', city: '' } };
if (!me.id) me.id = uid();
const saveMe = () => store.set('me', me);
saveMe();
const prefs = Object.assign({ music: 0.55, sfx: 0.8, voice: 1, mute: false, tts: true, subs: true, streamer: false, prSpeed: 26, prSize: 22 }, store.get('prefs', {}));
const savePrefs = () => store.set('prefs', prefs);

// ───────── מערכות ─────────
const studio = new Studio($('#studio'));
const director = makeDirector(studio);
const socket = io({ transports: ['websocket', 'polling'] });
const voice = new Voice(socket, me.id);
let S = null; // מצב אחרון מהשרת
let prev = { phase: null, qIndex: -2, layoutKey: '' };
let clockOff = 0;
let currentRoom = sessionStorage.getItem('room') || null;
let povMode = true;
let myAns = null;
let lastPrompt = { lines: [], alts: [] };
let listener = null, listenMode = null;
let serverCfg = { aiSmart: false, ttsServer: false };

audio.setVolumes(prefs.music, prefs.sfx); audio.setMuted(prefs.mute);
tts.setVolume(prefs.voice); tts.setEnabled(prefs.tts && !prefs.mute);
fetch('/api/config').then(r => r.json()).then(c => { serverCfg = c; tts.setServer(c.ttsServer); }).catch(() => {});

// אולם מלא ברקע מסך הפתיחה
studio.setLayout('club', [...Array(64)].map((_, i) => ({ id: 'demo' + i, n: '', npc: true, al: true, av: { color: ['#e6b450', '#d98e3a', '#c7a26a', '#f0a050'][i % 4] } })));
director.update({ mode: 'lobby', phase: 'lobby', game: null });

// ───────── עזרים ─────────
function show(id) { for (const s of ['#home', '#lobby', '#game']) $(s).classList.toggle('hidden', s !== '#' + id); $('#bug').classList.toggle('hidden', id !== 'game'); }
function toast(msg, ms = 3200) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); }
const now = () => Date.now() + clockOff;
const remaining = () => (S && S.phaseEndsAt ? Math.max(0, S.phaseEndsAt - now()) : 0);
const myContestant = () => S?.game?.contestants.find(c => c.id === me.id);
const eligible = () => { const c = myContestant(); return !!c && c.al && !c.tk; };
const isPresenter = () => S && S.presenterId === me.id;
const isAdmin = () => S && S.adminId === me.id;
const levelIdx = lv => Math.max(0, LEVELS.indexOf(lv));
let audioReady = false;
async function ensureAudio() { if (audioReady) return; audioReady = true; await audio.init(); $('#tapToStart').classList.add('hidden'); syncMusic(true); }
addEventListener('pointerdown', ensureAudio, { once: false, capture: true });
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק ✓'); }
  catch { window.prompt('העתיקו:', text); }
}

// ───────── מסך פתיחה ─────────
const EMOJIS = ['🙂', '😎', '🤓', '🦁', '🐱', '🦊', '🐼', '🐸', '👩', '👨', '👵', '🧔', '🌟', '🔥', '🎩', '🦄'];
const COLORS = ['#e6b450', '#ff7a59', '#5ab0ff', '#7ad37a', '#c58bff', '#ffd166', '#ff5f8f', '#4fd1c5'];
function buildAvatars() {
  const row = $('#avatarRow'); row.innerHTML = '';
  EMOJIS.forEach((e, i) => {
    const b = document.createElement('button');
    b.textContent = e; b.style.background = COLORS[i % COLORS.length] + '55';
    if (me.avatar.emoji === e) b.classList.add('sel');
    b.onclick = () => { me.avatar = { emoji: e, color: COLORS[i % COLORS.length] }; saveMe(); buildAvatars(); };
    row.appendChild(b);
  });
}
buildAvatars();
$('#nick').value = me.name || '';
$('#pAge').value = me.profile.age || ''; $('#pJob').value = me.profile.job || ''; $('#pCity').value = me.profile.city || '';
function readProfile() {
  me.name = $('#nick').value.trim().slice(0, 18);
  me.profile = { age: $('#pAge').value.trim(), job: $('#pJob').value.trim(), city: $('#pCity').value.trim() };
  saveMe();
  if (!me.name) { toast('צריך כינוי קודם 🙂'); $('#nick').focus(); return false; }
  return true;
}
const info = extra => ({ id: me.id, name: me.name, avatar: me.avatar, profile: me.profile, ...extra });
$('#btnCreate').onclick = () => { if (readProfile()) createRoom('club'); };
$('#btnSolo').onclick = () => { if (readProfile()) createRoom('solo'); };
$('#btnJoinOpen').onclick = () => { $('#joinPanel').classList.toggle('hidden'); $('#joinCode').focus(); };
$('#btnJoin').onclick = () => { if (readProfile()) joinRoom($('#joinCode').value); };
$('#joinCode').addEventListener('keydown', e => e.key === 'Enter' && $('#btnJoin').click());
function createRoom(mode) {
  socket.emit('room:create', info({ mode }), res => {
    if (res.error) return toast(res.error);
    enterRoom(res.code);
  });
}
function joinRoom(code, silent) {
  code = String(code || '').trim().toUpperCase();
  if (code.length !== 5) { if (!silent) toast('הקוד הוא 5 תווים'); return; }
  socket.emit('room:join', info({ code }), res => {
    if (res.error) { if (!silent) toast(res.error); sessionStorage.removeItem('room'); currentRoom = null; history.replaceState(null, '', location.pathname); return; }
    enterRoom(res.code);
  });
}
function enterRoom(code) {
  currentRoom = code;
  sessionStorage.setItem('room', code);
  history.replaceState(null, '', '?room=' + code);
}
socket.on('connect', () => { if (currentRoom && me.name) joinRoom(currentRoom, true); });
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
  $('#joinPanel').classList.remove('hidden');
  $('#joinCode').value = urlRoom.toUpperCase();
  if (me.name && !currentRoom) currentRoom = urlRoom.toUpperCase();
}

// ───────── לובי ─────────
$$('#modes .mode').forEach(b => b.onclick = () => isAdmin() && socket.emit('room:settings', { mode: b.dataset.mode }, ack));
function ack(r) { if (r && r.error) toast(r.error); }
const setS = obj => socket.emit('room:settings', { settings: obj }, ack);
$('#sNum').innerHTML = [3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}">${n}</option>`).join('');
$('#sNum').onchange = e => setS({ numQuestions: +e.target.value });
$('#sTime').onchange = e => setS({ answerTime: +e.target.value });
$('#sNpc').onchange = e => setS({ npcFill: e.target.checked });
$('#sSubs').onchange = e => setS({ subtitles: e.target.checked });
$('#sInterviews').onchange = e => setS({ interviews: e.target.checked });
$('#sVoiceClub').onchange = e => setS({ voiceInClub: e.target.checked });
$('#sPos').onchange = e => setS({ presenterPos: e.target.value });
$('#presenterSel').onchange = e => socket.emit('room:settings', { presenterId: e.target.value || null }, ack);
$('#duelA').onchange = $('#duelB').onchange = () => socket.emit('room:settings', { duelists: [$('#duelA').value, $('#duelB').value] }, ack);
$('#soloP').onchange = e => socket.emit('room:settings', { soloId: e.target.value || null }, ack);
$('#btnStart').onclick = () => { ensureAudio(); socket.emit('room:start', null, ack); };
$('#btnLeave').onclick = () => { sessionStorage.removeItem('room'); location.href = location.pathname; };
$('#copyCode').onclick = () => S && copy(S.code);
$('#copyLink').onclick = () => S && copy(location.origin + location.pathname + '?room=' + S.code);
$('#streamer').checked = prefs.streamer;
$('#streamer').onchange = e => { prefs.streamer = e.target.checked; savePrefs(); if (S) renderLobby(S); };
async function toggleMic() {
  ensureAudio();
  if (voice.hasMic) { voice.disableMic(); socket.emit('player:mic', { on: false }); }
  else {
    if (!navigator.mediaDevices?.getUserMedia) return toast('המיקרופון דורש חיבור מאובטח (https)');
    const ok = await voice.enableMic();
    if (!ok) return toast('לא קיבלנו גישה למיקרופון. בדקו את הרשאות הדפדפן.');
    socket.emit('player:mic', { on: true });
    if (!voiceSupported) toast('הדפדפן הזה לא תומך בזיהוי דיבור. אפשר לדבר עם המנחה, אבל לענות בלחיצה. (Chrome/Edge תומכים)', 6000);
  }
  updateMicButtons();
}
function updateMicButtons() {
  $('#micBtn').textContent = voice.hasMic ? '🎤 מיקרופון פעיל ✓' : '🎤 הפעל מיקרופון';
  $('#micBtn2').style.opacity = voice.hasMic ? 1 : 0.5;
  $('#micHint').textContent = voice.hasMic ? (voiceSupported ? 'אפשר לענות בקול' : 'זיהוי דיבור לא נתמך בדפדפן') : 'מומלץ בדו-קרב ובסולו, חובה למנחה';
}
$('#micBtn').onclick = toggleMic; $('#micBtn2').onclick = toggleMic;
updateMicButtons();

function opt(v, label, sel) { return `<option value="${v}" ${sel ? 'selected' : ''}>${label}</option>`; }
function renderLobby(s) {
  const admin = s.adminId === me.id;
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('not-admin', !admin);
  $('#roomCode').textContent = s.code;
  $('#roomCode').classList.toggle('blur', prefs.streamer);
  $$('#modes .mode').forEach(b => { b.classList.toggle('sel', b.dataset.mode === s.mode); b.disabled = !admin; });
  const conn = s.players.filter(p => p.connected);
  $('#presenterSel').innerHTML = opt('', '🤖 מנחה AI', !s.presenterId) + conn.map(p => opt(p.id, `🎙️ ${p.name}${p.mic ? '' : ' (אין מיקרופון)'}`, s.presenterId === p.id)).join('');
  const cands = conn.filter(p => p.id !== s.presenterId);
  $('#duelSel').classList.toggle('hidden', s.mode !== 'duel');
  $('#soloSel').classList.toggle('hidden', s.mode !== 'solo');
  const [dA, dB] = s.duelists;
  $('#duelA').innerHTML = opt('', 'בחרו...', !dA) + cands.map(p => opt(p.id, p.name, dA === p.id)).join('');
  $('#duelB').innerHTML = opt('', 'בחרו...', !dB) + cands.map(p => opt(p.id, p.name, dB === p.id)).join('');
  $('#soloP').innerHTML = opt('', 'המארח', !s.soloId) + cands.map(p => opt(p.id, p.name, s.soloId === p.id)).join('');
  $('#sNum').value = s.settings.numQuestions;
  $('#sTime').value = s.settings.answerTime;
  $('#sNpc').checked = s.settings.npcFill;
  $('#npcLabel').textContent = s.mode === 'solo' ? 'קהל NPC ביציעים' : 'מילוי עמדות ריקות ב-NPC (עד 100)';
  $('#npcWrap').classList.toggle('hidden', s.mode === 'duel');
  $('#sSubs').checked = s.settings.subtitles;
  $('#sInterviews').checked = s.settings.interviews;
  $('#sVoiceClub').checked = s.settings.voiceInClub;
  $('#voiceClubWrap').classList.toggle('hidden', s.mode !== 'club');
  $('#posWrap').classList.toggle('hidden', s.mode !== 'duel');
  $('#sPos').value = s.settings.presenterPos;
  $('#pCount').textContent = `(${conn.length})`;
  $('#players').innerHTML = s.players.map(p => {
    const roles = [];
    if (p.id === s.adminId) roles.push('<span class="badge host">מארח</span>');
    if (p.id === s.presenterId) roles.push('<span class="badge">🎙️ מנחה</span>');
    if (s.mode === 'duel' && s.duelists.includes(p.id)) roles.push('<span class="badge">⚔️ בדוכן</span>');
    if (s.mode === 'solo' && (s.soloId === p.id || (!s.soloId && p.id === s.adminId))) roles.push('<span class="badge">🎯 מתמודד</span>');
    if (p.mic) roles.push('<span class="badge">🎤</span>');
    if (!p.connected) roles.push('<span class="badge off">מנותק</span>');
    const desc = [p.profile?.age, p.profile?.job, p.profile?.city].filter(Boolean).join(' · ');
    return `<li><span class="av" style="background:${p.avatar?.color || '#555'}55">${p.avatar?.emoji || '🙂'}</span><span class="nm">${esc(p.name)}${p.id === me.id ? ' (אני)' : ''}<br><small class="hint">${esc(desc)}</small></span>${roles.join(' ')}</li>`;
  }).join('');
  // הודעות
  let msg = '';
  const pres = s.players.find(p => p.id === s.presenterId);
  if (pres && !pres.mic) msg = '⚠️ למנחה האנושי אין מיקרופון פעיל. הוא צריך ללחוץ "הפעל מיקרופון".';
  else if (s.mode === 'duel' && cands.length < 2) msg = 'דו-קרב צריך שני מתמודדים (חוץ מהמנחה). שלחו קישור הזמנה!';
  else if (s.mode === 'club') msg = `${cands.length} מתמודדים${s.settings.npcFill ? ` + ${Math.max(0, 100 - cands.length)} NPC` : ''} באולם. מנחה: ${pres ? pres.name : 'AI'}`;
  else if (s.mode === 'solo') msg = `מנחה: ${pres ? pres.name : 'AI'}. אפשר לשלוח לחבר את הקוד כדי שינחה אותך.`;
  if (s.presenterId === me.id && !voice.hasMic) msg = '🎙️ נבחרת להנחות! הפעל מיקרופון כדי שכולם ישמעו אותך.';
  $('#lobbyMsg').textContent = msg;
  // תצוגה מקדימה באולפן
  const preview = previewList(s);
  const key = 'lobby:' + s.mode + ':' + preview.map(c => c.id).join(',') + ':' + s.settings.presenterPos + ':' + s.settings.npcFill;
  if (key !== prev.layoutKey) {
    prev.layoutKey = key;
    studio.setLayout(s.mode === 'club' ? 'club' : s.mode, preview, { presenterPos: s.settings.presenterPos, npcAudience: s.settings.npcFill });
  }
}
function previewList(s) {
  const conn = s.players.filter(p => p.connected && p.id !== s.presenterId);
  const toC = p => ({ id: p.id, n: p.name, av: p.avatar, npc: false, al: true });
  if (s.mode === 'duel') { let d = s.duelists.map(id => conn.find(p => p.id === id)).filter(Boolean); d = d.concat(conn.filter(p => !d.includes(p))).slice(0, 2); while (d.length < 2) d.push({ id: 'ph' + d.length, name: '?', avatar: { color: '#555' } }); return d.map(toC); }
  if (s.mode === 'solo') { const p = conn.find(x => x.id === (s.soloId || s.adminId)) || conn[0] || { id: 'ph', name: '?', avatar: {} }; return [toC(p)]; }
  const list = conn.map(toC);
  if (s.settings.npcFill) for (let i = list.length; i < 100; i++) list.push({ id: 'npcp' + i, n: '', npc: true, al: true, av: { color: COLORS[i % COLORS.length] } });
  return list;
}
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ───────── קבלת מצב ─────────
socket.on('state', s => {
  clockOff = s.now - Date.now();
  const p = S;
  S = s;
  if (s.phase === 'lobby') { show('lobby'); renderLobby(s); }
  else { show('game'); renderGame(s, p); }
  director.update(s);
  syncVoice();
  syncMusic();
});
socket.on('alert', msg => toast('📣 ' + msg, 6000));
socket.on('host:say', onHostSay);

function syncVoice() {
  if (!S) return;
  const g = S.game;
  let blocked = [];
  if (S.mode === 'duel' && g && ['question', 'answering', 'lock'].includes(S.phase)) {
    const ids = g.contestants.map(c => c.id);
    if (ids.includes(me.id)) blocked = ids.filter(id => id !== me.id);
  }
  voice.update({ players: S.players, speakers: S.speakers, blocked });
}

// ───────── מוזיקה לפי שלב ─────────
let musicKey = '';
function syncMusic(force) {
  if (!S || !audio.ctx) return;
  const ph = S.phase, g = S.game;
  const key = ph + ':' + (g ? g.qIndex : '');
  if (key === musicKey && !force) return;
  const prevKey = musicKey;
  musicKey = key;
  const inten = g && g.level ? 0.15 + (levelIdx(g.level) / 9) * 0.85 : 0.3;
  switch (ph) {
    case 'lobby': audio.play('lobby'); break;
    case 'intro': audio.play('intro'); audio.fx('whoosh'); break;
    case 'question': audio.stop(0.8); audio.fx('whoosh'); break;
    case 'answering': audio.play('tension', { intensity: inten, restart: true }); audio.setUrgent(false); break;
    case 'lock': audio.cut(); break;
    case 'reveal': audio.fx('gold'); break;
    case 'elim': if (g.elimThisRound.length) { audio.fx('blue'); setTimeout(() => audio.fx('elim'), 400); } else audio.fx('applause'); break;
    case 'decision': audio.play('decision'); break;
    case 'decided': audio.stop(0.5); break;
    case 'interview': audio.stop(0.5); break;
    case 'gameover': {
      const won = g?.result?.winners?.length;
      if (won) { audio.play('win'); audio.fx('applause'); } else audio.play('lobby');
      break;
    }
  }
  void prevKey;
}

// ───────── משחק ─────────
function renderGame(s, p) {
  const g = s.game;
  if (!g) return;
  const phase = s.phase;
  const phaseChanged = !p || p.phase !== phase || p.game?.qIndex !== g.qIndex;
  // פריסה
  const key = 'game:' + s.mode + ':' + g.contestants.map(c => c.id).join(',') + ':' + s.settings.presenterPos;
  if (key !== prev.layoutKey) {
    prev.layoutKey = key;
    studio.setLayout(s.mode, g.contestants, { presenterPos: s.settings.presenterPos, npcAudience: s.settings.npcFill });
  }
  const revealed = ['reveal', 'elim', 'interview', 'decision', 'decided', 'gameover'].includes(phase);
  studio.updateContestants(g.contestants, { answering: phase === 'answering' || phase === 'lock', revealed });
  // POV למנחה אנושי
  if (isPresenter() && povMode) studio.setPOV(studio.hostPOV()); else studio.setPOV(null);
  // אווירה
  const lv = g.level;
  let mood = 'gold';
  if (phase === 'elim' && g.elimThisRound.length) mood = 'blue';
  else if (['question', 'answering', 'lock'].includes(phase) && lv && lv <= 5) mood = 'red';
  else if (phase === 'interview' || phase === 'decision') mood = 'dim';
  if (s.mode === 'solo' && g.contestants[0] && !g.contestants[0].al) mood = 'blue';
  studio.setMood(mood);
  // מסכי LED
  if (phaseChanged) {
    const alive = g.aliveCount;
    if (phase === 'intro' || phase === 'gameover' || !lv) studio.setScreens({});
    else studio.setScreens({ big: `${lv}%`, small: s.mode === 'club' ? `נשארו ${alive}` : s.mode === 'duel' ? g.contestants.map(c => c.n).join(' נגד ') : g.contestants[0].n, sub: s.mode !== 'duel' ? `קופה ₪${fmt(g.pot)}` : '' });
    if (phase === 'gameover' && g.result?.winners?.length) studio.celebrate();
    if (phase === 'intro') studio.puffSmoke();
  }
  // שורת סטטוס
  const qLabel = g.sudden && g.qIndex >= g.total ? '⚡ מוות פתאומי' : `שאלה ${Math.min(g.qIndex + 1, g.total)}/${g.total}`;
  if (s.mode === 'club') { $('#statusL').textContent = `👥 נשארו ${g.aliveCount}/${g.startCount}`; $('#statusR').textContent = `${qLabel} · ₪${fmt(g.pot)}`; }
  else if (s.mode === 'duel') { $('#statusL').textContent = qLabel; $('#statusR').textContent = ''; }
  else { $('#statusL').textContent = qLabel; $('#statusR').textContent = `קופה ₪${fmt(g.pot)}`; }
  renderDuelBar(s, p);
  // תגית אחוז
  const showQ = ['question', 'answering', 'lock', 'reveal', 'elim'].includes(phase) && g.question;
  $('#pctBadge').classList.toggle('hidden', !lv || !['question', 'answering', 'lock', 'reveal', 'elim'].includes(phase));
  if (lv) { $('#pctText').textContent = lv + '%'; $('#pctBadge').classList.toggle('red', lv <= 5); }
  if (phaseChanged && phase === 'question') { const b = $('#pctBadge'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  // קלף שאלה
  $('#qwrap').classList.toggle('hidden', !showQ);
  if (showQ) renderQuestion(s, phaseChanged);
  $('#timer').classList.toggle('hidden', phase !== 'answering');
  // הודעות גדולות
  if (phaseChanged) onPhase(s, p);
  // החלטה
  renderDecision(s);
  // מנחה
  const presenterHuman = !!s.presenterId;
  $('#hostCtl').classList.toggle('hidden', !(isPresenter() || isAdmin()) || phase === 'gameover');
  $('#povBtn').classList.toggle('hidden', !isPresenter());
  $('#povBtn').textContent = povMode ? '🎥 שידור במאי' : '👁️ נקודת המבט שלי';
  const prVisible = isPresenter() && presenterHuman && !prHidden;
  $('#prompter').classList.toggle('hidden', !prVisible);
  $('#prShow').classList.toggle('hidden', !(isPresenter() && prHidden));
  if (isPresenter()) renderPrompter();
  // הצבעת צופים בדו-קרב
  renderVotes(s);
  // שיחה
  const iv = g.interview;
  const iAmGuest = phase === 'interview' && iv && iv.id === me.id;
  $('#ivBox').classList.toggle('hidden', !(iAmGuest && !presenterHuman));
  // תוצאה
  renderResult(s);
  // האזנה קולית
  syncListening();
  $('#lowerThird').classList.toggle('above-q', !!showQ);
}

function renderDuelBar(s, p) {
  const bar = $('#duelBar');
  if (s.mode !== 'duel') { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const g = s.game;
  const hurt = s.phase === 'elim' && (!p || p.phase !== 'elim') ? new Set(g.elimThisRound) : new Set();
  bar.innerHTML = g.contestants.map(c => `<div class="duelist ${s.phase === 'answering' && c.an ? 'locked' : ''} ${hurt.has(c.id) ? 'hurt' : ''}"><div class="n">${esc(c.n)}</div><div class="hearts">${'❤️'.repeat(Math.max(0, c.lv))}${'🖤'.repeat(Math.max(0, 3 - Math.max(0, c.lv)))}</div><div class="sp">⚡ ${c.sp} נק' מהירות${s.phase === 'answering' && c.an ? ' · נעל ✓' : ''}</div></div>`).join('');
}

let renderedQ = null;
function renderQuestion(s, phaseChanged) {
  const g = s.game, q = g.question, phase = s.phase;
  if (renderedQ !== q.id) {
    renderedQ = q.id;
    myAns = null;
    $('#qText').textContent = q.text;
    $('#qImg').innerHTML = renderImage(q.image);
    $('#opts').innerHTML = q.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="tag">${LET[i]}</span><span class="ot">${esc(o)}</span></button>`).join('');
    $$('#opts .opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
    const w = $('#qwrap'); w.classList.remove('enter'); void w.offsetWidth; w.classList.add('enter');
  }
  const mc = myContestant();
  if (S.me && S.me.ans !== undefined && S.me.ans !== null && phase === 'answering' && myAns === null) myAns = S.me.ans;
  if (phase !== 'answering' && S.me && S.me.ans !== undefined) myAns = S.me.ans;
  const canAnswer = phase === 'answering' && eligible();
  const revealed = phase === 'reveal' || phase === 'elim';
  $$('#opts .opt').forEach((b, i) => {
    b.disabled = !canAnswer;
    b.classList.toggle('mine', myAns === i && !revealed);
    b.classList.toggle('locked', phase === 'lock');
    b.classList.toggle('correct', revealed && g.correct === i);
    b.classList.toggle('wrong-mine', revealed && myAns === i && g.correct !== i);
    b.classList.toggle('dim', revealed && g.correct !== i && myAns !== i);
  });
  const sk = $('#skipBtn');
  const canSkip = canAnswer && s.mode !== 'duel' && g.level <= 50 && mc && !mc.sk;
  sk.classList.toggle('hidden', !canSkip && !(myAns === 'skip' && phase === 'answering'));
  sk.classList.toggle('on', myAns === 'skip');
  sk.disabled = !canAnswer;
}
$('#skipBtn').onclick = () => answer('skip');
function answer(choice, lock = false) {
  if (!S || S.phase !== 'answering' || !eligible()) return;
  ensureAudio();
  myAns = choice;
  audio.fx(lock ? 'lock' : 'click');
  socket.emit('game:answer', { choice, lock }, r => { if (r && r.error) toast(r.error); });
  renderQuestion(S, false);
}

// ───────── אירועי שלב ─────────
let cdTimers = [];
const HINTS = ['רמז: קראו את השאלה שוב. לאט.', 'רמז: לפעמים התשובה הכי פשוטה היא הנכונה.', 'רמז: שימו לב לכל מילה בשאלה.', 'רמז: יש פה מלכודת? תחשבו פעמיים.', 'רמז: חשבו כמו ילד בן 8.'];
function onPhase(s, p) {
  const g = s.game, phase = s.phase;
  cdTimers.forEach(clearTimeout); cdTimers = [];
  document.body.classList.toggle('mode-duel', s.mode === 'duel');
  // כתוביות ישנות משלב קודם לא נשארות על המסך
  for (let i = ltQueue.length - 1; i >= 0; i--) if (ltQueue[i].kind === 'quote' && Date.now() - ltQueue[i].t > 1500) ltQueue.splice(i, 1);
  $('#countdown').classList.add('hidden');
  hideBig();
  if (phase === 'intro') {
    if (s.mode !== 'club') g.contestants.forEach((c, i) => setTimeout(() => lowerThird(c.n, describe(c), 'name', 3500), 2500 + i * 3800));
    bigMsg('הקומץ', s.mode === 'duel' ? 'דו-קרב' : s.mode === 'solo' ? 'משחק סולו' : `${g.startCount} מתמודדים`, 'gold', 3000);
  }
  if (phase === 'answering') {
    if (s.mode === 'club' && subsOn() && Math.random() < 0.3) cdTimers.push(setTimeout(() => S?.phase === 'answering' && lowerThird('', HINTS[Math.floor(Math.random() * HINTS.length)], 'hint', 3500), remaining() * 0.35));
  }
  if (phase === 'lock') {
    const step = Math.max(250, (s.phaseDur || 4000) / 4);
    [3, 2, 1].forEach((n, i) => cdTimers.push(setTimeout(() => {
      const el = $('#countdown'); el.classList.remove('hidden'); el.innerHTML = `<span>${n}</span>`;
      audio.fx(n === 1 ? 'beepHi' : 'beep');
    }, i * step)));
    cdTimers.push(setTimeout(() => $('#countdown').classList.add('hidden'), step * 3.2));
  }
  if (phase === 'reveal') {
    const mc = myContestant();
    if (mc && mc.ok === true) bigMsg('צדקת!', '', 'gold', 2200);
    else if (mc && mc.ok === 'skip') bigMsg('דילגת', 'נשארת בחיים', 'gold', 2200);
    else if (mc && mc.ok === false) bigMsg('טעית...', '', 'blue', 2200);
  }
  if (phase === 'elim') {
    const k = g.elimThisRound.length;
    const mine = g.elimThisRound.includes(me.id);
    if (s.mode === 'duel') {
      const names = g.elimThisRound.map(id => g.contestants.find(c => c.id === id)?.n).filter(Boolean);
      if (!k) bigMsg('שניהם צדקו!', '', 'gold', 3000);
      else bigMsg(mine ? 'איבדת חיים!' : k === 2 ? 'שניהם טעו!' : `${names[0]} מאבד חיים`, '', 'blue', 3000);
    } else if (s.mode === 'solo') {
      const c = g.contestants[0];
      if (!c.al) bigMsg(c.id === me.id ? 'הודחת' : `${c.n} הודח`, `הגעת עד שאלת ה-${g.level}%`, 'blue', 4000);
      else if (c.ok === true) bigMsg('נכון!', `עוברים לשלב הבא`, 'gold', 2500);
    } else {
      const fin = g.contestants.some(c => c.fin) && !k && p && p.game && p.game.aliveCount === 0;
      if (mine) bigMsg('הודחת', `נשארו ${g.aliveCount}`, 'blue', 3500);
      else if (k) bigMsg(`${k} הודחו`, `נשארו ${g.aliveCount}`, 'blue', 3500);
      else if (g.contestants.some(c => c.fin) && g.aliveCount && fin) bigMsg('פיינליסטים!', 'מי שהגיע הכי רחוק ממשיך', 'red', 3500);
      else bigMsg('כולם שורדים!', '', 'gold', 2500);
    }
  }
  if (phase === 'interview' && g.interview) {
    lowerThird(g.interview.name, g.interview.desc.split(', ').slice(1).join(', '), 'name', 6000, true);
  }
  if (phase === 'decision' && !eligible()) bigMsg('רגע ההחלטה', 'המתמודדים מחליטים: לקחת את הכסף או להמשיך?', 'gold', 5000);
  if (phase === 'decided' && g.sudden) bigMsg('מוות פתאומי!', '', 'red', 4000);
}
function describe(c) { const pr = c.pr || {}; return [pr.age, pr.job, pr.city ? 'מ' + pr.city : ''].filter(Boolean).join(', ') || 'מתמודד'; }
let bigT = null;
function bigMsg(t, sub, cls, ms) {
  const el = $('#bigMsg'); el.className = cls; el.innerHTML = `<div class="t">${esc(t)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;
  clearTimeout(bigT); bigT = setTimeout(hideBig, ms);
}
function hideBig() { $('#bigMsg').classList.add('hidden'); }

// ───────── כתוביות (Lower thirds) ─────────
const ltQueue = []; let ltBusy = false, ltTimer = null;
const subsOn = () => prefs.subs && (!S || S.settings.subtitles);
function lowerThird(name, text, kind = 'quote', ms, priority) {
  if (!text && !name) return;
  if (kind !== 'name' && kind !== 'answer' && kind !== 'guest' && !subsOn()) return;
  const item = { name, text, kind, t: Date.now(), ms: ms || Math.min(7000, 1800 + String(text).length * 65) };
  if (priority) { ltQueue.unshift(item); clearTimeout(ltTimer); ltBusy = false; }
  else ltQueue.push(item);
  if (ltQueue.length > 6) ltQueue.splice(1, ltQueue.length - 6);
  if (!ltBusy) nextLT();
}
function nextLT() {
  const el = $('#lowerThird');
  const it = ltQueue.shift();
  if (!it) { ltBusy = false; el.classList.add('hidden'); return; }
  ltBusy = true;
  $('#ltName').textContent = it.name || '';
  $('#ltText').textContent = it.text || '';
  el.className = 'show' + (it.kind === 'answer' ? ' gold' : '');
  el.classList.toggle('above-q', !$('#qwrap').classList.contains('hidden'));
  void el.offsetWidth;
  ltTimer = setTimeout(nextLT, it.ms);
}

// ───────── קריינות ─────────
function onHostSay(msg) {
  if (msg.kind === 'guest') { lowerThird(msg.who, msg.lines.join(' '), 'guest', 5000); return; }
  if (msg.ai) {
    for (const l of msg.lines) tts.say(l);
    const showLines = msg.kind === 'question' ? msg.lines.slice(0, -2) : msg.lines;
    for (const l of showLines) lowerThird(msg.kind === 'interview' ? 'המנחה' : '', l, 'quote');
  } else {
    lastPrompt = { lines: msg.lines, alts: msg.alts || [], kind: msg.kind };
    if (isPresenter()) renderPrompter(true);
  }
}

// ───────── טלפרומפטר ─────────
let prHidden = false, prY = 0, prKey = '', prLast = performance.now();
function renderPrompter(force) {
  const g = S?.game;
  const lines = (g?.prompter?.length ? g.prompter : lastPrompt.lines) || [];
  const alts = lastPrompt.kind === 'interview' ? lastPrompt.alts : [];
  const cues = phaseCues();
  const key = lines.join('|') + alts.join('|') + cues;
  if (key === prKey && !force) return;
  prKey = key; prY = 0;
  $('#prScroll').innerHTML = (cues ? `<p class="cue">▶ ${esc(cues)}</p>` : '') + lines.map(l => `<p>${esc(l)}</p>`).join('') + (alts.length ? `<p class="cue">שאלות נוספות לשיחה:</p>` + alts.map(a => `<p class="alt">${esc(a)}</p>`).join('') : '');
}
function phaseCues() {
  if (!S) return '';
  const g = S.game;
  return {
    intro: 'פתיחה: קבלו את הצופים בחום',
    question: 'הקריאו את השאלה ואת שלוש האפשרויות',
    answering: `השעון רץ (${S.settings.answerTime} שניות). עודדו, צחקו, "תנעלו תשובות!"`,
    lock: 'ספירה לאחור: "שלוש... שתיים... אחת..."',
    reveal: 'חשפו את התשובה הנכונה והסבירו',
    elim: g && g.elimThisRound.length ? `${g.elimThisRound.length} הודחו. נחמו אותם בהומור` : 'אף אחד לא הודח. חגגו!',
    interview: g?.interview ? `שיחה עם ${g.interview.name}: ${g.interview.desc}` : 'שיחה',
    decision: 'הציגו את ההחלטה: לקחת את הכסף או להמשיך',
    decided: 'הכריזו על ההחלטות',
    gameover: 'הכריזו על המנצחים ונפרדו מהצופים',
  }[S.phase] || '';
}
$('#prFaster').onclick = () => { prefs.prSpeed = Math.min(90, prefs.prSpeed + 6); savePrefs(); };
$('#prSlower').onclick = () => { prefs.prSpeed = Math.max(0, prefs.prSpeed - 6); savePrefs(); };
$('#prBigger').onclick = () => { prefs.prSize = Math.min(40, prefs.prSize + 2); savePrefs(); applyPr(); };
$('#prSmaller').onclick = () => { prefs.prSize = Math.max(14, prefs.prSize - 2); savePrefs(); applyPr(); };
$('#prHide').onclick = () => { prHidden = true; S && renderGame(S, S); };
$('#prShow').onclick = () => { prHidden = false; S && renderGame(S, S); };
const applyPr = () => document.documentElement.style.setProperty('--pr-size', prefs.prSize + 'px');
applyPr();
$('#nextBtn').onclick = () => { audio.fx('click'); socket.emit('host:next'); };
$('#povBtn').onclick = () => { povMode = !povMode; S && renderGame(S, S); };

// ───────── החלטה ─────────
function renderDecision(s) {
  const g = s.game;
  const mc = myContestant();
  const showIt = s.phase === 'decision' && mc && mc.al && !mc.tk;
  $('#decision').classList.toggle('hidden', !showIt);
  if (!showIt) return;
  const chosen = s.me?.decision;
  $('#decText').textContent = `קחו ₪${fmt(g.share)} בטוחים והולכים הביתה, או נסו את שאלת האחוז האחד על קופה של ₪${fmt(g.pot)}. נשארו ${Math.ceil(remaining() / 1000)} שניות.`;
  $('#decTake').textContent = `💰 קח ₪${fmt(g.share)} וצא`;
  $('#decTake').disabled = $('#decGo').disabled = !!chosen;
  $('#decWait').textContent = chosen ? (chosen === 'take' ? 'בחרת לקחת את הכסף. ממתינים לשאר...' : 'בחרת להמשיך! ממתינים לשאר...') : '';
}
$('#decTake').onclick = () => socket.emit('game:decision', { choice: 'take' }, ack);
$('#decGo').onclick = () => socket.emit('game:decision', { choice: 'go' }, ack);

// ───────── הצבעת צופים ─────────
function renderVotes(s) {
  const el = $('#votePanel');
  const g = s.game;
  const spectator = s.mode === 'duel' && !g.contestants.some(c => c.id === me.id) && s.phase !== 'gameover';
  el.classList.toggle('hidden', !spectator);
  if (!spectator) return;
  const v = g.votes || {};
  el.innerHTML = `<b>מי ינצח?</b><div class="vb">${g.contestants.map(c => `<button class="btn small ${s.me?.vote === c.id ? 'gold' : ''}" data-v="${c.id}">${esc(c.n)} (${v[c.id] || 0})</button>`).join('')}</div>`;
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => socket.emit('duel:vote', { id: b.dataset.v }));
}

// ───────── מסך תוצאה ─────────
let resultShownFor = null;
function renderResult(s) {
  const el = $('#result');
  if (s.phase !== 'gameover' || !s.game.result) { el.classList.add('hidden'); resultShownFor = null; return; }
  const r = s.game.result, g = s.game;
  const k = s.code + ':' + g.qIndex + ':' + (r.winners || []).map(w => w.id).join(',');
  if (resultShownFor === k) return;
  resultShownFor = k;
  setTimeout(() => { if (S && S.phase === 'gameover') el.classList.remove('hidden'); }, 4500);
  let h = '';
  const amWinner = (r.winners || []).some(w => w.id === me.id);
  if (r.mode === 'duel') {
    const w = r.winners[0];
    h += `<h2>🏆 ${esc(w.n)} ניצח!</h2><p>${'❤️'.repeat(Math.max(0, w.lives))} · ⚡ ${w.speed} נקודות מהירות${r.tiebreak ? ' (הוכרע בשובר שוויון)' : ''}</p><p class="hint">${esc(r.loser.n)}: ${r.loser.lives} חיים, ⚡ ${r.loser.speed}</p>`;
    if (amWinner) h += `<div class="title-member">אלוף הדו-קרב!</div>`;
  } else if (r.winners.length) {
    h += `<h2>✨ חברים במועדון האחוז האחד ✨</h2><ul class="res-list">${r.winners.slice(0, 20).map(w => `<li>👑 ${esc(w.n)} · ₪${fmt(w.w)}</li>`).join('')}</ul>${r.winners.length > 20 ? `<p>ועוד ${r.winners.length - 20}...</p>` : ''}`;
    if (amWinner) h += `<div class="title-member">ברכות! אתה חבר רשמי ב"מועדון האחוז האחד"</div>`;
  } else {
    h += `<h2>${r.mode === 'solo' ? (g.contestants[0].tk ? '💰 לקחת את הכסף' : 'המשחק הסתיים') : 'אין זוכים הפעם'}</h2>`;
  }
  if (r.took?.length && r.mode !== 'duel') h += `<p>לקחו את הכסף ויצאו: ${r.took.slice(0, 12).map(t => `${esc(t.n)} (₪${fmt(t.w)})`).join(', ')}${r.took.length > 12 ? '...' : ''}</p>`;
  if (r.mode === 'solo' && r.solo && g.contestants[0].id === me.id) {
    const st = store.get('soloStats', { bestLevel: 100, bestStreak: 0, reachedOne: 0, games: 0 });
    st.games++; st.bestLevel = Math.min(st.bestLevel, r.solo.bestLevel); st.bestStreak = Math.max(st.bestStreak, r.solo.streak); if (r.solo.reachedOne) st.reachedOne++;
    store.set('soloStats', st);
    h += `<table class="board-table"><tr><th></th><th>הפעם</th><th>השיא שלך</th></tr>
      <tr><td>הכי רחוק</td><td>${r.solo.bestLevel < 100 ? r.solo.bestLevel + '%' : '-'}</td><td>${st.bestLevel < 100 ? st.bestLevel + '%' : '-'}</td></tr>
      <tr><td>תשובות נכונות ברצף</td><td>${r.solo.streak}</td><td>${st.bestStreak}</td></tr>
      <tr><td>הגעת ל-1%</td><td>${r.solo.reachedOne ? 'כן!' : 'לא'}</td><td>${st.reachedOne} פעמים</td></tr></table>`;
    if (r.solo.took) h += `<p>זכית ב-₪${fmt(r.solo.winnings)} (וירטואליים)</p>`;
  }
  h += `<div class="res-actions">${isAdmin() ? `<button class="btn gold" id="again">🔁 עוד סיבוב</button><button class="btn" id="toLobby">חזרה ללובי</button>` : '<span class="hint">ממתינים שהמארח יחליט על סיבוב נוסף...</span>'}<button class="btn outline" id="closeRes">צפייה באולפן</button></div>`;
  $('#resultCard').innerHTML = h;
  const ag = $('#again'); if (ag) ag.onclick = () => socket.emit('room:start', null, ack);
  const tl = $('#toLobby'); if (tl) tl.onclick = () => socket.emit('room:reset', null, ack);
  $('#closeRes').onclick = () => el.classList.add('hidden');
}

// ───────── מענה בקול ─────────
function syncListening() {
  if (!S || !S.game || !voiceSupported || !voice.hasMic) return setListen(null);
  const g = S.game;
  const voiceAllowed = S.mode !== 'club' || S.settings.voiceInClub;
  if (S.phase === 'answering' && eligible() && voiceAllowed) return setListen('answer');
  if (S.phase === 'interview' && g.interview?.id === me.id && !S.presenterId) return setListen('interview');
  setListen(null);
}
function setListen(mode) {
  if (mode === listenMode) return;
  listenMode = mode;
  $('#voiceInd').classList.toggle('hidden', mode !== 'answer');
  if (!mode) { listener && listener.stop(); return; }
  if (!listener) listener = new Listener(onSpeech, st => { if (st.startsWith('error:not-allowed')) toast('אין הרשאה לזיהוי דיבור'); });
  $('#voiceTxt').textContent = 'מקשיב... אמרו "א", "ב", "ג" או את התשובה';
  listener.start();
}
let ivBuf = '';
function onSpeech(alts, isFinal) {
  if (listenMode === 'interview') {
    if (isFinal && alts[0]?.trim()) { socket.emit('interview:reply', { text: alts[0] }); ivBuf = ''; }
    return;
  }
  if (listenMode !== 'answer' || !S?.game?.question) return;
  const q = S.game.question;
  let res = null;
  for (const a of alts) { const m = matchAnswer(a, q.options, q.accept); if (m.idx !== null) { res = m; break; } if (m.lock && !res) res = m; }
  $('#voiceTxt').textContent = `"${alts[0]}"`;
  if (!res) { if (isFinal) $('#voiceTxt').textContent = 'לא הבנתי, נסו שוב'; return; }
  if (!isFinal && !(res.confident && res.via === 'letter')) return;
  if (res.idx === null) {
    if (res.lock && myAns !== null) { answer(myAns, true); lowerThird('', `נעלת סופית: ${LET[myAns] ?? ''}'`, 'answer', 2500, true); }
    else if (isFinal) $('#voiceTxt').textContent = 'לא הבנתי, נסו שוב';
    return;
  }
  if (!res.confident && !isFinal) return;
  if (res.idx !== myAns || res.lock) {
    answer(res.idx, res.lock);
    lowerThird('', `ענית: ${LET[res.idx]}' – ${q.options[res.idx]}${res.lock ? ' (נעול)' : ''}`, 'answer', 3000, true);
  }
}
$('#ivSend').onclick = () => { const t = $('#ivInput').value.trim(); if (t) { socket.emit('interview:reply', { text: t }); $('#ivInput').value = ''; } };
$('#ivInput').addEventListener('keydown', e => e.key === 'Enter' && $('#ivSend').click());

// ───────── לולאת טיימר / טלפרומפטר ─────────
function frame() {
  if (S && S.phase === 'answering') {
    const rem = remaining(), total = (S.settings.answerTime || 30) * 1000;
    const frac = Math.max(0, Math.min(1, rem / (S.phaseDur || total)));
    $('#timerArc').style.strokeDashoffset = String(276.5 * (1 - frac));
    const sec = Math.ceil(rem / 1000);
    $('#timerNum').textContent = sec;
    const urgent = rem <= 10000 * ((S.phaseDur || total) / total);
    $('#timer').classList.toggle('urgent', urgent);
    if (urgent && audio.urgent === false && audio.track === 'tension') audio.setUrgent(true);
  }
  if (S && S.phase === 'decision' && !$('#decision').classList.contains('hidden')) {
    const t = $('#decText'); t.textContent = t.textContent.replace(/נשארו \d+ שניות/, `נשארו ${Math.ceil(remaining() / 1000)} שניות`);
  }
  const t = performance.now(), dt = (t - prLast) / 1000; prLast = t;
  if (!$('#prompter').classList.contains('hidden')) {
    const sc = $('#prScroll'), body = $('#prBody');
    const max = Math.max(0, sc.scrollHeight - body.clientHeight + 20);
    prY = Math.min(max, prY + prefs.prSpeed * dt);
    sc.style.transform = `translateY(${-prY}px)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ───────── הגדרות / לוח שיאים / עזרה ─────────
function openModal(id) { $(id).classList.remove('hidden'); }
$$('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hidden'));
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'decision' && m.id !== 'result') m.classList.add('hidden'); }));
function openSettings() {
  $('#volMusic').value = prefs.music; $('#volSfx').value = prefs.sfx; $('#volVoice').value = prefs.voice;
  $('#muteAll').checked = prefs.mute; $('#ttsOn').checked = prefs.tts; $('#subsLocal').checked = prefs.subs;
  $('#quality').value = studio.quality;
  $('#envInfo').innerHTML = [
    voiceSupported ? '✅ זיהוי דיבור נתמך' : '⚠️ זיהוי דיבור לא נתמך בדפדפן הזה (מומלץ Chrome או Edge)',
    tts.hasHebrewVoice ? '✅ קול עברי למנחה' : '⚠️ לא נמצא קול עברי במכשיר. הכתוביות יופיעו בכל מקרה',
    serverCfg.aiSmart ? '✅ מנחה AI חכם (Claude) פעיל' : 'ℹ️ מנחה AI במצב שורות מוכנות',
    window.isSecureContext ? '✅ חיבור מאובטח (מיקרופון זמין)' : '⚠️ החיבור לא מאובטח: המיקרופון לא יעבוד. ראו HOSTING.md',
  ].join('<br>');
  openModal('#settings');
}
$('#btnSettings1').onclick = openSettings; $('#btnSettings2').onclick = openSettings;
$('#volMusic').oninput = e => { prefs.music = +e.target.value; audio.setVolumes(prefs.music); savePrefs(); };
$('#volSfx').oninput = e => { prefs.sfx = +e.target.value; audio.setVolumes(undefined, prefs.sfx); savePrefs(); };
$('#volVoice').oninput = e => { prefs.voice = +e.target.value; tts.setVolume(prefs.voice); savePrefs(); };
$('#muteAll').onchange = e => { prefs.mute = e.target.checked; audio.setMuted(prefs.mute); tts.setEnabled(prefs.tts && !prefs.mute); savePrefs(); };
$('#ttsOn').onchange = e => { prefs.tts = e.target.checked; tts.setEnabled(prefs.tts && !prefs.mute); savePrefs(); };
$('#subsLocal').onchange = e => { prefs.subs = e.target.checked; savePrefs(); };
$('#quality').onchange = e => studio.setQuality(e.target.value);
$('#btnHelp').onclick = () => openModal('#help');
$('#btnBoard').onclick = async () => {
  const st = store.get('soloStats', null);
  let h = '<h3>השיאים שלי (בדפדפן הזה)</h3>';
  h += st ? `<p>הכי רחוק: <b>${st.bestLevel < 100 ? st.bestLevel + '%' : '-'}</b> · רצף: <b>${st.bestStreak}</b> · הגעות ל-1%: <b>${st.reachedOne}</b> · משחקים: ${st.games}</p>` : '<p class="hint">עוד לא שיחקת סולו.</p>';
  h += '<h3>טבלת השרת</h3>';
  try {
    const list = await (await fetch('/api/leaderboard')).json();
    h += list.length ? `<table class="board-table"><tr><th>#</th><th>כינוי</th><th>הכי רחוק</th><th>רצף</th><th>1%</th></tr>${list.slice(0, 20).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.bestLevel < 100 ? r.bestLevel + '%' : '-'}</td><td>${r.bestStreak}</td><td>${r.reachedOne}</td></tr>`).join('')}</table>` : '<p class="hint">הטבלה ריקה. תהיו הראשונים!</p>';
  } catch { h += '<p class="hint">לא הצלחנו לטעון.</p>'; }
  $('#boardBody').innerHTML = h;
  openModal('#board');
};
// אם נכנסו לחדר בלי אינטראקציה, נבקש לחיצה כדי להפעיל סאונד
setTimeout(() => { if (!audioReady && currentRoom) $('#tapToStart').classList.remove('hidden'); }, 1500);
$('#tapBtn').onclick = ensureAudio;
// בדיקות (נגיש מהקונסול)
window.__game = { get state() { return S; }, me, studio, matchAnswer };
window.__voice = voice;
