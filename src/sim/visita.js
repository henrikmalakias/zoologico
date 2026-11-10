// Visita aos recintos no AO VIVO e modo selvagem (1.7.2b): abrir/fechar a visita, preparar (tratador recolhe os
// animais perigosos nas tocas) e o resultado de um ataque. Nada aqui mexe na câmera: isso fica em controls.js/main.js.
import { content } from '../content/registry.js';
import { log } from './util.js';
import { tileToWorld, bridgeTiles } from './grid.js';
import { habById, perigoDe, soltarTocas, dentro, PERIGOSO } from './animals.js';
import { refreshAlerts, ordenarGuardar } from './staff.js';
import { tocasDe, tocaVagas, ocupantes } from './tocas.js';

export const temPonte = (s, h) => !!content(s).fences[h.fence]?.fosso;
// onde o jogador para do lado de fora para entrar (na ilha, o fim da ponte) e onde ele aparece lá dentro
export function pontoFora(s, h) { const b = temPonte(s, h) ? bridgeTiles(h) : []; const t = b.length ? b[b.length - 1] : h.gateOut; return tileToWorld(t[0], t[1]); }
export const pontoDentro = h => tileToWorld(h.gateIn[0], h.gateIn[1]);
export const perigosos = (s, h) => s.animals.filter(a => a.hab === h.id && !a.escaped && perigoDe(s, a) >= PERIGOSO);
export const emEspera = (s, h) => Math.max(0, Math.ceil((h.visitaAte || 0) - s.clock.min));

export function podeVisitar(s, h) {
  if (!h) return { ok: false, msg: 'Habitat não encontrado.' };
  if (emEspera(s, h) > 0) return { ok: false, msg: `Depois do susto, o ${h.name} fica fechado para visita por mais ${emEspera(s, h)} min de jogo.` };
  if (s.animals.some(a => a.hab === h.id && a.escaping)) return { ok: false, msg: 'Há um animal fugindo deste recinto agora.' };
  return { ok: true, msg: '' };
}
export function abrirVisita(s, h) {
  const c = podeVisitar(s, h); if (!c.ok) return c;
  for (const o of s.habitats) if (o !== h) o.visitOpen = false;
  h.visitOpen = true;
  return { ok: true, msg: `Você entrou no ${h.name}. Respeite os animais.`, soltos: perigosos(s, h).length };
}
export function fecharVisita(s, h) { if (!h) return; h.visitOpen = false; if (h.preparo) soltarTocas(s, h); }

// resultado do ataque: sem mortes; a visita acaba e o recinto fica 1 h de jogo fechado para visita
export function ataqueVisita(s, a, manso) {
  const h = habById(s, a.hab), S = content(s).species[a.sp]; if (!h) return null;
  s.player ||= { lesoes: 0 };
  if (!manso) { s.player.lesoes = (s.player.lesoes || 0) + 1; h.visitaRisco = s.clock.min + 120; }
  h.visitaAte = s.clock.min + 60; fecharVisita(s, h);
  const msg = manso ? `${a.name} (${S?.nome || '?'}) avançou e parou a 1 m de você. A visita acabou.` : `Você foi empurrado por ${a.name} (${S?.nome || '?'}). A visita acabou.`;
  log(s, manso ? `${a.name} ameaçou quem visitava o ${h.name}.` : `${a.name} avançou em quem visitava o ${h.name}. Ninguém morreu, mas foi um susto.`, 'info');
  if (!manso) refreshAlerts(s);
  return { hab: h, manso: !!manso, msg };
}

// vagas nas tocas para recolher os perigosos (cada toca só junta animais da mesma espécie)
export function vagasPreparo(s, h) {
  const lista = perigosos(s, h).filter(a => !a.preso), tocas = tocasDe(s, h.id).map(t => ({ t, oc: ocupantes(s, t).filter(b => b.preso || dentro(b)) }));
  let falta = 0;
  for (const a of lista) {
    if (a.toca != null && dentro(a)) continue;
    const vg = tocaVagas(s, a.sp), x = tocas.find(o => o.oc.length < vg && o.oc.every(b => b.sp === a.sp));
    if (x) x.oc.push(a); else falta++;
  }
  // tocas que ainda seriam necessárias (arredonda para cima pela vaga da espécie que sobrou)
  return { total: lista.length + s.animals.filter(a => a.hab === h.id && a.preso).length, falta };
}
export function prepararVisita(s, h) {
  const lista = perigosos(s, h).filter(a => !a.preso);
  const presos = s.animals.filter(a => a.hab === h.id && a.preso).length;
  if (!lista.length) { h.preparo = { total: presos, prontos: presos, ate: s.clock.min + 180 }; return { ok: true, msg: presos ? 'Os animais perigosos já estão recolhidos. Visita liberada.' : 'Nenhum animal perigoso solto aqui. Pode visitar.' }; }
  if (!tocasDe(s, h.id).length) return { ok: false, semToca: true, msg: 'Este habitat não tem toca. Construa uma em Construir > Habitat > Toca com vidro.' };
  const v = vagasPreparo(s, h);
  if (v.falta) return { ok: false, semToca: true, msg: `Faltam vagas nas tocas para ${v.falta} animal(is). Construa mais tocas (cada uma abriga 2 animais, ou 1 dos bem grandes).` };
  const livres = s.staff.filter(st => st.role === 'tratador').sort((x, y) => (x.task?.alertId ? 1 : 0) - (y.task?.alertId ? 1 : 0) || Math.hypot(x.x - lista[0].x, x.z - lista[0].z) - Math.hypot(y.x - lista[0].x, y.z - lista[0].z));
  if (!livres.length) return { ok: false, msg: 'Contrate um tratador para recolher os animais (Equipe > Currículos).' };
  h.preparo = { total: lista.length + presos, prontos: presos, ate: s.clock.min + 180 };
  let n = 0;
  for (const st of livres) { const a = lista[n]; if (!a) break; if (st.task?.alertId || st.task?.type === 'guardar') continue; if (ordenarGuardar(s, st, a.id)) n++; }
  if (!n) { h.preparo = null; return { ok: false, msg: 'Os tratadores estão ocupados com emergências. Tente de novo em instantes.' }; }
  log(s, `Preparando a visita ao ${h.name}: ${lista.length} animal(is) para recolher.`, 'info');
  return { ok: true, msg: `${n} tratador(es) a caminho para recolher ${lista.length} animal(is) nas tocas.` };
}
export const visitaLiberada = (s, h) => !!h.preparo && perigosos(s, h).length === 0;
