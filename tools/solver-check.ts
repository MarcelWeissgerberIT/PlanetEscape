import { LEVELS, MISSIONS } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { solveOrder, powerBalance } from '../src/game/solver';
import { levelState } from '../src/game/world';
const options = { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false } as const;
const only = process.argv[2] ? Number(process.argv[2]) : 0;
for (let ch = 1; ch <= LEVELS.length; ch++) {
  if (only && ch !== only) continue;
  let st = levelState(null, 0, options);
  for (let i = 1; i < ch; i++) { const m = MISSIONS[i - 1]; st.unlockedBuildings.push(...m.unlocks); st.unlockedRecipes.push(...m.unlockRecipes); st.missionIndex = i; st = levelState(st, i, options); }
  const sim = new Sim(st);
  const t0 = Date.now();
  let log = solveOrder(sim, 6);
  let secs = 0;
  let rounds = 1;
  while (secs < 3000 && sim.state.missionIndex < ch) {
    sim.tick(1 / 30);
    secs += 1 / 30;
    if (!log.ok && Math.round(secs * 30) % (240 * 30) === 0 && rounds < 8) { const l2 = solveOrder(sim, 6); rounds++; log = { ...l2, placed: [...log.placed, ...l2.placed] }; }
  }
  console.log(`  rounds ${rounds}`);
  const pb = powerBalance(sim);
  console.log(`ch${ch} solve=${log.ok} placed=${log.placed.length} ${log.error ?? ''} -> ${sim.state.missionIndex >= ch ? 'DONE in ' + Math.round(secs) + 's' : 'NOT DONE'} power ${pb.supply}/${pb.demand} (${Date.now() - t0}ms)`);
  if (!log.ok || sim.state.missionIndex < ch) {
    console.log('  steps:', log.steps.join(' | '));
    const m = MISSIONS[ch - 1];
    console.log('  order:', JSON.stringify(m.deliver), 'delivered', JSON.stringify(sim.state.delivered), 'ship', JSON.stringify(sim.state.ship));
    const probs = sim.analyze ? sim.analyze() : null;
    if (probs) console.log('  problems:', JSON.stringify(probs).slice(0, 600));
  }
}
export function ascii(sim: Sim, x0: number, y0: number, w: number, h: number): string {
  const st = sim.state;
  const T: Record<string, string> = { ground: '.', rock: '#', iron_ore: 'I', copper_ore: 'C', quartz: 'Q', ice: 'W', oil: 'O' };
  const B: Record<string, string> = { core: 'K', miner: 'M', smelter: 'S', printer: 'P', assembler: 'A', refinery: 'R', fabricator: 'F', solar: 's', generator: 'G', storage: 'D', splitter: 'Y', tunnel: 'T', sorter: 'X', overflow: 'V', mixer: 'N', valve: 'L' };
  const rows: string[] = [];
  for (let y = y0; y < y0 + h; y++) {
    let r = '';
    for (let x = x0; x < x0 + w; x++) {
      const b = sim.at(x, y);
      if (b) r += b.type === 'conveyor' ? '^>v<'[b.dir] : B[b.type] ?? '?';
      else r += T[st.terrain[y * st.width + x]] ?? '?';
    }
    rows.push(r);
  }
  return rows.join('\n');
}
if (process.env.MAP) {
  const ch = Number(process.env.MAP);
  let st = levelState(null, 0, options);
  for (let i = 1; i < ch; i++) { const m = MISSIONS[i - 1]; st.unlockedBuildings.push(...m.unlocks); st.unlockedRecipes.push(...m.unlockRecipes); st.missionIndex = i; st = levelState(st, i, options); }
  const sim = new Sim(st);
  const log = solveOrder(sim, 6);
  console.log(log.error, JSON.stringify(sim.state.inventory));
  const core = sim.state.buildings[0];
  console.log(ascii(sim, core.x - 20, core.y - 16, 44, 34));
}
