// Testes da 1.8.1: aparência do HUD e dos painéis (só visual). Confere ícones, fontes locais, economia de animações e que o save não mudou.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { ICON_NAMES, svg } from '../src/ui/icons.js';
import { SCHEMA } from '../src/sim/core.js';
import { APP_VERSION, CHANGELOG } from '../src/content/registry.js';
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok - ' : 'FALHOU: ') + m); if (!c) fails++; };
const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/ui/ui.js', import.meta.url), 'utf8');

// ícones: todos os do HUD, barra, câmera, avisos e cada tipo de alerta
const precisa = ['coin', 'star', 'people', 'sun', 'moon', 'pause', 'play', 'ff', 'fff', 'skip', 'eye', 'map', 'build', 'clip', 'team', 'target', 'gear', 'rotl', 'rotr', 'up', 'down', 'plus', 'minus', 'ok', 'warn', 'siren', 'info', 'trophy'];
ok(precisa.every(k => ICON_NAMES.includes(k)), 'todos os ícones do HUD, da barra, da câmera e dos avisos existem');
ok(['doenca', 'fome', 'cerca', 'brecha', 'portao', 'fuga', 'ferido'].every(k => ICON_NAMES.includes(k)), 'cada tipo de alerta tem ícone no mapa');
ok(ICON_NAMES.every(k => /^<svg class="ic" width="20" height="20" viewBox="0 0 24 24"/.test(svg(k)) && svg(k).endsWith('</svg>')), 'svg() gera SVG 24x24 válido para todos os ícones');
ok(ICON_NAMES.every(k => !/https?:|xlink:href|<image|<script/.test(svg(k))), 'ícones sem nada externo (offline)');

// fontes dentro do jogo, sem CDN
const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/['"]/g, ''));
ok(urls.length >= 3 && urls.every(u => u.startsWith('./fonts/')), 'style.css só usa fontes locais (' + urls.length + ' arquivos)');
ok(urls.every(u => existsSync(new URL('../src/ui/' + u.slice(2), import.meta.url))), 'arquivos das fontes existem');
const tam = urls.reduce((t, u) => t + statSync(new URL('../src/ui/' + u.slice(2), import.meta.url)).size, 0);
ok(tam < 80000, `fontes leves (${Math.round(tam / 1024)} KB)`);
ok(existsSync(new URL('../src/ui/fonts/OFL-Fredoka.txt', import.meta.url)) && existsSync(new URL('../src/ui/fonts/OFL-Nunito.txt', import.meta.url)), 'licenças OFL junto das fontes');
ok(!/https?:\/\//.test(css), 'style.css sem endereços externos');
ok(!/backdrop-filter/.test(css), 'sem backdrop-filter (pesado no celular)');
ok(/\.drawer,\.sheet,\.modal\{background:rgba\(247,238,214,\.985\)/.test(css), 'painéis roláveis com fundo 98,5% opaco (evita o retângulo escuro no 3D)');

// economia de calor e bateria reduz animações
ok(/\.eco \.alert,\.eco \.nextalert/.test(css) && /\.eco \.badge\.bump/.test(css) && /\.eco \.toast\.conquista::after\{display:none\}/.test(css), 'classe eco corta pulsar, quicar e brilho');
ok(/prefers-reduced-motion/.test(css), 'respeita "reduzir movimento" do aparelho');
ok(/classList\.toggle\('eco', eco\)/.test(ui) && /if \(this\._eco\) return;/.test(ui), 'ui.js liga a classe eco e não pulsa com economia');
ok(/this\._mv = s\.money/.test(ui) && /eco \|\|/.test(ui), 'dinheiro sem contagem com economia ligada');

// layout de celular: fichas com largura limitada e barra com botões flexíveis
ok(/\.chips\{[^}]*max-width:56%/.test(css) && /\.speed\{[^}]*max-width:46%/.test(css), 'HUD cabe em 420 px (fichas e velocidade com largura máxima)');
ok(/\.bar button\{[^}]*flex:1;max-width:86px/.test(css), 'barra de baixo com 5 botões flexíveis');

// só visual: save igual
ok(SCHEMA === 11, 'save continua no formato 11');
ok(APP_VERSION === '1.8.1' && CHANGELOG[0].versao === '1.8.1' && CHANGELOG[0].itens.length >= 6, 'versão 1.8.1 com novidades no topo do CHANGELOG');
const vnum = v => String(v).split('.').map(p => { const m = /^(\d+)([a-z]?)$/.exec(p); return m ? +m[1] + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : 0; });
const maior = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
ok(maior('1.8.1', '1.8') && maior('1.8.5', '1.8.1') && maior('1.9', '1.8.1'), 'checagem de atualização: 1.8 < 1.8.1 < 1.8.5 < 1.9');
const v = JSON.parse(readFileSync(new URL('../public/version.json', import.meta.url), 'utf8')), sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
ok(v.versao === '1.8.1' && /zoo-1\.8\.1/.test(sw), 'version.json e cache do service worker na 1.8.1');
console.log(fails ? `\n${fails} FALHAS em ${n}` : `\nTODOS OS TESTES DA 1.8.1 PASSARAM (${n})`); process.exit(fails ? 1 : 0);
