// Tocas com vidro (1.7.2b): abrigo 2 x 2 blocos dentro do habitat. O vidro fica no lado "dir" (para o visitante ver o
// animal lá dentro) e a entrada do animal fica no lado "porta". dir/porta: 0 sul (+z), 1 leste (+x), 2 norte, 3 oeste.
import { content } from '../content/registry.js';
import { TILE, HALF, MAP, idx, inMap } from './grid.js';

export const TOCA_W = 2, TOCA_MAX = 6; // blocos de lado; máximo por habitat
export const DIRV = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export const tocasDe = (s, hid) => (s.tocas || []).filter(t => t.hab === hid);
export const tocaById = (s, id) => (id == null ? null : (s.tocas || []).find(t => t.id === id) || null);
export const tocaCells = t => [[t.tx, t.ty], [t.tx + 1, t.ty], [t.tx, t.ty + 1], [t.tx + 1, t.ty + 1]];
export const tocaCenter = t => ({ x: (t.tx + 1) * TILE - HALF, z: (t.ty + 1) * TILE - HALF });
// os 2 blocos encostados num lado da toca
export function ladoTiles(t, dir) {
  if (dir === 0) return [[t.tx, t.ty + 2], [t.tx + 1, t.ty + 2]];
  if (dir === 1) return [[t.tx + 2, t.ty], [t.tx + 2, t.ty + 1]];
  if (dir === 2) return [[t.tx, t.ty - 1], [t.tx + 1, t.ty - 1]];
  return [[t.tx - 1, t.ty], [t.tx - 1, t.ty + 1]];
}
// ponto do lado de fora da entrada, a "folga" metros da parede
export function portaPonto(t, folga = 1) { const c = tocaCenter(t), [dx, dz] = DIRV[t.porta ?? ((t.dir + 2) % 4)]; return { x: c.x + dx * (TILE + folga), z: c.z + dz * (TILE + folga) }; }
// quantos animais cabem: os bem grandes (raio >= 1,1 m) e os altos (girafa) ficam sozinhos; os demais dividem em dupla
export function tocaVagas(s, sp) { const S = content(s).species[sp], r = S?.raio ?? RAIO_REF[sp] ?? 0.7; return r >= 1.1 || S?.alto ? 1 : 2; }
const RAIO_REF = { elefante: 1.4, hipopotamo: 1.2, rinoceronte: 1.2, girafa: 0.9 };
// lugar de cada animal lá dentro (lado a lado, paralelos ao vidro)
export function tocaLugar(t, slot, vagas) {
  const c = tocaCenter(t); if (vagas < 2) return c;
  const [dx, dz] = DIRV[t.dir], k = slot ? 0.85 : -0.85; return { x: c.x - dz * k, z: c.z + dx * k };
}
export const ocupantes = (s, t) => s.animals.filter(a => a.toca === t.id);
// modelo que combina com o bioma do habitat
export function modeloDoBioma(s, bioma) {
  const M = content(s).estruturas?.toca?.modelos || {};
  return Object.keys(M).find(k => M[k].biomas?.includes(bioma)) || Object.keys(M)[0] || 'pedra';
}
// altura do abrigo: mais alto quando o habitat tem um animal muito alto (girafa)
export function tocaAltura(s, t) {
  const C = content(s); let alto = false;
  for (const a of s.animals) if (a.hab === t.hab && (C.species[a.sp]?.alto || a.sp === 'girafa')) { alto = true; break; }
  return alto ? 4.6 : 3.6;
}
export const tocaEm = (s, tx, ty) => { const id = inMap(tx, ty) && s._occ?.toca ? s._occ.toca[idx(tx, ty)] : 0; return id ? tocaById(s, id) : null; };
export { MAP };
