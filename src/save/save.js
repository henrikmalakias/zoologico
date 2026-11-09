import { SCHEMA, DEFAULT_SETTINGS } from '../sim/core.js';
import { rebuildOcc, orientFacility } from '../sim/grid.js';
import { content } from '../content/registry.js';

// Migrações: cada função leva o save da versão N para N+1.
export const MIGRATIONS = {
  // v5 -> v6 (versão 1.6): mobiliário de caminho, visitantes virtuais e instalações viradas para o caminho
  5: s => { s.furn = s.furn || []; s.vstock = []; s.schemaVersion = 6; return s; },
  4: s => { const d = { quality: 'baixo', fugas: true, tranquilo: false, autoQualidade: true, mostrarFps: false, som: true, volume: 0.7, ambiente: true }; s.settings = { ...d, ...(s.settings || {}), tutorial: { passo: 99, feito: true } }; s.schemaVersion = 5; return s; },
  // v3 -> v4 (versão 1.3): fechamento mensal
  3: s => { s.fin = { pendente: { salarios: 0, manutencao: 0 }, meses: [], novo: null }; s.schemaVersion = 4; return s; },
  // v1 -> v2 (versão 1.1): sujeira nos habitats (fezes e comida espalhada) e captura em fases
  // v2 -> v3 (versão 1.2): relevo, água com profundidade, brechas, fugas animadas e transferências
  2: s => {
    const MAP = 72, CW = 73, H = new Array(CW * CW).fill(0), T = typeof s.terrain === 'string' ? s.terrain : s.terrain.join('');
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (T[y * MAP + x] === 'w') for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) H[b * CW + a] = -0.8;
    s.height = H; for (const h of s.habitats) h.breaches = []; for (const a of s.animals) { a.escaping = null; a.jy = 0; }
    s.schemaVersion = 3; return s;
  },
  1: s => { for (const h of s.habitats) { h.dirt = []; } for (const a of s.animals) { a.sedated = false; a.carriedBy = 0; } for (const st of s.staff) { st.veh = null; if (st.task?.type === 'recapture') st.task = null; } s.schemaVersion = 2; return s; },
};

export function serialize(s) {
  const json = JSON.stringify(s, (k, v) => (k.startsWith('_') || k === 'route' || k === 'visitors' || k === 'tgt' ? undefined : v));
  // alturas com 2 casas para encolher o save
  const o = JSON.parse(json); o.terrain = s.terrain.join(''); if (s.height) o.height = s.height.map(v => Math.round(v * 100) / 100); o.savedAt = Date.now();
  return o;
}
export function deserialize(o) {
  let s = typeof o === 'string' ? JSON.parse(o) : o;
  if (!s || typeof s !== 'object' || !s.schemaVersion) throw new Error('Arquivo de save inválido.');
  if (s.schemaVersion > SCHEMA) throw new Error('Este save é de uma versão mais nova do jogo. Atualize o jogo.');
  while (s.schemaVersion < SCHEMA) {
    const m = MIGRATIONS[s.schemaVersion]; if (!m) throw new Error('Sem migração para a versão ' + s.schemaVersion);
    s = m(s);
  }
  s.settings = { ...DEFAULT_SETTINGS(), ...(s.settings || {}) };
  s.terrain = typeof s.terrain === 'string' ? s.terrain.split('') : s.terrain;
  s.visitors = [];
  for (const st of s.staff) if (st.task) st.task.route = null;
  for (const a of s.animals) a.tgt = null;
  s.furn = s.furn || []; s.vstock = [];
  rebuildOcc(s);
  const C = content(s);
  for (const f of s.facilities) { const d = C.facilities[f.type]; if (d && !d.fixo && f.dir == null) f.dir = orientFacility(s, f, d); }
  return s;
}

// ---- armazenamento: IndexedDB, com localStorage e memória como reserva ----
const DB = 'zoologico', STORE = 'saves';
let mem = {};
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  });
}
async function put(key, val) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return 'idb'; }
  catch (e) { try { localStorage.setItem('zoo:' + key, JSON.stringify(val)); return 'ls'; } catch (e2) { mem[key] = val; return 'mem'; } }
}
async function get(key) {
  try { const db = await idb(); const v = await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); if (v) return v; } catch (e) {}
  try { const v = localStorage.getItem('zoo:' + key); if (v) return JSON.parse(v); } catch (e) {}
  return mem[key] || null;
}
export async function saveGame(s, slot = 'slot1') { return put(slot, serialize(s)); }
export async function loadGame(slot = 'slot1') {
  const o = await get(slot); if (!o) return null;
  if (o.schemaVersion < SCHEMA) await put('backup-schema-' + o.schemaVersion, o); // cópia antes de migrar
  return deserialize(o);
}
export async function backup(s, label) { return put('backup-' + label, serialize(s)); }
export function exportFile(s) {
  const blob = new Blob([JSON.stringify(serialize(s))], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  const d = new Date(); a.download = `zoologico-save-${d.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function importFile() {
  return new Promise((res, rej) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = () => { const f = i.files[0]; if (!f) return rej(new Error('Nenhum arquivo.')); const r = new FileReader(); r.onload = () => { try { res(deserialize(r.result)); } catch (e) { rej(e); } }; r.readAsText(f); };
    i.click();
  });
}
export async function getPref(k, d) { const v = await get('pref-' + k); return v ?? d; }
export async function setPref(k, v) { return put('pref-' + k, v); }

// cache de modelos gerados (só IndexedDB; se não houver, gera de novo)
export async function cacheGet(k) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get('modelo-' + k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function cacheSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, 'modelo-' + k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
