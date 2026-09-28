// Performance budget of the simulation: large factories must tick well inside the frame time.
// Prints ms per tick (the game ticks 30 times a second, up to 12 times per frame at high speed).
import { readFileSync } from 'node:fs';
import { migrate } from '../src/game/save';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function measure(name: string, sim: Sim, ticks = 600): number {
  for (let i = 0; i < 60; i++) sim.tick(1 / 30); // warm up
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) sim.tick(1 / 30);
  const ms = (performance.now() - t0) / ticks;
  console.log(`${name}: ${sim.state.buildings.length} buildings, ${sim.robots().length} robots, ${ms.toFixed(3)} ms per tick`);
  return ms;
}

// a big production floor: 24 lines drill -> smelter -> 30 belt tiles -> hall, plus robots on roads
function bigFactory(): Sim {
  const st: GameState = newGame(5, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 200, h: 200, blank: true });
  const sim = new Sim(st);
  sim.creative = true;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0) => sim.place(type, x, y, dir);
  for (let i = 0; i < 24; i++) {
    const y = 10 + i * 7;
    for (let k = 0; k < 3; k++) { st.terrain[(y) * st.width + 4 + k] = 'iron_ore'; st.ore[y * st.width + 4 + k] = 1e6; }
    for (let k = 0; k < 3; k++) place('miner', 4 + k, y, 1);
    place('smelter', 7, y, 1);
    for (let x = 8; x < 38; x++) place('conveyor', x, y, 1);
    place('assembler', 38, y, 1)?.recipe;
    const asm = sim.at(38, y);
    if (asm) sim.setRecipe(asm, 'steel_frame');
    for (let x = 40; x < 60; x++) place('conveyor', x, y, 1);
    place('hall4', 60, y - 1, 0);
    // robots: a dock after the hall and a road loop
    place('dock', 64, y, 1);
    for (let x = 65; x < 90; x++) place('road', x, y);
    place('depot', 70, y + 1);
    const drop = place('dock', 89, y - 1, 0);
    if (drop) drop.mode = 'unload';
    place('storage', 89, y - 2, 0);
  }
  for (let i = 0; i < 40; i++) place('solar', 100 + (i % 10), 10 + Math.floor(i / 10));
  return sim;
}

const results: [string, number, number][] = [];
const big = bigFactory();
results.push(['big factory', measure('big factory', big), 2.5]);
for (const f of ['saves/kora-blocks.json', 'saves/kora-terminal.json']) {
  const st = migrate(JSON.parse(readFileSync(f, 'utf8')));
  if (!st) throw new Error(`${f} did not load`);
  results.push([f, measure(f, new Sim(st), 300), 6]);
}
const over = results.filter(([, ms, budget]) => ms > budget);
if (over.length) throw new Error(`over budget: ${over.map(([n, ms, b]) => `${n} ${ms.toFixed(2)} > ${b} ms`).join(', ')}`);
console.log('perf check ok');
