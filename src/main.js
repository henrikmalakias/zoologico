import './ui/style.css';
import { APP_VERSION, AVAILABLE_PACKS } from './content/registry.js';
import { newGame, step, catchUp, advanceTo, hiringTick, SPEEDS, timeFactor, seedCrowd } from './sim/core.js';
import { tileToWorld, accessTile } from './sim/grid.js';
import { saveGame, loadGame, backup, exportFile, importFile, getPref, setPref, serialize, deserialize, contentHash } from './save/save.js';
import { World } from './render/world.js';
import { Controls } from './ui/controls.js';
import { UI } from './ui/ui.js';
import * as B from './sim/build.js';
import { hire } from './sim/core.js';
import { dispatch, refreshAlerts, startTask, orderTransfer, ALERT_INFO, alertTargetName } from './sim/staff.js';
import { library } from './render/world.js';
import { startEscape, habById } from './sim/animals.js';
import * as V from './sim/visita.js';
import { content } from './content/registry.js';
import * as sound from './audio/sound.js';
import { distributeFurniture } from './sim/furn.js';
import { DriveSync, LOCAIS } from './save/drive.js';

class Game {
  async start() {
    const app = document.getElementById('app');
    let s = null;
    try { s = await loadGame(); } catch (e) { console.warn(e); }
    const hashCarregado = s?._hashCarregado ?? null; let report = null;
    if (s) report = catchUp(s, Date.now()); else s = newGame(Date.now());
    this.state = s; this.live = false;
    this.world = new World(app, s.settings.quality); this.world.setEco(s.settings.economia !== false);
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
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, () => { this.lastInput = performance.now(); }, { passive: true, capture: true });
    this.wakeSync(); addEventListener('pointerdown', () => { if (!this.wake) this.wakeSync(); }, { passive: true });
    addEventListener('pagehide', () => this.save());
    this.registerSW(); setTimeout(() => this.checkUpdate(false), 2500); setInterval(() => { if (!document.hidden) this.checkUpdate(false); }, 20 * 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (this.lastUpdCheck || 0) > 10 * 60e3) this.checkUpdate(false); });
    document.getElementById('boot')?.remove();
    this.drive = await new DriveSync(this).init(); this.drive.abrir(hashCarregado);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.drive.aoSair(); else if (this.drive.ativo) this.drive.sync('volta'); });
    addEventListener('pagehide', () => this.drive.aoSair());
  }
  wireEvents() {
    // eventos da simulação viram avisos na tela
    this.state._events = [];
  }
  applyEco() { this.world.setEco(this.state.settings.economia !== false); }
  frame(t) {
    if (this.state.settings.economia !== false && t - this.last < 30) { requestAnimationFrame(t2 => this.frame(t2)); return; } // 30 FPS: metade do trabalho da GPU, bem menos calor
    const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const s = this.state, now = Date.now();
    const factor = this.live ? 1 : SPEEDS[s.clock.speed] * timeFactor(s);
    if (factor > 0) {
      const L = this.controls.live, ctx = { abstract: false, realDt: dt, moveMul: this.live ? 1 : Math.min(3, Math.max(1, factor / 24)), now, player: this.live && L.hab ? { x: L.x, z: L.z, hab: L.hab } : null };
      step(s, (dt * factor) / 60, ctx);
      if (ctx.ameaca || ctx.investida) this.avisoSelvagem(ctx.investida || ctx.ameaca, !!ctx.investida);
      if (ctx.ataque) this.ataque(ctx.ataque);
    }
    // alerta novo com o jogo aberto: pausa para o jogador ler (não no AO VIVO)
    const ids = new Set(s.alerts.map(a => a.id)), fresh = this._alertIds ? s.alerts.filter(a => !this._alertIds.has(a.id)) : [];
    this._alertIds = ids;
    if (fresh.length && factor > 0 && !this.live && !document.hidden && s.settings.pausaAlerta) {
      s.clock.speed = 0;
      this.ui.toast(`⏸ Jogo pausado: ${ALERT_INFO[fresh[0].type].nome} — ${alertTargetName(s, fresh[0])}. Toque no alerta no mapa para agir.`, 'perigo');
    }
    s.clock.lastRealTs = now;
    this.slow += dt;
    if (this.slow > 1) { this.slow = 0; hiringTick(s, now); this.ui.slowTick(); if (s.fin?.novo && !this.ui.modal) { s.fin.novo = null; this.ui.showMonth(s.fin.meses[s.fin.meses.length - 1]); } }
    for (const e of s._events.splice(0)) if (e.kind !== 'info') this.ui.toast(e.msg, e.kind);
    this.controls.update(dt);
    this.world.update(s, dt);
    this.ui.tick(dt);
    this.perf(dt);
    // parado (pausado, sem mexer na câmera nem tocar na tela): redesenha só 1 vez por segundo, o celular descansa e esfria
    const c = this.controls.cam, sig = `${c.x.toFixed(2)},${c.z.toFixed(2)},${c.dist.toFixed(2)},${c.yaw.toFixed(3)},${c.pitch.toFixed(3)}`, now2 = performance.now();
    const busy = factor > 0 || this.live || now2 - (this.lastInput || 0) < 1500 || sig !== this.camSig || this.world.dirty;
    this.camSig = sig;
    if (busy || now2 - (this.lastRender || 0) > 1000) { this.world.render(); this.lastRender = now2; this.world.dirty = false; this.idle = false; } else this.idle = true;
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
    s.settings = { ...this.state.settings }; seedCrowd(s); this.state = s; this._alertIds = null; this.undoInfo = null;
    this.world.cache.hver = -1; this.controls.live.hab = 0; this.ui.closeSheet(); this.ui.hideConfirm(); if (!this.ui.el.drawer.classList.contains('hidden')) this.ui.renderDrawer();
    sound.undo(); this.ui.toast(`Desfeito: ${u.label}.`, 'bom');
  }
  async save() { try { if (!document.hidden) this.state.clock.lastRealTs = Date.now(); // escondido: mantém a hora em que saiu (o tempo fora é simulado ao voltar)
 this.saveWhere = await saveGame(this.state); this.lastSave = Date.now(); } catch (e) { console.warn('save', e); } }
  // mantém a tela acesa enquanto o jogo está aberto (Screen Wake Lock); some sozinho ao sair do app
  async wakeSync() {
    try {
      const want = this.state.settings.telaLigada !== false && !document.hidden;
      if (!want) { if (this.wake) { const w = this.wake; this.wake = null; await w.release(); } return; }
      if (this.wake || !navigator.wakeLock) return;
      const w = await navigator.wakeLock.request('screen'); this.wake = w;
      w.addEventListener('release', () => { if (this.wake === w) this.wake = null; });
    } catch (e) { this.wake = null; }
  }
  onVisibility() {
    if (document.hidden) { if (this.habVisita()) this.sairVisita(); this.state.clock.lastRealTs = Date.now(); this.save(); this.hiddenAt = Date.now(); this.wake = null; return; }
    this.wakeSync();
    if (this.drive?.ativo) this.drive.antesDeSimular(contentHash(JSON.stringify(serialize(this.state))));
    const rep = catchUp(this.state, Date.now()); this.last = performance.now();
    if (rep && rep.minutos > 10) this.ui.showReport(rep, '📰 Enquanto você esteve fora');
  }
  // ---------- Google Drive ----------
  currentSave() { if (!document.hidden) this.state.clock.lastRealTs = Date.now(); return serialize(this.state); }
  backup(label) { return backup(this.state, label); }
  syncDrive() { return this.drive.sync('manual', true); }
  // aplica o save vindo do Drive: mantém os ajustes do aparelho e simula o tempo que passou
  async aplicaRemoto(texto, motivo) {
    const r = deserialize(texto), loc = this.state.settings;
    for (const k of LOCAIS) if (loc[k] !== undefined) r.settings[k] = loc[k];
    const rep = catchUp(r, Date.now()); this.replaceState(r); this.ui.closeSheet?.();
    this.ui.toast(motivo === 'abrir' ? '☁ Zoológico mais recente baixado do Drive.' : '☁ Zoológico do Drive carregado.', 'bom');
    if (rep && rep.minutos > 10) this.ui.showReport(rep, '📰 Enquanto você esteve fora');
  }
  advance(hour) { const rep = advanceTo(this.state, hour, Date.now()); this.ui.showReport(rep, '⏩ Relógio avançado'); this.save(); }
  // ---------- visita aos recintos (AO VIVO) e modo selvagem ----------
  habVisita() { return this.live && this.controls.live.hab ? habById(this.state, this.controls.live.hab) : null; }
  // recinto cujo portão está ao alcance do jogador (do lado de fora)
  portaoPerto() {
    if (!this.live || this.controls.live.hab) return null; const L = this.controls.live, s = this.state;
    for (const h of s.habitats) { const p = V.pontoFora(s, h); if (Math.hypot(p.x - L.x, p.z - L.z) < 1.4) return h; }
    return null;
  }
  entrarVisita(h) {
    const s = this.state, r = V.abrirVisita(s, h); if (!r.ok) { this.ui.toast(r.msg, 'ruim'); return false; }
    this.controls.irPara(V.pontoDentro(h), h.id); sound.click();
    this.ui.toast(r.msg + (r.soltos && s.settings.selvagem !== false ? ` ⚠ ${r.soltos} animal(is) perigoso(s) solto(s): mantenha distância.` : ''), r.soltos ? 'perigo' : 'bom');
    return true;
  }
  sairVisita() {
    const h = this.habVisita(); if (!h) return; const s = this.state;
    V.fecharVisita(s, h); this.controls.irPara(V.pontoFora(s, h), 0); this.ui.toast(`Você saiu do ${h.name}. Portão fechado.`, 'bom');
  }
  // pelo painel do habitat: liga o AO VIVO já dentro do recinto
  visitar(h) {
    const c = V.podeVisitar(this.state, h); if (!c.ok) return this.ui.toast(c.msg, 'ruim');
    if (!this.live) this.toggleLive();
    this.controls.irPara(V.pontoFora(this.state, h), 0, V.pontoDentro(h)); this.entrarVisita(h);
  }
  avisoSelvagem(id, carga) {
    const s = this.state, a = s.animals.find(x => x.id === id); if (!a) return; const S = content(s).species[a.sp], L = this.controls.live;
    sound.animal(a.sp, 0, Math.max(2, Math.hypot(a.x - L.x, a.z - L.z)), S); try { navigator.vibrate?.(carga ? [120, 60, 200] : 120); } catch (e) {}
    if (carga) sound.alarm();
  }
  ataque({ id, manso }) {
    const s = this.state, a = s.animals.find(x => x.id === id); if (!a) return;
    const r = V.ataqueVisita(s, a, manso); if (!r) return;
    const pf = V.pontoFora(s, r.hab), pd = V.pontoDentro(r.hab); this.controls.irPara(pf, 0, { x: 2 * pf.x - pd.x, z: 2 * pf.z - pd.z }); this.controls.live.shake = manso ? 0.4 : 1; // sai de costas para o recinto
    this.ui.flash(manso ? 0.25 : 0.6); if (!manso) sound.bad(); try { navigator.vibrate?.(manso ? 150 : [250, 80, 250]); } catch (e) {}
    this.ui.toast(r.msg, manso ? 'ruim' : 'perigo'); this.save();
  }
  toggleLive() {
    const s = this.state;
    if (this.live && this.controls.live.hab) this.sairVisita(); // sair do AO VIVO de dentro de um recinto: primeiro volta para fora e fecha o portão
    this.live = !this.live; this.ui.setLive(this.live);
    if (this.live) { const e = s.facilities.find(f => f.type === 'entrada'); const t = accessTile(s, e) || [e.tx, e.ty - 1]; const p = tileToWorld(t[0], t[1]); this.controls.enterLive(p.x, p.z); }
    else this.controls.exitLive();
  }
  setQuality(q) { this.state.settings.quality = q; this.world.setQuality(q, this.state); this.controls.world = this.world; this.world.resize(); }
  exportSave() { try { exportFile(this.state); this.ui.toast('Arquivo exportado. Se não baixou, use "Copiar save".', 'bom'); } catch (e) { this.ui.toast('Download bloqueado aqui. Use "Copiar save".', 'ruim'); } }
  async copySave() { try { await navigator.clipboard.writeText(JSON.stringify(serialize(this.state))); this.ui.toast('Save copiado! Cole num bloco de notas para guardar.', 'bom'); } catch (e) { this.ui.toast('Não foi possível copiar aqui.', 'ruim'); } }
  pasteSave(t) { try { this.replaceState(deserialize(t)); this.ui.toast('Save carregado!', 'bom'); } catch (e) { this.ui.toast('Save inválido: ' + e.message, 'ruim'); } }
  async importSave() { try { const s = await importFile(); this.replaceState(s); this.ui.toast('Save importado!', 'bom'); } catch (e) { this.ui.toast(e.message, 'ruim'); } }
  async newGame(opts = {}) { await backup(this.state, 'antes-novo-jogo'); const q = this.state.settings; const s = newGame(Date.now(), opts); Object.assign(s.settings, { quality: q.quality, autoQualidade: q.autoQualidade, mostrarFps: q.mostrarFps, telaLigada: q.telaLigada, economia: q.economia, subSoFechado: q.subSoFechado, pausaAlerta: q.pausaAlerta, som: q.som, volume: q.volume, ambiente: q.ambiente }); this.replaceState(s); this.undoInfo = null; this.ui.closeModal(); this.ui.tut.restart(); this.ui.welcome(); }
  replaceState(s) {
    sound.configure(s.settings);
    s._events = []; s.clock.lastRealTs = Date.now(); this.state = s; this._alertIds = null; if (this.controls) this.controls.live.hab = 0;
    this.world.setQuality(s.settings.quality === this.world.q ? (s.settings.quality === 'baixo' ? 'alto' : 'baixo') : s.settings.quality);
    this.world.setQuality(s.settings.quality, s); this.world.setEco(s.settings.economia !== false); this.controls.world = this.world; this.world.resize(); this.save();
  }
  installPack(id) { if (!AVAILABLE_PACKS[id]) return this.ui.toast('Esta expansão ainda não foi publicada.', 'ruim'); this.state.packs[id] = AVAILABLE_PACKS[id].versao; this.ui.toast('Expansão instalada!', 'bom'); }
  uninstallPack(id) { if (id === 'base') return; this.ui.closeModal(); this.ui.askConfirm('Desinstalar? Os itens dela ficam guardados e desativados.', () => { delete this.state.packs[id]; this.ui.toast('Expansão desinstalada.', 'bom'); }); }

  // ---------- PWA e atualização ----------
  registerSW() {
    try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').then(r => { this.swReg = r; }).catch(() => {}); } catch (e) {}
  }
  async checkUpdate(manual) {
    this.updateInfo = { ...(this.updateInfo || {}), checking: true }; this.lastUpdCheck = Date.now();
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('http');
      const v = await r.json(); const newer = cmp(v.versao, APP_VERSION) > 0;
      this.updateInfo = { checked: true, available: newer, latest: v.versao, notes: v.novidades || [] };
      if (newer) this.ui.showUpdateBar(v);
    } catch (e) { this.updateInfo = { checked: true, error: true }; }
  }
  async applyUpdate() {
    await backup(this.state, 'antes-' + (this.updateInfo?.latest || 'atualizar')); await this.save();
    try { if (this.swReg) { await this.swReg.update(); this.swReg.waiting?.postMessage('skipWaiting'); } } catch (e) {}
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
    location.reload();
  }
}
const vnum = v => String(v).split('.').map(p => { const m = /^(\d+)([a-z]?)$/.exec(p); return m ? +m[1] + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : 0; }); // 1.7.2b > 1.7.2a > 1.7.2
const cmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

const game = new Game(); window.__game = game; window.__sound = sound; window.__api = { ...B, V, distributeFurniture, hire, dispatch, refreshAlerts, startTask, library, orderTransfer, fuga: (s, a) => { const h = s.habitats.find(x => x.id === a.hab), C = content(s); startEscape(s, a, h, C.species[a.sp], C.fences[h.fence]); } };
game.start().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Erro ao iniciar: ' + e.message; });
