import { content } from '../content/registry.js';
import { clamp, rnd, uid, log } from './util.js';
import { MAP, idx, inMap, inArea, rebuildOcc, isPath, accessTile, CW, ci, tileCorners, tileSlope, WATER_Y } from './grid.js';
import { newAnimal, habById } from './animals.js';
import { spend, earn } from './staff.js';

const R = (ok, msg = '', extra = {}) => ({ ok, msg, ...extra });
const norm = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 });

export function habitatCost(s, rect, fence) { const F = content(s).fences[fence]; return Math.round(2 * (rect.w + rect.h) * F.custo + rect.w * rect.h * 3); }
export function checkHabitat(s, x0, y0, x1, y1, fence) {
  const r = norm(x0, y0, x1, y1);
  const isl = content(s).fences[fence]?.fosso;
  if (isl && (r.w < 8 || r.h < 8)) return R(false, 'Ilha: mínimo 8 x 8 blocos (o fosso ocupa 2 blocos de cada lado).', { rect: r });
  if (r.w < 4 || r.h < 4) return R(false, 'Mínimo 4 x 4 blocos.', { rect: r });
  if (r.w > 20 || r.h > 20) return R(false, 'Máximo 20 x 20 blocos.', { rect: r });
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    const inner = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    if (inner && !inArea(s, x, y)) return R(false, 'Fora da área do parque.', { rect: r });
    if (!inMap(x, y)) continue;
    if (s._occ.hab[idx(x, y)]) return R(false, 'Muito perto de outro habitat (deixe 1 bloco livre).', { rect: r });
    if (inner && s._occ.fac[idx(x, y)]) return R(false, 'Há uma instalação no caminho.', { rect: r });
  }
  const cost = habitatCost(s, r, fence);
  if (s.money < cost) return R(false, `Custa R$ ${cost.toLocaleString('pt-BR')}. Dinheiro insuficiente.`, { rect: r, cost });
  return R(true, `R$ ${cost.toLocaleString('pt-BR')}`, { rect: r, cost });
}
export function placeHabitat(s, x0, y0, x1, y1, biome, fence) {
  const c = checkHabitat(s, x0, y0, x1, y1, fence); if (!c.ok) return c;
  const r = c.rect;
  // portão: lado com caminho do lado de fora, senão sul
  const mid = { S: [r.x + (r.w >> 1), r.y + r.h - 1, 0, 1], N: [r.x + (r.w >> 1), r.y, 0, -1], L: [r.x + r.w - 1, r.y + (r.h >> 1), 1, 0], O: [r.x, r.y + (r.h >> 1), -1, 0] };
  let side = 'S';
  for (const k of ['S', 'N', 'L', 'O']) { const [gx, gy, dx, dy] = mid[k]; if (isPath(s, gx + dx, gy + dy) || isPath(s, gx + 2 * dx, gy + 2 * dy)) { side = k; break; } }
  const isl = !!content(s).fences[fence]?.fosso, ins = isl ? 2 : 0;
  let [gx, gy, dx, dy] = mid[side];
  const gateOut = [gx + dx, gy + dy];
  gx -= dx * ins; gy -= dy * ins; // na ilha, o portão fica na beira da ilha, depois da ponte
  const feed = dx ? [gx - dx, Math.min(gy + 1, r.y + r.h - 1 - ins)] : [Math.min(gx + 1, r.x + r.w - 1 - ins), gy - dy];
  const water = [side === 'L' ? r.x + 1 + ins : r.x + r.w - 2 - ins, side === 'N' ? r.y + r.h - 2 - ins : r.y + 1 + ins];
  const B = content(s).biomes[biome];
  // manchas naturais: ruído suave + quantis para respeitar a proporção do bioma
  const seed = rnd(s) * 1000, hsh = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + seed) * 43758.5453; return n - Math.floor(n); };
  const sm = t => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  const noise = (x, y) => { const sx = x / 3.2, sy = y / 3.2, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sm(sx - x0), fy = sm(sy - y0);
    return L(L(hsh(x0, y0), hsh(x0 + 1, y0), fx), L(hsh(x0, y0 + 1), hsh(x0 + 1, y0 + 1), fx), fy); };
  const cells = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push([noise(x, y), idx(x, y)]);
  cells.sort((a, b) => a[0] - b[0]);
  const order = Object.entries(B.terreno).sort((a, b) => b[1] - a[1]);
  let k = 0;
  for (const [t, p] of order) { const n = Math.round(p * cells.length); for (let j = 0; j < n && k < cells.length; j++) s.terrain[cells[k++][1]] = t; }
  while (k < cells.length) s.terrain[cells[k++][1]] = order[0][0];
  s.objects = s.objects.filter(o => !(o.deco && o.tx >= r.x && o.tx < r.x + r.w && o.ty >= r.y && o.ty < r.y + r.h));
  if (isl) { // fosso: anel de 2 blocos de água funda; a ilha fica um pouco mais alta
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const ring = x < r.x + 2 || x >= r.x + r.w - 2 || y < r.y + 2 || y >= r.y + r.h - 2;
      if (ring) { s.terrain[idx(x, y)] = 'w'; s.objects = s.objects.filter(o => !(o.tx === x && o.ty === y)); }
    }
    for (let y = r.y; y <= r.y + r.h; y++) for (let x = r.x; x <= r.x + r.w; x++) {
      const inner = x >= r.x + 2 && x <= r.x + r.w - 2 && y >= r.y + 2 && y <= r.y + r.h - 2;
      const outer = x === r.x || x === r.x + r.w || y === r.y || y === r.y + r.h;
      s.height[ci(x, y)] = inner ? (x === r.x + 2 || x === r.x + r.w - 2 || y === r.y + 2 || y === r.y + r.h - 2 ? 0.15 : 0.3) : outer ? -0.4 : -2.6;
    }
  }
  const h = { id: uid(s), name: `Habitat ${s.habitats.length + 1}`, ...r, biome, fence, fenceHp: 1, gateOpen: false, side,
    gateIn: [gx, gy], gateOut, feed, water, food: 1, waterLvl: 1, clean: 1, dirt: [], breaches: [], checkupDay: -1 };
  s.habitats.push(h);
  spend(s, 'construcao', c.cost);
  rebuildOcc(s);
  log(s, `${h.name} (${B.nome}) construído.`, 'bom');
  return R(true, '', { hab: h });
}
export function paintCost(s, t) { return content(s).terrains[t]?.custo || 5; }
export function paintTerrain(s, tx, ty, t) {
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  const i = idx(tx, ty);
  if (s.terrain[i] === t) return R(true);
  if (s._occ.fac[i]) return R(false, 'Há uma instalação aqui.');
  const hid = s._occ.hab[i];
  if (t === 'p' && hid) return R(false, 'Caminhos não podem ficar dentro de habitats.');
  if (hid) { const hh = habById(s, hid); if (content(s).fences[hh.fence]?.fosso && (tx < hh.x + 2 || tx >= hh.x + hh.w - 2 || ty < hh.y + 2 || ty >= hh.y + hh.h - 2)) return R(false, 'Esse é o fosso da ilha.'); }
  if (hid) { const h = habById(s, hid); if (t === 'w' && ((tx === h.gateIn[0] && ty === h.gateIn[1]) || (tx === h.feed[0] && ty === h.feed[1]))) return R(false, 'Deixe o portão e o comedouro livres.'); }
  for (const h of s.habitats) if (t === 'w' && tx === h.gateOut[0] && ty === h.gateOut[1]) return R(false, 'Deixe a frente do portão livre.');
  const cost = paintCost(s, t); if (s.money < cost) return R(false, 'Dinheiro insuficiente.');
  if (t === 'w' || t === 'p') s.objects = s.objects.filter(o => !(o.tx === tx && o.ty === ty));
  if (t !== 'p' && s.litter[i]) delete s.litter[i];
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
  rebuildOcc(s);
  return R(true);
}
export function placePlant(s, tx, ty, type) {
  const P = content(s).plants[type]; if (!P) return R(false, 'Planta indisponível.');
  if (!inMap(tx, ty) || !inArea(s, tx, ty)) return R(false, 'Fora da área do parque.');
  const i = idx(tx, ty);
  if (s._occ.fac[i] || s._occ.obj[i]) return R(false, 'Já há algo aqui.');
  if (s.terrain[i] === 'w' || s.terrain[i] === 'p') return R(false, 'Não dá para plantar na água nem no caminho.');
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
    if (s.terrain[i] === 'p') return R(false, 'Não construa em cima do caminho; coloque ao lado.');
    if (s.terrain[i] === 'w') return R(false, 'Não dá para construir na água.');
  }
  if (!D.semCaminho && !accessTile(s, { type, tx, ty })) return R(false, 'Precisa ficar ao lado de um caminho.');
  if (s.height) { let lo = 1e9, hi = -1e9; for (let y = ty; y <= ty + D.h; y++) for (let x = tx; x <= tx + D.w; x++) { const v = s.height[ci(x, y)]; lo = Math.min(lo, v); hi = Math.max(hi, v); } if (hi - lo > 0.6) return R(false, 'Terreno muito inclinado. Use Relevo > Nivelar antes.'); }
  if (type === 'placa' && !s.habitats.some(h => tx >= h.x - 3 && tx <= h.x + h.w + 2 && ty >= h.y - 3 && ty <= h.y + h.h + 2)) return R(false, 'A placa precisa ficar perto de um habitat.');
  if (type === 'centro' && s.facilities.some(f => f.type === 'centro')) return R(false, 'Você já tem um centro de cuidados.');
  if (s.money < D.custo) return R(false, 'Dinheiro insuficiente.');
  return R(true);
}
export function placeFacility(s, type, tx, ty) {
  const c = checkFacility(s, type, tx, ty); if (!c.ok) return c;
  const D = content(s).facilities[type];
  s.objects = s.objects.filter(o => !(o.tx >= tx && o.tx < tx + D.w && o.ty >= ty && o.ty < ty + D.h));
  s.facilities.push({ id: uid(s), type, tx, ty, dirty: 0, pack: D.pack });
  spend(s, 'construcao', D.custo); rebuildOcc(s);
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
  const oid = s._occ.obj[i];
  if (oid) { s.objects = s.objects.filter(o => o.id !== oid); rebuildOcc(s); return R(true, 'Planta removida.'); }
  const hid = s._occ.hab[i];
  if (hid) { const h = habById(s, hid);
    if (s.animals.some(a => a.hab === hid)) return R(false, 'Venda ou remova os animais desse habitat antes.');
    if (s.staff.some(st => st.inHab === hid)) for (const st of s.staff) if (st.inHab === hid) { st.inHab = 0; st.task = null; }
    s.habitats.splice(s.habitats.indexOf(h), 1); s.alerts = s.alerts.filter(a => a.target !== hid || a.type === 'doenca' || a.type === 'fuga');
    earn(s, 'metas', Math.round(habitatCostRef(s, h) * 0.3)); rebuildOcc(s); return R(true, 'Habitat demolido.'); }
  if (s.terrain[i] === 'p') { s.terrain[i] = 'g'; delete s.litter[i]; rebuildOcc(s); return R(true, 'Caminho removido.'); }
  return R(false, 'Nada para demolir aqui.');
}
const habitatCostRef = (s, h) => habitatCost(s, h, h.fence);
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
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if (inMap(x, y) && s.terrain[idx(x, y)] === 'p' && tileSlope(s, x, y) > 0.9) {
    for (const [k, v] of before) H[k] = v; return R(false, 'Muito íngreme para o caminho. Caminhos aceitam no máximo uma rampa suave.');
  }
  spend(s, 'construcao', SCULPT_COST); s._hver = (s._hver || 0) + 1;
  return R(true);
}
