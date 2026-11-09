// 1.6.2: o subgerente só age com o jogo fechado (simulação abstrata) quando a opção está ligada.
import { newGame, step, simulateAbstract, hire, genCandidate, advanceTo } from '../src/sim/core.js';
import { placeHabitat, buyAnimal } from '../src/sim/build.js';
import { refreshAlerts } from '../src/sim/staff.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const mk = () => {
  const s = newGame(Date.now()); s.money = 9e6; s.settings.fugas = false; s.clock.min = 9 * 60;
  placeHabitat(s, 24, 26, 33, 34, 'savana', 'muro'); buyAnimal(s, 'zebra', 28, 30); buyAnimal(s, 'zebra', 29, 30);
  const now = Date.now(), want = r => { let c; do { c = genCandidate(s, now); } while (c.role !== r); s.candidates.push(c); return hire(s, c.id); };
  want('veterinario'); want('subgerente');
  s.managers[0].traits = ['agil']; s.managers[0].attrs.rapidez = 5;
  s.animals[0].sick = true; s.animals[0].health = 0.3;
  return s;
};
const live = { abstract: false, realDt: 0.05, moveMul: 1 };
const run = (s, n = 300) => { for (let k = 0; k < n; k++) step(s, 0.5, live); };
const handled = s => s.alerts.some(a => a.type === 'doenca' && a.assigned) || s.animals[0].sick === false;
{ const s = mk(); ok(s.settings.subSoFechado === true && s.settings.pausaAlerta === true, 'opções novas vêm ligadas');
  run(s); ok(s.alerts.some(a => a.type === 'doenca'), 'o alerta de doença existe');
  ok(!s.alerts.some(a => a.assigned && a.by) , 'com o jogo aberto o subgerente NÃO despacha o alerta'); }
{ const s = mk(); s.settings.subSoFechado = false; run(s);
  ok(s.alerts.some(a => a.assigned && a.by === s.managers[0].name) || s.animals[0].sick === false, 'com a opção desligada o subgerente despacha com o jogo aberto'); }
{ const s = mk(); run(s, 60); simulateAbstract(s, 300, {});
  ok(handled(s) || s.alerts.length === 0, 'com o app fechado o subgerente resolve o alerta'); }
{ const s = mk(); s.clock.min = 9 * 60; const r = advanceTo(s, 17);
  ok(r.parou, 'avançar o relógio para no primeiro alerta novo (' + r.parou + ')');
  ok(!s.alerts.some(a => a.assigned && a.by), 'avançar o relógio com o jogo aberto não deixa o subgerente agir'); }
{ const s = mk(); s.settings.subSoFechado = false; s.clock.min = 9 * 60; const r = advanceTo(s, 17);
  ok(s.alerts.some(a => a.assigned && a.by) || s.animals[0].sick === false || r.parou, 'com a opção desligada, avançar o relógio deixa o subgerente agir'); }
console.log(fails ? `${fails} falha(s)` : 'tudo certo'); process.exit(fails ? 1 : 0);
