# 1.8.1: aparência nova do HUD e dos painéis. Capturas de boas-vindas, HUD, construção, currículos, ficha, animal, Equipe, Gerência, Finanças, Menu,
# alertas e avisos, noite (lua), AO VIVO e a economia de bateria (classe eco). Uso: python3 tests/v181_browser.py [baixo|alto|ultra] (dist/ em http://localhost:8765)
import asyncio, sys
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'; Q=sys.argv[1] if len(sys.argv)>1 else 'baixo'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width':420,'height':860})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+f'81_{Q}_boas_vindas.png')
        await pg.click('text=Vamos lá!')
        await pg.evaluate("""(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade=false; s.settings.fugas=false; s.settings.economia=false; s.money=3e6; s.clock.min = 10*60;
          A.placeHabitat(s, 26, 22, 38, 34, 'savana', 'muro'); for (const sp of ['zebra','zebra','girafa','elefante']) A.buyAnimal(s, sp, 32, 28);
          A.placeHabitat(s, 40, 22, 50, 34, 'floresta', 'ferro'); for (const sp of ['macaco','macaco']) A.buyAnimal(s, sp, 45, 28);
          A.placeFacility(s,'lanchonete',37,40); g.setQuality(Q); s.clock.speed = 2;
          s.candidates=[]; const base={attrs:{habilidade:3,rapidez:3,dedicacao:3},expected:120,salary:100,hidden:[],createdAt:Date.now(),expiresAt:Date.now()+9e6};
          ['tratador','veterinario','seguranca'].forEach((r,i)=>s.candidates.push({...base,id:91000+i,role:r,name:['Ana','Bruno','Caio'][i]})); }""", Q)
        await pg.wait_for_timeout(5000)
        await pg.evaluate("() => { const g = window.__game; g.state.money -= 25000; }"); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT+f'81_{Q}_hud.png')
        await pg.evaluate("() => window.__game.ui.toggleBuild(true)"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+f'81_{Q}_construir.png')
        await pg.evaluate("() => window.__game.ui.toggleBuild(false)")
        await pg.evaluate("() => window.__game.ui.openModal('equipe','cv')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+f'81_{Q}_curriculos.png')
        for k in range(3):
            await pg.evaluate("() => { const b=[...document.querySelectorAll('.modal .card .btn.sm')].find(b=>/^(⭐ )?Dia|^Contratar/.test(b.textContent)); b&&b.click(); }"); await pg.wait_for_timeout(200)
        await pg.evaluate("() => { const g=window.__game; g.ui.closeModal(); g.ui.select('staff', g.state.staff[0].id); }"); await pg.wait_for_timeout(700); await pg.evaluate("() => { document.querySelectorAll('.toast').forEach(t => t.remove()); window.__game.world.dirty = true; }"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+f'81_{Q}_ficha.png')
        await pg.evaluate("() => { const g=window.__game; g.ui.closeSheet(); g.ui.select('animal', g.state.animals[0].id); }"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT+f'81_{Q}_animal.png')
        await pg.evaluate("() => { const g=window.__game, s=g.state; g.ui.closeSheet(); for (const p of s.staff) { p.exp=0; p.oculto=false; } s.staff[0].pedido={valor:120,desde:s.clock.min,negociou:false}; document.querySelectorAll('.toast').forEach(t => t.remove()); g.world.dirty = true; g.ui.openModal('equipe','func'); }"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT+f'81_{Q}_equipe.png')
        await pg.evaluate("() => window.__game.ui.openModal('gerencia')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+f'81_{Q}_gerencia.png')
        await pg.evaluate("() => { const g=window.__game; g.ui.tabs.gerencia='fin'; g.ui.renderModal(); }"); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT+f'81_{Q}_financas.png')
        await pg.evaluate("() => window.__game.ui.openModal('menu')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+f'81_{Q}_menu.png')
        cq = await pg.evaluate("() => { const g=window.__game, s=g.state, A=window.__api; g.ui.closeModal(); s.settings.pausaAlerta=false; s.habitats[0].fenceHp=0.2; A.refreshAlerts(s); g.ui.toast('Meta concluída: 4 animais! +R$ 5.000','bom'); g.ui.toast('Cerca do Habitat 2 está fraca.','ruim'); return document.querySelectorAll('.toast.conquista').length; }"); await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT+f'81_{Q}_alertas_toasts.png')
        print('alertas', await pg.evaluate("() => document.querySelectorAll('.alert').length"), '| conquista', cq)
        await pg.evaluate("() => { const s=window.__game.state; s.clock.min = Math.floor(s.clock.min/1440)*1440 + 21*60; s.clock.speed=1; }"); await pg.wait_for_timeout(3000)
        await pg.screenshot(path=OUT+f'81_{Q}_noite.png')
        print('lua', await pg.evaluate("() => !document.querySelector('.chip.clock svg:nth-child(2)').classList.contains('hidden')"))
        await pg.evaluate("() => window.__game.toggleLive()"); await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT+f'81_{Q}_aovivo.png')
        print('botao live', await pg.evaluate("() => document.querySelector('.speed .live').textContent"))
        await pg.evaluate("() => window.__game.toggleLive()"); await pg.wait_for_timeout(500)
        # economia ligada: classe eco no app, sem laço infinito nos alertas
        r = await pg.evaluate("() => { const g=window.__game; g.state.settings.economia=true; g.applyEco(); return new Promise(res => setTimeout(() => { const a=document.querySelector('.alert'); res({ eco: document.querySelector('#app').classList.contains('eco'), anim: a ? getComputedStyle(a).animationName : '-' }); }, 300)); }")
        print('economia', r)
        fonts = await pg.evaluate("() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight)")
        print('fontes carregadas', fonts)
        print('ERROS:', errs if errs else 'nenhum'); await b.close()
asyncio.run(main())
