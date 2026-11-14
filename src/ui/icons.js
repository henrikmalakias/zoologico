// 1.8.1: ícones coloridos desenhados no jogo (SVG 24x24). Funcionam offline e ficam iguais em qualquer aparelho.
// Os que usam "currentColor" pegam a cor do texto do botão (controles de velocidade e câmera).
const P = {
  coin: `<circle cx="12" cy="12" r="10" fill="#f5b81c"/><circle cx="12" cy="12" r="7.3" fill="#ffd54a" stroke="#e09a12" stroke-width="1.4"/><path d="M12 7.6v8.8M14.6 9.4c-.5-.8-1.5-1.1-2.6-1.1-1.4 0-2.4.7-2.4 1.8 0 2.5 5.2 1.3 5.2 3.9 0 1.1-1.1 1.9-2.7 1.9-1.2 0-2.3-.5-2.8-1.3" fill="none" stroke="#a8650a" stroke-width="1.6" stroke-linecap="round"/>`,
  star: `<path d="M12 2.3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.2l-5.9 3.1 1.2-6.5L2.5 9.2l6.6-.9z" fill="#ffc928" stroke="#e08a00" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.2 9.6l1.9-.3" stroke="#fff3b0" stroke-width="1.6" stroke-linecap="round"/>`,
  people: `<circle cx="8.3" cy="8" r="3.3" fill="#ff8fb1"/><path d="M2.2 19.5c0-3.6 2.7-6.2 6.1-6.2s6.1 2.6 6.1 6.2z" fill="#ff5e8e"/><circle cx="16.4" cy="8.8" r="2.8" fill="#8fd3ff"/><path d="M12.6 19.5c.3-3.2 1.9-5.5 3.8-5.5 2.9 0 5.3 2.3 5.3 5.5z" fill="#3fa9f5"/>`,
  sun: `<g stroke="#ffb300" stroke-width="2" stroke-linecap="round"><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></g><circle cx="12" cy="12" r="5.4" fill="#ffd23f" stroke="#ff9f00" stroke-width="1.3"/>`,
  moon: `<path d="M15.5 3.2A9 9 0 1020.8 15 7.4 7.4 0 0115.5 3.2z" fill="#ffe9a8" stroke="#e0b84a" stroke-width="1.3" stroke-linejoin="round"/><circle cx="10" cy="11" r="1.3" fill="#e8cf7c"/><circle cx="13" cy="16" r="1" fill="#e8cf7c"/><path d="M4 4.5l.6 1.3 1.3.6-1.3.6L4 8.3l-.6-1.3-1.3-.6 1.3-.6z" fill="#fff"/>`,
  pause: `<rect x="6" y="5" width="4" height="14" rx="1.3" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.3" fill="currentColor"/>`,
  play: `<path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z" fill="currentColor"/>`,
  ff: `<path d="M3 6v12l8-6zM12 6v12l8-6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  fff: `<path d="M1.5 7v10l6-5zM8.8 7v10l6-5zM16 7v10l6-5z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`,
  skip: `<path d="M4 6v12l9-6zM13 6v12l7-6z" fill="currentColor"/><rect x="19.5" y="6" width="2.5" height="12" rx="1" fill="currentColor"/>`,
  eye: `<path d="M1.8 12S5.6 5.5 12 5.5 22.2 12 22.2 12 18.4 18.5 12 18.5 1.8 12 1.8 12z" fill="#fff" stroke="#3b2414" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="#3b2414"/><circle cx="13.2" cy="10.8" r="1.1" fill="#fff"/>`,
  map: `<path d="M2.5 5.5l6-2 7 2.5 6-2v15l-6 2-7-2.5-6 2z" fill="#f7eed6" stroke="#3b2414" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.5 3.5v15M15.5 6v15" stroke="#3b2414" stroke-width="1.4"/><path d="M5 10c2 1 3 0 5 2s4 1 6 3" stroke="#c8432b" stroke-width="1.6" fill="none" stroke-dasharray="2 1.6"/>`,
  build: `<path d="M3 20.5h18" stroke="#6b4a2b" stroke-width="2.4" stroke-linecap="round"/><rect x="4.5" y="10" width="7" height="9" rx="1" fill="#ff8a3d"/><rect x="11.5" y="13" width="8" height="6" rx="1" fill="#ffb347"/><path d="M5 10l3.5-4 3.5 4" fill="#e85d2a"/><path d="M14 4.5l6 2.2-1 2.6-6-2.2z" fill="#8a8f99"/><path d="M16.2 7.6l-1.6 5" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>`,
  clip: `<rect x="4.5" y="3.5" width="15" height="18" rx="2.5" fill="#c98b4c"/><rect x="6.5" y="6" width="11" height="13.5" rx="1.2" fill="#fffaf0"/><rect x="8.5" y="2" width="7" height="4" rx="1.4" fill="#7a8794"/><path d="M8.5 10h7M8.5 13h7M8.5 16h4" stroke="#4aa36c" stroke-width="1.7" stroke-linecap="round"/>`,
  team: `<circle cx="12" cy="7.5" r="3.4" fill="#ffd0a8"/><path d="M5.5 20c0-4 2.9-6.6 6.5-6.6s6.5 2.6 6.5 6.6z" fill="#8d5b2c"/><circle cx="5" cy="9.5" r="2.4" fill="#ffd0a8"/><path d="M.8 19c.2-2.9 1.9-4.8 4.2-4.8 1 0 1.8.3 2.5.8-.9 1.1-1.5 2.5-1.7 4z" fill="#3d8f9e"/><circle cx="19" cy="9.5" r="2.4" fill="#ffd0a8"/><path d="M23.2 19c-.2-2.9-1.9-4.8-4.2-4.8-1 0-1.8.3-2.5.8.9 1.1 1.5 2.5 1.7 4z" fill="#5c9a3f"/>`,
  target: `<circle cx="12" cy="12" r="10" fill="#e0533a"/><circle cx="12" cy="12" r="7" fill="#fff"/><circle cx="12" cy="12" r="4.2" fill="#e0533a"/><circle cx="12" cy="12" r="1.7" fill="#fff"/><path d="M12 12l8-8" stroke="#6b4a2b" stroke-width="1.8" stroke-linecap="round"/><path d="M18 3h3v3" fill="none" stroke="#5c9a3f" stroke-width="2" stroke-linecap="round"/>`,
  gear: `<path d="M10.3 2h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8L2 13.7v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8z" fill="#8a9bb0"/><circle cx="12" cy="12" r="3.6" fill="#fff"/>`,
  rotl: `<path d="M5 12a7 7 0 107-7H8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9.5 2L6 5l3.5 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  rotr: `<path d="M19 12a7 7 0 11-7-7h4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M14.5 2L18 5l-3.5 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  plus: `<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`,
  minus: `<path d="M5 12h14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`,
  up: `<path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  down: `<path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  x: `<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  // avisos
  ok: `<circle cx="12" cy="12" r="10" fill="#5c9a3f"/><path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  warn: `<path d="M12 2.5l10 17.5H2z" fill="#f2c14e" stroke="#b07a10" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 9v5" stroke="#3b2414" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.4" fill="#3b2414"/>`,
  siren: `<path d="M6 18v-6a6 6 0 0112 0v6z" fill="#e0533a" stroke="#8a2a18" stroke-width="1.4"/><rect x="3.5" y="18" width="17" height="3.5" rx="1.2" fill="#6b4320"/><path d="M9.5 11a2.5 2.5 0 012.5-2.5" stroke="#ffd0c4" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M12 1.5v2.5M3 6l2 1.6M21 6l-2 1.6" stroke="#e0533a" stroke-width="2" stroke-linecap="round"/>`,
  info: `<circle cx="12" cy="12" r="10" fill="#3d8f9e"/><circle cx="12" cy="7.4" r="1.6" fill="#fff"/><path d="M12 11v6.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  trophy: `<path d="M7 3h10v5a5 5 0 01-10 0z" fill="#ffc928" stroke="#c48a1a" stroke-width="1.3"/><path d="M7 5H3.5c0 3 1.4 4.6 3.8 4.8M17 5h3.5c0 3-1.4 4.6-3.8 4.8" fill="none" stroke="#c48a1a" stroke-width="1.6"/><path d="M10.5 13h3v4h-3z" fill="#c48a1a"/><rect x="7" y="17" width="10" height="3.5" rx="1" fill="#8d5b2c"/><path d="M9.5 5.5v3" stroke="#fff3b0" stroke-width="1.6" stroke-linecap="round"/>`,
  // alertas no mapa
  doenca: `<rect x="3" y="7" width="18" height="13" rx="2.5" fill="#fff"/><path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 10v7M8.5 13.5h7" stroke="#e0533a" stroke-width="3" stroke-linecap="round"/>`,
  fome: `<path d="M14.5 3.5c3.6 0 6 2.6 6 6 0 4.5-4.5 8.5-9.5 8.5-1.5 0-2.4-.6-3-1.4l-3.6 3.6a1.6 1.6 0 11-2.3-2.3l3.6-3.6c-.6-.7-.9-1.5-.9-2.6 0-4.5 4.4-8.2 9.7-8.2z" fill="#fff"/><path d="M13.5 6.5c2 0 3.5 1.4 3.5 3.3 0 2.6-2.6 4.8-5.3 4.8" fill="none" stroke="#e8a48a" stroke-width="2" stroke-linecap="round"/>`,
  cerca: `<rect x="2.5" y="8" width="19" height="4" rx="1" fill="#fff"/><rect x="2.5" y="14" width="19" height="4" rx="1" fill="#fff"/><path d="M5 8l3 4M10 8l3 4M15 8l3 4M5 14l3 4M10 14l3 4M15 14l3 4" stroke="#f2a900" stroke-width="2"/><path d="M4.5 5v15M19.5 5v15" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  brecha: `<path d="M3 5h7l-1.5 3L11 10l-2 3 2 2-1 4H3z" fill="#fff"/><path d="M21 5h-7l1.5 3-2.5 2 2 3-2 2 1 4h7z" fill="#fff"/><path d="M3 9.5h4M3 14h5M17 9.5h4M16 14h5" stroke="#e8a48a" stroke-width="1.4"/>`,
  portao: `<path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16z" fill="#fff"/><path d="M8 21V6h8v15" fill="#ffd9c7"/><circle cx="14" cy="13" r="1.2" fill="#e0533a"/>`,
  fuga: `<ellipse cx="12" cy="15.5" rx="5" ry="4.3" fill="#fff"/><circle cx="5.5" cy="10" r="2.2" fill="#fff"/><circle cx="9.3" cy="6" r="2.2" fill="#fff"/><circle cx="14.7" cy="6" r="2.2" fill="#fff"/><circle cx="18.5" cy="10" r="2.2" fill="#fff"/>`,
  ferido: `<rect x="2" y="8.5" width="20" height="7" rx="3.5" transform="rotate(-35 12 12)" fill="#fff"/><rect x="8.5" y="9" width="7" height="6" transform="rotate(-35 12 12)" fill="#ffd9c7"/><circle cx="11" cy="11.2" r=".9" fill="#e0533a"/><circle cx="13" cy="12.8" r=".9" fill="#e0533a"/>`,
};
export const ICON_NAMES = Object.keys(P);
export function svg(name, size = 20, cls = '') {
  return `<svg class="ic${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}
export function icon(name, size = 20, cls = '') {
  const t = document.createElement('template'); t.innerHTML = svg(name, size, cls); return t.content.firstChild;
}
