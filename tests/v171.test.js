// 1.7.1 (refeito na correção de bugs da 1.7.2): lógica da sincronia com o Drive (com Drive falso)
// A decisão "quem mudou" usa a rev gravada no Drive e o conteúdo, nunca o relógio dos aparelhos.
import { DriveSync } from '../src/save/drive.js';
import { setPref, getPref, contentHash } from '../src/save/save.js';
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FALHOU:', n); } };
const espera = () => new Promise(r => setTimeout(r, 20));
async function limpa() { await setPref('driveBase', 0); await setPref('driveBaseHash', null); await setPref('driveFileId', null); }
function falso(remoto) { // remoto: {texto, savedAt, rev} | null
  const log = [], toasts = [], choices = [];
  const g = { ui: { toast: (m) => toasts.push(m), askChoice: (q, o) => choices.push(o), modal: null }, state: { n: 1 },
    currentSave() { return { savedAt: g.agora, n: g.state.n }; }, backup: async () => { log.push('backup'); },
    aplicaRemoto: async (tx) => { log.push('baixou'); g.state.n = JSON.parse(tx).n; } };
  g.agora = 1000; const d = new DriveSync(g); d.clientId = 'x'; d.on = true;
  const f = { g, d, log, choices, toasts, mudaNoMeio: null, get remoto() { return remoto; }, set remoto(v) { remoto = v; } };
  d.meta = async () => remoto ? { id: 'f', savedAt: remoto.savedAt, rev: remoto.rev || 0 } : null;
  d.baixar = async () => { const tx = remoto.texto; if (f.mudaNoMeio) { f.mudaNoMeio(); f.mudaNoMeio = null; } return tx; };
  d.enviar = async (tx, sa, rev) => { log.push('enviou'); remoto = { texto: tx, savedAt: sa, rev }; };
  d.guardaCopia = async (o) => { log.push('copia:' + o.n); };
  return f;
}
const txt = (n, savedAt) => JSON.stringify({ savedAt, n });
// 1) Drive vazio: envia (rev 1)
{ await limpa(); const f = falso(null); await f.d.sync('abrir'); t('envia quando vazio', f.log[0] === 'enviou' && f.remoto.rev === 1); t('guarda base', (await getPref('driveBase', 0)) === 'r1');
  f.log.length = 0; await f.d.sync('periodico'); t('não reenvia sem mudança', f.log.length === 0);
  f.g.state.n = 2; f.g.agora = 2000; await f.d.sync('periodico'); t('envia mudança (rev 2)', f.log[0] === 'enviou' && f.remoto.rev === 2); }
// 2) outro aparelho mudou e este não jogou: baixa sozinho ao abrir
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(7, 5000), savedAt: 5000, rev: 5 }); f.d.antesDeSimular(contentHash(txt(1, 999)));
  await f.d.sync('abrir'); t('baixa o mais novo ao abrir', f.log[0] === 'baixou' && f.g.state.n === 7); t('base = rev baixada', (await getPref('driveBase', 0)) === 'r5'); }
// 3) os dois mudaram: pergunta; "manter" guarda cópia do Drive e envia por cima com rev seguinte
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(7, 5000), savedAt: 5000, rev: 5 }); f.g.state.n = 3;
  await f.d.sync('abrir'); t('conflito pergunta', f.choices.length === 1 && f.log.length === 0);
  await f.d.sync('manual', true); t('não abre 2ª pergunta enquanto escolhe', f.choices.length === 1);
  await f.choices[0][1][1](); t('manter este aparelho envia rev 6', f.log.includes('enviou') && f.remoto.rev === 6);
  t('cópia do Drive guardada antes de enviar', f.log.indexOf('copia:7') >= 0 && f.log.indexOf('copia:7') < f.log.indexOf('enviou')); }
// 4) B01: relógio do outro aparelho atrasado (savedAt menor que o daqui) não faz este sobrescrever
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(8, 10), savedAt: 10, rev: 5 }); f.g.state.n = 3; f.g.agora = 99999;
  await f.d.sync('abrir'); t('relógio atrasado: pergunta, não envia', f.choices.length === 1 && !f.log.includes('enviou')); }
// 5) B03: conflito durante o jogo não abre pergunta sozinho
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(8, 10), savedAt: 10, rev: 5 }); f.g.state.n = 3;
  await f.d.sync('periodico'); t('periódico não abre diálogo', f.choices.length === 0 && f.log.length === 0 && f.toasts.length === 1);
  await f.d.sync('periodico'); t('avisa uma vez só', f.toasts.length === 1);
  await f.d.sync('sair'); t('ao sair não envia por cima', f.log.length === 0); }
// 6) B02: já sincronizou e o Drive "sumiu" na listagem: não cria outro arquivo sozinho
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso(null); f.g.state.n = 3; await f.d.sync('periodico'); t('não cria duplicado', f.log.length === 0);
  await f.d.sync('manual', true); t('manual envia', f.log[0] === 'enviou'); }
// 7) B04: o Drive muda durante o download: baixa de novo e marca a versão certa
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(7, 5000), savedAt: 5000, rev: 5 }); f.d.antesDeSimular(contentHash(txt(1, 1)));
  f.mudaNoMeio = () => { f.remoto = { texto: txt(9, 6000), savedAt: 6000, rev: 6 }; };
  await f.d.sync('volta'); t('baixou a versão final', f.g.state.n === 9 && (await getPref('driveBase', 0)) === 'r6'); }
// 8) B05: jogou 1 minuto desde a última sincronia: pergunta em vez de descartar
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(7, 5000), savedAt: 5000, rev: 5 }); f.d.antesDeSimular(contentHash(txt(2, 1060)));
  await f.d.sync('abrir'); t('mudança pequena não é descartada', f.choices.length === 1 && !f.log.includes('baixou')); }
// 9) conflito: usar o do Drive (com cópia local antes)
{ await limpa(); await setPref('driveBase', 'r4'); await setPref('driveBaseHash', contentHash(txt(1, 0)));
  const f = falso({ texto: txt(9, 6000), savedAt: 6000, rev: 6 }); f.g.state.n = 5; await f.d.sync('manual', true);
  await f.choices[0][0][1](); await espera(); t('usar Drive: backup e baixa', f.log[0] === 'backup' && f.log.includes('baixou') && f.g.state.n === 9); }
// 10) save antigo (base = número, sem rev): continua funcionando
{ await limpa(); await setPref('driveBase', 1000); const f = falso({ texto: txt(1, 1000), savedAt: 1000, rev: 0 }); f.g.state.n = 2;
  await f.d.sync('periodico'); t('base antiga reconhecida: envia, sem conflito', f.log[0] === 'enviou' && f.choices.length === 0 && f.remoto.rev === 1); }
// 11) desligado: não faz nada
{ const f = falso(null); f.d.on = false; await f.d.sync('abrir'); t('desligado não envia', f.log.length === 0); }
console.log(`v171: ${ok} ok, ${bad} falhas`); if (bad) process.exit(1);
