// Visita aos recintos no AO VIVO (1.7.2c: "fantasma"). O jogador entra e sai pelo portão (botão Entrar) e anda lá dentro
// sem atravessar cerca, toca, tronco nem água funda. Os animais o ignoram: não há aviso, ataque nem espera. O portão de
// verdade não abre (a visita nunca causa fuga). Nada aqui mexe na câmera: isso fica em controls.js/main.js.
import { content } from '../content/registry.js';
import { tileToWorld, bridgeTiles } from './grid.js';
import { perigosos } from './animals.js';

export const temPonte = (s, h) => !!content(s).fences[h.fence]?.fosso;
// onde o jogador para do lado de fora para entrar (na ilha, o fim da ponte) e onde ele aparece lá dentro
export function pontoFora(s, h) { const b = temPonte(s, h) ? bridgeTiles(h) : []; const t = b.length ? b[b.length - 1] : h.gateOut; return tileToWorld(t[0], t[1]); }
export const pontoDentro = h => tileToWorld(h.gateIn[0], h.gateIn[1]);
export { perigosos };

export function podeVisitar(s, h) {
  if (!h) return { ok: false, msg: 'Habitat não encontrado.' };
  if (s.animals.some(a => a.hab === h.id && a.escaping)) return { ok: false, msg: 'Há um animal fugindo deste recinto agora.' };
  return { ok: true, msg: '' };
}
export function abrirVisita(s, h) {
  const c = podeVisitar(s, h); if (!c.ok) return c;
  for (const o of s.habitats) if (o !== h) o.visitOpen = false;
  h.visitOpen = true; // só marca que o jogador está lá dentro (o portão não abre)
  return { ok: true, msg: `Você entrou no ${h.name} como observador: os animais não percebem você.` };
}
export function fecharVisita(s, h) { if (h) h.visitOpen = false; }
