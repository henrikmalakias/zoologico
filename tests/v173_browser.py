# 1.7.3: contratação com turno, Equipe com a cobertura por setor, ficha com turno, Centro com gente dentro, alerta com hora extra,
# rua da frente (muro, ônibus parado no ponto, carros, estacionamento, famílias) e banheiro familiar.
# Uso: python3 tests/v173_browser.py [baixo|alto|ultra] (dist/ em http://localhost:8765)
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'baixo'
SETUP = """(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.settings.fugas = false; s.settings.selvagem = false; s.money = 3e6; s.clock.speed = 1; s.clock.min = 11.8 * 60;
  const sv = A.placeHabitat(s, 26, 25, 37, 34, 'savana', 'muro').hab; for (const sp of ['zebra', 'zebra', 'girafa']) A.buyAnimal(s, sp, 33, 31);
  const c = A.placeFacility(s, 'centro', 39, 40), b = A.placeFacility(s, 'banheiro_familiar', 37, 44), e = A.placeFacility(s, 'estacionamento', 30, 62), l = A.placeFacility(s, 'lanchonete', 37, 47);
  g.setQuality(Q); return { c: c.msg, b: b.msg, e: e.msg, l: l.msg }; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 420, 'height': 860})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        print('setup', await pg.evaluate(SETUP, Q))
        # currículos: 6 tratadores e 2 seguranças gerados, contratados pelos botões de turno da tela
        await pg.evaluate("""() => { const s = window.__game.state; s.candidates = []; const base = { attrs: { habilidade: 3, rapidez: 3, dedicacao: 3 }, expected: 120, salary: 120, hidden: [], createdAt: Date.now(), expiresAt: Date.now() + 9e6 };
          ['tratador', 'tratador', 'tratador', 'tratador', 'seguranca', 'seguranca', 'veterinario'].forEach((r, i) => s.candidates.push({ ...base, id: 90000 + i, role: r, name: 'Teste ' + (i + 1) })); window.__game.ui.openModal('equipe'); }""")
        await pg.wait_for_timeout(500)
        await pg.click('text=Currículos'); await pg.wait_for_timeout(500); await pg.screenshot(path=OUT + f'73_{Q}_curriculos.png')
        for k in range(7):
            ok = await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal .card .btn.sm:not(.sec)')].find(b => /Dia|Noite|Integral/.test(b.textContent)); if (!b) return false; b.click(); return b.textContent; }")
            if not ok: break
            await pg.wait_for_timeout(250)
        staff = await pg.evaluate("() => window.__game.state.staff.map(x => x.role + ':' + x.turno)")
        print('contratados', staff)
        await pg.click('text=Funcionários'); await pg.wait_for_timeout(500); await pg.screenshot(path=OUT + f'73_{Q}_equipe.png')
        cob = await pg.evaluate("() => document.querySelector('.modal')?.textContent.slice(0, 500)")
        print('equipe', cob)
        await pg.evaluate("() => window.__game.ui.closeModal()")
        # almoço: espera alguém entrar no Centro
        await pg.evaluate("() => { window.__game.state.clock.speed = 3; }")
        for k in range(60):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("() => { const s = window.__game.state; return { dentro: s.staff.filter(x => x.dentro).length, pausa: s.staff.filter(x => x.task?.type === 'pausa').length, h: (s.clock.min / 60) % 24, vis: s.visitors.length, fila: (s._fila || []).length, bus: s._bus?.fase }; }")
            if k % 10 == 0: print(k, st)
            if st['dentro'] >= 1: break
        await pg.evaluate("() => { const g = window.__game, s = g.state, f = s.facilities.find(f => f.type === 'centro'); g.controls.centerOn((f.tx + 1) * 2 - 71, (f.ty + 1) * 2 - 71 + 4, 18); g.ui.select('fac', f.id); }")
        await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + f'73_{Q}_centro.png')
        print('centro', await pg.evaluate("() => document.querySelector('.sheet')?.textContent.slice(0, 300)"))
        # ficha do funcionário com o turno
        await pg.evaluate("() => { const g = window.__game; g.ui.closeSheet(); g.ui.select('staff', g.state.staff[0].id); }"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT + f'73_{Q}_ficha.png')
        print('ficha', await pg.evaluate("() => document.querySelector('.sheet')?.textContent.slice(0, 400)"))
        # rua da frente: ônibus e estacionamento
        await pg.evaluate("() => { const g = window.__game, s = g.state; g.ui.closeSheet(); s.rua.proxOnibus = 0; s._bus = null; g.controls.centerOn(-6, 42, 34); }")
        busfoto = False
        for k in range(40):
            await pg.wait_for_timeout(700)
            f = await pg.evaluate("() => window.__game.state._bus?.fase")
            if f == 'parado' and not busfoto: busfoto = True; await pg.screenshot(path=OUT + f'73_{Q}_rua_onibus.png')
            if busfoto and f != 'parado': break
        await pg.evaluate("() => { const g = window.__game; g.controls.centerOn(-6, 50, 26); }"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + f'73_{Q}_estacionamento.png')
        fam = await pg.evaluate("() => { const s = window.__game.state; return { vis: s.visitors.length, kids: s.visitors.filter(v => v.kid).length, rua: s.visitors.filter(v => v.rua).length, carro: s.visitors.filter(v => v.origem?.tipo === 'carro').length, est: s.stats.today.inc.estacionamento }; }")
        print('onibus', busfoto, 'visitantes', fam)
        # alerta de madrugada: segurança de folga com hora extra
        await pg.evaluate("() => { const g = window.__game, s = g.state, A = window.__api; s.clock.speed = 1; s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + 23 * 60; for (const st of s.staff) if (st.turno === 'dia') { st.task = null; st.fora = true; } s.habitats[0].fenceHp = 0.2; A.refreshAlerts(s); const al = s.alerts.find(a => a.type === 'cerca'); g.ui.openAlert(al.id); }")
        await pg.wait_for_timeout(700); await pg.screenshot(path=OUT + f'73_{Q}_alerta_extra.png')
        print('alerta', await pg.evaluate("() => document.querySelector('.modal')?.textContent.slice(0, 400)"))
        await pg.evaluate("() => { const g = window.__game, s = g.state; g.ui.closeModal(); g.controls.centerOn(1, 38, 30); s.clock.min = Math.floor(s.clock.min / 1440) * 1440 + 20.5 * 60; }")
        await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT + f'73_{Q}_rua_noite.png')
        print('erros', errs[:10])
        await b.close()
asyncio.run(main())
