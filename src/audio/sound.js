// Sons gerados na hora com Web Audio (sem arquivos de áudio): interface, dinheiro, alertas,
// vozes dos animais conforme a distância da câmera e ambiente (pássaros de dia, grilos à noite).
let ctx = null, master = null, amb = null, noiseBuf = null;
const S = { on: true, vol: 0.7, ambiente: true };

function ensure() {
  if (ctx) { if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); return !!ctx; } // iPad: 'interrupted' depois de ligação/bloqueio
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = S.on ? S.vol : 0; master.connect(ctx.destination);
    amb = ctx.createGain(); amb.gain.value = S.ambiente ? 1 : 0; amb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch (e) { ctx = null; return false; }
}
export function unlock() { ensure(); }
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx) ensure(); });
export function configure({ som, volume, ambiente }) {
  S.on = som ?? S.on; S.vol = volume ?? S.vol; S.ambiente = ambiente ?? S.ambiente;
  if (master) master.gain.setTargetAtTime(S.on ? S.vol : 0, ctx.currentTime, 0.05);
  if (amb) amb.gain.setTargetAtTime(S.ambiente ? 1 : 0, ctx.currentTime, 0.2);
}
const ready = () => S.on && ctx && ctx.state === 'running';

// ---------- blocos básicos ----------
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
let X = null; const cx = () => X || ctx;
function tone({ type = 'sine', f0, f1, t = 0, a = 0.01, d = 0.2, peak = 0.3, out = master, vib = 0, vibF = 6, filter }) {
  const now = cx().currentTime + t, o = cx().createOscillator(), g = cx().createGain();
  o.type = type; o.frequency.setValueAtTime(f0, now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + a + d);
  if (vib) { const l = cx().createOscillator(), lg = cx().createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(now); l.stop(now + a + d + 0.05); }
  env(g, now, a, peak, d);
  let node = o; if (filter) { const f = cx().createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.f; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
  node.connect(g).connect(out); o.start(now); o.stop(now + a + d + 0.05);
}
function noise({ t = 0, a = 0.01, d = 0.3, peak = 0.3, f = 800, f1, q = 1, type = 'bandpass', out = master }) {
  const now = cx().currentTime + t, n = cx().createBufferSource(), fl = cx().createBiquadFilter(), g = cx().createGain();
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
// Cada voz é gerada UMA vez (OfflineAudioContext), guardada como AudioBuffer e reaproveitada
// com pequena variação de velocidade/volume a cada uso.
// voz com formantes: fonte "glotal" (serra + ruído de sopro) passando por filtros de vogal, com vibrato e tremor de amplitude (rosnado)
function voz({ t = 0, dur = 1, f0, f1, fm, formantes, am = 0, amF = 25, amD = 0.5, sopro = 0.2, peak = 0.5, jit = 0.01, out, ataque = 0.05, soltar }) {
  const c = cx(), now = c.currentTime + t, o = c.createOscillator(), mix = c.createGain(), g = c.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, now);
  if (fm) o.frequency.linearRampToValueAtTime(fm[1], now + dur * fm[0]);
  o.frequency.linearRampToValueAtTime(f1 ?? f0, now + dur);
  const lf = c.createOscillator(), lg = c.createGain(); lf.frequency.value = 7 + Math.random() * 3; lg.gain.value = f0 * jit * 3; lf.connect(lg).connect(o.frequency); lf.start(now); lf.stop(now + dur + 0.1);
  o.connect(mix);
  if (sopro) { const n = c.createBufferSource(), ng = c.createGain(); n.buffer = noiseBuf; n.loop = true; ng.gain.value = sopro; n.connect(ng).connect(mix); n.start(now, Math.random()); n.stop(now + dur + 0.1); }
  const sum = c.createGain();
  for (const [f, q, gn] of formantes) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const bg = c.createGain(); bg.gain.value = gn; mix.connect(b); b.connect(bg).connect(sum); }
  // um pouco de distorção dá o "grão" de garganta
  const sh = c.createWaveShaper(), k = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 2.2); } sh.curve = k;
  sum.connect(sh);
  const amg = c.createGain(); amg.gain.value = 1;
  if (am) { const l = c.createOscillator(), lg2 = c.createGain(); l.frequency.value = amF; lg2.gain.value = amD; amg.gain.value = 1 - amD; l.connect(lg2).connect(amg.gain); l.start(now); l.stop(now + dur + 0.1); }
  sh.connect(amg).connect(g);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(peak, now + ataque);
  g.gain.setValueAtTime(peak, now + Math.max(ataque, dur * (soltar ?? 0.55))); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  g.connect(out); o.start(now); o.stop(now + dur + 0.1);
}
function pancada({ t = 0, f = 110, peak = 0.5, out, ressoa = 220, ruido = 0.5 }) { // batida oca (peito, tambor)
  tone({ type: 'sine', f0: f * 1.6, f1: f * 0.6, t, a: 0.004, d: 0.13, peak, out });
  noise({ t, a: 0.003, d: 0.07, peak: peak * ruido, f: ressoa, q: 1.2, out });
  noise({ t, a: 0.003, d: 0.05, peak: peak * 0.18, f: 1800, q: 0.8, out });
}
const VOZ = {
  leao(o) { // rugido: sobe, mantém pulsando e termina em grunhidos
    voz({ dur: 2.1, f0: 105, fm: [0.22, 170], f1: 70, formantes: [[650, 5, 1], [1150, 6, 0.8], [2400, 5, 0.4], [180, 3, 0.8]], am: 1, amF: 24, amD: 0.55, sopro: 0.25, peak: 0.55, out: o, ataque: 0.12, soltar: 0.6 });
    for (let i = 0; i < 3; i++) voz({ t: 2.2 + i * 0.34, dur: 0.3, f0: 95 - i * 8, f1: 70, formantes: [[550, 5, 1], [1000, 6, 0.7], [160, 3, 0.8]], sopro: 0.2, peak: 0.4 - i * 0.07, out: o, ataque: 0.04, soltar: 0.3 });
  },
  elefante(o) { // barrito: trombeta nasal subindo, com tremor
    voz({ dur: 1.4, f0: 330, fm: [0.35, 640], f1: 520, formantes: [[900, 8, 1], [1800, 8, 0.8], [3000, 6, 0.4]], am: 1, amF: 14, amD: 0.3, sopro: 0.15, peak: 0.42, out: o, ataque: 0.08, soltar: 0.65 });
    voz({ t: 1.5, dur: 0.5, f0: 120, f1: 80, formantes: [[300, 5, 1], [700, 5, 0.6]], sopro: 0.3, peak: 0.3, out: o });
  },
  zebra(o) { // relincho: três latidos agudos e um suspiro
    for (let i = 0; i < 3; i++) voz({ t: i * 0.24, dur: 0.22, f0: 650 - i * 40, f1: 380, formantes: [[900, 6, 1], [2100, 7, 0.8], [3200, 6, 0.3]], sopro: 0.25, peak: 0.34, out: o, ataque: 0.02, soltar: 0.3 });
    noise({ t: 0.8, a: 0.1, d: 0.4, peak: 0.1, f: 1400, q: 1, out: o });
  },
  girafa(o) { // ronco baixo e curto (girafas quase não fazem som)
    voz({ dur: 1.1, f0: 85, f1: 70, formantes: [[220, 4, 1], [480, 5, 0.6]], sopro: 0.35, peak: 0.25, out: o, ataque: 0.2, soltar: 0.5 });
  },
  macaco(o) { // guinchos e "hu-hu"
    for (let i = 0; i < 7; i++) voz({ t: i * 0.11, dur: 0.1, f0: 1100 + Math.random() * 500, f1: 800 + Math.random() * 300, formantes: [[1500, 7, 1], [2600, 7, 0.7]], sopro: 0.2, peak: 0.14, out: o, ataque: 0.01, soltar: 0.2 });
  },
  hipopotamo(o) { // risada rouca de hipopótamo: "hô-hô-hô-hô"
    for (let i = 0; i < 5; i++) voz({ t: i * 0.3, dur: 0.26, f0: 130 - i * 8, f1: 80, formantes: [[420, 5, 1], [900, 6, 0.8], [180, 3, 0.6]], am: 1, amF: 30, amD: 0.4, sopro: 0.3, peak: 0.42, out: o, ataque: 0.03, soltar: 0.3 });
  },
  rinoceronte(o) { // bufo (ar pelo nariz) + resmungo curto
    noise({ a: 0.03, d: 0.3, peak: 0.28, f: 2200, f1: 900, q: 0.9, out: o }); noise({ t: 0.05, a: 0.02, d: 0.25, peak: 0.16, f: 5000, q: 0.7, type: 'highpass', out: o });
    noise({ t: 0.55, a: 0.03, d: 0.25, peak: 0.24, f: 2000, f1: 800, q: 0.9, out: o });
    voz({ t: 0.95, dur: 0.6, f0: 135, f1: 95, formantes: [[450, 5, 1], [950, 6, 0.8], [1800, 5, 0.3]], sopro: 0.3, peak: 0.3, out: o, ataque: 0.06, soltar: 0.4 });
  },
  flamingo(o) { // grasnidos nasais
    for (let i = 0; i < 3; i++) voz({ t: i * 0.26, dur: 0.2, f0: 520, fm: [0.4, 640], f1: 480, formantes: [[1100, 9, 1], [2500, 8, 0.7]], sopro: 0.15, peak: 0.2, out: o, ataque: 0.03, soltar: 0.3 });
  },
  gorila(o) { // batidas no peito (ocas) e dois "hu-hu" graves
    const ts = [0, 0.13, 0.27, 0.39, 0.54, 0.66, 0.8, 0.93]; ts.forEach((t, i) => pancada({ t: 0.05 + t, f: 95 + (i % 2) * 12, peak: 0.34, out: o, ressoa: 260 }));
    voz({ t: 1.2, dur: 0.35, f0: 190, f1: 140, formantes: [[500, 6, 1], [1000, 6, 0.5]], sopro: 0.25, peak: 0.25, out: o, ataque: 0.05, soltar: 0.3 });
    voz({ t: 1.62, dur: 0.4, f0: 170, f1: 120, formantes: [[480, 6, 1], [950, 6, 0.5]], sopro: 0.25, peak: 0.22, out: o, ataque: 0.05, soltar: 0.3 });
  },
  tartaruga(o) { voz({ dur: 0.7, f0: 120, f1: 95, formantes: [[300, 5, 1], [650, 5, 0.5]], sopro: 0.4, peak: 0.12, out: o, ataque: 0.1 }); },
};
const DURA = { leao: 3.5, elefante: 2.2, zebra: 1.4, girafa: 1.4, macaco: 1.1, hipopotamo: 1.9, rinoceronte: 1.7, flamingo: 1.2, gorila: 2.2, tartaruga: 1 };
const vozBuf = {}, vozPend = {};
function renderBuf(dur, fn) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OC || !ctx) return Promise.resolve(null);
  const oc = new OC(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate); X = oc;
  try { const lim = oc.createDynamicsCompressor(); lim.connect(oc.destination); fn(lim); } finally { X = null; }
  return oc.startRendering().catch(() => null);
}
// vozes de espécies de DLC: parâmetros "voz" do pacote, gerados pela mesma função voz()
const VOZ_DLC = {};
export function vozDLC(sp, p) { if (p && !VOZ[sp]) VOZ_DLC[sp] = p; }
const fnVoz = sp => VOZ[sp] || (VOZ_DLC[sp] && (o => voz({ ...VOZ_DLC[sp], out: o })));
function garanteVoz(sp) {
  const f = fnVoz(sp); if (vozBuf[sp] || vozPend[sp] || !f || !ctx) return;
  vozPend[sp] = renderBuf(DURA[sp] || VOZ_DLC[sp]?.dur || 2, f).then(b => { vozBuf[sp] = b; });
}
// x: -1 (esquerda) .. 1 (direita); dist: metros até a câmera
export function animal(sp, x, dist, S) {
  if (S?.voz) vozDLC(sp, S.voz);
  if (!ready() || !fnVoz(sp)) return;
  const vol = Math.min(1, 25 / Math.max(10, dist)) ** 1.3; if (vol < 0.06) return;
  const b = vozBuf[sp]; if (!b) { garanteVoz(sp); return; } // na 1ª vez gera e toca da próxima
  const n = ctx.createBufferSource(); n.buffer = b; n.playbackRate.value = 0.93 + Math.random() * 0.14;
  n.connect(panned(x, vol * (0.85 + Math.random() * 0.3))); n.start();
}

// ---------- burburinho do público ----------
// Vozes indistintas (sílabas com formantes de vogal) em laço de 9 s, gerado uma vez; o volume segue o número de visitantes.
const VOGAIS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1720]];
function babble(o) {
  const N = 16; for (let v = 0; v < N; v++) {
    const base = v % 5 === 0 ? 300 : v % 2 ? 210 : 115, pan = Math.random() * 2 - 1;
    const sa = cx().createGain(); sa.gain.value = 0.13; const pn = cx().createStereoPanner ? cx().createStereoPanner() : null; let dest = sa;
    if (pn) { pn.pan.value = pan; sa.connect(pn); pn.connect(o); } else sa.connect(o);
    let t = Math.random() * 0.6; while (t < 8.4) {
      const n = 2 + Math.floor(Math.random() * 5); // frase de n sílabas
      for (let i = 0; i < n && t < 8.4; i++) {
        const [f1, f2] = VOGAIS[Math.floor(Math.random() * VOGAIS.length)], d = 0.1 + Math.random() * 0.12, p = base * (0.9 + Math.random() * 0.3);
        voz({ t, dur: d, f0: p, f1: p * (0.85 + Math.random() * 0.25), formantes: [[f1, 7, 1], [f2, 8, 0.6], [2800, 8, 0.15]], sopro: 0.15, peak: 0.6, out: dest, ataque: 0.025, soltar: 0.4, jit: 0.02 });
        if (Math.random() < 0.3) noise({ t: t + d * 0.7, a: 0.01, d: 0.07, peak: 0.05, f: 6500, q: 1.5, out: dest });
        t += d + 0.02 + Math.random() * 0.05;
      }
      t += 0.25 + Math.random() * 1.4; // pausa entre falas
    }
  }
}
let crowdBuf = null, crowdPend = false, crowdSrc = null, crowdG = null, crowdLevel = 0;
export function crowd(dt, count, zoomDist, hour) {
  if (!ctx || !S.on || !S.ambiente) { if (crowdG) crowdG.gain.setTargetAtTime(0, ctx.currentTime, 0.3); return; }
  if (!ready()) return;
  const open = hour >= 8 && hour < 18, alvo = !open || count < 3 ? 0 : Math.min(1, count / 70) ** 0.6 * 0.5 * Math.min(1, 55 / Math.max(15, zoomDist)) ** 0.8;
  if (alvo > 0 && !crowdBuf) { if (!crowdPend) { crowdPend = true; renderBuf(9, babble).then(b => { crowdBuf = b; }); } return; }
  if (!crowdBuf) return;
  if (!crowdSrc) {
    crowdSrc = ctx.createBufferSource(); crowdSrc.buffer = crowdBuf; crowdSrc.loop = true; crowdG = ctx.createGain(); crowdG.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; // um pouco abafado: está longe
    crowdSrc.connect(lp).connect(crowdG).connect(amb); crowdSrc.start();
  }
  crowdLevel += (alvo - crowdLevel) * Math.min(1, dt * 0.8); crowdG.gain.setTargetAtTime(crowdLevel, ctx.currentTime, 0.2);
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

// diagnóstico (testes): gera cada voz e o burburinho e devolve duração, pico, energia e centro espectral aproximado
export async function diag() {
  ensure(); const out = {};
  const stat = b => { if (!b) return null; const d = b.getChannelData(0); let pk = 0, e = 0, bad = 0, zc = 0; for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) bad++; pk = Math.max(pk, Math.abs(v)); e += v * v; if (i && (d[i - 1] < 0) !== (v < 0)) zc++; } return { dur: +(d.length / b.sampleRate).toFixed(2), pico: +pk.toFixed(2), rms: +Math.sqrt(e / d.length).toFixed(3), bad, cruz: Math.round(zc / (d.length / b.sampleRate) / 2) }; };
  for (const sp of Object.keys(VOZ)) { garanteVoz(sp); await vozPend[sp]; out[sp] = stat(vozBuf[sp]); }
  out.burburinho = stat(await renderBuf(9, babble));
  return out;
}
