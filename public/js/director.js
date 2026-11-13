// במאי אוטומטי: בוחר זוויות ותנועות מצלמה לפי המצב והשלב
import { v3 } from './studio.js';

const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

export function makeDirector(studio) {
  let st = null, key = '', idx = 0, beat = 0;

  const W = {
    wide: () => ({ from: v3(0, 13, 25), from2: v3(0, 11, 21), to: v3(0, 1.5, -5), fov: 50, dur: rnd(4, 5.5) }),
    crane: () => { const s = Math.random() < 0.5 ? -1 : 1; return { from: v3(-7 * s, 25, 9), from2: v3(6 * s, 17, 13), to: v3(0, 0, -3), fov: 52, dur: rnd(5, 6.5), blend: true }; },
    orbit: (r0 = 18, r1 = 15) => { const a = rnd(-0.9, 0.9); return { orbit: { c: v3(0, 0, -2), a0: a, a1: a + rnd(0.35, 0.6) * (Math.random() < 0.5 ? -1 : 1), r0, r1, y0: 8, y1: 6 }, to: v3(0, 2, -4), fov: 50, dur: rnd(5, 6.5) }; },
    pan: () => { const s = Math.random() < 0.5 ? -1 : 1; return { from: v3(-15 * s, 6, 11), from2: v3(15 * s, 6, 11), to: v3(-7 * s, 3, -10), to2: v3(7 * s, 3, -10), fov: 44, dur: rnd(5, 6) }; },
    low: () => ({ from: v3(0, 1.1, 8), from2: v3(0, 1.3, 5.5), to: v3(0, 3, -14), fov: 55, dur: 4.5 }),
    top: () => ({ from: v3(0, 30, 3), from2: v3(0, 26, 2), to: v3(0, 0, -2), fov: 55, dur: 4 }),
    duelWide: () => ({ from: v3(0, 3.4, 12.5), from2: v3(0, 3.1, 10), to: v3(0, 1.6, -0.5), fov: 42, dur: rnd(4, 5) }),
    duelSwing: () => { const s = Math.random() < 0.5 ? -1 : 1; return { orbit: { c: v3(0, 0, 0), a0: -0.7 * s, a1: 0.7 * s, r0: 8, r1: 7.2, y0: 2.6, y1: 2.3 }, to: v3(0, 1.6, 0), fov: 42, dur: 4.5, blend: true }; },
    soloOrbit: () => { const lv = st?.game?.level ?? 90; const r = 3.8 + 5 * (lv / 100); const a = rnd(-1, 1); return { orbit: { c: v3(0, 0, 0), a0: a, a1: a + 0.6, r0: r + 0.6, r1: r, y0: 2.4, y1: 2.0 }, to: v3(0, 1.7, -0.5), fov: 44, dur: 6.5 }; },
    soloWide: () => ({ from: v3(0, 9, 17), from2: v3(0, 7, 13), to: v3(0, 2, -1), fov: 50, dur: 5 }),
  };
  const C = (id, close = 1) => studio.contestantShot(studio.byId.get(id), close);
  const randomAlive = (preferReal = true) => {
    const list = studio.contestants.filter(c => c.al !== false && c.headPos);
    const real = list.filter(c => !c.npc);
    const pool = preferReal && real.length && Math.random() < 0.7 ? real : list;
    return pool.length ? pick(pool) : null;
  };
  const randomElim = () => {
    const ids = st?.game?.elimThisRound || [];
    const real = ids.filter(id => !studio.byId.get(id)?.npc);
    const id = real.length ? pick(real) : ids.length ? pick(ids) : null;
    return id;
  };
  const duo = () => studio.contestants.map(c => c.id);

  function gen() {
    if (!st) return W.orbit();
    const mode = st.mode, ph = st.phase;
    beat++;
    const g = st.game;
    if (ph === 'lobby' || !g) return pick([W.orbit(), W.crane(), W.pan(), W.orbit(20, 17)]);
    if (mode === 'club') {
      switch (ph) {
        case 'intro': return beat === 1 ? { ...W.top(), dur: 3 } : beat === 2 ? W.crane() : studio.hostShot();
        case 'question': return pick([studio.hostShot(), W.wide(), studio.hostOTS(), studio.hostShot(0.8)]);
        case 'answering': {
          const r = beat % 5;
          if (r === 0 || r === 3) { const c = randomAlive(); if (c) return { ...C(c.id), dur: rnd(3, 4) }; }
          return { ...pick([W.pan(), W.wide(), W.orbit(), studio.hostOTS(), W.low()]), dur: rnd(3, 5) };
        }
        case 'lock': { const c = randomAlive(); return c ? { ...C(c.id, 0.7), dur: 1.3 } : W.wide(); }
        case 'reveal': return beat === 1 ? { ...W.crane(), dur: 4 } : studio.hostShot();
        case 'elim': {
          if (beat === 1) return { ...W.wide(), dur: 2.4 };
          const id = randomElim();
          return id ? { ...C(id, 0.8), dur: 2 } : W.orbit();
        }
        case 'interview': {
          const id = g.interview?.id;
          const cs = id && studio.byId.get(id)?.headPos ? C(id, 0.7) : null;
          return beat % 2 && cs ? { ...cs, dur: 3.6 } : { ...studio.hostShot(0.9), dur: 3.4 };
        }
        case 'decision': { const c = randomAlive(); return beat % 2 && c ? { ...C(c.id), dur: 3 } : W.orbit(14, 12); }
        case 'decided': return W.wide();
        case 'gameover': return beat % 3 === 0 ? studio.hostShot() : W.orbit(16, 12);
      }
    }
    if (mode === 'duel') {
      const [a, b] = duo();
      switch (ph) {
        case 'intro': return beat === 1 ? { ...W.crane(), dur: 4 } : beat === 2 ? W.duelWide() : beat % 2 ? C(a) : C(b);
        case 'question': return pick([W.duelWide(), studio.hostShot(), studio.hostOTS()]);
        case 'answering': { const r = beat % 5; return r === 0 ? { ...C(a), dur: 4 } : r === 1 ? W.duelWide() : r === 2 ? { ...C(b), dur: 4 } : r === 3 ? studio.hostOTS() : W.duelSwing(); }
        case 'lock': return { ...C(beat % 2 ? a : b, 0.55), dur: 1.1 };
        case 'reveal': return beat === 1 ? W.duelSwing() : W.duelWide();
        case 'elim': {
          const ids = g.elimThisRound || [];
          if (ids.length === 1 && beat < 4) return { ...C(ids[0], 0.6 + beat * 0.1), dur: 0.9 };
          return W.duelWide();
        }
        case 'interview': { const id = g.interview?.id || a; return beat % 2 ? { ...C(id, 0.7), dur: 3.5 } : { ...studio.hostShot(), dur: 3.2 }; }
        case 'gameover': { const w = g.result?.winners?.[0]?.id; return beat % 2 && w ? C(w, 0.8) : W.duelSwing(); }
        default: return W.duelWide();
      }
    }
    // solo
    const [s] = duo();
    switch (ph) {
      case 'intro': return beat === 1 ? { ...W.crane(), dur: 4 } : beat === 2 ? W.soloOrbit() : studio.hostShot();
      case 'question': return pick([W.soloOrbit(), studio.hostShot(), C(s)]);
      case 'answering': return beat % 3 === 1 ? { ...C(s), dur: 4 } : beat % 3 === 2 ? { ...studio.hostOTS(), dur: 3.5 } : W.soloOrbit();
      case 'lock': return { ...C(s, 0.5), from2: null, dur: 4 };
      case 'reveal': return g.contestants[0]?.ok === true ? W.soloWide() : C(s, 0.6);
      case 'elim': return g.contestants[0]?.al === false ? C(s, 0.7) : W.soloWide();
      case 'interview': return beat % 2 ? { ...C(s, 0.75), dur: 3.5 } : { ...studio.hostShot(), dur: 3.2 };
      case 'decision': return beat % 2 ? C(s, 0.8) : W.soloOrbit();
      default: return W.soloOrbit();
    }
  }

  return {
    update(state) {
      st = state;
      const k = state.mode + ':' + state.phase + ':' + (state.game ? state.game.qIndex : -1);
      if (k !== key) { key = k; beat = 0; idx++; studio.setShotGenerator(gen); }
    },
  };
}
