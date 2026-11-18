// Testes da versão 1.8.3 (parte 2): tempo de obra em minutos reais, tapume/área fechada, "Terminar agora", lista
// "a caminho", Ampliar/+1/Outra espécie com obra, prédios, app fechado (relatório), save 12 e migração do save 11.
import { newGame, step, simulateAbstract, catchUp, SCHEMA } from '../src/sim/core.js';
import { placeHabitat, placeFacility, expandHabitat, demolish, buyAnimal, paintTerrain, checkFacility, placePlant, checkShrink } from '../src/sim/build.js';
import { construirRapido, planoRapido, lotacao, maisUm, custoMaisUm, ampliarRapido, planoAmpliar, blocosParaMais, outraEspecie, especiesCompativeis } from '../src/sim/rapido.js';
import * as OB from '../src/sim/obras.js';
import { habInfo, habById } from '../src/sim/animals.js';
import { idx, staffPassable, rebuildOcc } from '../src/sim/grid.js';
import { tocasDe } from '../src/sim/tocas.js';
import { serialize, deserialize, MIGRATIONS } from '../src/save/save.js';
import { podeVisitar } from '../src/sim/visita.js';
import { content } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const T0 = (+process.env.SEED || 1838) * 1000 + 1.7e12, MIN = 60e3;
const base = (area = 3) => { const s = newGame(T0); s.money = 5e6; s.areaLevel = area; s.settings.fugas = false; s.settings.selvagem = false; s.obraGratis = false; return s; };
const C = content(base());
const viva = (s, mins, t) => { for (let k = 0; k < mins; k++) { step(s, 1, { abstract: false, realDt: 1, moveMul: 1, now: t }); } };

// ---- durações ----
ok(OB.duracaoHab(20) === 6 * MIN && OB.duracaoHab(36) === 6 * MIN, 'recinto pequeno: 6 min');
ok(OB.duracaoHab(400) === 60 * MIN && OB.duracaoHab(900) === 60 * MIN, 'recinto grande (20 x 20): 60 min');
ok(OB.duracaoHab(200) > 6 * MIN && OB.duracaoHab(200) < 60 * MIN, 'recinto médio: no meio');
const s0 = base();
const df = Object.fromEntries(Object.keys(C.facilities).map(k => [k, OB.duracaoFac(s0, k) / MIN]));
ok(Object.entries(df).every(([k, v]) => v === 0 || (v >= 3 && v <= 12)), 'prédios de 3 a 12 min: ' + JSON.stringify(df));
ok(df.banheiro === 3 && df.clinica === 12 && df.lanchonete > 3 && df.lanchonete < df.centro, 'banheiro 3 min, clínica 12 min, lanchonete no meio');
ok(df.banco === 0 && df.placa === 0 && df.entrada === 0, 'banco e placa continuam instantâneos');
ok(OB.duracaoToca() === 3 * MIN, 'toca nova: 3 min');

// ---- construção rápida com obra: cada espécie ----
for (const sp of Object.keys(C.species)) {
  const s = base(), S = C.species[sp];
  const p = planoRapido(s, sp, 30, 14), m0 = s.money;
  const r = construirRapido(s, sp, 30, 14, { obra: true, now: T0 });
  if (!r.ok) { ok(false, `${S.nome}: construiu (${r.msg})`); continue; }
  const h = r.hab, o = r.obra;
  ok(o && h.obra === o.id && o.dur === OB.duracaoHab(p.rect.w * p.rect.h), `${S.nome}: obra de ${Math.round(o.dur / MIN)} min (${p.rect.w}x${p.rect.h})`);
  ok(m0 - s.money <= p.total + 0.5, `${S.nome}: o preço não muda com a obra`);
  ok(s.animals.filter(a => a.hab === h.id).length === 0 && OB.aCaminhoDe(s, h.id, sp).length === S.social.min, `${S.nome}: ${S.social.min} na lista a caminho, nenhum no mapa`);
  ok(lotacao(s, h, sp).n === S.social.min, `${S.nome}: lotação já conta quem está a caminho`);
  ok(!podeVisitar(s, h).ok, `${S.nome}: AO VIVO não entra no recinto em obra`);
  // meio da obra: nada chega; 1 segundo depois do fim: chegam pelo portão
  OB.obraTick(s, T0 + o.dur / 2); ok(h.obra && s.animals.filter(a => a.hab === h.id).length === 0, `${S.nome}: na metade continua em obra`);
  OB.obraTick(s, T0 + o.dur + 1000);
  const an = s.animals.filter(a => a.hab === h.id);
  ok(!h.obra && an.length === S.social.min && !OB.aCaminhoDe(s, h.id).length, `${S.nome}: obra pronta e ${an.length} chegaram`);
  ok(new Set(an.map(a => a.sex)).size === (S.social.min > 1 ? 2 : 1), `${S.nome}: sexos equilibrados`);
  ok((s._entregas || []).some(e => e.hab === h.id), `${S.nome}: caminhão marcado para o desenho`);
}

// ---- velocidade e hora do dia não mudam a obra (minutos reais) ----
{
  const s = base(), r = construirRapido(s, 'zebra', 30, 14, { obra: true, now: T0 }), o = r.obra;
  s.clock.speed = 3; viva(s, 600, T0 + 60e3); // 10 h de jogo em 1 minuto real
  OB.obraTick(s, T0 + 60e3);
  ok(r.hab.obra === o.id, 'jogo em 3x por 10 h de jogo: a obra só andou 1 minuto real');
  ok(Math.abs(OB.progresso(o, T0 + 60e3) - 60e3 / o.dur) < 1e-9, 'progresso pela hora real');
  s.clock.speed = 0; OB.obraTick(s, T0 + o.dur); ok(!r.hab.obra, 'com o jogo pausado a obra termina na hora real');
}

// ---- Terminar agora: proporcional, no máximo 60% ----
{
  const s = base(), r = construirRapido(s, 'leao', 30, 14, { obra: true, now: T0 }), o = r.obra;
  const p0 = OB.precoTerminar(s, o, T0), pm = OB.precoTerminar(s, o, T0 + o.dur / 2), pf = OB.precoTerminar(s, o, T0 + o.dur - 1000);
  ok(Math.abs(p0 - Math.ceil(o.custo * 0.6 / 10) * 10) < 1, `sem nada feito: 60% do custo da obra (${p0} de ${o.custo})`);
  ok(Math.abs(pm - p0 / 2) <= 10, `na metade: metade do preço (${pm})`);
  ok(pf >= 10 && pf < p0 * 0.05, `quase pronta: quase de graça (${pf})`);
  const m0 = s.money, t = OB.terminarAgora(s, o.id, T0 + o.dur / 2);
  ok(t.ok && Math.abs(m0 - s.money - pm) < 1 && !r.hab.obra, 'Terminar agora cobra e termina');
  ok(s.animals.filter(a => a.hab === r.hab.id).length === 2, 'e os leões chegam na hora');
  const s2 = base(); s2.money = 0; s2.money = 5e6; const r2 = construirRapido(s2, 'leao', 30, 14, { obra: true, now: T0 }); s2.money = 5;
  ok(!OB.terminarAgora(s2, r2.obra.id, T0).ok && r2.hab.obra, 'sem dinheiro: não termina');
  const s3 = newGame(T0); s3.money = 5e6; s3.areaLevel = 3; const r3 = construirRapido(s3, 'zebra', 30, 14, { obra: true, now: T0 });
  ok(s3.obraGratis && OB.precoTerminar(s3, r3.obra, T0) === 0, 'zoo novo: a primeira obra termina de graça');
  const m3 = s3.money; OB.terminarAgora(s3, r3.obra.id, T0); const gratis = m3 === s3.money;
  const r4 = construirRapido(s3, 'girafa', 30, 40, { obra: true, now: T0 });
  ok(gratis && !s3.obraGratis && OB.precoTerminar(s3, r4.obra, T0) > 0, 'só a primeira é grátis');
}

// ---- área fechada: visitantes, equipe, construção e caminho ----
{
  const s = base(), r = construirRapido(s, 'zebra', 30, 14, { obra: true, now: T0 }), h = r.hab;
  for (let k = 0; k < 200; k++) step(s, 3, { abstract: false, realDt: 1, moveMul: 1, now: T0 });
  ok(h.fenceHp === 1, 'cerca do recinto em obra não gasta');
  ok(!s.alerts.some(a => a.target === h.id), 'recinto em obra não gera alerta');
  // prédio em obra
  const fx = 37, fy = 34, f = placeFacility(s, 'lanchonete', fx, fy, { obra: true, now: T0 });
  ok(f.ok && f.obra && !s.facilities.some(x => x.type === 'lanchonete'), 'lanchonete em obra não está pronta (sem vender)');
  ok(!staffPassable(s, fx, fy) && !checkFacility(s, 'banheiro', fx, fy).ok && !paintTerrain(s, fx, fy, 'p').ok && !placePlant(s, fx + 1, fy + 1, 'arbusto').ok, 'blocos da obra: equipe não passa e nada se constrói em cima');
  OB.obraTick(s, T0 + f.obra.dur + 1);
  ok(s.facilities.some(x => x.type === 'lanchonete' && x.tx === fx && x.ty === fy) && staffPassable(s, fx - 1, fy), 'lanchonete pronta no fim');
  const b = placeFacility(s, 'banco', 33, 35, { obra: true, now: T0 }); ok(b.ok && !b.obra && s.facilities.some(x => x.type === 'banco'), 'banco: instantâneo');
}

// ---- desenho livre: recinto, animais comprados a caminho, ampliação ----
{
  const s = base(), hb = placeHabitat(s, 26, 26, 33, 32, 'savana', 'ferro', { obra: true, now: T0 });
  ok(hb.ok && hb.obra && hb.hab.obra === hb.obra.id && hb.obra.dur === OB.duracaoHab(hb.hab.cells.length), 'desenho livre também leva tempo de obra');
  const h = hb.hab, b1 = buyAnimal(s, 'zebra', 29, 29), b2 = buyAnimal(s, 'zebra', 30, 29);
  ok(b1.ok && b2.ok && OB.aCaminhoDe(s, h.id).length === 2 && !s.animals.some(a => a.hab === h.id), 'comprar animal durante a obra: vai para a lista a caminho');
  ok(new Set(OB.aCaminhoDe(s, h.id).map(e => e.sex)).size === 2, 'casal formado na encomenda');
  ok(!expandHabitat(s, 34, 26, 36, 32, { obra: true }).ok, 'não amplia o recinto antes de ficar pronto');
  OB.obraTick(s, T0 + hb.obra.dur);
  ok(s.animals.filter(a => a.hab === h.id).length === 2, 'zebras chegaram no fim');
  const n0 = h.cells.length, e = expandHabitat(s, 34, 26, 36, 32, { obra: true, now: T0 + hb.obra.dur });
  ok(e.ok && e.obra?.tipo === 'ampliar' && h.cells.length === n0, 'ampliar: a faixa nova vira obra e o recinto ainda não cresce');
  ok(!checkShrink(s, 26, 26, 27, 32).ok, 'não recorta com obra em andamento');
  ok(s.animals.filter(a => a.hab === h.id).length === 2, 'os animais continuam no recinto durante a ampliação');
  ok(e.obra.cells.every(i => !staffPassable(s, i % 72, (i / 72) | 0)), 'faixa da ampliação reservada');
  OB.obraTick(s, OB.fimDe(e.obra));
  ok(h.cells.length === n0 + e.obra.cells.length, `ampliação pronta: +${e.obra.cells.length} blocos`);
}

// ---- ficha: +1 com toca nova, Ampliar e Outra espécie ----
{
  const s = base(), r = construirRapido(s, 'leao', 30, 14, { obra: true, now: T0 }), h = r.hab; OB.obraTick(s, T0 + r.obra.dur);
  const t0 = tocasDe(s, h.id).length;
  // +1 sem precisar de toca: instantâneo; com toca: obra de 3 min
  let sem = null, com = null, t = T0 + r.obra.dur;
  for (let k = 0; k < 4 && !(com && sem); k++) { const n0 = s.animals.filter(a => a.hab === h.id).length, m = maisUm(s, h, 'leao', { obra: true, now: t }); if (!m.ok) break; if (m.obra) com = m; else if (s.animals.filter(a => a.hab === h.id).length === n0 + 1) sem = m; }
  ok(sem, '+1 sem toca nova: chega na hora');
  ok(com && com.obra.tipo === 'toca' && com.aCaminho && tocasDe(s, h.id).length === t0, '+1 com toca nova: toca em obra e o leão a caminho');
  ok(lotacao(s, h, 'leao').vem === 1 && s.animals.filter(a => a.hab === h.id).length + 1 === lotacao(s, h, 'leao').n, 'lotação mostra 1 a caminho e já conta ele');
  OB.obraTick(s, OB.fimDe(com.obra));
  ok(tocasDe(s, h.id).length === t0 + 1 && lotacao(s, h, 'leao').vem === 0 && s.animals.some(a => a.hab === h.id && a.chegou), 'toca pronta e o leão chegou de caminhão');
  // Ampliar pela ficha (recinto rápido: caminho vai para fora já, a faixa fica em obra)
  const pl = planoAmpliar(s, h, blocosParaMais(s, h, 'leao', 3)), n0 = h.cells.length;
  const a = ampliarRapido(s, h, pl.blocos, { obra: true, now: t });
  ok(a.ok && a.obra && h.cells.length === n0, 'Ampliar pela ficha: faixa em obra');
  ok(pl.novos.every(([x, y]) => s.terrain[idx(x, y)] === 'p'), 'o caminho novo já fica pronto por fora da faixa');
  ok(!planoAmpliar(s, h, 10).ok, 'não pede outra ampliação enquanto a primeira não termina');
  OB.obraTick(s, OB.fimDe(a.obra)); ok(h.cells.length > n0, 'ampliação pronta');
  // Outra espécie sem obra (cabe): chega na hora
  const sz = base(), rz = construirRapido(sz, 'zebra', 30, 14, { obra: true, now: T0 }); OB.obraTick(sz, T0 + rz.obra.dur);
  const comp = especiesCompativeis(sz, rz.hab).filter(o => !o.motivo).map(o => o.sp);
  ok(comp.includes('girafa') || comp.includes('tartaruga'), 'zebras aceitam outra espécie da savana: ' + comp.join(','));
  const sp2 = comp.includes('tartaruga') ? 'tartaruga' : comp[0], oe = outraEspecie(sz, rz.hab, sp2, { obra: true, now: T0 + rz.obra.dur });
  const novos = sz.animals.filter(x => x.hab === rz.hab.id && x.sp === sp2).length, vem = OB.aCaminhoDe(sz, rz.hab.id, sp2).length;
  ok(oe.ok && novos + vem === C.species[sp2].social.min && (vem ? OB.obras(sz).length > 0 : true), `Outra espécie (${sp2}): ${novos} na hora, ${vem} a caminho (só espera se precisou de obra)`);
  for (const o of [...OB.obras(sz)]) OB.obraTick(sz, OB.fimDe(o));
  ok(sz.animals.filter(x => x.hab === rz.hab.id && x.sp === sp2).length === C.species[sp2].social.min, 'no fim todos chegaram');
}

// ---- +1 durante a obra do recinto: a toca que faltar sai junto com a obra (o preço mostrado bate) ----
{
  const s = base(), r = construirRapido(s, 'zebra', 30, 14, { obra: true, now: T0 }), h = r.hab; let ok1 = true;
  for (let k = 0; k < 5; k++) { const c = custoMaisUm(s, h, 'zebra'), m0 = s.money, t0 = tocasDe(s, h.id).length, m = maisUm(s, h, 'zebra', { obra: true, now: T0 }); if (!m.ok) break; if (m0 - s.money !== c) ok1 = false; if (c > C.species.zebra.custo && tocasDe(s, h.id).length !== t0 + 1) ok1 = false; }
  ok(ok1 && !OB.obras(s).some(o => o.tipo === 'toca'), '+1 com o recinto em obra: cobra o preço mostrado e a toca sai junto com a obra');
}

// ---- demolir obra devolve tudo ----
{
  const s = base(), m0 = s.money, r = construirRapido(s, 'elefante', 30, 14, { obra: true, now: T0 }), pago = m0 - s.money, h = r.hab;
  const d = demolish(s, h.x + 2, h.y + 2);
  ok(d.ok && !habById(s, h.id) && !OB.obras(s).length && !OB.aCaminho(s).length, 'demolir recinto em obra: some com a obra e a lista a caminho');
  ok(m0 - s.money < pago && pago - (m0 - s.money) >= r.obra.custo + 2 * C.species.elefante.custo - 1, 'devolve a obra e os elefantes (caminho e enfeites ficam)');
  const f = placeFacility(s, 'clinica', 37, 33, { obra: true, now: T0 }), m1 = s.money, c = demolish(s, 38, 34);
  ok(c.ok && s.money - m1 === C.facilities.clinica.custo && !OB.obras(s).length, 'cancelar prédio em obra devolve 100%');
}

// ---- app fechado: a obra continua e aparece no relatório ----
{
  const s = base(), r = construirRapido(s, 'girafa', 30, 14, { obra: true, now: T0 }), h = r.hab, f = placeFacility(s, 'banheiro', 37, 34, { obra: true, now: T0 });
  s.clock.lastRealTs = T0;
  const rep = catchUp(s, T0 + r.obra.dur + 20 * MIN);
  ok(!h.obra && !OB.obras(s).length, 'com o app fechado as obras terminaram');
  ok(s.animals.filter(a => a.hab === h.id).length === 2, 'girafas chegaram com o app fechado');
  const txt = rep.eventos.map(e => e.msg).join(' | ');
  ok(/Obra pronta: Recinto/.test(txt) && /Banheiro/.test(txt) && /caminhão/.test(txt), 'relatório conta as obras e a chegada: ' + txt.slice(0, 160));
  // a girafa chegou no meio do período e passou o resto vivendo (comeu/bebeu): fome não ficou parada no valor inicial
  const g = s.animals.find(a => a.hab === h.id); ok(g && g.chegou >= T0 + r.obra.dur && g.chegou <= T0 + r.obra.dur + 10 * MIN + 1, "chegou na hora certa dentro do período fechado (passo de 10 min de jogo)");
  // banheiro de 3 min terminou antes do recinto
  const i1 = rep.eventos.findIndex(e => /Banheiro/.test(e.msg)), i2 = rep.eventos.findIndex(e => /Obra pronta: Recinto/.test(e.msg)); ok(i1 >= 0 && i1 < i2, 'ordem certa: banheiro antes do recinto');
  // obra que não terminou com o app fechado segue de onde parou
  const s2 = base(), r2 = construirRapido(s2, 'elefante', 30, 14, { obra: true, now: T0 }); s2.clock.lastRealTs = T0; catchUp(s2, T0 + 5 * MIN);
  ok(r2.hab.obra && Math.abs(OB.progresso(r2.obra, T0 + 5 * MIN) - 5 * MIN / r2.obra.dur) < 1e-9, 'obra longa: 5 min fechado = 5 min de obra');
  const s3 = base(), r3 = construirRapido(s3, 'zebra', 30, 14, { obra: true, now: T0 }); s3.clock.lastRealTs = T0;
  const rp = simulateAbstract(s3, 600, { now: T0 }); ok(r3.hab.obra, 'avançar o relógio (sem tempo real) não termina a obra');
}

// ---- save 12 e migração do save 11 ----
{
  ok(SCHEMA === 12 && typeof MIGRATIONS[11] === 'function', 'save 12 com migração 11 → 12');
  const s = base(), r = construirRapido(s, 'macaco', 30, 14, { obra: true, now: T0 }); placeFacility(s, 'loja', 37, 34, { obra: true, now: T0 });
  const o = JSON.parse(JSON.stringify(serialize(s))), m = deserialize(o);
  ok(m.obras.length === 2 && m.aCaminho.length === C.species.macaco.social.min && habById(m, r.hab.id).obra === r.obra.id, 'obras e a lista a caminho voltam do save');
  OB.obraTick(m, T0 + 61 * MIN); ok(!m.obras.length && m.animals.filter(a => a.hab === r.hab.id).length === C.species.macaco.social.min && m.facilities.some(f => f.type === 'loja'), 'depois de carregar, as obras terminam normalmente');
  // save 11 de verdade: sem os campos novos
  const v = base(); const rv = construirRapido(v, 'zebra', 30, 14); placeFacility(v, "lanchonete", 37, 34);
  const o11 = JSON.parse(JSON.stringify(serialize(v))); o11.schemaVersion = 11; delete o11.obras; delete o11.aCaminho; delete o11.obraGratis;
  const antes = { hab: o11.habitats.length, an: o11.animals.length, fac: o11.facilities.length, money: o11.money, tocas: o11.tocas.length, furn: o11.furn.length };
  const mv = deserialize(o11);
  ok(mv.schemaVersion === 12 && Array.isArray(mv.obras) && !mv.obras.length && Array.isArray(mv.aCaminho) && mv.obraGratis === false, 'migração cria as listas vazias');
  ok(mv.habitats.length === antes.hab && mv.animals.length === antes.an && mv.facilities.length === antes.fac && mv.money === antes.money && mv.tocas.length === antes.tocas && mv.furn.length === antes.furn, 'save antigo: nada se perde (recintos, animais, prédios, dinheiro, tocas, mobiliário)');
  ok(mv.habitats.every(h => !h.obra) && mv.facilities.some(f => f.type === 'lanchonete'), 'o que já estava construído continua pronto');
  // migra a cadeia inteira a partir do 10
  const o10 = JSON.parse(JSON.stringify(serialize(v))); o10.schemaVersion = 10; delete o10.obras; delete o10.aCaminho;
  ok(deserialize(o10).schemaVersion === 12, 'save 10 também chega ao 12');
}

// ---- prédio de DLC sem campo novo, e com obraMin opcional ----
{
  const s = base(); const D = C.facilities;
  D._teste = { nome: 'Teste', w: 2, h: 2, custo: 5000, manut: 1 }; D._rapida = { nome: 'Quiosque', w: 1, h: 1, custo: 9000, manut: 1, obraMin: 1 };
  ok(OB.duracaoFac(s, '_teste') > 3 * MIN && OB.duracaoFac(s, '_teste') < 12 * MIN && OB.duracaoFac(s, '_rapida') === MIN, 'DLC: duração automática pelo custo, ou obraMin quando vier');
  delete D._teste; delete D._rapida;
}

console.log(`\n${n - fails}/${n} verificações`);
if (fails) { console.log(`${fails} FALHAS`); process.exit(1); }
console.log('TODOS OS TESTES DA 1.8.3 (TEMPO DE OBRA) PASSARAM');
