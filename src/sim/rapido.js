// 1.8.3: construção rápida de recinto (pensada para crianças).
// Escolhe o animal, toca no mapa e o jogo monta o recinto completo: bioma, cerca certa, lago, plantas, toca, portão virado
// para o caminho e o grupo mínimo da espécie, com espaço para mais 3. Em volta sai um caminho ligado ao caminho mais
// próximo, com bancos, postes, uma lixeira e canteiros. Na ficha: lotação, +1, Ampliar e + outra espécie.
// Tudo sai dos campos das espécies (espaco, social, barreira, agua, aguaFunda, plantas, plantasAltas, perigoso), então
// espécies de DLC funcionam sem nada novo no contrato (campo opcional: plural).
import { content } from '../content/registry.js';
import { rnd, uid, log } from './util.js';
import { MAP, idx, inMap, inArea, isPathT, isPath, muroAt, rebuildOcc, ci, WATER_Y, fixShore, accessTile } from './grid.js';
import { placeHabitat, paintTerrain, placePlant, checkToca, placeToca, chooseFeedWater, checkExpand, expandHabitat, habitatCost } from './build.js';
import { habInfo, habById, newAnimal, RADIUS } from './animals.js';
import { spend } from './staff.js';
import { addFurn, removeFurnAt, SIDES } from './furn.js';
import { tocasDe, tocaVagas, TOCA_MAX, tocaCells, ladoTiles } from './tocas.js';
import { edges, walkSet, cellSet, DIRS, cellXY, touch, ensureCells } from './habshape.js';
import { encomendar, aCaminhoDe, tocasEmObra, ampliacaoDe } from './obras.js';

const R = (ok, msg = '', extra = {}) => ({ ok, msg, ...extra });
const BRL = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
export const CAMINHO_RAPIDO = 'p'; // caminho de pedra
const PASSO_POSTE = 4, PASSO_BANCO = 6, MAX_LADO = 20;
const PLURAL = { leao: 'Leões', zebra: 'Zebras', elefante: 'Elefantes', girafa: 'Girafas', macaco: 'Macacos', hipopotamo: 'Hipopótamos',
  rinoceronte: 'Rinocerontes', flamingo: 'Flamingos', gorila: 'Gorilas', tartaruga: 'Tartarugas' };
export function nomePlural(s, sp) {
  const S = content(s).species[sp]; if (!S) return sp;
  if (S.plural) return S.plural; if (PLURAL[sp]) return PLURAL[sp];
  const n = S.nome.split(/[- ]/)[0]; return n.endsWith('ão') ? n.slice(0, -2) + 'ões' : n.endsWith('l') ? n.slice(0, -1) + 'is' : /[rsz]$/.test(n) ? n + 'es' : n + 's';
}
const FEM = new Set(['zebra', 'girafa', 'tartaruga']);
export const artigoPlural = (s, sp) => { const S = content(s).species[sp]; return (S?.genero ? S.genero === 'f' : FEM.has(sp) || (!PLURAL[sp] && /as$/.test(nomePlural(s, sp)))) ? 'das' : 'dos'; };
export const raioDe = (s, sp) => content(s).species[sp]?.raio ?? RADIUS[sp] ?? 0.7;
export const sobeArvore = (s, sp) => !!content(s).species[sp]?.tracos?.escala && raioDe(s, sp) <= 0.4;

// cerca certa: a mais barata que segura a espécie; muro para os perigosos; viveiro com tela para quem escala e pula dos galhos
export function cercaRapida(s, sp) {
  const C = content(s), S = C.species[sp], B = S.barreira || { altura: 0, resistencia: 0 };
  const todas = Object.entries(C.fences).filter(([, f]) => !f.inativo && !f.fosso);
  let lista = todas.filter(([, f]) => f.altura >= B.altura && f.resistencia >= B.resistencia);
  if (sobeArvore(s, sp)) { const t = lista.filter(([, f]) => f.teto); if (t.length) lista = t; }
  else { const t = lista.filter(([, f]) => !f.teto); if (t.length) lista = t; }
  if (S.tracos?.perigoso) { const m = lista.filter(([, f]) => f.plataforma); if (m.length) lista = m; }
  lista.sort((a, b) => a[1].custo - b[1].custo);
  if (lista.length) return lista[0][0];
  return todas.sort((a, b) => b[1].resistencia - a[1].resistencia)[0]?.[0] || 'ferro';
}
// quanto o recinto precisa: grupo mínimo + folga de 3 (sem passar do máximo do grupo)
export function necessidade(s, sp, folga = true) {
  const C = content(s), S = C.species[sp];
  const min = Math.max(1, S.social?.min || 1), max = Math.max(min, S.social?.max || min);
  const cap = folga ? Math.min(max, min + 3) : min;
  const temToca = !!C.estruturas?.toca, vagas = temToca ? tocaVagas(s, sp) : 1;
  const tocas = temToca ? Math.min(TOCA_MAX, Math.ceil(min / vagas)) : 0, tocasCap = temToca ? Math.min(TOCA_MAX, Math.ceil(cap / vagas)) : 0;
  const agua = S.agua ? Math.max(S.agua + Math.ceil(S.agua * 0.25), (S.aguaFunda || 0) + 4) : 0;
  const chao = cap * (S.espaco || 10);
  const blocos = Math.min(MAX_LADO * MAX_LADO, Math.ceil((chao + agua + tocasCap * 4 + 4) * 1.05));
  return { S, min, max, cap, tocas, vagas, agua, blocos, fence: cercaRapida(s, sp), biome: C.biomes[S.bioma] ? S.bioma : Object.keys(C.biomes)[0] };
}
function formatos(blocos) {
  const out = [], seen = new Set();
  for (const a of [1, 1.25, 0.8, 1.6, 0.625, 2, 0.5, 2.6, 0.38]) {
    const w = Math.max(5, Math.min(MAX_LADO, Math.round(Math.sqrt(blocos * a)))), h = Math.max(5, Math.min(MAX_LADO, Math.ceil(blocos / w)));
    if (w * h < blocos || seen.has(w + 'x' + h)) continue; seen.add(w + 'x' + h); out.push([w, h]);
  }
  return out;
}
// mapas de bloqueio com soma acumulada (testar centenas de encaixes fica leve)
function bloqueios(s) {
  const N = MAP + 1, dentro = new Int32Array(N * N), anel = new Int32Array(N * N), O = s._occ;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = idx(x, y), t = s.terrain[i];
    const ruimAnel = !inArea(s, x, y) || O.hab[i] || O.fac[i] || O.toca?.[i] || O.obra?.[i] || t === 'w' || muroAt(x, y) ? 1 : 0;
    const ruim = ruimAnel || isPathT(t) ? 1 : 0;
    dentro[(y + 1) * N + x + 1] = ruim + dentro[y * N + x + 1] + dentro[(y + 1) * N + x] - dentro[y * N + x];
    anel[(y + 1) * N + x + 1] = ruimAnel + anel[y * N + x + 1] + anel[(y + 1) * N + x] - anel[y * N + x];
  }
  const soma = (P, x, y, w, h) => P[(y + h) * N + x + w] - P[y * N + x + w] - P[(y + h) * N + x] + P[y * N + x];
  return (x, y, w, h) => x >= 1 && y >= 1 && x + w + 1 <= MAP && y + h + 1 <= MAP && soma(dentro, x, y, w, h) === 0 && soma(anel, x - 1, y - 1, w + 2, h + 2) === 0;
}
// blocos do caminho em volta, na ordem da volta (cima, direita, baixo, esquerda)
export function anelDe(r) {
  const out = [], x0 = r.x - 1, y0 = r.y - 1, x1 = r.x + r.w, y1 = r.y + r.h;
  for (let x = x0; x <= x1; x++) out.push([x, y0]);
  for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
  for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
  for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
  return out;
}
// caminhos ligados à Entrada
function redeDaEntrada(s) {
  const C = content(s), ent = s.facilities.find(f => C.facilities[f.type]?.fixo), seen = new Uint8Array(MAP * MAP), q = [];
  const ini = [];
  if (ent) { const D = C.facilities[ent.type]; for (let y = ent.ty - 1; y <= ent.ty + D.h; y++) for (let x = ent.tx - 1; x <= ent.tx + D.w; x++) if (isPath(s, x, y)) ini.push([x, y]); const a = accessTile(s, ent); if (a) ini.push(a); }
  if (!ini.length) for (let i = 0; i < MAP * MAP; i++) if (isPathT(s.terrain[i]) && !s._occ.hab[i] && !s._occ.fac[i]) ini.push(cellXY(i));
  for (const [x, y] of ini) { const i = idx(x, y); if (!seen[i]) { seen[i] = 1; q.push(i); } }
  for (let k = 0; k < q.length; k++) { const [x, y] = cellXY(q[k]); for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (!seen[j] && isPath(s, nx, ny)) { seen[j] = 1; q.push(j); } } }
  return seen;
}
// ligação: do anel até a rede da Entrada pelo menor trajeto livre (fora de habitats, instalações, água e do próprio recinto)
export function ligacao(s, anel, proibido) {
  const rede = redeDaEntrada(s), ring = new Set(anel.map(([x, y]) => idx(x, y)));
  let melhor = null, bd = 1e9; const ent = s.facilities.find(f => content(s).facilities[f.type]?.fixo);
  for (const i of ring) if (rede[i]) { const [x, y] = cellXY(i), d = ent ? Math.hypot(x - ent.tx, y - ent.ty) : 0; if (d < bd) { bd = d; melhor = [x, y]; } }
  if (melhor) return { tiles: [], liga: melhor };
  const prev = new Int32Array(MAP * MAP).fill(-2), q = [];
  for (const i of ring) { prev[i] = -1; q.push(i); }
  const passa = (x, y) => { if (!inMap(x, y) || !inArea(s, x, y) || muroAt(x, y)) return false; const i = idx(x, y); return !s._occ.hab[i] && !s._occ.fac[i] && !s._occ.toca?.[i] && !s._occ.obra?.[i] && s.terrain[i] !== 'w' && !proibido.has(i); };
  for (let k = 0; k < q.length; k++) {
    const i = q[k], [x, y] = cellXY(i);
    if (rede[i] && !ring.has(i)) {
      const tiles = []; let j = prev[i];
      while (j >= 0 && !ring.has(j)) { tiles.push(cellXY(j)); j = prev[j]; }
      return { tiles: tiles.filter(([tx, ty]) => !isPathT(s.terrain[idx(tx, ty)])), liga: j >= 0 ? cellXY(j) : cellXY(i) };
    }
    for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy; if (!passa(nx, ny)) continue; const j = idx(nx, ny); if (prev[j] !== -2) continue; prev[j] = i; q.push(j); }
  }
  return null;
}
const plantasDoBioma = (s, bioma, alta) => Object.entries(content(s).plants).filter(([, p]) => p.bioma === bioma && !!p.alta === alta).map(([k]) => k);
function listaPlantas(s, nec) {
  const S = nec.S, altas = plantasDoBioma(s, nec.biome, true), baixas = plantasDoBioma(s, nec.biome, false);
  const nAltas = S.plantasAltas ? (S.plantas || 0) : Math.min(2, Math.ceil((S.plantas || 0) / 2));
  const nBaixas = (S.plantasAltas ? 2 : Math.max(0, (S.plantas || 0) - nAltas)) + 2;
  const out = [];
  for (let k = 0; k < nAltas && altas.length; k++) out.push(altas[k % altas.length]);
  for (let k = 0; k < nBaixas && (baixas.length || altas.length); k++) out.push(baixas.length ? baixas[k % baixas.length] : altas[k % altas.length]);
  return out;
}
const CANTEIROS = 6;
// prévia: onde o recinto encaixa perto do toque e quanto custa tudo
export function planoRapido(s, sp, tx, ty, opts = {}) {
  const C = content(s), S = C.species[sp]; if (!S) return R(false, 'Animal indisponível.');
  if (!s._occ) rebuildOcc(s);
  const nec = necessidade(s, sp, opts.folga !== false);
  const forms = opts.dims ? [opts.dims] : formatos(nec.blocos), livre = bloqueios(s);
  const cand = [];
  for (let fi = 0; fi < forms.length; fi++) {
    const [w, h] = forms[fi]; let best = null, bd = 1e9;
    for (let oy = -9; oy <= 9; oy++) for (let ox = -9; ox <= 9; ox++) {
      const d = Math.hypot(ox, oy); if (d > 9.5 || d >= bd) continue;
      const x = tx - (w >> 1) + ox, y = ty - (h >> 1) + oy;
      if (livre(x, y, w, h)) { bd = d; best = { x, y, w, h }; }
    }
    if (best) cand.push({ r: best, sc: bd + fi * 0.6 });
  }
  if (!cand.length) {
    const r0 = opts.dims ? { x: tx - (opts.dims[0] >> 1), y: ty - (opts.dims[1] >> 1), w: opts.dims[0], h: opts.dims[1] } : null;
    return R(false, opts.dims ? 'Virado não cabe aqui. Toque em outro lugar.' : `Não cabe aqui: o recinto ${nomePlural(s, sp).toLowerCase()} precisa de uns ${nec.blocos} blocos livres, com espaço para o caminho em volta. Toque em um lugar mais vazio ou amplie a área do parque.`, { rect: r0, nec });
  }
  cand.sort((a, b) => a.sc - b.sc);
  for (const { r } of cand.slice(0, 4)) {
    const anel = anelDe(r), dentro = new Set(); for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) dentro.add(idx(x, y));
    const lg = ligacao(s, anel, dentro);
    const T = C.terrains[CAMINHO_RAPIDO]?.custo || 20, novos = anel.filter(([x, y]) => !isPathT(s.terrain[idx(x, y)]));
    const nCam = novos.length + (lg ? lg.tiles.length : 0);
    const plantas = listaPlantas(s, nec), baixas = plantasDoBioma(s, nec.biome, false);
    const F = C.furniture || {}, nPoste = F.poste ? Math.floor(anel.length / PASSO_POSTE) : 0, nBanco = F.banco ? Math.floor(anel.length / PASSO_BANCO) : 0;
    const custos = {
      recinto: habitatCost(s, r, nec.fence) + nec.agua * (C.terrains.w?.custo || 15) + nec.tocas * (C.estruturas?.toca?.custo || 0) + plantas.reduce((t, p) => t + (C.plants[p]?.custo || 0), 0),
      animais: nec.min * (S.custo || 0),
      caminho: nCam * T + nPoste * (F.poste?.custo || 0) + nBanco * (F.banco?.custo || 0) + (F.lixeira?.custo || 0) + [...Array(baixas.length ? CANTEIROS : 0).keys()].reduce((t2, k) => t2 + (C.plants[baixas[k % baixas.length]]?.custo || 0), 0),
    };
    const total = custos.recinto + custos.animais + custos.caminho;
    const extra = { sp, rect: r, nec, anel, ligacao: lg, semLigacao: !lg, nCaminho: nCam, plantas, custos, total, dims: [r.w, r.h] };
    if (s.money < total) {
      const menor = opts.folga !== false && nec.cap > nec.min ? planoRapido(s, sp, tx, ty, { folga: false }) : null;
      return R(false, `Custa ${BRL(total)}. Dinheiro insuficiente.`, { ...extra, semDinheiro: true, menor: menor?.ok ? menor : null });
    }
    return R(true, `${BRL(total)}`, extra);
  }
  return R(false, 'Não deu para montar o recinto aqui.');
}
// terraplenagem leve: aplaina o miolo do recinto quando o chão é muito irregular (a toca precisa de chão quase plano)
function aplainar(s, r) {
  if (!s.height) return; let lo = 1e9, hi = -1e9, t = 0, n = 0;
  for (let y = r.y; y <= r.y + r.h; y++) for (let x = r.x; x <= r.x + r.w; x++) { const v = s.height[ci(x, y)]; lo = Math.min(lo, v); hi = Math.max(hi, v); t += v; n++; }
  if (hi - lo <= 0.6) return; const m = t / n;
  for (let y = r.y + 1; y < r.y + r.h; y++) for (let x = r.x + 1; x < r.x + r.w; x++) s.height[ci(x, y)] = Math.round(m * 100) / 100;
  s._hver = (s._hver || 0) + 1;
}
// portão no meio do lado mais perto de onde o caminho chega
function portaoParaCaminho(s, h, liga) {
  if (!liga) return; const set = cellSet(h); let best = null, bs = -1e9;
  for (const e of edges(h)) {
    const [x, y] = cellXY(e.c), [dx, dy] = DIRS[e.d], [ox, oy] = e.out; if (!inMap(ox, oy) || s.terrain[idx(ox, oy)] === 'w') continue;
    const along = dx ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]], meio = along.every(([a, b]) => inMap(a, b) && set.has(idx(a, b)));
    const atras = inMap(x - dx, y - dy) && set.has(idx(x - dx, y - dy));
    const sc = -Math.hypot(ox - liga[0], oy - liga[1]) + (meio ? 1.5 : 0) + (atras ? 0.5 : 0);
    if (sc > bs) { bs = sc; best = e; }
  }
  if (best) { h.side = best.d; h.gateIn = cellXY(best.c); h.gateOut = [...best.out]; chooseFeedWater(s, h); }
}
// lago: mancha redonda longe do portão; raso para quem só vadeia pouco, com parte funda para quem precisa de banho
export function fazerLago(s, h, n, S) {
  if (n <= 0) return 0;
  const W = walkSet(h), set = cellSet(h), [gx, gy] = h.gateIn;
  const livre = i => W.has(i) && s.terrain[i] !== 'w' && !s._occ.toca?.[i] && !s._occ.obra?.[i] && i !== idx(gx, gy) && i !== idx(...h.feed) && i !== idx(...h.water);
  const interior = i => { const [x, y] = cellXY(i); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!set.has(idx(x + dx, y + dy))) return false; return true; };
  let centro = -1, bd = -1;
  for (const i of W) { if (!livre(i) || !interior(i)) continue; const [x, y] = cellXY(i), d = Math.hypot(x - gx, y - gy); if (d > bd) { bd = d; centro = i; } }
  if (centro < 0) return 0;
  const [cx, cy] = cellXY(centro), lago = [];
  const cand = [...W].filter(i => livre(i) && interior(i) && Math.hypot(cellXY(i)[0] - gx, cellXY(i)[1] - gy) > 2.5).sort((a, b) => { const [ax, ay] = cellXY(a), [bx, by] = cellXY(b); return (Math.max(Math.abs(ax - cx), Math.abs(ay - cy)) + Math.hypot(ax - cx, ay - cy) * 0.01) - (Math.max(Math.abs(bx - cx), Math.abs(by - cy)) + Math.hypot(bx - cx, by - cy) * 0.01); });
  for (const i of cand) { if (lago.length >= n) break; lago.push(i); }
  if (!lago.length) return 0;
  const L = new Set(lago), C = content(s);
  for (const i of lago) { s.terrain[i] = 'w'; delete s.litter[i]; const [x, y] = cellXY(i); s.objects = s.objects.filter(o => !(o.tx === x && o.ty === y)); }
  const raso = (S.aguaMax ?? 1) < 0.65 && !S.tracos?.nada, fundo = !!S.aguaFunda;
  if (s.height) {
    const cantos = new Set(); for (const i of lago) { const [x, y] = cellXY(i); for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) cantos.add(ci(a, b)); }
    for (const k of cantos) {
      const cx2 = k % (MAP + 1), cy2 = (k / (MAP + 1)) | 0;
      const todos = [[cx2 - 1, cy2 - 1], [cx2, cy2 - 1], [cx2 - 1, cy2], [cx2, cy2]].every(([a, b]) => inMap(a, b) && L.has(idx(a, b)));
      s.height[k] = raso ? -0.55 : fundo && todos ? (S.aguaModo === 'anfibio' ? -2.6 : -2.0) : todos ? -1.0 : -0.8;
    }
    // água funda que a espécie pede: aprofunda os cantos mais cercados de água até bastar
    if (fundo) for (const [viz, v] of [[3, -1.9], [2, -1.7], [2, -2.2]]) {
      const fundos = lago.filter(i => { const [x, y] = cellXY(i); return WATER_Y - (s.height[ci(x, y)] + s.height[ci(x + 1, y)] + s.height[ci(x, y + 1)] + s.height[ci(x + 1, y + 1)]) / 4 > 1.0; }).length;
      if (fundos >= S.aguaFunda) break;
      for (const k of cantos) { const cx2 = k % (MAP + 1), cy2 = (k / (MAP + 1)) | 0, n = [[cx2 - 1, cy2 - 1], [cx2, cy2 - 1], [cx2 - 1, cy2], [cx2, cy2]].filter(([a, b]) => inMap(a, b) && L.has(idx(a, b))).length; if (n >= viz) s.height[k] = Math.min(s.height[k], v); }
    }
    s._hver = (s._hver || 0) + 1;
  }
  spend(s, 'construcao', lago.length * (C.terrains.w?.custo || 15));
  rebuildOcc(s); fixShore(s); touch(h);
  return lago.length;
}
// toca perto da cerca (o vidro fica para os visitantes), longe do portão e fora do lago
export function fazerToca(s, h, opts = {}) {
  const W = walkSet(h), [gx, gy] = h.gateIn, set = cellSet(h);
  const borda = i => { const [x, y] = cellXY(i); let d = 9; for (const [dx, dy] of Object.values(DIRS)) for (let k = 1; k <= 4; k++) if (!set.has(idx(x + dx * k, y + dy * k))) { d = Math.min(d, k); break; } return d; };
  const cand = [...W].filter(i => s.terrain[i] !== 'w').map(i => { const [x, y] = cellXY(i), dg = Math.hypot(x - gx, y - gy); return [i, Math.abs(borda(i) - 2) * 2 - Math.min(dg, 8) * 0.4 + (dg < 3 ? 20 : 0)]; }).sort((a, b) => a[1] - b[1]);
  for (const [i] of cand.slice(0, 160)) { const [x, y] = cellXY(i), c = checkToca(s, x, y); if (c.ok) return placeToca(s, x, y, null, opts); }
  return R(false, 'Sem lugar para a toca.');
}
// plantas dentro do recinto: árvores no miolo (longe da cerca), baixas espalhadas; nada no portão, comedouro, bebedouro e frente das tocas
export function fazerPlantas(s, h, tipos) {
  const C = content(s), W = walkSet(h), set = cellSet(h), proib = new Set([idx(...h.gateIn), idx(...h.feed), idx(...h.water)]);
  const [gx, gy] = h.gateIn; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(gx + dx, gy + dy)) proib.add(idx(gx + dx, gy + dy));
  for (const t of tocasDe(s, h.id)) for (const [x, y] of [...tocaCells(t), ...ladoTiles(t, t.dir), ...ladoTiles(t, t.porta ?? (t.dir + 2) % 4)]) if (inMap(x, y)) proib.add(idx(x, y));
  const longe = (i, k) => { const [x, y] = cellXY(i); for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) if (!set.has(idx(x + dx, y + dy))) return false; return true; };
  const livres = [...W].filter(i => !proib.has(i) && s.terrain[i] !== 'w' && !s._occ.obj[i] && !s._occ.fac[i] && !s._occ.obra?.[i]);
  for (let k = livres.length - 1; k > 0; k--) { const j = Math.floor(rnd(s) * (k + 1)); [livres[k], livres[j]] = [livres[j], livres[k]]; }
  const postas = []; let n = 0;
  for (const tipo of tipos) {
    const alta = !!C.plants[tipo]?.alta;
    const pos = livres.find(i => !postas.includes(i) && (!alta || longe(i, 1)) && postas.every(j => { const [ax, ay] = cellXY(i), [bx, by] = cellXY(j); return Math.hypot(ax - bx, ay - by) >= (alta ? 2.3 : 1.2); }))
      ?? livres.find(i => !postas.includes(i));
    if (pos == null) break; const [x, y] = cellXY(pos);
    if (placePlant(s, x, y, tipo).ok) { postas.push(pos); n++; }
  }
  touch(h); return n;
}
// 1.8.3: com obra em andamento os animais esperam na lista "a caminho" (já pagos) e chegam de caminhão no fim
function encomendaGrupo(s, h, sp, n, espera) {
  const S = content(s).species[sp], out = [];
  for (let k = 0; k < n; k++) { if (s.money < S.custo) break; out.push(encomendar(s, sp, h, espera)); spend(s, 'animais', S.custo); }
  return out;
}
function chegaGrupo(s, h, sp, n) {
  const S = content(s).species[sp], novos = [];
  for (let k = 0; k < n; k++) {
    if (s.money < S.custo) break;
    const a = newAnimal(s, sp, h, true), same = s.animals.filter(b => b.hab === h.id && b.sp === sp);
    a.sex = same.filter(b => b.sex === 'M').length > same.filter(b => b.sex === 'F').length ? 'F' : 'M';
    s.animals.push(a); spend(s, 'animais', S.custo); novos.push(a);
  }
  touch(h); return novos;
}
// mobiliário na volta: poste a cada ~4 blocos, banco a cada ~6 (olhando para o caminho, de costas para fora) e uma lixeira no portão
function mobiliarioNaVolta(s, anel, r, gate, gratis = false) {
  const C = content(s), F = C.furniture || {}, ocup = new Set(s.furn.map(f => idx(f.tx, f.ty))), gi = gate ? anel.findIndex(([x, y]) => x === gate[0] && y === gate[1]) : -1;
  const fora = (x, y) => { const L = []; if (y < r.y) L.push('N'); if (y >= r.y + r.h) L.push('S'); if (x < r.x) L.push('O'); if (x >= r.x + r.w) L.push('L'); return L; };
  const lado = (x, y) => { const pref = fora(x, y); const ok = SIDES.filter(sd => { const a = x + sd.dx, b = y + sd.dy; return inMap(a, b) && !isPathT(s.terrain[idx(a, b)]); }); return ok.find(sd => pref.includes(sd.k)) || ok.find(sd => !s._occ.hab[idx(x + sd.dx, y + sd.dy)]) || ok[0] || null; };
  let custo = 0;
  const por = (tipo, k) => {
    const [x, y] = anel[k % anel.length], i = idx(x, y); if (!F[tipo] || ocup.has(i) || !isPath(s, x, y) || (gate && x === gate[0] && y === gate[1])) return false;
    const sd = lado(x, y); if (!sd) return false; const c = gratis ? 0 : F[tipo].custo; if (s.money < c) return false;
    addFurn(s, tipo, x, y, sd); ocup.add(i); if (c) spend(s, 'construcao', c); custo += c; return true;
  };
  const off = gi >= 0 ? gi : 0;
  if (gi >= 0) { por('lixeira', gi + 1) || por('lixeira', gi + anel.length - 1); }
  for (let k = 0; k < Math.floor(anel.length / PASSO_BANCO); k++) { const b = off + 3 + k * PASSO_BANCO; por('banco', b) || por('banco', b + 1); }
  for (let k = 0; k < Math.floor(anel.length / PASSO_POSTE); k++) { const b = off + 2 + k * PASSO_POSTE; por('poste', b) || por('poste', b + 1); }
  return custo;
}
// canteiros: plantas baixas nos 4 cantos de fora e dos dois lados da frente do portão
function canteiros(s, r, h, bioma) {
  const baixas = plantasDoBioma(s, bioma, false); if (!baixas.length) return 0;
  const pts = [[r.x - 2, r.y - 2], [r.x + r.w + 1, r.y - 2], [r.x - 2, r.y + r.h + 1], [r.x + r.w + 1, r.y + r.h + 1]];
  if (h) { const [dx, dy] = DIRS[h.side], [ox, oy] = h.gateOut; pts.push(dx ? [ox + dx, oy - 1] : [ox - 1, oy + dy], dx ? [ox + dx, oy + 1] : [ox + 1, oy + dy]); }
  let n = 0;
  for (const [k, [x, y]] of pts.entries()) { if (!inMap(x, y) || s._occ.hab[idx(x, y)]) continue; if (placePlant(s, x, y, baixas[k % baixas.length]).ok) n++; }
  return n;
}
// constrói o plano (refaz a checagem antes, porque o mapa pode ter mudado)
export function construirRapido(s, sp, tx, ty, opts = {}) {
  const p = planoRapido(s, sp, tx, ty, opts); if (!p.ok) return p;
  const C = content(s), { rect: r, nec, anel } = p, S = nec.S;
  aplainar(s, r);
  for (const [x, y] of [...anel, ...(p.ligacao?.tiles || [])]) if (!isPathT(s.terrain[idx(x, y)])) paintTerrain(s, x, y, CAMINHO_RAPIDO);
  const hb = placeHabitat(s, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, nec.biome, nec.fence, { obra: !!opts.obra, now: opts.now });
  if (!hb.ok) return hb;
  calaUltimoLog(s);
  const h = hb.hab, plural = nomePlural(s, sp), art = artigoPlural(s, sp);
  let nome = `Recinto ${art} ${plural}`; for (let k = 2; s.habitats.some(o => o !== h && o.name === nome); k++) nome = `Recinto ${art} ${plural} ${k}`;
  h.name = nome.slice(0, 24); h.rapido = { sp, anel: true };
  portaoParaCaminho(s, h, p.ligacao?.liga);
  rebuildOcc(s);
  fazerLago(s, h, nec.agua, S);
  for (let k = 0; k < nec.tocas; k++) if (!fazerToca(s, h).ok) break;
  fazerPlantas(s, h, p.plantas);
  const ob = hb.obra; if (ob) { ob.custo = p.custos.recinto; ob.nome = h.name; }
  const novos = ob ? [] : chegaGrupo(s, h, sp, nec.min), espera = ob ? encomendaGrupo(s, h, sp, nec.min, [ob.id]) : [];
  mobiliarioNaVolta(s, anel, r, h.gateOut);
  canteiros(s, r, h, nec.biome);
  rebuildOcc(s); touch(h);
  const n = novos.length + espera.length, nomes = n === 1 ? S.nome.toLowerCase() : plural.toLowerCase(), aviso = p.semLigacao ? ' (o caminho em volta não ficou ligado à entrada: ligue com a ferramenta Caminho)' : '';
  logQuieto(s, ob ? `${h.name} em obra: ${n} ${nomes} a caminho${aviso}.` : `${h.name} pronto: ${n} ${nomes} chegaram${aviso}.`, 'bom');
  return R(true, '', { hab: h, animais: novos, aCaminho: espera, obra: ob || null, plano: p });
}

// a ficha/aviso da interface já conta a novidade: estes registros vão só para o histórico (sem aviso repetido)
function calaUltimoLog(s) { const L = s.log[s.log.length - 1]; if (s._events?.length && s._events[s._events.length - 1].msg === L?.msg) s._events.pop(); }
function logQuieto(s, msg, kind = 'bom') { log(s, msg, kind); calaUltimoLog(s); }
// ---------- ficha do recinto: lotação, +1, Ampliar e + outra espécie ----------
export function lotacao(s, h, sp) {
  const C = content(s), S = C.species[sp], I = habInfo(s, h), cont = { ...I.count };
  for (const e of aCaminhoDe(s, h.id)) cont[e.sp] = (cont[e.sp] || 0) + 1; // 1.8.3: quem está a caminho já conta
  let outros = 0; for (const [k, c] of Object.entries(cont)) if (k !== sp) outros += c * (C.species[k]?.espaco || 10);
  const porEspaco = Math.max(0, Math.floor((I.land + 0.5 * I.water - outros) / (S.espaco || 10)));
  const n = cont[sp] || 0, vem = aCaminhoDe(s, h.id, sp).length, max = S.social?.max || 99, cap = Math.min(max, porEspaco);
  return { n, vem, cap: Math.max(n, cap), max, porEspaco, cheio: n >= max ? 'grupo' : n >= porEspaco ? 'espaco' : null };
}
const usaToca = S => !S.rotina || S.rotina.dormeEm === 'toca' || S.tracos?.perigoso;
// tocas que o recinto precisa: cada espécie ocupa as suas (2 por toca, ou 1 para os grandes e altos)
export function tocasNecessarias(s, h, extra = {}) {
  const C = content(s), cont = { ...extra }; if (!C.estruturas?.toca) return 0;
  for (const a of s.animals) if (a.hab === h.id || (a.habOrig === h.id && a.internado)) cont[a.sp] = (cont[a.sp] || 0) + 1;
  for (const e of aCaminhoDe(s, h.id)) cont[e.sp] = (cont[e.sp] || 0) + 1;
  let n = 0; for (const [sp, k] of Object.entries(cont)) if (C.species[sp] && usaToca(C.species[sp])) n += Math.ceil(k / tocaVagas(s, sp));
  return Math.min(TOCA_MAX, n);
}
function precisaToca(s, h, sp, mais = 1) {
  const C = content(s), S = C.species[sp]; if (!C.estruturas?.toca || !usaToca(S)) return false;
  const nT = tocasDe(s, h.id).length + tocasEmObra(s, h.id).length; return nT < TOCA_MAX && tocasNecessarias(s, h, { [sp]: mais }) > nT;
}
export function custoMaisUm(s, h, sp) { const C = content(s); return (C.species[sp]?.custo || 0) + (precisaToca(s, h, sp) ? C.estruturas.toca.custo : 0); }
export function maisUm(s, h, sp, opts = {}) {
  const C = content(s), S = C.species[sp]; if (!S) return R(false, 'Animal indisponível.');
  const L = lotacao(s, h, sp);
  if (L.cheio === 'grupo') return R(false, `Grupo completo: ${S.nome.toLowerCase()} vive em grupos de até ${L.max}.`);
  if (L.cheio === 'espaco') return R(false, 'Sem espaço para mais um. Toque em Ampliar.');
  const custo = custoMaisUm(s, h, sp); if (s.money < custo) return R(false, `Custa ${BRL(custo)}. Dinheiro insuficiente.`);
  // 1.8.3: recinto em obra: espera a caminho; toca nova vira obra curta e o animal chega de caminhão quando ela ficar pronta
  if (h.obra) { if (precisaToca(s, h, sp)) fazerToca(s, h, opts); const [e] = encomendaGrupo(s, h, sp, 1, [h.obra]); if (!e) return R(false, 'Dinheiro insuficiente.'); logQuieto(s, `${S.nome} (${e.sex === 'M' ? 'macho' : 'fêmea'}) a caminho do ${h.name}.`); return R(true, `${S.nome} a caminho: chega de caminhão quando a obra terminar!`, { aCaminho: e }); }
  let toca = false, obraToca = null;
  if (precisaToca(s, h, sp)) { const t = fazerToca(s, h, { obra: !!opts.obra, now: opts.now }); toca = t.ok; obraToca = t.obra || null; }
  if (obraToca) { const [e] = encomendaGrupo(s, h, sp, 1, [obraToca.id]); if (!e) return R(false, 'Dinheiro insuficiente.'); logQuieto(s, `${S.nome} (${e.sex === 'M' ? 'macho' : 'fêmea'}) a caminho do ${h.name} (toca nova em obra).`); return R(true, `Toca nova em obra (3 min). ${S.nome} chega de caminhão quando ela ficar pronta!`, { aCaminho: e, obra: obraToca }); }
  const [a] = chegaGrupo(s, h, sp, 1); if (!a) return R(false, 'Dinheiro insuficiente.');
  logQuieto(s, `${a.name} (${S.nome}, ${a.sex === 'M' ? 'macho' : 'fêmea'}) chegou ao ${h.name}.`);
  return R(true, `${a.name} chegou${toca ? ' (com uma toca nova)' : ''}!`, { animal: a });
}
// Ampliar sozinho: encosta uma faixa num dos lados (de preferência longe do portão). No recinto da construção rápida o
// caminho daquele lado vai para fora junto, com mobiliário novo; nos outros, só entra em blocos livres.
function faixas(h, dep) {
  const x0 = h.x, y0 = h.y, x1 = h.x + h.w - 1, y1 = h.y + h.h - 1;
  return {
    N: { r: { x: x0, y: y0 - dep, w: h.w, h: dep }, anelVelho: y0 - 1, linha: [...Array(h.w + 2).keys()].map(k => [x0 - 1 + k, y0 - dep - 1]), cols: [...Array(dep).keys()].flatMap(k => [[x0 - 1, y0 - 1 - k], [x1 + 1, y0 - 1 - k]]) },
    S: { r: { x: x0, y: y1 + 1, w: h.w, h: dep }, anelVelho: y1 + 1, linha: [...Array(h.w + 2).keys()].map(k => [x0 - 1 + k, y1 + dep + 1]), cols: [...Array(dep).keys()].flatMap(k => [[x0 - 1, y1 + 1 + k], [x1 + 1, y1 + 1 + k]]) },
    O: { r: { x: x0 - dep, y: y0, w: dep, h: h.h }, anelVelho: x0 - 1, linha: [...Array(h.h + 2).keys()].map(k => [x0 - dep - 1, y0 - 1 + k]), cols: [...Array(dep).keys()].flatMap(k => [[x0 - 1 - k, y0 - 1], [x0 - 1 - k, y1 + 1]]) },
    L: { r: { x: x1 + 1, y: y0, w: dep, h: h.h }, anelVelho: x1 + 1, linha: [...Array(h.h + 2).keys()].map(k => [x1 + dep + 1, y0 - 1 + k]), cols: [...Array(dep).keys()].flatMap(k => [[x1 + 1 + k, y0 - 1], [x1 + 1 + k, y1 + 1]]) },
  };
}
export function planoAmpliar(s, h, blocos) {
  const C = content(s); if (C.fences[h.fence]?.fosso) return R(false, 'Ilhas não podem ser ampliadas.');
  if (h.obra) return R(false, `O ${h.name} ainda está em obra. Espere ficar pronto para ampliar.`);
  if (ampliacaoDe(s, h.id)) return R(false, `O ${h.name} já tem uma ampliação em obra.`);
  const anelado = !!h.rapido?.anel, opostos = { N: 'S', S: 'N', L: 'O', O: 'L' };
  const ordem = [opostos[h.side], ...(h.side === 'N' || h.side === 'S' ? ['L', 'O'] : ['N', 'S']), h.side];
  const okAnel = (x, y) => { if (!inMap(x, y) || !inArea(s, x, y) || muroAt(x, y)) return false; const i = idx(x, y); return !s._occ.hab[i] && !s._occ.fac[i] && !s._occ.toca?.[i] && !s._occ.obra?.[i] && s.terrain[i] !== 'w'; };
  let ultimo = R(false, 'Não há espaço livre em volta para ampliar. Use Construir > Habitat > Ampliar para escolher o lugar.');
  for (const d of ordem) {
    const lado = d === 'N' || d === 'S' ? h.w : h.h, dep = Math.max(1, Math.min(8, Math.ceil(blocos / lado))), F = faixas(h, dep)[d], r = F.r;
    if ((d === 'N' || d === 'S' ? h.h : h.w) + dep > 28) continue;
    const tiles = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles.push([x, y]);
    const daVolta = (x, y) => (d === 'N' || d === 'S') ? y === F.anelVelho : x === F.anelVelho;
    let bom = tiles.every(([x, y]) => okAnel(x, y) && (!isPathT(s.terrain[idx(x, y)]) || (anelado && daVolta(x, y))));
    if (bom && anelado) bom = [...F.linha, ...F.cols].every(([x, y]) => okAnel(x, y) || (inMap(x, y) && tiles.some(t => t[0] === x && t[1] === y)));
    if (!bom) continue;
    // simula sem o caminho velho para saber o custo da cerca nova
    const apagar = anelado ? tiles.filter(([x, y]) => isPathT(s.terrain[idx(x, y)])) : [], antes = apagar.map(([x, y]) => s.terrain[idx(x, y)]);
    for (const [x, y] of apagar) s.terrain[idx(x, y)] = 'g';
    const c = checkExpand(s, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1);
    apagar.forEach(([x, y], k) => { s.terrain[idx(x, y)] = antes[k]; });
    if (!c.cells?.length || c.hab?.id !== h.id || (!c.ok && !/insuficiente/.test(c.msg))) { ultimo = R(false, c.msg || ultimo.msg); continue; }
    const T = C.terrains[CAMINHO_RAPIDO]?.custo || 20, novos = anelado ? [...F.linha, ...F.cols].filter(([x, y]) => !isPathT(s.terrain[idx(x, y)]) && !tiles.some(t => t[0] === x && t[1] === y)) : [];
    const custo = (c.cost || 0) + novos.length * T + (anelado ? Math.floor(F.linha.length / PASSO_POSTE) * (C.furniture?.poste?.custo || 0) + Math.floor(F.linha.length / PASSO_BANCO) * (C.furniture?.banco?.custo || 0) : 0);
    const extra = { lado: d, rect: r, tiles, apagar, novos, linha: F.linha, custo, blocos: tiles.length };
    if (s.money < custo) return R(false, `Ampliar custa ${BRL(custo)}. Dinheiro insuficiente.`, extra);
    return R(true, `+${tiles.length} blocos · ${BRL(custo)}`, extra);
  }
  return ultimo;
}
export function blocosParaMais(s, h, sp, mais = 3) { const S = content(s).species[sp], L = lotacao(s, h, sp); return Math.max(4, (Math.max(L.n, L.porEspaco) + mais - L.porEspaco) * (S?.espaco || 10)); } // espaço para mais 3 além do que já cabe
export function ampliarRapido(s, h, blocos, opts = {}) {
  const p = planoAmpliar(s, h, blocos); if (!p.ok) return p;
  for (const [x, y] of p.apagar) { const i = idx(x, y); s.terrain[i] = 'g'; delete s.litter[i]; removeFurnAt(s, x, y); }
  rebuildOcc(s);
  const r = p.rect, e = expandHabitat(s, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, { obra: !!opts.obra, now: opts.now });
  if (!e.ok) { for (const [x, y] of p.apagar) paintTerrain(s, x, y, CAMINHO_RAPIDO); return e; }
  calaUltimoLog(s);
  if (h.rapido?.anel) {
    for (const [x, y] of p.novos) paintTerrain(s, x, y, CAMINHO_RAPIDO);
    // com obra o recinto só cresce no fim: o caminho novo já contorna a faixa reservada
    const x0 = Math.min(h.x, r.x), y0 = Math.min(h.y, r.y), rr = { x: x0, y: y0, w: Math.max(h.x + h.w, r.x + r.w) - x0, h: Math.max(h.y + h.h, r.y + r.h) - y0 }, anel = anelDe(rr);
    mobiliarioNaVolta(s, p.linha, rr, null);
    // caminho continua ligado à entrada? se a faixa cortou a ligação, refaz
    const dentro = new Set([...ensureCells(h), ...p.tiles.filter(([x, y]) => inMap(x, y)).map(([x, y]) => idx(x, y))]), lg = ligacao(s, anel, dentro);
    if (lg) for (const [x, y] of lg.tiles) paintTerrain(s, x, y, CAMINHO_RAPIDO);
  }
  rebuildOcc(s); touch(h);
  return R(true, e.obra ? `Ampliação do ${h.name} em obra (+${p.blocos} blocos).` : `${h.name} ampliado em ${p.blocos} blocos.`, { hab: h, plano: p, obra: e.obra || null });
}
// + outra espécie: só as que combinam com o recinto (mesmo bioma, cerca que segura, água que basta, sem predador com presa)
export function especiesCompativeis(s, h) {
  const C = content(s), I = habInfo(s, h), F = C.fences[h.fence] || {}, aqui = [...new Set([...Object.keys(I.count), ...aCaminhoDe(s, h.id).map(e => e.sp)])];
  const carn = aqui.some(k => C.species[k]?.dieta === 'Carnívoro'), presa = aqui.some(k => C.species[k] && C.species[k].dieta !== 'Carnívoro');
  const out = [];
  for (const [sp, S] of Object.entries(C.species)) {
    if (aqui.includes(sp) || S.inativo || S.bioma !== h.biome) continue;
    const B = S.barreira || {}; let motivo = '';
    if ((S.dieta === 'Carnívoro' && presa) || (S.dieta !== 'Carnívoro' && carn)) continue;
    if (!F.fosso && (F.altura < (B.altura || 0) || F.resistencia < (B.resistencia || 0))) motivo = 'cerca fraca demais';
    else if (sobeArvore(s, sp) && !F.teto && !F.fosso) motivo = 'precisa de viveiro com tela';
    else if ((S.agua || 0) > I.water || (S.aguaFunda || 0) > I.deep) motivo = 'precisa de lago';
    const min = Math.max(1, S.social?.min || 1);
    out.push({ sp, S, min, custo: min * (S.custo || 0), motivo });
  }
  return out.sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || a.custo - b.custo);
}
export function planoOutraEspecie(s, h, sp) {
  const C = content(s), S = C.species[sp], c = especiesCompativeis(s, h).find(o => o.sp === sp);
  if (!c) return R(false, 'Essa espécie não combina com este recinto.'); if (c.motivo) return R(false, `Não dá: ${c.motivo}.`);
  if (h.obra) return R(false, `Espere a obra do ${h.name} terminar.`); if (ampliacaoDe(s, h.id)) return R(false, `Espere a ampliação do ${h.name} terminar.`);
  const L = lotacao(s, h, sp), falta = Math.max(0, (c.min - L.porEspaco) * (S.espaco || 10));
  const amp = falta ? planoAmpliar(s, h, falta) : null;
  if (amp && !amp.ok) return R(false, `Falta espaço para ${c.min} ${c.min === 1 ? S.nome.toLowerCase() : nomePlural(s, sp).toLowerCase()} e ${amp.msg.charAt(0).toLowerCase() + amp.msg.slice(1)}`);
  const I = habInfo(s, h), have = S.plantasAltas ? (I.tall[S.bioma] || 0) : (I.plants[S.bioma] || 0), altas = plantasDoBioma(s, S.bioma, !!S.plantasAltas);
  const plantas = []; for (let k = have; k < (S.plantas || 0) && altas.length; k++) plantas.push(altas[k % altas.length]);
  const nT = Math.max(0, tocasNecessarias(s, h, { [sp]: c.min }) - tocasDe(s, h.id).length - tocasEmObra(s, h.id).length);
  const custo = c.custo + (amp?.custo || 0) + plantas.reduce((t, p) => t + (C.plants[p]?.custo || 0), 0) + nT * (C.estruturas?.toca?.custo || 0);
  const extra = { sp, min: c.min, ampliar: amp, plantas, tocas: nT, custo };
  if (s.money < custo) return R(false, `Custa ${BRL(custo)}. Dinheiro insuficiente.`, extra);
  return R(true, `${c.min} ${c.min === 1 ? S.nome.toLowerCase() : nomePlural(s, sp).toLowerCase()}${amp ? ` + ampliar ${amp.blocos} blocos` : ''} · ${BRL(custo)}`, extra);
}
export function outraEspecie(s, h, sp, opts = {}) {
  const p = planoOutraEspecie(s, h, sp); if (!p.ok) return p;
  // 1.8.3: só vira obra quando precisa ampliar ou de toca nova; aí os animais esperam a caminho
  const o2 = { obra: !!opts.obra, now: opts.now }, espera = [];
  if (p.ampliar) { const a = ampliarRapido(s, h, p.ampliar.blocos, o2); if (!a.ok) return a; if (a.obra) espera.push(a.obra.id); }
  for (let k = 0; k < p.tocas; k++) { const t = fazerToca(s, h, o2); if (!t.ok) break; if (t.obra) espera.push(t.obra.id); }
  if (p.plantas.length) fazerPlantas(s, h, p.plantas);
  const S = content(s).species[sp], nm = n => n === 1 ? S.nome.toLowerCase() : nomePlural(s, sp).toLowerCase();
  if (espera.length) {
    const vem = encomendaGrupo(s, h, sp, p.min, espera);
    logQuieto(s, `${vem.length} ${nm(vem.length)} a caminho do ${h.name} (obra em andamento).`);
    return R(true, `Obra em andamento: ${vem.length} ${nm(vem.length)} ${vem.length === 1 ? 'chega' : 'chegam'} de caminhão quando ficar pronta!`, { animais: [], aCaminho: vem });
  }
  const novos = chegaGrupo(s, h, sp, p.min);
  logQuieto(s, `${novos.length} ${nm(novos.length)} chegaram ao ${h.name}.`);
  return R(true, `${nomePlural(s, sp)} no ${h.name}!`, { animais: novos });
}
export { BRL as dinheiroRapido };
