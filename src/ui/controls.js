import * as THREE from 'three';
import { HALF, worldToTile, idx, inMap, walkY, heightAt } from '../sim/grid.js';

// Câmera do gerente pensada para toque:
// 1 dedo = mover (com inércia) · pinça = zoom na direção dos dedos · 2 dedos girando = rodar
// 2 dedos arrastando na vertical = inclinar · toque duplo = aproximar · botões na tela para girar/inclinar.
// Cada gesto de 2 dedos "trava" num modo depois de um pequeno movimento, para não misturar zoom com rotação.
const PITCH_MIN = 0.22, PITCH_MAX = 1.45, DIST_MIN = 8, DIST_MAX = 150, LOCK_PX = 14;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hit = new THREE.Vector3();

export class Controls {
  constructor(el, world, getState, ui) {
    this.el = el; this.world = world; this.getState = getState; this.ui = ui;
    this.mode = 'manager';
    this.cam = { x: 0, z: 18, y: 0, dist: innerWidth < innerHeight ? 105 : 75, yaw: 0, pitch: 0.95 };
    this.live = { x: 0, z: 0, yaw: 0, pitch: 0, jx: 0, jy: 0 };
    this.ptrs = new Map(); this.keys = {}; this.vel = { x: 0, y: 0 }; this.hold = null; this.anim = null; this.lastTap = null;
    const on = (t, f, o) => el.addEventListener(t, f, o);
    on('pointerdown', e => this.down(e)); on('pointermove', e => this.move(e));
    on('pointerup', e => this.up(e)); on('pointercancel', e => this.up(e, true));
    on('wheel', e => { e.preventDefault(); this.ui.gesture?.('zoom'); this.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });
    on('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; this.keys[e.key.toLowerCase()] = true; });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }
  // ---------- utilidades ----------
  clampTarget() { const c = this.cam; c.x = Math.max(-HALF, Math.min(HALF, c.x)); c.z = Math.max(-HALF, Math.min(HALF, c.z)); }
  zoom(f) { this.cam.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, this.cam.dist * f)); }
  centerOn(x, z, dist) { this.anim = null; this.cam.x = x; this.cam.z = z; if (dist) this.cam.dist = dist; this.vel.x = this.vel.y = 0; }
  flyTo(x, z, dist) { this.anim = { x, z, dist: dist ?? this.cam.dist }; this.vel.x = this.vel.y = 0; }
  resetView() { this.anim = { yaw: Math.round(this.cam.yaw / (Math.PI * 2)) * Math.PI * 2, pitch: 0.95 }; }
  // ponto do chão (na altura do alvo) sob um ponto da tela
  groundPoint(cx, cy) {
    const cam = this.world.camera, r = this.world.renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam); plane.set(new THREE.Vector3(0, 1, 0), -this.cam.y);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }
  // zoom mantendo fixo o ponto do chão sob os dedos
  zoomAt(f, cx, cy) {
    const a = this.groundPoint(cx, cy); const d0 = this.cam.dist; this.zoom(f);
    if (!a || this.cam.dist === d0) return;
    this.apply(); const b = this.groundPoint(cx, cy); if (!b) return;
    this.cam.x += a.x - b.x; this.cam.z += a.z - b.z; this.clampTarget(); this.apply();
  }
  pan(dx, dy) {
    const k = this.cam.dist * 0.0021 * (1.25 - this.cam.pitch * 0.25), c = this.cam, r = [Math.cos(c.yaw), -Math.sin(c.yaw)], f = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
    c.x -= r[0] * dx * k; c.z -= r[1] * dx * k; c.x += f[0] * dy * k; c.z += f[1] * dy * k;
    this.clampTarget(); if (this.world.camera) this.apply();
  }
  tilt(d) { this.cam.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.cam.pitch + d)); }
  gest() { const [a, b] = [...this.ptrs.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), ay: a.y, by: b.y }; }
  // ---------- toque ----------
  down(e) {
    if (e.target !== this.world.renderer.domElement) return;
    this.el.setPointerCapture?.(e.pointerId); this.vel.x = this.vel.y = 0; this.anim = null;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), btn: e.button, hist: [] });
    if (this.ptrs.size === 2) { if (this.dragging) { this.ui.toolCancel(); this.dragging = false; } this.g = this.gest(); this.g0 = this.g; this.lock = null; this.ui.gesture?.('two'); }
  }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const now = performance.now(); p.hist.push([now, dx, dy]); while (p.hist.length && now - p.hist[0][0] > 90) p.hist.shift();
    if (this.mode === 'live') { this.live.yaw -= dx * 0.005; this.live.pitch = Math.max(-1.2, Math.min(1.2, this.live.pitch - dy * 0.004)); return; }
    if (this.ptrs.size >= 2) { if (this.ptrs.size === 2) this.twoFinger(); return; }
    const far = Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7;
    if (p.btn === 2) { this.cam.yaw -= dx * 0.006; this.tilt(dy * 0.004); return; }
    if (this.ui.toolWantsDrag()) {
      if (!this.dragging && far) { this.dragging = true; this.ui.toolDragStart(p.sx, p.sy); }
      if (this.dragging) this.ui.toolDrag(e.clientX, e.clientY);
      return;
    }
    if (far || this.panning) { if (!this.panning) this.ui.gesture?.('pan'); this.panning = true; this.pan(dx, dy); }
  }
  twoFinger() {
    const g = this.gest(), o = this.g, s = this.g0; this.g = g;
    if (!this.lock) {
      const pinch = Math.abs(g.d - s.d);
      let da = g.ang - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); const rot = Math.abs(da) * s.d / 2;
      const mdx = g.mx - s.mx, mdy = g.my - s.my, pan = Math.hypot(mdx, mdy);
      // inclinar: os dois dedos sobem/descem juntos, lado a lado
      const [a0, b0] = [s.ay, s.by], ady = g.ay - a0, bdy = g.by - b0;
      const parallel = Math.sign(ady) === Math.sign(bdy) && Math.min(Math.abs(ady), Math.abs(bdy)) > Math.max(Math.abs(ady), Math.abs(bdy)) * 0.45;
      const side = Math.abs(Math.cos(s.ang)) > 0.55, tiltOk = parallel && side && Math.abs(mdy) > Math.abs(mdx) * 1.6 && !this.ui.toolWantsDrag();
      const best = Math.max(pinch, rot, pan);
      if (best < LOCK_PX) return;
      this.lock = tiltOk && Math.abs(mdy) >= best * 0.8 ? 'tilt' : rot === best && rot > pinch * 1.2 ? 'rotate' : pinch === best ? 'zoom' : 'pan';
      this.ui.gesture?.(this.lock);
      return;
    }
    if (this.lock === 'tilt') { this.tilt((g.my - o.my) * 0.004); return; }
    if (this.lock === 'rotate') {
      // roda em torno do ponto entre os dedos
      const a = this.groundPoint(g.mx, g.my);
      let da = g.ang - o.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); this.cam.yaw -= da;
      if (a) { this.apply(); const b = this.groundPoint(g.mx, g.my); if (b) { this.cam.x += a.x - b.x; this.cam.z += a.z - b.z; this.clampTarget(); } this.apply(); }
      return;
    }
    // zoom e mover juntos (movimento natural de pinça)
    this.pan(g.mx - o.mx, g.my - o.my);
    if (o.d > 10 && g.d > 10) this.zoomAt(o.d / g.d, g.mx, g.my);
  }
  up(e, cancel) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId);
    if (this.ptrs.size === 1) { this.g = null; this.lock = null; const q = [...this.ptrs.values()][0]; q.sx = q.x; q.sy = q.y; q.moved = true; q.hist = []; return; }
    if (this.ptrs.size) return;
    this.lock = null;
    if (this.dragging) { this.dragging = false; if (!cancel) this.ui.toolDragEnd(e.clientX, e.clientY); this.panning = false; return; }
    if (this.panning && !p.moved && p.hist.length) {
      // inércia: velocidade dos últimos ~90 ms
      const span = Math.max(16, performance.now() - p.hist[0][0]); let sx = 0, sy = 0; for (const [, a, b] of p.hist) { sx += a; sy += b; }
      this.vel.x = sx / span * 16; this.vel.y = sy / span * 16;
    }
    const now = performance.now();
    const tap = !cancel && !p.moved && !this.panning && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8 && now - p.t < 450;
    this.panning = false;
    if (tap && this.mode === 'manager' && p.btn !== 2) {
      const L = this.lastTap;
      if (!this.ui.tool && L && now - L.t < 320 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 30) {
        this.lastTap = null; const a = this.groundPoint(e.clientX, e.clientY);
        if (a) this.anim = { x: this.cam.x + (a.x - this.cam.x) * 0.5, z: this.cam.z + (a.z - this.cam.z) * 0.5, dist: Math.max(DIST_MIN, this.cam.dist * 0.5) };
        this.ui.gesture?.('doubletap');
        return;
      }
      this.lastTap = { t: now, x: e.clientX, y: e.clientY };
      this.ui.tap(e.clientX, e.clientY);
    }
  }
  // botões na tela (segurar = repetir)
  setHold(kind) { this.hold = kind; this.anim = null; }
  enterLive(x, z) { this.mode = 'live'; this.live.x = x; this.live.z = z; this.live.yaw = 0; this.live.pitch = 0; this.world.camera.fov = 70; this.world.camera.updateProjectionMatrix(); }
  exitLive() { this.mode = 'manager'; this.cam.x = this.live.x; this.cam.z = this.live.z; this.world.camera.fov = 50; this.world.camera.updateProjectionMatrix(); }
  blocked(s, x, z) { const t = worldToTile(x, z); if (!inMap(t.tx, t.ty)) return true; const i = idx(t.tx, t.ty); return s._occ.hab[i] || s._occ.fac[i] || s.terrain[i] === 'w'; }
  // posiciona a câmera a partir do alvo, sempre acima do terreno
  apply() {
    const c = this.cam, cam = this.world.camera, s = this.getState();
    const cp = Math.cos(c.pitch);
    let x = c.x + Math.sin(c.yaw) * cp * c.dist, z = c.z + Math.cos(c.yaw) * cp * c.dist, y = c.y + Math.sin(c.pitch) * c.dist;
    if (s?.height) { const gx = Math.max(-HALF + 1, Math.min(HALF - 1, x)), gz = Math.max(-HALF + 1, Math.min(HALF - 1, z)); y = Math.max(y, heightAt(s, gx, gz) + 2.5, (inside(x, z) ? walkY(s, x, z) : 0) + 2.5); }
    cam.position.set(x, y, z); cam.lookAt(c.x, c.y, c.z); cam.updateMatrixWorld();
  }
  update(dt) {
    const cam = this.world.camera;
    if (this.mode === 'live') {
      const L = this.live, s = this.getState();
      let fx = -L.jy, sx = L.jx;
      if (this.keys['w'] || this.keys['arrowup']) fx += 1; if (this.keys['s'] || this.keys['arrowdown']) fx -= 1;
      if (this.keys['a'] || this.keys['arrowleft']) sx -= 1; if (this.keys['d'] || this.keys['arrowright']) sx += 1;
      const sp = 3.2 * dt, fw = [-Math.sin(L.yaw), -Math.cos(L.yaw)], rt = [Math.cos(L.yaw), -Math.sin(L.yaw)];
      const nx = L.x + (fw[0] * fx + rt[0] * sx) * sp, nz = L.z + (fw[1] * fx + rt[1] * sx) * sp;
      if (!this.blocked(s, nx, L.z)) L.x = nx; if (!this.blocked(s, L.x, nz)) L.z = nz;
      const ey = walkY(s, L.x, L.z) + 1.7; cam.position.set(L.x, ey, L.z);
      cam.lookAt(L.x - Math.sin(L.yaw) * Math.cos(L.pitch), ey + Math.sin(L.pitch), L.z - Math.cos(L.yaw) * Math.cos(L.pitch));
      return;
    }
    const c = this.cam, s = this.getState();
    if (this.keys['w']) this.pan(0, 400 * dt); if (this.keys['s']) this.pan(0, -400 * dt); if (this.keys['a']) this.pan(400 * dt, 0); if (this.keys['d']) this.pan(-400 * dt, 0);
    if (this.keys['q']) c.yaw += dt * 1.5; if (this.keys['e']) c.yaw -= dt * 1.5;
    if (this.keys['r']) this.tilt(dt); if (this.keys['f']) this.tilt(-dt);
    // botões segurados
    const H = this.hold;
    if (H === 'esq') c.yaw += dt * 1.6; else if (H === 'dir') c.yaw -= dt * 1.6;
    else if (H === 'cima') this.tilt(dt * 0.9); else if (H === 'baixo') this.tilt(-dt * 0.9);
    else if (H === 'mais') this.zoom(Math.exp(-dt * 1.4)); else if (H === 'menos') this.zoom(Math.exp(dt * 1.4));
    // inércia
    if (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 0.05 && !this.ptrs.size) { this.pan(this.vel.x * dt * 60, this.vel.y * dt * 60); const f = Math.exp(-dt * 4.5); this.vel.x *= f; this.vel.y *= f; }
    else this.vel.x = this.vel.y = 0;
    // animações (toque duplo, voltar ao norte, ir até)
    const A = this.anim;
    if (A) {
      const k = 1 - Math.exp(-dt * 7); let done = true;
      for (const key of ['x', 'z', 'dist', 'yaw', 'pitch']) if (A[key] != null) { c[key] += (A[key] - c[key]) * k; if (Math.abs(A[key] - c[key]) > (key === 'x' || key === 'z' || key === 'dist' ? 0.05 : 0.002)) done = false; }
      if (done) this.anim = null;
    }
    // altura do alvo acompanha o relevo (suave)
    if (s?.height) { const ty = Math.max(0, heightAt(s, Math.max(-HALF + 1, Math.min(HALF - 1, c.x)), Math.max(-HALF + 1, Math.min(HALF - 1, c.z)))); c.y += (ty - c.y) * Math.min(1, dt * 5); }
    this.apply();
  }
}
const inside = (x, z) => x > -HALF && x < HALF && z > -HALF && z < HALF;
