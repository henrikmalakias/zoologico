// Clínica veterinária (1.7.2c): internação dos casos graves. Cada clínica tem vagas (2 no jogo base); pode haver várias.
// Animal internado: a.internado = id da clínica, a.habOrig = habitat de onde veio, a.hab = 0 (fora de todo habitat),
// a.intAte = minuto do jogo da alta. Na alta ele volta ao portão de dentro do habitat de origem.
import { content, papel } from '../content/registry.js';
import { clamp, log } from './util.js';
import { tileToWorld, accessTile } from './grid.js';
import { spend } from './staff.js';

export const GRAVE = 0.4; // saúde abaixo disto: caso grave (internação); a partir disto: remédio por dardo
export const isClinica = (s, f) => f.type === 'clinica' || papel(content(s), f.type) === 'clinica';
export const clinicas = s => s.facilities.filter(f => isClinica(s, f));
export const internados = (s, f) => s.animals.filter(a => a.internado === f.id);
export const capClinica = (s, f) => content(s).facilities[f.type]?.vagas ?? 2;
// vagas livres: conta quem já está internado e quem está a caminho (veterinário com a tarefa de internar)
export function vagasClinica(s, f) {
  const indo = s.staff.filter(st => st.task?.type === 'treat' && st.task.modo === 'internar' && st.task.clinica === f.id).length;
  return Math.max(0, capClinica(s, f) - internados(s, f).length - indo);
}
export const modoTratamento = a => (a.escaped || a.health >= GRAVE ? 'dardo' : 'internar');
export function centroClinica(f) { return tileToWorld(f.tx + 1, f.ty + 1); }
// clínica de destino: a escolhida (se tiver vaga) ou a mais perto do animal com vaga
export function clinicaPara(s, a, pref) {
  const L = clinicas(s).filter(f => vagasClinica(s, f) > 0); if (!L.length) return null;
  const p = L.find(f => f.id === pref); if (p) return p;
  return L.sort((x, y) => Math.hypot(centroClinica(x).x - a.x, centroClinica(x).z - a.z) - Math.hypot(centroClinica(y).x - a.x, centroClinica(y).z - a.z))[0];
}
// o que acontece ao tratar este animal agora (para o alerta, o despacho e o subgerente)
export function tratamento(s, a, pref) {
  if (!a) return { ok: false, msg: 'Animal não encontrado.' };
  if (a.internado) return { ok: false, msg: `${a.name} já está internado(a).` };
  const modo = modoTratamento(a);
  if (modo === 'dardo') return { ok: true, modo };
  if (!clinicas(s).length) return { ok: false, modo, semClinica: true, msg: `Caso grave (saúde ${Math.round(a.health * 100)}%): precisa de internação. Construa uma Clínica veterinária em Construir > Instalações.` };
  const f = clinicaPara(s, a, pref);
  if (!f) return { ok: false, modo, semVaga: true, msg: `Caso grave: todas as clínicas estão cheias. Construa outra Clínica veterinária ou espere uma alta.` };
  return { ok: true, modo, clinica: f };
}
// dias de internação conforme a saúde na chegada: 1 a 3
export const diasInternacao = a => (a.health < 0.15 ? 3 : a.health < 0.28 ? 2 : 1);
export function internar(s, a, f) {
  const dias = diasInternacao(a), c = centroClinica(f);
  Object.assign(a, { carriedBy: 0, sedated: false, sedAte: 0, sick: false, habOrig: a.hab, hab: 0, internado: f.id, intAte: s.clock.min + dias * 1440, intDias: dias,
    x: c.x, z: c.z, st: 'idle', stT: 1, tgt: null, wp: null, toca: null, tree: null, preso: false, guard: false, cy: 0, jy: 0, asleep: false });
  spend(s, 'comida', 250 * dias);
  log(s, `${a.name} foi internado(a) na ${content(s).facilities[f.type]?.nome || 'clínica'} por ${dias} dia${dias > 1 ? 's' : ''} de jogo.`, 'info');
}
// a cada passo, para quem está internado: bem cuidado, sem fome nem sede, recuperando; na data marcada, alta
export function tickInternado(s, a, S, gameMin) {
  const hrs = gameMin / 60;
  a.hunger = Math.min(a.hunger, 0.15); a.thirst = Math.min(a.thirst, 0.15); a.sick = false;
  a.health = clamp(a.health + 0.03 * hrs); a.stress = clamp(a.stress + (0.3 - a.stress) * Math.min(1, hrs * 0.5));
  a.energy = clamp(a.energy + 0.05 * hrs); a.age += gameMin / 1440;
  if (!s.facilities.some(f => f.id === a.internado)) a.intAte = Math.min(a.intAte || 0, s.clock.min); // clínica sumiu: alta agora
  if (s.clock.min >= (a.intAte || 0)) alta(s, a, S);
}
export function alta(s, a, S) {
  const h = s.habitats.find(x => x.id === a.habOrig) || s.habitats.find(x => x.biome === S?.bioma) || s.habitats[0];
  if (!h) { if (!a._semHab) log(s, `${a.name} recebeu alta, mas não há habitat para voltar. Construa um habitat.`, 'ruim'); a._semHab = true; a.intAte = s.clock.min + 1440; return; }
  const p = tileToWorld(h.gateIn[0], h.gateIn[1]);
  Object.assign(a, { hab: h.id, internado: null, habOrig: null, intAte: 0, intDias: 0, x: p.x, z: p.z, st: 'idle', stT: 2, tgt: null, wp: null, health: Math.max(a.health, 0.85), sick: false });
  a.stress = clamp(a.stress + 0.1);
  log(s, `${a.name} recebeu alta e voltou ao ${h.name}.`, 'bom');
}
// ponto onde o veículo para (lado do caminho)
export function portaClinica(s, f) { const t = accessTile(s, f) || [f.tx - 1, f.ty]; return tileToWorld(t[0], t[1]); }
