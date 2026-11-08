import { readFileSync } from 'node:fs';
import { buildMesh } from '../src/render/sdf.js';
for (const [k, v] of [['leao', 'M'], ['leao', 'F'], ['zebra', 'F'], ['elefante', 'F'], ['girafa', 'F'], ['macaco', 'F'], ['humano', 'tratador'], ['humano', 'veterinario']]) {
  const spec = JSON.parse(readFileSync(`src/content/modelos/${k}.json`));
  const t = performance.now(); const m = buildMesh(spec, v);
  console.log(k, v, Math.round(performance.now() - t) + 'ms', m.vertices, 'vértices', m.triangulos, 'triângulos');
}
