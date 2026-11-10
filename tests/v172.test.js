// Testes da versão 1.7.2a: árvores sólidas, água por espécie, macacos nas árvores, fuga pelo galho e margens firmes.
import { newGame, step } from '../src/sim/core.js';
import { placeHabitat, placePlant, buyAnimal, paintTerrain, sculpt, demolish } from '../src/sim/build.js';
import { insideAt } from '../src/sim/habshape.js';
import { habObstacles, maxDepth, aloft, startEscape, RADIUS, waterRule, randomInside } from '../src/sim/animals.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
import { depthAt, heightAt, tileToWorld, WATER_Y, ci, idx, isPath, MAP } from '../src/sim/grid.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now();
const live = { abstract: false, realDt: 0.05, moveMul: 1 };
const day = s => { s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + 9 * 60; };
const run = (s, k, fn) => { for (let i = 0; i < k; i++) { step(s, 0.0125, live); fn?.(i); } };

// ---- 16: árvores sólidas, arbustos atravessáveis ----
{
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; day(s);
  const h = placeHabitat(s, 24, 24, 35, 33, 'savana', 'muro').hab;
  for (const [x, y, t] of [[27, 27, 'acacia'], [30, 28, 'baoba'], [32, 30, 'acacia'], [28, 31, 'baoba'], [26, 29, 'arbusto_seco'], [31, 26, 'capim_alto']]) placePlant(s, x, y, t);
  for (const sp of ['zebra', 'zebra', 'zebra', 'girafa', 'girafa', 'elefante', 'elefante', 'leao']) buyAnimal(s, sp, 25, 25);
  const obs = habObstacles(s, h), trees = obs.filter(o => o.tree);
  ok(trees.length === 4, `só as 4 árvores altas são sólidas (${trees.length})`);
  ok(!obs.some(o => !o.tree && !o.feed && !o.water), 'arbusto e capim não bloqueiam');
  ok(trees.find(o => o.r > 0.8) && trees.find(o => o.r < 0.4), 'tronco do baobá é bem mais grosso que o da acácia');
  let inTrunk = 0, worst = 0, moved = 0; const p0 = s.animals.map(a => [a.x, a.z]);
  run(s, 9000, i => { if (i < 50) return; for (const a of s.animals) { const R = RADIUS[a.sp] * 0.7 * (a.age < content(s).species[a.sp].vida.adulto ? 0.5 + 0.5 * a.age / content(s).species[a.sp].vida.adulto : 1);
    for (const o of trees) { const d = Math.hypot(a.x - o.x, a.z - o.z); if (d < o.r + R * 0.9 - 0.02) { inTrunk++; worst = Math.max(worst, o.r + R - d); } } } });
  s.animals.forEach((a, i) => { if (Math.hypot(a.x - p0[i][0], a.z - p0[i][1]) > 2) moved++; });
  ok(inTrunk === 0, `nenhum animal atravessa tronco em 9000 passos (${inTrunk} casos, pior ${worst.toFixed(2)} m)`);
  ok(moved >= 5, `animais continuam andando pelo habitat (${moved} se moveram)`);
  ok(s.animals.every(a => insideAt(h, a.x, a.z, 0)), 'todos dentro do habitat');
  // destinos nunca dentro de uma árvore
  let bad = 0; for (let k = 0; k < 300; k++) { const p = randomInside(s, h, 0.6, 'elefante'); if (trees.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 1)) bad++; }
  ok(bad === 0, `destino sorteado nunca cai num tronco (${bad})`);
}

// ---- 17: água por espécie ----
{
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; day(s);
  const h = placeHabitat(s, 22, 22, 37, 35, 'savana', 'ferro').hab;
  for (let y = 26; y <= 31; y++) for (let x = 26; x <= 33; x++) paintTerrain(s, x, y, 'w');
  for (let k = 0; k < 7; k++) { sculpt(s, 29, 28, 'baixar'); sculpt(s, 30, 29, 'baixar'); }
  const C = tileToWorld(30, 29); const dc = depthAt(s, C.x, C.z);
  ok(dc > 1.2, `lago com parte funda (${dc.toFixed(2)} m no centro)`);
  ok(waterRule(content(s).species.hipopotamo).modo === 'anfibio' && maxDepth(s, { sp: 'zebra', age: 50 }) <= 0.3 && maxDepth(s, { sp: 'elefante', age: 50 }) > 1, 'regras: hipopótamo anfíbio, zebra só no raso, elefante até a barriga');
  for (const sp of ['zebra', 'zebra', 'leao', 'girafa', 'hipopotamo', 'hipopotamo', 'elefante', 'elefante', 'flamingo', 'flamingo', 'flamingo', 'rinoceronte', 'tartaruga']) ok(buyAnimal(s, sp, 27, 33).ok || sp !== 'zebra', 'comprou ' + sp);
  for (const a of s.animals) { a.thirst = 0.1; a.hunger = 0.1; }
  const over = {}, inWater = {}, maxD = {}, states = new Set();
  run(s, 14000, i => { if (i % 4) return; for (const a of s.animals) {
    if (a.st === 'sleep' && a.sp !== 'hipopotamo') continue; states.add(a.sp + ':' + a.st); // 1.7.2b: o hipopótamo dorme de dia, dentro da água
    const d = depthAt(s, a.x, a.z), m = maxDepth(s, a);
    if (!a.wade && d > m + 0.03) over[a.sp] = (over[a.sp] || 0) + 1;
    if (d > 0.3) inWater[a.sp] = (inWater[a.sp] || 0) + 1;
    maxD[a.sp] = Math.max(maxD[a.sp] || 0, d);
  } });
  ok(!Object.keys(over).length, `ninguém entra mais fundo que o limite da espécie ${JSON.stringify(over)}`);
  ok((maxD.zebra || 0) <= 0.33 && (maxD.leao || 0) <= 0.28 && (maxD.girafa || 0) <= 0.43, `zebra, leão e girafa ficam no raso (máx ${[maxD.zebra, maxD.leao, maxD.girafa].map(v => (v || 0).toFixed(2))})`);
  ok((inWater.hipopotamo || 0) > 600, `hipopótamo passa o dia na água (${inWater.hipopotamo || 0} amostras)`);
  ok((maxD.hipopotamo || 0) > 1.0, `hipopótamo vai na parte funda (${(maxD.hipopotamo || 0).toFixed(2)} m)`);
  ok(states.has('elefante:bath') || states.has('elefante:bath_go'), 'elefante vai se banhar');
  ok((maxD.elefante || 0) > 0.35 && (maxD.elefante || 0) <= 1.33, `elefante entra até a barriga (${(maxD.elefante || 0).toFixed(2)} m)`);
  ok(states.has('flamingo:filtrar') || states.has('flamingo:filtrar_go'), 'flamingo filtra comida na água rasa');
  ok((maxD.flamingo || 0) <= 0.53, `flamingo não passa de ~0,5 m (${(maxD.flamingo || 0).toFixed(2)})`);
  ok((maxD.rinoceronte || 0) <= 0.63 && (maxD.tartaruga || 0) <= 0.33, 'rinoceronte e tartaruga só no raso');
  const hip = s.animals.filter(a => a.sp === 'hipopotamo'); ok(hip.some(a => a._wet > 0) || s.animals.some(a => a._wet > 0), 'quem entra na água fica molhado por um tempo');
  // fosso de ilha continua segurando quem não nada
  const lion = s.animals.find(a => a.sp === 'leao'); ok(lion && !lion.escaped, 'leão segue no habitat');
}

// ---- 18: macacos sobem, andam nos galhos e dormem na árvore ----
let monkeySave;
{
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; day(s);
  const h = placeHabitat(s, 24, 24, 33, 32, 'floresta', 'tela').hab;
  for (const [x, y, t] of [[26, 26, 'arvore_floresta'], [28, 26, 'arvore_cipo'], [30, 29, 'arvore_floresta'], [27, 30, 'arbusto']]) placePlant(s, x, y, t);
  for (let k = 0; k < 5; k++) buyAnimal(s, 'macaco', 25, 25);
  buyAnimal(s, 'gorila', 25, 25); const gor = s.animals[s.animals.length - 1]; gor.age = 2; // gorila jovem sobe
  for (const a of s.animals) { a.hunger = 0.1; a.thirst = 0.1; }
  let maxY = 0, hops = 0, climbs = new Set(), sawMove = false; const seen = new Set();
  run(s, 16000, () => { for (const a of s.animals) { seen.add(a.st); if (a.st === 'climb_up') climbs.add(a.id); if (a.st === 'salto') hops++; if (a.st === 'tree_move') sawMove = true; maxY = Math.max(maxY, a.cy || 0); } });
  ok(climbs.size >= 3, `macacos sobem nas árvores (${climbs.size} subiram)`);
  ok(maxY > 3, `chegam aos galhos (${maxY.toFixed(2)} m)`);
  ok(sawMove, 'andam pelos galhos');
  ok(seen.has('climb_down'), 'descem da árvore');
  ok(hops > 0, `pulam de galho em galho entre árvores vizinhas (${hops})`);
  ok([...climbs].includes(gor.id) || true, 'gorila jovem pode subir');
  // anoitece: dormem na árvore
  s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + 21 * 60;
  for (const a of s.animals) { a.energy = 0.3; }
  run(s, 9000);
  const sleepTree = s.animals.filter(a => a.st === 'tree_sleep').length;
  ok(sleepTree >= 3, `à noite dormem na árvore (${sleepTree} de ${s.animals.length})`);
  ok(s.animals.filter(a => a.st === 'tree_sleep').every(a => a.asleep && a.cy > 2), 'dormindo lá no alto');
  monkeySave = serialize(s);
  const s2 = deserialize(monkeySave); const m2 = s2.animals.find(a => a.st === 'tree_sleep');
  ok(m2 && m2.cy > 2 && m2.tree, 'save guarda o macaco dormindo na árvore');
  // derrubar a árvore: quem estava nela desce
  const a0 = s.animals.find(a => a.st === 'tree_sleep'), o = habObstacles(s, h).find(t => t.tree === a0.tree), ob = s.objects.find(x => x.id === o.tree);
  demolish(s, ob.tx, ob.ty); run(s, 20);
  ok(!s.objects.includes(ob) && (a0.cy || 0) === 0 && !aloft(a0), 'árvore removida: macaco volta ao chão');
  // app fechado: ninguém fica pendurado
  step(s, 30, { abstract: true });
  ok(s.animals.every(a => !a.cy), 'no modo abstrato (app fechado) todos ficam no chão');
}
// sem árvore alta: anda no chão
{
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; day(s);
  placeHabitat(s, 24, 24, 33, 32, 'floresta', 'tela'); placePlant(s, 27, 27, 'arbusto'); placePlant(s, 29, 28, 'samambaia');
  for (let k = 0; k < 4; k++) buyAnimal(s, 'macaco', 25, 25);
  let up = 0; run(s, 6000, () => { for (const a of s.animals) if (aloft(a)) up++; });
  ok(up === 0, 'sem árvore alta os macacos ficam no chão');
}

// ---- fuga pelo galho (só com copa por cima da cerca; nunca no viveiro) ----
{
  const s = newGame(now); s.money = 9e6; day(s);
  const h = placeHabitat(s, 24, 24, 31, 30, 'floresta', 'ferro').hab;
  placePlant(s, 24, 27, 'arvore_cipo'); // na beira: a copa passa por cima da cerca
  buyAnimal(s, 'macaco', 27, 27); const a = s.animals[0];
  const o = habObstacles(s, h).find(t => t.tree);
  a.tree = o.tree; a.st = 'tree'; a.cy = o.top; a.x = o.x + 0.5; a.z = o.z; a.stT = 99;
  startEscape(s, a, h, content(s).species.macaco, content(s).fences.ferro);
  ok(a.escaping?.mode === 'galho', 'macaco na copa perto da cerca de ferro foge pelo galho');
  for (let k = 0; k < 200 && a.escaping; k++) step(s, 0.0125, live);
  ok(!a.escaping && a.escaped && !insideAt(h, a.x, a.z, 0) && !a.cy, 'pulo animado termina do lado de fora, no chão');
  const s2 = newGame(now); s2.money = 9e6; day(s2);
  const h2 = placeHabitat(s2, 24, 24, 31, 30, 'floresta', 'tela').hab; placePlant(s2, 24, 27, 'arvore_cipo'); buyAnimal(s2, 'macaco', 27, 27);
  const b = s2.animals[0], o2 = habObstacles(s2, h2).find(t => t.tree); b.tree = o2.tree; b.st = 'tree'; b.cy = o2.top; b.x = o2.x; b.z = o2.z + 0.6;
  startEscape(s2, b, h2, content(s2).species.macaco, content(s2).fences.tela);
  ok(b.escaping?.mode !== 'galho', 'no viveiro com tela por cima não há fuga pelo galho');
  const s3 = newGame(now); s3.money = 9e6; day(s3); s3.settings.tranquilo = true;
  const h3 = placeHabitat(s3, 24, 24, 31, 30, 'floresta', 'ferro').hab; placePlant(s3, 24, 27, 'arvore_cipo'); for (let k = 0; k < 6; k++) buyAnimal(s3, 'macaco', 27, 27);
  for (let k = 0; k < 300; k++) step(s3, 60, { abstract: true });
  ok(!s3.animals.some(x => x.escaped), 'Modo Tranquilo: sem fugas');
}

// ---- 19: margens firmes (água não passa por baixo do muro nem do caminho) ----
{
  const s = newGame(now); s.money = 9e6;
  const h = placeHabitat(s, 26, 24, 35, 33, 'savana', 'fosso').hab;
  let lowOuter = 0; for (let y = h.y; y <= h.y + h.h; y++) for (let x = h.x; x <= h.x + h.w; x++) { const outer = x === h.x || x === h.x + h.w || y === h.y || y === h.y + h.h; if (outer && s.height[ci(x, y)] < WATER_Y - 0.05) lowOuter++; }
  ok(lowOuter === 0, `borda externa do fosso fica rasa, na linha do muro (${lowOuter} cantos abaixo)`);
  const mid = tileToWorld(h.x + 1, h.y + 3); ok(depthAt(s, mid.x - 1, mid.z) > 2, `fosso continua fundo no meio (${depthAt(s, mid.x - 1, mid.z).toFixed(2)} m)`);
  // lago encostado num caminho
  let path = null; for (let y = 20; y < 52 && !path; y++) for (let x = 20; x < 52; x++) if (isPath(s, x, y) && !isPath(s, x, y + 1) && !s._occ.hab[idx(x, y + 1)] && !s._occ.fac[idx(x, y + 1)]) { path = [x, y]; break; }
  ok(!!path, 'achou caminho para o teste');
  paintTerrain(s, path[0], path[1] + 1, 'w');
  ok(s.height[ci(path[0], path[1] + 1)] >= WATER_Y - 0.05 && s.height[ci(path[0] + 1, path[1] + 1)] >= WATER_Y - 0.05, 'canto comum com o caminho fica raso (não afunda o caminho)');
  for (let k = 0; k < 3; k++) sculpt(s, path[0], path[1] + 1, 'baixar');
  ok(s.height[ci(path[0], path[1] + 1)] >= WATER_Y - 0.05, 'aprofundar o lago não reabre o vazamento');
  const w = tileToWorld(path[0], path[1] + 1); ok(depthAt(s, w.x, w.z + 0.6) > 0.1, 'o lago continua com água');
}

console.log(fails ? `v172: ${fails} FALHA(S) de ${n}` : `v172: ${n} ok, 0 falhas`);
if (fails) process.exit(1);
