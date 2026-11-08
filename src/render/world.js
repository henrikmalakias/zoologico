import * as THREE from 'three';
import { Kit, buildAnimal, animateAnimal, buildPerson, buildPlant, buildFacility, buildVehicle, buildTool, buildCones } from './models.js';
import { ModelLibrary, animateSDFAnimal, animateSDFHuman } from './library.js';
import { instance as sdfInstance } from './sdfThree.js';
let LIB = null; export const library = () => (LIB ||= new ModelLibrary());
import { content } from '../content/registry.js';
import { MAP, TILE, HALF, idx, tileToWorld, AREAS, CW, heightAt, walkY, WATER_Y, bridgeTiles } from '../sim/grid.js';
import { hourOf } from '../sim/util.js';
import { UltraSky, loadTerrainArrays, terrainData, fillTerrainData, terrainMaterial, waterNormalTexture, Grass, addFur, addSkinDetail } from './ultra.js';

const C3 = c => new THREE.Color(c);
const SKY = { night: C3('#0d1a33'), dawn: C3('#e9a36a'), day: C3('#8fc6ea') };
const VCOLS = ['#d64545', '#3a7bd5', '#f2c230', '#4caf50', '#9c27b0', '#ff8a3d', '#e0e0e0', '#26a69a'];

export class World {
  constructor(container, quality) { this.container = container; this.build(quality); }
  build(q) {
    this.q = q; this.hi = q !== 'baixo'; this.ultra = q === 'ultra'; this.kit = new Kit(q);
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.hi, powerPreference: this.hi ? 'high-performance' : 'low-power' });
    r.setPixelRatio((this.hi ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1)) * (this.pxScale ?? 1));
    r.setSize(this.container.clientWidth, this.container.clientHeight);
    if (this.hi) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.ultra ? 0.92 : 1.05; }
    this.container.prepend(r.domElement); r.domElement.className = 'gl';
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.3, this.ultra ? 900 : 600);
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5a6b3a', 0.9); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.0); sc.add(this.sun); sc.add(this.sun.target);
    if (this.hi) {
      const s = this.sun.shadow; this.sun.castShadow = true; s.mapSize.set(2048, 2048);
      Object.assign(s.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 300 }); s.bias = -0.0005; s.normalBias = 0.04;
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
    this.layers = {}; for (const k of ['habs', 'facs', 'objs', 'animals', 'staff', 'fx']) { this.layers[k] = new THREE.Group(); sc.add(this.layers[k]); }
    this.maps = { habs: new Map(), facs: new Map(), objs: new Map(), animals: new Map(), staff: new Map() };
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
    this.sel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe14d' })); this.sel.visible = false; sc.add(this.sel);
    this.raycaster = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.cache = { terrain: null, area: -1, ver: -1, litterSig: '', hver: -1 };
    this.t = 0;
  }
  setQuality(q, s) { if (q === this.q) return; this.dispose(); this.build(q); if (s) this.update(s, 0); }
  dispose() {
    this.renderer.dispose(); this.renderer.domElement.remove(); this.kit.dispose(); this.ttex.dispose();
    this.usky?.dispose(); this.grass?.dispose(); this.tarr?.cor.dispose(); this.tarr?.nor.dispose(); this.tdata?.dispose(); this.waterMat.normalMap?.dispose();
    this.usky = this.grass = this.tarr = this.tdata = null;
    this.scene.traverse(o => { if (o.isInstancedMesh || o === this.ground) o.geometry.dispose(); });
  }
  setPixelScale(k) { this.pxScale = k; this.renderer.setPixelRatio((this.hi ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1)) * k); this.resize(); }
  resize() { const w = this.container.clientWidth, h = this.container.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------- terreno ----------
  paintTile(s, i, locked) {
    const C = content(s), t = s.terrain[i], x = i % MAP, y = (i / MAP) | 0, p = this.ppt, g = this.tg;
    const base = C3(C.terrains[t]?.cor || '#7d9b45'); if (locked) base.multiplyScalar(0.62);
    if (!this.hi) { g.fillStyle = '#' + base.getHexString(); g.fillRect(x * p, y * p, p, p); return; }
    const img = g.createImageData(p, p); let seed = i * 9301 + 49297;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < p * p; k++) {
      const px = k % p, py = (k / p) | 0; let v = 0.9 + rnd() * 0.2;
      if (t === 'p' && (px === 0 || py === 0 || (py === p >> 1 && px > 0) )) v *= 0.86;
      if (t === 'g' && rnd() < 0.08) v *= 1.18; if (t === 'r' && rnd() < 0.15) v *= 0.8;
      img.data[k * 4] = Math.min(255, base.r * 255 * v); img.data[k * 4 + 1] = Math.min(255, base.g * 255 * v); img.data[k * 4 + 2] = Math.min(255, base.b * 255 * v); img.data[k * 4 + 3] = 255;
    }
    g.putImageData(img, x * p, y * p);
  }
  syncTerrain(s) {
    const a = AREAS[s.areaLevel], prev = this.cache.terrain, areaChanged = this.cache.area !== s.areaLevel;
    let changed = false, water = false;
    for (let i = 0; i < MAP * MAP; i++) {
      if (!areaChanged && prev && prev[i] === s.terrain[i]) continue;
      const x = i % MAP, y = (i / MAP) | 0; this.paintTile(s, i, !(x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1)); changed = true;
      if (s.terrain[i] === 'w' || (prev && prev[i] === 'w')) water = true;
    }
    if (changed) { this.ttex.needsUpdate = true; this.cache.terrain = s.terrain.slice(); this.cache.area = s.areaLevel; this.tsig = (this.tsig || 0) + 1; if (this.tdata) fillTerrainData(this.tdata, s); }
    if (water || !this.waterBuilt) this.rebuildWater(s);
    if (s.height && this.cache.hver !== (s._hver || 0)) {
      this.cache.hver = s._hver || 0; const pos = this.ground.geometry.attributes.position;
      for (let i = 0; i < CW * CW; i++) pos.setY(i, s.height[i]);
      pos.needsUpdate = true; this.ground.geometry.computeVertexNormals(); this.ground.geometry.computeBoundingSphere();
    }
  }
  rebuildWater(s) {
    this.waterBuilt = true;
    for (const c of [...this.waterG.children]) { c.geometry.dispose(); this.waterG.remove(c); }
    const tiles = []; for (let i = 0; i < MAP * MAP; i++) if (s.terrain[i] === 'w') tiles.push(i);
    if (!tiles.length) return;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2), this.waterMat, tiles.length);
    const m = new THREE.Matrix4(); tiles.forEach((i, k) => { const p = tileToWorld(i % MAP, (i / MAP) | 0); m.makeTranslation(p.x, WATER_Y, p.z); im.setMatrixAt(k, m); });
    im.receiveShadow = this.hi; this.waterG.add(im);
  }

  // ---------- habitats ----------
  habKey(h, s) {
    let hs = 0; if (s.height) for (let y = h.y; y <= h.y + h.h; y++) for (let x = h.x; x <= h.x + h.w; x += (y === h.y || y === h.y + h.h) ? 1 : h.w) hs += s.height[y * CW + x] * (x + 1);
    return [h.x, h.y, h.w, h.h, h.fence, h.gateOpen, Math.round(h.fenceHp * 5), Math.round(h.food * 4), Math.round(h.waterLvl * 4), (h.breaches || []).map(b => b.side + b.k).join(), hs.toFixed(1)].join('|');
  }
  buildHabitat(s, h) {
    const k = this.kit, g = new THREE.Group(), C = content(s), F = C.fences[h.fence] || {}, Y = (x, z) => heightAt(s, x, z);
    const x0 = h.x * TILE - HALF, x1 = (h.x + h.w) * TILE - HALF, z0 = h.y * TILE - HALF, z1 = (h.y + h.h) * TILE - HALF;
    const wear = 1 - h.fenceHp, isMuro = h.fence === 'muro', isTela = !!F.teto, isFosso = !!F.fosso;
    const col = isMuro ? C3('#b7a588').lerp(C3('#6e6252'), wear) : C3(isTela ? '#2f3a33' : '#3d4146').lerp(C3('#8a4b24'), wear);
    const mat = k.mat('#' + col.getHexString(), { metal: isMuro ? 0 : 0.5, rough: isMuro ? 0.95 : 0.45 });
    const H = isMuro ? 3 : isTela ? 3.2 : 2.4;
    const br = new Set((h.breaches || []).map(b => b.side + ':' + b.k));
    const sides = { S: [x0, z1, x1, z1], N: [x0, z0, x1, z0], L: [x1, z0, x1, z1], O: [x0, z0, x0, z1] };
    const add = (geo, m, x, y, z) => { const o = k.mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    const beam = (geo, m, ax, ay, az, bx, by, bz) => { const o = k.mesh(geo, m); o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); o.lookAt(bx, by, bz); g.add(o); return o; };
    const seg = (ax, az, bx, bz) => {
      const ha = Y(ax, az), hb = Y(bx, bz), dh = Math.abs(ha - hb), len = Math.hypot(bx - ax, bz - az), l3 = Math.hypot(len, hb - ha);
      if (isMuro) {
        const hh = H + dh + 0.3, w = add(k.box(0.45, hh, len), mat, (ax + bx) / 2, Math.min(ha, hb) - 0.3 + hh / 2, (az + bz) / 2); w.rotation.y = Math.atan2(bx - ax, bz - az);
        beam(k.box(0.6, 0.15, l3 + 0.1), k.mat('#8d7e66'), ax, ha + H, az, bx, hb + H, bz);
      } else if (isFosso) {
        const hh = 0.9 + dh, w = add(k.box(0.35, hh, len), k.mat('#a89a80'), (ax + bx) / 2, Math.min(ha, hb) + hh / 2 - 0.05, (az + bz) / 2); w.rotation.y = Math.atan2(bx - ax, bz - az);
      } else {
        for (const yy of [0.35, 1.3, H - 0.15]) beam(k.box(0.07, 0.07, l3), mat, ax, ha + yy, az, bx, hb + yy, bz);
        add(k.cyl(0.07, 0.07, H), mat, ax, ha + H / 2, az);
        if (this.hi) { const nb = 7, bars = new THREE.InstancedMesh(k.cyl(0.018, 0.018, H - 0.2), mat, nb), m = new THREE.Matrix4();
          for (let i = 0; i < nb; i++) { const f = (i + 0.5) / nb; m.makeTranslation(ax + (bx - ax) * f, ha + (hb - ha) * f + H / 2, az + (bz - az) * f); bars.setMatrixAt(i, m); } bars.castShadow = true; g.add(bars); }
      }
    };
    const debris = (ax, az, bx, bz) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, y = Y(cx, cz);
      for (let i = 0; i < 4; i++) { const o = add(isMuro ? k.box(0.5, 0.3, 0.4) : k.box(0.07, 0.07, 1.6), isMuro ? mat : mat, cx + (i - 1.5) * 0.45, y + 0.15, cz + ((i * 37) % 5 - 2) * 0.25); o.rotation.set(0.1 * i, i * 1.3, 1.2 + i * 0.2); }
      const p = add(k.cyl(0.07, 0.07, H), mat, ax, Y(ax, az) + 0.1, az); p.rotation.z = 1.35;
    };
    for (const [sd, [ax, az, bx, bz]] of Object.entries(sides)) {
      const horiz = sd === 'S' || sd === 'N', n = horiz ? h.w : h.h, gk = horiz ? h.gateIn[0] - h.x : h.gateIn[1] - h.y;
      for (let i = 0; i < n; i++) {
        const sx = ax + (horiz ? i * TILE : 0), sz = az + (horiz ? 0 : i * TILE), ex = sx + (horiz ? TILE : 0), ez = sz + (horiz ? 0 : TILE);
        if (sd === h.side && i === gk) {
          if (isFosso) continue;
          const hinge = new THREE.Group(); hinge.position.set(sx, Y(sx, sz), sz);
          const gate = k.mesh(k.box(0.08, H * 0.85, TILE), k.mat(isMuro ? '#6b4a2b' : '#2b2f33')); gate.position.set(0, H * 0.43, TILE / 2);
          if (horiz) hinge.rotation.y = Math.PI / 2;
          hinge.add(gate); if (h.gateOpen) hinge.rotation.y += sd === 'S' || sd === 'L' ? -1.4 : 1.4; g.add(hinge);
          if (!isMuro) add(k.cyl(0.07, 0.07, H), mat, sx, Y(sx, sz) + H / 2, sz);
          continue;
        }
        if (br.has(sd + ':' + i)) { debris(sx, sz, ex, ez); continue; }
        seg(sx, sz, ex, ez);
      }
      if (!isMuro && !isFosso) add(k.cyl(0.07, 0.07, H), mat, bx, Y(bx, bz) + H / 2, bz);
      if (isMuro && F.plataforma && sd === h.side) {
        const gc = horiz ? tileToWorld(h.gateIn[0], 0).x : tileToWorld(0, h.gateIn[1]).z, b0 = horiz ? bx : bz;
        const off = sd === 'S' ? [0, 1.6] : sd === 'N' ? [0, -1.6] : sd === 'L' ? [1.6, 0] : [-1.6, 0];
        const v = gc + (b0 - gc) * 0.5, px = horiz ? v : ax, pz = horiz ? az : v, y = Y(px + off[0], pz + off[1]);
        add(k.box(horiz ? 4 : 2, 0.25, horiz ? 2 : 4), k.mat('#8d7e66'), px + off[0], y + 1.3, pz + off[1]);
        for (const l of [-1, 1]) add(k.box(0.2, 1.3, 0.2), k.mat('#6b5d4a'), px + off[0] + (horiz ? l * 1.7 : 0), y + 0.65, pz + off[1] + (horiz ? 0 : l * 1.7));
      }
    }
    if (isTela) { // rede por cima (viveiro)
      let top = -9; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) top = Math.max(top, Y(x, z));
      const net = k.tex('rede', () => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'); q.strokeStyle = 'rgba(40,48,44,0.9)'; q.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { q.beginPath(); q.moveTo(i, 0); q.lineTo(i, 64); q.stroke(); q.beginPath(); q.moveTo(0, i); q.lineTo(64, i); q.stroke(); } return c; });
      const nm = new THREE.MeshStandardMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }); nm.map.repeat.set(h.w, h.h);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), nm); roof.position.set((x0 + x1) / 2, top + H, (z0 + z1) / 2); g.add(roof);
      for (let i = 1; i < 3; i++) { const z = z0 + (z1 - z0) * i / 3; beam(k.box(0.08, 0.08, x1 - x0), mat, x0, top + H, z, x1, top + H, z); }
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
    return g;
  }

  // ---------- sincronização ----------
  syncStatic(s) {
    const C = content(s);
    const syncSet = (map, layer, list, key, make) => {
      const seen = new Set();
      for (const e of list) {
        seen.add(e.id); const k = key(e), cur = map.get(e.id);
        if (cur && cur.k === k) continue;
        if (cur) { layer.remove(cur.o); }
        const o = make(e); if (!o) continue; layer.add(o); map.set(e.id, { o, k });
      }
      for (const [id, v] of map) if (!seen.has(id)) { layer.remove(v.o); map.delete(id); }
    };
    syncSet(this.maps.habs, this.layers.habs, s.habitats, h => this.habKey(h, s), h => this.buildHabitat(s, h));
    syncSet(this.maps.facs, this.layers.facs, s.facilities.filter(f => C.facilities[f.type]), f => f.type + f.tx + ',' + f.ty + ':' + heightAt(s, ...Object.values(tileToWorld(f.tx, f.ty))).toFixed(1), f => {
      const D = C.facilities[f.type], o = buildFacility(this.kit, f.type, D);
      const p = tileToWorld(f.tx, f.ty); o.position.set(p.x - TILE / 2 + D.w, heightAt(s, p.x - TILE / 2 + D.w, p.z - TILE / 2 + D.h), p.z - TILE / 2 + D.h);
      if (f.type === 'entrada') o.rotation.y = 0; o.userData = { kind: 'fac', id: f.id }; return o; });
    syncSet(this.maps.objs, this.layers.objs, s.objects.filter(o => C.plants[o.type]), o => o.type + o.tx + ',' + o.ty + ':' + heightAt(s, ...Object.values(tileToWorld(o.tx, o.ty))).toFixed(1), o => {
      const m = buildPlant(this.kit, o.type), p = tileToWorld(o.tx, o.ty); m.position.set(p.x, heightAt(s, p.x, p.z), p.z); m.rotation.y = o.rot || 0; m.scale.setScalar(o.sc || 1); return m; });
  }
  update(s, dt) {
    this.t += dt; this._s = s;
    this.syncTerrain(s);
    this.syncStatic(s);
    const C = content(s), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    // animais
    const L = this.hi ? library() : null, seen = new Set();
    for (const a of s.animals) {
      if (!C.species[a.sp]) continue; seen.add(a.id);
      const vkey = a.sp === 'leao' || a.sp === 'gorila' ? a.sp + ':' + a.sex : a.sp + ':F';
      let tpl = null; if (L) { L.request(vkey); tpl = L.get(vkey); if (tpl && this.ultra && !tpl.userData.ultra) { tpl.userData.ultra = true; tpl.userData.baseMat = tpl.children[0].material; addFur(tpl, a.sp); addSkinDetail(tpl, a.sp); tpl.userData.skinMat = tpl.children[0].material; tpl.children[0].material = tpl.userData.baseMat; } }
      const kind = tpl ? 'sdf' : 'proc';
      let e = this.maps.animals.get(a.id);
      if (e && e.kind !== kind) { this.layers.animals.remove(e.o); e = null; }
      if (!e) { const o = tpl ? sdfInstance(tpl) : buildAnimal(this.kit, a.sp, a.sex === 'M'); o.userData.kind = 'animal'; o.userData.id = a.id; o.position.set(a.x, 0, a.z); this.layers.animals.add(o); e = { o, px: a.x, pz: a.z, kind }; this.maps.animals.set(a.id, e); }
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
        if (tpl?.userData.ultra) { const near = this.ultra && this.camera.position.distanceToSquared(o.position) < 1600; for (const c of o.children) if (c.userData.fur) c.visible = near; o.children[0].material = this.ultra ? tpl.userData.skinMat : tpl.userData.baseMat; }
      } else animateAnimal(o, a, dt, moving);
    }
    for (const [id, e] of this.maps.animals) if (!seen.has(id)) { this.layers.animals.remove(e.o); this.maps.animals.delete(id); }
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
  render() { this.renderer.render(this.scene, this.camera); }

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
    this.prev.material.color.set(ok ? '#4caf50' : '#e53935');
  }
  hidePreview() { this.prev.visible = false; }
  setGrid(v) { this.grid.visible = v; }
  showSelection(x, z, r) { this.sel.visible = true; this.sel.position.set(x, (this._s ? walkY(this._s, x, z) : 0) + 0.08, z); this.sel.scale.setScalar(r); }
  hideSelection() { this.sel.visible = false; }
}
