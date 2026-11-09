// Formato livre dos habitats (1.7): cada habitat é um conjunto de blocos (h.cells, índices do mapa).
// h.x, h.y, h.w, h.h continuam existindo como caixa envolvente (recalculada por fitBox).
import { MAP, TILE, HALF, idx, inMap, tileToWorld, worldToTile } from './grid.js';

export const DIRS = { N: [0, -1], S: [0, 1], L: [1, 0], O: [-1, 0] };
export const rectCells = (x, y, w, h) => { const out = []; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) out.push(idx(i, j)); return out; };
const tx = i => i % MAP, ty = i => (i / MAP) | 0;

// ilhas (fosso) são sempre retangulares; o anel de 2 blocos é água
const isFosso = h => h.fence === 'fosso';
export function ensureCells(h) { if (!h.cells || !h.cells.length) h.cells = rectCells(h.x, h.y, h.w, h.h); return h.cells; }
export function touch(h) { h._cs = h._ws = h._edges = h._cc = h._obs = h._info = null; }
export function cellSet(h) { if (!h._cs) h._cs = new Set(ensureCells(h)); return h._cs; }
// blocos onde o animal anda (na ilha, sem o anel do fosso)
export function walkSet(h) {
  if (h._ws) return h._ws;
  if (!isFosso(h)) return (h._ws = cellSet(h));
  const out = new Set(); for (const i of ensureCells(h)) { const x = tx(i), y = ty(i); if (x >= h.x + 2 && x < h.x + h.w - 2 && y >= h.y + 2 && y < h.y + h.h - 2) out.add(i); }
  return (h._ws = out);
}
export const hasCell = (h, x, y) => inMap(x, y) && cellSet(h).has(idx(x, y));
export function fitBox(h) {
  let x0 = MAP, y0 = MAP, x1 = -1, y1 = -1;
  for (const i of ensureCells(h)) { const x = tx(i), y = ty(i); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  h.x = x0; h.y = y0; h.w = x1 - x0 + 1; h.h = y1 - y0 + 1; touch(h);
}
// bordas do habitat: um trecho de cerca por lado de bloco sem vizinho do habitat
export function edges(h) {
  if (h._edges) return h._edges;
  const set = cellSet(h), out = [];
  for (const i of ensureCells(h)) {
    const x = tx(i), y = ty(i), x0 = x * TILE - HALF, z0 = y * TILE - HALF, x1 = x0 + TILE, z1 = z0 + TILE;
    for (const d of ['N', 'S', 'L', 'O']) {
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy;
      if (inMap(nx, ny) && set.has(idx(nx, ny))) continue;
      const seg = d === 'N' ? [x0, z0, x1, z0] : d === 'S' ? [x0, z1, x1, z1] : d === 'L' ? [x1, z0, x1, z1] : [x0, z0, x0, z1];
      out.push({ c: i, d, ax: seg[0], az: seg[1], bx: seg[2], bz: seg[3], mx: (seg[0] + seg[2]) / 2, mz: (seg[1] + seg[3]) / 2, nx: dx, nz: dy, out: [nx, ny] });
    }
  }
  return (h._edges = out);
}
export const perimeter = h => edges(h).length;
export const gateEdge = h => edges(h).find(e => e.out[0] === h.gateOut[0] && e.out[1] === h.gateOut[1]) || null;
export const findEdge = (h, d, c) => edges(h).find(e => e.d === d && e.c === c) || null;
// bloco do habitat mais perto do centro da caixa (para limpeza, alertas e câmera)
export function centerCell(h) {
  if (h._cc) return h._cc;
  const cx = h.x + h.w / 2 - 0.5, cy = h.y + h.h / 2 - 0.5; let best = null, bd = 1e9;
  for (const i of walkSet(h).size ? walkSet(h) : cellSet(h)) { const d = (tx(i) - cx) ** 2 + (ty(i) - cy) ** 2; if (d < bd) { bd = d; best = i; } }
  return (h._cc = [tx(best), ty(best)]);
}
// ponto (x, z) dentro da área onde o animal anda, longe "m" metros das cercas
export function insideAt(h, x, z, m = 0) {
  const W = walkSet(h), fx = (x + HALF) / TILE, fz = (z + HALF) / TILE, ix = Math.floor(fx), iz = Math.floor(fz);
  if (!inMap(ix, iz) || !W.has(idx(ix, iz))) return false;
  if (m <= 0) return true;
  const mm = m / TILE, lx = fx - ix, lz = fz - iz, has = (a, b) => inMap(a, b) && W.has(idx(a, b));
  if (lx < mm && !has(ix - 1, iz)) return false; if (lx > 1 - mm && !has(ix + 1, iz)) return false;
  if (lz < mm && !has(ix, iz - 1)) return false; if (lz > 1 - mm && !has(ix, iz + 1)) return false;
  if (lx < mm && lz < mm && !has(ix - 1, iz - 1)) return false; if (lx > 1 - mm && lz < mm && !has(ix + 1, iz - 1)) return false;
  if (lx < mm && lz > 1 - mm && !has(ix - 1, iz + 1)) return false; if (lx > 1 - mm && lz > 1 - mm && !has(ix + 1, iz + 1)) return false;
  return true;
}
// prende o ponto dentro do bloco (com folga nos lados sem vizinho)
function clampInCell(h, i, p, m) {
  const W = walkSet(h), x = tx(i), y = ty(i), has = (a, b) => inMap(a, b) && W.has(idx(a, b));
  const x0 = x * TILE - HALF, z0 = y * TILE - HALF, mm = Math.min(m, TILE * 0.45);
  const lo = (n, base) => (n ? base : base + mm), hi = (n, base) => (n ? base + TILE : base + TILE - mm);
  return { x: Math.min(hi(has(x + 1, y), x0), Math.max(lo(has(x - 1, y), x0), p.x)), z: Math.min(hi(has(x, y + 1), z0), Math.max(lo(has(x, y - 1), z0), p.z)) };
}
export function clampInside(h, p, m = 0.25) {
  if (insideAt(h, p.x, p.z, m)) return p;
  const W = walkSet(h), t = worldToTile(p.x, p.z);
  let best = inMap(t.tx, t.ty) && W.has(idx(t.tx, t.ty)) ? idx(t.tx, t.ty) : -1;
  if (best < 0) { let bd = 1e9; for (const i of W) { const c = tileToWorld(tx(i), ty(i)), d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } } }
  if (best < 0) return p;
  return clampInCell(h, best, p, m);
}
// ok(x, z): restrição extra opcional (1.7.2a: água funda demais para a espécie)
export function segInside(h, a, b, m = 0.3, ok) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.7));
  for (let k = 1; k <= n; k++) { const f = k / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f; if (!insideAt(h, x, z, m) || (ok && !ok(x, z))) return false; }
  return true;
}
export function randomPoint(h, m, r) {
  const arr = [...walkSet(h)]; if (!arr.length) return tileToWorld(h.x, h.y);
  const i = arr[Math.floor(r() * arr.length)], c = tileToWorld(tx(i), ty(i));
  return clampInCell(h, i, { x: c.x + (r() - 0.5) * TILE, z: c.z + (r() - 0.5) * TILE }, m);
}
// caminho entre dois pontos por dentro do habitat (contorna os cantos de formatos em L, U...)
export function routeInside(h, a, b, m = 0.4, ok) {
  if (segInside(h, a, b, m, ok)) return [b];
  const W = walkSet(h), s0 = worldToTile(a.x, a.z), g0 = worldToTile(b.x, b.z), si = idx(s0.tx, s0.ty), gi = idx(g0.tx, g0.ty);
  if (!W.has(si) || !W.has(gi)) return [b];
  const from = new Map([[si, -1]]), q = [si];
  for (let k = 0; k < q.length && !from.has(gi); k++) {
    const i = q[k], x = tx(i), y = ty(i);
    for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy, ni = idx(nx, ny); if (inMap(nx, ny) && W.has(ni) && !from.has(ni) && (!ok || ni === gi || ok(...Object.values(tileToWorld(nx, ny))))) { from.set(ni, i); q.push(ni); } }
  }
  if (!from.has(gi)) return ok ? null : [b];
  const tiles = []; for (let c = gi; c !== -1; c = from.get(c)) tiles.push(c); tiles.reverse();
  const pts = tiles.map(i => tileToWorld(tx(i), ty(i))); pts[pts.length - 1] = b;
  // puxa o fio: só mantém os pontos onde a linha reta deixa de caber
  const out = []; let cur = a, k = 0;
  while (k < pts.length - 1) { let j = pts.length - 1; while (j > k + 1 && !segInside(h, cur, pts[j], m, ok)) j--; out.push(pts[j]); cur = pts[j]; k = j; }
  if (!out.length || out[out.length - 1] !== b) out.push(b);
  return out;
}
// blocos de um retângulo, só os livres, e o maior pedaço conectado
export function biggestComponent(list, extraSet) {
  const set = new Set(list), seen = new Set(); let best = [];
  for (const i0 of list) {
    if (seen.has(i0)) continue; const comp = [i0], q = [i0]; seen.add(i0);
    for (let k = 0; k < q.length; k++) { const i = q[k], x = tx(i), y = ty(i);
      for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy, ni = idx(nx, ny); if (inMap(nx, ny) && (set.has(ni) || extraSet?.has(ni)) && !seen.has(ni)) { seen.add(ni); q.push(ni); if (set.has(ni)) comp.push(ni); } } }
    if (comp.length > best.length) best = comp;
  }
  return best;
}
export function connected(cells) { return biggestComponent(cells).length === cells.length; }
export const cellXY = i => [tx(i), ty(i)];
