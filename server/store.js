// אחסון קבוע וקטן בקבצי JSON: שאלות שכל שחקן ראה + לוח שיאים לסולו
const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DIR, { recursive: true });

function load(name, def) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); } catch { return def; }
}

const files = { seen: 'seen.json', board: 'leaderboard.json' };
const state = { seen: load(files.seen, {}), board: load(files.board, {}) };

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}
function flush() {
  for (const [k, f] of Object.entries(files)) {
    const p = path.join(DIR, f);
    try {
      fs.writeFileSync(p + '.tmp', JSON.stringify(state[k]));
      fs.renameSync(p + '.tmp', p);
    } catch (e) { console.error('save failed', f, e.message); }
  }
}

function seenSet(key) { return new Set(state.seen[key] || []); }
function markSeen(keys, qid) {
  for (const k of keys) {
    const arr = state.seen[k] || (state.seen[k] = []);
    if (!arr.includes(qid)) arr.push(qid);
  }
  save();
}
function resetLevel(keys, level) {
  const prefix = `q${level}-`;
  for (const k of keys) {
    if (state.seen[k]) state.seen[k] = state.seen[k].filter(id => !id.startsWith(prefix));
  }
  save();
}

// לוח שיאים לסולו לפי כינוי
function recordSolo(name, { bestLevel, streak, reachedOne, won }) {
  const key = name.trim().slice(0, 24);
  const r = state.board[key] || (state.board[key] = { name: key, bestLevel: 100, bestStreak: 0, reachedOne: 0, wins: 0, games: 0 });
  r.games++;
  if (bestLevel < r.bestLevel) r.bestLevel = bestLevel;
  if (streak > r.bestStreak) r.bestStreak = streak;
  if (reachedOne) r.reachedOne++;
  if (won) r.wins++;
  r.updated = Date.now();
  save();
  return r;
}
function leaderboard() {
  return Object.values(state.board)
    .sort((a, b) => a.bestLevel - b.bestLevel || b.bestStreak - a.bestStreak || b.wins - a.wins)
    .slice(0, 50);
}

process.on('exit', flush);
module.exports = { seenSet, markSeen, resetLevel, recordSolo, leaderboard, flush };
