import { content } from '../content/registry.js';
import { clamp, rnd, pick, uid, log, hourOf } from './util.js';
import { TILE, HALF, MAP, tileToWorld, worldToTile, waterDepth, idx, inMap, depthAt } from './grid.js';
import { NOMES_ANIMAIS } from '../content/base.js';
import { cellSet, walkSet, insideAt, clampInside, randomPoint, routeInside, edges, findEdge, gateEdge, ensureCells } from './habshape.js';
import { addDirt, recalcClean, atacarFuncionario } from './staff.js';
import { tickInternado } from './clinica.js';
import { DIRV, tocasDe, tocaById, tocaCenter, portaPonto, tocaVagas, tocaLugar, ocupantes } from './tocas.js';

export const SPEED = { leao: 1.6, zebra: 1.5, elefante: 1.1, girafa: 1.3, macaco: 1.4, hipopotamo: 1.0, rinoceronte: 1.2, flamingo: 0.9, gorila: 1.0, tartaruga: 0.25 };
export const habById = (s, id) => s.habitats.find(h => h.id === id);
// raio do corpo (m) para não sobrepor outros animais nem atravessar plantas e comedouros
export const RADIUS = { leao: 0.8, zebra: 0.8, elefante: 1.4, girafa: 0.9, macaco: 0.35, hipopotamo: 1.2, rinoceronte: 1.2, flamingo: 0.3, gorila: 0.55, tartaruga: 0.45 };
// valores por espécie: o campo do pacote (DLC) vale primeiro; as tabelas acima guardam os do jogo base
const spv = (s, sp, campo, tbl, def) => content(s).species[sp]?.[campo] ?? tbl[sp] ?? def;
export const speedOf = (s, sp) => spv(s, sp, 'velocidade', SPEED, 1.3);
export const raioOf = (s, sp) => spv(s, sp, 'raio', RADIUS, 0.7);
export const caladoOf = (s, sp) => spv(s, sp, 'calado', DRAFT, 1);
const radiusOf = (s, a) => { const S = content(s).species[a.sp]; const f = S && a.age < S.vida.adulto ? 0.5 + 0.5 * (a.age / S.vida.adulto) : 1; return raioOf(s, a.sp) * f; };
// obstáculos fixos do habitat: plantas, comedouro e bebedouro (cache até a próxima construção)
export function habObstacles(s, h) {
  if (h._obs && h._obsV === s._ver) return h._obs;
  const C = content(s), out = [];
  const set = cellSet(h);
  for (const o of s.objects) {
    if (!set.has(idx(o.tx, o.ty))) continue;
    const P = C.plants[o.type]; if (!P || !P.alta) continue; // arbustos, capim e samambaia: atravessáveis
    const p = tileToWorld(o.tx, o.ty), k = o.sc || 1;
    out.push({ x: p.x, z: p.z, r: (P.tronco || 0.45) * k, tree: o.id, solido: true, top: (P.galho || 3) * k, copa: (P.copa || 1.5) * k });
  }
  const f = tileToWorld(h.feed[0], h.feed[1]), w = tileToWorld(h.water[0], h.water[1]);
  out.push({ x: f.x, z: f.z, r: 0.85, feed: true }, { x: w.x, z: w.z, r: 0.7, water: true });
  // tocas (1.7.2b): caixa sólida de 4 m x 4 m (r = raio aproximado, usado só para desviar a rota)
  for (const t of tocasDe(s, h.id)) { const c = tocaCenter(t); out.push({ x: c.x, z: c.z, r: 2.35, hx: 2, hz: 2, box: true, solido: true, toca: t.id }); }
  h._obs = out; h._obsV = s._ver; return out;
}
// o ponto (com folga R) está dentro de um obstáculo sólido?
const hitObs = (o, x, z, R) => (o.box ? Math.abs(x - o.x) < o.hx + R && Math.abs(z - o.z) < o.hz + R : Math.hypot(x - o.x, z - o.z) < o.r + R);
// dentro da toca (entrando, parado lá dentro ou saindo): não colide nem é empurrado
const TOCA_ST = new Set(['toca_in', 'in_toca', 'toca_out']);
export const dentro = a => a.toca != null && TOCA_ST.has(a.st);
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
export const climber = (S, a) => !!S?.tracos?.escala && ((S.raio ?? RADIUS[a.sp] ?? 0.7) <= 0.4 || a.age < S.vida.adulto);
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
    if (o.solido || a.st === 'investida') continue; // na carga, o animal passa por cima do comedouro e do bebedouro
    const dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz), min = o.r + R;
    if (d < min) { const k = (min - d) / (d || 1); px += (d ? dx : 1) * k; pz += (d ? dz : 0) * k; }
  }
  const naPorta = a.st === 'toca_go' && a.tgt && !a.wp?.length && Math.hypot(a.tgt.x - a.x, a.tgt.z - a.z) < 3; // chegando à porta da toca: passa por quem estiver deitado na frente
  for (const b of naPorta ? [] : ctx.byHab?.get(a.hab) || []) {
    if (b === a || b.escaped || b.escaping || b.carriedBy || aloft(b) || dentro(b)) continue;
    if (a.st === 'toca_go' && b.asleep) continue; // a caminho da toca, passa ao lado de quem dorme no chão (não fica encurralado no canto)
    const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = R + radiusOf(s, b) * 0.7;
    if (d < min) { const k = ((min - d) / (d || 1)) * (b.asleep || b.sedated ? 1 : 0.5); px += (d ? dx : (a.id % 2 ? 1 : -1)) * k; pz += (d ? dz : 0) * k; }
  }
  const m = Math.hypot(px, pz);
  if (m) { const f = Math.min(1, push / m); a.x += px * f; a.z += pz * f; }
  // troncos e tocas são sólidos: empurra para fora na hora (a copa não bloqueia)
  for (let it = 0; it < 2; it++) {
    for (const o of obs) {
      if (!o.solido) continue;
      if (o.box) { const bx = a.x - o.x, bz = a.z - o.z, ox = o.hx + R - Math.abs(bx), oz = o.hz + R - Math.abs(bz); if (ox > 0 && oz > 0) { if (ox < oz) a.x = o.x + (bx < 0 ? -1 : 1) * (o.hx + R); else a.z = o.z + (bz < 0 ? -1 : 1) * (o.hz + R); } continue; }
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
  const S = sp && content(s).species[sp], R = (sp ? raioOf(s, sp) : 0.7) * 0.7 + 0.15, obs = habObstacles(s, h), r = () => rnd(s);
  const mx = a ? maxDepth(s, a) : sp ? waterRule(S).max : 0.3;
  let p;
  for (let k = 0; k < 16; k++) {
    p = randomPoint(h, margin, r);
    if (obs.some(o => hitObs(o, p.x, p.z, R))) continue;
    if (!s.height || depthAt(s, p.x, p.z) <= mx) break;
  }
  return p;
}
const jitter = (s, p, r = 0.8) => ({ x: p.x + (rnd(s) - 0.5) * r * 2, z: p.z + (rnd(s) - 0.5) * r * 2 });
const night = s => { const hr = hourOf(s.clock.min); return hr >= 20 || hr < 6; };
// ---------- rotina por espécie (1.7.2b) ----------
// hora de dormir da espécie (sem rotina: noite das 20h às 6h, como antes). Quem tem acorda > dorme é ativo à noite (hipopótamo).
export function dormeAgora(S, hr) {
  const R = S?.rotina; if (!R) return hr >= 20 || hr < 6;
  const acordado = R.acorda < R.dorme ? hr >= R.acorda && hr < R.dorme : hr >= R.acorda || hr < R.dorme;
  return !acordado;
}
export function rotinaAgora(S, hr) { for (const [a, b, o] of S?.rotina?.janelas || []) if (hr >= a && hr < b) return o; return null; }
const dorme = (s, S) => dormeAgora(S, hourOf(s.clock.min));
// estados que o desenho e o painel conhecem (qualquer outro vira "parado" no desenho)
export const ESTADOS = new Set(['idle', 'walk', 'eat_go', 'eat', 'drink_go', 'drink', 'sleep', 'roam', 'sedado', 'bath_go', 'bath', 'filtrar_go', 'filtrar', 'tree_go', 'climb_up', 'tree', 'tree_move', 'salto', 'tree_sleep', 'climb_down', 'fugindo', 'empurrar', 'pulando',
  'pastar_go', 'pastar', 'descanso', 'descanso_pe', 'umaperna', 'poeira', 'sono_go', 'toca_go', 'toca_in', 'in_toca', 'toca_out', 'ameaca', 'investida', 'medo']);

export function updateAnimals(s, gameMin, ctx) {
  const C = content(s), hrs = gameMin / 60;
  // app fechado/relógio avançado: o recolhimento para os serviços vira tempo extra (ninguém fica preso numa toca)
  if (ctx.abstract) { for (const t of s.tocas || []) t.fechada = false; for (const h of s.habitats) { h.visitOpen = false; h.seg = []; } }
  if (!ctx.abstract) {
    ctx.byHab = new Map(); for (const a of s.animals) { if (a.escaped || a.carriedBy || a.internado) continue; if (!ctx.byHab.has(a.hab)) ctx.byHab.set(a.hab, []); ctx.byHab.get(a.hab).push(a); }
    ctx.equipe = equipeDentro(s);
  }
  for (let i = s.animals.length - 1; i >= 0; i--) {
    const a = s.animals[i], S = C.species[a.sp]; if (!S) continue; // pacote ausente: guardado, inativo
    if (a.internado) { tickInternado(s, a, S, gameMin); continue; } // na Clínica veterinária: fora do habitat
    if (a.sedAte && s.clock.min >= a.sedAte && !a.carriedBy) acordaSedacao(s, a); // o sedativo acabou
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
    if (ctx.abstract) abstractBehavior(s, a, h, S); else visualBehavior(s, a, h, S, ctx);
  }
}

function abstractBehavior(s, a, h, S) {
  // app fechado ou relógio avançado: ninguém fica dentro de toca nem em pose de visita (a rotina só marca quem dorme)
  if (a.toca != null) { const t = tocaById(s, a.toca); if (t && dentro(a)) { const q = h ? clampInside(h, portaPonto(t, 1.2), 0.3) : portaPonto(t, 1.2); a.x = q.x; a.z = q.z; } a.toca = null; }
  a.preso = false; a.guard = false; a.wHold = 0;
  if (aloft(a)) { const o = h && treesOf(s, h).find(t => t.tree === a.tree); if (o) { const q = trunkPoint(o, a); a.x = q.x; a.z = q.z; } a.cy = 0; a.jy = 0; a.tree = null; }
  a.asleep = dorme(s, S); a.st = a.asleep ? 'sleep' : 'idle';
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
  const trees = habObstacles(s, h).filter(o => o.solido); if (!trees.length) return pts;
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
  if (aloft(a) || dentro(a)) { a.stk = 0; return; }
  collide(s, a, h, dt, ctx);
  // água: não entra mais fundo que a espécie aceita (se já estiver lá, deixa sair)
  if (s.height && !a.wade) { const mx = maxDepth(s, a); if (mx < 99 && depthAt(s, a.x, a.z) > mx && depthAt(s, px, pz) <= mx) { a.x = px; a.z = pz; } }
  // preso (obstáculo ou outro animal no caminho): desiste do destino e escolhe outro
  if (a.tgt && !a.sedated) {
    const moved = Math.hypot(a.x - px, a.z - pz);
    if (moved < speedOf(s, a.sp) * dt * 0.12) a.stk = (a.stk || 0) + dt; else a.stk = Math.max(0, (a.stk || 0) - dt);
    // sem progresso (1.7.2b): empurrado para lá e para cá por quem dorme no caminho, anda sem chegar mais perto do destino
    const dT = Math.hypot(a.tgt.x - a.x, a.tgt.z - a.z);
    if (a._pT !== a.tgt || dT < a._pD - 0.25) { a._pT = a.tgt; a._pD = dT; a._pt = 0; } else if ((a._pt += dt) > 4 && a.st !== 'investida') a.stk = 9;
    if (a.stk > 2) { if (a.st === 'toca_go' && (a.tocaFalha = (a.tocaFalha || 0) + 1) >= 3) { a.tocaFalha = 0; a.semToca = s.clock.min + 60; } // não achou o caminho da toca 3 vezes: descansa onde está por 1 h
      a.stk = 0; a.tgt = null; a.wp = null; a.st = 'idle'; a.stT = 1 + rnd(s) * 2; }
  } else a.stk = 0;
}
// molhado (pelo/pele mais escuros no Ultra) e boiando (corpo na linha d'água)
function waterFlags(s, a, S, dt) {
  if (!s.height || a.carriedBy || aloft(a)) { a._nada = false; if (a._wet) a._wet = Math.max(0, a._wet - dt / 45); return; }
  const d = depthAt(s, a.x, a.z);
  a._nada = d > caladoOf(s, a.sp) * ageF(S, a);
  if (d > 0.22) a._wet = 1; else if (a._wet) a._wet = Math.max(0, a._wet - dt / 45);
}
function behave(s, a, h, S, ctx) {
  const dt = ctx.realDt * ctx.moveMul; if (dt <= 0) return;
  const sp = speedOf(s, a.sp) * (a.age < S.vida.adulto ? 0.8 : 1);
  if (a.sedated) { a.st = 'sedado'; a.asleep = true; a.tgt = null; a.toca = null; a.preso = false; a.guard = false; if (a.cy) a.cy = Math.max(0, a.cy - dt * 3); a.jy = 0; return; }
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
  if (a.wCool) a.wCool = Math.max(0, a.wCool - dt);
  const eq = ctx.equipe?.get(h.id);
  if (eq && s.settings.selvagem !== false && wildBehave(s, a, h, S, ctx, dt, sp, eq)) return;
  if (a.st === 'ameaca' || a.st === 'investida') { a.st = 'idle'; a.stT = 1; a.tgt = null; a.wHold = 0; }
  if (medoBehave(s, a, h, S, ctx, dt, sp, eq)) return;
  if (aloft(a) || a.st === 'tree_go') { if (treeBehave(s, a, h, S, dt, sp)) return; }
  if (a.toca != null && tocaBehave(s, a, h, S, dt, sp)) return;
  if (a.sedated) { a.st = 'sedado'; a.asleep = true; return; }
  if (a.st === 'sleep') { a.asleep = true; if (!dorme(s, S) && a.energy > 0.6) { a.asleep = false; a.st = 'idle'; a.stT = 1; } return; }
  a.asleep = false;
  if (a.tgt) {
    if (moveTo(a, dt, a.st === 'eat_go' || a.st === 'drink_go' ? sp : sp * 0.7)) {
      if (a.wp?.length) { a.tgt = a.wp.shift(); return; }
      a.tgt = null; a.wp = null;
      if (a.st === 'eat_go') { a.st = 'eat'; a.stT = 5; }
      else if (a.st === 'drink_go') { a.st = 'drink'; a.stT = 3; }
      else if (a.st === 'bath_go') { a.st = 'bath'; a.stT = (S.aguaModo === 'anfibio' ? 20 : 8) + rnd(s) * 10; a.stress = clamp(a.stress - 0.05); a.thirst = clamp(a.thirst - 0.3); }
      else if (a.st === 'filtrar_go') { a.st = 'filtrar'; a.stT = 10 + rnd(s) * 10; }
      else if (a.st === 'pastar_go') { a.st = 'pastar'; a.stT = 8 + rnd(s) * 8; }
      else if (a.st === 'sono_go') { a.st = 'sleep'; a.asleep = true; }
      else { a.st = 'idle'; a.stT = 2 + rnd(s) * 4; }
    }
    return;
  }
  a.stT -= dt; if (a.stT > 0) return;
  if (a.st === 'eat') { a.hunger = clamp(a.hunger - 0.75); h.food = clamp(h.food - 0.07); if (rnd(s) < 0.35) addDirt(s, h, a.x + (rnd(s) - 0.5) * 1.6, a.z + (rnd(s) - 0.5) * 1.6, 1); }
  if (a.st === 'drink') { a.thirst = clamp(a.thirst - 0.8); h.waterLvl = clamp(h.waterLvl - 0.05); }
  if (a.st === 'filtrar') { a.hunger = clamp(a.hunger - 0.12); }
  if (a.st === 'pastar' && a.hunger > 0.5) a.hunger = Math.max(0.5, a.hunger - 0.06); // pastar só belisca: abaixo disso, só o comedouro
  if (a.st === 'poeira') a.stress = clamp(a.stress - 0.03);
  // decisão por utilidade
  const r = () => rnd(s), W = waterRule(S), wet = s.height && W.modo !== 'evita' && (habInfo(s, h).water > 0);
  const trees = climber(S, a) ? treesOf(s, h) : [], day = !night(s);
  // rotina da espécie: soma peso à atividade da hora (o animal ainda pode fazer outra coisa de vez em quando)
  const hr = hourOf(s.clock.min), ro = S.rotina || {}, RT = rotinaAgora(S, hr), sono = dormeAgora(S, hr);
  const tl = ro.dormeEm === 'toca' ? tocaLivre(s, a, h) : null;
  const medroso = !!ctx.equipe?.get(h.id)?.length && (s.settings.selvagem === false || perigoDe(s, a) < PERIGOSO); // espera a equipe sair de perto do comedouro
  const opts = [
    ['sleep', sono ? 2 : a.energy < 0.25 ? 1.5 : 0],
    ['pastar', RT === 'pastar' ? 0.7 + r() * 0.4 : 0],
    ['descanso', RT === 'descanso' ? 0.75 + r() * 0.4 : 0],
    ['toca', RT === 'descanso' && tl ? 0.8 + r() * 0.4 : 0],
    ['poeira', RT === 'banho' && S.poeira ? 0.6 + r() * 0.4 : 0],
    ['eat', a.hunger > 0.4 && h.food > 0.02 && !(medroso && equipePerto(ctx, h, h.feed, 5)) ? a.hunger * 1.6 : 0],
    ['drink', a.thirst > 0.35 && h.waterLvl > 0.02 && !(medroso && equipePerto(ctx, h, h.water, 5)) ? a.thirst * 1.7 : 0],
    ['wander', 0.4 + r() * 0.4],
    ['idle', 0.3 + r() * 0.4],
    ['social', 0.25 + r() * 0.3 + (RT === 'social' ? 0.45 : 0)],
    ['bath', wet && day ? (W.modo === 'anfibio' ? 0.6 + r() * 0.4 : S.filtrador || a.sp === 'flamingo' ? 0.35 + r() * 0.3 : 0.3 + r() * 0.35 + a.thirst * 0.3) + (RT === 'banho' || RT === 'filtrar' ? 0.5 : 0) : 0],
    ['climb', trees.length && day ? 0.45 + r() * 0.45 : 0],
  ];
  opts.sort((x, y) => y[1] - x[1]);
  const c = opts[0][0];
  if (c === 'sleep' && trees.length) { goTree(s, a, h, trees, 'sleep'); if (!a.tgt) { a.st = 'sleep'; a.asleep = true; } }
  else if (c === 'sleep') {
    let wp = null; if (ro.dormeEm === 'agua') { wp = waterSpot(s, h, 1.2, 99) || waterSpot(s, h, 1.2, 99); if (!wp) for (let k = 0; k < 4; k++) { const q = waterSpot(s, h, S.banhoMin ?? BATH_MIN[a.sp] ?? 0.3, 99); if (q && (!wp || depthAt(s, q.x, q.z) > depthAt(s, wp.x, wp.z))) wp = q; } } // dorme na parte funda (só olhos e narinas de fora); sem água funda, na mais funda que achar
    if (wp) { a.st = 'sono_go'; go(s, h, a, wp); } else if (tl) mandarParaToca(s, a, h, tl);
    if (!a.tgt) { a.st = 'sleep'; a.asleep = true; a.toca = null; }
  }
  else if (c === 'toca') { if (!mandarParaToca(s, a, h, tl)) { a.st = 'idle'; a.stT = 2; } }
  else if (c === 'pastar') { a.st = 'pastar_go'; go(s, h, a, randomInside(s, h, 0.6, a.sp, a)); if (!a.tgt) { a.st = 'pastar'; a.stT = 6 + r() * 6; } }
  else if (c === 'descanso') { a.st = ro.descanso === 'umaperna' ? 'umaperna' : ro.descanso === 'empe' ? 'descanso_pe' : 'descanso'; a.stT = 12 + r() * 14; a.stress = clamp(a.stress - 0.01); }
  else if (c === 'poeira') { a.st = 'poeira'; a.stT = 7 + r() * 5; }
  else if (c === 'climb') { goTree(s, a, h, trees, 'rest'); if (!a.tgt) { a.st = 'idle'; a.stT = 2; } }
  else if (c === 'eat') { a.st = 'eat_go'; go(s, h, a, ringPoint(s, a, h, habObstacles(s, h).find(o => o.feed)), true); }
  else if (c === 'drink') { a.st = 'drink_go'; go(s, h, a, ringPoint(s, a, h, habObstacles(s, h).find(o => o.water)), true); }
  else if (c === 'wander') { a.st = 'walk'; const anf = W.modo === 'anfibio' && day && r() < 0.7; go(s, h, a, (anf && waterSpot(s, h, 0.3, 99)) || randomInside(s, h, 0.6, a.sp, a)); }
  else if (c === 'bath') {
    const mx = maxDepth(s, a), fl = !!S.filtrador || a.sp === 'flamingo';
    a.st = fl ? 'filtrar_go' : 'bath_go'; go(s, h, a, waterSpot(s, h, fl ? 0.08 : S.banhoMin ?? BATH_MIN[a.sp] ?? 0.05, Math.min(mx, fl ? 0.5 : 99)));
    if (!a.tgt) { a.st = 'idle'; a.stT = 2; }
  }
  else if (c === 'social') {
    const mates = s.animals.filter(b => b !== a && b.hab === a.hab && !b.escaped && !aloft(b) && !dentro(b));
    if (mates.length) { const m = pick(s, mates); a.st = 'walk'; go(s, h, a, clampInside(h, { x: m.x + (r() - 0.5) * 3, z: m.z + (r() - 0.5) * 3 }, 0.6)); }
    else { a.st = 'idle'; a.stT = 3; }
  } else { a.st = 'idle'; a.stT = 2 + r() * 5; }
}

// ---------- tocas (1.7.2b) ----------
// toca do habitat com vaga para este animal (só divide com a mesma espécie); guard = recolhido pelo tratador (entra mesmo com a toca fechada)
export function tocaLivre(s, a, h, guard) {
  const vg = tocaVagas(s, a.sp); let best = null, bd = 1e9;
  if (!guard && a.semToca && s.clock.min < a.semToca) return null;
  for (const t of tocasDe(s, h.id)) {
    if (t.fechada && !guard) continue;
    const oc = ocupantes(s, t).filter(b => b !== a); if (oc.length >= vg || oc.some(b => b.sp !== a.sp)) continue;
    const c = tocaCenter(t), d = Math.hypot(c.x - a.x, c.z - a.z); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
export function mandarParaToca(s, a, h, t, guard) {
  if (!t) return false;
  const vg = tocaVagas(s, a.sp), usados = new Set(ocupantes(s, t).filter(b => b !== a).map(b => b.tocaSlot || 0));
  let slot = 0; while (usados.has(slot) && slot < vg - 1) slot++;
  a.toca = t.id; a.tocaSlot = slot; a.guard = !!guard; a.st = 'toca_go'; a.asleep = false; a.tree = null;
  go(s, h, a, clampInside(h, portaPonto(t, radiusOf(s, a) * 0.7 + 0.3), 0.2), true);
  if (!a.tgt) { a.toca = null; a.guard = false; return false; }
  return true;
}
// solta quem estava recolhido nas tocas do habitat (a equipe terminou o serviço e saiu do recinto)
export function soltarTocas(s, h) {
  for (const a of s.animals) if (a.hab === h.id) { a.preso = false; a.guard = false; }
  for (const t of tocasDe(s, h.id)) t.fechada = false;
  h.seg = [];
}
// devolve true quando cuidou do animal neste quadro
function tocaBehave(s, a, h, S, dt, sp) {
  const t = tocaById(s, a.toca);
  if (!t || t.hab !== h.id || !(a.st === 'toca_go' || TOCA_ST.has(a.st))) { a.toca = null; a.preso = false; a.guard = false; if (a.st === 'toca_go' || TOCA_ST.has(a.st)) { a.st = 'idle'; a.stT = 1; a.tgt = null; a.wp = null; } return false; }
  const vg = tocaVagas(s, a.sp), lugar = tocaLugar(t, a.tocaSlot || 0, vg);
  if (a.st === 'toca_go') {
    if (a.tgt) { if (!moveTo(a, dt, sp * (a.guard ? 1 : 0.8))) return true; if (a.wp?.length) { a.tgt = a.wp.shift(); return true; } }
    const oc = ocupantes(s, t).filter(b => b !== a && dentro(b));
    if (oc.length >= vg || oc.some(b => b.sp !== a.sp) || (t.fechada && !a.guard)) { a.toca = null; a.guard = false; a.st = 'walk'; go(s, h, a, randomInside(s, h, 0.6, a.sp, a)); if (!a.tgt) { a.st = 'idle'; a.stT = 1; } return true; } // toca cheia: sai da frente da porta
    a.st = 'toca_in'; a.tgt = null; a.wp = null; return true;
  }
  if (a.st === 'toca_in') {
    a.tgt = lugar;
    if (moveTo(a, dt, sp * 0.6)) { a.tgt = null; a.x = lugar.x; a.z = lugar.z; a.st = 'in_toca'; a.stT = 15 + rnd(s) * 25; a.tocaSono = false; a.tocaFalha = 0; }
    return true;
  }
  if (a.st === 'in_toca') {
    a.tgt = null; const alvo = Math.atan2(DIRV[t.dir][0], DIRV[t.dir][1]); let dr = alvo - a.rot; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; a.rot += dr * Math.min(1, dt * 3); // olha para o vidro
    const sono = dorme(s, S), antes = a.asleep;
    a.asleep = sono || (antes ? a.energy < 0.6 : a.energy < 0.25);
    if (a.asleep) a.tocaSono = true;
    if (a.preso || a.guard) return true; // recolhido para um serviço: só sai quando a equipe sair do recinto
    if (antes && !a.asleep && a.tocaSono) { a.tocaSono = false; a.stress = clamp(a.stress - 0.05); a.st = 'toca_out'; return true; } // dormiu abrigado: acorda mais calmo
    if (a.asleep) return true;
    if (a.hunger > 0.6 || a.thirst > 0.55) { a.st = 'toca_out'; return true; }
    a.stT -= dt; if (a.stT > 0) return true;
    if (rotinaAgora(S, hourOf(s.clock.min)) === 'descanso' && rnd(s) < 0.5) { a.stT = 10 + rnd(s) * 15; return true; }
    a.st = 'toca_out'; return true;
  }
  // toca_out
  a.asleep = false; a.tgt = portaPonto(t, radiusOf(s, a) * 0.7 + 0.3);
  if (moveTo(a, dt, sp * 0.7)) { a.tgt = null; a.toca = null; a.st = 'idle'; a.stT = 0.5 + rnd(s); }
  return true;
}

// ---------- modo selvagem (1.7.2c): o perigo vale para os FUNCIONÁRIOS dentro do recinto ----------
// perigo de um animal agora: base da espécie + estresse, fome e fêmea com filhote por perto; recolhido na toca ou sedado = 0
export function perigoDe(s, a) {
  const C = content(s), S = C.species[a.sp]; if (!S) return 0;
  let P = S.perigo ?? (S.tracos?.perigoso ? 3 : 0); if (!P) return 0;
  if (a.sedated || a.carriedBy || a.escaped || a.internado || (a.preso && a.st === 'in_toca')) return 0;
  if (a.stress > 0.6) P += 1;
  if (a.hunger > 0.75) P += 0.5;
  if (a.sex === 'F' && a.age >= S.vida.adulto && s.animals.some(b => b !== a && b.hab === a.hab && b.sp === a.sp && b.age < S.vida.adulto && Math.hypot(b.x - a.x, b.z - a.z) < 8)) P += 1;
  return P;
}
// a partir deste perigo o animal conta como perigoso: é recolhido na toca (ou sedado) antes dos serviços e pode atacar a equipe
export const PERIGOSO = 3;
// distâncias: o animal encara a partir de "encara" metros e ataca se o funcionário ficar "espera" segundos a menos de "ataca"
export const limites = P => ({ encara: P + 2, ataca: Math.max(2.5, P), espera: P >= 4 ? 2 : 3.5 });
export const MEDO = 4; // os mansos mantêm esta distância (m) de quem trabalha no recinto
export const perigosos = (s, h) => s.animals.filter(a => a.hab === h.id && !a.escaped && perigoDe(s, a) >= PERIGOSO);
// plano antes de entrar: quem cabe nas tocas (recolher) e quem sobra (sedar); excl = animal alvo do serviço (internar, transferir)
export function planoServico(s, h, excl) {
  const lista = perigosos(s, h).filter(a => a.id !== excl), tocas = tocasDe(s, h.id).map(t => ({ t, oc: ocupantes(s, t).filter(b => b.preso || b.guard || dentro(b)) }));
  const cabem = [], sobram = [];
  for (const a of lista) {
    if (a.toca != null && (dentro(a) || a.guard)) { const t = tocaById(s, a.toca); if (t) { cabem.push({ a, t }); continue; } }
    const vg = tocaVagas(s, a.sp), x = tocas.find(o => o.oc.length < vg && o.oc.every(b => b.sp === a.sp));
    if (x) { x.oc.push(a); cabem.push({ a, t: x.t }); } else sobram.push(a);
  }
  return { cabem, sobram, total: lista.length };
}
// funcionários a pé dentro de cada recinto (alvos do modo selvagem e de quem tem medo); feridos e motoristas ficam de fora
export function equipeDentro(s) {
  const m = new Map();
  for (const st of s.staff) {
    if (st.ferido || st.veh) continue;
    const { tx, ty } = worldToTile(st.x, st.z), hid = inMap(tx, ty) ? s._occ?.hab[idx(tx, ty)] : 0; if (!hid) continue;
    const h = habById(s, hid); if (!h || !insideAt(h, st.x, st.z, 0)) continue;
    if (!m.has(hid)) m.set(hid, []); m.get(hid).push(st);
  }
  return m;
}
const maisPerto = (L, a) => { let b = null, bd = 1e9; for (const st of L) { const d = Math.hypot(st.x - a.x, st.z - a.z); if (d < bd) { bd = d; b = st; } } return b ? { st: b, d: bd } : null; };
export function equipePerto(ctx, h, tile, r) { const L = ctx.equipe?.get(h.id); if (!L?.length) return false; const p = tileToWorld(tile[0], tile[1]); return L.some(st => Math.hypot(st.x - p.x, st.z - p.z) < r); }
// sedação no lugar (veterinário, de fora da cerca): o animal dorme por SED_MIN minutos de jogo
export const SED_MIN = 60;
export function sedarNoLugar(s, a) {
  Object.assign(a, { sedated: true, sedAte: s.clock.min + SED_MIN, st: 'sedado', tgt: null, wp: null, asleep: true, wHold: 0, tree: null, cy: 0, jy: 0 });
  if (a.toca != null && !dentro(a)) { a.toca = null; a.guard = false; }
  a.stress = clamp(a.stress + 0.1);
}
function acordaSedacao(s, a) { a.sedAte = 0; a.sedated = false; a.asleep = false; a.st = 'idle'; a.stT = 1 + rnd(s); a.tgt = null; a.wp = null; a.wCool = 0; }
// devolve true quando o animal está reagindo a um funcionário neste quadro (ameaça, investida, contato)
function wildBehave(s, a, h, S, ctx, dt, sp, eq) {
  if (aloft(a) || dentro(a) || a.preso || a.guard || a.sedated) { a.wHold = 0; return false; }
  if (a.st === 'investida') {
    const J = s.staff.find(x => x.id === a.wAlvo);
    if (!J || J.ferido || !eq.includes(J)) { a.st = 'idle'; a.stT = 2; a.tgt = null; a.wHold = 0; a.wCool = 6; return true; }
    const d = Math.hypot(J.x - a.x, J.z - a.z), R = radiusOf(s, a) * 0.7;
    a.asleep = false; a.wT = (a.wT || 0) + dt; a.tgt = { x: J.x, z: J.z }; a.wp = null; a.wade = false;
    const manso = !!s.settings.tranquilo, para = R + (manso ? 1.0 : 0.75); // Modo Tranquilo: faz a carga e para a 1 m; o serviço só atrasa
    if (d <= para + 0.02) { atacarFuncionario(s, J, a, manso); (ctx.ataques ||= []).push({ id: a.id, st: J.id, manso }); a.st = 'ameaca'; a.tgt = null; a.wHold = 0; a.wCool = 30; return true; }
    if (a.wT > 3) { a.st = 'idle'; a.stT = 2; a.tgt = null; a.wHold = 0; a.wCool = 6; return true; }
    moveTo(a, dt, Math.min(sp * 2.4, Math.max(0.01, d - para) / dt)); return true; // não passa do ponto de parada
  }
  if (a.wCool > 0) return false;
  const P = perigoDe(s, a); if (P < PERIGOSO) { a.wHold = 0; return false; }
  const n = maisPerto(eq, a); if (!n) { a.wHold = 0; return false; }
  const L = limites(P), J = n.st, d = n.d, dx = J.x - a.x, dz = J.z - a.z;
  if (a.asleep && d > 2.5) return false; // dormindo: só reage se chegarem bem perto
  if (d < L.encara) {
    if (a.st !== 'ameaca') ctx.ameaca = a.id;
    a.st = 'ameaca'; a.asleep = false; a.tgt = null; a.wp = null; if (a.toca != null && !dentro(a)) a.toca = null; a.tree = null;
    const al = Math.atan2(dx, dz); let dr = al - a.rot; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; a.rot += dr * Math.min(1, dt * 5);
    a.wHold = d < L.ataca ? (a.wHold || 0) + dt : Math.max(0, (a.wHold || 0) - dt);
    // o funcionário continua trabalhando ali: depois de encarar um pouco, o animal se aproxima devagar
    if (d >= L.ataca) { a.wStalk = (a.wStalk || 0) + dt; if (a.wStalk > 1.5) { a.tgt = { x: J.x, z: J.z }; moveTo(a, dt, Math.min(sp * 0.45, (d - L.ataca + 0.3) / dt)); a.tgt = null; } } else a.wStalk = 0;
    if (a.wHold >= L.espera) { a.st = 'investida'; a.wT = 0; a.wHold = 0; a.wStalk = 0; a.wAlvo = J.id; ctx.investida = a.id; }
    return true;
  }
  a.wHold = 0; a.wStalk = 0; return false;
}
// medo (1.7.2c): quem não oferece perigo real (ou todos, com o modo selvagem desligado) se afasta de quem trabalha no recinto
function medoBehave(s, a, h, S, ctx, dt, sp, eq) {
  if (aloft(a) || dentro(a) || a.sedated || a.preso || a.guard) { if (a.st === 'medo') { a.st = 'idle'; a.stT = 1; a.tgt = null; } return false; }
  if (a.st === 'medo') {
    if (a.tgt && !moveTo(a, dt, sp * 1.15)) return true;
    a.tgt = null; a.wp = null; a.st = 'idle'; a.stT = 1.5 + rnd(s) * 2;
  }
  if (!eq?.length || (s.settings.selvagem !== false && perigoDe(s, a) >= PERIGOSO)) return false;
  const n = maisPerto(eq, a); if (!n || n.d >= MEDO) return false;
  if (a.asleep && n.d > 2) return false; // dormindo: só acorda se chegarem bem perto
  const ux = n.d > 0.01 ? (a.x - n.st.x) / n.d : 1, uz = n.d > 0.01 ? (a.z - n.st.z) / n.d : 0, D = MEDO + 1.5 + rnd(s);
  let best = null, bd = -1;
  for (const ang of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
    const c = Math.cos(ang), sn = Math.sin(ang), vx = ux * c - uz * sn, vz = ux * sn + uz * c;
    const q = clampInside(h, { x: n.st.x + vx * D, z: n.st.z + vz * D }, 0.6), dd = Math.hypot(q.x - n.st.x, q.z - n.st.z);
    if (s.height && maxDepth(s, a) < 99 && depthAt(s, q.x, q.z) > maxDepth(s, a)) continue;
    if (dd > bd) { bd = dd; best = q; } if (dd >= MEDO + 0.5) break;
  }
  if (!best || bd <= n.d + 0.3) return false; // encurralado: fica onde está
  a.st = 'medo'; a.tgt = best; a.wp = null; a.wade = false; a.asleep = false; a.tree = null; if (a.toca != null && !dentro(a)) { a.toca = null; a.guard = false; }
  return true;
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
      else { a.st = a.treeAct === 'sleep' && dorme(s, S) ? 'tree_sleep' : 'tree'; a.stT = 10 + rnd(s) * 25; }
    }
    return true;
  }
  if (a.st === 'tree_sleep') { a.asleep = true; if (!dorme(s, S) && a.energy > 0.6) { a.asleep = false; a.st = 'tree'; a.treeAct = 'rest'; a.stT = 2 + rnd(s) * 4; } return true; }
  if (a.st === 'climb_down') {
    a.cy = Math.max(0, (a.cy || 0) - dt * 1.4);
    if (a.cy <= 0) { a.cy = 0; a.st = 'idle'; a.stT = 1 + rnd(s) * 2; a.tree = null; }
    return true;
  }
  if (a.st === 'tree') {
    a.stT -= dt; if (a.stT > 0) return true;
    if (dorme(s, S)) { a.st = 'tree_sleep'; a.asleep = true; return true; }
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
    if (rnd(s) < spv(s, a.sp, 'fezes', POOP, 0.15)) addDirt(s, h, a.x + (rnd(s) - 0.5) * 0.6, a.z + (rnd(s) - 0.5) * 0.6, 0);
    if (!s.settings.fugas || s.settings.tranquilo) continue;
    if (a.sedated || a.carriedBy || a.escaping || dentro(a) || a.internado) continue;
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
    if (h.gateOpen) p += 0.08; // o AO VIVO é um "fantasma": a visita do jogador não abre o portão de verdade
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
  a.tree = null; a.hop = null; a.toca = null; a.preso = false; a.guard = false;
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
    const g = f * f * (3 - 2 * f); // 1.7.2e: sai e chega devagar, de frente para onde vai
    a.x = E.from.x + (o.x - E.from.x) * g; a.z = E.from.z + (o.z - E.from.z) * g; a.rot = Math.atan2(o.x - E.from.x, o.z - E.from.z);
    a.jy = Math.sin(f * Math.PI) * 3.4; a.st = 'pulando';
    if (f >= 1) { a.jy = 0; a.escaping = null; a.st = 'roam'; }
    return;
  }
  if (E.mode === 'derrubar') {
    a.st = 'empurrar'; if (E.out) a.rot = Math.atan2(E.out.x - a.x, E.out.z - a.z);
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
