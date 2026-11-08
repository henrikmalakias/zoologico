// Gera as especificações JSON dos modelos realistas (gráfico Alto).
// Cada modelo = esqueleto (ossos) + formas suaves (cápsulas e elipsoides) + cores e padrões.
import { writeFileSync } from 'node:fs';
const V = (x, y, z) => [+x.toFixed(4), +y.toFixed(4), +z.toFixed(4)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const R = a => a.map(v => +v.toFixed(4));

function quadruped(P) {
  const bones = [], shapes = [], extras = [];
  const bone = (nome, pai, pos) => { bones.push({ nome, pai, pos: R(pos) }); return pos; };
  const cap = (osso, a, b, ra, rb, o = {}) => shapes.push({ t: 'cap', osso, a: R(a), b: R(b), r: [+ra.toFixed(4), +rb.toFixed(4)], k: o.k ?? 0.04, cor: o.cor || 'base', ...o });
  const eli = (osso, c, r, o = {}) => shapes.push({ t: 'eli', osso, c: R(c), r: R(r), k: o.k ?? 0.05, cor: o.cor || 'base', ...o });
  const { L, legF, legH } = P, ch = P.chest, hp = P.hip;
  const zS = L / 2, zH = -L / 2;
  const chestC = [0, legF + ch[1] * 0.35, zS - ch[2] * 0.15], hipC = [0, legH + hp[1] * 0.4, zH + hp[2] * 0.15];
  bone('raiz', null, [0, 0, 0]);
  bone('quadril', 'raiz', hipC); bone('coluna', 'quadril', lerp(hipC, chestC, 0.5)); bone('peito', 'coluna', chestC);
  const kB = P.kBody ?? 0.12;
  eli('peito', chestC, ch, { k: kB, ventre: true, ...(P.torsoPad || {}) });
  eli('quadril', hipC, hp, { k: kB, ventre: true, ...(P.torsoPad || {}) });
  cap('coluna', add(hipC, [0, -hp[1] * 0.1, 0]), add(chestC, [0, -ch[1] * 0.15, 0]), P.belly, P.belly * 1.05, { k: kB, ventre: true, ...(P.torsoPad || {}) });
  // pescoço e cabeça
  const nb = add(chestC, [0, ch[1] * 0.45, ch[2] * 0.6]), nd = [0, Math.sin(P.neck.ang), Math.cos(P.neck.ang)];
  const ne = add(nb, mul(nd, P.neck.len)), nm = lerp(nb, ne, 0.5);
  bone('pescoco', 'peito', nb); bone('pescoco2', 'pescoco', nm); bone('cabeca', 'pescoco2', ne);
  cap('pescoco', nb, nm, P.neck.r0, (P.neck.r0 + P.neck.r1) / 2, { k: 0.08, ...(P.neckPad || {}) });
  cap('pescoco2', nm, ne, (P.neck.r0 + P.neck.r1) / 2, P.neck.r1, { k: 0.06, ...(P.neckPad || {}) });
  const H = P.head, hd = [0, -Math.sin(H.dir), Math.cos(H.dir)];
  const skull = add(ne, add(mul(hd, H.skull[2] * 0.45), [0, H.skull[1] * 0.25, 0]));
  eli('cabeca', skull, H.skull, { k: 0.05, rot: [H.dir * 0.6, 0, 0] });
  const mz0 = add(skull, mul(hd, H.skull[2] * 0.5)), mz1 = add(skull, mul(hd, H.skull[2] * 0.5 + H.muzzle.len));
  cap('cabeca', mz0, mz1, H.muzzle.r0, H.muzzle.r1, { k: 0.05, cor: H.muzzle.cor || 'base', padrao: P.headPattern });
  eli('cabeca', add(mz1, mul(hd, H.muzzle.r1 * 0.55)), [H.muzzle.r1 * 0.8, H.muzzle.r1 * 0.65, H.muzzle.r1 * 0.5], { k: 0.02, cor: 'nariz' });
  extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(add(skull, [H.skull[0] * 0.78, H.skull[1] * 0.3, H.skull[2] * 0.3])), r: +(H.skull[0] * (H.eye ?? 0.17)).toFixed(4) });
  extras.push({ tipo: 'olho', osso: 'cabeca', pos: R(add(skull, [-H.skull[0] * 0.78, H.skull[1] * 0.3, H.skull[2] * 0.3])), r: +(H.skull[0] * (H.eye ?? 0.17)).toFixed(4) });
  // orelhas
  const E = P.ears;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'E' : 'D';
    if (E.tipo === 'pontuda') { const a = add(skull, [sx * H.skull[0] * 0.55, H.skull[1] * 0.75, -H.skull[2] * 0.25]); cap('cabeca', a, add(a, [sx * E.t * 0.35, E.t, -E.t * 0.35]), E.t * 0.22, E.t * 0.06, { k: 0.02 }); }
    else if (E.tipo === 'redonda') eli('cabeca', add(skull, [sx * H.skull[0] * 0.75, H.skull[1] * 0.8, -H.skull[2] * 0.2]), [E.t * 0.45, E.t, E.t * 0.9], { k: 0.02, cor: E.cor || 'base' });
    else if (E.tipo === 'elefante') { const ep = bone('orelha' + side, 'cabeca', add(skull, [sx * H.skull[0] * 0.8, H.skull[1] * 0.2, -H.skull[2] * 0.25])); eli('orelha' + side, add(ep, [sx * E.t * 0.18, -E.t * 0.38, -E.t * 0.3]), [E.t * 0.07, E.t * 0.8, E.t * 0.62], { k: 0.04, rot: [0.15, sx * 0.45, 0] }); }
  }
  if (P.ossicones) for (const sx of [-1, 1]) { const a = add(skull, [sx * H.skull[0] * 0.35, H.skull[1] * 0.85, -H.skull[2] * 0.3]); cap('cabeca', a, add(a, [sx * 0.02, P.ossicones, -0.03]), 0.028, 0.022, { k: 0.015 }); eli('cabeca', add(a, [sx * 0.02, P.ossicones + 0.01, -0.03]), [0.034, 0.03, 0.034], { k: 0.01, cor: 'escuro' }); }
  if (P.mane) { const m = P.mane; for (let i = 0; i < 3; i++) { const t0 = i / 3, t1 = (i + 1) / 3; const o = [0, m.h, -0.02]; cap(i < 2 ? 'pescoco' : 'pescoco2', add(lerp(nb, ne, t0), o), add(lerp(nb, ne, t1 * 0.98), o), m.w, m.w * 0.9, { k: 0.04, cor: m.cor || 'escuro', padrao: m.padrao }); } }
  // pernas
  const leg = (nome, pai, top, lens, rs, front) => {
    const [up, lo, ft] = lens; const sx = top[0];
    const j1 = top, j2 = add(top, front ? [0, -up, -up * 0.12] : [0, -up, up * 0.22]);
    const j3 = add(j2, front ? [0, -lo, lo * 0.08] : [0, -lo, -lo * 0.32]);
    const j4 = [sx, P.foot.h, j3[2] + (front ? 0.02 : 0.03)];
    bone(nome + '1', pai, j1); bone(nome + '2', nome + '1', j2); bone(nome + '3', nome + '2', j3);
    eli(nome + '1', lerp(j1, j2, 0.35), [rs[0] * 1.15, up * 0.55, rs[0] * 1.35], { k: 0.07, ventre: true });
    cap(nome + '1', j1, j2, rs[0], rs[1], { k: 0.05, padrao: P.legPattern, sombra: true });
    cap(nome + '2', j2, j3, rs[1], rs[2], { k: 0.04, padrao: P.legPattern, sombra: true });
    cap(nome + '3', j3, j4, rs[2], rs[2] * 0.95, { k: 0.03, padrao: P.legPattern, sombra: true });
    if (P.foot.tipo === 'casco') cap(nome + '3', add(j4, [0, 0.02, 0]), [sx, P.foot.h * 0.2, j4[2] + 0.01], P.foot.r, P.foot.r * 1.1, { k: 0.01, cor: 'casco' });
    else if (P.foot.tipo === 'pata') eli(nome + '3', [sx, P.foot.r * 0.55, j4[2] + P.foot.r * 0.5], [P.foot.r, P.foot.r * 0.6, P.foot.r * 1.3], { k: 0.03 });
    else if (P.foot.tipo === 'coluna') { cap(nome + '3', [sx, P.foot.r * 0.3, j4[2]], add(j4, [0, 0.05, 0]), P.foot.r, P.foot.r * 0.9, { k: 0.04 }); for (const dx of [-0.6, 0, 0.6]) eli(nome + '3', [sx + dx * P.foot.r * 0.7, 0.05, j4[2] + P.foot.r * 0.85], [0.05, 0.04, 0.03], { k: 0.01, cor: 'unha' }); }
    else if (P.foot.tipo === 'mao') eli(nome + '3', [sx, P.foot.r * 0.4, j4[2] + P.foot.r * 0.7], [P.foot.r * 0.9, P.foot.r * 0.45, P.foot.r * 1.6], { k: 0.02, cor: 'pele' });
  };
  const sxF = ch[0] * 0.55, sxH = hp[0] * 0.6;
  leg('pernaFE', 'peito', [-sxF, legF, zS], P.pF.len, P.pF.r, true);
  leg('pernaFD', 'peito', [sxF, legF, zS], P.pF.len, P.pF.r, true);
  leg('pernaTE', 'quadril', [-sxH, legH, zH], P.pH.len, P.pH.r, false);
  leg('pernaTD', 'quadril', [sxH, legH, zH], P.pH.len, P.pH.r, false);
  // cauda
  const T = P.tail; let tb = add(hipC, [0, hp[1] * 0.45, -hp[2] * 0.85]);
  let prev = 'quadril', dirs = T.dirs || [[0, -0.3, -1], [0, -1, -0.4], [0, -1, -0.1]];
  for (let i = 0; i < 3; i++) {
    const d = dirs[i], n = Math.hypot(...d), seg = T.len / 3, e = add(tb, mul(d, seg / n));
    bone('cauda' + (i + 1), prev, tb); prev = 'cauda' + (i + 1);
    cap(prev, tb, e, T.r * (1 - i * 0.22), T.r * (1 - (i + 1) * 0.22), { k: 0.02, cor: T.cor || 'base', padrao: T.padrao });
    tb = e;
  }
  if (T.tufo) eli('cauda3', tb, [T.tufo, T.tufo * 1.6, T.tufo], { k: 0.02, cor: 'escuro', ruido: T.tufo * 0.3 });
  return { bones, shapes, extras, chestC, hipC, skull, ne, nb, hd, mz1 };
}

function build(nome, P, more) {
  const q = quadruped(P);
  if (more) more(q, P);
  return { id: nome, versao: 1, tipo: 'quadrupede', celula: P.celula, cores: P.cores, padrao: P.padrao || null, ossos: q.bones, formas: q.shapes, extras: q.extras, anim: P.anim };
}

const M = {};
M.leao = build('leao', {
  celula: 0.02, L: 1.0, legF: 0.74, legH: 0.76, chest: [0.24, 0.3, 0.36], hip: [0.22, 0.24, 0.3], belly: 0.21,
  neck: { len: 0.32, ang: 0.42, r0: 0.18, r1: 0.15 }, head: { dir: 0.3, skull: [0.15, 0.14, 0.17], muzzle: { len: 0.17, r0: 0.11, r1: 0.085, cor: 'focinho' }, eye: 0.16 },
  ears: { tipo: 'redonda', t: 0.05 }, pF: { len: [0.34, 0.3, 0.1], r: [0.085, 0.06, 0.05] }, pH: { len: [0.36, 0.3, 0.1], r: [0.1, 0.055, 0.05] },
  foot: { tipo: 'pata', h: 0.06, r: 0.065 }, tail: { len: 0.85, r: 0.032, tufo: 0.05, dirs: [[0, -0.2, -1], [0, -1, -0.5], [0, -0.6, -0.5]] },
  cores: { base: '#c99a52', ventre: '#e8cf9f', escuro: '#5a3518', nariz: '#4a2f24', juba: '#7a4a22', pata: '#b98b4a', focinho: '#e2c89c' },
  anim: { passo: 0.5, freq: 4.2, pescoco: 0.7 },
}, (q, P) => {
  // juba só no macho
  q.shapes.push({ t: 'eli', osso: 'pescoco2', c: R(add(lerp(q.nb, q.ne, 0.6), [0, 0.06, -0.02])), r: [0.27, 0.31, 0.27], k: 0.08, cor: 'juba', ruido: 0.035, so: 'M' });
  q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.skull, [0, 0.0, -0.13])), r: [0.25, 0.27, 0.12], k: 0.05, cor: 'juba', ruido: 0.03, so: 'M' });
  q.shapes.push({ t: 'eli', osso: 'peito', c: R(add(q.chestC, [0, -0.08, 0.22])), r: [0.16, 0.2, 0.14], k: 0.08, cor: 'juba', ruido: 0.025, so: 'M' });
});
M.zebra = build('zebra', {
  celula: 0.018, L: 0.92, legF: 0.8, legH: 0.82, chest: [0.22, 0.28, 0.33], hip: [0.22, 0.26, 0.3], belly: 0.23,
  neck: { len: 0.58, ang: 0.9, r0: 0.14, r1: 0.085 }, head: { dir: 1.0, skull: [0.1, 0.12, 0.13], muzzle: { len: 0.27, r0: 0.088, r1: 0.07 }, eye: 0.2 },
  ears: { tipo: 'pontuda', t: 0.15 }, pF: { len: [0.33, 0.33, 0.12], r: [0.065, 0.04, 0.032] }, pH: { len: [0.36, 0.33, 0.12], r: [0.08, 0.042, 0.032] },
  foot: { tipo: 'casco', h: 0.07, r: 0.042 }, tail: { len: 0.6, r: 0.022, tufo: 0.028 },
  mane: { h: 0.075, w: 0.035, cor: 'base', padrao: 'listras' }, padrao: { tipo: 'listras', periodo: 0.1, largura: 0.4, ondula: 0.035 },
  torsoPad: { padrao: 'listrasCorpo' }, neckPad: { padrao: 'listras' }, legPattern: 'listras', headPattern: 'listras',
  cores: { base: '#f3f1ea', listra: '#161616', ventre: '#f3f1ea', escuro: '#1a1a1a', nariz: '#1b1b1b', casco: '#2a2a2a' },
  anim: { passo: 0.55, freq: 4.0, pescoco: 1.05 },
});
M.elefante = build('elefante', {
  celula: 0.045, L: 1.3, legF: 1.25, legH: 1.18, chest: [0.6, 0.78, 0.72], hip: [0.56, 0.7, 0.62], belly: 0.63, kBody: 0.2,
  neck: { len: 0.28, ang: 0.25, r0: 0.5, r1: 0.44 }, head: { dir: 0.55, skull: [0.38, 0.46, 0.42], muzzle: { len: 0.15, r0: 0.26, r1: 0.2 }, eye: 0.07 },
  ears: { tipo: 'elefante', t: 0.72 }, pF: { len: [0.6, 0.48, 0.12], r: [0.25, 0.21, 0.2] }, pH: { len: [0.56, 0.48, 0.1], r: [0.27, 0.21, 0.2] },
  foot: { tipo: 'coluna', h: 0.15, r: 0.22 }, tail: { len: 0.8, r: 0.04, tufo: 0.045 },
  torsoPad: { ruido: 0.003 },
  cores: { base: '#8f8a84', ventre: '#827d77', escuro: '#3e3a36', nariz: '#77726c', marfim: '#efe6cf', unha: '#cfc6b4' },
  anim: { passo: 0.32, freq: 2.4, pescoco: 0.25 },
}, (q) => {
  let a = q.mz1, prev = 'cabeca'; const segs = [[0, -0.42, 0.12], [0, -0.42, 0.04], [0, -0.38, 0.02], [0, -0.3, 0.06]];
  for (let i = 0; i < 4; i++) { const e = add(a, segs[i]); const b = 'tromba' + (i + 1); q.bones.push({ nome: b, pai: prev, pos: R(a) }); prev = b;
    q.shapes.push({ t: 'cap', osso: b, a: R(a), b: R(e), r: [+(0.19 - i * 0.035).toFixed(3), +(0.19 - (i + 1) * 0.035).toFixed(3)], k: 0.05, cor: 'base', ruido: 0.008, aneis: true }); a = e; }
  for (const sx of [-1, 1]) { const b0 = add(q.skull, [sx * 0.2, -0.32, 0.38]); q.shapes.push({ t: 'cap', osso: 'cabeca', a: R(b0), b: R(add(b0, [sx * 0.06, -0.3, 0.38])), r: [0.06, 0.035], k: 0.03, cor: 'marfim' }); }
});
M.girafa = build('girafa', {
  celula: 0.028, L: 1.0, legF: 1.75, legH: 1.58, chest: [0.3, 0.4, 0.45], hip: [0.26, 0.31, 0.32], belly: 0.29,
  neck: { len: 1.8, ang: 1.05, r0: 0.22, r1: 0.09 }, head: { dir: 0.5, skull: [0.1, 0.12, 0.14], muzzle: { len: 0.3, r0: 0.075, r1: 0.06 }, eye: 0.22 },
  ears: { tipo: 'pontuda', t: 0.13 }, ossicones: 0.13, pF: { len: [0.72, 0.78, 0.2], r: [0.075, 0.045, 0.038] }, pH: { len: [0.66, 0.7, 0.18], r: [0.09, 0.048, 0.04] },
  foot: { tipo: 'casco', h: 0.08, r: 0.05 }, tail: { len: 0.85, r: 0.025, tufo: 0.035 }, mane: { h: 0.11, w: 0.03, cor: 'escuro' },
  padrao: { tipo: 'manchas', celula: 0.19, linha: 0.028 },
  torsoPad: { padrao: 'manchas' }, neckPad: { padrao: 'manchas' }, legPattern: 'manchasPerna',
  cores: { base: '#a8652c', claro: '#efdcb0', ventre: '#e9d6a8', escuro: '#4a2b16', nariz: '#5c3a22', casco: '#3a2a1e' },
  anim: { passo: 0.42, freq: 2.6, pescoco: 0.55 },
});
M.macaco = build('macaco', {
  celula: 0.011, L: 0.3, legF: 0.4, legH: 0.32, chest: [0.11, 0.12, 0.15], hip: [0.1, 0.105, 0.12], belly: 0.095,
  neck: { len: 0.07, ang: 0.6, r0: 0.06, r1: 0.055 }, head: { dir: 0.05, skull: [0.08, 0.085, 0.085], muzzle: { len: 0.045, r0: 0.05, r1: 0.04, cor: 'rosto' }, eye: 0.17 },
  ears: { tipo: 'redonda', t: 0.03, cor: 'rosto' }, pF: { len: [0.17, 0.16, 0.05], r: [0.034, 0.026, 0.022] }, pH: { len: [0.15, 0.13, 0.04], r: [0.042, 0.028, 0.022] },
  foot: { tipo: 'mao', h: 0.025, r: 0.03 }, tail: { len: 0.75, r: 0.018, dirs: [[0, 0.4, -1], [0, 1, -0.3], [0, 0.4, 0.6]] },
  cores: { base: '#6e5038', ventre: '#b59a78', escuro: '#3b2a1c', nariz: '#4a3326', rosto: '#d8b394', pele: '#3d2c22' },
  anim: { passo: 0.6, freq: 5.5, pescoco: 0.5 },
}, (q) => { q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.skull, [0, -0.005, 0.055])), r: [0.06, 0.06, 0.04], k: 0.02, cor: 'rosto' }); });

M.hipopotamo = build('hipopotamo', {
  celula: 0.03, L: 1.2, legF: 0.55, legH: 0.55, chest: [0.52, 0.5, 0.6], hip: [0.52, 0.48, 0.56], belly: 0.52, kBody: 0.22,
  neck: { len: 0.2, ang: 0.2, r0: 0.42, r1: 0.36 }, head: { dir: 0.25, skull: [0.3, 0.27, 0.32], muzzle: { len: 0.34, r0: 0.28, r1: 0.31, cor: 'focinho' }, eye: 0.1 },
  ears: { tipo: 'redonda', t: 0.05 }, pF: { len: [0.24, 0.18, 0.06], r: [0.2, 0.17, 0.16] }, pH: { len: [0.24, 0.18, 0.06], r: [0.22, 0.17, 0.16] },
  foot: { tipo: 'coluna', h: 0.09, r: 0.16 }, tail: { len: 0.3, r: 0.05, dirs: [[0, -0.3, -1], [0, -1, -0.3], [0, -1, 0]] },
  torsoPad: { ruido: 0.004 },
  cores: { base: '#7a6763', ventre: '#c4978a', escuro: '#3a2e2c', nariz: '#5c4a47', focinho: '#9c7a72', unha: '#b8a898' },
  anim: { passo: 0.35, freq: 2.8, pescoco: 0.3 },
}, (q) => {
  // focinho largo e olhos/narinas no alto, como um hipopótamo de verdade
  for (const sx of [-1, 1]) q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.mz1, [sx * 0.16, -0.02, -0.08])), r: [0.17, 0.2, 0.22], k: 0.06, cor: 'focinho' });
  for (const sx of [-1, 1]) q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.skull, [sx * 0.17, 0.2, 0.08])), r: [0.07, 0.06, 0.07], k: 0.05, cor: 'base' });
  for (const sx of [-1, 1]) q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.mz1, [sx * 0.08, 0.22, 0.05])), r: [0.04, 0.03, 0.04], k: 0.02, cor: 'nariz' });
});
M.rinoceronte = build('rinoceronte', {
  celula: 0.03, L: 1.25, legF: 0.78, legH: 0.74, chest: [0.44, 0.5, 0.55], hip: [0.42, 0.46, 0.48], belly: 0.44, kBody: 0.18,
  neck: { len: 0.32, ang: 0.15, r0: 0.38, r1: 0.3 }, head: { dir: 0.85, skull: [0.19, 0.22, 0.3], muzzle: { len: 0.32, r0: 0.19, r1: 0.17 }, eye: 0.09 },
  ears: { tipo: 'pontuda', t: 0.17 }, pF: { len: [0.36, 0.28, 0.08], r: [0.19, 0.15, 0.13] }, pH: { len: [0.34, 0.27, 0.08], r: [0.21, 0.15, 0.13] },
  foot: { tipo: 'coluna', h: 0.1, r: 0.14 }, tail: { len: 0.5, r: 0.03, tufo: 0.03 },
  torsoPad: { ruido: 0.002 },
  cores: { base: '#8a847c', ventre: '#7c766e', escuro: '#35322e', nariz: '#6a645d', chifre: '#5e5348', unha: '#bdb2a2' },
  anim: { passo: 0.38, freq: 3.0, pescoco: 0.35 },
}, (q) => {
  const up = [0, Math.cos(0.85), Math.sin(0.85)];
  const b1 = add(q.mz1, mul(up, 0.14)), b2 = add(q.mz1, add(mul(up, 0.2), mul(q.hd, -0.3)));
  q.shapes.push({ t: 'cap', osso: 'cabeca', a: R(b1), b: R(add(b1, add(mul(up, 0.5), mul(q.hd, 0.14)))), r: [0.1, 0.012], k: 0.04, cor: 'chifre' });
  q.shapes.push({ t: 'cap', osso: 'cabeca', a: R(b2), b: R(add(b2, mul(up, 0.2))), r: [0.08, 0.015], k: 0.04, cor: 'chifre' });
  // ombro e dobras da pele
  q.shapes.push({ t: 'eli', osso: 'peito', c: R(add(q.chestC, [0, 0.38, -0.05])), r: [0.3, 0.2, 0.3], k: 0.15, cor: 'base', ruido: 0.002 });
});
M.gorila = build('gorila', {
  celula: 0.018, L: 0.5, legF: 0.74, legH: 0.46, chest: [0.32, 0.36, 0.3], hip: [0.24, 0.26, 0.22], belly: 0.26, kBody: 0.14,
  neck: { len: 0.08, ang: 0.5, r0: 0.18, r1: 0.16 }, head: { dir: 0.15, skull: [0.15, 0.17, 0.15], muzzle: { len: 0.07, r0: 0.11, r1: 0.1, cor: 'rosto' }, eye: 0.12 },
  ears: { tipo: 'redonda', t: 0.03, cor: 'rosto' }, pF: { len: [0.36, 0.32, 0.06], r: [0.13, 0.1, 0.075] }, pH: { len: [0.22, 0.16, 0.05], r: [0.12, 0.085, 0.07] },
  foot: { tipo: 'mao', h: 0.04, r: 0.08 }, tail: { len: 0.03, r: 0.01 },
  torsoPad: { ruido: 0.006 },
  cores: { base: '#2b2725', ventre: '#3a3330', escuro: '#151312', nariz: '#151312', rosto: '#24201e', pele: '#1c1918', prata: '#9b968f' },
  anim: { passo: 0.42, freq: 2.6, pescoco: 0.5 },
}, (q) => {
  q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.skull, [0, 0.06, 0.1])), r: [0.14, 0.05, 0.06], k: 0.03, cor: 'rosto' }); // sobrancelha
  q.shapes.push({ t: 'eli', osso: 'cabeca', c: R(add(q.skull, [0, 0.15, -0.04])), r: [0.06, 0.12, 0.13], k: 0.06, cor: 'base', so: 'M' }); // crista do macho
  q.shapes.push({ t: 'eli', osso: 'coluna', c: R(add(lerp(q.hipC, q.chestC, 0.35), [0, 0.27, 0])), r: [0.24, 0.1, 0.24], k: 0.08, cor: 'prata', so: 'M' }); // costas-prateadas
  for (const sx of [-1, 1]) q.shapes.push({ t: 'eli', osso: 'peito', c: R(add(q.chestC, [sx * 0.24, 0.18, 0.04])), r: [0.14, 0.14, 0.15], k: 0.1, cor: 'base', ruido: 0.006 }); // ombros
});
M.tartaruga = build('tartaruga', {
  celula: 0.016, L: 0.5, legF: 0.27, legH: 0.25, chest: [0.24, 0.17, 0.24], hip: [0.24, 0.16, 0.22], belly: 0.19,
  neck: { len: 0.32, ang: 0.25, r0: 0.085, r1: 0.07 }, head: { dir: 0.25, skull: [0.075, 0.068, 0.09], muzzle: { len: 0.045, r0: 0.06, r1: 0.048 }, eye: 0.16 },
  ears: { tipo: 'nenhuma' }, pF: { len: [0.12, 0.1, 0.03], r: [0.075, 0.072, 0.07] }, pH: { len: [0.12, 0.08, 0.03], r: [0.08, 0.075, 0.072] },
  foot: { tipo: 'coluna', h: 0.04, r: 0.075 }, tail: { len: 0.12, r: 0.035 },
  padrao: { tipo: 'manchas', celula: 0.17, linha: 0.016 },
  cores: { base: '#6e6c60', ventre: '#827f70', escuro: '#2b2a24', nariz: '#3d3b33', casco: '#4d3f2b', claro: '#2a2017', unha: '#c8bfa8' },
  anim: { passo: 0.32, freq: 1.3, pescoco: 0.45 },
}, (q) => {
  const c = lerp(q.hipC, q.chestC, 0.5);
  q.shapes.push({ t: 'eli', osso: 'coluna', c: R(add(c, [0, 0.12, 0])), r: [0.48, 0.33, 0.6], k: 0.03, cor: 'casco', padrao: 'manchas' }); // carapaça
  q.shapes.push({ t: 'eli', osso: 'coluna', c: R(add(c, [0, -0.04, 0])), r: [0.44, 0.1, 0.55], k: 0.03, cor: 'casco' }); // plastrão
});

// ---------- aves (flamingo) ----------
function bird() {
  const bones = [], shapes = [], extras = [];
  const bone = (nome, pai, pos) => bones.push({ nome, pai, pos: R(pos) });
  const cap = (osso, a, b, ra, rb, cor, o = {}) => shapes.push({ t: 'cap', osso, a: R(a), b: R(b), r: [ra, rb], k: o.k ?? 0.02, cor, ...o });
  const eli = (osso, c, r, cor, o = {}) => shapes.push({ t: 'eli', osso, c: R(c), r: R(r), k: o.k ?? 0.03, cor, ...o });
  bone('raiz', null, [0, 0, 0]); bone('quadril', 'raiz', [0, 1.02, -0.02]); bone('peito', 'quadril', [0, 1.08, 0.18]);
  eli('quadril', [0, 1.05, -0.02], [0.15, 0.14, 0.28], 'base', { k: 0.06, rot: [-0.2, 0, 0], ventre: true });
  eli('peito', [0, 1.1, 0.16], [0.12, 0.13, 0.14], 'base', { k: 0.06 });
  eli('quadril', [0, 1.1, -0.3], [0.08, 0.05, 0.12], 'base', { k: 0.04, rot: [0.3, 0, 0] }); // cauda
  for (const sx of [-1, 1]) {
    eli('quadril', [sx * 0.12, 1.1, -0.04], [0.04, 0.1, 0.25], 'asa', { k: 0.04, rot: [-0.25, 0, sx * 0.12] });
    eli('quadril', [sx * 0.1, 1.08, -0.3], [0.035, 0.05, 0.13], 'escuro', { k: 0.02, rot: [0.25, 0, 0] });
  }
  // pescoço em "S"
  const N = [[0, 1.16, 0.26], [0, 1.36, 0.33], [0, 1.56, 0.24], [0, 1.7, 0.28]];
  bone('pescoco', 'peito', N[0]); bone('pescoco2', 'pescoco', N[1]); bone('pescoco3', 'pescoco2', N[2]); bone('cabeca', 'pescoco3', N[3]);
  cap('pescoco', N[0], N[1], 0.05, 0.035, 'base'); cap('pescoco2', N[1], N[2], 0.035, 0.03, 'base'); cap('pescoco3', N[2], N[3], 0.03, 0.03, 'base');
  eli('cabeca', [0, 1.73, 0.3], [0.042, 0.042, 0.055], 'base', { k: 0.02 });
  cap('cabeca', [0, 1.72, 0.34], [0, 1.69, 0.43], 0.03, 0.024, 'bico', { k: 0.015 });
  cap('cabeca', [0, 1.69, 0.43], [0, 1.62, 0.45], 0.024, 0.012, 'escuro', { k: 0.012 });
  extras.push({ tipo: 'olho', osso: 'cabeca', pos: [0.034, 1.745, 0.31], r: 0.008 }, { tipo: 'olho', osso: 'cabeca', pos: [-0.034, 1.745, 0.31], r: 0.008 });
  for (const [sx, s] of [[-1, 'E'], [1, 'D']]) {
    const x = sx * 0.06;
    bone('perna' + s + '1', 'quadril', [x, 0.98, 0]); bone('perna' + s + '2', 'perna' + s + '1', [x, 0.52, -0.03]); bone('perna' + s + '3', 'perna' + s + '2', [x, 0.04, 0]);
    cap('perna' + s + '1', [x, 0.98, 0], [x, 0.8, -0.01], 0.04, 0.025, 'base', { k: 0.03 });
    cap('perna' + s + '1', [x, 0.8, -0.01], [x, 0.52, -0.03], 0.02, 0.019, 'perna', { k: 0.01 });
    eli('perna' + s + '2', [x, 0.52, -0.03], [0.025, 0.028, 0.025], 'perna', { k: 0.01 });
    cap('perna' + s + '2', [x, 0.52, -0.03], [x, 0.05, 0], 0.019, 0.017, 'perna', { k: 0.01 });
    eli('perna' + s + '3', [x, 0.022, 0.05], [0.05, 0.014, 0.08], 'perna', { k: 0.015 });
  }
  return { id: 'flamingo', versao: 1, tipo: 'ave', celula: 0.011, ossos: bones, formas: shapes, extras,
    cores: { base: '#f29bb0', ventre: '#f7c0cc', asa: '#e8607e', escuro: '#151515', bico: '#f3d6d6', perna: '#e57f93' },
    anim: { passo: 0.45, freq: 3.4, pescoco: 1.4 } };
}
M.flamingo = bird();

// ---------- humanos (equipe) ----------
function human() {
  const bones = [], shapes = [], extras = [];
  const bone = (nome, pai, pos) => bones.push({ nome, pai, pos: R(pos) });
  const cap = (osso, a, b, ra, rb, cor, o = {}) => shapes.push({ t: 'cap', osso, a: R(a), b: R(b), r: [ra, rb], k: o.k ?? 0.03, cor, ...o });
  const eli = (osso, c, r, cor, o = {}) => shapes.push({ t: 'eli', osso, c: R(c), r: R(r), k: o.k ?? 0.03, cor, ...o });
  bone('raiz', null, [0, 0, 0]); bone('quadril', 'raiz', [0, 0.95, 0]); bone('peito', 'quadril', [0, 1.2, 0]); bone('cabeca', 'peito', [0, 1.5, 0]);
  eli('quadril', [0, 0.97, 0], [0.17, 0.12, 0.11], 'calca', { k: 0.06 });
  cap('peito', [0, 1.05, 0], [0, 1.36, 0], 0.15, 0.175, 'camisa', { k: 0.07 });
  eli('peito', [0, 1.33, 0.01], [0.2, 0.1, 0.11], 'camisa', { k: 0.06 });
  shapes.push({ t: 'cap', osso: 'peito', a: [0, 0.98, 0], b: [0, 1.12, 0], r: [0.19, 0.17], k: 0.05, cor: 'camisa', so: 'jaleco' });
  cap('cabeca', [0, 1.42, 0], [0, 1.52, 0.005], 0.05, 0.048, 'pele', { k: 0.03 });
  eli('cabeca', [0, 1.62, 0.01], [0.085, 0.105, 0.095], 'pele', { k: 0.03 });
  eli('cabeca', [0, 1.6, 0.095], [0.015, 0.022, 0.02], 'pele', { k: 0.01 });
  eli('cabeca', [0, 1.67, -0.012], [0.09, 0.08, 0.095], 'cabelo', { k: 0.015 });
  shapes.push({ t: 'cap', osso: 'cabeca', a: [0, 1.7, -0.01], b: [0, 1.73, -0.01], r: [0.098, 0.095], k: 0.01, cor: 'chapeu', so: 'bone' });
  shapes.push({ t: 'eli', osso: 'cabeca', c: [0, 1.7, 0.1], r: [0.07, 0.012, 0.05], k: 0.01, cor: 'chapeu', so: 'bone' });
  extras.push({ tipo: 'olho', osso: 'cabeca', pos: [0.033, 1.635, 0.083], r: 0.011 }, { tipo: 'olho', osso: 'cabeca', pos: [-0.033, 1.635, 0.083], r: 0.011 });
  for (const [sx, s] of [[-1, 'E'], [1, 'D']]) {
    bone('braco' + s + '1', 'peito', [sx * 0.21, 1.4, 0]); bone('braco' + s + '2', 'braco' + s + '1', [sx * 0.24, 1.13, 0]); bone('mao' + s, 'braco' + s + '2', [sx * 0.25, 0.87, 0.02]);
    cap('braco' + s + '1', [sx * 0.2, 1.4, 0], [sx * 0.235, 1.14, 0], 0.052, 0.042, 'camisa');
    cap('braco' + s + '2', [sx * 0.24, 1.13, 0], [sx * 0.25, 0.9, 0.02], 0.04, 0.032, 'pele');
    eli('mao' + s, [sx * 0.25, 0.84, 0.025], [0.025, 0.045, 0.035], 'pele', { k: 0.015 });
    bone('perna' + s + '1', 'quadril', [sx * 0.095, 0.93, 0]); bone('perna' + s + '2', 'perna' + s + '1', [sx * 0.09, 0.5, 0.01]); bone('pe' + s, 'perna' + s + '2', [sx * 0.09, 0.08, 0]);
    cap('perna' + s + '1', [sx * 0.095, 0.93, 0], [sx * 0.09, 0.5, 0.01], 0.075, 0.055, 'calca');
    cap('perna' + s + '2', [sx * 0.09, 0.5, 0.01], [sx * 0.09, 0.1, 0], 0.052, 0.04, 'calca');
    eli('pe' + s, [sx * 0.09, 0.045, 0.045], [0.05, 0.045, 0.12], 'sapato', { k: 0.02 });
  }
  return { id: 'humano', versao: 1, tipo: 'humano', celula: 0.018, ossos: bones, formas: shapes, extras,
    variantes: {
      tratador: { tags: ['bone'], cores: { camisa: '#4c7d3a', calca: '#8a7a55', chapeu: '#3e6a2c', sapato: '#3a2a1e', pele: '#c99673', cabelo: '#2b1d14' } },
      veterinario: { tags: ['jaleco'], cores: { camisa: '#f2f2f0', calca: '#3c5a7a', chapeu: '#fff', sapato: '#222', pele: '#a8775a', cabelo: '#1c1410' } },
      faxineiro: { tags: [], cores: { camisa: '#2f62a8', calca: '#2f62a8', chapeu: '#2f62a8', sapato: '#222', pele: '#e0b394', cabelo: '#5a3a22' } },
      seguranca: { tags: ['bone'], cores: { camisa: '#22262b', calca: '#1a1d21', chapeu: '#111', sapato: '#111', pele: '#8a5a3e', cabelo: '#111' } },
    } };
}
M.humano = human();
for (const [k, v] of Object.entries(M)) writeFileSync(`src/content/modelos/${k}.json`, JSON.stringify(v, null, 1));
console.log('modelos:', Object.keys(M).map(k => `${k}(${M[k].formas.length} formas, ${M[k].ossos.length} ossos)`).join(', '));
