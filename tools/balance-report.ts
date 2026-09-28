// Balance report: the solver plays chapters 3-6 and then keeps the factory running; prints what the
// newer systems cost and give (wear repairs, research projects, contract rewards) against the production.
import { MISSIONS, PROJECTS, REPAIR_COST } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { solveOrder } from '../src/game/solver';
import type { ItemId } from '../src/game/types';
import { chapterState } from '../src/game/world';

const extra = Number(process.env.PE_EXTRA) || 1800; // seconds to keep running after the chapter goal
for (const ch of [3, 4, 5, 6]) {
  const st = chapterState(ch, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false });
  st.nextEventAt = 1e12; // events are random, keep the report comparable
  st.nextContractAt = 1e12;
  const sim = new Sim(st);
  let repairs = 0;
  const repair = sim.repair.bind(sim);
  sim.repair = (b) => { const ok = repair(b); if (ok) repairs++; return ok; };
  let log = solveOrder(sim, 6);
  let t = 0, doneAt = -1, rounds = 1;
  const start = st.missionIndex;
  // the chapter goal, then `extra` seconds more with the next mission's unlocks (as a player would continue)
  while (t < 3000 && (doneAt < 0 || t < doneAt + extra)) {
    sim.tick(1 / 30);
    t += 1 / 30;
    if (doneAt < 0 && st.missionIndex > start) doneAt = t;
    if (doneAt < 0 && !log.ok && Math.round(t * 30) % (240 * 30) === 0 && rounds < 8) { log = solveOrder(sim, 6); rounds++; }
  }
  const produced = st.stats.produced;
  const perMin = (k: ItemId) => (((produced[k] ?? 0) / t) * 60).toFixed(1);
  const machines = st.buildings.filter((b) => ['machine', 'miner'].includes((sim as unknown as { state: typeof st }).state && b.type ? (b.type === 'miner' ? 'miner' : b.recipe ? 'machine' : '') : '')).length;
  const repairIron = repairs * (REPAIR_COST.iron_plate ?? 0), repairParts = repairs * (REPAIR_COST.machine_part ?? 0);
  const afford = PROJECTS.filter((p) => sim.projectState(p.id) === 'open' && Object.entries(p.cost).every(([k, n]) => (st.inventory[k as ItemId] ?? 0) >= n!)).map((p) => p.id);
  const open = PROJECTS.filter((p) => sim.projectState(p.id) === 'open').map((p) => p.id);
  console.log(`ch${ch} (${MISSIONS[ch - 1].id}) goal ${doneAt < 0 ? 'NOT DONE' : Math.round(doneAt) + ' s'}, ran ${Math.round(t)} s, machines+miners ${machines}`);
  console.log(`  per min: iron plate ${perMin('iron_plate')}, copper plate ${perMin('copper_plate')}, machine part ${perMin('machine_part')}, wire ${perMin('copper_wire')}, circuit ${perMin('circuit')}, steel ${perMin('steel_frame')}`);
  console.log(`  repairs ${repairs} (iron ${repairIron} = ${((100 * repairIron) / Math.max(1, produced.iron_plate ?? 0)).toFixed(1)} % of iron made, parts ${repairParts} = ${((100 * repairParts) / Math.max(1, produced.machine_part ?? 0)).toFixed(1)} % of parts made)`);
  console.log(`  worn now ${st.buildings.filter((b) => (b.wear ?? 0) >= 1).length}, inventory ${JSON.stringify(st.inventory)}`);
  console.log(`  projects open ${open.length}: affordable now ${afford.join(', ') || '-'}`);
}
