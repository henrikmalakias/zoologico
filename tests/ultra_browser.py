# Gráfico Ultra: carrega céu, terreno, capim e pelo; tira fotos em horários diferentes.
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1280, 720)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': W, 'height': H})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        await pg.evaluate("""() => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.money = 2e6; s.clock.speed = 0;
          A.placeHabitat(s, 24, 26, 35, 34, 'savana', 'muro'); for (const [sp, n] of [['leao', 2], ['zebra', 3]]) for (let i = 0; i < n; i++) A.buyAnimal(s, sp, 27 + i, 29);
          A.placeHabitat(s, 38, 26, 47, 34, 'floresta', 'muro'); for (let i = 0; i < 3; i++) A.buyAnimal(s, 'gorila', 41 + i, 29);
          for (let i = 0; i < 6; i++) A.placePlant(s, 26 + i * 1.5 | 0, 33, i % 2 ? 'acacia' : 'capim_alto'); for (let i = 0; i < 4; i++) A.placePlant(s, 40 + i * 2, 33, 'arvore_floresta');
          for (let x = 30; x <= 33; x++) for (let y = 27; y <= 28; y++) A.paintTerrain(s, x, y, 'w');
          for (let x = 24; x <= 28; x++) A.paintTerrain(s, x, 26, 'r'); for (let x = 24; x <= 26; x++) A.paintTerrain(s, x, 31, 's');
          g.setQuality('ultra'); }""")
        for _ in range(90):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("() => { const w = window.__game.world, L = window.__api.library(); return [!!w.usky?.dome.visible, !!w.tarr, w.grass?.mesh.count || 0, L.loading, L.tpl.size]; }")
            if st[0] and st[1] and st[3] == 0 and st[4] >= 3: break
        print('estado', st)
        for hora, nome in [(12, 'meiodia'), (7, 'manha'), (17.8, 'porsol'), (22, 'noite')]:
            await pg.evaluate(f"() => {{ const g = window.__game; g.state.clock.min = {hora} * 60; g.controls.centerOn(-12, -12, 30); g.controls.cam.pitch = 0.45; g.controls.cam.yaw = 0.5; }}")
            await pg.wait_for_timeout(4000)
            await pg.screenshot(path=OUT + f'40_ultra_{nome}.png')
        await pg.evaluate("() => { const g = window.__game; g.state.clock.min = 10 * 60; g.controls.centerOn(-15, -14, 9); g.controls.cam.pitch = 0.3; g.controls.cam.yaw = 0.3; }")
        await pg.wait_for_timeout(4000); await pg.screenshot(path=OUT + '41_ultra_perto.png')
        await pg.evaluate("() => { const g = window.__game; g.controls.centerOn(13, -12, 10); g.controls.cam.pitch = 0.35; g.controls.cam.yaw = -0.2; }")
        await pg.wait_for_timeout(4000); await pg.screenshot(path=OUT + '42_ultra_gorilas.png')
        print('erros', [e for e in errs if '404' not in e][:8]); await b.close()
asyncio.run(main())
