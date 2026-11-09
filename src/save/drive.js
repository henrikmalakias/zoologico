// Sincronia do save com o Google Drive do jogador (pasta oculta do app: escopo drive.appdata).
// O jogo roda 100% offline; isto só funciona quando há internet e o ID de cliente OAuth foi informado.
// Modo automático: abre o save mais recente, envia alterações a cada poucos minutos e ao sair, e pergunta em caso de conflito.
import { getPref, setPref } from './save.js';

export const CLIENT_ID_PADRAO = ''; // opcional: cole aqui o ID de cliente OAuth para já vir pronto no site
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata', NOME = 'zoologico-save.json';
const GIS = 'https://accounts.google.com/gsi/client';
// ajustes que são do aparelho (não viajam entre celular e iPad)
export const LOCAIS = ['quality', 'autoQualidade', 'mostrarFps', 'telaLigada', 'economia', 'som', 'volume', 'ambiente'];

let tok = null, tokExp = 0, tc = null, fileId = null;
const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h; };
const espera = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado.')), ms))]);

function carregaGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, err) => { const s = document.createElement('script'); s.src = GIS; s.async = true; s.onload = ok; s.onerror = () => err(new Error('Sem internet para falar com o Google.')); document.head.appendChild(s); });
}

export class DriveSync {
  constructor(game) { this.g = game; this.clientId = CLIENT_ID_PADRAO; this.on = false; this.status = ''; this.lastSync = 0; this.busy = false; this.lastHash = null; this.timer = null; }
  get configurado() { return !!this.clientId; }
  get ativo() { return this.on && this.configurado; }
  async init() {
    this.clientId = (await getPref('driveClientId', '')) || CLIENT_ID_PADRAO;
    this.on = !!(await getPref('driveOn', false)); this.lastSync = await getPref('driveLastSync', 0);
    if (this.ativo) this.status = 'Ativa. Conectando…';
    else this.status = this.configurado ? 'Desligada.' : 'Falta o ID de cliente do Google.';
    return this;
  }
  async setClientId(id) { this.clientId = (id || '').trim(); tc = null; tok = null; await setPref('driveClientId', this.clientId); if (!this.clientId) await this.desligar(); }
  // ---------- autorização ----------
  async token(interativo) {
    if (tok && Date.now() < tokExp - 60e3) return tok;
    if (!this.clientId) throw new Error('Informe o ID de cliente do Google primeiro.');
    await carregaGis();
    return espera(new Promise((ok, err) => {
      tc = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId, scope: SCOPE,
        callback: r => { if (r.error) return err(new Error(r.error_description || r.error)); tok = r.access_token; tokExp = Date.now() + (r.expires_in || 3600) * 1000; ok(tok); },
        error_callback: e => err(new Error(e?.type === 'popup_closed' ? 'Janela do Google fechada.' : e?.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela do Google.' : 'Falha ao autorizar.')),
      });
      tc.requestAccessToken({ prompt: interativo ? 'consent' : '' });
    }), interativo ? 120e3 : 9e3);
  }
  async api(url, opt = {}, tentou = false) {
    const t = await this.token(false);
    const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && !tentou) { tok = null; return this.api(url, opt, true); }
    if (!r.ok) throw new Error('Drive respondeu ' + r.status);
    return r;
  }
  async meta() {
    const q = encodeURIComponent(`name='${NOME}'`);
    const r = await (await this.api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime,appProperties)&orderBy=modifiedTime%20desc`)).json();
    const f = r.files?.[0]; if (!f) { fileId = null; return null; }
    fileId = f.id; return { id: f.id, savedAt: +(f.appProperties?.savedAt || 0) || Date.parse(f.modifiedTime) };
  }
  async baixar() { return (await this.api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).text(); }
  async enviar(texto, savedAt) {
    const meta = { name: NOME, appProperties: { savedAt: String(savedAt) } }; if (!fileId) meta.parents = ['appDataFolder'];
    const b = '----zoo' + Math.random().toString(36).slice(2), corpo = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${texto}\r\n--${b}--`;
    const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const r = await (await this.api(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: corpo })).json();
    fileId = r.id;
  }
  // ---------- ligar / desligar ----------
  async conectar() { // chamado por um toque do jogador (precisa de gesto para abrir a janela do Google)
    this.fala('Conectando ao Google…');
    try { await this.token(true); this.on = true; await setPref('driveOn', true); await this.sync('conectar', true); this.agenda(); }
    catch (e) { this.fala('Não conectou: ' + e.message); this.g.ui.toast('Drive: ' + e.message, 'ruim'); }
  }
  async desligar() { this.on = false; tok = null; await setPref('driveOn', false); clearInterval(this.timer); this.fala(this.configurado ? 'Desligada.' : 'Falta o ID de cliente do Google.'); }
  fala(t) { this.status = t; if (this.g.ui?.modal && this.g.ui.modalName) this.g.ui.renderModal?.(); }
  agenda() { clearInterval(this.timer); this.timer = setInterval(() => { if (!document.hidden) this.sync('periodico'); }, 3 * 60e3); }
  // ---------- sincronia ----------
  snap() { const st = this.g.currentSave(); return { texto: JSON.stringify(st), savedAt: st.savedAt }; }
  conteudo(texto) { return hash(texto.replace(/"savedAt":\d+/, '').replace(/"lastRealTs":\d+/, '')); }
  async marca(savedAt, texto) { this.lastHash = this.conteudo(texto); await setPref('driveBase', savedAt); this.lastSync = Date.now(); await setPref('driveLastSync', this.lastSync); }
  // aberto: true quando é a abertura do jogo (decide pelo horário do último save local, antes de simular o tempo fora)
  async sync(motivo, manual = false, localSavedAt = 0) {
    if (this.busy || !this.ativo) return; this.busy = true;
    try {
      const base = await getPref('driveBase', 0), m = await this.meta(), loc = this.snap();
      if (!m) { await this.enviar(loc.texto, loc.savedAt); await this.marca(loc.savedAt, loc.texto); this.fala('Enviado ao Drive.'); return; }
      if (m.savedAt === base) { // o Drive não mudou desde o último contato: só envia se houve alteração
        if (this.lastHash === null || this.lastHash !== this.conteudo(loc.texto) || manual) { await this.enviar(loc.texto, loc.savedAt); await this.marca(loc.savedAt, loc.texto); this.fala('Enviado ao Drive.'); }
        else this.fala('Em dia.');
        return;
      }
      if (m.savedAt < base) { await this.enviar(loc.texto, loc.savedAt); await this.marca(loc.savedAt, loc.texto); this.fala('Enviado ao Drive.'); return; }
      // o Drive tem uma versão mais nova (outro aparelho jogou)
      const semMudar = motivo === 'abrir' && base && localSavedAt && localSavedAt <= base + 2 * 60e3;
      if (semMudar) { await this.usarDrive('abrir'); return; }
      await this.conflito(m, loc);
    } catch (e) { this.fala('Sem sincronia agora: ' + e.message); if (manual) this.g.ui.toast('Drive: ' + e.message, 'ruim'); }
    finally { this.busy = false; }
  }
  async usarDrive(motivo) {
    const texto = await this.baixar(), m = await this.meta();
    await this.g.aplicaRemoto(texto, motivo);
    await this.marca(m.savedAt, texto); this.fala('Baixado do Drive.');
  }
  conflito(m, loc) {
    const f = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    this.busy = false;
    this.g.ui.askChoice(`O Drive tem um zoológico mais novo (${f(m.savedAt)}) que o deste aparelho (${f(loc.savedAt)}). Qual manter?`, [
      ['☁ Usar o do Drive', async () => { this.busy = true; try { await this.g.backup('antes-drive'); await this.usarDrive('conflito'); } catch (e) { this.fala('Falhou: ' + e.message); } finally { this.busy = false; } }],
      ['📱 Manter este aparelho', async () => { this.busy = true; try { const l = this.snap(); await this.enviar(l.texto, l.savedAt); await this.marca(l.savedAt, l.texto); this.fala('Enviado ao Drive.'); } catch (e) { this.fala('Falhou: ' + e.message); } finally { this.busy = false; } }],
      ['Decidir depois', () => this.fala('Conflito: decida em Menu > Salvar.')],
    ]);
  }
  // ao abrir o jogo: tenta reconectar sem janela; se o Google exigir toque, avisa
  async abrir(localSavedAt) {
    if (!this.ativo) return;
    try { await this.token(false); } catch (e) { this.fala('Toque em "Sincronizar agora" (Menu > Salvar) para reconectar.'); return; }
    await this.sync('abrir', false, localSavedAt); this.agenda();
  }
  // ao esconder o app: envia o que mudou (melhor esforço)
  async aoSair() { if (!this.ativo || !tok || this.busy || Date.now() >= tokExp) return; this.busy = true; try { const m = await this.meta(), base = await getPref('driveBase', 0); if (!m || m.savedAt === base) { const l = this.snap(); if (this.lastHash !== this.conteudo(l.texto)) { await this.enviar(l.texto, l.savedAt); await this.marca(l.savedAt, l.texto); } } } catch (e) {} finally { this.busy = false; } }
}
