// Sincronia do save com o Google Drive do jogador (pasta oculta do app: escopo drive.appdata).
// O jogo roda 100% offline; isto só funciona quando há internet e o ID de cliente OAuth foi informado.
// Modo automático: abre o save mais recente, envia alterações a cada poucos minutos e ao sair, e pergunta em caso de conflito.
import { getPref, setPref, contentHash, backupRaw } from './save.js';

export const CLIENT_ID_PADRAO = ''; // opcional: cole aqui o ID de cliente OAuth para já vir pronto no site
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata', NOME = 'zoologico-save.json';
const GIS = 'https://accounts.google.com/gsi/client';
// ajustes que são do aparelho (não viajam entre celular e iPad)
export const LOCAIS = ['quality', 'autoQualidade', 'mostrarFps', 'telaLigada', 'economia', 'som', 'volume', 'ambiente'];

let tok = null, tokExp = 0, tc = null, fileId = null;
const espera = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado.')), ms))]);

function carregaGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, err) => { const s = document.createElement('script'); s.src = GIS; s.async = true; s.onload = ok; s.onerror = () => err(new Error('Sem internet para falar com o Google.')); document.head.appendChild(s); });
}

export class DriveSync {
  constructor(game) { this.g = game; this.clientId = CLIENT_ID_PADRAO; this.on = false; this.status = ''; this.lastSync = 0; this.busy = false; this.escolhendo = 0; this.preHash = null; this.timer = null; }
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
  // Identidade de cada versão no Drive: "rev" (contador gravado por quem envia) e aparelho. Não usamos o relógio
  // dos aparelhos para decidir quem é mais novo (o relógio do iPad e o do celular podem estar diferentes).
  async meta() {
    const F = 'id,modifiedTime,appProperties,trashed,etag'; // 1.7.2d: o etag permite escrever só sobre a versão que foi lida
    if (!fileId) fileId = (await getPref('driveFileId', null)) || null;
    if (fileId) { // pelo id guardado: não depende da listagem (que pode vir atrasada/vazia)
      try { const f = await (await this.api(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${F}`)).json(); if (f && !f.trashed) return this.lerMeta(f); }
      catch (e) { if (!/ 404$/.test(e.message)) throw e; }
      fileId = null;
    }
    const q = encodeURIComponent(`name='${NOME}'`);
    const r = await (await this.api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(${F})&orderBy=modifiedTime%20desc`)).json();
    const f = r.files?.[0]; if (!f) return null;
    return this.lerMeta(f);
  }
  lerMeta(f) { fileId = f.id; setPref('driveFileId', f.id); const p = f.appProperties || {}; return { id: f.id, savedAt: +(p.savedAt || 0) || Date.parse(f.modifiedTime), rev: +(p.rev || 0), dev: p.dev || '', etag: f.etag || null }; }
  async baixar() { return (await this.api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).text(); }
  // etag = versão lida no meta(): o Drive devolve 412 se outro aparelho gravou no meio (aí o sync pergunta em vez de sobrescrever)
  async enviar(texto, savedAt, rev, etag) {
    const meta = { name: NOME, appProperties: { savedAt: String(savedAt), rev: String(rev), dev: this.dev || '' } }; if (!fileId) meta.parents = ['appDataFolder'];
    const b = '----zoo' + Math.random().toString(36).slice(2), corpo = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${texto}\r\n--${b}--`;
    const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const headers = { 'Content-Type': 'multipart/related; boundary=' + b }; if (fileId && etag) headers['If-Match'] = etag;
    const r = await (await this.api(url, { method: fileId ? 'PATCH' : 'POST', headers, body: corpo })).json();
    fileId = r.id; await setPref('driveFileId', fileId);
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
  // "base" = a versão do Drive com que este aparelho combinou por último (chave da rev) e o conteúdo dela (hash).
  // Drive mudou  = chave do Drive diferente da base (outro aparelho enviou).
  // Local mudou  = conteúdo local diferente do hash da base (este aparelho jogou desde então).
  snap() { const st = this.g.currentSave(); return { texto: JSON.stringify(st), savedAt: st.savedAt }; }
  conteudo(texto) { return contentHash(texto); }
  // o jogo chama antes de simular o tempo fora (abrir/voltar): assim "jogou desde a última sincronia" não conta o tempo simulado
  antesDeSimular(h) { this.preHash = h; }
  guardaCopia(obj) { return backupRaw('drive-substituido', obj); }
  async base() {
    const b = await getPref('driveBase', 0), key = typeof b === 'string' ? b : b ? 's' + b : '';
    return { key, hash: await getPref('driveBaseHash', null) };
  }
  async marca(m, texto) { await setPref('driveBase', chave(m)); await setPref('driveBaseHash', this.conteudo(texto)); this.lastSync = Date.now(); await setPref('driveLastSync', this.lastSync); }
  async envia(loc, m) { const rev = (m?.rev || 0) + 1; await this.enviar(loc.texto, loc.savedAt, rev, m?.etag); await this.marca({ rev }, loc.texto); this.fala('Enviado ao Drive.'); }
  async sync(motivo, manual = false, retry = false) {
    if (this.escolhendo && Date.now() - this.escolhendo > 5 * 60e3) this.escolhendo = 0; // pergunta fechada sem resposta
    if (this.busy || this.escolhendo || !this.ativo) { if (manual && this.escolhendo) this.g.ui.toast('Responda primeiro a pergunta do Drive.', 'ruim'); return; }
    this.busy = true;
    const pre = (motivo === 'abrir' || motivo === 'volta') ? this.preHash : null; this.preHash = null;
    try {
      if (!this.dev) { this.dev = await getPref('driveDev', '') || Math.random().toString(36).slice(2, 10); await setPref('driveDev', this.dev); }
      const base = await this.base(), m = await this.meta(), loc = this.snap();
      const hLocal = pre != null ? pre : this.conteudo(loc.texto);
      const localMudou = base.hash == null || hLocal !== base.hash;
      if (!m) {
        // já combinou com um save no Drive e agora ele não aparece: não cria outro arquivo sozinho
        if (base.key && !manual) { this.fala('O save não apareceu no Drive agora. Toque em "Sincronizar agora" para enviar de novo.'); return; }
        await this.envia(loc, null); return;
      }
      if (chave(m) === base.key) { // o Drive não mudou desde o último contato: só envia se este aparelho mudou
        if (localMudou || manual) await this.envia(loc, m); else this.fala('Em dia.');
        return;
      }
      // o Drive mudou (outro aparelho enviou)
      if (!localMudou) { await this.usarDrive(motivo); return; }
      if (motivo === 'periodico' || motivo === 'sair') { // no meio do jogo não abre pergunta sozinho
        this.fala('Conflito: outro aparelho também jogou. Toque em "Sincronizar agora" para escolher.');
        if (!this.avisouConflito) { this.avisouConflito = true; this.g.ui.toast('☁ Drive: outro aparelho também jogou. Escolha em Menu > Salvar.', 'ruim'); }
        return;
      }
      await this.conflito(m, loc);
    } catch (e) {
      // 412 = outro aparelho gravou entre a leitura e a escrita: recomeça a decisão com o Drive atualizado (uma vez), sem sobrescrever
      if (!retry && / 412$/.test(e.message)) { this.busy = false; return this.sync(motivo, manual, true); }
      if (/ 412$/.test(e.message)) { this.fala('O Drive mudou no meio do envio. Toque em "Sincronizar agora".'); if (manual) this.g.ui.toast('Drive: outro aparelho gravou no mesmo instante. Tente de novo.', 'ruim'); return; }
      this.fala('Sem sincronia agora: ' + e.message); if (manual) this.g.ui.toast('Drive: ' + e.message, 'ruim');
    }
    finally { this.busy = false; }
  }
  // baixa e aplica; a base marca exatamente a versão baixada (lê a identidade antes e depois do download)
  async usarDrive(motivo) {
    let m = await this.meta(), texto = null;
    for (let i = 0; i < 3; i++) {
      texto = await this.baixar(); const m2 = await this.meta();
      if (m2 && chave(m2) === chave(m)) break;
      if (i === 2) throw new Error('o save do Drive está mudando agora; tente de novo.');
      m = m2;
    }
    await this.g.aplicaRemoto(texto, motivo);
    await this.marca(m, texto); this.avisouConflito = false; this.fala('Baixado do Drive.');
  }
  conflito(m, loc) {
    const f = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    this.escolhendo = Date.now();
    const fim = () => { this.escolhendo = 0; };
    this.g.ui.askChoice(`Este aparelho e outro aparelho jogaram desde a última sincronia. Drive: salvo em ${f(m.savedAt)} (horário do outro aparelho). Este aparelho: ${f(loc.savedAt)}. Qual manter? O que for substituído fica numa cópia de segurança.`, [
      ['☁ Usar o do Drive', async () => { fim(); this.busy = true; try { await this.g.backup('antes-drive'); await this.usarDrive('conflito'); } catch (e) { this.fala('Falhou: ' + e.message); } finally { this.busy = false; } }],
      ['📱 Manter este aparelho', async () => { fim(); this.busy = true; try {
        const m2 = await this.meta(); // cópia do save do Drive antes de substituir
        if (m2) { try { await this.guardaCopia(JSON.parse(await this.baixar())); } catch (e) { throw new Error('não consegui guardar a cópia do Drive (' + e.message + ')'); } }
        await this.envia(this.snap(), m2); this.avisouConflito = false;
      } catch (e) { this.fala('Falhou: ' + e.message); } finally { this.busy = false; } }],
      ['Decidir depois', () => { fim(); this.fala('Conflito: decida em Menu > Salvar > Sincronizar agora.'); }],
    ]);
  }
  // ao abrir o jogo: tenta reconectar sem janela; se o Google exigir toque, avisa
  async abrir(hashCarregado) {
    if (!this.ativo) return;
    try { await this.token(false); } catch (e) { this.fala('Toque em "Sincronizar agora" (Menu > Salvar) para reconectar.'); return; }
    this.preHash = hashCarregado ?? null; await this.sync('abrir'); this.agenda();
  }
  // ao esconder o app: envia o que mudou (melhor esforço; nunca pergunta)
  async aoSair() { if (!this.ativo || !tok || Date.now() >= tokExp) return; return this.sync('sair'); }
}
const chave = m => m.rev ? 'r' + m.rev : 's' + m.savedAt;
