// Construtor de modelos suaves a partir das especificações JSON (formas + esqueleto).
// Campo de distância com união suave -> malha por "surface nets" -> cores, oclusão e pesos de esqueleto.
// Não depende do three.js: pode rodar no navegador ou no node.

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const hex = h => { const n = parseInt(h.slice(1), 16); const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]; };
function rotInv(r) { // matriz inversa (transposta) de Euler XYZ
  const [a, b, c] = r || [0, 0, 0], ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const m = [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb];
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function prepare(spec, variant) {
  const tags = spec.tipo === 'humano' ? (spec.variantes[variant]?.tags || []) : [variant];
  const shapes = spec.formas.filter(s => !s.so || tags.includes(s.so)).map(s => {
    const o = { ...s };
    if (s.t === 'cap') { o.ba = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]]; o.bb = o.ba[0] ** 2 + o.ba[1] ** 2 + o.ba[2] ** 2 || 1e-9; o.len = Math.sqrt(o.bb); o.ax = o.ba.map(v => v / o.len); }
    else { o.m = rotInv(s.rot); }
    const R = s.t === 'cap' ? Math.max(...s.r) : Math.max(...s.r);
    const pts = s.t === 'cap' ? [s.a, s.b] : [s.c];
    o.min = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])) - R - (s.ruido || 0) - 0.02);
    o.max = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])) + R + (s.ruido || 0) + 0.02);
    return o;
  });
  const cores = spec.tipo === 'humano' ? spec.variantes[variant].cores : spec.cores;
  return { shapes, cores };
}
function dShape(o, x, y, z) {
  let d;
  if (o.t === 'cap') {
    const px = x - o.a[0], py = y - o.a[1], pz = z - o.a[2];
    let t = (px * o.ba[0] + py * o.ba[1] + pz * o.ba[2]) / o.bb; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - o.ba[0] * t, qy = py - o.ba[1] * t, qz = pz - o.ba[2] * t;
    d = Math.sqrt(qx * qx + qy * qy + qz * qz) - (o.r[0] + (o.r[1] - o.r[0]) * t);
  } else {
    const px = x - o.c[0], py = y - o.c[1], pz = z - o.c[2], m = o.m;
    const lx = (m[0] * px + m[1] * py + m[2] * pz) / o.r[0], ly = (m[3] * px + m[4] * py + m[5] * pz) / o.r[1], lz = (m[6] * px + m[7] * py + m[8] * pz) / o.r[2];
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz), k1 = Math.sqrt((lx / o.r[0]) ** 2 + (ly / o.r[1]) ** 2 + (lz / o.r[2]) ** 2) || 1e-9;
    d = (k0 * (k0 - 1)) / k1;
  }
  if (o.ruido) d += (noise3(x * 22, y * 22, z * 22) - 0.5) * 2 * o.ruido;
  return d;
}
function field(P, x, y, z) {
  let d = 1e9;
  for (const o of P.shapes) {
    if (x < o.min[0] - 0.1 || y < o.min[1] - 0.1 || z < o.min[2] - 0.1 || x > o.max[0] + 0.1 || y > o.max[1] + 0.1 || z > o.max[2] + 0.1) continue;
    d = smin(d, dShape(o, x, y, z), o.k);
  }
  return d;
}

function vor(x, y, z, c) { // Voronoi 3D: F1, F2 e id da célula
  const X = x / c, Y = y / c, Z = z / c, xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z);
  let f1 = 9, f2 = 9, id = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    const px = cx + hash3(cx, cy, cz), py = cy + hash3(cy, cz, cx + 7), pz = cz + hash3(cz, cx, cy + 13);
    const d = Math.hypot(X - px, Y - py, Z - pz);
    if (d < f1) { f2 = f1; f1 = d; id = hash3(cx, cy, cz + 3); } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
function shapeColor(spec, P, o, x, y, z, nx, ny, nz) {
  const C = P.cores; let c = (C[o.cor] || C.base || [0.5, 0.5, 0.5]).slice();
  if (o.ventre && ny < -0.15 && C.ventre) { const t = Math.min(1, (-ny - 0.15) * 1.6); for (let i = 0; i < 3; i++) c[i] += (C.ventre[i] - c[i]) * t; }
  const pd = spec.padrao, pad = o.padrao;
  if (pad && pd?.tipo === 'listras' && C.listra) {
    let u, per = pd.periodo, w = pd.largura;
    if (pad === 'listrasCorpo') { u = z < -0.2 ? z * 0.8 - (y - 1.0) * 0.35 : z + (y - 1.0) * 0.1; }
    else if (o.t === 'cap') { u = (x - o.a[0]) * o.ax[0] + (y - o.a[1]) * o.ax[1] + (z - o.a[2]) * o.ax[2]; per *= y < 0.45 ? 0.55 : 0.8; }
    else u = z;
    u += (noise3(x * 6, y * 6, z * 6) - 0.5) * pd.ondula * 4;
    const f = u / per - Math.floor(u / per);
    if (f < w && !(o.ventre && ny < -0.75)) c = C.listra.slice();
  }
  if (pad && pd?.tipo === 'manchas') {
    const cell = pad === 'manchasPerna' ? pd.celula * 0.6 : pd.celula;
    const [f1, f2, id] = vor(x, y * 0.85, z, cell);
    const line = (f2 - f1) * cell < pd.linha * (pad === 'manchasPerna' ? 1.4 : 1);
    if (line || (pad === 'manchasPerna' && y < 0.75) || (o.ventre && ny < -0.6)) c = C.claro.slice();
    else { const v = 0.8 + id * 0.4; c = c.map(k => k * v); }
  }
  if (o.aneis) { const u = (x - o.a[0]) * o.ax[0] + (y - o.a[1]) * o.ax[1] + (z - o.a[2]) * o.ax[2]; const r = 0.82 + 0.18 * Math.abs(Math.sin(u * 70)); c = c.map(k => k * r); }
  return c;
}

export function buildMesh(spec, variant = 'M') {
  const P = prepare(spec, variant);
  P.cores = Object.fromEntries(Object.entries(P.cores).map(([k, v]) => [k, hex(v)]));
  const cell = spec.celula;
  const mn = [0, 1, 2].map(i => Math.min(...P.shapes.map(s => s.min[i])) - cell * 2);
  const mx = [0, 1, 2].map(i => Math.max(...P.shapes.map(s => s.max[i])) + cell * 2);
  const n = mn.map((v, i) => Math.ceil((mx[i] - v) / cell));
  const [nx, ny, nz] = n, sx = nx + 1, sy = ny + 1, sxy = sx * sy;
  const vals = new Float32Array(sx * sy * (nz + 1));
  for (let k = 0; k <= nz; k++) { const z = mn[2] + k * cell; for (let j = 0; j <= ny; j++) { const y = mn[1] + j * cell; for (let i = 0; i <= nx; i++) vals[i + j * sx + k * sxy] = field(P, mn[0] + i * cell, y, z); } }
  // vértices: um por célula cortada pela superfície
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = vals[(i + (c & 1)) + (j + ((c >> 1) & 1)) * sx + (k + (c >> 2)) * sxy]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, cnt = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      ax += (a & 1) + (((b & 1) - (a & 1)) * t); ay += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); az += (a >> 2) + (((b >> 2) - (a >> 2)) * t); cnt++;
    }
    vid[i + j * nx + k * nx * ny] = pos.length / 3;
    pos.push(mn[0] + (i + ax / cnt) * cell, mn[1] + (j + ay / cnt) * cell, mn[2] + (k + az / cnt) * cell);
  }
  // faces: uma quad por aresta da grade que cruza a superfície
  const idx = [], cid = (i, j, k) => vid[i + j * nx + k * nx * ny];
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const p = [i, j, k], v0 = vals[i + j * sx + k * sxy];
    for (let d = 0; d < 3; d++) {
      const q = p.slice(); q[d]++; if (q[d] > n[d]) continue;
      const v1 = vals[q[0] + q[1] * sx + q[2] * sxy]; if ((v0 < 0) === (v1 < 0)) continue;
      const u = (d + 1) % 3, w = (d + 2) % 3;
      if (p[u] < 1 || p[w] < 1 || p[u] >= n[u] || p[w] >= n[w] || p[d] >= n[d]) continue;
      const c = (du, dw) => { const r = p.slice(); r[u] -= du; r[w] -= dw; return cid(r[0], r[1], r[2]); };
      const a = c(1, 1), b = c(0, 1), cc = c(0, 0), dd = c(1, 0);
      if (a < 0 || b < 0 || cc < 0 || dd < 0) continue;
      if (v0 < 0) idx.push(a, b, cc, a, cc, dd); else idx.push(a, cc, b, a, dd, cc);
    }
  }
  // normais pelo gradiente, cores, oclusão e pesos
  const V = pos.length / 3, nor = new Float32Array(V * 3), col = new Float32Array(V * 3), si = new Uint16Array(V * 4), sw = new Float32Array(V * 4);
  const boneIx = Object.fromEntries(spec.ossos.map((b, i) => [b.nome, i]));
  const e = cell * 0.5, ao1 = cell * 3, ao2 = cell * 7, blend = cell * 1.2, sig = Math.max(0.012, cell * 2.5);
  const dist = new Float32Array(P.shapes.length);
  for (let v = 0; v < V; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = field(P, x + e, y, z) - field(P, x - e, y, z), gy = field(P, x, y + e, z) - field(P, x, y - e, z), gz = field(P, x, y, z + e) - field(P, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    let dmin = 1e9; for (let s = 0; s < P.shapes.length; s++) { const o = P.shapes[s]; const d = (x < o.min[0] || y < o.min[1] || z < o.min[2] || x > o.max[0] || y > o.max[1] || z > o.max[2]) ? 9 : dShape(o, x, y, z); dist[s] = d; if (d < dmin) dmin = d; }
    let cr = 0, cg = 0, cb = 0, cw = 0; const bw = new Float32Array(spec.ossos.length);
    for (let s = 0; s < P.shapes.length; s++) {
      const dd = dist[s] - dmin; if (dd > sig * 6) continue; const o = P.shapes[s];
      const wb = Math.exp(-dd / sig); bw[boneIx[o.osso]] += wb;
      if (dd < blend * 5) { const wc = Math.exp(-dd / blend); const c = shapeColor(spec, P, o, x, y, z, gx, gy, gz); cr += c[0] * wc; cg += c[1] * wc; cb += c[2] * wc; cw += wc; }
    }
    const a1 = Math.min(1, Math.max(0, field(P, x + gx * ao1, y + gy * ao1, z + gz * ao1) / ao1)), a2 = Math.min(1, Math.max(0, field(P, x + gx * ao2, y + gy * ao2, z + gz * ao2) / ao2));
    const ao = 0.45 + 0.55 * Math.pow(a1 * 0.5 + a2 * 0.5, 0.8);
    const fur = 0.9 + 0.2 * noise3(x * 25, y * 25, z * 25), lift = 0.92 + 0.08 * Math.max(0, gy);
    const m = (ao * fur * lift) / (cw || 1);
    col[v * 3] = cr * m; col[v * 3 + 1] = cg * m; col[v * 3 + 2] = cb * m;
    const top = [...bw.keys()].sort((a, b) => bw[b] - bw[a]).slice(0, 4); const tot = top.reduce((t, b) => t + bw[b], 0) || 1;
    top.forEach((b, i) => { si[v * 4 + i] = b; sw[v * 4 + i] = bw[b] / tot; });
  }
  // corrige a orientação dos triângulos pela normal do campo
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  return { position: new Float32Array(pos), normal: nor, color: col, skinIndex: si, skinWeight: sw, index: V > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), ossos: spec.ossos, extras: spec.extras || [], vertices: V, triangulos: idx.length / 3 };
}
