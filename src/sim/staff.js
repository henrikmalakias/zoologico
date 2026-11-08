import { content } from '../content/registry.js';
import { clamp, rnd, uid, log, dist, hourOf } from './util.js';
import { MAP, tileToWorld, worldToTile, astar, staffPassable, accessTile, idx } from './grid.js';
import { habById, breachPoint } from './animals.js';

export const ALERT_ROLES = { doenca: ['veterinario'], fome: ['tratador'], cerca: ['seguranca'], brecha: ['seguranca'], portao: ['seguranca', 'tratador'], fuga: ['seguranca', 'veterinario'] };
export const TRANSFER_ROLES = ['tratador', 'seguranca', 'veterinario'];
export const ALERT_INFO = {
  doenca: { nome: 'Animal doente', sev: 2, desc: 'Precisa de um veterinário.' },
  fome: { nome: 'Fome crítica', sev: 2, desc: 'O comedouro está vazio e os animais estão com muita fome.' },
  cerca: { nome: 'Cerca danificada', sev: 2, desc: 'A barreira está prestes a ceder. Risco alto de fuga.' },
  brecha: { nome: 'Cerca rompida', sev: 3, desc: 'Um animal derrubou um trecho da cerca. Outros podem sair pela brecha!' },
  portao: { nome: 'Portão aberto', sev: 3, desc: 'Alguém deixou o portão aberto. Fuga iminente!' },
  fuga: { nome: 'Animal fugiu', sev: 4, desc: 'Recapture o animal. Visitantes estão em pânico.' },
};
const TASK_NOME = { feed: 'Alimentando', water: 'Repondo água', clean: 'Limpando fezes e restos de comida', treat: 'Tratando animal', checkup: 'Checagem', wc: 'Limpando banheiro', litter: 'Recolhendo lixo', repair: 'Consertando cerca', close: 'Fechando portão', recapture: 'Recapturando', transfer: 'Transferindo animal', patrol: 'Ronda', rest: 'Descansando', idle: 'Livre' };
const REC_FASE = { travel: 'indo até o animal', sedate: 'aplicando dardo tranquilizante', load: 'colocando no veículo', return: 'levando de volta', release: 'soltando no habitat' };
export const taskName = t => (t ? (TASK_NOME[t.type] || t.type) + ((t.type === 'recapture' || t.type === 'transfer') && REC_FASE[t.phase] ? ': ' + (t.type === 'transfer' && t.phase === 'return' ? 'levando ao novo habitat' : REC_FASE[t.phase]) : '') : 'Livre');

const trait = (st, t) => st.traits && st.traits.includes(t);
export function workMul(st) {
  let m = 0.7 + 0.1 * st.attrs.habilidade;
  if (trait(st, 'dedicado')) m *= 1.25; if (trait(st, 'preguicoso')) m *= 0.75; if (trait(st, 'talentoso')) m *= 1.35;
  if (st.energy < 0.05) m *= 0.3;
  return m;
}
const centro = s => s.facilities.find(f => f.type === 'centro');

// ---------- destino e rota ----------
function destFor(s, type, target) {
  if (['feed', 'water', 'clean', 'checkup', 'treat'].includes(type)) {
    let hab = type === 'treat' ? s.animals.find(a => a.id === target) : habById(s, target);
    if (type === 'treat') { if (!hab) return null; if (hab.escaped) return { hab: 0, x: hab.x, z: hab.z }; hab = habById(s, hab.hab); }
    if (!hab) return null;
    const t = type === 'feed' ? hab.feed : type === 'water' ? hab.water : type === 'clean' ? [hab.x + (hab.w >> 1), hab.y + (hab.h >> 1)] : hab.gateIn;
    const p = tileToWorld(t[0], t[1]); return { hab: hab.id, x: p.x + 0.6, z: p.z + 0.6 };
  }
  if (['repair', 'close', 'patrol'].includes(type)) { const h = habById(s, target); if (!h) return null; const p = tileToWorld(h.gateOut[0], h.gateOut[1]); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'recapture') { const a = s.animals.find(a => a.id === target); if (!a) return null; return { hab: 0, x: a.x, z: a.z }; }
  if (type === 'transfer') { const a = s.animals.find(a => a.id === target); if (!a || a.escaped) return null; return { hab: a.hab, x: a.x, z: a.z }; }
  if (type === 'wc') { const f = s.facilities.find(f => f.id === target); const t = f && accessTile(s, f); if (!t) return null; const p = tileToWorld(t[0], t[1]); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'litter') { const p = tileToWorld(target % MAP, (target / MAP) | 0); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'rest' || type === 'idle') {
    const c = centro(s); const t = c ? (accessTile(s, c) || [c.tx - 1, c.ty]) : null;
    if (t) { const p = tileToWorld(t[0], t[1]); return { hab: 0, x: p.x + (rnd(s) - 0.5) * 2, z: p.z + (rnd(s) - 0.5) * 2 }; }
    const e = s.facilities.find(f => f.type === 'entrada'); const p = tileToWorld(e.tx, e.ty - 2);
    return { hab: 0, x: p.x + (rnd(s) - 0.5) * 4, z: p.z + (rnd(s) - 0.5) * 2 };
  }
  return null;
}
const WORK = { transfer: 9, feed: 30, water: 15, clean: 40, treat: 60, checkup: 20, wc: 20, litter: 4, repair: 45, close: 5, recapture: 25, patrol: 10, rest: 0, idle: 6 };

export function startTask(s, st, type, target, alertId = null) {
  const dest = destFor(s, type, target); if (!dest) return false;
  let work = WORK[type];
  if (type === 'treat' && centro(s)) work *= 0.6;
  if (type === 'recapture') { const a = s.animals.find(a => a.id === target); const S = a && content(s).species[a.sp]; if (S?.tracos.perigoso) work = 40; }
  const d = dist(st, dest);
  st.task = { type, target, alertId, phase: 'travel', dest, work, work0: work, travelLeft: (d * 1.25) / 3.5 + (st.inHab ? 2 : 0), route: null };
  if (type === 'recapture' || type === 'transfer') { const a = s.animals.find(a => a.id === target); st.task.vehKind = a && ['elefante', 'girafa', 'hipopotamo', 'rinoceronte'].includes(a.sp) ? 'caminhao' : 'jipe'; if (d > 12) { st.veh = st.task.vehKind; st.task.travelLeft = (d * 1.25) / 10; } }
  return true;
}
function buildRoute(s, st, dest) {
  const pts = []; let cur = worldToTile(st.x, st.z);
  if (st.inHab) { const h = habById(s, st.inHab); if (h) { pts.push(tileToWorld(h.gateIn[0], h.gateIn[1]), tileToWorld(h.gateOut[0], h.gateOut[1])); cur = { tx: h.gateOut[0], ty: h.gateOut[1] }; } st.inHab = 0; }
  const H = dest.hab ? habById(s, dest.hab) : null;
  const goal = H ? { tx: H.gateOut[0], ty: H.gateOut[1] } : worldToTile(dest.x, dest.z);
  const path = astar(s, cur.tx, cur.ty, goal.tx, goal.ty, (x, y) => staffPassable(s, x, y), (x, y) => (s.terrain[idx(x, y)] === 'p' ? 1 : 1.4));
  if (path) for (const [x, y] of path) pts.push(tileToWorld(x, y));
  if (H) pts.push(tileToWorld(H.gateIn[0], H.gateIn[1]));
  pts.push({ x: dest.x, z: dest.z });
  return pts;
}

function cancelTask(s, st) {
  const t = st.task; if (!t) return;
  if (t.type === 'recapture' || t.type === 'transfer') { const a = s.animals.find(a => a.id === t.target); if (a && (a.carriedBy === st.id || a.sedated)) { if (a.carriedBy === st.id && t.type === 'transfer') { const hh = habById(s, a.hab); if (hh) { const p = tileToWorld(hh.gateIn[0], hh.gateIn[1]); a.x = p.x; a.z = p.z; } } a.carriedBy = 0; a.sedated = false; a.st = 'idle'; } st.veh = null; }
  if (t.alertId) { const a = s.alerts.find(a => a.id === t.alertId); if (a && a.assigned === st.id) a.assigned = null; }
  st.task = null;
}

export function dispatch(s, alertId, staffId, by = 'você') {
  const a = s.alerts.find(a => a.id === alertId), st = s.staff.find(x => x.id === staffId);
  if (!a || !st) return false;
  const type = { doenca: 'treat', fome: 'feed', cerca: 'repair', brecha: 'repair', portao: 'close', fuga: 'recapture' }[a.type];
  const prev = s.staff.find(x => x.id === a.assigned); if (prev && prev !== st) cancelTask(s, prev);
  cancelTask(s, st);
  if (!startTask(s, st, type, a.target, a.id)) return false;
  a.assigned = st.id; a.by = by;
  return true;
}

export const ORDER_ROLES = { feed: ['tratador'], water: ['tratador'], clean: ['tratador'], repair: ['seguranca'], close: ['seguranca', 'tratador'], treat: ['veterinario'], checkup: ['veterinario'] };
export function orderTask(s, staffId, type, target) {
  const st = s.staff.find(x => x.id === staffId); if (!st) return { ok: false, msg: 'Funcionário não encontrado.' };
  if (!ORDER_ROLES[type]?.includes(st.role)) return { ok: false, msg: 'Função errada para esse trabalho.' };
  const al = s.alerts.find(a => ({ treat: 'doenca', repair: a.type === 'brecha' ? 'brecha' : 'cerca', close: 'portao', feed: 'fome' })[type] === a.type && a.target === target);
  if (al) { dispatch(s, al.id, st.id); return { ok: true }; }
  cancelTask(s, st);
  if (!startTask(s, st, type, target)) return { ok: false, msg: 'Não foi possível iniciar.' };
  st.task.manual = true; return { ok: true };
}
export function orderTransfer(s, animalId, destHabId, staffId) {
  const a = s.animals.find(x => x.id === animalId), st = s.staff.find(x => x.id === staffId), d = habById(s, destHabId);
  if (!a || !st || !d) return { ok: false, msg: 'Dados inválidos.' };
  if (a.escaped) return { ok: false, msg: 'O animal está solto. Recapture-o primeiro.' };
  if (a.hab === d.id) return { ok: false, msg: 'O animal já está nesse habitat.' };
  if (s.staff.some(o => o.task?.type === 'transfer' && o.task.target === a.id)) return { ok: false, msg: 'Esse animal já está sendo transferido.' };
  if (!TRANSFER_ROLES.includes(st.role)) return { ok: false, msg: 'Faxineiros não fazem transferências.' };
  cancelTask(s, st);
  if (!startTask(s, st, 'transfer', a.id)) return { ok: false, msg: 'Não foi possível iniciar.' };
  st.task.destHab = d.id;
  log(s, `${st.name} vai transferir ${a.name} para o ${d.name}.`, 'info');
  return { ok: true };
}

// ---------- rotinas autônomas ----------
const reserved = (s, type, target, me) => s.staff.some(o => o !== me && o.task && o.task.type === type && o.task.target === target);
function pickRoutine(s, st) {
  const cands = [];
  const habs = s.habitats.filter(h => s.animals.some(a => a.hab === h.id && !a.escaped));
  if (st.role === 'tratador') for (const h of habs) {
    const c = tileToWorld(h.gateOut[0], h.gateOut[1]), d = dist(st, c);
    if (h.food < 0.5) cands.push(['feed', h.id, (1 - h.food) * 1.2 / (1 + d / 40)]);
    if (h.waterLvl < 0.5) cands.push(['water', h.id, (1 - h.waterLvl) * 1.1 / (1 + d / 40)]);
    if (h.clean < 0.6) cands.push(['clean', h.id, (1 - h.clean) / (1 + d / 40)]);
  }
  if (st.role === 'veterinario') { const day = Math.floor(s.clock.min / 1440);
    for (const h of habs) if (h.checkupDay !== day && s.animals.some(a => a.hab === h.id && a.health < 0.97)) cands.push(['checkup', h.id, 0.5 / (1 + dist(st, tileToWorld(h.gateOut[0], h.gateOut[1])) / 40)]); }
  if (st.role === 'faxineiro') {
    for (const f of s.facilities) if (f.type === 'banheiro' && f.dirty > 0.5) cands.push(['wc', f.id, f.dirty * 1.2 / (1 + dist(st, tileToWorld(f.tx, f.ty)) / 40)]);
    let best = null, bd = 1e9;
    for (const k of Object.keys(s.litter)) { const i = +k, p = tileToWorld(i % MAP, (i / MAP) | 0), d = dist(st, p); if (d < bd && !reserved(s, 'litter', i, st)) { bd = d; best = i; } }
    if (best !== null) cands.push(['litter', best, 0.6 / (1 + bd / 40)]);
  }
  if (st.role === 'seguranca') {
    for (const h of s.habitats) if (h.fenceHp < 0.7 || h.breaches?.length) cands.push(['repair', h.id, (1 - h.fenceHp) / (1 + dist(st, tileToWorld(h.gateOut[0], h.gateOut[1])) / 40)]);
    if (s.habitats.length) { const h = s.habitats[Math.floor(rnd(s) * s.habitats.length)]; cands.push(['patrol', h.id, 0.1]); }
  }
  cands.sort((a, b) => b[2] - a[2]);
  for (const [type, target] of cands) if (!reserved(s, type, target, st) && startTask(s, st, type, target)) return;
  startTask(s, st, 'idle', 0);
}

function completeTask(s, st) {
  const t = st.task, C = content(s); st.task = null;
  const h = habById(s, t.target);
  const mgr = s.managers[0];
  const foodMul = mgr ? (mgr.traits.includes('perdulario') ? 1.2 : 1) * (mgr.traits.includes('economico') ? 0.85 : 1) * (1.1 - 0.05 * mgr.attrs.economia) : 1;
  switch (t.type) {
    case 'feed': if (h) { const n = s.animals.filter(a => a.hab === h.id).length; h.food = 1; spend(s, 'comida', 25 * Math.max(1, n) * foodMul); gateSlip(s, st, h); } break;
    case 'water': if (h) { h.waterLvl = 1; gateSlip(s, st, h); } break;
    case 'clean': if (h) { h.dirt = []; recalcClean(s, h); gateSlip(s, st, h); } break;
    case 'checkup': if (h) { h.checkupDay = Math.floor(s.clock.min / 1440); for (const a of s.animals) if (a.hab === h.id) a.health = clamp(a.health + 0.03); } break;
    case 'treat': { const a = s.animals.find(a => a.id === t.target); if (a) { a.sick = false; a.health = clamp(a.health + 0.35); spend(s, 'comida', 150); log(s, `${a.name} foi tratado(a) por ${st.name}.`, 'bom'); } break; }
    case 'wc': { const f = s.facilities.find(f => f.id === t.target); if (f) f.dirty = 0; break; }
    case 'litter': delete s.litter[t.target]; break;
    case 'repair': if (h) { h.fenceHp = 1; h.breaches = []; spend(s, 'manutencao', C.fences[h.fence].custo * 2 * (h.w + h.h) * 0.15); if (t.alertId) log(s, `${st.name} consertou a cerca do ${h.name}.`, 'bom'); } break;
    case 'close': if (h) { h.gateOpen = false; log(s, `${st.name} fechou o portão do ${h.name}.`, 'bom'); } break;
    case 'patrol': if (h && h.fenceHp < 0.7) startTask(s, st, 'repair', h.id); break;
    case 'transfer': { const a = s.animals.find(a => a.id === t.target); const hh = habById(s, t.destHab);
      if (a && hh) { const from = habById(s, a.hab); const p = tileToWorld(hh.gateIn[0], hh.gateIn[1]); Object.assign(a, { hab: hh.id, sedated: false, carriedBy: 0, x: p.x, z: p.z, tgt: null, st: 'idle', stT: 2 }); a.stress = clamp(a.stress + 0.15); log(s, `${a.name} foi transferido(a) do ${from?.name || '?'} para o ${hh.name}.`, 'bom'); }
      st.veh = null; break; }
    case 'recapture': { const a = s.animals.find(a => a.id === t.target); const hh = a && habById(s, a.hab);
      if (a && hh) { const p = tileToWorld(hh.gateIn[0], hh.gateIn[1]); Object.assign(a, { escaped: false, sedated: false, carriedBy: 0, x: p.x, z: p.z, tgt: null, st: 'idle', stT: 2 }); a.stress = clamp(a.stress - 0.3); log(s, `${a.name} foi recapturado(a) por ${st.name} e voltou ao ${hh.name}.`, 'bom'); }
      st.veh = null; break; }
  }
  if (t.alertId) { const a = s.alerts.find(a => a.id === t.alertId); if (a && a.assigned === st.id) a.assigned = null; refreshAlerts(s); }
}
function gateSlip(s, st, h) {
  const p = trait(st, 'distraido') ? 0.08 : 0.012;
  if (rnd(s) < p && !h.gateOpen) { h.gateOpen = true; }
}
export function recalcClean(s, h) {
  const n = s.animals.filter(a => a.hab === h.id && !a.escaped).length;
  h.dirt = h.dirt || []; h.clean = clamp(1 - h.dirt.length / (6 + 3 * n));
}
export function addDirt(s, h, x, z, kind) { h.dirt = h.dirt || []; if (h.dirt.length >= 50) return; h.dirt.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100, kind]); recalcClean(s, h); }
export function spend(s, cat, v) { s.money -= v; s.stats.today.exp[cat] = (s.stats.today.exp[cat] || 0) + v; }
export function earn(s, cat, v) { s.money += v; s.stats.today.inc[cat] = (s.stats.today.inc[cat] || 0) + v; }

// ---------- atualização ----------
export function updateStaff(s, gameMin, ctx) {
  const hrs = gameMin / 60;
  for (const st of s.staff) {
    const working = st.task && st.task.type !== 'idle' && st.task.type !== 'rest';
    const drain = (working ? 0.035 : 0.008) * (trait(st, 'resistente') ? 0.6 : 1) * (1.2 - 0.08 * st.attrs.dedicacao);
    if (st.task?.type === 'rest' && st.task.phase === 'work') st.energy = clamp(st.energy + (centro(s) ? 0.5 : 0.3) * hrs);
    else st.energy = clamp(st.energy - drain * hrs);
    if (!st.task || (st.task.type === 'idle' && st.energy < 0.15)) {
      if (st.task) cancelTask(s, st);
      if (st.energy < 0.15) startTask(s, st, 'rest', 0); else pickRoutine(s, st);
    }
    const t = st.task; if (!t) continue;
    if (t.type === 'recapture' && t.phase === 'travel') { const a = s.animals.find(a => a.id === t.target); if (!a || !a.escaped) { cancelTask(s, st); continue; } if (!a.escaping) { t.dest.x = a.x; t.dest.z = a.z; } }
    if (t.type === 'transfer' && t.phase === 'travel') { const a = s.animals.find(a => a.id === t.target); if (!a || a.escaped) { cancelTask(s, st); continue; } t.dest.x = a.x; t.dest.z = a.z; }
    if ((t.type === 'recapture' || t.type === 'transfer') && t.phase === 'return') { const a = s.animals.find(a => a.id === t.target); if (a) { a.x = st.x - Math.sin(st.rot || 0) * 1.6; a.z = st.z - Math.cos(st.rot || 0) * 1.6; a.rot = st.rot || 0; } }
    if (t.phase === 'travel' || t.phase === 'return') {
      if (ctx.abstract) {
        t.travelLeft -= gameMin;
        if (t.travelLeft <= 0) { st.x = t.dest.x; st.z = t.dest.z; st.inHab = t.dest.hab; t.route = null; arrive(s, st, t); }
      } else {
        if (!t.route) t.route = buildRoute(s, st, t.dest);
        if ((t.type === 'recapture' || t.type === 'transfer') && t.phase === 'travel' && t.route.length) t.route[t.route.length - 1] = { x: t.dest.x, z: t.dest.z };
        const sp = (st.veh ? 7 : 1.5 * (0.8 + 0.1 * st.attrs.rapidez) * (t.alertId ? 1.4 : 1)) * ctx.moveMul;
        let left = sp * ctx.realDt;
        while (left > 0 && t.route.length) {
          const p = t.route[0], dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
          if (d <= left) { st.x = p.x; st.z = p.z; left -= d; t.route.shift(); }
          else { st.x += (dx / d) * left; st.z += (dz / d) * left; st.rot = Math.atan2(dx, dz); left = 0; }
        }
        const near = (t.type === 'recapture' || t.type === 'transfer') && t.phase === 'travel' && (() => { const a = s.animals.find(a => a.id === t.target); return a && dist(st, a) < 7; })();
        if (!t.route.length || near) { st.inHab = t.dest.hab; t.route = null; arrive(s, st, t); }
      }
    } else {
      if (t.type === 'rest') { if (st.energy >= 0.95) st.task = null; continue; }
      if (t.type === 'recapture' || t.type === 'transfer') { recaptureWork(s, st, t, gameMin, ctx); continue; }
      if (t.type === 'clean' && !ctx.abstract) { cleanWork(s, st, t, gameMin, ctx); continue; }
      t.work -= gameMin * workMul(st);
      const h = habById(s, t.target), prog = 1 - Math.max(0, t.work) / (t.work0 || 1);
      if (h && t.type === 'repair') { t.hp0 ??= h.fenceHp; h.fenceHp = t.hp0 + (1 - t.hp0) * prog; }
      if (h && t.type === 'feed') { t.f0 ??= h.food; h.food = t.f0 + (1 - t.f0) * prog; }
      if (h && t.type === 'water') { t.w0 ??= h.waterLvl; h.waterLvl = t.w0 + (1 - t.w0) * prog; }
      if (t.work <= 0) completeTask(s, st);
    }
  }
}

// ---------- fases: chegada, captura e limpeza ----------
function arrive(s, st, t) {
  if ((t.type === 'recapture' || t.type === 'transfer') && t.phase === 'travel') {
    const a = s.animals.find(a => a.id === t.target); if (!a) return cancelTask(s, st);
    t.phase = 'sedate'; t.work = st.role === 'veterinario' ? 6 : 9; t.work0 = t.work; t.shotAt = s.clock.min;
    a.sedated = true; a.st = 'sedado'; a.tgt = null; st.rot = Math.atan2(a.x - st.x, a.z - st.z);
    log(s, `${st.name} aplicou um dardo tranquilizante em ${a.name}.`, 'info'); return;
  }
  if ((t.type === 'recapture' || t.type === 'transfer') && t.phase === 'return') { t.phase = 'release'; t.work = 4; t.work0 = 4; if (t.type === 'transfer') { st.inHab = 0; } return; }
  t.phase = 'work';
}
function recaptureWork(s, st, t, gameMin, ctx) {
  const a = s.animals.find(a => a.id === t.target);
  if (!a || (t.type === 'recapture' && !a.escaped && t.phase !== 'release') || (t.type === 'transfer' && a.escaped)) return cancelTask(s, st);
  t.work -= gameMin * workMul(st);
  if (t.work > 0) return;
  if (t.phase === 'sedate') { t.phase = 'load'; t.work = 3; t.work0 = 3; st.veh = t.vehKind; return; }
  if (t.phase === 'load') {
    a.carriedBy = st.id; const h = habById(s, t.type === 'transfer' ? t.destHab : a.hab); if (!h) return cancelTask(s, st);
    const p = tileToWorld(h.gateOut[0], h.gateOut[1]);
    t.phase = 'return'; t.dest = { hab: 0, x: p.x, z: p.z }; t.route = null; t.travelLeft = (dist(st, p) * 1.25) / 10; return;
  }
  if (t.phase === 'release') completeTask(s, st);
}
function cleanWork(s, st, t, gameMin, ctx) {
  const h = habById(s, t.target); if (!h) return cancelTask(s, st);
  if (!h.dirt || !h.dirt.length) { t.work = 0; return completeTask(s, st); }
  if (t.ci == null || !h.dirt[t.ci]) { let best = 0, bd = 1e9; h.dirt.forEach((d, i) => { const dd = Math.hypot(d[0] - st.x, d[1] - st.z); if (dd < bd) { bd = dd; best = i; } }); t.ci = best; t.sweep = 0; }
  const d = h.dirt[t.ci], dx = d[0] - st.x, dz = d[1] - st.z, dd = Math.hypot(dx, dz);
  if (dd > 0.6) { const step = Math.min(dd - 0.5, 1.4 * ctx.moveMul * ctx.realDt); st.x += (dx / dd) * step; st.z += (dz / dd) * step; st.rot = Math.atan2(dx, dz); t.moving = true; return; }
  t.moving = false; t.sweep += gameMin * workMul(st);
  if (t.sweep >= 1.5) { h.dirt.splice(t.ci, 1); t.ci = null; recalcClean(s, h); }
  t.work = h.dirt.length * 1.5; t.work0 = Math.max(t.work0 || 0, t.work + 1.5);
}

// ---------- alertas ----------
export function refreshAlerts(s) {
  const want = [];
  for (const a of s.animals) {
    if (!content(s).species[a.sp]) continue;
    if (a.sick) want.push(['doenca', a.id]);
    if (a.escaped) want.push(['fuga', a.id]);
  }
  for (const h of s.habitats) {
    if (h.food <= 0.02 && s.animals.some(a => a.hab === h.id && !a.escaped && a.hunger > 0.8)) want.push(['fome', h.id]);
    if (h.fenceHp < 0.35) want.push(['cerca', h.id]);
    if (h.breaches?.length) want.push(['brecha', h.id]);
    if (h.gateOpen) want.push(['portao', h.id]);
  }
  const key = (t, id) => t + ':' + id;
  const wk = new Set(want.map(([t, id]) => key(t, id)));
  for (const a of [...s.alerts]) if (!wk.has(key(a.type, a.target))) {
    const st = s.staff.find(x => x.id === a.assigned); if (st && st.task?.alertId === a.id) st.task.alertId = null;
    s.alerts.splice(s.alerts.indexOf(a), 1);
  }
  const have = new Set(s.alerts.map(a => key(a.type, a.target)));
  for (const [type, target] of want) if (!have.has(key(type, target))) {
    s.alerts.push({ id: uid(s), type, target, created: s.clock.min, assigned: null, wait: 0 });
    const nm = alertTargetName(s, { type, target });
    log(s, `${ALERT_INFO[type].nome}: ${nm}`, type === 'cerca' || type === 'portao' || type === 'fuga' || type === 'brecha' ? 'perigo' : 'ruim');
  }
}
export function alertTargetName(s, a) {
  if (a.type === 'doenca' || a.type === 'fuga') { const x = s.animals.find(b => b.id === a.target); return x ? `${x.name} (${content(s).species[x.sp]?.nome || '?'})` : '?'; }
  return habById(s, a.target)?.name || '?';
}
export function alertPos(s, a) {
  if (a.type === 'doenca' || a.type === 'fuga') { const x = s.animals.find(b => b.id === a.target); return x ? { x: x.x, z: x.z } : null; }
  const h = habById(s, a.target); if (!h) return null;
  if (a.type === 'brecha' && h.breaches?.length) { const p = breachPoint(h, h.breaches[0]); return p.outer; }
  if (a.type === 'cerca' || a.type === 'portao' || a.type === 'brecha') return tileToWorld(h.gateOut[0], h.gateOut[1]);
  return tileToWorld(h.x + (h.w >> 1), h.y + (h.h >> 1));
}
export function eligibleStaff(s, a) {
  const roles = ALERT_ROLES[a.type], p = alertPos(s, a) || { x: 0, z: 0 };
  return s.staff.filter(st => roles.includes(st.role)).map(st => ({ st, d: dist(st, p), busyAlert: !!st.task?.alertId && st.task.alertId !== a.id }))
    .sort((x, y) => (x.busyAlert - y.busyAlert) || (y.st.energy > 0.15) - (x.st.energy > 0.15) || x.d - y.d);
}
export function alertPriority(s, a) {
  let p = ALERT_INFO[a.type].sev;
  if (s.policies.doencaPrimeiro && a.type === 'doenca') p += 2;
  if (s.policies.segurancaPrimeiro && (a.type === 'cerca' || a.type === 'portao' || a.type === 'brecha')) p += 2;
  return p;
}
export function managerTick(s, q) {
  if (!s.managers.length) return;
  const m = s.managers[0], n = s.managers.length;
  let delay = (100 - 15 * m.attrs.rapidez) * (m.traits.includes('indeciso') ? 1.6 : 1) * (m.traits.includes('agil') ? 0.6 : 1) / Math.sqrt(n);
  const list = s.alerts.filter(a => !a.assigned).sort((a, b) => alertPriority(s, b) - alertPriority(s, a));
  for (const a of list) {
    a.wait = (a.wait || 0) + q;
    if (a.wait < delay && !(a.type === 'fuga' && s.policies.fugaImediata)) continue;
    const c = eligibleStaff(s, a).filter(x => !x.busyAlert && x.st.energy > 0.1);
    if (!c.length) continue;
    const wrong = (5 - m.attrs.decisao) * 0.06 + (m.traits.includes('confuso') ? 0.2 : 0);
    const i = c.length > 1 && rnd(s) < wrong ? 1 : 0;
    dispatch(s, a.id, c[i].st.id, m.name);
  }
}
