// האולפן התלת-ממדי + "במאי אוטומטי"
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MOODS = {
  gold: { neon: 0xffa424, beam: 0xffd08a, dots: 0xffb347, ring: 0xffc15a, fog: 0x0a0602 },
  blue: { neon: 0x2a7bff, beam: 0x8fc2ff, dots: 0x3d8bff, ring: 0x4f9dff, fog: 0x02040c },
  red: { neon: 0xff3322, beam: 0xffa08a, dots: 0xff4a2a, ring: 0xff6040, fog: 0x0c0202 },
  dim: { neon: 0x8a5a18, beam: 0x705030, dots: 0x6a4a20, ring: 0xa0702a, fog: 0x030201 },
};
const STAGE_R = 6.5, STAGE_TOP = 0.35;
const TIERS = [{ r: 10.5, h: 0.7 }, { r: 13.2, h: 1.7 }, { r: 15.9, h: 2.7 }, { r: 18.6, h: 3.7 }];
const MAX_SPAN = THREE.MathUtils.degToRad(286);
const SPACING = 1.95;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Studio {
  constructor(canvas) {
    this.canvas = canvas;
    const mobile = matchMedia('(max-width: 800px)').matches || /Mobi|Android/i.test(navigator.userAgent);
    this.quality = localStorage.getItem('quality') || (mobile ? 'low' : 'high');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 1.75 : 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0602, 0.018);
    this.scene.background = new THREE.Color(0x050302);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(0, 14, 26);
    this.clock = new THREE.Clock();
    this.mood = 'gold'; this.moodCol = {}; this.moodTarget = MOODS.gold;
    for (const k in MOODS.gold) this.moodCol[k] = new THREE.Color(MOODS.gold[k]);
    this.contestants = []; this.byId = new Map(); this.mode = 'club';
    this.shot = null; this.shotGen = null; this.pov = null;
    this.beams = []; this.confetti = null; this.celebrateT = -1;
    this.build();
    this.setupComposer();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
  }
  setQuality(q) { this.quality = q; localStorage.setItem('quality', q); location.reload(); }

  setupComposer() {
    this.composer = null;
    if (this.quality !== 'high') return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  // ───────── בניית הסט ─────────
  build() {
    const S = this.scene;
    S.add(new THREE.AmbientLight(0x404050, 0.6));
    S.add(new THREE.HemisphereLight(0x8899ff, 0x201008, 0.35));
    const key = new THREE.SpotLight(0xfff0d0, 320, 60, 0.6, 0.7, 1.6);
    key.position.set(0, 22, 6); key.target.position.set(0, 0, -1); S.add(key, key.target);
    this.keyLight = key;
    const rim = new THREE.SpotLight(0xffb060, 380, 70, 0.9, 0.8, 1.5);
    rim.position.set(0, 18, -22); rim.target.position.set(0, 2, 0); S.add(rim, rim.target);
    this.rimLight = rim;
    this.podLight = new THREE.PointLight(0xffd080, 0, 14, 1.6); this.podLight.position.set(0, 4, 3); S.add(this.podLight);
    this.camFill = new THREE.PointLight(0xffe2c4, 9, 9, 1.8); S.add(this.camFill); // תאורת מילוי שזזה עם המצלמה לקלוז-אפים

    // רצפה עם קווים רדיאליים
    const floorTex = new THREE.CanvasTexture(this.drawFloor());
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.35, metalness: 0.6, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.35 }));
    floor.rotation.x = -Math.PI / 2; S.add(floor);
    this.floorMat = floor.material;

    // הבימה העגולה עם הלוגו
    this.logoTex = new THREE.CanvasTexture(this.drawStageTop());
    this.logoTex.colorSpace = THREE.SRGBColorSpace;
    this.logoTex.anisotropy = 8;
    const top = new THREE.MeshStandardMaterial({ color: 0x110b05, roughness: 0.25, metalness: 0.7, map: this.logoTex, emissive: 0xffffff, emissiveMap: this.logoTex, emissiveIntensity: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: 0x15100a, roughness: 0.4, metalness: 0.8 });
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(STAGE_R, STAGE_R + 0.15, STAGE_TOP, 96), [side, top, side]);
    stage.position.y = STAGE_TOP / 2; S.add(stage);
    this.stageTopMat = top;
    this.rings = [];
    for (const [r, t] of [[STAGE_R + 0.18, 0.06], [STAGE_R + 1.2, 0.04], [STAGE_R + 2.3, 0.03], [3.2, 0.035]]) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffc15a, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 160), m);
      ring.rotation.x = -Math.PI / 2; ring.position.y = r < STAGE_R ? STAGE_TOP + 0.02 : r > STAGE_R + 0.5 ? 0.02 : STAGE_TOP;
      S.add(ring); this.rings.push(m);
    }
    // קיר אחורי + נקודות LED
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(31, 31, 22, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x050403, side: THREE.BackSide, roughness: 0.9 }));
    wall.position.y = 10; S.add(wall);
    this.buildDots();
    // יציעים
    this.tierGroup = new THREE.Group(); S.add(this.tierGroup);
    this.neonMats = [];
    // מסכי LED
    this.screens = [];
    for (const sx of [-1, 1]) {
      const cnv = document.createElement('canvas'); cnv.width = 1024; cnv.height = 576;
      const tex = new THREE.CanvasTexture(cnv); tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const fr = new THREE.Mesh(new THREE.BoxGeometry(10.1, 5.9, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a140c, metalness: 0.9, roughness: 0.3, emissive: 0x2a1a05 }));
      const g = new THREE.Group(); g.add(fr); scr.position.z = 0.16; g.add(scr);
      g.position.set(sx * 14.5, 10.5, -21); g.lookAt(0, 6, 4);
      S.add(g); this.screens.push({ cnv, tex });
    }
    this.setScreens({});
    // גריד תאורה וקרני אור
    this.buildRig();
    // קהל
    this.buildAudience();
    // מנחה + דוכן לבן
    this.host = this.makeFigure(0x1b1b22, 0xb88e70, true);
    this.lectern = new THREE.Group();
    const lec = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 0.5, emissive: 0x0a0806 }));
    lec.position.y = 0.58;
    const lecTop = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.72), new THREE.MeshStandardMaterial({ color: 0xb0aa9e, roughness: 0.35 }));
    lecTop.position.y = 1.18; lecTop.rotation.x = -0.12;
    const lecGlow = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.04, 0.62), new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }));
    lecGlow.position.y = 0.03;
    this.lectern.add(lec, lecTop, lecGlow);
    S.add(this.host.group, this.lectern);
    // דוכני דו-קרב/סולו
    this.bigPods = [];
    // אפקטים
    this.buildConfetti();
    this.buildSmoke();
  }
  drawFloor() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    x.translate(512, 512);
    x.strokeStyle = 'rgba(255,170,60,0.25)'; x.lineWidth = 1.5;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(a) * 120, Math.sin(a) * 120); x.lineTo(Math.cos(a) * 512, Math.sin(a) * 512); x.stroke(); }
    for (let r = 140; r < 512; r += 46) { x.strokeStyle = `rgba(255,170,60,${0.18 - r / 5000})`; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
    return c;
  }
  drawStageTop() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#0c0703'; x.fillRect(0, 0, 1024, 1024);
    x.translate(512, 512);
    const gold = x.createLinearGradient(-300, -300, 300, 300);
    gold.addColorStop(0, '#fff2c4'); gold.addColorStop(0.35, '#f2c46d'); gold.addColorStop(0.65, '#b07a22'); gold.addColorStop(1, '#ffe39a');
    for (const [r, w, a] of [[500, 10, 1], [470, 3, 0.6], [430, 2, 0.4], [300, 6, 0.9], [285, 2, 0.5]]) { x.strokeStyle = gold; x.globalAlpha = a; x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
    x.globalAlpha = 1;
    // נקודות לאורך הטבעת
    for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; x.fillStyle = i % 2 ? '#ffd27a' : '#7a5418'; x.beginPath(); x.arc(Math.cos(a) * 450, Math.sin(a) * 450, 4, 0, Math.PI * 2); x.fill(); }
    // קרניים
    x.globalAlpha = 0.25;
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; x.strokeStyle = '#f2c46d'; x.lineWidth = 2; x.beginPath(); x.moveTo(Math.cos(a) * 310, Math.sin(a) * 310); x.lineTo(Math.cos(a) * 420, Math.sin(a) * 420); x.stroke(); }
    x.globalAlpha = 1;
    x.rotate(-Math.PI / 2); // מיפוי ה-UV של מכסה הגליל: כך הלוגו נקרא ישר מהמצלמה הקדמית
    this.drawLogo(x, 0, 0, 1);
    return c;
  }
  drawLogo(x, cx, cy, s) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    const g = x.createLinearGradient(0, -120, 0, 90);
    g.addColorStop(0, '#fff6d8'); g.addColorStop(0.45, '#f5c75e'); g.addColorStop(0.55, '#a86d14'); g.addColorStop(1, '#ffe08a');
    x.font = '900 190px Heebo, Arial';
    x.lineWidth = 14; x.strokeStyle = '#2a1600'; x.strokeText('הקומץ', 0, -10);
    x.fillStyle = g; x.fillText('הקומץ', 0, -10);
    x.font = '800 54px Heebo, Arial'; x.fillStyle = '#ffe7a8';
    x.fillText('מועדון המעטים', 0, 120);
    // סמל אחוז מעוגל מעל
    x.font = '900 90px Heebo, Arial'; x.fillStyle = g; x.fillText('%', 0, -165);
    x.restore();
  }
  setScreens({ big, small, sub }) {
    for (const { cnv, tex } of this.screens) {
      const x = cnv.getContext('2d');
      const bg = x.createLinearGradient(0, 0, 0, 576); bg.addColorStop(0, '#140b02'); bg.addColorStop(1, '#2a1404');
      x.fillStyle = bg; x.fillRect(0, 0, 1024, 576);
      x.globalAlpha = 0.35;
      for (let i = 0; i < 18; i++) { x.fillStyle = i % 2 ? '#ff9a2a' : '#ffcf6a'; x.fillRect(0, 90 + i * 22, 1024, 3); }
      x.globalAlpha = 1;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
      if (big) {
        const g = x.createLinearGradient(0, 150, 0, 380); g.addColorStop(0, '#fff3c8'); g.addColorStop(0.5, '#f5b947'); g.addColorStop(1, '#ffdf8a');
        x.font = '900 230px Heebo, Arial'; x.lineWidth = 12; x.strokeStyle = '#2a1600'; x.strokeText(big, 512, 260); x.fillStyle = g; x.fillText(big, 512, 260);
        if (small) { x.font = '800 64px Heebo, Arial'; x.fillStyle = '#fff'; x.fillText(small, 512, 450); }
        if (sub) { x.font = '700 44px Heebo, Arial'; x.fillStyle = '#ffcf7a'; x.fillText(sub, 512, 520); }
      } else this.drawLogo(x, 512, 300, 1.15);
      tex.needsUpdate = true;
    }
  }
  buildDots() {
    const n = this.quality === 'high' ? 2600 : 1200;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.dotPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.12 + Math.random() * Math.PI * 1.76; // לא מאחורי המצלמה הראשית
      const r = 30.4, y = 1 + Math.random() * 17;
      pos[i * 3] = Math.sin(a + Math.PI) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.cos(a + Math.PI) * r;
      this.dotPhase[i] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sprite = this.softTex();
    this.dots = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.scene.add(this.dots);
  }
  softTex() {
    if (this._soft) return this._soft;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this._soft = new THREE.CanvasTexture(c);
    return this._soft;
  }
  buildRig() {
    const S = this.scene;
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.4 });
    const ringT = new THREE.Mesh(new THREE.TorusGeometry(9, 0.18, 8, 96), trussMat); ringT.rotation.x = Math.PI / 2; ringT.position.y = 17; S.add(ringT);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(9, 0.05, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffc15a, toneMapped: false })); ringGlow.rotation.x = Math.PI / 2; ringGlow.position.y = 16.8; S.add(ringGlow);
    this.rings.push(ringGlow.material);
    // קרני אור נפחיות מזויפות
    const beamMat = () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0xffd08a) }, opacity: { value: 0.28 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = opacity * pow(vY, 1.4) * edge; gl_FragColor = vec4(color*a, a); }',
    });
    const n = this.quality === 'high' ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const pivot = new THREE.Group(); pivot.position.set(Math.sin(a) * 9, 16.8, Math.cos(a) * 9);
      const geo = new THREE.ConeGeometry(2.4, 19, 24, 1, true); geo.translate(0, -9.5, 0);
      const m = beamMat();
      const cone = new THREE.Mesh(geo, m); pivot.add(cone);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); pivot.add(head);
      S.add(pivot);
      this.beams.push({ pivot, mat: m, a, speed: 0.25 + Math.random() * 0.35, phase: Math.random() * 6 });
    }
  }
  buildAudience() {
    const n = this.quality === 'high' ? 360 : 200;
    const geo = new THREE.CapsuleGeometry(0.28, 0.55, 3, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 1, emissive: 0x060403 });
    this.audience = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const row = i % 3, r = 22 + row * 2.3, h = 4.4 + row * 1.1;
      const a = Math.PI - MAX_SPAN / 2 + Math.random() * MAX_SPAN;
      m.makeTranslation(Math.sin(a) * r, h + 0.6, Math.cos(a) * r);
      this.audience.setMatrixAt(i, m);
    }
    this.scene.add(this.audience);
    // מדרגות היציע של הקהל
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.8 });
    for (let row = 0; row < 3; row++) {
      const r = 22 + row * 2.3, h = 4.4 + row * 1.1;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.1, r + 1.1, h, 64, 1, false, Math.PI - MAX_SPAN / 2, MAX_SPAN), stepMat);
      st.position.y = h / 2; this.scene.add(st);
    }
    this.audienceStrip = this.neonArc(24.5, 4.5, MAX_SPAN, 0.05);
  }
  neonArc(r, y, span, tube = 0.045) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffa424, toneMapped: false });
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, Math.max(24, Math.round(span * r * 2)), span), m);
    t.rotation.set(-Math.PI / 2, 0, Math.PI - span / 2 - Math.PI / 2);
    t.position.y = y;
    this.scene.add(t);
    this.neonMats.push(m);
    return t;
  }
  makeFigure(suit, skin, isHost = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 10), new THREE.MeshStandardMaterial({ color: suit, roughness: 0.6 }));
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
    head.position.y = 1.72;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const ex of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeM); e.position.set(ex, 1.75, 0.21); g.add(e); }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), eyeM); mouth.position.set(0, 1.63, 0.225); g.add(mouth);
    g.add(body, head);
    if (isHost) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.02), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.6, roughness: 0.3 }));
      tie.position.set(0, 1.2, 0.3); g.add(tie);
    }
    return { group: g, head, body };
  }
  buildConfetti() {
    const n = 500;
    const geo = new THREE.PlaneGeometry(0.12, 0.22);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(geo, mat, n);
    this.confetti.visible = false;
    this.confData = [];
    const cols = [0xffd27a, 0xffffff, 0xf2a83a, 0xfff0b0];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.set(cols[i % cols.length]); this.confetti.setColorAt(i, c);
      this.confData.push({ p: v3(0, -50, 0), v: v3(0, 0, 0), r: v3(Math.random() * 6, Math.random() * 6, 0), s: 0.5 + Math.random() });
    }
    this.scene.add(this.confetti);
  }
  buildSmoke() {
    this.smoke = [];
    const tex = this.softTex();
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9a8a7a, transparent: true, opacity: 0, depthWrite: false }));
      sp.scale.set(8, 8, 1);
      this.scene.add(sp);
      this.smoke.push({ sp, a: (i / 14) * Math.PI * 2, t: Math.random() * 10, life: 0 });
    }
  }

  // ───────── פריסה לפי מצב ─────────
  setLayout(mode, list, opts = {}) {
    this.mode = mode;
    this.layoutOpts = opts;
    // ניקוי
    for (const ch of [...this.tierGroup.children]) { this.tierGroup.remove(ch); ch.traverse?.(o => o.geometry && o.geometry.dispose()); }
    this.neonMats = this.neonMats.filter(m => m === this.audienceStrip.material);
    if (this.pods) { for (const k of ['podMesh', 'panelMesh', 'bodyMesh', 'headMesh', 'eyeMesh']) { this.scene.remove(this.pods[k]); this.pods[k].geometry.dispose(); } this.pods = null; }
    for (const p of this.bigPods) this.scene.remove(p.group);
    this.bigPods = [];
    (this.labels || []).forEach(l => this.scene.remove(l));
    this.labels = [];
    this.contestants = list.map(c => ({ ...c }));
    this.byId = new Map(this.contestants.map(c => [c.id, c]));
    const showAudience = mode === 'club' || mode === 'duel' || (mode === 'solo' && opts.npcAudience);
    this.audience.visible = showAudience;
    this.audienceStrip.visible = showAudience;
    this.audience.material.emissive.setHex(mode === 'club' ? 0x0a0705 : 0x040302);

    if (mode === 'club' || mode === 'lobby') this.layoutClub(list.length);
    else this.layoutPodiums(mode, list);
    this.placeHost(mode, opts.presenterPos);
    this.podLight.intensity = mode === 'club' || mode === 'lobby' ? 0 : 28;
    this.keyLight.intensity = mode === 'club' || mode === 'lobby' ? 320 : 150;
  }
  layoutClub(n) {
    n = Math.max(n, 0);
    const caps = TIERS.map(t => Math.floor((t.r * MAX_SPAN) / SPACING));
    let used = 1, sum = caps[0];
    while (sum < n && used < TIERS.length) sum += caps[used++];
    const perTier = [];
    let left = n;
    for (let i = 0; i < used; i++) { const share = i === used - 1 ? left : Math.round((n * caps[i]) / sum); perTier.push(Math.min(share, caps[i])); left -= perTier[i]; }
    const showTiers = Math.max(used, n ? 1 : 2);
    const frontMat = new THREE.MeshStandardMaterial({ color: 0x120c07, roughness: 0.3, metalness: 0.7 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x0e0a06, roughness: 0.55, metalness: 0.4 });
    const slots = [];
    for (let i = 0; i < showTiers; i++) {
      const t = TIERS[i], cnt = perTier[i] || 0;
      const span = Math.min(MAX_SPAN, Math.max(THREE.MathUtils.degToRad(70), ((cnt + 1) * SPACING) / t.r));
      const st = Math.PI - span / 2;
      const front = new THREE.Mesh(new THREE.CylinderGeometry(t.r - 1.0, t.r - 1.0, t.h, 64, 1, true, st, span), frontMat);
      front.position.y = t.h / 2; this.tierGroup.add(front);
      const topG = new THREE.RingGeometry(t.r - 1.0, t.r + 1.7, 64, 1, st - Math.PI / 2, span);
      const top = new THREE.Mesh(topG, topMat); top.rotation.x = -Math.PI / 2; top.position.y = t.h; this.tierGroup.add(top);
      for (const [yy, tube] of [[t.h - 0.08, 0.05], [t.h * 0.45, 0.035]]) {
        const m = new THREE.MeshBasicMaterial({ color: 0xffa424, toneMapped: false });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(t.r - 0.98, tube, 6, 120, span), m);
        ring.rotation.set(-Math.PI / 2, 0, st - Math.PI / 2); ring.position.y = yy;
        this.tierGroup.add(ring); this.neonMats.push(m);
      }
      for (let k = 0; k < cnt; k++) {
        const a = st + (span * (k + 1)) / (cnt + 1);
        slots.push({ a, r: t.r, h: t.h });
      }
    }
    const N = Math.max(1, n);
    const podMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 1.05, 0.55), new THREE.MeshStandardMaterial({ color: 0x1b140c, metalness: 0.85, roughness: 0.3 }), N);
    const panelMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.0, 0.18), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    const bodyMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.27, 0.62, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
    const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe2bf9c, roughness: 0.6 }), N);
    const eyeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), N * 2);
    eyeMesh.count = n * 2;
    [podMesh, panelMesh, bodyMesh, headMesh, eyeMesh].forEach(m => { m.count = n; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); });
    this.pods = { podMesh, panelMesh, bodyMesh, headMesh, eyeMesh, slots };
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.contestants.forEach((c, i) => {
      const s = slots[i]; if (!s) return;
      c.slot = i;
      const facing = s.a + Math.PI;
      e.set(0, facing, 0); q.setFromEuler(e);
      const base = v3(Math.sin(s.a) * (s.r - 0.2), s.h, Math.cos(s.a) * (s.r - 0.2));
      c.pos = base; c.facing = facing;
      c.headPos = v3(Math.sin(s.a) * (s.r + 0.35), s.h + 1.55, Math.cos(s.a) * (s.r + 0.35));
      c.inward = v3(-Math.sin(s.a), 0, -Math.cos(s.a));
      M.compose(base.clone().setY(s.h + 0.53), q, v3(1, 1, 1)); podMesh.setMatrixAt(i, M);
      M.compose(base.clone().addScaledVector(c.inward, 0.285).setY(s.h + 0.86), q, v3(1, 1, 1)); panelMesh.setMatrixAt(i, M);
      this.setFigureMatrix(c, false);
      if (!c.npc && this.labels.length < 40) this.addLabel(c);
    });
    podMesh.instanceMatrix.needsUpdate = true; panelMesh.instanceMatrix.needsUpdate = true;
    this.refreshColors();
  }
  setFigureMatrix(c, down) {
    if (!this.pods || c.slot === undefined) return;
    const s = this.pods.slots[c.slot];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.facing, 0));
    const back = v3(Math.sin(s.a) * (s.r + 0.35), s.h, Math.cos(s.a) * (s.r + 0.35));
    const dy = down ? -0.22 : 0;
    M.compose(back.clone().setY(s.h + 0.85 + dy), q, v3(1, 1, 1)); this.pods.bodyMesh.setMatrixAt(c.slot, M);
    M.compose(back.clone().setY(s.h + 1.52 + dy), q, v3(1, 1, 1)); this.pods.headMesh.setMatrixAt(c.slot, M);
    const inw = v3(-Math.sin(s.a), 0, -Math.cos(s.a)), side = v3(inw.z, 0, -inw.x);
    [-0.075, 0.075].forEach((o, k) => { M.compose(back.clone().addScaledVector(inw, 0.19).addScaledVector(side, o).setY(s.h + 1.55 + dy), q, v3(1, 1, 1)); this.pods.eyeMesh.setMatrixAt(c.slot * 2 + k, M); });
    this.pods.bodyMesh.instanceMatrix.needsUpdate = true; this.pods.headMesh.instanceMatrix.needsUpdate = true; this.pods.eyeMesh.instanceMatrix.needsUpdate = true;
  }
  addLabel(c) {
    const cnv = document.createElement('canvas'); cnv.width = 256; cnv.height = 64;
    const x = cnv.getContext('2d'); x.font = '800 34px Heebo, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.roundRect(8, 8, 240, 48, 20); x.fill();
    x.fillStyle = '#ffe3a0'; x.fillText(c.n || c.name || '', 128, 33);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cnv), transparent: true, depthWrite: false }));
    sp.scale.set(1.6, 0.4, 1); sp.position.copy(c.headPos).add(v3(0, 0.55, 0));
    this.scene.add(sp); this.labels.push(sp);
  }
  layoutPodiums(mode, list) {
    const opts = this.layoutOpts || {};
    const xs = mode === 'duel' ? (opts.presenterPos === 'between' ? [-2.9, 2.9] : [-2.2, 2.2]) : [0];
    list.forEach((c0, i) => {
      const c = this.byId.get(c0.id);
      const g = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.15, 32), new THREE.MeshStandardMaterial({ color: 0x15100a, metalness: 0.9, roughness: 0.25 }));
      ped.position.y = 0.58;
      const topR = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffc15a, toneMapped: false }));
      topR.rotation.x = Math.PI / 2; topR.position.y = 1.16;
      const botR = topR.clone(); botR.material = topR.material; botR.position.y = 0.05; botR.scale.setScalar(1.14);
      const cnv = document.createElement('canvas'); cnv.width = 512; cnv.height = 160;
      const tex = new THREE.CanvasTexture(cnv); tex.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
      panel.position.set(0, 0.72, 0.86);
      const fig = this.makeFigure(new THREE.Color(c.av?.color || '#c8a050').multiplyScalar(0.32).getHex(), 0xb88e70);
      fig.group.position.z = -0.7;
      const gems = [];
      if (mode === 'duel') for (let k = 0; k < 3; k++) { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xff4040, toneMapped: false })); gm.position.set(-0.3 + k * 0.3, 1.32, 0.35); g.add(gm); gems.push(gm); }
      g.add(ped, topR, botR, panel, fig.group);
      g.position.set(xs[i], STAGE_TOP, mode === 'duel' ? 0.2 : 0);
      this.scene.add(g);
      c.pos = g.position.clone();
      c.headPos = g.position.clone().add(v3(0, 1.72, -0.7));
      c.inward = v3(0, 0, 1);
      const bp = { id: c.id, group: g, cnv, tex, panel, fig, ring: topR.material, gems, name: c.n || c.name };
      this.bigPods.push(bp);
      this.drawPodPanel(bp, 'idle');
    });
  }
  drawPodPanel(bp, state) {
    const x = bp.cnv.getContext('2d');
    x.clearRect(0, 0, 512, 160);
    const col = { idle: '#f2c46d', locked: '#ffffff', ok: '#ffd86a', wrong: '#3d8bff', out: '#2a5fd0' }[state] || '#f2c46d';
    x.fillStyle = 'rgba(10,6,2,0.92)'; x.beginPath(); x.roundRect(6, 6, 500, 148, 26); x.fill();
    x.lineWidth = 8; x.strokeStyle = col; x.stroke();
    x.font = '900 70px Heebo, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    x.fillStyle = col; x.fillText(bp.name, 256, 84);
    bp.tex.needsUpdate = true;
  }
  placeHost(mode, pos) {
    const H = this.host.group, L = this.lectern;
    if (mode === 'duel') {
      if (pos === 'between') { H.position.set(0, STAGE_TOP, 2.2); L.position.set(0, STAGE_TOP, 1.6); H.rotation.y = Math.PI; L.rotation.y = Math.PI; }
      else { H.position.set(0, STAGE_TOP, -4.2); L.position.set(0, STAGE_TOP, -3.55); H.rotation.y = 0; L.rotation.y = 0; }
    } else if (mode === 'solo') {
      H.position.set(3.4, STAGE_TOP, 2.6); L.position.set(2.95, STAGE_TOP, 2.2);
      const a = Math.atan2(-3.4, -2.6); H.rotation.y = a; L.rotation.y = a;
    } else {
      H.position.set(0, STAGE_TOP, 2.6); L.position.set(0, STAGE_TOP, 1.95); H.rotation.y = Math.PI; L.rotation.y = Math.PI;
    }
    this.hostHead = H.position.clone().add(v3(0, 1.72, 0));
    this.hostFwd = v3(Math.sin(H.rotation.y), 0, Math.cos(H.rotation.y));
  }

  // ───────── עדכון מצב המתמודדים ─────────
  updateContestants(list, ctx = {}) {
    for (const u of list) {
      const c = this.byId.get(u.id);
      if (!c) continue;
      const prevAlive = c.al;
      Object.assign(c, u);
      if (this.pods && prevAlive !== c.al) this.setFigureMatrix(c, !c.al);
    }
    this.refreshColors(ctx);
  }
  refreshColors(ctx = {}) {
    const col = new THREE.Color();
    if (this.pods) {
      const { panelMesh, bodyMesh } = this.pods;
      for (const c of this.contestants) {
        if (c.slot === undefined) continue;
        if (c.al === false) col.set(0x1f5dff);
        else if (c.tk) col.set(0x40e090);
        else if (ctx.revealed && c.ok === 'skip') col.set(0xb070ff);
        else if (c.fin) col.set(0xff5a3a);
        else if (ctx.answering && c.an) col.set(0xffffff);
        else col.set(0xffa424);
        panelMesh.setColorAt(c.slot, col);
        const av = new THREE.Color(c.av?.color || '#c8a050');
        if (c.al === false) av.lerp(new THREE.Color(0x10246a), 0.75);
        bodyMesh.setColorAt(c.slot, av.multiplyScalar(0.8));
      }
      if (panelMesh.instanceColor) panelMesh.instanceColor.needsUpdate = true;
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    }
    for (const bp of this.bigPods) {
      const c = this.byId.get(bp.id);
      let st = 'idle';
      if (c.al === false) st = 'out';
      else if (ctx.revealed && c.ok === false) st = 'wrong';
      else if (ctx.revealed && c.ok === true) st = 'ok';
      else if (ctx.answering && c.an) st = 'locked';
      if (bp.state !== st) { bp.state = st; this.drawPodPanel(bp, st); }
      bp.ring.color.set(st === 'wrong' || st === 'out' ? 0x2f7bff : st === 'locked' ? 0xffffff : 0xffc15a);
      bp.gems.forEach((g, k) => { g.visible = (c.lv ?? 3) > k; });
    }
  }

  setMood(m) { if (MOODS[m]) { this.mood = m; this.moodTarget = MOODS[m]; } }
  celebrate() {
    this.celebrateT = 0;
    this.confetti.visible = true;
    this.confData.forEach(d => { d.p.set((Math.random() - 0.5) * 16, 14 + Math.random() * 8, (Math.random() - 0.5) * 12); d.v.set((Math.random() - 0.5) * 0.6, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 0.6); });
    this.smoke.forEach(s => { s.life = 1; });
  }
  puffSmoke() { this.smoke.forEach(s => { if (Math.random() < 0.5) s.life = 0.7; }); }

  // ───────── מצלמה ─────────
  setPOV(pov) { this.pov = pov; } // {pos, look} למנחה אנושי
  setShotGenerator(fn) { this.shotGen = fn; this.shot = null; }
  forceCut() { this.shot = null; }
  nextShot() {
    let s = null;
    try { s = this.shotGen ? this.shotGen() : null; } catch (e) { console.warn(e); }
    if (!s || (!s.from && !s.orbit)) s = { from: v3(0, 13, 25), from2: v3(0, 11, 21), to: v3(0, 1.5, -5), fov: 50, dur: 4 };
    const prev = this.shot;
    s.t = 0;
    s.dur = s.dur || 4;
    if (s.blend && prev) { s.blendFrom = { pos: this.camera.position.clone(), look: this.curLook ? this.curLook.clone() : s.to.clone() }; }
    this.shot = s;
  }
  updateCamera(dt) {
    const cam = this.camera;
    if (this.pov) {
      const t = this.clock.elapsedTime;
      cam.position.copy(this.pov.pos).add(v3(Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.7) * 0.03, 0));
      cam.lookAt(this.pov.look); cam.fov = 55; cam.updateProjectionMatrix();
      return;
    }
    if (!this.shot || this.shot.t >= this.shot.dur) this.nextShot();
    const s = this.shot;
    if (!s) return;
    s.t += dt;
    const k = ease(Math.min(1, s.t / s.dur));
    const pos = s.from ? (s.from2 ? s.from.clone().lerp(s.from2, k) : s.from.clone()) : new THREE.Vector3();
    const look = s.to2 ? s.to.clone().lerp(s.to2, k) : s.to.clone();
    if (s.orbit) { // סיבוב סביב נקודה
      const ang = s.orbit.a0 + (s.orbit.a1 - s.orbit.a0) * k, r = s.orbit.r0 + (s.orbit.r1 - s.orbit.r0) * k;
      pos.set(s.orbit.c.x + Math.sin(ang) * r, s.orbit.y0 + (s.orbit.y1 - s.orbit.y0) * k, s.orbit.c.z + Math.cos(ang) * r);
    }
    if (s.blendFrom) {
      const b = ease(Math.min(1, s.t / 1.1));
      pos.lerpVectors(s.blendFrom.pos, pos, b); look.lerpVectors(s.blendFrom.look, look, b);
    }
    // רעידת מצלמה עדינה
    const t = this.clock.elapsedTime;
    pos.x += Math.sin(t * 0.9) * 0.03; pos.y += Math.sin(t * 1.3) * 0.02;
    cam.position.copy(pos); cam.lookAt(look); this.curLook = look;
    this.camFill.position.copy(pos).add(v3(0, 0.6, 0));
    const fov = (s.fov || 45) * (cam.aspect < 1 ? 1.45 : 1);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * (s.blendFrom ? 3 : 30));
    cam.updateProjectionMatrix();
  }

  // ───────── לולאה ─────────
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    // מעבר צבעים
    const k = Math.min(1, dt * 2.5);
    for (const key in this.moodCol) this.moodCol[key].lerp(new THREE.Color(this.moodTarget[key]), k);
    for (const m of this.neonMats) m.color.copy(this.moodCol.neon);
    for (const m of this.rings) m.color.copy(this.moodCol.ring);
    this.scene.fog.color.copy(this.moodCol.fog);
    this.rimLight.color.copy(this.moodCol.beam);
    // קרני אור
    for (const b of this.beams) {
      const sw = t * b.speed + b.phase;
      b.pivot.rotation.set(Math.sin(sw) * 0.55 + 0.25, b.a + Math.cos(sw * 0.7) * 0.5, Math.cos(sw) * 0.35);
      b.mat.uniforms.color.value.copy(this.moodCol.beam);
      b.mat.uniforms.opacity.value = (this.mood === 'dim' ? 0.1 : 0.22) + Math.sin(sw * 2) * 0.05;
    }
    // נקודות LED מנצנצות
    const colAttr = this.dots.geometry.attributes.color;
    const base = this.moodCol.dots;
    for (let i = 0; i < this.dotPhase.length; i++) {
      const f = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + this.dotPhase[i] * 3.1 + this.dots.geometry.attributes.position.array[i * 3 + 1] * 0.3));
      colAttr.array[i * 3] = base.r * f; colAttr.array[i * 3 + 1] = base.g * f; colAttr.array[i * 3 + 2] = base.b * f;
    }
    colAttr.needsUpdate = true;
    this.stageTopMat.emissiveIntensity = 0.75 + Math.sin(t * 2) * 0.12;
    // קונפטי
    if (this.confetti.visible) {
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let alive = 0;
      this.confData.forEach((d, i) => {
        d.p.addScaledVector(d.v, dt * 3); d.p.x += Math.sin(t * 2 + i) * dt * 0.6;
        d.r.x += dt * 4 * d.s; d.r.y += dt * 3 * d.s;
        if (d.p.y > -1) alive++;
        e.set(d.r.x, d.r.y, 0); q.setFromEuler(e);
        M.compose(d.p, q, v3(1, 1, 1)); this.confetti.setMatrixAt(i, M);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (!alive) this.confetti.visible = false;
    }
    // עשן
    for (const s of this.smoke) {
      s.t += dt * 0.2;
      if (s.life > 0) s.life -= dt * 0.12;
      const r = STAGE_R + 1 + Math.sin(s.t + s.a) * 1.5;
      s.sp.position.set(Math.sin(s.a + s.t * 0.1) * r, 0.8 + (1 - Math.max(0, s.life)) * 3, Math.cos(s.a + s.t * 0.1) * r);
      s.sp.material.opacity = Math.max(0, s.life) * 0.35;
    }
    // דוכנים גדולים: נשימה קלה של הדמויות
    for (const bp of this.bigPods) bp.fig.group.position.y = Math.sin(t * 1.8 + bp.group.position.x) * 0.01;
    this.host.group.position.y = STAGE_TOP + Math.sin(t * 1.5) * 0.008;
    this.updateCamera(dt);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // ───────── עזרים לבמאי ─────────
  center() { return v3(0, 1, 0); }
  contestantShot(c, close = 1) {
    if (!c || !c.headPos) return null;
    const head = c.headPos.clone();
    const out = c.al === false && this.pods;
    if (out) head.y -= 0.22;
    const dir = c.inward.clone();
    const side = v3(dir.z, 0, -dir.x).multiplyScalar((Math.random() - 0.5) * 1.4);
    const from = head.clone().addScaledVector(dir, 4.4 * close).add(side).add(v3(0, out ? 0.9 : 0.3, 0));
    const from2 = head.clone().addScaledVector(dir, 3.0 * close).add(side.multiplyScalar(0.6)).add(v3(0, out ? 0.7 : 0.15, 0));
    return { from, from2, to: head.clone().add(v3(0, -0.25, 0)), fov: 40, dur: 3.5 };
  }
  hostShot(close = 1) {
    const h = this.hostHead.clone();
    const front = h.clone().addScaledVector(this.hostFwd, 4.4 * close).add(v3(0.6, 0.1, 0));
    const front2 = h.clone().addScaledVector(this.hostFwd, 3.4 * close).add(v3(0.35, 0.05, 0));
    return { from: front, from2: front2, to: h.clone().add(v3(0, -0.3, 0)), fov: 38, dur: 3.5 };
  }
  hostOTS() {
    const h = this.hostHead.clone();
    const side = v3(this.hostFwd.z, 0, -this.hostFwd.x);
    const back = h.clone().addScaledVector(this.hostFwd, -2.6).addScaledVector(side, 0.95).add(v3(0, 0.45, 0));
    const look = h.clone().addScaledVector(this.hostFwd, 8).setY(1.8);
    return { from: back, from2: back.clone().add(v3(-0.2, 0.05, 0)), to: look, fov: 48, dur: 4.5 };
  }
  hostPOV() {
    const h = this.hostHead.clone().add(v3(0, -0.05, 0));
    let look;
    if (this.mode === 'club') look = v3(0, 2.4, -12);
    else look = v3(0, 1.6, 0.2);
    return { pos: h.addScaledVector(this.hostFwd, 0.25), look };
  }
}

export { STAGE_TOP, v3 };
