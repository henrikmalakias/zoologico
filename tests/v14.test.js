// Testes da versão 1.4: novas espécies, Zoopédia, Modo Tranquilo, configurações e migração.
import { newGame, simulateAbstract, METAS, checkMetas, DEFAULT_SETTINGS, genCandidate, hire } from '../src/sim/core.js';
import { placeHabitat, buyAnimal, paintTerrain, placePlant } from '../src/sim/build.js';
import { suitability, startEscape, hourlyAnimals } from '../src/sim/animals.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
import { ZOOPEDIA } from '../src/content/base.js';
import { buildMesh } from '../src/render/sdf.js';
import { readFileSync } from 'node:fs';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now();
const NOVAS = ['hipopotamo', 'rinoceronte', 'flamingo', 'gorila', 'tartaruga'];

// conteúdo
let s = newGame(now); const C = content(s);
ok(Object.keys(C.species).length === 10, '10 espécies no jogo base');
ok(Object.keys(C.species).every(k => ZOOPEDIA[k]?.cientifico && ZOOPEDIA[k].status && ZOOPEDIA[k].curiosidades.length >= 3), 'Zoopédia completa (nome científico, status, 3+ curiosidades)');
for (const sp of NOVAS) {
  const spec = JSON.parse(readFileSync(`src/content/modelos/${sp}.json`, 'utf8'));
  const t0 = performance.now(), m = buildMesh(spec, 'M'), ms = performance.now() - t0;
  ok(m.vertices > 2000 && m.vertices < 60000 && m.index.length > 0, `modelo realista ${sp}: ${m.vertices} vértices em ${ms.toFixed(0)} ms`);
}

// compra e adequação
s.money = 500000;
const sav = placeHabitat(s, 24, 26, 35, 34, 'savana', 'muro').hab;
ok(!!sav, 'habitat de savana com muro');
for (let i = 0; i < 2; i++) ok(buyAnimal(s, 'rinoceronte', 28, 29).ok, 'compra rinoceronte ' + (i + 1));
const sx = s.animals.filter(a => a.sp === 'rinoceronte').map(a => a.sex).sort().join('');
ok(sx === 'FM', 'casal de rinocerontes (macho e fêmea)');
const su = suitability(s, sav, 'rinoceronte');
ok(su.parts.cerca >= 0.95, 'muro segura rinoceronte');
// flamingo não precisa de plantas
const fl = placeHabitat(s, 38, 26, 45, 33, 'savana', 'ferro').hab;
for (let i = 0; i < 8; i++) buyAnimal(s, 'flamingo', 40, 28);
ok(suitability(s, fl, 'flamingo').parts.plantas === 1, 'flamingo: sem exigência de plantas');
ok(suitability(s, fl, 'flamingo').parts.agua < 0.95, 'flamingo pede água no habitat');
for (let x = 39; x <= 41; x++) for (let y = 30; y <= 31; y++) paintTerrain(s, x, y, 'w');
ok(suitability(s, fl, 'flamingo').parts.agua >= 0.95, 'com lago, o flamingo fica satisfeito com a água');

// meta coleção completa
ok(METAS.some(m => m.id === 'colecao'), 'meta Coleção completa existe');

// simulação com as novas espécies (com dois tratadores)
for (let k = 0; k < 2; k++) { let c; do { c = genCandidate(s, now); } while (c.role !== 'tratador'); s.candidates.push(c); hire(s, c.id); }
simulateAbstract(s, 2 * 1440, { now });
ok(s.animals.filter(a => NOVAS.includes(a.sp)).length >= 10, '2 dias de simulação com as novas espécies');

// Modo Tranquilo: sem fugas e sem mortes por falta de cuidados
const t = newGame(now, { tranquilo: true });
ok(t.settings.tranquilo && !t.settings.fugas && t.money === 120000, 'novo jogo no Modo Tranquilo (R$ 120 mil, sem fugas)');
const th = placeHabitat(t, 25, 26, 32, 32, 'savana', 'ferro').hab; for (let i = 0; i < 2; i++) buyAnimal(t, 'leao', 28, 29);
th.fenceHp = 0.05;
simulateAbstract(t, 6 * 1440, { now }); // sem tratador: fome e sede
ok(t.animals.length === 2 && t.animals.every(a => !a.escaped), `ninguém morreu nem fugiu em 6 dias sem cuidados (${t.animals.length} leões)`);
const n = newGame(now); const nh = placeHabitat(n, 25, 26, 32, 32, 'savana', 'ferro').hab; for (let i = 0; i < 2; i++) buyAnimal(n, 'leao', 28, 29);
simulateAbstract(n, 6 * 1440, { now });
ok(n.animals.filter(a => a.sp === 'leao').length < 2 || n.animals.some(a => a.escaped) || n.stats.mortes > 0, 'modo Normal: sem cuidados há consequências');

// configurações e migração 1.3 -> 1.4
ok(['autoQualidade', 'som', 'volume', 'tutorial'].every(k => k in DEFAULT_SETTINGS()), 'configurações novas com valores padrão');
const o = serialize(newGame(now)); o.schemaVersion = 4; o.settings = { quality: 'alto', fugas: false };
const m = deserialize(JSON.parse(JSON.stringify(o)));
ok(m.schemaVersion === 5 && m.settings.quality === 'alto' && m.settings.fugas === false && m.settings.som === true && m.settings.tutorial.feito, 'save da 1.3 migrado: mantém escolhas, liga som e pula o tutorial');
const fresh = newGame(now); ok(!fresh.settings.tutorial.feito && fresh.settings.tutorial.passo === 0, 'jogo novo começa com o tutorial');

console.log(fails ? `${fails} FALHA(S)` : 'TODOS OS TESTES DA 1.4 PASSARAM'); process.exit(fails ? 1 : 0);
