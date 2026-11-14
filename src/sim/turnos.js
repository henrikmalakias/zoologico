// 1.7.3: turnos fixos, intervalos escalonados, folga em casa (pela rua), hora extra e Centro de cuidados com lugares.
import { content } from '../content/registry.js';
import { clamp, log } from './util.js';
import { tileToWorld, RUA, accessTile } from './grid.js';

// horários em horas do relógio do jogo; pausas: [hora, duração em min de jogo, nome]
export const TURNOS = {
  dia: { nome: 'Dia', ini: 6, fim: 18, horas: 12, mult: 1, pausas: [[9, 15, 'Café da manhã'], [12, 60, 'Almoço'], [15.5, 15, 'Café da tarde']] },
  noite: { nome: 'Noite', ini: 18, fim: 6, horas: 12, mult: 1.25, pausas: [[21, 60, 'Jantar'], [2, 15, 'Café da madrugada']] },
  integral: { nome: 'Integral', ini: 6, fim: 22, horas: 16, mult: 1.4, cansa: 1.3, pausas: [[9, 15, 'Café da manhã'], [12, 60, 'Almoço'], [15.5, 15, 'Café da tarde'], [18.5, 30, 'Jantar']] },
};
export const NOITE_ROLES = new Set(['tratador', 'veterinario', 'seguranca']);
export const SETORES = ['tratador', 'veterinario', 'faxineiro', 'seguranca'];
export const MIN_SETOR = 2;          // o mínimo de cada setor trabalhando enquanto os outros fazem intervalo
export const ANTES = 15;             // chegam 15 min de jogo antes do turno
export const VOLTA_EXTRA = 20;       // quem está em casa leva ~20 min de jogo para chegar quando é chamado para hora extra
export const EXTRA_MULT = 1.5;
export const CAP_CENTRO = 8;
export const DESCANSO = new Set(['rest', 'pausa', 'ferido']);

export const turnoDe = st => (TURNOS[st.turno] ? st.turno : 'dia');
export const salarioDia = p => Math.round(p.salary * (p.role === 'subgerente' ? 1 : (p.adic ?? 1)));
const hf = s => (((s.clock.min % 1440) + 1440) % 1440) / 60;
const dentroFaixa = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);
export const deTurnoNaHora = (turno, h) => { const T = TURNOS[turno]; return dentroFaixa(h, T.ini, T.fim); };
// de turno (com a chegada 15 min antes)
export function emServico(s, st) {
  if (st.role === 'subgerente') return true;
  const T = TURNOS[turnoDe(st)], h = hf(s);
  return dentroFaixa(h, (T.ini - ANTES / 60 + 24) % 24, T.fim);
}
export const deTurno = (s, st) => st.role === 'subgerente' || deTurnoNaHora(turnoDe(st), hf(s));
// minuto absoluto em que começou o turno atual (ou o último, se está de folga)
export function inicioTurno(s, st) {
  const T = TURNOS[turnoDe(st)], dia = Math.floor(s.clock.min / 1440) * 1440, h = hf(s);
  let a = dia + T.ini * 60; if (h < T.ini - ANTES / 60) a -= 1440;
  return a;
}
export function fimTurno(s, st) { const T = TURNOS[turnoDe(st)]; return inicioTurno(s, st) + T.horas * 60; }
export function proximoTurno(s, st) { const a = inicioTurno(s, st); return s.clock.min < a ? a : a + 1440; }
const fmtH = h => { const x = ((h % 24) + 24) % 24, m = Math.round((x % 1) * 60); return `${Math.floor(x)}h${m ? String(m).padStart(2, '0') : ''}`; };
export const horarioTxt = turno => { const T = TURNOS[turno]; return `${fmtH(T.ini)}–${fmtH(T.fim)}`; };
export const pausasTxt = turno => TURNOS[turno].pausas.map(([h, d, n]) => `${n} ${fmtH(h)} (${d < 60 ? d + ' min' : d / 60 + ' h'})`).join(' · ');
export const horaTxt = min => fmtH(((min % 1440) + 1440) % 1440 / 60);

// quem está de fato trabalhando agora (para a regra do mínimo por setor)
export const trabalhando = (s, st) => !st.ferido && !st.fora && (deTurno(s, st) || st.extra) && !(st.task && (DESCANSO.has(st.task.type) || st.task.type === 'casa'));

// próximo intervalo devido (ou null); respeita o mínimo de cada setor trabalhando e no máximo metade fora ao mesmo tempo
export function pausaDevida(s, st) {
  if (st.role === 'subgerente' || !deTurno(s, st)) return null;
  const T = TURNOS[turnoDe(st)], a = inicioTurno(s, st), fim = a + T.horas * 60;
  // contratado (ou atualizado) no meio do turno: os intervalos que já passaram não contam
  if (!st.pausas) st.pausas = { turno: a, feitas: T.pausas.map(([h], i) => (s.clock.min >= a + (((h - T.ini) % 24 + 24) % 24) * 60 ? i : -1)).filter(i => i >= 0) };
  if (st.pausas.turno !== a) st.pausas = { turno: a, feitas: [] };
  let due = null;
  T.pausas.forEach(([h, d, nome], i) => {
    if (due || st.pausas.feitas.includes(i)) return;
    const ini = a + (((h - T.ini) % 24 + 24) % 24) * 60;
    if (s.clock.min < ini) return;
    if (s.clock.min > ini + 120 || s.clock.min > fim - 10) { st.pausas.feitas.push(i); return; } // passou muito da hora: perde este intervalo
    due = { i, dur: d, nome };
  });
  if (!due) return null;
  const mesmos = s.staff.filter(o => o.role === st.role && !o.ferido && !o.fora && (deTurno(s, o) || o.extra));
  const n = mesmos.length, ativos = mesmos.filter(o => trabalhando(s, o)).length;
  const manter = Math.max(Math.min(MIN_SETOR, n - 1), Math.floor(n / 2));
  return ativos - (trabalhando(s, st) ? 1 : 0) >= manter ? due : null;
}

// ---------- Centro de cuidados ----------
export const centros = s => s.facilities.filter(f => f.type === 'centro');
export const ocupacaoCentro = (s, f, exceto) => s.staff.filter(o => o !== exceto && o.task?.centro === f.id && DESCANSO.has(o.task.type)).length;
export function centroPara(s, st) {
  let best = null, bd = 1e9;
  for (const f of centros(s)) {
    if (ocupacaoCentro(s, f, st) >= CAP_CENTRO) continue;
    const p = tileToWorld(f.tx + 1, f.ty + 1), d = Math.hypot(p.x - st.x, p.z - st.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
export function portaCentro(s, f) { const t = accessTile(s, f) || [f.tx - 1, f.ty + 1]; return tileToWorld(t[0], t[1]); }
export const dentroDoCentro = s => s.staff.filter(o => o.dentro);

// ---------- rua: ponto de ônibus ----------
export const pontoOnibus = () => tileToWorld(RUA.ponto[0], RUA.ponto[1]);
export function vaiParaRua(s, st) { const p = pontoOnibus(); st.x = p.x; st.z = p.z; st.inHab = 0; st.veh = null; st.dentro = 0; }

// chamado fora do turno (hora extra): quem está em casa chega pela rua em ~20 min de jogo
export function chamar(s, st) {
  if (st.role === 'subgerente' || st.ferido) return;
  if (emServico(s, st) && !st.fora) return;
  if (!st.extra) st.extra = { ini: s.clock.min };
  if (st.fora && !st.chegaEm) { st.chegaEm = s.clock.min + VOLTA_EXTRA; vaiParaRua(s, st); }
}
export function pagarExtra(s, st) {
  if (!st.extra) return 0;
  const T = TURNOS[turnoDe(st)], h = Math.max(1, (s.clock.min - st.extra.ini) / 60);
  const v = Math.round((salarioDia(st) / T.horas) * EXTRA_MULT * h);
  s.fin ||= { pendente: { salarios: 0, manutencao: 0 }, meses: [], novo: null };
  s.fin.pendente.salarios += v; st.extra = null;
  log(s, `${st.name} fez ${h.toFixed(1).replace('.', ',')} h de hora extra (R$ ${v.toLocaleString('pt-BR')}, pago no fechamento do mês).`, 'info');
  return v;
}

export function trocarTurno(s, id, turno) {
  const st = s.staff.find(x => x.id === id); if (!st || !TURNOS[turno]) return { ok: false, msg: 'Turno inválido.' };
  if (turno === 'noite' && !NOITE_ROLES.has(st.role)) return { ok: false, msg: `${content(s).roles[st.role].nome} não tem turno da noite.` };
  if (st.turno === turno) return { ok: true };
  st.turno = turno; st.adic = TURNOS[turno].mult; st.pausas = null;
  log(s, `${st.name} passou para o turno ${TURNOS[turno].nome.toLowerCase()} (${horarioTxt(turno)}).`, 'info');
  return { ok: true };
}

// texto da situação do funcionário (ficha e lista da equipe)
export function situacao(s, st, taskName) {
  if (st.role === 'subgerente') return '';
  if (st.ferido) return 'Afastado (ferido)';
  if (st.fora && st.chegaEm) return `Hora extra: chegando pela rua (~${Math.max(1, Math.round(st.chegaEm - s.clock.min))} min)`;
  if (st.fora) return `De folga (volta às ${horaTxt(proximoTurno(s, st) - ANTES)})`;
  const t = st.task;
  if (t?.type === 'pausa') return `Intervalo: ${t.nome}${st.dentro ? ' (no Centro de cuidados)' : ''}`;
  if (t?.type === 'casa') return 'Fim do turno: indo para casa';
  return (st.extra ? 'Hora extra · ' : '') + taskName(t);
}

// cobertura de cada setor por faixa de horário (avisos com menos de 2)
export const FAIXAS = [['6h–18h', 'dia'], ['18h–22h', 'tarde'], ['22h–6h', 'madrugada']];
export function cobertura(s) {
  const out = [];
  for (const role of SETORES) {
    const L = s.staff.filter(o => o.role === role); if (!L.length) continue;
    const n = { dia: 0, tarde: 0, madrugada: 0 };
    for (const o of L) { const t = turnoDe(o); if (t === 'dia') n.dia++; else if (t === 'noite') { n.tarde++; n.madrugada++; } else { n.dia++; n.tarde++; } }
    const faixas = NOITE_ROLES.has(role) ? FAIXAS : FAIXAS.slice(0, 1);
    for (const [txt, k] of faixas) if (n[k] < MIN_SETOR) out.push({ role, faixa: txt, n: n[k] });
    out.push({ role, ok: true, n });
  }
  return out;
}
// turno sugerido para quem vai ser contratado: a faixa com menos gente do setor
export function turnoSugerido(s, role) {
  if (!NOITE_ROLES.has(role)) return 'dia';
  const L = s.staff.filter(o => o.role === role);
  const d = L.filter(o => turnoDe(o) !== 'noite').length, n = L.filter(o => turnoDe(o) === 'noite').length;
  return n < Math.min(d, MIN_SETOR) || (d >= MIN_SETOR && n < d) ? 'noite' : 'dia';
}

// migração (save 9 -> 10): divide cada setor entre dia e noite, mantendo o salário atual
export function distribuirTurnos(staff) {
  for (const role of SETORES) {
    const L = staff.filter(o => o.role === role).sort((a, b) => a.id - b.id), n = L.length;
    const noite = !NOITE_ROLES.has(role) ? 0 : n >= 4 ? Math.floor(n / 2) : n >= 2 ? 1 : 0;
    L.forEach((o, i) => { o.turno = i < n - noite ? 'dia' : 'noite'; o.adic = 1; o.pausas = null; });
  }
}
export { clamp };
