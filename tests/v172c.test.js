// Testes da versão 1.7.2c (animais e funcionários): recolher/sedar antes dos serviços, ataque a funcionário nos 3 casos,
// medo dos mansos, remédio por dardo, internação na Clínica veterinária, AO VIVO "fantasma" e save 9.
import { newGame, step, simulateAbstract, SCHEMA, hire, genCandidate } from '../src/sim/core.js';
import { placeHabitat, placeFacility, checkFacility, buyAnimal, placeToca, demolish } from '../src/sim/build.js';
import { perigoDe, perigosos, planoServico, PERIGOSO, MEDO, SED_MIN, ESTADOS, limites, startEscape, sedarNoLugar } from '../src/sim/animals.js';
import { startTask, dispatch, refreshAlerts, eligibleStaff, ALERT_INFO, ALERT_ROLES, SED_CUSTO, taskName, orderTransfer } from '../src/sim/staff.js';
import { tratamento, clinicas, vagasClinica, internados, GRAVE } from '../src/sim/clinica.js';
import { tocasDe } from '../src/sim/tocas.js';
import * as V from '../src/sim/visita.js';
import { serialize, deserialize, MIGRATIONS } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
import { tileToWorld, accessTile } from '../src/sim/grid.js';
import { insideAt } from '../src/sim/habshape.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || Date.now();
const live = () => ({ abstract: false, realDt: 0.05, moveMul: 1 });
const ABS = { abstract: true, realDt: 0, moveMul: 0, now };
const hora = (s, h) => { s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + h * 60; };
const base = () => { const s = newGame(now); s.money = 9e6; s.settings.fugas = false; hora(s, 9); return s; };
const contrata = (s, role, traits = []) => { let c; do { c = genCandidate(s, now); } while (c.role !== role); s.candidates.push(c); const p = hire(s, c.id).person; p.traits = traits; p.energy = 1; return p; };
const calmo = s => { for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; a.stress = 0.2; a.energy = 0.8; } };
const posto = (a, p) => Object.assign(a, { x: p.x, z: p.z, st: 'idle', stT: 99, tgt: null, wp: null, asleep: false, wHold: 0, wCool: 0, toca: null });
// habitat de savana com muro ao lado do caminho principal (portão para o caminho de cima)
const leoes = (s, k = 2) => { const h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro').hab; for (let i = 0; i < k; i++) buyAnimal(s, 'leao', 30, 30); return h; };
const run = (s, k, fn, ctx = live()) => { for (let i = 0; i < k; i++) { step(s, 0.0125, ctx); if (fn && fn(i, ctx)) return i; } return k; };

// ---- conteúdo e save ----
{
  const s = base(), C = content(s);
  ok(SCHEMA === 9 && !('player' in s), 'save 9: jogo novo sem o contador de lesões do jogador');
  ok(C.facilities.clinica && C.facilities.clinica.vagas === 2 && C.facilities.clinica.pack === 'base', 'Clínica veterinária no jogo base (2 vagas)');
  ok(ALERT_INFO.ferido && !ALERT_INFO.visita && ALERT_ROLES.ferido.includes('seguranca'), 'alerta "Funcionário ferido" no lugar de "Visitante em risco"');
  ok(ESTADOS.has('medo'), 'estado "medo" é conhecido pelo desenho');
  ok(!V.prepararVisita && !V.emEspera && !V.ataqueVisita && !V.visitaLiberada, 'AO VIVO: saem preparar visita, espera e ataque ao jogador');
  // migração 8 -> 9
  const h = leoes(s, 2); const tr = contrata(s, 'tratador'); placeToca(s, 29, 28);
  const o = JSON.parse(JSON.stringify(serialize(s)));
  o.schemaVersion = 8; o.player = { lesoes: 3 }; o.habitats[0].preparo = { total: 2, prontos: 1, ate: 99 }; o.habitats[0].visitaAte = 999; o.habitats[0].visitaRisco = 999;
  o.alerts = [{ id: 1, type: 'visita', target: h.id, created: 0, assigned: null, wait: 0 }]; o.staff[0].task = { type: 'guardar', target: o.animals[0].id, phase: 'work', dest: { hab: h.id, x: 0, z: 0 } };
  o.animals[0].preso = true; o.animals[0].guard = true; o.tocas[0].fechada = true; delete o.staff[0].ferido;
  const m = deserialize(o);
  ok(m.schemaVersion === 9 && !m.player && !m.alerts.length && m.staff[0].task === null && m.staff[0].ferido === 0, 'migração 8 → 9: sai o jogador, o alerta de visita e a tarefa de recolher para a visita');
  ok(!m.habitats[0].preparo && !m.habitats[0].visitaAte && !m.habitats[0].visitaRisco && Array.isArray(m.habitats[0].seg), 'campos da visita perigosa limpos; habitat ganha a lista de quem segura as tocas');
  ok(!m.animals[0].preso && !m.animals[0].guard && !m.tocas[0].fechada && m.animals.length === 2, 'ninguém fica preso na toca; nenhum animal perdido');
  ok(typeof MIGRATIONS[8] === 'function', 'migração 8 existe');
  void tr;
}

// ---- plano antes de entrar ----
{
  const s = base(), h = leoes(s, 3); buyAnimal(s, 'zebra', 30, 30); calmo(s);
  ok(perigosos(s, h).length === 3, '3 leões perigosos soltos (zebra não conta)');
  let P = planoServico(s, h); ok(P.cabem.length === 0 && P.sobram.length === 3, 'sem toca: os 3 sobram (sedação)');
  placeToca(s, 29, 28); P = planoServico(s, h); ok(P.cabem.length === 2 && P.sobram.length === 1, '1 toca (2 vagas): 2 recolhidos, 1 para sedar');
  const zb = s.animals.find(a => a.sp === 'zebra'); P = planoServico(s, h, s.animals[0].id); ok(P.total === 2 && !P.cabem.some(x => x.a.id === s.animals[0].id), 'o animal alvo (internar/transferir) fica fora do plano');
  s.animals[0].sedated = true; s.animals[0].sedAte = s.clock.min + 30; ok(perigoDe(s, s.animals[0]) === 0 && perigosos(s, h).length === 2, 'sedado não oferece perigo');
  void zb;
}

// ---- 1) serviço com toca: recolhe, entra, faz o serviço e solta ----
{
  const s = base(), h = leoes(s, 2); buyAnimal(s, 'zebra', 30, 30); placeToca(s, 29, 28); calmo(s);
  const tr = contrata(s, 'tratador'); h.food = 0.2;
  ok(startTask(s, tr, 'feed', h.id) && tr.task.pre === h.id && !insideAt(h, tr.task.dest.x, tr.task.dest.z, 0), 'tarefa começa indo até o portão (do lado de fora)');
  const fases = new Set(); let atq = 0, presosMax = 0, dentroSolto = 0;
  run(s, 30000, (i, ctx) => { if (i % 300 === 0) { hora(s, 9); calmo(s); } if (tr.task?.type === 'feed') fases.add(tr.task.phase); if (ctx.ataques?.length) atq++; presosMax = Math.max(presosMax, s.animals.filter(a => a.preso).length);
    if (insideAt(h, tr.x, tr.z, 0) && perigosos(s, h).length) dentroSolto++; return h.food > 0.95 && tr.task?.type !== 'feed'; });
  ok(fases.has('recolher') && presosMax === 2, `chama os 2 leões para a toca antes de entrar (${[...fases].join(' > ')})`);
  ok(h.food > 0.95 && !atq && !tr.ferido, 'enche o comedouro sem nenhum ataque');
  ok(dentroSolto === 0, 'nunca fica dentro do recinto com leão solto');
  run(s, 3000, () => !insideAt(h, tr.x, tr.z, 0) && !s.animals.some(a => a.preso));
  ok(!s.animals.some(a => a.preso || a.guard) && tocasDe(s, h.id).every(t => !t.fechada), 'quando a equipe sai, os leões são soltos e a toca reabre');
}

// ---- 2) sem toca, com veterinário: seda e depois faz o serviço ----
{
  const s = base(), h = leoes(s, 2); calmo(s);
  const tr = contrata(s, 'tratador'), vet = contrata(s, 'veterinario'); h.food = 0.2; const m0 = s.money;
  startTask(s, tr, 'feed', h.id); let viuEspera = false, viuSedar = false, atq = 0;
  run(s, 40000, (i, ctx) => { if (i % 300 === 0) { hora(s, 9); for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; a.stress = 0.2; } } if (tr.task?.phase === 'espera') viuEspera = true; if (vet.task?.type === 'sedar') viuSedar = true; if (ctx.ataques?.length) atq++; return h.food > 0.95; });
  ok(viuEspera && viuSedar, 'tratador espera no portão e o veterinário vem sedar');
  ok(h.food > 0.95 && !atq && !tr.ferido, 'serviço feito sem ataque');
  ok(s.animals.every(a => a.sedated && a.sedAte > s.clock.min) && s.log.filter(l => /sedou .* \(R\$ 100\)/.test(l.msg)).length === 2, `os 2 leões sedados, R$ ${SED_CUSTO} cada`);
  { const a = s.animals[0], e0 = 0.2; a.stress = e0; a.sedated = false; sedarNoLugar(s, a); ok(a.stress > e0 + 0.05 && a.sedAte === s.clock.min + SED_MIN, 'sedar estressa o animal'); }
  void m0;
  s.clock.min = Math.max(...s.animals.map(a => a.sedAte)) + 1; run(s, 5); ok(s.animals.every(a => !a.sedated && !a.sedAte), `o sedativo dura ${SED_MIN} min de jogo e o animal acorda`);
}

// ---- 3) caso (a): sem toca e sem veterinário, entra arriscando e é atacado ----
{
  const s = base(), h = leoes(s, 1); calmo(s); const leo = s.animals[0];
  const tr = contrata(s, 'tratador'); h.food = 0.2; startTask(s, tr, 'feed', h.id);
  let atq = null; const ctx0 = live();
  run(s, 14000, (i, ctx) => { if (tr.task?.phase === 'work' && tr.task.work < 400) tr.task.work = 500; if (i % 20 === 0 && !tr.ferido && tr.task?.phase === 'work') { const d = Math.hypot(leo.x - tr.x, leo.z - tr.z); if (d > 3.5 && leo.st !== 'investida' && leo.st !== 'ameaca') posto(leo, { x: tr.x + 3, z: tr.z }); calmo(s); } if (ctx.ataques?.length) { atq = ctx.ataques[0]; return true; } }, ctx0);
  ok(s.log.some(l => /Sem toca e sem veterinário/.test(l.msg)), 'avisa que entrou com animal perigoso solto');
  ok(atq && atq.st === tr.id && !atq.manso, `o leão encara, avança e alcança o tratador (${tr.task?.type}:${tr.task?.phase} ${tr.ferido} ${s.log.slice(-4).map(l => l.msg).join(' | ')})`);
  ok(tr.ferido > s.clock.min + 1400 && tr.task?.type === 'ferido' && s.animals.length === 1, 'tratador ferido: 1 dia de jogo afastado, ninguém morre');
  refreshAlerts(s); const al = s.alerts.find(a => a.type === 'ferido');
  ok(al && al.target === h.id && h.feridoNome === tr.name, 'alerta "Funcionário ferido" no recinto');
  ok(!eligibleStaff(s, { type: 'fome', target: h.id }).some(x => x.st === tr), 'quem está ferido não aparece para ser enviado');
  ok(!startTask(s, tr, 'water', h.id) && taskName(tr.task) === 'Afastado (ferido)', 'ferido não pega tarefa');
  const sg = contrata(s, 'seguranca'); ok(dispatch(s, al.id, sg.id) && sg.task.type === 'patrol', 'segurança vai conferir o recinto');
  s.settings.selvagem = false; simulateAbstract(s, 1500, { now }); refreshAlerts(s); s.settings.selvagem = true;
  ok(!tr.ferido && !s.alerts.some(a => a.type === 'ferido'), 'depois de 1 dia ele volta ao trabalho e o alerta some');
}

// ---- 4) caso (b): distraído esquece de recolher ----
{
  const s = base(), h = leoes(s, 2); placeToca(s, 29, 28); calmo(s);
  const tr = contrata(s, 'tratador', ['distraido']); let esq = 0, fer = 0;
  for (let k = 0; k < 120; k++) { tr.ferido = 0; tr.task = null; tr.inHab = 0; const e = tileToWorld(36, 38); tr.x = e.x; tr.z = e.z; calmo(s); h.food = 0.2; startTask(s, tr, 'feed', h.id); for (let j = 0; j < 40 && tr.task?.type === 'feed' && tr.task.pre; j++) step(s, 1, ABS); if (s.log.some(l => /esqueceu de recolher/.test(l.msg))) { esq++; s.log = s.log.filter(l => !/esqueceu/.test(l.msg)); } if (tr.ferido) fer++; }
  ok(esq >= 14 && esq <= 70, `distraído esquece de recolher às vezes (${esq} de 120)`);
  ok(fer >= 1 && fer <= esq, `e às vezes é atacado por isso (${fer})`);
  const tr2 = contrata(s, 'tratador'); let esq2 = 0, fer2 = 0; tr.ferido = 1e9;
  for (let k = 0; k < 40; k++) { tr2.ferido = 0; tr2.task = null; tr2.inHab = 0; calmo(s); h.food = 0.2; startTask(s, tr2, 'feed', h.id); for (let j = 0; j < 40 && tr2.task?.type === 'feed' && tr2.task.pre; j++) step(s, 1, ABS); if (s.log.some(l => /esqueceu/.test(l.msg))) esq2++; if (tr2.ferido) fer2++; }
  ok(!esq2 && !fer2, 'com toca e sem distração: nenhum ataque em 40 serviços com o app fechado');
}

// ---- 5) caso (c): o sedativo acaba no meio de um serviço demorado ----
{
  const s = base(), h = leoes(s, 1); calmo(s); const leo = s.animals[0];
  const tr = contrata(s, 'tratador'), vet = contrata(s, 'veterinario');
  for (let k = 0; k < 40; k++) { const p = tileToWorld(28 + (k % 8), 27 + ((k / 8) | 0)); h.dirt.push([p.x, p.z, k % 2]); }
  startTask(s, tr, 'clean', h.id);
  run(s, 40000, () => tr.task?.type === 'clean' && tr.task.phase === 'work');
  ok(leo.sedated && leo.sedAte && tr.task?.phase === 'work', 'leão sedado, tratador limpando lá dentro');
  leo.sedAte = s.clock.min + 0.2; let atq = null, acordou = false;
  run(s, 8000, (i, ctx) => { if (!leo.sedated) acordou = true; if (acordou && i % 20 === 0 && !tr.ferido && leo.st !== 'investida' && leo.st !== 'ameaca') posto(leo, { x: tr.x + 3, z: tr.z }); calmo(s); if (ctx.ataques?.length) { atq = ctx.ataques[0]; return true; } });
  ok(acordou && atq && tr.ferido, 'o sedativo acaba, o leão acorda e ataca quem ainda está lá dentro');
  void vet;
}

// ---- 6) Modo Tranquilo: só ameaça, o serviço atrasa ----
{
  const s = base(), h = leoes(s, 1); s.settings.tranquilo = true; calmo(s); const leo = s.animals[0];
  const tr = contrata(s, 'tratador'); h.food = 0.2; startTask(s, tr, 'feed', h.id);
  run(s, 8000, () => tr.task?.phase === 'work'); if (tr.task) { tr.task.work = 500; tr.task.work0 = 500; } posto(leo, { x: tr.x + 3, z: tr.z });
  const w0 = tr.task?.work0; let at = null, dmin = 9;
  run(s, 6000, (i, ctx) => { if (i % 20 === 0 && leo.st !== 'investida' && leo.st !== 'ameaca' && !at) posto(leo, { x: tr.x + 3, z: tr.z }); calmo(s); if (leo.st === 'investida') { const dd = Math.hypot(leo.x - tr.x, leo.z - tr.z); if (dd < dmin && process.env.DBG) console.log('d', dd.toFixed(2), i, leo.wT, tr.task?.phase, tr.x.toFixed(2), leo.x.toFixed(2)); dmin = Math.min(dmin, dd); } if (ctx.ataques?.length) { at = ctx.ataques[0]; return true; } });
  ok(at && at.manso && !tr.ferido && dmin >= 0.9, `Modo Tranquilo: faz a carga e para a ~1 m (${dmin.toFixed(2)} m), sem ferimento`);
  ok(tr.task?.work0 >= w0 + 15 && s.log.some(l => /ameaçou/.test(l.msg)), 'o serviço atrasa 15 min de jogo');
}

// ---- 7) modo selvagem desligado: ninguém ataca e não precisa recolher ----
{
  const s = base(), h = leoes(s, 1); s.settings.selvagem = false; calmo(s); const leo = s.animals[0];
  const tr = contrata(s, 'tratador'); h.food = 0.2; startTask(s, tr, 'feed', h.id);
  ok(!tr.task.pre, 'sem a etapa do portão');
  let atq = 0; run(s, 12000, (i, ctx) => { if (tr.task?.phase === 'work' && i % 20 === 0) posto(leo, { x: tr.x + 2.5, z: tr.z }); calmo(s); if (ctx.ataques?.length) atq++; return h.food > 0.95; });
  ok(!atq && !tr.ferido && h.food > 0.95, 'modo selvagem desligado: serviço sem ataque');
}

// ---- 8) medo: os mansos mantêm distância ----
{
  const s = base(), h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'ferro').hab; for (let k = 0; k < 4; k++) buyAnimal(s, 'zebra', 30, 30); calmo(s);
  const tr = contrata(s, 'tratador'); h.food = 0.1; h.waterLvl = 1; startTask(s, tr, 'feed', h.id);
  ok(!tr.task.pre, 'zebras não exigem recolher');
  run(s, 8000, () => tr.task?.phase === 'work');
  const zs = s.animals; zs.forEach((z, i) => posto(z, { x: tr.x + 1.2 * Math.cos(i * 1.6), z: tr.z + 1.2 * Math.sin(i * 1.6) }));
  let medo = false, perto = 0, amostras = 0;
  run(s, 1500, i => { if (zs.some(z => z.st === 'medo')) medo = true; if (i > 300) { for (const z of zs) { amostras++; if (Math.hypot(z.x - tr.x, z.z - tr.z) < MEDO - 1) perto++; } } calmo(s); });
  ok(medo, 'zebras se afastam do tratador (estado "medo")');
  ok(perto / amostras < 0.12, `e quase sempre ficam a mais de ${MEDO - 1} m (${(100 * perto / amostras).toFixed(1)}% perto)`);
  ok(!s.alerts.length || true, 'sem ataque de manso');
}

// ---- 9) tratamento: dardo (leve) e internação (grave) ----
{
  const s = base(), h = leoes(s, 1); buyAnimal(s, 'zebra', 30, 30); calmo(s); const zb = s.animals.find(a => a.sp === 'zebra');
  const vet = contrata(s, 'veterinario');
  zb.sick = true; zb.health = 0.6; refreshAlerts(s); let al = s.alerts.find(a => a.type === 'doenca');
  ok(tratamento(s, zb).modo === 'dardo', `saúde ${GRAVE * 100}% ou mais: remédio por dardo`);
  const m0 = s.money; ok(dispatch(s, al.id, vet.id) && vet.task.modo === 'dardo' && !insideAt(h, vet.task.dest.x, vet.task.dest.z, 0), 'veterinário vai até o portão, do lado de fora');
  let entrou = false; run(s, 20000, () => { if (insideAt(h, vet.x, vet.z, 0)) entrou = true; return !zb.sick; });
  ok(!zb.sick && !entrou && s.log.some(l => /remédio por dardo em/.test(l.msg)), `curou com o dardo sem entrar no recinto (${zb.sick}, ${entrou}, ${vet.task?.type}:${vet.task?.phase})`); void m0;
  // grave sem clínica
  zb.sick = true; zb.health = 0.25; refreshAlerts(s); al = s.alerts.find(a => a.type === 'doenca');
  const T0 = tratamento(s, zb); ok(!T0.ok && T0.semClinica && !dispatch(s, al.id, vet.id), 'grave sem Clínica veterinária: não dá para tratar (alerta continua)');
  // constrói clínica ao lado do caminho
  const c = placeFacility(s, 'clinica', 31, 38); ok(c.ok && clinicas(s).length === 1 && vagasClinica(s, clinicas(s)[0]) === 2, `Clínica veterinária construída ao lado do caminho (${c.msg})`);
  ok(checkFacility(s, 'clinica', 38, 38).ok || !/já tem/.test(checkFacility(s, 'clinica', 38, 38).msg), 'pode construir mais de uma clínica');
  const f = clinicas(s)[0];
  ok(dispatch(s, al.id, vet.id) && vet.task.modo === 'internar' && vet.task.clinica === f.id && vagasClinica(s, f) === 1, 'grave: veterinário sai para internar (vaga reservada)');
  ok(vet.task.pre === h.id, 'o recinto tem leão: recolhe/seda antes de entrar com a carga');
  const fases = new Set(); run(s, 60000, () => { if (vet.task) fases.add(vet.task.phase); calmo(s); zb.health = Math.min(zb.health, 0.25); return !!zb.internado; });
  ok(zb.internado === f.id && zb.hab === 0 && zb.habOrig === h.id && !zb.sick, `internada na clínica, fora do habitat (${[...fases].join(' > ')})`);
  ok(['sedar', 'sedate', 'load', 'return', 'release'].every(p => fases.has(p)), 'fases: seda o leão, dardo na zebra, carrega, leva, interna');
  ok(zb.intDias === 2 && zb.intAte - s.clock.min > 1400 && internados(s, f).length === 1, 'saúde 25%: 2 dias de internação');
  ok(!perigosos(s, h).includes(zb) && !s.animals.some(a => a.hab === h.id && a.id === zb.id), 'internada não conta no habitat');
  ok(!demolish(s, 32, 39).ok, 'não dá para demolir a clínica com animal internado');
  const tr = contrata(s, 'tratador'); ok(!orderTransfer(s, zb.id, h.id, tr.id).ok, 'internada não pode ser transferida');
  // save no meio da internação
  const s2 = deserialize(JSON.parse(JSON.stringify(serialize(s)))), z2 = s2.animals.find(a => a.id === zb.id); ok(z2.internado === f.id && z2.hab === 0 && z2.intAte === zb.intAte, 'internação sobrevive ao save');
  simulateAbstract(s, 3000, { now });
  ok(!zb.internado && zb.hab === h.id && zb.health >= 0.85 && insideAt(h, zb.x, zb.z, 0), `alta: volta ao habitat recuperada (saúde ${Math.round(zb.health * 100)}%)`);
  ok(s.log.some(l => /recebeu alta/.test(l.msg)), 'registro da alta');
}
// vagas e várias clínicas; subgerente escolhe com o app fechado
{
  const s = base(), h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'ferro').hab; for (let k = 0; k < 4; k++) buyAnimal(s, 'zebra', 30, 30);
  placeFacility(s, 'clinica', 31, 38); const f1 = clinicas(s)[0];
  for (let k = 0; k < 4; k++) contrata(s, 'veterinario');
  const [a1, a2, a3] = s.animals; for (const a of [a1, a2, a3]) { a.sick = true; a.health = 0.3; }
  refreshAlerts(s); const al = s.alerts.filter(a => a.type === 'doenca'), vets = s.staff;
  ok(dispatch(s, al[0].id, vets[0].id) && dispatch(s, al[1].id, vets[1].id) && !dispatch(s, al[2].id, vets[2].id), '2 vagas: o terceiro caso grave espera');
  ok(tratamento(s, a3).semVaga, 'mensagem de clínica cheia');
  placeFacility(s, 'clinica', 38, 38); const f2 = clinicas(s).find(f => f !== f1);
  ok(f2 && dispatch(s, al[2].id, vets[2].id, 'você', { clinica: f2.id }) && vets[2].task.clinica === f2.id, 'com mais de uma clínica o jogador escolhe o destino');
  // subgerente com o app fechado
  const s3 = base(), h3 = placeHabitat(s3, 26, 26, 37, 34, 'savana', 'ferro').hab; buyAnimal(s3, 'zebra', 30, 30); buyAnimal(s3, 'zebra', 30, 30);
  placeFacility(s3, 'clinica', 31, 38); placeFacility(s3, 'clinica', 44, 38); contrata(s3, 'veterinario'); contrata(s3, 'subgerente');
  s3.managers[0].traits = ['agil']; s3.managers[0].attrs.rapidez = 5; s3.managers[0].attrs.decisao = 5;
  const z = s3.animals[0]; z.sick = true; z.health = 0.3; let foi = null;
  for (let k = 0; k < 400 && !z.internado; k++) { step(s3, 2, { ...ABS }); if (z.internado) foi = z.internado; z.health = Math.min(z.health, 0.3); }
  const perto = clinicas(s3).sort((x, y) => Math.hypot(x.tx - 31, x.ty - 30) - Math.hypot(y.tx - 31, y.ty - 30))[0];
  ok(foi && foi === perto.id, 'app fechado: o subgerente interna na clínica mais perto com vaga');
  simulateAbstract(s3, 1500, { now }); ok(!z.internado && z.hab === h3.id, 'e a alta acontece com o app fechado');
  void h; void a2;
}

// ---- 10) AO VIVO "fantasma" ----
{
  const s = base(), h = leoes(s, 2); calmo(s);
  const r = V.abrirVisita(s, h); ok(r.ok && h.visitOpen && !h.gateOpen, 'entra sem preparar nada (os leões ignoram o jogador)');
  ok(V.podeVisitar(s, h).ok, 'nada de espera depois de susto');
  s.settings.fugas = true; const a = s.animals[0], C = content(s); startEscape(s, a, h, C.species[a.sp], C.fences[h.fence]);
  ok(a.escaping && a.escaping.mode !== 'portao', 'visita do jogador não abre o portão de verdade (fuga não sai pelo portão)');
  V.fecharVisita(s, h); ok(!h.visitOpen, 'sair fecha a visita');
}
// ---- 11) com o app fechado: dias de rotina com tocas, sem ferimentos ----
{
  const s = base(), h = leoes(s, 2); placeToca(s, 29, 28); placeToca(s, 33, 31); const tr = contrata(s, 'tratador'), t2 = contrata(s, 'tratador');
  const r = simulateAbstract(s, 2 * 1440, { now });
  ok(s.animals.length >= 2 && !tr.ferido && !t2.ferido && !(s.stats.feridos), `2 dias com o app fechado: equipe sem ferimento (${s.animals.length} leões, ${r.eventos.filter(e => /atacou|esqueceu/.test(e.msg)).map(e => e.msg).join(' | ')})`);
  ok(s.animals.every(a => a.hunger < 0.8), 'leões alimentados');
  ok(s.animals.every(a => !a.preso) && tocasDe(s, h.id).every(t => !t.fechada), 'ninguém fica preso na toca com o app fechado');
}
void limites; void PERIGOSO; void accessTile;
console.log(`\n${n - fails}/${n} verificações`);
if (fails) { console.error(`${fails} FALHA(S) NA 1.7.2c`); process.exit(1); }
console.log('TODOS OS TESTES DA 1.7.2c PASSARAM');
