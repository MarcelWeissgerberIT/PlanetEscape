// Headless check for wear: machines slow down when worn out, spare parts repair them, the core's drones do it within reach.
import { MINE_SECONDS, REPAIR_COST, WEAR_SECONDS } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { newGame } from '../src/game/world';

const st = newGame(9, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 64, h: 64, blank: true });
const sim = new Sim(st);
st.kits = { miner: 4 };
st.nextEventAt = Infinity;
st.nextContractAt = Infinity;
const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
const core = sim.core()!;
// ore patches: one near the core, one far outside its reach
const ore = (x: number, y: number) => { st.terrain[y * st.width + x] = 'iron_ore'; st.ore[y * st.width + x] = 9999; };
ore(core.x + 5, core.y); ore(60, 60);
const near = sim.place('miner', core.x + 5, core.y, 0)!;
const far = sim.place('miner', 60, 60, 0)!;
tick(40); // the far miner needs its kit delivered
if (near.site || far.site) throw new Error('miners not built');
// a fresh miner wears slowly
tick(10);
console.log('wear after 10 s', near.wear?.toFixed(4), 'expected about', (10 / WEAR_SECONDS).toFixed(4));
if (!near.wear || near.wear > 0.05) throw new Error('wear not counted');
// worn out: half speed
st.inventory = {};
st.autoRepair = true;
near.wear = 1;
far.wear = 1;
near.output = {}; near.progress = 0;
tick(1 / 30);
if (near.status !== 'worn') throw new Error(`worn miner status ${near.status}`);
const p0 = near.progress ?? 0;
tick(MINE_SECONDS / 4);
const rate = ((near.progress ?? 0) - p0) / (MINE_SECONDS / 4);
console.log('worn progress per second', rate.toFixed(3), 'fresh would be', (1 / MINE_SECONDS).toFixed(3));
if (Math.abs(rate - 0.5 / MINE_SECONDS) > 0.05 / MINE_SECONDS) throw new Error('worn miner not at half speed');
// no spare parts: nothing happens; with parts the near one is repaired by the drones, the far one waits
st.inventory = { machine_part: 10, iron_plate: 20 };
tick(1.5);
console.log('near wear', near.wear?.toFixed(2), 'far wear', far.wear?.toFixed(2), 'parts', st.inventory.machine_part);
if ((near.wear ?? 0) > 0.1 || (far.wear ?? 0) < 1) throw new Error('auto repair wrong');
if (st.inventory.machine_part !== 10 - REPAIR_COST.machine_part!) throw new Error('repair cost wrong');
far.output = {};
tick(1 / 30);
if (!sim.analyze().some((p) => p.building === far && p.status === 'worn')) throw new Error('far worn miner not reported');
if (!sim.repair(far) || far.wear !== 0) throw new Error('manual repair failed');
// quake: ride it out wears machines
st.event = { id: 1, kind: 'quake', until: st.time + 90 };
sim.resolveEvent('b');
console.log('after the quake', near.wear?.toFixed(2), far.wear?.toFixed(2));
if ((near.wear ?? 0) < 0.5 || (far.wear ?? 0) < 0.5) throw new Error('quake did not wear');
// playground: no wear
{
  const pg = newGame(4, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 40, h: 40, blank: true });
  if (new Sim(pg).wearOn()) throw new Error('playground must not wear');
}
console.log('wear check ok');
