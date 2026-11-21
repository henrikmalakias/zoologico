# 1.8.3b: Demolir e lagos no navegador. Aba Demolir com 4 modos por toque/arrasto de verdade: Recinto com animais
# (mudam de caminhão e vendidos), lago (manter e aterrar, obra de terraplanagem), Bloco em água solta, Prédio, Área com
# prévia vermelha; construção rápida com e sem 💧 Com lago; + Lago na ficha (e falta de espaço oferecendo Ampliar);
# Baixo/Alto/Ultra e Economia; save antigo da 1.8.3 (gerado pela build antiga em :8766) carregando na 1.8.3b.
# Uso: python3 tests/v183b_demolir_browser.py  (dist/ em http://localhost:8765 e a build da 1.8.3 em :8766)
# Capturas em /home/claude/shots/83c_*.png
import asyncio, json, os
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'; os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:8765/index.html'; URL_OLD = 'http://localhost:8766/index.html'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

async def toasts(pg): return await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / ')")
async def limpa(pg): await pg.evaluate("() => { const u=window.__game.ui; u.closeSheet(); u.closeModal(); u.hideConfirm(); document.querySelectorAll('.toast').forEach(t=>t.remove()); }")
async def focar(pg, tx, ty, dist=50, dz=16):
    await pg.evaluate("([x,y,d,dz]) => { const g=window.__game; g.controls.centerOn((x+0.5)*2-72, (y+0.5)*2-72+dz, d); }", [tx, ty, dist, dz]); await pg.wait_for_timeout(1300)
async def olhar(pg, tx, ty, dist=34):  # de cima, olhando direto para o bloco
    await pg.evaluate("([x,y,d]) => { const g=window.__game; g.controls.centerOn((x+0.5)*2-72, (y+0.5)*2-72, d); g.controls.cam.pitch=0.9; }", [tx, ty, dist]); await pg.wait_for_timeout(1500)
async def centroAgua(pg, h):
    return await pg.evaluate("(h) => { const s=window.__game.state, c=[]; for (let y=h.y-1;y<=h.y+h.h;y++) for (let x=h.x-1;x<=h.x+h.w;x++) if (s.terrain[y*72+x]==='w' || (s.obras||[]).some(o=>(o.tipo==='lago'||o.tipo==='aterro') && o.cells.includes(y*72+x))) c.push([x,y]); return c.length ? [c.reduce((t,v)=>t+v[0],0)/c.length, c.reduce((t,v)=>t+v[1],0)/c.length] : [h.x+(h.w>>1), h.y+(h.h>>1)]; }", h)
async def tela(pg, tx, ty):  # posição na tela do centro do bloco
    return await pg.evaluate("([x,y]) => { const w={x:(x+0.5)*2-72, z:(y+0.5)*2-72}; return window.__game.world.project(w.x, 0, w.z); }", [tx, ty])
async def toque(pg, tx, ty):
    p = await tela(pg, tx, ty); await pg.mouse.click(p['x'], p['y']); await pg.wait_for_timeout(700)
async def modo(pg, m):
    await pg.evaluate("(m) => { const u=window.__game.ui; if (u.el.drawer.classList.contains('hidden')) u.toggleBuild(true); u.cat='demolir'; u.tool='demolir'; u.opts.demMode=m; u.renderDrawer(); }", m); await pg.wait_for_timeout(300)
async def clicaTexto(pg, sel, rx):
    return await pg.evaluate("([sel, rx]) => { const b=[...document.querySelectorAll(sel)].find(b=>new RegExp(rx).test(b.textContent)); if(!b) return false; b.click(); return true; }", [sel, rx])
async def modalTxt(pg): return await pg.evaluate("() => document.querySelector('.modal')?.innerText || ''")
async def barraTxt(pg): return await pg.evaluate("() => document.querySelector('.confirm:not(.hidden)')?.innerText || ''")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        errs = []
        # ---------- 0) save da 1.8.3 (build antiga) ----------
        ctxo = await b.new_context(viewport={'width': 420, 'height': 860}); po = await ctxo.new_page()
        po.on('pageerror', lambda e: errs.append('PAGEERROR-OLD: ' + str(e)))
        await po.goto(URL_OLD); await po.wait_for_timeout(2500); await po.click('text=Vamos lá!'); await po.wait_for_timeout(400)
        velho = await po.evaluate("""() => { const g=window.__game, s=g.state, R=window.__api.RAP; s.settings.tutorial.feito=true; g.ui.tut.hide(); s.money=5e6; s.areaLevel=3; s.settings.fugas=false; s.obraGratis=false;
            R.construirRapido(s,'zebra',14,10); R.construirRapido(s,'hipopotamo',34,10); R.construirRapido(s,'leao',54,10);
            const o=JSON.parse(JSON.stringify(g.currentSave())); return { o, v: g.state.gameVersion, hab: s.habitats.length, an: s.animals.length, money: Math.round(s.money) }; }""")
        await ctxo.close()
        print('save da 1.8.3:', {k: v for k, v in velho.items() if k != 'o'}, 'schema', velho['o']['schemaVersion'])

        ctx = await b.new_context(viewport={'width': 420, 'height': 860}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(2500); await pg.click('text=Vamos lá!'); await pg.wait_for_timeout(400)
        # carrega o save antigo no IndexedDB e reabre
        await pg.evaluate("""(o) => new Promise(res => { const r=indexedDB.open('zoologico',1); r.onsuccess=()=>{ const tx=r.result.transaction('saves','readwrite'); tx.objectStore('saves').put(o,'slot1'); tx.oncomplete=res; }; })""", velho['o'])
        pg2 = await ctx.new_page(); pg2.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg2.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.close(); pg = pg2; await pg.goto(URL); await pg.wait_for_timeout(4000)
        mig = await pg.evaluate("() => { const s=window.__game.state; return { versao: s.gameVersion, schema: s.schemaVersion, hab: s.habitats.length, an: s.animals.length, money: Math.round(s.money) }; }")
        print('save antigo carregado na 1.8.3b:', mig)
        await limpa(pg)
        # ---------- montagem do zoo de teste ----------
        await pg.evaluate("""() => { const g=window.__game, s=g.state, R=window.__api.RAP, B=window.__api; s.settings.autoQualidade=false; s.settings.economia=false; g.applyEco(); s.clock.min=10*60; s.clock.speed=1; s.money=5e6; s.settings.fugas=false;
            R.construirRapido(s,'zebra',34,30); R.construirRapido(s,'hipopotamo',14,30);
            for (let x=50;x<66;x++) B.paintTerrain(s,x,44,'p'); B.placeFacility(s,'lanchonete',52,42); B.placeFacility(s,'banheiro',58,42);
            for (const [x,y] of [[51,46],[53,47],[56,46],[60,47],[63,46]]) B.placePlant(s,x,y,'arbusto');
            B.distributeFurniture ? 0 : 0; window.__api.distributeFurniture(s, [...Array(16).keys()].map(k=>[50+k,44]), {poste:5,lixeira:5,banco:5}); }""")
        habs = await pg.evaluate("() => window.__game.state.habitats.map(h => ({ id: h.id, nome: h.name, x: h.x, y: h.y, w: h.w, h: h.h, n: window.__game.state.animals.filter(a=>a.hab===h.id).length, sp: h.rapido?.sp }))")
        print('recintos:', [(h['nome'], h['sp'], h['n']) for h in habs])
        Z1 = next(h for h in habs if h['sp'] == 'zebra' and h['y'] < 20); Z2 = next(h for h in habs if h['sp'] == 'zebra' and h['y'] > 20)
        H1 = next(h for h in habs if h['sp'] == 'hipopotamo' and h['y'] < 20); H2 = next(h for h in habs if h['sp'] == 'hipopotamo' and h['y'] > 20)
        L1 = next(h for h in habs if h['sp'] == 'leao')
        c = lambda h: (h['x'] + h['w'] // 2, h['y'] + h['h'] // 2)
        # ---------- 1) aba Demolir com 4 modos ----------
        await modo(pg, 'recinto'); await focar(pg, *c(Z1), 70)
        abas = await pg.evaluate("() => [...document.querySelectorAll('.drawer .item')].map(b=>b.innerText.replace(/\\n/g,' ')).join(' | ')")
        await pg.screenshot(path=OUT + '83c_aba_demolir.png'); print('modos:', abas)
        # ---------- 2) Recinto com animais: mudam de caminhão ----------
        await toque(pg, *c(Z1)); await pg.wait_for_timeout(500)
        m1 = await modalTxt(pg); await pg.screenshot(path=OUT + '83c_recinto_mudam.png')
        ok1 = await clicaTexto(pg, '.modal button', 'Demolir'); await pg.wait_for_timeout(900)
        z = await pg.evaluate("([a,b]) => { const s=window.__game.state; return { existe: s.habitats.some(h=>h.id===a), destino: s.animals.filter(x=>x.hab===b).length, entregas: (s._entregas||[]).map(e=>e.hab) }; }", [Z1['id'], Z2['id']])
        t = await toasts(pg); print('Recinto (zebras):', m1.replace('\n', ' · ')[:260], '|', ok1, z, '|', t[-160:])
        await limpa(pg); await focar(pg, *c(Z2), 34, 14); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + '83c_caminhao_destino.png')
        # ---------- 3) Recinto sem vaga: leões vendidos ----------
        await focar(pg, *c(L1), 70); await toque(pg, *c(L1)); await pg.wait_for_timeout(500)
        m2 = await modalTxt(pg); await pg.screenshot(path=OUT + '83c_recinto_vende.png'); print('Recinto (leões):', m2.replace('\n', ' · ')[:240])
        await clicaTexto(pg, '.modal button', 'Cancelar'); await pg.wait_for_timeout(400)
        vivo = await pg.evaluate("(a) => window.__game.state.habitats.some(h=>h.id===a)", L1['id']); print('cancelar mantém o recinto dos leões:', vivo)
        # ---------- 4) lago: aterrar (H1) e manter (H2) ----------
        LC1 = await centroAgua(pg, H1); LC2 = await centroAgua(pg, H2)
        await focar(pg, *c(H1), 70); await toque(pg, *c(H1)); await pg.wait_for_timeout(500)
        m3 = await modalTxt(pg); await pg.screenshot(path=OUT + '83c_lago_pergunta.png'); print('Recinto com lago:', m3.replace('\n', ' · ')[:330])
        await clicaTexto(pg, '.modal button', 'Aterrar'); await pg.wait_for_timeout(1200)
        at = await pg.evaluate("() => { const s=window.__game.state, o=s.obras.find(o=>o.tipo==='aterro'); return o ? { blocos: o.cells.length, min: Math.round(o.dur/60e3*10)/10, custo: o.custo } : null; }")
        print('aterro:', at, '|', (await toasts(pg))[-160:])
        await limpa(pg); await olhar(pg, *LC1); await pg.screenshot(path=OUT + '83c_aterro_obra.png')
        # ficha da obra (toque no tapume) e Terminar agora
        await pg.evaluate("() => { const g=window.__game, s=g.state, o=s.obras.find(o=>o.tipo==='aterro'); g.ui.select('obra', o.id); }"); await pg.wait_for_timeout(600)
        ficha = await pg.evaluate("() => document.querySelector('.sheet')?.innerText || ''"); await pg.screenshot(path=OUT + '83c_aterro_ficha.png')
        await clicaTexto(pg, '.sheet button', 'Terminar agora'); await pg.wait_for_timeout(1500)
        pos = await pg.evaluate("""(h) => { const s=window.__game.state; let w=0, lo=9, hi=-9; for (let y=h.y;y<h.y+h.h;y++) for (let x=h.x;x<h.x+h.w;x++) { const i=y*72+x; if (s.terrain[i]==='w') w++; for (const k of [y*73+x,y*73+x+1,(y+1)*73+x,(y+1)*73+x+1]) { lo=Math.min(lo,s.height[k]); hi=Math.max(hi,s.height[k]); } } return { agua: w, desnivel: Math.round((hi-lo)*100)/100, obras: s.obras.length }; }""", H1)
        await limpa(pg); await olhar(pg, *LC1); await pg.screenshot(path=OUT + '83c_aterro_pronto.png')
        print('ficha da terraplanagem:', ficha.replace('\n', ' · ')[:200], '| pronta:', pos)
        await focar(pg, *c(H2), 70); await toque(pg, *c(H2)); await pg.wait_for_timeout(500)
        await clicaTexto(pg, '.modal button', 'Manter o lago'); await pg.wait_for_timeout(900)
        mant = await pg.evaluate("(h) => { const s=window.__game.state; let w=0; for (let y=h.y;y<h.y+h.h;y++) for (let x=h.x;x<h.x+h.w;x++) if (s.terrain[y*72+x]==='w') w++; return { recinto: s.habitats.some(q=>q.id===h.id), agua: w, obras: s.obras.length }; }", H2)
        await limpa(pg); await olhar(pg, *LC2); await pg.screenshot(path=OUT + '83c_lago_mantido.png'); print('manter o lago:', mant)
        # ---------- 5) Bloco em água solta ----------
        await modo(pg, 'bloco')
        wt = await pg.evaluate("(h) => { const s=window.__game.state; for (let y=h.y;y<h.y+h.h;y++) for (let x=h.x;x<h.x+h.w;x++) if (s.terrain[y*72+x]==='w') return [x,y]; return null; }", H2)
        await focar(pg, wt[0], wt[1], 40, 12); await toque(pg, wt[0], wt[1]); await pg.wait_for_timeout(500)
        m5 = await modalTxt(pg); await pg.screenshot(path=OUT + '83c_bloco_agua.png'); print('Bloco em água:', m5.replace('\n', ' · ')[:260])
        await clicaTexto(pg, '.modal button', 'Aterrar este bloco'); await pg.wait_for_timeout(800)
        b1 = await pg.evaluate("() => window.__game.state.obras.filter(o=>o.tipo==='aterro').map(o=>o.cells.length)"); print('aterrar este bloco:', b1)
        # ---------- 6) Prédio ----------
        await limpa(pg); await modo(pg, 'predio'); await focar(pg, 53, 43, 40, 12); await toque(pg, 52, 42); await pg.wait_for_timeout(400)
        bp = await barraTxt(pg); await pg.screenshot(path=OUT + '83c_predio.png')
        await clicaTexto(pg, '.confirm button', 'Confirmar'); await pg.wait_for_timeout(600)
        fac = await pg.evaluate("() => window.__game.state.facilities.map(f=>f.type)"); print('Prédio:', bp.replace('\n', ' ')[:160], '| sobrou:', fac)
        # ---------- 7) Área (arrasto de verdade) ----------
        await limpa(pg); await modo(pg, 'area'); await focar(pg, 55, 50, 75, 22)
        a0 = await tela(pg, 49, 43); a1 = await tela(pg, 61, 48); print('arrasto de', a0, 'até', a1)
        await pg.mouse.move(a0['x'], a0['y']); await pg.mouse.down()
        for k in range(1, 13): await pg.mouse.move(a0['x'] + (a1['x'] - a0['x']) * k / 12, a0['y'] + (a1['y'] - a0['y']) * k / 12); await pg.wait_for_timeout(40)
        await pg.wait_for_timeout(500); await pg.screenshot(path=OUT + '83c_area_previa.png')
        await pg.mouse.up(); await pg.wait_for_timeout(700)
        ba = await barraTxt(pg) or await modalTxt(pg); await pg.screenshot(path=OUT + '83c_area_confirma.png')
        antes = await pg.evaluate("() => { const s=window.__game.state; return { plantas: s.objects.length, furn: s.furn.length, fac: s.facilities.length, money: Math.round(s.money) }; }")
        await clicaTexto(pg, '.confirm button', 'Confirmar'); await pg.wait_for_timeout(800)
        depois = await pg.evaluate("() => { const s=window.__game.state; return { plantas: s.objects.length, furn: s.furn.length, fac: s.facilities.length, money: Math.round(s.money) }; }")
        print('Área:', ba.replace('\n', ' ')[:220], '|', antes, '->', depois)
        await limpa(pg); await pg.wait_for_timeout(500); await pg.screenshot(path=OUT + '83c_area_depois.png')
        # ---------- 8) construção rápida com e sem lago ----------
        await pg.evaluate("() => { const u=window.__game.ui; u.toggleBuild(false); u.toggleBuild(true); u.cat='habitat'; u.tool='habitat'; u.opts.habMode='rapido'; u.opts.qsp='leao'; u.renderDrawer(); }")
        await focar(pg, 54, 30, 70); await toque(pg, 54, 30); await pg.wait_for_timeout(400)
        sem = await barraTxt(pg); await pg.screenshot(path=OUT + '83c_rapido_sem_lago.png')
        await clicaTexto(pg, '.confirm button', 'Com lago'); await pg.wait_for_timeout(500)
        com = await barraTxt(pg); await pg.screenshot(path=OUT + '83c_rapido_com_lago.png')
        print('prévia sem lago:', sem.replace('\n', ' ')[:200]); print('prévia com lago:', com.replace('\n', ' ')[:220])
        await clicaTexto(pg, '.confirm button', 'Construir'); await pg.wait_for_timeout(1200)
        lh = await pg.evaluate("() => { const s=window.__game.state, h=s.habitats[s.habitats.length-1], o=window.__api.OB.obraDoHab(s,h); return { id: h.id, nome: h.name, lago: h.rapido?.lago, obraMin: o ? Math.round(o.dur/60e3*10)/10 : null, x:h.x,y:h.y,w:h.w,h:h.h }; }")
        await pg.evaluate("(id) => { const g=window.__game, s=g.state, h=s.habitats.find(x=>x.id===id); window.__api.OB.terminarAgora(s, h.obra, Date.now()); }", lh['id']); await pg.wait_for_timeout(800)
        la = await pg.evaluate("(id) => { const s=window.__game.state, h=s.habitats.find(x=>x.id===id); return { agua: h.cells.filter(i=>s.terrain[i]==='w').length, leoes: s.animals.filter(a=>a.hab===id).length }; }", lh['id'])
        await limpa(pg); await pg.evaluate("() => window.__game.ui.toggleBuild(false)"); await olhar(pg, *(await centroAgua(pg, lh)), 40)
        await pg.screenshot(path=OUT + '83c_leoes_com_lago.png'); print('leões com lago:', lh, la)
        # ---------- 9) + Lago na ficha (zebras) ----------
        await pg.evaluate("(id) => window.__game.ui.select('hab', id)", Z2['id']); await pg.wait_for_timeout(700)
        tem = await pg.evaluate("() => [...document.querySelectorAll('.sheet button')].map(b=>b.textContent).filter(t=>/Lago|Ampliar|espécie/.test(t)).join(' | ')")
        await pg.screenshot(path=OUT + '83c_ficha_mais_lago.png')
        await clicaTexto(pg, '.sheet button', '\\+ Lago'); await pg.wait_for_timeout(500)
        bl = await barraTxt(pg); await clicaTexto(pg, '.confirm button', 'Confirmar'); await pg.wait_for_timeout(900)
        ob = await pg.evaluate("(id) => { const s=window.__game.state, o=s.obras.find(o=>o.tipo==='lago'&&o.hab===id); return o ? { min: o.dur/60e3, blocos: o.cells.length } : null; }", Z2['id'])
        LZ = await centroAgua(pg, Z2); await limpa(pg); await olhar(pg, *LZ, 40); await pg.screenshot(path=OUT + '83c_lago_em_obra.png')
        await pg.evaluate("(id) => { const s=window.__game.state, o=s.obras.find(o=>o.tipo==='lago'&&o.hab===id); window.__api.OB.terminarAgora(s, o.id, Date.now()); }", Z2['id']); await pg.wait_for_timeout(1200)
        await olhar(pg, *LZ, 40); await pg.screenshot(path=OUT + '83c_lago_pronto.png')
        zl = await pg.evaluate("(id) => { const s=window.__game.state, h=s.habitats.find(x=>x.id===id); return { agua: h.cells.filter(i=>s.terrain[i]==='w').length, zebras: s.animals.filter(a=>a.hab===id).length }; }", Z2['id'])
        print('ficha:', tem, '| barra:', bl.replace('\n', ' ')[:120], '| obra:', ob, '| pronto:', zl)
        # recinto apertado: oferece Ampliar
        ap = await pg.evaluate("""() => { const g=window.__game, s=g.state, B=window.__api; const r=B.placeHabitat(s, 40, 46, 45, 50, 'savana', 'ferro'); const h=s.habitats[s.habitats.length-1]; for (let k=0;k<3;k++) B.buyAnimal(s,'zebra',h.gateIn[0],h.gateIn[1]); g.ui.select('hab', h.id); return h.id; }""")
        await pg.wait_for_timeout(500); await clicaTexto(pg, '.sheet button', '\\+ Lago'); await pg.wait_for_timeout(400)
        apt = await barraTxt(pg); await pg.screenshot(path=OUT + '83c_lago_ampliar.png'); print('recinto apertado:', apt.replace('\n', ' ')[:200])
        await limpa(pg)
        # ---------- 10) gráficos e Economia ----------
        await pg.evaluate("() => { const s=window.__game.state, R=window.__api.RAP, D=window.__api.DEM; const h=s.habitats.find(x=>x.rapido?.sp==='leao'&&!x.rapido.lago); D.executarDemolir(s,{modo:'recinto',tx:h.x+3,ty:h.y+3},{}); }")
        q0 = await pg.evaluate("() => { const s=window.__game.state; const h=s.habitats.find(x=>x.cells.some(i=>s.terrain[i]==='w')); return h ? [h.x+(h.w>>1), h.y+(h.h>>1)] : null; }")
        await pg.evaluate("() => { const s=window.__game.state, D=window.__api.DEM; const h=s.habitats.find(x=>x.rapido?.sp==='zebra'); window.__api.RAP; }")
        for q in ['baixo', 'alto', 'ultra']:
            await pg.evaluate("(q) => window.__game.setQuality(q)", q); await pg.wait_for_timeout(3500 if q == 'ultra' else 1800)
            await olhar(pg, *LZ, 40)
            await pg.screenshot(path=OUT + f'83c_qualidade_{q}.png')
        await pg.evaluate("() => { const g=window.__game; g.state.settings.economia=true; g.applyEco(); }"); await pg.wait_for_timeout(1200)
        eco = await pg.evaluate("() => { const w=window.__game.world.obraView; let vis=0; for (const e of w.map.values()) vis += e.workers.filter(x=>x.visible).length; return { obras: w.map.size, operariosVisiveis: vis }; }"); print('economia:', eco)
        await olhar(pg, *LC2); await pg.screenshot(path=OUT + '83c_economia.png')
        await pg.evaluate("() => { const g=window.__game; g.setQuality('alto'); g.state.settings.economia=false; g.applyEco(); }"); await pg.wait_for_timeout(800)
        # ---------- 11) salvar e recarregar com obra de aterro em andamento ----------
        await pg.evaluate("() => { const s=window.__game.state, D=window.__api.DEM; let w=null; for (let i=0;i<72*72;i++) if (s.terrain[i]==='w' && !s._occ.hab[i] && !s._occ.obra[i]) { w=i; break; } if (w!=null) D.executarDemolir(s,{modo:'bloco',tx:w%72,ty:(w/72)|0},{aterrar:true,lagoTodo:true}); }")
        n0 = await pg.evaluate("async () => { const g=window.__game; await g.save(); return g.state.obras.map(o=>o.tipo).join(','); }")
        pg3 = await ctx.new_page(); pg3.on('pageerror', lambda e: errs.append('PAGEERROR3: ' + str(e))); pg3.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.close(); await pg3.goto(URL); await pg3.wait_for_timeout(4000)
        n1 = await pg3.evaluate("() => window.__game.state.obras.map(o=>o.tipo).join(',')")
        print('obras antes de recarregar:', n0, '| depois:', n1)
        print('ERROS NO CONSOLE:', errs if errs else 'nenhum')
        await b.close()
asyncio.run(main())
