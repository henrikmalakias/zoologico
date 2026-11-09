// Ao reabrir o jogo no horário de visitação, o parque começa com visitantes (e fantasmas), não zerado.
import { newGame, step, catchUp } from '../src/sim/core.js';
import { placeHabitat, buyAnimal } from '../src/sim/build.js';
import { serialize, deserialize } from '../src/save/save.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now();
const s0 = newGame(now); s0.money = 9e6; s0.settings.quality = 'alto'; s0.clock.min = 8 * 60;
placeHabitat(s0, 24, 26, 33, 34, 'savana', 'muro'); for (const sp of ['leao', 'zebra', 'zebra', 'girafa']) buyAnimal(s0, sp, 28, 30);
const ctx = { abstract: false, realDt: 0.05, moveMul: 1 };
for (let k = 0; k < 20000 && s0.clock.min < 14 * 60; k++) step(s0, 0.05, ctx); // até ~14h
const antes = s0.stats.visitorsIn;
ok(antes > 5, `jogando normalmente há gente no parque (${antes})`);
const copy = () => { const s = deserialize(JSON.stringify(serialize(s0))); s.clock.lastRealTs = Date.now() - 3000; return s; };
{ const s = copy(); ok(s.visitors.length === 0 && s.vstock.length === 0, 'sem a correção, o save carregado começa zerado (base do teste)');
  catchUp(s, Date.now()); ok(s.visitors.length + s.vstock.length > 5, `reabrir logo depois: ${s.visitors.length} desenhados + ${s.vstock.length} fantasmas`);
  ok(s.stats.visitorsIn === s.visitors.length + s.vstock.length, 'contador bate com desenhados + fantasmas');
  const v0 = s.stats.visitantesHoje, m0 = s.money; catchUp(s, Date.now()); ok(s.stats.visitantesHoje === v0 && s.money === m0, 'visitantes iniciais não geram ingresso duplicado'); }
{ const s = copy(); s.clock.lastRealTs = Date.now() - 20 * 60e3; catchUp(s, Date.now()); ok(s.visitors.length + s.vstock.length > 3 || s.stats.visitorsIn > 3, `fora 20 min: ${s.stats.visitorsIn} visitantes`);
  for (let k = 0; k < 400; k++) step(s, 0.05, ctx); ok(s.visitors.length > 0, 'visitantes iniciais andam normalmente'); }
{ const s = copy(); s.clock.min = 19 * 60; catchUp(s, Date.now()); ok(s.visitors.length + s.vstock.length === 0, 'fora do horário de visitação não aparece ninguém'); }
{ const s = copy(); s.clock.min = 8 * 60 + 2; s.clock.lastRealTs = Date.now(); catchUp(s, Date.now()); ok(s.visitors.length + s.vstock.length <= 3, 'logo ao abrir o parque (8h) quase não há ninguém'); }
console.log(fails ? `${fails} falha(s)` : 'tudo certo'); process.exit(fails ? 1 : 0);
