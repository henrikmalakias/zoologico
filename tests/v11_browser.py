import asyncio
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'
SETUP = open('tests/browser.py').read().split('SETUP = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width':900,'height':640})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type in ('error',) else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2000)
        await pg.evaluate(SETUP)
        await pg.evaluate("() => { const g=window.__game; g.state.clock.speed=1; g.state.areaLevel=1; g.setQuality('alto'); for (const sp of ['leao','elefante']) { const h=window.__api.placeHabitat(g.state, sp==='leao'?25:38, sp==='leao'?14:14, sp==='leao'?33:47, sp==='leao'?21:21, 'savana','muro').hab; for(let i=0;i<2;i++) window.__api.buyAnimal(g.state, sp, h.x+2, h.y+2);} }")
        t=0
        while t < 90:
            n = await pg.evaluate("() => window.__api.library().loading")
            if n == 0 and t > 3: break
            await pg.wait_for_timeout(2000); t+=2
        print('modelos prontos em', t, 's')
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(-8,-12,26); c.cam.pitch=0.55; c.cam.yaw=0.4; }")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+'30_alto_savana.png')
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(12,-12,24); c.cam.pitch=0.5; c.cam.yaw=-0.3; }")
        await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT+'31_alto_floresta.png')
        # sujeira + limpeza + conserto
        await pg.evaluate("""() => { const g=window.__game, s=g.state, h=s.habitats[0]; for(let i=0;i<14;i++) h.dirt.push([h.x*2-72+2+Math.random()*16, h.y*2-72+2+Math.random()*14, i%3?0:1]); h.fenceHp=0.3; s.acc.q=20; }""")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { const g=window.__game, s=g.state; const segs=s.staff.filter(x=>x.role==='seguranca'); const a=s.alerts.find(a=>a.type==='cerca'); if(a) window.__api.dispatch(s,a.id,segs[0].id); const t=s.staff.find(x=>x.role==='tratador'); window.__api.startTask(s,t,'clean',s.habitats[0].id); }""")
        await pg.wait_for_timeout(9000)
        await pg.evaluate("() => { const c=window.__game.controls; const h=window.__game.state.habitats[0]; c.centerOn((h.x+5)*2-72,(h.y+7)*2-72,16); c.cam.pitch=0.6; c.cam.yaw=0.3; }")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+'32_limpeza_conserto.png')
        print(await pg.evaluate("() => window.__game.state.staff.filter(x=>x.task&&x.task.type!=='idle').map(x=>x.role+':'+x.task.type+':'+x.task.phase)"))
        # fuga e captura
        await pg.evaluate("""() => { const s=window.__game.state; s.clock.speed=1; const a=s.animals.find(a=>a.sp==='zebra'); a.escaped=true; a.x=1; a.z=-30; window.__api.refreshAlerts(s); const al=s.alerts.find(x=>x.type==='fuga'); const seg=s.staff.filter(x=>x.role==='seguranca').at(-1); seg.task=null; seg.x=-2; seg.z=24; window.__api.dispatch(s,al.id,seg.id); window.__seg=seg; window.__zeb=a; }""")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { const c=window.__game.controls, g=window.__seg; c.centerOn(g.x,g.z,22); c.cam.pitch=0.55; }")
        await pg.wait_for_timeout(800); await pg.screenshot(path=OUT+'33_jipe.png')
        shots = {'sedate':'34_dardo.png','load':'35_carregando.png','return':'36_transporte.png'}
        done=set()
        for i in range(120):
            ph = await pg.evaluate("() => window.__seg.task?.phase || 'fim'")
            if ph in shots and ph not in done:
                await pg.evaluate("() => { const c=window.__game.controls, g=window.__seg; c.centerOn(g.x,g.z,16); c.cam.pitch=0.5; }")
                await pg.wait_for_timeout(700 if ph!='return' else 2500); await pg.screenshot(path=OUT+shots[ph]); done.add(ph)
            if ph == 'fim': break
            await pg.wait_for_timeout(1000)
        print('fases capturadas:', done, 'zebra fugida?', await pg.evaluate("() => window.__zeb.escaped"))
        print('ERROS:', errs[:8]); await b.close()
asyncio.run(main())
