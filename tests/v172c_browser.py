# 1.7.2c: serviço com recolhimento nas tocas, veterinário sedando, Clínica veterinária com internado, alerta de doença grave,
# funcionário ferido e AO VIVO fantasma. Uso: python3 tests/v172c_browser.py [baixo|alto|ultra] (dist/ em http://localhost:8765)
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'baixo'
SETUP = """(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.settings.fugas = false; s.money = 3e6; s.clock.speed = 1; s.clock.min = 9 * 60;
  const sv = A.placeHabitat(s, 26, 25, 37, 34, 'savana', 'muro').hab; A.placePlant(s, 28, 32, 'acacia'); A.placeToca(s, 29, 27);
  for (const sp of ['leao', 'leao', 'zebra', 'zebra']) A.buyAnimal(s, sp, 33, 31);
  const z2 = A.placeHabitat(s, 40, 25, 47, 34, 'savana', 'muro').hab; A.buyAnimal(s, 'rinoceronte', 43, 30); A.buyAnimal(s, 'zebra', 43, 30);
  const c1 = A.placeFacility(s, 'clinica', 31, 38), c2 = A.placeFacility(s, 'clinica', 40, 38);
  const want = r => { let c; do { c = A.genCandidate ? A.genCandidate(s, Date.now()) : null; } while (c && c.role !== r); return c; };
  g.setQuality(Q); return { sv: sv.id, z2: z2.id, c1: c1.msg, c2: c2.msg, clin: s.facilities.filter(f => f.type === 'clinica').length }; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 420, 'height': 860})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        info = await pg.evaluate(SETUP, Q); print('setup', info)
        # contrata tratador e veterinário pela API do jogo (currículos gerados na hora)
        await pg.evaluate("""() => { const g = window.__game, s = g.state, A = window.__api; const add = r => { const base = s.candidates[0]; const c = { ...base, id: s.nextId + 1000 + Math.floor(Math.random() * 1e5), role: r, hidden: [] }; s.candidates.push(c); return A.hire(s, c.id).person; };
          const tr = add('tratador'), vet = add('veterinario'); const h = s.habitats[0]; h.food = 0.1; A.startTask(s, tr, 'feed', h.id); s.clock.speed = 2; window.__tr = tr.id; window.__vet = vet.id; return 1; }""")
        fases = set()
        for k in range(90):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("() => { const s = window.__game.state, tr = s.staff.find(x => x.id === window.__tr); for (const a of s.animals) { a.hunger = Math.min(a.hunger, 0.3); a.thirst = Math.min(a.thirst, 0.3); a.stress = 0.2; } return { ph: tr.task?.type + ':' + tr.task?.phase, presos: s.animals.filter(a => a.preso).length, food: s.habitats[0].food }; }")
            fases.add(st['ph'])
            if st['ph'] == 'feed:recolher' and 'shot1' not in fases:
                fases.add('shot1'); await pg.evaluate("() => { const g = window.__game, h = g.state.habitats[0]; const p = { x: (h.gateOut[0]) * 2 - 71, z: (h.gateOut[1]) * 2 - 71 }; g.controls.centerOn(p.x, p.z - 6, 22); }"); await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + f'72c_{Q}_recolher.png')
            if st['food'] > 0.95: break
        print('fases', fases, st)
        await pg.screenshot(path=OUT + f'72c_{Q}_servico.png')
        # painel do habitat e da clínica
        await pg.evaluate("() => { const g = window.__game; g.ui.select('hab', g.state.habitats[0].id); }"); await pg.wait_for_timeout(700); await pg.screenshot(path=OUT + f'72c_{Q}_painel_hab.png')
        # caso grave: zebra doente, alerta com escolha de clínica
        r = await pg.evaluate("""() => { const g = window.__game, s = g.state, A = window.__api; g.ui.closeSheet(); const z = s.animals.find(a => a.sp === 'zebra'); z.sick = true; z.health = 0.25; A.refreshAlerts(s); const al = s.alerts.find(a => a.type === 'doenca'); g.ui.openAlert(al.id); return { al: !!al }; }""")
        await pg.wait_for_timeout(700); await pg.screenshot(path=OUT + f'72c_{Q}_alerta_grave.png')
        txt = await pg.evaluate("() => document.querySelector('.modal')?.textContent")
        print('alerta', txt[:400] if txt else None)
        await pg.click('.modal .card .btn.sm >> text=Enviar'); await pg.wait_for_timeout(500); await pg.evaluate("() => { window.__game.state.clock.speed = 3; }")
        for k in range(120):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("() => { const s = window.__game.state, z = s.animals.find(a => a.sp === 'zebra' && a.health < 0.5) || s.animals.find(a => a.internado), vet = s.staff.find(x => x.id === window.__vet); if (z && !z.internado) z.health = Math.min(z.health, 0.25); return { ph: vet.task?.type + ':' + vet.task?.modo + ':' + vet.task?.phase, pre: vet.task?.pre, x: Math.round(vet.x), z: Math.round(vet.z), veh: vet.veh, rl: vet.task?.route?.length, dest: vet.task?.dest, sp: s.clock.speed, int: s.animals.filter(a => a.internado).length }; }")
            if k % 20 == 0: print(k, st['ph'], st['int'])
            if st['int']: break
        print('internacao', st)
        await pg.evaluate("() => { const g = window.__game, s = g.state, f = s.facilities.find(f => f.type === 'clinica' && s.animals.some(a => a.internado === f.id)) || s.facilities.find(f => f.type === 'clinica'); g.controls.centerOn((f.tx + 1) * 2 - 71, (f.ty + 1) * 2 - 71 + 4, 16); g.ui.select('fac', f.id); }")
        await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + f'72c_{Q}_clinica.png')
        # funcionário ferido (forçado) e o alerta
        r2 = await pg.evaluate("""() => { const g = window.__game, s = g.state, A = window.__api; g.ui.closeSheet(); const st = s.staff.find(x => x.id === window.__tr), le = s.animals.find(a => a.sp === 'leao'); A.atacar(s, st, le); A.refreshAlerts(s); const al = s.alerts.find(a => a.type === 'ferido'); if (al) g.ui.openAlert(al.id); g.ui.select('staff', st.id); return { ferido: st.ferido > s.clock.min, al: !!al, task: st.task?.type }; }""")
        await pg.wait_for_timeout(800); await pg.screenshot(path=OUT + f'72c_{Q}_ferido.png')
        await pg.evaluate("() => { const g = window.__game; g.ui.closeModal(); g.ui.closeSheet(); }")
        # AO VIVO fantasma no recinto dos leões
        r3 = await pg.evaluate("""() => { const g = window.__game, s = g.state, h = s.habitats[0]; for (const a of s.animals) { a.preso = false; a.guard = false; } g.visitar(h); const L = g.controls.live, le = s.animals.filter(a => a.sp === 'leao' && !a.internado);
          const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw); le.forEach((a, i) => Object.assign(a, { x: L.x + fx * (3 + i * 3), z: L.z + fz * (3 + i * 3), st: 'idle', stT: 99, tgt: null, toca: null, sedated: false, sedAte: 0 })); return { hab: L.hab, gate: h.gateOpen }; }""")
        await pg.wait_for_timeout(6000); await pg.screenshot(path=OUT + f'72c_{Q}_vivo.png')
        r4 = await pg.evaluate("() => { const g = window.__game, s = g.state; return { hab: g.controls.live.hab, leoes: s.animals.filter(a => a.sp === 'leao').map(a => a.st), msg: document.querySelector('.visitmsg')?.textContent, gate: s.habitats[0].gateOpen }; }")
        print('ferido', r2, 'vivo', r3, r4)
        print('erros', errs[:8]); await b.close()
asyncio.run(main())
