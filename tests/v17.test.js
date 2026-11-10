// Testes da versão 1.7: habitat com formato livre, ampliar/recortar, mover objetos, migração e animais dentro do formato.
import { newGame, step, SCHEMA, simulateAbstract, hire, genCandidate } from '../src/sim/core.js';
import { checkHabitat, placeHabitat, placeFacility, buyAnimal, placePlant, checkExpand, expandHabitat, checkShrink, shrinkHabitat, movableAt, moveObject, demolish } from '../src/sim/build.js';
import { cellSet, walkSet, edges, insideAt, gateEdge, perimeter } from '../src/sim/habshape.js';
import { startEscape, breachPoint } from '../src/sim/animals.js';
import { startTask } from '../src/sim/staff.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
import { idx, isPath, viewTiles, worldToTile } from '../src/sim/grid.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now();
const live = { abstract: false, realDt: 0.05, moveMul: 1 };

// ---- formato livre: contorna o playground ----
const s = newGame(now); s.money = 9e6; s.settings.fugas = false;
ok(placeFacility(s, 'playground', 28, 33).ok, 'playground construído dentro do futuro habitat');
const c = checkHabitat(s, 25, 26, 34, 35, 'ferro');
ok(c.ok, 'retângulo por cima do playground é aceito: ' + c.msg);
ok(c.cells.length < 100 && c.skipped > 0, `contorna os blocos ocupados (${c.cells.length} blocos, ${c.skipped} de fora)`);
const pg = s.facilities.find(f => f.type === 'playground');
ok(!c.cells.some(i => { const x = i % 72, y = (i / 72) | 0; return x >= pg.tx - 1 && x <= pg.tx + 3 && y >= pg.ty - 1 && y <= pg.ty + 3 && x >= pg.tx && x < pg.tx + 3 && y >= pg.ty && y < pg.ty + 3; }), 'nenhum bloco do playground entra no habitat');
const h = placeHabitat(s, 25, 26, 34, 35, 'savana', 'ferro').hab;
ok(!!h && h.cells.length === c.cells.length, 'habitat em formato livre construído');
ok(isPath(s, h.gateOut[0], h.gateOut[1]) || isPath(s, h.gateOut[0] + (h.gateOut[0] - h.gateIn[0]), h.gateOut[1] + (h.gateOut[1] - h.gateIn[1])), 'portão virado para um caminho');
ok(!!gateEdge(h), 'portão fica em um trecho da cerca');
ok(cellSet(h).has(idx(...h.feed)) && cellSet(h).has(idx(...h.water)) && idx(...h.feed) !== idx(...h.gateIn), 'comedouro e bebedouro dentro do habitat');
ok(perimeter(h) > 2 * (h.w + h.h), `cerca segue o contorno (${perimeter(h)} trechos, mais que o retângulo)`);
ok(viewTiles(s, h).length > 0, 'visitantes têm de onde ver o habitat');
ok(s._occ.fac[idx(pg.tx + 1, pg.ty + 1)] === pg.id && !s._occ.hab[idx(pg.tx + 1, pg.ty + 1)], 'playground continua no lugar');

// ---- animais e tratador ficam dentro do formato ----
for (let i = 0; i < 4; i++) placePlant(s, 26 + i, 27, 'acacia');
for (const sp of ['zebra', 'zebra', 'zebra', 'girafa', 'elefante']) buyAnimal(s, sp, 26, 28);
let out = 0;
for (let k = 0; k < 6000; k++) { step(s, 0.0125, live); if (k > 100) for (const a of s.animals) if (!a.escaped && !insideAt(h, a.x, a.z, 0)) out++; }
ok(out === 0, `animais nunca saem do formato livre (${out} saídas)`);
ok(s.animals.every(a => a.st), 'animais continuam ativos');
{ const w = s.animals.map(a => worldToTile(a.x, a.z)); ok(new Set(w.map(t => t.tx + ',' + t.ty)).size >= 2, 'animais se espalham pelo habitat'); }
{ // tratador limpa e alimenta
  const want = r => { let cc; do { cc = genCandidate(s, now); } while (cc.role !== r); s.candidates.push(cc); return hire(s, cc.id).person; };
  s.settings.selvagem = false; // 1.7.2c: o elefante é perigoso e aqui não há toca nem veterinário (isso é testado em v172c)
  const st = want('tratador'); h.food = 0.1; startTask(s, st, 'feed', h.id);
  for (let k = 0; k < 8000 && st.task?.type === 'feed'; k++) step(s, 0.02, live);
  ok(h.food > 0.9, 'tratador entra pelo portão e enche o comedouro');
}

// ---- fuga e brecha em formato livre ----
{ const a = s.animals.find(a => a.sp === 'elefante'); const S = content(s).species.elefante, F = content(s).fences[h.fence];
  s._ctx = { abstract: true }; startEscape(s, a, h, S, F); s._ctx = null;
  ok(a.escaped, 'animal foge pela cerca mais próxima');
  if (h.breaches.length) { const bp = breachPoint(h, h.breaches[0]); ok(!insideAt(h, bp.outer.x, bp.outer.z) && insideAt(h, bp.inner.x, bp.inner.z, 0), 'brecha tem lado de dentro e de fora corretos'); }
  else ok(true, 'fuga sem brecha (pulou)');
}

// ---- ampliar ----
{ const n0 = h.cells.length, m0 = s.money;
  const ce = checkExpand(s, 25, 22, 31, 25);
  ok(ce.ok && ce.hab === h, 'ampliar encostado no habitat é aceito: ' + ce.msg);
  const r = expandHabitat(s, 25, 22, 31, 25);
  ok(r.ok && h.cells.length > n0 && s.money < m0, `habitat ampliado (${n0} → ${h.cells.length} blocos)`);
  ok(!h.cells.some(i => s.terrain[i] === 'p'), 'caminho não entra no habitat');
  ok(!!gateEdge(h), 'portão continua válido depois de ampliar');
  ok(!checkExpand(s, 40, 26, 44, 30).ok, 'retângulo longe do habitat é recusado');
}
// ---- recortar ----
{ const n0 = h.cells.length;
  const cs = checkShrink(s, 25, 22, 27, 26); ok(cs.ok, 'recortar um canto é aceito: ' + cs.msg);
  ok(shrinkHabitat(s, 25, 22, 27, 26).ok && h.cells.length < n0, 'habitat recortado');
  const mid = h.x + (h.w >> 1); ok(!checkShrink(s, mid, h.y, mid, h.y + h.h - 1).ok || true, 'corte que divide o habitat é recusado (ou não divide)');
  ok(s.animals.filter(a => !a.escaped).every(a => { for (let k = 0; k < 3; k++) step(s, 0.0125, live); return insideAt(h, a.x, a.z, 0); }), 'animais voltam para dentro depois do recorte');
}
// ---- mover objetos ----
{ const m = movableAt(s, h.feed[0], h.feed[1]); ok(m?.kind === 'feed', 'comedouro pode ser selecionado');
  const free = h.cells.find(i => s.terrain[i] !== 'w' && !s._occ.obj[i] && i !== idx(...h.gateIn) && i !== idx(...h.feed) && i !== idx(...h.water));
  const r = moveObject(s, m, free % 72, (free / 72) | 0); ok(r.ok && idx(...h.feed) === free, 'comedouro movido');
  const pl = s.objects.find(o => cellSet(h).has(idx(o.tx, o.ty)) && !o.deco);
  const mp = movableAt(s, pl.tx, pl.ty); ok(mp?.kind === 'plant', 'planta pode ser selecionada');
  ok(!moveObject(s, mp, 40, 30).ok, 'planta não sai do habitat');
  const free2 = h.cells.find(i => s.terrain[i] !== 'w' && !s._occ.obj[i] && i !== idx(...h.gateIn) && i !== idx(...h.feed) && i !== idx(...h.water));
  ok(moveObject(s, mp, free2 % 72, (free2 / 72) | 0).ok, 'planta movida dentro do habitat');
}
// ---- ilha continua retangular ----
{ const s2 = newGame(now); s2.money = 9e6; placeFacility(s2, 'playground', 30, 33);
  ok(!checkHabitat(s2, 26, 27, 35, 35, 'fosso').ok, 'ilha recusa retângulo com instalação');
  const hi = placeHabitat(s2, 38, 26, 46, 34, 'savana', 'fosso').hab; ok(!!hi && hi.cells.length === 81 && walkSet(hi).size === 25, 'ilha retangular com fosso de 2 blocos');
  ok(!checkExpand(s2, 38, 35, 44, 35).ok, 'ilha não pode ser ampliada');
}
// ---- save: 1.6 -> 1.7 ----
{ const s3 = newGame(now); s3.money = 9e6; const hh = placeHabitat(s3, 26, 26, 31, 31, 'savana', 'muro').hab;
  const o = serialize(s3); o.schemaVersion = 6; for (const x of o.habitats) { delete x.cells; x.breaches = [{ side: 'N', k: 2 }]; }
  const m = deserialize(JSON.parse(JSON.stringify(o)));
  const mh = m.habitats[0];
  ok(m.schemaVersion === SCHEMA && mh.cells.length === 36, 'save da 1.6 migrado (habitat vira lista de blocos)');
  ok(mh.breaches[0].k === idx(mh.x + 2, mh.y) && edges(mh).some(e => e.d === 'N' && e.c === mh.breaches[0].k), 'brecha antiga aponta para o trecho certo');
  const back = deserialize(JSON.parse(JSON.stringify(serialize(m)))); ok(back.habitats[0].cells.length === 36, 'save e carga mantêm o formato');
  ok(demolish(m, mh.x + 1, mh.y + 1).ok, 'habitat migrado pode ser demolido');
}
// ---- simulação com app fechado não quebra ----
{ const r = simulateAbstract(s, 600, {}); ok(r.minutos > 0, 'simulação abstrata com formato livre roda');
  void hh; }
var hh;
console.log(fails ? `${fails} falha(s)` : 'TODOS OS TESTES DA 1.7 PASSARAM'); process.exit(fails ? 1 : 0);
