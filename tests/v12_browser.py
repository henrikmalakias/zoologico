import asyncio
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'
SETUP = """() => {
  const g = window.__game, s = g.state, A = window.__api;
  document.querySelector('.modal-bg')?.remove(); g.ui.modal = null;
  s.money = 900000; s.areaLevel = 2;
  // morros e lago fundo
  for (let i = 0; i < 9; i++) { A.sculpt(s, 14, 46, 'subir'); A.sculpt(s, 16, 47, 'subir'); A.sculpt(s, 12, 44, 'subir'); }
  for (let i = 0; i < 4; i++) A.sculpt(s, 15, 46, 'suavizar');
  // ilha com elefantes (sudoeste) e viveiro de macacos
  let r = A.placeHabitat(s, 10, 24, 21, 35, 'savana', 'fosso'); const ilha = r.hab;
  for (let i = 0; i < 4; i++) { A.placePlant(s, ilha.x + 3 + i * 2, ilha.y + 3, 'acacia'); A.placePlant(s, ilha.x + 3 + i * 2, ilha.y + 8, 'capim_alto'); }
  for (let i = 0; i < 2; i++) A.buyAnimal(s, 'elefante', ilha.x + 5, ilha.y + 5);
  r = A.placeHabitat(s, 38, 26, 46, 34, 'floresta', 'tela'); const viv = r.hab;
  for (let i = 0; i < 7; i++) A.placePlant(s, viv.x + 1 + i, viv.y + 2, i % 2 ? 'arvore_cipo' : 'arvore_floresta');
  for (let i = 0; i < 5; i++) A.buyAnimal(s, 'macaco', viv.x + 3, viv.y + 4);
  r = A.placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro'); const sav = r.hab;
  for (let i = 0; i < 4; i++) A.placePlant(s, sav.x + 1 + i * 2, sav.y + 2, 'acacia');
  for (let x = 29; x <= 32; x++) for (let y = 30; y <= 32; y++) A.paintTerrain(s, x, y, 'w');
  for (let i = 0; i < 6; i++) A.sculpt(s, 30, 31, 'baixar');
  for (let i = 0; i < 4; i++) A.buyAnimal(s, 'zebra', sav.x + 2, sav.y + 2);
  for (const c of [...s.candidates]) if (c.role !== 'subgerente') A.hire(s, c.id);
  s.clock.min = 10 * 60; s.clock.speed = 1;
  window.__h = { ilha: ilha.id, viv: viv.id, sav: sav.id };
  return [ilha && ilha.id, viv && viv.id, sav && sav.id, s.animals.length];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width':900,'height':640})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2000)
        print('setup', await pg.evaluate(SETUP))
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(-18,8,70); c.cam.pitch=0.75; c.cam.yaw=0.5; }")
        await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT+'40_baixo_geral.png')
        await pg.evaluate("() => window.__game.setQuality('alto')")
        for k in range(60):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("() => window.__api.library().loading===0 && window.__api.library().tpl.size>=6"): break
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(-40,-10,34); c.cam.pitch=0.55; c.cam.yaw=0.7; }")
        await pg.wait_for_timeout(3000); await pg.screenshot(path=OUT+'41_ilha.png')
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(12,-12,26); c.cam.pitch=0.6; c.cam.yaw=-0.4; }")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+'42_viveiro.png')
        await pg.evaluate("() => { const c=window.__game.controls; c.centerOn(-50,24,30); c.cam.pitch=0.45; c.cam.yaw=0.9; }")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT+'43_relevo.png')
        # fuga: leão no habitat de ferro gasto -> derruba a cerca
        await pg.evaluate("""() => { const g=window.__game, s=g.state, A=window.__api, h=s.habitats.find(x=>x.id===window.__h.sav); h.fenceHp=0.3;
          A.buyAnimal(s,'leao',h.x+2,h.y+2); const a=s.animals[s.animals.length-1]; a.x=h.x*2-72+3; a.z=h.y*2-72+2.5; window.__esc=a; A.fuga(s,a); s.clock.speed=1;
          const c=g.controls; c.centerOn(a.x,a.z-2,16); c.cam.pitch=0.5; c.cam.yaw=0.2; }""")
        print('modo:', await pg.evaluate("() => window.__esc.escaping?.mode"))
        await pg.wait_for_timeout(1800); await pg.screenshot(path=OUT+'44_forcando.png')
        for k in range(20):
            await pg.wait_for_timeout(700)
            if await pg.evaluate("() => !window.__esc.escaping"): break
        await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+'45_brecha.png')
        print('brechas:', await pg.evaluate("() => window.__game.state.habitats.find(x=>x.id===window.__h.sav).breaches"))
        # macaco pula (cerca de ferro comum, sem tela) - usa zebra? usa macaco transferido depois; aqui: transferência pela interface
        await pg.evaluate("() => { const g=window.__game; g.state.clock.speed=1; const a=g.state.animals.find(x=>x.sp==='macaco'); window.__mac=a; g.ui.select('animal', a.id); }")
        await pg.wait_for_timeout(500)
        await pg.click('.sheet button:has-text("Mover")')
        pos = await pg.evaluate("() => { const W=window.__game.world, s=window.__game.state, h=s.habitats.find(x=>x.id===window.__h.ilha); const c=window.__game.controls; c.centerOn((h.x+6)*2-72,(h.y+6)*2-72,60); c.cam.pitch=1.2; return null; }")
        await pg.wait_for_timeout(800)
        pos = await pg.evaluate("() => { const W=window.__game.world, s=window.__game.state, h=s.habitats.find(x=>x.id===window.__h.ilha); return W.project((h.x+6)*2-72, 0.3, (h.y+6)*2-72); }")
        await pg.mouse.click(pos['x'], pos['y']); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+'46_transferir.png')
        await pg.click('.modal .card button:has-text("Enviar")'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => window.__game.state.clock.speed=3")
        fases=[]
        for k in range(150):
            ph = await pg.evaluate("() => { const st=window.__game.state.staff.find(x=>x.task?.type==='transfer'); return st ? st.task.phase : 'fim'; }")
            if not fases or fases[-1]!=ph: fases.append(ph)
            if ph=='return' and 'shot' not in fases:
                fases.append('shot'); await pg.evaluate("() => { const st=window.__game.state.staff.find(x=>x.task?.type==='transfer'); const c=window.__game.controls; c.centerOn(st.x,st.z,14); c.cam.pitch=0.5; }")
                await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT+'47_transporte.png')
            if ph=='fim': break
            await pg.wait_for_timeout(600)
        print('transferência:', ' > '.join(fases), '| macaco agora no habitat', await pg.evaluate("() => window.__mac.hab"), 'ilha', await pg.evaluate("() => window.__h.ilha"))
        print('ERROS:', errs[:8]); await b.close()
asyncio.run(main())
