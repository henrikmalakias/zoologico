import { newGame, simulateAbstract, hire, genCandidate, stars } from '../src/sim/core.js';
import { placeHabitat, placeFacility, placePlant, buyAnimal } from '../src/sim/build.js';
const now = Date.now(), s = newGame(now);
const h = placeHabitat(s, 25, 26, 34, 34, 'savana', 'ferro').hab;
for (let i = 0; i < 4; i++) placePlant(s, h.x + 1 + i * 2, h.y + 2, 'acacia');
const f = placeHabitat(s, 38, 26, 46, 34, 'floresta', 'muro').hab;
for (let i = 0; i < 7; i++) placePlant(s, f.x + 1 + i, f.y + 2, 'arvore_floresta');
for (let i = 0; i < 4; i++) buyAnimal(s, 'zebra', h.x + 2, h.y + 2);
for (let i = 0; i < 5; i++) buyAnimal(s, 'macaco', 40, 28);
placeFacility(s, 'lanchonete', 30, 38); placeFacility(s, 'banheiro', 38, 38); placeFacility(s, 'centro', 24, 40);
const want = process.argv[2] === 'mgr' ? ['tratador', 'tratador', 'veterinario', 'seguranca', 'faxineiro', 'subgerente'] : ['tratador', 'tratador', 'veterinario', 'seguranca', 'faxineiro'];
for (const r of want) { let c; do { c = genCandidate(s, now); } while (c.role !== r); s.candidates.push(c); hire(s, c.id); }
s.money = 60000;
for (let d = 1; d <= 10; d++) {
  simulateAbstract(s, 1440, { now });
  const an = s.animals; const w = an.reduce((t, a) => t + a.welfare, 0) / an.length;
  console.log(`dia ${d}: animais ${an.length} bem-estar ${w.toFixed(2)} doentes ${an.filter(a => a.sick).length} fugidos ${an.filter(a => a.escaped).length} alertas ${s.alerts.map(a => a.type + (a.assigned ? '*' : '')).join(',')} $${Math.round(s.money)} ★${stars(s)} vis/dia ${s.stats.history.at(-1)?.visitantes} cerca ${s.habitats.map(h => h.fenceHp.toFixed(2)).join('/')} comida ${s.habitats.map(h => h.food.toFixed(2)).join('/')}`);
}
console.log(s.log.slice(-15).map(l => l.msg).join('\n'));
