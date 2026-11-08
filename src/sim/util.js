export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export function rnd(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = (s, a) => a[Math.floor(rnd(s) * a.length)];
export const uid = s => ++s.nextId;
export function log(s, msg, kind = 'info') {
  s.log.push({ t: Math.floor(s.clock.min), msg, kind });
  if (s.log.length > 300) s.log.shift();
  if (s._events) s._events.push({ msg, kind });
  if (kind === 'perigo' && s._ctx) s._ctx.critical = msg;
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const money = v => (v < 0 ? '-' : '') + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');
export function fmtClock(min) {
  const d = Math.floor(min / 1440) + 1, m = Math.floor(min % 1440);
  return `Dia ${d} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export const hourOf = min => (min % 1440) / 60;
