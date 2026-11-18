// Testes da versão 1.8.3 (parte 1): construção rápida de recinto, caminho automático, lotação, +1, Ampliar e + outra espécie.
import { newGame, step, simulateAbstract } from '../src/sim/core.js';
import { placeHabitat, demolish } from '../src/sim/build.js';
import { planoRapido, construirRapido, lotacao, maisUm, ampliarRapido, planoAmpliar, blocosParaMais, especiesCompativeis, outraEspecie, planoOutraEspecie, cercaRapida, necessidade, anelDe, custoMaisUm } from '../src/sim/rapido.js';
import { suitability, habInfo } from '../src/sim/animals.js';
import { MAP, idx, inMap, isPath, isPathT, rebuildOcc, waterDepth } from '../src/sim/grid.js';
import { tocasDe } from '../src/sim/tocas.js';
import { DIRS } from '../src/sim/habshape.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || 1830;
const base = (area = 3) => { const s = newGame(now); s.money = 5e6; s.areaLevel = area; s.settings.fugas = false; s.settings.selvagem = false; return s; };
const C = content(base());
// caminho do recinto chega até a entrada?
const ligadoNaEntrada = (s, h) => {
  const ent = s.facilities.find(f => f.type === 'entrada'), seen = new Uint8Array(MAP * MAP), q = [];
  for (let x = ent.tx; x < ent.tx + 2; x++) if (isPath(s, x, ent.ty - 1)) { seen[idx(x, ent.ty - 1)] = 1; q.push([x, ent.ty - 1]); }
  for (let k = 0; k < q.length; k++) { const [x, y] = q[k]; for (const [dx, dy] of Object.values(DIRS)) { const a = x + dx, b = y + dy; if (inMap(a, b) && !seen[idx(a, b)] && isPath(s, a, b)) { seen[idx(a, b)] = 1; q.push([a, b]); } } }
  return seen[idx(h.gateOut[0], h.gateOut[1])] === 1;
};

// ---- cada espécie: recinto completo, nota cheia, cerca certa, custo igual ao da prévia ----
for (const sp of Object.keys(C.species)) {
  const s = base(), S = C.species[sp];
  const p = planoRapido(s, sp, 30, 14), m0 = s.money;
  const r = construirRapido(s, sp, 30, 14);
  if (!r.ok) { ok(false, `${S.nome}: construiu (${r.msg})`); continue; }
  const h = r.hab, su = suitability(s, h, sp), L = lotacao(s, h, sp), I = habInfo(s, h), N = necessidade(s, sp);
  ok(m0 - s.money <= p.total + 0.5 && p.total - (m0 - s.money) <= 250, `${S.nome}: cobra no máximo o que a prévia mostrou (${m0 - s.money} de ${p.total}; canteiro que não coube não é cobrado)`);
  ok(su.total >= 0.97, `${S.nome}: adequação ${Math.round(su.total * 100)}% logo de cara`);
  ok(L.n === S.social.min && L.cap >= Math.min(S.social.max, S.social.min + 3), `${S.nome}: chega o grupo mínimo (${L.n}) com folga para ${L.cap}`);
  const F = C.fences[h.fence];
  ok(F.altura >= S.barreira.altura && F.resistencia >= S.barreira.resistencia, `${S.nome}: cerca ${F.nome} segura a espécie`);
  if (S.tracos.perigoso) ok(h.fence === 'muro', `${S.nome}: perigoso ganha muro`);
  if (S.agua) ok(I.water >= S.agua && I.deep >= (S.aguaFunda || 0), `${S.nome}: lago com ${I.water} blocos (${I.deep} fundos)`);
  if (S.aguaMax < 0.65 && !S.tracos.nada && S.agua) ok(h.cells.filter(i => s.terrain[i] === 'w').every(i => waterDepth(s, i % MAP, (i / MAP) | 0) <= S.aguaMax + 0.01), `${S.nome}: lago raso (dá pé)`);
  ok(tocasDe(s, h.id).length === N.tocas, `${S.nome}: ${N.tocas} toca(s)`);
  ok(anelDe(h).every(([x, y]) => isPathT(s.terrain[idx(x, y)])) && ligadoNaEntrada(s, h), `${S.nome}: caminho em volta ligado à entrada`);
  ok(isPath(s, h.gateOut[0], h.gateOut[1]), `${S.nome}: portão abre para o caminho`);
  ok(s.furn.some(f => f.type === 'banco') && s.furn.some(f => f.type === 'poste'), `${S.nome}: bancos e postes na volta`);
  ok(h.name.startsWith('Recinto') && h.rapido?.sp === sp, `${S.nome}: nome "${h.name}"`);
}
ok(cercaRapida(base(), 'macaco') === 'tela', 'macaco (escala e pula dos galhos) ganha viveiro com tela');
ok(cercaRapida(base(), 'zebra') === 'ferro' && cercaRapida(base(), 'tartaruga') === 'ferro', 'zebra e tartaruga: cerca de ferro');

// ---- área inicial do parque: encaixa perto do toque, não invade caminho nem habitat ----
{
  const s = base(0); let feitos = 0;
  for (const [sp, x, y] of [['zebra', 30, 30], ['macaco', 40, 30], ['tartaruga', 28, 44], ['flamingo', 44, 44]]) {
    const r = construirRapido(s, sp, x, y); if (r.ok) feitos++;
  }
  ok(feitos >= 3, `área inicial: ${feitos} recintos rápidos lado a lado`);
  rebuildOcc(s);
  const ok1 = s.habitats.every(h => h.cells.every(i => !isPathT(s.terrain[i])));
  ok(ok1, 'nenhum recinto em cima de caminho');
  const viz = s.habitats.every(h => h.cells.every(i => { const x = i % MAP, y = (i / MAP) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = s._occ.hab[idx(x + dx, y + dy)]; if (o && o !== h.id) return false; } return true; }));
  ok(viz, 'recintos com 1 bloco de folga entre si');
  ok(s.habitats.every(h => ligadoNaEntrada(s, h)), 'todos ligados à entrada');
  const r = planoRapido(s, 'elefante', 30, 30);
  ok(!r.ok && /Não cabe/.test(r.msg), 'sem espaço: avisa que não cabe (e não constrói)');
}

// ---- dinheiro curto: oferece a versão só com o grupo mínimo ----
{
  const s = base(); const full = planoRapido(s, 'leao', 30, 14), menor = planoRapido(s, 'leao', 30, 14, { folga: false });
  s.money = Math.round((full.total + menor.total) / 2);
  const p = planoRapido(s, 'leao', 30, 14);
  ok(!p.ok && p.semDinheiro && p.menor?.ok && p.menor.total < full.total, 'falta dinheiro: oferece a versão menor');
  const r = construirRapido(s, 'leao', 30, 14, { folga: false });
  ok(r.ok && lotacao(s, r.hab, 'leao').n === 2, 'versão menor construída com o grupo mínimo');
}

// ---- prévia fixa no toque e Girar ----
{
  const s = base(), p = planoRapido(s, 'girafa', 30, 14), q = planoRapido(s, 'girafa', 30, 14, { dims: [p.rect.h, p.rect.w] });
  ok(p.ok && q.ok && q.rect.w === p.rect.h && q.rect.h === p.rect.w, 'Girar troca largura e altura');
  const a = planoRapido(s, 'girafa', 30, 14), b = planoRapido(s, 'girafa', 50, 14);
  ok(a.rect.x !== b.rect.x, 'tocar em outro lugar muda a prévia');
  ok(s.habitats.length === 0 && s.money === 5e6, 'a prévia não gasta nem constrói nada');
}

// ---- +1 até o máximo do grupo, com toca nova quando falta vaga ----
{
  const s = base(), h = construirRapido(s, 'leao', 30, 14).hab;
  let L = lotacao(s, h, 'leao'), voltas = 0;
  while (!L.cheio && voltas++ < 20) { const r = maisUm(s, h, 'leao'); if (!r.ok) break; L = lotacao(s, h, 'leao'); }
  ok(L.n === L.cap && L.n <= C.species.leao.social.max, `+1 até a lotação (${L.n} de ${L.cap})`);
  const r = maisUm(s, h, 'leao');
  ok(!r.ok && /Grupo completo|Ampliar/.test(r.msg), '+1 para quando lota: ' + r.msg);
  const machos = s.animals.filter(a => a.hab === h.id && a.sex === 'M').length;
  ok(Math.abs(machos * 2 - L.n) <= 1, 'sexos equilibrados para formar casais');
  ok(tocasDe(s, h.id).length * 2 >= L.n, 'tocas suficientes para todos (perigosos são recolhidos)');
  const z = construirRapido(s, 'zebra', 50, 14).hab; const c1 = custoMaisUm(s, z, 'zebra');
  ok(c1 >= C.species.zebra.custo, '+1 mostra o preço');
}

// ---- Ampliar: recinto rápido leva o caminho junto ----
{
  const s = base(), h = construirRapido(s, 'zebra', 30, 14, { folga: false }).hab;
  const L0 = lotacao(s, h, 'zebra'), b0 = h.cells.length, m0 = s.money;
  const pa = planoAmpliar(s, h, blocosParaMais(s, h, 'zebra', 3));
  const r = ampliarRapido(s, h, blocosParaMais(s, h, 'zebra', 3));
  ok(r.ok && h.cells.length > b0, `ampliou de ${b0} para ${h.cells.length} blocos`);
  ok(lotacao(s, h, 'zebra').cap > L0.cap, `lotação subiu (${L0.cap} → ${lotacao(s, h, 'zebra').cap})`);
  ok(Math.abs(m0 - s.money - pa.custo) <= C.furniture.banco.custo + C.furniture.poste.custo, 'cobra perto do que mostrou');
  ok(anelDe(h).every(([x, y]) => isPathT(s.terrain[idx(x, y)])) && ligadoNaEntrada(s, h), 'caminho em volta refeito e ligado');
  ok(h.cells.every(i => !isPathT(s.terrain[i])), 'nenhum caminho ficou dentro do recinto');
  ok(isPath(s, h.gateOut[0], h.gateOut[1]), 'portão continua abrindo para o caminho');
  // recinto desenhado à mão: amplia só em blocos livres, sem apagar caminho
  const s2 = base(); placeHabitat(s2, 26, 26, 33, 33, 'savana', 'ferro'); const h2 = s2.habitats[0], cam = s2.terrain.filter(isPathT).length;
  const r2 = ampliarRapido(s2, h2, 20);
  ok(r2.ok && s2.terrain.filter(isPathT).length === cam, 'desenho livre: amplia sem mexer nos caminhos');
}

// ---- + outra espécie: só as que combinam ----
{
  const s = base(), h = construirRapido(s, 'zebra', 30, 14).hab;
  const lista = especiesCompativeis(s, h), sps = lista.map(o => o.sp);
  ok(!sps.includes('leao'), 'leão não entra com zebras (predador)');
  ok(lista.filter(o => !o.motivo).every(o => C.species[o.sp].bioma === 'savana'), 'só espécies da savana');
  ok(lista.find(o => o.sp === 'elefante')?.motivo, 'elefante: cerca fraca demais (aparece com o motivo)');
  const g = lista.find(o => o.sp === 'girafa' && !o.motivo);
  ok(!!g, 'girafa combina');
  const pl = planoOutraEspecie(s, h, 'girafa'), m0 = s.money;
  const r = outraEspecie(s, h, 'girafa');
  ok(r.ok && lotacao(s, h, 'girafa').n === 2 && Math.abs(m0 - s.money - pl.custo) <= 400, 'girafas chegam (amplia se precisar)');
  ok(suitability(s, h, 'girafa').total > 0.9 && suitability(s, h, 'zebra').total > 0.9, 'as duas espécies bem no recinto');
  ok(tocasDe(s, h.id).length === Math.ceil(3 / 2) + 2, `tocas na medida: 2 para as 3 zebras e 2 para as girafas (${tocasDe(s, h.id).length})`);
  const z = construirRapido(s, 'leao', 50, 14).hab;
  ok(!especiesCompativeis(s, z).some(o => C.species[o.sp].dieta !== 'Carnívoro'), 'com leões, nenhuma presa aparece na lista');
}

// ---- simulação: animais vivem bem, visitantes chegam ao recinto, save ida e volta ----
{
  const s = base(); s.settings.fugas = true;
  const hs = ['leao', 'hipopotamo', 'macaco'].map((sp, k) => construirRapido(s, sp, [22, 44, 30][k], [14, 14, 34][k]).hab).filter(Boolean);
  ok(hs.length === 3, '3 recintos rápidos no mesmo zoo');
  let erro = null; try { for (let k = 0; k < 600; k++) step(s, 1, { abstract: false, realDt: 0.05, moveMul: 1 }); simulateAbstract(s, 24 * 60, { now }); } catch (e) { erro = e; }
  ok(!erro, 'um dia de jogo sem erro' + (erro ? ': ' + erro.message : ''));
  ok(s.animals.every(a => !a.escaped), 'ninguém fugiu das cercas escolhidas');
  ok(s.animals.filter(a => hs.some(h => h.id === a.hab)).every(a => a.welfare > 0.5), 'bem-estar bom nos recintos rápidos');
  const o = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  ok(o.habitats.every(h => s.habitats.find(x => x.id === h.id)?.rapido?.sp === h.rapido?.sp), 'save guarda o recinto rápido');
  ok(lotacao(o, o.habitats[0], hs[0].rapido.sp).n === lotacao(s, hs[0], hs[0].rapido.sp).n, 'lotação igual depois de carregar');
  const r = demolish(s, hs[2].gateIn[0], hs[2].gateIn[1]);
  ok(!r.ok, 'demolir com animais continua pedindo para tirar os animais antes');
}

console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.8.3 PASSARAM (${n})`);
if (fails) process.exit(1);
