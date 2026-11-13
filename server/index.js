// שרת "הקומץ": Express + Socket.IO
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createRoom, getRoom } = require('./rooms');
const store = require('./store');
const ai = require('./ai');
const Q = require('./questions');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 20000 });

app.disable('x-powered-by');
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), { maxAge: '7d' }));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { fallthrough: true }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

app.get('/api/config', (req, res) => res.json({ aiSmart: ai.enabled(), ttsServer: ai.ttsEnabled(), counts: Q.counts() }));
app.get('/api/leaderboard', (req, res) => res.json(store.leaderboard()));
app.get('/api/music', (req, res) => {
  const dir = path.join(ROOT, 'assets/music');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3')); } catch {}
  res.json(files);
});
const ttsCache = new Map();
app.get('/api/tts', async (req, res) => {
  if (!ai.ttsEnabled()) return res.status(404).end();
  const text = String(req.query.text || '').slice(0, 600);
  if (!text) return res.status(400).end();
  try {
    let buf = ttsCache.get(text);
    if (!buf) {
      buf = await ai.tts(text);
      ttsCache.set(text, buf);
      if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
    }
    res.set('Content-Type', 'audio/mpeg').send(buf);
  } catch (e) { res.status(502).end(); }
});
app.get('/healthz', (req, res) => res.send('ok'));

io.on('connection', socket => {
  const room = () => getRoom(socket.data.roomCode);
  const pid = () => socket.data.pid;
  const ack = (cb, v) => typeof cb === 'function' && cb(v);

  socket.on('room:create', (info, cb) => {
    if (!info || !info.id) return ack(cb, { error: 'חסר מזהה' });
    const r = createRoom(io);
    if (info.mode && ['club', 'duel', 'solo'].includes(info.mode)) r.mode = info.mode;
    const res = r.addPlayer(socket, info);
    if (r.mode === 'solo') r.soloId = info.id;
    if (r.mode === 'duel') r.settings.answerTime = 20;
    ack(cb, res.error ? res : { ok: true, code: r.code });
  });
  socket.on('room:join', (info, cb) => {
    const r = getRoom(info && info.code);
    if (!r) return ack(cb, { error: 'לא נמצא מועדון עם הקוד הזה' });
    const res = r.addPlayer(socket, info);
    ack(cb, res.error ? res : { ok: true, code: r.code });
  });
  socket.on('room:settings', (data, cb) => { const r = room(); ack(cb, { error: r ? r.updateSettings(pid(), data || {}) : 'אין חדר' }); });
  socket.on('room:start', (_, cb) => { const r = room(); ack(cb, { error: r ? r.start(pid()) : 'אין חדר' }); });
  socket.on('room:reset', (_, cb) => { const r = room(); ack(cb, { error: r ? r.reset(pid()) : 'אין חדר' }); });
  socket.on('game:answer', (data, cb) => { const r = room(); ack(cb, { error: r ? r.answer(pid(), data || {}) : 'אין חדר' }); });
  socket.on('game:decision', (data, cb) => { const r = room(); ack(cb, { error: r ? r.decide(pid(), data && data.choice) : 'אין חדר' }); });
  socket.on('host:next', () => { const r = room(); r && r.hostNext(pid()); });
  socket.on('duel:vote', data => { const r = room(); r && r.vote(pid(), data && data.id); });
  socket.on('interview:reply', data => { const r = room(); r && r.ivReply(pid(), data && data.text); });
  socket.on('player:mic', data => { const r = room(); r && r.setMic(pid(), data && data.on); });
  socket.on('player:profile', data => { const r = room(); r && r.setProfile(pid(), data || {}); });
  // signaling ל-WebRTC: מעבירים רק בין שחקנים באותו חדר
  socket.on('rtc:signal', ({ to, data } = {}) => {
    const r = room();
    if (!r) return;
    const target = r.players.get(to);
    if (target && target.connected) io.to(target.socketId).emit('rtc:signal', { from: pid(), data });
  });
  socket.on('disconnect', () => { const r = room(); r && r.disconnect(pid()); });
});

server.listen(PORT, () => {
  console.log(`\n  🎬 "הקומץ" רץ על http://localhost:${PORT}`);
  console.log(`  מנחה AI חכם (Claude): ${ai.enabled() ? 'פעיל' : 'כבוי (שורות מוכנות)'} | קול משופר: ${ai.ttsEnabled() ? 'פעיל' : 'כבוי (קול הדפדפן)'}`);
  console.log(`  שאלות במאגר: ${JSON.stringify(Q.counts())}\n`);
});
