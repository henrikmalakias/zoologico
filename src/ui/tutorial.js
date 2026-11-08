// Tutorial guiado: um balão com o próximo passo e uma seta/realce apontando onde tocar.
// O progresso fica salvo em s.settings.tutorial; dá para pular e refazer pelo Menu > Ajuda.
import { habInfo } from '../sim/animals.js';

const btnText = (root, txt) => [...root.querySelectorAll('button')].find(b => b.textContent.includes(txt));
const firstHab = s => s.habitats[0];

export const PASSOS = [
  { id: 'mover', txt: 'Arraste um dedo no mapa para mover a câmera.', alvo: () => 'mapa', ok: (s, T) => T.gestos.pan, pular: true },
  { id: 'zoom', txt: 'Junte ou afaste dois dedos (pinça) para aproximar e afastar. Toque duas vezes num ponto para chegar mais perto.', alvo: () => 'mapa', ok: (s, T) => T.gestos.zoom || T.gestos.doubletap, pular: true },
  { id: 'girar', txt: 'Para girar e inclinar a câmera use estes botões, ou dois dedos: girando para rodar e arrastando para cima/baixo para inclinar. A bússola volta para o norte.', alvo: ui => ui.el.camPad, ok: (s, T) => T.gestos.rotate || T.gestos.tilt || T.gestos.botao, pular: true },
  { id: 'construir', txt: 'Toque em Construir.', alvo: ui => ui.el.bBuild, ok: (s, T, ui) => !ui.el.drawer.classList.contains('hidden') },
  { id: 'habitat', txt: 'Na aba Habitat, escolha Savana e Cerca de ferro. Depois arraste no mapa, perto do caminho, para desenhar o recinto (mín. 4 x 4) e toque em Confirmar.', alvo: ui => btnText(ui.el.drawer, 'Habitat') || ui.el.drawer, ok: (s, T) => s.habitats.length > T.base.habs, abreObra: 'habitat' },
  { id: 'plantas', txt: 'Agora toque dentro do habitat para plantar. Coloque pelo menos 2 plantas da savana (acácia, capim alto…).', alvo: ui => btnText(ui.el.drawer, 'Plantas') || ui.el.drawer, ok: s => { const h = firstHab(s); return h && (habInfo(s, h).plants[h.biome] || 0) >= 2; }, abreObra: 'planta' },
  { id: 'animais', txt: 'Abra a aba Animais, escolha Zebra e toque dentro do habitat 3 vezes. Zebras vivem em grupo!', alvo: ui => btnText(ui.el.drawer, 'Animais') || ui.el.drawer, ok: s => s.animals.length >= 3, abreObra: 'animal' },
  { id: 'concluir', txt: 'Toque em ✔ Concluir para sair do modo construção.', alvo: ui => btnText(ui.el.drawer, 'Concluir') || ui.el.bBuild, ok: (s, T, ui) => ui.el.drawer.classList.contains('hidden') },
  { id: 'equipe', txt: 'Toque em Equipe, abra Currículos e contrate um tratador (ele alimenta e limpa).', alvo: ui => ui.modalName === 'equipe' ? btnText(ui.modal, 'Currículos') || ui.el.bEq : ui.el.bEq, ok: s => s.staff.length > 0 },
  { id: 'lanche', txt: 'Construir > Instalações: escolha Lanchonete e toque ao lado do caminho. Visitantes com fome gastam dinheiro nela.', alvo: ui => ui.el.drawer.classList.contains('hidden') ? ui.el.bBuild : btnText(ui.el.drawer, 'Instalações') || ui.el.drawer, ok: s => s.facilities.some(f => f.type === 'lanchonete'), abreObra: 'inst' },
  { id: 'sugestoes', txt: 'Saia da construção e toque no seu habitat. Veja as 💡 Sugestões: cada uma tem um botão para resolver.', alvo: () => 'mapa', ok: (s, T, ui) => ui.sel?.kind === 'hab' },
  { id: 'fim', txt: 'Pronto, gerente! Use 📖 Zoopédia (em Gerência) para conhecer as espécies e 🎯 Metas para ganhar prêmios. Bom jogo!', alvo: () => null, ok: () => false, fim: true },
];

export class Tutorial {
  constructor(ui) {
    this.ui = ui; this.gestos = {}; this.base = { habs: 0 };
    this.ring = document.createElement('div'); this.ring.className = 'tut-ring hidden';
    this.arrow = document.createElement('div'); this.arrow.className = 'tut-arrow hidden'; this.arrow.textContent = '👇';
    this.box = document.createElement('div'); this.box.className = 'tut-box hidden';
    ui.root.append(this.ring, this.arrow, this.box);
    this.cur = -1;
  }
  get T() { return this.ui.s.settings.tutorial || (this.ui.s.settings.tutorial = { passo: 0, feito: false }); }
  gesto(k) { this.gestos[k] = true; }
  restart() { const T = this.T; T.passo = 0; T.feito = false; this.gestos = {}; this.cur = -1; this.base.habs = this.ui.s.habitats.length; }
  skip() { const T = this.T; T.feito = true; this.hide(); }
  hide() { for (const e of [this.ring, this.arrow, this.box]) e.classList.add('hidden'); }
  render(P, i) {
    const b = this.box; b.replaceChildren();
    const top = document.createElement('div'); top.className = 'tut-top'; top.textContent = P.fim ? '🎉 Tutorial' : `Tutorial · passo ${i + 1} de ${PASSOS.length - 1}`;
    const p = document.createElement('div'); p.textContent = P.txt;
    const row = document.createElement('div'); row.className = 'tut-row';
    const mk = (t, cls, fn) => { const x = document.createElement('button'); x.className = 'btn sm ' + cls; x.textContent = t; x.onclick = fn; row.append(x); };
    if (P.fim) mk('Concluir', '', () => this.skip());
    else { mk('Pular tutorial', 'sec', () => this.ui.askConfirm('Pular o tutorial? Dá para refazer em Menu > Ajuda.', () => this.skip())); if (P.pular) mk('Próximo ›', '', () => this.next()); }
    b.append(top, p, row); b.classList.remove('hidden');
  }
  next() { const T = this.T; T.passo++; this.gestos = {}; if (T.passo >= PASSOS.length) this.skip(); }
  tick() {
    const ui = this.ui, s = ui.s, T = this.T;
    if (T.feito || ui.g.live) return this.hide();
    const P = PASSOS[Math.min(T.passo, PASSOS.length - 1)];
    if (this.cur !== T.passo) { this.cur = T.passo; if (P.id === 'habitat') this.base.habs = s.habitats.length; this.render(P, T.passo); }
    if (!P.fim && P.ok(s, this, ui)) { this.next(); ui.sound?.good(); return; }
    // modal aberto: o balão some, exceto no passo da equipe
    const modalOpen = !!ui.modal && !(P.id === 'equipe' && ui.modalName === 'equipe');
    this.box.classList.toggle('hidden', modalOpen);
    let el = P.alvo(ui);
    if (P.abreObra && !ui.el.drawer.classList.contains('hidden') && ui.cat === P.abreObra) el = null; // já está na aba certa: não cobre o mapa
    const show = el && el !== 'mapa' && !modalOpen ? el : null;
    if (!show || !show.isConnected || !show.offsetParent) { this.ring.classList.add('hidden'); this.arrow.classList.add('hidden'); this.place(null); return; }
    const r = show.getBoundingClientRect();
    Object.assign(this.ring.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' });
    const below = r.top < 150; this.arrow.textContent = below ? '👆' : '👇';
    Object.assign(this.arrow.style, { left: r.left + r.width / 2 + 'px', top: (below ? r.bottom + 4 : r.top - 40) + 'px' });
    this.ring.classList.remove('hidden'); this.arrow.classList.remove('hidden');
    this.place(r);
  }
  // balão longe do alvo: em cima se o alvo está embaixo, e vice-versa
  place(r) {
    const b = this.box.style, drawerOpen = !this.ui.el.drawer.classList.contains('hidden');
    const atTop = drawerOpen || !r || r.top > innerHeight * 0.45;
    const t0 = parseInt(this.ui.el.camPad.style.top) || 140, undo = !this.ui.el.undo.classList.contains('hidden');
    b.top = atTop ? (t0 + (undo ? 46 : 0)) + 'px' : 'auto'; b.bottom = atTop ? 'auto' : 'calc(env(safe-area-inset-bottom) + 84px)';
  }
}
