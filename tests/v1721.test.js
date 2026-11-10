// Correções da rodada de bugs (Deepseek, 09/11/2026) e preparação do núcleo para DLCs.
import { newGame, step } from '../src/sim/core.js';
import { placeHabitat, placeFacility, buyAnimal, placePlant, paintTerrain } from '../src/sim/build.js';
import { dispatch } from '../src/sim/staff.js';
import { speedOf, raioOf, caladoOf, climber } from '../src/sim/animals.js';
import { serialize, deserialize, contentHash } from '../src/save/save.js';
import { content, AVAILABLE_PACKS, papel } from '../src/content/registry.js';
import { rebuildOcc, isPathT } from '../src/sim/grid.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = Date.now(), live = { abstract: false, realDt: 0.05, moveMul: 1 };

// ---- B12: enviar para alerta sem destino não cancela o trabalho da pessoa ----
{ const s = newGame(now); s.money = 9e6;
  const st = { id: 999, name: 'Teste', role: 'tratador', x: 0, z: 0, task: { type: 'clean', target: 1 }, attrs: { rapidez: 5 } }; s.staff.push(st);
  s.alerts.push({ id: 77, type: 'fome', target: 12345, created: 0 });
  ok(dispatch(s, 77, 999) === false, 'dispatch sem destino devolve false');
  ok(st.task && st.task.type === 'clean', 'tarefa anterior continua (não foi cancelada)'); }

// ---- B19: pintar caminho atualiza só o necessário, igual ao recálculo completo ----
{ const s = newGame(now); s.money = 9e6; placePlant(s, 30, 30, 'acacia');
  for (let x = 20; x < 40; x++) paintTerrain(s, x, 30, 'c');
  const pn = s._pathN, obj = s._occ.obj.slice(); rebuildOcc(s);
  ok(pn === s._pathN, `contagem de caminho igual ao recálculo (${pn})`);
  ok(obj.every((v, i) => v === s._occ.obj[i]), 'planta removida do caminho some da ocupação');
  ok(!s.objects.some(o => o.tx === 30 && o.ty === 30), 'planta em cima do caminho foi removida'); }

// ---- B06/B05: impressão digital do save ignora só os carimbos de hora ----
{ const a = JSON.stringify({ n: 1, savedAt: 5, clock: { lastRealTs: 9 } }), b = JSON.stringify({ n: 1, savedAt: 7, clock: { lastRealTs: 11 } }), c = JSON.stringify({ n: 2, savedAt: 5, clock: { lastRealTs: 9 } });
  ok(contentHash(a) === contentHash(b) && contentHash(a) !== contentHash(c), 'hash ignora savedAt/lastRealTs e pega mudança de conteúdo'); }

// ---- DLC de teste (só dados), como o Gemini vai entregar ----
AVAILABLE_PACKS.teste = { id: 'teste', versao: '1.0.0', nome: 'Teste',
  biomes: { tundra_t: { nome: 'Tundra', terreno: { g: 0.5, r: 0.5 }, plantas: ['pinheiro_t'] } },
  plants: { pinheiro_t: { nome: 'Pinheiro', bioma: 'tundra_t', custo: 200, alta: true, tronco: 0.35, galho: 3, copa: 1.4, parecido: 'arvore_floresta', cor: '#2e5a3a' } },
  species: { urso_t: { nome: 'Urso-teste', custo: 9000, bioma: 'tundra_t', dieta: 'Carnívoro', espaco: 20, barreira: { altura: 3, resistencia: 7 },
    tracos: { pula: false, escala: false, forca: 8, perigoso: true, nada: true }, social: { min: 1, max: 4 }, plantas: 2, agua: 2, apelo: 9, aguaModo: 'vadeador', aguaMax: 1.0,
    vida: { adulto: 6, velhice: 100, max: 130 }, cor: '#f0eee8', velocidade: 1.25, raio: 1.0, calado: 1.1, fezes: 0.2,
    baixo: { len: 2, bh: 1, bw: 0.9, legH: 0.7, legR: 0.17, neck: [0.4, 0.6], head: 0.35, tail: 0.15, color: '#f0eee8' }, voz: { dur: 1.5, f0: 110, f1: 80, formantes: [[400, 6, 1]], peak: 0.2 } },
    leao: { nome: 'Leão falso' } }, // id repetido: precisa ser ignorado
  facilities: { quiosque_t: { nome: 'Quiosque', w: 2, h: 2, custo: 2500, venda: 12, custoVenda: 5, cor: '#3a8f6a', manut: 15, parecido: 'lanchonete', comportamento: 'comida' } },
};
{ const s = newGame(now); s.money = 9e6; s.settings.fugas = false; s.packs.teste = '1.0.0';
  const C = content(s);
  ok(!!C.species.urso_t && C.species.urso_t.pack === 'teste', 'espécie da DLC entra no conteúdo');
  ok(C.species.leao.nome === 'Leão' && C.species.leao.pack === 'base', 'DLC não sobrescreve id do jogo base');
  ok(speedOf(s, 'urso_t') === 1.25 && raioOf(s, 'urso_t') === 1.0 && caladoOf(s, 'urso_t') === 1.1, 'velocidade, raio e calado vêm do pacote');
  ok(speedOf(s, 'leao') === 1.6 && raioOf(s, 'leao') === 0.8, 'espécies do base continuam com os valores de antes');
  ok(!climber(C.species.urso_t, { sp: 'urso_t', age: 50 }), 'urso não sobe em árvore');
  ok(papel(C, 'quiosque_t') === 'lanchonete' && papel(C, 'lanchonete') === 'lanchonete' && papel(C, 'nada') === null, 'instalação da DLC faz papel de lanchonete');
  const h = placeHabitat(s, 25, 26, 34, 35, 'tundra_t', 'muro').hab; ok(!!h, 'habitat com bioma da DLC');
  for (let i = 0; i < 3; i++) placePlant(s, 26 + i, 27, 'pinheiro_t');
  ok(buyAnimal(s, 'urso_t', 27, 29).ok && buyAnimal(s, 'urso_t', 28, 29).ok, 'compra espécie da DLC');
  let q = null; for (let y = 10; y < 70 && !q?.ok; y++) for (let x = 5; x < 70 && !q?.ok; x++) q = placeFacility(s, 'quiosque_t', x, y);
  ok(q.ok, 'constrói instalação da DLC: ' + (q.msg || ''));
  let err = null; try { for (let k = 0; k < 3000; k++) step(s, 0.05, live); } catch (e) { err = e; }
  ok(!err, 'jogo roda com a DLC instalada' + (err ? ': ' + err.message : ''));
  ok(s.animals.filter(a => a.sp === 'urso_t').length === 2, 'ursos continuam no parque');
  // desinstalar: itens guardados e inativos, jogo não quebra
  delete s.packs.teste;
  ok(content(s).biomes.tundra_t?.inativo === true && !content(s).species.urso_t, 'desinstalada: bioma fica conhecido (inativo) e a espécie some do conteúdo');
  err = null; try { for (let k = 0; k < 3000; k++) step(s, 0.05, live); rebuildOcc(s); } catch (e) { err = e; }
  ok(!err, 'jogo roda com a DLC desinstalada' + (err ? ': ' + err.message : ''));
  const s2 = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  ok(s2.animals.filter(a => a.sp === 'urso_t').length === 2 && s2.facilities.some(f => f.type === 'quiosque_t'), 'save guarda os itens da DLC desinstalada');
  s2.packs.teste = '1.0.0'; err = null; try { for (let k = 0; k < 1000; k++) step(s2, 0.05, live); } catch (e) { err = e; }
  ok(!err && s2.animals.filter(a => a.sp === 'urso_t').length === 2, 'reinstalar traz os itens de volta'); }
delete AVAILABLE_PACKS.teste;

console.log(fails ? `${fails} FALHA(S)` : 'TODOS OS TESTES DA CORREÇÃO DE BUGS E DLC PASSARAM'); if (fails) process.exit(1);
