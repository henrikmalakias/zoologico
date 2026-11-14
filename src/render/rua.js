// 1.7.3: desenho da rua da frente — muro com o portão, calçadas, asfalto com faixas, faixa de pedestres, ponto de ônibus,
// postes, o ônibus (estado na simulação), carros passando e carros parados nos estacionamentos.
import * as THREE from 'three';
import { RUA, TILE, HALF, MAP } from '../sim/grid.js';
import { buildCar, buildBus, labelCanvas, mergeStatic } from './models.js';
import { FAIXA_OESTE_Z, FAIXA_LESTE_Z, vagaPos, estacionamentos } from '../sim/rua.js';

const zRow = y => y * TILE - HALF;             // borda norte da linha y
const xCol = x => x * TILE - HALF;
const CORES = ['#c62828', '#1565c0', '#f5f5f5', '#424242', '#2e7d32', '#f9a825', '#6d4c41', '#90a4ae'];

export class RuaView {
  constructor(kit, scene) {
    this.kit = kit; this.g = new THREE.Group(); scene.add(this.g);
    this.static = this.buildStatic(); this.g.add(this.static);
    this.bus = buildBus(kit); this.bus.visible = false; this.g.add(this.bus);
    this.traffic = []; for (let i = 0; i < 5; i++) { const c = buildCar(kit, CORES[i % CORES.length]); this.g.add(c); this.traffic.push({ o: c, lane: i % 2, off: i * 37 + (i % 2) * 11, v: 8 + (i % 3) }); }
    this.parked = []; this.t = 0;
  }
  buildStatic() {
    const k = this.kit, g = new THREE.Group(), L = MAP * TILE + 80, add = (geo, m, x, y, z) => { const o = k.mesh(geo, m, false); o.position.set(x, y, z); g.add(o); return o; };
    const asf = k.mat('#3b3e42'), calc = k.mat('#c9c5bb'), meio = k.mat('#9a978f'), branco = k.mat('#f1f1ec'), amarelo = k.mat('#f2c230'), muro = k.mat('#d8c9a8'), tij = k.mat('#a8552f');
    // asfalto (4 linhas) e calçadas (2 de cada lado), um pouco acima do chão
    const zr0 = zRow(RUA.rua[0]), zr1 = zRow(RUA.rua[1] + 1);
    add(k.box(L, 0.06, zr1 - zr0), asf, 0, 0.03, (zr0 + zr1) / 2);
    for (const [a, b] of [RUA.calcN, RUA.calcS]) { const z0 = zRow(a), z1 = zRow(b + 1); add(k.box(L, 0.16, z1 - z0), calc, 0, 0.08, (z0 + z1) / 2); add(k.box(L, 0.2, 0.2), meio, 0, 0.1, a === RUA.calcN[0] ? z1 - 0.1 : z0 + 0.1); }
    // faixa amarela dupla no meio e tracejado branco nas bordas
    const zm = zRow(RUA.rua[0] + 2); for (const dz of [-0.12, 0.12]) add(k.box(L, 0.02, 0.1), amarelo, 0, 0.065, zm + dz);
    for (let x = -L / 2; x < L / 2; x += 6) for (const z of [zr0 + 0.4, zr1 - 0.4]) add(k.box(3, 0.02, 0.12), branco, x + 1.5, 0.065, z);
    // faixa de pedestres na frente do portão
    const xp0 = xCol(RUA.portao[0]), xp1 = xCol(RUA.portao[1] + 1);
    for (let z = zr0 + 0.5; z < zr1 - 0.3; z += 0.9) add(k.box(xp1 - xp0, 0.025, 0.45), branco, (xp0 + xp1) / 2, 0.07, z);
    // muro da frente (com tijolinho embaixo), pilares e o vão do portão
    const zw = zRow(RUA.muro) + TILE / 2, h = 2.6;
    for (const [x0, x1] of [[-L / 2 + 40, xp0], [xp1, L / 2 - 40]]) {
      add(k.box(x1 - x0, h, 0.45), muro, (x0 + x1) / 2, h / 2, zw); add(k.box(x1 - x0, 0.6, 0.5), tij, (x0 + x1) / 2, 0.3, zw); add(k.box(x1 - x0 + 0.1, 0.15, 0.6), k.mat('#8d7a5a'), (x0 + x1) / 2, h + 0.07, zw);
      for (let x = x0; x <= x1 + 0.01; x += 8) add(k.box(0.7, h + 0.4, 0.7), muro, Math.min(x, x1), (h + 0.4) / 2, zw);
    }
    for (const x of [xp0, xp1]) { add(k.box(0.9, 3.6, 0.9), tij, x, 1.8, zw); add(k.sphere(0.35), k.mat('#f1e3c0'), x, 3.75, zw); }
    const lb = k.tex('lblZOOLÓGICO · ENTRADA#2e6b54', () => labelCanvas('ZOOLÓGICO · ENTRADA', '#2e6b54'));
    add(k.box(xp1 - xp0 + 0.9, 0.5, 0.1), k.mat('#ffffff', { map: lb }), (xp0 + xp1) / 2, 3.3, zw + 0.3);
    // ponto de ônibus (cobertura, banco e placa)
    const px = xCol(RUA.ponto[0]) + 1, pz = zRow(RUA.ponto[1]) + 0.6;
    add(k.box(3.2, 0.1, 1.4), k.mat('#2e6b54'), px, 2.5, pz); for (const sx of [-1.5, 1.5]) add(k.box(0.1, 2.5, 0.1), k.mat('#5b6770'), px + sx, 1.25, pz - 0.6);
    add(k.box(3, 1.6, 0.05), k.mat('#bcd9e6', { opacity: 0.45 }), px, 1.5, pz - 0.65); add(k.box(2.2, 0.08, 0.45), k.mat('#8a5a32'), px, 0.55, pz - 0.3);
    const pb = k.tex('lblÔNIBUS#f2c230', () => labelCanvas('ÔNIBUS', '#f2c230', '#1d3b52')); add(k.box(1.2, 0.35, 0.06), k.mat('#ffffff', { map: pb }), px + 2.2, 2.4, pz + 0.4); add(k.cyl(0.05, 0.05, 2.4), k.mat('#5b6770'), px + 2.2, 1.2, pz + 0.4);
    // postes nas duas calçadas
    for (let x = -HALF + 6; x < HALF; x += 16) for (const z of [zRow(RUA.calcN[1] + 1) - 0.4, zRow(RUA.calcS[0]) + 0.4]) { add(k.cyl(0.07, 0.09, 5), k.mat('#4a4f55'), x, 2.5, z); add(k.box(0.35, 0.12, 0.9), k.lamp || k.mat('#fff4c8'), x, 5, z + (z > 0 ? -0.35 : 0.35)); }
    return mergeStatic(g);
  }
  update(s, dt) {
    this.t += dt;
    // ônibus (o estado vem da simulação: chegando, parado no ponto, saindo)
    const b = s._bus; this.bus.visible = !!b;
    if (b) { this.bus.position.set(b.x, 0.06, FAIXA_OESTE_Z); this.bus.rotation.y = -Math.PI / 2; }
    // carros passando (faixa leste sempre; a faixa do lado do zoo fica livre enquanto o ônibus passa)
    const span = MAP * TILE + 60;
    for (const c of this.traffic) {
      const p = ((this.t * c.v + c.off) % span) - span / 2;
      if (c.lane) { c.o.position.set(p, 0.06, FAIXA_LESTE_Z); c.o.rotation.y = Math.PI / 2; c.o.visible = true; }
      else { const x = -p; c.o.position.set(x, 0.06, FAIXA_OESTE_Z); c.o.rotation.y = -Math.PI / 2; c.o.visible = !b || Math.abs(x - b.x) > 14; }
    }
    // carros parados: um por grupo de visitantes que veio de carro e ainda está no zoo
    const want = [];
    for (const f of estacionamentos(s)) {
      const n = s.visitors.filter(v => v.origem?.tipo === 'carro' && v.origem.est === f.id).length, k = Math.min(12, Math.ceil(n / 2) + Math.min(4, Math.floor((s.stats.visitorsIn || 0) / 25)));
      for (let i = 0; i < k; i++) { const v = (i * 5) % 12; want.push({ p: vagaPos(f, v), row: Math.floor(v / 6) }); }
    }
    while (this.parked.length < want.length) { const o = buildCar(this.kit, CORES[this.parked.length % CORES.length]); this.g.add(o); this.parked.push(o); }
    this.parked.forEach((o, i) => { const w = want[i]; o.visible = !!w; if (w) { o.position.set(w.p.x, 0.07, w.p.z); o.rotation.y = w.row ? Math.PI : 0; } }); // de frente para o corredor do meio
  }
  dispose(scene) { scene.remove(this.g); }
}
