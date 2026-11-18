# 1.8.3 (parte 1): construção rápida no navegador. Toque de verdade no mapa (prévia fixa, Girar, Construir), cada espécie,
# ficha com lotação (+1, Ampliar, Outra espécie), tutorial e os 3 gráficos. Uso: python3 tests/v183_browser.py (dist/ em http://localhost:8765)
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'
SPS=['leao','zebra','elefante','girafa','macaco','hipopotamo','rinoceronte','flamingo','gorila','tartaruga']
POS=[(12,8),(30,8),(50,8),(12,26),(30,26),(50,27),(12,43),(30,43),(50,43),(62,26)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width':420,'height':860})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!'); await pg.wait_for_timeout(500)
        # 1) tutorial: o passo do habitat agora é a construção rápida
        tut = await pg.evaluate("() => document.querySelector('.tut-box')?.textContent || ''")
        await pg.evaluate("""() => { const g=window.__game, s=g.state; s.settings.autoQualidade=false; s.settings.economia=false; s.clock.min=10*60; s.clock.speed=0; }""")
        # 2) toque real no mapa: zebra perto do caminho da área inicial
        await pg.evaluate("() => { const g=window.__game; g.ui.toggleBuild(true); }"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT+'83_construir_rapido.png')
        modo = await pg.evaluate("() => [...document.querySelectorAll('.drawer .item.on')].map(b=>b.textContent).join(' | ')")
        xy = await pg.evaluate("() => { const g=window.__game, c=g.world, p=window.__api.RAP; const w={x:(30+0.5)*2-72, z:(30+0.5)*2-72}; g.controls.centerOn(w.x, w.z + 22, 60); return new Promise(r=>setTimeout(()=>{ const q=c.project(w.x, 0, w.z); r(q); }, 1500)); }")
        await pg.mouse.click(xy['x'], xy['y']); await pg.wait_for_timeout(500)
        barra = await pg.evaluate("() => document.querySelector('.confirm:not(.hidden)')?.textContent || ''")
        await pg.screenshot(path=OUT+'83_previa_zebra.png')
        dims0 = await pg.evaluate("() => window.__game.ui.quick?.dims")
        await pg.evaluate("() => [...document.querySelectorAll('.confirm button')].find(b=>/Girar/.test(b.textContent))?.click()"); await pg.wait_for_timeout(300)
        dims1 = await pg.evaluate("() => window.__game.ui.quick?.dims")
        await pg.screenshot(path=OUT+'83_previa_girada.png')
        await pg.evaluate("() => [...document.querySelectorAll('.confirm button')].find(b=>/Construir/.test(b.textContent))?.click()"); await pg.wait_for_timeout(900)
        z = await pg.evaluate("() => { const s=window.__game.state, h=s.habitats[0]; return h ? { nome:h.name, bichos:s.animals.filter(a=>a.hab===h.id).length, toast:[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / '), conq: document.querySelectorAll('.toast.conquista').length } : null; }")
        await pg.wait_for_timeout(1500)
        tut2 = await pg.evaluate("() => window.__game.state.settings.tutorial.passo")
        await pg.screenshot(path=OUT+'83_zebra_pronta.png')
        print('tutorial passo 5:', 'Construção rápida' in tut or tut[:60], '| passo agora', tut2)
        print('modo padrão:', modo); print('barra:', barra); print('girar', dims0, '->', dims1); print('zebra:', z)
        # 3) cada espécie pela interface (prévia + Construir) num parque grande
        await pg.evaluate("() => { const g=window.__game, s=g.state; s.settings.tutorial.feito=true; g.ui.tut.hide(); s.money=5e6; s.areaLevel=3; s.settings.fugas=false; }")
        res=[]
        for sp,(x,y) in zip(SPS,POS):
            r = await pg.evaluate("""([sp,x,y]) => { const g=window.__game, s=g.state, u=g.ui; u.opts.habMode='rapido'; u.opts.qsp=sp; u.renderDrawer(); u.quick={sp,tx:x,ty:y,dims:null,folga:true}; u.showQuick();
              const n0=s.habitats.length, bt=[...document.querySelectorAll('.confirm button')].find(b=>/Construir/.test(b.textContent)); if(!bt) return {sp, erro: document.querySelector('.confirm')?.textContent || [...document.querySelectorAll('.toast')].map(t=>t.textContent).pop()};
              bt.click(); const h=s.habitats[s.habitats.length-1]; if (s.habitats.length===n0) return {sp, erro:'não construiu'}; const L=window.__api.RAP.lotacao(s,h,sp);
              return {sp, nome:h.name, cerca:h.fence, blocos:h.cells.length, lot:`${L.n}/${L.cap}`}; }""", [sp,x,y])
            res.append(r)
        for r in res: print(r)
        await pg.evaluate("() => { const g=window.__game; g.ui.toggleBuild(false); g.controls.centerOn(0,-20,150); }"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT+'83_parque_todos.png')
        # 4) ficha: lotação, +1, Ampliar, Outra espécie
        hid = await pg.evaluate("() => { const g=window.__game, s=g.state, h=s.habitats.find(h=>h.rapido?.sp==='zebra'); const c={x:(h.x+h.w/2)*2-72, z:(h.y+h.h/2)*2-72}; g.controls.centerOn(c.x,c.z,55); g.ui.select('hab', h.id); return h.id; }"); await pg.wait_for_timeout(900)
        await pg.evaluate("() => document.querySelector('.sheet')?.scrollTo(0, 120)"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'83_ficha_lotacao.png')
        l0 = await pg.evaluate("() => [...document.querySelectorAll('.sheet .card')].find(c=>/Lotação/.test(c.textContent))?.textContent")
        await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/^\\+1/.test(b.textContent))?.click()"); await pg.wait_for_timeout(400)
        l1 = await pg.evaluate("() => [...document.querySelectorAll('.sheet .card')].find(c=>/Lotação/.test(c.textContent))?.textContent")
        await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/Ampliar/.test(b.textContent))?.click()"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT+'83_ampliar_previa.png')
        conf = await pg.evaluate("() => document.querySelector('.confirm:not(.hidden)')?.textContent || ''")
        await pg.evaluate("() => [...document.querySelectorAll('.confirm button')].find(b=>/Confirmar/.test(b.textContent))?.click()"); await pg.wait_for_timeout(600)
        l2 = await pg.evaluate("() => [...document.querySelectorAll('.sheet .card')].find(c=>/Lotação/.test(c.textContent))?.textContent")
        await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/Outra espécie/.test(b.textContent))?.click()"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+'83_outra_especie.png')
        lista = await pg.evaluate("() => [...document.querySelectorAll('.modal .card b')].map(b=>b.textContent)")
        await pg.evaluate("() => { const c=[...document.querySelectorAll('.modal .card')].find(c=>/Girafa/.test(c.textContent)); c?.querySelector('button')?.click(); }"); await pg.wait_for_timeout(700)
        l3 = await pg.evaluate("() => [...document.querySelectorAll('.sheet .card')].find(c=>/Lotação/.test(c.textContent))?.textContent")
        await pg.screenshot(path=OUT+'83_ficha_duas_especies.png')
        print('lotação:', l0, '| +1:', l1, '| ampliar:', conf, '->', l2); print('outra espécie:', lista, '->', l3)
        # 5) gráficos Baixo/Alto/Ultra num recinto rápido de perto (leões)
        fps={}
        for q in ['baixo','alto','ultra']:
            await pg.evaluate("(q) => { const g=window.__game, s=g.state; g.ui.closeSheet(); const h=s.habitats.find(h=>h.rapido?.sp==='leao'); g.setQuality(q); s.clock.speed=1; const c={x:(h.x+h.w/2)*2-72, z:(h.y+h.h/2)*2-72}; g.controls.centerOn(c.x,c.z,38); }", q)
            await pg.wait_for_timeout(3500); await pg.screenshot(path=OUT+f'83_{q}_leoes.png')
            fps[q] = await pg.evaluate("() => window.__game.fps ?? null")
        print('fps', fps)
        # 6) economia de bateria ligada não quebra a prévia
        r = await pg.evaluate("() => { const g=window.__game, s=g.state, u=g.ui; s.settings.economia=true; g.applyEco?.(); u.toggleBuild(true); u.opts.habMode='rapido'; u.quick={sp:'tartaruga',tx:64,ty:44,dims:null,folga:true}; u.showQuick(); return document.querySelector('.confirm:not(.hidden)')?.textContent || [...document.querySelectorAll('.toast')].map(t=>t.textContent).pop(); }")
        print('economia + prévia:', r)
        # 7) save e recarga
        await pg.evaluate("() => window.__game.save?.()"); await pg.wait_for_timeout(800)
        await pg.reload(); await pg.wait_for_timeout(3000)
        rec = await pg.evaluate("() => { const s=window.__game.state; return { habs: s.habitats.length, rapidos: s.habitats.filter(h=>h.rapido).length, animais: s.animals.length }; }")
        print('depois de recarregar:', rec)
        print('erros:', errs[:8])
        await b.close()
asyncio.run(main())
