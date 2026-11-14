// 1.8: carreira da equipe: experiência e níveis, cursos (feitos na folga), pedidos de aumento,
// entrevista do currículo, período de experiência e rescisão.
import { content } from '../content/registry.js';
import { TRACOS_EQUIPE, TRACOS_GERENTE } from '../content/base.js';
import { clamp, rnd, log } from './util.js';
import { salarioDia, turnoDe } from './turnos.js';

export const DIA = 1440;
// vel = rapidez do serviço (subgerente: despacha mais rápido); sal = salário esperado em relação ao Júnior
export const NIVEIS = [
  { nome: 'Júnior', xp: 0, vel: 1, sal: 1 },
  { nome: 'Pleno', xp: 12, vel: 1.08, sal: 1.12 },
  { nome: 'Sênior', xp: 40, vel: 1.16, sal: 1.26 },
  { nome: 'Especialista', xp: 100, vel: 1.25, sal: 1.45 },
];
export const XP_DIA = { equipe: 1, subgerente: 2 }; // tempo de casa (por dia de jogo); o serviço feito soma 1 por hora trabalhada
export const EXP_DIAS = 3;        // período de experiência: dispensa sem custo
export const REVELA_DIAS = 1;     // sem entrevista, o traço aparece depois de 1 dia de trabalho
export const RESCISAO_DIAS = 5;   // demitir um efetivo custa 5 dias de salário
export const ENTREVISTA = 300;
export const PEDIDO_ESPERA = 3 * DIA;  // sem resposta em 3 dias de jogo = recusa
export const PEDIDO_INTERVALO = 4 * DIA; // tempo mínimo entre dois pedidos da mesma pessoa
export const ATTR_MAX = 5;

// cursos: attr = +1 estrela; traco = ganha o traço bom; reciclagem = perde um traço ruim
export const CURSOS = {
  tecnica: { nome: 'Técnicas da função', desc: '+1 estrela de Habilidade.', dias: 3, custo: 1500, attr: 'habilidade' },
  agilidade: { nome: 'Agilidade no atendimento', desc: '+1 estrela de Rapidez.', dias: 3, custo: 1200, attr: 'rapidez' },
  postura: { nome: 'Postura profissional', desc: '+1 estrela de Dedicação (cansa menos).', dias: 3, custo: 1200, attr: 'dedicacao' },
  manejo: { nome: 'Manejo seguro', desc: 'Ganha o traço Cuidadoso: não esquece portão aberto e corre menos risco com animais perigosos.', dias: 4, custo: 2500, traco: 'cuidadoso', roles: ['tratador', 'veterinario', 'seguranca'] },
  socorros: { nome: 'Primeiros socorros', desc: 'Ganha o traço Socorrista: se for ferido, volta ao trabalho na metade do tempo.', dias: 4, custo: 2000, traco: 'socorrista' },
  condicionamento: { nome: 'Condicionamento físico', desc: 'Ganha o traço Resistente: cansa menos.', dias: 4, custo: 2000, traco: 'resistente' },
  reciclagem: { nome: 'Reciclagem', desc: 'Corrige um traço ruim.', dias: 5, custo: 3000, reciclagem: true },
  g_decisao: { nome: 'Tomada de decisão', desc: '+1 estrela de Decisão.', dias: 3, custo: 2500, attr: 'decisao', gerente: true },
  g_crise: { nome: 'Gestão de crises', desc: '+1 estrela de Rapidez.', dias: 3, custo: 2500, attr: 'rapidez', gerente: true },
  g_financas: { nome: 'Finanças', desc: '+1 estrela de Economia.', dias: 3, custo: 2500, attr: 'economia', gerente: true },
  g_reciclagem: { nome: 'Reciclagem', desc: 'Corrige um traço ruim.', dias: 5, custo: 4000, reciclagem: true, gerente: true },
};

const todos = s => [...s.staff, ...s.managers];
export const pessoa = (s, id) => todos(s).find(x => x.id === id);
const ehGerente = p => p.role === 'subgerente';
export const tracosDe = p => (ehGerente(p) ? TRACOS_GERENTE : TRACOS_EQUIPE);
const r5 = v => Math.round(v / 5) * 5;
const gastar = (s, v) => { s.money -= v; s.stats.today.exp.treinamento = (s.stats.today.exp.treinamento || 0) + v; };

// campos novos com valores seguros (contratação, migração e saves antigos)
export function prepara(p, agora = 0) {
  p.xp ??= 0; p.nivel ??= 0; p.desde ??= agora; p.exp ??= 0; p.oculto ??= false;
  p.curso ??= null; p.cursos ??= []; p.pedido ??= null; p.recusas ??= 0; p.ultPedido ??= agora;
  return p;
}

// ---------- níveis ----------
export const nivelDe = p => NIVEIS[clamp(p.nivel || 0, 0, NIVEIS.length - 1)];
export const velNivel = p => nivelDe(p).vel;
export const nivelPorXp = xp => { let n = 0; for (let i = 0; i < NIVEIS.length; i++) if (xp >= NIVEIS[i].xp) n = i; return n; };
export function ganhaXp(s, p, v) {
  if (!p || !(v > 0)) return;
  p.xp = (p.xp || 0) + v;
  while ((p.nivel || 0) < NIVEIS.length - 1 && p.xp >= NIVEIS[(p.nivel || 0) + 1].xp) {
    const a = NIVEIS[p.nivel || 0], b = NIVEIS[(p.nivel || 0) + 1];
    p.nivel = (p.nivel || 0) + 1; p.expected = r5(p.expected * b.sal / a.sal);
    log(s, `${p.name} subiu para ${b.nome}: serviço ${Math.round((b.vel - 1) * 100)}% mais rápido. Salário esperado agora: R$ ${p.expected}/dia.`, 'bom');
  }
}
export function progresso(p) {
  const n = p.nivel || 0, prox = NIVEIS[n + 1];
  return prox ? { nome: NIVEIS[n].nome, prox: prox.nome, falta: Math.max(0, prox.xp - (p.xp || 0)), frac: clamp(((p.xp || 0) - NIVEIS[n].xp) / (prox.xp - NIVEIS[n].xp)) } : { nome: NIVEIS[n].nome, prox: null, falta: 0, frac: 1 };
}

// ---------- entrevista, experiência e rescisão ----------
export function entrevistar(s, candId) {
  const c = s.candidates.find(c => c.id === candId); if (!c) return { ok: false, msg: 'Candidato não encontrado.' };
  if (c.entrev) return { ok: true, tracos: c.hidden };
  if (s.money < ENTREVISTA) return { ok: false, msg: 'Dinheiro insuficiente para a entrevista.' };
  gastar(s, ENTREVISTA); c.entrev = true;
  return { ok: true, tracos: c.hidden };
}
export const emExperiencia = (s, p) => !!p.exp && s.clock.min < p.exp;
export const rescisao = (s, p) => (emExperiencia(s, p) ? 0 : RESCISAO_DIAS * salarioDia(p));
// demissão pelo jogador: sem custo na experiência; depois, rescisão de 5 dias de salário
export function demitir(s, id, fire) {
  const p = pessoa(s, id); if (!p) return { ok: false, msg: 'Funcionário não encontrado.' };
  const v = rescisao(s, p);
  if (v) { s.money -= v; s.stats.today.exp.salarios = (s.stats.today.exp.salarios || 0) + v; }
  fire(s, id);
  log(s, v ? `${p.name} foi demitido(a). Rescisão: R$ ${v.toLocaleString('pt-BR')}.` : `${p.name} foi dispensado(a) no período de experiência, sem custo.`, 'info');
  return { ok: true, custo: v };
}

// ---------- cursos ----------
export const duracaoCurso = (p, K) => Math.round(K.dias * (!ehGerente(p) && turnoDe(p) === 'integral' ? 1.5 : 1) * 10) / 10; // integral tem menos folga: demora mais
export function cursosPara(s, p) {
  const T = tracosDe(p), out = [];
  for (const [id, K] of Object.entries(CURSOS)) {
    if (!!K.gerente !== ehGerente(p)) continue;
    if (K.roles && !K.roles.includes(p.role)) continue;
    let motivo = null;
    if (K.attr && (p.attrs[K.attr] ?? 0) >= ATTR_MAX) motivo = 'Já tem 5 estrelas';
    if (K.traco && p.traits.includes(K.traco)) motivo = 'Já tem este traço';
    if (K.reciclagem && (p.oculto || !p.traits.some(t => T[t] && !T[t].bom))) { if (!p.oculto) continue; motivo = 'Traços ainda não conhecidos'; }
    out.push({ id, ...K, dias: duracaoCurso(p, K), motivo });
  }
  return out;
}
export function matricular(s, id, cursoId) {
  const p = pessoa(s, id), K = CURSOS[cursoId]; if (!p || !K) return { ok: false, msg: 'Curso não encontrado.' };
  if (p.curso) return { ok: false, msg: `${p.name} já está fazendo um curso.` };
  if (emExperiencia(s, p)) return { ok: false, msg: 'Só depois do período de experiência.' };
  const op = cursosPara(s, p).find(c => c.id === cursoId); if (!op) return { ok: false, msg: 'Este curso não serve para esta função.' };
  if (op.motivo) return { ok: false, msg: op.motivo + '.' };
  if (s.money < K.custo) return { ok: false, msg: 'Dinheiro insuficiente.' };
  gastar(s, K.custo);
  p.curso = { id: cursoId, ini: s.clock.min, fim: s.clock.min + op.dias * DIA };
  log(s, `${p.name} começou o curso "${K.nome}" (${String(op.dias).replace('.', ',')} dias de jogo, estudando na folga).`, 'info');
  return { ok: true };
}
function concluiCurso(s, p) {
  const K = CURSOS[p.curso.id], T = tracosDe(p); p.curso = null; if (!K) return;
  p.cursos.push(K.nome); let txt = '';
  if (K.attr) { p.attrs[K.attr] = Math.min(ATTR_MAX, (p.attrs[K.attr] || 0) + 1); txt = K.desc; }
  if (K.traco && !p.traits.includes(K.traco)) { p.traits = [...p.traits, K.traco]; txt = `Novo traço: ${T[K.traco]?.nome || K.traco}.`; }
  if (K.reciclagem) { const ruim = p.traits.find(t => T[t] && !T[t].bom); if (ruim) { p.traits = p.traits.filter(t => t !== ruim); txt = `Deixou de ser ${T[ruim].nome}.`; } else txt = 'Não havia traço ruim para corrigir.'; }
  ganhaXp(s, p, 2);
  log(s, `${p.name} concluiu o curso "${K.nome}". ${txt}`, 'bom');
}

// ---------- pedidos de aumento ----------
export const pedidos = s => todos(s).filter(p => p.pedido);
const querAumento = (s, p) => !p.pedido && !emExperiencia(s, p) && p.salary < p.expected * 0.95 && s.clock.min - (p.ultPedido || 0) >= PEDIDO_INTERVALO;
function fazPedido(s, p) {
  const valor = Math.max(p.salary + 5, r5(p.expected));
  p.pedido = { valor, desde: s.clock.min, negociou: false };
  log(s, `${p.name} pediu aumento: de R$ ${p.salary} para R$ ${valor}/dia. Responda em Equipe.`, 'ruim');
}
function fecha(p, s) { p.pedido = null; p.ultPedido = s.clock.min; }
export function aceitarPedido(s, id, por) {
  const p = pessoa(s, id); if (!p?.pedido) return { ok: false, msg: 'Não há pedido.' };
  p.salary = p.pedido.valor; p.sat = clamp(p.sat + 0.15); p.recusas = 0; fecha(p, s);
  log(s, `${por ? por + ' aceitou' : 'Você aceitou'} o aumento de ${p.name}: R$ ${p.salary}/dia.`, 'bom');
  return { ok: true };
}
// contraproposta: metade do aumento. Aceita mais fácil quem é dedicado e está satisfeito; reclamão aceita menos
export function negociarPedido(s, id, por) {
  const p = pessoa(s, id); if (!p?.pedido) return { ok: false, msg: 'Não há pedido.' };
  if (p.pedido.negociou) return { ok: false, msg: `${p.name} já recusou a contraproposta. Aceite ou recuse o pedido.` };
  const meio = Math.max(p.salary + 5, r5((p.salary + p.pedido.valor) / 2));
  const chance = clamp(0.3 + 0.08 * (p.attrs.dedicacao ?? p.attrs.decisao ?? 3) + 0.3 * (p.sat - 0.5) - (p.traits.includes('reclamao') ? 0.25 : 0), 0.1, 0.9);
  if (rnd(s) < chance) {
    p.salary = meio; p.sat = clamp(p.sat + 0.05); fecha(p, s);
    log(s, `${p.name} aceitou a contraproposta${por ? ' de ' + por : ''}: R$ ${meio}/dia.`, 'bom');
    return { ok: true, aceitou: true, valor: meio };
  }
  p.pedido.negociou = true; p.sat = clamp(p.sat - 0.05);
  log(s, `${p.name} não aceitou a contraproposta de R$ ${meio}/dia e mantém o pedido de R$ ${p.pedido.valor}/dia.`, 'ruim');
  return { ok: true, aceitou: false, valor: meio };
}
export function recusarPedido(s, id, semResposta) {
  const p = pessoa(s, id); if (!p?.pedido) return { ok: false, msg: 'Não há pedido.' };
  p.sat = clamp(p.sat - 0.2); p.recusas = (p.recusas || 0) + 1; fecha(p, s);
  log(s, semResposta ? `O pedido de aumento de ${p.name} ficou sem resposta e contou como recusa.` : `Você recusou o aumento de ${p.name}. A satisfação caiu.`, 'ruim');
  return { ok: true };
}
// aumento ou corte manual na ficha: aumento anima; se cobrir o pedido, ele é atendido
export function ajustaSalario(s, id, fator) {
  const p = pessoa(s, id); if (!p) return;
  const antes = p.salary; p.salary = Math.max(30, r5(p.salary * fator));
  if (p.salary > antes) { p.sat = clamp(p.sat + 0.06); if (p.salary >= p.expected * 0.95) p.recusas = 0; } else if (p.salary < antes) p.sat = clamp(p.sat - 0.12);
  if (p.pedido && p.salary >= p.pedido.valor) { p.recusas = 0; fecha(p, s); log(s, `O aumento de ${p.name} atendeu o pedido: R$ ${p.salary}/dia.`, 'bom'); }
}
// com o app fechado, o subgerente responde os pedidos da equipe (os dos próprios subgerentes esperam você)
export function gerentePedidos(s) {
  const m = s.managers[0]; if (!m) return;
  for (const p of s.staff) {
    if (!p.pedido || s.clock.min - p.pedido.desde < 120) continue;
    const folgado = s.money > 20 * todos(s).reduce((t, x) => t + salarioDia(x), 0);
    if (m.traits.includes('perdulario') || (folgado && !m.traits.includes('economico'))) aceitarPedido(s, p.id, m.name);
    else if (!p.pedido.negociou) negociarPedido(s, p.id, m.name);
    else if (folgado) aceitarPedido(s, p.id, m.name);
  }
}

// ---------- relógio ----------
export function carreiraHora(s, ctx) {
  for (const p of todos(s)) {
    prepara(p, s.clock.min);
    if (p.oculto && s.clock.min >= p.desde + REVELA_DIAS * DIA) {
      p.oculto = false; const T = tracosDe(p);
      if (p.traits.length) { const t = T[p.traits[0]]; log(s, `Depois de 1 dia de trabalho, ${p.name} mostrou um traço: ${t?.nome || p.traits[0]}.${emExperiencia(s, p) ? ' Ainda está em experiência (dispensa sem custo).' : ''}`, t?.bom ? 'bom' : 'ruim'); }
      else log(s, `Depois de 1 dia de trabalho, ${p.name} não mostrou nenhum traço especial.`, 'info');
    }
    if (p.exp && s.clock.min >= p.exp) { p.exp = 0; log(s, `${p.name} terminou o período de experiência e foi efetivado(a).`, 'info'); }
    if (p.curso && s.clock.min >= p.curso.fim) concluiCurso(s, p);
    // pedido sem resposta: só conta com o jogo aberto (com o app fechado, quem responde é o subgerente)
    if (p.pedido && !ctx?.abstract && s.clock.min - p.pedido.desde >= PEDIDO_ESPERA) recusarPedido(s, p.id, true);
  }
}
export function carreiraDia(s) {
  let novo = false;
  for (const p of todos(s)) {
    ganhaXp(s, p, ehGerente(p) ? XP_DIA.subgerente : XP_DIA.equipe);
    if (!novo && querAumento(s, p)) { fazPedido(s, p); novo = true; } // no máximo 1 pedido novo por dia
  }
}
// pedido de demissão depois de aumento recusado (além da regra antiga de satisfação muito baixa)
export const querSair = (s, p) => (p.recusas || 0) >= 2;
// cada recusa deixa uma mágoa que segura a satisfação lá embaixo até vir um aumento
export const magoa = p => Math.min(0.3, 0.1 * (p.recusas || 0));

// migração (save 10 -> 11): quem já estava no zoo vira efetivo, com experiência pelo tempo de jogo; salário esperado não muda
export function migrarCarreira(s) {
  const agora = s.clock?.min || 0, dias = Math.floor(agora / DIA);
  for (const p of [...(s.staff || []), ...(s.managers || [])]) {
    p.xp = Math.min(NIVEIS[2].xp - 1, Math.round(dias * 1.5)); p.nivel = nivelPorXp(p.xp);
    p.desde = agora - EXP_DIAS * DIA; p.exp = 0; p.oculto = false; p.curso = null; p.cursos = []; p.pedido = null; p.recusas = 0;
    p.ultPedido = agora - (p.id % 4) * (DIA / 2); // os primeiros pedidos chegam espalhados
  }
  for (const c of s.candidates || []) c.entrev = false;
}
export { content };
