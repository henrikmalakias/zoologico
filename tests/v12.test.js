import { newGame, step, hire, genCandidate, simulateAbstract } from '../src/sim/core.js';
import { placeHabitat, placePlant, buyAnimal, paintTerrain, sculpt, placeFacility } from '../src/sim/build.js';
import { dispatch, refreshAlerts, orderTransfer, taskName } from '../src/sim/staff.js';
import { suitability, hourlyAnimals } from '../src/sim/animals.js';
import { heightAt, waterDepth, walkY, tileToWorld } from '../src/sim/grid.js';
import { serialize, deserialize } from '../src/save/save.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now(), s = newGame(now); s.money = 1e6; s.areaLevel = 2;
// relevo
let r = sculpt(s, 22, 44, 'subir'); ok(r.ok && heightAt(s, tileToWorld(22, 44).x, tileToWorld(22, 44).z) > 0.2, 'subir terreno');
for (let i = 0; i < 6; i++) sculpt(s, 22, 44, 'subir');
r = placeFacility(s, 'banco', 22, 43); ok(!r.ok, 'instalação recusada em terreno inclinado: ' + r.msg);
for (let i = 0; i < 12; i++) sculpt(s, 36, 40, 'subir'); ok(true, 'pincel perto do caminho limitado');
const slope = (() => { let m = 0; for (let y = 36; y < 45; y++) for (let x = 33; x < 39; x++) if (s.terrain[y * 72 + x] === 'p') { const c = [s.height[y * 73 + x], s.height[y * 73 + x + 1], s.height[(y + 1) * 73 + x], s.height[(y + 1) * 73 + x + 1]]; m = Math.max(m, Math.max(...c) - Math.min(...c)); } return m; })();
ok(slope <= 0.9, 'caminho nunca fica íngreme (máx ' + slope.toFixed(2) + ' m)');
// ilha com elefantes
r = placeHabitat(s, 12, 24, 22, 34, 'savana', 'fosso'); ok(r.ok, 'ilha com fosso: ' + r.msg);
const ilha = r.hab; for (let i = 0; i < 4; i++) placePlant(s, ilha.x + 3 + i, ilha.y + 3, 'acacia');
for (let i = 0; i < 2; i++) buyAnimal(s, 'elefante', ilha.x + 4, ilha.y + 5);
ok(waterDepth(s, ilha.x, ilha.y + 5) > 1.0 && waterDepth(s, ilha.x + 1, ilha.y + 5) > 1.0, 'fosso é fundo: ' + waterDepth(s, ilha.x, ilha.y + 5).toFixed(2) + ' / ' + waterDepth(s, ilha.x + 1, ilha.y + 5).toFixed(2) + ' m');
const su = suitability(s, ilha, 'elefante'); console.log('  elefante na ilha:', su.total.toFixed(2), JSON.stringify(su.parts));
ok(s.animals.every(a => a.hab === ilha.id && Math.abs(a.x - ((ilha.x + 5.5) * 2 - 72)) < 12), 'elefantes ficam na ilha');
const g = tileToWorld(ilha.gateIn[0], ilha.gateIn[1]), bridgeT = tileToWorld((ilha.gateIn[0] + ilha.gateOut[0]) / 2, (ilha.gateIn[1] + ilha.gateOut[1]) / 2);
ok(walkY(s, bridgeT.x, bridgeT.z) > 0.2, 'ponte sobre o fosso');
// macacos: viveiro vs ferro
const viv = placeHabitat(s, 38, 26, 46, 34, 'floresta', 'tela').hab; for (let i = 0; i < 4; i++) buyAnimal(s, 'macaco', 40, 28);
ok(suitability(s, viv, 'macaco').parts.cerca === 1, 'viveiro com tela segura macacos');
// fuga animada: zebras em cerca de ferro gasta, leão pula
const fer = placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro').hab; for (let i = 0; i < 3; i++) buyAnimal(s, 'leao', 28, 29);
fer.fenceHp = 0.2; for (const a of s.animals) if (a.hab === fer.id) a.stress = 1;
const ctx = { abstract: false, realDt: 1 / 30, moveMul: 1, now }; s._ctx = ctx;
let tries = 0; while (!s.animals.some(a => a.escaping) && tries++ < 400) hourlyAnimals(s);
const esc = s.animals.find(a => a.escaping); ok(!!esc, 'fuga iniciada: modo ' + esc?.escaping.mode);
for (let i = 0; i < 30 * 30 && esc?.escaping; i++) step(s, ctx.realDt * 24 / 60, ctx);
ok(esc && !esc.escaping && esc.escaped, 'animação de fuga concluída, animal do lado de fora');
if (esc) console.log('  log:', s.log.slice(-3).map(l => l.msg).join(' | '));
// brecha: forçar derrubada
fer.breaches = [{ side: 'N', k: 3 }]; s.acc.q = 20; step(s, 1, ctx); ok(s.alerts.some(a => a.type === 'brecha'), 'alerta de cerca rompida');
const hireR = r => { let c; do { c = genCandidate(s, now); } while (c.role !== r); s.candidates.push(c); return hire(s, c.id).person; };
const seg = hireR('seguranca'), trat = hireR('tratador');
const al = s.alerts.find(a => a.type === 'brecha'); dispatch(s, al.id, seg.id);
for (let i = 0; i < 30 * 400 && fer.breaches.length; i++) step(s, ctx.realDt * 24 / 60, ctx);
ok(fer.breaches.length === 0, 'segurança consertou a brecha');
// transferência: zebra da ilha? -> usa um macaco do viveiro para a savana
const mac = s.animals.find(a => a.hab === viv.id && !a.escaped);
r = orderTransfer(s, mac.id, ilha.id, trat.id); ok(r.ok, 'ordem de transferência');
const fases = new Set(); for (let i = 0; i < 30 * 900 && mac.hab !== ilha.id; i++) { step(s, ctx.realDt * 24 / 60, ctx); if (trat.task?.type === 'transfer') fases.add(trat.task.phase); }
ok(mac.hab === ilha.id && !mac.sedated && !mac.carriedBy, 'macaco transferido mantendo nome ' + mac.name);
ok(['travel', 'sedate', 'load', 'return', 'release'].every(f => fases.has(f)), 'fases da transferência: ' + [...fases].join(' > '));
// abstrato 3 dias + save/migração
simulateAbstract(s, 3 * 1440, { now }); ok(true, '3 dias abstratos sem erro');
const o = serialize(s); const s2 = deserialize(JSON.parse(JSON.stringify(o))); ok(s2.height.length === 73 * 73, 'relevo salvo');
const old = JSON.parse(JSON.stringify(o)); old.schemaVersion = 2; delete old.height; for (const h of old.habitats) delete h.breaches;
const s3 = deserialize(old); ok(s3.schemaVersion >= 3 && s3.height && s3.habitats.every(h => Array.isArray(h.breaches)), 'save da 1.1 migrado para a 1.2');
console.log(fails ? fails + ' FALHA(S)' : 'TODOS OS TESTES DA 1.2 PASSARAM'); process.exit(fails ? 1 : 0);
