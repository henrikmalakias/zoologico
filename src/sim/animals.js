import { content } from '../content/registry.js';
import { clamp, rnd, pick, uid, log, hourOf } from './util.js';
import { TILE, HALF, MAP, tileToWorld, worldToTile, waterDepth, idx, inMap, depthAt } from './grid.js';
import { NOMES_ANIMAIS } from '../content/base.js';
import { cellSet, walkSet, insideAt, clampInside, randomPoint, routeInside, edges, findEdge, gateEdge, ensureCells } from './habshape.js';
import { addDirt, recalcClean } from './staff.js';

export const SPEED = { leao: 1.6, zebra: 1.5, elefante: 1.1, girafa: 1.3, macaco: 1.4, hipopotamo: 1.0, rinoceronte: 1.2, flamingo: 0.9, gorila: 1.0, tartaruga: 0.25 };
export const habById = (s, id) => s.habitats.find(h => h.id === id);
// raio do corpo (m) para não sobrepor outros animais nem atravessar plantas e comedouros
export const RADIUS = { leao: 0.8, zebra: 0.8, elefante: 1.4, girafa: 0.9, macaco: 0.35, hipopotamo: 1.2, rinoceronte: 1.2, flamingo: 0.3, gorila: 0.55, tartaruga: 0.45 };
const radiusOf = (s, a) => { const S = content(s).species[a.sp]; const f = S && a.age < S.vida.adulto ? 0.5 + 0.5 * (a.age / S.vida.adulto) : 1; return (RADIUS[a.sp] || 0.7) * f; };
// obstáculos fixos do habitat: plantas, comedouro e bebedouro (cache até a próxima construção)
export function habObstacles(s, h) {
  if (h._obs && h._obsV === s._ver) return h._obs;
  const C = content(s), out = [];
  const set = cellSet(h);
  for (const o of s.objects) {
    if (!set.has(idx(o.tx, o.ty))) continue;
    const P = C.plants[o.type]; if (!P || !P.alta) continue; // arbustos, capim e samambaia: atravessáveis
    const p = tileToWorld(o.tx, o.ty), k = o.sc || 1;
    out.push({ x: p.x, z: p.z, r: (P.tronco || 0.45) * k, tree: o.id, top: (P.galho || 3) * k, copa: (P.copa || 1.5) * k });
  }
  const f = tileToWorld(h.feed[0], h.feed[1]), w = tileToWorld(h.water[0], h.water[1]);
  out.push({ x: f.x, z: f.z, r: 0.85, feed: true }, { x: w.x, z: w.z, r: 0.7, water: true });
  h._obs = out; h._obsV = s._ver; return out;
}
// ---------- água por espécie (1.7.2a) ----------
// calado: quanto do corpo fica abaixo da linha d'água quando o animal boia (só olhos/narinas de fora no hipopótamo)
export const DRAFT = { hipopotamo: 1.0, elefante: 1.95, rinoceronte: 1.12, leao: 1.05, zebra: 1.4, girafa: 3.45, macaco: 0.5, gorila: 1.05, flamingo: 1.6, tartaruga: 0.45 };
const BATH_MIN = { hipopotamo: 0.5, elefante: 0.35 };
export function waterRule(S) {
  const modo = S?.aguaModo || (S?.tracos?.nada ? 'vadeador' : 'evita');
  return { modo, max: modo === 'anfibio' ? 99 : (S?.aguaMax ?? (modo === 'vadeador' ? 1.0 : 0.3)) };
}
const ageF = (S, a) => (S && a.age < S.vida.adulto ? 0.5 + 0.5 * (a.age / S.vida.adulto) : 1);
export function maxDepth(s, a) { const S = content(s).species[a.sp], W = waterRule(S); return W.max >= 99 ? 99 : W.max * ageF(S, a); }
const okFor = (s, a) => { if (!s.height) return undefined; const m = maxDepth(s, a); return m >= 99 ? undefined : (x, z) => depthAt(s, x, z) <= m; };
// pontos de água do habitat com profundidade entre min e max (para banho, filtrar comida, hipopótamo de dia)
function waterSpot(s, h, min, max) {
  if (!s.height) return null;
  if (!h._wsp || h._wspV !== s._ver || h._wspH !== (s._hver || 0)) {
    const l = [], W = walkSet(h); for (const i of W) { const x = i % MAP, y = (i / MAP) | 0; let w = false; for (let dy = -1; dy <= 1 && !w; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * MAP + dx; if (inMap(x + dx, y + dy) && s.terrain[j] === 'w') { w = true; break; } } if (w) l.push([x, y]); } // água e margem rasa
    h._wsp = l; h._wspV = s._ver; h._wspH = s._hver || 0;
  }
  const L = h._wsp; if (!L.length) return null;
  for (let k = 0; k < 16; k++) {
    const [x, y] = L[Math.floor(rnd(s) * L.length)], c = tileToWorld(x, y), p = { x: c.x + (rnd(s) - 0.5) * TILE * 0.8, z: c.z + (rnd(s) - 0.5) * TILE * 0.8 };
    const d = depthAt(s, p.x, p.z); if (d >= min && d <= max && insideAt(h, p.x, p.z, 0.4)) return p;
  }
  return null;
}
// ---------- árvores (1.7.2a): quem sobe ----------
const TREE_ST = new Set(['climb_up', 'tree', 'tree_move', 'salto', 'tree_sleep', 'climb_down']);
export const aloft = a => TREE_ST.has(a.st) || (a.cy || 0) > 0.01;
export const climber = (S, a) => !!S?.tracos?.escala && ((RADIUS[a.sp] || 0.7) <= 0.4 || a.age < S.vida.adulto);
const treesOf = (s, h) => habObstacles(s, h).filter(o => o.tree);
function branchSpot(s, o) {
  const ang = rnd(s) * 6.283, r0 = o.r + 0.15, rr = r0 + rnd(s) * Math.max(0.15, o.copa * 0.75 - r0);
  return { x: o.x + Math.cos(ang) * rr, z: o.z + Math.sin(ang) * rr, y: o.top + (rnd(s) - 0.5) * 0.3 };
}
const trunkPoint = (o, from) => { const dx = from.x - o.x, dz = from.z - o.z, d = Math.hypot(dx, dz) || 1; return { x: o.x + (dx / d) * (o.r + 0.14), z: o.z + (dz / d) * (o.r + 0.14) }; };
// ponto livre ao redor de um obstáculo (comedouro/bebedouro) onde o animal cabe
function ringPoint(s, a, h, ob, margin = 0.08) {
  const R = radiusOf(s, a) * 0.7, rr = ob.r + R + margin;
  const base = Math.atan2(a.z - ob.z, a.x - ob.x);
  for (let k = 0; k < 8; k++) {
    const ang = base + (k === 0 ? (rnd(s) - 0.5) * 1.2 : (rnd(s) - 0.5) * 6.28);
    const x = ob.x + Math.cos(ang) * rr, z = ob.z + Math.sin(ang) * rr;
    if (insideAt(h, x, z, 0.4)) return { x, z };
  }
  return { x: ob.x, z: ob.z + rr };
}
// separa o animal de obstáculos e de outros animais (empurrão suave, sem teletransporte)
function collide(s, a, h, dt, ctx) {
  const R = radiusOf(s, a) * 0.7, push = Math.min(2.2 * dt + 0.02, 0.5);
  let px = 0, pz = 0;
  const obs = habObstacles(s, h);
  for (const o of obs) {
    if (o.tree) continue;
    const dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz), min = o.r + R;
    if (d < min) { const k = (min - d) / (d || 1); px += (d ? dx : 1) * k; pz += (d ? dz : 0) * k; }
  }
  for (const b of ctx.byHab?.get(a.hab) || []) {
    if (b === a || b.escaped || b.escaping || b.carriedBy || aloft(b)) continue;
    const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = R + radiusOf(s, b) * 0.7;
    if (d < min) { const k = ((min - d) / (d || 1)) * (b.asleep || b.sedated ? 1 : 0.5); px += (d ? dx : (a.id % 2 ? 1 : -1)) * k; pz += (d ? dz : 0) * k; }
  }
  const m = Math.hypot(px, pz);
  if (m) { const f = Math.min(1, push / m); a.x += px * f; a.z += pz * f; }
  // troncos são sólidos: empurra para fora na hora (a copa não bloqueia)
  for (let it = 0; it < 2; it++) {
    for (const o of obs) {
      if (!o.tree) continue;
      const dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz), min = o.r + R;
      if (d < min) { const ux = d > 1e-4 ? dx / d : (a.id % 2 ? 1 : -1), uz = d > 1e-4 ? dz / d : 0; a.x = o.x + ux * min; a.z = o.z + uz * min; }
    }
    if (!insideAt(h, a.x, a.z, 0.2)) { const q = clampInside(h, a, 0.25); a.x = q.x; a.z = q.z; } else break;
  }
  return m;
}

// Informações do habitat (cache por quarto de hora)
export function habInfo(s, h) {
  if (h._info && h._info.v === s._ver && h._info.t === s._qt) return h._info;
  const C = content(s), terr = {}; let water = 0, deep = 0;
  const cells = ensureCells(h), set = cellSet(h);
  for (const i of cells) {
    const x = i % MAP, y = (i / MAP) | 0, t = s.terrain[i]; terr[t] = (terr[t] || 0) + 1; if (t === 'w') { water++; if (s.height && waterDepth(s, x, y) > 1.0) deep++; }
  }
  const plants = {}, tall = {};
  for (const o of s.objects) {
    if (!set.has(idx(o.tx, o.ty))) continue;
    const P = C.plants[o.type]; if (!P) continue;
    plants[P.bioma] = (plants[P.bioma] || 0) + 1; if (P.alta) tall[P.bioma] = (tall[P.bioma] || 0) + 1;
  }
  const count = {};
  for (const a of s.animals) if (a.hab === h.id && C.species[a.sp]) count[a.sp] = (count[a.sp] || 0) + 1;
  h._info = { v: s._ver, t: s._qt, tiles: cells.length, land: cells.length - water, terr, water, deep, plants, tall, count };
  return h._info;
}

export function suitability(s, h, sp) {
  const C = content(s), S = C.species[sp]; if (!S) return { total: 0, parts: {} };
  const I = habInfo(s, h), F = C.fences[h.fence] || { altura: 0, resistencia: 0 };
  let need = 0; for (const [k, n] of Object.entries(I.count)) need += n * (C.species[k]?.espaco || 10);
  if (!I.count[sp]) need += S.espaco;
  const n = I.count[sp] || 1;
  let terr = 0, tsum = 0; const prefs = C.biomes[S.bioma].terreno;
  for (const [t, p] of Object.entries(prefs)) { terr += Math.min((I.terr[t] || 0) / Math.max(1, I.land), p); tsum += p; }
  const pl = S.plantasAltas ? (I.tall[S.bioma] || 0) : (I.plants[S.bioma] || 0);
  const pred = Object.keys(I.count).some(k => k !== sp && C.species[k]?.dieta === 'Carnívoro');
  const parts = {
    bioma: h.biome === S.bioma ? 1 : 0.4,
    espaco: clamp((I.land + 0.5 * I.water) / Math.max(1, need)),
    terreno: clamp(terr / tsum),
    plantas: S.plantas ? clamp(pl / S.plantas) : 1,
    agua: S.agua ? (S.aguaFunda ? 0.5 * clamp(I.water / S.agua) + 0.5 * clamp(I.deep / S.aguaFunda) : clamp(I.water / S.agua)) : 1,
    cerca: F.fosso ? (S.tracos.nada ? 0.6 : 1) : F.altura >= S.barreira.altura && F.resistencia >= S.barreira.resistencia ? 1 : 0.5,
    grupo: n < S.social.min ? 0.4 + 0.6 * n / S.social.min : n > S.social.max ? 0.7 : 1,
    convivencia: pred && S.dieta !== 'Carnívoro' ? 0.2 : 1,
  };
  const W = { bioma: 1, espaco: 1.5, terreno: 1, plantas: 1, agua: 0.8, cerca: 0.7, grupo: 1, convivencia: 1.2 };
  let tot = 0, ws = 0; for (const k in W) { tot += parts[k] * W[k]; ws += W[k]; }
  return { total: tot / ws, parts };
}

export function newAnimal(s, sp, h, adult = true) {
  const S = content(s).species[sp];
  const p = randomInside(s, h, 0.6, sp);
  return { id: uid(s), pack: S.pack, sp, name: pick(s, NOMES_ANIMAIS), sex: rnd(s) < 0.5 ? 'M' : 'F',
    age: adult ? S.vida.adulto + rnd(s) * 10 : 0, hab: h.id, x: p.x, z: p.z, rot: rnd(s) * 6.28,
    hunger: 0.2, thirst: 0.2, energy: 0.8, stress: 0.3, health: 1, sick: false, escaped: false, welfare: 0.6,
    st: 'idle', stT: 1, tgt: null, asleep: false };
}
// ponto livre dentro do habitat: fora dos troncos e sem água mais funda que a espécie aceita
export function randomInside(s, h, margin = 0.6, sp, a) {
  const S = sp && content(s).species[sp], R = (RADIUS[sp] || 0.7) * 0.7 + 0.15, obs = habObstacles(s, h), r = () => rnd(s);
  const mx = a ? maxDepth(s, a) : sp ? waterRule(S).max : 0.3;
  let p;
  for (let k = 0; k < 16; k++) {
    p = randomPoint(h, margin, r);
    if (obs.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r + R)) continue;
    if (!s.height || depthAt(s, p.x, p.z) <= mx) break;
  }
  return p;
}
const jitter = (s, p, r = 0.8) => ({ x: p.x + (rnd(s) - 0.5) * r * 2, z: p.z + (rnd(s) - 0.5) * r * 2 });
const night = s => { const hr = hourOf(s.clock.min); return hr >= 20 || hr < 6; };

export function updateAnimals(s, gameMin, ctx) {
  const C = content(s), hrs = gameMin / 60;
  if (!ctx.abstract) { ctx.byHab = new Map(); for (const a of s.animals) { if (a.escaped || a.carriedBy) continue; if (!ctx.byHab.has(a.hab)) ctx.byHab.set(a.hab, []); ctx.byHab.get(a.hab).push(a); } }
  for (let i = s.animals.length - 1; i >= 0; i--) {
    const a = s.animals[i], S = C.species[a.sp]; if (!S) continue; // pacote ausente: guardado, inativo
    const h = habById(s, a.hab);
    const baby = a.age < S.vida.adulto;
    const fora = a.escaped ? 0.25 : 1; // fora do habitat o animal acha algo para comer e beber
    a.hunger = clamp(a.hunger + (baby ? 0.06 : 0.05) * hrs * fora);
    a.thirst = clamp(a.thirst + 0.07 * hrs * fora);
    a.energy = clamp(a.energy + (a.asleep ? 0.12 : -0.045) * hrs);
    const suit = h ? suitability(s, h, a.sp).total : 0.2;
    const clean = h ? h.clean : 0.5;
    if (a.hunger > 0.85 || a.thirst > 0.85) a.health -= 0.06 * hrs;
    if (clean < 0.25) a.health -= 0.01 * hrs;
    if (a.sick) a.health -= 0.02 * hrs; else if (a.welfare > 0.6) a.health += 0.02 * hrs;
    a.health = clamp(a.health);
    if (s.settings.tranquilo && a.health < 0.08) a.health = 0.08; // Modo Tranquilo: ninguém morre por falta de cuidados
    const target = clamp((1 - suit) * 0.7 + (a.escaped ? 0.6 : 0) + (a.hunger > 0.8 ? 0.15 : 0));
    a.stress = clamp(a.stress + (target - a.stress) * Math.min(1, hrs * 0.5));
    a.welfare = clamp(0.35 * suit + 0.15 * (1 - a.hunger) + 0.15 * (1 - a.thirst) + 0.1 * clean + 0.15 * a.health + 0.1 * (1 - a.stress));
    a.age += gameMin / 1440;
    if (a.health <= 0 || a.age > S.vida.max) {
      log(s, `${a.name} (${S.nome}) morreu${a.health <= 0 ? ' por falta de cuidados' : ' de velhice'}.`, 'ruim');
      s.stats.mortes = (s.stats.mortes || 0) + 1;
      s.animals.splice(i, 1); continue;
    }
    if (ctx.abstract) abstractBehavior(s, a, h); else visualBehavior(s, a, h, S, ctx);
  }
}

function abstractBehavior(s, a, h) {
  if (aloft(a)) { const o = h && treesOf(s, h).find(t => t.tree === a.tree); if (o) { const q = trunkPoint(o, a); a.x = q.x; a.z = q.z; } a.cy = 0; a.jy = 0; a.tree = null; }
  a.asleep = night(s); a.st = a.asleep ? 'sleep' : 'idle';
  if (a.escaped || !h) return;
  if (a.hunger > 0.45 && h.food > 0.02) { a.hunger = 0.1; h.food = clamp(h.food - 0.07); if (rnd(s) < 0.35) { const f = tileToWorld(h.feed[0], h.feed[1]); addDirt(s, h, f.x + (rnd(s) - 0.5) * 3, f.z + (rnd(s) - 0.5) * 3, 1); } }
  if (a.thirst > 0.4 && h.waterLvl > 0.02) { a.thirst = 0.1; h.waterLvl = clamp(h.waterLvl - 0.05); }
}

// destino dentro do habitat: se a linha reta sair do formato (L, U...), vai por pontos intermediários
// rota que evita água funda demais para a espécie e desvia dos troncos; need = comer/beber (se não houver rota seca, atravessa)
function go(s, h, a, p, need) {
  a.wade = false;
  if (!p) { a.tgt = null; a.wp = null; return; }
  let r = routeInside(h, a, p, 0.4, okFor(s, a));
  if (!r) { if (!need) { a.tgt = null; a.wp = null; return; } r = routeInside(h, a, p); a.wade = true; }
  r = detour(s, h, a, r);
  a.tgt = r.shift(); a.wp = r.length ? r : null;
}
function detour(s, h, a, pts) {
  const trees = treesOf(s, h); if (!trees.length) return pts;
  const R = radiusOf(s, a) * 0.7, ok = a.wade ? null : okFor(s, a), out = []; let cur = { x: a.x, z: a.z }, n = 0;
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i], ex = b.x - cur.x, ez = b.z - cur.z, L2 = ex * ex + ez * ez || 1e-6; let hit = null, bt = 1;
    for (const o of trees) {
      const t = ((o.x - cur.x) * ex + (o.z - cur.z) * ez) / L2; if (t <= 0.02 || t >= 0.98) continue;
      const cx = cur.x + ex * t, cz = cur.z + ez * t; if (Math.hypot(o.x - cx, o.z - cz) < o.r + R + 0.05 && t < bt) { bt = t; hit = { o, cx, cz }; }
    }
    if (hit && n < 6) {
      n++; let nx = hit.cx - hit.o.x, nz = hit.cz - hit.o.z, m = Math.hypot(nx, nz);
      if (m < 1e-3) { nx = -ez; nz = ex; m = Math.hypot(nx, nz); }
      nx /= m; nz /= m; const D = hit.o.r + R + 0.35; let w = null;
      for (const sg of [1, -1]) { const q = { x: hit.o.x + nx * sg * D, z: hit.o.z + nz * sg * D }; if (insideAt(h, q.x, q.z, 0.3) && (!ok || ok(q.x, q.z)) && !trees.some(o2 => o2 !== hit.o && Math.hypot(q.x - o2.x, q.z - o2.z) < o2.r + R)) { w = q; break; } }
      if (w) { out.push(w); cur = w; i--; continue; }
    }
    out.push(b); cur = b;
  }
  return out;
}
function moveTo(a, dt, speed) {
  const dx = a.tgt.x - a.x, dz = a.tgt.z - a.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const st = Math.min(d, speed * dt);
  a.x += (dx / d) * st; a.z += (dz / d) * st;
  const r = Math.atan2(dx, dz); let dr = r - a.rot; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283;
  a.rot += dr * Math.min(1, dt * 6);
  return false;
}

function visualBehavior(s, a, h, S, ctx) {
  const dt = ctx.realDt * ctx.moveMul; if (dt <= 0) return;
  const px = a.x, pz = a.z;
  behave(s, a, h, S, ctx);
  waterFlags(s, a, S, dt);
  if (!h || a.escaped || a.escaping || a.carriedBy) return;
  if (aloft(a)) { a.stk = 0; return; }
  collide(s, a, h, dt, ctx);
  // água: não entra mais fundo que a espécie aceita (se já estiver lá, deixa sair)
  if (s.height && !a.wade) { const mx = maxDepth(s, a); if (mx < 99 && depthAt(s, a.x, a.z) > mx && depthAt(s, px, pz) <= mx) { a.x = px; a.z = pz; } }
  // preso (obstáculo ou outro animal no caminho): desiste do destino e escolhe outro
  if (a.tgt && !a.sedated) {
    const moved = Math.hypot(a.x - px, a.z - pz);
    if (moved < (SPEED[a.sp] || 1.3) * dt * 0.12) a.stk = (a.stk || 0) + dt; else a.stk = Math.max(0, (a.stk || 0) - dt);
    if (a.stk > 2) { a.stk = 0; a.tgt = null; a.wp = null; a.st = 'idle'; a.stT = 1 + rnd(s) * 2; }
  } else a.stk = 0;
}
// molhado (pelo/pele mais escuros no Ultra) e boiando (corpo na linha d'água)
function waterFlags(s, a, S, dt) {
  if (!s.height || a.carriedBy || aloft(a)) { a._nada = false; if (a._wet) a._wet = Math.max(0, a._wet - dt / 45); return; }
  const d = depthAt(s, a.x, a.z);
  a._nada = d > (DRAFT[a.sp] ?? 1) * ageF(S, a);
  if (d > 0.22) a._wet = 1; else if (a._wet) a._wet = Math.max(0, a._wet - dt / 45);
}
function behave(s, a, h, S, ctx) {
  const dt = ctx.realDt * ctx.moveMul; if (dt <= 0) return;
  const sp = (SPEED[a.sp] || 1.3) * (a.age < S.vida.adulto ? 0.8 : 1);
  if (a.sedated) { a.st = 'sedado'; a.asleep = true; a.tgt = null; if (a.cy) a.cy = Math.max(0, a.cy - dt * 3); a.jy = 0; return; }
  if (a.escaping) { escapeAnim(s, a, h, dt, sp); return; }
  if (a.escaped) {
    a.asleep = false; a.cy = 0;
    if (!a.tgt || a.st !== 'roam') { a.st = 'roam'; a.tgt = { x: clamp(a.x + (rnd(s) - 0.5) * 30, -70, 70), z: clamp(a.z + (rnd(s) - 0.5) * 30, -70, 70) }; }
    const ox = a.x, oz = a.z;
    if (moveTo(a, dt, sp * 1.3)) a.tgt = null;
    if (s.height) { const mx = maxDepth(s, a); if (mx < 99 && depthAt(s, a.x, a.z) > mx && depthAt(s, ox, oz) <= mx) { a.x = ox; a.z = oz; a.tgt = null; } }
    return;
  }
  if (!h) return;
  if (aloft(a) || a.st === 'tree_go') { if (treeBehave(s, a, h, S, dt, sp)) return; }
  if (a.sedated) { a.st = 'sedado'; a.asleep = true; return; }
  if (a.st === 'sleep') { a.asleep = true; if (!night(s) && a.energy > 0.6) { a.asleep = false; a.st = 'idle'; a.stT = 1; } return; }
  a.asleep = false;
  if (a.tgt) {
    if (moveTo(a, dt, a.st === 'eat_go' || a.st === 'drink_go' ? sp : sp * 0.7)) {
      if (a.wp?.length) { a.tgt = a.wp.shift(); return; }
      a.tgt = null; a.wp = null;
      if (a.st === 'eat_go') { a.st = 'eat'; a.stT = 5; }
      else if (a.st === 'drink_go') { a.st = 'drink'; a.stT = 3; }
      else if (a.st === 'bath_go') { a.st = 'bath'; a.stT = (a.sp === 'hipopotamo' ? 20 : 8) + rnd(s) * 10; a.stress = clamp(a.stress - 0.05); a.thirst = clamp(a.thirst - 0.3); }
      else if (a.st === 'filtrar_go') { a.st = 'filtrar'; a.stT = 10 + rnd(s) * 10; }
      else { a.st = 'idle'; a.stT = 2 + rnd(s) * 4; }
    }
    return;
  }
  a.stT -= dt; if (a.stT > 0) return;
  if (a.st === 'eat') { a.hunger = clamp(a.hunger - 0.75); h.food = clamp(h.food - 0.07); if (rnd(s) < 0.35) addDirt(s, h, a.x + (rnd(s) - 0.5) * 1.6, a.z + (rnd(s) - 0.5) * 1.6, 1); }
  if (a.st === 'drink') { a.thirst = clamp(a.thirst - 0.8); h.waterLvl = clamp(h.waterLvl - 0.05); }
  if (a.st === 'filtrar') { a.hunger = clamp(a.hunger - 0.12); }
  // decisão por utilidade
  const r = () => rnd(s), W = waterRule(S), wet = s.height && W.modo !== 'evita' && (habInfo(s, h).water > 0);
  const trees = climber(S, a) ? treesOf(s, h) : [], day = !night(s);
  const opts = [
    ['sleep', night(s) ? 2 : a.energy < 0.25 ? 1.5 : 0],
    ['eat', a.hunger > 0.4 && h.food > 0.02 ? a.hunger * 1.6 : 0],
    ['drink', a.thirst > 0.35 && h.waterLvl > 0.02 ? a.thirst * 1.7 : 0],
    ['wander', 0.4 + r() * 0.4],
    ['idle', 0.3 + r() * 0.4],
    ['social', 0.25 + r() * 0.3],
    ['bath', wet && day ? (a.sp === 'hipopotamo' ? 0.6 + r() * 0.4 : a.sp === 'flamingo' ? 0.35 + r() * 0.3 : 0.3 + r() * 0.35 + a.thirst * 0.3) : 0],
    ['climb', trees.length && day ? 0.45 + r() * 0.45 : 0],
  ];
  opts.sort((x, y) => y[1] - x[1]);
  const c = opts[0][0];
  if (c === 'sleep' && trees.length) { goTree(s, a, h, trees, 'sleep'); if (!a.tgt) { a.st = 'sleep'; a.asleep = true; } }
  else if (c === 'sleep') { a.st = 'sleep'; a.asleep = true; }
  else if (c === 'climb') { goTree(s, a, h, trees, 'rest'); if (!a.tgt) { a.st = 'idle'; a.stT = 2; } }
  else if (c === 'eat') { a.st = 'eat_go'; go(s, h, a, ringPoint(s, a, h, habObstacles(s, h).find(o => o.feed)), true); }
  else if (c === 'drink') { a.st = 'drink_go'; go(s, h, a, ringPoint(s, a, h, habObstacles(s, h).find(o => o.water)), true); }
  else if (c === 'wander') { a.st = 'walk'; const anf = W.modo === 'anfibio' && day && r() < 0.7; go(s, h, a, (anf && waterSpot(s, h, 0.3, 99)) || randomInside(s, h, 0.6, a.sp, a)); }
  else if (c === 'bath') {
    const mx = maxDepth(s, a), fl = a.sp === 'flamingo';
    a.st = fl ? 'filtrar_go' : 'bath_go'; go(s, h, a, waterSpot(s, h, fl ? 0.08 : BATH_MIN[a.sp] ?? 0.05, Math.min(mx, fl ? 0.5 : 99)));
    if (!a.tgt) { a.st = 'idle'; a.stT = 2; }
  }
  else if (c === 'social') {
    const mates = s.animals.filter(b => b !== a && b.hab === a.hab && !b.escaped && !aloft(b));
    if (mates.length) { const m = pick(s, mates); a.st = 'walk'; go(s, h, a, clampInside(h, { x: m.x + (r() - 0.5) * 3, z: m.z + (r() - 0.5) * 3 }, 0.6)); }
    else { a.st = 'idle'; a.stT = 3; }
  } else { a.st = 'idle'; a.stT = 2 + r() * 5; }
}

// ---------- subir em árvores (macaco; gorila jovem) ----------
function goTree(s, a, h, trees, act) {
  const near = [...trees].sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z)).slice(0, 3);
  const o = pick(s, near); a.tree = o.tree; a.treeAct = act; a.st = 'tree_go';
  const q = trunkPoint(o, a), R = radiusOf(s, a) * 0.7, k = (o.r + R + 0.08) / (o.r + 0.14);
  go(s, h, a, clampInside(h, { x: o.x + (q.x - o.x) * k, z: o.z + (q.z - o.z) * k }, 0.3));
  if (!a.tgt) a.tree = null;
}
// devolve true quando cuidou do animal neste quadro
function treeBehave(s, a, h, S, dt, sp) {
  const o = a.tree != null ? treesOf(s, h).find(t => t.tree === a.tree) : null;
  if (!o) { a.cy = 0; a.jy = 0; a.tree = null; if (TREE_ST.has(a.st) || a.st === 'tree_go') { a.st = 'idle'; a.stT = 1; a.tgt = null; a.wp = null; } return false; }
  a.asleep = a.st === 'tree_sleep';
  if (a.st === 'tree_go') {
    if (a.tgt) { if (!moveTo(a, dt, sp * 0.8)) return true; if (a.wp?.length) { a.tgt = a.wp.shift(); return true; } }
    // chegou ao pé da árvore: encosta no tronco e começa a subir
    const q = trunkPoint(o, a); a.x = q.x; a.z = q.z; a.rot = Math.atan2(o.x - a.x, o.z - a.z);
    a.st = 'climb_up'; a.cy = 0; a.tgt = null; a.wp = null; return true;
  }
  if (a.st === 'climb_up') {
    a.cy = Math.min(o.top, (a.cy || 0) + dt * 1.1);
    if (a.cy >= o.top) { const b = branchSpot(s, o); hop(a, b, 0.25); a.st = 'tree_move'; }
    return true;
  }
  if (a.st === 'tree_move' || a.st === 'salto') {
    const H = a.hop; if (!H) { a.st = 'tree'; a.stT = 3; return true; }
    a.tgt = H.to; const done = moveTo(a, dt, a.st === 'salto' ? sp * 1.6 : sp * 0.6);
    const f = H.d0 > 0.01 ? clamp(1 - Math.hypot(H.to.x - a.x, H.to.z - a.z) / H.d0) : 1;
    a.cy = H.fy + (H.to.y - H.fy) * f; a.jy = Math.sin(f * Math.PI) * H.arc;
    if (done) {
      a.tgt = null; a.jy = 0; a.cy = H.to.y; a.hop = null;
      if (H.down) { a.st = 'climb_down'; a.rot = Math.atan2(o.x - a.x, o.z - a.z); }
      else { a.st = a.treeAct === 'sleep' && night(s) ? 'tree_sleep' : 'tree'; a.stT = 10 + rnd(s) * 25; }
    }
    return true;
  }
  if (a.st === 'tree_sleep') { a.asleep = true; if (!night(s) && a.energy > 0.6) { a.asleep = false; a.st = 'tree'; a.treeAct = 'rest'; a.stT = 2 + rnd(s) * 4; } return true; }
  if (a.st === 'climb_down') {
    a.cy = Math.max(0, (a.cy || 0) - dt * 1.4);
    if (a.cy <= 0) { a.cy = 0; a.st = 'idle'; a.stT = 1 + rnd(s) * 2; a.tree = null; }
    return true;
  }
  if (a.st === 'tree') {
    a.stT -= dt; if (a.stT > 0) return true;
    if (night(s)) { a.st = 'tree_sleep'; a.asleep = true; return true; }
    const needs = a.hunger > 0.55 || a.thirst > 0.5, r = rnd(s);
    if (needs || r < 0.2) { const q = trunkPoint(o, a); hop(a, { x: q.x, z: q.z, y: o.top }, 0.15); a.hop.down = true; a.st = 'tree_move'; return true; }
    // pula para uma árvore vizinha (copas próximas) ou anda pelos galhos
    const other = r < 0.45 ? treesOf(s, h).filter(t => t !== o && Math.hypot(t.x - o.x, t.z - o.z) < t.copa + o.copa + 1.6) : [];
    if (other.length) { const t2 = pick(s, other); a.tree = t2.tree; hop(a, branchSpot(s, t2), 0.9); a.st = 'salto'; return true; }
    hop(a, branchSpot(s, o), 0.35); a.st = 'tree_move'; return true;
  }
  return false;
}
function hop(a, to, arc) { a.hop = { to, fy: a.cy || 0, d0: Math.hypot(to.x - a.x, to.z - a.z), arc }; }
// galho perto da cerca (copa por cima): rota de fuga de quem sobe
function branchEdge(s, a, h, F) {
  if (!aloft(a) || F.teto || F.fosso) return null;
  const o = treesOf(s, h).find(t => t.tree === a.tree); if (!o || o.top + 0.5 < F.altura) return null;
  const e = edgePoint(s, h, { x: o.x, z: o.z }, false), E = edges(h).find(x => x.d === e.side && x.c === e.k);
  const d = E ? (E.d === 'N' || E.d === 'S' ? Math.abs(o.z - E.az) : Math.abs(o.x - E.ax)) : 99;
  return d < o.copa + 0.3 ? e : null;
}

// Checagem horária de fuga
const POOP = { elefante: 0.35, leao: 0.12, zebra: 0.2, girafa: 0.2, macaco: 0.1, hipopotamo: 0.3, rinoceronte: 0.3, flamingo: 0.08, gorila: 0.15, tartaruga: 0.1 };
export function hourlyAnimals(s) {
  const C = content(s);
  for (const a of s.animals) {
    const S = C.species[a.sp]; if (!S || a.escaped) continue;
    const h = habById(s, a.hab); if (!h) continue;
    if (rnd(s) < (POOP[a.sp] ?? 0.15)) addDirt(s, h, a.x + (rnd(s) - 0.5) * 0.6, a.z + (rnd(s) - 0.5) * 0.6, 0);
    if (!s.settings.fugas || s.settings.tranquilo) continue;
    if (a.sedated || a.carriedBy || a.escaping) continue;
    const F = C.fences[h.fence];
    const tr = S.tracos;
    let weak = 1;
    if (F.fosso) weak = tr.nada ? 1.5 : 0.05;
    else {
      if (F.altura < S.barreira.altura) weak *= tr.pula || tr.escala ? 3 : 1.5;
      if (F.resistencia < S.barreira.resistencia) weak *= 2.5;
    }
    if (branchEdge(s, a, h, F)) weak *= 2; // galho por cima da cerca: um pouco mais fácil, nunca garantido
    const hp = h.fenceHp < 0.35 ? 4 : h.fenceHp < 0.7 ? 1.5 : 1;
    let p = 0.0003 * weak * hp * (0.5 + a.stress * 2);
    if (h.gateOpen) p += 0.08;
    p += 0.06 * (h.breaches?.length || 0);
    if (rnd(s) < p) startEscape(s, a, h, S, F);
  }
}

// ---------- fuga animada ----------
function edgePoint(s, h, a, gateOk) {
  // trecho de cerca mais perto do animal (no formato livre, qualquer lado de bloco na borda)
  const ge = gateEdge(h); let best = null, bd = 1e9;
  for (const e of edges(h)) { if (!gateOk && e === ge) continue; const d = (e.mx - a.x) ** 2 + (e.mz - a.z) ** 2; if (d < bd) { bd = d; best = e; } }
  return edgeInfo(h, best || edges(h)[0]);
}
function edgeInfo(h, e) {
  const ins = h.fence === 'fosso' ? 2 * TILE : 0;
  return { side: e.d, k: e.c, inner: { x: e.mx - e.nx * (0.8 + ins), z: e.mz - e.nz * (0.8 + ins) }, edge: { x: e.mx, z: e.mz }, outer: { x: e.mx + e.nx * 1.8, z: e.mz + e.nz * 1.8 } };
}
export function addBreach(s, h, side, k) {
  h.breaches = h.breaches || [];
  if (!h.breaches.some(b => b.side === side && b.k === k)) h.breaches.push({ side, k });
  h.fenceHp = clamp(h.fenceHp - 0.2);
}
export function startEscape(s, a, h, S, F) {
  const tr = S.tracos; let mode, pts, e = null;
  if (h.gateOpen) { mode = 'portao'; const i = tileToWorld(h.gateIn[0], h.gateIn[1]), o = tileToWorld(h.gateOut[0], h.gateOut[1]); pts = [i, o]; }
  else if (h.breaches?.length && !F.fosso) { mode = 'brecha'; const br = h.breaches[0]; e = breachPoint(h, br); pts = [e.inner, e.outer]; }
  else if ((e = branchEdge(s, a, h, F))) { mode = 'galho'; pts = []; }
  else {
    e = edgePoint(s, h, a, false);
    if (F.fosso) mode = 'nadar';
    else if (tr.forca >= 6 && (F.resistencia < S.barreira.resistencia || h.fenceHp < 0.5)) mode = 'derrubar';
    else if (tr.pula || tr.escala) mode = 'pular';
    else mode = tr.forca >= 4 ? 'derrubar' : 'pular';
    pts = mode === 'nadar' ? [e.inner, e.outer] : [e.inner];
  }
  a.escaped = true; a.st = 'fugindo'; a.tgt = null;
  a.escaping = { mode, pts, i: 0, t: 0, side: e?.side, k: e?.k, out: e?.outer, cy0: a.cy || 0 };
  a.tree = null; a.hop = null;
  const verbo = { portao: 'saiu pelo portão aberto', brecha: 'saiu pela brecha na cerca', nadar: 'atravessou o fosso a nado', derrubar: 'derrubou um trecho da cerca', pular: tr.escala ? 'escalou a cerca' : 'pulou a cerca', galho: 'pulou de um galho por cima da cerca' }[mode];
  log(s, `Fuga! ${a.name} (${S.nome}) ${verbo} do ${h.name}.`, 'perigo');
  if (s._ctx?.abstract) finishEscapeNow(s, a, h);
}
export function breachPoint(h, br) {
  const e = findEdge(h, br.side, br.k) || edges(h)[0], i = edgeInfo(h, e);
  return { side: e.d, k: e.c, inner: { x: e.mx - e.nx * 1.2, z: e.mz - e.nz * 1.2 }, outer: i.outer };
}
function finishEscapeNow(s, a, h) {
  const E = a.escaping; if (!E) return;
  if (E.mode === 'derrubar') addBreach(s, h, E.side, E.k);
  const o = E.out || E.pts[E.pts.length - 1]; a.x = o.x; a.z = o.z; a.escaping = null; a.jy = 0; a.cy = 0; a.st = 'roam';
}
function escapeAnim(s, a, h, dt, sp) {
  const E = a.escaping; E.t += dt;
  if (E.i < E.pts.length) { a.tgt = E.pts[E.i]; if (moveTo(a, dt, sp * (E.mode === 'nadar' && E.i > 0 ? 0.5 : 1.3))) { E.i++; E.t = 0; } return; }
  a.tgt = null;
  if (E.mode === 'galho') {
    const T = 1.4, f = Math.min(1, E.t / T), o = E.out;
    if (!E.from) E.from = { x: a.x, z: a.z };
    a.x = E.from.x + (o.x - E.from.x) * f; a.z = E.from.z + (o.z - E.from.z) * f; a.rot = Math.atan2(o.x - E.from.x, o.z - E.from.z);
    a.cy = E.cy0 * (1 - f * f); a.jy = Math.sin(f * Math.PI) * 1.2; a.st = 'salto';
    if (f >= 1) { a.jy = 0; a.cy = 0; a.escaping = null; a.st = 'roam'; }
    return;
  }
  if (E.mode === 'pular') {
    const T = 1.3, f = Math.min(1, E.t / T), i = E.pts[0], o = E.out;
    if (!E.from) E.from = { x: a.x, z: a.z };
    a.x = E.from.x + (o.x - E.from.x) * f; a.z = E.from.z + (o.z - E.from.z) * f;
    a.jy = Math.sin(f * Math.PI) * 3.4; a.st = 'pulando';
    if (f >= 1) { a.jy = 0; a.escaping = null; a.st = 'roam'; }
    return;
  }
  if (E.mode === 'derrubar') {
    a.st = 'empurrar';
    if (E.t > 2.2) { addBreach(s, h, E.side, E.k); log(s, `${a.name} derrubou a cerca! Há uma brecha no ${h.name}.`, 'perigo'); E.mode = 'brecha'; E.pts = [E.out]; E.i = 0; E.t = 0; }
    return;
  }
  a.escaping = null; a.st = 'roam';
}

export function dailyAnimals(s) {
  const C = content(s), day = Math.floor(s.clock.min / 1440);
  for (const a of [...s.animals]) {
    const S = C.species[a.sp]; if (!S || a.escaped) continue;
    const h = habById(s, a.hab); if (!h) continue;
    if (!a.sick) {
      const p = 0.03 * (1.6 - a.welfare) * (1.6 - h.clean) * (h.checkupDay === day - 1 || h.checkupDay === day ? 0.5 : 1);
      if (rnd(s) < p) { a.sick = true; log(s, `${a.name} (${S.nome}) ficou doente.`, 'ruim'); }
    }
  }
  // reprodução
  for (const h of s.habitats) {
    const I = habInfo(s, h);
    for (const sp of Object.keys(I.count)) {
      const S = C.species[sp]; if (!S) continue;
      const g = s.animals.filter(a => a.hab === h.id && a.sp === sp && !a.escaped && a.age >= S.vida.adulto && a.age < S.vida.velhice);
      const ok = g.some(a => a.sex === 'M') && g.some(a => a.sex === 'F');
      const w = g.reduce((t, a) => t + a.welfare, 0) / Math.max(1, g.length);
      if (ok && w > 0.7 && I.count[sp] < S.social.max && rnd(s) < 0.04) {
        const b = newAnimal(s, sp, h, false); s.animals.push(b);
        log(s, `Nasceu um filhote de ${S.nome.toLowerCase()} no ${h.name}!`, 'bom');
      }
    }
  }
}
