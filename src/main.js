import './ui/style.css';
import { APP_VERSION, AVAILABLE_PACKS } from './content/registry.js';
import { newGame, step, catchUp, advanceTo, hiringTick, SPEEDS, timeFactor, seedCrowd } from './sim/core.js';
import { tileToWorld, accessTile } from './sim/grid.js';
import { saveGame, loadGame, backup, exportFile, importFile, getPref, setPref, serialize, deserialize } from './save/save.js';
import { World } from './render/world.js';
import { Controls } from './ui/controls.js';
import { UI } from './ui/ui.js';
import * as B from './sim/build.js';
import { hire } from './sim/core.js';
import { dispatch, refreshAlerts, startTask, orderTransfer } from './sim/staff.js';
import { library } from './render/world.js';
import { startEscape } from './sim/animals.js';
import { content } from './content/registry.js';
import * as sound from './audio/sound.js';
import { distributeFurniture } from './sim/furn.js';

class Game {
  async start() {
    const app = document.getElementById('app');
    let s = null;
    try { s = await loadGame(); } catch (e) { console.warn(e); }
    let report = null;
    if (s) report = catchUp(s, Date.now()); else s = newGame(Date.now());
    this.state = s; this.live = false;
    this.world = new World(app, s.settings.quality);
    this.ui = new UI(app, this);
    this.controls = new Controls(app, this.world, () => this.state, this.ui);
    addEventListener('resize', () => this.world.resize());
    this.wireEvents();
    if (report) this.ui.showReport(report, '📰 Enquanto você esteve fora');
    else if (!(await getPref('welcomed', false))) { this.ui.welcome(); setPref('welcomed', true); }
    this.last = performance.now(); this.acc = 0; this.slow = 0;
    requestAnimationFrame(t => this.frame(t));
    setInterval(() => this.save(), 15000);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('pagehide', () => this.save());
    this.registerSW(); setTimeout(() => this.checkUpdate(false), 2500);
    document.getElementById('boot')?.remove();
  }
  wireEvents() {
    // eventos da simulação viram avisos na tela
    this.state._events = [];
  }
  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const s = this.state, now = Date.now();
    const factor = this.live ? 1 : SPEEDS[s.clock.speed] * timeFactor(s);
    if (factor > 0) {
      const ctx = { abstract: false, realDt: dt, moveMul: this.live ? 1 : Math.min(3, Math.max(1, factor / 24)), now };
      step(s, (dt * factor) / 60, ctx);
    }
    s.clock.lastRealTs = now;
    this.slow += dt;
    if (this.slow > 1) { this.slow = 0; hiringTick(s, now); this.ui.slowTick(); if (s.fin?.novo && !this.ui.modal) { s.fin.novo = null; this.ui.showMonth(s.fin.meses[s.fin.meses.length - 1]); } }
    for (const e of s._events.splice(0)) if (e.kind !== 'info') this.ui.toast(e.msg, e.kind);
    this.controls.update(dt);
    this.world.update(s, dt);
    this.ui.tick(dt);
    this.perf(dt);
    this.world.render();
    requestAnimationFrame(t2 => this.frame(t2));
  }
  // ---------- FPS e qualidade automática ----------
  perf(dt) {
    if (dt <= 0) return; const f = 1 / dt; this.fps = this.fps ? this.fps * 0.95 + f * 0.05 : f;
    const s = this.state; this.lowT = this.lowT || 0; this.pxs = this.pxs ?? 1;
    if (!s.settings.autoQualidade || document.hidden || this.ui.modal) { this.lowT = 0; return; }
    this.lowT = this.fps < 22 ? this.lowT + dt : Math.max(0, this.lowT - dt * 0.5);
    if (this.lowT < 6) return; this.lowT = 0; this.fps = 30;
    if (this.pxs > 0.75) { this.pxs = Math.max(0.6, this.pxs - 0.2); this.world.setPixelScale(this.pxs); this.ui.toast('Jogo lento: resolução reduzida um pouco.', 'ruim'); }
    else if (s.settings.quality === 'ultra') { this.pxs = 1; this.world.pxScale = 1; this.setQuality('alto'); this.ui.toast('Jogo lento: gráfico mudado de Ultra para Alto. Dá para voltar em Menu > Configurações.', 'ruim'); }
    else if (s.settings.quality === 'alto') { this.pxs = 1; this.world.pxScale = 1; this.setQuality('baixo'); this.ui.toast('Jogo lento: gráfico mudado para Baixo. Dá para voltar em Menu > Configurações.', 'ruim'); }
  }
  // ---------- desfazer (última construção, até 60 s) ----------
  snapshot(label) { try { this.undoInfo = { data: JSON.stringify(serialize(this.state)), at: Date.now(), label: label || 'construção' }; } catch (e) { this.undoInfo = null; } }
  undoLast() {
    const u = this.undoInfo; if (!u || Date.now() - u.at > 60000) { this.undoInfo = null; return; }
    const s = deserialize(u.data); s._events = []; s.clock.lastRealTs = Date.now(); s.clock.speed = this.state.clock.speed;
    s.settings = { ...this.state.settings }; seedCrowd(s); this.state = s; this.undoInfo = null;
    this.world.cache.hver = -1; this.ui.closeSheet(); this.ui.hideConfirm(); if (!this.ui.el.drawer.classList.contains('hidden')) this.ui.renderDrawer();
    sound.undo(); this.ui.toast(`Desfeito: ${u.label}.`, 'bom');
  }
  async save() { try { this.state.clock.lastRealTs = Date.now(); this.saveWhere = await saveGame(this.state); this.lastSave = Date.now(); } catch (e) { console.warn('save', e); } }
  onVisibility() {
    if (document.hidden) { this.save(); this.hiddenAt = Date.now(); return; }
    const rep = catchUp(this.state, Date.now()); this.last = performance.now();
    if (rep && rep.minutos > 10) this.ui.showReport(rep, '📰 Enquanto você esteve fora');
  }
  advance(hour) { const rep = advanceTo(this.state, hour, Date.now()); this.ui.showReport(rep, '⏩ Relógio avançado'); this.save(); }
  toggleLive() {
    const s = this.state;
    this.live = !this.live; this.ui.setLive(this.live);
    if (this.live) { const e = s.facilities.find(f => f.type === 'entrada'); const t = accessTile(s, e) || [e.tx, e.ty - 1]; const p = tileToWorld(t[0], t[1]); this.controls.enterLive(p.x, p.z); }
    else this.controls.exitLive();
  }
  setQuality(q) { this.state.settings.quality = q; this.world.setQuality(q, this.state); this.controls.world = this.world; this.world.resize(); }
  exportSave() { try { exportFile(this.state); this.ui.toast('Arquivo exportado. Se não baixou, use "Copiar save".', 'bom'); } catch (e) { this.ui.toast('Download bloqueado aqui. Use "Copiar save".', 'ruim'); } }
  async copySave() { try { await navigator.clipboard.writeText(JSON.stringify(serialize(this.state))); this.ui.toast('Save copiado! Cole num bloco de notas para guardar.', 'bom'); } catch (e) { this.ui.toast('Não foi possível copiar aqui.', 'ruim'); } }
  pasteSave(t) { try { this.replaceState(deserialize(t)); this.ui.toast('Save carregado!', 'bom'); } catch (e) { this.ui.toast('Save inválido: ' + e.message, 'ruim'); } }
  async importSave() { try { const s = await importFile(); this.replaceState(s); this.ui.toast('Save importado!', 'bom'); } catch (e) { this.ui.toast(e.message, 'ruim'); } }
  async newGame(opts = {}) { await backup(this.state, 'antes-novo-jogo'); const q = this.state.settings; const s = newGame(Date.now(), opts); Object.assign(s.settings, { quality: q.quality, autoQualidade: q.autoQualidade, mostrarFps: q.mostrarFps, som: q.som, volume: q.volume, ambiente: q.ambiente }); this.replaceState(s); this.undoInfo = null; this.ui.closeModal(); this.ui.tut.restart(); this.ui.welcome(); }
  replaceState(s) {
    sound.configure(s.settings);
    s._events = []; s.clock.lastRealTs = Date.now(); this.state = s;
    this.world.setQuality(s.settings.quality === this.world.q ? (s.settings.quality === 'baixo' ? 'alto' : 'baixo') : s.settings.quality);
    this.world.setQuality(s.settings.quality, s); this.controls.world = this.world; this.world.resize(); this.save();
  }
  installPack(id) { if (!AVAILABLE_PACKS[id]) return this.ui.toast('Esta expansão ainda não foi publicada.', 'ruim'); this.state.packs[id] = AVAILABLE_PACKS[id].versao; this.ui.toast('Expansão instalada!', 'bom'); }
  uninstallPack(id) { if (id === 'base') return; this.ui.closeModal(); this.ui.askConfirm('Desinstalar? Os itens dela ficam guardados e desativados.', () => { delete this.state.packs[id]; this.ui.toast('Expansão desinstalada.', 'bom'); }); }

  // ---------- PWA e atualização ----------
  registerSW() {
    try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').then(r => { this.swReg = r; }).catch(() => {}); } catch (e) {}
  }
  async checkUpdate(manual) {
    this.updateInfo = { ...(this.updateInfo || {}), checking: true };
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('http');
      const v = await r.json(); const newer = cmp(v.versao, APP_VERSION) > 0;
      this.updateInfo = { checked: true, available: newer, latest: v.versao, notes: v.novidades || [] };
      if (newer && !manual) this.ui.toast(`Atualização ${v.versao} disponível! Veja em Menu > Novidades.`, 'bom');
    } catch (e) { this.updateInfo = { checked: true, error: true }; }
  }
  async applyUpdate() {
    await backup(this.state, 'antes-' + (this.updateInfo?.latest || 'atualizar')); await this.save();
    try { if (this.swReg) { await this.swReg.update(); this.swReg.waiting?.postMessage('skipWaiting'); } } catch (e) {}
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
    location.reload();
  }
}
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

const game = new Game(); window.__game = game; window.__api = { ...B, distributeFurniture, hire, dispatch, refreshAlerts, startTask, library, orderTransfer, fuga: (s, a) => { const h = s.habitats.find(x => x.id === a.hab), C = content(s); startEscape(s, a, h, C.species[a.sp], C.fences[h.fence]); } };
game.start().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Erro ao iniciar: ' + e.message; });
