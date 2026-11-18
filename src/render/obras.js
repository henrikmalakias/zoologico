// 1.8.3 parte 2: desenho das obras — tapume em volta, andaime que sobe em 4 etapas, estrutura do prédio subindo,
// operários e guindaste animados só de perto, barra de progresso em cima e o caminhão que traz os animais no fim.
// Economia de calor e bateria: sem animação dos operários nem do guindaste e barra atualizada com menos frequência.
// Tudo com caixas e cilindros simples (os 3 gráficos usam o mesmo desenho; no Baixo o material é mais simples).
import * as THREE from 'three';
import { content } from '../content/registry.js';
import { MAP, TILE, HALF, idx, inMap, tileToWorld, heightAt, walkY, isPath, astar, accessTile } from '../sim/grid.js';
import { mergeStatic, buildVehicle } from './models.js';
import * as OB from '../sim/obras.js';

const PERTO = 70, PERTO_ECO = 45; // metros da câmera para mostrar operários e animar
const NIV = 1.5; // altura de cada nível do andaime
const DIRS = [[0, -1, 'N'], [1, 0, 'L'], [0, 1, 'S'], [-1, 0, 'O']];
const xz = (x, y) => ({ x: x * TILE - HALF, z: y * TILE - HALF }); // canto noroeste do bloco

function barCanvas() { const c = document.createElement('canvas'); c.width = 256; c.height = 72; return c; }
function drawBar(c, pr, txt) {
  const g = c.getContext('2d'); g.clearRect(0, 0, 256, 72);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.fillStyle = '#3b2414'; rr(4, 4, 248, 64, 16); g.fill();
  g.fillStyle = '#fff6df'; rr(10, 10, 236, 52, 12); g.fill();
  g.fillStyle = '#e7d9b5'; rr(18, 40, 220, 14, 7); g.fill();
  g.fillStyle = '#f2b51c'; rr(18, 40, Math.max(14, 220 * pr), 14, 7); g.fill();
  g.strokeStyle = '#3b2414'; g.lineWidth = 3; rr(18, 40, 220, 14, 7); g.stroke();
  g.fillStyle = '#3b2414'; g.font = '700 22px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 25);
}
// placa listrada "OBRA" (amarelo e preto)
function obraSign() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? '#1d1d1d' : '#f2c230'; g.beginPath(); g.moveTo(i * 14, 0); g.lineTo(i * 14 + 14, 0); g.lineTo(i * 14 - 4, 48); g.lineTo(i * 14 - 18, 48); g.closePath(); g.fill(); }
  g.fillStyle = '#fff6df'; g.fillRect(22, 10, 84, 28); g.fillStyle = '#3b2414'; g.font = '700 22px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OBRA', 64, 25);
  return c;
}

export class ObraView {
  constructor(kit, scene, world) {
    this.kit = kit; this.world = world; this.g = new THREE.Group(); this.g.name = 'obras'; scene.add(this.g);
    this.map = new Map(); this.trucks = new Map(); this.routes = new Map(); this.t = 0; this.barT = 0;
    const k = kit;
    this.M = { tap: k.mat('#e9c27a'), faixa: k.mat('#2e6b54'), poste: k.mat('#7a5a3a'), tubo: k.mat('#9aa3ab', { metal: 0.5, rough: 0.4 }), tabua: k.mat('#b9874d'),
      conc: k.mat('#b9b5ab'), conc2: k.mat('#9d998f'), amar: k.mat('#f2c230', { rough: 0.5 }), preto: k.mat('#262626'), colete: k.mat('#ff7a1a'), calca: k.mat('#2f4f7a'),
      pele: k.mat('#c98f62'), capacete: k.mat('#ffd21f', { rough: 0.4 }), tijolo: k.mat('#b5532f'), areia: k.mat('#d9b878'), cabo: k.mat('#333333') };
  }
  // ---------- montagem ----------
  build(s, o) {
    const k = this.kit, M = this.M, root = new THREE.Group(); root.userData = { kind: 'obra', id: o.id };
    const cells = new Set(OB.blocosDaObra(s, o)); if (!cells.size) return null;
    const r = OB.retangulo([...cells]), c0 = xz(r.x, r.y), cx = c0.x + r.w * TILE / 2, cz = c0.z + r.h * TILE / 2;
    const yAt = (x, z) => heightAt(s, x, z);
    const st = new THREE.Group(), add = (geo, m, x, y, z, ry = 0, par = st) => { const me = k.mesh(geo, m); me.position.set(x, y, z); me.rotation.y = ry; par.add(me); return me; };
    // tapume: um painel por lado de bloco na borda, um pouco para fora (fica por fora da cerca do recinto)
    const off = o.tipo === 'hab' ? 0.45 : 0.12, TH = o.tipo === 'toca' ? 1.6 : 2.1; let n = 0;
    for (const i of cells) {
      const x = i % MAP, y = (i / MAP) | 0;
      for (const [dx, dy, d] of DIRS) {
        const nx = x + dx, ny = y + dy; if (inMap(nx, ny) && cells.has(idx(nx, ny))) continue;
        const c = xz(x, y), ex = c.x + TILE / 2 + dx * (TILE / 2 + off), ez = c.z + TILE / 2 + dy * (TILE / 2 + off), ry = dx ? Math.PI / 2 : 0, yy = yAt(ex, ez);
        add(k.box(TILE + 0.02, TH, 0.07), M.tap, ex, yy + TH / 2, ez, ry);
        add(k.box(TILE + 0.04, 0.2, 0.09), M.amar, ex, yy + TH - 0.3, ez, ry); add(k.box(TILE + 0.04, 0.08, 0.1), M.preto, ex, yy + TH - 0.14, ez, ry); add(k.box(TILE + 0.04, 0.16, 0.09), M.faixa, ex, yy + 0.25, ez, ry);
        if ((x + y) % 2 === 0) add(k.box(0.09, TH + 0.1, 0.09), M.poste, ex + (dx ? 0 : TILE / 2), yy + TH / 2, ez + (dx ? TILE / 2 : 0));
        if (++n % 7 === 3) { const sg = k.mesh(k.box(1.2, 0.45, 0.02), k.mat('#ffffff', { map: k.tex('obraSign', obraSign) }), false); sg.position.set(ex + dx * 0.06, yy + TH * 0.55, ez + dy * 0.06); sg.rotation.y = dx ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dy > 0 ? 0 : Math.PI); st.add(sg); }
      }
    }
    // material de obra: tijolos e areia num canto de dentro
    const mx = c0.x + 1.2, mz = c0.z + r.h * TILE - 1.4, my = yAt(mx, mz);
    if (o.tipo !== 'toca') { add(k.box(1.1, 0.5, 0.7), M.tijolo, mx, my + 0.25, mz); add(k.box(0.8, 0.3, 0.6), M.tijolo, mx + 0.1, my + 0.62, mz); const ar = k.mesh(new THREE.ConeGeometry(0.8, 0.6, 7), M.areia); ar.position.set(mx + 1.5, my + 0.3, mz); st.add(ar); }
    mergeStatic(st); root.add(st);
    // estrutura subindo (prédio e toca): bloco de concreto que cresce por etapa, com pilares
    let estr = null;
    if (o.tipo === 'fac' || o.tipo === 'toca') {
      const W = r.w * TILE - 0.9, D = r.h * TILE - 0.9, H = o.tipo === 'toca' ? 2.4 : 3.2, y0 = yAt(cx, cz);
      estr = new THREE.Group(); estr.position.set(cx, y0, cz);
      const core = k.mesh(k.box(1, 1, 1), M.conc); core.scale.set(W - 0.4, 1, D - 0.4); estr.add(core);
      const pil = []; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = k.mesh(k.box(0.35, 1, 0.35), M.conc2); p.position.set(sx * (W / 2 - 0.2), 0, sz * (D / 2 - 0.2)); estr.add(p); pil.push(p); }
      estr.userData = { core, pil, H }; root.add(estr);
    }
    // andaimes: torres junto do tapume (pelo lado de dentro), uma a cada 4 painéis; cada nível de todas as torres é uma
    // peça só (4 peças por obra, poucas chamadas de desenho), e aparece um nível a mais por etapa
    const tw = o.tipo === 'toca' ? 1 : 1.4, pos = [];
    if (o.tipo === 'fac' || o.tipo === 'toca') pos.push([c0.x + 0.6, c0.z + 0.6], ...(o.tipo === 'fac' ? [[c0.x + r.w * TILE - 0.6, c0.z + r.h * TILE - 0.6]] : []));
    else { let k2 = 0; for (const i of cells) { const x = i % MAP, y = (i / MAP) | 0; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inMap(nx, ny) && cells.has(idx(nx, ny))) continue; if (k2++ % 4) continue; const c = xz(x, y); pos.push([c.x + TILE / 2 + dx * (TILE / 2 - tw / 2 - 0.1), c.z + TILE / 2 + dy * (TILE / 2 - tw / 2 - 0.1)]); } } }
    const torres = [[]];
    for (let L = 0; L < 4; L++) {
      const lg = new THREE.Group(), y = L * NIV;
      for (const [px, pz] of pos.slice(0, 24)) {
        const py = yAt(px, pz) + y;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(k.cyl(0.04, 0.04, NIV), M.tubo, px + sx * tw / 2, py + NIV / 2, pz + sz * tw / 2, 0, lg);
        add(k.box(tw + 0.1, 0.06, tw + 0.1), M.tabua, px, py + NIV, pz, 0, lg);
        const br = add(k.box(0.04, Math.hypot(tw, NIV), 0.04), M.tubo, px, py + NIV / 2, pz + tw / 2, 0, lg); br.rotation.z = Math.atan2(tw, NIV) * (L % 2 ? 1 : -1);
        if (L === 3 || o.tipo === 'toca') add(k.box(tw + 0.1, 0.5, 0.04), M.colete, px, py + NIV + 0.3, pz - tw / 2, 0, lg); // rede de proteção laranja no topo
      }
      mergeStatic(lg); root.add(lg); torres[0].push(lg);
    }
    // guindaste (obras de 3 x 3 blocos ou mais)
    let crane = null;
    if (o.tipo !== 'toca' && r.w * r.h >= 9) {
      const px = c0.x + 1.0, pz = c0.z + r.h * TILE - 1.0, Ht = o.tipo === 'fac' ? 9 : 10.5, L = Math.min(12, Math.max(6, Math.max(r.w, r.h) * TILE * 0.55));
      crane = new THREE.Group(); crane.position.set(px, yAt(px, pz), pz);
      const torre = new THREE.Group(); add(k.box(0.5, Ht, 0.5), M.amar, 0, Ht / 2, 0, 0, torre); for (let y = 1; y < Ht; y += 1.5) add(k.box(0.56, 0.08, 0.56), M.preto, 0, y, 0, 0, torre); add(k.box(1.4, 0.3, 1.4), M.conc2, 0, 0.15, 0, 0, torre);
      mergeStatic(torre); crane.add(torre);
      const jib = new THREE.Group(); jib.position.y = Ht;
      add(k.box(L, 0.35, 0.35), M.amar, L / 2 - 1.5, 0.2, 0, 0, jib); add(k.box(1.2, 0.7, 0.6), M.conc2, -2.0, 0, 0, 0, jib); add(k.box(0.9, 0.8, 0.8), M.preto, 0.2, -0.5, 0, 0, jib);
      const cabo = add(k.cyl(0.03, 0.03, 1), M.cabo, L * 0.7, 0, 0, 0, jib), gancho = add(k.box(0.35, 0.3, 0.35), M.preto, L * 0.7, -2, 0, 0, jib); const carga = add(k.box(1.2, 0.5, 0.7), M.tijolo, L * 0.7, -2.45, 0, 0, jib);
      crane.add(jib); crane.userData = { jib, cabo, gancho, carga, Ht, L, fase: Math.random() * 6 };
      root.add(crane);
    }
    // operários (só de perto)
    const workers = [], nW = o.tipo === 'toca' ? 1 : r.w * r.h >= 30 ? 3 : 2;
    for (let i = 0; i < nW; i++) {
      const w = new THREE.Group(), body = new THREE.Group(); w.add(body);
      add(k.box(0.34, 0.55, 0.22), M.calca, 0, 0.3, 0, 0, body); add(k.box(0.42, 0.55, 0.26), M.colete, 0, 0.85, 0, 0, body);
      add(k.sphere(0.15), M.pele, 0, 1.3, 0, 0, body); add(k.sphere(0.17), M.capacete, 0, 1.38, 0, 0, body).scale.set(1, 0.6, 1);
      const arm = new THREE.Group(); arm.position.set(0.26, 1.05, 0); add(k.box(0.1, 0.5, 0.1), M.colete, 0, -0.22, 0, 0, arm); add(k.box(0.06, 0.06, 0.3), M.poste, 0, -0.45, 0.12, 0, arm); body.add(arm);
      const a = [c0.x + 0.9 + ((i * 1.7) % Math.max(1, r.w * TILE - 1.8)), c0.z + 0.9 + ((i * 2.3) % Math.max(1, r.h * TILE - 1.8))], b = [c0.x + r.w * TILE - 0.9 - ((i * 1.1) % Math.max(1, r.w * TILE - 1.8)), a[1] + (i % 2 ? 0.6 : -0.6)];
      w.userData = { arm, a, b, f: i * 0.37 }; w.visible = false; root.add(w); workers.push(w);
    }
    // barra de progresso
    const cv = barCanvas(), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); bar.renderOrder = 10;
    const bh = o.tipo === 'toca' ? 4.2 : o.tipo === 'fac' ? 6.4 : 7.5; bar.position.set(cx, yAt(cx, cz) + bh, cz); bar.scale.set(5.2, 1.46, 1); root.add(bar);
    this.g.add(root);
    return { root, st, estr, torres, crane, workers, bar, cv, tex, c: { x: cx, z: cz }, r, last: '', key: this.keyOf(s, o) };
  }
  keyOf(s, o) { const h = o.hab && s.habitats.find(x => x.id === o.hab); return o.tipo + ':' + (h ? h.cells.length + ':' + (s._hver || 0) : '') + ':' + (o.rect ? o.rect.x + ',' + o.rect.y + ',' + o.rect.w + ',' + o.rect.h : ''); }
  free(e) { this.g.remove(e.root); e.tex.dispose(); e.bar.material.dispose(); e.root.traverse(m => { if (m.userData?.merged) m.geometry.dispose(); }); }
  // ---------- quadro a quadro ----------
  update(s, dt) {
    this.t += dt; this.barT += dt;
    const now = Date.now(), L = s.obras || [], vivos = new Set(), eco = !!this.world.eco, cam = this.world.camera.position;
    const barTick = this.barT >= (eco ? 1 : 0.5); if (barTick) this.barT = 0;
    for (const o of L) {
      vivos.add(o.id); let e = this.map.get(o.id);
      const key = this.keyOf(s, o); if (e && e.key !== key) { this.free(e); this.map.delete(o.id); e = null; }
      if (!e) { e = this.build(s, o); if (!e) continue; this.map.set(o.id, e); this.world.dirty = true; }
      const pr = OB.progresso(o, now), et = OB.etapa(o, now);
      // andaime e estrutura por etapa
      for (const lv of e.torres) lv.forEach((g, i) => { g.visible = i < et; });
      if (e.estr) { const H = e.estr.userData.H * (et / 4), core = e.estr.userData.core; core.scale.y = Math.max(0.15, H); core.position.y = Math.max(0.15, H) / 2; for (const p of e.estr.userData.pil) { p.scale.y = Math.min(e.estr.userData.H, H + 0.8); p.position.y = p.scale.y / 2; } }
      // barra
      if (barTick || !e.last) { const txt = `🚧 ${Math.floor(pr * 100)}% · ${OB.textoFalta(OB.faltaMs(o, now))}`; if (txt !== e.last) { e.last = txt; drawBar(e.cv, pr, txt); e.tex.needsUpdate = true; this.world.dirty = true; } }
      // de perto: operários e guindaste animados (economia: parados)
      const d = Math.hypot(cam.x - e.c.x, cam.z - e.c.z, cam.y), perto = d < (eco ? PERTO_ECO : PERTO);
      for (const w of e.workers) {
        w.visible = perto; if (!perto) continue;
        const U = w.userData, f = eco ? 0.5 : (Math.sin(this.t * 0.35 + U.f * 6) + 1) / 2, x = U.a[0] + (U.b[0] - U.a[0]) * f, z = U.a[1] + (U.b[1] - U.a[1]) * f;
        w.position.set(x, walkY(s, x, z), z);
        if (!eco) { const v = Math.cos(this.t * 0.35 + U.f * 6); w.rotation.y = Math.abs(v) > 0.25 ? Math.atan2((U.b[0] - U.a[0]) * Math.sign(v), (U.b[1] - U.a[1]) * Math.sign(v)) : w.rotation.y; U.arm.rotation.x = Math.abs(v) <= 0.25 ? -1.2 + Math.abs(Math.sin(this.t * 7 + U.f)) * 1.1 : Math.sin(this.t * 6 + U.f) * 0.5; this.world.dirty = true; }
        else U.arm.rotation.x = -0.6;
      }
      if (e.crane) { const U = e.crane.userData; if (perto && !eco) { U.jib.rotation.y = Math.sin(this.t * 0.12 + U.fase) * 1.3; const sob = 1.6 + (Math.sin(this.t * 0.5 + U.fase) + 1) * 2.2; U.cabo.scale.y = sob; U.cabo.position.y = -sob / 2; U.gancho.position.y = -sob - 0.1; U.carga.position.y = -sob - 0.55; this.world.dirty = true; } }
    }
    for (const [id, e] of this.map) if (!vivos.has(id)) { this.free(e); this.map.delete(id); this.world.dirty = true; }
    this.updateTrucks(s, now, dt);
  }
  // ---------- caminhão dos animais ----------
  rota(s, h) {
    const k = h.id + ':' + (s._ver || 0); const c = this.routes.get(h.id); if (c && c.k === k) return c.pts;
    const ent = s.facilities.find(f => content(s).facilities[f.type]?.fixo), a = ent && (accessTile(s, ent) || [ent.tx, ent.ty - 1]);
    let pts = null;
    if (a) { const g = h.gateOut, p = astar(s, a[0], a[1], g[0], g[1], (x, y) => isPath(s, x, y) || (x === g[0] && y === g[1]), () => 1); if (p) pts = [[a[0], a[1] + 1], ...p].map(([x, y]) => tileToWorld(x, y)); }
    if (!pts) { const g = tileToWorld(h.gateOut[0], h.gateOut[1]); pts = [{ x: g.x, z: g.z + 8 }, g]; }
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const out = { pts, len }; this.routes.set(h.id, { k, pts: out }); return out;
  }
  noPonto(R, d) {
    let left = Math.max(0, Math.min(R.len, d)), p = R.pts;
    for (let i = 1; i < p.length; i++) { const sl = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); if (left <= sl || i === p.length - 1) { const f = sl ? Math.min(1, left / sl) : 1; return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, z: p[i - 1].z + (p[i].z - p[i - 1].z) * f, rot: Math.atan2(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z) }; } left -= sl; }
    const q = p[p.length - 1]; return { x: q.x, z: q.z, rot: 0 };
  }
  updateTrucks(s, now, dt) {
    const want = new Map(), VIAGEM = 16e3, PARADO = 7e3, VEL = 7;
    // chegando: nos últimos 16 s da obra que libera os animais
    for (const e of s.aCaminho || []) {
      if (!e.espera.length || want.has(e.hab)) continue; const os = e.espera.map(id => OB.obraById(s, id)).filter(Boolean); if (!os.length) continue;
      const fim = Math.max(...os.map(OB.fimDe)), falta = fim - now; if (falta > VIAGEM || falta < 0) continue;
      want.set(e.hab, { modo: 'vem', f: 1 - falta / VIAGEM });
    }
    // chegou: parado no portão uns segundos
    s._entregas = (s._entregas || []).filter(x => now - x.t < PARADO);
    for (const x of s._entregas) want.set(x.hab, { modo: 'parado', f: 1 });
    for (const [hid, w] of want) {
      const h = s.habitats.find(x => x.id === hid); if (!h) continue;
      let tr = this.trucks.get(hid); if (!tr) { tr = buildVehicle(this.kit, 'caminhao'); this.g.add(tr); this.trucks.set(hid, tr); }
      const R = this.rota(s, h), d = w.modo === 'parado' ? R.len : Math.max(0, R.len - (1 - w.f) * VIAGEM / 1000 * VEL), p = this.noPonto(R, d - 2.5);
      tr.position.set(p.x, walkY(s, p.x, p.z) + 0.02, p.z); tr.rotation.y = p.rot; tr.visible = true;
      if (w.modo === 'vem') for (const wh of tr.userData.wheels) wh.rotation.x += dt * VEL / 0.42;
      this.world.dirty = true;
    }
    for (const [hid, tr] of this.trucks) if (!want.has(hid)) { this.g.remove(tr); this.trucks.delete(hid); }
  }
  dispose() { for (const e of this.map.values()) this.free(e); this.map.clear(); for (const tr of this.trucks.values()) this.g.remove(tr); this.trucks.clear(); this.g.parent?.remove(this.g); }
}
