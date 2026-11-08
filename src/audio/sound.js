// Sons gerados na hora com Web Audio (sem arquivos de áudio): interface, dinheiro, alertas,
// vozes dos animais conforme a distância da câmera e ambiente (pássaros de dia, grilos à noite).
let ctx = null, master = null, amb = null, noiseBuf = null;
const S = { on: true, vol: 0.7, ambiente: true };

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return !!ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = S.on ? S.vol : 0; master.connect(ctx.destination);
    amb = ctx.createGain(); amb.gain.value = S.ambiente ? 1 : 0; amb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch (e) { ctx = null; return false; }
}
export function unlock() { ensure(); }
export function configure({ som, volume, ambiente }) {
  S.on = som ?? S.on; S.vol = volume ?? S.vol; S.ambiente = ambiente ?? S.ambiente;
  if (master) master.gain.setTargetAtTime(S.on ? S.vol : 0, ctx.currentTime, 0.05);
  if (amb) amb.gain.setTargetAtTime(S.ambiente ? 1 : 0, ctx.currentTime, 0.2);
}
const ready = () => S.on && ctx && ctx.state === 'running';

// ---------- blocos básicos ----------
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
function tone({ type = 'sine', f0, f1, t = 0, a = 0.01, d = 0.2, peak = 0.3, out = master, vib = 0, vibF = 6, filter }) {
  const now = ctx.currentTime + t, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + a + d);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(now); l.stop(now + a + d + 0.05); }
  env(g, now, a, peak, d);
  let node = o; if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.f; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(out); o.start(now); o.stop(now + a + d + 0.05);
}
function noise({ t = 0, a = 0.01, d = 0.3, peak = 0.3, f = 800, f1, q = 1, type = 'bandpass', out = master }) {
  const now = ctx.currentTime + t, n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, now); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, now + a + d); fl.Q.value = q;
  env(g, now, a, peak, d); n.connect(fl).connect(g).connect(out); n.start(now, Math.random() * 0.5); n.stop(now + a + d + 0.05);
}
function panned(x, vol, dest = master) { // saída com volume e lado (estéreo)
  const g = ctx.createGain(); g.gain.value = vol; let node = g;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); g.connect(p); p.connect(dest); } else g.connect(dest);
  return node;
}

// ---------- interface ----------
export function click() { if (!ready()) return; tone({ type: 'triangle', f0: 900, f1: 600, d: 0.05, peak: 0.08 }); }
export function cash() { if (!ready()) return; tone({ type: 'square', f0: 1320, d: 0.07, peak: 0.06, filter: { f: 3000 } }); tone({ type: 'square', f0: 1760, t: 0.07, d: 0.18, peak: 0.06, filter: { f: 3500 } }); }
export function good() { if (!ready()) return; [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.09, d: 0.25, peak: 0.1 })); }
export function bad() { if (!ready()) return; tone({ type: 'sawtooth', f0: 220, f1: 150, d: 0.3, peak: 0.07, filter: { f: 900 } }); }
export function alarm() { if (!ready()) return; for (let i = 0; i < 3; i++) { tone({ type: 'square', f0: 880, t: i * 0.32, d: 0.14, peak: 0.07, filter: { f: 2200 } }); tone({ type: 'square', f0: 660, t: i * 0.32 + 0.16, d: 0.14, peak: 0.07, filter: { f: 2200 } }); } }
export function undo() { if (!ready()) return; tone({ type: 'sine', f0: 700, f1: 350, d: 0.18, peak: 0.12 }); }

// ---------- vozes dos animais ----------
const VOZ = {
  leao(o) { tone({ type: 'sawtooth', f0: 95, f1: 60, a: 0.25, d: 1.3, peak: 0.5, out: o, vib: 6, vibF: 9, filter: { f: 420, q: 2 } }); noise({ a: 0.2, d: 1.3, peak: 0.25, f: 300, f1: 150, q: 2, out: o }); },
  elefante(o) { tone({ type: 'sawtooth', f0: 420, f1: 720, a: 0.12, d: 0.9, peak: 0.35, out: o, vib: 25, vibF: 12, filter: { f: 2400, q: 3 } }); noise({ a: 0.1, d: 0.8, peak: 0.12, f: 1500, q: 3, out: o }); },
  zebra(o) { for (let i = 0; i < 3; i++) { tone({ type: 'sawtooth', f0: 520, f1: 340, t: i * 0.22, a: 0.02, d: 0.14, peak: 0.25, out: o, filter: { f: 1800, q: 2 } }); noise({ t: i * 0.22, d: 0.12, peak: 0.12, f: 1200, out: o }); } },
  girafa(o) { tone({ type: 'sine', f0: 92, a: 0.3, d: 1.2, peak: 0.2, out: o, vib: 2, vibF: 15 }); },
  macaco(o) { for (let i = 0; i < 6; i++) tone({ type: 'square', f0: 1400 + Math.random() * 600, f1: 900, t: i * 0.09, a: 0.005, d: 0.06, peak: 0.08, out: o, filter: { f: 3000 } }); },
  hipopotamo(o) { for (let i = 0; i < 4; i++) tone({ type: 'sawtooth', f0: 140 - i * 10, f1: 80, t: i * 0.28, a: 0.03, d: 0.22, peak: 0.35, out: o, filter: { f: 500, q: 3 } }); },
  rinoceronte(o) { noise({ a: 0.02, d: 0.35, peak: 0.35, f: 600, f1: 250, q: 1.5, out: o }); noise({ t: 0.5, a: 0.02, d: 0.3, peak: 0.3, f: 550, f1: 250, q: 1.5, out: o }); },
  flamingo(o) { for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', f0: 600, f1: 520, t: i * 0.25 + Math.random() * 0.1, a: 0.02, d: 0.16, peak: 0.15, out: o, filter: { f: 1500, q: 6 } }); },
  gorila(o) { for (let i = 0; i < 8; i++) { tone({ type: 'sine', f0: 110, f1: 60, t: i * 0.11, a: 0.005, d: 0.09, peak: 0.45, out: o }); noise({ t: i * 0.11, d: 0.06, peak: 0.15, f: 200, out: o }); } },
  tartaruga(o) { tone({ type: 'sine', f0: 120, f1: 90, a: 0.1, d: 0.5, peak: 0.12, out: o }); },
};
// x: -1 (esquerda) .. 1 (direita); dist: metros até a câmera
export function animal(sp, x, dist) {
  if (!ready() || !VOZ[sp]) return;
  const vol = Math.min(1, 25 / Math.max(10, dist)) ** 1.3; if (vol < 0.06) return;
  VOZ[sp](panned(x, vol));
}

// ---------- ambiente ----------
let ambT = 0;
export function ambience(dt, hour, zoomDist) {
  if (!ready() || !S.ambiente) return;
  ambT -= dt; if (ambT > 0) return;
  const day = hour >= 6 && hour < 19, near = Math.min(1, 60 / Math.max(20, zoomDist));
  if (day) {
    ambT = 1.2 + Math.random() * 3;
    const f = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4), o = panned(Math.random() * 2 - 1, 0.35 * near, amb);
    for (let i = 0; i < n; i++) tone({ type: 'sine', f0: f * (0.9 + Math.random() * 0.25), f1: f * (1.1 + Math.random() * 0.3), t: i * (0.08 + Math.random() * 0.06), a: 0.01, d: 0.07, peak: 0.06, out: o });
  } else {
    ambT = 0.6 + Math.random() * 1.2;
    const o = panned(Math.random() * 2 - 1, 0.25 * near, amb);
    for (let i = 0; i < 4; i++) tone({ type: 'sine', f0: 4300 + Math.random() * 200, t: i * 0.05, a: 0.004, d: 0.03, peak: 0.04, out: o });
  }
}
