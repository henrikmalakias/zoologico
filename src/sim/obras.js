// 1.8.3 parte 2: tempo de obra. Recintos (construção rápida e desenho livre), ampliações, tocas novas e prédios levam
// MINUTOS REAIS FIXOS para ficar prontos (não dependem da hora do dia nem da velocidade do jogo, e continuam com o app
// fechado). Caminho, banco, poste, lixeira e planta continuam instantâneos.
// Durante a obra: tapume em volta, área fechada aos visitantes e à equipe, e os animais comprados ficam na lista
// "a caminho" (fora do mapa); quando a obra termina eles chegam de caminhão. "Terminar agora" é pago, proporcional ao que
// falta (até 60% do custo da obra). A primeira obra de um zoo novo termina de graça (para o tutorial).
// Save (SCHEMA 12): s.obras = [{ id, tipo, ini, dur, custo, nome, hab?, fac?, toca?, cells?, rect }],
//                   s.aCaminho = [{ id, sp, sex, hab, espera: [ids de obra], custo, pack }], s.obraGratis.
// Prédio de DLC: duração automática pelo custo (campo opcional obraMin, em minutos; 0 = instantâneo). Nada obrigatório.
import { content } from '../content/registry.js';
import { uid, log, clamp } from './util.js';
import { MAP, idx, inMap, rebuildOcc, tileToWorld, orientFacility } from './grid.js';
import { newAnimal, habById } from './animals.js';
import { earn } from './staff.js';
import { addFurnNear } from './furn.js';
import { touch, ensureCells, cellXY } from './habshape.js';

const MIN = 60e3;
export const OBRA = { habMin: 6, habMax: 60, blocosMin: 36, blocosMax: 400, tocaMin: 3, facMin: 3, facMax: 12, custoFacMin: 2000, custoFacMax: 15000, instantaneoAbaixo: 1000, precoMax: 0.6 };

// ---------- duração (ms) ----------
// recinto: pequeno (até 36 blocos) 6 min, grande (20 x 20 = 400 blocos) 60 min, linear no meio
export const duracaoHab = blocos => Math.round(clamp(OBRA.habMin + (blocos - OBRA.blocosMin) * (OBRA.habMax - OBRA.habMin) / (OBRA.blocosMax - OBRA.blocosMin), OBRA.habMin, OBRA.habMax) * MIN);
// ampliação: proporcional ao que cresce (mínimo 3 min)
export const duracaoAmpliar = blocos => Math.round(clamp(blocos * 0.15, 3, OBRA.habMax) * MIN);
export const duracaoToca = () => OBRA.tocaMin * MIN;
// prédio: 3 a 12 min pelo preço (escala logarítmica); bancos e placas (menos de R$ 1.000) ficam instantâneos
export function duracaoFac(s, type) {
  const D = content(s).facilities[type]; if (!D || D.fixo) return 0;
  if (D.obraMin != null) return Math.max(0, D.obraMin) * MIN;
  const c = D.custo || 0; if (c < OBRA.instantaneoAbaixo) return 0;
  const t = clamp((Math.log(c) - Math.log(OBRA.custoFacMin)) / (Math.log(OBRA.custoFacMax) - Math.log(OBRA.custoFacMin)));
  return Math.round((OBRA.facMin + t * (OBRA.facMax - OBRA.facMin)) * MIN);
}

// ---------- consulta ----------
export const obras = s => (s.obras ||= []);
export const aCaminho = s => (s.aCaminho ||= []);
export const obraById = (s, id) => obras(s).find(o => o.id === id) || null;
export const obraDoHab = (s, h) => (h?.obra ? obraById(s, h.obra) : null);
export const emObra = (s, h) => !!obraDoHab(s, h);
export const obrasDoHab = (s, hid) => obras(s).filter(o => o.hab === hid);
export const ampliacaoDe = (s, hid) => obras(s).find(o => o.tipo === 'ampliar' && o.hab === hid) || null;
export const tocasEmObra = (s, hid) => obras(s).filter(o => o.tipo === 'toca' && o.hab === hid);
export const aCaminhoDe = (s, hid, sp) => aCaminho(s).filter(e => e.hab === hid && (!sp || e.sp === sp));
export const fimDe = o => o.ini + o.dur;
export const faltaMs = (o, now) => Math.max(0, fimDe(o) - now);
export const progresso = (o, now) => (o.dur > 0 ? clamp((now - o.ini) / o.dur) : 1);
export const etapa = (o, now) => Math.min(4, 1 + Math.floor(progresso(o, now) * 4)); // andaime: 4 etapas
export function precoTerminar(s, o, now) {
  if (s.obraGratis) return 0;
  const f = o.dur > 0 ? faltaMs(o, now) / o.dur : 0;
  return Math.max(f > 0 ? 10 : 0, Math.ceil((o.custo || 0) * OBRA.precoMax * f / 10) * 10);
}
export function textoFalta(ms) {
  const t = Math.ceil(ms / 1000), m = Math.floor(t / 60), sg = t % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m}:${String(sg).padStart(2, '0')}`;
}
// blocos ocupados pela obra (para o mapa de ocupação e o tapume)
export function blocosDaObra(s, o) {
  if (o.tipo === 'hab') { const h = habById(s, o.hab); return h ? ensureCells(h) : []; }
  if (o.tipo === 'ampliar') return o.cells || [];
  if (o.tipo === 'toca') { const t = o.toca; return [[t.tx, t.ty], [t.tx + 1, t.ty], [t.tx, t.ty + 1], [t.tx + 1, t.ty + 1]].filter(([x, y]) => inMap(x, y)).map(([x, y]) => idx(x, y)); }
  if (o.tipo === 'fac') { const D = content(s).facilities[o.fac.type] || { w: 1, h: 1 }, out = []; for (let y = o.fac.ty; y < o.fac.ty + D.h; y++) for (let x = o.fac.tx; x < o.fac.tx + D.w; x++) if (inMap(x, y)) out.push(idx(x, y)); return out; }
  return [];
}
export function retangulo(cells) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const i of cells) { const x = i % MAP, y = (i / MAP) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------- criar ----------
export function iniciarObra(s, o, now = Date.now()) {
  const ob = { id: uid(s), ini: now, ...o };
  obras(s).push(ob);
  if (ob.tipo === 'hab') { const h = habById(s, ob.hab); if (h) h.obra = ob.id; }
  ob.rect = retangulo(blocosDaObra(s, ob));
  rebuildOcc(s);
  return ob;
}
// animal comprado para um recinto em obra: espera fora do mapa e chega de caminhão no fim
export function encomendar(s, sp, h, espera, sexo) {
  const S = content(s).species[sp];
  const iguais = [...s.animals.filter(a => a.hab === h.id && a.sp === sp), ...aCaminhoDe(s, h.id, sp)];
  const sex = sexo || (iguais.filter(b => b.sex === 'M').length > iguais.filter(b => b.sex === 'F').length ? 'F' : 'M');
  const e = { id: uid(s), sp, sex, hab: h.id, espera: [...new Set(espera)], custo: S?.custo || 0, pack: S?.pack || 'base' };
  aCaminho(s).push(e); return e;
}

// ---------- andamento ----------
// chamado com o jogo aberto (1 vez por segundo) e durante a simulação do tempo fora (com a hora real daquele instante)
export function obraTick(s, now = Date.now()) {
  const L = obras(s); if (!L.length && !aCaminho(s).length) return 0;
  let n = 0;
  for (const o of [...L].sort((a, b) => fimDe(a) - fimDe(b))) if (fimDe(o) <= now) { concluir(s, o, now); n++; }
  if (n || aCaminho(s).length) entregar(s, now);
  return n;
}
export function terminarAgora(s, id, now = Date.now()) {
  const o = obraById(s, id); if (!o) return { ok: false, msg: 'Essa obra já terminou.' };
  const p = precoTerminar(s, o, now);
  if (s.money < p) return { ok: false, msg: `Terminar agora custa R$ ${p.toLocaleString('pt-BR')}. Dinheiro insuficiente.` };
  if (p) { s.money -= p; s.stats.today.exp.construcao = (s.stats.today.exp.construcao || 0) + p; }
  const gratis = s.obraGratis; s.obraGratis = false;
  concluir(s, o, now); entregar(s, now);
  return { ok: true, msg: gratis ? '🎉 A primeira obra é por nossa conta!' : '', preco: p, gratis };
}
function concluir(s, o, now) {
  const L = obras(s), k = L.indexOf(o); if (k < 0) return; L.splice(k, 1);
  const C = content(s);
  if (o.tipo === 'hab') {
    const h = habById(s, o.hab); if (h) { delete h.obra; touch(h); }
    const n = aCaminhoDe(s, o.hab).filter(e => e.espera.every(id => id === o.id || !obraById(s, id))).length;
    log(s, `🏗 Obra pronta: ${h?.name || o.nome}!${n ? ` ${n} ${n === 1 ? 'animal chega' : 'animais chegam'} de caminhão.` : ''}`, 'bom');
  } else if (o.tipo === 'fac') {
    const D = C.facilities[o.fac.type];
    if (D) {
      const f = { ...o.fac, id: o.fac.id || uid(s) };
      s.facilities.push(f); rebuildOcc(s);
      f.dir = D.zona === 'lote' ? 2 : orientFacility(s, f, D);
      if (o.fac.type === 'lanchonete' || o.fac.type === 'mesas') addFurnNear(s, 'lixeira', f, D);
    }
    log(s, `🏗 Obra pronta: ${D?.nome || o.nome}!`, 'bom');
  } else if (o.tipo === 'toca') {
    const h = habById(s, o.hab);
    if (h) { const t = { id: o.toca.id || uid(s), hab: h.id, tx: o.toca.tx, ty: o.toca.ty, dir: o.toca.dir, porta: o.toca.porta, modelo: o.toca.modelo, fechada: false, pack: o.toca.pack || 'base' }; (s.tocas ||= []).push(t); touch(h); }
    const n = aCaminhoDe(s, o.hab).filter(e => e.espera.every(id => id === o.id || !obraById(s, id))).length;
    log(s, `🏗 Toca nova pronta no ${h?.name || 'recinto'}${n ? `: ${n === 1 ? 'o animal chega' : n + ' animais chegam'} de caminhão` : ''}.`, 'bom');
  } else if (o.tipo === 'ampliar') {
    const h = habById(s, o.hab);
    if (h) aplicarAmpliacao(s, h, o.cells);
    log(s, `🏗 Ampliação pronta: ${h?.name || o.nome} ganhou ${o.cells?.length || 0} blocos.`, 'bom');
  }
  rebuildOcc(s);
}
// a ampliação junta os blocos novos ao habitat (a cerca se refaz no novo contorno); gancho preenchido por build.js
export const ganchos = { ampliar: null };
function aplicarAmpliacao(s, h, cells) { if (ganchos.ampliar) ganchos.ampliar(s, h, cells || []); }
// animais na lista "a caminho" cujas obras terminaram chegam pelo portão do recinto
function entregar(s, now) {
  const L = aCaminho(s); if (!L.length) return;
  const chegaram = new Map();
  for (const e of [...L]) {
    const h = habById(s, e.hab);
    if (!h) { L.splice(L.indexOf(e), 1); earn(s, 'metas', e.custo); log(s, `Um animal a caminho voltou (o recinto não existe mais): R$ ${e.custo.toLocaleString('pt-BR')} devolvidos.`, 'info'); continue; }
    if (e.espera.some(id => obraById(s, id)) || h.obra) continue;
    if (!content(s).species[e.sp]) continue; // DLC desinstalada: espera reinstalar
    L.splice(L.indexOf(e), 1);
    const a = newAnimal(s, e.sp, h, true); a.sex = e.sex;
    const g = tileToWorld(h.gateIn[0], h.gateIn[1]); a.x = g.x; a.z = g.z; a.st = 'idle'; a.stT = 0.5; a.chegou = now;
    s.animals.push(a);
    if (!chegaram.has(h.id)) chegaram.set(h.id, []); chegaram.get(h.id).push(a);
  }
  for (const [hid, lista] of chegaram) {
    const h = habById(s, hid); touch(h);
    (s._entregas ||= []).push({ hab: hid, t: now, n: lista.length });
    const C = content(s), sp = lista[0].sp, S = C.species[sp];
    // 'info': vai para o histórico e o relatório; o aviso na tela já veio com o fim da obra
    log(s, lista.length === 1 ? `🚚 ${lista[0].name} (${S?.nome || sp}) chegou de caminhão ao ${h.name}.` : `🚚 ${lista.length} animais chegaram de caminhão ao ${h.name}.`, 'info');
  }
}
// cancelar a obra de prédio, toca ou ampliação (demolir): devolve tudo o que foi pago por ela. Quem esperava só por ela
// chega na hora (a obra de recinto é cancelada demolindo o recinto: ver build.js)
export function cancelarObra(s, id, now = Date.now()) {
  const o = obraById(s, id); if (!o || o.tipo === 'hab') return { ok: false, msg: 'Essa obra já terminou.' };
  obras(s).splice(obras(s).indexOf(o), 1);
  const v = o.custo || 0;
  for (const e of aCaminho(s)) e.espera = e.espera.filter(x => x !== o.id);
  earn(s, 'metas', v); rebuildOcc(s); entregar(s, now);
  return { ok: true, msg: `Obra cancelada: R$ ${Math.round(v).toLocaleString('pt-BR')} devolvidos.`, valor: v };
}
// recinto demolido: animais a caminho voltam com o dinheiro devolvido; obras dele são canceladas
export function limparDoHab(s, hid) {
  let v = 0;
  for (const e of [...aCaminho(s)]) if (e.hab === hid) { aCaminho(s).splice(aCaminho(s).indexOf(e), 1); v += e.custo || 0; }
  for (const o of obrasDoHab(s, hid)) { obras(s).splice(obras(s).indexOf(o), 1); if (o.tipo !== 'hab') v += o.custo || 0; }
  if (v) earn(s, 'metas', v);
  return v;
}
// obra no bloco (para tocar no mapa e abrir a ficha)
export function obraEm(s, tx, ty) {
  if (!inMap(tx, ty)) return null; const i = idx(tx, ty);
  const id = s._occ?.obra?.[i]; if (id) return obraById(s, id);
  const hid = s._occ?.hab?.[i], h = hid && habById(s, hid);
  return h?.obra ? obraById(s, h.obra) : null;
}
export const blocoEmObra = (s, i) => !!s._occ?.obra?.[i];
export { cellXY };
