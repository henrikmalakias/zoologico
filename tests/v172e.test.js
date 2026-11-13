// Testes da versão 1.7.2e: o veículo (e quem anda) de captura não atravessa muros, habitats nem instalações.
import { newGame, step, hire, genCandidate } from '../src/sim/core.js';
import { placeHabitat, buyAnimal } from '../src/sim/build.js';
import { refreshAlerts, dispatch } from '../src/sim/staff.js';
import { worldToTile, idx, tileToWorld } from '../src/sim/grid.js';
import { CHANGELOG, APP_VERSION } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || Date.now();
const ctx = { abstract: false, realDt: 0.05, moveMul: 1 };

function cenario(sp, fix = true) {
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; s.clock.min = 9 * 60;
  placeHabitat(s, 26, 26, 33, 33, 'savana', 'muro'); placeHabitat(s, 35, 26, 42, 33, 'savana', 'muro');
  buyAnimal(s, sp, 29, 29);
  let c; do { c = genCandidate(s, now); } while (c.role !== 'tratador'); s.candidates.push(c); const tr = hire(s, c.id).person; tr.energy = 1;
  return { s, tr, a: s.animals[0] };
}
// solta o animal em (tx, ty), manda o tratador e confere cada passo: nunca dentro de habitat/instalação (o portão de entrada é permitido)
function persegue(s, tr, a, tx, ty, de, parado = true) {
  const p = tileToWorld(tx, ty);
  Object.assign(a, { escaped: true, escaping: null, x: p.x, z: p.z, tgt: null, sedated: false, carriedBy: 0 });
  Object.assign(tr, { task: null, veh: null, x: de.x, z: de.z, inHab: 0 }); refreshAlerts(s);
  const al = s.alerts.find(x => x.type === 'fuga' && !x.assigned); if (!al) return { sem: true };
  dispatch(s, al.id, tr.id, 'teste');
  const r = { dentro: 0, veiculo: 0, pulo: 0, feito: false, primeiro: null }; let px = tr.x, pz = tr.z;
  for (let i = 0; i < 24000; i++) {
    if (parado && a.escaped) a.tgt = null;
    step(s, 0.0125, ctx);
    if (!tr.task && !a.escaped) { r.feito = true; break; }
    if (tr.task?.type === 'recapture' && tr.task.phase === 'travel') {
      const t = worldToTile(tr.x, tr.z), k = idx(t.tx, t.ty);
      if (tr.veh) r.veiculo++;
      if (s._occ.hab[k] || s._occ.fac[k]) { r.dentro++; r.primeiro ||= [t.tx, t.ty]; }
      if (Math.hypot(tr.x - px, tr.z - pz) > 1) r.pulo++;
    }
    px = tr.x; pz = tr.z;
  }
  return r;
}

{ // caminhão (elefante): animal solto em volta e dentro dos habitats vizinhos
  const { s, tr, a } = cenario('elefante'); let ruins = 0, veic = 0, feitos = 0, total = 0, ex = null;
  for (const [tx, ty] of [[29, 29], [38, 29], [30, 36], [24, 30], [45, 40], [30, 20], [36, 24], [20, 20], [40, 36], [34, 30]]) {
    const r = persegue(s, tr, a, tx, ty, { x: 0, z: 30 }); if (r.sem) continue; total++; if (r.dentro || r.pulo) { ruins++; ex ||= [tx, ty, r.primeiro]; } veic += r.veiculo; if (r.feito) feitos++;
  }
  ok(total >= 8 && ruins === 0, `caminhão: nunca entra em habitat nem instalação nem salta de lugar (${total} posições do animal; ruins: ${ruins}${ex ? ' ' + JSON.stringify(ex) : ''})`);
  ok(feitos === total && veic > 500, `caminhão: todas as capturas terminam, com o veículo em movimento (${feitos}/${total})`);
}
{ // jipe (leão) saindo de perto, e a pé (a menos de 12 m não usa veículo)
  const { s, tr, a } = cenario('leao'); let ruins = 0, total = 0;
  for (const [tx, ty] of [[38, 29], [29, 29], [30, 36], [24, 30], [45, 40], [36, 36]]) { const r = persegue(s, tr, a, tx, ty, { x: tileToWorld(30, 36).x, z: tileToWorld(30, 36).z + 8 }); if (r.sem) continue; total++; if (r.dentro || r.pulo || !r.feito) ruins++; }
  ok(total >= 5 && ruins === 0, `jipe/a pé: sem atravessar muros e com captura concluída (${total} posições, ruins: ${ruins})`);
}
{ // animal que continua correndo: a rota é refeita sem entrar em habitat e sem saltos
  const { s, tr, a } = cenario('zebra'); let ruins = 0, total = 0;
  for (const [tx, ty] of [[38, 29], [24, 30], [45, 40], [30, 20]]) { const r = persegue(s, tr, a, tx, ty, { x: 0, z: 30 }, false); if (r.sem) continue; total++; if (r.dentro || r.pulo || !r.feito) ruins++; }
  ok(total >= 3 && ruins === 0, `perseguição de animal em movimento: rota refeita sem atravessar nada (${total} posições, ruins: ${ruins})`);
}
{ // tratamento de animal solto dentro de outro habitat: quem vai até ele para num bloco livre, fora do habitat
  const { s, tr, a } = cenario('zebra');
  const p = tileToWorld(38, 29); Object.assign(a, { escaped: true, x: p.x, z: p.z, tgt: null, hab: s.habitats[0].id, sick: true, health: 0.5 }); tr.x = 0; tr.z = 30; refreshAlerts(s);
  const al = s.alerts.find(x => x.type === 'doenca' || x.type === 'fuga'); dispatch(s, al.id, tr.id, 'teste');
  let dentro = 0; for (let i = 0; i < 8000; i++) { a.tgt = null; step(s, 0.0125, ctx); const t = worldToTile(tr.x, tr.z), k = idx(t.tx, t.ty); if (s._occ.hab[k] || s._occ.fac[k]) dentro++; if (!tr.task) break; }
  ok(dentro === 0, 'quem vai ao animal solto dentro de outro habitat fica do lado de fora');
}
ok(APP_VERSION === '1.7.2e' && CHANGELOG[0].versao === '1.7.2e' && CHANGELOG[0].itens.length >= 4, 'versão 1.7.2e com novidades no topo do CHANGELOG');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.7.2e PASSARAM (${n})`); process.exit(fails ? 1 : 0);
