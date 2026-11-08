import { newGame, step, simulateAbstract, catchUp, advanceTo, hire, hiringTick, expandArea, stars } from '../src/sim/core.js';
import { placeHabitat, placeFacility, placePlant, buyAnimal, paintTerrain, demolish } from '../src/sim/build.js';
import { serialize, deserialize } from '../src/save/save.js';
import { dispatch, eligibleStaff } from '../src/sim/staff.js';
import { suitability } from '../src/sim/animals.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok -', m); };
const now = Date.now();
const s = newGame(now);
ok(s.candidates.length === 10, '10 currículos no início');
// habitat de savana ao norte do caminho horizontal (y 36-37)
let r = placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro'); ok(r.ok, 'habitat savana: ' + r.msg);
const h = r.hab; ok(h.side === 'S', 'portão voltado para o caminho (lado ' + h.side + ')');
for (let i = 0; i < 4; i++) placePlant(s, h.x + 1 + i * 2, h.y + 2, 'acacia');
r = placeHabitat(s, 38, 26, 46, 34, 'floresta', 'muro'); ok(r.ok, 'habitat floresta com muro: ' + r.msg);
for (let i = 0; i < 4; i++) ok(buyAnimal(s, 'zebra', h.x + 2, h.y + 2).ok, 'comprar zebra ' + i);
for (let i = 0; i < 5; i++) buyAnimal(s, 'macaco', 40, 28);
ok(s.animals.length === 9, '9 animais');
console.log('  adequação zebra:', suitability(s, h, 'zebra').total.toFixed(2), JSON.stringify(suitability(s, h, 'zebra').parts));
ok(placeFacility(s, 'lanchonete', 30, 38).ok, 'lanchonete ao lado do caminho');
ok(placeFacility(s, 'banheiro', 38, 38).ok, 'banheiro');
ok(!placeFacility(s, 'loja', 30, 44).ok, 'loja longe do caminho é recusada');
ok(placeFacility(s, 'centro', 26, 40).ok || placeFacility(s, 'centro', 24, 41).ok, 'centro de cuidados');
// contratar 1 de cada função disponível
const roles = new Set();
for (const c of [...s.candidates]) if (c.role !== 'subgerente' && !roles.has(c.role)) { roles.add(c.role); hire(s, c.id); }
ok(s.staff.length >= 2, 'equipe contratada: ' + s.staff.map(x => x.role).join(','));
// simulação visual 3 minutos reais em velocidade normal
const ctx = { abstract: false, realDt: 1 / 30, moveMul: 1, now };
for (let i = 0; i < 30 * 180; i++) step(s, (ctx.realDt * 24) / 60, ctx);
ok(s.stats.visitantesHoje > 0, 'visitantes chegaram: ' + s.stats.visitantesHoje + ' (no parque ' + s.visitors.length + ')');
console.log('  dinheiro', Math.round(s.money), 'hora', (s.clock.min / 60).toFixed(1), 'estrelas', stars(s));
// app fechado por 10 horas
s.clock.lastRealTs = now - 10 * 3600e3;
const rep = catchUp(s, now);
ok(rep && Math.abs(rep.minutos - 600) < 1, 'catch-up 10 h = 600 min de jogo (' + rep?.minutos.toFixed(0) + ')');
console.log('  relatório: dinheiro', Math.round(rep.dinheiro), 'eventos', rep.eventos.length, 'alertas', rep.alertas);
// limite de 72 h
s.clock.lastRealTs = now - 200 * 3600e3;
const rep2 = catchUp(s, now); ok(rep2.minutos <= 72 * 60 + 1 && rep2.limitado, 'limite de 72 h respeitado');
// currículos a cada 2 h reais, máx 10, expiram em 72 h
s.candidates = []; s.hiring.nextAt = now; hiringTick(s, now + 5 * 3600e3);
ok(s.candidates.length === 3, '3 currículos em 5 h reais (' + s.candidates.length + ')');
// alerta e despacho
s.habitats[0].gateOpen = true; s.acc.q = 20; step(s, 1, ctx);
const al = s.alerts.find(a => a.type === 'portao'); ok(!!al, 'alerta de portão aberto criado');
const el = al && eligibleStaff(s, al);
if (al && el.length) { ok(dispatch(s, al.id, el[0].st.id), 'despacho manual'); }
// avançar relógio para durante emergência
s.habitats[0].fenceHp = 0.36; const adv = advanceTo(s, 7, now);
console.log('  avanço: minutos', adv.minutos.toFixed(0), 'parou por:', adv.parou);
// save/load
const o = serialize(s); const s2 = deserialize(JSON.parse(JSON.stringify(o)));
ok(s2.animals.length === s.animals.length && s2.terrain.length === 72 * 72, 'save e load preservam o estado');
ok(JSON.stringify(o).length < 400000, 'tamanho do save: ' + JSON.stringify(o).length + ' bytes');
// pacote ausente: animal de DLC fica guardado, sem quebrar
s2.animals.push({ ...s2.animals[0], id: 99999, sp: 'tubarao', pack: 'aquario' });
for (let i = 0; i < 200; i++) step(s2, 5, { abstract: true, realDt: 0, moveMul: 0, now });
ok(s2.animals.some(a => a.sp === 'tubarao'), 'item de DLC ausente fica guardado');
ok(!expandArea(s2).ok || s2.areaLevel === 1, 'expandir área');
ok(demolish(s2, 30, 38).ok, 'demolir lanchonete');
// estresse: 3 dias abstratos
const t0 = Date.now(); simulateAbstract(s2, 3 * 1440, { now }); console.log('  3 dias abstratos em', Date.now() - t0, 'ms; animais', s2.animals.length, 'dinheiro', Math.round(s2.money));
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exit(fails ? 1 : 0);
