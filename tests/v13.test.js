import { newGame, step, hire, genCandidate, simulateAbstract, timeFactor, fixedDaily, MES } from '../src/sim/core.js';
import { placeHabitat, buyAnimal, placeFacility } from '../src/sim/build.js';
import { orderTask } from '../src/sim/staff.js';
import { serialize, deserialize } from '../src/save/save.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now(), s = newGame(now);
// tempo: dia devagar, noite rápida, total 1 hora real
s.clock.min = 12 * 60; const fd = timeFactor(s); s.clock.min = 23 * 60; const fn = timeFactor(s);
ok(fd === 16 && fn === 80, `fator dia ${fd}, noite ${fn}`);
let real = 0; s.clock.min = 0; for (let h = 0; h < 24; h++) { s.clock.min = h * 60 + 1; real += 3600 / timeFactor(s); } ok(Math.abs(real - 3600) < 1, '1 dia de jogo = ' + (real / 60).toFixed(1) + ' min reais');
s.clock.min = 7 * 60;
// mensal
const h = placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro').hab; for (let i = 0; i < 3; i++) buyAnimal(s, 'zebra', 28, 29);
placeFacility(s, 'lanchonete', 30, 38);
const hr = r => { let c; do { c = genCandidate(s, now); } while (c.role !== r); s.candidates.push(c); return hire(s, c.id).person; };
const t = hr('tratador'), sg = hr('seguranca');
const m0 = s.money; simulateAbstract(s, 5 * 1440, { now });
ok(s.fin.pendente.salarios === (t.salary + sg.salary) * 5 && s.stats.history.every(d => !d.det.exp.salarios), 'salários acumulam sem descontar: ' + s.fin.pendente.salarios);
simulateAbstract(s, 26 * 1440, { now });
const M = s.fin.meses[0]; ok(!!M && M.mes === 1 && M.salarios === (t.salary + sg.salary) * 30, 'fechamento do mês 1 pagou 30 dias de salário: ' + M?.salarios);
ok(s.fin.pendente.salarios < (t.salary + sg.salary) * 2, 'pendente zerado após o fechamento');
console.log('  mês 1:', JSON.stringify({ receitas: Math.round(M.receitas), consumo: Math.round(M.consumo), fixos: M.fixos, saldo: Math.round(M.saldo), previsao: Object.fromEntries(Object.entries(M.previsao).map(([k, v]) => [k, Math.round(v)])) }));
// ordem manual
h.food = 0.3; const r = orderTask(s, t.id, 'feed', h.id); ok(r.ok && t.task.type === 'feed', 'ordem manual de alimentar');
ok(!orderTask(s, sg.id, 'feed', h.id).ok, 'segurança não pode alimentar');
// migração 1.2 -> 1.3
const o = serialize(s); o.schemaVersion = 3; delete o.fin; const s2 = deserialize(JSON.parse(JSON.stringify(o)));
ok(s2.schemaVersion >= 4 && s2.fin && s2.fin.pendente.salarios === 0, 'save da 1.2 migrado para a 1.3');
console.log(fails ? fails + ' FALHA(S)' : 'TODOS OS TESTES DA 1.3 PASSARAM'); process.exit(fails ? 1 : 0);
