// 1.8.3b: lagos — cavar (alturas do fundo) e aterrar e nivelar (terraplanagem).
// Só depende do mapa (grid.js), para obras.js e rapido.js poderem usar sem importar um ao outro.
import { MAP, idx, inMap, ci, WATER_Y, isPathT } from './grid.js';

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cellXY = i => [i % MAP, (i / MAP) | 0];
// cantos (s.height) de uma lista de blocos
export function cantosDe(cells) { const out = new Set(); for (const i of cells) { const [x, y] = cellXY(i); for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) out.add(ci(a, b)); } return out; }
const blocosDoCanto = k => { const cx = k % (MAP + 1), cy = (k / (MAP + 1)) | 0; return [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].filter(([a, b]) => inMap(a, b)).map(([a, b]) => idx(a, b)); };

// fundo do lago: raso (-0,55) para quem só vadeia ou para o lago de enfeite; com parte funda para quem precisa de banho
export function cavar(s, lago, S = {}, opts = {}) {
  if (!s.height || !lago.length) return;
  const L = new Set(lago), cantos = cantosDe(lago);
  const raso = opts.raso || ((S.aguaMax ?? 1) < 0.65 && !S.tracos?.nada), fundo = !opts.raso && !!S.aguaFunda;
  for (const k of cantos) {
    const todos = blocosDoCanto(k).length === 4 && blocosDoCanto(k).every(i => L.has(i));
    s.height[k] = raso ? -0.55 : fundo && todos ? (S.aguaModo === 'anfibio' ? -2.6 : -2.0) : todos ? -1.0 : -0.8;
  }
  // água funda que a espécie pede: aprofunda os cantos mais cercados de água até bastar
  if (fundo) for (const [viz, v] of [[3, -1.9], [2, -1.7], [2, -2.2]]) {
    const fundos = lago.filter(i => { const [x, y] = cellXY(i); return WATER_Y - (s.height[ci(x, y)] + s.height[ci(x + 1, y)] + s.height[ci(x, y + 1)] + s.height[ci(x + 1, y + 1)]) / 4 > 1.0; }).length;
    if (fundos >= S.aguaFunda) break;
    for (const k of cantos) { const n = blocosDoCanto(k).filter(i => L.has(i)).length; if (n >= viz) s.height[k] = Math.min(s.height[k], v); }
  }
  s._hver = (s._hver || 0) + 1;
}

// lago que sobra fora de recintos: blocos de água ligados ao bloco (sem passar por recinto nem obra)
export function lagoLivre(s, tx, ty) {
  if (!inMap(tx, ty)) return []; const i0 = idx(tx, ty), O = s._occ;
  const ok = i => s.terrain[i] === 'w' && !O?.hab?.[i] && !O?.obra?.[i];
  if (!ok(i0)) return [];
  const seen = new Set([i0]), q = [i0];
  for (let k = 0; k < q.length; k++) { const [x, y] = cellXY(q[k]); for (const [dx, dy] of DIR4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (!seen.has(j) && ok(j)) { seen.add(j); q.push(j); } } }
  return q;
}

// terreno que o bloco aterrado recebe: o chão seco mais comum em volta (o do bioma do recinto que existia), ou grama
function chaoEmVolta(s, cells) {
  const L = new Set(cells), conta = {};
  for (const i of cells) { const [x, y] = cellXY(i); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny), t = s.terrain[j]; if (L.has(j) || t === 'w' || isPathT(t)) continue; conta[t] = (conta[t] || 0) + 1; } }
  return Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || 'g';
}

// aterrar e nivelar: vira chão seco e os cantos ficam na altura do chão em volta (alisado), sem degrau
export function aterrar(s, cells) {
  const lista = cells.filter(i => s.terrain[i] === 'w'); if (!lista.length) return 0;
  const chao = chaoEmVolta(s, lista);
  for (const i of lista) { s.terrain[i] = chao; delete s.litter?.[i]; }
  if (s.height) {
    const H = s.height, cantos = cantosDe(lista), molhado = k => blocosDoCanto(k).some(i => s.terrain[i] === 'w');
    // cantos que ainda encostam em água (lago aterrado só em parte) ficam como estão
    const livres = [...cantos].filter(k => !molhado(k));
    // borda: cantos vizinhos fora do aterro e secos (servem de referência)
    const ref = []; const fora = new Set();
    for (const k of livres) { const cx = k % (MAP + 1), cy = (k / (MAP + 1)) | 0; for (const [dx, dy] of DIR4) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx > MAP || ny > MAP) continue; const j = ci(nx, ny); if (!cantos.has(j) && !molhado(j)) { fora.add(j); } } }
    for (const j of fora) ref.push(H[j]);
    const media = ref.length ? ref.reduce((a, b) => a + b, 0) / ref.length : 0;
    const base = Math.max(media, WATER_Y + 0.12);
    for (const k of livres) H[k] = base;
    // alisa: cada canto vira a média dos 4 vizinhos (as bordas de fora ficam fixas)
    const L = new Set(livres);
    for (let it = 0; it < 24; it++) for (const k of livres) {
      const cx = k % (MAP + 1), cy = (k / (MAP + 1)) | 0; let t = 0, n = 0;
      for (const [dx, dy] of DIR4) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx > MAP || ny > MAP) continue; const j = ci(nx, ny); if (L.has(j) || fora.has(j)) { t += H[j]; n++; } }
      if (n) H[k] = Math.max(WATER_Y + 0.05, t / n);
    }
    for (const k of livres) H[k] = Math.round(H[k] * 100) / 100;
    s._hver = (s._hver || 0) + 1;
  }
  return lista.length;
}
