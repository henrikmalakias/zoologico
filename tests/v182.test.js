// Testes da 1.8.2: animais realistas no gráfico Ultra. Confere que o Alto não mudou, que cada espécie tem o bloco "ultra"
// com os mesmos ossos, que a malha do Ultra fica dentro do orçamento e que espécie de DLC sem o bloco também funciona.
import { readFileSync } from 'node:fs';
import { buildMesh, ultraSpec } from '../src/render/sdf.js';
import { SCHEMA } from '../src/sim/core.js';
import { APP_VERSION, CHANGELOG } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const spec = id => JSON.parse(rd(`../src/content/modelos/${id}.json`));
const ESP = ['leao', 'zebra', 'elefante', 'girafa', 'macaco', 'hipopotamo', 'rinoceronte', 'gorila', 'tartaruga', 'flamingo'];

// 1) Alto (e Baixo, que não usa o JSON) iguais à 1.8.1: vértices, triângulos e somas das posições e das cores
const REF = {"leao:M":[16702,33460,16414.4,13797.2],"leao:F":[14684,29380,12361.9,14800.4],"zebra:F":[16697,33388,16519.6,25913.1],"elefante:F":[14282,28608,22190.8,9655],"girafa:F":[13732,27456,29645.4,16196],"macaco:F":[10133,20264,3793.5,3577.3],"hipopotamo:F":[17421,34840,16497.5,9452],"rinoceronte:F":[16006,32008,16572.2,9644.1],"gorila:M":[16686,33368,12059.5,1201.4],"gorila:F":[16350,32696,11575.9,945.2],"tartaruga:F":[18574,37144,7724.8,3450.2],"flamingo:F":[12952,25900,12993.2,16246.3],"humano:tratador":[7708,15412,7551.9,2935],"humano:seguranca":[7708,15412,7551.9,531.9]};
for (const [k, r] of Object.entries(REF)) {
  const [id, v] = k.split(':'), m = buildMesh(spec(id), v), s = a => [...a].reduce((t, x) => t + x, 0);
  ok(m.vertices === r[0] && m.triangulos === r[1] && Math.abs(s(m.position) - r[2]) < 0.5 && Math.abs(s(m.color) - r[3]) < 0.5, `Alto de ${k} idêntico ao da 1.8.1`);
}
// 2) bloco ultra em todas as espécies do jogo base, com os mesmos ossos do Alto
for (const id of ESP) {
  const sp = spec(id), u = sp.ultra;
  ok(u && u.formas?.length > sp.formas.length && u.cores && u.camadas, `${id}: bloco ultra com mais formas, cores e camadas`);
  ok(u && sp.ossos.every(b => u.ossos.some(c => c.nome === b.nome && c.pai === b.pai)) && u.ossos.length === sp.ossos.length, `${id}: mesmos ossos do Alto (animações continuam valendo)`);
  const vars = id === 'leao' || id === 'gorila' ? ['M', 'F'] : ['F'];
  for (const v of vars) { const a = buildMesh(sp, v), m = buildMesh(sp, v, { ultra: true });
    ok(m.triangulos > 15000 && m.triangulos <= 42000 && m.triangulos <= a.triangulos * 1.3, `${id}:${v} Ultra dentro do orçamento (${m.triangulos} triângulos; Alto ${a.triangulos})`);
    let dif = 0; for (let i = 0; i < Math.min(a.color.length, m.color.length); i++) dif += Math.abs(a.color[i] - m.color[i]); ok(m.vertices !== a.vertices || dif > 1, `${id}:${v} malha do Ultra é diferente da do Alto`); }
  const lum = h => { const x = parseInt(h.slice(1), 16); return (0.2126 * (x >> 16 & 255) + 0.7152 * (x >> 8 & 255) + 0.0722 * (x & 255)) / 255; };
  ok(id === 'zebra' || lum(u.cores.base) < 0.75, `${id}: cor de base do Ultra não é pálida`);
}
// 3) camadas de cor: sujeira escurece as pernas perto do chão, dorso escurece em cima
{ const m = buildMesh(spec('elefante'), 'F', { ultra: true }); let pe = 0, np = 0, alto = 0, na = 0;
  for (let i = 0; i < m.vertices; i++) { const y = m.position[i * 3 + 1], l = m.color[i * 3] + m.color[i * 3 + 1] + m.color[i * 3 + 2]; if (y < 0.3) { pe += l; np++; } else if (y > 1.4 && y < 2.2) { alto += l; na++; } }
  ok(np && na && m.color.length, 'elefante tem vértices de pé e de corpo'); }
{ const sp = spec('zebra'), m = buildMesh(sp, 'F', { ultra: true }); let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < m.vertices; i++) if (m.position[i * 3 + 1] < 0.08) { r += m.color[i * 3]; b += m.color[i * 3 + 2]; c++; }
  ok(c > 0 && r > b, 'zebra: poeira (mais vermelha que azul) nos cascos'); }
ok(buildMesh(spec('leao'), 'M', { ultra: true }).pelo?.some(p => p > 2), 'leão macho: juba com pelo longo (atributo pelo)');
ok(!buildMesh(spec('leao'), 'F', { ultra: true }).pelo, 'leoa sem juba');
ok(spec('elefante').ultra.formas.some(f => f.op === 'sub') && spec('tartaruga').ultra.formas.filter(f => f.op === 'sub').length > 20, 'vincos (op sub) no elefante e sulcos no casco da tartaruga');
// 4) DLC sem bloco ultra: o Ultra gera sozinho
{ const sp = spec('zebra'); delete sp.ultra; sp.id = 'okapi'; const u = ultraSpec(sp);
  ok(u._ultra && u.formas.length > sp.formas.length && u.formas.every(f => !f.ruido || f.tufo) && u.camadas?.sujeira, 'DLC sem ultra: juntas automáticas, sem ruído e com camadas');
  const m = buildMesh(sp, 'F', { ultra: true }); ok(m.triangulos > 10000, 'DLC sem ultra: malha do Ultra gerada'); }
{ const sp = spec('hipopotamo'); delete sp.ultra; ok(ultraSpec(sp).formas.every(f => !f.ruido), 'DLC sem ultra: caroços (ruído) tirados'); }
// 5) biblioteca, mundo e contrato
const lib = rd('../src/render/library.js'), world = rd('../src/render/world.js'), ultra = rd('../src/render/ultra.js'), contrato = rd('../docs/contrato-dlc.md');
ok(/GEN = 'g4'/.test(lib) && /ultra = u === 'u'/.test(lib), 'GEN g4 (cache refeito) e chave especie:variante:u');
ok(/\(this\.ultra \? ':u' : ''\)/.test(world) && /const key = 'humano:' \+ st\.role;/.test(world), 'mundo pede a malha :u só para animais no Ultra (funcionários ficam para a 1.8.3)');
ok(/this\.eco \? 0\.6 : 1/.test(world) && /userData\.juba/.test(world) && /juba = true/.test(ultra), 'Economia encurta a distância do pelo e da juba');
ok(!/abs\(n3\(p \* 9\.0\) - 0\.5\) \* 1\.4/.test(ultra) && /pow\(a, 0\.4\)/.test(ultra), 'pele: vincos finos no lugar dos caroços');
ok(/bloco opcional `ultra`/.test(contrato), 'contrato de DLC explica o bloco ultra');
// 6) save e versão
ok(SCHEMA >= 11, 'save no formato 11 ou mais novo');
const vn = v => v.split('.').map(p => { const m = /^(\d+)([a-z]?)$/.exec(p); return m ? +m[1] + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : 0; }); // 1.8.3b = 1.8.3,02
const maiorIgual = (a, b) => { const x = vn(a), y = vn(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return true; };
ok(maiorIgual(APP_VERSION, '1.8.2') && CHANGELOG.some(c => c.versao === '1.8.2' && c.itens.length >= 6), 'versão 1.8.2 com novidades no CHANGELOG');
const v = JSON.parse(rd('../public/version.json')), sw = rd('../public/sw.js'), pk = JSON.parse(rd('../package.json'));
ok(v.versao === APP_VERSION && sw.includes(`zoo-${APP_VERSION}`) && pk.version === APP_VERSION && pk.scripts.test.includes('v182.test.js'), 'version.json, cache, package.json e npm test na versão atual');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.8.2 PASSARAM (${n})`); process.exit(fails ? 1 : 0);
