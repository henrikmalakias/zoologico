// Biblioteca de modelos realistas: gera em segundo plano (Web Worker) e guarda em cache no aparelho.
import { buildMesh } from './sdf.js';
import { makeTemplate } from './sdfThree.js';
import { cacheGet, cacheSet } from '../save/save.js';
const SPECS = import.meta.glob('../content/modelos/*.json', { eager: true, import: 'default' });
export const GEN = 'g3';
export const spec = id => SPECS[`../content/modelos/${id}.json`];
export class ModelLibrary {
  constructor(onReady) {
    this.onReady = onReady; this.tpl = new Map(); this.pending = new Set(); this.queue = []; this.busy = false;
    try { this.worker = new Worker(new URL('./modelWorker.js', import.meta.url), { type: 'module' }); this.worker.onmessage = e => this.done(e.data); this.worker.onerror = () => { this.worker = null; this.busy = false; this.next(); }; }
    catch (e) { this.worker = null; }
  }
  get(key) { return this.tpl.get(key) || null; }
  request(key) {
    if (this.tpl.has(key) || this.pending.has(key)) return;
    const [id, variant] = key.split(':'); const sp = spec(id); if (!sp) return;
    this.pending.add(key);
    const ck = `${key}:${sp.versao}:${GEN}`;
    cacheGet(ck).then(m => { if (m && m.position) this.finish(key, m); else { this.queue.push({ key, ck, spec: sp, variant }); this.next(); } }).catch(() => { this.queue.push({ key, ck, spec: sp, variant }); this.next(); });
  }
  next() {
    if (this.busy || !this.queue.length) return;
    const job = this.queue.shift(); this.busy = job;
    if (this.worker) this.worker.postMessage({ key: job.key, spec: job.spec, variant: job.variant });
    else setTimeout(() => { try { this.done({ key: job.key, m: buildMesh(job.spec, job.variant) }); } catch (e) { this.done({ key: job.key, error: String(e) }); } }, 30);
  }
  done({ key, m, error }) {
    const job = this.busy; this.busy = false;
    if (m) { cacheSet(job.ck, m).catch(() => {}); this.finish(key, m); } else { console.warn('modelo', key, error); this.pending.delete(key); }
    this.next();
  }
  finish(key, m) {
    const id = key.split(':')[0];
    this.tpl.set(key, makeTemplate(m, { rough: id === 'elefante' || id === 'rinoceronte' || id === 'hipopotamo' ? 0.95 : id === 'tartaruga' ? 0.7 : id === 'humano' ? 0.8 : 0.86 }));
    this.pending.delete(key); this.onReady?.(key);
  }
  get loading() { return this.pending.size; }
}

// ---------- animação dos modelos realistas ----------
const LEGS = [['pernaFE', 0, true], ['pernaTD', 0.25, false], ['pernaFD', 0.5, true], ['pernaTE', 0.75, false]];
function animateSDFBird(o, a, dt, moving, an) {
  const u = o.userData.sdf, B = u.bones;
  const k = Math.min(1, dt * 2.5);
  u.lie = (u.lie ?? 0) + ((a.st === 'sedado' ? 1 : 0) - (u.lie ?? 0)) * k;
  u.rest = (u.rest ?? 0) + ((a.st === 'sleep' || a.st === 'tree_sleep' ? 1 : 0) - (u.rest ?? 0)) * k;
  u.walk = (u.walk ?? 0) + ((moving ? 1 : 0) - (u.walk ?? 0)) * Math.min(1, dt * 6);
  u.eat = (u.eat ?? 0) + (((a.st === 'eat' || a.st === 'drink' || a.st === 'filtrar') ? 1 : 0) - (u.eat ?? 0)) * k;
  u.phase += dt * (moving ? an.freq : 1.2);
  const p = u.phase, L = u.lie, W = u.walk * (1 - L), Rr = u.rest * (1 - L);
  B.raiz.position.y = -L * 0.75; B.raiz.rotation.z = L * 0.5;
  for (const [s, off] of [['E', 0], ['D', Math.PI]]) {
    const ph = p + off, sw = Math.sin(ph) * an.passo * W, lift = Math.max(0, -Math.cos(ph)) * W;
    B['perna' + s + '1'].rotation.x = sw - L * 0.6;
    B['perna' + s + '2'].rotation.x = -lift * 1.1 + L * 2.2 + (s === 'D' ? -Rr * 2.4 : 0);
    B['perna' + s + '3'].rotation.x = lift * 0.6;
  }
  B.raiz.position.z = W * Math.sin(p * 2) * 0.01;
  // comendo: cabeça de ponta-cabeça filtrando a água; dormindo: pescoço deitado sobre o corpo
  B.pescoco.rotation.x = u.eat * an.pescoco - Rr * 1.1 + Math.sin(p * 0.4) * 0.04 * (1 - W);
  B.pescoco2.rotation.x = u.eat * 0.9 + Rr * 1.8;
  B.pescoco3.rotation.x = u.eat * 0.6 + Rr * 1.0;
  B.cabeca.rotation.x = u.eat * 1.2;
  B.cabeca.rotation.y = Math.sin(p * 0.3) * 0.4 * (1 - W) * (1 - u.eat) * (1 - Rr);
}
export function animateSDFAnimal(o, a, dt, moving, sp) {
  const sd = spec(sp); if (sd.tipo === 'ave') return animateSDFBird(o, a, dt, moving, sd.anim);
  const u = o.userData.sdf, B = u.bones, an = sd.anim;
  const lying = a.st === 'sleep' || a.st === 'tree_sleep' || a.st === 'sedado';
  const k = Math.min(1, dt * 2.5);
  u.lie = (u.lie ?? 0) + ((lying ? 1 : 0) - (u.lie ?? 0)) * k;
  u.walk = (u.walk ?? 0) + ((moving ? 1 : 0) - (u.walk ?? 0)) * Math.min(1, dt * 6);
  u.eat = (u.eat ?? 0) + (((a.st === 'eat' || a.st === 'drink' || a.st === 'filtrar') ? 1 : 0) - (u.eat ?? 0)) * k;
  u.phase += dt * (moving ? an.freq * (a._nada ? 0.6 : 1) : 1.3);
  u.bath = (u.bath ?? 0) + ((a.st === 'bath' ? 1 : 0) - (u.bath ?? 0)) * k;
  const p = u.phase, L = u.lie, W = u.walk * (1 - L);
  const legF = B.pernaFE1.userData.rest.y + B.peito.userData.rest.y + B.coluna.userData.rest.y + B.quadril.userData.rest.y;
  B.raiz.position.y = -L * legF * 0.72 + W * Math.abs(Math.sin(p * 2)) * 0.015 * legF;
  B.raiz.rotation.z = a.st === 'sedado' ? L * 0.3 : 0;
  B.raiz.position.z = a.st === 'empurrar' ? Math.sin(u.phase * 7) * 0.15 : 0;
  if (a.st === 'pulando' || a.st === 'salto') { for (const [n, , front] of LEGS) { B[n + '1'].rotation.x = front ? -0.9 : 0.9; B[n + '2'].rotation.x = front ? 1.2 : -1.0; } B.pescoco.rotation.x = -0.2; return; }
  for (const [n, off, front] of LEGS) {
    const ph = p + off * Math.PI * 2, sw = Math.sin(ph) * an.passo * W, lift = Math.max(0, -Math.cos(ph)) * W;
    if (front) { B[n + '1'].rotation.x = sw * 0.85 - L * 1.25; B[n + '2'].rotation.x = lift * 0.9 + L * 0.15; B[n + '3'].rotation.x = lift * 0.5; }
    else { B[n + '1'].rotation.x = sw * 0.8 - L * 0.9; B[n + '2'].rotation.x = -lift * 0.5 + L * 2.0; B[n + '3'].rotation.x = lift * 0.6 - L * 1.0; }
  }
  B.pescoco.rotation.x = u.eat * an.pescoco + Math.sin(p * 0.35) * 0.05 * (1 - W) + L * 0.25 + W * 0.05;
  B.pescoco2.rotation.x = u.eat * an.pescoco * 0.35;
  B.cabeca.rotation.y = Math.sin(p * 0.27) * 0.35 * (1 - W) * (1 - u.eat) * (1 - L);
  B.cabeca.rotation.x = W * Math.sin(p * 2) * 0.04;
  if (B.cauda1) { B.cauda1.rotation.z = Math.sin(p * 1.3) * 0.3; B.cauda2.rotation.z = Math.sin(p * 1.3 - 0.7) * 0.4; B.cauda3.rotation.z = Math.sin(p * 1.3 - 1.4) * 0.45; B.cauda1.rotation.x = W * 0.2; }
  B.peito.scale.setScalar(1 + Math.sin(p * 1.6) * 0.01 * (1 - W));
  if (B.orelhaE) { B.orelhaE.rotation.y = Math.sin(p * 1.1) * 0.22; B.orelhaD.rotation.y = -Math.sin(p * 1.1 + 0.4) * 0.22; }
  // banho: tromba sobe e esguicha água nas costas
  if (B.tromba1) { for (let i = 1; i <= 4; i++) B['tromba' + i].rotation.x = Math.sin(p * 0.8 + i * 0.5) * 0.08 * i - u.eat * 0.35 * (i === 4 ? -1.5 : 1) + W * 0.05 - u.bath * (0.45 + 0.25 * Math.sin(p * 1.7)) * (i === 1 ? 0.6 : 1); }
}
export function animateSDFHuman(o, dt, moving, action, t) {
  const u = o.userData.sdf, B = u.bones;
  u.walk = (u.walk ?? 0) + ((moving ? 1 : 0) - (u.walk ?? 0)) * Math.min(1, dt * 8);
  u.phase += dt * (moving ? 8 : 1);
  const p = u.phase, W = u.walk;
  for (const b of Object.values(B)) b.rotation.set(0, 0, 0);
  B.quadril.position.y = B.quadril.userData.rest.y + W * Math.abs(Math.sin(p)) * 0.03;
  const sw = Math.sin(p) * 0.55 * W;
  B.pernaE1.rotation.x = -sw; B.pernaD1.rotation.x = sw; B.pernaE2.rotation.x = Math.max(0, Math.sin(p + 1.6)) * 0.7 * W; B.pernaD2.rotation.x = Math.max(0, Math.sin(p + 1.6 + Math.PI)) * 0.7 * W;
  B.bracoE1.rotation.x = sw * 0.7; B.bracoD1.rotation.x = -sw * 0.7; B.bracoE2.rotation.x = -0.2 * W; B.bracoD2.rotation.x = -0.2 * W;
  B.bracoE1.rotation.z = -0.08; B.bracoD1.rotation.z = 0.08;
  if (moving) return;
  const crouch = y => { B.quadril.position.y = B.quadril.userData.rest.y - y; B.pernaE1.rotation.x = B.pernaD1.rotation.x = -y * 3; B.pernaE2.rotation.x = B.pernaD2.rotation.x = y * 5.5; B.peito.rotation.x = y * 1.2; };
  switch (action) {
    case 'martelar': crouch(0.12); B.bracoD1.rotation.x = -1.4 + Math.sin(t * 11) * 0.45; B.bracoD2.rotation.x = -0.4; B.bracoE1.rotation.x = -0.9; break;
    case 'soldar': crouch(0.1); B.bracoD1.rotation.x = -1.15 + Math.sin(t * 2) * 0.05; B.bracoE1.rotation.x = -1.0; B.cabeca.rotation.x = 0.3; break;
    case 'varrer': B.peito.rotation.x = 0.35; B.peito.rotation.y = Math.sin(t * 4) * 0.35; B.bracoD1.rotation.x = -0.8; B.bracoE1.rotation.x = -0.6; B.bracoD2.rotation.x = -0.3; break;
    case 'alimentar': crouch(0.25); B.bracoD1.rotation.x = -0.9 + Math.sin(t * 3) * 0.15; B.bracoE1.rotation.x = -0.9; break;
    case 'mirar': B.bracoD1.rotation.x = -1.5; B.bracoE1.rotation.x = -1.35; B.bracoE1.rotation.z = 0.4; B.cabeca.rotation.x = 0.05; break;
    case 'carregar': crouch(0.18 + Math.sin(t * 3) * 0.05); B.bracoD1.rotation.x = B.bracoE1.rotation.x = -1.1; break;
    case 'tratar': crouch(0.3); B.bracoD1.rotation.x = -1.0 + Math.sin(t * 2.5) * 0.2; B.bracoE1.rotation.x = -0.8; B.cabeca.rotation.x = 0.4; break;
    case 'descansar': B.peito.rotation.x = -0.05; B.bracoE1.rotation.z = -0.25; B.bracoD1.rotation.z = 0.25; break;
    default: B.cabeca.rotation.y = Math.sin(t * 0.5) * 0.4;
  }
}
