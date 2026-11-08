import asyncio, sys
from playwright.async_api import async_playwright
async def main(url, out, w=1600, h=700):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width':w,'height':h})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(url); await pg.wait_for_function('window.__done', timeout=120000); await pg.wait_for_timeout(500)
        await pg.screenshot(path=out); print('erros', errs[:5]); await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2], *(int(a) for a in sys.argv[3:])))
