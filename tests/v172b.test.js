// Testes da versão 1.7.2b (vida selvagem): tocas com vidro, mover toca, rotina por espécie, visita aos recintos e modo selvagem.
import { newGame, step, simulateAbstract, SCHEMA } from '../src/sim/core.js';
import { placeHabitat, placePlant, buyAnimal, paintTerrain, sculpt, demolish, checkToca, placeToca, movableAt, moveObject, checkShrink } from '../src/sim/build.js';
import { habObstacles, dormeAgora, rotinaAgora, ESTADOS, perigoDe, riscoVisita, aloft, dentro, RADIUS, mandarParaToca, tocaLivre, limites } from '../src/sim/animals.js';
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
  ok(SCHEMA === 8 && Array.isArray(s.tocas) && s.player.lesoes === 0 && s.settings.selvagem === true, 'jogo novo: save 8 com tocas, jogador e modo selvagem ligado');
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
  ok(m.schemaVersion === 8 && Array.isArray(m.tocas) && m.player.lesoes === 0 && m.settings.selvagem === true && m.habitats[0].visitOpen === false && m.animals.length === 1, 'save 7 vira 8 sem perder nada e sem visita aberta');
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

// ---- item 5: modo selvagem ----
{
  const s = base(), h = placeHabitat(s, 24, 24, 37, 35, 'savana', 'muro').hab;
  for (const sp of ['leao', 'leao', 'leao']) buyAnimal(s, sp, 30, 30);
  buyAnimal(s, 'flamingo', 30, 30); buyAnimal(s, 'zebra', 30, 30);
  const [l1, l2, l3] = s.animals.filter(a => a.sp === 'leao'), fl = s.animals.find(a => a.sp === 'flamingo'), zb = s.animals.find(a => a.sp === 'zebra');
  const calmo = () => { for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; a.stress = 0.2; a.energy = 0.8; } };
  calmo();
  ok(perigoDe(s, l1) === 4 && perigoDe(s, fl) === 0 && perigoDe(s, zb) === 1, 'perigo base: leão 4, zebra 1, flamingo 0');
  l2.sex = 'F'; l3.age = 1; l3.x = l2.x + 2; l3.z = l2.z; l2.stress = 0.8; l2.hunger = 0.8;
  ok(perigoDe(s, l2) >= 6, `leoa estressada, com fome e com filhote perto: perigo ${perigoDe(s, l2)}`);
  ok(limites(4).ataca === 4 && limites(4).espera === 2 && limites(6).encara === 8, 'limites de aviso e ataque crescem com o perigo');
  calmo(); l3.age = 20;
  // jogador parado a 3 m de um leão por alguns segundos
  const posto = (a, x, z) => Object.assign(a, { x, z, st: 'idle', stT: 99, tgt: null, wp: null, asleep: false, wHold: 0, wCool: 0, toca: null });
  const P0 = tileToWorld(30, 29); posto(l1, P0.x, P0.z); posto(l2, P0.x - 12, P0.z + 6); posto(l3, P0.x + 12, P0.z + 6); posto(fl, P0.x - 10, P0.z - 6); posto(zb, P0.x + 10, P0.z - 6);
  const J = { x: P0.x + 3, z: P0.z, hab: h.id };
  V.abrirVisita(s, h);
  const rk = riscoVisita(s, J); ok(rk && rk.a === l1 && rk.nivel === 1 && rk.soltos === 3, 'faixa de aviso: 3 perigosos soltos, o mais perto é o leão');
  let viu = { ameaca: false, investida: false }, atk = null, t = 0;
  const ctx = { abstract: false, realDt: 0.05, moveMul: 1, player: J };
  for (let i = 0; i < 400 && !atk; i++) { step(s, 0.05 / 60, ctx); t += 0.05; if (l1.st === 'ameaca') viu.ameaca = true; if (l1.st === 'investida') viu.investida = true; if (ctx.ataque) atk = ctx.ataque; calmo(); }
  ok(viu.ameaca && viu.investida && atk && atk.id === l1.id && !atk.manso, `leão encara, investe e alcança o jogador (${t.toFixed(1)} s)`);
  ok(t > 2 && t < 8, 'o ataque só vem depois de ~2 s parado dentro do raio');
  const les0 = s.player.lesoes, res = V.ataqueVisita(s, l1, atk.manso);
  ok(s.player.lesoes === les0 + 1 && h.visitOpen === false && s.animals.length === 5, 'ataque: 1 lesão, visita encerrada, ninguém morre');
  ok(/empurrado/.test(res.msg) && V.emEspera(s, h) === 60 && !V.podeVisitar(s, h).ok, 'recinto fica 1 h de jogo fechado para visita');
  const al = s.alerts.find(a => a.type === 'visita'); ok(al && al.target === h.id && ALERT_INFO.visita.sev === 2, 'alerta "Visitante em risco" criado');
  const sg = seguranca(s); ok(eligibleStaff(s, al).some(x => x.st === sg) && dispatch(s, al.id, sg.id) && sg.task.type === 'patrol', 'e pode ser despachado para um segurança');
  run(s, 30000, () => {}, { abstract: true, realDt: 0, moveMul: 0, now }); refreshAlerts(s);
  ok(!s.alerts.some(a => a.type === 'visita') && !h.visitaRisco, 'o segurança confere o local e o alerta some');
  // longe: nada acontece
  hora(s, 9); h.visitaAte = 0; V.abrirVisita(s, h); calmo(); posto(l1, P0.x, P0.z);
  const J2 = { x: P0.x + 9, z: P0.z, hab: h.id }, ctx2 = { abstract: false, realDt: 0.05, moveMul: 1, player: J2 };
  let longe = false; for (let i = 0; i < 200; i++) { step(s, 0.05 / 60, ctx2); if (l1.st === 'ameaca' || l1.st === 'investida' || ctx2.ataque) longe = true; calmo(); }
  ok(!longe, 'a 9 m o leão calmo não reage');
  // zebra calma nunca ataca; flamingo ignora
  posto(zb, P0.x + 8, P0.z); const ctx3 = { abstract: false, realDt: 0.05, moveMul: 1, player: { x: zb.x + 1.5, z: zb.z, hab: h.id } };
  let zr = false; for (let i = 0; i < 200; i++) { ctx3.player.x = zb.x + 1.5; ctx3.player.z = zb.z; step(s, 0.05 / 60, ctx3); if (ctx3.ataque) zr = true; calmo(); }
  ok(!zr, 'zebra calma não ataca');
  // modo selvagem desligado
  s.settings.selvagem = false; posto(l1, P0.x, P0.z); const ctx4 = { abstract: false, realDt: 0.05, moveMul: 1, player: J };
  let off = false; for (let i = 0; i < 300; i++) { step(s, 0.05 / 60, ctx4); if (ctx4.ataque || l1.st === 'ameaca') off = true; calmo(); }
  ok(!off, 'com o modo selvagem desligado os animais ignoram o jogador'); s.settings.selvagem = true;
  // Modo Tranquilo: ameaça, para a 1 m, sem lesão
  s.settings.tranquilo = true; posto(l1, P0.x, P0.z); l1.wCool = 0; const ctx5 = { abstract: false, realDt: 0.05, moveMul: 1, player: J }; let at5 = null, dmin = 9;
  for (let i = 0; i < 400 && !at5; i++) { step(s, 0.05 / 60, ctx5); dmin = Math.min(dmin, Math.hypot(l1.x - J.x, l1.z - J.z)); if (ctx5.ataque) at5 = ctx5.ataque; calmo(); }
  const les1 = s.player.lesoes, r5 = at5 && V.ataqueVisita(s, l1, at5.manso);
  ok(at5 && at5.manso && dmin >= 0.95 && s.player.lesoes === les1 && h.visitOpen === false && /parou a 1 m/.test(r5.msg), `Modo Tranquilo: faz a carga, para a ~1 m (${dmin.toFixed(2)} m), sem lesão, visita encerrada`);
  ok(!h.visitaRisco, 'e não gera alerta');
  s.settings.tranquilo = false;
}
// preparar visita: tratador recolhe os perigosos nas tocas
{
  const s = base(), h = placeHabitat(s, 24, 24, 37, 35, 'savana', 'muro').hab;
  for (const sp of ['leao', 'leao', 'leao', 'zebra']) buyAnimal(s, sp, 30, 30);
  const calmo = () => { for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; a.stress = 0.2; a.energy = 0.8; } }; calmo();
  let r = V.prepararVisita(s, h); ok(!r.ok && r.semToca, 'sem toca: explica que falta toca');
  placeToca(s, 27, 27); r = V.prepararVisita(s, h);
  ok(!r.ok && /Faltam vagas/.test(r.msg) && tocaVagas(s, 'leao') === 2 && tocaVagas(s, 'elefante') === 1, '1 toca abriga 2 leões: faltam vagas para o terceiro');
  placeToca(s, 32, 31); r = V.prepararVisita(s, h); ok(!r.ok && /tratador/.test(r.msg), 'sem tratador: pede para contratar');
  const tr = tratador(s); r = V.prepararVisita(s, h);
  ok(r.ok && h.preparo.total === 3 && tr.task?.type === 'guardar', `tratador sai para recolher 3 leões (${r.msg})`);
  let k = 0; const ctx = live();
  while (k++ < 60000 && !V.visitaLiberada(s, h)) { step(s, 0.0125, ctx); if (k % 200 === 0) { hora(s, 10); calmo(); } }
  const leoes = s.animals.filter(a => a.sp === 'leao');
  ok(V.visitaLiberada(s, h) && leoes.every(a => a.preso && a.st === 'in_toca'), `os 3 leões ficam recolhidos (${leoes.map(a => a.st)}, ${k} passos)`);
  ok(tocasDe(s, h.id).every(t => t.fechada) && leoes.every(a => perigoDe(s, a) === 0) && h.preparo.prontos === 3, 'tocas fechadas e perigo efetivo 0');
  ok(tocasDe(s, h.id).every(t => ocupantes(s, t).length <= 2), 'no máximo 2 leões por toca');
  // visita segura: 30 s lá dentro sem aviso nem ataque
  V.abrirVisita(s, h); const tc = tocaCenter(tocasDe(s, h.id)[0]), J = { x: tc.x + 3.2, z: tc.z, hab: h.id }, c2 = { abstract: false, realDt: 0.05, moveMul: 1, player: J }; let aviso = false;
  for (let i = 0; i < 600; i++) { step(s, 0.05 / 60, c2); if (riscoVisita(s, J) || c2.ataque || c2.ameaca) aviso = true; calmo(); }
  ok(!aviso && leoes.every(a => a.st === 'in_toca'), 'com os animais recolhidos, 30 s dentro do recinto sem aviso');
  V.fecharVisita(s, h); ok(!h.preparo && leoes.every(a => !a.preso) && tocasDe(s, h.id).every(t => !t.fechada), 'ao sair, os animais são soltos e as tocas reabrem');
  run(s, 2500, i => { if (i % 200 === 0) { hora(s, 9); calmo(); } }); ok(leoes.some(a => a.st !== 'in_toca'), 'e eles voltam a sair sozinhos');
  // prazo: preparo sem visita vence e solta
  r = V.prepararVisita(s, h); ok(r.ok, 'preparar de novo'); s.clock.min += 200; h.preparo.ate = s.clock.min - 1;
  simulateAbstract(s, 61, { now }); ok(!h.preparo && s.animals.every(a => !a.preso), 'relógio avançado/app fechado solta os animais e cancela o preparo');
}
console.log(`\n${n - fails}/${n} verificações`);
if (fails) { console.error(`${fails} FALHA(S) NA 1.7.2b`); process.exit(1); }
console.log('TODOS OS TESTES DA 1.7.2b PASSARAM');
