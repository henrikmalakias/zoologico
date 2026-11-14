// Testes da versão 1.7.2f: funcionário ferido dentro do recinto depois de recarregar o jogo não fica preso
// repetindo "não encontrou caminho" (a rota era refeita a cada passo sem a marca de que ele estava lá dentro).
import { newGame, step, hire, genCandidate } from '../src/sim/core.js';
import { placeHabitat, buyAnimal } from '../src/sim/build.js';
import { atacarFuncionario, startTask } from '../src/sim/staff.js';
import { tileToWorld, worldToTile, idx } from '../src/sim/grid.js';
import { serialize, deserialize } from '../src/save/save.js';
import { APP_VERSION, CHANGELOG } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || 12345, live = () => ({ abstract: false, realDt: 0.05, moveMul: 1 });
const semCaminho = (s, L) => s.log.slice(L).filter(l => /não encontrou caminho/.test(l.msg)).length;
const montar = () => {
  const s = newGame(now); s.money = 9e6; s.settings.fugas = false; s.clock.min = 9 * 60;
  const h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro').hab; buyAnimal(s, 'leao', 30, 30);
  let c; do { c = genCandidate(s, now); } while (c.role !== 'tratador'); s.candidates.push(c); const st = hire(s, c.id).person;
  const p = tileToWorld(33, 31); st.x = p.x; st.z = p.z; st.inHab = h.id;
  return { s, h, st };
};
const dentro = (s, st) => { const T = worldToTile(st.x, st.z); return !!s._occ.hab[idx(T.tx, T.ty)]; };

{ // ferido no meio do recinto, jogo salvo e recarregado no caminho até o portão
  let { s, st } = montar();
  atacarFuncionario(s, st, s.animals[0], false);
  for (let i = 0; i < 3; i++) step(s, 0.0125, live());
  s = deserialize(JSON.parse(JSON.stringify(serialize(s)))); st = s.staff[0];
  ok(st.inHab === 0 && dentro(s, st), 'cenário do bug: ferido dentro do recinto sem a marca inHab depois de recarregar');
  const L = s.log.length;
  for (let i = 0; i < 200; i++) step(s, 0.0125, live());
  ok(semCaminho(s, L) === 0, 'nenhum aviso "não encontrou caminho" depois de recarregar');
  for (let i = 0; i < 6000; i++) step(s, 0.0125, live());
  ok(st.task?.type === 'ferido' && !dentro(s, st), 'o ferido sai pelo portão e descansa fora do recinto');
}
{ // qualquer tarefa refeita lá dentro sem a marca: sai pelo portão
  const { s, st } = montar(); st.inHab = 0;
  startTask(s, st, 'rest', 0); const L = s.log.length;
  for (let i = 0; i < 6000; i++) step(s, 0.0125, live());
  ok(semCaminho(s, L) === 0 && !dentro(s, st), 'descanso começado lá dentro sem a marca: sai pelo portão, sem aviso');
}
{ // destino realmente isolado: o aviso aparece no máximo 1 vez por hora de jogo
  const { s, st } = montar(); st.inHab = 0; st.x = tileToWorld(10, 10).x; st.z = tileToWorld(10, 10).z;
  for (const [x, y] of [[9, 10], [11, 10], [10, 9], [10, 11]]) s.terrain[idx(x, y)] = 'w';
  s.staff.forEach(o => { o.energy = 1; }); const L = s.log.length;
  for (let i = 0; i < 400; i++) { if (!st.task || st.task.type === 'idle') startTask(s, st, 'feed', s.habitats[0].id); step(s, 0.0125, live()); }
  ok(semCaminho(s, L) <= 1, `funcionário cercado: aviso não se repete a cada passo (${semCaminho(s, L)})`);
  st.task = null; st.energy = 0.1; startTask(s, st, 'rest', 0);
  for (let i = 0; i < 50; i++) step(s, 0.0125, live());
  ok(st.task?.type === 'rest' && st.task.phase === 'work', 'descanso sem rota: descansa onde está');
}
ok(APP_VERSION === '1.7.2f' && CHANGELOG[0].versao === '1.7.2f', 'versão 1.7.2f com novidades no topo do CHANGELOG');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.7.2f PASSARAM (${n})`); process.exit(fails ? 1 : 0);
