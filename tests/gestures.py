import asyncio
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':412,'height':860}, device_scale_factor=2)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        await pg.click('.bar button:has-text("Construir")')
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(-6,-6,100); c.cam.pitch=1.35; c.cam.yaw=0; }")
        await pg.wait_for_timeout(500)
        # tela -> tile: acha posições na tela dos blocos (25,26) e (34,34)
        pos = await pg.evaluate("""() => { const W=window.__game.world; const P=(tx,ty)=>W.project((tx+0.5)*2-72,0,(ty+0.5)*2-72); return [P(25,26),P(34,34),P(30,38),P(29,31)]; }""")
        a, bb, fac, inside = pos; print('pos', pos)
        await pg.mouse.move(a['x'], a['y']); await pg.mouse.down()
        for i in range(1, 11): await pg.mouse.move(a['x'] + (bb['x']-a['x'])*i/10, a['y'] + (bb['y']-a['y'])*i/10)
        await pg.mouse.up(); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT+'13_desenho.png')
        await pg.click('.confirm >> text=Confirmar'); await pg.wait_for_timeout(600)
        print('habitats:', await pg.evaluate("() => window.__game.state.habitats.map(h=>[h.x,h.y,h.w,h.h,h.side])"))
        # plantar por arraste (aba Plantas já selecionada automaticamente)
        await pg.mouse.move(inside['x']-60, inside['y']); await pg.mouse.down()
        for i in range(1, 9): await pg.mouse.move(inside['x']-60+i*15, inside['y'])
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        print('plantas:', await pg.evaluate("() => window.__game.state.objects.filter(o=>!o.deco).length"))
        # instalação por toque
        await pg.click('.drawer .tabs button:has-text("Instalações")')
        await pg.mouse.click(fac['x'], fac['y']); await pg.wait_for_timeout(300)
        txt = await pg.evaluate("() => document.querySelector('.confirm').textContent")
        print('confirmação:', txt)
        await pg.click('.confirm >> text=Confirmar'); await pg.wait_for_timeout(300)
        print('instalações:', await pg.evaluate("() => window.__game.state.facilities.map(f=>f.type)"))
        # comprar animal por toque
        await pg.click('.drawer .tabs button:has-text("Animais")')
        for i in range(3): await pg.mouse.click(inside['x'], inside['y']); await pg.wait_for_timeout(150)
        print('animais:', await pg.evaluate("() => window.__game.state.animals.map(a=>a.sp)"))
        await pg.click('.drawer .tabs button:has-text("Concluir")'); await pg.wait_for_timeout(300)
        # tocar num animal abre o painel
        ap = await pg.evaluate("() => { const a=window.__game.state.animals[0]; return window.__game.world.project(a.x,0.9,a.z); }")
        await pg.mouse.click(ap['x'], ap['y']); await pg.wait_for_timeout(500)
        print('painel:', await pg.evaluate("() => document.querySelector('.sheet:not(.hidden) h3')?.textContent"))
        await pg.screenshot(path=OUT+'14_animal.png')
        # arrastar sem ferramenta move a câmera
        c0 = await pg.evaluate("() => ({...window.__game.controls.cam})")
        await pg.mouse.move(200, 300); await pg.mouse.down(); await pg.mouse.move(260, 360, steps=5); await pg.mouse.up()
        c1 = await pg.evaluate("() => ({...window.__game.controls.cam})")
        print('câmera moveu:', round(c1['x']-c0['x'],2), round(c1['z']-c0['z'],2))
        print('ERROS:', errs[:10]); await b.close()
asyncio.run(main())
