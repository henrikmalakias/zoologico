// 1.8.3b: Demolir com 4 modos (Bloco, Recinto, Prédio e Área), mudança ou venda dos animais e lago na demolição.
// - Bloco: como antes (um bloco por toque); tocar num recinto usa a mesma regra do modo Recinto.
// - Recinto: 1 toque remove o recinto inteiro (cerca, tocas, plantas de dentro). O caminho em volta fica.
// - Prédio: 1 toque remove o prédio inteiro (ou cancela a obra dele).
// - Área: retângulo; sai tudo o que estiver dentro (plantas, caminho, mobiliário, prédios que encostam); recinto só se
//   estiver inteiro dentro.
// Animais do recinto: vão na hora, de caminhão, para outro recinto compatível com vaga; quem não couber é vendido (40%).
// Lago: o recinto com lago (ou bloco de água solto) pergunta Manter o lago (grátis) ou Aterrar e nivelar (obra curta paga).
// Devoluções iguais às de antes: prédio 50%, mobiliário 50%, toca 50%, recinto 30%, obra 100%; planta e caminho 0.
import { content } from '../content/registry.js';
import { clamp, log } from './util.js';
import { MAP, idx, inMap, inArea, rebuildOcc, isPathT, tileToWorld, RUA } from './grid.js';
import { habById, habInfo } from './animals.js';
import { earn, spend } from './staff.js';
import { removeFurnAt } from './furn.js';
import { demolish, sellAnimal, habitatCostRef, reorientAround } from './build.js';
import { ensureCells, cellSet, touch, cellXY } from './habshape.js';
import { tocasDe, tocaEm, ocupantes } from './tocas.js';
import * as OB from './obras.js';
import { lagoLivre } from './lagos.js';
import { sobeArvore, nomePlural } from './rapido.js';

export const DEVOLVE = { fac: 0.5, furn: 0.5, toca: 0.5, hab: 0.3, venda: 0.4 };
export const MODOS = ['bloco', 'recinto', 'predio', 'area'];
const R = (ok, msg = '', extra = {}) => ({ ok, msg, ...extra });
const BRL = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const facTiles = (s, f) => { const D = content(s).facilities[f.type] || { w: 1, h: 1 }, out = []; for (let y = f.ty; y < f.ty + D.h; y++) for (let x = f.tx; x < f.tx + D.w; x++) if (inMap(x, y)) out.push(idx(x, y)); return out; };
const temInternado = (s, f) => s.animals.some(a => a.internado === f.id) || s.staff.some(st => st.task?.clinica === f.id);

// ---------- para onde vão os animais ----------
// vagas de uma espécie num recinto, contando quem já mora, quem está a caminho, internados e quem já foi reservado
export function vagasPara(s, h, sp, reserva = new Map()) {
  const C = content(s), S = C.species[sp]; if (!S || !h || h.obra) return 0;
  const F = C.fences[h.fence] || {}, I = habInfo(s, h), cont = { ...I.count };
  for (const e of OB.aCaminhoDe(s, h.id)) cont[e.sp] = (cont[e.sp] || 0) + 1;
  for (const a of s.animals) if (a.internado && a.habOrig === h.id) cont[a.sp] = (cont[a.sp] || 0) + 1;
  for (const [k, n] of Object.entries(reserva.get(h.id) || {})) cont[k] = (cont[k] || 0) + n;
  if (!cont[sp]) {
    if (S.bioma !== h.biome) return 0;
    const B = S.barreira || {};
    if (!F.fosso && ((F.altura || 0) < (B.altura || 0) || (F.resistencia || 0) < (B.resistencia || 0))) return 0;
    if (sobeArvore(s, sp) && !F.teto && !F.fosso) return 0;
    if ((S.agua || 0) > I.water || (S.aguaFunda || 0) > I.deep) return 0;
    const ks = Object.keys(cont).filter(k => cont[k] > 0 && C.species[k]);
    const carn = ks.some(k => C.species[k].dieta === 'Carnívoro'), presa = ks.some(k => C.species[k].dieta !== 'Carnívoro');
    if ((S.dieta === 'Carnívoro' && presa) || (S.dieta !== 'Carnívoro' && carn)) return 0;
  }
  let outros = 0; for (const [k, c] of Object.entries(cont)) if (k !== sp) outros += c * (C.species[k]?.espaco || 10);
  const porEspaco = Math.floor((I.land + 0.5 * I.water - outros) / (S.espaco || 10));
  return Math.max(0, Math.min(S.social?.max || 99, porEspaco) - (cont[sp] || 0));
}
// plano dos animais dos recintos que vão sair: mudar (com destino) ou vender
export function planoAnimais(s, habIds) {
  const C = content(s), sair = new Set(habIds), out = { mudar: [], vender: [], bloqueio: '' };
  const lista = s.animals.filter(a => sair.has(a.hab) || (a.internado && sair.has(a.habOrig)));
  if (lista.some(a => a.escaped)) { out.bloqueio = 'Um animal deste recinto está fugido. Recapture antes de demolir.'; return out; }
  if (lista.some(a => a.carriedBy) || s.staff.some(st => st.task && ((st.task.type === 'transfer' && (sair.has(st.task.destHab) || lista.some(a => a.id === st.task.target))) || (st.task.modo === 'internar' && lista.some(a => a.id === st.task.target))))) {
    out.bloqueio = 'A equipe está levando um animal deste recinto (ou para ele). Espere terminar.'; return out;
  }
  const reserva = new Map(), porSp = new Map();
  for (const a of lista) { if (!porSp.has(a.sp)) porSp.set(a.sp, []); porSp.get(a.sp).push(a); }
  for (const [sp, grupo] of porSp) {
    grupo.sort((a, b) => (a.internado ? 1 : 0) - (b.internado ? 1 : 0));
    let resto = [...grupo];
    if (!C.species[sp]) { for (const a of resto) out.vender.push({ id: a.id, nome: a.name, sp, valor: 0 }); continue; }
    while (resto.length) {
      const cands = s.habitats.filter(h => !sair.has(h.id) && !h.obra).map(h => ({ h, v: vagasPara(s, h, sp, reserva), mesma: s.animals.some(a => a.hab === h.id && a.sp === sp) || OB.aCaminhoDe(s, h.id, sp).length > 0 })).filter(c => c.v > 0);
      if (!cands.length) break;
      cands.sort((a, b) => (b.mesma ? 1 : 0) - (a.mesma ? 1 : 0) || b.v - a.v);
      const { h, v } = cands[0], vao = resto.splice(0, v);
      const r = reserva.get(h.id) || {}; r[sp] = (r[sp] || 0) + vao.length; reserva.set(h.id, r);
      for (const a of vao) out.mudar.push({ id: a.id, nome: a.name, sp, para: h.id, paraNome: h.name, internado: !!a.internado });
    }
    for (const a of resto) out.vender.push({ id: a.id, nome: a.name, sp, valor: Math.round((C.species[sp]?.custo || 0) * DEVOLVE.venda) });
  }
  return out;
}

// ---------- o que sai ----------
function infoRecinto(s, h) {
  const C = content(s), oh = OB.obraDoHab(s, h), cells = ensureCells(h);
  let volta = 0;
  if (oh) volta += oh.custo || 0;
  else { volta += Math.round(habitatCostRef(s, h) * DEVOLVE.hab); for (const t of tocasDe(s, h.id)) volta += Math.round((C.estruturas?.toca?.custo || 0) * DEVOLVE.toca); }
  // obras dele (toca, ampliação, lago) e animais a caminho também voltam
  for (const o of OB.obrasDoHab(s, h.id)) if (o.tipo !== 'hab') volta += o.custo || 0;
  for (const e of OB.aCaminhoDe(s, h.id)) volta += e.custo || 0;
  const agua = cells.filter(i => s.terrain[i] === 'w');
  const extra = []; for (const o of OB.obrasDoHab(s, h.id)) if (o.tipo === 'ampliar') extra.push(...(o.cells || []));
  return { id: h.id, nome: h.name, volta, obra: !!oh, agua, cells: [...cells, ...extra], aCaminho: OB.aCaminhoDe(s, h.id).length };
}
const nomeFac = (s, f) => content(s).facilities[f.type]?.nome || f.type;

// alvo = { modo, tx, ty } ou { modo: 'area', x0, y0, x1, y1 }
export function planoDemolir(s, alvo) {
  if (!s._occ) rebuildOcc(s);
  const C = content(s), modo = alvo.modo || 'bloco', O = s._occ;
  const P = { modo, alvo, recintos: [], facs: [], obras: [], furn: [], plantas: [], caminho: [], agua: [], mudar: [], vender: [], cells: [], volta: 0, avisos: [], simples: null };
  const fim = () => {
    if (P.recintos.length) { const A = planoAnimais(s, P.recintos.map(r => r.id)); if (A.bloqueio) return R(false, A.bloqueio, P); P.mudar = A.mudar; P.vender = A.vender; }
    P.volta = P.recintos.reduce((t, r) => t + r.volta, 0) + P.facs.reduce((t, f) => t + f.volta, 0) + P.obras.reduce((t, o) => t + o.volta, 0) + P.furn.reduce((t, f) => t + f.volta, 0) + P.vender.reduce((t, v) => t + v.valor, 0);
    P.agua = [...new Set([...P.agua, ...P.recintos.flatMap(r => r.agua)])];
    P.custoAterro = OB.custoAterro(P.agua.length); P.durAterro = OB.duracaoAterro(P.agua.length);
    const n = P.recintos.length + P.facs.length + P.obras.length + P.furn.length + P.plantas.length + P.caminho.length + (P.soAgua ? P.agua.length : 0);
    if (!n && !P.simples) return R(false, modo === 'area' ? 'Nada para demolir nessa área.' : 'Nada para demolir aqui.', P);
    return R(true, BRL(P.volta), P);
  };
  const habDo = i => O.hab[i] || (O.obra[i] && OB.obraById(s, O.obra[i])?.hab) || 0;
  const addRecinto = hid => { const h = habById(s, hid); if (h && !P.recintos.some(r => r.id === hid)) { const r = infoRecinto(s, h); P.recintos.push(r); P.cells.push(...r.cells); } };
  const addFac = f => { if (P.facs.some(x => x.id === f.id)) return; const D = C.facilities[f.type]; P.facs.push({ id: f.id, nome: nomeFac(s, f), volta: Math.round((D?.custo || 0) * DEVOLVE.fac) }); P.cells.push(...facTiles(s, f)); };
  const addObra = o => { if (P.obras.some(x => x.id === o.id)) return; P.obras.push({ id: o.id, nome: o.fac ? C.facilities[o.fac.type]?.nome || o.nome : o.nome || 'Obra', tipo: o.tipo, volta: Math.round(o.custo || 0) }); P.cells.push(...OB.blocosDaObra(s, o)); };

  if (modo === 'recinto' || modo === 'predio' || modo === 'bloco') {
    const { tx, ty } = alvo; if (!inMap(tx, ty)) return R(false, 'Toque dentro do parque.', P);
    const i = idx(tx, ty);
    if (modo === 'recinto') { const hid = habDo(i); if (!hid) return R(false, 'Toque dentro de um recinto.', P); addRecinto(hid); return fim(); }
    if (modo === 'predio') {
      const ob = O.obra[i] && OB.obraById(s, O.obra[i]);
      if (ob?.tipo === 'fac') { addObra(ob); return fim(); }
      const fid = O.fac[i], f = fid && s.facilities.find(x => x.id === fid);
      if (!f) return R(false, 'Toque em um prédio (lanchonete, banheiro, loja, clínica…).', P);
      if (C.facilities[f.type]?.fixo) return R(false, 'A entrada não pode ser demolida.', P);
      if (temInternado(s, f)) return R(false, 'A clínica tem animal internado (ou a caminho). Espere a alta.', P);
      addFac(f); return fim();
    }
    // bloco: a mesma ordem de antes (obra, prédio, mobiliário, toca, planta, recinto, caminho); recinto e água ganham as regras novas
    const temFurn = s.furn.some(f => f.tx === tx && f.ty === ty);
    if (O.obra[i] || O.fac[i] || temFurn || tocaEm(s, tx, ty) || O.obj[i]) { P.simples = descreveBloco(s, tx, ty); P.cells.push(i); return fim(); }
    if (O.hab[i]) { addRecinto(O.hab[i]); return fim(); }
    if (isPathT(s.terrain[i])) { P.simples = { nome: 'Caminho', volta: 0 }; P.cells.push(i); return fim(); }
    if (s.terrain[i] === 'w') { const L = lagoLivre(s, tx, ty); P.agua = L; P.soAgua = true; P.aguaBloco = [i]; P.cells.push(...L); return fim(); }
    return R(false, 'Nada para demolir aqui.', P);
  }
  // área
  const x0 = Math.max(0, Math.min(alvo.x0, alvo.x1)), x1 = Math.min(MAP - 1, Math.max(alvo.x0, alvo.x1)), y0 = Math.max(0, Math.min(alvo.y0, alvo.y1)), y1 = Math.min(MAP - 1, Math.max(alvo.y0, alvo.y1));
  P.rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const dentro = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const inteiro = cells => cells.every(i => dentro(...cellXY(i)));
  // recintos inteiros dentro (com as ampliações em obra)
  const ficam = new Set();
  for (const h of s.habitats) {
    const cs = [...ensureCells(h), ...OB.obrasDoHab(s, h.id).filter(o => o.tipo === 'ampliar').flatMap(o => o.cells || [])];
    if (cs.some(i => dentro(...cellXY(i)))) { if (inteiro(cs)) addRecinto(h.id); else ficam.add(h.id); }
  }
  const pulou = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y); if (!inArea(s, x, y) || y >= RUA.muro) continue;
    const hid = O.hab[i]; if (hid) continue; // dentro de recinto: só sai junto com o recinto inteiro
    const ob = O.obra[i] && OB.obraById(s, O.obra[i]);
    if (ob) { if (ob.hab && ficam.has(ob.hab)) continue; if (ob.hab && P.recintos.some(r => r.id === ob.hab)) continue; if (ob.tipo === 'fac' || inteiro(OB.blocosDaObra(s, ob))) addObra(ob); continue; }
    const fid = O.fac[i];
    if (fid) { const f = s.facilities.find(q => q.id === fid); if (!f) continue; if (C.facilities[f.type]?.fixo) { pulou.add('A entrada fica.'); continue; } if (temInternado(s, f)) { pulou.add('A clínica com animal internado ficou de fora.'); continue; } addFac(f); continue; }
    for (const f of s.furn) if (f.tx === x && f.ty === y) { P.furn.push({ tx: x, ty: y, type: f.type, volta: Math.round((C.furniture?.[f.type]?.custo || 0) * DEVOLVE.furn) }); P.cells.push(i); }
    const oid = O.obj[i]; if (oid && s.objects.some(o => o.id === oid)) { P.plantas.push(oid); P.cells.push(i); }
    if (isPathT(s.terrain[i])) { P.caminho.push(i); P.cells.push(i); }
    else if (s.terrain[i] === 'w') P.agua.push(i);
  }
  P.avisos = [...pulou];
  P.cells = [...new Set(P.cells)];
  return fim();
}
function descreveBloco(s, tx, ty) {
  const C = content(s), i = idx(tx, ty), O = s._occ;
  const ob = O.obra[i] && OB.obraById(s, O.obra[i]); if (ob) return { nome: `Obra (${ob.fac ? C.facilities[ob.fac.type]?.nome : ob.nome || ob.tipo}): cancela`, volta: Math.round(ob.custo || 0) };
  const f = O.fac[i] && s.facilities.find(x => x.id === O.fac[i]); if (f) return { nome: nomeFac(s, f), volta: Math.round((C.facilities[f.type]?.custo || 0) * DEVOLVE.fac) };
  const fu = s.furn.filter(f => f.tx === tx && f.ty === ty); if (fu.length) return { nome: fu.map(f => C.furniture?.[f.type]?.nome || f.type).join(', '), volta: fu.reduce((t, f) => t + Math.round((C.furniture?.[f.type]?.custo || 0) * DEVOLVE.furn), 0) };
  if (tocaEm(s, tx, ty)) return { nome: 'Toca', volta: Math.round((C.estruturas?.toca?.custo || 0) * DEVOLVE.toca) };
  const o = s.objects.find(o => o.id === O.obj[i]); if (o) return { nome: C.plants[o.type]?.nome || 'Planta', volta: 0 };
  return { nome: '', volta: 0 };
}

// ---------- texto da prévia (para a confirmação e para os testes) ----------
export function resumoPlano(s, P) {
  const C = content(s), partes = [];
  if (P.simples) partes.push(P.simples.nome);
  if (P.recintos.length) partes.push(P.recintos.length === 1 ? P.recintos[0].nome + (P.recintos[0].obra ? ' (obra cancelada)' : '') : `${P.recintos.length} recintos`);
  if (P.facs.length) partes.push(P.facs.length === 1 ? P.facs[0].nome : `${P.facs.length} prédios`);
  if (P.obras.length) partes.push(`${P.obras.length} obra${P.obras.length > 1 ? 's' : ''} cancelada${P.obras.length > 1 ? 's' : ''}`);
  if (P.plantas.length) partes.push(`${P.plantas.length} planta${P.plantas.length > 1 ? 's' : ''}`);
  if (P.caminho.length) partes.push(`${P.caminho.length} bloco${P.caminho.length > 1 ? 's' : ''} de caminho`);
  if (P.furn.length) partes.push(`${P.furn.length} ${P.furn.length > 1 ? 'enfeites (bancos, postes, lixeiras)' : 'enfeite'}`);
  const por = (lista) => { const m = {}; for (const x of lista) m[x.sp] = (m[x.sp] || 0) + 1; return m; };
  const nomeN = (sp, n) => n === 1 ? (C.species[sp]?.nome || sp).toLowerCase() : nomePlural(s, sp).toLowerCase();
  const dest = {}; for (const m of P.mudar) { (dest[m.paraNome] ||= []).push(m); }
  const mudar = Object.entries(dest).map(([nome, l]) => `${Object.entries(por(l)).map(([sp, n]) => `${n} ${nomeN(sp, n)}`).join(' e ')} → ${nome}`);
  const vender = Object.entries(por(P.vender)).map(([sp, n]) => `${n} ${nomeN(sp, n)}`);
  return { sai: partes, mudar, vender, volta: P.volta };
}

// ---------- executar ----------
// opts.aterrar: transforma a água que sobra em obra de terraplanagem; opts.lagoTodo (modo bloco em água solta): o lago inteiro
export function executarDemolir(s, alvo, opts = {}) {
  const p = planoDemolir(s, alvo); if (!p.ok) return p;
  const P = p, C = content(s), now = opts.now ?? Date.now();
  // água solta tocada no modo Bloco: só aterrar (manter = não fazer nada)
  if (P.soAgua) {
    if (!opts.aterrar) return R(true, 'O lago ficou como estava.', { plano: P });
    return comecarAterro(s, opts.lagoTodo ? P.agua : P.aguaBloco, now, P);
  }
  if (opts.aterrar && P.agua.length && s.money + P.volta < P.custoAterro) return R(false, `Aterrar custa ${BRL(P.custoAterro)}. Dinheiro insuficiente.`, { plano: P });
  if (P.simples) { const r = demolish(s, alvo.tx, alvo.ty); return { ...r, plano: P }; }
  let volta = 0; const ganhar = v => { if (v > 0) { earn(s, 'metas', v); volta += v; } };
  // 1) animais: mudam na hora (de caminhão) ou são vendidos
  const chegou = new Map();
  for (const m of P.mudar) {
    const a = s.animals.find(x => x.id === m.id), d = habById(s, m.para); if (!a || !d) continue;
    if (a.internado) { a.habOrig = d.id; continue; }
    const g = tileToWorld(d.gateIn[0], d.gateIn[1]);
    Object.assign(a, { hab: d.id, x: g.x, z: g.z, tgt: null, wp: null, st: 'idle', stT: 2, asleep: false, toca: null, preso: false, sedated: false, sedAte: 0, cy: 0 });
    a.stress = clamp((a.stress || 0) + 0.15); a.chegou = now;
    chegou.set(d.id, (chegou.get(d.id) || 0) + 1); touch(d);
  }
  for (const [hid, n] of chegou) { const d = habById(s, hid); (s._entregas ||= []).push({ hab: hid, t: now, n }); log(s, `🚚 ${n} ${n === 1 ? 'animal foi' : 'animais foram'} de caminhão para o ${d.name}.`, 'info'); }
  for (const v of P.vender) { const a = s.animals.find(x => x.id === v.id); if (!a) continue; if (sellAnimal(s, a.id).ok) volta += v.valor; }
  // 2) obras canceladas (prédio, toca, ampliação, lago, aterro)
  for (const o of P.obras) { const r = OB.cancelarObra(s, o.id, now); if (r.ok) volta += r.valor || 0; }
  // 3) prédios
  for (const fi of P.facs) { const f = s.facilities.find(x => x.id === fi.id); if (!f) continue; s.facilities.splice(s.facilities.indexOf(f), 1); ganhar(fi.volta); }
  // 4) mobiliário, plantas e caminho
  for (const fu of P.furn) { const n = removeFurnAt(s, fu.tx, fu.ty); if (n) ganhar(fu.volta); }
  if (P.plantas.length) { const set = new Set(P.plantas); s.objects = s.objects.filter(o => !set.has(o.id)); }
  for (const i of P.caminho) { if (!isPathT(s.terrain[i])) continue; const [x, y] = cellXY(i); s.terrain[i] = 'g'; delete s.litter[i]; removeFurnAt(s, x, y); }
  // 5) recintos inteiros
  for (const r of P.recintos) { const h = habById(s, r.id); if (h) volta += removerRecinto(s, h); }
  rebuildOcc(s);
  for (const i of P.caminho) { const [x, y] = cellXY(i); reorientAround(s, x, y); }
  let obra = null;
  if (opts.aterrar && P.agua.length) { const a = comecarAterro(s, P.agua, now, P); obra = a.obra || null; }
  const res = resumoPlano(s, P);
  const msg = `Demolido: ${res.sai.join(', ') || 'nada'}.${P.mudar.length ? ` 🚚 ${P.mudar.length} ${P.mudar.length === 1 ? 'animal mudou' : 'animais mudaram'} de recinto.` : ''}${P.vender.length ? ` ${P.vender.length} ${P.vender.length === 1 ? 'vendido' : 'vendidos'}.` : ''}${volta ? ` Voltaram ${BRL(volta)}.` : ''}${obra ? ` 🚧 Terraplanagem: ${Math.round(obra.dur / 60e3)} min.` : ''}`;
  log(s, msg, 'info');
  return R(true, msg, { plano: P, volta: Math.round(volta), movidos: P.mudar.length, vendidos: P.vender.length, obra });
}
// remove o recinto inteiro (já sem animais): cerca, tocas (50%), plantas de dentro, obras e animais a caminho (100%)
function removerRecinto(s, h) {
  const C = content(s), hid = h.id, set = cellSet(h); let v = 0;
  for (const st of s.staff) if (st.inHab === hid) { st.inHab = 0; st.task = null; }
  for (const a of s.animals) if (a.toca && s.tocas.some(t => t.id === a.toca && t.hab === hid)) { a.toca = null; a.preso = false; }
  const oh = OB.obraDoHab(s, h);
  if (!oh) for (const t of tocasDe(s, hid)) v += Math.round((C.estruturas?.toca?.custo || 0) * DEVOLVE.toca);
  s.tocas = (s.tocas || []).filter(t => t.hab !== hid);
  s.objects = s.objects.filter(o => !set.has(idx(o.tx, o.ty)));
  const vl = OB.limparDoHab(s, hid); // obras dele e animais a caminho (já devolve)
  s.habitats.splice(s.habitats.indexOf(h), 1);
  s.alerts = s.alerts.filter(a => a.target !== hid || a.type === 'doenca' || a.type === 'fuga');
  v += oh ? Math.round(oh.custo || 0) : Math.round(habitatCostRef(s, h) * DEVOLVE.hab);
  if (v > 0) earn(s, 'metas', v);
  return v + vl;
}
function comecarAterro(s, cells, now, P) {
  const lista = [...new Set(cells)].filter(i => s.terrain[i] === 'w' && !s._occ.hab[i] && !s._occ.obra[i]);
  if (!lista.length) return R(false, 'Não há água para aterrar.', { plano: P });
  const custo = OB.custoAterro(lista.length);
  if (s.money < custo) return R(false, `Aterrar custa ${BRL(custo)}. Dinheiro insuficiente.`, { plano: P });
  spend(s, 'construcao', custo);
  const ob = OB.iniciarObra(s, { tipo: 'aterro', cells: lista, dur: OB.duracaoAterro(lista.length), custo, nome: 'Terraplanagem' }, now);
  return R(true, `🚧 Terraplanagem começou: ${lista.length} ${lista.length === 1 ? 'bloco' : 'blocos'}, pronta em ${Math.round(ob.dur / 60e3)} min.`, { obra: ob, plano: P });
}
