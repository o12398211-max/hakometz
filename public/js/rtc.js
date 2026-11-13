// שמע בזמן אמת ב-WebRTC. טופולוגיה: כל "דובר" (מנחה אנושי, מתמודדי דו-קרב/סולו, מרואיין) מחובר לכל המשתתפים.
// signaling דרך Socket.IO.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Voice {
  constructor(socket, myId) {
    this.socket = socket; this.myId = myId;
    this.stream = null; this.peers = new Map(); this.speakers = new Set();
    this.blocked = new Set(); // עמיתים שלא שומעים/משמיעים כרגע (אנטי-רמאות בדו-קרב)
    this.levels = new Map(); this.onLevel = null;
    socket.on('rtc:signal', ({ from, data }) => this.onSignal(from, data));
  }
  get hasMic() { return !!this.stream; }
  async enableMic() {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.track = this.stream.getAudioTracks()[0];
      for (const p of this.peers.values()) this.attachTrack(p);
      this.sync();
      return true;
    } catch (e) { console.warn('mic denied', e); return false; }
  }
  disableMic() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null;
    for (const p of this.peers.values()) if (p.sender) p.sender.replaceTrack(null);
  }
  // נקרא בכל עדכון מצב מהשרת
  update({ players, speakers, blocked }) {
    this.speakers = new Set(speakers);
    this.blocked = new Set(blocked || []);
    const iAmSpeaker = this.speakers.has(this.myId);
    const want = new Set();
    for (const p of players) {
      if (p.id === this.myId || !p.connected) continue;
      if (iAmSpeaker || this.speakers.has(p.id)) want.add(p.id);
    }
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.close(id);
    for (const id of want) if (!this.peers.has(id) && this.myId < id) this.connect(id);
    this.sync();
  }
  sync() {
    const iAmSpeaker = this.speakers.has(this.myId);
    for (const [id, p] of this.peers) {
      const send = iAmSpeaker && !this.blocked.has(id) && this.track;
      if (p.sender) p.sender.replaceTrack(send ? this.track : null).catch(() => {});
      if (p.audio) p.audio.muted = this.blocked.has(id);
    }
  }
  mk(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, sender: null, audio: null, polite: this.myId > id, makingOffer: false };
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      p.sender = tr.sender;
      this.attachTrack(p);
    }
    pc.onicecandidate = e => e.candidate && this.socket.emit('rtc:signal', { to: id, data: { ice: e.candidate } });
    pc.ontrack = e => {
      if (!p.audio) { p.audio = new Audio(); p.audio.autoplay = true; p.audio.playsInline = true; document.body.appendChild(p.audio); }
      p.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      p.audio.muted = this.blocked.has(id);
      p.audio.play().catch(() => {});
      this.meter(id, p.audio.srcObject);
    };
    pc.onnegotiationneeded = async () => {
      try { p.makingOffer = true; await pc.setLocalDescription(); this.socket.emit('rtc:signal', { to: id, data: { sdp: pc.localDescription } }); }
      catch (e) { console.warn(e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.close(id); };
    this.peers.set(id, p);
    return p;
  }
  attachTrack(p) {
    const send = this.speakers.has(this.myId) && this.track;
    if (p.sender) p.sender.replaceTrack(send ? this.track : null).catch(() => {});
  }
  connect(id) { this.mk(id, true); }
  async onSignal(from, data) {
    let p = this.peers.get(from) || this.mk(from, false);
    const pc = p.pc;
    try {
      if (data.sdp) {
        const collision = data.sdp.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        if (collision && !p.polite) return;
        await pc.setRemoteDescription(data.sdp);
        if (!p.sender) {
          const tr = pc.getTransceivers()[0];
          if (tr) { tr.direction = 'sendrecv'; p.sender = tr.sender; this.attachTrack(p); }
        }
        if (data.sdp.type === 'offer') { await pc.setLocalDescription(); this.socket.emit('rtc:signal', { to: from, data: { sdp: pc.localDescription } }); }
      } else if (data.ice) {
        try { await pc.addIceCandidate(data.ice); } catch {}
      }
    } catch (e) { console.warn('rtc', e); }
  }
  close(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    this.peers.delete(id);
  }
  meter(id, stream) {
    try {
      const ctx = this.mctx || (this.mctx = new (window.AudioContext || window.webkitAudioContext)());
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (!this.peers.has(id)) return;
        an.getByteFrequencyData(buf);
        const v = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
        this.levels.set(id, v);
        this.onLevel && this.onLevel(id, v);
        setTimeout(tick, 120);
      };
      tick();
    } catch {}
  }
}
