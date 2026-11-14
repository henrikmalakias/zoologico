// Testes da versão 1.8: carreira da equipe (níveis, cursos na folga, pedidos de aumento, entrevista, experiência, rescisão), save 11.
import { newGame, step, simulateAbstract, SCHEMA, hire, genCandidate, fireById } from '../src/sim/core.js';
import { placeHabitat, placeFacility, buyAnimal } from '../src/sim/build.js';
import { workMul, startTask, managerTick } from '../src/sim/staff.js';
import { salarioDia } from '../src/sim/turnos.js';
import { NIVEIS, ganhaXp, progresso, entrevistar, ENTREVISTA, emExperiencia, rescisao, demitir, cursosPara, matricular, CURSOS, pedidos, aceitarPedido, negociarPedido, recusarPedido, ajustaSalario, gerentePedidos, carreiraHora, carreiraDia, querSair, EXP_DIAS, RESCISAO_DIAS, DIA } from '../src/sim/carreira.js';
import { serialize, deserialize, MIGRATIONS } from '../src/save/save.js';
import { APP_VERSION, CHANGELOG } from '../src/content/registry.js';
import { TRACOS_EQUIPE } from '../src/content/base.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || 777;
const live = () => ({ abstract: false, realDt: 0.05, moveMul: 1 });
const ABS = { abstract: true, realDt: 0, moveMul: 0, now };
const hora = (s, h) => { s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + h * 60; };
const base = () => { const s = newGame(now); s.money = 9e6; s.settings.fugas = false; s.settings.selvagem = false; hora(s, 9); return s; };
const cand = (s, role) => { let c; do { c = genCandidate(s, now); } while (c.role !== role); s.candidates.push(c); return c; };
const contrata = (s, role, turno, traits = []) => { const c = cand(s, role); c.hidden = traits; const p = hire(s, c.id, turno).person; p.energy = 1; return p; };
const efetiva = (s, p) => { p.exp = 0; p.oculto = false; };

// ---- entrevista, traço oculto e experiência ----
{
  const s = base();
  ok(SCHEMA === 11, 'save 11');
  for (let i = 0; i < 60; i++) { const c = genCandidate(s, now); if (c.hidden.some(t => TRACOS_EQUIPE[t]?.curso)) { ok(false, 'traço de curso não aparece em currículo'); break; } }
  const c = cand(s, 'tratador'); c.hidden = ['distraido']; const m0 = s.money;
  const r = entrevistar(s, c.id);
  ok(r.ok && c.entrev && r.tracos[0] === 'distraido' && s.money === m0 - ENTREVISTA && s.stats.today.exp.treinamento === ENTREVISTA, 'entrevista paga mostra o traço antes de contratar');
  entrevistar(s, c.id); ok(s.money === m0 - ENTREVISTA, 'entrevistar de novo não cobra');
  const a = hire(s, c.id, 'dia').person;
  ok(a.oculto === false && emExperiencia(s, a) && a.exp === s.clock.min + EXP_DIAS * DIA, 'entrevistado: traço conhecido na contratação, 3 dias de experiência');
  const b = contrata(s, 'tratador', 'dia', ['preguicoso']);
  ok(b.oculto === true && b.traits[0] === 'preguicoso', 'sem entrevista: traço escondido na ficha (mas vale no serviço)');
  simulateAbstract(s, DIA + 61, { now, noManager: true });
  ok(b.oculto === false && s.log.some(l => l.msg.includes(b.name) && l.msg.includes('Preguiçoso')), 'o traço aparece depois de 1 dia de trabalho');
  ok(emExperiencia(s, b) && rescisao(s, b) === 0, 'ainda em experiência: dispensa sem custo');
  const m1 = s.money; const d = demitir(s, b.id, fireById);
  ok(d.ok && d.custo === 0 && s.money === m1 && !s.staff.includes(b), 'dispensado na experiência sem pagar nada');
  simulateAbstract(s, 2 * DIA, { now, noManager: true });
  ok(!emExperiencia(s, a) && a.exp === 0 && s.log.some(l => l.msg.includes('efetivado')), 'depois de 3 dias é efetivado');
  const m2 = s.money, v = rescisao(s, a);
  ok(v === RESCISAO_DIAS * salarioDia(a) && demitir(s, a.id, fireById).custo === v && Math.abs(s.money - (m2 - v)) < 1e-6, 'demitir efetivo custa 5 dias de salário');
}

// ---- níveis ----
{
  const s = base(); const p = contrata(s, 'tratador', 'dia'); efetiva(s, p);
  const e0 = p.expected, w0 = workMul(p);
  ok(p.nivel === 0 && p.xp === 0 && progresso(p).prox === 'Pleno', 'começa como Júnior');
  ganhaXp(s, p, NIVEIS[1].xp);
  ok(p.nivel === 1 && Math.abs(workMul(p) / w0 - NIVEIS[1].vel) < 1e-9 && p.expected > e0, 'Pleno: serviço 8% mais rápido e salário esperado maior');
  ganhaXp(s, p, 500);
  ok(p.nivel === 3 && progresso(p).prox === null && Math.abs(p.expected / e0 - NIVEIS[3].sal) < 0.08, 'chega a Especialista (salário esperado ~ +45%)');
  // experiência pelo serviço de verdade
  const q = contrata(s, 'tratador', 'dia'); placeHabitat(s, 26, 26, 33, 33, 'savana', 'muro'); buyAnimal(s, 'zebra', 29, 29);
  const h = s.habitats[0]; h.food = 0; q.task = null; startTask(s, q, 'feed', h.id);
  for (let i = 0; i < 4000 && q.xp === 0; i++) step(s, 0.25, live());
  ok(q.xp >= 0.4, `serviço concluído dá experiência (${q.xp.toFixed(2)})`);
  const x0 = q.xp; simulateAbstract(s, DIA, { now, noManager: true });
  ok(q.xp >= x0 + 1, 'tempo de casa: +1 por dia');
}

// ---- cursos ----
{
  const s = base(); const p = contrata(s, 'tratador', 'dia', ['distraido']);
  ok(!matricular(s, p.id, 'tecnica').ok, 'em experiência não faz curso');
  efetiva(s, p); p.attrs.habilidade = 3;
  const L = cursosPara(s, p).map(c => c.id);
  ok(L.includes('tecnica') && L.includes('manejo') && L.includes('reciclagem') && !L.some(id => CURSOS[id].gerente), 'cursos da função (com reciclagem porque tem traço ruim)');
  const fx = contrata(s, 'faxineiro', 'dia'); efetiva(s, fx);
  ok(!cursosPara(s, fx).some(c => c.id === 'manejo' || c.id === 'reciclagem'), 'faxineiro sem traço ruim: sem Manejo seguro e sem Reciclagem');
  const m0 = s.money; let r = matricular(s, p.id, 'tecnica');
  ok(r.ok && s.money === m0 - CURSOS.tecnica.custo && p.curso?.id === 'tecnica' && p.curso.fim === s.clock.min + 3 * DIA, 'matrícula paga, 3 dias de jogo');
  ok(!matricular(s, p.id, 'manejo').ok, 'um curso por vez');
  // na folga: continua trabalhando e volta com a energia limitada
  hora(s, 20); p.fora = true; p.task = null; p.energy = 0.2; step(s, 300, ABS);
  ok(p.energy <= 0.7501 && p.energy > 0.5, `quem estuda na folga volta mais cansado (${p.energy.toFixed(2)})`);
  simulateAbstract(s, 3 * DIA, { now, noManager: true });
  ok(!p.curso && p.attrs.habilidade === 4 && p.cursos.includes('Técnicas da função'), 'curso concluído: +1 estrela');
  ok(matricular(s, p.id, 'reciclagem').ok, 'matrícula na reciclagem'); simulateAbstract(s, 5 * DIA + 60, { now, noManager: true });
  ok(!p.traits.includes('distraido'), 'reciclagem tira o traço ruim');
  ok(!cursosPara(s, p).some(c => c.id === 'reciclagem'), 'sem traço ruim, a reciclagem some da lista');
  matricular(s, p.id, 'manejo'); simulateAbstract(s, 4 * DIA + 60, { now, noManager: true });
  ok(p.traits.includes('cuidadoso'), 'Manejo seguro dá o traço Cuidadoso');
  p.attrs.rapidez = 5; ok(cursosPara(s, p).find(c => c.id === 'agilidade').motivo && !matricular(s, p.id, 'agilidade').ok, '5 estrelas: curso bloqueado');
  const it = contrata(s, 'veterinario', 'integral'); efetiva(s, it);
  ok(cursosPara(s, it).find(c => c.id === 'tecnica').dias === 4.5, 'turno integral: curso demora 50% a mais');
  const g = contrata(s, 'subgerente'); efetiva(s, g); g.attrs.decisao = 2;
  ok(cursosPara(s, g).every(c => CURSOS[c.id].gerente) && matricular(s, g.id, 'g_decisao').ok, 'subgerente tem cursos próprios');
  simulateAbstract(s, 3 * DIA + 60, { now }); ok(g.attrs.decisao === 3, 'curso do subgerente concluído');
}

// ---- pedidos de aumento ----
{
  const s = base(); const p = contrata(s, 'tratador', 'dia'); efetiva(s, p); const q = contrata(s, 'faxineiro', 'dia'); efetiva(s, q);
  p.expected = 150; p.salary = 100; q.expected = 100; q.salary = 80; p.ultPedido = q.ultPedido = -99 * DIA; p.sat = q.sat = 0.7;
  carreiraDia(s);
  ok(pedidos(s).length === 1, 'no máximo 1 pedido novo por dia');
  const quem = pedidos(s)[0], outro = quem === p ? q : p;
  ok(quem.pedido.valor === quem.expected && s.log.some(l => l.msg.includes('pediu aumento')), 'pede o salário esperado');
  const sat0 = quem.sat; ok(aceitarPedido(s, quem.id).ok && quem.salary === quem.expected && !quem.pedido && quem.sat > sat0, 'aceitar: salário sobe e a satisfação também');
  carreiraDia(s); ok(outro.pedido && !quem.pedido, 'no dia seguinte, o outro pede; quem já recebeu não pede de novo');
  // negociar
  let aceitou = 0, recusou = 0;
  for (let i = 0; i < 40; i++) { const t = base(); t.rng = (now + i * 7919) | 0; const x = contrata(t, 'tratador', 'dia'); efetiva(t, x); x.salary = 100; x.expected = 140; x.pedido = { valor: 140, desde: t.clock.min, negociou: false }; x.sat = 0.6;
    const r = negociarPedido(t, x.id); if (r.aceitou) { aceitou++; if (x.salary !== 120 || x.pedido) ok(false, 'contraproposta aceita = metade'); } else { recusou++; if (!x.pedido?.negociou || negociarPedido(t, x.id).ok) ok(false, 'só negocia uma vez'); } }
  ok(aceitou > 3 && recusou > 3, `negociar: às vezes aceita a metade, às vezes não (${aceitou}/${recusou})`);
  // recusar
  const s0 = outro.sat; recusarPedido(s, outro.id);
  ok(!outro.pedido && outro.sat < s0 - 0.15 && outro.recusas === 1, 'recusar derruba a satisfação');
  carreiraDia(s); ok(!outro.pedido, 'não pede de novo logo em seguida');
  outro.recusas = 2; ok(querSair(s, outro), '2 recusas: pode pedir demissão');
  let saiu = false; for (let i = 0; i < 80 && !saiu; i++) { outro.sat = 0.6; outro.ultPedido = s.clock.min; simulateAbstract(s, DIA, { now, noManager: true }); saiu = !s.staff.includes(outro); }
  ok(saiu && s.log.some(l => l.msg.includes('aumento recusado')), 'pediu demissão depois do aumento recusado');
  // sem resposta (jogo aberto) = recusa; aumento manual atende
  const t = base(); const x = contrata(t, 'tratador', 'dia'); efetiva(t, x); x.salary = 100; x.expected = 130; x.pedido = { valor: 130, desde: t.clock.min - 3 * DIA, negociou: false };
  carreiraHora(t, live()); ok(!x.pedido && x.recusas === 1, 'sem resposta em 3 dias de jogo conta como recusa');
  x.pedido = { valor: 130, desde: t.clock.min - 9 * DIA, negociou: false }; carreiraHora(t, ABS); ok(x.pedido, 'com o app fechado o pedido não vence sozinho');
  ajustaSalario(t, x.id, 1.1); ok(x.pedido && x.salary === 110, '+10% que não cobre o pedido não resolve'); ajustaSalario(t, x.id, 1.1); ajustaSalario(t, x.id, 1.1);
  ok(!x.pedido && x.salary >= 130, 'aumento manual que cobre o valor atende o pedido');
  const sx = x.sat; ajustaSalario(t, x.id, 0.9); ok(x.sat < sx, 'cortar salário desanima');
  // em experiência não pede
  const y = contrata(t, 'tratador', 'dia'); y.salary = 50; y.expected = 150; y.ultPedido = -99 * DIA; carreiraDia(t); ok(!y.pedido, 'em experiência não pede aumento');
}

// ---- subgerente responde com o app fechado ----
{
  const s = base(); const p = contrata(s, 'tratador', 'dia'); efetiva(s, p); const g = contrata(s, 'subgerente'); efetiva(s, g); g.traits = [];
  p.salary = 100; p.expected = 140; p.pedido = { valor: 140, desde: s.clock.min - 200, negociou: false };
  gerentePedidos(s); ok(!p.pedido && p.salary === 140 && s.log.some(l => l.msg.includes(g.name + ' aceitou')), 'caixa folgado: o subgerente aceita');
  s.money = 100; p.salary = 100; p.pedido = { valor: 140, desde: s.clock.min - 200, negociou: false };
  gerentePedidos(s); ok(p.salary === 120 || p.pedido?.negociou, 'caixa apertado: o subgerente negocia');
  g.pedido = { valor: 999, desde: s.clock.min - 9999, negociou: false }; gerentePedidos(s); ok(g.pedido, 'o pedido do próprio subgerente espera o jogador');
  const t = base(); const a = contrata(t, 'tratador', 'dia'); efetiva(t, a); a.salary = 100; a.expected = 140; a.pedido = { valor: 140, desde: t.clock.min, negociou: false };
  simulateAbstract(t, 600, { now, noManager: true }); ok(a.pedido, 'jogo aberto (avançar relógio): ninguém responde por você');
  void managerTick;
}

// ---- traços de curso ----
{
  const s = base(); const p = contrata(s, 'tratador', 'dia', ['distraido', 'cuidadoso']);
  placeHabitat(s, 26, 26, 33, 33, 'savana', 'muro'); buyAnimal(s, 'zebra', 29, 29); const h = s.habitats[0];
  let abriu = 0; for (let i = 0; i < 300; i++) { h.gateOpen = false; h.waterLvl = 0; p.task = null; p.energy = 1; startTask(s, p, 'water', h.id); p.task.phase = 'work'; p.task.work = 0.01; p.inHab = h.id; step(s, 1, ABS); if (h.gateOpen) abriu++; }
  ok(abriu === 0, 'Cuidadoso nunca esquece o portão aberto (mesmo sendo Distraído)');
}

// ---- save 11 e migração ----
{
  const s = base(); s.clock.min = 23 * DIA + 600; s.clock.day = 23;
  const a = contrata(s, 'tratador', 'dia', ['distraido']), b = contrata(s, 'veterinario', 'noite'), g = contrata(s, 'subgerente');
  const c = cand(s, 'tratador'); entrevistar(s, c.id);
  const o = JSON.parse(JSON.stringify(serialize(s))); o.schemaVersion = 10;
  for (const p of [...o.staff, ...o.managers]) for (const k of ['xp', 'nivel', 'desde', 'exp', 'oculto', 'curso', 'cursos', 'pedido', 'recusas', 'ultPedido']) delete p[k];
  for (const x of o.candidates) delete x.entrev;
  const sal = o.staff.map(p => [p.salary, p.expected]).join();
  const m = deserialize(o);
  ok(m.schemaVersion === 11 && typeof MIGRATIONS[10] === 'function', 'migração 10 → 11');
  ok(m.staff.length === 2 && m.managers.length === 1 && m.staff.map(p => [p.salary, p.expected]).join() === sal, 'ninguém some e os salários não mudam');
  ok([...m.staff, ...m.managers].every(p => p.nivel === 1 && p.xp === 35 && !p.exp && p.oculto === false && !p.pedido && !p.curso && Array.isArray(p.cursos)), '23 dias de jogo: todos efetivos no nível Pleno, traços visíveis');
  ok(m.candidates.every(x => x.entrev === false), 'currículos antigos: sem entrevista');
  const antes = pedidos(m).length; simulateAbstract(m, 2 * DIA, { now, noManager: true }); ok(antes === 0 && pedidos(m).length <= 2, 'depois de atualizar, os pedidos chegam aos poucos');
  // ida e volta do save novo
  a.curso = null; efetiva(s, a); a.attrs.habilidade = 3; matricular(s, a.id, 'tecnica'); b.pedido = { valor: 300, desde: s.clock.min, negociou: true };
  const z = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  const a2 = z.staff.find(p => p.id === a.id), b2 = z.staff.find(p => p.id === b.id);
  ok(a2.curso?.id === 'tecnica' && b2.pedido?.negociou && z.candidates.find(x => x.id === c.id)?.entrev, 'curso, pedido e entrevista sobrevivem ao salvar e carregar');
  void g;
}

// ---- alguns dias de jogo sem quebrar ----
{
  const s = base(); placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro'); buyAnimal(s, 'zebra', 30, 30); buyAnimal(s, 'zebra', 31, 30); placeFacility(s, 'centro', 40, 40);
  for (const [r, t] of [['tratador', 'dia'], ['tratador', 'noite'], ['veterinario', 'dia'], ['faxineiro', 'dia'], ['seguranca', 'dia'], ['subgerente']]) contrata(s, r, t);
  let erro = null; try { for (let i = 0; i < 6; i++) simulateAbstract(s, DIA, { now }); for (let i = 0; i < 2000; i++) step(s, 0.25, live()); } catch (e) { erro = e; }
  ok(!erro, 'seis dias com o app fechado e um trecho ao vivo sem erro' + (erro ? ': ' + erro.message : ''));
  ok(s.staff.every(p => p.xp > 0 && Number.isFinite(p.xp) && Number.isFinite(p.sat) && Number.isFinite(p.salary)), 'todos ganharam experiência; números válidos');
  ok(Number.isFinite(s.money), 'caixa válido');
}

ok(APP_VERSION >= '1.8' && CHANGELOG.some(c => c.versao === '1.8' && c.itens.length >= 6), 'versão 1.8 com novidades no CHANGELOG');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.8 PASSARAM (${n})`); process.exit(fails ? 1 : 0);
