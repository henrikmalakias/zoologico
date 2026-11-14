import { buildMesh } from './sdf.js';
self.onmessage = e => {
  const { key, spec, variant, ultra } = e.data;
  try { const m = buildMesh(spec, variant, { ultra }); self.postMessage({ key, m }, [m.position.buffer, m.normal.buffer, m.color.buffer, m.skinIndex.buffer, m.skinWeight.buffer, m.index.buffer, ...(m.pelo ? [m.pelo.buffer] : [])]); }
  catch (err) { self.postMessage({ key, error: String(err) }); }
};
