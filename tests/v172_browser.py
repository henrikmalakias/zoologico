# 1.7.2a: água da ilha sem vazar pelo muro/caminho, árvores sólidas, macacos nas árvores, hipopótamo boiando,
# elefante no banho e pele molhada no Ultra. Uso: python3 tests/v172_browser.py [baixo|alto|ultra] [prefixo] [cenas]
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/home/claude/shots/'
Q = sys.argv[1] if len(sys.argv) > 1 else 'alto'
PRE = sys.argv[2] if len(sys.argv) > 2 else '72'
CENAS = sys.argv[3].split(',') if len(sys.argv) > 3 else ['ilha', 'arvores', 'macacos', 'agua']
SETUP = """(Q) => { const g = window.__game, s = g.state, A = window.__api; s.settings.tutorial.feito = true; s.settings.autoQualidade = false; s.settings.fugas = false; s.money = 3e6; s.clock.speed = 1; s.clock.min = 10 * 60;
  // ilha encostada no caminho + lago encostado no caminho
  const il = A.placeHabitat(s, 24, 25, 33, 34, 'savana', 'fosso');
  for (let y = 25; y <= 27; y++) for (let x = 35; x <= 38; x++) A.paintTerrain(s, x, y, 'w');
  // savana com árvores e lago fundo
  const sv = A.placeHabitat(s, 24, 38, 37, 49, 'savana', 'ferro').hab;
  for (const [x, y, t] of [[26, 40, 'acacia'], [29, 41, 'baoba'], [26, 46, 'acacia'], [35, 40, 'acacia'], [27, 43, 'arbusto_seco']]) A.placePlant(s, x, y, t);
  for (let y = 43; y <= 47; y++) for (let x = 30; x <= 35; x++) A.paintTerrain(s, x, y, 'w');
  for (let k = 0; k < 6; k++) { A.sculpt(s, 32, 45, 'baixar'); A.sculpt(s, 33, 45, 'baixar'); }
  for (const sp of ['zebra', 'zebra', 'girafa', 'hipopotamo', 'hipopotamo', 'elefante', 'flamingo', 'flamingo', 'flamingo']) A.buyAnimal(s, sp, 26, 48);
  // floresta com macacos
  const fl = A.placeHabitat(s, 40, 38, 49, 47, 'floresta', 'ferro').hab;
  for (const [x, y, t] of [[42, 40, 'arvore_floresta'], [44, 40, 'arvore_cipo'], [46, 43, 'arvore_floresta'], [43, 45, 'samambaia']]) A.placePlant(s, x, y, t);
  for (let k = 0; k < 5; k++) A.buyAnimal(s, 'macaco', 47, 46);
  g.setQuality(Q); return { ilha: il.ok, msg: il.msg, sv: sv.cells.length, fl: fl.cells.length }; }"""
POSE = """() => { const g = window.__game, s = g.state; s.clock.speed = 0;
  const fl = s.habitats[2], sv = s.habitats[1], A = window.__api;
  const obs = s.objects.filter(o => o.type.startsWith('arvore') && s._occ.hab[o.ty * 72 + o.tx] === fl.id).map(o => { const p = { x: (o.tx + 0.5) * 2 - 72, z: (o.ty + 0.5) * 2 - 72 }; return { o, p }; });
  const mk = s.animals.filter(a => a.sp === 'macaco');
  const top = t => (t.o.type === 'arvore_cipo' ? 3.4 : 3.35) * (t.o.sc || 1), tr = t => (t.o.type === 'arvore_cipo' ? 0.4 : 0.42) * (t.o.sc || 1);
  if (mk[0]) { const t = obs[0]; Object.assign(mk[0], { st: 'tree', tree: t.o.id, cy: top(t), x: t.p.x + 0.9, z: t.p.z + 0.3, rot: 1.2, stT: 999 }); }
  if (mk[1]) { const t = obs[1]; Object.assign(mk[1], { st: 'climb_up', tree: t.o.id, cy: 1.6, x: t.p.x, z: t.p.z + tr(t) + 0.14, rot: Math.PI, stT: 999 }); }
  if (mk[2]) { const t = obs[2]; Object.assign(mk[2], { st: 'tree_sleep', tree: t.o.id, cy: top(t), x: t.p.x - 0.7, z: t.p.z + 0.2, asleep: true }); }
  if (mk[3]) { const t = obs[0]; Object.assign(mk[3], { st: 'salto', tree: t.o.id, cy: top(t), jy: 0.7, x: t.p.x + 1.8, z: t.p.z + 0.4, rot: 1.57 }); }
  const hip = s.animals.filter(a => a.sp === 'hipopotamo'); const deep = { x: (32 + 1) * 2 - 72, z: (45 + 0.5) * 2 - 72 };
  if (hip[0]) Object.assign(hip[0], { x: deep.x, z: deep.z, st: 'bath', _nada: true, _wet: 1, rot: 0.6 });
  if (hip[1]) Object.assign(hip[1], { x: deep.x - 3.2, z: deep.z - 1.6, st: 'idle', _nada: false, _wet: 1, rot: 2.2 });
  const el = s.animals.find(a => a.sp === 'elefante'); if (el) Object.assign(el, { x: (30 + 0.6) * 2 - 72, z: (44 + 0.5) * 2 - 72, st: 'bath', _wet: 1, rot: 1.0 });
  const fm = s.animals.filter(a => a.sp === 'flamingo'); fm.forEach((f, i) => Object.assign(f, { x: (30 + 0.1 + i * 0.5) * 2 - 72, z: (47 + 0.6) * 2 - 72, st: 'filtrar', rot: i }));
  return { mk: mk.length, hip: hip.length, deep: window.__depth ? 1 : 0 }; }"""
VIEWS = {
  'ilha': {'ilha': (-14, -22, 0.55, 0.0, 18), 'ilha_canto': (-23, -22, 0.62, 0.7, 12), 'lago_caminho': (2, -21, 0.7, 0.2, 12)},
  'arvores': {'arvores': (-17, 14, 0.75, 0.3, 22)},
  'macacos': {'macacos': (15, 10, 0.18, 0.0, 9), 'macacos_cima': (15, 10, 0.6, 0.6, 9), 'macaco_tronco': (17, 10, 0.12, 0.0, 5), 'macacos_copa': (16, 14, 0.04, 0.0, 13)},
  'agua': {'hipo': (-7, 19, 0.45, 0.4, 11), 'banho': (-10, 18, 0.35, -0.3, 9)},
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(viewport={'width': 1100, 'height': 700})).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
        await pg.click('text=Vamos lá!')
        info = await pg.evaluate(SETUP, Q)
        await pg.wait_for_timeout(9000)
        pose = await pg.evaluate(POSE)
        await pg.wait_for_timeout(5000)
        for c in CENAS:
            for nome, (x, z, pit, yaw, dist) in VIEWS[c].items():
                await pg.evaluate(f"() => {{ const g = window.__game; g.controls.centerOn({x}, {z}, {dist}); g.controls.cam.pitch = {pit}; g.controls.cam.yaw = {yaw}; }}")
                await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + f'{PRE}_{Q}_{nome}.png')
        pos = await pg.evaluate("() => window.__game.state.animals.filter(a => a.sp === 'macaco').map(a => [a.st, a.x.toFixed(1), a.z.toFixed(1), (a.cy||0).toFixed(1)])")
        print(pos)
        st = await pg.evaluate("() => window.__game.state.animals.map(a => a.sp + ':' + a.st + (a.cy ? '@' + a.cy.toFixed(1) : '')).join(' ')")
        print(info, pose, st, 'erros', errs[:5]); await b.close()
asyncio.run(main())
