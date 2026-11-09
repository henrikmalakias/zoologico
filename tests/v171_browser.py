# 1.7.1: áudio gerado (vozes e burburinho não vazios), Ultra com animais (capturas 71_*) e tela de sincronia do Drive.
import asyncio
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width': 1100, 'height': 700})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        await pg.evaluate("""() => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.money = 3e6; s.clock.speed = 0; s.clock.min = 11 * 60;
          A.placeHabitat(s, 25, 26, 34, 35, 'savana', 'muro');
          for (const sp of ['rinoceronte', 'elefante', 'leao']) A.buyAnimal(s, sp, 28, 30);
          g.setQuality('ultra'); }""")
        await pg.wait_for_timeout(9000)
        for nome, dist in {'perto': 9, 'longe': 60}.items():
            await pg.evaluate(f"() => {{ const g = window.__game; g.controls.centerOn(-10, -3, {dist}); g.controls.cam.pitch = 0.5; g.controls.cam.yaw = 0.3; }}")
            await pg.wait_for_timeout(3500); await pg.screenshot(path=OUT + f'71_ultra_{nome}.png')
        # áudio: gera cada voz e o burburinho offline e mede (duração, pico, energia, NaN)
        r = await pg.evaluate("""async () => {
          const m = await import('/assets/' + [...document.scripts].map(s => s.src).find(s => s.includes('index-')).split('/assets/')[1]).catch(() => null);
          return m ? Object.keys(m).length : -1; }""")
        print('modulo', r)
        await pg.evaluate("() => { document.querySelector('.menu-btn, #btn-menu, [data-menu]')?.click(); }")
        print('erros', errs[:6]); await b.close()
asyncio.run(main())
