import { content, papel } from '../content/registry.js';
import { clamp, rnd, pick, uid, dist, hourOf } from './util.js';
import { MAP, idx, tileToWorld, worldToTile, astar, isPath, isPathT, accessTile, viewTiles } from './grid.js';
import { earn } from './staff.js';

export const isOpen = s => { const h = hourOf(s.clock.min); return h >= 8 && h < 18; };
// no máximo 100 visitantes desenhados (70 no gráfico Baixo); os demais contam e pagam, mas não aparecem
export const visitorCap = s => (s.settings.quality !== 'baixo' ? 100 : 70);
const entranceTile = s => { const e = s.facilities.find(f => f.type === 'entrada'); return e ? accessTile(s, e) : null; };

export function arrivalRate(s) {
  const C = content(s);
  let appeal = 0; for (const a of s.animals) if (!a.escaped && C.species[a.sp]) appeal += C.species[a.sp].apelo * (0.5 + a.welfare);
  if (!appeal) return 3;
  const attraction = clamp(appeal / 40, 0.15, 1.5);
  const price = clamp(1.5 - s.ticket / 60, 0.1, 1.4);
  return (3 + 32 * s.stats.rep.total * attraction) * price;
}

const recordSat = (s, v, a = 0.05) => { s.stats.sat += (clamp(v) - s.stats.sat) * a; };

export function arrive(s, ctx) {
  s.stats.visitantesHoje++;
  earn(s, 'ingressos', s.ticket);
  const et = entranceTile(s);
  if (!ctx.abstract && et && s.visitors.length < visitorCap(s)) {
    const p = tileToWorld(et[0], et[1]);
    s.visitors.push({ id: uid(s), x: p.x, z: p.z, route: [], goal: null, useT: 0, hunger: rnd(s) * 0.4, bath: rnd(s) * 0.4, energy: 0.8 + rnd(s) * 0.2,
      sat: 0.6, stay: 150 + rnd(s) * 180, col: Math.floor(rnd(s) * 8), off: { x: (rnd(s) - 0.5) * 1.2, z: (rnd(s) - 0.5) * 1.2 }, loja: false, panic: false, rot: 0 });
  } else { virtualVisit(s); if (!ctx.abstract) (s.vstock ||= []).push(s.clock.min + 150 + rnd(s) * 180); }
}
// ao abrir o jogo no horário de visitação, o parque já começa com gente dentro (em vez de zerado):
// sorteia quem teria chegado nas últimas horas e ainda estaria passeando; os que passam do limite viram "fantasmas" (só contam)
export function seedCrowd(s) {
  if (!isOpen(s) || s.visitors.length + s.vstock.length > 0 || !s.facilities.some(f => f.type === 'entrada')) return 0;
  const T = Math.min(hourOf(s.clock.min) - 8, 5.5); if (T < 0.08) return 0;
  const n = Math.round((arrivalRate(s) * T) * 0.97);
  const tiles = []; for (let i = 0; i < MAP * MAP; i++) if (isPathT(s.terrain[i])) tiles.push(i);
  const cap = visitorCap(s); let made = 0;
  for (let k = 0; k < n; k++) {
    const age = rnd(s) * T, stay = 150 + rnd(s) * 180, left = stay - age * 60; // tempo de permanência sorteado − tempo desde a chegada
    if (left <= 5) continue;
    made++;
    if (s.visitors.length < cap && tiles.length) {
      const i = pick(s, tiles), p = tileToWorld(i % MAP, Math.floor(i / MAP));
      s.visitors.push({ id: uid(s), x: p.x, z: p.z, route: [], goal: null, useT: rnd(s) * 3, hunger: clamp(rnd(s) * 0.4 + 0.15 * age), bath: clamp(rnd(s) * 0.4 + 0.18 * age), energy: clamp(0.8 + rnd(s) * 0.2 - 0.1 * age),
        sat: 0.6, stay: left, col: Math.floor(rnd(s) * 8), off: { x: (rnd(s) - 0.5) * 1.2, z: (rnd(s) - 0.5) * 1.2 }, loja: false, panic: false, rot: rnd(s) * 6.28 });
    } else s.vstock.push(s.clock.min + left);
  }
  s.stats.visitorsIn = s.visitors.length + s.vstock.length;
  return made;
}
const binCover = s => { const bins = s.furn.reduce((n, f) => n + (f.type === 'lixeira'), 0); return clamp((bins / Math.max(1, (s._pathN || 1) / 12)) * 0.7, 0, 0.85); };
const has = (s, type) => s.furn.some(f => f.type === type);
const F2 = (s, t) => { const C = content(s); return s.facilities.filter(f => papel(C, f.type) === t); };
function virtualVisit(s) {
  const C = content(s), fac = t => s.facilities.filter(f => papel(C, f.type) === t);
  const L = fac('lanchonete'), W = fac('banheiro'), J = fac('loja');
  const lucro = list => { const D = C.facilities[list[0].type]; return (D.venda || 0) - (D.custoVenda || 0); };
  if (L.length) earn(s, 'lanches', 0.7 * lucro(L));
  if (J.length) earn(s, 'loja', 0.35 * lucro(J));
  if (W.length) { const w = pick(s, W); w.dirty = clamp((w.dirty || 0) + 0.02); }
  if (L.length && rnd(s) < 0.2 * (1 - binCover(s))) dropLitterRandom(s);
  const r = s.stats.rep;
  const est = 0.35 + 0.3 * r.animais + 0.1 * !!L.length + 0.1 * !!W.length + 0.08 * !!J.length + 0.07 * !!fac('playground').length
    + 0.03 * has(s, 'lixeira') + 0.03 * (has(s, 'banco') || !!fac('banco').length) + 0.04 * !!(fac('mesas').length && L.length) - litterPenalty(s);
  recordSat(s, est, 0.02);
}
export function litterCount(s) { let n = 0; for (const k in s.litter) n += s.litter[k]; return n; }
const litterPenalty = s => clamp(litterCount(s) / 60, 0, 0.3);
function dropLitterRandom(s) {
  const tiles = []; for (let i = 0; i < MAP * MAP; i++) if (isPathT(s.terrain[i])) tiles.push(i);
  if (tiles.length) { const i = pick(s, tiles); s.litter[i] = Math.min(3, (s.litter[i] || 0) + 1); }
}

function routeTo(s, v, tx, ty) {
  const c = worldToTile(v.x, v.z);
  const path = astar(s, c.tx, c.ty, tx, ty, (x, y) => isPath(s, x, y));
  if (!path) return false;
  v.route = path.map(([x, y]) => { const p = tileToWorld(x, y); return { x: p.x + v.off.x, z: p.z + v.off.z }; });
  return true;
}

function chooseGoal(s, v) {
  const C = content(s), F = t => s.facilities.filter(f => papel(C, f.type) === t);
  const go = (type, fac) => { const t = accessTile(s, fac); if (t && routeTo(s, v, t[0], t[1])) { v.goal = { type, id: fac.id }; return true; } return false; };
  const nearest = list => list.sort((a, b) => dist(v, tileToWorld(a.tx, a.ty)) - dist(v, tileToWorld(b.tx, b.ty)));
  if (v.trash && !v.panic) { // lixo na mão: vai até a lixeira mais próxima; sem lixeira por perto, joga no chão
    v.trash = false;
    const b = nearest(s.furn.filter(f => f.type === 'lixeira'))[0];
    if (b && dist(v, tileToWorld(b.tx, b.ty)) < 36 && routeTo(s, v, b.tx, b.ty)) { v.goal = { type: 'bin' }; return; }
    const c = worldToTile(v.x, v.z), i = idx(c.tx, c.ty); if (isPathT(s.terrain[i]) && rnd(s) < 0.85) s.litter[i] = Math.min(3, (s.litter[i] || 0) + 1);
  }
  if (v.next === 'mesas' && !v.leaving && !v.panic) { v.next = null; for (const f of nearest(F('mesas'))) if (go('sit', f)) return; }
  if (v.leaving || v.stay <= 0 || v.energy < 0.1 || !isOpen(s)) {
    v.leaving = true;
    if (!v.loja && !v.panic && rnd(s) < 0.35) { v.loja = true; for (const f of nearest(F('loja'))) if (go('loja', f)) return; }
    const e = entranceTile(s);
    if (e && routeTo(s, v, e[0], e[1])) { v.goal = { type: 'exit' }; return; }
    v.goal = { type: 'exit' }; v.route = []; return;
  }
  if (v.bath > 0.7) { for (const f of nearest(F('banheiro'))) if (go('wc', f)) return; v.sat -= 0.05; v.bath = 0.5; }
  if (v.hunger > 0.6) { for (const f of nearest(F('lanchonete'))) if (go('food', f)) return; v.sat -= 0.05; v.hunger = 0.4; }
  if (v.energy < 0.35) {
    const seats = [...F('playground'), ...F('banco'), ...F('mesas'), ...s.furn.filter(f => f.type === 'banco')];
    for (const f of nearest(seats)) { if (f.ox !== undefined) { if (routeTo(s, v, f.tx, f.ty)) { v.goal = { type: 'rest', furn: f.id }; return; } } else if (go('rest', f)) return; }
    v.sat -= 0.03; v.energy = 0.45;
  }
  if (rnd(s) < 0.12) { for (const f of nearest(F('playground'))) if (go('rest', f)) return; }
  const habs = s.habitats.filter(h => s.animals.some(a => a.hab === h.id && !a.escaped));
  if (habs.length) {
    let tot = 0; const w = habs.map(h => { const x = s.animals.filter(a => a.hab === h.id).reduce((t, a) => t + (C.species[a.sp]?.apelo || 1), 0); tot += x; return x; });
    let r = rnd(s) * tot, h = habs[0]; for (let i = 0; i < habs.length; i++) { r -= w[i]; if (r <= 0) { h = habs[i]; break; } }
    const vt = viewTiles(s, h);
    if (vt.length) { const t = pick(s, vt); if (routeTo(s, v, t[0], t[1])) { v.goal = { type: 'view', id: h.id }; return; } }
    v.sat -= 0.02;
  }
  // passear
  const c = worldToTile(v.x, v.z);
  for (let k = 0; k < 6; k++) { const x = c.tx + Math.floor((rnd(s) - 0.5) * 16), y = c.ty + Math.floor((rnd(s) - 0.5) * 16); if (isPath(s, x, y) && routeTo(s, v, x, y)) { v.goal = { type: 'wander' }; return; } }
  v.goal = { type: 'wander' }; v.useT = 2;
}

function applyGoal(s, v) {
  const C = content(s), g = v.goal; v.goal = null;
  if (!g) return;
  const f = g.id && s.facilities.find(x => x.id === g.id);
  if (g.type === 'food' && f) { const D = C.facilities[f.type] || C.facilities.lanchonete; earn(s, 'lanches', D.venda - D.custoVenda); v.hunger = 0; v.sat += 0.05; v.trash = true;
    const m = F2(s, 'mesas'); if (m.length && rnd(s) < 0.6) v.next = 'mesas'; }
  else if (g.type === 'sit' && f) { v.energy = clamp(v.energy + 0.3); v.sat += 0.06; }
  else if (g.type === 'bin') { v.sat += 0.01; }
  else if (g.type === 'wc' && f) { v.bath = 0; f.dirty = clamp((f.dirty || 0) + 0.04); v.sat += f.dirty > 0.7 ? -0.12 : 0.03; }
  else if (g.type === 'loja' && f) { const D = C.facilities[f.type] || C.facilities.loja; earn(s, 'loja', D.venda - D.custoVenda); v.sat += 0.05; }
  else if (g.type === 'rest' && g.furn) { v.energy = clamp(v.energy + 0.5); v.sat += 0.04; }
  else if (g.type === 'rest' && f) { v.energy = clamp(v.energy + 0.5); v.sat += papel(C, f.type) === 'playground' ? 0.07 : 0.03; }
  else if (g.type === 'view') {
    const an = s.animals.filter(a => a.hab === g.id && !a.escaped && C.species[a.sp]);
    if (an.length) { const w = an.reduce((t, a) => t + a.welfare, 0) / an.length, ap = an.reduce((t, a) => t + C.species[a.sp].apelo, 0) / an.length;
      const h = s.habitats.find(h => h.id === g.id); v.sat += 0.03 + 0.08 * w * (ap / 10) + (h && C.fences[h.fence]?.plataforma ? 0.02 : 0) - (h && h.clean < 0.4 ? 0.04 : 0); }
    else v.sat -= 0.02;
  }
  // lixo por perto
  const t = worldToTile(v.x, v.z); let n = 0;
  for (let y = t.ty - 2; y <= t.ty + 2; y++) for (let x = t.tx - 2; x <= t.tx + 2; x++) n += s.litter[idx(x, y)] || 0;
  v.sat = clamp(v.sat - 0.01 * n);
}

export function updateVisitors(s, gameMin, ctx) {
  const hrs = gameMin / 60;
  const escaped = s.animals.filter(a => a.escaped);
  for (let i = s.visitors.length - 1; i >= 0; i--) {
    const v = s.visitors[i];
    v.hunger = clamp(v.hunger + 0.15 * hrs); v.bath = clamp(v.bath + 0.18 * hrs); v.energy = clamp(v.energy - 0.1 * hrs);
    v.sat = clamp(v.sat - 0.03 * hrs); v.stay -= gameMin;
    if (!v.panic) for (const a of escaped) if (dist(v, a) < 12) { v.panic = true; v.leaving = true; v.sat = clamp(v.sat - 0.3); v.route = []; v.goal = null; v.useT = 0; }
    if (ctx.abstract) {
      if (v.stay <= 0 || !isOpen(s) || v.panic) { recordSat(s, v.sat); s.visitors.splice(i, 1); }
      continue;
    }
    if (v.route.length) {
      let left = (v.panic ? 2.6 : 1.2) * ctx.moveMul * ctx.realDt;
      while (left > 0 && v.route.length) {
        const p = v.route[0], dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
        if (d <= left) { v.x = p.x; v.z = p.z; left -= d; v.route.shift(); } else { v.x += (dx / d) * left; v.z += (dz / d) * left; v.rot = Math.atan2(dx, dz); left = 0; }
      }
      if (!v.route.length && v.goal) v.useT = v.goal.type === 'exit' ? 0 : v.goal.type === 'wander' ? 1 : 3 + rnd(s) * 3;
      continue;
    }
    if (v.useT > 0) { v.useT -= ctx.realDt * ctx.moveMul; continue; }
    if (v.goal?.type === 'exit') { recordSat(s, v.sat); s.visitors.splice(i, 1); continue; }
    if (v.goal) applyGoal(s, v);
    chooseGoal(s, v);
  }
  s.vstock = (s.vstock || []).filter(t => t > s.clock.min); if (!isOpen(s)) s.vstock.length = 0;
  s.stats.visitorsIn = s.visitors.length + s.vstock.length; // o contador inclui quem não é desenhado
}
