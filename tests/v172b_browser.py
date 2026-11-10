# 1.7.2b: toca com vidro (animal dentro, porta fechada), rotina (poses), AO VIVO dentro do recinto, ponte da ilha e aviso do modo selvagem.
# Uso: python3 tests/v172b_browser.py [baixo|alto|ultra] [prefixo]   (servidor em http://localhost:8765 com a pasta dist)
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'alto'
PRE = sys.argv[2] if len(sys.argv) > 2 else '72b'
SETUP = """(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.settings.fugas = false; s.money = 3e6; s.clock.speed = 1; s.clock.min = 10 * 60;
  const sv = A.placeHabitat(s, 24, 38, 35, 49, 'savana', 'ferro').hab;
  for (const [x, y, t] of [[26, 40, 'acacia'], [33, 47, 'baoba'], [26, 47, 'arbusto_seco']]) A.placePlant(s, x, y, t);
  const t1 = A.placeToca(s, 29, 41), t2 = A.placeToca(s, 31, 45);
  for (const sp of ['leao', 'leao', 'leao', 'zebra', 'zebra', 'flamingo', 'flamingo', 'elefante']) A.buyAnimal(s, sp, 26, 44);
  const fl = A.placeHabitat(s, 40, 38, 49, 47, 'floresta', 'muro').hab; A.placePlant(s, 42, 40, 'arvore_floresta'); const t3 = A.placeToca(s, 44, 42);
  for (let k = 0; k < 3; k++) A.buyAnimal(s, 'gorila', 47, 45);
  const il = A.placeHabitat(s, 24, 25, 33, 34, 'savana', 'fosso'); A.buyAnimal(s, 'zebra', 28, 29); A.buyAnimal(s, 'zebra', 28, 29);
  g.setQuality(Q); return { t1: t1.msg, t2: t2.msg, t3: t3.msg, ilha: il.ok, tocas: s.tocas.map(t => [t.tx, t.ty, t.dir, t.porta, t.modelo]) }; }"""
POSE = """() => { const g = window.__game, s = g.state; s.clock.speed = 0;
  const C = t => ({ x: (t.tx + 1) * 2 - 72, z: (t.ty + 1) * 2 - 72 }), D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const T = s.tocas, le = s.animals.filter(a => a.sp === 'leao'), zb = s.animals.filter(a => a.sp === 'zebra'), fm = s.animals.filter(a => a.sp === 'flamingo'), el = s.animals.find(a => a.sp === 'elefante'), go = s.animals.filter(a => a.sp === 'gorila');
  const put = (a, t, slot, extra) => { const c = C(t), d = D[t.dir], k = slot ? 0.85 : -0.85; Object.assign(a, { toca: t.id, tocaSlot: slot, st: 'in_toca', x: c.x - d[1] * k, z: c.z + d[0] * k, rot: Math.atan2(d[0], d[1]), tgt: null, wp: null, stT: 9999 }, extra || {}); };
  put(le[0], T[0], 0); put(le[1], T[0], 1, { asleep: true });
  put(le[2], T[1], 0, { preso: true, guard: true }); T[1].fechada = true;
  put(go[0], T[2], 0);
  const b = C(T[0]);
  Object.assign(zb[0], { x: b.x - 7, z: b.z + 5, st: 'pastar', stT: 9999, tgt: null, rot: 1 }); Object.assign(zb[1], { x: b.x - 5, z: b.z + 7, st: 'descanso_pe', stT: 9999, tgt: null, rot: 2 });
  fm.forEach((f, i) => Object.assign(f, { x: b.x - 8 + i, z: b.z + 9, st: 'umaperna', stT: 9999, tgt: null, rot: 0.5 + i }));
  Object.assign(el, { x: b.x + 6, z: b.z + 12, st: 'poeira', stT: 9999, tgt: null, rot: 0.3 });
  Object.assign(go[1], { x: C(T[2]).x + 5, z: C(T[2]).z + 4, st: 'descanso', stT: 9999, tgt: null, rot: 2 });
  return { n: s.animals.length }; }"""
VIEWS = {'toca_vidro': (-13, 13, 0.32, 3.14, 11), 'toca_cima': (-11, 16, 0.8, 0.5, 20), 'toca_fechada': (-8, 21, 0.4, 0.9, 11), 'rotina': (-18, 24, 0.5, 0.2, 18), 'toca_madeira': (18, 14, 0.4, 3.3, 12)}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 1100, 'height': 700})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        info = await pg.evaluate(SETUP, Q); print(info)
        await pg.wait_for_timeout(9000 if Q != 'baixo' else 3000)
        await pg.evaluate(POSE); await pg.wait_for_timeout(5000 if Q != 'baixo' else 2000)
        for nome, (x, z, pit, yaw, dist) in VIEWS.items():
            await pg.evaluate(f"() => {{ const g = window.__game; g.controls.centerOn({x}, {z}, {dist}); g.controls.cam.pitch = {pit}; g.controls.cam.yaw = {yaw}; }}")
            await pg.wait_for_timeout(2200); await pg.screenshot(path=OUT + f'{PRE}_{Q}_{nome}.png')
        # painel do habitat (Visitar / Preparar visita) e aba da toca no Construir
        await pg.evaluate("() => { const g = window.__game; g.ui.select('hab', g.state.habitats[0].id); }"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + f'{PRE}_{Q}_painel.png')
        await pg.evaluate("() => { const g = window.__game; g.ui.closeSheet(); g.ui.opts.habMode = 'toca'; g.ui.cat = 'habitat'; g.ui.toggleBuild(true); }"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + f'{PRE}_{Q}_construir.png')
        await pg.evaluate("() => window.__game.ui.toggleBuild(false)")
        # AO VIVO (1.7.2c: "fantasma"): entra pelo portão do habitat 1 com leões soltos por perto; eles ignoram o jogador
        r = await pg.evaluate("""() => { const g = window.__game, s = g.state, h = s.habitats[0]; s.clock.speed = 1; g.visitar(h); const L = g.controls.live;
          const le = s.animals.filter(a => a.sp === 'leao'); for (const a of le) { a.toca = null; a.preso = false; a.guard = false; a.st = 'idle'; a.stT = 99; } s.tocas[1].fechada = false;
          const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw); Object.assign(le[0], { x: L.x + fx * 3, z: L.z + fz * 3, rot: 0 }); Object.assign(le[1], { x: L.x + fx * 11 - 3, z: L.z + fz * 11, st: 'descanso', rot: 1 });
          return { live: g.live, hab: L.hab, vo: h.visitOpen, gate: h.gateOpen }; }""")
        await pg.wait_for_timeout(5000 if Q == 'baixo' else 12000); await pg.screenshot(path=OUT + f'{PRE}_{Q}_vivo_fantasma.png')
        r3 = await pg.evaluate("() => { const g = window.__game, s = g.state, le = s.animals.filter(a => a.sp === 'leao'); return { hab: g.controls.live.hab, vo: s.habitats[0].visitOpen, estados: le.map(a => a.st), msg: document.querySelector('.visitmsg')?.textContent }; }")
        # ponte da ilha: anda pela ponte e mostra o botão Entrar
        r4 = await pg.evaluate("""() => { const g = window.__game, s = g.state, h = s.habitats[2], V = window.__api.V, p = V.pontoFora(s, h), q = V.pontoDentro(h); g.controls.irPara(p, 0, q); return { blk: g.controls.blocked(s, p.x, p.z), perto: g.portaoPerto()?.id === h.id }; }""")
        await pg.wait_for_timeout(700); await pg.screenshot(path=OUT + f'{PRE}_{Q}_ponte.png')
        r5 = await pg.evaluate("() => { const g = window.__game; document.querySelector('.visitbtn').click(); return { hab: g.controls.live.hab, vo: g.state.habitats[2].visitOpen, btn: document.querySelector('.visitbtn').textContent }; }")
        await pg.wait_for_timeout(900); await pg.screenshot(path=OUT + f'{PRE}_{Q}_ilha_dentro.png')
        r6 = await pg.evaluate("() => { const g = window.__game; g.toggleLive(); return { live: g.live, vo: g.state.habitats[2].visitOpen, hab: g.controls.live.hab }; }")
        print(r, r3, r4, r5, r6, 'erros', errs[:6]); await b.close()
asyncio.run(main())
