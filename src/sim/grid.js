import { content } from '../content/registry.js';
export const TILE = 2;
export const MAP = 72;
export const HALF = (MAP * TILE) / 2;
export const idx = (x, y) => y * MAP + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP && y < MAP;
export const tileToWorld = (tx, ty) => ({ x: (tx + 0.5) * TILE - HALF, z: (ty + 0.5) * TILE - HALF });
export const worldToTile = (x, z) => ({ tx: Math.floor((x + HALF) / TILE), ty: Math.floor((z + HALF) / TILE) });
export const AREAS = [
  { x0: 20, y0: 20, x1: 51, y1: 51, custo: 0 },
  { x0: 14, y0: 14, x1: 57, y1: 57, custo: 20000 },
  { x0: 8, y0: 8, x1: 63, y1: 63, custo: 40000 },
  { x0: 0, y0: 0, x1: 71, y1: 71, custo: 80000 },
];
export function inArea(s, x, y) { const a = AREAS[s.areaLevel]; return x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1; }

// Mapa de ocupação (transitório, recalculado)
export function rebuildOcc(s) {
  const n = MAP * MAP;
  const hab = new Int32Array(n), fac = new Int32Array(n), obj = new Int32Array(n);
  for (const h of s.habitats) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) hab[idx(x, y)] = h.id;
  const C = content(s);
  for (const f of s.facilities) { const d = C.facilities[f.type] || { w: f.w || 1, h: f.h || 1 };
    for (let y = f.ty; y < f.ty + d.h; y++) for (let x = f.tx; x < f.tx + d.w; x++) if (inMap(x, y)) fac[idx(x, y)] = f.id; }
  for (const o of s.objects) obj[idx(o.tx, o.ty)] = o.id;
  s._occ = { hab, fac, obj };
  s._ver = (s._ver || 0) + 1;
  rebuildBridges(s);
}
export const habAt = (s, x, y) => (inMap(x, y) ? s._occ.hab[idx(x, y)] : 0);

// A* em grade (4 vizinhos)
export function astar(s, sx, sy, gx, gy, passable, costFn) {
  if (!inMap(sx, sy) || !inMap(gx, gy)) return null;
  if (sx === gx && sy === gy) return [[gx, gy]];
  const n = MAP * MAP, g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = []; // [f, i]
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const si = idx(sx, sy), gi = idx(gx, gy);
  g[si] = 0; push(Math.abs(sx - gx) + Math.abs(sy - gy), si);
  let it = 0;
  while (heap.length && it++ < 20000) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (i === gi) break;
    const x = i % MAP, y = (i / MAP) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
      const ni = idx(nx, ny); if (closed[ni]) continue;
      if (ni !== gi && !passable(nx, ny)) continue;
      const ng = g[i] + (costFn ? costFn(nx, ny) : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = i; push(ng + Math.abs(nx - gx) + Math.abs(ny - gy), ni); }
    }
  }
  if (from[gi] === -1) return null;
  const path = []; let c = gi;
  while (c !== -1 && c !== si) { path.push([c % MAP, (c / MAP) | 0]); c = from[c]; }
  return path.reverse();
}
export const isPath = (s, x, y) => inMap(x, y) && s.terrain[idx(x, y)] === 'p' && !s._occ.hab[idx(x, y)] && !s._occ.fac[idx(x, y)];
export const staffPassable = (s, x, y) => inMap(x, y) && !s._occ.hab[idx(x, y)] && !s._occ.fac[idx(x, y)] && s.terrain[idx(x, y)] !== 'w';

// Ponto de acesso (caminho vizinho) de uma instalação
export function accessTile(s, f) {
  const d = content(s).facilities[f.type]; if (!d) return null;
  let best = null;
  for (let y = f.ty - 1; y <= f.ty + d.h; y++) for (let x = f.tx - 1; x <= f.tx + d.w; x++) {
    const inside = x >= f.tx && x < f.tx + d.w && y >= f.ty && y < f.ty + d.h;
    const corner = (x === f.tx - 1 || x === f.tx + d.w) && (y === f.ty - 1 || y === f.ty + d.h);
    if (inside || corner) continue;
    if (isPath(s, x, y)) { best = [x, y]; break; }
  }
  return best;
}
// Blocos de caminho de onde se vê um habitat
export function viewTiles(s, h) {
  const out = [];
  for (let y = h.y - 2; y <= h.y + h.h + 1; y++) for (let x = h.x - 2; x <= h.x + h.w + 1; x++) {
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) continue;
    if (isPath(s, x, y)) out.push([x, y]);
  }
  return out;
}

// ---------- relevo: alturas nos cantos dos blocos ----------
export const CW = MAP + 1;
export const WATER_Y = -0.15;
export const ci = (x, y) => y * CW + x;
export function heightAt(s, wx, wz) {
  const H = s.height; if (!H) return 0;
  let fx = (wx + HALF) / TILE, fz = (wz + HALF) / TILE;
  fx = Math.max(0, Math.min(MAP - 0.001, fx)); fz = Math.max(0, Math.min(MAP - 0.001, fz));
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const a = H[ci(x0, z0)], b = H[ci(x0 + 1, z0)], c = H[ci(x0, z0 + 1)], d = H[ci(x0 + 1, z0 + 1)];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
export const tileCorners = (s, x, y) => [s.height[ci(x, y)], s.height[ci(x + 1, y)], s.height[ci(x, y + 1)], s.height[ci(x + 1, y + 1)]];
export const tileSlope = (s, x, y) => { const c = tileCorners(s, x, y); return Math.max(...c) - Math.min(...c); };
export const waterDepth = (s, x, y) => (s.terrain[idx(x, y)] === 'w' ? WATER_Y - tileCorners(s, x, y).reduce((a, b) => a + b, 0) / 4 : 0);
// altura para pisar (pontes das ilhas ficam acima da água)
export function walkY(s, wx, wz) {
  const t = worldToTile(wx, wz);
  if (inMap(t.tx, t.ty) && s._bridge && s._bridge.has(idx(t.tx, t.ty))) return 0.35;
  return heightAt(s, wx, wz);
}
export function rebuildBridges(s) {
  s._bridge = new Set();
  for (const h of s.habitats) if (h.fence === 'fosso') for (const [x, y] of bridgeTiles(h)) s._bridge.add(idx(x, y));
}
export function bridgeTiles(h) {
  const out = [], [gx, gy] = h.gateOut, [ix, iy] = h.gateIn, dx = Math.sign(ix - gx), dy = Math.sign(iy - gy);
  let x = gx + dx, y = gy + dy; while (x !== ix || y !== iy) { out.push([x, y]); x += dx; y += dy; }
  return out;
}
// limites internos onde o animal pode andar (ilhas descontam o fosso)
export function innerBounds(h, margin = 0.6) {
  const m = margin + (h.fence === 'fosso' ? 2 * TILE : 0);
  return { x0: h.x * TILE - HALF + m, x1: (h.x + h.w) * TILE - HALF - m, z0: h.y * TILE - HALF + m, z1: (h.y + h.h) * TILE - HALF - m };
}
