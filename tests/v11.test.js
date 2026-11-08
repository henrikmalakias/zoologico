import { newGame, step, hire, genCandidate, simulateAbstract } from '../src/sim/core.js';
import { placeHabitat, placePlant, buyAnimal } from '../src/sim/build.js';
import { dispatch, refreshAlerts, taskName } from '../src/sim/staff.js';
import { deserialize, serialize, MIGRATIONS } from '../src/save/save.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now(), s = newGame(now);
const h = placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro').hab;
for (let i = 0; i < 3; i++) buyAnimal(s, 'zebra', 28, 29);
const want = r => { let c; do { c = genCandidate(s, now); } while (c.role !== r); s.candidates.push(c); return hire(s, c.id).person; };
const seg = want('seguranca'), trat = want('tratador');
// fuga e captura
const a = s.animals[0]; a.escaped = true; a.x = 30; a.z = 20; refreshAlerts(s);
const al = s.alerts.find(x => x.type === 'fuga'); ok(!!al, 'alerta de fuga');
dispatch(s, al.id, seg.id);
ok(seg.veh === 'jipe', 'segurança sai de jipe (longe)');
const ctx = { abstract: false, realDt: 1 / 30, moveMul: 1, now }; const fases = new Set();
for (let i = 0; i < 30 * 600 && a.escaped; i++) { step(s, ctx.realDt * 24 / 60, ctx); if (seg.task?.type === 'recapture') fases.add(seg.task.phase); }
ok(!a.escaped && !a.sedated && a.hab === h.id, 'animal recapturado e devolvido');
ok(['travel', 'sedate', 'load', 'return', 'release'].every(f => fases.has(f)), 'fases: ' + [...fases].join(' > '));
ok(!seg.veh, 'veículo guardado no fim');
// sujeira e limpeza
h.dirt = []; for (let i = 0; i < 12; i++) h.dirt.push([h.x * 2 - 72 + 3 + i * 0.8, h.y * 2 - 72 + 5, i % 2]);
s.acc.hour = 59.9; step(s, 0.2, ctx); ok(h.clean < 0.6, 'sujeira reduz a limpeza: ' + h.clean.toFixed(2));
let t0 = 0; for (let i = 0; i < 30 * 900 && h.dirt.length; i++) { step(s, ctx.realDt * 24 / 60, ctx); if (trat.task?.type === 'clean' && !t0) t0 = i; }
ok(h.dirt.length === 0 && h.clean > 0.95, 'tratador limpou tudo (' + taskName(trat.task) + ')');
// fezes aparecem com o tempo
s.staff = s.staff.filter(x => x.role !== 'tratador'); simulateAbstract(s, 24 * 60, { now }); ok(h.dirt.length > 0, 'animais sujam o habitat em 1 dia: ' + h.dirt.length + ' itens');
// migração de save v1 -> v2
const o = serialize(s); o.schemaVersion = 1; for (const hh of o.habitats) delete hh.dirt;
const s2 = deserialize(JSON.parse(JSON.stringify(o))); ok(s2.schemaVersion >= 2 && Array.isArray(s2.habitats[0].dirt), 'save antigo (v1) migrado para v2');
for (let i = 0; i < 50; i++) step(s2, 10, { abstract: true, realDt: 0, moveMul: 0, now }); ok(true, 'save migrado roda normalmente');
console.log(fails ? fails + ' FALHA(S)' : 'TODOS OS TESTES DA 1.1 PASSARAM'); process.exit(fails ? 1 : 0);
