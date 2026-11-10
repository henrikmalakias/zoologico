import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canopyGeometry, leafMaterial } from './ultra.js';

// ---------- materiais e geometrias com cache por qualidade ----------
export class Kit {
  constructor(q) { this.q = q; this.hi = q !== 'baixo'; this.ultra = q === 'ultra'; this.mats = new Map(); this.geos = new Map(); this.texs = new Map(); this.seg = this.hi ? 14 : 6; }
  mat(color, o = {}) {
    const k = color + JSON.stringify({ ...o, map: o.map ? o.map.uuid : null });
    if (!this.mats.has(k)) {
      const m = this.hi ? new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, map: o.map || null, transparent: !!o.opacity, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide })
                        : new THREE.MeshLambertMaterial({ color, flatShading: true, map: o.map || null, transparent: !!o.opacity, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
      this.mats.set(k, m);
    }
    return this.mats.get(k);
  }
  geo(key, fn) { if (!this.geos.has(key)) this.geos.set(key, fn()); return this.geos.get(key); }
  sphere(r = 1) { return this.geo('sph' + r, () => new THREE.SphereGeometry(r, this.seg, Math.max(4, (this.seg >> 1) + 2))); }
  cyl(rt, rb, h) { return this.geo(`cyl${rt},${rb},${h}`, () => new THREE.CylinderGeometry(rt, rb, h, Math.max(5, this.seg - 2))); }
  cone(r, h) { return this.geo(`cone${r},${h}`, () => new THREE.ConeGeometry(r, h, Math.max(5, this.seg - 2))); }
  box(w, h, d) { return this.geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); }
  tex(key, fn, make) {
    if (!this.texs.has(key) && make) this.texs.set(key, make());
    if (!this.texs.has(key)) { const c = fn(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (!this.hi) { t.magFilter = THREE.NearestFilter; } t.anisotropy = this.hi ? 4 : 1; this.texs.set(key, t); }
    return this.texs.get(key);
  }
  bark(kind) { // casca de árvore real (Poly Haven) no gráfico Ultra
    return this.tex('bark' + kind, null, () => { const t = new THREE.TextureLoader().load(`./ultra/casca/${kind}_cor.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); return t; });
  }
  mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); if (this.hi && shadow) { m.castShadow = true; m.receiveShadow = true; } return m; }
  dispose() { this._netMat?.dispose(); for (const m of this.mats.values()) m.dispose(); for (const g of this.geos.values()) g.dispose(); for (const t of this.texs.values()) t.dispose(); }
}

const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
export function labelCanvas(text, bg = '#1f4e3d', fg = '#fff', w = 256, h = 64) {
  return canvas(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.5)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
}
const stripes = () => canvas(128, 128, (g) => { g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1b1b1b';
  for (let i = 0; i < 9; i++) { g.beginPath(); const x = i * 15; g.moveTo(x, 0); g.bezierCurveTo(x + 8, 40, x - 6, 90, x + 4, 128); g.lineTo(x + 10, 128); g.bezierCurveTo(x + 2, 90, x + 16, 40, x + 7, 0); g.fill(); } });
const spots = () => canvas(128, 128, (g) => { g.fillStyle = '#efd9a7'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#a5622a';
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { g.beginPath(); const x = r() * 128, y = r() * 128, s = 8 + r() * 9; g.moveTo(x, y - s); for (let k = 1; k < 6; k++) { const a = k / 6 * 6.283; g.lineTo(x + Math.sin(a) * s * (0.7 + r() * 0.4), y - Math.cos(a) * s * (0.7 + r() * 0.4)); } g.fill(); } });

// ---------- animais ----------
const DEF = {
  leao: { len: 1.9, bh: 0.75, bw: 0.62, legH: 0.8, legR: 0.11, neck: [0.35, 0.5], head: 0.32, tail: 0.9, color: '#c8963e' },
  zebra: { len: 1.6, bh: 0.72, bw: 0.5, legH: 0.85, legR: 0.07, neck: [0.75, 0.9], head: 0.24, headLen: 1.8, tail: 0.6, color: '#f2f2ee', tex: 'stripes' },
  elefante: { len: 2.6, bh: 1.65, bw: 1.45, legH: 1.25, legR: 0.27, neck: [0.25, 0.25], head: 0.62, tail: 0.7, color: '#8e8a86' },
  girafa: { len: 1.6, bh: 0.95, bw: 0.62, legH: 1.65, legR: 0.07, neck: [2.0, 1.05], head: 0.22, headLen: 1.9, tail: 0.8, color: '#e3b866', tex: 'spots' },
  macaco: { len: 0.55, bh: 0.45, bw: 0.35, legH: 0.32, legR: 0.05, neck: [0.1, 0.4], head: 0.17, tail: 0.75, color: '#6b4a32' },
  hipopotamo: { len: 2.3, bh: 1.0, bw: 1.05, legH: 0.42, legR: 0.18, neck: [0.12, 1.3], head: 0.45, headLen: 1.25, tail: 0.3, color: '#7a6763', dark: '#9c7a72' },
  rinoceronte: { len: 2.2, bh: 0.95, bw: 0.85, legH: 0.68, legR: 0.16, neck: [0.3, 1.5], head: 0.36, headLen: 1.7, tail: 0.45, color: '#8a847c', dark: '#5e5348' },
  gorila: { len: 0.75, bh: 0.8, bw: 0.7, legH: 0.55, legR: 0.12, neck: [0.1, 0.3], head: 0.27, headLen: 1.0, tail: 0.01, color: '#2b2725', dark: '#151312' },
  tartaruga: { len: 0.6, bh: 0.32, bw: 0.5, legH: 0.2, legR: 0.07, neck: [0.32, 1.3], head: 0.11, headLen: 1.1, tail: 0.1, color: '#6e6c60', dark: '#3d3b33' },
};
function buildBird(kit) {
  const pink = kit.mat('#f29bb0'), wing = kit.mat('#e8607e'), black = kit.mat('#151515'), legM = kit.mat('#e57f93'), beak = kit.mat('#f3d6d6');
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const body = kit.mesh(kit.sphere(0.5), pink); body.scale.set(0.3, 0.28, 0.58); body.position.set(0, 1.05, 0); rig.add(body);
  for (const sx of [-1, 1]) { const w = kit.mesh(kit.sphere(0.5), wing); w.scale.set(0.08, 0.2, 0.5); w.position.set(sx * 0.12, 1.1, -0.04); rig.add(w); const t = kit.mesh(kit.sphere(0.5), black); t.scale.set(0.07, 0.1, 0.24); t.position.set(sx * 0.1, 1.08, -0.3); rig.add(t); }
  const legs = [];
  for (const sx of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(sx * 0.06, 0.98, 0); const l = kit.mesh(kit.cyl(0.02, 0.02, 0.96), legM); l.position.y = -0.48; pv.add(l); const f = kit.mesh(kit.box(0.08, 0.02, 0.14), legM); f.position.set(0, -0.96, 0.05); pv.add(f); rig.add(pv); legs.push(pv); }
  const neck = new THREE.Group(); neck.position.set(0, 1.15, 0.26); rig.add(neck);
  const n1 = kit.mesh(kit.cyl(0.035, 0.05, 0.42), pink); n1.position.set(0, 0.2, 0.04); n1.rotation.x = 0.15; neck.add(n1);
  const n2 = kit.mesh(kit.cyl(0.03, 0.035, 0.36), pink); n2.position.set(0, 0.48, 0.0); n2.rotation.x = -0.3; neck.add(n2);
  const head = new THREE.Group(); head.position.set(0, 0.6, 0.04); neck.add(head);
  const hm = kit.mesh(kit.sphere(0.5), pink); hm.scale.set(0.085, 0.085, 0.11); head.add(hm);
  const bk = kit.mesh(kit.cone(0.03, 0.14), beak); bk.rotation.x = 1.9; bk.position.set(0, -0.03, 0.1); head.add(bk);
  const tip = kit.mesh(kit.cone(0.018, 0.06), black); tip.rotation.x = 2.6; tip.position.set(0, -0.08, 0.15); head.add(tip);
  const tail = new THREE.Group(); tail.position.set(0, 1.1, -0.3); rig.add(tail);
  root.userData = { sp: 'flamingo', bird: true, legs, neck, head, tail, trunk: null, rig, d: { legH: 0.98 }, phase: Math.random() * 6 };
  return root;
}
export function buildAnimal(kit, sp, male, S) {
  if (sp === 'flamingo' || S?.baixo?.ave) return buildBird(kit);
  const d = DEF[sp] || (S?.baixo ? { ...DEF.zebra, ...S.baixo, tex: S.baixo.tex === 'listras' ? 'stripes' : S.baixo.tex === 'manchas' ? 'spots' : null } : DEF.zebra);
  const map = d.tex === 'stripes' ? kit.tex('stripes', stripes) : d.tex === 'spots' ? kit.tex('spots', spots) : null;
  const body = kit.mat(map ? '#ffffff' : d.color, { map });
  const dark = kit.mat(d.dark || (sp === 'elefante' ? '#77736f' : sp === 'zebra' ? '#1b1b1b' : sp === 'girafa' ? '#9c6a3a' : sp === 'leao' ? '#a8782f' : '#4a3222'));
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const torso = kit.mesh(kit.sphere(0.5), body); torso.scale.set(d.bw, d.bh, d.len); torso.position.y = d.legH + d.bh * 0.4; rig.add(torso);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * d.bw * 0.3, d.legH + 0.05, sz * d.len * 0.32);
    const leg = kit.mesh(kit.cyl(d.legR, d.legR * 0.8, d.legH), sp === 'zebra' || sp === 'girafa' ? body : sp === 'leao' ? body : body); leg.position.y = -d.legH / 2; pivot.add(leg);
    const hoof = kit.mesh(kit.cyl(d.legR * 0.9, d.legR, 0.08), dark); hoof.position.y = -d.legH + 0.04; pivot.add(hoof);
    rig.add(pivot); legs.push(pivot);
  }
  // pescoço e cabeça
  const neck = new THREE.Group(); neck.position.set(0, d.legH + d.bh * 0.55, d.len * 0.42); rig.add(neck);
  const nl = d.neck[0], na = d.neck[1];
  const nm = kit.mesh(kit.cyl(Math.max(0.06, d.head * 0.45), Math.max(0.08, d.head * 0.6), nl), body); nm.position.set(0, Math.cos(na) * nl / 2, Math.sin(na) * nl / 2); nm.rotation.x = na; neck.add(nm);
  const head = new THREE.Group(); head.position.set(0, Math.cos(na) * nl, Math.sin(na) * nl); neck.add(head);
  const hm = kit.mesh(kit.sphere(0.5), body); hm.scale.set(d.head * 1.6, d.head * 1.7, d.head * 2 * (d.headLen || 1.2)); head.add(hm);
  const snout = kit.mesh(kit.sphere(0.5), dark); snout.scale.set(d.head * 0.9, d.head * 0.8, d.head * 0.9); snout.position.set(0, -d.head * 0.15, d.head * (d.headLen || 1.2) * 0.95); head.add(snout);
  const eyeM = kit.mat('#111111');
  for (const sx of [-1, 1]) { const e = kit.mesh(kit.sphere(0.5), eyeM, false); e.scale.setScalar(d.head * 0.18); e.position.set(sx * d.head * 0.62, d.head * 0.25, d.head * 0.55); head.add(e); }
  if (sp === 'leao' && male) { const mane = kit.mesh(kit.sphere(0.5), kit.mat('#6b3f1d')); mane.scale.set(d.head * 2.9, d.head * 2.9, d.head * 2.2); mane.position.z = -d.head * 0.35; head.add(mane); }
  if (sp === 'leao' || sp === 'macaco') for (const sx of [-1, 1]) { const ear = kit.mesh(kit.sphere(0.5), body); ear.scale.setScalar(d.head * 0.5); ear.position.set(sx * d.head * 0.65, d.head * 0.75, -d.head * 0.1); head.add(ear); }
  if (sp === 'zebra' || sp === 'girafa') for (const sx of [-1, 1]) { const ear = kit.mesh(kit.cone(d.head * 0.18, d.head * 0.6), body); ear.position.set(sx * d.head * 0.45, d.head * 0.9, -d.head * 0.2); ear.rotation.z = -sx * 0.4; head.add(ear); }
  if (sp === 'zebra') { const mane = kit.mesh(kit.box(0.06, 0.16, nl * 0.95), dark); mane.position.set(0, Math.cos(na) * nl / 2 + 0.12, Math.sin(na) * nl / 2 - 0.05); mane.rotation.x = na - 1.57; neck.add(mane); }
  if (sp === 'girafa') for (const sx of [-1, 1]) { const o = kit.mesh(kit.cyl(0.03, 0.04, 0.22), dark); o.position.set(sx * 0.08, d.head * 1.1, -d.head * 0.3); head.add(o); }
  let trunk = null;
  if (sp === 'elefante') {
    for (const sx of [-1, 1]) { const ear = kit.mesh(kit.sphere(0.5), kit.mat('#9a9590', { side: THREE.DoubleSide })); ear.scale.set(0.12, 1.1, 0.9); ear.position.set(sx * d.head * 0.95, d.head * 0.15, -d.head * 0.2); ear.rotation.y = sx * 0.35; head.add(ear); }
    trunk = new THREE.Group(); trunk.position.set(0, -d.head * 0.2, d.head * 0.95); head.add(trunk);
    let parent = trunk;
    for (let i = 0; i < 3; i++) { const seg = new THREE.Group(); if (i) seg.position.y = -0.42; parent.add(seg); const m = kit.mesh(kit.cyl(0.13 - i * 0.03, 0.15 - i * 0.03, 0.45), body); m.position.y = -0.21; seg.add(m); seg.rotation.x = 0.15; parent = seg; }
    for (const sx of [-1, 1]) { const t = kit.mesh(kit.cone(0.06, 0.55), kit.mat('#f2ead8')); t.position.set(sx * 0.25, -d.head * 0.45, d.head * 0.75); t.rotation.x = 2.2; head.add(t); }
  }
  const tail = new THREE.Group(); tail.position.set(0, d.legH + d.bh * 0.55, -d.len * 0.48); rig.add(tail);
  const tm = kit.mesh(kit.cyl(0.03, 0.05, d.tail), sp === 'macaco' ? body : dark); tm.position.set(0, -d.tail / 2, 0); tail.add(tm); tail.rotation.x = sp === 'macaco' ? -2.4 : -0.5;
  if (sp === 'leao') { const tuft = kit.mesh(kit.sphere(0.5), kit.mat('#5a3517')); tuft.scale.setScalar(0.15); tuft.position.y = -d.tail; tail.add(tuft); }
  if (sp === 'rinoceronte') { const hm2 = kit.mat('#5e5348'); const h1 = kit.mesh(kit.cone(0.1, 0.5), hm2); h1.position.set(0, d.head * 0.35, d.head * 1.6); h1.rotation.x = 0.35; head.add(h1); const h2 = kit.mesh(kit.cone(0.08, 0.22), hm2); h2.position.set(0, d.head * 0.55, d.head * 1.0); head.add(h2); for (const sx of [-1, 1]) { const ear = kit.mesh(kit.cone(d.head * 0.18, d.head * 0.6), body); ear.position.set(sx * d.head * 0.5, d.head * 0.85, -d.head * 0.4); head.add(ear); } neck.rotation.x = 0.4; }
  if (sp === 'hipopotamo') for (const sx of [-1, 1]) { const ear = kit.mesh(kit.sphere(0.5), body); ear.scale.setScalar(d.head * 0.25); ear.position.set(sx * d.head * 0.55, d.head * 0.8, -d.head * 0.3); head.add(ear); }
  if (sp === 'tartaruga') { const shell = kit.mesh(kit.sphere(0.5), kit.mat('#4d3f2b')); shell.scale.set(d.bw * 1.9, d.bh * 2.0, d.len * 2.0); shell.position.y = d.legH + d.bh * 0.55; rig.add(shell); }
  if (sp === 'gorila') { torso.rotation.x = -0.35; for (const l of legs.slice(0, 2)) { l.position.y += 0.2; l.scale.y = 1.35; } neck.position.y += 0.2; if (male) { const sv = kit.mesh(kit.sphere(0.5), kit.mat('#9b968f')); sv.scale.set(d.bw * 0.75, d.bh * 0.35, d.len * 0.6); sv.position.set(0, d.legH + d.bh * 0.75, -d.len * 0.1); rig.add(sv); } }
  if (sp === 'macaco') { torso.rotation.x = -0.5; for (const l of legs.slice(0, 2)) { l.position.y += 0.18; } neck.position.y += 0.12; }
  root.userData = { sp, legs, neck, head, tail, trunk, rig, d, phase: Math.random() * 6 };
  return root;
}
// pose do animal a partir do estado (1.7.2b); estado desconhecido cai em "parado", nunca trava
const POSE = { sleep: 'deitado', tree_sleep: 'deitado', sedado: 'deitado', in_toca: 'deitado', descanso: 'deitado', poeira: 'rolar', pastar: 'pastar', eat: 'comer', drink: 'comer', filtrar: 'comer', umaperna: 'umaperna', descanso_pe: 'quieto', ameaca: 'encarar', investida: 'carga' };
export const poseDe = a => POSE[a.st] || 'normal';
export function animateAnimal(obj, a, dt, moving) {
  const u = obj.userData, d = u.d, pose = poseDe(a);
  const sleeping = pose === 'deitado' || pose === 'rolar';
  if (u.rig.rotation.z && pose !== 'rolar') u.rig.rotation.z *= 0.8;
  u.phase += dt * (moving ? 7 * (1.4 / Math.max(0.6, d.legH)) : 1.6);
  const p = u.phase;
  if (u.bird && pose === 'umaperna') { u.legs[0].rotation.x = 0; u.legs[1].rotation.x += (-2.6 - u.legs[1].rotation.x) * Math.min(1, dt * 3); u.neck.rotation.x += (Math.sin(p * 0.3) * 0.05 - u.neck.rotation.x) * Math.min(1, dt * 3); u.rig.position.y = 0; return; }
  if (u.bird && sleeping) { u.legs[0].rotation.x = 0; u.legs[1].rotation.x = -2.6; u.neck.rotation.x += (-1.0 - u.neck.rotation.x) * Math.min(1, dt * 3); u.rig.position.y = 0; return; }
  if (sleeping) {
    u.rig.position.y += (-(d.legH * 0.75) - u.rig.position.y) * Math.min(1, dt * 3);
    u.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.3 : 1.3; });
    u.neck.rotation.x += (0.6 - u.neck.rotation.x) * Math.min(1, dt * 3);
    u.tail.rotation.z = 0;
    if (pose === 'rolar') u.rig.rotation.z = Math.sin(p * 1.4) * 0.6; // banho de poeira: rola de um lado para o outro
    return;
  }
  u.rig.position.y += (0 - u.rig.position.y) * Math.min(1, dt * 4);
  u.rig.position.z = a.st === 'empurrar' ? Math.sin(p * 6) * 0.15 : 0;
  if (a.st === 'pulando' || a.st === 'salto') { u.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -0.9 : 0.9; }); return; }
  if (moving) { u.legs.forEach((l, i) => { l.rotation.x = Math.sin(p + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55; }); u.rig.position.y = Math.abs(Math.sin(p)) * 0.04; }
  else u.legs.forEach(l => { l.rotation.x *= 0.85; });
  const eating = pose === 'comer' || pose === 'pastar';
  const nt = pose === 'encarar' ? -0.25 : pose === 'carga' ? 0.45 : pose === 'quieto' ? 0.12 : eating ? (u.sp === 'girafa' ? 0.9 : u.bird ? 2.2 : 1.0) : Math.sin(p * 0.3) * 0.06;
  u.neck.rotation.x += (nt - u.neck.rotation.x) * Math.min(1, dt * 4);
  u.tail.rotation.z = Math.sin(p * 1.3) * 0.35;
  if (u.trunk) u.trunk.rotation.x = Math.sin(p * 0.7) * 0.25 + (eating ? 0.5 : 0);
}

// ---------- pessoas ----------
export function buildPerson(kit, color, hat) {
  const g = new THREE.Group();
  const body = kit.mesh(kit.cyl(0.2, 0.24, 0.95), kit.mat(color)); body.position.y = 0.95; g.add(body);
  const legs = kit.mesh(kit.cyl(0.17, 0.15, 0.5), kit.mat('#2f3640')); legs.position.y = 0.25; g.add(legs);
  const head = kit.mesh(kit.sphere(0.5), kit.mat('#d9a87e')); head.scale.setScalar(0.32); head.position.y = 1.6; g.add(head);
  if (hat) { const h = kit.mesh(kit.cyl(0.18, 0.18, 0.12), kit.mat(hat)); h.position.y = 1.76; g.add(h); }
  g.userData.phase = Math.random() * 6; g.userData.body = body;
  return g;
}

// ---------- plantas ----------
export function buildPlant(kit, type, cor) { // cor: folhagem de planta de DLC que reaproveita o desenho de outra
  const g = new THREE.Group();
  const trunk = kit.ultra ? kit.mat('#d8cfc4', { map: kit.bark(type === 'acacia' || type === 'baoba' ? 'acacia' : 'floresta'), rough: 0.95 }) : kit.mat('#6b4b2e'), leaf = c => kit.mat(cor || c);
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
    if (kit.ultra && geo === kit.sphere(1) && m !== trunk) { // copa realista: cartões de folhas em volta de um miolo escuro
      const hex = '#' + m.color.getHexString(), key = `can${type}${sx},${sy},${sz}`;
      const cg = kit.geo(key, () => canopyGeometry(Math.round(Math.min(220, 26 + 42 * sx * sy * sz)), sx, sy, sz, key.length * 97 + Math.round(sx * 100)));
      const o = kit.mesh(cg, leafMaterial(hex)); o.position.set(x, y, z); g.add(o);
      const core = kit.mesh(kit.sphere(1), kit.mat(new THREE.Color(hex).multiplyScalar(0.55).getStyle())); core.position.set(x, y, z); core.scale.set(sx * 0.72, sy * 0.72, sz * 0.72); g.add(core); return o;
    }
    const o = kit.mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o;
  };
  switch (type) {
    case 'acacia': add(kit.cyl(0.12, 0.2, 3), trunk, 0, 1.5, 0); add(kit.sphere(1), leaf('#6f8a35'), 0, 3.2, 0, 2.1, 0.45, 2.1); if (kit.hi) add(kit.sphere(1), leaf('#7d9840'), 0.8, 3.45, 0.4, 1.1, 0.3, 1.1); break;
    case 'baoba': add(kit.cyl(0.55, 0.85, 4), kit.mat('#8a6f58'), 0, 2, 0); for (let i = 0; i < 4; i++) { const a = i * 1.57; add(kit.cyl(0.08, 0.15, 1.4), trunk, Math.cos(a) * 0.6, 4.4, Math.sin(a) * 0.6).rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); add(kit.sphere(1), leaf('#5e7a2e'), Math.cos(a) * 1.1, 5.1, Math.sin(a) * 1.1, 0.7, 0.4, 0.7); } break;
    case 'capim_alto': for (let i = 0; i < (kit.hi ? 9 : 5); i++) { const a = i * 2.4; add(kit.cone(0.12, 1), leaf(i % 2 ? '#c7b25a' : '#b39b45'), Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35); } break;
    case 'arbusto_seco': add(kit.sphere(1), leaf('#8a8a4a'), 0, 0.5, 0, 0.8, 0.55, 0.8); break;
    case 'arvore_floresta': add(kit.cyl(0.2, 0.32, 5), trunk, 0, 2.5, 0); add(kit.sphere(1), leaf('#2f6b2a'), 0, 5.2, 0, 1.8, 1.4, 1.8); add(kit.sphere(1), leaf('#3a7d31'), 0.9, 4.4, 0.3, 1.2, 1, 1.2); add(kit.sphere(1), leaf('#2a5f26'), -0.8, 4.6, -0.4, 1.2, 1, 1.2); break;
    case 'arvore_cipo': add(kit.cyl(0.22, 0.3, 4.5), trunk, 0, 2.25, 0); add(kit.sphere(1), leaf('#356f2c'), 0, 4.8, 0, 2, 1.3, 2); for (let i = 0; i < 5; i++) { const a = i * 1.25; add(kit.cyl(0.025, 0.025, 2.2), leaf('#4c7a2a'), Math.cos(a) * 1.3, 3.4, Math.sin(a) * 1.3); } break;
    case 'samambaia': for (let i = 0; i < 6; i++) { const a = i * 1.05; const f = add(kit.cone(0.18, 1.1), leaf('#4f9a3a'), Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3); f.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); } break;
    default: add(kit.sphere(1), leaf('#4c8a35'), 0, 0.6, 0, 0.9, 0.65, 0.9);
  }
  return g;
}

// ---------- instalações ----------

// ---------- emblemas desenhados (sem imagens externas) ----------
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function emblemCanvas(kind, text, bg, fg = '#fff') {
  return canvas(512, 160, (g, w, h) => {
    g.fillStyle = bg; rrect(g, 4, 4, w - 8, h - 8, 26); g.fill(); g.lineWidth = 8; g.strokeStyle = fg; rrect(g, 14, 14, w - 28, h - 28, 20); g.stroke();
    const cx = 92, cy = h / 2;
    if (kind === 'burger') {
      g.fillStyle = '#e8b25c'; g.beginPath(); g.ellipse(cx, cy - 20, 46, 28, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; for (const dx of [-22, 0, 22]) { g.beginPath(); g.ellipse(cx + dx, cy - 34, 3, 1.6, 0.4, 0, 6.3); g.fill(); }
      g.fillStyle = '#6fc04a'; g.beginPath(); g.moveTo(cx - 48, cy - 18); for (let i = 0; i <= 8; i++) g.lineTo(cx - 48 + i * 12, cy - 18 + (i % 2 ? 8 : 0)); g.lineTo(cx + 48, cy - 10); g.lineTo(cx - 48, cy - 10); g.fill();
      g.fillStyle = '#6b3b1f'; rrect(g, cx - 48, cy - 8, 96, 16, 8); g.fill();
      g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(cx - 44, cy + 6); g.lineTo(cx + 44, cy + 6); g.lineTo(cx + 30, cy + 18); g.lineTo(cx - 30, cy + 18); g.fill();
      g.fillStyle = '#e8b25c'; rrect(g, cx - 46, cy + 18, 92, 16, 8); g.fill();
    } else if (kind === 'gift') {
      g.fillStyle = '#ffd23f'; rrect(g, cx - 38, cy - 8, 76, 48, 6); g.fill(); g.fillStyle = '#e63e6d'; g.fillRect(cx - 42, cy - 22, 84, 18); g.fillStyle = '#7bd0ff'; g.fillRect(cx - 7, cy - 22, 14, 62);
      g.fillStyle = '#7bd0ff'; g.beginPath(); g.ellipse(cx - 14, cy - 30, 16, 10, -0.5, 0, 6.3); g.ellipse(cx + 14, cy - 30, 16, 10, 0.5, 0, 6.3); g.fill();
    } else if (kind === 'wc') {
      g.fillStyle = fg; g.beginPath(); g.arc(cx - 26, cy - 28, 11, 0, 6.3); g.fill(); rrect(g, cx - 38, cy - 14, 24, 40, 6); g.fill(); g.fillRect(cx - 36, cy + 24, 8, 22); g.fillRect(cx - 24, cy + 24, 8, 22);
      g.beginPath(); g.arc(cx + 28, cy - 28, 11, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(cx + 28, cy - 14); g.lineTo(cx + 44, cy + 26); g.lineTo(cx + 12, cy + 26); g.fill(); g.fillRect(cx + 20, cy + 26, 6, 20); g.fillRect(cx + 30, cy + 26, 6, 20);
    } else if (kind === 'table') {
      g.fillStyle = fg; g.fillRect(cx - 44, cy - 6, 88, 10); g.fillRect(cx - 38, cy + 4, 8, 34); g.fillRect(cx + 30, cy + 4, 8, 34); g.fillRect(cx - 50, cy + 20, 100, 8);
    }
    g.fillStyle = fg; let fs = 74; g.font = `bold ${fs}px Arial`; while (g.measureText(text).width > w - 200 && fs > 28) { fs -= 4; g.font = `bold ${fs}px Arial`; } g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, 170, cy + 4);
  });
}
const doorIcon = (letter, bg) => canvas(64, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 36, 9, 0, 6.3); g.fill();
  if (letter === 'M') g.fillRect(22, 48, 20, 34); else { g.beginPath(); g.moveTo(32, 48); g.lineTo(46, 88); g.lineTo(18, 88); g.fill(); } g.fillRect(24, 88, 6, 22); g.fillRect(35, 88, 6, 22); });
const chalk = () => canvas(128, 160, (g, w, h) => { g.fillStyle = '#26332c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f1eadb'; g.font = 'bold 20px Arial'; g.fillText('CARDÁPIO', 10, 28);
  g.fillRect(10, 36, 108, 2); for (let i = 0; i < 5; i++) { g.fillRect(10, 56 + i * 20, 60 + (i * 17) % 30, 4); g.fillRect(96, 56 + i * 20, 22, 4); } });
const stripeTex = (a, b, n = 10) => canvas(64, 16, (c) => { const w = 64 / n; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * w, 0, w, 16); } });
const paverTex = () => canvas(128, 128, (g) => { g.fillStyle = '#d9c9a2'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#bfae86'; g.lineWidth = 2; for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } });

// banco de praça (frente = +z; encosto atrás)
function bench(kit, add, wood = '#8a5a32') {
  const m = kit.mat(wood), metal = kit.mat('#2f3338', { metal: 0.5 });
  for (let i = 0; i < 3; i++) add(kit.box(1.6, 0.05, 0.12), m, 0, 0.46, -0.17 + i * 0.17);
  for (let i = 0; i < 2; i++) add(kit.box(1.6, 0.1, 0.05), m, 0, 0.72 + i * 0.16, -0.27);
  for (const sx of [-0.7, 0.7]) { add(kit.box(0.06, 0.46, 0.5), metal, sx, 0.23, -0.02); add(kit.box(0.06, 0.5, 0.06), metal, sx, 0.7, -0.27); }
}
export function buildFurn(kit, type) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = kit.mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (type === 'poste') {
    const dark = kit.mat('#2e383f', { metal: 0.5, rough: 0.5 });
    add(kit.cyl(0.13, 0.17, 0.3), dark, 0, 0.15, 0); add(kit.cyl(0.045, 0.06, 3.5), dark, 0, 1.9, 0);
    add(kit.box(0.7, 0.07, 0.07), dark, 0.25, 3.62, 0); add(kit.box(0.34, 0.1, 0.24), dark, 0.55, 3.55, 0);
    add(kit.box(0.28, 0.06, 0.2), kit.lamp, 0.55, 3.48, 0);
  } else if (type === 'lixeira') {
    add(kit.cyl(0.21, 0.18, 0.82), kit.mat('#2f7d52'), 0, 0.41, 0); add(kit.cyl(0.235, 0.235, 0.07), kit.mat('#24533a'), 0, 0.86, 0);
    add(kit.cyl(0.1, 0.1, 0.02), kit.mat('#101512'), 0, 0.9, 0); add(kit.box(0.22, 0.14, 0.02), kit.mat('#e9f3ec'), 0, 0.5, 0.2);
  } else if (type === 'banco') bench(kit, add);
  return g;
}

export function buildFacility(kit, type, D) {
  const g = new THREE.Group(), w = D.w * 2, d = D.h * 2;
  const add = (geo, m, x, y, z) => { const o = kit.mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const sign = (text, bg, y, z, sw = 2.2) => { const t = kit.tex('lbl' + text + bg, () => labelCanvas(text, bg)); const m = kit.mesh(kit.box(sw, sw / 4, 0.08), kit.mat('#ffffff', { map: t }), false); m.position.set(0, y, z); g.add(m); return m; };
  switch (type) {
    case 'entrada': {
      for (const sx of [-1, 1]) add(kit.box(0.6, 4, 0.6), kit.mat('#7a5a3a'), sx * 1.7, 2, 0);
      add(kit.box(4.2, 0.6, 0.7), kit.mat('#5b3f26'), 0, 4.2, 0);
      sign('ZOOLÓGICO', '#2e6b54', 4.2, 0.4, 3.6);
      add(kit.box(1.2, 2.2, 1.2), kit.mat('#d8c9a8'), 2.9, 1.1, 0.4);
      break; }
    case 'lanchonete': {
      const body = kit.mat('#f4e6c8'), band = kit.mat('#d65a28'), dark = kit.mat('#2a2220'), wood = kit.mat('#8a5a32');
      add(kit.box(w - 0.8, 2.7, d - 0.8), body, 0, 1.35, 0);
      add(kit.box(w - 0.7, 0.9, d - 0.7), band, 0, 0.45, 0);
      // janela de atendimento, balcão e toldo listrado
      add(kit.box(2.3, 1.05, 0.12), dark, 0, 1.7, d / 2 - 0.4); add(kit.box(2.5, 0.12, 0.7), wood, 0, 1.15, d / 2 - 0.15);
      add(kit.box(2.5, 0.08, 0.1), wood, 0, 2.3, d / 2 - 0.36);
      const aw = kit.tex('awnL', () => stripeTex('#d65a28', '#ffffff', 10)), tent = add(kit.box(w - 0.1, 0.12, 1.5), kit.mat('#ffffff', { map: aw }), 0, 2.62, d / 2 - 0.1); tent.rotation.x = 0.3;
      add(kit.box(w - 0.1, 0.18, 0.12), kit.mat('#ffffff', { map: aw }), 0, 2.18, d / 2 + 0.52);
      add(kit.box(w - 0.5, 0.2, d - 0.5), kit.mat('#7a2f16'), 0, 2.85, 0);
      // placa com emblema, lousa de cardápio e plantas
      const em = kit.tex('emL', () => emblemCanvas('burger', 'LANCHES', '#c8431c')); add(kit.box(2.6, 0.82, 0.1), kit.mat('#ffffff', { map: em }), 0, 3.55, d / 2 - 0.55);
      add(kit.box(0.08, 0.5, 0.08), dark, -1.1, 3.1, d / 2 - 0.55); add(kit.box(0.08, 0.5, 0.08), dark, 1.1, 3.1, d / 2 - 0.55);
      const ch = kit.tex('chalk', chalk); const bd = add(kit.box(0.7, 0.9, 0.06), kit.mat('#ffffff', { map: ch }), w / 2 - 0.55, 1.0, d / 2 + 0.05); bd.rotation.x = -0.18;
      for (const sx of [-1, 1]) { add(kit.cyl(0.2, 0.15, 0.32), kit.mat('#9c5a34'), sx * (w / 2 - 0.3), 0.16, d / 2 - 0.05); add(kit.sphere(0.3), kit.mat('#3d8f3a'), sx * (w / 2 - 0.3), 0.55, d / 2 - 0.05); }
      const bulb = kit.mat('#ffe7a3', { rough: 0.3 }); for (let i = 0; i < 6; i++) add(kit.sphere(0.06), bulb, -w / 2 + 0.4 + i * ((w - 0.8) / 5), 2.13, d / 2 + 0.62);
      break; }
    case 'banheiro': {
      const wall = kit.mat('#e3ecf1'), blue = kit.mat('#3f86c0');
      add(kit.box(w - 0.7, 2.6, d - 0.7), wall, 0, 1.3, 0); add(kit.box(w - 0.6, 0.8, d - 0.6), kit.mat('#9fc6df'), 0, 0.4, 0);
      add(kit.box(w + 0.2, 0.2, d + 0.3), blue, 0, 2.72, 0.05); add(kit.box(w - 0.3, 0.14, d - 0.3), kit.mat('#2f6a9b'), 0, 2.88, 0);
      const dm = kit.tex('doorM', () => doorIcon('M', '#2b78b8')), df = kit.tex('doorF', () => doorIcon('F', '#d2528a'));
      add(kit.box(0.82, 1.85, 0.08), kit.mat('#ffffff', { map: dm }), -0.7, 1.0, d / 2 - 0.32); add(kit.box(0.82, 1.85, 0.08), kit.mat('#ffffff', { map: df }), 0.7, 1.0, d / 2 - 0.32);
      add(kit.box(1.6, 0.12, 0.12), kit.mat('#d9e6ee'), 0, 2.0, d / 2 - 0.3);
      const em = kit.tex('emW', () => emblemCanvas('wc', 'WC', '#2b78b8')); add(kit.box(1.9, 0.6, 0.08), kit.mat('#ffffff', { map: em }), 0, 3.25, d / 2 - 0.35);
      add(kit.box(0.5, 0.3, 0.06), kit.mat('#bfe2f5', { rough: 0.1 }), w / 2 - 0.36, 1.9, 0);
      add(kit.cyl(0.22, 0.17, 0.3), kit.mat('#9c5a34'), 0, 0.15, d / 2 - 0.12 + 0.28); add(kit.sphere(0.28), kit.mat('#3d8f3a'), 0, 0.5, d / 2 + 0.16);
      break; }
    case 'loja': {
      const wall = kit.mat('#f4eaf3'), purple = kit.mat('#a23c8d'), glass = kit.mat('#a9d6e8', { rough: 0.05, metal: 0.3, opacity: 0.55 });
      add(kit.box(w - 0.7, 2.7, d - 0.7), wall, 0, 1.35, 0); add(kit.box(w - 0.6, 0.7, d - 0.6), purple, 0, 0.35, 0);
      add(kit.box(1.4, 1.2, 0.08), glass, -0.85, 1.5, d / 2 - 0.34); add(kit.box(0.8, 1.9, 0.08), kit.mat('#7a2f6b'), 0.95, 1.0, d / 2 - 0.34);
      add(kit.box(0.7, 0.15, 0.4), kit.mat('#d8c3d5'), -0.85, 1.0, d / 2 - 0.5);
      for (const [x, c] of [[-1.3, '#f2c230'], [-0.85, '#e63e6d'], [-0.4, '#3a8fd6']]) add(kit.box(0.28, 0.28, 0.28), kit.mat(c), x, 1.2, d / 2 - 0.5);
      const aw = kit.tex('awnJ', () => stripeTex('#a23c8d', '#ffffff', 8)), tent = add(kit.box(w - 0.2, 0.1, 1.3), kit.mat('#ffffff', { map: aw }), 0, 2.45, d / 2 - 0.15); tent.rotation.x = 0.28;
      add(kit.box(w - 0.4, 0.18, d - 0.4), kit.mat('#7a2f6b'), 0, 2.8, 0); add(kit.cone(1.55, 0.9), kit.mat('#a23c8d'), 0, 3.35, 0).rotation.y = 0.785;
      const em = kit.tex('emJ', () => emblemCanvas('gift', 'LOJA', '#a23c8d')); add(kit.box(2.3, 0.72, 0.1), kit.mat('#ffffff', { map: em }), 0, 3.25, d / 2 - 0.12);
      add(kit.box(0.08, 0.5, 0.08), kit.mat('#2a2220'), -1.0, 2.95, d / 2 - 0.12); add(kit.box(0.08, 0.5, 0.08), kit.mat('#2a2220'), 1.0, 2.95, d / 2 - 0.12);
      const bal = ['#e63e6d', '#f2c230', '#3a8fd6']; bal.forEach((c, i) => { const x = -w / 2 + 0.2 + i * 0.22, y = 1.5 + (i % 2) * 0.3; add(kit.cyl(0.008, 0.008, y - 0.3), kit.mat('#dddddd'), x, (y + 0.3) / 2 - 0.3 + 0.3, d / 2 + 0.05); const b = add(kit.sphere(0.2), kit.mat(c, { rough: 0.3 }), x, y + 0.2, d / 2 + 0.05); b.scale.y = 1.2; });
      break; }
    case 'mesas': {
      const pv = kit.tex('paver', paverTex); pv.repeat?.set?.(3, 3);
      add(kit.box(w - 0.3, 0.06, d - 0.3), kit.mat('#ffffff', { map: pv }), 0, 0.03, 0);
      const wood = kit.mat('#9a6a3c'), leg = kit.mat('#3a3f44'), cols = ['#d6453d', '#2f8f5a', '#e0a21a'];
      [[-1.3, -1.25], [1.3, -1.25], [0, 1.2]].forEach(([x, z], i) => {
        add(kit.box(1.7, 0.07, 0.85), wood, x, 0.78, z);
        for (const sz of [-0.68, 0.68]) add(kit.box(1.7, 0.06, 0.3), wood, x, 0.46, z + sz);
        for (const sx of [-0.7, 0.7]) { add(kit.box(0.07, 0.78, 0.07), leg, x + sx, 0.4, z - 0.3); add(kit.box(0.07, 0.78, 0.07), leg, x + sx, 0.4, z + 0.3); }
        add(kit.cyl(0.035, 0.035, 2.3), leg, x, 1.2, z); const um = add(kit.cone(1.25, 0.55), kit.mat(cols[i]), x, 2.4, z); um.scale.y = 0.8;
      });
      for (const [x, z] of [[-d / 2 + 0.35, d / 2 - 0.35], [d / 2 - 0.35, d / 2 - 0.35]]) { add(kit.cyl(0.22, 0.16, 0.34), kit.mat('#9c5a34'), x, 0.2, z); add(kit.sphere(0.3), kit.mat('#3d8f3a'), x, 0.6, z); }
      break; }
    case 'banco': bench(kit, add); break;
    case 'playground': {
      add(kit.box(w - 0.4, 0.06, d - 0.4), kit.mat('#e2cf98'), 0, 0.03, 0);
      add(kit.box(1.2, 2.2, 1.2), kit.mat('#f2c230'), -1.2, 1.1, -1.2); add(kit.cone(0.9, 0.9), kit.mat('#d6453d'), -1.2, 2.65, -1.2);
      const sl = add(kit.box(0.7, 0.1, 2.6), kit.mat('#3a8fd6'), -1.2, 1.05, 0.5); sl.rotation.x = -0.75;
      for (const sx of [0.5, 2]) add(kit.cyl(0.06, 0.06, 2.2), kit.mat('#666'), sx, 1.1, 1.2);
      add(kit.cyl(0.06, 0.06, 1.7), kit.mat('#666'), 1.25, 2.2, 1.2).rotation.z = 1.57;
      add(kit.box(0.5, 0.06, 0.25), kit.mat('#d6453d'), 1.25, 0.6, 1.2); break; }
    case 'placa': add(kit.cyl(0.05, 0.05, 1.3), kit.mat('#5b3f26'), 0, 0.65, 0); { const t = kit.tex('placa', () => canvas(128, 80, (c) => { c.fillStyle = '#2e6b54'; c.fillRect(0, 0, 128, 80); c.fillStyle = '#fff'; c.font = 'bold 18px Arial'; c.fillText('Você sabia?', 12, 26); c.fillRect(12, 38, 100, 4); c.fillRect(12, 50, 80, 4); c.fillRect(12, 62, 90, 4); })); add(kit.box(1, 0.65, 0.06), kit.mat('#fff', { map: t }), 0, 1.45, 0); } break;
    case 'centro': {
      add(kit.box(w - 0.6, 3, d - 0.6), kit.mat('#f4f5f2'), 0, 1.5, 0);
      add(kit.box(w - 0.2, 0.3, d - 0.2), kit.mat('#2e6b54'), 0, 3.15, 0);
      const cross = kit.mat('#2e9a4a'); add(kit.box(1.2, 0.35, 0.1), cross, 0, 2.3, d / 2 - 0.25); add(kit.box(0.35, 1.2, 0.1), cross, 0, 2.3, d / 2 - 0.25);
      add(kit.box(1, 1.8, 0.1), kit.mat('#5b6770'), 1.6, 0.9, d / 2 - 0.25); break; }
    default: add(kit.box(w - 0.4, 2, d - 0.4), kit.mat(D.cor || '#999'), 0, 1, 0);
  }
  return g;
}

// ---------- veículos ----------
export function buildVehicle(kit, kind) {
  const g = new THREE.Group(), big = kind === 'caminhao';
  const L = big ? 6.2 : 3.8, W = big ? 2.3 : 1.8, body = kit.mat('#2f6b4a', { rough: 0.4, metal: 0.3 }), dark = kit.mat('#1b1f22', { rough: 0.3 }), glass = kit.mat('#9fc3d8', { rough: 0.05, metal: 0.5 });
  const add = (geo, m, x, y, z, o) => { const me = kit.mesh(geo, m); me.position.set(x, y, z); if (o) me.rotation.set(...o); g.add(me); return me; };
  add(kit.box(W, 0.5, L), body, 0, 0.75, 0);
  const cabZ = L / 2 - (big ? 1.0 : 0.85);
  add(kit.box(W - 0.05, 0.85, big ? 1.8 : 1.5), body, 0, 1.4, cabZ);
  add(kit.box(W - 0.1, 0.5, 0.05), glass, 0, 1.5, cabZ + (big ? 0.91 : 0.76));
  for (const sx of [-1, 1]) add(kit.box(0.04, 0.45, big ? 1.2 : 0.9), glass, sx * (W / 2 - 0.01), 1.5, cabZ);
  add(kit.box(W, 0.18, 0.12), dark, 0, 0.62, L / 2);
  for (const sx of [-1, 1]) add(kit.cyl(0.11, 0.11, 0.06), kit.mat('#fff6c8'), sx * (W / 2 - 0.3), 0.92, L / 2 + 0.02, [Math.PI / 2, 0, 0]);
  const stripe = add(kit.box(W + 0.02, 0.12, L * 0.9), kit.mat('#f2c230'), 0, 0.95, 0);
  // jaula na carroceria
  const bedL = L - (big ? 2.1 : 1.8), bedZ = -L / 2 + bedL / 2 + 0.05, cageH = big ? 2.4 : 1.2, bar = kit.mat('#3a3f44', { metal: 0.6, rough: 0.35 });
  const nb = big ? 14 : 8;
  for (let i = 0; i <= nb; i++) for (const sx of [-1, 1]) add(kit.cyl(0.03, 0.03, cageH), bar, sx * (W / 2 - 0.05), 1.0 + cageH / 2, bedZ - bedL / 2 + (bedL * i) / nb);
  for (const yy of [1.0 + cageH, 1.0 + cageH / 2]) for (const sx of [-1, 1]) add(kit.box(0.05, 0.05, bedL), bar, sx * (W / 2 - 0.05), yy, bedZ);
  for (let i = 0; i <= 4; i++) add(kit.box(W - 0.1, 0.05, 0.05), bar, 0, 1.0 + cageH, bedZ - bedL / 2 + (bedL * i) / 4);
  const wheels = [];
  const wz = [L / 2 - 0.8, -L / 2 + 0.8].concat(big ? [-L / 2 + 1.9] : []);
  for (const z of wz) for (const sx of [-1, 1]) { const w = add(kit.cyl(0.42, 0.42, 0.3), dark, sx * (W / 2), 0.42, z, [0, 0, Math.PI / 2]); wheels.push(w); add(kit.cyl(0.2, 0.2, 0.31), kit.mat('#8a8f94', { metal: 0.6 }), sx * (W / 2), 0.42, z, [0, 0, Math.PI / 2]); }
  g.userData = { wheels, bedY: 1.02, bedZ, kind };
  return g;
}
// ---------- ferramentas ----------
export function buildTool(kit, tipo) {
  const g = new THREE.Group(); const wood = kit.mat('#8a6236'), metal = kit.mat('#9aa1a8', { metal: 0.7, rough: 0.3 });
  const add = (geo, m, x, y, z, o) => { const me = kit.mesh(geo, m, false); me.position.set(x, y, z); if (o) me.rotation.set(...o); g.add(me); return me; };
  switch (tipo) {
    case 'vassoura': add(kit.cyl(0.018, 0.018, 1.3), wood, 0, -0.3, 0.05); add(kit.box(0.32, 0.12, 0.08), kit.mat('#c9a24a'), 0, -0.98, 0.05); break;
    case 'balde': case 'baldeAgua': add(kit.cyl(0.13, 0.1, 0.24), kit.mat(tipo === 'balde' ? '#e0703a' : '#3a7bd5'), 0, -0.14, 0.05); add(kit.cyl(0.11, 0.11, 0.02), kit.mat(tipo === 'balde' ? '#9bb34a' : '#5fb0e8'), 0, -0.03, 0.05); break;
    case 'martelo': add(kit.cyl(0.014, 0.014, 0.32), wood, 0, -0.1, 0.06); add(kit.box(0.12, 0.05, 0.05), metal, 0, -0.26, 0.06); break;
    case 'macarico': add(kit.cyl(0.02, 0.02, 0.3), metal, 0, -0.05, 0.12, [1.2, 0, 0]); add(kit.cyl(0.05, 0.05, 0.16), kit.mat('#c62828'), 0, -0.02, -0.02); break;
    case 'dardo': add(kit.cyl(0.02, 0.025, 0.8), kit.mat('#2b2f33', { metal: 0.5 }), 0, -0.02, 0.32, [Math.PI / 2, 0, 0]); add(kit.box(0.05, 0.14, 0.1), wood, 0, -0.08, 0.02); break;
    case 'maleta': add(kit.box(0.3, 0.2, 0.1), kit.mat('#f4f4f4'), 0, -0.14, 0.05); add(kit.box(0.08, 0.025, 0.11), kit.mat('#d32f2f'), 0, -0.1, 0.05); add(kit.box(0.025, 0.08, 0.11), kit.mat('#d32f2f'), 0, -0.1, 0.05); break;
  }
  return g;
}
export function buildCones(kit) { const g = new THREE.Group(); for (const [x, z] of [[-0.9, 0.6], [0.9, 0.6], [0, 1.1]]) { const c = kit.mesh(kit.cone(0.16, 0.5), kit.mat('#ff6d00')); c.position.set(x, 0.25, z); g.add(c); const s = kit.mesh(kit.cyl(0.1, 0.12, 0.08), kit.mat('#ffffff'), false); s.position.set(x, 0.28, z); g.add(s); } const tb = kit.mesh(kit.box(0.5, 0.25, 0.25), kit.mat('#c62828')); tb.position.set(0.5, 0.12, 0.3); g.add(tb); return g; }

// junta os blocos estáticos de um grupo que usam o mesmo material em uma peça só (menos chamadas de desenho = mais FPS)
export function mergeStatic(g, skip) {
  const by = new Map(), keep = [];
  for (const o of [...g.children]) {
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry.index && !skip?.has(o)) { o.updateMatrix(); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(o); } else keep.push(o);
  }
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map(o => { const ge = o.geometry.clone(); ge.applyMatrix4(o.matrix); return ge; });
    const merged = mergeGeometries(geos, false); geos.forEach(ge => ge.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.userData.merged = true;
    for (const o of list) g.remove(o); g.add(m);
  }
  return g;
}
// animais montados por partes: junta as peças que se movem juntas (mesmo grupo e material), mantendo as articulações
export function mergeRig(root) {
  const skip = new Set(Object.values(root.userData).flat().filter(o => o?.isObject3D)), groups = [];
  root.traverse(o => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) mergeStatic(g, skip);
  return root;
}
// toca com vidro (1.7.2b): caixa oca de 4 m x 4 m; vidro no lado +z, entrada do animal no lado "porta" (1 = +x, 2 = -z, 3 = -x)
export function buildToca(kit, modelo, altura, porta, fechada, glassMat) {
  const g = new THREE.Group(), W = 3.8, T = 0.22, H = altura, md = modelo === 'madeira';
  const wall = kit.mat(md ? '#8a6236' : '#9a948a', { rough: 0.9 }), roof = kit.mat('#5e4128'), floor = kit.mat(md ? '#6b5a3c' : '#6f6a60'), frame = kit.mat(md ? '#5e4128' : '#6d6862');
  const add = (geo, m, x, y, z, ry = 0) => { const o = kit.mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
  add(kit.box(W, 0.6, W), floor, 0, -0.2, 0); // piso e alicerce (cobre pequenos desníveis)
  add(kit.box(W + 0.5, 0.2, W + 0.5), roof, 0, H + 0.1, 0);
  if (md) for (const x of [-1.3, 0, 1.3]) add(kit.box(0.16, 0.12, W + 0.7), roof, x, H + 0.26, 0); else add(kit.box(W - 0.6, 0.16, W - 0.6), frame, 0, H + 0.28, 0);
  // paredes: lado 1 (+x), 2 (-z), 3 (-x). A da entrada tem um vão de 2,4 m
  const DOOR = 2.4, lado = (k, fn) => { const ry = k === 2 ? 0 : Math.PI / 2, off = W / 2 - T / 2; fn((u, y, len, hh, m) => { const x = k === 1 ? off : k === 3 ? -off : u, z = k === 2 ? -off : (k === 1 ? -u : u); add(kit.box(len, hh, T), m, x, y, z, ry); }); };
  for (const k of [1, 2, 3]) lado(k, put => {
    if (k !== porta) { put(0, H / 2, W, H, wall); return; }
    const sw = (W - DOOR) / 2, top = 0.55;
    put(-(DOOR + sw) / 2, H / 2, sw, H, wall); put((DOOR + sw) / 2, H / 2, sw, H, wall); put(0, H - top / 2, DOOR, top, wall);
    if (fechada) put(0, (H - top) / 2, DOOR, H - top, frame); // porta fechada: animais recolhidos para a visita
  });
  // lado do vidro: mureta, colunas e viga; o vidro fica fora da junção (material transparente, um só para todas as tocas)
  const zf = W / 2 - T / 2, sill = 0.45, beam = 0.3;
  add(kit.box(W, sill, T), wall, 0, sill / 2, zf); add(kit.box(W, beam, T), frame, 0, H - beam / 2, zf);
  for (const x of [-(W / 2 - T / 2), W / 2 - T / 2]) add(kit.box(T, H, T), frame, x, H / 2, zf);
  const glass = new THREE.Mesh(kit.box(W - 2 * T, H - sill - beam, 0.06), glassMat); glass.position.set(0, sill + (H - sill - beam) / 2, zf); glass.castShadow = false; glass.renderOrder = 3; g.add(glass);
  return mergeStatic(g, new Set([glass]));
}
// partes de um móvel (poste, lixeira, banco) já juntas por material, para desenhar várias cópias de uma vez (InstancedMesh)
export const furnParts = (kit, type) => groupParts(buildFurn(kit, type));
export function groupParts(g) {
  const by = new Map(); g.updateMatrixWorld(true);
  for (const o of g.children) { if (!o.isMesh) continue; o.updateMatrix(); const ge = o.geometry.clone(); ge.applyMatrix4(o.matrix); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(ge); }
  const parts = []; for (const [mat, geos] of by) { const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0]; if (geo) parts.push({ geo, mat }); }
  return parts;
}
