import { Sim } from '../src/game/sim';
import type { Building, Dir } from '../src/game/types';
import { newGame } from '../src/game/world';
const st = newGame(1, { mode: 'free', mapSize: 'small', infiniteOre: true, allUnlocked: true, storms: false }, { w: 40, h: 40, blank: true });
const sim = new Sim(st);
sim.creative = true;
const c = st.buildings[0];
const p = (t: Building['type'], x: number, y: number, d: Dir) => { const b = sim.place(t, x, y, d); if (!b) throw new Error(`place ${t} ${x},${y}: ${sim.placementError(t, x, y)}`); return b; };
const run = (s: number) => { for (let i = 0; i < 30 * s; i++) sim.tick(1 / 30); };
// register: 5 items from behind, then a signal from the side -> 5 items out into a depot; lamps show binary
const reg = p('register', c.x + 8, c.y, 1);
const dep = p('storage', c.x + 9, c.y, 1);
for (let i = 0; i < 5; i++) sim.accept(reg, 'iron_plate', 1);
const lampRow: Building[] = [];
sim.remove(dep);
for (let i = 1; i <= 8; i++) lampRow.push(p('lamp', c.x + 8 + i, c.y, 1));
run(1);
const bits = lampRow.map((l) => (sim.lampItem(l) ? 1 : 0)).join('');
console.log('register value 5 -> lamps', bits, bits === '00000101' ? 'OK' : 'FAIL');
for (const l of lampRow) sim.remove(l);
const dep2 = p('storage', c.x + 9, c.y, 1);
sim.accept(reg, 'copper_plate', 2); // signal from the side
run(2);
console.log('register release ->', JSON.stringify(dep2.store), reg.value === 0 ? 'OK' : 'FAIL');
// adder 3 + 2
const add = p('adder', c.x + 8, c.y + 4, 1); const d3 = p('storage', c.x + 9, c.y + 4, 1);
for (let i = 0; i < 3; i++) sim.accept(add, 'iron_plate', 1);
for (let i = 0; i < 2; i++) sim.accept(add, 'iron_plate', 2);
run(2); console.log('adder 3+2 ->', d3.store?.iron_plate, d3.store?.iron_plate === 5 ? 'OK' : 'FAIL');
// subtractor 5 - 2
const sub = p('subtractor', c.x + 8, c.y + 8, 1); const d4 = p('storage', c.x + 9, c.y + 8, 1);
for (let i = 0; i < 2; i++) sim.accept(sub, 'iron_plate', 2);
for (let i = 0; i < 5; i++) sim.accept(sub, 'iron_plate', 1);
run(2); console.log('subtractor 5-2 ->', d4.store?.iron_plate, d4.store?.iron_plate === 3 ? 'OK' : 'FAIL');
// multiplier 3 x 4
const mul = p('multiplier', c.x + 8, c.y + 12, 1); mul.value = 4; const d5 = p('storage', c.x + 9, c.y + 12, 1);
for (let i = 0; i < 3; i++) sim.accept(mul, 'iron_plate', 1);
run(3); console.log('multiplier 3x4 ->', d5.store?.iron_plate, d5.store?.iron_plate === 12 ? 'OK' : 'FAIL');
// divider 10 / 3
const div = p('divider', c.x + 8, c.y + 16, 1); div.value = 3; const d6 = p('storage', c.x + 9, c.y + 16, 1);
for (let i = 0; i < 10; i++) sim.accept(div, 'iron_plate', 1);
run(2); console.log('divider 10/3 ->', d6.store?.iron_plate, d6.store?.iron_plate === 3 ? 'OK' : 'FAIL');
// terminal: needs parts
const term = p('terminal', c.x + 8, c.y - 10, 0);
term.run = true; run(1);
console.log('terminal without parts:', term.status, term.missing);
for (let i = 0; i < 3; i++) sim.accept(term, 'circuit', 1);
sim.accept(term, 'quartz', 1);
run(1); console.log('terminal 3 banks + 1 crystal:', term.status, 'hz', sim.terminalHz(term), 'mem', JSON.stringify(sim.terminalMemory(term)), 'cycles', sim.cpu(term)?.cycles);
