import * as THREE from 'three';
import { Kit, buildAnimal, animateAnimal, buildPerson, buildPlant, buildFacility, buildFurn, furnParts, groupParts, mergeStatic, mergeRig, buildVehicle, buildTool, buildCones } from './models.js';
import { ModelLibrary, animateSDFAnimal, animateSDFHuman } from './library.js';
import { instance as sdfInstance } from './sdfThree.js';
let LIB = null; export const library = () => (LIB ||= new ModelLibrary());
import { content } from '../content/registry.js';
import { MAP, TILE, HALF, idx, inMap, tileToWorld, AREAS, CW, heightAt, walkY, WATER_Y, bridgeTiles, isPathT, isPath, DIR_ROT } from '../sim/grid.js';
import { edges } from '../sim/habshape.js';
import { hourOf } from '../sim/util.js';
import { UltraSky, loadTerrainArrays, terrainData, fillTerrainData, terrainMaterial, waterNormalTexture, Grass, addFur, addSkinDetail, gradeMaterial } from './ultra.js';

const C3 = c => new THREE.Color(c);
const freeMerged = o => o.traverse(m => { if (m.userData?.merged) m.geometry.dispose(); });
// pedras do muro (clara, para ser tingida pela cor do desgaste)
const stoneWall = () => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 6; r++) { const y = r * 21.3, off = r % 2 ? 0 : 32; for (let x = -64; x < 128; x += 64) { const v = 205 + ((r * 7 + x) % 5) * 9; g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.fillRect(x + off + 2, y + 2, 60, 18); } }
  g.strokeStyle = 'rgba(70,60,48,0.35)'; g.lineWidth = 2; for (let r = 0; r <= 6; r++) { g.beginPath(); g.moveTo(0, r * 21.3); g.lineTo(128, r * 21.3); g.stroke(); } return c; };
const SKY = { night: C3('#0d1a33'), dawn: C3('#e9a36a'), day: C3('#8fc6ea') };
const VCOLS = ['#d64545', '#3a7bd5', '#f2c230', '#4caf50', '#9c27b0', '#ff8a3d', '#e0e0e0', '#26a69a'];

export class World {
  constructor(container, quality) { this.container = container; this.build(quality); }
  build(q) {
    this.q = q; this.hi = q !== 'baixo'; this.ultra = q === 'ultra'; this.kit = new Kit(q);
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.hi, powerPreference: this.hi ? 'high-performance' : 'low-power' });
    r.setPixelRatio(this.pixelRatio() * (this.pxScale ?? 1));
    r.setSize(this.container.clientWidth, this.container.clientHeight);
    if (this.hi) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.ultra ? 0.92 : 1.05; }
    this.container.prepend(r.domElement); r.domElement.className = 'gl';
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.3, this.ultra ? 900 : 600);
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5a6b3a', 0.9); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.0); sc.add(this.sun); sc.add(this.sun.target);
    if (this.hi) {
      const s = this.sun.shadow; this.sun.castShadow = true; s.mapSize.set(2048, 2048);
      Object.assign(s.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 300 }); s.bias = -0.0005; s.normalBias = 0.04; if (this.ultra) s.radius = 3;
      sc.fog = new THREE.Fog('#8fc6ea', 120, 330);
      const pm = new THREE.PMREMGenerator(r); const envScene = new THREE.Scene();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
      const pos = sky.geometry.attributes.position, cols = []; for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) + 50) / 100; const c = C3('#6b7b4a').lerp(C3('#bfe3ff'), Math.min(1, t * 1.6)); cols.push(c.r, c.g, c.b); }
      sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); envScene.add(sky);
      sc.environment = pm.fromScene(envScene, 0.04).texture; sc.environmentIntensity = 0.45; pm.dispose();
    }
    if (this.ultra) {
      sc.fog = new THREE.Fog('#c4d6e6', 160, 520); this.sun.shadow.camera.far = 400;
      fetch('./ultra/meta.json').then(r => r.json()).then(meta => { if (this.renderer !== r) return; this.usky = new UltraSky(r, sc, meta); }).catch(e => console.warn('céu', e));
      loadTerrainArrays().then(arr => { if (this.renderer !== r) { arr.cor.dispose(); arr.nor.dispose(); return; } this.tarr = arr; this.tdata = terrainData(); if (this._s) fillTerrainData(this.tdata, this._s); this.ground.material = terrainMaterial(arr, this.tdata); }).catch(e => console.warn('terreno', e));
      this.grass = new Grass(sc);
    }
    // terreno
    this.ppt = this.hi ? 16 : 4;
    this.tc = document.createElement('canvas'); this.tc.width = this.tc.height = MAP * this.ppt; this.tg = this.tc.getContext('2d');
    this.ttex = new THREE.CanvasTexture(this.tc); this.ttex.colorSpace = THREE.SRGBColorSpace; this.ttex.anisotropy = this.hi ? 8 : 1;
    const tg = new THREE.PlaneGeometry(MAP * TILE, MAP * TILE, MAP, MAP); tg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(tg, this.hi ? new THREE.MeshStandardMaterial({ map: this.ttex, roughness: 0.95 }) : new THREE.MeshLambertMaterial({ map: this.ttex }));
    this.ground.receiveShadow = this.hi; sc.add(this.ground);
    // chão distante: 4 faixas em volta do mapa (não cobre lagos e fossos)
    const fm = this.kit.mat('#55703a'), E = MAP * TILE / 2, W2 = 450;
    for (const [w, d, x, z] of [[2 * W2, W2 - E, 0, -(E + (W2 - E) / 2)], [2 * W2, W2 - E, 0, E + (W2 - E) / 2], [W2 - E, 2 * E, -(E + (W2 - E) / 2), 0], [W2 - E, 2 * E, E + (W2 - E) / 2, 0]]) {
      const far = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), fm); far.position.set(x, -0.02, z); sc.add(far);
    }
    this.waterG = new THREE.Group(); sc.add(this.waterG);
    this.waterMat = this.ultra ? new THREE.MeshStandardMaterial({ color: '#24607a', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.86, normalMap: waterNormalTexture(), normalScale: new THREE.Vector2(0.45, 0.45) }) : this.hi ? new THREE.MeshStandardMaterial({ color: '#2f7fb0', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82 }) : new THREE.MeshLambertMaterial({ color: '#3d86b3' });
    this.layers = {}; for (const k of ['habs', 'facs', 'objs', 'furn', 'animals', 'staff', 'fx']) { this.layers[k] = new THREE.Group(); sc.add(this.layers[k]); }
    this.maps = { habs: new Map(), facs: new Map(), objs: new Map(), furn: new Map(), animals: new Map(), staff: new Map() }; this._furnH = null; this._furnParts = {}; this._furnMeshes = []; this._plantH = null; this._plantParts = {}; this._plantMeshes = [];
    this.kit.lamp = this.hi ? new THREE.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffc766', emissiveIntensity: 0 }) : new THREE.MeshLambertMaterial({ color: '#fff4c8', emissive: '#ffc766' }); this.kit.lamp.emissiveIntensity = 0; this.lampOn = false;
    // visitantes instanciados
    const cap = 160;
    this.vBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 1.2, 6), this.kit.mat('#ffffff'), cap);
    this.vHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), this.kit.mat('#d9a87e'), cap);
    for (const m of [this.vBody, this.vHead]) { m.count = 0; m.frustumCulled = false; m.castShadow = this.hi; sc.add(m); }
    const poo = new THREE.SphereGeometry(0.09, this.hi ? 8 : 5, this.hi ? 6 : 4); poo.scale(1, 0.55, 1.2);
    this.dirtMesh = [new THREE.InstancedMesh(poo, this.kit.mat('#4a3420', { rough: 0.6 }), 800), new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), this.kit.mat('#8fae3e'), 800)];
    for (const m of this.dirtMesh) { m.count = 0; m.frustumCulled = false; m.receiveShadow = this.hi; sc.add(m); }
    this.fx = { sparks: new Map(), darts: new Map(), cones: new Map() };
    this.litter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), this.kit.mat('#eeeeee'), 500); this.litter.count = 0; sc.add(this.litter);
    // grade e prévias
    this.grid = new THREE.GridHelper(MAP * TILE, MAP, '#ffffff', '#ffffff'); this.grid.material.opacity = 0.12; this.grid.material.transparent = true; this.grid.position.y = 0.03; this.grid.visible = false; sc.add(this.grid);
    this.prev = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#4caf50', transparent: true, opacity: 0.35, depthWrite: false })); this.prev.visible = false; sc.add(this.prev);
    this.cellsPrev = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.94, 1, TILE * 0.94), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }), 1200); this.cellsPrev.count = 0; this.cellsPrev.frustumCulled = false; sc.add(this.cellsPrev);
    this.sel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe14d' })); this.sel.visible = false; sc.add(this.sel);
    this.raycaster = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.cache = { terrain: null, area: -1, ver: -1, litterSig: '', hver: -1 };
    this.t = 0;
  }
  setQuality(q, s) { if (q === this.q) return; this.dispose(); this.build(q); if (s) this.update(s, 0); }
  dispose() {
    this.renderer.dispose(); this.renderer.domElement.remove(); this.kit.lamp?.dispose(); this.kit.dispose(); this.ttex.dispose();
    this.usky?.dispose(); this.grass?.dispose(); this.tarr?.cor.dispose(); this.tarr?.nor.dispose(); this.tdata?.dispose(); this.waterMat.normalMap?.dispose(); this.lakeMat?.dispose(); this.lakeMat = null;
    this.usky = this.grass = this.tarr = this.tdata = null;
    this.scene.traverse(o => { if (o.isInstancedMesh || o === this.ground) o.geometry.dispose(); });
  }
  pixelRatio() { return this.hi ? Math.min(devicePixelRatio, this.eco ? 1.5 : 2) : Math.min(devicePixelRatio, 1); }
  setEco(on) { if (!!on === !!this.eco) return; this.eco = !!on; this.renderer.setPixelRatio(this.pixelRatio() * (this.pxScale ?? 1)); this.resize(); }
  setPixelScale(k) { this.pxScale = k; this.renderer.setPixelRatio(this.pixelRatio() * k); this.resize(); }
  resize() { const w = this.container.clientWidth, h = this.container.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------- terreno ----------
  paintTile(s, i, locked) {
    const C = content(s), t = s.terrain[i], x = i % MAP, y = (i / MAP) | 0, p = this.ppt, g = this.tg;
    const base = C3(C.terrains[t]?.cor || '#7d9b45'); if (locked) base.multiplyScalar(0.62);
    // calçada: borda clara nos lados que não têm outro caminho ao lado
    const side = t === 'k' ? [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= MAP || ny >= MAP || !isPathT(s.terrain[idx(nx, ny)]); }) : null; // N, S, O, L
    const walk = C3('#d9d4c6'); if (locked) walk.multiplyScalar(0.62);
    const bw = Math.max(1, Math.round(p * 0.28));
    if (!this.hi) {
      g.fillStyle = '#' + base.getHexString(); g.fillRect(x * p, y * p, p, p);
      if (side) { g.fillStyle = '#' + walk.getHexString(); if (side[0]) g.fillRect(x * p, y * p, p, 1); if (side[1]) g.fillRect(x * p, y * p + p - 1, p, 1); if (side[2]) g.fillRect(x * p, y * p, 1, p); if (side[3]) g.fillRect(x * p + p - 1, y * p, 1, p); }
      return;
    }
    // margem de lago: terra molhada escurecendo em direção à água
    const isW = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && s.terrain[idx(nx, ny)] === 'w'; };
    const shore = t !== 'w' && !isPathT(t) ? [isW(0, -1), isW(0, 1), isW(-1, 0), isW(1, 0), isW(-1, -1), isW(1, -1), isW(-1, 1), isW(1, 1)] : null;
    const hasShore = shore && shore.some(Boolean), wetC = C3('#5e5340');
    const img = g.createImageData(p, p); let seed = i * 9301 + 49297;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < p * p; k++) {
      const px = k % p, py = (k / p) | 0; let v = 0.9 + rnd() * 0.2, c = base;
      if (t === 'p' && (px === 0 || py === 0 || (py === p >> 1 && px > 0) )) v *= 0.86;
      if (t === 'q') { v = 0.86 + rnd() * 0.28; if (rnd() < 0.05) v *= 0.8; }
      if (t === 'c' || t === 'k') { v = 0.96 + rnd() * 0.08; if (px === 0 || py === 0 || px === p >> 1 || py === p >> 1) v *= 0.9; }
      if (side) { const onWalk = (side[0] && py < bw) || (side[1] && py >= p - bw) || (side[2] && px < bw) || (side[3] && px >= p - bw); if (onWalk) { c = walk; v = 0.97 + rnd() * 0.06; if ((side[0] && py === bw - 1) || (side[1] && py === p - bw) || (side[2] && px === bw - 1) || (side[3] && px === p - bw)) v *= 0.8; } }
      if (t === 'g' && rnd() < 0.08) v *= 1.18; if (t === 'r' && rnd() < 0.15) v *= 0.8;
      if (hasShore) { const u = (px + 0.5) / p, w = (py + 0.5) / p, R = 0.55; let wet = 0;
        if (shore[0]) wet = Math.max(wet, 1 - w / R); if (shore[1]) wet = Math.max(wet, 1 - (1 - w) / R); if (shore[2]) wet = Math.max(wet, 1 - u / R); if (shore[3]) wet = Math.max(wet, 1 - (1 - u) / R);
        if (shore[4]) wet = Math.max(wet, 1 - Math.hypot(u, w) / R); if (shore[5]) wet = Math.max(wet, 1 - Math.hypot(1 - u, w) / R); if (shore[6]) wet = Math.max(wet, 1 - Math.hypot(u, 1 - w) / R); if (shore[7]) wet = Math.max(wet, 1 - Math.hypot(1 - u, 1 - w) / R);
        wet = Math.max(0, wet) * (0.75 + rnd() * 0.25); if (wet > 0) { c = c.clone().lerp(wetC, Math.min(1, wet * 0.85)); v *= 1 - 0.12 * wet; } }
      img.data[k * 4] = Math.min(255, c.r * 255 * v); img.data[k * 4 + 1] = Math.min(255, c.g * 255 * v); img.data[k * 4 + 2] = Math.min(255, c.b * 255 * v); img.data[k * 4 + 3] = 255;
    }
    g.putImageData(img, x * p, y * p);
  }
  syncTerrain(s) {
    const a = AREAS[s.areaLevel], prev = this.cache.terrain, areaChanged = this.cache.area !== s.areaLevel;
    let changed = false, water = false;
    const todo = new Set();
    for (let i = 0; i < MAP * MAP; i++) {
      if (!areaChanged && prev && prev[i] === s.terrain[i]) continue;
      todo.add(i);
      if (prev) { const x = i % MAP, y = (i / MAP) | 0, wet = s.terrain[i] === 'w' || prev[i] === 'w';
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && (wet || (s.terrain[idx(nx, ny)] === 'k' && !(dx && dy)))) todo.add(idx(nx, ny)); } }
      if (s.terrain[i] === 'w' || (prev && prev[i] === 'w')) water = true;
    }
    for (const i of todo) { const x = i % MAP, y = (i / MAP) | 0; this.paintTile(s, i, !(x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1)); changed = true; }
    if (changed) { this.dirty = true; this.ttex.needsUpdate = true; this.cache.terrain = s.terrain.slice(); this.cache.area = s.areaLevel; this.tsig = (this.tsig || 0) + 1; if (this.tdata) fillTerrainData(this.tdata, s); }
    if (water || !this.waterBuilt) this.rebuildWater(s);
    if (s.height && this.cache.hver !== (s._hver || 0)) {
      this.cache.hver = s._hver || 0; const pos = this.ground.geometry.attributes.position;
      for (let i = 0; i < CW * CW; i++) pos.setY(i, s.height[i]);
      pos.needsUpdate = true; this.ground.geometry.computeVertexNormals(); this.ground.geometry.computeBoundingSphere();
      if (this.waterG.children.length) this.rebuildWater(s);
    }
  }
  // lagos: a superfície cobre a água e a margem vizinha; o chão mais alto esconde o excesso e a água fica
  // transparente onde é rasa, então a borda acompanha o relevo em vez de terminar em quadrados
  rebuildWater(s) {
    this.waterBuilt = true;
    for (const c of [...this.waterG.children]) { c.geometry.dispose(); this.waterG.remove(c); }
    const cover = new Set();
    for (let i = 0; i < MAP * MAP; i++) if (s.terrain[i] === 'w') { const x = i % MAP, y = (i / MAP) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy)) cover.add(idx(x + dx, y + dy)); }
    if (!cover.size) return;
    if (!this.lakeMat) { this.lakeMat = this.waterMat.clone(); this.lakeMat.vertexColors = true; this.lakeMat.transparent = true; this.lakeMat.depthWrite = false; this.lakeMat.normalMap = this.waterMat.normalMap; }
    const N = 2, pos = [], col = [], ind = [], Hh = (x, z) => heightAt(s, x, z);
    for (const i of cover) {
      const x0 = (i % MAP) * TILE - HALF, z0 = ((i / MAP) | 0) * TILE - HALF, base = pos.length / 3;
      for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) {
        const x = x0 + (a / N) * TILE, z = z0 + (b / N) * TILE, depth = WATER_Y - Hh(x, z);
        const al = Math.max(0, Math.min(1, (depth + 0.05) / 0.45)); // rasa = clara e transparente
        pos.push(x, WATER_Y, z); col.push(0.8 + 0.2 * (1 - al), 0.88 + 0.12 * (1 - al), 1, this.hi ? Math.min(1, al * 1.3) : 1);
      }
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) { const k = base + b * (N + 1) + a; ind.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const uv = []; for (let k = 0; k < pos.length; k += 3) uv.push(pos[k] / 8, pos[k + 2] / 8); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.lakeMat); m.receiveShadow = this.hi; m.renderOrder = 2; this.waterG.add(m);
  }
  // ---------- habitats ----------
  habKey(h, s) {
    let hs = 0, pv = 0; for (const e of edges(h)) { if (s.height) hs += (heightAt(s, e.ax, e.az) + heightAt(s, e.mx, e.mz) * 0.5) * ((e.c % 97) + 1); if (h.fence === 'muro' && isPath(s, e.out[0], e.out[1])) pv += (e.c % 13) + 1; }
    return [h.cells.length, h.cells[0], h.cells[h.cells.length - 1], h.x, h.y, h.w, h.h, h.fence, h.gateOpen, h.gateOut.join(), h.feed.join(), h.water.join(), Math.round(h.fenceHp * 5), Math.round(h.food * 4), Math.round(h.waterLvl * 4), (h.breaches || []).map(b => b.side + b.k).join(), hs.toFixed(1), pv].join('|');
  }
  buildHabitat(s, h) {
    const k = this.kit, g = new THREE.Group(), C = content(s), F = C.fences[h.fence] || {}, Y = (x, z) => heightAt(s, x, z);
    const x0 = h.x * TILE - HALF, x1 = (h.x + h.w) * TILE - HALF, z0 = h.y * TILE - HALF, z1 = (h.y + h.h) * TILE - HALF;
    const wear = 1 - h.fenceHp, isMuro = h.fence === 'muro', isTela = !!F.teto, isFosso = !!F.fosso;
    const col = isMuro ? C3('#d9cbb0').lerp(C3('#7d705e'), wear) : C3(isTela ? '#2f3a33' : '#3d4146').lerp(C3('#8a4b24'), wear);
    const mat = isMuro ? k.mat('#' + col.getHexString(), { rough: 0.95, map: k.tex('muro', stoneWall) }) : k.mat('#' + col.getHexString(), { metal: 0.5, rough: 0.45 });
    const capM = k.mat('#9a8b72'), H = isMuro ? 3 : isTela ? 3.2 : 2.4;
    const br = new Set((h.breaches || []).map(b => b.side + ':' + b.k));
    const add = (geo, m, x, y, z) => { const o = k.mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    const beam = (geo, m, ax, ay, az, bx, by, bz) => { const o = k.mesh(geo, m); o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); o.lookAt(bx, by, bz); g.add(o); return o; };
    const bars = []; // barras da cerca de ferro: uma InstancedMesh só para o habitat inteiro
    const seg = (ax, az, bx, bz) => {
      const ha = Y(ax, az), hb = Y(bx, bz), dh = Math.abs(ha - hb), len = Math.hypot(bx - ax, bz - az), l3 = Math.hypot(len, hb - ha);
      if (isMuro) {
        const hh = H + dh + 0.3, w = add(k.box(0.45, hh, len), mat, (ax + bx) / 2, Math.min(ha, hb) - 0.3 + hh / 2, (az + bz) / 2); w.rotation.y = Math.atan2(bx - ax, bz - az);
        beam(k.box(0.6, 0.15, l3 + 0.12), capM, ax, ha + H, az, bx, hb + H, bz);
      } else if (isFosso) {
        const hh = 0.9 + dh, w = add(k.box(0.35, hh, len), k.mat('#a89a80'), (ax + bx) / 2, Math.min(ha, hb) + hh / 2 - 0.05, (az + bz) / 2); w.rotation.y = Math.atan2(bx - ax, bz - az);
      } else {
        for (const yy of [0.35, 1.3, H - 0.15]) beam(k.box(0.07, 0.07, l3), mat, ax, ha + yy, az, bx, hb + yy, bz);
        if (this.hi) for (let i = 0; i < 7; i++) { const f = (i + 0.5) / 7; bars.push([ax + (bx - ax) * f, ha + (hb - ha) * f + H / 2, az + (bz - az) * f]); }
      }
    };
    const debris = (ax, az, bx, bz) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, y = Y(cx, cz);
      for (let i = 0; i < 4; i++) { const o = add(isMuro ? k.box(0.5, 0.3, 0.4) : k.box(0.07, 0.07, 1.6), mat, cx + (i - 1.5) * 0.45, y + 0.15, cz + ((i * 37) % 5 - 2) * 0.25); o.rotation.set(0.1 * i, i * 1.3, 1.2 + i * 0.2); }
      const p = add(k.cyl(0.07, 0.07, H), mat, ax, Y(ax, az) + 0.1, az); p.rotation.z = 1.35;
    };
    const E = edges(h), ge = E.find(e => e.out[0] === h.gateOut[0] && e.out[1] === h.gateOut[1]);
    const verts = new Map(); // cantos: contam as direções das cercas que chegam neles
    const vk = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    for (const e of E) {
      for (const [x, z] of [[e.ax, e.az], [e.bx, e.bz]]) { const v = verts.get(vk(x, z)) || { x, z, dirs: new Set() }; v.dirs.add(e.d === 'N' || e.d === 'S' ? 'h' : 'v'); verts.set(vk(x, z), v); }
      if (e === ge) {
        if (isFosso) continue;
        const hinge = new THREE.Group(); hinge.position.set(e.ax, Y(e.ax, e.az), e.az);
        const gate = k.mesh(k.box(0.08, H * 0.85, TILE), k.mat(isMuro ? '#6b4a2b' : '#2b2f33')); gate.position.set(0, H * 0.43, TILE / 2);
        if (e.d === 'N' || e.d === 'S') hinge.rotation.y = Math.PI / 2;
        hinge.add(gate); if (h.gateOpen) hinge.rotation.y += e.d === 'S' || e.d === 'L' ? -1.4 : 1.4; g.add(hinge);
        continue;
      }
      if (br.has(e.d + ':' + e.c)) { debris(e.ax, e.az, e.bx, e.bz); continue; }
      seg(e.ax, e.az, e.bx, e.bz);
    }
    // postes da cerca de ferro em todos os cantos; pilares do muro nas quinas e a cada 3 trechos
    let n = 0;
    for (const v of verts.values()) {
      const y = Y(v.x, v.z), corner = v.dirs.size > 1;
      if (isFosso) continue;
      if (isMuro) { if (corner || n++ % 3 === 0) { add(k.box(0.72, H + 0.55, 0.72), mat, v.x, y + (H + 0.55) / 2 - 0.25, v.z); add(k.box(0.86, 0.14, 0.86), capM, v.x, y + H + 0.36, v.z); } }
      else add(k.cyl(0.07, 0.07, H), mat, v.x, y + H / 2, v.z);
    }
    if (bars.length) { const im = new THREE.InstancedMesh(k.cyl(0.018, 0.018, H - 0.2), mat, bars.length), m = new THREE.Matrix4(); bars.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m); }); im.castShadow = true; im.computeBoundingSphere(); g.add(im); }
    // muro com plataforma: mirantes do lado de fora, dentro da folga de 1 bloco (não invadem o habitat vizinho)
    if (isMuro && F.plataforma) {
      const wood = k.mat('#8a6236'), dark = k.mat('#5e4128'), picks = [], far = (e, list) => list.every(p => Math.hypot(p.mx - e.mx, p.mz - e.mz) > 7);
      const good = E.filter(e => e !== ge && !br.has(e.d + ':' + e.c) && inMap(e.out[0], e.out[1]) && !s._occ.fac[idx(e.out[0], e.out[1])]);
      const gx = ge ? ge.mx : 0, gz = ge ? ge.mz : 0, dGate = e => Math.hypot(e.mx - gx, e.mz - gz);
      const path = good.filter(e => isPath(s, e.out[0], e.out[1]) && dGate(e) > 3).sort((a, b) => dGate(a) - dGate(b));
      const max = Math.max(1, Math.min(3, Math.floor(E.length / 14)));
      for (const e of path) { if (picks.length >= max) break; if (far(e, picks)) picks.push(e); }
      if (!picks.length && ge) { const nb = good.filter(e => e.d === ge.d && dGate(e) > 1 && dGate(e) < 2.5)[0]; if (nb) picks.push(nb); }
      for (const e of picks) {
        const cx = e.mx + e.nx * 1.0, cz = e.mz + e.nz * 1.0, y = Math.max(Y(cx, cz), Y(e.mx, e.mz)) + 1.35, along = e.nx ? [0, 1] : [1, 0];
        const deck = add(k.box(e.nx ? 1.5 : 1.9, 0.14, e.nx ? 1.9 : 1.5), wood, cx, y, cz);
        for (const a of [-0.85, 0.85]) for (const o of [-0.62, 0.62]) { const px = cx + along[0] * a + e.nx * o, pz = cz + along[1] * a + e.nz * o, py = Y(px, pz); add(k.box(0.12, y - py, 0.12), dark, px, py + (y - py) / 2, pz); }
        const ry = y + 0.55; // guarda-corpo: frente e laterais
        add(k.box(e.nx ? 0.06 : 1.9, 0.06, e.nx ? 1.9 : 0.06), dark, cx + e.nx * 0.72, ry, cz + e.nz * 0.72);
        for (const a of [-0.92, 0.92]) add(k.box(e.nx ? 1.5 : 0.06, 0.06, e.nx ? 0.06 : 1.5), dark, cx + along[0] * a, ry, cz + along[1] * a);
        for (const a of [-0.92, 0, 0.92]) add(k.box(0.05, 0.55, 0.05), dark, cx + e.nx * 0.72 + along[0] * a, y + 0.28, cz + e.nz * 0.72 + along[1] * a);
        // escadinha descendo pela lateral, rente à cerca
        for (let st = 0; st < 4; st++) { const off = 1.15 + st * 0.32, sy = y - (st + 1) * 0.32, px = cx + along[0] * off - e.nx * 0.35, pz = cz + along[1] * off - e.nz * 0.35, gy = Y(px, pz);
          if (sy <= gy) break; add(k.box(e.nx ? 0.7 : 0.32, sy - gy + 0.07, e.nx ? 0.32 : 0.7), wood, px, gy + (sy - gy) / 2, pz); }
        void deck;
      }
    }
    if (isTela) { // rede por cima (viveiro), só sobre os blocos do habitat
      let top = -9; for (const e of E) top = Math.max(top, Y(e.ax, e.az));
      const net = k.tex('rede', () => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'); q.strokeStyle = 'rgba(40,48,44,0.9)'; q.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { q.beginPath(); q.moveTo(i, 0); q.lineTo(i, 64); q.stroke(); q.beginPath(); q.moveTo(0, i); q.lineTo(64, i); q.stroke(); } return c; });
      const nm = new THREE.MeshStandardMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
      const pos = [], uv = [], yy = top + H;
      for (const i of h.cells) { const cx = (i % MAP) * TILE - HALF, cz = ((i / MAP) | 0) * TILE - HALF;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) { pos.push(cx + a * TILE, yy, cz + b * TILE); uv.push((cx + a * TILE) / TILE, (cz + b * TILE) / TILE); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, nm));
    }
    if (isFosso) { // ponte sobre o fosso e portão na beira da ilha
      const bt = bridgeTiles(h), a0 = tileToWorld(h.gateOut[0], h.gateOut[1]), a1 = tileToWorld(h.gateIn[0], h.gateIn[1]);
      const len = Math.hypot(a1.x - a0.x, a1.z - a0.z), wood = k.mat('#8a6236');
      beam(k.box(1.8, 0.15, len), wood, a0.x, 0.3, a0.z, a1.x, 0.3, a1.z);
      for (const sgn of [-1, 1]) { const nx = (a1.z - a0.z) / len * 0.9 * sgn, nz = -(a1.x - a0.x) / len * 0.9 * sgn; beam(k.box(0.06, 0.06, len), wood, a0.x + nx, 1.2, a0.z + nz, a1.x + nx, 1.2, a1.z + nz); for (const f of [0.15, 0.5, 0.85]) add(k.cyl(0.05, 0.05, 0.9), wood, a0.x + (a1.x - a0.x) * f + nx, 0.75, a0.z + (a1.z - a0.z) * f + nz); }
      const gx = a1.x + (a0.x - a1.x) / len * 0.9, gz = a1.z + (a0.z - a1.z) / len * 0.9;
      const gate = add(k.box(Math.abs(a1.x - a0.x) > 0.1 ? 0.08 : 1.8, 1.3, Math.abs(a1.x - a0.x) > 0.1 ? 1.8 : 0.08), k.mat('#5b3f26'), gx, 1.0, gz);
      if (h.gateOpen) gate.rotation.y = 1.2;
    }
    // comedouro e bebedouro
    const fp = tileToWorld(h.feed[0], h.feed[1]), wp = tileToWorld(h.water[0], h.water[1]), fy = Y(fp.x, fp.z), wy = Y(wp.x, wp.z);
    add(k.box(1.4, 0.4, 0.6), k.mat('#7a5230'), fp.x, fy + 0.2, fp.z);
    if (h.food > 0.05) add(k.box(1.2, 0.12, 0.45), k.mat('#9bb34a'), fp.x, fy + 0.32 + 0.06 * h.food, fp.z);
    add(k.cyl(0.6, 0.65, 0.4), k.mat('#9a948a'), wp.x, wy + 0.2, wp.z);
    if (h.waterLvl > 0.05) { const wv = k.mesh(k.cyl(0.52, 0.52, 0.05), this.waterMat, false); wv.position.set(wp.x, wy + 0.2 + 0.18 * h.waterLvl, wp.z); g.add(wv); }
    g.userData = { kind: 'hab', id: h.id };
    return mergeStatic(g);
  }

  // ---------- sincronização ----------
  // mobiliário de caminho: uma chamada de desenho por tipo e material (InstancedMesh), em vez de uma por peça
  syncFurn(s) {
    const list = s.furn || []; let hh = list.length * 7 + (s._ver || 0);
    for (const f of list) hh = (hh * 31 + f.id * 3 + f.tx * 7 + f.ty * 13 + Math.round((f.rot + 4) * 100) + Math.round((f.ox || 0) * 100) * 5 + Math.round((f.oz || 0) * 100) * 11) | 0;
    if (hh === this._furnH) return; this._furnH = hh; this.dirty = true;
    for (const im of this._furnMeshes) { this.layers.furn.remove(im); im.dispose(); }
    this._furnMeshes = [];
    const by = {}; for (const f of list) (by[f.type] ||= []).push(f);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (const type in by) {
      const arr = by[type], parts = (this._furnParts[type] ||= furnParts(this.kit, type));
      for (const { geo, mat } of parts) {
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((f, i) => { const p = tileToWorld(f.tx, f.ty), x = p.x + f.ox, z = p.z + f.oz; pos.set(x, heightAt(s, x, z), z); q.setFromAxisAngle(up, f.rot); m4.compose(pos, q, one); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = !!this.hi; im.computeBoundingSphere(); im.userData.kind = 'furn';
        this.layers.furn.add(im); this._furnMeshes.push(im);
      }
    }
  }
  // plantas (fora do Ultra): uma chamada de desenho por tipo e material, em vez de uma por planta
  syncPlants(s) {
    const C = content(s), list = s.objects.filter(o => C.plants[o.type]); let hh = list.length * 5 + (s._ver || 0);
    for (const o of list) hh = (hh * 31 + o.id * 3 + o.tx * 7 + o.ty * 13 + Math.round((o.rot || 0) * 100) + Math.round((o.sc || 1) * 100) * 5) | 0;
    if (hh === this._plantH) return; this._plantH = hh; this.dirty = true;
    for (const im of this._plantMeshes) { this.layers.objs.remove(im); im.dispose(); }
    this._plantMeshes = [];
    const by = {}; for (const o of list) (by[o.type] ||= []).push(o);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const type in by) {
      const arr = by[type], parts = (this._plantParts[type] ||= groupParts(buildPlant(this.kit, type)));
      for (const { geo, mat } of parts) {
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        arr.forEach((o, i) => { const p = tileToWorld(o.tx, o.ty); pos.set(p.x, heightAt(s, p.x, p.z), p.z); q.setFromAxisAngle(up, o.rot || 0); sc.setScalar(o.sc || 1); m4.compose(pos, q, sc); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = !!this.hi; im.computeBoundingSphere();
        this.layers.objs.add(im); this._plantMeshes.push(im);
      }
    }
  }
  syncStatic(s) {
    const C = content(s);
    const syncSet = (map, layer, list, key, make) => {
      const seen = new Set();
      for (const e of list) {
        seen.add(e.id); const k = key(e), cur = map.get(e.id);
        if (cur && cur.k === k) continue;
        if (cur) { layer.remove(cur.o); freeMerged(cur.o); }
        const o = make(e); if (!o) continue; layer.add(o); map.set(e.id, { o, k }); this.dirty = true;
      }
      for (const [id, v] of map) if (!seen.has(id)) { layer.remove(v.o); freeMerged(v.o); map.delete(id); }
    };
    syncSet(this.maps.habs, this.layers.habs, s.habitats, h => this.habKey(h, s), h => this.buildHabitat(s, h));
    syncSet(this.maps.facs, this.layers.facs, s.facilities.filter(f => C.facilities[f.type]), f => f.type + f.tx + ',' + f.ty + ':' + (f.dir ?? '-') + ':' + heightAt(s, ...Object.values(tileToWorld(f.tx, f.ty))).toFixed(1), f => {
      const D = C.facilities[f.type], o = buildFacility(this.kit, f.type, D);
      const p = tileToWorld(f.tx, f.ty); o.position.set(p.x - TILE / 2 + D.w, heightAt(s, p.x - TILE / 2 + D.w, p.z - TILE / 2 + D.h), p.z - TILE / 2 + D.h);
      o.rotation.y = f.type === 'entrada' || f.dir == null ? 0 : DIR_ROT[f.dir]; o.userData = { kind: 'fac', id: f.id }; return mergeStatic(o); });
    this.syncFurn(s);
    if (!this.ultra) this.syncPlants(s); else syncSet(this.maps.objs, this.layers.objs, s.objects.filter(o => C.plants[o.type]), o => o.type + o.tx + ',' + o.ty + ':' + heightAt(s, ...Object.values(tileToWorld(o.tx, o.ty))).toFixed(1), o => {
      const m = buildPlant(this.kit, o.type), p = tileToWorld(o.tx, o.ty); m.position.set(p.x, heightAt(s, p.x, p.z), p.z); m.rotation.y = o.rot || 0; m.scale.setScalar(o.sc || 1); return m; });
  }
  update(s, dt) {
    this.t += dt; this._s = s;
    this.syncTerrain(s);
    this.syncStatic(s);
    { const hr = hourOf(s.clock.min), on = hr >= 18 || hr < 6.5; if (on !== this.lampOn) { this.lampOn = on; this.kit.lamp.emissiveIntensity = on ? 1.6 : 0; } }
    const C = content(s), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    // animais
    const L = this.hi ? library() : null, seen = new Set();
    for (const a of s.animals) {
      if (!C.species[a.sp]) continue; seen.add(a.id);
      const vkey = a.sp === 'leao' || a.sp === 'gorila' ? a.sp + ':' + a.sex : a.sp + ':F';
      let tpl = null; if (L) { L.request(vkey); tpl = L.get(vkey); if (tpl && this.ultra && !tpl.userData.ultra) { tpl.userData.ultra = true; tpl.userData.baseMat = tpl.children[0].material; addFur(tpl, a.sp); addSkinDetail(tpl, a.sp); tpl.userData.skinMat = tpl.children[0].material; tpl.userData.farMat = gradeMaterial(tpl.userData.baseMat.clone()); tpl.children[0].material = tpl.userData.baseMat; } }
      const kind = tpl ? 'sdf' : 'proc';
      let e = this.maps.animals.get(a.id);
      if (e && e.kind !== kind) { this.layers.animals.remove(e.o); freeMerged(e.o); e = null; }
      if (!e) { const o = tpl ? sdfInstance(tpl) : mergeRig(buildAnimal(this.kit, a.sp, a.sex === 'M')); o.userData.kind = 'animal'; o.userData.id = a.id; o.position.set(a.x, 0, a.z); this.layers.animals.add(o); e = { o, px: a.x, pz: a.z, kind }; this.maps.animals.set(a.id, e); }
      const o = e.o, moving = Math.hypot(a.x - e.px, a.z - e.pz) > 0.002 && dt > 0 && !a.carriedBy;
      e.px = a.x; e.pz = a.z;
      let x = a.x, z = a.z, rot = a.rot || 0, y = walkY(s, x, z) + (a.jy || 0);
      if (a.carriedBy) { const v = this.maps.staff.get(a.carriedBy)?.veh; if (v) { const r = v.rotation.y; x = v.position.x - Math.sin(r) * (-v.userData.bedZ); z = v.position.z - Math.cos(r) * (-v.userData.bedZ); y = v.position.y + v.userData.bedY; rot = r + Math.PI / 2; } }
      o.position.set(x, y, z); o.rotation.y = rot;
      const S = C.species[a.sp]; let sc = a.age < S.vida.adulto ? 0.5 + 0.5 * (a.age / S.vida.adulto) : 1;
      if (a.carriedBy && (a.sp === 'girafa')) sc *= 0.75;
      o.scale.setScalar(sc);
      if (kind === 'sdf') {
        animateSDFAnimal(o, a, dt, moving, a.sp);
        if (tpl?.userData.ultra) { const d2 = this.camera.position.distanceToSquared(o.position), near = this.ultra && d2 < (e.near ? 1900 : 1500); e.near = near; for (const c of o.children) if (c.userData.fur) c.visible = near; o.children[0].material = this.ultra ? (near ? tpl.userData.skinMat : tpl.userData.farMat) : tpl.userData.baseMat; }
      } else animateAnimal(o, a, dt, moving);
    }
    for (const [id, e] of this.maps.animals) if (!seen.has(id)) { this.layers.animals.remove(e.o); freeMerged(e.o); this.maps.animals.delete(id); }
    // equipe
    const ss = new Set();
    for (const st of s.staff) {
      ss.add(st.id); const key = 'humano:' + st.role;
      let tpl = null; if (L) { L.request(key); tpl = L.get(key); }
      const kind = tpl ? 'sdf' : 'proc';
      let e = this.maps.staff.get(st.id);
      if (e && e.kind !== kind) { this.layers.staff.remove(e.o); if (e.veh) this.layers.staff.remove(e.veh); e = null; }
      if (!e) { const R = C.roles[st.role]; const o = tpl ? sdfInstance(tpl) : buildPerson(this.kit, R?.cor || '#888', st.role === 'seguranca' ? '#111' : st.role === 'tratador' ? '#6b8e23' : null); o.userData.kind = 'staff'; o.userData.id = st.id; this.layers.staff.add(o); e = { o, px: st.x, pz: st.z, kind, t: 0 }; this.maps.staff.set(st.id, e); }
      const t = st.task, mv = Math.hypot(st.x - e.px, st.z - e.pz), moving = mv > 0.002 && dt > 0;
      e.px = st.x; e.pz = st.z; e.t += dt;
      const driving = st.veh && t && (t.phase === 'travel' || t.phase === 'return');
      // veículo
      if (st.veh) {
        if (!e.veh || e.veh.userData.kind !== st.veh) { if (e.veh) this.layers.staff.remove(e.veh); e.veh = buildVehicle(this.kit, st.veh); e.veh.userData.kind = st.veh; this.layers.staff.add(e.veh); e.veh.position.set(st.x, walkY(s, st.x, st.z), st.z); }
        if (driving) { e.veh.position.set(st.x, walkY(s, st.x, st.z), st.z); e.veh.rotation.y = st.rot || 0; for (const w of e.veh.userData.wheels) w.rotation.x += mv / 0.42; }
        else if (!e.parked) { const r = e.veh.rotation.y; e.veh.position.x -= Math.sin(r) * 3.2; e.veh.position.z -= Math.cos(r) * 3.2; e.veh.position.y = walkY(s, e.veh.position.x, e.veh.position.z); e.parked = true; }
        if (driving) e.parked = false;
      } else if (e.veh) { this.layers.staff.remove(e.veh); e.veh = null; e.parked = false; }
      e.o.visible = !driving;
      const sy = walkY(s, st.x, st.z); e.o.position.set(st.x, sy, st.z); if (st.rot !== undefined) e.o.rotation.y = st.rot;
      // ação e ferramenta
      const working = t && ['work', 'sedate', 'load', 'release'].includes(t.phase) && !(t.type === 'clean' && t.moving);
      const hab = t && s.habitats.find(h => h.id === t.target);
      let action = null, tool = null;
      if (t) {
        if (t.type === 'repair') { tool = hab?.fence === 'muro' ? 'martelo' : 'macarico'; action = tool === 'macarico' ? 'soldar' : 'martelar'; }
        else if (t.type === 'feed') { tool = 'balde'; action = 'alimentar'; } else if (t.type === 'water') { tool = 'baldeAgua'; action = 'alimentar'; }
        else if (t.type === 'clean' || t.type === 'wc' || t.type === 'litter') { tool = 'vassoura'; action = 'varrer'; }
        else if (t.type === 'treat' || t.type === 'checkup') { tool = 'maleta'; action = 'tratar'; }
        else if (t.type === 'recapture') { tool = t.phase === 'sedate' ? 'dardo' : null; action = t.phase === 'sedate' ? 'mirar' : 'carregar'; }
        else if (t.type === 'close') action = 'carregar';
        else if (t.type === 'rest') action = 'descansar';
      }
      if (!working && action !== 'descansar') action = null;
      if ((e.tool?.userData.tipo || null) !== tool) {
        if (e.tool) e.tool.parent?.remove(e.tool); e.tool = null;
        if (tool) { e.tool = buildTool(this.kit, tool); e.tool.userData.tipo = tool; const hand = kind === 'sdf' ? e.o.userData.sdf.bones.maoD : e.o; if (kind !== 'sdf') e.tool.position.set(0.3, 0.95, 0.15); else e.tool.position.set(0, -0.05, 0.02); hand.add(e.tool); }
      }
      if (kind === 'sdf') animateSDFHuman(e.o, dt, moving && !driving, action, this.t);
      else { e.o.position.y = sy + (moving ? Math.abs(Math.sin(this.t * 9)) * 0.06 : 0); e.o.userData.body.rotation.x = working ? 0.35 + Math.sin(this.t * 5) * 0.12 : 0; }
      // efeitos: faíscas, cones, dardo
      this.fxSparks(st.id, action === 'soldar' ? e.o : null, dt);
      this.fxCones(st.id, t?.type === 'repair' && hab ? tileToWorld(hab.gateOut[0], hab.gateOut[1]) : null, hab?.side);
      if (t?.type === 'recapture' && t.phase === 'sedate') { if (e.lastPhase !== 'sedate') e.dart = 0; this.fxDart(st.id, e, s.animals.find(a => a.id === t.target), dt); } else this.fxDart(st.id, null);
      e.lastPhase = t?.phase;
    }
    for (const [id, e] of this.maps.staff) if (!ss.has(id)) { this.layers.staff.remove(e.o); if (e.veh) this.layers.staff.remove(e.veh); this.fxSparks(id, null); this.fxCones(id, null); this.fxDart(id, null); this.maps.staff.delete(id); }
    // sujeira nos habitats
    let nd = [0, 0];
    for (const h of s.habitats) for (const d of h.dirt || []) {
      const k = d[2] ? 1 : 0; if (nd[k] >= 800) continue;
      const r = ((d[0] * 13.7 + d[1] * 7.3) % 6.28);
      m.compose(new THREE.Vector3(d[0], heightAt(s, d[0], d[1]) + (k ? 0.03 : 0.05), d[1]), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(1, 1, 1));
      this.dirtMesh[k].setMatrixAt(nd[k]++, m);
      if (!k && nd[0] < 800) { m.compose(new THREE.Vector3(d[0] + 0.09, heightAt(s, d[0], d[1]) + 0.04, d[1] + 0.05), q, new THREE.Vector3(0.7, 0.7, 0.7)); this.dirtMesh[0].setMatrixAt(nd[0]++, m); }
    }
    this.dirtMesh.forEach((dm, k) => { dm.count = nd[k]; dm.instanceMatrix.needsUpdate = true; });
    // visitantes
    const col = new THREE.Color();
    const n = Math.min(s.visitors.length, this.vBody.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const v = s.visitors[i], bob = (v.route.length ? Math.abs(Math.sin(this.t * 9 + i)) * 0.05 : 0) + walkY(s, v.x, v.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.rot || 0);
      m.compose(new THREE.Vector3(v.x, 0.6 + bob, v.z), q, new THREE.Vector3(1, 1, 1)); this.vBody.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(v.x, 1.38 + bob, v.z), q, new THREE.Vector3(1, 1, 1)); this.vHead.setMatrixAt(i, m);
      this.vBody.setColorAt(i, col.set(VCOLS[v.col % VCOLS.length]));
    }
    this.vBody.count = this.vHead.count = n;
    this.vBody.instanceMatrix.needsUpdate = this.vHead.instanceMatrix.needsUpdate = true; if (this.vBody.instanceColor) this.vBody.instanceColor.needsUpdate = true;
    // lixo
    const keys = Object.keys(s.litter), sig = keys.length + ':' + keys.slice(0, 5).join(',');
    if (sig !== this.cache.litterSig) {
      this.cache.litterSig = sig; let c = 0;
      for (const k of keys) { const i = +k, p = tileToWorld(i % MAP, (i / MAP) | 0);
        for (let j = 0; j < s.litter[k] && c < 500; j++) { const a = (i * 7 + j * 3) % 10 / 10; m.makeRotationY(a * 6); m.setPosition(p.x + (a - 0.5) * 1.4, heightAt(s, p.x, p.z) + 0.05, p.z + (((i + j * 5) % 7) / 7 - 0.5) * 1.4); this.litter.setMatrixAt(c++, m); } }
      this.litter.count = c; this.litter.instanceMatrix.needsUpdate = true;
    }
    if (this.waterG.children[0]) this.waterG.children[0].position.y = Math.sin(this.t * 0.8) * 0.02;
    this.updateLight(s, dt);
  }
  fxSparks(id, person, dt) {
    let p = this.fx.sparks.get(id);
    if (!person) { if (p) { this.scene.remove(p.pts); p.pts.geometry.dispose(); this.fx.sparks.delete(id); } return; }
    if (!p) {
      const N = 40, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffb347', size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      p = { pts, v: new Float32Array(N * 3), life: new Float32Array(N) }; this.scene.add(pts); this.fx.sparks.set(id, p);
    }
    const r = person.rotation.y, ox = person.position.x + Math.sin(r) * 0.55, oz = person.position.z + Math.cos(r) * 0.55, oy = person.position.y + 0.95;
    const pos = p.pts.geometry.attributes.position.array;
    for (let i = 0; i < p.life.length; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.life[i] = 0.2 + Math.random() * 0.5; pos[i * 3] = ox; pos[i * 3 + 1] = oy; pos[i * 3 + 2] = oz; p.v[i * 3] = (Math.random() - 0.5) * 3; p.v[i * 3 + 1] = Math.random() * 2.5; p.v[i * 3 + 2] = (Math.random() - 0.5) * 3; }
      p.v[i * 3 + 1] -= 9.8 * dt; pos[i * 3] += p.v[i * 3] * dt; pos[i * 3 + 1] = Math.max(person.position.y + 0.02, pos[i * 3 + 1] + p.v[i * 3 + 1] * dt); pos[i * 3 + 2] += p.v[i * 3 + 2] * dt;
    }
    p.pts.geometry.attributes.position.needsUpdate = true; p.pts.material.opacity = 0.6 + Math.random() * 0.4;
  }
  fxCones(id, at, side) {
    let c = this.fx.cones.get(id);
    if (!at) { if (c) { this.scene.remove(c); this.fx.cones.delete(id); } return; }
    if (!c) { c = buildCones(this.kit); this.scene.add(c); this.fx.cones.set(id, c); }
    c.position.set(at.x, this._s ? heightAt(this._s, at.x, at.z) : 0, at.z); c.rotation.y = side === 'N' ? Math.PI : side === 'L' ? -Math.PI / 2 : side === 'O' ? Math.PI / 2 : 0;
  }
  fxDart(id, e, a, dt) {
    let d = this.fx.darts.get(id);
    if (!e || !a) { if (d) { this.scene.remove(d); this.fx.darts.delete(id); } return; }
    e.dart += dt; const T = 0.5;
    if (e.dart > T + 0.2) { if (d) { this.scene.remove(d); this.fx.darts.delete(id); } return; }
    if (!d) { d = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3d71' })); this.scene.add(d); this.fx.darts.set(id, d); }
    const f = Math.min(1, e.dart / T), sx = e.o.position.x, sz = e.o.position.z;
    const by = e.o.position.y; d.position.set(sx + (a.x - sx) * f, by + 1.4 - 0.5 * f, sz + (a.z - sz) * f); d.lookAt(a.x, by + 0.9, a.z);
  }
  focus() { // ponto do chão no centro da tela
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d); const c = this.camera.position;
    if (d.y > -0.05) return { x: c.x + d.x * 40, z: c.z + d.z * 40 }; const t = -c.y / d.y; return { x: c.x + d.x * t, z: c.z + d.z * t };
  }
  updateLight(s, dt = 0) {
    if (this.ultra) {
      const f = this.focus(), h = (s.clock.min % 1440) / 60;
      if (this.usky) {
        const dir = this.usky.update(h, this.sun, this.hemi, this.scene.fog, this.camera.position);
        this.sun.intensity *= 0.9; this.hemi.intensity *= 1.2; // sombra mais suave, menos contraste
        const span = Math.min(80, Math.max(25, this.camera.position.distanceTo(new THREE.Vector3(f.x, 0, f.z)) * 0.8));
        Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span }); this.sun.shadow.camera.updateProjectionMatrix();
        this.sun.target.position.set(f.x, 0, f.z); this.sun.position.set(f.x + dir.x * 150, dir.y * 150, f.z + dir.z * 150);
      } else this.scene.background = SKY.day;
      if (this.grass) this.grass.update(s, f.x, f.z, this.camera.position.y, dt, (this.tsig || 0) + ':' + (s._hver || 0) + ':' + s.facilities.length);
      if (this.waterMat.normalMap) { this.waterMat.normalMap.offset.x += dt * 0.012; this.waterMat.normalMap.offset.y += dt * 0.007; }
      return;
    }
    const h = hourOf(s.clock.min), day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const dawn = Math.max(0, 1 - Math.abs(h - 6.5) / 1.5) + Math.max(0, 1 - Math.abs(h - 18) / 1.5);
    const ang = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(ang) * 90, Math.max(8, Math.sin(ang) * 110), 40);
    this.sun.intensity = (this.hi ? 2.4 : 1.6) * Math.max(0.05, day);
    this.hemi.intensity = 0.35 + 0.65 * day;
    const sky = SKY.night.clone().lerp(SKY.day, day).lerp(SKY.dawn, Math.min(0.6, dawn * 0.6));
    this.scene.background = sky; if (this.scene.fog) this.scene.fog.color.copy(sky);
  }
  // economia: a sombra do sol é recalculada a cada 2 quadros (metade do trabalho da sombra, diferença invisível)
  render() {
    const sm = this.renderer.shadowMap;
    if (sm.enabled) { sm.autoUpdate = !this.eco; if (this.eco) sm.needsUpdate = (this._sf = ((this._sf || 0) + 1) % 2) === 0 || this.dirty; }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- interação ----------
  ndc(cx, cy) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); }
  groundAt(cx, cy) { this.raycaster.setFromCamera(this.ndc(cx, cy), this.camera); const hit = this.raycaster.intersectObject(this.ground, false)[0]; if (hit) return hit.point; const p = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(this.plane, p) ? p : null; }
  pickEntity(cx, cy) {
    this.raycaster.setFromCamera(this.ndc(cx, cy), this.camera);
    const hits = this.raycaster.intersectObjects([this.layers.animals, this.layers.staff, this.layers.facs, this.layers.habs], true);
    for (const hh of hits) { let o = hh.object; while (o && !o.userData?.kind) o = o.parent; if (o) return { kind: o.userData.kind, id: o.userData.id }; }
    return null;
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); const r = this.renderer.domElement; return { x: (v.x + 1) / 2 * r.clientWidth, y: (1 - v.y) / 2 * r.clientHeight, vis: v.z < 1 && v.z > -1 }; }
  showPreview(x0, y0, w, h, ok, height = 0.3) {
    const a = tileToWorld(x0, y0); this.prev.visible = true;
    const cx = a.x - TILE / 2 + (w * TILE) / 2, cz = a.z - TILE / 2 + (h * TILE) / 2, by = this._s ? heightAt(this._s, cx, cz) : 0; this.prev.scale.set(w * TILE, height, h * TILE); this.prev.position.set(cx, by + height / 2, cz);
    this.prev.material.color.set(ok ? '#4caf50' : '#e53935'); this.dirty = true;
  }
  hidePreview() { this.prev.visible = false; this.cellsPrev.count = 0; this.dirty = true; }
  // prévia bloco a bloco (habitat com formato livre): verde = entra, vermelho = fica de fora/inválido
  showCells(list, color, height = 0.5) {
    const m = new THREE.Matrix4(), cp = this.cellsPrev, n = Math.min(list.length, 1200); cp.material.color.set(color);
    for (let k = 0; k < n; k++) { const i = list[k], p = tileToWorld(i % MAP, (i / MAP) | 0), y = this._s ? heightAt(this._s, p.x, p.z) : 0; m.makeScale(1, height, 1); m.setPosition(p.x, y + height / 2, p.z); cp.setMatrixAt(k, m); }
    cp.count = n; cp.instanceMatrix.needsUpdate = true; this.dirty = true;
  }
  setGrid(v) { this.grid.visible = v; }
  showSelection(x, z, r) { this.dirty = true; this.sel.visible = true; this.sel.position.set(x, (this._s ? walkY(this._s, x, z) : 0) + 0.08, z); this.sel.scale.setScalar(r); }
  hideSelection() { this.dirty = true; this.sel.visible = false; }
}
