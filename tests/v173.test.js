// Testes da versão 1.7.3: turnos, intervalos, folga em casa, hora extra, Centro de cuidados com 8 lugares,
// rua da frente (áreas só para trás, reembolso do sul, ônibus, estacionamento), famílias e banheiro familiar, save 10.
import { newGame, step, simulateAbstract, SCHEMA, hire, genCandidate, expandArea, fixedDaily } from '../src/sim/core.js';
import { placeHabitat, placeFacility, checkFacility, buyAnimal, limparRuaDaFrente } from '../src/sim/build.js';
import { dispatch, refreshAlerts, eligibleStaff, taskName } from '../src/sim/staff.js';
import { TURNOS, emServico, deTurno, trabalhando, salarioDia, trocarTurno, distribuirTurnos, cobertura, turnoSugerido, CAP_CENTRO, ocupacaoCentro, situacao, MIN_SETOR } from '../src/sim/turnos.js';
import { updateRua, rotaChegada, fatorChegada } from '../src/sim/rua.js';
import { arrive, updateVisitors, arrivalRate } from '../src/sim/visitors.js';
import { serialize, deserialize, MIGRATIONS } from '../src/save/save.js';
import { content, APP_VERSION, CHANGELOG } from '../src/content/registry.js';
import { AREAS, RUA, staffPassable, inArea, tileToWorld, worldToTile, idx, MAP } from '../src/sim/grid.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const now = +process.env.SEED || 777;
const live = () => ({ abstract: false, realDt: 0.05, moveMul: 1 });
const ABS = { abstract: true, realDt: 0, moveMul: 0, now };
const hora = (s, h) => { s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + h * 60; };
const base = () => { const s = newGame(now); s.money = 9e6; s.settings.fugas = false; s.settings.selvagem = false; hora(s, 9); return s; };
const contrata = (s, role, turno) => { let c; do { c = genCandidate(s, now); } while (c.role !== role); s.candidates.push(c); const p = hire(s, c.id, turno).person; p.traits = []; p.energy = 1; return p; };
const run = (s, k, ctx = live(), fn) => { for (let i = 0; i < k; i++) { step(s, 0.25, ctx); if (fn && fn(i)) return i; } return k; };
const ateHora = (s, h, ctx = live()) => { let g = 0; while (Math.abs(((s.clock.min / 60) % 24) - h) > 0.13 && g++ < 20000) step(s, 0.25, ctx); };

// ---- conteúdo, áreas e save ----
{
  const s = base(), C = content(s);
  ok(SCHEMA >= 10, 'save 10 ou mais novo');
  ok(AREAS.every(a => a.y1 === 51) && AREAS[3].x0 === 0 && AREAS[3].x1 === 71, 'as áreas crescem só para trás do portão (zoo máximo 72 x 52)');
  ok(C.facilities.banheiro_familiar?.familiar && C.facilities.estacionamento?.zona === 'lote' && C.facilities.centro.lugares === 8, 'banheiro familiar, estacionamento e Centro com 8 lugares no jogo base');
  ok(!staffPassable(s, 20, RUA.muro) && staffPassable(s, RUA.portao[0], RUA.muro) && staffPassable(s, RUA.portao[0], RUA.muro - 1), 'muro da frente bloqueia; portão e catraca da Entrada passam');
  ok(!s.objects.some(o => o.ty >= 51 && o.ty <= 68), 'nada de árvore na rua da frente nem nos lotes');
  s.areaLevel = 3; ok(!inArea(s, 30, 53) && inArea(s, 30, 0), 'área máxima não chega na rua');
  ok(!checkFacility(s, 'lanchonete', 40, 56).ok && checkFacility(s, 'estacionamento', 10, 62).ok && !checkFacility(s, 'estacionamento', 30, 40).ok, 'estacionamento só nos lotes; nada na rua');
  ok(placeFacility(s, 'centro', 40, 40).ok && placeFacility(s, 'centro', 44, 40).ok, 'pode construir mais de um Centro de cuidados');
}

// ---- turnos e salários ----
{
  const s = base();
  const d = contrata(s, 'tratador', 'dia'), nt = contrata(s, 'tratador', 'noite'), it = contrata(s, 'veterinario', 'integral'), fx = contrata(s, 'faxineiro', 'noite');
  ok(d.turno === 'dia' && nt.turno === 'noite' && it.turno === 'integral' && fx.turno === 'dia', 'turno escolhido na contratação; faxineiro não tem noite');
  ok(salarioDia(nt) === Math.round(nt.salary * 1.25) && salarioDia(it) === Math.round(it.salary * 1.4) && salarioDia(d) === d.salary, 'noite +25%, integral +40%');
  ok(fixedDaily(s) >= salarioDia(nt) + salarioDia(it), 'gasto fixo usa o salário com adicional');
  hora(s, 10); ok(emServico(s, d) && !emServico(s, nt) && emServico(s, it), '10h: dia e integral de turno, noite de folga');
  hora(s, 20); ok(!emServico(s, d) && emServico(s, nt) && emServico(s, it), '20h: noite e integral');
  hora(s, 23); ok(!emServico(s, it) && emServico(s, nt), '23h: só a noite');
  hora(s, 5.8); ok(emServico(s, d) && !deTurno(s, d), '5h48: o turno do dia já está chegando (15 min antes)');
  ok(!trocarTurno(s, fx.id, 'noite').ok && trocarTurno(s, d.id, 'integral').ok && d.adic === 1.4, 'trocar o turno recalcula o adicional; faxineiro não vai para a noite');
}

// ---- fim do turno: vai para casa pela rua e volta no próximo ----
{
  const s = base(); const d = contrata(s, 'tratador', 'dia');
  hora(s, 17.5); run(s, 4);
  ateHora(s, 18.3); run(s, 1500, live(), () => d.fora);
  ok(d.fora && !d.task, 'depois das 18h o tratador do dia foi para casa (pegou o ônibus)');
  ok(/De folga/.test(situacao(s, d, taskName)), 'ficha: "De folga (volta às ...)"');
  ateHora(s, 5.9); run(s, 4);
  ok(!d.fora && emServico(s, d), 'volta antes das 6h pela rua');
  const T = worldToTile(d.x, d.z); ok(T.ty >= RUA.muro - 2, 'chega pela rua da frente (perto do portão)');
}

// ---- intervalos escalonados com o mínimo de 2 do setor trabalhando ----
{
  const s = base(); const L = [1, 2, 3, 4, 5, 6].map(() => contrata(s, 'tratador', 'dia'));
  placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro'); buyAnimal(s, 'zebra', 30, 30);
  hora(s, 11.9); let minAtivos = 99, maxPausa = 0, almocaram = new Set();
  for (let i = 0; i < 1000; i++) { step(s, 0.25, live());
    const at = L.filter(o => trabalhando(s, o)).length, pa = L.filter(o => o.task?.type === 'pausa');
    for (const o of pa) almocaram.add(o.id);
    if (s.clock.min % 1440 > 12 * 60 + 5) minAtivos = Math.min(minAtivos, at); maxPausa = Math.max(maxPausa, pa.length); if (s.clock.min % 1440 > 15 * 60) break; }
  ok(almocaram.size === 6, `os 6 tratadores fizeram o almoço (${almocaram.size})`);
  ok(maxPausa <= 3, `no máximo metade em intervalo ao mesmo tempo (${maxPausa})`);
  ok(minAtivos >= MIN_SETOR, `sempre pelo menos 2 trabalhando (${minAtivos})`);
  const s2 = base(); const a = contrata(s2, 'seguranca', 'dia'), b = contrata(s2, 'seguranca', 'dia'); hora(s2, 11.95);
  let juntos = 0, fez = new Set(); for (let i = 0; i < 700; i++) { step(s2, 0.25, live()); const p = [a, b].filter(o => o.task?.type === 'pausa'); p.forEach(o => fez.add(o.id)); if (p.length === 2) juntos++; }
  ok(!juntos && fez.size === 2, 'com 2 do setor, um almoça de cada vez');
}

// ---- Centro de cuidados: 8 lugares, entram no prédio ----
{
  const s = base(); placeFacility(s, 'centro', 40, 40); const f = s.facilities.find(f => f.type === 'centro');
  const L = Array.from({ length: 10 }, () => contrata(s, 'faxineiro', 'dia'));
  for (const o of L) { o.energy = 0.05; o.task = null; }
  run(s, 6); run(s, 3000, live(), () => L.filter(o => o.dentro).length >= 8);
  ok(ocupacaoCentro(s, f) <= CAP_CENTRO && L.filter(o => o.dentro).length === 8, `8 descansam dentro do Centro (${L.filter(o => o.dentro).length})`);
  ok(L.filter(o => DESCANSO_FORA(o)).length >= 1, 'quem não coube descansa fora (banco perto da entrada)');
}
function DESCANSO_FORA(o) { return ['rest', 'pausa'].includes(o.task?.type) && !o.task.centro; }

// ---- hora extra: alerta sem ninguém de turno ----
{
  const s = base(); const h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro').hab; buyAnimal(s, 'zebra', 30, 30);
  const sg = contrata(s, 'seguranca', 'dia'); hora(s, 23); sg.task = null; sg.fora = true; sg.x = 0; sg.z = 0;
  h.fenceHp = 0.2; refreshAlerts(s); const al = s.alerts.find(a => a.type === 'cerca');
  const el = eligibleStaff(s, al); ok(el.length === 1 && el[0].folga, 'o menu do alerta mostra quem está de folga (hora extra)');
  ok(dispatch(s, al.id, sg.id) && sg.extra && sg.chegaEm > s.clock.min, 'chamado: vem pela rua (~20 min de jogo)');
  const pend0 = s.fin.pendente.salarios; let g = 0; while ((sg.extra || sg.task) && g++ < 6000) step(s, 0.25, live());
  ok(!sg.extra && s.fin.pendente.salarios > pend0, 'consertou e recebeu a hora extra (no fechamento do mês)');
  ok(h.fenceHp > 0.9, 'a cerca foi consertada');
  run(s, 300); ok(sg.fora || sg.task?.type === 'casa' || emServico(s, sg), 'depois da hora extra volta para casa (ou já começou o turno dele)');
}

// ---- app fechado: o subgerente chama hora extra; o parque segue com turnos ----
{
  const s = base(); const h = placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro').hab; for (let i = 0; i < 3; i++) buyAnimal(s, 'zebra', 30, 30);
  const tr = [contrata(s, 'tratador', 'dia'), contrata(s, 'tratador', 'dia'), contrata(s, 'tratador', 'noite')];
  const sg = contrata(s, 'seguranca', 'dia'); contrata(s, 'veterinario', 'dia');
  let c; do { c = genCandidate(s, now); } while (c.role !== 'subgerente'); s.candidates.push(c); hire(s, c.id);
  const r = simulateAbstract(s, 2 * 1440, { now });
  ok(r && s.animals.every(a => a.hunger < 0.9), 'app fechado por 2 dias de jogo: animais alimentados com os turnos');
  ok(tr.some(o => o.turno === 'noite') && s.staff.every(o => !o.task || o.task.type !== 'casa' || !emServico(s, o)), 'ninguém de turno fica preso indo para casa');
  void h; void sg;
}

// ---- cobertura e sugestão de turno ----
{
  const s = base(); contrata(s, 'tratador', 'dia'); contrata(s, 'tratador', 'dia');
  const cv = cobertura(s); ok(cv.some(x => x.role === 'tratador' && x.faixa === '22h–6h' && x.n === 0), 'aviso: nenhum tratador das 22h às 6h');
  ok(turnoSugerido(s, 'tratador') === 'noite' && turnoSugerido(s, 'faxineiro') === 'dia', 'currículo sugere o turno que falta no setor');
}

// ---- migração 9 -> 10 ----
{
  const s = base(); s.areaLevel = 1;
  const L = [1, 2, 3, 4, 5].map(() => contrata(s, 'tratador', 'dia')); contrata(s, 'faxineiro', 'dia'); const v = [contrata(s, 'veterinario', 'dia'), contrata(s, 'veterinario', 'dia')];
  const hs = placeHabitat(s, 26, 46, 33, 51, 'savana', 'muro').hab;  // dentro
  const o = JSON.parse(JSON.stringify(serialize(s)));
  o.schemaVersion = 9; for (const st of o.staff) { delete st.turno; delete st.adic; }
  // coisas abaixo do portão (área 1 antiga ia até a linha 57)
  o.facilities.push({ id: 9001, type: 'lanchonete', tx: 40, ty: 54, dir: 0, pack: 'base', dirty: 0 });
  o.terrain = o.terrain.split(''); for (let x = 30; x < 40; x++) o.terrain[56 * 72 + x] = 'p'; o.terrain = o.terrain.join('');
  const hab2 = JSON.parse(JSON.stringify(o.habitats[0])); hab2.id = 9002; hab2.name = 'Sul'; hab2.cells = []; for (let y = 50; y <= 56; y++) for (let x = 40; x <= 46; x++) hab2.cells.push(y * 72 + x);
  hab2.gateIn = [43, 50]; hab2.gateOut = [43, 49]; hab2.feed = [41, 51]; hab2.water = [45, 51]; hab2.x = 40; hab2.y = 50; hab2.w = 7; hab2.h = 7; o.habitats.push(hab2);
  const an = JSON.parse(JSON.stringify(o.animals[0] || { id: 9003, sp: 'zebra', name: 'Z', x: 0, z: 0, hab: 9002 })); an.id = 9003; an.hab = 9002; o.animals = [...o.animals, an];
  const m0 = o.money;
  const m = deserialize(o);
  ok(m.schemaVersion >= 10 && typeof MIGRATIONS[9] === 'function', 'migração 9 → 10');
  const T = m.staff.filter(x => x.role === 'tratador'); ok(T.filter(x => x.turno === 'noite').length === 2 && T.filter(x => x.turno === 'dia').length === 3 && T.every(x => x.adic === 1), '5 tratadores: 3 dia e 2 noite, salário atual');
  ok(m.staff.filter(x => x.role === 'veterinario').map(x => x.turno).sort().join() === 'dia,noite' && m.staff.find(x => x.role === 'faxineiro').turno === 'dia', '2 veterinários: 1 dia e 1 noite; faxineiro no dia');
  ok(!m.facilities.some(f => f.id === 9001) && !m.terrain.slice(52 * 72).some(t => t === 'p'), 'lanchonete e caminho abaixo do portão saíram');
  const sul = m.habitats.find(h => h.id === 9002); ok(sul && sul.cells.every(i => ((i / 72) | 0) < 52) && sul.cells.length >= 12, 'habitat que cruza a linha foi cortado nela');
  ok(m.money > m0 + 2000, `dinheiro devolvido (R$ ${Math.round(m.money - m0)})`);
  ok(m.animals.some(a => a.id === 9003), 'animal do habitat cortado continua');
  void L; void v; void hs;
}

// ---- rua da frente: ônibus, estacionamento e famílias ----
{
  const s = base(); placeHabitat(s, 26, 26, 37, 34, 'savana', 'muro'); buyAnimal(s, 'zebra', 30, 30); hora(s, 10);
  const r0 = arrivalRate(s); placeFacility(s, 'estacionamento', 10, 62); const f = s.facilities.find(f => f.type === 'estacionamento');
  ok(f && f.dir === 2 && fatorChegada(s) === 1.15 && arrivalRate(s) > r0, 'estacionamento traz mais visitantes (+15%)');
  const m0 = s.stats.today.inc.estacionamento || 0;
  for (let i = 0; i < 60; i++) arrive(s, live());
  ok((s.stats.today.inc.estacionamento || 0) > m0, 'estacionamento cobra por carro');
  ok(s.visitors.some(v => v.origem?.tipo === 'carro') && s.visitors.some(v => v.kid) && (s._fila || []).length > 0, 'chegam de carro, a pé e de ônibus; parte com criança');
  const naRua = s.visitors.filter(v => v.rua); ok(naRua.length && naRua.every(v => worldToTile(v.x, v.z).ty >= RUA.muro), 'quem chega começa na rua (calçada ou estacionamento)');
  s.rua.proxOnibus = 0; let viu = false, pk = 0; for (let i = 0; i < 3000 && !viu; i++) { step(s, 0.01, live()); if (s._bus?.fase === 'parado') pk++; if (pk && !(s._fila || []).length) viu = true; }
  ok(viu, 'o ônibus para no ponto e desce quem estava esperando');
  let entrou = 0; for (let i = 0; i < 4000; i++) { updateVisitors(s, 0.01, live()); if (s.visitors.some(v => !v.rua && worldToTile(v.x, v.z).ty < RUA.muro - 1)) { entrou = 1; break; } }
  ok(entrou, 'os visitantes atravessam o portão e entram no zoo');
}
{
  const s = base(); hora(s, 10); placeFacility(s, 'banheiro', 36, 40); const fam = placeFacility(s, 'banheiro_familiar', 30, 38);
  ok(fam.ok, 'banheiro familiar ao lado do caminho');
  const C = content(s); ok(C.facilities.banheiro_familiar.comportamento === 'banheiro', 'conta como banheiro para o faxineiro e os visitantes');
}

ok(CHANGELOG.some(c => c.versao === '1.7.3' && c.itens.length >= 5) && APP_VERSION >= '1.7.3', 'versão 1.7.3 com novidades no CHANGELOG');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.7.3 PASSARAM (${n})`); process.exit(fails ? 1 : 0);
