# 1.6: caminhos, mobiliário, lojas viradas para o caminho, mesas e animais; tira fotos.
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
        await pg.evaluate("""(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.money = 3e6; s.clock.speed = 0; s.clock.min = 11 * 60;
          for (let x = 20; x <= 50; x++) { A.paintTerrain(s, x, 40, 'k'); A.paintTerrain(s, x, 41, 'k'); }
          const tiles = []; for (let x = 20; x <= 50; x++) tiles.push([x, 40]); A.distributeFurniture(s, tiles, { poste: 6, lixeira: 5, banco: 5 }, true);
          A.placeFacility(s, 'lanchonete', 24, 42); A.placeFacility(s, 'mesas', 28, 42); A.placeFacility(s, 'banheiro', 33, 42); A.placeFacility(s, 'loja', 24, 37); A.placeFacility(s, 'banco', 40, 42);
          A.placeHabitat(s, 24, 26, 35, 34, 'savana', 'muro'); for (const [sp, n] of [['zebra', 4], ['elefante', 2]]) for (let i = 0; i < n; i++) A.buyAnimal(s, sp, 27 + i, 29);
          for (let i = 0; i < 6; i++) A.placePlant(s, 26 + i, 28, 'acacia');
          g.setQuality(Q); }""", Q)
        await pg.wait_for_timeout(5000)
        for nome, (x, z, pit, yaw, dist) in {'lojas': (-22, 12, 0.42, 0.0, 22), 'perto': (-26, 12, 0.3, 0.25, 11), 'habitat': (-11, -10, 0.45, 0.2, 13), 'mesas': (-14, 12, 0.35, -0.3, 12)}.items():
            await pg.evaluate(f"() => {{ const g = window.__game; g.controls.centerOn({x}, {z}, {dist}); g.controls.cam.pitch = {pit}; g.controls.cam.yaw = {yaw}; }}")
            await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + f'60_{Q}_{nome}.png')
        await pg.evaluate("() => { const g = window.__game; g.state.clock.min = 21 * 60; g.controls.centerOn(-22, 12, 16); g.controls.cam.pitch = 0.3; g.controls.cam.yaw = 0.2; }")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + f'60_{Q}_noite.png')
        print('erros', errs[:5]); await b.close()
asyncio.run(main())
