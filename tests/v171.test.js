// 1.7.1: lógica da sincronia com o Drive (com Drive falso) e consistência de save
import { DriveSync } from '../src/save/drive.js';
import { setPref, getPref } from '../src/save/save.js';
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FALHOU:', n); } };
function falso(remoto) { // remoto: {texto, savedAt} | null
  const log = [], toasts = [], choices = [];
  const g = { ui: { toast: (m) => toasts.push(m), askChoice: (q, o) => choices.push(o), modal: null }, state: { n: 1 }, currentSave() { return { savedAt: g.agora, n: g.state.n }; }, backup: async () => {}, aplicaRemoto: async (tx) => { log.push('baixou'); g.state.n = JSON.parse(tx).n; } };
  g.agora = 1000; const d = new DriveSync(g); d.clientId = 'x'; d.on = true;
  d.meta = async () => remoto ? { id: 'f', savedAt: remoto.savedAt } : null;
  d.baixar = async () => remoto.texto; d.enviar = async (tx, sa) => { log.push('enviou'); remoto = { texto: tx, savedAt: sa }; };
  return { g, d, log, choices, get remoto() { return remoto; } };
}
// 1) Drive vazio: envia
{ await setPref('driveBase', 0); const f = falso(null); await f.d.sync('abrir'); t('envia quando vazio', f.log[0] === 'enviou' && f.remoto.savedAt === 1000); t('guarda base', (await getPref('driveBase', 0)) === 1000); 
  // 2) sem mudanças: não reenvia
  f.log.length = 0; await f.d.sync('periodico'); t('não reenvia sem mudança', f.log.length === 0);
  // 3) mudou localmente: envia
  f.g.state.n = 2; f.g.agora = 2000; await f.d.sync('periodico'); t('envia mudança', f.log[0] === 'enviou' && f.remoto.savedAt === 2000); }
// 4) outro aparelho mudou e este não jogou: baixa sozinho ao abrir
{ await setPref('driveBase', 1000); const f = falso({ texto: JSON.stringify({ n: 7, savedAt: 5000 }), savedAt: 5000 }); await f.d.sync('abrir', false, 1000 + 30e3); t('baixa o mais novo ao abrir', f.log[0] === 'baixou' && f.g.state.n === 7); t('base atualizada', (await getPref('driveBase', 0)) === 5000); }
// 5) os dois mudaram: pergunta (não sobrescreve)
{ await setPref('driveBase', 1000); const f = falso({ texto: JSON.stringify({ n: 7, savedAt: 5000 }), savedAt: 5000 }); await f.d.sync('abrir', false, 1000 + 20 * 60e3); t('conflito pergunta', f.choices.length === 1 && f.log.length === 0);
  await f.choices[0][1][1](); t('manter este aparelho envia', f.log[0] === 'enviou'); }
// 6) conflito: usar o do Drive
{ await setPref('driveBase', 1000); const f = falso({ texto: JSON.stringify({ n: 9, savedAt: 6000 }), savedAt: 6000 }); await f.d.sync('volta'); await f.choices[0][0][1](); await new Promise(r => setTimeout(r, 20)); t('usar Drive baixa', f.log.includes('baixou') && f.g.state.n === 9); }
// 7) desligado: não faz nada
{ const f = falso(null); f.d.on = false; await f.d.sync('abrir'); t('desligado não envia', f.log.length === 0); }
console.log(`v171: ${ok} ok, ${bad} falhas`); if (bad) process.exit(1);
