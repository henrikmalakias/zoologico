import { content } from '../content/registry.js';
import { clamp, rnd, uid, log } from './util.js';
import { MAP, idx, inMap, inArea, rebuildOcc, isPath, isPathT, accessTile, orientFacility, CW, ci, tileCorners, tileSlope, WATER_Y, worldToTile, fixShore, refreshAfterPaint } from './grid.js';
import { removeFurnAt, addFurnNear } from './furn.js';
import { newAnimal, habById } from './animals.js';
import { spend, earn } from './staff.js';
import { rectCells, ensureCells, cellSet, walkSet, edges, fitBox, touch, cellXY, biggestComponent, connected, DIRS, perimeter } from './habshape.js';

const R = (ok, msg = '', extra = {}) => ({ ok, msg, ...extra });
const norm = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 });

export function habitatCost(s, rect, fence) { const F = content(s).fences[fence]; return Math.round(2 * (rect.w + rect.h) * F.custo + rect.w * rect.h * 3); }
const shapeCost = (s, cells, fence) => Math.round(perimeter({ cells }) * content(s).fences[fence].custo + cells.length * 3);
// blocos livres de um retângulo: dentro do parque, sem instalação, sem caminho e a 1 bloco de outros habitats
export function freeCells(s, r, ownId = 0) {
  const out = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (!inMap(x, y) || !inArea(s, x, y)) continue;
    const i = idx(x, y);
    if (s._occ.fac[i] || isPathT(s.terrain[i])) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const o = s._occ.hab[idx(nx, ny)]; if (o && o !== ownId) { near = true; break; } }
    if (near || (s._occ.hab[i] && s._occ.hab[i] !== ownId)) continue;
    if (s.habitats.some(h => h.id !== ownId && h.gateOut[0] === x && h.gateOut[1] === y)) continue;
    out.push(i);
  }
  return out;
}
const gateOutOk = (s, x, y) => inMap(x, y) && !s._occ.hab[idx(x, y)] && !s._occ.fac[idx(x, y)] && s.terrain[idx(x, y)] !== 'w';
// portão no trecho de cerca virado para um caminho (o do meio, de preferência reto)
function chooseGate(s, h) {
  const set = cellSet(h), cx = h.x + h.w / 2, cy = h.y + h.h / 2; let best = null, bs = -1e9;
  for (const e of edges(h)) {
    const [ox, oy] = e.out; if (!gateOutOk(s, ox, oy)) continue;
    const [x, y] = cellXY(e.c), [dx, dy] = DIRS[e.d], ix = x - dx, iy = y - dy;
    let sc = isPath(s, ox, oy) ? 4 : isPath(s, ox + dx, oy + dy) ? 2.5 : 0;
    if (inMap(ix, iy) && set.has(idx(ix, iy))) sc += 0.6; // dá para pôr o comedouro logo atrás do portão
    const along = dx ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]]; if (along.every(([a, b]) => inMap(a, b) && set.has(idx(a, b)))) sc += 0.4;
    if (e.d === 'S') sc += 0.2;
    sc -= Math.hypot(x - cx, y - cy) * 0.02;
    if (sc > bs) { bs = sc; best = e; }
  }
  if (!best) return false;
  h.side = best.d; h.gateIn = cellXY(best.c); h.gateOut = [...best.out];
  return true;
}
function chooseFeedWater(s, h) {
  const W = walkSet(h), [gx, gy] = h.gateIn, [dx, dy] = DIRS[h.side], bad = new Set([idx(gx, gy)]);
  const dry = i => s.terrain[i] !== 'w';
  let f = idx(gx - dx, gy - dy);
  if (!W.has(f) || !dry(f) || bad.has(f)) { let bd = 1e9; f = -1; for (const i of W) { if (bad.has(i) || !dry(i)) continue; const [x, y] = cellXY(i), d = Math.hypot(x - gx, y - gy); if (d < bd) { bd = d; f = i; } } }
  if (f < 0) f = [...W][0]; bad.add(f);
  let w = -1, wd = -1;
  for (const i of W) { if (bad.has(i) || !dry(i)) continue; const [x, y] = cellXY(i); const inner = Object.values(DIRS).every(([a, b]) => W.has(idx(x + a, y + b))); const d = Math.hypot(x - gx, y - gy) + (inner ? 3 : 0); if (d > wd) { wd = d; w = i; } }
  if (w < 0) w = [...W].find(i => !bad.has(i)) ?? f;
  h.feed = cellXY(f); h.water = cellXY(w);
}
// terreno do bioma em manchas naturais (ruído suave + proporções do bioma)
function paintBiome(s, cells, biome) {
  const B = content(s).biomes[biome];
  const seed = rnd(s) * 1000, hsh = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + seed) * 43758.5453; return n - Math.floor(n); };
  const sm = t => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  const noise = (x, y) => { const sx = x / 3.2, sy = y / 3.2, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sm(sx - x0), fy = sm(sy - y0);
    return L(L(hsh(x0, y0), hsh(x0 + 1, y0), fx), L(hsh(x0, y0 + 1), hsh(x0 + 1, y0 + 1), fx), fy); };
  const list = cells.filter(i => s.terrain[i] !== 'w').map(i => [noise(i % MAP, (i / MAP) | 0), i]).sort((a, b) => a[0] - b[0]);
  const order = Object.entries(B.terreno).sort((a, b) => b[1] - a[1]);
  let k = 0;
  for (const [t, p] of order) { const n = Math.round(p * list.length); for (let j = 0; j < n && k < list.length; j++) s.terrain[list[k++][1]] = t; }
  while (k < list.length) s.terrain[list[k++][1]] = order[0][0];
  const set = new Set(cells); s.objects = s.objects.filter(o => !(o.deco && set.has(idx(o.tx, o.ty))));
}
export function checkHabitat(s, x0, y0, x1, y1, fence) {
  const r = norm(x0, y0, x1, y1);
  const isl = content(s).fences[fence]?.fosso;
  if (isl && (r.w < 8 || r.h < 8)) return R(false, 'Ilha: mínimo 8 x 8 blocos (o fosso ocupa 2 blocos de cada lado).', { rect: r });
  if (r.w < 4 || r.h < 4) return R(false, 'Mínimo 4 x 4 blocos.', { rect: r });
  if (r.w > 20 || r.h > 20) return R(false, 'Máximo 20 x 20 blocos.', { rect: r });
  let cells;
  if (isl) { // a ilha precisa do retângulo inteiro livre
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const inner = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (inner && !inArea(s, x, y)) return R(false, 'Fora da área do parque.', { rect: r });
      if (!inMap(x, y)) continue;
      if (s._occ.hab[idx(x, y)]) return R(false, 'Muito perto de outro habitat (deixe 1 bloco livre).', { rect: r });
      if (inner && s._occ.fac[idx(x, y)]) return R(false, 'Há uma instalação no caminho. Ilhas precisam do retângulo inteiro livre.', { rect: r });
    }
    cells = rectCells(r.x, r.y, r.w, r.h);
  } else { // formato livre: pula instalações, caminhos e a folga de outros habitats
    cells = biggestComponent(freeCells(s, r));
    if (cells.length < 12) return R(false, 'Espaço livre pequeno demais aqui (mínimo 12 blocos).', { rect: r, cells });
  }
  const tmp = { cells, fence }; fitBox(tmp);
  if (!isl && !chooseGate(s, tmp)) return R(false, 'Sem lugar para o portão (precisa de um lado livre, fora da água).', { rect: r, cells });
  const cost = isl ? habitatCost(s, r, fence) : shapeCost(s, cells, fence);
  const skip = r.w * r.h - cells.length;
  const extra = { rect: r, cells, cost, skipped: skip };
  if (s.money < cost) return R(false, `Custa R$ ${cost.toLocaleString('pt-BR')}. Dinheiro insuficiente.`, extra);
  return R(true, `R$ ${cost.toLocaleString('pt-BR')}${skip ? ` · contorna ${skip} bloco(s) ocupado(s)` : ''}`, extra);
}
export function placeHabitat(s, x0, y0, x1, y1, biome, fence) {
  const c = checkHabitat(s, x0, y0, x1, y1, fence); if (!c.ok) return c;
  const r = c.rect, isl = !!content(s).fences[fence]?.fosso, B = content(s).biomes[biome];
  const h = { id: uid(s), name: `Habitat ${s.habitats.length + 1}`, cells: c.cells, biome, fence, fenceHp: 1, gateOpen: false,
    food: 1, waterLvl: 1, clean: 1, dirt: [], breaches: [], checkupDay: -1 };
  fitBox(h);
  if (isl) {
    // portão: lado com caminho do lado de fora, senão sul; na ilha, o portão fica na beira da ilha, depois da ponte
    const mid = { S: [r.x + (r.w >> 1), r.y + r.h - 1, 0, 1], N: [r.x + (r.w >> 1), r.y, 0, -1], L: [r.x + r.w - 1, r.y + (r.h >> 1), 1, 0], O: [r.x, r.y + (r.h >> 1), -1, 0] };
    let side = 'S';
    for (const k of ['S', 'N', 'L', 'O']) { const [gx, gy, dx, dy] = mid[k]; if (isPath(s, gx + dx, gy + dy) || isPath(s, gx + 2 * dx, gy + 2 * dy)) { side = k; break; } }
    let [gx, gy, dx, dy] = mid[side];
    h.side = side; h.gateOut = [gx + dx, gy + dy]; gx -= dx * 2; gy -= dy * 2; h.gateIn = [gx, gy];
    h.feed = dx ? [gx - dx, Math.min(gy + 1, r.y + r.h - 3)] : [Math.min(gx + 1, r.x + r.w - 3), gy - dy];
    h.water = [side === 'L' ? r.x + 3 : r.x + r.w - 4, side === 'N' ? r.y + r.h - 4 : r.y + 3];
    paintBiome(s, h.cells, biome);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const ring = x < r.x + 2 || x >= r.x + r.w - 2 || y < r.y + 2 || y >= r.y + r.h - 2;
      if (ring) { s.terrain[idx(x, y)] = 'w'; s.objects = s.objects.filter(o => !(o.tx === x && o.ty === y)); }
    }
    for (let y = r.y; y <= r.y + r.h; y++) for (let x = r.x; x <= r.x + r.w; x++) {
      const inner = x >= r.x + 2 && x <= r.x + r.w - 2 && y >= r.y + 2 && y <= r.y + r.h - 2;
      const outer = x === r.x || x === r.x + r.w || y === r.y || y === r.y + r.h;
      s.height[ci(x, y)] = inner ? (x === r.x + 2 || x === r.x + r.w - 2 || y === r.y + 2 || y === r.y + r.h - 2 ? 0.15 : 0.3) : outer ? -0.4 : -2.6;
    }
    s._hver = (s._hver || 0) + 1;
  } else {
    paintBiome(s, h.cells, biome);
    chooseGate(s, h); chooseFeedWater(s, h);
  }
  s.habitats.push(h);
  spend(s, 'construcao', c.cost);
  rebuildOcc(s);
  log(s, `${h.name} (${B.nome}) construído.`, 'bom');
  return R(true, '', { hab: h });
}
// ---------- ampliar e recortar habitat (1.7) ----------
// habitat que encosta no retângulo (o que tem mais blocos dentro ou ao lado dele)
export function habNear(s, r) {
  const n = new Map();
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) { if (!inMap(x, y)) continue; const id = s._occ.hab[idx(x, y)]; if (id) n.set(id, (n.get(id) || 0) + 1); }
  let best = 0, bn = 0; for (const [id, k] of n) if (k > bn) { bn = k; best = id; }
  return best ? habById(s, best) : null;
}
export function checkExpand(s, x0, y0, x1, y1) {
  const r = norm(x0, y0, x1, y1), h = habNear(s, r);
  if (!h) return R(false, 'Encoste o retângulo em um habitat para ampliá-lo.', { rect: r });
  if (content(s).fences[h.fence]?.fosso) return R(false, 'Ilhas não podem ser ampliadas.', { rect: r, hab: h });
  const own = cellSet(h), cand = new Set(freeCells(s, r, h.id).filter(i => !own.has(i)));
  // só os blocos novos ligados ao habitat
  const add = [], q = [...own], seen = new Set(own);
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % MAP, y = (i / MAP) | 0;
    for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy, ni = idx(nx, ny); if (inMap(nx, ny) && cand.has(ni) && !seen.has(ni)) { seen.add(ni); q.push(ni); add.push(ni); } } }
  if (!add.length) return R(false, 'Nada para acrescentar: a área está ocupada ou não encosta no habitat.', { rect: r, hab: h, cells: [] });
  const cells = [...h.cells, ...add], tmp = { cells }; fitBox(tmp);
  if (tmp.w > 28 || tmp.h > 28) return R(false, 'Habitat grande demais (máximo 28 x 28 blocos).', { rect: r, hab: h, cells: add });
  const oldE = new Set(edges(h).map(e => e.d + e.c)), newE = edges(tmp).filter(e => !oldE.has(e.d + e.c)).length;
  const cost = Math.round(newE * content(s).fences[h.fence].custo + add.length * 3);
  const extra = { rect: r, hab: h, cells: add, cost };
  if (s.money < cost) return R(false, `Custa R$ ${cost.toLocaleString('pt-BR')}. Dinheiro insuficiente.`, extra);
  return R(true, `+${add.length} blocos no ${h.name} · R$ ${cost.toLocaleString('pt-BR')}`, extra);
}
function reshape(s, h) {
  fitBox(h);
  const ok = new Set(edges(h).map(e => e.d + ':' + e.c));
  h.breaches = (h.breaches || []).filter(b => ok.has(b.side + ':' + b.k));
  if (!edges(h).some(e => e.out[0] === h.gateOut[0] && e.out[1] === h.gateOut[1])) { chooseGate(s, h); const W = walkSet(h); if (!W.has(idx(...h.feed)) || !W.has(idx(...h.water))) chooseFeedWater(s, h); }
  rebuildOcc(s);
}
export function expandHabitat(s, x0, y0, x1, y1) {
  const c = checkExpand(s, x0, y0, x1, y1); if (!c.ok) return c;
  const h = c.hab; paintBiome(s, c.cells, h.biome); h.cells = [...h.cells, ...c.cells];
  spend(s, 'construcao', c.cost); reshape(s, h);
  log(s, `${h.name} ampliado em ${c.cells.length} blocos.`, 'bom');
  return R(true, '', { hab: h });
}
export function checkShrink(s, x0, y0, x1, y1) {
  const r = norm(x0, y0, x1, y1), h = habNear(s, r);
  if (!h) return R(false, 'Desenhe sobre a parte do habitat que quer tirar.', { rect: r });
  if (content(s).fences[h.fence]?.fosso) return R(false, 'Ilhas não podem ser recortadas.', { rect: r, hab: h });
  const keep = new Set([idx(...h.gateIn), idx(...h.feed), idx(...h.water)]);
  const cut = h.cells.filter(i => { const x = i % MAP, y = (i / MAP) | 0; return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && !keep.has(i); });
  if (!cut.length) return R(false, 'Nada para tirar aqui (portão, comedouro e bebedouro ficam).', { rect: r, hab: h, cells: [] });
  const cs = new Set(cut), rest = h.cells.filter(i => !cs.has(i));
  if (rest.length < 12) return R(false, 'O habitat ficaria pequeno demais (mínimo 12 blocos).', { rect: r, hab: h, cells: cut });
  if (!connected(rest)) return R(false, 'O habitat ficaria dividido em dois pedaços.', { rect: r, hab: h, cells: cut });
  return R(true, `−${cut.length} blocos do ${h.name} (sem reembolso)`, { rect: r, hab: h, cells: cut, rest });
}
export function shrinkHabitat(s, x0, y0, x1, y1) {
  const c = checkShrink(s, x0, y0, x1, y1); if (!c.ok) return c;
  const h = c.hab; h.cells = c.rest;
  for (const i of c.cells) { if (s.terrain[i] !== 'w') s.terrain[i] = 'g'; delete s.litter[i]; }
  h.dirt = (h.dirt || []).filter(d => { const t = worldToTileXZ(d.x, d.z); return h.cells.includes(t); });
  reshape(s, h);
  return R(true, '', { hab: h });
}
const worldToTileXZ = (x, z) => { const t = worldToTile(x, z); return idx(t.tx, t.ty); };
// ---------- mover objetos dentro do habitat (1.7) ----------
// o que pode ser movido em um bloco: planta, comedouro ou bebedouro
export function movableAt(s, tx, ty) {
  if (!inMap(tx, ty)) return null;
  const i = idx(tx, ty), oid = s._occ.obj[i], hid = s._occ.hab[i];
  if (hid) { const h = habById(s, hid); if (h.feed[0] === tx && h.feed[1] === ty) return { kind: 'feed', hab: h, nome: 'Comedouro' }; if (h.water[0] === tx && h.water[1] === ty) return { kind: 'water', hab: h, nome: 'Bebedouro' }; }
  if (oid) { const o = s.objects.find(o => o.id === oid); if (o && content(s).plants[o.type]) return { kind: 'plant', obj: o, hab: hid ? habById(s, hid) : null, nome: content(s).plants[o.type].nome }; }
  return null;
}
export function moveObject(s, m, tx, ty) {
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  const i = idx(tx, ty), hid = s._occ.hab[i];
  if (m.hab && hid !== m.hab.id) return R(false, 'Mova só dentro do mesmo habitat.');
  if (!m.hab && hid) return R(false, 'Essa planta está fora de um habitat; plante outra lá dentro.');
  const h = m.hab;
  if (h && !walkSet(h).has(i)) return R(false, 'Esse é o fosso da ilha.');
  if (s._occ.fac[i] || s._occ.obj[i] || isPathT(s.terrain[i])) return R(false, 'Já há algo aqui.');
  if (h && ((h.gateIn[0] === tx && h.gateIn[1] === ty) || (h.feed[0] === tx && h.feed[1] === ty) || (h.water[0] === tx && h.water[1] === ty))) return R(false, 'Deixe o portão, o comedouro e o bebedouro livres.');
  if (m.kind !== 'plant' && s.terrain[i] === 'w') return R(false, 'Não dá para pôr na água.');
  if (m.kind === 'plant' && s.terrain[i] === 'w') return R(false, 'Não dá para plantar na água.');
  if (m.kind === 'feed') h.feed = [tx, ty]; else if (m.kind === 'water') h.water = [tx, ty]; else { m.obj.tx = tx; m.obj.ty = ty; }
  if (h) touch(h);
  rebuildOcc(s);
  return R(true, `${m.nome} movido.`);
}
export function paintCost(s, t) { return content(s).terrains[t]?.custo || 5; }
export function paintTerrain(s, tx, ty, t) {
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  const i = idx(tx, ty), isP = isPathT(t);
  if (s.terrain[i] === t) return R(true);
  if (s._occ.fac[i]) return R(false, 'Há uma instalação aqui.');
  const hid = s._occ.hab[i];
  if (isP && hid) return R(false, 'Caminhos não podem ficar dentro de habitats.');
  if (hid) { const hh = habById(s, hid); if (content(s).fences[hh.fence]?.fosso && (tx < hh.x + 2 || tx >= hh.x + hh.w - 2 || ty < hh.y + 2 || ty >= hh.y + hh.h - 2)) return R(false, 'Esse é o fosso da ilha.'); }
  if (hid) { const h = habById(s, hid); if (t === 'w' && ((tx === h.gateIn[0] && ty === h.gateIn[1]) || (tx === h.feed[0] && ty === h.feed[1]))) return R(false, 'Deixe o portão e o comedouro livres.'); }
  for (const h of s.habitats) if (t === 'w' && tx === h.gateOut[0] && ty === h.gateOut[1]) return R(false, 'Deixe a frente do portão livre.');
  const cost = paintCost(s, t); if (s.money < cost) return R(false, 'Dinheiro insuficiente.');
  const nObj = s.objects.length; if (t === 'w' || isP) s.objects = s.objects.filter(o => !(o.tx === tx && o.ty === ty));
  if (!isP && s.litter[i]) delete s.litter[i];
  if (!isP) removeFurnAt(s, tx, ty);
  const was = s.terrain[i];
  s.terrain[i] = t; spend(s, 'construcao', cost);
  if (s.height) {
    if (t === 'w') for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]) s.height[ci(cx, cy)] = Math.min(s.height[ci(cx, cy)], -0.8);
    else if (was === 'w') for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]) {
      const wet = [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([a, b]) => inMap(a, b) && s.terrain[idx(a, b)] === 'w');
      if (!wet) s.height[ci(cx, cy)] = Math.max(s.height[ci(cx, cy)], 0);
    }
    s._hver = (s._hver || 0) + 1;
  }
  refreshAfterPaint(s, i, was, s.objects.length !== nObj);
  reorientAround(s, tx, ty);
  return R(true, '', { changed: true });
}
// instalações viram a frente para o caminho mais próximo quando o caminho muda
export function reorientAround(s, tx, ty) {
  const C = content(s);
  for (const f of s.facilities) {
    const d = C.facilities[f.type]; if (!d || d.fixo) continue;
    if (tx < f.tx - 2 || tx > f.tx + d.w + 1 || ty < f.ty - 2 || ty > f.ty + d.h + 1) continue;
    f.dir = orientFacility(s, f, d);
  }
}
export function placePlant(s, tx, ty, type) {
  const P = content(s).plants[type]; if (!P) return R(false, 'Planta indisponível.');
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  const i = idx(tx, ty);
  if (s._occ.fac[i] || s._occ.obj[i]) return R(false, 'Já há algo aqui.');
  if (s.terrain[i] === 'w' || isPathT(s.terrain[i])) return R(false, 'Não dá para plantar na água nem no caminho.');
  for (const h of s.habitats) if ((tx === h.gateIn[0] && ty === h.gateIn[1]) || (tx === h.feed[0] && ty === h.feed[1]) || (tx === h.water[0] && ty === h.water[1])) return R(false, 'Deixe o portão, o comedouro e o bebedouro livres.');
  if (s.money < P.custo) return R(false, 'Dinheiro insuficiente.');
  s.objects.push({ id: uid(s), type, tx, ty, rot: rnd(s) * 6.28, sc: 0.85 + rnd(s) * 0.3, pack: P.pack });
  spend(s, 'construcao', P.custo); rebuildOcc(s);
  return R(true);
}
export function checkFacility(s, type, tx, ty) {
  const D = content(s).facilities[type]; if (!D || D.fixo) return R(false, 'Indisponível.');
  for (let y = ty; y < ty + D.h; y++) for (let x = tx; x < tx + D.w; x++) {
    if (!inMap(x, y) || !inArea(s, x, y)) return R(false, 'Fora da área do parque.');
    const i = idx(x, y);
    if (s._occ.hab[i] || s._occ.fac[i]) return R(false, 'Espaço ocupado.');
    if (isPathT(s.terrain[i])) return R(false, 'Não construa em cima do caminho; coloque ao lado.');
    if (s.terrain[i] === 'w') return R(false, 'Não dá para construir na água.');
  }
  if (!D.semCaminho && !accessTile(s, { type, tx, ty })) return R(false, 'Precisa ficar ao lado de um caminho.');
  if (s.height) { let lo = 1e9, hi = -1e9; for (let y = ty; y <= ty + D.h; y++) for (let x = tx; x <= tx + D.w; x++) { const v = s.height[ci(x, y)]; lo = Math.min(lo, v); hi = Math.max(hi, v); } if (hi - lo > 0.6) return R(false, 'Terreno muito inclinado. Use Relevo > Nivelar antes.'); }
  if (type === 'placa' && !s.habitats.some(h => tx >= h.x - 3 && tx <= h.x + h.w + 2 && ty >= h.y - 3 && ty <= h.y + h.h + 2)) return R(false, 'A placa precisa ficar perto de um habitat.');
  if (type === 'mesas' && !s.facilities.some(f => f.type === 'lanchonete' && f.tx >= tx - 5 && f.tx <= tx + D.w + 4 && f.ty >= ty - 5 && f.ty <= ty + D.h + 4)) return R(false, 'A área de mesas precisa ficar ao lado de uma lanchonete (até 4 blocos de distância).');
  if (type === 'centro' && s.facilities.some(f => f.type === 'centro')) return R(false, 'Você já tem um centro de cuidados.');
  if (s.money < D.custo) return R(false, 'Dinheiro insuficiente.');
  return R(true);
}
export function placeFacility(s, type, tx, ty) {
  const c = checkFacility(s, type, tx, ty); if (!c.ok) return c;
  const D = content(s).facilities[type];
  s.objects = s.objects.filter(o => !(o.tx >= tx && o.tx < tx + D.w && o.ty >= ty && o.ty < ty + D.h));
  const f = { id: uid(s), type, tx, ty, dirty: 0, pack: D.pack };
  s.facilities.push(f); rebuildOcc(s);
  f.dir = orientFacility(s, f, D); // entrada sempre voltada para o caminho
  if (type === 'lanchonete' || type === 'mesas') addFurnNear(s, 'lixeira', f, D);
  spend(s, 'construcao', D.custo);
  return R(true);
}
export function buyAnimal(s, sp, tx, ty) {
  const S = content(s).species[sp]; if (!S) return R(false, 'Espécie indisponível.');
  const hid = inMap(tx, ty) ? s._occ.hab[idx(tx, ty)] : 0;
  if (!hid) return R(false, 'Toque dentro de um habitat.');
  if (s.money < S.custo) return R(false, 'Dinheiro insuficiente.');
  const h = habById(s, hid);
  const a = newAnimal(s, sp, h, true);
  const same = s.animals.filter(b => b.hab === h.id && b.sp === sp);
  if (same.length) a.sex = same.filter(b => b.sex === 'M').length > same.filter(b => b.sex === 'F').length ? 'F' : 'M';
  s.animals.push(a); spend(s, 'animais', S.custo);
  log(s, `${a.name} (${S.nome}, ${a.sex === 'M' ? 'macho' : 'fêmea'}) chegou ao ${h.name}.`, 'bom');
  return R(true, '', { animal: a });
}
export function sellAnimal(s, id) {
  const a = s.animals.find(a => a.id === id); if (!a) return R(false);
  if (a.escaped) return R(false, 'Recapture o animal antes.');
  const S = content(s).species[a.sp]; earn(s, 'metas', Math.round((S?.custo || 0) * 0.4));
  s.animals.splice(s.animals.indexOf(a), 1);
  s.alerts = s.alerts.filter(al => !((al.type === 'doenca' || al.type === 'fuga') && al.target === id));
  return R(true);
}
export function demolish(s, tx, ty) {
  if (!inMap(tx, ty)) return R(false);
  const i = idx(tx, ty), C = content(s);
  const fid = s._occ.fac[i];
  if (fid) { const f = s.facilities.find(f => f.id === fid); const D = C.facilities[f.type];
    if (D?.fixo) return R(false, 'A entrada não pode ser demolida.');
    s.facilities.splice(s.facilities.indexOf(f), 1); earn(s, 'metas', Math.round((D?.custo || 0) * 0.5)); rebuildOcc(s); return R(true, 'Instalação removida.'); }
  const fu = s.furn.filter(f => f.tx === tx && f.ty === ty);
  if (fu.length) { const C2 = C.furniture; for (const f of fu) earn(s, 'metas', Math.round((C2[f.type]?.custo || 0) * 0.5)); removeFurnAt(s, tx, ty); return R(true, 'Mobiliário removido.'); }
  const oid = s._occ.obj[i];
  if (oid) { s.objects = s.objects.filter(o => o.id !== oid); rebuildOcc(s); return R(true, 'Planta removida.'); }
  const hid = s._occ.hab[i];
  if (hid) { const h = habById(s, hid);
    if (s.animals.some(a => a.hab === hid)) return R(false, 'Venda ou remova os animais desse habitat antes.');
    if (s.staff.some(st => st.inHab === hid)) for (const st of s.staff) if (st.inHab === hid) { st.inHab = 0; st.task = null; }
    s.habitats.splice(s.habitats.indexOf(h), 1); s.alerts = s.alerts.filter(a => a.target !== hid || a.type === 'doenca' || a.type === 'fuga');
    earn(s, 'metas', Math.round(habitatCostRef(s, h) * 0.3)); rebuildOcc(s); return R(true, 'Habitat demolido.'); }
  if (isPathT(s.terrain[i])) { s.terrain[i] = 'g'; delete s.litter[i]; removeFurnAt(s, tx, ty); rebuildOcc(s); reorientAround(s, tx, ty); return R(true, 'Caminho removido.'); }
  return R(false, 'Nada para demolir aqui.');
}
const habitatCostRef = (s, h) => (h.fence === 'fosso' ? habitatCost(s, h, h.fence) : shapeCost(s, h.cells, h.fence));
export function setTicket(s, v) { s.ticket = clamp(Math.round(v), 0, 100); }
export function setSalary(s, id, factor) {
  const p = [...s.staff, ...s.managers].find(x => x.id === id); if (!p) return;
  p.salary = Math.max(30, Math.round((p.salary * factor) / 5) * 5);
}
export function renameHabitat(s, id, name) { const h = habById(s, id); if (h && name) h.name = name.slice(0, 24); }

// ---------- relevo ----------
export const SCULPT_COST = 15;
export function sculpt(s, tx, ty, mode, base = 0) {
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  if (s.money < SCULPT_COST) return R(false, 'Dinheiro insuficiente.');
  const H = s.height, before = new Map(), rad = 2.2;
  const locked = (cx, cy) => [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([a, b]) => inMap(a, b) && s._occ.fac[idx(a, b)]);
  const isl = (cx, cy) => s.habitats.some(h => content(s).fences[h.fence]?.fosso && cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h);
  for (let cy = ty - 2; cy <= ty + 3; cy++) for (let cx = tx - 2; cx <= tx + 3; cx++) {
    if (cx < 0 || cy < 0 || cx > MAP || cy > MAP || locked(cx, cy) || isl(cx, cy)) continue;
    const d = Math.hypot(cx - (tx + 0.5), cy - (ty + 0.5)); if (d > rad) continue;
    const w = Math.cos((d / rad) * Math.PI / 2) ** 2, k = ci(cx, cy); before.set(k, H[k]);
    let v = H[k];
    if (mode === 'subir') v += 0.35 * w; else if (mode === 'baixar') v -= 0.35 * w;
    else if (mode === 'nivelar') v += (base - v) * 0.6 * w;
    else if (mode === 'suavizar') { let t = 0, n = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + a, y = cy + b; if (x >= 0 && y >= 0 && x <= MAP && y <= MAP) { t += H[ci(x, y)]; n++; } } v += (t / n - v) * 0.6 * w; }
    // água: fundo nunca acima do nível da água
    const wet = [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([a, b]) => inMap(a, b) && s.terrain[idx(a, b)] === 'w');
    if (wet) v = Math.min(v, WATER_Y - 0.25);
    H[k] = Math.max(-3, Math.min(6, Math.round(v * 100) / 100));
  }
  if (!before.size) return R(false, 'Não dá para mexer aqui (instalação ou ilha).');
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if (inMap(x, y) && isPathT(s.terrain[idx(x, y)]) && tileSlope(s, x, y) > 0.9) {
    for (const [k, v] of before) H[k] = v; return R(false, 'Muito íngreme para o caminho. Caminhos aceitam no máximo uma rampa suave.');
  }
  spend(s, 'construcao', SCULPT_COST); s._hver = (s._hver || 0) + 1; fixShore(s);
  return R(true);
}
