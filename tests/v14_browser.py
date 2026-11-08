import asyncio, math
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
res = []
def ok(c, m): res.append(c); print(('ok - ' if c else 'FALHOU: ') + m)

async def touch(cdp, typ, pts):
    await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})

async def gesture(cdp, a, b, steps=12, wait=None):
    # a, b: listas de pontos iniciais e finais (1 ou 2 dedos)
    await touch(cdp, 'touchStart', a)
    for k in range(1, steps + 1):
        t = k / steps
        await touch(cdp, 'touchMove', [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) for (x0, y0), (x1, y1) in zip(a, b)])
        await asyncio.sleep(0.016)
    await touch(cdp, 'touchEnd', [])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.tap('text=Vamos lá!'); await pg.wait_for_timeout(400)
        box = await pg.evaluate("() => document.querySelector('.tut-box:not(.hidden)')?.textContent || ''")
        ok('passo 1' in box, 'tutorial aparece no jogo novo: ' + box[:60])
        await pg.screenshot(path=OUT + '20_tutorial.png')
        cam = lambda: pg.evaluate("() => { const c = window.__game.controls.cam; return { x: c.x, z: c.z, dist: c.dist, yaw: c.yaw, pitch: c.pitch }; }")
        # 1 dedo = mover
        c0 = await cam(); await gesture(cdp, [(200, 500)], [(260, 420)]); await pg.wait_for_timeout(300); c1 = await cam()
        ok(abs(c1['x'] - c0['x']) + abs(c1['z'] - c0['z']) > 2 and abs(c1['dist'] - c0['dist']) < 0.01, 'um dedo move a câmera')
        ok(await pg.evaluate("() => window.__game.state.settings.tutorial.passo") == 1, 'tutorial avançou depois de mover a câmera')
        # inércia: arrasto rápido continua depois de soltar
        await touch(cdp, 'touchStart', [(150, 500)])
        for k in range(1, 6): await touch(cdp, 'touchMove', [(150 + k * 30, 500)]); await asyncio.sleep(0.016)
        await touch(cdp, 'touchEnd', []); ca = await cam(); await pg.wait_for_timeout(500); cb = await cam()
        ok(abs(cb['x'] - ca['x']) + abs(cb['z'] - ca['z']) > 0.5, 'inércia: a câmera desliza depois de soltar (%.1f m)' % (abs(cb['x'] - ca['x']) + abs(cb['z'] - ca['z'])))
        await pg.wait_for_timeout(800)
        # pinça: zoom na direção dos dedos (o ponto do chão sob os dedos fica parado)
        c0 = await cam()
        g0 = await pg.evaluate("() => window.__game.controls.groundPoint(300, 350)")
        await gesture(cdp, [(270, 350), (330, 350)], [(200, 350), (400, 350)])
        await pg.wait_for_timeout(200); c1 = await cam()
        g1 = await pg.evaluate("() => window.__game.controls.groundPoint(300, 350)")
        ok(c1['dist'] < c0['dist'] * 0.6, 'pinça aproxima (%.0f -> %.0f)' % (c0['dist'], c1['dist']))
        ok(math.hypot(g1['x'] - g0['x'], g1['z'] - g0['z']) < 2.5, 'zoom mira os dedos (ponto do chão andou %.2f m)' % math.hypot(g1['x'] - g0['x'], g1['z'] - g0['z']))
        ok(abs(c1['yaw'] - c0['yaw']) < 0.02, 'pinça não gira a câmera (trava de gesto)')
        # dois dedos lado a lado arrastando para cima = inclinar (visão mais de lado)
        c0 = await cam(); await gesture(cdp, [(150, 560), (260, 560)], [(150, 460), (260, 460)]); await pg.wait_for_timeout(200); c1 = await cam()
        ok(c1['pitch'] < c0['pitch'] - 0.2 and abs(c1['dist'] - c0['dist']) < 0.5 and abs(c1['yaw'] - c0['yaw']) < 0.02, 'dois dedos para cima inclinam (%.2f -> %.2f), sem zoom nem giro' % (c0['pitch'], c1['pitch']))
        await pg.screenshot(path=OUT + '21_inclinado.png')
        # girar dois dedos
        c0 = await cam(); cx, cy, r = 206, 430, 70
        pa = [(cx - r, cy), (cx + r, cy)]; pb = [(cx - r * math.cos(0.8), cy - r * math.sin(0.8)), (cx + r * math.cos(0.8), cy + r * math.sin(0.8))]
        await touch(cdp, 'touchStart', pa)
        for k in range(1, 13):
            a = 0.8 * k / 12; await touch(cdp, 'touchMove', [(cx - r * math.cos(a), cy - r * math.sin(a)), (cx + r * math.cos(a), cy + r * math.sin(a))]); await asyncio.sleep(0.016)
        await touch(cdp, 'touchEnd', []); await pg.wait_for_timeout(200); c1 = await cam()
        ok(abs(c1['yaw'] - c0['yaw']) > 0.5 and abs(c1['dist'] - c0['dist']) < 1, 'dois dedos girando rodam a câmera (%.2f rad)' % (c1['yaw'] - c0['yaw']))
        # toque duplo aproxima
        c0 = await cam()
        for _ in range(2): await touch(cdp, 'touchStart', [(206, 500)]); await touch(cdp, 'touchEnd', []); await asyncio.sleep(0.08)
        await pg.wait_for_timeout(900); c1 = await cam()
        ok(c1['dist'] < c0['dist'] * 0.7, 'toque duplo aproxima (%.0f -> %.0f)' % (c0['dist'], c1['dist']))
        # botões e bússola
        c0 = await cam(); btn = pg.locator('.campad button[title="Girar para a esquerda"]'); bb = await btn.bounding_box()
        await touch(cdp, 'touchStart', [(bb['x'] + 20, bb['y'] + 20)]); await pg.wait_for_timeout(600); await touch(cdp, 'touchEnd', []); await pg.wait_for_timeout(100); c1 = await cam()
        ok(c1['yaw'] - c0['yaw'] > 0.6, 'segurar ⟲ gira continuamente (%.2f rad)' % (c1['yaw'] - c0['yaw']))
        await pg.wait_for_timeout(300); c2 = await cam(); ok(abs(c2['yaw'] - c1['yaw']) < 0.01, 'soltar o botão para o giro')
        up = pg.locator('.campad button[title^="Inclinar para baixo"]'); bb = await up.bounding_box()
        await touch(cdp, 'touchStart', [(bb['x'] + 20, bb['y'] + 20)]); await pg.wait_for_timeout(1500); await touch(cdp, 'touchEnd', [])
        ok(abs((await cam())['pitch'] - 0.22) < 0.01, 'inclinação para no limite mínimo')
        await pg.tap('.campad .compass'); await pg.wait_for_timeout(1200); c3 = await cam()
        ok(abs(math.remainder(c3['yaw'], 2 * math.pi)) < 0.02 and abs(c3['pitch'] - 0.95) < 0.02, 'bússola volta para o norte e para a inclinação padrão')
        # câmera sempre acima do relevo
        if True:
            above = await pg.evaluate("""() => { const g = window.__game, s = g.state, c = g.controls; for (let x = 20; x < 52; x++) for (let y = 40; y < 70; y++) s.height[y * 73 + x] = 8; s._hver = (s._hver || 0) + 1;
              c.centerOn(-20, 4, 30); c.cam.pitch = 0.22; c.cam.yaw = 0; for (let i = 0; i < 60; i++) c.update(0.05); return { y: g.world.camera.position.y, z: g.world.camera.position.z }; }""")
            ok(above['y'] >= 8 + 2.4, 'câmera fica acima de uma colina de 8 m (y = %.1f)' % above['y'])
        await pg.evaluate("() => { const s = window.__game.state; s.height.fill(0); s._hver++; }")
        # pular o tutorial
        await pg.evaluate("() => { const s = window.__game.state; s.settings.tutorial.feito = true; }"); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("() => document.querySelector('.tut-box').classList.contains('hidden')"), 'tutorial pode ser pulado')
        # habitat com espécies novas (pela API) e desfazer
        await pg.evaluate("""() => { const A = window.__api, s = window.__game.state; s.money = 900000; A.placeHabitat(s, 24, 26, 35, 34, 'savana', 'muro');
          for (const [sp, n] of [['hipopotamo', 2], ['rinoceronte', 2], ['flamingo', 8], ['tartaruga', 2]]) for (let i = 0; i < n; i++) A.buyAnimal(s, sp, 28 + i % 5, 29 + (i / 5 | 0));
          A.placeHabitat(s, 38, 26, 47, 34, 'floresta', 'muro'); for (let i = 0; i < 3; i++) A.buyAnimal(s, 'gorila', 41, 29); }""")
        n0 = await pg.evaluate("() => window.__game.state.animals.length")
        ok(n0 == 17, 'comprou 17 animais das espécies novas')
        await pg.evaluate("() => { window.__game.snapshot('teste'); window.__api.buyAnimal(window.__game.state, 'gorila', 42, 30); }"); await pg.wait_for_timeout(300)
        ok(await pg.is_visible('.undo'), 'botão Desfazer aparece')
        await pg.tap('.undo'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate("() => window.__game.state.animals.length") == n0, 'Desfazer remove a última compra')
        ok(not await pg.is_visible('.undo'), 'Desfazer some depois de usado')
        # vender pede confirmação
        await pg.evaluate("() => { const g = window.__game, a = g.state.animals.find(x => x.sp === 'tartaruga'); g.ui.select('animal', a.id); }"); await pg.wait_for_timeout(300)
        await pg.tap('.sheet button:has-text("Vender")'); await pg.wait_for_timeout(200)
        ok(await pg.is_visible('.confirm >> text=Vender'), 'vender mostra confirmação')
        ok(await pg.evaluate("() => window.__game.state.animals.length") == n0, 'nada vendido antes de confirmar')
        await pg.tap('.confirm >> text=Cancelar')
        # dar nome
        await pg.tap('.sheet button:has-text("Nome")'); await pg.wait_for_timeout(200)
        await pg.fill('.modal input', 'Tartarugão'); await pg.tap('.modal button:has-text("OK")'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("() => window.__game.state.animals.some(a => a.name === 'Tartarugão')"), 'animal ganhou nome novo')
        # Zoopédia
        await pg.tap('.sheet button:has-text("Zoopédia")'); await pg.wait_for_timeout(300)
        t = await pg.evaluate("() => document.querySelector('.modal').textContent")
        ok('Aldabrachelys' in t and 'Tartarugão' in t, 'Zoopédia abre na espécie e lista os animais do parque')
        await pg.tap('.zp-grid button:has-text("Gorila")'); await pg.wait_for_timeout(200)
        t = await pg.evaluate("() => document.querySelector('.modal').textContent")
        ok('Criticamente em perigo' in t and 'Gorilla gorilla' in t, 'Zoopédia do gorila com status de conservação')
        await pg.screenshot(path=OUT + '22_zoopedia.png')
        await pg.tap('.modal .close')
        # configurações: FPS, som, tranquilo
        await pg.tap('.bar button:has-text("Menu")'); await pg.wait_for_timeout(200)
        await pg.tap('.modal .row:has-text("Mostrar FPS") button'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '23_config.png')
        await pg.tap('.modal .close'); await pg.wait_for_timeout(500)
        fps = await pg.evaluate("() => document.querySelector('.fps').textContent")
        ok('FPS' in fps and not await pg.evaluate("() => document.querySelector('.fps').classList.contains('hidden')"), 'medidor de FPS: ' + fps)
        # gráfico Alto com os modelos realistas novos
        await pg.evaluate("() => { const g = window.__game; g.state.settings.autoQualidade = false; g.setQuality('alto'); g.ui.closeSheet(); g.controls.centerOn(-12, -12, 22); g.controls.cam.pitch = 0.5; g.controls.cam.yaw = 0.4; g.state.clock.min = 11 * 60; }")
        for _ in range(60):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("() => window.__api.library().loading === 0 && window.__api.library().tpl.size >= 7"): break
        await pg.wait_for_timeout(1500)
        ok(await pg.evaluate("() => ['hipopotamo','rinoceronte','flamingo','tartaruga'].every(k => window.__api.library().tpl.has(k + ':M') || window.__api.library().tpl.has(k + ':F'))"), 'modelos realistas das espécies novas carregados')
        await pg.screenshot(path=OUT + '24_alto_novas.png')
        await pg.evaluate("() => { const g = window.__game; g.controls.centerOn(13, -12, 18); g.controls.cam.pitch = 0.45; }"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + '25_alto_gorilas.png')
        await pg.evaluate("() => { const g = window.__game; g.setQuality('baixo'); g.controls.centerOn(-12, -12, 22); g.controls.cam.pitch = 0.5; }"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + '26_baixo_novas.png')
        # novo jogo no Modo Tranquilo
        await pg.tap('.bar button:has-text("Menu")'); await pg.tap('.modal .tabs button:has-text("Progresso")'); await pg.wait_for_timeout(200)
        await pg.tap('.modal button:has-text("Tranquilo")'); await pg.tap('.confirm >> text=Confirmar'); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("() => { const s = window.__game.state; return [s.settings.tranquilo, s.money, s.settings.tutorial.passo, s.settings.tutorial.feito, s.animals.length]; }")
        ok(st[0] is True and st[1] == 120000 and st[2] == 0 and not st[3] and st[4] == 0, 'novo jogo Tranquilo com tutorial do começo: ' + str(st))
        bad = [e for e in errs if 'favicon' not in e and '404' not in e]
        ok(not bad, 'sem erros no console: ' + str(bad[:5]))
        await b.close()
    print('TODOS OS TESTES DO NAVEGADOR (1.4) PASSARAM' if all(res) else f'{res.count(False)} FALHA(S)')
asyncio.run(main())
