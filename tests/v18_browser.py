# 1.8: currículo com Entrevistar, contratação em experiência, ficha com nível, cursos e pedido de aumento, lista da Equipe com pedidos.
# Uso: python3 tests/v18_browser.py [baixo|alto|ultra] (dist/ em http://localhost:8765)
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'baixo'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 420, 'height': 860})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        await pg.evaluate("""(Q) => { const g = window.__game, s = g.state; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.settings.fugas = false; s.settings.selvagem = false; s.money = 3e6; s.clock.speed = 1; s.clock.min = 9 * 60; g.setQuality(Q);
          s.candidates = []; const base = { attrs: { habilidade: 3, rapidez: 3, dedicacao: 3 }, expected: 120, salary: 100, createdAt: Date.now(), expiresAt: Date.now() + 9e6 };
          [['tratador', ['distraido']], ['tratador', []], ['veterinario', ['talentoso']], ['subgerente', ['confuso']]].forEach(([r, t], i) => s.candidates.push({ ...base, attrs: r === 'subgerente' ? { decisao: 3, rapidez: 3, economia: 3 } : { ...base.attrs }, hidden: t, id: 90000 + i, role: r, name: 'Teste ' + (i + 1) }));
          g.ui.openModal('equipe', 'cv'); }""", Q)
        await pg.wait_for_timeout(600)
        n = await pg.evaluate("() => { const bs = [...document.querySelectorAll('.modal .btn')].filter(b => /Entrevistar/.test(b.textContent)); bs.slice(0, 2).forEach(b => b.click()); return bs.length; }")
        await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + f'18_{Q}_curriculos.png')
        print('botoes de entrevista', n, '| entrevistados', await pg.evaluate("() => window.__game.state.candidates.filter(c => c.entrev).length"))
        for k in range(4):
            await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal .card .btn.sm')].find(b => /^(⭐ )?Dia|^Contratar/.test(b.textContent)); b && b.click(); }"); await pg.wait_for_timeout(250)
        print('contratados', await pg.evaluate("() => { const s = window.__game.state; return [...s.staff, ...s.managers].map(x => x.role + ':oculto=' + x.oculto + ':exp=' + !!x.exp); }"))
        # ficha em experiência
        await pg.evaluate("() => { const g = window.__game; g.ui.closeModal(); g.ui.select('staff', g.state.staff[0].id); }"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + f'18_{Q}_ficha_experiencia.png')
        print('ficha exp:', await pg.evaluate("() => document.querySelector('.sheet')?.textContent.slice(0, 700)"))
        # efetiva, dá experiência, cria pedido e abre os cursos
        await pg.evaluate("""() => { const g = window.__game, s = g.state; for (const p of [...s.staff, ...s.managers]) { p.exp = 0; p.oculto = false; p.xp = 20; p.nivel = 1; }
          const a = s.staff[0]; a.pedido = { valor: 120, desde: s.clock.min, negociou: false }; g.ui._cursoAberto = a.id; g.ui.refresh(); }"""); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + f'18_{Q}_ficha_cursos.png', full_page=False)
        await pg.evaluate("() => { const sh = document.querySelector('.sheet'); sh.scrollTop = sh.scrollHeight; }"); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + f'18_{Q}_ficha_cursos2.png')
        r = await pg.evaluate("() => { const b = [...document.querySelectorAll('.sheet .btn')].find(b => /R\\$\\s*1\\.500/.test(b.textContent)); if (!b) return 'sem botao'; b.click(); const a = window.__game.state.staff[0]; return a.curso?.id; }")
        print('matricula:', r)
        await pg.wait_for_timeout(500)
        # equipe com pedido
        await pg.evaluate("() => window.__game.ui.openModal('equipe', 'func')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + f'18_{Q}_equipe_pedido.png')
        print('badge:', await pg.evaluate("() => document.querySelector('.bar .badge')?.textContent"))
        r = await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Aceitar'); b.click(); const a = window.__game.state.staff[0]; return [a.salary, !!a.pedido]; }")
        print('aceitar:', r)
        await pg.evaluate("() => window.__game.ui.openModal('equipe', 'sub')"); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + f'18_{Q}_subgerente.png')
        # roda um pouco em 3x
        await pg.evaluate("() => { const g = window.__game; g.ui.closeModal(); g.ui.closeSheet(); g.state.clock.speed = 3; }"); await pg.wait_for_timeout(6000)
        await pg.screenshot(path=OUT + f'18_{Q}_jogo.png')
        print('ERROS:', errs if errs else 'nenhum')
        await b.close()
asyncio.run(main())
