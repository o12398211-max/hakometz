// מחוללי איורים לשאלות (SVG בקוד, עם טקסט עברי). אין תמונות חיצוניות.
const GOLD = '#f2c46d', INK = '#fff7e0';
const COL = { red: '#ff5a5a', blue: '#4aa8ff', green: '#4fd17a', gold: GOLD };
const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function svg(w, h, body, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="qimg-svg" ${extra} font-family="Heebo, Arial, sans-serif">${body}</svg>`;
}
function shape(s, x, y, r, fill) {
  if (s === 'circle') return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
  if (s === 'square') return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="3" fill="${fill}"/>`;
  if (s === 'triangle') return `<polygon points="${x},${y - r} ${x + r},${y + r * 0.85} ${x - r},${y + r * 0.85}" fill="${fill}"/>`;
  if (s === 'star') {
    let p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r * 1.05; p.push(`${x + rr * Math.cos(a)},${y + rr * Math.sin(a)}`); }
    return `<polygon points="${p.join(' ')}" fill="${fill}"/>`;
  }
  return '';
}

const G = {
  shapes({ items }) {
    return svg(400, 240, items.map(it => shape(it.s, it.x, it.y, 17, COL[it.c] || GOLD)).join(''));
  },
  clock({ h, m, mirror }) {
    let body = `<circle cx="120" cy="120" r="108" fill="#fffaf0" stroke="${GOLD}" stroke-width="8"/>`;
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      body += `<text x="${120 + 84 * Math.cos(a)}" y="${120 + 84 * Math.sin(a) + 9}" font-size="26" font-weight="700" text-anchor="middle" fill="#222">${i}</text>`;
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, r1 = i % 5 ? 100 : 94;
      body += `<line x1="${120 + r1 * Math.cos(a)}" y1="${120 + r1 * Math.sin(a)}" x2="${120 + 104 * Math.cos(a)}" y2="${120 + 104 * Math.sin(a)}" stroke="#555" stroke-width="${i % 5 ? 1 : 3}"/>`;
    }
    const ha = ((h % 12) + m / 60) / 12 * 360, ma = m / 60 * 360;
    body += `<line x1="120" y1="120" x2="120" y2="62" stroke="#111" stroke-width="9" stroke-linecap="round" transform="rotate(${ha} 120 120)"/>`;
    body += `<line x1="120" y1="120" x2="120" y2="34" stroke="#111" stroke-width="5" stroke-linecap="round" transform="rotate(${ma} 120 120)"/>`;
    body += `<circle cx="120" cy="120" r="7" fill="${GOLD}"/>`;
    const g = mirror ? `<g transform="translate(240 0) scale(-1 1)">${body}</g>` : body;
    return svg(240, 240, g);
  },
  sign({ lines, style }) {
    if (style === 'stop') {
      const pts = [...Array(8)].map((_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return `${120 + 100 * Math.cos(a)},${120 + 100 * Math.sin(a)}`; }).join(' ');
      return svg(240, 240, `<polygon points="${pts}" fill="#d32222" stroke="#fff" stroke-width="8"/><text x="120" y="138" font-size="54" font-weight="900" fill="#fff" text-anchor="middle" direction="rtl">${lines[0]}</text>`);
    }
    const h = 70 + lines.length * 52;
    let t = lines.map((l, i) => `<text x="210" y="${78 + i * 52}" font-size="40" font-weight="800" fill="#fff" text-anchor="middle" direction="rtl">${l}</text>`).join('');
    return svg(420, h + 40, `<rect x="10" y="10" width="400" height="${h}" rx="18" fill="#0f5c3a" stroke="#fff" stroke-width="6"/>${t}<rect x="200" y="${h + 10}" width="20" height="30" fill="#888"/>`);
  },
  calendar({ start, highlight }) {
    let b = `<rect x="5" y="5" width="350" height="290" rx="14" fill="#fffaf0"/><rect x="5" y="5" width="350" height="50" rx="14" fill="#c0392b"/><text x="180" y="40" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">לוח החודש</text>`;
    for (let d = 0; d < 7; d++) b += `<text x="${330 - d * 48}" y="82" font-size="18" font-weight="700" fill="#333" text-anchor="middle">${DAYS_SHORT[d]}</text>`;
    for (let n = 1; n <= 7; n++) {
      const col = (start + n - 1) % 7, row = Math.floor((start + n - 1) / 7);
      const x = 330 - col * 48, y = 120 + row * 40;
      if (n === highlight) b += `<circle cx="${x}" cy="${y - 7}" r="17" fill="${GOLD}"/>`;
      b += `<text x="${x}" y="${y}" font-size="20" fill="#111" text-anchor="middle">${n}</text>`;
    }
    b += `<text x="180" y="270" font-size="40" fill="#aaa" text-anchor="middle">· · ·</text>`;
    return svg(360, 300, b);
  },
  triangles({ k, h }) {
    const A = [200, 20], B = [30, 280], C = [370, 280];
    let b = `<polygon points="${A} ${B} ${C}" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/>`;
    for (let i = 1; i <= k; i++) { const x = 30 + (340 * i) / (k + 1); b += `<line x1="200" y1="20" x2="${x}" y2="280" stroke="${GOLD}" stroke-width="4"/>`; }
    for (let j = 1; j <= h; j++) { const t = j / (h + 1); const y = 20 + 260 * t; b += `<line x1="${200 - 170 * t}" y1="${y}" x2="${200 + 170 * t}" y2="${y}" stroke="${GOLD}" stroke-width="4"/>`; }
    return svg(400, 300, b);
  },
  grid({ m, n }) {
    const s = 60, w = n * s, h = m * s;
    let b = `<rect x="20" y="20" width="${w}" height="${h}" fill="none" stroke="${GOLD}" stroke-width="5"/>`;
    for (let i = 1; i < n; i++) b += `<line x1="${20 + i * s}" y1="20" x2="${20 + i * s}" y2="${20 + h}" stroke="${GOLD}" stroke-width="4"/>`;
    for (let j = 1; j < m; j++) b += `<line x1="20" y1="${20 + j * s}" x2="${20 + w}" y2="${20 + j * s}" stroke="${GOLD}" stroke-width="4"/>`;
    return svg(w + 40, h + 40, b);
  },
  equations({ rows }) {
    const fills = { circle: COL.red, triangle: COL.green, square: COL.blue };
    let b = '';
    rows.forEach(([terms, res], r) => {
      const y = 40 + r * 62;
      // הצגה משמאל לימין כמו במתמטיקה
      let x = 30;
      for (const t of terms) {
        if (fills[t]) { b += shape(t, x + 20, y, 19, fills[t]); x += 52; }
        else { b += `<text x="${x + 14}" y="${y + 12}" font-size="34" font-weight="800" fill="${INK}" text-anchor="middle">${t}</text>`; x += 34; }
      }
      b += `<text x="${x + 14}" y="${y + 12}" font-size="34" font-weight="800" fill="${INK}" text-anchor="middle">=</text>`;
      b += `<text x="${x + 44}" y="${y + 13}" font-size="36" font-weight="900" fill="${GOLD}" direction="ltr">${res}</text>`;
    });
    return svg(420, 30 + rows.length * 62, `<g direction="ltr">${b}</g>`);
  },
  die({ v }) {
    const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
    let b = `<polygon points="60,70 160,30 260,70 160,110" fill="#fff" stroke="#999" stroke-width="3"/><polygon points="60,70 160,110 160,230 60,190" fill="#e8e1cf" stroke="#999" stroke-width="3"/><polygon points="160,110 260,70 260,190 160,230" fill="#d8d0bb" stroke="#999" stroke-width="3"/>`;
    for (const [i, j] of P[v]) {
      const a = 0.2 + 0.3 * i, c = 0.2 + 0.3 * j;
      const x = 60 + 100 * a + 100 * c, y = 70 - 40 * a + 40 * c;
      b += `<ellipse cx="${x}" cy="${y}" rx="11" ry="6" fill="${v === 1 ? '#c0392b' : '#222'}"/>`;
    }
    return svg(320, 250, b);
  },
  mirrorText({ text }) {
    return svg(420, 140, `<rect x="5" y="5" width="410" height="130" rx="16" fill="#151515" stroke="${GOLD}" stroke-width="4"/><g transform="translate(420 0) scale(-1 1)"><text x="210" y="96" font-size="64" font-weight="900" fill="${INK}" text-anchor="middle" direction="rtl">${text}</text></g>`);
  },
  numgrid({ cells }) {
    let b = '';
    cells.forEach((row, i) => row.forEach((v, j) => {
      const x = 20 + j * 90, y = 20 + i * 70;
      b += `<rect x="${x}" y="${y}" width="84" height="64" rx="10" fill="${v === '?' ? '#3a2a08' : '#1c1c1c'}" stroke="${GOLD}" stroke-width="3"/><text x="${x + 42}" y="${y + 44}" font-size="32" font-weight="800" fill="${v === '?' ? GOLD : INK}" text-anchor="middle">${v}</text>`;
    }));
    return svg(310, 240, `<g direction="ltr">${b}</g>`);
  },
};

export function renderImage(img) {
  if (!img || !G[img.fn]) return '';
  try { return G[img.fn](img.params || {}); } catch (e) { console.error(e); return ''; }
}
