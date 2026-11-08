import asyncio
from playwright.async_api import async_playwright
OUT='/home/claude/shots/'
SETUP = """() => {
  const g = window.__game, s = g.state, A = window.__api;
  document.querySelector('.modal-bg')?.remove(); g.ui.modal = null;
  let r = A.placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro'); const h = r.hab;
  for (let i = 0; i < 4; i++) A.placePlant(s, h.x + 1 + i * 2, h.y + 2, 'acacia');
  for (let i = 0; i < 4; i++) A.placePlant(s, h.x + 1 + i * 2, h.y + 6, 'capim_alto');
  A.placePlant(s, h.x + 7, h.y + 4, 'baoba');
  r = A.placeHabitat(s, 38, 26, 46, 34, 'floresta', 'muro'); const f = r.hab;
  for (let i = 0; i < 7; i++) A.placePlant(s, f.x + 1 + i, f.y + 2, i % 2 ? 'arvore_cipo' : 'arvore_floresta');
  for (let i = 0; i < 3; i++) A.placePlant(s, f.x + 2 + i * 2, f.y + 6, 'samambaia');
  for (let x = 30; x <= 33; x++) for (let y = 29; y <= 31; y++) A.paintTerrain(s, x, y, 'w');
  s.money = 200000;
  for (let i = 0; i < 4; i++) A.buyAnimal(s, 'zebra', h.x + 2, h.y + 2);
  for (let i = 0; i < 2; i++) A.buyAnimal(s, 'girafa', h.x + 2, h.y + 2);
  for (let i = 0; i < 5; i++) A.buyAnimal(s, 'macaco', f.x + 2, f.y + 2);
  A.placeFacility(s, 'lanchonete', 30, 38); A.placeFacility(s, 'banheiro', 38, 38); A.placeFacility(s, 'loja', 42, 38); A.placeFacility(s, 'playground', 26, 41);
  A.placeFacility(s, 'centro', 44, 41); A.placeFacility(s, 'placa', 29, 35); A.placeFacility(s, 'banco', 33, 38);
  for (const c of [...s.candidates]) if (c.role !== 'subgerente') A.hire(s, c.id);
  s.clock.min = 10 * 60; s.clock.speed = 3;
  g.controls.centerOn(0, 2, 70);
  return { habs: s.habitats.length, animals: s.animals.length, staff: s.staff.length, money: s.money };
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':412,'height':860}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs=[]
        pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        print(await pg.evaluate(SETUP))
        await pg.wait_for_timeout(12000)
        await pg.screenshot(path=OUT+'02_parque_baixo.png')
        print(await pg.evaluate("() => { const s=window.__game.state; return {vis:s.visitors.length, hoje:s.stats.visitantesHoje, tasks:s.staff.map(x=>x.task?.type+':'+x.task?.phase).join(','), clock:s.clock.min/60, alerts:s.alerts.length} }"))
        # gráficos alto
        await pg.evaluate("() => { window.__game.setQuality('alto'); window.__game.controls.centerOn(-6, -8, 38); window.__game.controls.cam.pitch=0.7; window.__game.controls.cam.yaw=0.5; }")
        await pg.wait_for_timeout(6000)
        await pg.screenshot(path=OUT+'03_parque_alto.png')
        # seleção de habitat
        await pg.evaluate("() => { const g=window.__game; g.ui.select('hab', g.state.habitats[0].id); }")
        await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT+'04_habitat.png')
        # alerta: portão aberto
        await pg.evaluate("() => { const g=window.__game; g.ui.closeSheet(); g.state.clock.speed=1; g.state.habitats[0].gateOpen=true; g.state.acc.q=20; }")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+'05_alerta.png')
        await pg.evaluate("() => { const g=window.__game; const a=g.state.alerts[0]; if(a) g.ui.openAlert(a.id); }")
        await pg.wait_for_timeout(800); await pg.screenshot(path=OUT+'06_alerta_menu.png')
        await pg.evaluate("() => window.__game.ui.closeModal()")
        # AO VIVO
        await pg.evaluate("() => { const g=window.__game; g.toggleLive(); g.controls.live.z -= 26; }")
        await pg.wait_for_timeout(4000); await pg.screenshot(path=OUT+'07_aovivo.png')
        await pg.evaluate("() => window.__game.toggleLive()")
        # modais
        await pg.evaluate("() => window.__game.ui.openModal('equipe','cv')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+'08_curriculos.png')
        await pg.evaluate("() => window.__game.ui.openModal('gerencia','geral')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+'09_gerencia.png')
        await pg.evaluate("() => window.__game.ui.openModal('menu','dlc')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT+'10_dlc.png')
        await pg.evaluate("() => window.__game.ui.closeModal()")
        # avançar relógio
        await pg.evaluate("() => window.__game.advance(7)"); await pg.wait_for_timeout(800); await pg.screenshot(path=OUT+'11_avanco.png')
        await pg.evaluate("() => window.__game.ui.closeModal()")
        # construção por gesto: arrastar habitat com o mouse
        await pg.evaluate("() => { const g=window.__game; g.setQuality('baixo'); g.controls.centerOn(0,0,90); g.controls.cam.yaw=0; g.controls.cam.pitch=1.3; g.ui.toggleBuild(true); }")
        await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT+'12_construir.png')
        await pg.evaluate("() => window.__game.save()"); await pg.wait_for_timeout(500)
        await pg.reload(); await pg.wait_for_timeout(3000)
        print('após recarregar:', await pg.evaluate("() => { const s=window.__game.state; return {animals:s.animals.length, habs:s.habitats.length, staff:s.staff.length} }"))
        print('ERROS:', errs[:15])
        await b.close()
asyncio.run(main())
