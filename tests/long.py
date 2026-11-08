import asyncio
from playwright.async_api import async_playwright
SETUP = open('tests/browser.py').read().split('SETUP = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width':800,'height':600})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2000)
        await pg.evaluate("indexedDB.deleteDatabase('zoologico')")
        await pg.evaluate(SETUP)
        await pg.evaluate("() => { const s=window.__game.state; s.habitats.forEach(h=>{h.food=0.3;h.clean=0.4}); s.animals[0].sick=true; s.acc.q=20; }")
        t0 = await pg.evaluate("() => performance.now()")
        f0 = await pg.evaluate("() => window.__game.state.clock.min")
        await pg.wait_for_timeout(25000)
        r = await pg.evaluate("""() => { const s=window.__game.state; return { staff:s.staff.filter(x=>x.role==='tratador').map(x=>[x.task?.type, x.task?.target, x.task?.phase, x.task?.work?.toFixed(1), x.task?.route?.length, x.x.toFixed(1), x.z.toFixed(1), x.inHab]), habs:s.habitats.map(h=>[h.id,h.gateOut]), horas:((s.clock.min)/60).toFixed(2), comida:s.habitats.map(h=>h.food.toFixed(2)), limpeza:s.habitats.map(h=>h.clean.toFixed(2)), alertas:s.alerts.map(a=>a.type), visitantes:s.visitors.length, hoje:s.stats.visitantesHoje, sat:s.stats.sat.toFixed(2), lixo:Object.keys(s.litter).length, log:s.log.slice(-6).map(l=>l.msg) } }""")
        print(r); print('ERROS:', errs[:8]); await b.close()
asyncio.run(main())
