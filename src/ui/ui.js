import { content, APP_VERSION, DLC_CATALOG, CHANGELOG } from '../content/registry.js';
import { TRACOS_EQUIPE, TRACOS_GERENTE, ZOOPEDIA } from '../content/base.js';
import * as sound from '../audio/sound.js';
import { Tutorial } from './tutorial.js';
import { money, fmtClock, clamp, hourOf } from '../sim/util.js';
import { worldToTile, tileToWorld, idx, inMap, AREAS, TILE } from '../sim/grid.js';
import { stars, hire, fireById, expandArea, METAS, VAGAS, SPEEDS, H2, MES, fixedDaily } from '../sim/core.js';
import { checkHabitat, placeHabitat, paintTerrain, placePlant, checkFacility, placeFacility, buyAnimal, sellAnimal, demolish, setTicket, setSalary, renameHabitat, habitatCost, sculpt, SCULPT_COST } from '../sim/build.js';
import { heightAt } from '../sim/grid.js';
import { distributeFurniture, levelSpacing } from '../sim/furn.js';
import { suitability, habById, habInfo } from '../sim/animals.js';
import { ALERT_INFO, alertPos, alertTargetName, eligibleStaff, dispatch, taskName, orderTransfer, TRANSFER_ROLES, orderTask, ORDER_ROLES } from '../sim/staff.js';
import { arrivalRate } from '../sim/visitors.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  const wrap = attrs && attrs.class === 'kv';
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : wrap ? Object.assign(document.createElement('span'), { textContent: String(c) }) : document.createTextNode(String(c)));
  return e;
};
const pct = v => Math.round(v * 100) + '%';
const meter = (v, invert) => { const x = invert ? 1 - v : v; return h('div', { class: 'meter' + (x < 0.3 ? ' bad' : x < 0.55 ? ' warn' : '') }, h('i', { style: `width:${clamp(v) * 100}%` })); };
const starStr = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const ICON = { doenca: '🩺', fome: '🍖', cerca: '🚧', brecha: '🧱', portao: '🚪', fuga: '🏃' };
const ST_NOME = { idle: 'Parado', walk: 'Andando', eat_go: 'Indo comer', eat: 'Comendo', drink_go: 'Indo beber', drink: 'Bebendo', sleep: 'Dormindo', roam: 'Solto pelo parque', sedado: 'Sedado', bath_go: 'Indo se banhar', bath: 'Tomando banho', fugindo: 'Fugindo!', empurrar: 'Forçando a cerca!', pulando: 'Pulando a cerca!' };
const TOOL_NOME = { caminho: 'caminho', terreno: 'terreno', planta: 'plantas', relevo: 'relevo' };
const STATUS_COR = { 'Pouco preocupante': '#2e8b57', 'Quase ameaçada': '#7cb342', 'Quase ameaçado': '#7cb342', 'Vulnerável': '#f2c230', 'Em perigo': '#f29c30', 'Criticamente em perigo': '#e53935' };
const ATTR_NOME = { habilidade: 'Habilidade', rapidez: 'Rapidez', dedicacao: 'Dedicação', decisao: 'Decisão', economia: 'Economia' };

export class UI {
  constructor(root, game) {
    this.root = root; this.g = game; this.tool = null; this.cat = 'habitat'; this.opts = { biome: 'savana', fence: 'ferro', terrain: 'g', plant: 'acacia', fac: 'lanchonete', sp: 'zebra', pathType: 'k', furn: { poste: 5, lixeira: 5, banco: 5 } };
    this.sel = null; this.modal = null; this.alertEls = new Map(); this.sound = sound;
    this.buildHud();
    this.tut = new Tutorial(this);
    sound.configure(game.state.settings);
    // som: destrava o áudio no primeiro toque e faz "clique" nos botões
    root.addEventListener('pointerdown', () => sound.unlock(), true);
    root.addEventListener('click', e => { if (e.target.closest?.('button') && !e.target.closest('.campad')) sound.click(); }, true);
    this.logSeen = game.state.log.length; this.voiceT = 3;
  }
  gesture(k) { this.tut?.gesto(k); }
  get s() { return this.g.state; }

  // ---------- HUD ----------
  buildHud() {
    const R = this.root;
    this.el = {};
    this.el.money = h('div', { class: 'chip money' }); this.el.clock = h('div', { class: 'chip' }); this.el.stars = h('div', { class: 'chip stars' }); this.el.vis = h('div', { class: 'chip' }); this.el.fps = h('div', { class: 'chip fps hidden' });
    this.speedBtns = [0, 1, 2, 3].map(i => h('button', { title: ['Pausar', 'Normal', '2x', '3x'][i], onclick: () => { this.s.clock.speed = i; } }, ['⏸', '▶', '▶▶', '▶▶▶'][i]));
    this.el.adv = h('button', { title: 'Avançar relógio', onclick: () => this.advanceMenu() }, '⏩');
    this.el.live = h('button', { class: 'live', title: 'AO VIVO', onclick: () => this.g.toggleLive() }, '👁 AO VIVO');
    R.append(h('div', { class: 'hud' }, h('div', { class: 'chips' }, this.el.money, this.el.clock, this.el.stars, this.el.vis, this.el.fps), h('div', { class: 'speed' }, ...this.speedBtns, this.el.adv, this.el.live)));
    const btn = (icon, label, fn) => { const b = h('button', { onclick: fn }, h('b', {}, icon), label); return b; };
    this.el.bBuild = btn('🏗', 'Construir', () => this.toggleBuild());
    this.el.bGer = btn('📋', 'Gerência', () => this.openModal('gerencia'));
    this.el.bEq = btn('👥', 'Equipe', () => this.openModal('equipe'));
    this.el.bMetas = btn('🎯', 'Metas', () => this.openModal('metas'));
    this.el.bMenu = btn('⚙', 'Menu', () => this.openModal('menu'));
    this.el.bar = h('div', { class: 'bar' }, this.el.bBuild, this.el.bGer, this.el.bEq, this.el.bMetas, this.el.bMenu);
    this.el.drawer = h('div', { class: 'drawer hidden' });
    this.el.sheet = h('div', { class: 'sheet hidden' });
    this.el.confirm = h('div', { class: 'confirm hidden' });
    this.el.toasts = h('div', { class: 'toasts' });
    this.el.alerts = h('div', {});
    this.el.joy = h('div', { class: 'joy hidden' }, h('i')); this.el.cross = h('div', { class: 'cross hidden' });
    // botões da câmera (segurar = repetir) e bússola
    const hb = (txt, kind, title, step) => { const b = h('button', { title }, txt);
      const stop = () => { this.g.controls.setHold(null); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); const c = this.g.controls; step(c); c.setHold(kind); this.tut?.gesto('botao'); sound.click(); });
      b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('lostpointercapture', stop); return b; };
    this.el.needle = h('i');
    this.el.camPad = h('div', { class: 'campad' },
      h('button', { class: 'compass', title: 'Bússola: toque para voltar ao norte', onclick: () => { this.g.controls.resetView(); this.tut?.gesto('botao'); } }, h('b', {}, 'N'), this.el.needle),
      hb('⟲', 'esq', 'Girar para a esquerda', c => { c.cam.yaw += 0.06; }), hb('⟳', 'dir', 'Girar para a direita', c => { c.cam.yaw -= 0.06; }),
      hb('▲', 'cima', 'Inclinar para cima (visão de cima)', c => c.tilt(0.04)), hb('▼', 'baixo', 'Inclinar para baixo (visão de lado)', c => c.tilt(-0.04)),
      hb('＋', 'mais', 'Aproximar', c => c.zoom(0.94)), hb('－', 'menos', 'Afastar', c => c.zoom(1.06)));
    this.el.undo = h('button', { class: 'undo hidden', onclick: () => this.g.undoLast() }, '↶ Desfazer');
    this.el.liveBar = h('div', { class: 'livebar hidden' }, h('button', { class: 'btn red', onclick: () => this.g.toggleLive() }, 'Sair do AO VIVO'));
    R.append(this.el.alerts, this.el.camPad, this.el.undo, this.el.bar, this.el.drawer, this.el.sheet, this.el.confirm, this.el.toasts, this.el.joy, this.el.cross, this.el.liveBar);
    this.setupJoystick();
  }
  setupJoystick() {
    const j = this.el.joy, knob = j.firstChild; let id = null;
    const set = (e) => { const r = j.getBoundingClientRect(); let x = (e.clientX - r.left - 65) / 50, y = (e.clientY - r.top - 65) / 50; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } this.g.controls.live.jx = x; this.g.controls.live.jy = y; knob.style.transform = `translate(${x * 40}px,${y * 40}px)`; };
    j.addEventListener('pointerdown', e => { id = e.pointerId; j.setPointerCapture(id); set(e); e.stopPropagation(); });
    j.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; this.g.controls.live.jx = this.g.controls.live.jy = 0; knob.style.transform = ''; };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  }
  setLive(on) {
    if (on) { this.toggleBuild(false); this.closeSheet(); this.hideConfirm(); this.closeModal(); }
    this.el.bar.classList.toggle('hidden', on); this.el.camPad.classList.toggle('hidden', on); if (on) this.el.undo.classList.add('hidden');
    this.el.joy.classList.toggle('hidden', !on); this.el.cross.classList.toggle('hidden', !on); this.el.liveBar.classList.toggle('hidden', !on);
    this.el.live.textContent = on ? '🗺 Gerente' : '👁 AO VIVO';
  }
  updateHud() {
    const s = this.s;
    this.el.money.textContent = '💰 ' + money(s.money); this.el.money.classList.toggle('neg', s.money < 0);
    this.el.clock.textContent = '🕒 ' + fmtClock(s.clock.min) + (this.g.live ? ' · 1:1' : '') + ` · mês ${Math.floor(s.clock.day / MES) + 1}`;
    const st = stars(s); this.el.stars.textContent = '★ ' + st.toFixed(1);
    this.el.vis.textContent = '👥 ' + s.stats.visitorsIn;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', !this.g.live && s.clock.speed === i));
    const nc = s.candidates.length; this.badge(this.el.bEq, nc);
    this.badge(this.el.bMenu, this.g.updateInfo?.available ? '!' : 0);
    this.badge(this.el.bMetas, 0);
    if (this.g.controls) this.el.needle.style.transform = `rotate(${this.g.controls.cam.yaw}rad)`;
    // botões da câmera logo abaixo dos botões de velocidade (que quebram em várias linhas no celular)
    const sb = this.el.adv.parentElement.getBoundingClientRect().bottom, top = Math.round(sb + 8) + 'px';
    if (this.el.camPad.style.top !== top) { this.el.camPad.style.top = top; this.el.undo.style.top = top; }
    this.el.fps.classList.toggle('hidden', !s.settings.mostrarFps);
    if (s.settings.mostrarFps) this.el.fps.textContent = `${Math.round(this.g.fps || 0)} FPS`;
    const u = this.g.undoInfo, ok = u && Date.now() - u.at < 60000 && !this.g.live;
    this.el.undo.classList.toggle('hidden', !ok);
    if (ok) { const t = `↶ Desfazer: ${u.label} (${Math.ceil((60000 - (Date.now() - u.at)) / 1000)} s)`; if (this.el.undo.textContent !== t) this.el.undo.textContent = t; }
  }
  badge(b, n) { let x = b.querySelector('.badge'); if (!n) { x?.remove(); return; } if (!x) { x = h('span', { class: 'badge' }); b.append(x); } x.textContent = n; }

  // ---------- alertas no mapa ----------
  updateAlerts() {
    const s = this.s, W = this.g.world, seen = new Set();
    for (const a of s.alerts) {
      seen.add(a.id); const p = alertPos(s, a); if (!p) continue;
      let el = this.alertEls.get(a.id);
      if (!el) { el = h('button', { class: 'alert', onclick: () => this.openAlert(a.id) }); this.el.alerts.append(el); this.alertEls.set(a.id, el); }
      const as = !!a.assigned; el.className = 'alert' + (as ? ' as' : '');
      const html = ICON[a.type] + (as ? ' <small>a caminho</small>' : ''); if (el._h !== html) { el.innerHTML = html; el._h = html; }
      const sp = W.project(p.x, a.type === 'fuga' || a.type === 'doenca' ? 3.2 : 4.2, p.z);
      el.style.display = sp.vis ? '' : 'none'; el.style.left = sp.x + 'px'; el.style.top = sp.y + 'px';
    }
    for (const [id, el] of this.alertEls) if (!seen.has(id)) { el.remove(); this.alertEls.delete(id); }
  }
  openAlert(id) {
    const s = this.s, a = s.alerts.find(a => a.id === id); if (!a) return;
    const I = ALERT_INFO[a.type], el = eligibleStaff(s, a);
    const roles = { doenca: 'veterinário', fome: 'tratador', cerca: 'segurança', brecha: 'segurança', portao: 'segurança ou tratador', fuga: 'segurança ou veterinário' }[a.type];
    const assigned = s.staff.find(x => x.id === a.assigned);
    this.showModal(() => h('div', {},
      h('h3', {}, ICON[a.type] + ' ' + I.nome), h('div', { class: 'muted' }, alertTargetName(s, a) + ' · há ' + Math.max(0, Math.round((s.clock.min - a.created) / 60)) + ' h de jogo'),
      h('p', {}, I.desc),
      assigned ? h('div', { class: 'card' }, `A caminho: ${assigned.name} (enviado por ${a.by || 'você'}).`) : null,
      h('h3', { style: 'margin-top:8px' }, 'Quem enviar?'),
      el.length ? el.map(({ st, d, busyAlert }) => h('div', { class: 'card' }, h('div', { class: 'top' },
        h('div', {}, h('b', {}, st.name), ' · ' + content(s).roles[st.role].nome, h('div', { class: 'muted' }, `${Math.round(d)} m · energia ${pct(st.energy)} · ${taskName(st.task)}${busyAlert ? ' (em outra emergência)' : ''}`)),
        h('button', { class: 'btn sm', onclick: () => { dispatch(s, a.id, st.id); this.closeModal(); this.toast(`${st.name} foi enviado(a).`, 'bom'); } }, a.assigned === st.id ? 'Enviado' : 'Enviar'))))
        : h('div', { class: 'card' }, `Nenhum funcionário adequado. Contrate um ${roles} em Equipe > Currículos.`),
      s.managers.length ? h('div', { class: 'muted' }, `Seu subgerente ${s.managers[0].name} despacha sozinho se você não agir.`) : h('div', { class: 'muted' }, 'Sem subgerente, ninguém atende este alerta até você enviar alguém.'),
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn sec', onclick: () => { const p = alertPos(s, a); if (p) this.g.controls.centerOn(p.x, p.z, 40); this.closeModal(); } }, '📍 Ir até lá'))));
  }

  // ---------- construção ----------
  toggleBuild(force) {
    const on = force ?? this.el.drawer.classList.contains('hidden');
    this.el.drawer.classList.toggle('hidden', !on); this.el.bBuild.classList.toggle('on', on);
    this.g.world.setGrid(on);
    if (on) { this.closeSheet(); this.tool = this.cat; this.renderDrawer(); } else { this.tool = null; this.hideConfirm(); this.g.world.hidePreview(); }
  }
  renderDrawer() {
    const s = this.s, C = content(s), o = this.opts;
    const cats = [['habitat', '🦁 Habitat'], ['caminho', '🛤 Caminho'], ['relevo', '🏔 Relevo'], ['terreno', '🎨 Terreno'], ['planta', '🌳 Plantas'], ['inst', '🏪 Instalações'], ['animal', '🐾 Animais'], ['demolir', '🧨 Demolir']];
    const item = (on, title, sub, fn) => h('button', { class: 'item' + (on ? ' on' : ''), onclick: fn }, title, sub ? h('small', {}, sub) : null);
    const set = (k, v) => () => { o[k] = v; this.renderDrawer(); };
    let body = [], hint = '';
    if (this.cat === 'habitat') {
      body = [h('div', { class: 'items' }, ...Object.entries(C.biomes).map(([k, b]) => item(o.biome === k, b.nome, 'Bioma', set('biome', k))),
        ...Object.entries(C.fences).map(([k, f]) => item(o.fence === k, f.nome, `R$ ${f.custo}/bloco · alt ${f.altura} m · res ${f.resistencia}`, set('fence', k))))];
      hint = o.fence === 'fosso' ? 'Ilha pronta: arraste para desenhar (mín. 8 x 8). Um fosso de água funda de 2 blocos vira a barreira, com ponte e portão. Ótima para macacos e leões; elefantes nadam, então ainda podem fugir.' : o.fence === 'tela' ? 'Viveiro: cerca com rede por cima. Ideal para macacos, que escalam. Fraco contra animais fortes.' : 'Arraste no mapa para desenhar o habitat (mín. 4 x 4). Use dois dedos para mover a câmera.';
    } else if (this.cat === 'caminho') {
      const PRE = { p: { poste: 3, lixeira: 3, banco: 3 }, q: { poste: 0, lixeira: 0, banco: 0 }, c: { poste: 5, lixeira: 5, banco: 5 }, k: { poste: 5, lixeira: 5, banco: 5 } };
      const types = Object.entries(C.terrains).filter(([, t]) => t.caminho);
      const sl = (type, icon) => {
        const F = C.furniture[type], lab = h('span', { class: 'sl-val' });
        const upd = () => { const v = o.furn[type]; lab.textContent = v ? `a cada ~${Math.round(levelSpacing(C, type, v))} m · R$ ${F.custo}` : 'nenhum'; };
        const inp = h('input', { type: 'range', min: 0, max: 10, step: 1, value: o.furn[type], oninput: e => { o.furn[type] = +e.target.value; upd(); } }); upd();
        return h('div', { class: 'slrow' }, h('span', { class: 'sl-n' }, `${icon} ${F.nome}`), inp, lab);
      };
      body = [h('div', { class: 'items' }, ...types.map(([k, t]) => item(o.pathType === k, t.nome, `R$ ${t.custo}/bloco`, () => { o.pathType = k; o.furn = { ...PRE[k] }; this.renderDrawer(); }))),
        h('div', { class: 'slbox' }, sl('poste', '💡'), sl('lixeira', '🗑'), sl('banco', '🪑'))];
      hint = 'Arraste para pintar o caminho. Postes, lixeiras e bancos são espalhados sozinhos ao longo do trecho novo, nas bordas ou na calçada. Arraste de novo sobre um caminho existente para acrescentar mobiliário. Lanchonetes e mesas ganham uma lixeira de brinde.';
    }
    else if (this.cat === 'relevo') { body = [h('div', { class: 'items' }, ...[['subir', '⬆ Subir'], ['baixar', '⬇ Baixar'], ['suavizar', '〰 Suavizar'], ['nivelar', '▬ Nivelar']].map(([k, n]) => item((o.relevo || 'subir') === k, n, `R$ ${SCULPT_COST} por pincelada`, set('relevo', k))))]; hint = 'Arraste para moldar colinas e vales. Baixar dentro da água deixa o lago mais fundo (elefantes gostam de água funda para o banho). Nivelar usa a altura de onde você começou. Caminhos só aceitam rampas suaves.'; }
    else if (this.cat === 'terreno') { body = [h('div', { class: 'items' }, ...Object.entries(C.terrains).filter(([, t]) => !t.caminho).map(([k, t]) => item(o.terrain === k, t.nome, `R$ ${t.custo}/bloco`, set('terrain', k))))]; hint = 'Arraste para pintar o terreno. Dentro dos habitats, siga o terreno do bioma.'; }
    else if (this.cat === 'planta') { body = [h('div', { class: 'items' }, ...Object.entries(C.plants).map(([k, p]) => item(o.plant === k, p.nome, `${C.biomes[p.bioma].nome} · R$ ${p.custo}${p.alta ? ' · alta' : ''}`, set('plant', k))))]; hint = 'Toque ou arraste para plantar. Cada espécie precisa de plantas do seu bioma.'; }
    else if (this.cat === 'inst') { body = [h('div', { class: 'items' }, ...Object.entries(C.facilities).filter(([, d]) => !d.fixo).map(([k, d]) => item(o.fac === k, d.nome, `R$ ${d.custo.toLocaleString('pt-BR')} · ${d.w}x${d.h}`, set('fac', k))))]; hint = 'Toque no mapa para posicionar. Precisa ficar ao lado de um caminho (exceto o centro de cuidados); a entrada vira sozinha para o caminho. A área de mesas precisa ficar perto de uma lanchonete.'; }
    else if (this.cat === 'animal') { body = [h('div', { class: 'items' }, ...Object.entries(C.species).map(([k, a]) => item(o.sp === k, a.nome, `R$ ${a.custo.toLocaleString('pt-BR')} · ${C.biomes[a.bioma].nome}`, set('sp', k))))];
      body.push(h('button', { class: 'btn sec sm', style: 'margin-top:6px', onclick: () => this.openZoopedia(o.sp) }, `📖 Ver ${C.species[o.sp].nome} na Zoopédia`));
      const S = C.species[o.sp]; hint = `Toque dentro de um habitat para comprar. ${S.nome}: ${S.dieta}, grupo de ${S.social.min} a ${S.social.max}, ${S.espaco} blocos por animal, barreira mín. ${S.barreira.altura} m / res. ${S.barreira.resistencia}${S.agua ? `, ${S.agua} blocos de água` : ''}.`; }
    else if (this.cat === 'demolir') hint = 'Toque no que quer remover. Instalações devolvem 50%, habitats 30%.';
    this.el.drawer.replaceChildren(
      h('div', { class: 'tabs' }, ...cats.map(([k, n]) => h('button', { class: this.cat === k ? 'on' : '', onclick: () => { this.cat = k; this.tool = k; this.hideConfirm(); this.g.world.hidePreview(); this.renderDrawer(); } }, n)),
        h('button', { onclick: () => this.toggleBuild(false) }, '✔ Concluir')),
      ...body, h('div', { class: 'hint' }, hint));
  }
  toolWantsDrag() { return ['habitat', 'caminho', 'terreno', 'planta', 'relevo'].includes(this.tool); }
  tileAt(cx, cy) { const p = this.g.world.groundAt(cx, cy); if (!p) return null; const t = worldToTile(p.x, p.z); return inMap(t.tx, t.ty) ? t : null; }
  finishPath() {
    const tiles = this.strokeTiles || []; this.strokeTiles = [];
    if (this.tool !== 'caminho' || !tiles.length) return;
    const r = distributeFurniture(this.s, tiles, this.opts.furn), n = r.placed, tot = n.poste + n.lixeira + n.banco;
    if (tot) { sound.cash(); this.toast(`Mobiliário colocado: ${n.poste} poste(s), ${n.lixeira} lixeira(s), ${n.banco} banco(s) · R$ ${r.cost.toLocaleString('pt-BR')}.`, 'bom'); }
    if (r.semDinheiro) this.toast('O dinheiro acabou antes de colocar todo o mobiliário.', 'ruim');
  }
  toolDragStart(cx, cy) { this.strokeTiles = []; this.hideConfirm(); if (this.tool !== 'habitat') this.g.snapshot(TOOL_NOME[this.tool]); this.dragA = this.tileAt(cx, cy); this.painted = new Set(); this.toolDrag(cx, cy); }
  toolDrag(cx, cy) {
    const t = this.tileAt(cx, cy); if (!t || !this.dragA) return; const s = this.s;
    if (this.tool === 'habitat') { const c = checkHabitat(s, this.dragA.tx, this.dragA.ty, t.tx, t.ty, this.opts.fence); this.dragB = t; const r = c.rect; this.g.world.showPreview(r.x, r.y, r.w, r.h, c.ok, 0.6); this.dragMsg = c; return; }
    const k = t.tx + ',' + t.ty; if (this.painted.has(k)) return; this.painted.add(k);
    let r;
    if (this.tool === 'caminho') { r = paintTerrain(s, t.tx, t.ty, this.opts.pathType || 'p'); if (r.ok) (this.strokeTiles ||= []).push([t.tx, t.ty]); }
    else if (this.tool === 'terreno') r = paintTerrain(s, t.tx, t.ty, this.opts.terrain);
    else if (this.tool === 'planta') r = placePlant(s, t.tx, t.ty, this.opts.plant);
    else if (this.tool === 'relevo') { if (this.painted.size === 1) { const w = tileToWorld(t.tx, t.ty); this.levelBase = heightAt(s, w.x, w.z); } r = sculpt(s, t.tx, t.ty, this.opts.relevo || 'subir', this.levelBase); setTimeout(() => this.painted.delete(k), 120); }
    this.g.world.showPreview(t.tx, t.ty, 1, 1, r?.ok, 0.15);
    if (r && !r.ok && r.msg && this.lastMsg !== r.msg) { this.lastMsg = r.msg; this.toast(r.msg, 'ruim'); }
  }
  toolDragEnd() {
    this.lastMsg = null;
    if (this.tool === 'habitat' && this.dragMsg) {
      const c = this.dragMsg, A = this.dragA, B = this.dragB; this.dragMsg = null;
      if (!c.ok) { this.toast(c.msg, 'ruim'); this.g.world.hidePreview(); return; }
      const C = content(this.s);
      this.askConfirm(`${C.biomes[this.opts.biome].nome} ${c.rect.w}x${c.rect.h} · ${C.fences[this.opts.fence].nome} · ${c.msg}`, () => {
        this.g.snapshot('habitat');
        const r = placeHabitat(this.s, A.tx, A.ty, B.tx, B.ty, this.opts.biome, this.opts.fence);
        if (!r.ok) this.toast(r.msg, 'ruim'); else { sound.cash(); this.cat = 'planta'; this.tool = 'planta'; this.opts.plant = C.biomes[this.opts.biome].plantas[0]; this.renderDrawer(); this.toast('Habitat pronto! Agora coloque plantas do bioma e depois compre animais.', 'bom'); }
        this.g.world.hidePreview();
      }, () => this.g.world.hidePreview());
      return;
    }
    this.finishPath();
    setTimeout(() => this.g.world.hidePreview(), 300);
  }
  toolCancel() { this.dragMsg = null; this.g.world.hidePreview(); }
  tap(cx, cy) {
    const s = this.s, C = content(s);
    if (this.tool) {
      const t = this.tileAt(cx, cy); if (!t) return;
      if (['caminho', 'terreno', 'planta', 'relevo'].includes(this.tool)) { this.g.snapshot(TOOL_NOME[this.tool]); this.dragA = t; this.painted = new Set(); this.strokeTiles = []; this.toolDrag(cx, cy); this.finishPath(); setTimeout(() => this.g.world.hidePreview(), 300); return; }
      if (this.tool === 'habitat') { this.toast('Arraste para desenhar o habitat.', 'ruim'); return; }
      if (this.tool === 'inst') {
        const D = C.facilities[this.opts.fac], c = checkFacility(s, this.opts.fac, t.tx, t.ty);
        this.g.world.showPreview(t.tx, t.ty, D.w, D.h, c.ok, 1.5);
        if (!c.ok) { this.toast(c.msg, 'ruim'); return; }
        this.askConfirm(`${D.nome} · R$ ${D.custo.toLocaleString('pt-BR')}`, () => { this.g.snapshot(D.nome.toLowerCase()); const r = placeFacility(s, this.opts.fac, t.tx, t.ty); if (!r.ok) this.toast(r.msg, 'ruim'); else sound.cash(); this.g.world.hidePreview(); }, () => this.g.world.hidePreview());
        return;
      }
      if (this.tool === 'animal') { this.g.snapshot('compra de ' + C.species[this.opts.sp].nome.toLowerCase()); const r = buyAnimal(s, this.opts.sp, t.tx, t.ty); if (!r.ok) this.toast(r.msg, 'ruim'); else sound.cash(); return; }
      if (this.tool === 'demolir') {
        this.g.world.showPreview(t.tx, t.ty, 1, 1, false, 0.5);
        this.askConfirm('Demolir o que está aqui?', () => { this.g.snapshot('demolição'); const r = demolish(s, t.tx, t.ty); this.toast(r.msg || (r.ok ? 'Removido.' : 'Nada aqui.'), r.ok ? 'bom' : 'ruim'); this.g.world.hidePreview(); }, () => this.g.world.hidePreview());
        return;
      }
    }
    if (this.moving) {
      const t = this.tileAt(cx, cy), hid = t && s._occ.hab[idx(t.tx, t.ty)];
      if (!hid) { this.toast('Toque dentro do habitat de destino (ou em Cancelar).', 'ruim'); return; }
      this.chooseTransfer(this.moving, hid); return;
    }
    const e = this.g.world.pickEntity(cx, cy);
    if (e) { this.select(e.kind, e.id); return; }
    const t = this.tileAt(cx, cy);
    if (t && s._occ.hab[idx(t.tx, t.ty)]) { this.select('hab', s._occ.hab[idx(t.tx, t.ty)]); return; }
    this.closeSheet();
  }
  habSuggestions(hb) {
    const s = this.s, C = content(s), out = [], an = s.animals.filter(a => a.hab === hb.id && !a.escaped && C.species[a.sp]);
    const send = (type, target, titulo) => () => this.chooseStaff(titulo, type, target);
    const tool = (cat, o) => () => { Object.assign(this.opts, o || {}); this.cat = cat; this.toggleBuild(true); const c = tileToWorld(hb.x + (hb.w >> 1), hb.y + (hb.h >> 1)); this.g.controls.centerOn(c.x, c.z, Math.max(30, this.g.controls.cam.dist * 0.6)); };
    const move = sp => () => { const a = an.find(x => x.sp === sp) || an[0]; if (a) this.startMove(a.id); };
    if (hb.breaches?.length) out.push([`🧱 Cerca rompida em ${hb.breaches.length} ponto(s). Animais podem fugir!`, 'Enviar segurança', send('repair', hb.id, 'Consertar a cerca'), 1]);
    else if (hb.fenceHp < 0.7) out.push([`🚧 Cerca com ${pct(hb.fenceHp)} de condição.`, 'Enviar segurança', send('repair', hb.id, 'Consertar a cerca'), hb.fenceHp < 0.35]);
    if (hb.gateOpen) out.push(['🚪 Portão aberto!', 'Enviar alguém', send('close', hb.id, 'Fechar o portão'), 1]);
    for (const a of an.filter(x => x.sick)) out.push([`🩺 ${a.name} está doente.`, 'Enviar veterinário', send('treat', a.id, `Tratar ${a.name}`), 1]);
    if (an.length && hb.food < 0.5) out.push([`🍖 Comedouro com ${pct(hb.food)}.`, 'Enviar tratador', send('feed', hb.id, 'Alimentar'), hb.food < 0.15]);
    if (an.length && hb.waterLvl < 0.5) out.push([`💧 Bebedouro com ${pct(hb.waterLvl)}.`, 'Enviar tratador', send('water', hb.id, 'Repor água'), hb.waterLvl < 0.15]);
    if ((hb.dirt || []).length >= 3) out.push([`🧹 ${hb.dirt.length} itens de sujeira (fezes e restos de comida).`, 'Enviar tratador', send('clean', hb.id, 'Limpar o habitat'), hb.clean < 0.4]);
    if (!an.length) out.push(['🐾 Habitat vazio.', 'Comprar animais', tool('animal'), 0]);
    const I = habInfo(s, hb);
    for (const sp of [...new Set(an.map(a => a.sp))]) {
      const S = C.species[sp], P = suitability(s, hb, sp).parts, n = an.filter(a => a.sp === sp).length, nome = S.nome;
      if (P.bioma < 0.95) out.push([`🌍 ${nome} vive em ${C.biomes[S.bioma].nome.toLowerCase()}, não em ${C.biomes[hb.biome].nome.toLowerCase()}.`, 'Transferir', move(sp), 1]);
      if (P.espaco < 0.95) { let need = 0; for (const [k, c] of Object.entries(I.count)) need += c * (C.species[k]?.espaco || 10); out.push([`📏 Pouco espaço: precisa de ~${need} blocos de chão, tem ${Math.round(I.land + 0.5 * I.water)}.`, 'Transferir um', move(sp), P.espaco < 0.6]); }
      if (P.terreno < 0.95) { const pref = C.biomes[S.bioma].terreno; let best = null, gap = 0; for (const [t, p] of Object.entries(pref)) { const g = p - (I.terr[t] || 0) / Math.max(1, I.land); if (g > gap) { gap = g; best = t; } }
        if (best) out.push([`🎨 Falta ${C.terrains[best].nome.toLowerCase()} (ideal ${pct(pref[best])} do chão).`, 'Pintar terreno', tool('terreno', { terrain: best }), 0]); }
      if (P.plantas < 0.95) { const have = S.plantasAltas ? (I.tall[S.bioma] || 0) : (I.plants[S.bioma] || 0), plant = Object.entries(C.plants).find(([, v]) => v.bioma === S.bioma && (!S.plantasAltas || v.alta))[0];
        out.push([`🌳 Faltam ${S.plantas - have} planta(s) ${S.plantasAltas ? 'altas ' : ''}de ${C.biomes[S.bioma].nome.toLowerCase()}.`, 'Plantar', tool('planta', { plant }), 0]); }
      if (P.agua < 0.95) { if (S.agua && I.water < S.agua) out.push([`💧 ${nome} precisa de pelo menos ${S.agua} blocos de água.`, 'Criar lago', tool('terreno', { terrain: 'w' }), 0]);
        if (S.aguaFunda && I.deep < S.aguaFunda) out.push([`🌊 ${nome} quer ${S.aguaFunda} blocos de água funda para o banho.`, 'Aprofundar lago', tool('relevo', { relevo: 'baixar' }), 0]); }
      if (P.cerca < 0.95) { const F = C.fences[hb.fence]; out.push([F.fosso ? `🏊 ${nome} sabe nadar: a ilha não segura 100%.` : `🧱 Barreira fraca para ${nome.toLowerCase()} (precisa ${S.barreira.altura} m de altura e resistência ${S.barreira.resistencia}; tem ${F.altura} m e ${F.resistencia}).`, 'Transferir', move(sp), 1]); }
      if (P.grupo < 0.95) out.push(n < S.social.min ? [`👥 Grupo pequeno: ${nome.toLowerCase()} vive em grupos de ${S.social.min} a ${S.social.max} (tem ${n}).`, 'Comprar mais', tool('animal', { sp }), 0] : [`👥 Grupo grande demais (máx. ${S.social.max}).`, 'Transferir um', move(sp), 0]);
      if (P.convivencia < 0.95) out.push([`⚠ Há um predador junto: ${nome.toLowerCase()} fica estressado.`, 'Transferir', move(sp), 1]);
    }
    return out;
  }
  chooseStaff(titulo, type, target) {
    const s = this.s, C = content(s), roles = ORDER_ROLES[type];
    const ref = type === 'treat' ? s.animals.find(a => a.id === target) : (() => { const hb = habById(s, target); return hb ? tileToWorld(hb.gateOut[0], hb.gateOut[1]) : { x: 0, z: 0 }; })();
    const list = s.staff.filter(x => roles.includes(x.role)).map(x => ({ x, d: Math.hypot(x.x - ref.x, x.z - ref.z) })).sort((a, b) => (a.x.task?.alertId ? 1 : 0) - (b.x.task?.alertId ? 1 : 0) || a.d - b.d);
    const nomes = roles.map(r => C.roles[r].nome.toLowerCase()).join(' ou ');
    this.showModal(() => h('div', {}, h('h3', {}, titulo), h('h3', { style: 'margin-top:6px' }, 'Quem enviar?'),
      list.length ? list.map(({ x, d }) => h('div', { class: 'card' }, h('div', { class: 'top' }, h('div', {}, h('b', {}, x.name), ' · ' + C.roles[x.role].nome, h('div', { class: 'muted' }, `${Math.round(d)} m · energia ${pct(x.energy)} · ${taskName(x.task)}`)),
        h('button', { class: 'btn sm', onclick: () => { const r = orderTask(s, x.id, type, target); this.closeModal(); this.toast(r.ok ? `${x.name} foi enviado(a).` : r.msg, r.ok ? 'bom' : 'ruim'); } }, 'Enviar'))))
        : h('div', { class: 'card' }, `Ninguém para isso. Contrate um ${nomes} em Equipe > Currículos.`)));
  }
  showMonth(r) {
    if (!r) return; const L = { comida: 'Comida e remédios', construcao: 'Construção', animais: 'Compra de animais', manutencao: 'Consertos', salarios: 'Salários' };
    const cor = v => `color:${v >= 0 ? '#7be0a5' : '#ff8a80'}`;
    this.showModal(() => h('div', {}, h('h3', {}, `📊 Fechamento do mês ${r.mes}`),
      h('div', { class: 'row' }, 'Receitas (ingressos, lanches, loja, metas)', h('b', { style: cor(1) }, '+' + money(r.receitas))),
      ...Object.entries(r.cat).filter(([k, v]) => v > 0 && k !== 'salarios' && !(k === 'manutencao' && v === r.manutencao)).map(([k, v]) => h('div', { class: 'row' }, L[k] || k, h('span', { style: cor(-1) }, '−' + money(v)))),
      h('div', { class: 'row' }, 'Salários do mês', h('span', { style: cor(-1) }, '−' + money(r.salarios))), h('div', { class: 'row' }, 'Manutenção das instalações', h('span', { style: cor(-1) }, '−' + money(r.manutencao))),
      h('div', { class: 'row' }, h('b', {}, 'Saldo do mês'), h('b', { style: cor(r.saldo) }, money(r.saldo))), h('div', { class: 'row' }, 'Visitantes no mês', h('b', {}, r.visitantes)), h('div', { class: 'row' }, 'Caixa após o fechamento', h('b', {}, money(r.caixa))),
      h('h3', { style: 'margin-top:8px' }, 'Previsão do próximo mês'),
      h('div', { class: 'row' }, 'Receitas', h('span', {}, money(r.previsao.receitas))), h('div', { class: 'row' }, 'Consumo (comida, remédios, consertos)', h('span', {}, money(r.previsao.consumo))), h('div', { class: 'row' }, 'Salários e manutenção', h('span', {}, money(r.previsao.fixos))),
      h('div', { class: 'row' }, h('b', {}, 'Saldo previsto'), h('b', { style: cor(r.previsao.saldo) }, money(r.previsao.saldo))),
      h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => this.closeModal() }, 'Continuar')));
  }
  startMove(id) {
    const a = this.s.animals.find(x => x.id === id); if (!a) return;
    if (a.escaped) return this.toast('O animal está solto. Recapture-o primeiro.', 'ruim');
    this.closeSheet(); this.moving = id;
    this.askConfirm(`Mover ${a.name}: toque no habitat de destino.`, () => {}, () => {});
    this.el.confirm.querySelector('.btn').remove(); this.el.confirm.querySelector('.btn').onclick = () => { this.moving = null; this.hideConfirm(); };
  }
  chooseTransfer(animalId, habId) {
    const s = this.s, a = s.animals.find(x => x.id === animalId), d = habById(s, habId), C = content(s);
    this.moving = null; this.hideConfirm();
    if (!a || !d) return; if (a.hab === d.id) return this.toast('O animal já está nesse habitat.', 'ruim');
    const su = suitability(s, d, a.sp), p = { x: a.x, z: a.z };
    const st = s.staff.filter(x => TRANSFER_ROLES.includes(x.role)).map(x => ({ x, d: Math.hypot(x.x - p.x, x.z - p.z) })).sort((u, v) => (u.x.task?.alertId ? 1 : 0) - (v.x.task?.alertId ? 1 : 0) || u.d - v.d);
    this.showModal(() => h('div', {}, h('h3', {}, `🚚 Transferir ${a.name} (${C.species[a.sp].nome})`),
      h('p', {}, `Para o ${d.name} (${C.biomes[d.biome].nome}). Adequação prevista: ${pct(su.total)}.`), su.total < 0.6 ? h('div', { class: 'card', style: 'border-left:4px solid #f2c230' }, 'Atenção: o destino não é bom para essa espécie. Veja o que falta tocando no habitat.') : null,
      h('p', { class: 'muted' }, 'A equipe aplica um dardo tranquilizante, coloca o animal no veículo e solta no novo habitat. Ele mantém nome, idade e saúde, mas fica um pouco estressado com a mudança.'),
      h('h3', {}, 'Quem faz a transferência?'),
      st.length ? st.map(({ x, d: dd }) => h('div', { class: 'card' }, h('div', { class: 'top' }, h('div', {}, h('b', {}, x.name), ' · ' + C.roles[x.role].nome, h('div', { class: 'muted' }, `${Math.round(dd)} m · energia ${pct(x.energy)} · ${taskName(x.task)}`)),
        h('button', { class: 'btn sm', onclick: () => { const r = orderTransfer(s, a.id, d.id, x.id); this.closeModal(); this.toast(r.ok ? `${x.name} vai fazer a transferência.` : r.msg, r.ok ? 'bom' : 'ruim'); } }, 'Enviar'))))
        : h('div', { class: 'card' }, 'Contrate um tratador, segurança ou veterinário para fazer transferências.')));
  }
  askConfirm(text, yes, no) {
    this.el.confirm.replaceChildren(h('span', {}, text), h('button', { class: 'btn sm', onclick: () => { this.hideConfirm(); yes(); } }, 'Confirmar'), h('button', { class: 'btn sec sm', onclick: () => { this.hideConfirm(); no?.(); } }, 'Cancelar'));
    this.el.confirm.classList.remove('hidden');
  }
  hideConfirm() { this.el.confirm.classList.add('hidden'); }
  askText(title, value, done, big) {
    const inp = h(big ? 'textarea' : 'input', { value: big ? null : value, style: 'width:100%;font-size:15px;padding:8px;border-radius:10px;border:0;margin:8px 0;' + (big ? 'height:140px' : '') });
    const box = h('div', {}, h('h3', {}, title), inp, h('button', { class: 'btn', onclick: () => { const v = inp.value.trim(); this.closeModal(); if (v) done(v); } }, 'OK'));
    this.showModal(() => box); setTimeout(() => inp.focus(), 50);
  }

  // ---------- painel de seleção ----------
  select(kind, id) { this.sel = { kind, id }; this.el.sheet.classList.remove('hidden'); this.renderSheet(); }
  closeSheet() { this.sel = null; this.el.sheet.classList.add('hidden'); this.g.world.hideSelection(); }
  renderSheet() {
    if (!this.sel || this.g.live) return;
    if (this.el.sheet.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const s = this.s, C = content(s), { kind, id } = this.sel; let body;
    const close = h('button', { class: 'close', onclick: () => this.closeSheet() }, '×');
    if (kind === 'animal') {
      const a = s.animals.find(a => a.id === id); if (!a) return this.closeSheet(); const S = C.species[a.sp], hb = habById(s, a.hab);
      this.g.world.showSelection(a.x, a.z, S ? Math.max(0.8, (['elefante', 'hipopotamo', 'rinoceronte'].includes(a.sp) ? 2 : 1.2)) : 1);
      body = [h('h3', {}, `${a.name} · ${S?.nome}`), h('div', { class: 'muted' }, `${a.sex === 'M' ? 'Macho' : 'Fêmea'} · ${Math.floor(a.age)} dias · ${hb?.name || ''} · ${ST_NOME[a.st] || a.st}`),
        h('div', {}, a.sick ? h('span', { class: 'tag ruim' }, 'Doente') : null, a.escaped ? h('span', { class: 'tag ruim' }, 'Fugiu!') : null, a.age < S.vida.adulto ? h('span', { class: 'tag bom' }, 'Filhote') : null),
        h('div', { class: 'kv' }, ...[['Bem-estar', a.welfare], ['Saúde', a.health], ['Energia', a.energy]].flatMap(([n, v]) => [n, meter(v), pct(v)]),
          ...[['Fome', a.hunger], ['Sede', a.thirst], ['Estresse', a.stress]].flatMap(([n, v]) => [n, meter(v, true), pct(v)])),
        h('div', {}, h('button', { class: 'btn sec sm', onclick: () => { if (hb) this.select('hab', hb.id); } }, 'Ver habitat'), ' ',
          h('button', { class: 'btn sm', onclick: () => this.startMove(a.id) }, '🚚 Mover'), ' ',
          h('button', { class: 'btn sec sm', onclick: () => this.askText(`Novo nome para ${a.name}`, a.name, n => { a.name = n.slice(0, 24); this.renderSheet(); this.toast(`Agora se chama ${a.name}!`, 'bom'); }) }, '✏️ Nome'), ' ',
          h('button', { class: 'btn sec sm', onclick: () => this.openZoopedia(a.sp) }, '📖 Zoopédia'), ' ',
          h('button', { class: 'btn red sm', onclick: () => this.askConfirm(`Vender ${a.name}? Você recebe 40% do valor (${money(Math.round(S.custo * 0.4))}).`, () => { this.g.snapshot('venda de ' + a.name); const r = sellAnimal(s, a.id); this.toast(r.ok ? 'Animal vendido (40% do valor).' : r.msg, r.ok ? 'bom' : 'ruim'); if (r.ok) this.closeSheet(); }) }, 'Vender'))];
    } else if (kind === 'hab') {
      const hb = habById(s, id); if (!hb) return this.closeSheet(); const F = C.fences[hb.fence];
      const c = tileToWorld(hb.x + hb.w / 2 - 0.5, hb.y + hb.h / 2 - 0.5); this.g.world.showSelection(c.x, c.z, Math.max(hb.w, hb.h) * 0.75);
      const an = s.animals.filter(a => a.hab === hb.id), sps = [...new Set(an.map(a => a.sp))];
      const LBL = { bioma: 'Bioma certo', espaco: 'Espaço', terreno: 'Terreno do bioma', plantas: 'Plantas', agua: 'Água (e água funda)', cerca: 'Barreira adequada', grupo: 'Tamanho do grupo', convivencia: 'Convivência' };
      body = [h('h3', {}, hb.name), h('div', { class: 'muted' }, `${C.biomes[hb.biome].nome} · ${hb.w}x${hb.h} blocos · ${F.nome} · ${F.fosso ? 'ponte' : 'portão'} ${hb.gateOpen ? 'ABERTO' : 'fechado'}`),
        hb.breaches?.length ? h('div', { class: 'card', style: 'border-left:4px solid #e53935' }, `🧱 Cerca rompida em ${hb.breaches.length} ponto(s). Envie um segurança!`) : null,
        h('div', { class: 'kv' }, ...[['Comida', hb.food], ['Água', hb.waterLvl], ['Limpeza', hb.clean], ['Cerca', hb.fenceHp]].flatMap(([n, v]) => [n, meter(v), pct(v)])),
        ...(() => { const sg = this.habSuggestions(hb); return sg.length ? [h('h3', { style: 'margin-top:6px' }, '💡 Sugestões'), ...sg.map(([t, lab, fn, bad]) => h('div', { class: 'row' }, h('span', { style: bad ? 'color:#ffb4a8' : '' }, t), h('button', { class: 'btn sm', onclick: fn }, lab)))] : [h('div', { class: 'muted', style: 'margin:6px 0' }, '✅ Nenhuma melhoria pendente neste habitat.')]; })(),
        ...(sps.length ? sps.map(sp => { const su = suitability(s, hb, sp); return h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, `${C.species[sp].nome} (${an.filter(a => a.sp === sp).length})`), h('span', {}, 'Adequação ' + pct(su.total))),
            h('div', {}, ...Object.entries(su.parts).map(([k, v]) => h('span', { class: 'tag ' + (v >= 0.95 ? 'bom' : v < 0.6 ? 'ruim' : '') }, `${v >= 0.95 ? '✓' : '✗'} ${LBL[k]} ${v < 0.95 ? pct(v) : ''}`)))); })
          : [h('div', { class: 'card' }, 'Vazio. Coloque plantas do bioma e compre animais em Construir.')]),
        h('div', {}, h('button', { class: 'btn sec sm', onclick: () => this.askText('Nome do habitat', hb.name, n => { renameHabitat(s, hb.id, n); this.renderSheet(); }) }, 'Renomear'))];
    } else if (kind === 'staff') {
      const st = s.staff.find(x => x.id === id); if (!st) return this.closeSheet(); this.g.world.showSelection(st.x, st.z, 0.7);
      body = this.personCard(st, true);
    } else if (kind === 'fac') {
      const f = s.facilities.find(x => x.id === id); if (!f) return this.closeSheet(); const D = C.facilities[f.type];
      body = [h('h3', {}, D.nome), f.type === 'banheiro' ? h('div', { class: 'kv' }, 'Sujeira', meter(f.dirty || 0, true), pct(f.dirty || 0)) : null,
        f.type === 'entrada' ? h('div', {}, `Ingresso: ${money(s.ticket)} (ajuste em Gerência > Finanças)`) : h('div', { class: 'muted' }, `Manutenção: R$ ${D.manut}/dia`)];
    }
    this.el.sheet.replaceChildren(close, ...body.filter(Boolean));
  }
  personCard(p, full) {
    const s = this.s, C = content(s), isMgr = p.role === 'subgerente', T = isMgr ? TRACOS_GERENTE : TRACOS_EQUIPE;
    return [h('h3', {}, `${p.name} · ${C.roles[p.role].nome}`),
      h('div', {}, ...Object.entries(p.attrs).map(([k, v]) => h('span', { class: 'tag' }, `${ATTR_NOME[k]} `, h('span', { class: 'stars' }, starStr(v))))),
      h('div', {}, ...(p.traits.length ? p.traits.map(t => h('span', { class: 'tag ' + (T[t].bom ? 'bom' : 'ruim') }, `${T[t].nome}: ${T[t].desc}`)) : [h('span', { class: 'muted' }, 'Sem traços especiais.')])),
      h('div', { class: 'kv' }, 'Energia', meter(p.energy), pct(p.energy), 'Satisfação', meter(p.sat), pct(p.sat)),
      !isMgr ? h('div', { class: 'muted' }, 'Fazendo: ' + taskName(p.task)) : null,
      h('div', { class: 'row' }, h('span', {}, `Salário ${money(p.salary)}/dia (esperado ${money(p.expected)})`),
        h('span', {}, h('button', { class: 'btn sec sm', onclick: () => { setSalary(s, p.id, 0.9); this.refresh(); } }, '−10%'), ' ', h('button', { class: 'btn sm', onclick: () => { setSalary(s, p.id, 1.1); this.refresh(); } }, '+10%'))),
      full ? h('button', { class: 'btn red sm', onclick: () => this.askConfirm(`Demitir ${p.name}?`, () => { fireById(s, p.id); this.closeSheet(); this.refresh(); }) }, 'Demitir') : null];
  }
  refresh() { this.renderSheet(); if (this.modal) this.renderModal(); }

  // ---------- modais ----------
  showModal(fn) { this.closeModal(); this.modalFn = fn; this.modal = h('div', { class: 'modal-bg', onclick: e => { if (e.target === this.modal) this.closeModal(); } }); this.root.append(this.modal); this.renderModal(); }
  renderModal() {
    if (!this.modal) return;
    const ae = document.activeElement; if (this.modal.contains(ae) && ae.tagName === 'INPUT') return;
    const box = h('div', { class: 'modal' }, h('button', { class: 'close', onclick: () => this.closeModal() }, '×'), this.modalFn());
    const old = this.modal.firstChild, sc = old ? old.scrollTop : 0; this.modal.replaceChildren(box); box.scrollTop = sc;
  }
  closeModal() { this.modal?.remove(); this.modal = null; this.modalFn = null; this.modalName = null; }
  openModal(name, tab) {
    this.tabs = this.tabs || {}; if (tab) this.tabs[name] = tab;
    const fn = { gerencia: () => this.mGerencia(), equipe: () => this.mEquipe(), metas: () => this.mMetas(), menu: () => this.mMenu() }[name];
    this.showModal(fn); this.modalName = name;
  }
  tabBar(name, list) {
    const cur = this.tabs[name] || list[0][0];
    return [cur, h('div', { class: 'tabs' }, ...list.map(([k, n]) => h('button', { class: k === cur ? 'on' : '', onclick: () => { this.tabs[name] = k; this.renderModal(); } }, n)))];
  }
  mGerencia() {
    const s = this.s, C = content(s), r = s.stats.rep;
    const [tab, bar] = this.tabBar('gerencia', [['geral', 'Visão geral'], ['fin', 'Finanças'], ['ani', 'Animais'], ['hab', 'Habitats'], ['zoo', '📖 Zoopédia'], ['area', 'Áreas']]);
    let body = [];
    if (tab === 'geral') {
      const st = stars(s);
      body = [h('div', { class: 'logo stars' }, starStr(Math.round(st)) + ' ' + st.toFixed(1)),
        h('div', { class: 'kv' }, ...[['🐾 Gerenciamento dos animais', r.animais], ['🌱 Sustentabilidade', r.sustent], ['📚 Educação dos visitantes', r.educacao], ['😊 Experiência dos visitantes', r.experiencia]].flatMap(([n, v]) => [n, meter(v), pct(v)])),
        h('div', { class: 'muted' }, 'Melhore o fator mais baixo primeiro. Placas educativas perto dos habitats aumentam a educação.'),
        h('div', { class: 'row' }, 'Visitantes hoje', h('b', {}, s.stats.visitantesHoje)), h('div', { class: 'row' }, 'Satisfação média', h('b', {}, pct(s.stats.sat))),
        h('div', { class: 'row' }, 'Animais', h('b', {}, s.animals.length)), h('div', { class: 'row' }, 'Equipe', h('b', {}, `${s.staff.length} funcionários · ${s.managers.length} subgerente(s)`)),
        h('h3', { style: 'margin-top:10px' }, 'Acontecimentos recentes'), ...s.log.slice(-14).reverse().map(l => h('div', { class: 'row' }, h('span', {}, l.msg), h('span', { class: 'muted' }, fmtClock(l.t).replace('Dia ', 'D'))))];
    } else if (tab === 'fin') {
      const t = s.stats.today, L = { ingressos: 'Ingressos', lanches: 'Lanchonetes', loja: 'Loja', metas: 'Metas e vendas', salarios: 'Salários', comida: 'Comida e remédios', manutencao: 'Manutenção', construcao: 'Construção', animais: 'Compra de animais' };
      const inc = Object.values(t.inc).reduce((a, b) => a + b, 0), exp = Object.values(t.exp).reduce((a, b) => a + b, 0);
      const P = s.fin?.pendente || { salarios: 0, manutencao: 0 }, dm = (s.clock.day % MES) + 1, mes = Math.floor(s.clock.day / MES) + 1;
      body = [h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, `Mês ${mes} · dia ${dm} de ${MES}`), h('span', { class: 'muted' }, `fechamento em ${MES - dm + 1} dia(s)`)),
          h('div', { class: 'row' }, 'Salários a pagar no fechamento', h('b', {}, money(P.salarios))), h('div', { class: 'row' }, 'Manutenção a pagar no fechamento', h('b', {}, money(P.manutencao))),
          h('div', { class: 'row' }, 'Custo fixo previsto por mês', h('b', {}, money(fixedDaily(s) * MES))),
          h('div', { class: 'muted' }, 'Comida, remédios, consertos, construção e compras são debitados na hora em que acontecem.')),
        h('h3', {}, 'Preço do ingresso: ' + money(s.ticket)),
        h('input', { type: 'range', min: 0, max: 100, step: 1, value: s.ticket, oninput: e => { setTicket(s, +e.target.value); e.target.previousSibling.textContent = 'Preço do ingresso: ' + money(s.ticket); } }),
        h('div', { class: 'muted' }, `Chegada estimada agora: ${arrivalRate(s).toFixed(0)} visitantes/hora (parque aberto das 8h às 18h). Preço alto afasta visitantes.`),
        h('h3', { style: 'margin-top:10px' }, 'Hoje'), ...Object.entries(t.inc).map(([k, v]) => h('div', { class: 'row' }, L[k], h('span', { style: 'color:#7be0a5' }, '+' + money(v)))),
        ...Object.entries(t.exp).map(([k, v]) => h('div', { class: 'row' }, L[k], h('span', { style: 'color:#ff8a80' }, '−' + money(v)))),
        h('div', { class: 'row' }, h('b', {}, 'Saldo do dia'), h('b', {}, money(inc - exp))),
        h('h3', { style: 'margin-top:10px' }, 'Meses fechados'), ...((s.fin?.meses || []).length ? s.fin.meses.slice(-6).reverse().map(m => h('div', { class: 'row', onclick: () => this.showMonth(m) }, `Mês ${m.mes}`, h('span', { class: 'muted' }, `${m.visitantes} visitantes`), h('span', { style: `color:${m.saldo >= 0 ? '#7be0a5' : '#ff8a80'}` }, money(m.saldo) + ' ›'))) : [h('div', { class: 'muted' }, 'O primeiro fechamento acontece no fim do mês 1 (dia 30).')]),
        h('h3', { style: 'margin-top:10px' }, 'Últimos dias'), ...(s.stats.history.length ? s.stats.history.slice(-7).reverse().map(d => h('div', { class: 'row' }, `Dia ${d.dia}`, h('span', { class: 'muted' }, `${d.visitantes} visitantes`), h('span', {}, `+${money(d.inc)} / −${money(d.exp)}`))) : [h('div', { class: 'muted' }, 'Ainda sem histórico.')])];
    } else if (tab === 'ani') {
      body = s.animals.length ? s.animals.map(a => h('div', { class: 'row', onclick: () => { this.closeModal(); this.g.controls.centerOn(a.x, a.z, 35); this.select('animal', a.id); } },
        h('span', {}, `${a.name} · ${C.species[a.sp]?.nome || '(expansão ausente)'}`), meter(a.welfare), h('span', {}, (a.sick ? '🩺 ' : '') + (a.escaped ? '🏃 ' : '') + pct(a.welfare)))) : [h('div', { class: 'muted' }, 'Nenhum animal ainda.')];
    } else if (tab === 'hab') {
      body = s.habitats.length ? s.habitats.map(hb => { const an = s.animals.filter(a => a.hab === hb.id); const sps = [...new Set(an.map(a => a.sp))]; const su = sps.length ? sps.reduce((t, sp) => t + suitability(s, hb, sp).total, 0) / sps.length : 0;
        return h('div', { class: 'row', onclick: () => { this.closeModal(); const c = tileToWorld(hb.x + (hb.w >> 1), hb.y + (hb.h >> 1)); this.g.controls.centerOn(c.x, c.z, 45); this.select('hab', hb.id); } },
          h('span', {}, `${hb.name} · ${C.biomes[hb.biome].nome} · ${an.length} animais`), meter(su), h('span', {}, sps.length ? pct(su) : '—')); }) : [h('div', { class: 'muted' }, 'Nenhum habitat ainda.')];
    } else if (tab === 'zoo') { body = this.zoopedia();
    } else if (tab === 'area') {
      const nx = AREAS[s.areaLevel + 1];
      body = [h('p', {}, `Área atual: nível ${s.areaLevel + 1} de ${AREAS.length}. Vagas de subgerente: ${VAGAS[s.areaLevel]}.`),
        nx ? h('div', { class: 'card' }, h('p', {}, `Inaugurar nova área custa ${money(nx.custo)}. Chegam até 10 currículos novos${VAGAS[s.areaLevel + 1] > VAGAS[s.areaLevel] ? ' e abre mais uma vaga de subgerente' : ''}.`),
          h('button', { class: 'btn', onclick: () => { const r = expandArea(s); this.toast(r.ok ? 'Nova área inaugurada!' : r.msg, r.ok ? 'bom' : 'ruim'); this.renderModal(); } }, 'Inaugurar nova área'))
          : h('div', { class: 'card' }, 'O parque está no tamanho máximo.')];
    }
    return h('div', {}, h('h3', {}, '📋 Gerência'), bar, ...body);
  }
  openZoopedia(sp) { this.zpSel = sp; this.openModal('gerencia', 'zoo'); }
  zoopedia() {
    const s = this.s, C = content(s), ids = Object.keys(C.species); const sel = this.zpSel && C.species[this.zpSel] ? this.zpSel : ids[0];
    const S = C.species[sel], Z = ZOOPEDIA[sel] || {}, mine = s.animals.filter(a => a.sp === sel);
    const grid = h('div', { class: 'zp-grid' }, ...ids.map(k => h('button', { class: k === sel ? 'on' : '', onclick: () => { this.zpSel = k; this.renderModal(); } }, C.species[k].nome, h('small', {}, `${s.animals.filter(a => a.sp === k).length} no parque`))));
    const B = C.biomes[S.bioma].nome, F = Object.values(C.fences).filter(f => f.altura >= S.barreira.altura && f.resistencia >= S.barreira.resistencia).map(f => f.nome);
    return [grid,
      h('div', { class: 'card' }, h('div', { class: 'top' }, h('h3', {}, S.nome), Z.status ? h('span', { class: 'tag zp-status', style: `background:${STATUS_COR[Z.status] || '#555'}` }, Z.status) : null),
        Z.cientifico ? h('div', { class: 'muted', style: 'font-style:italic' }, Z.cientifico) : null,
        h('div', { class: 'row' }, 'Onde vive', h('b', {}, B)), h('div', { class: 'row' }, 'Alimentação', h('b', {}, S.dieta)),
        h('div', { class: 'row' }, 'Grupo', h('b', {}, `${S.social.min} a ${S.social.max}`)), h('div', { class: 'row' }, 'Espaço por animal', h('b', {}, `${S.espaco} blocos`)),
        h('div', { class: 'row' }, 'Barreira mínima', h('b', {}, `${S.barreira.altura} m · resistência ${S.barreira.resistencia}`)),
        h('div', { class: 'row' }, 'Cercas que seguram', h('b', {}, F.length ? F.join(', ') : 'nenhuma 100%')),
        S.agua ? h('div', { class: 'row' }, 'Água no habitat', h('b', {}, `${S.agua} blocos${S.aguaFunda ? ` (${S.aguaFunda} fundos)` : ''}`)) : null,
        h('div', { class: 'row' }, 'Habilidades', h('b', {}, [S.tracos.pula && 'pula', S.tracos.escala && 'escala', S.tracos.nada && 'nada', S.tracos.forca >= 7 && 'muito forte', S.tracos.perigoso && 'perigoso'].filter(Boolean).join(', ') || '—')),
        h('div', { class: 'row' }, 'Preço', h('b', {}, money(S.custo)))),
      Z.curiosidades ? h('div', { class: 'card' }, h('b', {}, '💡 Curiosidades'), ...Z.curiosidades.map(t => h('div', { style: 'margin:5px 0' }, '• ' + t))) : null,
      h('div', { class: 'card' }, h('b', {}, `🐾 No seu parque (${mine.length})`),
        ...(mine.length ? mine.map(a => h('div', { class: 'row' }, h('span', {}, `${a.name} · ${a.sex === 'M' ? '♂' : '♀'} · ${Math.floor(a.age)} dias`),
          h('span', {}, h('button', { class: 'btn sec sm', onclick: () => this.askText(`Novo nome para ${a.name}`, a.name, n => { a.name = n.slice(0, 24); this.openZoopedia(sel); }) }, '✏️'), ' ',
            h('button', { class: 'btn sm', onclick: () => { this.closeModal(); this.g.controls.flyTo(a.x, a.z, 30); this.select('animal', a.id); } }, '📍 Ver')))) : [h('div', { class: 'muted' }, 'Nenhum ainda. Compre em Construir > Animais.')])),
      h('div', { class: 'muted' }, 'Status de conservação segundo a Lista Vermelha da IUCN.')];
  }
  mEquipe() {
    const s = this.s, C = content(s), now = Date.now();
    const [tab, bar] = this.tabBar('equipe', [['func', `Funcionários (${s.staff.length})`], ['cv', `Currículos (${s.candidates.length})`], ['sub', 'Subgerente']]);
    let body = [];
    if (tab === 'func') body = s.staff.length ? s.staff.map(st => h('div', { class: 'card', onclick: e => { if (e.target.tagName === 'BUTTON') return; this.closeModal(); this.g.controls.centerOn(st.x, st.z, 35); this.select('staff', st.id); } },
      h('div', { class: 'top' }, h('b', {}, `${st.name} · ${C.roles[st.role].nome}`), h('span', { class: 'muted' }, money(st.salary) + '/dia')),
      h('div', { class: 'kv' }, 'Energia', meter(st.energy), pct(st.energy), 'Satisfação', meter(st.sat), pct(st.sat)), h('div', { class: 'muted' }, taskName(st.task))))
      : [h('div', { class: 'card' }, 'Ninguém contratado ainda. Veja os currículos. Comece com um tratador para alimentar os animais.')];
    else if (tab === 'cv') {
      const nxt = Math.max(0, s.hiring.nextAt - now);
      body = [h('div', { class: 'muted' }, `Próximo currículo em ${Math.floor(nxt / 3600e3)} h ${Math.floor((nxt % 3600e3) / 60e3)} min (tempo real). Máximo de 10 na lista; cada um expira em 72 h.`),
        ...s.candidates.slice().reverse().map(c => h('div', { class: 'card' },
          h('div', { class: 'top' }, h('b', {}, `${c.name} · ${C.roles[c.role].nome}`), h('span', {}, money(c.salary) + '/dia')),
          h('div', {}, ...Object.entries(c.attrs).map(([k, v]) => h('span', { class: 'tag' }, `${ATTR_NOME[k]} `, h('span', { class: 'stars' }, starStr(v)))), h('span', { class: 'tag' }, 'Traços: ???')),
          h('div', { class: 'top', style: 'margin-top:6px' }, h('span', { class: 'muted' }, `Expira em ${Math.max(0, Math.floor((c.expiresAt - now) / 3600e3))} h`),
            h('span', {}, h('button', { class: 'btn sec sm', onclick: () => { s.candidates = s.candidates.filter(x => x !== c); this.renderModal(); } }, 'Dispensar'), ' ',
              h('button', { class: 'btn sm', onclick: () => { const r = hire(s, c.id); if (!r.ok) return this.toast(r.msg, 'ruim'); const T = c.role === 'subgerente' ? TRACOS_GERENTE : TRACOS_EQUIPE;
                this.toast(r.person.traits.length ? `${c.name} contratado(a). Traço revelado: ${T[r.person.traits[0]].nome}!` : `${c.name} contratado(a). Sem traços especiais.`, r.person.traits.length && !T[r.person.traits[0]].bom ? 'ruim' : 'bom'); this.renderModal(); } }, 'Contratar'))))),
        s.candidates.length ? null : h('div', { class: 'card' }, 'Nenhum currículo agora. Inaugure uma nova área (Gerência > Áreas) para receber mais.')];
    } else {
      const P = s.policies, tog = (k, label, desc) => h('div', { class: 'row' }, h('div', {}, h('b', {}, label), h('div', { class: 'muted' }, desc)), h('button', { class: 'btn sm ' + (P[k] ? '' : 'sec'), onclick: () => { P[k] = !P[k]; this.renderModal(); } }, P[k] ? 'Ligado' : 'Desligado'));
      body = [h('p', {}, `Vagas: ${s.managers.length}/${VAGAS[s.areaLevel]}. Sem subgerente, as emergências esperam por você. Com subgerente, ele despacha a equipe sozinho seguindo suas políticas.`),
        ...s.managers.map(m => h('div', { class: 'card' }, ...this.personCard(m, true))),
        s.managers.length ? null : h('div', { class: 'card' }, 'Nenhum subgerente. Procure um currículo de subgerente.'),
        h('h3', { style: 'margin-top:8px' }, 'Políticas'),
        tog('doencaPrimeiro', 'Doença primeiro', 'Animais doentes têm prioridade.'), tog('segurancaPrimeiro', 'Segurança primeiro', 'Cercas e portões antes de fome e doença.'), tog('fugaImediata', 'Fuga imediata', 'Em fuga, despacha na hora, sem esperar.')];
    }
    return h('div', {}, h('h3', {}, '👥 Equipe'), bar, ...body.filter(Boolean));
  }
  mMetas() {
    const s = this.s, done = METAS.filter(m => s.metas[m.id]).length;
    return h('div', {}, h('h3', {}, `🎯 Metas (${done}/${METAS.length})`), h('div', { class: 'muted' }, 'Metas opcionais: jogue no seu ritmo. Cada meta dá um prêmio em dinheiro.'),
      ...METAS.map(m => h('div', { class: 'row' }, h('div', {}, h('b', {}, (s.metas[m.id] ? '✅ ' : '⬜ ') + m.nome), h('div', { class: 'muted' }, m.desc)), h('span', {}, money(m.premio)))));
  }
  mMenu() {
    const s = this.s, g = this.g;
    const [tab, bar] = this.tabBar('menu', [['cfg', 'Configurações'], ['save', 'Progresso'], ['dlc', 'DLCs'], ['news', 'Novidades' + (g.updateInfo?.available ? ' •' : '')], ['ajuda', 'Ajuda']]);
    let body = [];
    const tg = (k, label, desc, after) => h('div', { class: 'row' }, h('div', {}, h('b', {}, label), h('div', { class: 'muted' }, desc)),
      h('button', { class: 'btn sm ' + (s.settings[k] ? '' : 'sec'), onclick: () => { s.settings[k] = !s.settings[k]; after?.(); this.renderModal(); } }, s.settings[k] ? 'Ligado' : 'Desligado'));
    if (tab === 'cfg') body = [
      h('div', { class: 'row' }, h('div', {}, h('b', {}, 'Gráficos'), h('div', { class: 'muted' }, 'Baixo: leve. Alto: sombras e animais realistas. Ultra: céu de verdade que muda com a hora, terreno com textura de foto, capim ao vento, água com ondas e pelo nos animais (pesa mais; baixa uns 2,5 MB na primeira vez).')),
        h('span', { style: 'display:flex;gap:4px' }, ...['baixo', 'alto', 'ultra'].map(q => h('button', { class: 'btn sm ' + (s.settings.quality === q ? '' : 'sec'), onclick: () => { g.setQuality(q); this.renderModal(); } }, { baixo: 'Baixo', alto: 'Alto', ultra: 'Ultra' }[q])))),
      tg('autoQualidade', 'Ajuste automático', 'Se o jogo ficar lento, reduz a resolução e passa para o gráfico Baixo.'),
      tg('mostrarFps', 'Mostrar FPS', 'Mostra quantos quadros por segundo o aparelho está desenhando.'),
      h('div', { class: 'row' }, h('div', {}, h('b', {}, '🌿 Modo Tranquilo'), h('div', { class: 'muted' }, 'Sem fugas e nenhum animal morre por falta de cuidados. Bom para construir com calma.')),
        h('button', { class: 'btn sm ' + (s.settings.tranquilo ? '' : 'sec'), onclick: () => { s.settings.tranquilo = !s.settings.tranquilo; this.renderModal(); } }, s.settings.tranquilo ? 'Ligado' : 'Desligado')),
      h('div', { class: 'row' }, h('div', {}, h('b', {}, 'Fuga de animais'), h('div', { class: 'muted' }, s.settings.tranquilo ? 'Desligada pelo Modo Tranquilo.' : 'Desligue para não ter fugas.')),
        h('button', { class: 'btn sm ' + (s.settings.fugas && !s.settings.tranquilo ? '' : 'sec'), disabled: s.settings.tranquilo, onclick: () => { s.settings.fugas = !s.settings.fugas; this.renderModal(); } }, s.settings.fugas && !s.settings.tranquilo ? 'Ativa' : 'Desligada')),
      h('h3', { style: 'margin-top:10px' }, '🔊 Som'),
      tg('som', 'Som', 'Cliques, dinheiro, alertas e vozes dos animais.', () => sound.configure(s.settings)),
      tg('ambiente', 'Sons do ambiente', 'Pássaros de dia e grilos à noite.', () => sound.configure(s.settings)),
      h('div', { class: 'row' }, h('b', {}, 'Volume'), h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(s.settings.volume * 100), style: 'max-width:180px', oninput: e => { s.settings.volume = +e.target.value / 100; sound.configure(s.settings); }, onchange: () => sound.cash() }))];
    else if (tab === 'save') body = [
      h('p', {}, `O jogo salva sozinho a cada 15 segundos e ao sair. Último salvamento: ${g.lastSave ? new Date(g.lastSave).toLocaleTimeString('pt-BR') : '—'} (${{ idb: 'no aparelho', ls: 'no navegador', mem: 'só na memória: exporte para não perder' }[g.saveWhere] || '—'}).`),
      h('div', { class: 'items' }, h('button', { class: 'btn', onclick: async () => { await g.save(); this.toast('Jogo salvo.', 'bom'); this.renderModal(); } }, '💾 Salvar agora'),
        h('button', { class: 'btn sec', onclick: () => g.exportSave() }, '⬇ Exportar arquivo'), h('button', { class: 'btn sec', onclick: () => g.importSave() }, '⬆ Importar arquivo'),
        h('button', { class: 'btn sec', onclick: () => g.copySave() }, '📋 Copiar save'), h('button', { class: 'btn sec', onclick: () => this.askText('Cole aqui o save copiado', '', t => g.pasteSave(t), true) }, '📥 Colar save')),
      h('p', { class: 'muted' }, 'Exporte o save de vez em quando como cópia de segurança. No iPhone, o sistema pode limpar dados de sites pouco usados.'),
      h('h3', { style: 'margin-top:12px' }, 'Novo jogo'), h('div', { class: 'muted' }, 'O zoológico atual é guardado numa cópia de segurança antes.'),
      h('div', { class: 'items', style: 'margin-top:6px' },
        h('button', { class: 'btn red', onclick: () => this.askConfirm('Começar um novo zoológico (modo Normal)? O atual será substituído.', () => g.newGame({ tranquilo: false })) }, 'Novo jogo · Normal'),
        h('button', { class: 'btn red', onclick: () => this.askConfirm('Começar um novo zoológico no Modo Tranquilo? O atual será substituído.', () => g.newGame({ tranquilo: true })) }, 'Novo jogo · 🌿 Tranquilo'))];
    else if (tab === 'dlc') body = [h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, 'Jogo base'), h('span', { class: 'tag bom' }, 'Instalado')), h('div', { class: 'muted' }, 'Savana, floresta e 10 espécies. Não pode ser removido.')),
      ...DLC_CATALOG.map(d => h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, d.nome), h('span', { class: 'tag' }, d.estado === 'em_breve' ? 'Em breve' : s.packs[d.id] ? 'Instalada' : 'Disponível')), h('div', {}, d.desc), h('div', { class: 'top', style: 'margin-top:6px' }, h('span', { class: 'muted' }, d.tamanho),
        s.packs[d.id] ? h('button', { class: 'btn red sm', onclick: () => g.uninstallPack(d.id) }, 'Desinstalar') : h('button', { class: 'btn sm', disabled: d.estado === 'em_breve', onclick: () => g.installPack(d.id) }, 'Baixar e instalar')))),
      h('p', { class: 'muted' }, 'Ao desinstalar uma expansão, os itens dela no seu parque ficam guardados e desativados no save, e voltam quando você reinstalar.')];
    else if (tab === 'news') { const u = g.updateInfo || {}; body = [
      h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, `Versão instalada: ${APP_VERSION}`), u.available ? h('button', { class: 'btn sm', onclick: () => g.applyUpdate() }, `Atualizar para ${u.latest}`) : h('button', { class: 'btn sec sm', onclick: async () => { await g.checkUpdate(true); this.renderModal(); } }, 'Verificar atualização')),
        h('div', { class: 'muted' }, u.checking ? 'Verificando…' : u.available ? 'Há uma versão nova! Seu progresso é copiado antes de atualizar.' : u.error ? 'Sem conexão para verificar agora.' : u.checked ? 'Você está na versão mais recente.' : 'O jogo verifica sozinho ao abrir, quando há internet.')),
      ...(u.available && u.notes ? [h('div', { class: 'card' }, h('b', {}, `Novidades da ${u.latest}`), ...u.notes.map(n => h('div', {}, '• ' + n)))] : []),
      ...CHANGELOG.map(c => h('div', { class: 'card' }, h('div', { class: 'top' }, h('b', {}, c.titulo), h('span', { class: 'muted' }, c.data)), ...c.itens.map(i => h('div', {}, '• ' + i))))]; }
    else body = [h('div', { class: 'card' }, h('b', {}, 'Como jogar'),
      ...['Você é o gerente. A equipe faz as rotinas sozinha; você cuida das emergências.', 'Construir > Habitat: arraste para desenhar. Depois plante vegetação do bioma e compre animais.',
        'Cada espécie precisa de bioma, espaço, plantas, terreno, barreira e grupo certos. Toque no habitat para ver o que falta.', 'Contrate tratador, veterinário, faxineiro e segurança em Equipe > Currículos.',
        'Quando algo dá errado aparece um botão no mapa. Toque nele e escolha quem enviar. Com um subgerente, ele despacha sozinho.', 'Visitantes andam pelos caminhos: coloque lanchonete, mesas, banheiro, loja e placas educativas, e deixe postes, lixeiras e bancos pelo caminho. Com lixeira por perto, eles não jogam lixo no chão.',
        'Tempo: 1 dia de jogo = 1 hora real. As horas do dia (6h às 20h) passam devagar e a noite passa rápido. ⏩ avança até a manhã (para sozinho em emergência). 👁 AO VIVO: ande pelo parque em tempo real.', 'Salários e manutenção são pagos no fechamento do mês (a cada 30 dias). Comida, remédios e consertos são cobrados na hora.', 'Toque num habitat para ver as sugestões de melhoria, cada uma com um botão para resolver.', 'Com o app fechado o parque continua em tempo real por até 72 h.', 'Relevo: molde colinas e lagos fundos em Construir > Relevo. Ilhas com fosso e viveiros com tela estão em Construir > Habitat.', 'Para mudar um animal de habitat, toque nele e use 🚚 Mover.',
        'Câmera: arraste um dedo para mover; pinça para aproximar; dois dedos girando para rodar; dois dedos arrastando para cima ou para baixo para inclinar; toque duplo para chegar perto. Os botões ⟲ ⟳ ▲ ▼ ＋ － fazem o mesmo, e a bússola volta para o norte. No modo construção, use dois dedos para mover.',
        'Errou uma construção? Use ↶ Desfazer no canto da tela (vale por 60 segundos).', '📖 Zoopédia (em Gerência): fatos reais sobre cada espécie e a lista dos seus animais. Toque num animal e use ✏️ Nome para batizá-lo.'].map(t => h('div', { style: 'margin:5px 0' }, '• ' + t))),
      h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { this.tut.restart(); this.closeModal(); this.toast('Tutorial reiniciado.', 'bom'); } }, '🎓 Refazer tutorial')];
    return h('div', {}, h('h3', {}, '⚙ Menu'), bar, ...body);
  }
  advanceMenu() {
    const s = this.s;
    this.showModal(() => h('div', {}, h('h3', {}, '⏩ Avançar relógio'), h('p', {}, `Agora: ${fmtClock(s.clock.min)}. O tempo é simulado de verdade (os animais comem, a equipe trabalha). Para sozinho se houver fuga, portão aberto ou cerca prestes a ceder.`),
      h('div', { class: 'items' }, ...[[7, 'Até amanhã de manhã (7h)'], [12, 'Até o meio-dia'], [18, 'Até o fim da tarde (18h)']].map(([hr, l]) => h('button', { class: 'btn', onclick: () => { this.closeModal(); this.g.advance(hr); } }, l)))));
  }
  showReport(rep, title) {
    if (!rep) return;
    const hrs = Math.floor(rep.minutos / 60), mins = Math.round(rep.minutos % 60);
    const evs = rep.eventos.filter(e => e.kind !== 'info').slice(-30).reverse();
    this.showModal(() => h('div', {}, h('h3', {}, title), h('p', {}, `${hrs} h ${mins} min de jogo simulados.` + (rep.limitado ? ' (Limitado a 72 h: o parque parou de evoluir depois disso.)' : '')),
      rep.parou ? h('div', { class: 'card', style: 'border-left:4px solid #e53935' }, '⚠ Relógio parado por emergência: ' + rep.parou) : null,
      h('div', { class: 'row' }, 'Dinheiro', h('b', { style: `color:${rep.dinheiro >= 0 ? '#7be0a5' : '#ff8a80'}` }, (rep.dinheiro >= 0 ? '+' : '') + money(rep.dinheiro))),
      h('div', { class: 'row' }, 'Alertas abertos', h('b', {}, rep.alertas)), rep.curriculos > 0 ? h('div', { class: 'row' }, 'Currículos novos', h('b', {}, rep.curriculos)) : null,
      h('h3', { style: 'margin-top:8px' }, 'O que aconteceu'), ...(evs.length ? evs.map(e => h('div', { class: 'row' }, h('span', {}, e.msg), h('span', { class: 'muted' }, fmtClock(e.t).replace('Dia ', 'D')))) : [h('div', { class: 'muted' }, 'Tudo tranquilo.')]),
      h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => this.closeModal() }, 'Continuar')));
  }
  toast(msg, kind = 'bom') {
    const t = h('div', { class: 'toast ' + kind }, msg); this.el.toasts.append(t); setTimeout(() => t.remove(), 4600);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    if (kind === 'perigo') navigator.vibrate?.(200);
  }
  welcome() {
    const t = this.s.settings.tranquilo;
    this.showModal(() => h('div', {}, h('div', { class: 'logo' }, '🦁🦓🐘🦒🦍🦛🦏🦩🐢'), h('h3', {}, 'Bem-vindo ao seu zoológico!'),
      h('p', {}, 'Você é o gerente: constrói o parque, contrata a equipe e cuida dos animais. Um tutorial rápido vai mostrar cada passo com uma seta.'),
      t ? h('div', { class: 'card' }, '🌿 Modo Tranquilo ligado: sem fugas e sem mortes por falta de cuidados.') : null,
      h('p', { class: 'muted' }, 'Dica: zebras e girafas aceitam cerca de ferro. Leões, elefantes e gorilas precisam de muro.'),
      h('button', { class: 'btn', onclick: () => this.closeModal() }, 'Vamos lá!')));
  }
  updateWorkBars() {
    const s = this.s, W = this.g.world, seen = new Set(); this.workEls ||= new Map();
    const ICO = { feed: '🍖', water: '💧', clean: '🧹', wc: '🧽', litter: '🧹', repair: '🔧', close: '🚪', treat: '🩺', checkup: '🩺', recapture: '🎯', patrol: '👮' };
    for (const st of s.staff) {
      const t = st.task; if (!t || !ICO[t.type] || !['work', 'sedate', 'load', 'release'].includes(t.phase) || !t.work0) continue;
      seen.add(st.id); let el = this.workEls.get(st.id);
      if (!el) { el = h('div', { class: 'wbar' }, h('span'), h('div', { class: 'meter' }, h('i'))); this.el.alerts.append(el); this.workEls.set(st.id, el); }
      const prog = Math.max(0, Math.min(1, 1 - t.work / t.work0));
      const lab = t.type === 'recapture' ? { sedate: '🎯 dardo', load: '📦 carregando', release: '🔓 soltando' }[t.phase] : t.type === 'clean' ? `🧹 ${(s.habitats.find(x => x.id === t.target)?.dirt || []).length}` : ICO[t.type];
      if (el.firstChild.textContent !== lab) el.firstChild.textContent = lab;
      el.lastChild.firstChild.style.width = (prog * 100).toFixed(0) + '%';
      const p = W.project(st.x, 2.3, st.z); el.style.display = p.vis && !this.g.live ? '' : 'none'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    }
    for (const [id, el] of this.workEls) if (!seen.has(id)) { el.remove(); this.workEls.delete(id); }
  }
  tick(dt = 0.016) {
    this.updateHud(); this.updateAlerts(); this.updateWorkBars(); this.tut.tick();
    // sons ligados aos acontecimentos
    const L = this.s.log; if (this.logSeen > L.length) this.logSeen = L.length;
    for (const e of L.slice(this.logSeen)) { if (e.kind === 'perigo') sound.alarm(); else if (/^Meta conclu|^Nasceu/.test(e.msg)) sound.good(); }
    this.logSeen = L.length;
    // vozes dos animais perto da câmera e ambiente
    if (this.g.live || !this.g.controls) return;
    const c = this.g.controls, cam = this.g.world.camera; sound.ambience(dt, hourOf(this.s.clock.min), c.cam.dist);
    this.voiceT -= dt; if (this.voiceT > 0) return; this.voiceT = 4 + Math.random() * 6;
    const an = this.s.animals.filter(a => !a.sedated && a.st !== 'sleep'); if (!an.length) return;
    const a = an[Math.floor(Math.random() * an.length)], p = this.g.world.project(a.x, 1, a.z); if (!p.vis) return;
    sound.animal(a.sp, (p.x / innerWidth) * 2 - 1, Math.hypot(cam.position.x - a.x, cam.position.y, cam.position.z - a.z));
  }
  slowTick() { this.renderSheet(); if (this.modal && this.modalName) this.renderModal(); }
}
