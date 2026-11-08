import asyncio
from playwright.async_api import async_playwright
SETUP = open('tests/browser.py').read().split('SETUP = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width':700,'height':500})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2000)
        await pg.evaluate(SETUP)
        await pg.evaluate("""() => { const s=window.__game.state; s.clock.speed=3; const a=s.animals.find(a=>a.sp==='zebra'); a.escaped=true; a.x=-30; a.z=20; window.__api.refreshAlerts(s); const al=s.alerts.find(x=>x.type==='fuga'); const seg=s.staff.find(x=>x.role==='seguranca'); seg.task=null; seg.x=10; seg.z=30; window.__api.dispatch(s,al.id,seg.id); window.__seg=seg; window.__zeb=a; }""")
        seen=[]; shot=False
        for i in range(240):
            ph = await pg.evaluate("() => window.__seg.task?.phase || 'fim'")
            if not seen or seen[-1]!=ph: seen.append(ph)
            if ph=='return' and not shot:
                await pg.wait_for_timeout(1500)
                await pg.evaluate("() => { const g=window.__game; g.state.clock.speed=0; const c=g.controls, s=window.__seg; c.centerOn(s.x,s.z,13); c.cam.pitch=0.6; c.cam.yaw=0.8; }")
                await pg.wait_for_timeout(800); await pg.screenshot(path='/home/claude/shots/36_transporte_baixo.png')
                await pg.evaluate("() => window.__game.setQuality('alto')")
                for k in range(40):
                    await pg.wait_for_timeout(1000)
                    if await pg.evaluate("() => window.__api.library().loading===0 && window.__api.library().tpl.size>3"): break
                await pg.wait_for_timeout(2500); await pg.screenshot(path='/home/claude/shots/37_transporte_alto.png')
                await pg.evaluate("() => { window.__game.setQuality('baixo'); window.__game.state.clock.speed=3; }"); shot=True
            if ph=='fim': break
            await pg.wait_for_timeout(500)
        print('fases:', ' > '.join(seen), '| fugida:', await pg.evaluate("() => window.__zeb.escaped"), '| erros:', errs[:5]); await b.close()
asyncio.run(main())
