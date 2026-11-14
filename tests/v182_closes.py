# 1.8.2: closes de cada espécie (e da equipe) num gráfico. Uso: python3 tests/v182_closes.py [baixo|alto|ultra] [prefixo]
# O animal da vez vai para o meio de um recinto grande (longe dos muros), os outros vão para os cantos; câmera em 3 vistas.
import asyncio, sys, json
from playwright.async_api import async_playwright
Q = sys.argv[1] if len(sys.argv) > 1 else 'ultra'; PRE = sys.argv[2] if len(sys.argv) > 2 else 'v182_' + Q
OUT = '/home/claude/shots/'
import os
ESP0 = [('leao', 1.15), ('zebra', 1.45), ('elefante', 3.0), ('girafa', 4.6), ('macaco', 0.6), ('hipopotamo', 1.45), ('rinoceronte', 1.7), ('gorila', 1.4), ('tartaruga', 0.65), ('flamingo', 1.6)]
ESP = [e for e in ESP0 if not os.environ.get('SO') or e[0] in os.environ['SO'].split(',')]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 640, 'height': 640})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(f'http://localhost:{os.environ.get("PORT", "8765")}/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        await pg.evaluate("""(arg) => { const [Q, esp] = arg; const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.money = 5e6; s.clock.speed = 0; s.clock.min = 10 * 60;
          const r = A.placeHabitat(s, 22, 20, 41, 34, 'savana', 'muro'); window.__hab = r;
          for (const sp of esp) { A.buyAnimal(s, sp, 31, 27); if (sp === 'leao' || sp === 'gorila') A.buyAnimal(s, sp, 31, 27); }
          g.setQuality(Q); const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.append(st); }""", [Q, [e[0] for e in ESP]])
        for _ in range(240):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("() => { const L = window.__api.library(); return [L.loading, L.tpl.size, window.__game.state.animals.length]; }")
            if Q == 'baixo' or (st[0] == 0 and st[1] >= sum(2 if e[0] in ('leao', 'gorila') else 1 for e in ESP)): break
        print('estado', st, 'hab', await pg.evaluate("() => JSON.stringify(window.__hab).slice(0,80)"))
        for sp, H in ESP:
            for sexo in (['M', 'F'] if sp in ('leao', 'gorila') else ['F']):
                for vista, yaw, dk, ty in [('lado', 1.5708, 1.0, 0.5), ('frente', 0.75, 0.62, 0.75), ('pernas', 2.4, 0.5, 0.25)]:
                    await pg.evaluate("""(arg) => { const [sp, sexo, H, yaw, dk, ty] = arg; const g = window.__game, s = g.state; const cx = -8, cz = -17; let k = 0;
                      const alvo = s.animals.find(a => a.sp === sp && (sp !== 'leao' && sp !== 'gorila' || a.sex === sexo));
                      for (const a of s.animals) { a.st = 'idle'; a.path = null; a.target = null; a._nada = false;
                        if (a === alvo) { a.x = cx; a.z = cz; a.rot = 0; } else { const ang = (k++) * 0.55; a.x = cx + Math.cos(ang) * 10; a.z = cz + Math.sin(ang) * 6; } }
                      const c = g.controls.cam; g.controls.centerOn(cx, cz, Math.max(2.2, H * 2.3 * dk)); c.y = H * ty; c.yaw = yaw; c.pitch = 0.22; }""", [sp, sexo, H, yaw, dk, ty])
                    await pg.wait_for_timeout(1500)
                    await pg.evaluate("(yaw) => { const g = window.__game, s = g.state, a = s.animals.find(b => Math.hypot(b.x + 8, b.z + 17) < 0.5), e = a && g.world.maps.animals.get(a.id); if (e) { a.rot = 0; e.rot = 0; e.o.rotation.y = 0; } g.controls.cam.yaw = yaw; }", yaw)
                    await pg.wait_for_timeout(120)
                    await pg.screenshot(path=OUT + f'{PRE}_{sp}{"_" + sexo if sp in ("leao", "gorila") else ""}_{vista}.png')
        print('erros', [e for e in errs if '404' not in e][:8]); await b.close()
asyncio.run(main())
