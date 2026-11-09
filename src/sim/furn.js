// Mobiliário de caminho (poste, lixeira, banco): fica na borda do bloco do caminho, ou na calçada.
import { content } from '../content/registry.js';
import { rnd, uid } from './util.js';
import { TILE, MAP, idx, inMap, isPathT, isPath, frontTile } from './grid.js';
import { spend } from './staff.js';

// lados do bloco: deslocamento do centro e giro do móvel (a frente do banco olha para o caminho)
export const SIDES = [
  { k: 'N', dx: 0, dy: -1, ox: 0, oz: -0.82, rot: 0 },
  { k: 'S', dx: 0, dy: 1, ox: 0, oz: 0.82, rot: Math.PI },
  { k: 'L', dx: 1, dy: 0, ox: 0.82, oz: 0, rot: -Math.PI / 2 },
  { k: 'O', dx: -1, dy: 0, ox: -0.82, oz: 0, rot: Math.PI / 2 },
];
export const levelSpacing = (C, type, level) => (level > 0 ? 100 / (level * C.furniture[type].base) : Infinity); // metros entre itens

const reservedTiles = s => {
  const C = content(s), r = new Set();
  for (const h of s.habitats) { r.add(idx(h.gateOut[0], h.gateOut[1])); }
  for (const f of s.facilities) { const d = C.facilities[f.type]; if (!d) continue; const t = frontTile(s, f, d); if (t) r.add(idx(t[0], t[1])); }
  return r;
};
const freeSides = (s, tx, ty) => SIDES.filter(sd => { const x = tx + sd.dx, y = ty + sd.dy; return inMap(x, y) && !isPathT(s.terrain[idx(x, y)]); });

export function addFurn(s, type, tx, ty, side) {
  const sd = side || SIDES[Math.floor(rnd(s) * 4)];
  const f = { id: uid(s), type, tx, ty, ox: sd.ox + (sd.ox === 0 ? (rnd(s) - 0.5) * 0.5 : 0), oz: sd.oz + (sd.oz === 0 ? (rnd(s) - 0.5) * 0.5 : 0), rot: type === 'banco' ? sd.rot : rnd(s) * 6.28, pack: 'base' };
  s.furn.push(f); return f;
}
export function furnCounts(s) { const c = { poste: 0, lixeira: 0, banco: 0 }; for (const f of s.furn) c[f.type] = (c[f.type] || 0) + 1; return c; }

// Distribui mobiliário ao longo de um trecho de caminho (lista de [tx,ty] na ordem em que foi desenhado)
export function distributeFurniture(s, tiles, levels, free = false) {
  const C = content(s), res = { placed: { poste: 0, lixeira: 0, banco: 0 }, cost: 0, semDinheiro: false };
  const list = tiles.filter(([x, y]) => inMap(x, y) && isPath(s, x, y));
  if (!list.length) return res;
  const taken = new Set(s.furn.map(f => idx(f.tx, f.ty))), skip = reservedTiles(s);
  const lenM = list.length * TILE;
  for (const type of ['banco', 'poste', 'lixeira']) {
    const lv = levels[type] || 0; if (lv <= 0) continue;
    const sp = levelSpacing(C, type, lv); let n = Math.min(list.length, Math.round(lenM / sp));
    if (n === 0 && lenM >= sp * 0.6) n = 1;
    const off = [0, 1, -1, 2, -2, 3, -3];
    for (let j = 0; j < n; j++) {
      const base = Math.floor(((j + 0.5) * list.length) / n);
      for (const o of off) {
        const k = base + o; if (k < 0 || k >= list.length) continue;
        const [tx, ty] = list[k], id = idx(tx, ty);
        if (taken.has(id) || skip.has(id)) continue;
        const sides = freeSides(s, tx, ty); if (!sides.length) continue;
        const cost = free ? 0 : C.furniture[type].custo;
        if (s.money < cost) { res.semDinheiro = true; break; }
        taken.add(id); addFurn(s, type, tx, ty, sides[Math.floor(rnd(s) * sides.length)]);
        if (cost) spend(s, 'construcao', cost); res.cost += cost; res.placed[type]++;
        break;
      }
      if (res.semDinheiro) break;
    }
    if (res.semDinheiro) break;
  }
  return res;
}
// Uma lixeira de brinde ao lado de lanchonetes e áreas de mesas
export function addFurnNear(s, type, f, d) {
  const taken = new Set(s.furn.map(x => idx(x.tx, x.ty))), skip = reservedTiles(s);
  const fr = frontTile(s, f, d) || [f.tx, f.ty]; let best = null, bd = 1e9;
  for (let y = f.ty - 3; y <= f.ty + d.h + 2; y++) for (let x = f.tx - 3; x <= f.tx + d.w + 2; x++) {
    if (!inMap(x, y) || !isPath(s, x, y) || taken.has(idx(x, y)) || skip.has(idx(x, y)) || !freeSides(s, x, y).length) continue;
    const dd = Math.hypot(x - fr[0], y - fr[1]); if (dd < bd && dd >= 1) { bd = dd; best = [x, y]; }
  }
  if (!best) return null;
  const sides = freeSides(s, best[0], best[1]);
  return addFurn(s, type, best[0], best[1], sides[Math.floor(rnd(s) * sides.length)]);
}
export function removeFurnAt(s, tx, ty) {
  const n = s.furn.length; s.furn = s.furn.filter(f => !(f.tx === tx && f.ty === ty)); return n - s.furn.length;
}
