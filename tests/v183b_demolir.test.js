// Testes da versão 1.8.3b: Demolir com 4 modos (Bloco, Recinto, Prédio, Área), mudança/venda dos animais,
// lago na demolição (manter ou aterrar e nivelar) e lago de enfeite (Com lago na construção rápida e + Lago na ficha).
import { newGame, step, catchUp, SCHEMA } from '../src/sim/core.js';
import { placeHabitat, placeFacility, placePlant, paintTerrain, demolish, buyAnimal } from '../src/sim/build.js';
import { construirRapido, planoRapido, lotacao, planoLago, lagoNoRecinto, podeTerLago, necessidade } from '../src/sim/rapido.js';
import { planoDemolir, executarDemolir, resumoPlano, vagasPara, DEVOLVE } from '../src/sim/demolir.js';
import * as OB from '../src/sim/obras.js';
import { habInfo, habById, habObstacles } from '../src/sim/animals.js';
import { idx, rebuildOcc, ci, waterDepth, WATER_Y, MAP } from '../src/sim/grid.js';
import { tocasDe } from '../src/sim/tocas.js';
import { lagoLivre } from '../src/sim/lagos.js';
import { serialize, deserialize } from '../src/save/save.js';
import { content, APP_VERSION, CHANGELOG } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const T0 = (+process.env.SEED || 1839) * 1000 + 1.7e12, MIN = 60e3;
const base = (area = 3) => { const s = newGame(T0); s.money = 5e6; s.areaLevel = area; s.settings.fugas = false; s.settings.selvagem = false; s.obraGratis = false; return s; };
const C = content(base());
const viva = (s, mins) => { for (let k = 0; k < mins; k++) step(s, 1, { abstract: false, realDt: 1, moveMul: 1, now: T0 }); };
const meio = h => ({ tx: h.x + (h.w >> 1), ty: h.y + (h.h >> 1) });
const agua = (s, h) => h.cells.filter(i => s.terrain[i] === 'w');
const semAgua = ['leao', 'zebra', 'girafa', 'macaco', 'gorila', 'tartaruga'];

// ---- Recinto: animais mudam para outro recinto compatível ----
{
  const s = base(), a = construirRapido(s, 'zebra', 22, 14), b = construirRapido(s, 'zebra', 46, 14);
  ok(a.ok && b.ok, 'dois recintos de zebras');
  const ha = a.hab, hb = b.hab, plantas = s.objects.filter(o => ha.cells.includes(idx(o.tx, o.ty))).length, nT = tocasDe(s, ha.id).length;
  const anel = ha.cells.length ? [ha.x - 1, ha.y - 1] : null;
  const P = planoDemolir(s, { modo: 'recinto', ...meio(ha) }), R = resumoPlano(s, P);
  ok(P.ok && P.recintos.length === 1 && P.mudar.length === 3 && !P.vender.length && P.mudar.every(m => m.para === hb.id), 'prévia: as 3 zebras vão para o outro recinto de zebras');
  ok(R.mudar[0]?.includes('3 zebras') && R.mudar[0].includes(hb.name), 'texto da prévia: "3 zebras → ' + hb.name + '"');
  ok(!P.agua.length, 'recinto de zebra sem lago: nada a perguntar');
  const m0 = s.money, r = executarDemolir(s, { modo: 'recinto', ...meio(ha) }, { now: T0 });
  ok(r.ok && !habById(s, ha.id), 'recinto removido com 1 toque');
  ok(s.animals.filter(x => x.hab === hb.id).length === 6, 'as zebras estão no outro recinto (3 + 3)');
  const g = hb.gateIn, moved = s.animals.filter(x => x.chegou === T0);
  ok(moved.length === 3 && moved.every(x => x.st === 'idle' && x.stress > 0.3), 'chegaram agora, paradas no portão e um pouco estressadas');
  ok(s._entregas?.some(e => e.hab === hb.id), 'caminhão estaciona no portão do destino');
  ok(Math.abs((s.money - m0) - P.volta) < 1 && P.volta > 0, `caixa recebeu o que a prévia mostrou (${Math.round(P.volta)})`);
  ok(!tocasDe(s, ha.id).length && nT > 0, 'tocas do recinto removidas');
  ok(!s.objects.some(o => ha.cells.includes(idx(o.tx, o.ty))) && plantas > 0, 'plantas de dentro saíram junto');
  ok(s.terrain[idx(anel[0], anel[1])] === 'p', 'o caminho de pedra em volta ficou');
  viva(s, 120);
  ok(s.animals.filter(x => x.hab === hb.id && !x.escaped).length === 6, '2 h de jogo depois: todas no recinto novo, nenhuma fuga');
}
// ---- sem vaga: vendidos; vaga só para alguns: parte muda, parte vendida ----
{
  const s = base(), a = construirRapido(s, 'leao', 22, 14), z = construirRapido(s, 'zebra', 46, 14);
  const P = planoDemolir(s, { modo: 'recinto', ...meio(a.hab) });
  ok(P.ok && !P.mudar.length && P.vender.length === 2, 'leões sem outro recinto de leões: vendidos (nunca vão para as zebras)');
  ok(P.vender.every(v => v.valor === Math.round(C.species.leao.custo * DEVOLVE.venda)), 'venda por 40% do valor');
  const n0 = s.animals.length, r = executarDemolir(s, { modo: 'recinto', ...meio(a.hab) }, { now: T0 });
  ok(r.ok && s.animals.length === n0 - 2 && r.vendidos === 2, 'leões vendidos e recinto removido');

  const s2 = base(), a2 = construirRapido(s2, 'zebra', 22, 14), b2 = construirRapido(s2, 'zebra', 46, 14);
  for (let k = 0; k < 6; k++) { const L = lotacao(s2, a2.hab, 'zebra'); if (L.cheio) break; buyAnimal(s2, 'zebra', a2.hab.gateIn[0], a2.hab.gateIn[1]); }
  const livres = vagasPara(s2, b2.hab, 'zebra'), nA = s2.animals.filter(x => x.hab === a2.hab.id).length;
  const P2 = planoDemolir(s2, { modo: 'recinto', ...meio(a2.hab) });
  ok(P2.mudar.length === livres && P2.vender.length === nA - livres && livres > 0 && P2.vender.length > 0, `vaga só para ${livres}: ${livres} mudam e ${nA - livres} são vendidas`);
  executarDemolir(s2, { modo: 'recinto', ...meio(a2.hab) }, { now: T0 });
  ok(lotacao(s2, b2.hab, 'zebra').n <= C.species.zebra.social.max && vagasPara(s2, b2.hab, 'zebra') === 0, 'destino cheio, sem passar do grupo nem do espaço');
}
// ---- outra espécie compatível com vaga; recinto em obra; fugido; internado ----
{
  const s = base(), z = construirRapido(s, 'zebra', 22, 14), g = construirRapido(s, 'girafa', 46, 14);
  const P = planoDemolir(s, { modo: 'recinto', ...meio(z.hab) });
  ok(P.mudar.length === 3 && P.mudar.every(m => m.para === g.hab.id), 'zebras podem ir para o recinto das girafas (mesmo bioma, cerca segura, sem predador)');
  const s2 = base(), o = construirRapido(s2, 'elefante', 22, 14, { obra: true, now: T0 }), m0 = s2.money;
  const P2 = planoDemolir(s2, { modo: 'recinto', ...meio(o.hab) });
  ok(P2.ok && P2.recintos[0].obra && P2.recintos[0].aCaminho === 2 && !P2.mudar.length, 'recinto em obra: sem animais no mapa, 2 a caminho');
  executarDemolir(s2, { modo: 'recinto', ...meio(o.hab) }, { now: T0 + MIN, aterrar: false });
  ok(Math.abs(s2.money - m0 - P2.volta) < 1 && Math.abs(P2.volta - (o.obra.custo + 2 * C.species.elefante.custo)) < 1, 'obra cancelada devolve 100% (recinto + animais a caminho)');
  ok(!OB.aCaminho(s2).length && !s2.obras.length, 'nada fica a caminho nem em obra');
  const s3 = base(), a3 = construirRapido(s3, 'zebra', 22, 14); construirRapido(s3, 'zebra', 46, 14);
  s3.animals.find(x => x.hab === a3.hab.id).escaped = true;
  const P3 = planoDemolir(s3, { modo: 'recinto', ...meio(a3.hab) });
  ok(!P3.ok && /fugido/.test(P3.msg), 'animal fugido: pede para recapturar antes');
  const s4 = base(), a4 = construirRapido(s4, 'zebra', 22, 14), b4 = construirRapido(s4, 'zebra', 46, 14), z4 = s4.animals.find(x => x.hab === a4.hab.id);
  Object.assign(z4, { habOrig: a4.hab.id, hab: 0, internado: 999, intAte: s4.clock.min + 1440 });
  const P4 = planoDemolir(s4, { modo: 'recinto', ...meio(a4.hab) });
  ok(P4.mudar.some(m => m.id === z4.id && m.internado), 'internado também ganha destino');
  executarDemolir(s4, { modo: 'recinto', ...meio(a4.hab) }, { now: T0 });
  ok(z4.habOrig === b4.hab.id && z4.internado === 999 && z4.hab === 0, 'internado continua na clínica e volta para o recinto novo na alta');
}
// ---- lago na demolição: manter ou aterrar ----
{
  const s = base(), hp = construirRapido(s, 'hipopotamo', 22, 14); construirRapido(s, 'hipopotamo', 46, 14);
  const W = agua(s, hp.hab), P = planoDemolir(s, { modo: 'recinto', ...meio(hp.hab) });
  ok(P.agua.length === W.length && W.length >= 10, `recinto com lago: pergunta sobre ${W.length} blocos de água`);
  ok(P.custoAterro === W.length * 60 && P.durAterro >= 3 * MIN && P.durAterro <= 6 * MIN, `aterrar: R$ 60/bloco (${P.custoAterro}) e ${Math.round(P.durAterro / MIN * 10) / 10} min`);
  ok(OB.duracaoAterro(13) === 3 * MIN && Math.abs(OB.duracaoAterro(30) - 4.53 * MIN) < 0.01 * MIN && OB.duracaoAterro(500) === 6 * MIN, 'duração: 3 min até 13 blocos, 4,5 com 30, no máximo 6');
  const sK = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  // manter
  const hK = sK.habitats.find(h => h.name === hp.hab.name);
  executarDemolir(sK, { modo: 'recinto', ...meio(hK) }, { aterrar: false, now: T0 });
  ok(W.every(i => sK.terrain[i] === 'w') && !sK.obras.length, 'manter o lago: a água fica, sem custo');
  // aterrar
  const m0 = s.money, r = executarDemolir(s, { modo: 'recinto', ...meio(hp.hab) }, { aterrar: true, now: T0 });
  const ob = r.obra;
  ok(r.ok && ob?.tipo === 'aterro' && ob.cells.length === W.length && Math.abs(s.money - m0 - (P.volta - P.custoAterro)) < 1, 'aterrar: obra de terraplanagem paga (volta − aterro)');
  rebuildOcc(s);
  ok(W.every(i => s._occ.obra[i] === ob.id), 'blocos reservados durante a obra (tapume)');
  ok(!placeFacility(s, 'banheiro', W[0] % MAP, (W[0] / MAP) | 0).ok, 'nada se constrói em cima da terraplanagem');
  OB.obraTick(s, T0 + ob.dur - 1000); ok(s.obras.length === 1, 'ainda não terminou 1 s antes');
  OB.obraTick(s, T0 + ob.dur + 10);
  ok(!s.obras.length && W.every(i => s.terrain[i] !== 'w'), 'terminou: chão seco');
  const hs = new Set(); for (const i of W) { const x = i % MAP, y = (i / MAP) | 0; for (const k of [ci(x, y), ci(x + 1, y), ci(x, y + 1), ci(x + 1, y + 1)]) hs.add(s.height[k]); }
  ok(Math.max(...hs) - Math.min(...hs) < 0.35 && Math.min(...hs) > WATER_Y, `nivelado: diferença ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m, acima da água`);
  ok(paintTerrain(s, W[0] % MAP, (W[0] / MAP) | 0, 'p').ok, 'dá para usar o espaço de novo (caminho em cima)');
  const sP = base(), hq = construirRapido(sP, 'hipopotamo', 22, 14); sP.money = -1e6;
  const rP = executarDemolir(sP, { modo: 'recinto', ...meio(hq.hab) }, { aterrar: true, now: T0 });
  ok(!rP.ok && /insuficiente/.test(rP.msg) && habById(sP, hq.hab.id) && sP.money === -1e6, 'sem dinheiro para aterrar: avisa e não demole pela metade');
}
// ---- Bloco: água solta, prédio, enfeite, planta, caminho (como antes) ----
{
  const s = base(), hp = construirRapido(s, 'hipopotamo', 22, 14), W = agua(s, hp.hab);
  executarDemolir(s, { modo: 'recinto', ...meio(hp.hab) }, { aterrar: false, now: T0 });
  const [x, y] = [W[0] % MAP, (W[0] / MAP) | 0], L = lagoLivre(s, x, y);
  ok(L.length === W.length, `água solta: o lago inteiro tem ${L.length} blocos`);
  const P = planoDemolir(s, { modo: 'bloco', tx: x, ty: y });
  ok(P.ok && P.soAgua && P.agua.length === W.length && P.aguaBloco.length === 1, 'Bloco em água solta: pergunta (este bloco ou o lago todo)');
  ok(executarDemolir(s, { modo: 'bloco', tx: x, ty: y }, { aterrar: false }).ok && s.terrain[W[0]] === 'w', 'manter: nada muda');
  const m0 = s.money, r1 = executarDemolir(s, { modo: 'bloco', tx: x, ty: y }, { aterrar: true, now: T0 });
  ok(r1.ok && r1.obra.cells.length === 1 && m0 - s.money === 60, 'aterrar este bloco: R$ 60');
  const [x2, y2] = [W[W.length - 1] % MAP, (W[W.length - 1] / MAP) | 0], r2 = executarDemolir(s, { modo: 'bloco', tx: x2, ty: y2 }, { aterrar: true, lagoTodo: true, now: T0 });
  ok(r2.ok && r2.obra.cells.length === W.length - 1, 'aterrar o lago todo (menos o bloco que já está em obra)');
  const pre = planoDemolir(s, { modo: 'bloco', tx: x, ty: y });
  ok(pre.simples && /Obra/.test(pre.simples.nome), 'tocar na terraplanagem em obra: cancela (devolve tudo)');
  const m1 = s.money; executarDemolir(s, { modo: 'bloco', tx: x, ty: y }, { now: T0 }); ok(s.money - m1 === 60 && s.terrain[W[0]] === 'w', 'cancelada: R$ 60 de volta e a água continua');
  // prédio e caminho como antes
  const s2 = base(); for (let xx = 10; xx < 20; xx++) paintTerrain(s2, xx, 30, 'p'); rebuildOcc(s2);
  const f = placeFacility(s2, 'lanchonete', 12, 28); ok(f.ok, 'lanchonete ao lado do caminho');
  const fac = s2.facilities[s2.facilities.length - 1], Pf = planoDemolir(s2, { modo: 'bloco', tx: fac.tx, ty: fac.ty });
  ok(Pf.simples?.nome === C.facilities.lanchonete.nome && Pf.simples.volta === Math.round(C.facilities.lanchonete.custo * 0.5), 'Bloco no prédio: mesmo texto e 50% de volta');
  const pc = planoDemolir(s2, { modo: 'bloco', tx: 19, ty: 30 }); ok(pc.simples?.nome === 'Caminho', 'Bloco no caminho: caminho');
  const m2 = s2.money; executarDemolir(s2, { modo: 'bloco', tx: fac.tx, ty: fac.ty }); ok(!s2.facilities.includes(fac) && s2.money - m2 === Math.round(C.facilities.lanchonete.custo * 0.5), 'Bloco remove o prédio como antes');
  ok(!planoDemolir(s2, { modo: 'bloco', tx: 40, ty: 40 }).ok, 'Bloco no vazio: nada para demolir');
}
// ---- Prédio ----
{
  const s = base(); for (let xx = 10; xx < 30; xx++) paintTerrain(s, xx, 30, 'p'); rebuildOcc(s);
  placeFacility(s, 'banheiro', 12, 28); const b = s.facilities[s.facilities.length - 1];
  const P = planoDemolir(s, { modo: 'predio', tx: b.tx, ty: b.ty }); ok(P.ok && P.facs.length === 1 && P.volta === Math.round(C.facilities.banheiro.custo * 0.5), 'Prédio: 1 toque, 50% de volta');
  ok(!planoDemolir(s, { modo: 'predio', tx: 19, ty: 30 }).ok, 'Prédio no caminho: pede para tocar num prédio');
  const ent = s.facilities.find(f => C.facilities[f.type]?.fixo); ok(!planoDemolir(s, { modo: 'predio', tx: ent.tx, ty: ent.ty }).ok, 'a entrada não pode ser demolida');
  const ro = placeFacility(s, 'lanchonete', 20, 28, { obra: true, now: T0 }); const ob = ro.obra;
  const Po = planoDemolir(s, { modo: 'predio', tx: 20, ty: 28 }); ok(Po.ok && Po.obras.length === 1 && Po.volta === Math.round(ob.custo), 'prédio em obra: cancela e devolve 100%');
  executarDemolir(s, { modo: 'predio', tx: b.tx, ty: b.ty }); ok(!s.facilities.includes(b), 'banheiro removido');
  const cl = placeFacility(s, 'clinica', 24, 31); const fc = s.facilities[s.facilities.length - 1];
  if (cl.ok) { s.animals.push({ id: 9999, sp: 'zebra', internado: fc.id, hab: 0, habOrig: 0 }); ok(!planoDemolir(s, { modo: 'predio', tx: fc.tx, ty: fc.ty }).ok, 'clínica com internado: espera a alta'); s.animals.pop(); }
  else ok(true, 'clínica (sem lugar neste mapa de teste)');
}
// ---- Área ----
{
  const s = base(), z = construirRapido(s, 'zebra', 22, 14), g = construirRapido(s, 'girafa', 46, 14);
  const hz = z.hab, hg = g.hab;
  // área cobrindo o recinto das zebras inteiro (com o caminho em volta) e só metade do das girafas
  const alvo = { modo: 'area', x0: hz.x - 2, y0: hz.y - 2, x1: hg.x + (hg.w >> 1), y1: hz.y + hz.h + 1 };
  const P = planoDemolir(s, alvo), R = resumoPlano(s, P);
  ok(P.ok && P.recintos.length === 1 && P.recintos[0].id === hz.id, 'Área: recinto inteiro dentro sai; o cortado pela metade fica');
  ok(P.caminho.length > 0 && P.furn.length > 0, `Área: ${P.caminho.length} blocos de caminho e ${P.furn.length} enfeites`);
  ok(P.mudar.length === 3 && P.mudar.every(m => m.para === hg.id), 'as zebras vão para as girafas, que ficam');
  ok(P.cells.every(i => !hg.cells.includes(i)), 'nada de dentro do recinto que fica aparece na prévia vermelha');
  const plantasG = s.objects.filter(o => hg.cells.includes(idx(o.tx, o.ty))).length;
  const m0 = s.money, r = executarDemolir(s, alvo, { now: T0 });
  ok(r.ok && !habById(s, hz.id) && habById(s, hg.id), 'executou: zebras fora, girafas ficaram');
  ok(s.objects.filter(o => hg.cells.includes(idx(o.tx, o.ty))).length === plantasG, 'plantas das girafas intactas');
  ok(Math.abs(s.money - m0 - P.volta) < 1, `caixa = prévia (${Math.round(P.volta)})`);
  ok(P.caminho.every(i => s.terrain[i] === 'g'), 'caminho da área virou grama');
  ok(R.sai.some(t => /caminho/.test(t)) && R.sai.some(t => /enfeite/.test(t)), 'texto da prévia lista caminho e enfeites');
  const ent = s.facilities.find(f => C.facilities[f.type]?.fixo), Pe = planoDemolir(s, { modo: 'area', x0: ent.tx - 1, y0: ent.ty - 1, x1: ent.tx + 2, y1: ent.ty + 1 });
  ok(!Pe.facs.some(f => f.id === ent.id) && Pe.avisos.some(a => /entrada/i.test(a)), 'a entrada nunca sai na Área');
  ok(!planoDemolir(base(), { modo: 'area', x0: 40, y0: 40, x1: 44, y1: 44 }).ok, 'Área vazia: nada para demolir');
}
// ---- lago de enfeite: Com lago na construção rápida ----
for (const sp of Object.keys(C.species)) {
  const s = base(), S = C.species[sp], p0 = planoRapido(s, sp, 30, 14), p1 = planoRapido(s, sp, 30, 14, { lago: true });
  if (S.agua) { ok(!p0.podeLago && !p1.lago && p0.nec.agua === p1.nec.agua, `${S.nome}: precisa de lago, continua sempre com lago (sem botão)`); continue; }
  ok(p0.podeLago && p1.lago && p1.total > p0.total && p1.dur >= p0.dur + 2 * MIN - 1, `${S.nome}: 💧 Com lago mais caro (+${Math.round(p1.total - p0.total)}) e +2 min de obra`);
  const m0 = s.money, r = construirRapido(s, sp, 30, 14, { lago: true, obra: true, now: T0 });
  ok(r.ok && m0 - s.money <= p1.total + 0.5 && r.obra.dur === p1.dur, `${S.nome}: preço e tempo iguais aos da prévia`);
  const W = agua(s, r.hab);
  ok(W.length === 6 && W.every(i => waterDepth(s, i % MAP, (i / MAP) | 0) < 0.5), `${S.nome}: lago raso de 6 blocos`);
  ok(r.hab.rapido?.lago === true, `${S.nome}: recinto lembra que tem lago`);
  OB.terminarAgora(s, r.obra.id, T0 + MIN);
  ok(s.animals.filter(a => a.hab === r.hab.id).length === S.social.min, `${S.nome}: chegaram ${S.social.min}`);
}
ok(semAgua.every(sp => !C.species[sp].agua), 'as 6 espécies sem lago obrigatório: ' + semAgua.join(', '));
{
  const s = base(), r = construirRapido(s, 'girafa', 30, 14, { lago: true }); viva(s, 240);
  const an = s.animals.filter(a => a.hab === r.hab.id);
  ok(an.length === 2 && an.every(a => !a.escaped && a.welfare > 0.5), 'girafas com lago: 4 h de jogo, bem-estar bom, sem fuga');
  const I = habInfo(s, r.hab); ok(I.water === 6, 'lago conta como água no recinto (metade do espaço)');
}
// ---- + Lago na ficha ----
{
  const s = base(), z = construirRapido(s, 'zebra', 30, 14), h = z.hab;
  ok(podeTerLago(s, h), 'recinto de zebras sem lago: mostra + Lago');
  const P = planoLago(s, h); ok(P.ok && P.cells.length === 6 && P.custo === 6 * 75 && P.dur === 3 * MIN, `+ Lago: 6 blocos, ${P.custo} e 3 min`);
  ok(P.cells.every(i => !s._occ.obj[i] && i !== idx(...h.gateIn) && i !== idx(...h.feed) && i !== idx(...h.water)), 'longe de portão, comedouro, bebedouro e plantas');
  const m0 = s.money, r = lagoNoRecinto(s, h, { now: T0 });
  ok(r.ok && r.obra.tipo === 'lago' && m0 - s.money === P.custo, 'virou obra paga');
  ok(!podeTerLago(s, h) && !planoLago(s, h).ok, 'não deixa pedir outro lago');
  ok(habObstacles(s, h).some(o => o.obra === r.obra.id && o.box && o.solido), 'tapume do lago é sólido para os animais');
  viva(s, 30);
  const box = habObstacles(s, h).find(o => o.obra), dentro = s.animals.filter(a => a.hab === h.id && Math.abs(a.x - box.x) < box.hx - 0.3 && Math.abs(a.z - box.z) < box.hz - 0.3);
  ok(!dentro.length, 'nenhuma zebra dentro do tapume');
  catchUp(s, T0 + 4 * MIN);
  ok(!s.obras.length && agua(s, h).length === 6 && P.cells.every(i => s.terrain[i] === 'w'), 'pronto (até com o app fechado): lago de 6 blocos');
  ok(!habObstacles(s, h).some(o => o.obra), 'tapume sumiu');
  const s2 = base(), hp = construirRapido(s2, 'hipopotamo', 30, 14); ok(!podeTerLago(s2, hp.hab), 'recinto de hipopótamo já tem lago: sem botão');
  // recinto lotado e apertado: pede para ampliar
  const s3 = base(); placeHabitat(s3, 20, 20, 25, 25, 'savana', 'ferro'); const h3 = s3.habitats[s3.habitats.length - 1];
  for (let k = 0; k < 3; k++) buyAnimal(s3, 'zebra', h3.gateIn[0], h3.gateIn[1]);
  const P3 = planoLago(s3, h3); ok(!P3.ok && P3.semEspaco, 'recinto apertado: falta espaço para o lago (oferece Ampliar)');
  const s4 = base(), z4 = construirRapido(s4, 'zebra', 30, 14), h4 = z4.hab, L0 = lotacao(s4, h4, 'zebra').porEspaco; lagoNoRecinto(s4, h4, { now: T0 });
  ok(lotacao(s4, h4, 'zebra').porEspaco <= L0, 'lotação já conta o lago em obra');
  // demolir com o lago em obra: devolve o lago
  const m4 = s4.money, Pd = planoDemolir(s4, { modo: 'recinto', ...meio(h4) }); executarDemolir(s4, { modo: 'recinto', ...meio(h4) }, { now: T0 });
  ok(Math.abs(s4.money - m4 - Pd.volta) < 1 && Pd.volta >= OB.custoCavar(s4, 6), 'demolir com lago em obra: o lago volta inteiro');
}
// ---- save: obras novas sobrevivem; save 12 da 1.8.3 carrega ----
{
  const s = base(), hp = construirRapido(s, 'hipopotamo', 22, 14), z = construirRapido(s, 'zebra', 46, 14);
  executarDemolir(s, { modo: 'recinto', ...meio(hp.hab) }, { aterrar: true, now: T0 }); lagoNoRecinto(s, z.hab, { now: T0 });
  const o = JSON.parse(JSON.stringify(serialize(s))), m = deserialize(o);
  ok(m.schemaVersion === SCHEMA && SCHEMA === 12, 'save continua no SCHEMA 12 (sem campo obrigatório novo)');
  ok(m.obras.map(x => x.tipo).sort().join() === 'aterro,lago' && m.obras.every(x => x.cells?.length), 'aterro e lago em obra continuam depois de salvar');
  rebuildOcc(m); OB.obraTick(m, T0 + 10 * MIN);
  ok(!m.obras.length && agua(m, m.habitats.find(h => h.name === z.hab.name)).length === 6, 'e terminam depois de carregar');
  const v = base(); construirRapido(v, 'leao', 30, 14); const o12 = JSON.parse(JSON.stringify(serialize(v))); for (const h of o12.habitats) if (h.rapido) delete h.rapido.lago;
  const mv = deserialize(o12); ok(mv.habitats.length === v.habitats.length && mv.animals.length === v.animals.length, 'save da 1.8.3 carrega igual');
  ok(planoDemolir(mv, { modo: 'recinto', ...meio(mv.habitats[mv.habitats.length - 1]) }).ok, 'e já dá para demolir pelo modo novo');
}
// ---- DLC e versão ----
{
  const s = base(), S = { ...C.species.zebra, nome: 'Okapi', pack: 'dlc_teste', agua: 0 }; C.species.okapi_t = S;
  const nec = necessidade(s, 'okapi_t', true, true); ok(nec.lagoOpc && nec.agua === 6, 'espécie de DLC sem água também ganha o 💧 Com lago (sem campo novo no contrato)');
  delete C.species.okapi_t;
}
ok(APP_VERSION === '1.8.3b' && CHANGELOG[0].versao === '1.8.3b' && CHANGELOG[0].itens.length >= 5, 'versão 1.8.3b com novidades');
const vnum = v => String(v).split('.').map(p => { const m = /^(\d+)([a-z]?)$/.exec(p); return m ? +m[1] + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : 0; });
const cmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
ok(cmp('1.8.3b', '1.8.3') > 0 && cmp('1.8.3b', '1.8.4') < 0, 'checagem de atualização: 1.8.3 < 1.8.3b < 1.8.4');

console.log(`\n${n - fails}/${n} verificações`);
if (fails) { console.log(`${fails} FALHA(S)`); process.exit(1); } else console.log('TODOS OS TESTES DA 1.8.3b (DEMOLIR E LAGOS) PASSARAM');
