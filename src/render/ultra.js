// Gráfico Ultra: céu 360° do Poly Haven que muda com a hora, luz do ambiente (HDRI),
// terreno com texturas reais, capim 3D com vento, água com ondas e pelo nos animais.
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MAP, TILE, HALF, CW, heightAt, AREAS, idx } from '../sim/grid.js';

const BASE = './ultra/';
export const LAYERS = ['g', 'd', 's', 'm', 'r', 'p', 'w'];
const ALIAS = { q: 'd', c: 'p', k: 'p' }; // caminhos de terra e de cimento usam a textura de terra e de pedra
const ROUGH = [0.95, 0.92, 0.9, 0.7, 0.85, 0.8, 0.6];

// ---------- carregamento ----------
const img = url => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url; });
async function arrayTexture(kind, size, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * LAYERS.length);
  const ims = await Promise.all(LAYERS.map(k => img(`${BASE}terreno/${k}_${kind}.jpg`)));
  ims.forEach((im, i) => { g.drawImage(im, 0, 0, size, size); data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4); });
  const t = new THREE.DataArrayTexture(data, size, size, LAYERS.length);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
export async function loadTerrainArrays() {
  const [cor, nor] = await Promise.all([arrayTexture('cor', 512, true), arrayTexture('nor', 512, false)]);
  return { cor, nor };
}

// ---------- terreno ----------
// textura de dados MAP x MAP: R = camada do terreno, G = 255 se fora da área liberada
export function terrainData() {
  const t = new THREE.DataTexture(new Uint8Array(MAP * MAP * 4), MAP, MAP, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
export function fillTerrainData(tex, s) {
  const a = AREAS[s.areaLevel], d = tex.image.data;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = idx(x, y), k = i * 4; d[k] = Math.max(0, LAYERS.indexOf(ALIAS[s.terrain[i]] || s.terrain[i]));
    d[k + 1] = x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1 ? 0 : 255;
  }
  tex.needsUpdate = true;
}
export function terrainMaterial(arr, data) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tCor: { value: arr.cor }, tNor: { value: arr.nor }, tData: { value: data }, uRough: { value: ROUGH } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      precision highp sampler2DArray;
      uniform sampler2DArray tCor; uniform sampler2DArray tNor; uniform sampler2D tData; uniform float uRough[7];
      varying vec3 vWP; varying vec3 vWN;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      vec4 tile(ivec2 c){ c = clamp(c, ivec2(0), ivec2(${MAP - 1})); return texelFetch(tData, c, 0); }
      vec3 gAlb; vec3 gNor; float gRgh; float gLock;
      void terr(){
        vec2 t = (vWP.xz + ${HALF.toFixed(1)}) / ${TILE.toFixed(1)} - 0.5;
        t += (vec2(vn(vWP.xz * 1.3), vn(vWP.xz * 1.3 + 17.0)) - 0.5) * 0.45; // bordas orgânicas
        vec2 i0 = floor(t); vec2 f = smoothstep(0.15, 0.85, fract(t));
        vec2 uv = vec2(vWP.x, -vWP.z) / 3.0;
        vec2 uv2 = uv * 0.37 + 0.31;
        gAlb = vec3(0.0); gNor = vec3(0.0); gRgh = 0.0; gLock = 0.0;
        for (int k = 0; k < 4; k++) {
          ivec2 o = ivec2(k & 1, k >> 1);
          float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
          if (w < 0.001) continue;
          vec4 d = tile(ivec2(i0) + o); float L = floor(d.r * 255.0 + 0.5);
          vec3 a = mix(texture(tCor, vec3(uv, L)).rgb, texture(tCor, vec3(uv2, L)).rgb, 0.35);
          gAlb += a * w; gNor += (texture(tNor, vec3(uv, L)).xyz * 2.0 - 1.0) * w;
          gRgh += uRough[int(L)] * w; gLock += d.g * w;
        }
        gAlb *= 0.88 + 0.24 * vn(vWP.xz * 0.08); // variação grande para esconder a repetição
        gAlb *= 1.0 - 0.45 * gLock;
      }`)
      .replace('#include <map_fragment>', 'terr(); diffuseColor.rgb *= gAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRgh;')
      .replace('#include <normal_fragment_maps>', `{
        vec3 N = normalize(vWN); vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x); vec3 B = cross(N, T);
        vec3 tn = normalize(vec3(gNor.xy * 1.2, max(0.2, gNor.z)));
        vec3 wn = normalize(T * tn.x - B * tn.y + N * tn.z);
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`);
  };
  return m;
}

// ---------- céu que muda com a hora ----------
// horários de cada céu (mesmo lugar fotografado em horas diferentes) e a cor/força do sol
const KEYS = [
  { k: 'noite', h: -3.5 }, { k: 'amanhecer', h: 6 }, { k: 'manha', h: 8.5 }, { k: 'meiodia', h: 12 }, { k: 'tarde', h: 15.5 },
  { k: 'porsol', h: 18 }, { k: 'crepusculo', h: 19.2 }, { k: 'noite', h: 20.5 }, { k: 'amanhecer', h: 30 },
];
const SUN = {
  amanhecer: { c: [1, 0.72, 0.48], i: 1.1, env: 0.4, exp: 0.85, fog: '#d9b48f' }, manha: { c: [1, 0.95, 0.86], i: 2.0, env: 0.5, exp: 0.88, fog: '#b9cde0' },
  meiodia: { c: [1, 0.98, 0.95], i: 2.3, env: 0.55, exp: 0.82, fog: '#c4d6e6' }, tarde: { c: [1, 0.92, 0.8], i: 2.0, env: 0.5, exp: 0.88, fog: '#c9d2dc' },
  porsol: { c: [1, 0.66, 0.42], i: 1.2, env: 0.4, exp: 0.88, fog: '#e0b28a' }, crepusculo: { c: [0.62, 0.55, 0.75], i: 0.3, env: 0.35, exp: 0.62, fog: '#6d6a86' },
  noite: { c: [0.55, 0.66, 1], i: 0.22, env: 0.25, exp: 0.42, fog: '#1d2433' },
};
const domeVS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const domeFS = hdr => `uniform sampler2D tA; uniform sampler2D tB; uniform float uMix; uniform float uRot; uniform float uGain; varying vec3 vDir;
  vec2 eq(vec3 d){ return vec2(atan(d.z, d.x) * 0.15915494 + 0.5 + uRot, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5); }
  void main(){ vec3 d = normalize(vDir); vec2 uv = eq(d); uv.x = fract(uv.x);
    vec3 c = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, uMix) * uGain;
    gl_FragColor = vec4(c, 1.0);
${hdr ? '' : '#include <colorspace_fragment>'}
}`;

export class UltraSky {
  constructor(renderer, scene, meta) {
    this.r = renderer; this.scene = scene; this.meta = meta; this.tex = {}; this.hdr = {}; this.loading = new Set();
    const mk = hdr => new THREE.ShaderMaterial({ vertexShader: domeVS, fragmentShader: domeFS(hdr), side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uRot: { value: 0 }, uGain: { value: 1 } } });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mk(false)); this.dome.renderOrder = -1; this.dome.frustumCulled = false; this.dome.visible = false;
    scene.add(this.dome);
    this.envScene = new THREE.Scene(); this.envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mk(true)); this.envScene.add(this.envDome);
    this.pm = new THREE.PMREMGenerator(renderer); this.lastEnv = -99; this.rgbe = new HDRLoader();
  }
  need(k) {
    if (this.tex[k] || this.loading.has(k)) return; this.loading.add(k);
    new THREE.TextureLoader().load(`${BASE}ceu/${k}.jpg`, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; this.tex[k] = t; this.loading.delete(k); this.lastEnv = -99; });
    // céu HDR guardado em base64 (.txt) para funcionar em qualquer hospedagem
    fetch(`${BASE}ceu/${k}_hdr.txt`).then(r => r.text()).then(b64 => {
      const bin = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([bin]));
      this.rgbe.load(url, t => { URL.revokeObjectURL(url); t.wrapS = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; this.hdr[k] = t; this.lastEnv = -99; });
    }).catch(e => console.warn('céu hdr', k, e));
  }
  // devolve a direção do sol e as cores para a hora h
  update(h, sun, hemi, fog, camPos) {
    let i = 0; const H = h;
    for (i = 0; i < KEYS.length - 1; i++) if (H >= KEYS[i].h && H < KEYS[i + 1].h) break;
    const A = KEYS[i], B = KEYS[i + 1];
    // segura o céu e faz a troca suave na última parte do intervalo
    const st = Math.max(A.h, B.h - Math.min(1.5, (B.h - A.h) * 0.45)); let m = Math.min(1, Math.max(0, (H - st) / (B.h - st)));
    m = m * m * (3 - 2 * m);
    this.need(A.k); this.need(B.k); if (m > 0) this.need(KEYS[Math.min(KEYS.length - 1, i + 2)].k);
    const ok = this.tex[A.k] && this.tex[B.k];
    // sol: nasce a leste (+x), passa pelo norte (-z) e se põe a oeste (-x)
    const az = Math.PI * Math.min(1.05, Math.max(-0.05, (h - 6) / 12));
    const ev = k => this.meta.ceu[k] ? (0.5 - this.meta.ceu[k].v) * Math.PI : 0.3;
    const elev = Math.max(0.05, ev(A.k) * (1 - m) + ev(B.k) * m);
    const night = A.k === 'noite' || (A.k === 'crepusculo' && m > 0.5);
    const dir = night ? new THREE.Vector3(-0.3, 0.9, 0.35).normalize() : new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), -Math.sin(az) * Math.cos(elev));
    const uS = this.meta.ceu.meiodia?.u ?? 0.6, rot = uS - 0.5 + az / (2 * Math.PI);
    const SA = SUN[A.k], SB = SUN[B.k], lerp = (a, b) => a + (b - a) * m;
    sun.color.setRGB(lerp(SA.c[0], SB.c[0]), lerp(SA.c[1], SB.c[1]), lerp(SA.c[2], SB.c[2]));
    sun.intensity = lerp(SA.i, SB.i); this.dir = dir;
    hemi.intensity = 0.15 + 0.25 * Math.min(1, sun.intensity / 2.5);
    if (fog) fog.color.set(SA.fog).lerp(new THREE.Color(SB.fog), m);
    this.scene.environmentIntensity = lerp(SA.env, SB.env); this.r.toneMappingExposure = lerp(SA.exp, SB.exp);
    for (const d of [this.dome, this.envDome]) { const u = d.material.uniforms; u.uMix.value = m; u.uRot.value = rot; }
    const du = this.dome.material.uniforms;
    if (ok) { du.tA.value = this.tex[A.k]; du.tB.value = this.tex[B.k]; this.dome.visible = true; this.scene.background = null; }
    this.dome.position.copy(camPos);
    // luz do ambiente: refaz o mapa de reflexos quando o céu muda o bastante
    const eu = this.envDome.material.uniforms;
    if (this.hdr[A.k] && this.hdr[B.k] && Math.abs(h - this.lastEnv) > 0.2) {
      eu.tA.value = this.hdr[A.k]; eu.tB.value = this.hdr[B.k]; eu.uGain.value = 1;
      const old = this.envRT; this.envRT = this.pm.fromScene(this.envScene, 0); this.scene.environment = this.envRT.texture; old?.dispose(); this.lastEnv = h;
    }
    return dir;
  }
  dispose() { this.pm.dispose(); this.envRT?.dispose(); for (const t of [...Object.values(this.tex), ...Object.values(this.hdr)]) t.dispose(); }
}

// ---------- água com ondas ----------
export function waterNormalTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  const h = (x, y) => { let v = 0; for (const [fx, fy, a, p] of [[3, 2, 1, 0], [5, -4, 0.6, 1.3], [-7, 6, 0.35, 2.1], [11, 9, 0.2, 0.7], [-13, -15, 0.12, 3.3]]) v += a * Math.sin(2 * Math.PI * (fx * x + fy * y) / N + p); return v; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), k = (y * N + x) * 4;
    const nx = -dx * 0.35, ny = -dy * 0.35, l = Math.hypot(nx, ny, 1);
    im.data[k] = (nx / l * 0.5 + 0.5) * 255; im.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.35, 0.35); return t;
}

// ---------- capim 3D com vento ----------
export class Grass {
  constructor(scene, cap = 28000) {
    const g = new THREE.BufferGeometry(), seg = 3, pos = [], ind = [], hgt = [];
    for (let i = 0; i <= seg; i++) { const t = i / seg, w = 0.03 * (1 - t * 0.9); pos.push(-w, t, 0, w, t, 0); hgt.push(t, t); }
    for (let i = 0; i < seg; i++) { const a = i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('hgt', new THREE.Float32BufferAttribute(hgt, 1)); g.setIndex(ind); g.computeVertexNormals();
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
    this.uTime = { value: 0 };
    this.mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float hgt; uniform float uTime; varying float vH;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float wv = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.6 + sin(uTime * 3.1 + ip.x * 0.9) * 0.25;
          transformed.z += wv * hgt * hgt * 0.18; vH = hgt;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.5, 1.0, vH);')
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };
    this.mesh = new THREE.InstancedMesh(g, this.mat, cap); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.cap = cap; this.center = null; this.sig = ''; scene.add(this.mesh);
  }
  update(s, cx, cz, dist, dt, sig) {
    this.uTime.value += dt;
    const show = dist < 70; this.mesh.visible = show; if (!show) return;
    if (this.center && Math.hypot(cx - this.center[0], cz - this.center[1]) < 6 && sig === this.sig) return;
    this.center = [cx, cz]; this.sig = sig;
    const R = 21, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const t0x = Math.floor((cx + HALF) / TILE), t0y = Math.floor((cz + HALF) / TILE), rt = Math.ceil(R / TILE);
    let n = 0, seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let ty = t0y - rt; ty <= t0y + rt && n < this.cap; ty++) for (let tx = t0x - rt; tx <= t0x + rt && n < this.cap; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) continue;
      if (ty >= 52 && ty <= 60) continue; // 1.7.3: rua da frente (muro, calçadas e asfalto)
      const i = idx(tx, ty); if (s.terrain[i] !== 'g' || s._occ.fac[i] || s._occ.obj?.[i] === -1) continue;
      const wx = tx * TILE - HALF + 1, wz = ty * TILE - HALF + 1; if (Math.hypot(wx - cx, wz - cz) > R) continue;
      seed = (i * 7919) % 2147483647 || 1; const hb = s._occ.hab[i] ? s.habitats.find(h => h.id === s._occ.hab[i]) : null, dry = hb?.biome === 'savana' ? 0.22 : hb ? -0.05 : 0.06;
      for (let k = 0; k < 64 && n < this.cap; k++) {
        const x = wx + (rnd() - 0.5) * TILE, z = wz + (rnd() - 0.5) * TILE;
        v.set(x, heightAt(s, x, z), z); e.set((rnd() - 0.5) * 0.35, rnd() * Math.PI, (rnd() - 0.5) * 0.35); q.setFromEuler(e);
        const hh = 0.1 + rnd() * rnd() * 0.28; sc.set(0.8 + rnd(), hh, 1); m.compose(v, q, sc); this.mesh.setMatrixAt(n, m);
        const y = rnd(); col.setRGB(0.3 + y * 0.12 + dry, 0.4 + y * 0.1 + dry * 0.5, 0.12 + y * 0.05, THREE.SRGBColorSpace); this.mesh.setColorAt(n, col); n++;
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------- pelo em camadas (só para modelos realistas, de perto) ----------
// Cores mais naturais nos animais do Ultra: menos saturação e contraste, sombras levantadas
export const GRADE = 'float lumG = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(lumG), diffuseColor.rgb, 0.84) * 0.88 + 0.04;';
export function gradeMaterial(m) {
  m.onBeforeCompile = s2 => { s2.fragmentShader = s2.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + GRADE); };
  m.customProgramCacheKey = () => 'grade'; return m;
}
export const FUR = { leao: { len: 0.022, den: 260 }, macaco: { len: 0.016, den: 320 }, gorila: { len: 0.026, den: 240 }, hipopotamo: null };
export const SKIN = { elefante: 0.3, rinoceronte: 0.28, hipopotamo: 0.35, tartaruga: 0.3 };
export function addFur(group, sp, S) {
  const F = S && 'pelo' in S ? S.pelo : FUR[sp]; const base = group.children[0]; if (!F || !base?.isSkinnedMesh) return;
  const L = 5, src = base.geometry, n = src.attributes.position.count, g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'skinIndex', 'skinWeight']) {
    const a = src.attributes[name], arr = new a.array.constructor(a.array.length * L);
    for (let l = 0; l < L; l++) arr.set(a.array, l * a.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  const sh = new Float32Array(n * L); for (let l = 0; l < L; l++) sh.fill((l + 1) / L, l * n, (l + 1) * n); g.setAttribute('shell', new THREE.BufferAttribute(sh, 1));
  const si = src.index.array, ix = new (n * L > 65535 ? Uint32Array : Uint16Array)(si.length * L);
  for (let l = 0; l < L; l++) for (let k = 0; k < si.length; k++) ix[l * si.length + k] = si[k] + l * n;
  g.setIndex(new THREE.BufferAttribute(ix, 1)); g.boundingSphere = src.boundingSphere;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  mat.onBeforeCompile = s2 => {
    s2.uniforms.uLen = { value: F.len }; s2.uniforms.uDen = { value: F.den };
    s2.vertexShader = s2.vertexShader.replace('#include <common>', '#include <common>\nattribute float shell; uniform float uLen; varying float vShell; varying vec3 vOP;')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + objectNormal * shell * uLen - vec3(0.0, shell * shell * uLen * 0.35, 0.0); vShell = shell; vOP = position;');
    s2.fragmentShader = s2.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uDen; varying float vShell; varying vec3 vOP;
      float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 q = vOP * uDen; vec3 c = floor(q); float r = h31(c); vec3 f = fract(q) - 0.5;
        if (length(f.xz) > 0.55 * (1.0 - vShell * 0.85) || r < vShell * 0.75) discard;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.08, vShell) * (0.9 + 0.2 * h31(c + 3.0));\n' + GRADE);
  };
  const fur = new THREE.SkinnedMesh(g, mat); fur.castShadow = false; fur.receiveShadow = true; fur.frustumCulled = false;
  fur.bind(base.skeleton, base.bindMatrix); fur.userData.fur = true; group.add(fur);
}
// relevo fino na pele (rugas) sem textura: ruído 3D na posição do modelo
export function addSkinDetail(group, sp, S) {
  const amt = S?.pele ?? SKIN[sp]; const base = group.children[0]; if (!amt || !base) return;
  const mat = base.material.clone(); base.material = mat;
  mat.onBeforeCompile = s2 => {
    s2.uniforms.uAmt = { value: amt };
    s2.vertexShader = s2.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying mat3 vNM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vNM = normalMatrix;');
    s2.fragmentShader = s2.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uAmt; varying vec3 vOP; varying mat3 vNM;
      float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float wr(vec3 p){ return abs(n3(p * 9.0) - 0.5) * 1.4 + n3(p * 18.0) * 0.15; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float e = 0.012, h0 = wr(vOP); vec3 gr = vec3(wr(vOP + vec3(e,0,0)) - h0, wr(vOP + vec3(0,e,0)) - h0, wr(vOP + vec3(0,0,e)) - h0) / e;
          vec3 gv = normalize(vNM * gr + 1e-5); float fd = 1.0 - smoothstep(4.0, 16.0, length(vViewPosition)); normal = normalize(normal - gv * uAmt * 0.12 * fd * length(gr)); }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.93 + 0.08 * n3(vOP * 8.0) * (1.0 - smoothstep(4.0, 16.0, length(vViewPosition)));\n' + GRADE);
  };
}

// ---------- folhagem: copas feitas de cartões de folhas (textura gerada) ----------
let LEAF = null;
function leafTexture(tint) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 216, y = 20 + r() * 216, a = r() * 6.28, L = 16 + r() * 22, W = L * (0.35 + r() * 0.15), v = 0.75 + r() * 0.45;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${Math.round(tint[0] * v)},${Math.round(tint[1] * v)},${Math.round(tint[2] * v)})`;
    g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -W, L / 2, 0); g.quadraticCurveTo(0, W, -L / 2, 0); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// geometria de uma copa elipsoide feita de N cartões cruzados
export function canopyGeometry(n, rx, ry, rz, seed0 = 1) {
  const pos = [], uv = [], nor = [], ind = []; let seed = seed0;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    let x, y, z; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const cx = x * rx, cy = y * ry, cz = z * rz, sz = 0.55 + r() * 0.5, a = r() * Math.PI, b = (r() - 0.5) * 1.2;
    const ux = Math.cos(a) * sz, uz = Math.sin(a) * sz, vy = Math.cos(b) * sz, vx = -Math.sin(b) * Math.sin(a) * sz, vz = Math.sin(b) * Math.cos(a) * sz;
    const nx = x, ny = y + 0.6, nz = z, nl = Math.hypot(nx, ny, nz) || 1, base = pos.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(cx + ux * su * 0.5 + vx * sv * 0.5, cy + vy * sv * 0.5, cz + uz * su * 0.5 + vz * sv * 0.5); uv.push((su + 1) / 2, (sv + 1) / 2); nor.push(nx / nl, ny / nl, nz / nl); }
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(ind); g.computeBoundingSphere(); return g;
}
const LEAF_MATS = new Map();
export function leafMaterial(hex) {
  if (!LEAF_MATS.has(hex)) { const c = new THREE.Color(hex), tint = [c.r * 255, c.g * 255, c.b * 255].map(v => Math.min(255, v * 1.15));
    LEAF_MATS.set(hex, new THREE.MeshStandardMaterial({ map: leafTexture(tint), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 })); }
  return LEAF_MATS.get(hex);
}
