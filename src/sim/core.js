import { content, APP_VERSION } from '../content/registry.js';
import { NOMES, TRACOS_EQUIPE, TRACOS_GERENTE, BASE_PACK } from '../content/base.js';
const BASE_SPECIES = BASE_PACK.species;
import { clamp, rnd, pick, uid, log, hourOf } from './util.js';
import { MAP, idx, rebuildOcc, tileToWorld, AREAS, isPathT } from './grid.js';
import { updateAnimals, hourlyAnimals, dailyAnimals, habInfo } from './animals.js';
import { updateStaff, refreshAlerts, managerTick, spend, earn, recalcClean } from './staff.js';
import { updateVisitors, arrivalRate, arrive, isOpen, litterCount, seedCrowd } from './visitors.js';

export const SCHEMA = 9;
export const SPEEDS = [0, 1, 2, 3]; // multiplicador da velocidade normal
export const MES = 30;
// segundos de jogo por segundo real na velocidade normal (depende da hora: dia devagar, noite rápida)
export function timeFactor(s) { const T = content(s).tempo, h = hourOf(s.clock.min); return 60 / (h >= T.inicioDia && h < T.fimDia ? T.minutosPorHoraDia : T.minutosPorHoraNoite); }
export const H2 = 2 * 3600e3, H72 = 72 * 3600e3;
export const VAGAS = [1, 1, 2, 3];

export const DEFAULT_SETTINGS = () => ({ quality: 'baixo', fugas: true, tranquilo: false, autoQualidade: true, mostrarFps: false, telaLigada: true, economia: true, subSoFechado: true, pausaAlerta: true, selvagem: true, som: true, volume: 0.7, ambiente: true, tutorial: { passo: 0, feito: false } });
export function newGame(now = Date.now(), opts = {}) {
  const s = {
    schemaVersion: SCHEMA, gameVersion: APP_VERSION, packs: { base: '1.0.0' }, rng: (now % 2147483647) | 0, nextId: 1,
    clock: { min: 7 * 60, day: 0, speed: 1, lastRealTs: now },
    money: opts.tranquilo ? 120000 : 60000, ticket: 30, areaLevel: 0,
    terrain: new Array(MAP * MAP).fill('g'), height: new Array((MAP + 1) * (MAP + 1)).fill(0), litter: {},
    habitats: [], facilities: [], objects: [], tocas: [], furn: [], vstock: [], animals: [], staff: [], managers: [], visitors: [],
    policies: { doencaPrimeiro: true, segurancaPrimeiro: false, fugaImediata: true },
    candidates: [], hiring: { nextAt: now + H2 },
    alerts: [], metas: {}, settings: { ...DEFAULT_SETTINGS(), tranquilo: !!opts.tranquilo, fugas: !opts.tranquilo },
    stats: { today: blankDay(), history: [], rep: { animais: 0.3, sustent: 0.6, educacao: 0, experiencia: 0.5, total: 0.35 }, sat: 0.6, visitantesHoje: 0, visitorsIn: 0, mortes: 0, feridos: 0 },
    log: [], acc: { hour: 0, q: 0, arr: 0 }, fin: { pendente: { salarios: 0, manutencao: 0 }, meses: [], novo: null },
  };
  // layout inicial: entrada ao sul e caminhos principais
  s.facilities.push({ id: uid(s), type: 'entrada', tx: 35, ty: 51, pack: 'base' });
  for (let y = 36; y <= 50; y++) for (let x = 35; x <= 36; x++) s.terrain[idx(x, y)] = 'p';
  for (let x = 23; x <= 48; x++) for (let y = 36; y <= 37; y++) s.terrain[idx(x, y)] = 'p';
  for (let y = 24; y <= 35; y++) { s.terrain[idx(23, y)] = 'p'; s.terrain[idx(48, y)] = 'p'; }
  for (let x = 23; x <= 48; x++) s.terrain[idx(x, 24)] = 'p';
  // decoração fora da área
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd(s) * MAP), y = Math.floor(rnd(s) * MAP);
    if (x >= 19 && x <= 52 && y >= 19 && y <= 52) continue;
    s.objects.push({ id: uid(s), type: rnd(s) < 0.5 ? 'acacia' : rnd(s) < 0.5 ? 'arvore_floresta' : 'arbusto', tx: x, ty: y, rot: rnd(s) * 6.28, sc: 0.8 + rnd(s) * 0.5, pack: 'base', deco: true });
  }
  rebuildOcc(s);
  fillCandidates(s, now, 10);
  log(s, 'Bem-vindo ao seu zoológico! Construa um habitat e contrate sua equipe.', 'bom');
  return s;
}
export function blankDay() { return { inc: { ingressos: 0, lanches: 0, loja: 0, metas: 0 }, exp: { salarios: 0, comida: 0, manutencao: 0, construcao: 0, animais: 0 } }; }

// ---------- passo principal ----------
export function step(s, gameMin, ctx) {
  s._ctx = ctx;
  s.clock.min += gameMin;
  s.acc.q += gameMin; s.acc.hour += gameMin;
  updateAnimals(s, gameMin, ctx);
  updateStaff(s, gameMin, ctx);
  if (isOpen(s)) { s.acc.arr += (arrivalRate(s) * gameMin) / 60; while (s.acc.arr >= 1) { s.acc.arr--; arrive(s, ctx); } }
  updateVisitors(s, gameMin, ctx);
  if (s.acc.q >= 15) { const q = s.acc.q; s.acc.q = 0; s._qt = (s._qt || 0) + 1; refreshAlerts(s); if ((ctx.abstract && !ctx.noManager) || !s.settings.subSoFechado) managerTick(s, q); }
  while (s.acc.hour >= 60) { s.acc.hour -= 60; hourTick(s); }
  const d = Math.floor(s.clock.min / 1440);
  if (d !== s.clock.day) { s.clock.day = d; dayTick(s); }
}

function hourTick(s) {
  const C = content(s);
  for (const h of s.habitats) {
    const n = s.animals.filter(a => a.hab === h.id && !a.escaped).length;
    const F = C.fences[h.fence];
    let push = 0; for (const a of s.animals) if (a.hab === h.id && !a.escaped && C.species[a.sp]) push += (C.species[a.sp].tracos.forca / 10) * a.stress * 0.8;
    if (F) h.fenceHp = clamp(h.fenceHp - (F.desgaste / 24) * (1 + 0.1 * n + (F.fosso ? 0 : push)));
    recalcClean(s, h);
  }
  hourlyAnimals(s);
  // satisfação da equipe
  const lider = s.managers.some(m => m.traits.includes('lider'));
  for (const st of [...s.staff, ...s.managers]) {
    const target = clamp((st.salary / st.expected) * 0.7 + (s.facilities.some(f => f.type === 'centro') ? 0.3 : 0.15) + (lider ? 0.1 : 0), 0, 1);
    st.sat = clamp(st.sat + (target - st.sat) * (st.traits?.includes('reclamao') ? 0.25 : 0.1) - (st.traits?.includes('reclamao') ? 0.01 : 0));
  }
  updateRep(s);
  checkMetas(s);
}
export function updateRep(s) {
  const r = s.stats.rep, C = content(s);
  const an = s.animals.filter(a => C.species[a.sp]);
  r.animais = an.length ? an.reduce((t, a) => t + a.welfare, 0) / an.length : 0.25;
  let pathTiles = 0; for (let i = 0; i < MAP * MAP; i++) if (isPathT(s.terrain[i])) pathTiles++;
  const plants = s.objects.filter(o => !o.deco).length;
  r.sustent = clamp(1 - litterCount(s) / (8 + pathTiles * 0.15)) * 0.7 + 0.3 * clamp(plants / 30);
  const habs = s.habitats.filter(h => an.some(a => a.hab === h.id));
  const placas = s.facilities.filter(f => f.type === 'placa');
  const withSign = habs.filter(h => placas.some(p => p.tx >= h.x - 3 && p.tx <= h.x + h.w + 2 && p.ty >= h.y - 3 && p.ty <= h.y + h.h + 2)).length;
  r.educacao = habs.length ? withSign / habs.length : 0;
  r.experiencia = s.stats.sat;
  const fug = s.animals.some(a => a.escaped) ? 0.15 : 0;
  const target = clamp((r.animais + r.sustent + r.educacao + r.experiencia) / 4 - fug);
  r.total = clamp(r.total + (target - r.total) * 0.2);
}
export function fixedDaily(s) { const C = content(s); return [...s.staff, ...s.managers].reduce((t, p) => t + p.salary, 0) + s.facilities.reduce((t, f) => t + (C.facilities[f.type]?.manut || 0), 0); }
function closeMonth(s) {
  const P = s.fin.pendente, mes = s.clock.day / MES;
  const dias = s.stats.history.slice(-MES);
  const receitas = dias.reduce((t, d) => t + d.inc, 0), consumo = dias.reduce((t, d) => t + d.exp, 0);
  const visitantes = dias.reduce((t, d) => t + d.visitantes, 0);
  const cat = {}; for (const d of dias) for (const [k, v] of Object.entries(d.det.exp)) cat[k] = (cat[k] || 0) + v;
  spend(s, 'salarios', P.salarios); spend(s, 'manutencao', P.manutencao);
  const fixos = P.salarios + P.manutencao;
  const n = Math.max(1, dias.length);
  const rep = { mes, receitas, consumo, fixos, salarios: P.salarios, manutencao: P.manutencao, saldo: receitas - consumo - fixos, visitantes, cat, caixa: s.money,
    previsao: { receitas: ((receitas - dias.reduce((t, d) => t + (d.det.inc.metas || 0), 0)) / n) * MES, consumo: ((consumo - (cat.construcao || 0) - (cat.animais || 0)) / n) * MES, fixos: fixedDaily(s) * MES } };
  rep.previsao.saldo = rep.previsao.receitas - rep.previsao.consumo - rep.previsao.fixos;
  s.fin.meses.push(rep); if (s.fin.meses.length > 24) s.fin.meses.shift();
  s.fin.pendente = { salarios: 0, manutencao: 0 }; s.fin.novo = mes;
  log(s, `Fechamento do mês ${mes}: salários e manutenção pagos (R$ ${Math.round(fixos).toLocaleString('pt-BR')}). Saldo do mês: R$ ${Math.round(rep.saldo).toLocaleString('pt-BR')}.`, rep.saldo >= 0 ? 'bom' : 'ruim');
}
export const stars = s => Math.round(s.stats.rep.total * 50) / 10;

function dayTick(s) {
  const C = content(s);
  // salários e manutenção se acumulam e são pagos no fechamento do mês
  s.fin ||= { pendente: { salarios: 0, manutencao: 0 }, meses: [], novo: null };
  for (const st of [...s.staff, ...s.managers]) s.fin.pendente.salarios += st.salary;
  for (const f of s.facilities) s.fin.pendente.manutencao += C.facilities[f.type]?.manut || 0;
  dailyAnimals(s);
  for (const st of [...s.staff]) if (st.sat < 0.25 && rnd(s) < 0.3) { fireById(s, st.id); log(s, `${st.name} pediu demissão (insatisfação).`, 'ruim'); }
  const t = s.stats.today, inc = Object.values(t.inc).reduce((a, b) => a + b, 0), exp = Object.values(t.exp).reduce((a, b) => a + b, 0);
  s.stats.history.push({ dia: s.clock.day, inc, exp, visitantes: s.stats.visitantesHoje, det: t });
  if (s.stats.history.length > 30) s.stats.history.shift();
  s.stats.today = blankDay(); s.stats.visitantesHoje = 0;
  if (s.clock.day > 0 && s.clock.day % MES === 0) closeMonth(s);
  if (s.money < -20000) log(s, 'O caixa está muito negativo. Ajuste preços ou corte custos.', 'ruim');
}

// ---------- contratação ----------
const ROLE_W = [['tratador', 35], ['faxineiro', 20], ['seguranca', 20], ['veterinario', 15], ['subgerente', 10]];
export function genCandidate(s, now) {
  let r = rnd(s) * 100, role = 'tratador'; for (const [k, w] of ROLE_W) { r -= w; if (r <= 0) { role = k; break; } }
  const A = () => 1 + Math.floor(Math.pow(rnd(s), 0.9) * 5);
  const mgr = role === 'subgerente';
  const attrs = mgr ? { decisao: A(), rapidez: A(), economia: A() } : { habilidade: A(), rapidez: A(), dedicacao: A() };
  const avg = Object.values(attrs).reduce((a, b) => a + b, 0) / 3;
  const base = content(s).roles[role].salario;
  const expected = Math.round(base * (0.7 + 0.1 * avg));
  const ask = Math.round((expected * (0.9 + rnd(s) * 0.3)) / 5) * 5;
  const pool = Object.keys(mgr ? TRACOS_GERENTE : TRACOS_EQUIPE);
  return { id: uid(s), role, name: pick(s, NOMES) + ' ' + pick(s, ['Silva', 'Souza', 'Lima', 'Costa', 'Rocha', 'Alves', 'Melo', 'Dias', 'Reis', 'Nunes']),
    attrs, expected, salary: ask, hidden: rnd(s) < 0.55 ? [pick(s, pool)] : [], createdAt: now, expiresAt: now + H72 };
}
export function fillCandidates(s, now, n) {
  for (let i = 0; i < n; i++) { s.candidates.push(genCandidate(s, now)); if (s.candidates.length > 10) s.candidates.shift(); }
}
export function hiringTick(s, now) {
  s.candidates = s.candidates.filter(c => c.expiresAt > now);
  let guard = 0;
  while (now >= s.hiring.nextAt && guard++ < 50) { fillCandidates(s, s.hiring.nextAt, 1); s.hiring.nextAt += H2; }
  s.candidates = s.candidates.filter(c => c.expiresAt > now);
}
export function hire(s, candId) {
  const c = s.candidates.find(c => c.id === candId); if (!c) return { ok: false, msg: 'Candidato não encontrado.' };
  if (c.role === 'subgerente' && s.managers.length >= VAGAS[s.areaLevel]) return { ok: false, msg: `Sem vaga de subgerente (vagas: ${VAGAS[s.areaLevel]}). Inaugure novas áreas para abrir vagas.` };
  s.candidates.splice(s.candidates.indexOf(c), 1);
  const e = s.facilities.find(f => f.type === 'entrada'), p = tileToWorld(e.tx, e.ty - 1);
  const person = { id: c.id, role: c.role, name: c.name, attrs: c.attrs, traits: c.hidden, salary: c.salary, expected: c.expected, energy: 1, sat: 0.8, x: p.x, z: p.z, rot: Math.PI, inHab: 0, task: null, ferido: 0, pack: 'base' };
  if (c.role === 'subgerente') s.managers.push(person); else s.staff.push(person);
  log(s, `${c.name} foi contratado(a) como ${content(s).roles[c.role].nome.toLowerCase()}.`, 'bom');
  return { ok: true, person };
}
export function fireById(s, id) {
  const st = s.staff.find(x => x.id === id);
  if (st) { if (st.task?.alertId) { const a = s.alerts.find(a => a.id === st.task.alertId); if (a) a.assigned = null; } s.staff.splice(s.staff.indexOf(st), 1); return true; }
  const m = s.managers.find(x => x.id === id); if (m) { s.managers.splice(s.managers.indexOf(m), 1); return true; }
  return false;
}
export function expandArea(s, now = Date.now()) {
  if (s.areaLevel >= AREAS.length - 1) return { ok: false, msg: 'O parque já está no tamanho máximo.' };
  const cost = AREAS[s.areaLevel + 1].custo;
  if (s.money < cost) return { ok: false, msg: 'Dinheiro insuficiente.' };
  spend(s, 'construcao', cost); s.areaLevel++;
  fillCandidates(s, now, 10);
  log(s, `Nova área inaugurada! Chegaram novos currículos.`, 'bom');
  return { ok: true };
}

// ---------- metas opcionais ----------
export const METAS = [
  { id: 'hab1', nome: 'Primeiro habitat', desc: 'Construa um habitat.', premio: 2000, ok: s => s.habitats.length >= 1 },
  { id: 'ani3', nome: 'Primeiros moradores', desc: 'Tenha 3 animais.', premio: 3000, ok: s => s.animals.length >= 3 },
  { id: 'eq4', nome: 'Equipe formada', desc: 'Contrate 4 funcionários.', premio: 2000, ok: s => s.staff.length >= 4 },
  { id: 'lanche', nome: 'Comida para todos', desc: 'Construa uma lanchonete.', premio: 1500, ok: s => s.facilities.some(f => f.type === 'lanchonete') },
  { id: 'centro', nome: 'Cuidado de verdade', desc: 'Construa o centro de cuidados básicos.', premio: 4000, ok: s => s.facilities.some(f => f.type === 'centro') },
  { id: 'sat', nome: 'Visitante feliz', desc: 'Satisfação média acima de 70% com 20 visitantes no dia.', premio: 3000, ok: s => s.stats.sat > 0.7 && s.stats.visitantesHoje >= 20 },
  { id: 'est3', nome: '3 estrelas', desc: 'Alcance 3 estrelas de reputação.', premio: 8000, ok: s => s.stats.rep.total >= 0.6 },
  { id: 'gestor', nome: 'Gestor de verdade', desc: 'Contrate um subgerente.', premio: 5000, ok: s => s.managers.length >= 1 },
  { id: 'cinco', nome: 'Os cinco', desc: 'Tenha leão, zebra, elefante, girafa e macaco.', premio: 15000, ok: s => ['leao', 'zebra', 'elefante', 'girafa', 'macaco'].every(sp => s.animals.some(a => a.sp === sp)) },
  { id: 'colecao', nome: 'Coleção completa', desc: 'Tenha as 10 espécies do jogo base ao mesmo tempo.', premio: 40000, ok: s => Object.keys(BASE_SPECIES).every(sp => s.animals.some(a => a.sp === sp)) },
  { id: 'bem', nome: 'Bem-estar exemplar', desc: 'Bem-estar médio acima de 85% com 8 animais ou mais.', premio: 10000, ok: s => s.animals.length >= 8 && s.stats.rep.animais > 0.85 },
  { id: 'est5', nome: '5 estrelas', desc: 'Alcance 5 estrelas de reputação.', premio: 25000, ok: s => s.stats.rep.total >= 0.95 },
];
export function checkMetas(s) {
  for (const m of METAS) if (!s.metas[m.id] && m.ok(s)) { s.metas[m.id] = s.clock.min; earn(s, 'metas', m.premio); log(s, `Meta concluída: ${m.nome} (+R$ ${m.premio.toLocaleString('pt-BR')})`, 'bom'); }
}

// ---------- simulação abstrata: app fechado e avanço de relógio ----------
export function simulateAbstract(s, gameMinutes, { stopOnCritical = false, now = Date.now(), noManager = false, stopOnAlert = false } = {}) {
  const before = { money: s.money, animals: s.animals.length, logLen: s.log.length, min: s.clock.min, cand: s.candidates.length };
  const ctx = { abstract: true, realDt: 0, moveMul: 0, now, critical: null, noManager, stopOnAlert };
  let left = gameMinutes;
  while (left > 0.0001) { const dt = Math.min(10, left); step(s, dt, ctx); left -= dt; if (stopOnCritical && ctx.critical) break; }
  s._ctx = null;
  hiringTick(s, now);
  return { minutos: s.clock.min - before.min, dinheiro: s.money - before.money, animais: s.animals.length - before.animals,
    eventos: s.log.slice(before.logLen), parou: stopOnCritical ? ctx.critical : null, alertas: s.alerts.length, curriculos: s.candidates.length - before.cand };
}
export function catchUp(s, now = Date.now()) {
  const raw = now - (s.clock.lastRealTs || now);
  const elapsed = Math.max(0, Math.min(raw, H72));
  s.clock.lastRealTs = now;
  if (elapsed < 60e3) { hiringTick(s, now); seedCrowd(s); return null; }
  const rep = simulateAbstract(s, elapsed / 60e3, { now });
  seedCrowd(s);
  rep.limitado = raw > H72; rep.realMin = elapsed / 60e3;
  return rep;
}
export { seedCrowd };
export function advanceTo(s, hour = 7, now = Date.now()) {
  const h = hourOf(s.clock.min);
  let mins = ((hour - h + 24) % 24) * 60; if (mins < 30) mins += 1440;
  // com o jogo aberto o jogador é o responsável pelos alertas: o subgerente não age e o avanço para no primeiro alerta novo
  const mine = s.settings.subSoFechado !== false;
  return simulateAbstract(s, mins, { stopOnCritical: true, now, noManager: mine, stopOnAlert: mine });
}
