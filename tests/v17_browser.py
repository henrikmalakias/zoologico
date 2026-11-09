# 1.7: habitats em formato livre (contornando o playground), muro com mirantes, viveiro e prévia por blocos; tira fotos.
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'alto'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 1100, 'height': 700})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        info = await pg.evaluate("""(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.money = 3e6; s.clock.speed = 0; s.clock.min = 11 * 60;
          A.placeFacility(s, 'playground', 28, 33);
          const h1 = A.placeHabitat(s, 25, 26, 34, 35, 'savana', 'muro').hab;
          for (let i = 0; i < 6; i++) A.placePlant(s, 26 + i, 27, 'acacia');
          for (const sp of ['zebra', 'zebra', 'girafa']) A.buyAnimal(s, sp, 26, 28);
          const h2 = A.placeHabitat(s, 37, 26, 46, 34, 'floresta', 'tela').hab;
          A.expandHabitat(s, 37, 22, 41, 25);
          for (const sp of ['macaco', 'macaco']) A.buyAnimal(s, sp, 40, 30);
          for (let y = 39; y <= 47; y++) for (let x = 25; x <= 34; x++) if (Math.hypot((x - 29.5) / 1.3, y - 43) < 3.4 + Math.sin(x * 1.7 + y) * 0.6) A.paintTerrain(s, x, y, 'w');
          g.setQuality(Q); return { c1: h1.cells.length, c2: h2.cells.length }; }""", Q)
        await pg.wait_for_timeout(5000)
        for nome, (x, z, pit, yaw, dist) in {'formas': (-8, -6, 0.9, 0.0, 34), 'muro': (-14, -2, 0.42, 0.3, 16), 'viveiro': (8, -8, 0.5, -0.4, 18), 'lago': (-12, 15, 0.55, 0.2, 16)}.items():
            await pg.evaluate(f"() => {{ const g = window.__game; g.controls.centerOn({x}, {z}, {dist}); g.controls.cam.pitch = {pit}; g.controls.cam.yaw = {yaw}; }}")
            await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + f'70_{Q}_{nome}.png')
        # prévia por blocos ao arrastar um habitat novo sobre o caminho
        await pg.evaluate("() => { const g = window.__game, u = g.ui; u.toggleBuild(true); u.cat = 'habitat'; u.tool = 'habitat'; u.opts.habMode = 'novo'; u.opts.fence = 'ferro'; u.renderDrawer(); const A = window.__api, s = g.state; const c = A.checkHabitat(s, 26, 38, 40, 46, 'ferro'); g.world.showCells(c.cells, c.ok ? '#4caf50' : '#e53935', 0.6); g.controls.centerOn(-6, 12, 36); g.controls.cam.pitch = 0.95; }")
        await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT + f'70_{Q}_previa.png')
        print(info, 'erros', errs[:5]); await b.close()
asyncio.run(main())
