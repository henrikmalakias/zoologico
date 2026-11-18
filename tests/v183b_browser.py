# 1.8.3 (parte 2): tempo de obra no navegador. Tutorial com a primeira obra grátis, construção rápida de cada espécie
# (obra, tapume, Terminar agora pago), obra de perto (operários, guindaste, barra) com e sem Economia, caminhão chegando,
# prédio em obra, app fechado (relatório), save antigo (11) no IndexedDB, Baixo/Alto/Ultra e a entrada com um portão só.
# Uso: python3 tests/v183b_browser.py (dist/ servido em http://localhost:8765). Capturas em /home/claude/shots/83b_*.png
import asyncio, json
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
SPS = ['leao', 'zebra', 'elefante', 'girafa', 'macaco', 'hipopotamo', 'rinoceronte', 'flamingo', 'gorila', 'tartaruga']
POS = [(12, 8), (30, 8), (50, 8), (12, 26), (30, 26), (50, 27), (12, 43), (30, 43), (50, 43), (62, 26)]
URL = 'http://localhost:8765/index.html'

async def toasts(pg): return await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / ')")
async def focar(pg, tx, ty, dist=40, dz=10):
    await pg.evaluate("() => { window.__game.ui.closeSheet(); document.querySelectorAll('.toast').forEach(t=>t.remove()); window.__game.ui.hideConfirm(); }")
    await pg.evaluate("([x,y,d,dz]) => { const g=window.__game; g.controls.centerOn((x+0.5)*2-72, (y+0.5)*2-72+dz, d); }", [tx, ty, dist, dz]); await pg.wait_for_timeout(1200)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 420, 'height': 860}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!'); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { const s=window.__game.state; s.settings.autoQualidade=false; s.settings.economia=false; window.__game.applyEco(); s.clock.min=10*60; s.clock.speed=1; }")
        # 0) entrada com um portão só
        await pg.evaluate("() => { const g=window.__game; g.controls.centerOn(0, 33, 22); g.controls.cam.pitch=0.55; }"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + '83b_entrada.png')
        # 1) tutorial: construção rápida de zebras com toque de verdade -> obra
        await pg.evaluate("() => window.__game.ui.toggleBuild(true)"); await pg.wait_for_timeout(400)
        xy = await pg.evaluate("() => { const g=window.__game, c=g.world; const w={x:(30+0.5)*2-72, z:(30+0.5)*2-72}; g.controls.centerOn(w.x, w.z + 22, 60); return new Promise(r=>setTimeout(()=>r(c.project(w.x, 0, w.z)), 1500)); }")
        await pg.mouse.click(xy['x'], xy['y']); await pg.wait_for_timeout(500)
        barra = await pg.evaluate("() => document.querySelector('.confirm:not(.hidden)')?.textContent || ''")
        await pg.screenshot(path=OUT + '83b_previa_tempo.png')
        await pg.evaluate("() => [...document.querySelectorAll('.confirm button')].find(b=>/Construir/.test(b.textContent))?.click()"); await pg.wait_for_timeout(1500)
        z = await pg.evaluate("() => { const s=window.__game.state, h=s.habitats[0]; return { obra: !!h.obra, noMapa: s.animals.filter(a=>a.hab===h.id).length, aCaminho: s.aCaminho.length, gratis: s.obraGratis, passo: s.settings.tutorial.passo }; }")
        t1 = await toasts(pg)
        await pg.evaluate("() => window.__game.ui.toggleBuild(false)"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const g=window.__game, s=g.state, h=s.habitats[0]; g.ui.select('hab', h.id); }"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + '83b_ficha_obra_gratis.png')
        tut = await pg.evaluate("() => document.querySelector('.tut-box:not(.hidden)')?.textContent || ''")
        card = await pg.evaluate("() => [...document.querySelectorAll('.sheet .card')].map(c=>c.textContent).filter(t=>/obra|caminho/i.test(t)).join(' || ')")
        await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/Terminar agora/.test(b.textContent))?.click()"); await pg.wait_for_timeout(1200)
        z2 = await pg.evaluate("() => { const s=window.__game.state, h=s.habitats[0]; return { obra: !!h.obra, noMapa: s.animals.filter(a=>a.hab===h.id).length, gratis: s.obraGratis, dinheiro: s.money, entregas: (s._entregas||[]).length, passo: s.settings.tutorial.passo }; }")
        t2 = await toasts(pg)
        await pg.evaluate("() => window.__game.ui.closeSheet()")
        h0 = await pg.evaluate("() => { const h=window.__game.state.habitats[0]; return [h.gateOut[0], h.gateOut[1]]; }")
        await focar(pg, h0[0], h0[1], 30, 20); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + '83b_caminhao_parado.png')
        print('entrada ok | prévia:', barra[:170]); print('zebra em obra:', z, '|', t1[-150:]); print('tutorial:', tut[:120]); print('cartões:', card[:220]); print('terminar grátis:', z2, '|', t2[-120:])
        # 2) cada espécie pela interface, com obra e Terminar agora pago
        await pg.evaluate("() => { const g=window.__game, s=g.state; s.settings.tutorial.feito=true; g.ui.tut.hide(); s.money=5e6; s.areaLevel=3; s.settings.fugas=false; g.ui.toggleBuild(true); }")
        res = []
        for sp, (x, y) in zip(SPS, POS):
            r = await pg.evaluate("""([sp,x,y]) => { const g=window.__game, s=g.state, u=g.ui, OB=window.__api.OB; u.opts.habMode='rapido'; u.opts.qsp=sp; u.renderDrawer(); u.quick={sp,tx:x,ty:y,dims:null,folga:true}; u.showQuick();
              const n0=s.habitats.length, bt=[...document.querySelectorAll('.confirm button')].find(b=>/Construir/.test(b.textContent)); if(!bt) return {sp, erro: document.querySelector('.confirm')?.textContent};
              bt.click(); if (s.habitats.length===n0) return {sp, erro:'não construiu'}; const h=s.habitats[s.habitats.length-1], o=OB.obraDoHab(s,h);
              return {sp, h:h.id, obraMin: o ? Math.round(o.dur/60e3) : null, aCaminho: OB.aCaminhoDe(s,h.id).length, preco: o ? OB.precoTerminar(s,o,Date.now()) : 0}; }""", [sp, x, y])
            res.append(r)
        for r in res: print(r)
        await pg.evaluate("() => { const g=window.__game; g.ui.toggleBuild(false); g.ui.closeSheet(); document.querySelectorAll('.toast').forEach(t=>t.remove()); g.controls.centerOn(0,-20,150); }"); await pg.wait_for_timeout(2000)
        await pg.screenshot(path=OUT + '83b_parque_em_obra.png')
        # 3) obra de perto: leão na etapa 3 (andaime, operários, guindaste, barra)
        info = await pg.evaluate("""() => { const s=window.__game.state, h=s.habitats.find(h=>h.rapido?.sp==='leao'), o=window.__api.OB.obraDoHab(s,h); o.ini = Date.now() - o.dur*0.6; return [h.x+h.w/2, h.y+h.h/2, o.id]; }""")
        await focar(pg, int(info[0]), int(info[1]), 34, 16); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + '83b_obra_perto.png')
        perto = await pg.evaluate("(id) => { const e=window.__game.world.obraView.map.get(id); return e ? { operarios: e.workers.filter(w=>w.visible).length, guindaste: !!e.crane, andaimes: e.torres.map(l=>l.filter(g=>g.visible).length), barra: e.last } : null; }", info[2])
        j1 = await pg.evaluate("(id) => window.__game.world.obraView.map.get(id)?.crane?.userData.jib.rotation.y", info[2]); await pg.wait_for_timeout(1500)
        j2 = await pg.evaluate("(id) => window.__game.world.obraView.map.get(id)?.crane?.userData.jib.rotation.y", info[2])
        await pg.evaluate("() => { const g=window.__game; g.state.settings.economia=true; g.applyEco(); }"); await pg.wait_for_timeout(1500)
        j3 = await pg.evaluate("(id) => window.__game.world.obraView.map.get(id)?.crane?.userData.jib.rotation.y", info[2]); await pg.wait_for_timeout(1500)
        j4 = await pg.evaluate("(id) => window.__game.world.obraView.map.get(id)?.crane?.userData.jib.rotation.y", info[2])
        await pg.screenshot(path=OUT + '83b_obra_perto_eco.png')
        await pg.evaluate("() => { const g=window.__game; g.state.settings.economia=false; g.applyEco(); }")
        await focar(pg, int(info[0]), int(info[1]), 140, 30); await pg.wait_for_timeout(800)
        longe = await pg.evaluate("(id) => window.__game.world.obraView.map.get(id)?.workers.filter(w=>w.visible).length", info[2])
        print('de perto:', perto, '| guindaste gira:', j1 != j2, '| com economia parado:', j3 == j4, '| de longe operários:', longe)
        # ficha com obra em andamento e Terminar agora pago
        await pg.evaluate("() => { const s=window.__game.state, h=s.habitats.find(h=>h.rapido?.sp==='leao'); window.__game.ui.select('hab', h.id); }"); await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + '83b_ficha_obra.png')
        m0 = await pg.evaluate("() => window.__game.state.money")
        bt = await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/Terminar agora/.test(b.textContent))?.textContent")
        await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].find(b=>/Terminar agora/.test(b.textContent))?.click()"); await pg.wait_for_timeout(900)
        pos = await pg.evaluate("() => { const s=window.__game.state, h=s.habitats.find(h=>h.rapido?.sp==='leao'); return { obra: !!h.obra, leoes: s.animals.filter(a=>a.hab===h.id).length, dinheiro: s.money }; }")
        print('botão:', bt, '| pagou', m0 - pos['dinheiro'], '|', pos)
        await pg.evaluate("() => window.__game.ui.closeSheet()")
        # 4) caminhão chegando: zebra a 9 s do fim
        info2 = await pg.evaluate("""() => { const s=window.__game.state, h=s.habitats.find(h=>h.rapido?.sp==='zebra' && h.obra), o=window.__api.OB.obraDoHab(s,h); o.ini = Date.now() - o.dur + 9000; return [h.gateOut[0], h.gateOut[1], h.id]; }""")
        await focar(pg, info2[0], info2[1] + 4, 55, 24); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + '83b_caminhao_vindo.png')
        tr = await pg.evaluate("(hid) => !!window.__game.world.obraView.trucks.get(hid)?.visible", info2[2])
        await pg.wait_for_timeout(8500)
        chegou = await pg.evaluate("(hid) => { const s=window.__game.state; return { obra: !!s.habitats.find(h=>h.id===hid).obra, zebras: s.animals.filter(a=>a.hab===hid).length }; }", info2[2])
        await pg.screenshot(path=OUT + '83b_caminhao_chegou.png')
        print('caminhão vindo:', tr, '| depois:', chegou, '|', (await toasts(pg))[-120:])
        # 5) prédio em obra pela interface (lanchonete)
        await pg.evaluate("() => { const g=window.__game, u=g.ui; u.toggleBuild(true); u.cat='inst'; u.tool='inst'; u.opts.fac='lanchonete'; u.renderDrawer(); }")
        xy = await pg.evaluate("() => { const g=window.__game, c=g.world; const w={x:(41+0.5)*2-72, z:(34+0.5)*2-72}; g.controls.centerOn(w.x, w.z + 14, 34); return new Promise(r=>setTimeout(()=>r(c.project(w.x, 0, w.z)), 1300)); }")
        await pg.mouse.click(xy['x'], xy['y']); await pg.wait_for_timeout(400)
        conf = await pg.evaluate("() => document.querySelector('.confirm:not(.hidden)')?.textContent || ''")
        await pg.evaluate("() => [...document.querySelectorAll('.confirm button')].find(b=>/Confirmar|Sim|✅/.test(b.textContent))?.click()"); await pg.wait_for_timeout(500)
        fo = await pg.evaluate("() => { const s=window.__game.state, o=s.obras.find(o=>o.fac?.type==='lanchonete'); if (o) o.ini = Date.now() - o.dur*0.55; return o ? { min: Math.round(o.dur/60e3), pronta: s.facilities.some(f=>f.type==='lanchonete') } : null; }")
        await pg.evaluate("() => window.__game.ui.toggleBuild(false)"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + '83b_predio_obra.png')
        sel = await pg.evaluate("() => { const s=window.__game.state, o=s.obras.find(o=>o.fac?.type==='lanchonete'); window.__game.ui.select('obra', o.id); return document.querySelector('.sheet')?.textContent.slice(0,160); }"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '83b_ficha_predio.png')
        print('lanchonete:', conf[:90], fo, '| ficha:', sel)
        await pg.evaluate("() => window.__game.ui.closeSheet()")
        # 6) Baixo / Alto / Ultra com obras em andamento
        await focar(pg, 30, 26, 60, 22)
        for q in ['baixo', 'alto', 'ultra']:
            await pg.evaluate("(q) => window.__game.setQuality(q)", q); await pg.wait_for_timeout(3500 if q == 'ultra' else 1800)
            n = await pg.evaluate("() => window.__game.world.obraView.map.size")
            await pg.screenshot(path=OUT + f'83b_qualidade_{q}.png'); print('gráfico', q, 'obras desenhadas:', n)
        await pg.evaluate("() => window.__game.setQuality('alto')"); await pg.wait_for_timeout(1500)
        # 7) app fechado: salva, volta 70 min no relógio real e reabre
        antes = await pg.evaluate("() => { const s=window.__game.state; return { obras: s.obras.length, aCaminho: s.aCaminho.length, animais: s.animals.length }; }")
        await pg.evaluate("async () => { const g=window.__game; await g.save(); }")
        await pg.evaluate("""() => new Promise(res => { const r=indexedDB.open('zoologico',1); r.onsuccess=()=>{ const db=r.result, tx=db.transaction('saves','readwrite'), st=tx.objectStore('saves'), q=st.get('slot1'); q.onsuccess=()=>{ const o=q.result; o.clock.lastRealTs -= 70*60e3; for (const ob of o.obras) ob.ini -= 70*60e3; st.put(o,'slot1'); }; tx.oncomplete=res; }; })""")
        pg2 = await ctx.new_page(); pg2.on('pageerror', lambda e: errs.append('PAGEERROR2: ' + str(e)))
        await pg.close(); await pg2.goto(URL); await pg2.wait_for_timeout(4000)
        rel = await pg2.evaluate("() => document.querySelector('.modal')?.textContent || ''")
        await pg2.screenshot(path=OUT + '83b_relatorio_fechado.png')
        depois = await pg2.evaluate("() => { const s=window.__game.state; return { obras: s.obras.length, aCaminho: s.aCaminho.length, animais: s.animals.length, versao: s.schemaVersion }; }")
        print('app fechado:', antes, '->', depois, '| relatório:', rel[:300])
        # 8) save antigo (11) direto no IndexedDB
        await pg2.evaluate("""() => new Promise(res => { const g=window.__game, s=g.state; const o=JSON.parse(JSON.stringify(g.currentSave())); o.schemaVersion=11; delete o.obras; delete o.aCaminho; delete o.obraGratis; for (const h of o.habitats) delete h.obra;
            window.__v11 = { hab: o.habitats.length, an: o.animals.length, fac: o.facilities.length, money: Math.round(o.money) };
            const r=indexedDB.open('zoologico',1); r.onsuccess=()=>{ const tx=r.result.transaction('saves','readwrite'); tx.objectStore('saves').put(o,'slot1'); tx.oncomplete=res; }; })""")
        v11 = await pg2.evaluate("() => window.__v11")
        pg3 = await ctx.new_page(); pg3.on('pageerror', lambda e: errs.append('PAGEERROR3: ' + str(e)))
        await pg2.close(); await pg3.goto(URL); await pg3.wait_for_timeout(4000)
        mig = await pg3.evaluate("() => { const s=window.__game.state; return { versao: s.schemaVersion, hab: s.habitats.length, an: s.animals.length, fac: s.facilities.length, money: Math.round(s.money), obras: s.obras.length, aCaminho: s.aCaminho.length }; }")
        await pg3.screenshot(path=OUT + '83b_save_antigo.png')
        print('save 11:', v11, '->', mig)
        print('ERROS NO CONSOLE:', errs if errs else 'nenhum')
        await b.close()
asyncio.run(main())
