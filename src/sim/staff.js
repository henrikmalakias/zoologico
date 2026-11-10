import { content, papel } from '../content/registry.js';
import { centerCell, perimeter, routeInside } from './habshape.js';
import { clamp, rnd, uid, log, dist, hourOf } from './util.js';
import { MAP, tileToWorld, worldToTile, astar, staffPassable, accessTile, idx, isPathT } from './grid.js';
import { habById, breachPoint, tocaLivre, mandarParaToca, dentro, perigoDe, PERIGOSO, perigosos, planoServico, sedarNoLugar, soltarTocas, SED_MIN, limites } from './animals.js';
import { tocaById } from './tocas.js';
import { tratamento, internar, portaClinica, isClinica } from './clinica.js';
import { insideAt } from './habshape.js';

export const ALERT_ROLES = { doenca: ['veterinario'], fome: ['tratador'], cerca: ['seguranca'], brecha: ['seguranca'], portao: ['seguranca', 'tratador'], fuga: ['seguranca', 'veterinario'], ferido: ['seguranca'] };
export const TRANSFER_ROLES = ['tratador', 'seguranca', 'veterinario'];
export const ALERT_INFO = {
  doenca: { nome: 'Animal doente', sev: 2, desc: 'Precisa de um veterinário.' },
  fome: { nome: 'Fome crítica', sev: 2, desc: 'O comedouro está vazio e os animais estão com muita fome.' },
  cerca: { nome: 'Cerca danificada', sev: 2, desc: 'A barreira está prestes a ceder. Risco alto de fuga.' },
  brecha: { nome: 'Cerca rompida', sev: 3, desc: 'Um animal derrubou um trecho da cerca. Outros podem sair pela brecha!' },
  portao: { nome: 'Portão aberto', sev: 3, desc: 'Alguém deixou o portão aberto. Fuga iminente!' },
  fuga: { nome: 'Animal fugiu', sev: 4, desc: 'Recapture o animal. Visitantes estão em pânico.' },
  ferido: { nome: 'Funcionário ferido', sev: 2, desc: 'Um animal atacou um funcionário dentro do recinto. Ele está afastado por 1 dia de jogo (o salário continua). Envie um segurança para conferir o recinto.' },
};
const TASK_NOME = { feed: 'Alimentando', water: 'Repondo água', clean: 'Limpando fezes e restos de comida', treat: 'Tratando animal', checkup: 'Checagem', wc: 'Limpando banheiro', litter: 'Recolhendo lixo', repair: 'Consertando cerca', close: 'Fechando portão', recapture: 'Recapturando', transfer: 'Transferindo animal', patrol: 'Ronda', sedar: 'Sedando animais perigosos', ferido: 'Afastado (ferido)', rest: 'Descansando', idle: 'Livre' };
const REC_FASE = { travel: 'indo até o animal', sedate: 'aplicando dardo tranquilizante', load: 'colocando no veículo', return: 'levando de volta', release: 'soltando no habitat' };
const PRE_FASE = { recolher: 'chamando os animais perigosos para as tocas', espera: 'esperando o veterinário sedar os perigosos', sedar: 'sedando os animais perigosos' };
export const taskName = t => {
  if (!t) return 'Livre';
  const n = t.type === 'treat' ? (t.modo === 'internar' ? 'Internando animal' : 'Remédio por dardo') : (TASK_NOME[t.type] || t.type);
  if (PRE_FASE[t.phase]) return n + ': ' + PRE_FASE[t.phase];
  if (t.pre && t.phase === 'travel') return n + ': indo até o portão';
  if ((t.type === 'recapture' || t.type === 'transfer' || t.modo === 'internar') && REC_FASE[t.phase]) return n + ': ' + (t.type === 'transfer' && t.phase === 'return' ? 'levando ao novo habitat' : t.modo === 'internar' && t.phase === 'return' ? 'levando à clínica' : t.modo === 'internar' && t.phase === 'release' ? 'internando' : REC_FASE[t.phase]);
  return n;
};

const trait = (st, t) => st.traits && st.traits.includes(t);
export function workMul(st) {
  let m = 0.7 + 0.1 * st.attrs.habilidade;
  if (trait(st, 'dedicado')) m *= 1.25; if (trait(st, 'preguicoso')) m *= 0.75; if (trait(st, 'talentoso')) m *= 1.35;
  if (st.energy < 0.05) m *= 0.3;
  return m;
}
const centro = s => s.facilities.find(f => f.type === 'centro');
const temClinica = s => s.facilities.some(f => isClinica(s, f));
// serviços que entram no recinto: antes, os animais perigosos são recolhidos nas tocas (ou sedados)
export const SERVICOS = new Set(['feed', 'water', 'clean', 'checkup']);
// a carga (veículo) entra no recinto: transferência e internação também recolhem os outros perigosos antes
const entraNoRecinto = t => SERVICOS.has(t.type) || t.type === 'transfer' || (t.type === 'treat' && t.modo === 'internar');
const levaAnimal = t => t.type === 'recapture' || t.type === 'transfer' || (t.type === 'treat' && t.modo === 'internar');
export const SED_CUSTO = 100;

// ---------- destino e rota ----------
function destFor(s, type, target) {
  if (['feed', 'water', 'clean', 'checkup'].includes(type)) {
    const hab = habById(s, target); if (!hab) return null;
    const t = type === 'feed' ? hab.feed : type === 'water' ? hab.water : type === 'clean' ? centerCell(hab) : hab.gateIn;
    const p = tileToWorld(t[0], t[1]); return { hab: hab.id, x: p.x + 0.6, z: p.z + 0.6 };
  }
  // tratamento: remédio por dardo de fora da cerca (internação usa o destino do animal, ver startTask)
  if (type === 'treat') { const a = s.animals.find(a => a.id === target); if (!a || a.internado) return null; if (a.escaped) return { hab: 0, x: a.x, z: a.z }; const h = habById(s, a.hab); if (!h) return null; const p = tileToWorld(h.gateOut[0], h.gateOut[1]); return { hab: 0, x: p.x, z: p.z }; }
  if (['repair', 'close', 'patrol', 'sedar'].includes(type)) { const h = habById(s, target); if (!h) return null; const p = tileToWorld(h.gateOut[0], h.gateOut[1]); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'recapture') { const a = s.animals.find(a => a.id === target); if (!a) return null; return { hab: 0, x: a.x, z: a.z }; }
  if (type === 'transfer') { const a = s.animals.find(a => a.id === target); if (!a || a.escaped) return null; return { hab: a.hab, x: a.x, z: a.z }; }
  if (type === 'wc') { const f = s.facilities.find(f => f.id === target); const t = f && accessTile(s, f); if (!t) return null; const p = tileToWorld(t[0], t[1]); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'litter') { const p = tileToWorld(target % MAP, (target / MAP) | 0); return { hab: 0, x: p.x, z: p.z }; }
  if (type === 'rest' || type === 'idle' || type === 'ferido') {
    const c = centro(s); const t = c ? (accessTile(s, c) || [c.tx - 1, c.ty]) : null;
    if (t) { const p = tileToWorld(t[0], t[1]); return { hab: 0, x: p.x + (rnd(s) - 0.5) * 2, z: p.z + (rnd(s) - 0.5) * 2 }; }
    const e = s.facilities.find(f => f.type === 'entrada'); const p = tileToWorld(e.tx, e.ty - 2);
    return { hab: 0, x: p.x + (rnd(s) - 0.5) * 4, z: p.z + (rnd(s) - 0.5) * 2 };
  }
  return null;
}
const WORK = { transfer: 9, feed: 30, water: 15, clean: 40, treat: 15, checkup: 20, wc: 20, litter: 4, repair: 45, close: 5, recapture: 25, patrol: 10, sedar: 5, ferido: 0, rest: 0, idle: 6 };

// opts.clinica: clínica escolhida para internar (sem ela, a mais perto com vaga)
export function startTask(s, st, type, target, alertId = null, opts = {}) {
  if (st.ferido && type !== 'ferido') return false;
  let dest = destFor(s, type, target), modo = null, clinica = null; if (!dest) return false;
  if (type === 'treat') {
    const a = s.animals.find(a => a.id === target), T = tratamento(s, a, opts.clinica); if (!T.ok) return false;
    modo = T.modo; if (modo === 'internar') { clinica = T.clinica.id; dest = { hab: a.hab, x: a.x, z: a.z }; }
  }
  let work = WORK[type];
  if (type === 'treat' && temClinica(s)) work *= 0.6; // o bônus de tratamento é da Clínica veterinária (antes era do Centro de cuidados)
  if (type === 'recapture') { const a = s.animals.find(a => a.id === target); const S = a && content(s).species[a.sp]; if (S?.tracos.perigoso) work = 40; }
  const d = dist(st, dest);
  st.task = { type, target, alertId, phase: 'travel', dest, work, work0: work, travelLeft: (d * 1.25) / 3.5 + (st.inHab ? 2 : 0), route: null };
  if (modo) { st.task.modo = modo; if (clinica) st.task.clinica = clinica; }
  if (levaAnimal(st.task)) { const a = s.animals.find(a => a.id === target); const SA = a && content(s).species[a.sp]; st.task.vehKind = a && (['elefante', 'girafa', 'hipopotamo', 'rinoceronte'].includes(a.sp) || SA?.caminhao || (SA?.raio ?? 0) >= 0.9) ? 'caminhao' : 'jipe'; if (d > 12) { st.veh = st.task.vehKind; st.task.travelLeft = (d * 1.25) / 10; } }
  // recinto com animal perigoso solto: primeiro vai até o portão (do lado de fora) e decide como entrar com segurança
  if (entraNoRecinto(st.task) && s.settings.selvagem !== false) {
    const hid = st.task.dest.hab, h = habById(s, hid);
    if (h && perigosos(s, h).some(a => a.id !== target)) {
      const g = tileToWorld(h.gateOut[0], h.gateOut[1]); st.task.real = st.task.dest; st.task.pre = hid; st.task.dest = { hab: 0, x: g.x, z: g.z };
      if (!st.veh) st.task.travelLeft = (dist(st, g) * 1.25) / 3.5 + (st.inHab ? 2 : 0);
    }
  }
  if (entraNoRecinto(st.task)) { st.task.hab = st.task.pre || st.task.dest.hab; const h = habById(s, st.task.hab); if (h?.seg?.length) segurar(h, st); }
  return true;
}
function buildRoute(s, st, dest) {
  const pts = []; let cur = worldToTile(st.x, st.z);
  // já está dentro do mesmo recinto: anda por dentro, sem sair e entrar de novo
  if (st.inHab && dest.hab === st.inHab) { const h = habById(s, st.inHab); if (h) return h.fence === 'fosso' ? [{ x: dest.x, z: dest.z }] : routeInside(h, st, dest, 0.2); }
  if (st.inHab) { const h = habById(s, st.inHab); if (h) { const gi = tileToWorld(h.gateIn[0], h.gateIn[1]); pts.push(...(h.fence === 'fosso' ? [gi] : routeInside(h, st, gi, 0.2)), tileToWorld(h.gateOut[0], h.gateOut[1])); cur = { tx: h.gateOut[0], ty: h.gateOut[1] }; } st.inHab = 0; }
  const H = dest.hab ? habById(s, dest.hab) : null;
  const goal = H ? { tx: H.gateOut[0], ty: H.gateOut[1] } : worldToTile(dest.x, dest.z);
  const path = astar(s, cur.tx, cur.ty, goal.tx, goal.ty, (x, y) => staffPassable(s, x, y), (x, y) => (isPathT(s.terrain[idx(x, y)]) ? 1 : 1.4));
  if (path) for (const [x, y] of path) pts.push(tileToWorld(x, y));
  else if (staffPassable(s, cur.tx, cur.ty) && staffPassable(s, goal.tx, goal.ty)) return null; // destino isolado (sem caminho): não atravessa cercas
  if (H) { const gi = tileToWorld(H.gateIn[0], H.gateIn[1]); pts.push(gi); if (H.fence !== 'fosso') { pts.push(...routeInside(H, gi, dest, 0.2)); return pts; } }
  pts.push({ x: dest.x, z: dest.z });
  return pts;
}

function cancelTask(s, st) {
  const t = st.task; if (!t) return;
  if (levaAnimal(t) && t.phase !== 'travel') { const a = s.animals.find(a => a.id === t.target); if (a && (a.carriedBy === st.id || (a.sedated && !a.sedAte))) { if (a.carriedBy === st.id && t.type !== 'recapture') { const hh = habById(s, a.hab); if (hh) { const p = tileToWorld(hh.gateIn[0], hh.gateIn[1]); a.x = p.x; a.z = p.z; } } a.carriedBy = 0; a.sedated = false; a.st = 'idle'; } }
  if (levaAnimal(t)) st.veh = null;
  if (t.rec) for (const id of t.rec) { const a = s.animals.find(a => a.id === id); if (a && a.guard && !a.preso) a.guard = false; }
  if (t.alertId) { const a = s.alerts.find(a => a.id === t.alertId); if (a && a.assigned === st.id) a.assigned = null; }
  st.task = null;
}

export function dispatch(s, alertId, staffId, by = 'você', opts = {}) {
  const a = s.alerts.find(a => a.id === alertId), st = s.staff.find(x => x.id === staffId);
  if (!a || !st || st.ferido) return false;
  const type = { doenca: 'treat', fome: 'feed', cerca: 'repair', brecha: 'repair', portao: 'close', fuga: 'recapture', ferido: 'patrol' }[a.type];
  if (!type || !destFor(s, type, a.target)) return false; // sem destino: não cancela o que a pessoa já fazia
  if (type === 'treat' && !tratamento(s, s.animals.find(x => x.id === a.target), opts.clinica).ok) return false; // caso grave sem vaga na clínica
  const prev = s.staff.find(x => x.id === a.assigned); if (prev && prev !== st) cancelTask(s, prev);
  cancelTask(s, st);
  if (!startTask(s, st, type, a.target, a.id, opts)) return false;
  a.assigned = st.id; a.by = by;
  return true;
}

export const ORDER_ROLES = { feed: ['tratador'], water: ['tratador'], clean: ['tratador'], repair: ['seguranca'], close: ['seguranca', 'tratador'], treat: ['veterinario'], checkup: ['veterinario'] };
export function orderTask(s, staffId, type, target) {
  const st = s.staff.find(x => x.id === staffId); if (!st) return { ok: false, msg: 'Funcionário não encontrado.' };
  if (st.ferido) return { ok: false, msg: `${st.name} está ferido(a) e afastado(a).` };
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
  if (a.internado) return { ok: false, msg: 'O animal está internado na clínica. Espere a alta.' };
  if (st.ferido) return { ok: false, msg: `${st.name} está ferido(a) e afastado(a).` };
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
    for (const f of s.facilities) if (papel(content(s), f.type) === 'banheiro' && f.dirty > 0.5) cands.push(['wc', f.id, f.dirty * 1.2 / (1 + dist(st, tileToWorld(f.tx, f.ty)) / 40)]);
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
    case 'treat': { const a = s.animals.find(a => a.id === t.target);
      if (t.modo === 'internar') { const f = s.facilities.find(f => f.id === t.clinica); if (a && f) internar(s, a, f); else if (a) { a.carriedBy = 0; a.sedated = false; } st.veh = null; break; }
      if (a) { a.sick = false; a.health = clamp(a.health + 0.35); spend(s, 'comida', 150); log(s, `${st.name} aplicou o remédio por dardo em ${a.name}, de fora da cerca.`, 'bom'); } break; }
    case 'wc': { const f = s.facilities.find(f => f.id === t.target); if (f) f.dirty = 0; break; }
    case 'litter': delete s.litter[t.target]; break;
    case 'repair': if (h) { h.fenceHp = 1; h.breaches = []; spend(s, 'manutencao', C.fences[h.fence].custo * perimeter(h) * 0.15); if (t.alertId) log(s, `${st.name} consertou a cerca do ${h.name}.`, 'bom'); } break;
    case 'close': if (h) { h.gateOpen = false; log(s, `${st.name} fechou o portão do ${h.name}.`, 'bom'); } break;
    case 'patrol': if (h && t.alertId && h.feridoRisco) { h.feridoRisco = 0; log(s, `${st.name} conferiu o ${h.name} depois do ataque. Tudo sob controle.`, 'bom'); } if (h && h.fenceHp < 0.7) startTask(s, st, 'repair', h.id); break;
    case 'transfer': { const a = s.animals.find(a => a.id === t.target); const hh = habById(s, t.destHab);
      if (a && hh) { const from = habById(s, a.hab); const p = tileToWorld(hh.gateIn[0], hh.gateIn[1]); Object.assign(a, { hab: hh.id, sedated: false, sedAte: 0, carriedBy: 0, x: p.x, z: p.z, tgt: null, st: 'idle', stT: 2 }); a.stress = clamp(a.stress + 0.15); log(s, `${a.name} foi transferido(a) do ${from?.name || '?'} para o ${hh.name}.`, 'bom'); }
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
    // ferido (1.7.2c): 1 dia de jogo afastado no Centro de cuidados (ou perto da entrada), sem pegar tarefa
    if (st.ferido) {
      if (s.clock.min >= st.ferido) { st.ferido = 0; if (st.task?.type === 'ferido') st.task = null; log(s, `${st.name} se recuperou e voltou ao trabalho.`, 'bom'); }
      else if (st.task?.type !== 'ferido') { cancelTask(s, st); st.veh = null; startTask(s, st, 'ferido', 0); }
    }
    const working = st.task && st.task.type !== 'idle' && st.task.type !== 'rest' && st.task.type !== 'ferido';
    const drain = (working ? 0.035 : 0.008) * (trait(st, 'resistente') ? 0.6 : 1) * (1.2 - 0.08 * st.attrs.dedicacao);
    if ((st.task?.type === 'rest' || st.task?.type === 'ferido') && st.task.phase === 'work') st.energy = clamp(st.energy + (centro(s) ? 0.5 : 0.3) * hrs);
    else st.energy = clamp(st.energy - drain * hrs);
    if (!st.ferido && (!st.task || (st.task.type === 'idle' && st.energy < 0.15))) {
      if (st.task) cancelTask(s, st);
      if (st.energy < 0.15) startTask(s, st, 'rest', 0); else pickRoutine(s, st);
    }
    const t = st.task; if (!t) continue;
    if (t.type === 'recapture' && t.phase === 'travel') { const a = s.animals.find(a => a.id === t.target); if (!a || !a.escaped) { cancelTask(s, st); continue; } if (!a.escaping) { t.dest.x = a.x; t.dest.z = a.z; } }
    if ((t.type === 'transfer' || t.modo === 'internar') && t.phase === 'travel' && !t.pre) { const a = s.animals.find(a => a.id === t.target); if (!a || a.escaped || a.internado) { cancelTask(s, st); continue; } t.dest.x = a.x; t.dest.z = a.z; }
    if (levaAnimal(t) && t.phase === 'return') { const a = s.animals.find(a => a.id === t.target); if (a) { a.x = st.x - Math.sin(st.rot || 0) * 1.6; a.z = st.z - Math.cos(st.rot || 0) * 1.6; a.rot = st.rot || 0; } }
    if (t.phase === 'recolher' || t.phase === 'espera' || (t.phase === 'sedar' && t.type !== 'sedar')) {
      if (ctx.abstract) { preAbstrato(s, st, t); continue; }
      if (t.phase === 'recolher') recolherWork(s, st, t, gameMin); else if (t.phase === 'espera') esperaWork(s, st, t, gameMin); else sedarWork(s, st, t, gameMin);
      continue;
    }
    if (t.phase === 'travel' || t.phase === 'return') {
      if (ctx.abstract) {
        t.travelLeft -= gameMin;
        if (t.travelLeft <= 0) { st.x = t.dest.x; st.z = t.dest.z; st.inHab = t.dest.hab; t.route = null; arrive(s, st, t); }
      } else {
        if (!t.route) { t.route = buildRoute(s, st, t.dest); if (!t.route) { log(s, `${st.name} não encontrou caminho até o destino e voltou ao trabalho normal. Ligue o local a um caminho.`, 'ruim'); cancelTask(s, st); continue; } }
        if ((t.type === 'recapture' || ((t.type === 'transfer' || t.modo === 'internar') && !t.pre)) && t.phase === 'travel' && t.route.length) t.route[t.route.length - 1] = { x: t.dest.x, z: t.dest.z };
        const sp = (st.veh ? 7 : 1.5 * (0.8 + 0.1 * st.attrs.rapidez) * (t.alertId ? 1.4 : 1)) * ctx.moveMul;
        let left = sp * ctx.realDt;
        while (left > 0 && t.route.length) {
          const p = t.route[0], dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
          if (d <= left) { st.x = p.x; st.z = p.z; left -= d; t.route.shift(); }
          else { st.x += (dx / d) * left; st.z += (dz / d) * left; st.rot = Math.atan2(dx, dz); left = 0; }
        }
        const near = levaAnimal(t) && !t.pre && t.phase === 'travel' && (() => { const a = s.animals.find(a => a.id === t.target); return a && dist(st, a) < 7; })();
        if (!t.route.length || near) { st.inHab = t.dest.hab; t.route = null; arrive(s, st, t); }
      }
    } else {
      if (t.type === 'rest') { if (st.energy >= 0.95) st.task = null; continue; }
      if (t.type === 'ferido') continue;
      if (levaAnimal(t)) { recaptureWork(s, st, t, gameMin, ctx); continue; }
      if (t.type === 'sedar') { sedarWork(s, st, t, gameMin); continue; }
      if (t.type === 'treat' && !ctx.abstract) { const a = s.animals.find(a => a.id === t.target); if (a) { st.rot = Math.atan2(a.x - st.x, a.z - st.z); t.alvo = a.id; } }
      if (t.type === 'clean' && !ctx.abstract) { cleanWork(s, st, t, gameMin, ctx); continue; }
      t.work -= gameMin * workMul(st);
      const h = habById(s, t.target), prog = 1 - Math.max(0, t.work) / (t.work0 || 1);
      if (h && t.type === 'repair') { t.hp0 ??= h.fenceHp; h.fenceHp = t.hp0 + (1 - t.hp0) * prog; }
      if (h && t.type === 'feed') { t.f0 ??= h.food; h.food = t.f0 + (1 - t.f0) * prog; }
      if (h && t.type === 'water') { t.w0 ??= h.waterLvl; h.waterLvl = t.w0 + (1 - t.w0) * prog; }
      if (t.work <= 0) completeTask(s, st);
    }
  }
  seguraTocas(s, ctx);
}

// ---------- fases: chegada, captura e limpeza ----------
function arrive(s, st, t) {
  if (t.pre && t.phase === 'travel') return noPortao(s, st, t);
  if (t.type === 'sedar' && t.phase === 'travel') { const h = habById(s, t.target); if (h) st.rot = Math.atan2(tileToWorld(h.gateIn[0], h.gateIn[1]).x - st.x, tileToWorld(h.gateIn[0], h.gateIn[1]).z - st.z); t.phase = 'work'; t.work = 5; t.work0 = 5; return; }
  if (levaAnimal(t) && t.phase === 'travel') {
    const a = s.animals.find(a => a.id === t.target); if (!a) return cancelTask(s, st);
    t.phase = 'sedate'; t.work = st.role === 'veterinario' ? 6 : 9; t.work0 = t.work; t.shotAt = s.clock.min;
    a.sedated = true; a.sedAte = 0; a.st = 'sedado'; a.tgt = null; st.rot = Math.atan2(a.x - st.x, a.z - st.z);
    log(s, `${st.name} aplicou um dardo tranquilizante em ${a.name}.`, 'info'); return;
  }
  if (levaAnimal(t) && t.phase === 'return') { t.phase = 'release'; t.work = 4; t.work0 = 4; if (t.type !== 'recapture') { st.inHab = 0; } return; }
  t.phase = 'work';
}
function recaptureWork(s, st, t, gameMin, ctx) {
  const a = s.animals.find(a => a.id === t.target);
  if (!a || (t.type === 'recapture' && !a.escaped && t.phase !== 'release') || (t.type !== 'recapture' && (a.escaped || a.internado))) return cancelTask(s, st);
  t.work -= gameMin * workMul(st);
  if (t.work > 0) return;
  if (t.phase === 'sedate') { t.phase = 'load'; t.work = 3; t.work0 = 3; st.veh = t.vehKind; return; }
  if (t.phase === 'load') {
    a.carriedBy = st.id;
    if (t.modo === 'internar') { const f = s.facilities.find(f => f.id === t.clinica); if (!f) return cancelTask(s, st); const p = portaClinica(s, f); t.phase = 'return'; t.dest = { hab: 0, x: p.x, z: p.z }; t.route = null; t.travelLeft = (dist(st, p) * 1.25) / 10; return; }
    const h = habById(s, t.type === 'transfer' ? t.destHab : a.hab); if (!h) return cancelTask(s, st);
    const p = tileToWorld(h.gateOut[0], h.gateOut[1]);
    t.phase = 'return'; t.dest = { hab: 0, x: p.x, z: p.z }; t.route = null; t.travelLeft = (dist(st, p) * 1.25) / 10; return;
  }
  if (t.phase === 'release') completeTask(s, st);
}
// ---------- 1.7.2c: serviços dentro de recinto com animal perigoso ----------
// No portão (do lado de fora): recolhe nas tocas quem cabe (chamando de fora), pede ao veterinário para sedar quem sobra e só
// então entra. Ataque em 3 casos: sem toca/vaga e sem veterinário; funcionário distraído que esquece; sedativo que acaba.
const exclDe = t => (levaAnimal(t) ? t.target : null);
const segurar = (h, st) => { h.seg ||= []; if (!h.seg.includes(st.id)) h.seg.push(st.id); };
function entrar(s, st, t) {
  if (t.svc) { t.work = t.svc.work; t.work0 = t.svc.work0; t.svc = null; }
  const g = { x: st.x, z: st.z }; t.dest = t.real || t.dest; t.real = null; t.pre = 0; t.phase = 'travel'; t.route = null; t.alvo = null;
  t.travelLeft = (dist(g, t.dest) * 1.25) / 3.5 + 1;
}
function noPortao(s, st, t) {
  const h = habById(s, t.pre); if (!h) return entrar(s, st, t);
  t.svc ||= { work: t.work, work0: t.work0 };
  st.rot = Math.atan2(tileToWorld(h.gateIn[0], h.gateIn[1]).x - st.x, tileToWorld(h.gateIn[0], h.gateIn[1]).z - st.z);
  const P = planoServico(s, h, exclDe(t)); if (!P.total) return entrar(s, st, t);
  segurar(h, st);
  if (trait(st, 'distraido') && rnd(s) < 0.3) { t.risco = 'distraido'; log(s, `${st.name} (distraído) esqueceu de recolher os animais perigosos e entrou no ${h.name}.`, 'ruim'); return s._ctx?.abstract ? preAbstrato(s, st, t, P) : entrar(s, st, t); }
  if (s._ctx?.abstract) return preAbstrato(s, st, t, P);
  t.rec = P.cabem.map(x => x.a.id); t.sob = P.sobram.map(a => a.id);
  if (t.rec.length) { for (const { a, t: tc } of P.cabem) chamar(s, a, h, tc); t.phase = 'recolher'; t.work = 30; t.work0 = 30; t.forcou = 0; return; }
  depoisRecolher(s, st, t, h);
}
function chamar(s, a, h, tc) {
  if (a.toca === tc.id && dentro(a)) { a.guard = true; if (a.st === 'toca_out') a.st = 'toca_in'; return; }
  mandarParaToca(s, a, h, tc, true);
}
// o funcionário fica no portão chamando os animais; cada um entra numa toca e a porta fecha
function recolherWork(s, st, t, gameMin) {
  const h = habById(s, t.pre); if (!h) return cancelTask(s, st);
  t.work -= gameMin; const rec = [], sob = t.sob || [];
  for (const id of t.rec || []) {
    const a = s.animals.find(a => a.id === id); if (!a || a.hab !== h.id || a.escaped || a.sedated) continue;
    if (a.st === 'in_toca' && a.guard && a.toca != null) { if (!a.preso) { a.preso = true; const tc = tocaById(s, a.toca); if (tc) tc.fechada = true; } rec.push(id); continue; }
    if (!(a.guard && (a.st === 'toca_go' || a.st === 'toca_in'))) { const tc = (a.toca != null && tocaById(s, a.toca)) || tocaLivre(s, a, h, true); if (!tc) { sob.push(id); continue; } chamar(s, a, h, tc); }
    if (t.work <= 0 && t.forcou) { a.guard = false; if (a.st === 'toca_go' || a.st === 'toca_in') { a.st = 'idle'; a.stT = 1; a.toca = null; } sob.push(id); continue; } // não entrou nem conduzido: vai para a sedação
    if (t.work <= 0) { const tc = tocaById(s, a.toca) || tocaLivre(s, a, h, true); if (tc) { a.toca = tc.id; a.guard = true; a.st = 'toca_in'; a.tgt = null; a.wp = null; } } // demorou: o funcionário conduz até a porta
    rec.push(id);
  }
  if (t.work <= 0) { if (t.forcou) { t.rec = rec.filter(id => s.animals.find(a => a.id === id)?.preso); } else { t.forcou = 1; t.work = 10; t.rec = rec; } }
  else t.rec = rec;
  t.sob = sob;
  if (t.rec.every(id => s.animals.find(a => a.id === id)?.preso)) { if (t.rec.length) log(s, `${st.name} recolheu ${t.rec.length} animal(is) perigoso(s) nas tocas do ${h.name} antes de entrar.`, 'info'); depoisRecolher(s, st, t, h); }
}
// quem não coube nas tocas: o veterinário seda de fora da cerca (se o próprio funcionário for veterinário, ele mesmo seda)
function depoisRecolher(s, st, t, h) {
  t.sob = (t.sob || []).filter(id => { const a = s.animals.find(a => a.id === id); return a && a.hab === h.id && !a.escaped && perigoDe(s, a) >= PERIGOSO; });
  if (!t.sob.length) return entrar(s, st, t);
  if (st.role === 'veterinario') { t.phase = 'sedar'; t.sedFila = t.sob.slice(); t.work = 5; t.work0 = 5; return; }
  const v = vetPara(s, h, st);
  if (v === 'ja') { t.phase = 'espera'; t.esperaAte = s.clock.min + 120; return; }
  if (v) { cancelTask(s, v); if (startTask(s, v, 'sedar', h.id)) { v.task.sedFila = t.sob.slice(); v.task.para = st.id; t.phase = 'espera'; t.esperaAte = s.clock.min + 120; log(s, `${st.name} chamou ${v.name} para sedar ${t.sob.length} animal(is) perigoso(s) do ${h.name} (sem vaga nas tocas).`, 'info'); return; } }
  t.risco = 'semvet'; log(s, `Sem toca e sem veterinário livre: ${st.name} entrou no ${h.name} com ${t.sob.length} animal(is) perigoso(s) solto(s).`, 'ruim');
  entrar(s, st, t);
}
// veterinário que pode sedar agora (o mais perto, sem emergência); 'ja' = já há um a caminho deste recinto
export function vetPara(s, h, quem) {
  if (s.staff.some(o => o.task?.type === 'sedar' && o.task.target === h.id && !o.ferido)) return 'ja';
  const g = tileToWorld(h.gateOut[0], h.gateOut[1]);
  const L = s.staff.filter(v => v !== quem && v.role === 'veterinario' && !v.ferido && v.energy > 0.1 && !v.task?.alertId && !v.task?.manual && !['sedar', 'treat', 'transfer', 'recapture'].includes(v.task?.type) && !PRE_FASE[v.task?.phase]);
  return L.sort((a, b) => dist(a, g) - dist(b, g))[0] || null;
}
function esperaWork(s, st, t, gameMin) {
  const h = habById(s, t.pre); if (!h) return cancelTask(s, st);
  const ex = exclDe(t), soltos = perigosos(s, h).filter(a => a.id !== ex && !(a.guard && (t.rec || []).includes(a.id)));
  if (!soltos.length) return entrar(s, st, t);
  if (s.clock.min > (t.esperaAte || 0)) { t.risco = 'semvet'; log(s, `${st.name} cansou de esperar o veterinário e entrou no ${h.name} com animal perigoso solto.`, 'ruim'); return entrar(s, st, t); }
  if (!s.staff.some(o => o.task?.type === 'sedar' && o.task.target === h.id)) { t.tent = (t.tent || 0) + 1; t.sob = soltos.map(a => a.id); if (t.tent > 3) { t.risco = 'semvet'; return entrar(s, st, t); } depoisRecolher(s, st, t, h); }
}
function sedarWork(s, st, t, gameMin) {
  const h = habById(s, t.type === 'sedar' ? t.target : t.pre); if (!h) return cancelTask(s, st);
  if (!t.sedFila) t.sedFila = planoServico(s, h).sobram.map(a => a.id);
  t.sedFila = t.sedFila.filter(id => { const a = s.animals.find(a => a.id === id); return a && a.hab === h.id && !a.escaped && !a.sedated && perigoDe(s, a) >= PERIGOSO; });
  if (!t.sedFila.length) { t.alvo = null; if (t.type === 'sedar') { st.task = null; return; } return entrar(s, st, t); }
  const a = s.animals.find(x => x.id === t.sedFila[0]); t.alvo = a.id; st.rot = Math.atan2(a.x - st.x, a.z - st.z);
  t.work -= gameMin * workMul(st);
  if (t.work > 0) return;
  sedarNoLugar(s, a); spend(s, 'comida', SED_CUSTO);
  log(s, `${st.name} sedou ${a.name} com um dardo, de fora da cerca (R$ ${SED_CUSTO}).`, 'info');
  t.sedFila.shift(); t.work = 5; t.work0 = 5;
}
// app fechado/relógio avançado: recolher e sedar viram tempo extra; o ataque vira uma chance por serviço
function preAbstrato(s, st, t, P) {
  const h = habById(s, t.pre); if (!h) return entrar(s, st, t);
  P ||= planoServico(s, h, exclDe(t));
  let extra = 0, risco = 0;
  if (t.risco) risco = 0.25;
  else if (P.total) {
    extra += P.cabem.length * 4;
    if (P.sobram.length) {
      const vet = st.role === 'veterinario' || s.staff.some(v => v.role === 'veterinario' && !v.ferido && v !== st);
      if (vet) { for (const a of P.sobram) { a.stress = clamp(a.stress + 0.1); spend(s, 'comida', SED_CUSTO); } extra += 5 * P.sobram.length; const dur = (t.svc?.work0 ?? t.work0 ?? 20) / workMul(st); if (dur > SED_MIN - 5) risco = 0.2; }
      else risco = 0.25;
    }
  }
  const quem = P.sobram[0] || P.cabem[0]?.a || perigosos(s, h)[0];
  for (const id of t.rec || []) { const a = s.animals.find(a => a.id === id); if (a) a.guard = false; }
  t.rec = null; t.sob = null; t.sedFila = null; t.risco = null;
  entrar(s, st, t); t.travelLeft += extra;
  if (quem && risco && rnd(s) < risco) atacarFuncionario(s, st, quem, !!s.settings.tranquilo);
}
// enquanto alguém da equipe estiver no recinto (ou com serviço nele), os recolhidos ficam nas tocas; depois são soltos
function seguraTocas(s, ctx) {
  if (ctx.abstract) return;
  for (const h of s.habitats) {
    if (!h.seg?.length) continue;
    h.seg = h.seg.filter(id => { const st = s.staff.find(x => x.id === id); return st && !st.ferido && (st.task?.hab === h.id || insideAt(h, st.x, st.z, 0)); });
    if (!h.seg.length) soltarTocas(s, h);
  }
}
// ataque a funcionário: sem mortes. Modo Tranquilo: o animal só ameaça e o serviço atrasa
export function atacarFuncionario(s, st, a, manso) {
  const h = habById(s, a.hab), S = content(s).species[a.sp];
  if (manso) {
    if (st.task) { st.task.work = (st.task.work || 0) + 15; st.task.work0 = (st.task.work0 || 0) + 15; }
    if (!st._amea || s.clock.min - st._amea > 60) { st._amea = s.clock.min; log(s, `${a.name} (${S?.nome || '?'}) ameaçou ${st.name} no ${h?.name || 'recinto'}. O serviço atrasou.`, 'info'); }
    return;
  }
  cancelTask(s, st); st.veh = null; st.ferido = s.clock.min + 1440;
  if (h) { h.feridoRisco = s.clock.min + 120; h.feridoNome = st.name; }
  s.stats.feridos = (s.stats.feridos || 0) + 1;
  log(s, `${a.name} (${S?.nome || '?'}) atacou ${st.name} no ${h?.name || 'recinto'}. Ninguém morreu, mas ${st.name} se feriu e fica 1 dia de jogo afastado(a).`, 'perigo');
  startTask(s, st, 'ferido', 0);
  refreshAlerts(s);
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
    if (h.feridoRisco && s.clock.min < h.feridoRisco) want.push(['ferido', h.id]); else if (h.feridoRisco) h.feridoRisco = 0;
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
    if (s._ctx?.stopOnAlert && !s._ctx.critical) s._ctx.critical = `${ALERT_INFO[type].nome}: ${alertTargetName(s, { type, target })}`;
    const nm = alertTargetName(s, { type, target });
    log(s, `${ALERT_INFO[type].nome}: ${nm}`, type === 'cerca' || type === 'portao' || type === 'fuga' || type === 'brecha' ? 'perigo' : 'ruim');
  }
}
export function alertTargetName(s, a) {
  if (a.type === 'doenca' || a.type === 'fuga') { const x = s.animals.find(b => b.id === a.target); return x ? `${x.name} (${content(s).species[x.sp]?.nome || '?'})` : '?'; }
  const h = habById(s, a.target); if (a.type === 'ferido' && h?.feridoNome) return `${h.feridoNome} no ${h.name}`;
  return h?.name || '?';
}
export function alertPos(s, a) {
  if (a.type === 'doenca' || a.type === 'fuga') { const x = s.animals.find(b => b.id === a.target); return x ? { x: x.x, z: x.z } : null; }
  const h = habById(s, a.target); if (!h) return null;
  if (a.type === 'brecha' && h.breaches?.length) { const p = breachPoint(h, h.breaches[0]); return p.outer; }
  if (a.type === 'cerca' || a.type === 'portao' || a.type === 'brecha') return tileToWorld(h.gateOut[0], h.gateOut[1]);
  const c = centerCell(h); return tileToWorld(c[0], c[1]);
}
export function eligibleStaff(s, a) {
  const roles = ALERT_ROLES[a.type], p = alertPos(s, a) || { x: 0, z: 0 };
  return s.staff.filter(st => roles.includes(st.role) && !st.ferido).map(st => ({ st, d: dist(st, p), busyAlert: !!st.task?.alertId && st.task.alertId !== a.id }))
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
