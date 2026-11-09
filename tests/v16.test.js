// Testes da versão 1.6: colisão de animais, limite de visitantes, caminhos, mobiliário, orientação e mesas.
import { newGame, step, simulateAbstract, SCHEMA } from '../src/sim/core.js';
import { placeHabitat, buyAnimal, placePlant, paintTerrain, placeFacility, checkFacility, demolish } from '../src/sim/build.js';
import { RADIUS, habObstacles } from '../src/sim/animals.js';
import { distributeFurniture, furnCounts } from '../src/sim/furn.js';
import { accessTile, isPath, isPathT, frontTile, sideTiles } from '../src/sim/grid.js';
import { arrive, visitorCap, updateVisitors } from '../src/sim/visitors.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now();

// ---- animais: sem sobreposição e sem atravessar objetos ----
{
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false;
  const h = placeHabitat(s, 24, 26, 33, 34, 'savana', 'muro').hab;
  for (let i = 0; i < 8; i++) placePlant(s, 25 + i, 28, 'acacia');
  for (const sp of ['zebra', 'zebra', 'zebra', 'elefante', 'elefante', 'leao', 'leao', 'girafa']) buyAnimal(s, sp, 28, 30);
  const ctx = { abstract: false, realDt: 0.05, moveMul: 1 }; let minR = 9, inObs = 0, outside = 0;
  for (let k = 0; k < 5000; k++) {
    step(s, 0.0125, ctx);
    if (k < 200) continue;
    for (const a of s.animals) {
      for (const o of habObstacles(s, h)) if (Math.hypot(a.x - o.x, a.z - o.z) < (o.r + RADIUS[a.sp] * 0.7) * 0.85) inObs++;
      if (a.x < h.x * 2 - 72 || a.x > (h.x + h.w) * 2 - 72 || a.z < h.y * 2 - 72 || a.z > (h.y + h.h) * 2 - 72) outside++;
      for (const b of s.animals) if (b !== a) minR = Math.min(minR, Math.hypot(a.x - b.x, a.z - b.z) / ((RADIUS[a.sp] + RADIUS[b.sp]) * 0.7));
    }
  }
  ok(inObs === 0, 'animais não atravessam plantas, comedouro e bebedouro');
  ok(minR > 0.85, `animais não se sobrepõem (menor razão ${minR.toFixed(2)})`);
  ok(outside === 0, 'animais ficam dentro do habitat');
  ok(s.animals.some(a => a.st === 'eat' || a.st === 'drink' || a.st === 'walk' || a.st === 'idle'), 'animais continuam vivos e ativos');
}

// ---- limite de 100 visitantes desenhados, contador total ----
{
  const s = newGame(now); s.settings.quality = 'alto'; s.money = 9e6; s.clock.min = 10 * 60;
  ok(visitorCap(s) === 100, 'limite de 100 visitantes desenhados no gráfico Alto/Ultra');
  const ctx = { abstract: false, realDt: 0.05, moveMul: 1 }, m0 = s.money;
  for (let i = 0; i < 160; i++) arrive(s, ctx);
  ok(s.visitors.length === 100, 'só 100 visitantes são criados');
  ok(s.stats.visitantesHoje === 160 && s.money - m0 >= 160 * s.ticket, 'os 160 pagam o ingresso');
  updateVisitors(s, 0.01, ctx);
  ok(s.stats.visitorsIn === 160, 'o contador mostra 160 (100 desenhados + 60 virtuais)');
  s.clock.min = 19 * 60; updateVisitors(s, 0.01, ctx);
  ok(s.vstock.length === 0, 'fora do horário os virtuais saem');
  s.settings.quality = 'baixo'; ok(visitorCap(s) === 70, 'gráfico Baixo desenha até 70');
}

// ---- caminhos, mobiliário, orientação ----
{
  const s = newGame(now); s.money = 9e6; const C = content(s);
  ok(Object.values(C.terrains).filter(t => t.caminho).length === 4, '4 tipos de caminho');
  const tiles = []; for (let x = 24; x <= 47; x++) { paintTerrain(s, x, 40, 'k'); paintTerrain(s, x, 41, 'k'); tiles.push([x, 40]); }
  ok(isPathT(s.terrain[40 * 72 + 30]) && s.terrain[40 * 72 + 30] === 'k', 'caminho cimentado com calçada pintado');
  const r = distributeFurniture(s, tiles, { poste: 5, lixeira: 5, banco: 5 }), n = r.placed;
  ok(n.poste >= 2 && n.lixeira >= 1 && n.banco >= 2, `mobiliário distribuído (${n.poste} postes, ${n.lixeira} lixeiras, ${n.banco} bancos)`);
  const keys = s.furn.map(f => f.tx + ',' + f.ty); ok(new Set(keys).size === keys.length, 'sem sobreposição: no máximo 1 móvel por bloco');
  ok(s.furn.every(f => isPathT(s.terrain[f.ty * 72 + f.tx]) && Math.hypot(f.ox, f.oz) > 0.3), 'mobiliário fica sobre o caminho, na borda');
  const r0 = distributeFurniture(s, tiles, { poste: 0, lixeira: 0, banco: 0 }); ok(r0.cost === 0, 'barras em zero: nada é colocado');
  const m0 = s.money; const before = s.furn.length;
  const f1 = s.furn[0]; const d = demolish(s, f1.tx, f1.ty); ok(d.ok && s.furn.length === before - 1, 'demolir remove o mobiliário do bloco'); ok(s.money > m0, 'demolir devolve parte do valor');
  // instalação vira para o caminho
  const e = placeFacility(s, 'lanchonete', 30, 42); ok(e.ok, 'lanchonete ao lado do caminho');
  const lan = s.facilities.find(f => f.type === 'lanchonete'); ok(lan.dir === 2, 'lanchonete ao sul do caminho vira a frente para o norte');
  const D = C.facilities.lanchonete, ft = frontTile(s, lan, D); ok(ft && isPath(s, ft[0], ft[1]), 'a frente da lanchonete dá num caminho');
  ok(s.furn.some(f => f.type === 'lixeira' && Math.abs(f.tx - 31) < 4 && Math.abs(f.ty - 41) < 4), 'lanchonete ganha uma lixeira de brinde');
  // reorientação quando surge outro caminho
  const l2 = placeFacility(s, 'loja', 40, 38); ok(l2.ok && s.facilities.find(f => f.type === 'loja').dir === 0, 'loja ao norte do caminho vira para o sul');
  // mesas só perto de lanchonete
  const m1 = checkFacility(s, 'mesas', 44, 42), mesasOk = checkFacility(s, 'mesas', 27, 42);
  ok(!m1.ok && /lanchonete/.test(m1.msg), 'mesas longe da lanchonete são recusadas'); ok(mesasOk.ok, 'mesas ao lado da lanchonete são aceitas');
  ok(placeFacility(s, 'mesas', 27, 42).ok, 'área de mesas construída');
}

// ---- visitantes usam lixeira e mesas ----
{
  const s = newGame(now); s.money = 9e6; s.settings.quality = 'alto'; s.clock.min = 9 * 60;
  placeFacility(s, 'lanchonete', 30, 38); placeFacility(s, 'mesas', 26, 38);
  const tiles = []; for (let x = 23; x <= 48; x++) tiles.push([x, 36]);
  distributeFurniture(s, tiles, { poste: 0, lixeira: 6, banco: 4 });
  ok(s.furn.some(f => f.type === 'lixeira') && s.furn.some(f => f.type === 'banco'), 'caminho principal com lixeiras e bancos');
  const ctx = { abstract: false, realDt: 0.1, moveMul: 1 };
  const m0 = s.money; for (let k = 0; k < 4800; k++) step(s, 0.1, ctx);
  ok(s.stats.visitantesHoje + s.stats.history.reduce((a, d) => a + d.visitantes, 0) >= 3 && s.money > m0, 'visitantes passam e pagam com o novo mobiliário');
  const lit = Object.values(s.litter).reduce((a, b) => a + b, 0); ok(lit < 25, `pouco lixo no chão com lixeiras (${lit})`);
}

// ---- save: migração 1.5 -> 1.6 ----
{
  const s0 = newGame(now); s0.money = 9e6; placeFacility(s0, 'lanchonete', 30, 38);
  const o = serialize(s0); o.schemaVersion = 5; delete o.furn; delete o.vstock; for (const f of o.facilities) delete f.dir;
  const m = deserialize(JSON.parse(JSON.stringify(o)));
  ok(m.schemaVersion === SCHEMA && Array.isArray(m.furn) && Array.isArray(m.vstock), 'save da 1.5 migrado (mobiliário e visitantes virtuais)');
  const lan = m.facilities.find(f => f.type === 'lanchonete'); ok(lan.dir === 0 || lan.dir === 2, 'lanchonete antiga ganha orientação');
  const rt = deserialize(JSON.parse(JSON.stringify(serialize(m)))); ok(rt.furn.length === m.furn.length, 'save e carga mantêm o mobiliário');
}
console.log(fails ? fails + ' FALHA(S)' : 'TODOS OS TESTES DA 1.6 PASSARAM'); if (fails) process.exit(1);
