// 1.8.2: anatomia dos modelos do gráfico Ultra (bloco "ultra" de cada JSON).
// Mesmos nomes de ossos do Alto (as animações dependem deles), com as juntas das pernas no lugar anatômico,
// e formas mais detalhadas: escápula, cernelha, costelas, barriga recolhida, garupa, coxa, joelho, jarrete,
// boleto, casco, cabeça com testa, bochecha, focinho e narinas. op:'sub' cava vincos e narinas.
const R = a => a.map(v => +v.toFixed(4));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
// rotação (Euler XYZ) que leva o eixo y local para a direção d
const alinhaY = d => { d = norm(d); return [+Math.atan2(d[2], d[1]).toFixed(4), 0, +(-Math.asin(Math.max(-1, Math.min(1, d[0])))).toFixed(4)]; };
// rotação que leva o eixo z local para a direção (0, -sin a, cos a) (cabeça e pescoço)
const rotZ = a => [+a.toFixed(4), 0, 0];

function kit() {
  const ossos = [], formas = [], extras = [], J = {};
  const bone = (nome, pai, pos) => { ossos.push({ nome, pai, pos: R(pos) }); J[nome] = pos; return pos; };
  const eli = (osso, c, r, o = {}) => formas.push({ t: 'eli', osso, c: R(c), r: R(r), k: o.k ?? 0.05, cor: o.cor || 'base', ...o });
  const cap = (osso, a, b, ra, rb, o = {}) => formas.push({ t: 'cap', osso, a: R(a), b: R(b), r: [+ra.toFixed(4), +rb.toFixed(4)], k: o.k ?? 0.04, cor: o.cor || 'base', ...o });
  const sub = (osso, c, r, o = {}) => eli(osso, c, r, { k: 0.02, ...o, op: 'sub' });
  const subCap = (osso, a, b, ra, rb, o = {}) => cap(osso, a, b, ra, rb, { k: 0.02, ...o, op: 'sub' });
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return { ossos, formas, extras, J, bone, eli, cap, sub, subCap, rnd, semente: s => { seed = s; } };
}
// copia do Alto os ossos que não mudam (coluna, pescoço, cabeça, cauda, orelhas, tromba)
function ossosBase(K, alto, pernas) {
  for (const b of alto) { if (/^perna/.test(b.nome)) { if (pernas[b.nome]) K.bone(b.nome, b.pai, pernas[b.nome]); else K.bone(b.nome, b.pai, b.pos); } else K.bone(b.nome, b.pai, b.pos); }
}
// moldura da cabeça: x lateral, u = topo da cara (testa), f = para a frente (focinho)
function cabeca(skull, dir) { const f = [0, -Math.sin(dir), Math.cos(dir)], u = [0, Math.cos(dir), Math.sin(dir)]; return (a, b, c) => add(skull, add([a, 0, 0], add(mul(u, b), mul(f, c)))); }
// pescoço: elipsoides achatados dos lados ao longo do eixo nb -> ne
export function pescoco(K, nb, ne, ry0, ry1, lat, o = {}) {
  const ang = Math.atan2(ne[1] - nb[1], ne[2] - nb[2]), len = Math.hypot(ne[1] - nb[1], ne[2] - nb[2]);
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, ry = ry0 + (ry1 - ry0) * t, c = lerp(nb, ne, t);
    K.eli(t < 0.5 ? 'pescoco' : 'pescoco2', add(c, [0, (o.papada ?? 0) * (1 - t), 0]), [ry * lat, ry, len / n * 1.35], { k: o.k ?? 0.07, rot: rotZ(-ang), ventre: true, padrao: o.padrao }); }
  return ang;
}

// ---------------- equinos (zebra; a girafa usa a mesma base) ----------------
export function equino(P, alto, U = {}) {
  const K = kit(), { eli, cap, sub, J } = K;
  const ch = P.chest, hp = P.hip, L = P.L, legF = P.legF, legH = P.legH, s = U.esc ?? 1;
  const zS = L / 2, zH = -L / 2;
  const chestC = [0, legF + ch[1] * 0.35, zS - ch[2] * 0.15], hipC = [0, legH + hp[1] * 0.4, zH + hp[2] * 0.15];
  const xF = ch[0] * 0.6, xH = hp[0] * 0.6, chao = P.foot.h;
  // pernas: dianteira = cotovelo, joelho (carpo), boleto; traseira = quadril, joelho (soldra), jarrete
  const fF = U.pernaF || [0.79, 0.42, 0.13], fH = U.pernaH || [0.92, 0.64, 0.4];
  const yTopF = chestC[1] - ch[1] * 0.85, yTopH = legH;
  const pernas = {};
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    pernas['pernaF' + sd + '1'] = [sx * xF, yTopF * fF[0] + 0.02, zS - 0.04];
    pernas['pernaF' + sd + '2'] = [sx * xF * 0.97, yTopF * fF[1], zS + 0.0];
    pernas['pernaF' + sd + '3'] = [sx * xF * 0.97, yTopF * fF[2], zS + 0.01];
    pernas['pernaT' + sd + '1'] = [sx * xH, yTopH * fH[0], zH + 0.02];
    pernas['pernaT' + sd + '2'] = [sx * xH * 1.04, yTopH * fH[1], zH + 0.16 * L];
    pernas['pernaT' + sd + '3'] = [sx * xH * 0.95, yTopH * fH[2], zH - 0.07 * L];
  }
  ossosBase(K, alto, pernas);
  const top = chestC[1] + ch[1] * 0.92, mid = lerp(chestC, hipC, 0.5);
  // tronco
  eli('peito', add(chestC, [0, -0.01, -ch[2] * 0.25]), [ch[0] * 0.93, ch[1] * 0.98, ch[2] * 1.1], { k: 0.1, ventre: true, padrao: U.pad?.corpo });
  eli('coluna', add(mid, [0, -0.03, 0.03]), [ch[0] * 0.97, ch[1] * 0.88, L * 0.36], { k: 0.12, ventre: true, padrao: U.pad?.corpo });
  eli('quadril', add(hipC, [0, hp[1] * 0.08, -0.02]), [hp[0] * 0.92, hp[1] * 0.88, hp[2] * 0.95], { k: 0.1, ventre: true, padrao: U.pad?.corpo });
  // linha de cima: cernelha alta, lombo, garupa arredondada
  cap('peito', [0, top + 0.01, chestC[2] + 0.03], [0, top - 0.035, mid[2]], 0.06, 0.07, { k: 0.08, padrao: U.pad?.corpo });
  cap('quadril', [0, top - 0.035, mid[2]], [0, hipC[1] + hp[1] * 0.78, hipC[2] + 0.02], 0.07, 0.085, { k: 0.08, padrao: U.pad?.corpo });
  cap('quadril', [0, hipC[1] + hp[1] * 0.78, hipC[2] + 0.02], [0, hipC[1] + hp[1] * 0.45, hipC[2] - hp[2] * 0.85], 0.085, 0.06, { k: 0.06, padrao: U.pad?.corpo });
  eli('peito', [0, top - 0.005, chestC[2] + 0.06], [0.06, 0.06, 0.13], { k: 0.06, padrao: U.pad?.corpo }); // cernelha
  // peito (frente) e escápulas
  eli('peito', add(chestC, [0, -ch[1] * 0.28, ch[2] * 0.78]), [ch[0] * 0.66, ch[1] * 0.55, 0.11], { k: 0.08, ventre: true, padrao: U.pad?.corpo });
  for (const sx of [-1, 1]) eli('peito', add(chestC, [sx * ch[0] * 0.74, ch[1] * 0.3, ch[2] * 0.38]), [0.045, ch[1] * 0.68, 0.09], { k: 0.07, rot: [-0.5, 0, 0], padrao: U.pad?.corpo });
  // vazio (flanco) entre a barriga e a coxa
  for (const sx of [-1, 1]) sub('coluna', add(mid, [sx * (ch[0] + 0.035), -ch[1] * 0.25, -L * 0.3]), [0.05, 0.08, 0.1], { k: 0.06 });
  // pernas
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    const F1 = J['pernaF' + sd + '1'], F2 = J['pernaF' + sd + '2'], F3 = J['pernaF' + sd + '3'], f = 'pernaF' + sd;
    const pad = { padrao: U.pad?.perna };
    cap(f + '1', add(chestC, [sx * ch[0] * 0.62, -ch[1] * 0.05, ch[2] * 0.62]), add(F1, [0, 0.03, -0.02]), 0.085 * s, 0.07 * s, { k: 0.06, ...pad }); // braço
    eli(f + '1', add(F1, [0, 0.0, -0.045]), [0.05 * s, 0.06 * s, 0.055 * s], { k: 0.04, ...pad }); // cotovelo
    cap(f + '1', F1, add(F2, [0, 0.03, 0]), 0.064 * s, 0.035 * s, { k: 0.04, ...pad }); // antebraço
    eli(f + '1', add(lerp(F1, F2, 0.28), [0, 0, 0.01]), [0.056 * s, (F1[1] - F2[1]) * 0.36, 0.06 * s], { k: 0.05, ...pad });
    eli(f + '2', F2, [0.037 * s, 0.042 * s, 0.035 * s], { k: 0.02, ...pad }); // joelho
    cap(f + '2', F2, F3, 0.028 * s, 0.025 * s, { k: 0.02, ...pad }); // canela
    cap(f + '2', add(F2, [0, -0.04, -0.017 * s]), add(F3, [0, 0.02, -0.017 * s]), 0.014 * s, 0.014 * s, { k: 0.015, ...pad }); // tendão
    pataCasco(K, f + '3', F3, sx, s, U, 0.02, pad);
    const T1 = J['pernaT' + sd + '1'], T2 = J['pernaT' + sd + '2'], T3 = J['pernaT' + sd + '3'], t = 'pernaT' + sd;
    eli(t + '1', add(lerp(T1, T2, 0.42), [sx * 0.005, 0, -0.045]), [hp[0] * 0.45, (T1[1] - T2[1]) * 0.75, hp[2] * 0.62], { k: 0.09, rot: [0.25, 0, 0], ...pad, padrao: U.pad?.coxa ?? U.pad?.perna }); // coxa
    eli(t + '1', add(T1, [0, -0.03, -hp[2] * 0.4]), [hp[0] * 0.42, hp[1] * 0.6, 0.09], { k: 0.08, ...pad, padrao: U.pad?.coxa ?? U.pad?.perna }); // nádega
    cap(t + '2', T2, add(T3, [0, 0.02, 0.01]), 0.068 * s, 0.038 * s, { k: 0.05, ...pad }); // perna (gaskin)
    eli(t + '2', add(lerp(T2, T3, 0.32), [0, 0, -0.025]), [0.05 * s, (T2[1] - T3[1]) * 0.35, 0.06 * s], { k: 0.05, ...pad });
    eli(t + '3', add(T3, [0, 0.0, 0.005]), [0.036 * s, 0.045 * s, 0.042 * s], { k: 0.02, ...pad }); // jarrete
    eli(t + '3', add(T3, [0, 0.025, -0.04 * s]), [0.025 * s, 0.04 * s, 0.025 * s], { k: 0.02, ...pad }); // ponta do jarrete
    const B = [T3[0], chao + 0.06, T3[2] + 0.02];
    cap(t + '3', T3, B, 0.029 * s, 0.026 * s, { k: 0.02, ...pad });
    cap(t + '3', add(T3, [0, -0.04, -0.018 * s]), add(B, [0, 0.02, -0.017 * s]), 0.014 * s, 0.014 * s, { k: 0.015, ...pad });
    pataCasco(K, t + '3', B, sx, s, U, 0.025, pad);
  }
  return K;
}
// boleto, quartela e casco (mais largo embaixo, base no chão)
function pataCasco(K, osso, B, sx, s, U, dz, pad) {
  const { eli, cap } = K, chao = 0;
  eli(osso, add(B, [0, -0.005, -0.012 * s]), [0.031 * s, 0.033 * s, 0.035 * s], { k: 0.02, ...pad }); // boleto
  const Q = [B[0], 0.05 * s, B[2] + dz * s];
  cap(osso, B, Q, 0.025 * s, 0.027 * s, { k: 0.015, ...pad }); // quartela
  cap(osso, add(Q, [0, 0.008, -0.004]), [B[0], chao - 0.004, Q[2] + 0.018 * s], 0.03 * s, (U.casco ?? 0.043) * s, { k: 0.006, cor: 'casco' }); // casco
}

export function cabecaEquina(K, P, alto, U = {}) {
  const { eli, cap, sub, J } = K, H = P.head, sk = H.skull, ne = J.cabeca, s = U.escCab ?? 1;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir), cl = (U.compCab ?? 1) * (sk[2] + H.muzzle.len) / 0.4, pad = U.pad?.cabeca;
  eli('cabeca', hp(0, 0.0, -0.03 * cl), [0.072 * s, 0.075 * s, 0.09 * cl], { k: 0.04, rot, padrao: pad }); // crânio
  eli('cabeca', hp(0, 0.03 * s, 0.05 * cl), [0.068 * s, 0.038 * s, 0.1 * cl], { k: 0.04, rot, padrao: pad }); // testa larga e plana
  for (const sx of [-1, 1]) {
    eli('cabeca', hp(sx * 0.042 * s, -0.05 * s, -0.01 * cl), [0.033 * s, 0.072 * s, 0.08 * cl], { k: 0.04, rot, padrao: pad }); // ganacha (bochecha)
    eli('cabeca', hp(sx * 0.058 * s, 0.03 * s, 0.0), [0.024 * s, 0.02 * s, 0.032 * s], { k: 0.025, rot, padrao: pad }); // arco do olho
    sub('cabeca', hp(sx * 0.07 * s, 0.0, 0.06 * cl), [0.014 * s, 0.02 * s, 0.05 * cl], { k: 0.03, rot }); // depressão abaixo do olho
  }
  eli('cabeca', hp(0, 0.0, 0.16 * cl), [0.05 * s, 0.047 * s, 0.13 * cl], { k: 0.04, rot, padrao: pad }); // chanfro
  eli('cabeca', hp(0, -0.012 * s, 0.29 * cl), [0.048 * s, 0.05 * s, 0.06 * cl], { k: 0.035, rot, cor: U.corFocinho || 'nariz' }); // focinho
  eli('cabeca', hp(0, -0.048 * s, 0.28 * cl), [0.038 * s, 0.026 * s, 0.05 * cl], { k: 0.02, rot, cor: U.corFocinho || 'nariz' }); // lábio
  eli('cabeca', hp(0, -0.068 * s, 0.22 * cl), [0.028 * s, 0.022 * s, 0.045 * cl], { k: 0.02, rot, cor: U.corQueixo || 'base', padrao: pad }); // queixo
  for (const sx of [-1, 1]) sub('cabeca', hp(sx * 0.028 * s, 0.018 * s, 0.335 * cl), [0.011 * s, 0.017 * s, 0.022 * s], { k: 0.012, rot }); // narinas
  for (const sx of [-1, 1]) K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.066 * s, 0.018 * s, 0.012 * cl)), r: +(0.017 * s).toFixed(4) });
  // orelhas em concha
  const E = U.orelha || { comp: P.ears.t * 0.55, larg: 0.034, esp: 0.016, abre: 0.4, tras: 0.25 };
  for (const sx of [-1, 1]) {
    const base = hp(sx * 0.038 * s, 0.065 * s, -0.085 * cl), d = norm([sx * E.abre, 1, -E.tras]), rot2 = alinhaY(d), c = add(base, mul(d, E.comp * 0.8));
    eli('cabeca', c, [E.esp, E.comp, E.larg], { k: 0.015, rot: rot2, padrao: pad });
    sub('cabeca', add(c, add(mul(norm([0, 0, 1]), E.larg * 0.55), mul(d, E.comp * 0.12))), [E.esp * 0.6, E.comp * 0.82, E.larg * 0.62], { k: 0.008, rot: rot2 });
  }
  const info = { skull, hp }; if (U.ossicones) ossiconesGirafa(K, info);
  return info;
}
export function crina(K, U) {
  const { eli, J } = K, nb = J.pescoco, ne = J.cabeca, ang = Math.atan2(ne[1] - nb[1], ne[2] - nb[2]), up = [0, Math.cos(ang), -Math.sin(ang)];
  const n = 6;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, c = add(lerp(nb, ne, t), mul(up, U.alt0 + (U.alt1 - U.alt0) * t)), len = Math.hypot(ne[1] - nb[1], ne[2] - nb[2]);
    eli(t < 0.5 ? 'pescoco' : 'pescoco2', c, [U.larg, U.h, len / n * 0.8], { k: 0.03, rot: rotZ(-ang), cor: U.cor || 'base', padrao: U.padrao }); }
}
export function caudaEquina(K, alto, P, U = {}) {
  const { cap, eli, J } = K, T = P.tail;
  for (let i = 1; i <= 3; i++) { const a = J['cauda' + i], b = i < 3 ? J['cauda' + (i + 1)] : add(a, mul(norm([0, -1, -0.1]), T.len / 3));
    cap('cauda' + i, a, b, T.r * (1.15 - i * 0.22), T.r * (1 - i * 0.22), { k: 0.02, cor: T.cor || 'base', padrao: U.padrao }); }
  const fim = add(J.cauda3, mul(norm([0, -1, -0.1]), T.len / 3));
  if (T.tufo) cap('cauda3', add(fim, [0, 0.03, 0]), add(fim, [0, -T.tufo * 2.2, -0.01]), T.tufo * 0.7, T.tufo * 0.25, { k: 0.02, cor: 'escuro', ruido: T.tufo * 0.25, tufo: true });
}

// ---------------- felinos (leão) ----------------
export function felino(P, alto, U = {}) {
  const K = kit(), { eli, cap, sub, J } = K;
  const ch = P.chest, hp = P.hip, L = P.L, legF = P.legF, legH = P.legH;
  const zS = L / 2, zH = -L / 2;
  const chestC = [0, legF + ch[1] * 0.35, zS - ch[2] * 0.15], hipC = [0, legH + hp[1] * 0.4, zH + hp[2] * 0.15];
  const xF = ch[0] * 0.56, xH = hp[0] * 0.58, mid = lerp(chestC, hipC, 0.5);
  const pernas = {};
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    pernas['pernaF' + sd + '1'] = [sx * xF, chestC[1] - ch[1] * 0.75, zS - 0.06];
    pernas['pernaF' + sd + '2'] = [sx * xF * 0.95, 0.19, zS - 0.01];
    pernas['pernaF' + sd + '3'] = [sx * xF * 0.95, 0.07, zS + 0.02];
    pernas['pernaT' + sd + '1'] = [sx * xH, legH * 0.98, zH + 0.0];
    pernas['pernaT' + sd + '2'] = [sx * xH * 1.08, legH * 0.62, zH + 0.15];
    pernas['pernaT' + sd + '3'] = [sx * xH * 0.95, legH * 0.3, zH - 0.08];
  }
  ossosBase(K, alto, pernas);
  const top = chestC[1] + ch[1] * 0.9;
  eli('peito', add(chestC, [0, -0.02, -ch[2] * 0.2]), [ch[0] * 0.86, ch[1] * 0.97, ch[2] * 1.05], { k: 0.1, ventre: true }); // tórax fundo
  eli('coluna', add(mid, [0, ch[1] * 0.12, 0.02]), [ch[0] * 0.74, ch[1] * 0.66, L * 0.34], { k: 0.12, ventre: true }); // cintura recolhida
  eli('coluna', add(mid, [0, -ch[1] * 0.42, -L * 0.2]), [ch[0] * 0.55, ch[1] * 0.22, L * 0.17], { k: 0.1, ventre: true }); // pele solta da barriga
  eli('quadril', add(hipC, [0, hp[1] * 0.1, 0]), [hp[0] * 0.9, hp[1] * 0.92, hp[2] * 0.82], { k: 0.1, ventre: true });
  cap('peito', [0, top, chestC[2] + 0.02], [0, top - 0.04, mid[2]], 0.055, 0.06, { k: 0.08 });
  cap('quadril', [0, top - 0.04, mid[2]], [0, hipC[1] + hp[1] * 0.75, hipC[2] + 0.04], 0.06, 0.075, { k: 0.08 });
  cap('quadril', [0, hipC[1] + hp[1] * 0.75, hipC[2] + 0.04], [0, hipC[1] + hp[1] * 0.4, hipC[2] - hp[2] * 0.8], 0.075, 0.05, { k: 0.06 });
  eli('peito', add(chestC, [0, -ch[1] * 0.3, ch[2] * 0.75]), [ch[0] * 0.66, ch[1] * 0.55, 0.11], { k: 0.08, ventre: true });
  for (const sx of [-1, 1]) {
    eli('peito', add(chestC, [sx * ch[0] * 0.6, ch[1] * 0.32, ch[2] * 0.3]), [0.045, ch[1] * 0.55, 0.09], { k: 0.1, rot: [-0.35, 0, 0] }); // escápula
    sub('coluna', add(mid, [sx * (ch[0] * 0.8 + 0.035), -ch[1] * 0.1, -L * 0.26]), [0.03, 0.07, 0.1], { k: 0.07 }); // flanco
  }
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    const F1 = J['pernaF' + sd + '1'], F2 = J['pernaF' + sd + '2'], F3 = J['pernaF' + sd + '3'], f = 'pernaF' + sd;
    cap(f + '1', add(chestC, [sx * ch[0] * 0.6, ch[1] * 0.05, ch[2] * 0.55]), add(F1, [0, 0.03, -0.01]), 0.1, 0.08, { k: 0.07 }); // braço
    eli(f + '1', add(F1, [0, 0, -0.04]), [0.06, 0.07, 0.06], { k: 0.05 });
    cap(f + '1', F1, add(F2, [0, 0.02, 0]), 0.078, 0.052, { k: 0.05 });
    eli(f + '1', add(lerp(F1, F2, 0.3), [0, 0, 0.012]), [0.07, (F1[1] - F2[1]) * 0.38, 0.072], { k: 0.06 });
    eli(f + '2', F2, [0.05, 0.045, 0.05], { k: 0.03 });
    cap(f + '2', F2, F3, 0.05, 0.05, { k: 0.03 });
    pata(K, f + '3', [F3[0], 0, F3[2] + 0.05], 1);
    const T1 = J['pernaT' + sd + '1'], T2 = J['pernaT' + sd + '2'], T3 = J['pernaT' + sd + '3'], t = 'pernaT' + sd;
    eli(t + '1', add(lerp(T1, T2, 0.45), [0, 0, -0.05]), [hp[0] * 0.44, (T1[1] - T2[1]) * 0.8, hp[2] * 0.6], { k: 0.09, rot: [0.3, 0, 0] });
    eli(t + '1', add(T1, [0, -0.02, -hp[2] * 0.38]), [hp[0] * 0.42, hp[1] * 0.6, 0.09], { k: 0.08 });
    cap(t + '2', T2, add(T3, [0, 0.02, 0.01]), 0.075, 0.045, { k: 0.05 });
    eli(t + '2', add(lerp(T2, T3, 0.3), [0, 0, -0.03]), [0.06, (T2[1] - T3[1]) * 0.36, 0.07], { k: 0.05 });
    eli(t + '3', add(T3, [0, 0.015, -0.035]), [0.033, 0.045, 0.034], { k: 0.025 }); // calcanhar
    const B = [T3[0], 0.065, T3[2] + 0.05];
    cap(t + '3', T3, B, 0.044, 0.045, { k: 0.03 });
    pata(K, t + '3', [B[0], 0, B[2] + 0.03], 0.92);
  }
  return K;
}
function pata(K, osso, P0, s) {
  const { eli } = K;
  eli(osso, add(P0, [0, 0.045 * s, -0.01]), [0.064 * s, 0.045 * s, 0.075 * s], { k: 0.03, cor: 'pata' });
  for (const dx of [-0.6, -0.2, 0.2, 0.6]) eli(osso, add(P0, [dx * 0.06 * s, 0.026 * s, 0.06 * s - Math.abs(dx) * 0.02]), [0.022 * s, 0.024 * s, 0.026 * s], { k: 0.012, cor: 'pata' });
}
export function cabecaFelina(K, P, U = {}) {
  const { eli, cap, sub, J } = K, H = P.head, sk = H.skull, ne = J.cabeca;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir);
  eli('cabeca', hp(0, 0.015, -0.02), [0.125, 0.105, 0.125], { k: 0.04, rot }); // crânio
  for (const sx of [-1, 1]) {
    eli('cabeca', hp(sx * 0.085, -0.03, 0.04), [0.06, 0.065, 0.075], { k: 0.04, rot }); // maçãs
    eli('cabeca', hp(sx * 0.05, 0.058, 0.07), [0.042, 0.024, 0.04], { k: 0.03, rot }); // sobrancelha
    eli('cabeca', hp(sx * 0.038, -0.045, 0.17), [0.044, 0.042, 0.045], { k: 0.03, rot, cor: 'focinho' }); // almofada dos bigodes
    sub('cabeca', hp(sx * 0.062, 0.025, 0.105), [0.022, 0.016, 0.022], { k: 0.02, rot }); // órbita
  }
  eli('cabeca', hp(0, 0.025, 0.12), [0.052, 0.04, 0.09], { k: 0.04, rot }); // dorso do nariz
  eli('cabeca', hp(0, -0.025, 0.14), [0.075, 0.062, 0.07], { k: 0.04, rot, cor: 'focinho' }); // focinho
  eli('cabeca', hp(0, 0.005, 0.21), [0.032, 0.025, 0.02], { k: 0.015, rot, cor: 'nariz' }); // trufa
  eli('cabeca', hp(0, -0.095, 0.11), [0.055, 0.035, 0.075], { k: 0.035, rot, cor: 'focinho' }); // queixo
  for (const sx of [-1, 1]) K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.06, 0.028, 0.105)), r: 0.016 });
  for (const sx of [-1, 1]) { const c = hp(sx * 0.085, 0.1, -0.06), d = norm([sx * 0.55, 1, -0.3]), r2 = alinhaY(d);
    eli('cabeca', add(c, mul(d, 0.02)), [0.024, 0.042, 0.04], { k: 0.02, rot: r2 });
    sub('cabeca', add(c, add(mul(d, 0.028), [0, 0, 0.022])), [0.012, 0.03, 0.028], { k: 0.01, rot: r2 }); }
  return { skull, hp };
}
// juba: volume por baixo + mechas que saem do pescoço e emolduram a cara
export function juba(K, info, U = {}) {
  const { eli, cap, J, rnd } = K, nb = J.pescoco, ne = J.cabeca, so = U.so || 'M';
  K.semente(41);
  const ang = Math.atan2(ne[1] - nb[1], ne[2] - nb[2]), ax = norm([0, Math.sin(ang), Math.cos(ang)]), up = [0, Math.cos(ang), -Math.sin(ang)];
  eli('pescoco2', add(lerp(nb, ne, 0.5), mul(up, 0.06)), [0.28, 0.3, 0.29], { k: 0.1, cor: 'juba', so, pelo: 3.2 });
  eli('pescoco', add(nb, mul(up, 0.04)), [0.25, 0.26, 0.2], { k: 0.1, cor: 'jubaEscura', so, pelo: 3.2 });
  eli('peito', add(nb, [0, -0.13, 0.03]), [0.21, 0.24, 0.19], { k: 0.1, cor: 'jubaEscura', so, pelo: 3.5 });
  const mechas = U.n ?? 90;
  for (let i = 0; i < mechas; i++) {
    const t = rnd(), phi = (rnd() * 2 - 1) * Math.PI * (t > 0.7 ? 0.95 : 0.8);
    const c = lerp(nb, ne, t * 1.05), rx = 0.25 - t * 0.03, ry = 0.28 - t * 0.03;
    const base = add(add(c, add([Math.sin(phi) * rx, 0, 0], mul(up, Math.cos(phi) * ry))), mul(up, 0.04));
    const d = norm(add(add([Math.sin(phi) * 1.0, 0, 0], mul(up, Math.cos(phi) * 0.8)), [0, -0.3 - rnd() * 0.25, -0.2 - rnd() * 0.15]));
    const len = 0.06 + rnd() * 0.09, r0 = 0.045 + rnd() * 0.02;
    cap(t < 0.45 ? 'pescoco' : 'pescoco2', base, add(base, mul(d, len)), r0, 0.012, { k: 0.035, cor: t < 0.45 || Math.abs(phi) > 2.2 ? 'jubaEscura' : rnd() < 0.3 ? 'jubaEscura' : 'juba', so, pelo: 3 });
  }
  // moldura em volta da cara
  const sk = info.skull, f = info.hp(0, 0, 1).map((v, i) => v - sk[i]);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, rr = 0.16 + rnd() * 0.02;
    const radial = norm(add([Math.cos(a), 0, 0], mul(info.hp(0, 1, 0).map((v, k) => v - sk[k]), Math.sin(a))));
    const base = add(info.hp(0, 0, -0.06), mul(radial, rr)), d = norm(add(mul(radial, 1), add(mul(f, -0.6), [0, -0.35, 0])));
    cap('cabeca', base, add(base, mul(d, 0.05 + rnd() * 0.05)), 0.04 + rnd() * 0.012, 0.014, { k: 0.03, cor: 'jubaClara', so, pelo: 2.2 });
  }
}

// ---------------- paquidermes (elefante, rinoceronte, hipopótamo) ----------------
// U: pernaF/pernaH = alturas do joelho e do tornozelo (fração de legF/legH), sela (queda do lombo), dobras (lista de vincos),
//    unhas (quantas), aneis (rugas em anel nas pernas), kB (suavidade do tronco), barriga (barriga caída), cupim (corcova do pescoço)
export function paquiderme(P, alto, U = {}) {
  const K = kit(), { eli, cap, sub, subCap, J } = K;
  const ch = P.chest, hp = P.hip, L = P.L, legF = P.legF, legH = P.legH, kB = U.kB ?? 0.2;
  const zS = L / 2, zH = -L / 2;
  const chestC = [0, legF + ch[1] * 0.35, zS - ch[2] * 0.15], hipC = [0, legH + hp[1] * 0.4, zH + hp[2] * 0.15];
  const xF = ch[0] * (U.xF ?? 0.55), xH = hp[0] * (U.xH ?? 0.58), mid = lerp(chestC, hipC, 0.5);
  const pf = U.pernaF || [0.95, 0.45, 0.17], ph = U.pernaH || [0.98, 0.52, 0.17];
  const pernas = {};
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    pernas['pernaF' + sd + '1'] = [sx * xF, legF * pf[0], zS + 0.0];
    pernas['pernaF' + sd + '2'] = [sx * xF, legF * pf[1], zS + 0.05 * L / 1.3];
    pernas['pernaF' + sd + '3'] = [sx * xF, Math.min(legF * 0.4, pf[2]), zS + 0.05 * L / 1.3];
    pernas['pernaT' + sd + '1'] = [sx * xH, legH * ph[0], zH + 0.0];
    pernas['pernaT' + sd + '2'] = [sx * xH, legH * ph[1], zH + 0.08 * L / 1.3];
    pernas['pernaT' + sd + '3'] = [sx * xH, Math.min(legH * 0.4, ph[2]), zH + 0.0];
  }
  ossosBase(K, alto, pernas);
  const top = chestC[1] + ch[1], sela = U.sela ?? 0.14;
  eli('peito', add(chestC, [0, 0, -0.05]), [ch[0] * 0.98, ch[1] * 0.98, ch[2] * 0.95], { k: kB, ventre: true });
  eli('coluna', add(mid, [0, -0.02 - (U.barriga ?? 0), 0]), [ch[0] * 1.02, ch[1] * 0.92 + (U.barriga ?? 0), L * 0.5], { k: kB, ventre: true });
  eli('quadril', add(hipC, [0, 0.0, -0.02]), [hp[0] * 0.98, hp[1] * 0.98, hp[2] * 0.95], { k: kB, ventre: true });
  const rT = ch[1] * 0.3;
  cap('peito', [0, top - rT * 0.25, chestC[2] + 0.05], [0, top - rT * 0.25 - sela, mid[2]], rT * 0.95, rT, { k: kB * 0.9 });
  cap('quadril', [0, top - rT * 0.25 - sela, mid[2]], [0, hipC[1] + hp[1] * 0.85, hipC[2] - 0.05], rT, rT * 0.92, { k: kB * 0.9 });
  cap('quadril', [0, hipC[1] + hp[1] * 0.85, hipC[2] - 0.05], [0, hipC[1] + hp[1] * 0.25, hipC[2] - hp[2] * 0.9], rT * 0.92, rT * 0.62, { k: kB * 0.75 });
  if (U.cupim) eli('peito', add(chestC, [0, ch[1] * 0.85, ch[2] * 0.45]), [ch[0] * 0.45, ch[1] * 0.28, ch[2] * 0.4], { k: kB * 0.8 });
  for (const sx of [-1, 1]) {
    eli('peito', add(chestC, [sx * ch[0] * 0.72, ch[1] * 0.05, ch[2] * 0.35]), [ch[0] * 0.27, ch[1] * 0.6, ch[2] * 0.42], { k: kB * 0.75, rot: [-0.25, 0, 0] }); // ombro
    for (const d of (U.dobras || [])) { // vincos: { no: 'peito'|'quadril', dz, r, prof, alto, baixo }
      const C = d.no === 'quadril' ? hipC : chestC, Rr = d.no === 'quadril' ? hp : ch, x = sx * (Rr[0] * (d.x ?? 1.02) + d.r * (d.prof ?? 0.55));
      subCap(d.no === 'quadril' ? 'quadril' : 'coluna', add(C, [x, Rr[1] * (d.alto ?? 0.4), Rr[2] * d.dz]), add(C, [x, -Rr[1] * (d.baixo ?? 0.5), Rr[2] * (d.dz + (d.incl ?? 0.12))]), d.r, d.r * 0.8, { k: d.k ?? 0.09 });
    }
  }
  for (const d of (U.aneisPescoco || [])) { // dobras em volta do pescoço (rinoceronte)
    const nb = J.pescoco, ne = J.cabeca, c = lerp(nb, ne, d.t);
    for (const sx of [-1, 1]) subCap('pescoco', add(c, [sx * d.rx, d.ry, 0]), add(c, [sx * d.rx * 1.05, -d.ry * 0.9, 0.04]), d.r, d.r * 0.8, { k: 0.06 });
  }
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) for (const fr of ['F', 'T']) {
    const n = 'perna' + fr + sd, A = J[n + '1'], B = J[n + '2'], C = J[n + '3'], rs = fr === 'F' ? P.pF.r : P.pH.r;
    eli(n + '1', add(lerp(A, B, 0.3), [0, 0, fr === 'F' ? 0.02 : -0.04]), [rs[0] * 1.15, (A[1] - B[1]) * 0.62, rs[0] * 1.2], { k: kB * 0.6 });
    cap(n + '1', A, B, rs[0], rs[1] * 1.02, { k: kB * 0.4 });
    eli(n + '2', add(B, [0, 0, fr === 'F' ? 0.03 : 0.02]), [rs[1] * 1.08, rs[1] * 0.9, rs[1] * 1.12], { k: 0.06 }); // joelho
    cap(n + '2', B, C, rs[1] * 0.98, rs[2] * 1.02, { k: 0.06 });
    cap(n + '3', add(C, [0, 0.02, 0]), [C[0], 0.04, C[2] + 0.02], rs[2] * 1.02, rs[2] * (U.pe ?? 1.14), { k: 0.05 });
    const un = U.unhas ?? 4, dxs = un === 3 ? [-0.55, 0, 0.55] : [-0.65, -0.22, 0.22, 0.65], ur = U.unhaR ?? [0.05, 0.045, 0.03];
    for (const dx of dxs) eli(n + '3', [C[0] + dx * rs[2], ur[1] * 1.2, C[2] + 0.02 + rs[2] * (1.08 - Math.abs(dx) * 0.25)], ur, { k: 0.012, cor: 'unha' });
    if (U.aneis !== false) { const zf = fr === 'F' ? 1 : -1, rg = U.ruga ?? 0.03;
      for (const [P0, P1, rr, ks] of [[B, C, rs[1], [-0.06, 0.06, 0.16]], [C, [C[0], 0, C[2]], rs[2], [0.6]]]) for (const k of ks) {
        const y = P0[1] + (P1[1] - P0[1]) * Math.max(0, k), c = [P0[0], y, P0[2] + (P1[2] - P0[2]) * Math.max(0, k)];
        subCap(n + '2', add(c, [-rr * 0.8, 0, rr * 1.05 * zf]), add(c, [rr * 0.8, 0, rr * 1.05 * zf]), rg, rg, { k: 0.05 });
        subCap(n + '2', add(c, [sx * rr * 1.05, 0, -rr * 0.6]), add(c, [sx * rr * 1.05, 0, rr * 0.6]), rg * 0.93, rg * 0.93, { k: 0.05 });
      } }
  }
  K.chestC = chestC; K.hipC = hipC;
  return K;
}
export const elefante = (P, alto) => paquiderme(P, alto, { dobras: [{ dz: -0.42, r: 0.05 }, { dz: -0.55, r: 0.04 }, { dz: -0.68, r: 0.035 }, { no: 'quadril', dz: 0.5, r: 0.045, alto: 0.45, baixo: 0.4, incl: 0.15 }, { no: 'quadril', dz: 0.64, r: 0.035, alto: 0.45, baixo: 0.4, incl: 0.15 }] });
export function cabecaElefante(K, P, alto) {
  const { eli, cap, sub, subCap, J } = K, H = P.head, sk = H.skull, ne = J.cabeca;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir);
  eli('cabeca', hp(0, 0.06, -0.06), [0.34, 0.4, 0.36], { k: 0.1, rot }); // crânio
  eli('cabeca', hp(0, 0.2, 0.12), [0.26, 0.22, 0.2], { k: 0.12, rot }); // testa
  eli('cabeca', hp(0, -0.12, 0.25), [0.22, 0.24, 0.22], { k: 0.1, rot }); // base da tromba
  eli('cabeca', hp(0, -0.36, 0.08), [0.12, 0.07, 0.12], { k: 0.06, rot, cor: 'boca' }); // lábio de baixo
  for (const sx of [-1, 1]) {
    sub('cabeca', hp(sx * 0.32, 0.08, 0.02), [0.08, 0.13, 0.12], { k: 0.1, rot }); // têmpora
    eli('cabeca', hp(sx * 0.24, 0.0, 0.22), [0.07, 0.06, 0.07], { k: 0.06, rot }); // maçã acima do olho
    K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.275, -0.03, 0.2)), r: 0.028 });
    sub('cabeca', hp(sx * 0.29, -0.03, 0.2), [0.045, 0.035, 0.05], { k: 0.04, rot }); // olho fundo
    // presas curvas
    const b0 = hp(sx * 0.16, -0.3, 0.24), b1 = add(b0, [sx * 0.05, -0.18, 0.22]), b2 = add(b1, [sx * 0.03, 0.02, 0.2]);
    cap('cabeca', b0, b1, 0.065, 0.05, { k: 0.03, cor: 'marfim' }); cap('cabeca', b1, b2, 0.05, 0.022, { k: 0.02, cor: 'marfim' });
  }
  // tromba: segmentos do Alto, com anéis cavados
  for (let i = 1; i <= 4; i++) {
    const a = J['tromba' + i], b = i < 4 ? J['tromba' + (i + 1)] : add(a, [0, -0.3, 0.06]), r0 = 0.2 - (i - 1) * 0.034, r1 = 0.2 - i * 0.034;
    cap('tromba' + i, a, b, r0, r1, { k: 0.05, aneis: true });
    const nAn = 6;
    for (let j = 1; j < nAn; j++) { const t = j / nAn, c = lerp(a, b, t), rr = r0 + (r1 - r0) * t, d = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), fwd = norm([0, -d[2], d[1]]);
      subCap('tromba' + i, add(c, add([-rr * 0.75, 0, 0], mul(fwd, rr * 0.98))), add(c, add([rr * 0.75, 0, 0], mul(fwd, rr * 0.98))), 0.016, 0.016, { k: 0.02 }); }
  }
  const tip = add(J.tromba4, [0, -0.3, 0.06]);
  eli('tromba4', tip, [0.07, 0.05, 0.07], { k: 0.03 });
  for (const sx of [-1, 1]) sub('tromba4', add(tip, [sx * 0.03, -0.04, 0.02]), [0.018, 0.02, 0.02], { k: 0.01 });
  // orelhas: aba grande com lobo de baixo, borda dobrada em cima
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    const o = 'orelha' + sd, ep = J[o], E = P.ears.t, rot2 = [0.15, sx * 0.5, 0];
    eli(o, add(ep, [sx * E * 0.22, -E * 0.36, -E * 0.36]), [E * 0.085, E * 0.82, E * 0.68], { k: 0.05, rot: rot2 });
    eli(o, add(ep, [sx * E * 0.18, -E * 0.95, -E * 0.16]), [E * 0.06, E * 0.36, E * 0.28], { k: 0.06, rot: rot2 });
    cap(o, add(ep, [sx * E * 0.05, E * 0.28, -E * 0.05]), add(ep, [sx * E * 0.45, E * 0.25, -E * 0.75]), E * 0.08, E * 0.06, { k: 0.06 });
  }
  return { skull, hp };
}
export function caudaFina(K, P, dirFim = [0, -1, -0.15]) {
  const { cap, J } = K, T = P.tail;
  for (let i = 1; i <= 3; i++) { const a = J['cauda' + i], b = i < 3 ? J['cauda' + (i + 1)] : add(a, mul(norm(dirFim), T.len / 3));
    cap('cauda' + i, a, b, T.r * (1.2 - i * 0.25), T.r * (1 - i * 0.25), { k: 0.02, cor: T.cor || 'base' }); }
  const fim = add(J.cauda3, mul(norm(dirFim), T.len / 3));
  if (T.tufo) cap('cauda3', add(fim, [0, 0.04, 0]), add(fim, [0, -T.tufo * 1.6, -0.01]), T.tufo * 0.85, T.tufo * 0.3, { k: 0.02, cor: 'escuro', ruido: T.tufo * 0.25, tufo: true });
}
export { add, mul, lerp, norm, R };

// ---------------- cabeças de paquidermes ----------------
export function cabecaRino(K, P) {
  const { eli, cap, sub, J } = K, H = P.head, sk = H.skull, ne = J.cabeca;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir), f = hp(0, 0, 1).map((v, i) => v - skull[i]), u = hp(0, 1, 0).map((v, i) => v - skull[i]);
  eli('cabeca', hp(0, 0.03, -0.06), [0.17, 0.18, 0.24], { k: 0.08, rot });
  eli('cabeca', hp(0, 0.0, 0.18), [0.14, 0.14, 0.22], { k: 0.08, rot });
  eli('cabeca', hp(0, -0.05, 0.4), [0.17, 0.09, 0.08], { k: 0.06, rot, cor: 'boca' }); // lábio largo e reto
  eli('cabeca', hp(0, -0.13, 0.22), [0.12, 0.07, 0.18], { k: 0.06, rot }); // queixo
  for (const sx of [-1, 1]) {
    eli('cabeca', hp(sx * 0.13, 0.04, 0.02), [0.06, 0.07, 0.12], { k: 0.06, rot }); // bochecha
    K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.155, 0.02, 0.1)), r: 0.017 });
    sub('cabeca', hp(sx * 0.16, 0.02, 0.1), [0.03, 0.025, 0.035], { k: 0.03, rot });
    sub('cabeca', hp(sx * 0.11, 0.06, 0.43), [0.018, 0.022, 0.02], { k: 0.015, rot }); // narina
    const base = hp(sx * 0.11, 0.17, -0.22), d = norm([sx * 0.5, 1, -0.35]), r2 = alinhaY(d), c = add(base, mul(d, 0.09)); // orelha em tubo
    eli('cabeca', c, [0.035, 0.1, 0.045], { k: 0.025, rot: r2 });
    sub('cabeca', add(c, add(mul(norm([0, 0, 1]), 0.03), mul(d, 0.02))), [0.02, 0.075, 0.03], { k: 0.012, rot: r2 });
  }
  const mz = hp(0, 0, 0.42);
  const b1 = add(mz, mul(u, 0.12)), m1 = add(b1, add(mul(u, 0.28), mul(f, 0.03))), t1 = add(m1, add(mul(u, 0.24), mul(f, 0.13)));
  cap('cabeca', b1, m1, 0.11, 0.065, { k: 0.05, cor: 'chifre' }); cap('cabeca', m1, t1, 0.065, 0.012, { k: 0.03, cor: 'chifre' });
  const b2 = add(mz, add(mul(u, 0.17), mul(f, -0.3)));
  cap('cabeca', b2, add(b2, add(mul(u, 0.2), mul(f, 0.03))), 0.085, 0.015, { k: 0.04, cor: 'chifre' });
}
export function cabecaHipo(K, P) {
  const { eli, cap, sub, subCap, J } = K, H = P.head, sk = H.skull, ne = J.cabeca;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir);
  eli('cabeca', hp(0, 0.04, -0.06), [0.27, 0.23, 0.3], { k: 0.1, rot });
  eli('cabeca', hp(0, -0.17, 0.28), [0.24, 0.11, 0.3], { k: 0.08, rot, cor: 'focinho' }); // mandíbula
  eli('cabeca', hp(0, -0.02, 0.46), [0.25, 0.19, 0.15], { k: 0.08, rot, cor: 'focinho' }); // frente do focinho
  for (const sx of [-1, 1]) {
    eli('cabeca', hp(sx * 0.15, -0.04, 0.37), [0.18, 0.21, 0.2], { k: 0.08, rot, cor: 'focinho' }); // lobos do focinho
    eli('cabeca', hp(sx * 0.2, -0.07, 0.08), [0.11, 0.15, 0.15], { k: 0.08, rot }); // bochecha
    eli('cabeca', hp(sx * 0.16, 0.2, 0.05), [0.075, 0.065, 0.075], { k: 0.05, rot, cor: 'rosa' }); // torre do olho
    K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.19, 0.22, 0.09)), r: 0.024 });
    eli('cabeca', hp(sx * 0.16, 0.25, -0.13), [0.03, 0.045, 0.025], { k: 0.02, rot, cor: 'rosa' }); // orelha
    eli('cabeca', hp(sx * 0.08, 0.16, 0.5), [0.045, 0.035, 0.04], { k: 0.03, rot }); // narina
    sub('cabeca', hp(sx * 0.08, 0.19, 0.51), [0.014, 0.011, 0.02], { k: 0.01, rot });
    subCap('cabeca', hp(sx * 0.25, -0.12, 0.47), hp(sx * 0.24, -0.12, 0.05), 0.022, 0.018, { k: 0.03, rot }); // boca
  }
}

// ---------------- girafa (base equina com pernas e pescoço longos) ----------------
export function ossiconesGirafa(K, info) {
  const { cap, eli } = K;
  for (const sx of [-1, 1]) { const a = info.hp(sx * 0.035, 0.07, -0.07), d = norm([sx * 0.12, 1, -0.25]);
    cap('cabeca', a, add(a, mul(d, 0.12)), 0.022, 0.018, { k: 0.015 }); eli('cabeca', add(a, mul(d, 0.13)), [0.027, 0.024, 0.027], { k: 0.01, cor: 'escuro' }); }
  eli('cabeca', info.hp(0, 0.06, 0.06), [0.03, 0.03, 0.04], { k: 0.03 }); // calo da testa
}

// ---------------- primatas (gorila, macaco) ----------------
export function primata(P, alto, U = {}) {
  const K = kit(), { eli, cap, sub, J } = K;
  const ch = P.chest, hp = P.hip, L = P.L, legF = P.legF, legH = P.legH, s = U.esc ?? 1, fr = P.foot.r;
  const zS = L / 2, zH = -L / 2;
  const chestC = [0, legF + ch[1] * 0.35, zS - ch[2] * 0.15], hipC = [0, legH + hp[1] * 0.4, zH + hp[2] * 0.15], mid = lerp(chestC, hipC, 0.5);
  const pernas = {};
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    pernas['pernaF' + sd + '1'] = [sx * ch[0] * 0.82, chestC[1] + ch[1] * 0.3, chestC[2] + 0.02];
    pernas['pernaF' + sd + '2'] = [sx * ch[0] * 0.92, legF * 0.5, zS + 0.03 * s];
    pernas['pernaF' + sd + '3'] = [sx * ch[0] * 0.85, fr * 0.9, zS + 0.06 * s];
    pernas['pernaT' + sd + '1'] = [sx * hp[0] * 0.72, hipC[1] - hp[1] * 0.1, hipC[2]];
    pernas['pernaT' + sd + '2'] = [sx * hp[0] * 0.9, legH * 0.52, zH + 0.12 * s];
    pernas['pernaT' + sd + '3'] = [sx * hp[0] * 0.8, fr * 0.7, zH - 0.02 * s];
  }
  ossosBase(K, alto, pernas);
  eli('peito', add(chestC, [0, 0, -ch[2] * 0.1]), [ch[0] * 0.95, ch[1] * 0.95, ch[2] * 1.0], { k: 0.12, ventre: true });
  eli('coluna', add(mid, [0, -0.02, 0]), [ch[0] * 0.82, ch[1] * 0.8, L * 0.42], { k: 0.12, ventre: true }); // barriga
  eli('quadril', add(hipC, [0, 0.02, -0.02]), [hp[0] * 0.95, hp[1] * 0.92, hp[2] * 0.95], { k: 0.1, ventre: true });
  for (const sx of [-1, 1]) {
    eli('peito', add(chestC, [sx * ch[0] * 0.78, ch[1] * 0.42, 0.0]), [ch[0] * 0.38, ch[1] * 0.4, ch[2] * 0.42], { k: 0.1 }); // deltoide
    eli('peito', add(chestC, [sx * ch[0] * 0.38, ch[1] * 0.05, ch[2] * 0.72]), [ch[0] * 0.4, ch[1] * 0.38, ch[2] * 0.25], { k: 0.1, ventre: true }); // peitoral
  }
  eli('peito', add(chestC, [0, ch[1] * 0.72, ch[2] * 0.15]), [ch[0] * 0.55, ch[1] * 0.35, ch[2] * 0.55], { k: 0.12 }); // trapézio
  for (const [sx, sd] of [[-1, 'E'], [1, 'D']]) {
    const F1 = J['pernaF' + sd + '1'], F2 = J['pernaF' + sd + '2'], F3 = J['pernaF' + sd + '3'], f = 'pernaF' + sd, rF = P.pF.r;
    cap(f + '1', F1, F2, rF[0] * 1.05, rF[1] * 0.95, { k: 0.06 }); // braço
    eli(f + '1', add(lerp(F1, F2, 0.35), [0, 0, 0.01]), [rF[0] * 1.05, (F1[1] - F2[1]) * 0.4, rF[0] * 1.1], { k: 0.06 }); // bíceps
    cap(f + '2', F2, F3, rF[1] * 1.05, rF[2] * 0.9, { k: 0.05 }); // antebraço
    eli(f + '2', add(lerp(F2, F3, 0.25), [0, 0, 0.01]), [rF[1] * 1.12, (F2[1] - F3[1]) * 0.35, rF[1] * 1.08], { k: 0.05 });
    // mão apoiada nos nós dos dedos
    eli(f + '3', add(F3, [0, -fr * 0.15, fr * 0.25]), [fr * 0.85, fr * 0.55, fr * 0.75], { k: 0.03, cor: U.corMao || 'pele' });
    for (const dx of [-0.55, -0.18, 0.18, 0.55]) eli(f + '3', [F3[0] + dx * fr * 0.85, fr * 0.33, F3[2] + fr * 0.75], [fr * 0.2, fr * 0.3, fr * 0.26], { k: 0.015, cor: U.corMao || 'pele' });
    const T1 = J['pernaT' + sd + '1'], T2 = J['pernaT' + sd + '2'], T3 = J['pernaT' + sd + '3'], t = 'pernaT' + sd, rH = P.pH.r;
    eli(t + '1', add(lerp(T1, T2, 0.45), [0, 0, -0.01]), [rH[0] * 1.1, (T1[1] - T2[1]) * 0.6, rH[0] * 1.2], { k: 0.07 }); // coxa
    cap(t + '1', T1, T2, rH[0] * 0.95, rH[1] * 0.95, { k: 0.06 });
    cap(t + '2', T2, T3, rH[1] * 1.02, rH[2] * 0.85, { k: 0.05 });
    eli(t + '2', add(lerp(T2, T3, 0.3), [0, 0, -0.015]), [rH[1] * 1.05, (T2[1] - T3[1]) * 0.33, rH[1] * 1.1], { k: 0.05 }); // panturrilha
    eli(t + '3', [T3[0], fr * 0.32, T3[2] + fr * 0.75], [fr * 0.6, fr * 0.32, fr * 1.25], { k: 0.03, cor: U.corMao || 'pele' }); // pé
    for (const dx of [-0.5, -0.17, 0.17, 0.5]) eli(t + '3', [T3[0] + dx * fr * 0.7, fr * 0.2, T3[2] + fr * 1.85], [fr * 0.16, fr * 0.16, fr * 0.24], { k: 0.012, cor: U.corMao || 'pele' });
    eli(t + '3', [T3[0] - sx * fr * 0.55, fr * 0.22, T3[2] + fr * 1.25], [fr * 0.18, fr * 0.16, fr * 0.3], { k: 0.012, cor: U.corMao || 'pele', rot: [0, -sx * 0.6, 0] }); // dedão
  }
  return K;
}
export function cabecaPrimata(K, P, U = {}) {
  const { eli, cap, sub, J } = K, H = P.head, sk = H.skull, ne = J.cabeca;
  const skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], sk[2] * 0.45), [0, sk[1] * 0.25, 0]));
  const hp = cabeca(skull, H.dir), rot = rotZ(H.dir), a = sk[0] / 0.15; // escala pelo crânio do gorila
  eli('cabeca', hp(0, 0.01 * a, -0.02 * a), [0.135 * a, 0.14 * a, 0.135 * a], { k: 0.05 * a, rot }); // crânio
  if (U.crista) eli('cabeca', hp(0, 0.12 * a, -0.05 * a), [0.05 * a, 0.1 * a, 0.12 * a], { k: 0.06 * a, rot, so: 'M' });
  eli('cabeca', hp(0, 0.06 * a, 0.11 * a), [0.12 * a, 0.035 * a, 0.045 * a], { k: 0.025 * a, rot, cor: 'rosto' }); // arco das sobrancelhas
  eli('cabeca', hp(0, -0.04 * a, 0.1 * a), [0.1 * a, 0.09 * a, 0.07 * a], { k: 0.04 * a, rot, cor: 'rosto' }); // rosto
  eli('cabeca', hp(0, -0.09 * a, 0.13 * a), [0.085 * a, 0.055 * a, 0.08 * a * (U.focinho ?? 1)], { k: 0.035 * a, rot, cor: 'rosto' }); // focinho e boca
  eli('cabeca', hp(0, -0.01 * a, 0.165 * a), [0.055 * a, 0.035 * a, 0.03 * a], { k: 0.02 * a, rot, cor: 'rosto' }); // nariz largo
  for (const sx of [-1, 1]) {
    sub('cabeca', hp(sx * 0.022 * a, -0.02 * a, 0.19 * a), [0.014 * a, 0.012 * a, 0.015 * a], { k: 0.01 * a, rot }); // narina
    sub('cabeca', hp(sx * 0.05 * a, 0.03 * a, 0.135 * a), [0.028 * a, 0.02 * a, 0.025 * a], { k: 0.02 * a, rot }); // órbita
    K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.048 * a, 0.03 * a, 0.12 * a)), r: +(0.016 * a).toFixed(4) });
    eli('cabeca', hp(sx * 0.13 * a, 0.02 * a, -0.02 * a), [0.02 * a, 0.035 * a, 0.03 * a], { k: 0.015 * a, rot, cor: 'rosto' }); // orelha
  }
  eli('cabeca', hp(0, -0.14 * a, 0.08 * a), [0.07 * a, 0.035 * a, 0.06 * a], { k: 0.03 * a, rot, cor: 'rosto' }); // queixo
  return { skull, hp };
}

// ---------------- tartaruga (casco com escudos e sulcos) ----------------
export function tartaruga(P, alto) {
  const K = kit(), { eli, cap, sub, subCap, J } = K;
  for (const b of alto) K.bone(b.nome, b.pai, b.pos);
  const hipC = J.quadril, chestC = J.peito, c = lerp(hipC, chestC, 0.5);
  const cy = c[1] + 0.12, rx = 0.47, ry = 0.33, rz = 0.6, cz = c[2];
  const S = (x, z, o = 0) => [x, cy + (ry + o) * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - ((z - cz) / rz) ** 2)), z];
  eli('coluna', [0, cy, cz], [rx, ry, rz], { k: 0.03, cor: 'casco' });
  eli('coluna', [0, c[1] + 0.0, cz], [rx * 1.03, 0.07, rz * 1.03], { k: 0.04, cor: 'casco' }); // aba das placas da borda
  eli('coluna', [0, c[1] - 0.06, cz], [rx * 0.9, 0.08, rz * 0.88], { k: 0.03, cor: 'plastrao' });
  const sulco = (pts, r = 0.018) => { for (let i = 0; i < pts.length - 1; i++) subCap('coluna', S(...pts[i], 0.006), S(...pts[i + 1], 0.006), r, r, { k: 0.015 }); };
  const zv = [-0.5, -0.27, -0.06, 0.15, 0.36, 0.52].map(z => z + cz);
  for (const sx of [-1, 1]) sulco([...Array(9)].map((_, i) => [sx * (0.15 - Math.abs(i - 4) * 0.008), zv[0] + (zv[5] - zv[0]) * i / 8]));
  for (const z of zv.slice(1, 5)) sulco([[-0.15, z], [0, z + 0.02], [0.15, z]]);
  for (const sx of [-1, 1]) for (const z of [-0.31, -0.03, 0.25].map(v => v + cz)) sulco([[sx * 0.15, z + (z > cz ? 0.03 : -0.03)], [sx * 0.29, z], [sx * 0.44, z - 0.01]]);
  const borda = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; borda.push([Math.cos(a) * rx * 0.9, cz + Math.sin(a) * rz * 0.9]); } sulco(borda, 0.016);
  for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, p = [Math.cos(a) * rx * 0.93, cz + Math.sin(a) * rz * 0.93], q = [Math.cos(a) * rx * 1.02, cz + Math.sin(a) * rz * 1.02]; subCap('coluna', S(...p, 0.004), [q[0], c[1] + 0.03, q[1]], 0.013, 0.013, { k: 0.012 }); }
  // centro de cada escudo levemente alto e mais claro (anéis de crescimento)
  const centros = [];
  for (let i = 0; i < 5; i++) centros.push([0, (zv[i] + zv[i + 1]) / 2]);
  for (const sx of [-1, 1]) for (const z of [-0.43, -0.17, 0.11, 0.38].map(v => v + cz)) centros.push([sx * 0.3, z]);
  for (const [x, z] of centros) eli('coluna', S(x, z, -0.015), [0.075, 0.03, 0.07], { k: 0.04, cor: 'cascoClaro' });
  // pescoço com pregas, cabeça de réptil com bico
  const nb = J.pescoco, ne = J.cabeca;
  cap('pescoco', nb, lerp(nb, ne, 0.5), 0.085, 0.075, { k: 0.04 }); cap('pescoco2', lerp(nb, ne, 0.5), ne, 0.075, 0.065, { k: 0.04 });
  for (const t of [0.2, 0.4, 0.6, 0.8]) { const p = lerp(nb, ne, t); subCap('pescoco', add(p, [-0.08, 0.03, 0]), add(p, [0.08, 0.03, 0]), 0.012, 0.012, { k: 0.02 }); }
  const H = P.head, skull = add(ne, add(mul([0, -Math.sin(H.dir), Math.cos(H.dir)], H.skull[2] * 0.45), [0, H.skull[1] * 0.25, 0])), hp = cabeca(skull, H.dir), rot = rotZ(H.dir);
  eli('cabeca', hp(0, 0, 0), [0.07, 0.065, 0.09], { k: 0.03, rot });
  eli('cabeca', hp(0, -0.01, 0.085), [0.05, 0.045, 0.045], { k: 0.025, rot, cor: 'bico' });
  for (const sx of [-1, 1]) { K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(hp(sx * 0.055, 0.02, 0.04)), r: 0.012 }); sub('cabeca', hp(sx * 0.012, 0.012, 0.13), [0.006, 0.006, 0.008], { k: 0.005, rot }); }
  // pernas grossas com unhas
  for (const n of ['pernaFE', 'pernaFD', 'pernaTE', 'pernaTD']) {
    const A = J[n + '1'], B = J[n + '2'], C = J[n + '3'], fr = n[5] === 'F', r = fr ? P.pF.r : P.pH.r;
    cap(n + '1', A, B, r[0] * 1.05, r[1], { k: 0.04 }); cap(n + '2', B, C, r[1], r[2], { k: 0.03 });
    cap(n + '3', C, [C[0], 0.02, C[2] + 0.02], r[2], r[2] * 1.1, { k: 0.03 });
    for (const dx of [-0.6, -0.2, 0.2, 0.6]) eli(n + '3', [C[0] + dx * r[2], 0.025, C[2] + 0.02 + r[2] * (1.0 - Math.abs(dx) * 0.2)], [0.018, 0.016, 0.022], { k: 0.008, cor: 'unha' });
  }
  cap('quadril', add(hipC, [0, 0.02, -0.25]), add(hipC, [0, -0.02, -0.38]), 0.04, 0.012, { k: 0.03 }); // rabo curto
  return K;
}

// ---------------- flamingo ----------------
export function flamingo(alto) {
  const K = kit(), { eli, cap, J } = K;
  for (const b of alto) K.bone(b.nome, b.pai, b.pos);
  eli('quadril', [0, 1.05, -0.03], [0.135, 0.13, 0.25], { k: 0.06, rot: [-0.15, 0, 0], ventre: true });
  eli('peito', [0, 1.075, 0.15], [0.115, 0.12, 0.13], { k: 0.06, ventre: true });
  eli('quadril', [0, 1.1, -0.27], [0.07, 0.045, 0.12], { k: 0.04, rot: [0.3, 0, 0] });
  for (const sx of [-1, 1]) {
    eli('quadril', [sx * 0.112, 1.1, -0.06], [0.03, 0.085, 0.23], { k: 0.035, rot: [-0.2, 0, sx * 0.15], cor: 'asa' }); // asa fechada
    eli('quadril', [sx * 0.098, 1.135, 0.02], [0.028, 0.055, 0.14], { k: 0.03, rot: [-0.15, 0, sx * 0.25], cor: 'asaClara' }); // coberteiras
    eli('quadril', [sx * 0.055, 1.135, -0.3], [0.035, 0.026, 0.15], { k: 0.025, rot: [0.32, 0, 0], cor: 'escuro' }); // penas pretas
  }
  // pescoço em S mais suave (curva passando pelos ossos)
  const N = [J.pescoco, J.pescoco2, J.pescoco3, J.cabeca], ossosN = ['pescoco', 'pescoco2', 'pescoco3'];
  const cr = (p0, p1, p2, p3, t) => [0, 1, 2].map(i => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
  const ext = [add(N[0], [0, -0.1, -0.05]), ...N, add(N[3], [0, 0.02, 0.06])];
  let prev = N[0], k = 0;
  for (let s = 0; s < 3; s++) for (let j = 1; j <= 4; j++) { const p = cr(ext[s], ext[s + 1], ext[s + 2], ext[s + 3], j / 4), t = (s * 4 + j) / 12;
    cap(ossosN[s], prev, p, 0.044 - (t - 1 / 12) * 0.022, 0.044 - t * 0.022, { k: 0.015, cor: 'pescoco' }); prev = p; k++; }
  eli('cabeca', [0, 1.73, 0.3], [0.034, 0.037, 0.047], { k: 0.015, cor: 'pescoco' });
  cap('cabeca', [0, 1.725, 0.33], [0, 1.708, 0.4], 0.025, 0.021, { k: 0.012, cor: 'bico' });
  cap('cabeca', [0, 1.708, 0.4], [0, 1.665, 0.43], 0.021, 0.016, { k: 0.01, cor: 'bico' });
  cap('cabeca', [0, 1.665, 0.43], [0, 1.618, 0.426], 0.016, 0.007, { k: 0.008, cor: 'escuro' });
  for (const sx of [-1, 1]) K.extras.push({ tipo: 'olho', osso: 'cabeca', pos: [sx * 0.029, 1.742, 0.312], r: 0.007 });
  for (const [sx, s] of [[-1, 'E'], [1, 'D']]) {
    const x = sx * 0.06;
    cap('perna' + s + '1', [x, 0.98, 0], [x, 0.84, -0.008], 0.04, 0.02, { k: 0.025 });
    cap('perna' + s + '1', [x, 0.84, -0.008], [x, 0.53, -0.03], 0.016, 0.014, { k: 0.008, cor: 'perna' });
    eli('perna' + s + '2', [x, 0.52, -0.03], [0.02, 0.024, 0.022], { k: 0.008, cor: 'perna' });
    cap('perna' + s + '2', [x, 0.51, -0.03], [x, 0.04, 0], 0.014, 0.013, { k: 0.008, cor: 'perna' });
    eli('perna' + s + '3', [x, 0.012, 0.045], [0.04, 0.008, 0.06], { k: 0.01, cor: 'perna' });
    for (const a of [-0.45, 0, 0.45]) cap('perna' + s + '3', [x, 0.02, 0.0], [x + Math.sin(a) * 0.08, 0.008, Math.cos(a) * 0.09], 0.009, 0.006, { k: 0.008, cor: 'perna' });
  }
  return K;
}
