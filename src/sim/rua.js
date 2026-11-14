// 1.7.3: rua da frente — ônibus, estacionamento e o caminho a pé dos visitantes entre a rua e a Entrada.
import { RUA, TILE, HALF, MAP } from './grid.js';
import { content } from '../content/registry.js';
import { rnd } from './util.js';

export const ONIBUS_A_CADA = 20;   // min de jogo entre um ônibus e outro (7h–19h)
export const ONIBUS_PARADO = 4;    // segundos reais parado no ponto (na velocidade normal)
export const ONIBUS_VEL = 9;       // m/s
export const PCT_FAMILIA = 0.35;
export const PCT_ONIBUS = 0.45;
// ponto (em blocos, aceita fração) -> mundo
export const wp = (tx, ty) => ({ x: (tx + 0.5) * TILE - HALF, z: (ty + 0.5) * TILE - HALF });
export const FAIXA_OESTE_Z = wp(0, 55.5).z;   // ônibus e carros indo para oeste (faixa do lado do zoo)
export const FAIXA_LESTE_Z = wp(0, 57.5).z;
export const estacionamentos = s => s.facilities.filter(f => f.type === 'estacionamento');
export const vagasTotal = s => estacionamentos(s).reduce((t, f) => t + (content(s).facilities.estacionamento?.vagas || 12), 0);
export const fatorChegada = s => 1 + 0.15 * Math.min(2, estacionamentos(s).length);
export const pctCarro = s => Math.min(0.6, 0.3 * Math.min(2, estacionamentos(s).length));
// vaga i de um estacionamento (2 fileiras de 6, de frente para o corredor do meio)
export function vagaPos(f, i) {
  const col = i % 6, row = Math.floor(i / 6) % 2;
  return wp(f.tx + col, f.ty + (row ? 3.35 : 0.65));
}
const PORTAO_X = (RUA.portao[0] + RUA.portao[1]) / 2;
const CALC_N = RUA.calcN[0] + 0.5, CALC_S = RUA.calcS[1] - 0.3;
// rota a pé da origem até a frente da Entrada (pelo portão do muro); invertida para ir embora
export function rotaChegada(s, v) {
  const o = v.origem, pts = [];
  if (o.tipo === 'onibus') pts.push(wp(RUA.ponto[0], RUA.ponto[1] - 0.3), wp(RUA.ponto[0] + 1, CALC_N));
  else if (o.tipo === 'carro') { const f = s.facilities.find(f => f.id === o.est); const p = f ? vagaPos(f, o.vaga) : wp(PORTAO_X, CALC_S); pts.push(p, wp((p.x + HALF) / TILE - 0.5, f ? f.ty - 0.4 : CALC_S), wp(PORTAO_X, CALC_S), wp(PORTAO_X, RUA.rua[0] - 0.4)); }
  else pts.push(wp(o.lado < 0 ? -2 : MAP + 1, CALC_N + (o.lado < 0 ? 0.3 : -0.3)));
  pts.push(wp(PORTAO_X, CALC_N), wp(PORTAO_X, RUA.muro), wp(PORTAO_X, RUA.muro - 1));
  return pts;
}
export function sortearOrigem(s) {
  const r = rnd(s), pc = pctCarro(s), est = estacionamentos(s);
  if (est.length && r < pc) { const f = est[Math.floor(rnd(s) * est.length)]; return { tipo: 'carro', est: f.id, vaga: Math.floor(rnd(s) * (content(s).facilities.estacionamento?.vagas || 12)) }; }
  const h = (s.clock.min % 1440) / 60;
  if (h >= 7 && h < 19 && r < pc + PCT_ONIBUS * (1 - pc)) return { tipo: 'onibus' };
  return { tipo: 'pe', lado: rnd(s) < 0.5 ? -1 : 1 };
}

// ônibus: a cada 20 min de jogo, das 7h às 19h; para no ponto e solta quem estava esperando para entrar
export function updateRua(s, gameMin, ctx) {
  s.rua ||= { proxOnibus: 0 };
  const h = (s.clock.min % 1440) / 60;
  if (ctx.abstract) { s._fila = []; s._bus = null; return; }
  if (!s._bus && h >= 7 && h < 19 && s.clock.min >= (s.rua.proxOnibus || 0)) {
    s._bus = { x: HALF + 14, fase: 'chega', t: 0, v: ONIBUS_VEL };
    s.rua.proxOnibus = s.clock.min + ONIBUS_A_CADA;
  }
  const b = s._bus, dt = (ctx.realDt || 0) * (ctx.moveMul || 1);
  if (b) {
    const stopX = wp(RUA.ponto[0] - 1, 0).x;
    if (b.fase === 'chega') { const d = b.x - stopX; b.v = Math.max(1.2, Math.min(ONIBUS_VEL, d * 0.6)); b.x -= b.v * dt; if (b.x <= stopX) { b.x = stopX; b.fase = 'parado'; b.t = 0; b.v = 0; } }
    else if (b.fase === 'parado') { b.t += dt; if (b.t > 0.6 && s._fila?.length) { const v = s._fila.shift(); v.rua = rotaChegada(s, v).map(p => ({ x: p.x + v.off.x * 0.6, z: p.z })); s.visitors.push(v); } if (b.t > ONIBUS_PARADO && !s._fila?.length) b.fase = 'sai'; }
    else { b.v = Math.min(ONIBUS_VEL, b.v + 3 * dt); b.x -= b.v * dt; if (b.x < -HALF - 14) s._bus = null; }
  }
  // quem esperava o ônibus e o ônibus não veio (fim do horário): desce do último
  if (s._fila?.length && (h < 7 || h >= 19)) { for (const v of s._fila) { v.rua = rotaChegada(s, v); s.visitors.push(v); } s._fila = []; }
}
