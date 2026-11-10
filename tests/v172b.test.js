// Testes da versão 1.7.2b (vida selvagem): tocas com vidro, mover toca, rotina por espécie, visita aos recintos e modo selvagem.
import { newGame, step, simulateAbstract, SCHEMA } from '../src/sim/core.js';
import { placeHabitat, placePlant, buyAnimal, paintTerrain, sculpt, demolish, checkToca, placeToca, movableAt, moveObject, checkShrink } from '../src/sim/build.js';
import { habObstacles, dormeAgora, rotinaAgora, ESTADOS, perigoDe, aloft, dentro, RADIUS, mandarParaToca, tocaLivre, limites } from '../src/sim/animals.js';
import { tocasDe, tocaCells, tocaCenter, portaPonto, ocupantes, tocaVagas } from '../src/sim/tocas.js';
import * as V from '../src/sim/visita.js';
import { serialize, deserialize, MIGRATIONS } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
import { idx, tileToWorld, depthAt, bridgeTiles } from '../src/sim/grid.js';
import { walkSet, insideAt } from '../src/sim/habshape.js';
import { hire, genCandidate } from '../src/sim/core.js';
import { refreshAlerts, dispatch, eligibleStaff, ALERT_INFO } from '../src/sim/staff.js';
import { Controls } from '../src/ui/controls.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || Date.now();
const live = () => ({ abstract: false, realDt: 0.05, moveMul: 1 });
const hora = (s, h) => { s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + h * 60; };
const run = (s, k, fn, ctx = live()) => { for (let i = 0; i < k; i++) { step(s, 0.0125, ctx); fn?.(i, ctx); } };
const base = () => { const s = newGame(now); s.money = 9e6; s.settings.fugas = false; hora(s, 9); return s; };
const tratador = s => { let c; do { c = genCandidate(s, now); } while (c.role !== 'tratador'); s.candidates.push(c); return hire(s, c.id).person; };
const seguranca = s => { let c; do { c = genCandidate(s, now); } while (c.role !== 'seguranca'); s.candidates.push(c); return hire(s, c.id).person; };
const naCaixa = (a, t, R) => { const c = tocaCenter(t); return Math.abs(a.x - c.x) < 2 + R - 0.06 && Math.abs(a.z - c.z) < 2 + R - 0.06; };

// ---- item 3: toca com vidro ----
{
  const s = base(), h = placeHabitat(s, 24, 24, 35, 33, 'savana', 'muro').hab;
  placePlant(s, 30, 30, 'acacia');
  ok(SCHEMA >= 9 && Array.isArray(s.tocas) && s.settings.selvagem === true, 'jogo novo: save com tocas e modo selvagem ligado');
  ok(!!content(s).estruturas.toca && content(s).estruturas.toca.pack === 'base', 'categoria "estruturas" entra no conteúdo combinado');
  const m0 = s.money, c = checkToca(s, 27, 27);
  ok(c.ok && c.dir !== c.porta && c.cost === 1200, `prévia aceita a toca (vidro no lado ${c.dir}, entrada no lado ${c.porta})`);
  const p = placeToca(s, 27, 27);
  ok(p.ok && s.tocas.length === 1 && m0 - s.money === 1200, 'placeToca dentro do habitat cobra R$ 1.200');
  const t = s.tocas[0];
  ok(t.modelo === 'pedra' && t.hab === h.id && t.fechada === false, 'savana recebe a toca de pedra, ligada ao habitat');
  ok(tocaCells(t).every(([x, y]) => s._occ.obj[idx(x, y)] === t.id && s._occ.toca[idx(x, y)] === t.id), 'rebuildOcc marca os 4 blocos');
  ok(!placePlant(s, t.tx + 1, t.ty + 1, 'acacia').ok, 'planta em cima da toca é recusada');
  ok(!paintTerrain(s, t.tx, t.ty, 'w').ok, 'pintar água em cima da toca é recusado');
  { const c2 = checkToca(s, 30, 30); ok(!c2.ok || !tocaCells(c2).some(([x, y]) => x === 30 && y === 30), 'toca nunca fica em cima de planta'); }
  ok(!checkToca(s, h.feed[0], h.feed[1]).ok || !tocaCells(checkToca(s, h.feed[0], h.feed[1])).some(([x, y]) => x === h.feed[0] && y === h.feed[1]), 'toca nunca cobre o comedouro');
  ok(!checkToca(s, 40, 40).ok, 'fora de habitat é recusado');
  ok(!checkToca(s, 24, 24).ok || checkToca(s, 24, 24).tx >= 24, 'no canto, só encaixa por dentro do habitat');
  s.money = 100; const semGrana = checkToca(s, 31, 26); ok(!semGrana.ok && /insuficiente/.test(semGrana.msg), 'sem dinheiro: recusa com o custo'); s.money = 9e6;
  const isl = placeHabitat(s, 38, 22, 47, 31, 'savana', 'fosso').hab;
  ok(!checkToca(s, 38, 22).ok, 'no fosso da ilha é recusado');
  ok(placeToca(s, 42, 26).ok && tocasDe(s, isl.id).length === 1, 'dentro da ilha pode');
  // colisão
  const obs = habObstacles(s, h).filter(o => o.toca);
  ok(obs.length === 1 && obs[0].solido && obs[0].box, 'habObstacles inclui a toca como caixa sólida');
  for (const sp of ['zebra', 'zebra', 'zebra', 'girafa', 'elefante', 'leao']) buyAnimal(s, sp, 25, 25);
  hora(s, 9.5);
  let dentroCaixa = 0;
  run(s, 9000, i => { if (i < 40) return; for (const a of s.animals) if (a.hab === h.id && !dentro(a) && a.st !== 'toca_go' && naCaixa(a, t, RADIUS[a.sp] * 0.7 * 0.8)) dentroCaixa++; });
  ok(dentroCaixa === 0, `ninguém atravessa as paredes da toca em 9000 passos (${dentroCaixa})`);
  ok(s.animals.filter(a => a.hab === h.id).every(a => insideAt(h, a.x, a.z, 0)), 'todos continuam dentro do habitat');
  // entrar na toca, dormir e salvar
  const leo = s.animals.find(a => a.sp === 'leao'); for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; }
  hora(s, 22); for (const a of s.animals) if (a !== leo) { a.toca = null; a.tgt = null; a.st = 'sleep'; a.asleep = true; } // os outros já dormem no chão: a toca fica para o leão
  leo.st = 'idle'; leo.stT = 0; leo.toca = null; leo.energy = 0.3;
  let chegou = false; run(s, 6000, () => { if (leo.st === 'in_toca') chegou = true; hora(s, 22); for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; } });
  ok(chegou && leo.toca === t.id && leo.asleep, `leão vai dormir na toca à noite (${leo.st})`);
  const c0 = tocaCenter(t); ok(Math.hypot(leo.x - c0.x, leo.z - c0.z) < 1.2, 'e fica lá dentro, visível pelo vidro');
  const s2 = deserialize(JSON.parse(JSON.stringify(serialize(s)))), leo2 = s2.animals.find(a => a.id === leo.id);
  ok(leo2.toca === t.id && leo2.st === 'in_toca' && s2.tocas.length === 2, 'a.toca e as tocas sobrevivem ao save');
  // ---- item 2b: mover a toca ----
  const mv = movableAt(s, t.tx + 1, t.ty);
  ok(mv && mv.kind === 'toca' && mv.toca === t, 'movableAt reconhece qualquer bloco da toca');
  const r = moveObject(s, mv, 31, 26);
  ok(r.ok && tocaCells(t).every(([x, y]) => s._occ.toca[idx(x, y)] === t.id) && !s._occ.toca[idx(27, 27)], `toca movida ocupa os 4 blocos novos (${r.msg})`);
  const c1 = tocaCenter(t); ok(leo.toca === t.id && leo.st === 'in_toca' && Math.hypot(leo.x - c1.x, leo.z - c1.z) < 1.2, 'o animal que estava dentro vai junto');
  ok(habObstacles(s, h).find(o => o.toca).x === c1.x, 'obstáculo acompanha a toca (cache refeito)');
  ok(!moveObject(s, movableAt(s, t.tx, t.ty), 42, 23).ok, 'não muda de habitat');
  const cut = checkShrink(s, t.tx, t.ty, t.tx + 3, 33); ok(!cut.ok && /toca/i.test(cut.msg), 'recortar o habitat por cima da toca é recusado');
  ok(!demolish(s, t.tx, t.ty).ok, 'demolir com animal dentro é recusado');
  leo.st = 'idle'; leo.toca = null; const md = s.money;
  ok(demolish(s, t.tx, t.ty).ok && tocasDe(s, h.id).length === 0 && s.money - md === 600, 'toca vazia é demolida (devolve 50%)');
  // demolir habitat remove as tocas
  ok(demolish(s, 39, 23).ok && s.tocas.length === 0, 'demolir o habitat remove as tocas dele');
}

// ---- migração 7 -> 8 ----
{
  const s = base(), h = placeHabitat(s, 24, 24, 33, 31, 'savana', 'ferro').hab; buyAnimal(s, 'zebra', 26, 26);
  const o = JSON.parse(JSON.stringify(serialize(s))); o.schemaVersion = 7; delete o.tocas; delete o.player; delete o.settings.selvagem; o.habitats[0].visitOpen = true;
  const m = deserialize(o);
  ok(m.schemaVersion === SCHEMA && Array.isArray(m.tocas) && m.settings.selvagem === true && m.habitats[0].visitOpen === false && m.animals.length === 1, 'save 7 vira 8 (e segue até o atual) sem perder nada e sem visita aberta');
  const o2 = JSON.parse(JSON.stringify(serialize(s))); o2.habitats[0].visitOpen = true; o2.animals[0].toca = 99999; o2.animals[0].st = 'in_toca';
  const m2 = deserialize(o2); ok(m2.habitats[0].visitOpen === false && m2.animals[0].toca == null && m2.animals[0].st === 'idle', 'ao abrir: visita fechada e animal de toca que não existe mais é solto');
  ok(typeof MIGRATIONS[7] === 'function', 'migração 7 existe');
}

// ---- item 6: rotina por espécie ----
{
  const C = content(base()).species;
  ok(Object.values(C).every(S => S.rotina && S.perigo != null), 'as 10 espécies têm rotina e perigo');
  ok(!dormeAgora(C.hipopotamo, 22) && dormeAgora(C.hipopotamo, 12) && !dormeAgora(C.hipopotamo, 3), 'hipopótamo: acordado às 22 h e às 3 h, dormindo ao meio-dia');
  ok(dormeAgora(C.leao, 23) && !dormeAgora(C.leao, 13) && rotinaAgora(C.leao, 13) === 'descanso', 'leão: dorme à noite e descansa no começo da tarde');
  ok(rotinaAgora(C.zebra, 7) === 'pastar' && rotinaAgora(C.flamingo, 12) === 'descanso' && rotinaAgora(C.elefante, 13) === 'banho', 'janelas: zebra pasta às 7 h, flamingo descansa às 12 h, elefante toma banho às 13 h');
  ok(dormeAgora({}, 22) && !dormeAgora({}, 12), 'espécie sem rotina (DLC antiga) dorme das 20 h às 6 h, como antes');
  const s = base(), h = placeHabitat(s, 22, 22, 37, 35, 'savana', 'ferro').hab;
  for (let y = 24; y <= 29; y++) for (let x = 24; x <= 30; x++) paintTerrain(s, x, y, 'w');
  for (let k = 0; k < 6; k++) { sculpt(s, 26, 26, 'baixar'); sculpt(s, 27, 27, 'baixar'); }
  for (const sp of ['zebra', 'zebra', 'zebra', 'leao', 'girafa', 'hipopotamo', 'hipopotamo', 'elefante', 'flamingo', 'flamingo', 'rinoceronte', 'tartaruga']) buyAnimal(s, sp, 33, 33);
  const quieto = () => { for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; a.energy = 0.7; } };
  // meio-dia: hipopótamo dorme na água
  hora(s, 11); quieto(); for (const a of s.animals) { a.st = 'idle'; a.stT = 0; }
  const vistos = new Set(); let invalido = null;
  run(s, 8000, i => { if (i % 200 === 0) { hora(s, 12.5); quieto(); } for (const a of s.animals) { vistos.add(a.sp + ':' + a.st); if (!ESTADOS.has(a.st)) invalido = a.st; } });
  const hip = s.animals.filter(a => a.sp === 'hipopotamo');
  ok(hip.every(a => a.asleep && a.st === 'sleep'), `hipopótamos dormindo ao meio-dia (${hip.map(a => a.st)})`);
  ok(hip.some(a => depthAt(s, a.x, a.z) > 0.3), `e dormem dentro da água (${hip.map(a => depthAt(s, a.x, a.z).toFixed(2))})`);
  ok(vistos.has('leao:descanso') && (vistos.has('zebra:descanso_pe') || vistos.has('girafa:descanso_pe')), 'leão descansa deitado e zebra/girafa em pé no começo da tarde');
  ok(vistos.has('flamingo:umaperna'), 'flamingo descansa numa perna só');
  ok(vistos.has('elefante:poeira') || vistos.has('rinoceronte:poeira') || vistos.has('elefante:bath'), 'elefante/rinoceronte: banho de água ou de poeira');
  // manhã: pastar
  for (const a of s.animals) { a.st = 'idle'; a.stT = 0; a.asleep = false; } vistos.clear();
  run(s, 6000, i => { if (i % 200 === 0) { hora(s, 7); quieto(); } for (const a of s.animals) { vistos.add(a.sp + ':' + a.st); if (!ESTADOS.has(a.st)) invalido = a.st; } });
  ok(vistos.has('zebra:pastar') && vistos.has('girafa:pastar'), 'zebra e girafa pastam de manhã');
  const z = s.animals.find(a => a.sp === 'zebra'); z.hunger = 0.48; z.st = 'pastar'; z.stT = 0; z.tgt = null; run(s, 2); ok(z.hunger >= 0.47, 'pastar não mata a fome abaixo de 50% (o comedouro continua necessário)');
  // noite: hipopótamo acordado e fora d'água, os outros dormem
  for (const a of s.animals) { a.st = 'idle'; a.stT = 0; a.asleep = false; } vistos.clear();
  run(s, 7000, i => { if (i % 200 === 0) { hora(s, 22); quieto(); } for (const a of s.animals) { vistos.add(a.sp + ':' + a.st); if (!ESTADOS.has(a.st)) invalido = a.st; } });
  ok(hip.every(a => !a.asleep) && vistos.has('hipopotamo:pastar'), 'hipopótamo acordado às 22 h, pastando fora da água');
  ok(s.animals.filter(a => a.sp !== 'hipopotamo').every(a => a.asleep), `os outros dormem à noite (${s.animals.filter(a => a.sp !== 'hipopotamo' && !a.asleep).map(a => a.sp + ':' + a.st)})`);
  ok(invalido === null, `nenhum estado desconhecido em 21000 passos (${invalido})`);
  ok(s.animals.every(a => a.energy > 0.3), 'ninguém fica sem energia com a rotina nova');
  // modo abstrato concorda com a rotina
  let igual = true;
  for (const hh of [3, 8, 12, 18, 22]) { hora(s, hh); step(s, 1, { abstract: true, realDt: 0, moveMul: 0, now }); for (const a of s.animals) if (a.asleep !== dormeAgora(content(s).species[a.sp], (s.clock.min % 1440) / 60)) igual = false; }
  ok(igual, 'app fechado: cada espécie dorme no próprio horário (hipopótamo de dia)');
}
// macaco continua dormindo na árvore (não regride a 1.7.2a) e balanço de energia do hipopótamo em 2 dias
{
  const s = base(), h = placeHabitat(s, 24, 24, 33, 33, 'floresta', 'tela').hab;
  for (const [x, y] of [[27, 27], [30, 29], [28, 31]]) placePlant(s, x, y, 'arvore_floresta');
  placeToca(s, 25, 25);
  for (let k = 0; k < 4; k++) buyAnimal(s, 'macaco', 26, 30);
  hora(s, 21); let sono = 0;
  run(s, 7000, i => { if (i % 200 === 0) { hora(s, 21.5); for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; } } });
  sono = s.animals.filter(a => a.st === 'tree_sleep').length;
  ok(sono >= 3 && !s.animals.some(a => a.toca != null), `macacos dormem nas árvores, não na toca (${sono} de 4)`);
  const s3 = base(), h3 = placeHabitat(s3, 22, 22, 35, 33, 'savana', 'ferro').hab;
  for (let y = 24; y <= 28; y++) for (let x = 24; x <= 29; x++) paintTerrain(s3, x, y, 'w');
  buyAnimal(s3, 'hipopotamo', 32, 31); buyAnimal(s3, 'hipopotamo', 32, 31);
  const r = simulateAbstract(s3, 2880, { now }); ok(s3.animals.length >= 2 && s3.animals.every(a => a.energy > 0.2), `2 dias com o app fechado: hipopótamos com energia (${s3.animals.map(a => a.energy.toFixed(2))})`);
  void r; void h; void h3;
}

// ---- item 4: AO VIVO dentro dos recintos ----
{
  const s = base(), h = placeHabitat(s, 24, 26, 33, 35, 'savana', 'ferro').hab;
  for (let y = 30; y <= 33; y++) for (let x = 29; x <= 32; x++) paintTerrain(s, x, y, 'w');
  for (let k = 0; k < 6; k++) sculpt(s, 31, 32, 'baixar');
  placePlant(s, 26, 28, 'baoba'); placeToca(s, 27, 31);
  const isl = placeHabitat(s, 38, 24, 47, 33, 'savana', 'fosso').hab;
  const C = { live: { hab: 0 } }, blocked = (x, z, hab) => Controls.prototype.blocked.call(C, s, x, z, hab);
  const w = (tx, ty) => tileToWorld(tx, ty), dentroP = w(25, 27), gi = V.pontoDentro(h), fora = V.pontoFora(s, h);
  ok(blocked(dentroP.x, dentroP.z, 0), 'de fora, o recinto é parede');
  ok(!blocked(fora.x, fora.z, 0), 'o lado de fora do portão é livre');
  ok(!blocked(dentroP.x, dentroP.z, h.id) && !blocked(gi.x, gi.z, h.id), 'visitando, os blocos do recinto ficam livres');
  ok(blocked(fora.x, fora.z, h.id), 'visitando, não dá para sair atravessando a cerca');
  const tc = tocaCenter(tocasDe(s, h.id)[0]), ar = w(26, 28);
  ok(blocked(tc.x, tc.z, h.id) && blocked(ar.x + 0.3, ar.z, h.id), 'toca e tronco bloqueiam o jogador');
  const fundo = w(31, 32); ok(depthAt(s, fundo.x, fundo.z) > 0.35 && blocked(fundo.x, fundo.z, h.id), `água acima de 0,35 m bloqueia (${depthAt(s, fundo.x, fundo.z).toFixed(2)} m)`);
  // ilha: a ponte é caminho, o fosso não
  const br = bridgeTiles(isl), pb = w(br[0][0], br[0][1]), fosso = w(isl.x, isl.y);
  ok(br.length === 2 && br.every(([x, y]) => !blocked(w(x, y).x, w(x, y).z, 0)), 'ponte da ilha é andável de fora');
  ok(blocked(fosso.x, fosso.z, 0), 'o fosso continua bloqueado');
  const pf = V.pontoFora(s, isl); ok(Math.hypot(pf.x - w(br[1][0], br[1][1]).x, pf.z - w(br[1][0], br[1][1]).z) < 0.01 && pb, 'na ilha, o ponto de entrada é o fim da ponte');
  // abrir e fechar a visita
  const a1 = V.abrirVisita(s, h); ok(a1.ok && h.visitOpen === true && !h.gateOpen, 'entrar abre a visita sem ligar o alerta de portão');
  refreshAlerts(s); ok(!s.alerts.some(a => a.type === 'portao'), 'visita não gera alerta de portão aberto');
  V.fecharVisita(s, h); ok(h.visitOpen === false, 'sair fecha a visita');
  V.abrirVisita(s, h); const o = JSON.parse(JSON.stringify(serialize(s))); ok(deserialize(o).habitats[0].visitOpen === false, 'deserialize sempre volta com a visita fechada');
  simulateAbstract(s, 30, { now }); ok(h.visitOpen === false, 'app fechado/relógio avançado fecha a visita');
}

// 1.7.2c: o modo selvagem e o recolhimento nas tocas passaram a valer para os funcionários (ver tests/v172c.test.js)
console.log(`\n${n - fails}/${n} verificações`);
if (fails) { console.error(`${fails} FALHA(S) NA 1.7.2b`); process.exit(1); }
console.log('TODOS OS TESTES DA 1.7.2b PASSARAM');
