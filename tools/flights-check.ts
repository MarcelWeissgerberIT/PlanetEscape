// Headless check for supply flights after the launch: endless, growing, deterministic goals.
import { flightMission } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { ItemId } from '../src/game/types';
import { newGame } from '../src/game/world';

const a = flightMission(0), b = flightMission(4);
console.log('flight 1', JSON.stringify(a.deliver), JSON.stringify(a.rate), 'flight 5', JSON.stringify(b.deliver), JSON.stringify(b.rate));
if (JSON.stringify(flightMission(3)) !== JSON.stringify(flightMission(3))) throw new Error('flights not deterministic');
if (Object.keys(a.deliver).length !== 3) throw new Error('flight needs three items');
const sum = (m: typeof a) => Object.values(m.deliver).reduce((x, y) => x + (y ?? 0), 0);
if (sum(flightMission(8)) <= sum(flightMission(0))) throw new Error('flights do not grow');

const st = newGame(5, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
const sim = new Sim(st);
st.nextEventAt = Infinity;
st.nextContractAt = Infinity;
st.launched = true;
st.ship = { hull_plate: 24, engine: 5, nav_computer: 4, fuel_cell: 10, life_support: 5 };
const m = sim.currentMission()!;
if (m.id !== 'flight') throw new Error('no flight after launch');
const core = sim.core()!;
// deliver the cargo at the goal rate (the ship being full must not count)
sim.tick(1 / 30);
if ((st.flights ?? 0) !== 0) throw new Error('flight done without cargo');
const [rateItem, rate] = Object.entries(m.rate!)[0] as [ItemId, number];
const need = { ...m.deliver };
for (let s = 0; s < 3000 && !st.flights; s++) {
  for (const k in need) if ((need[k as ItemId] ?? 0) > 0) { sim.accept(core, k as ItemId, 0); need[k as ItemId]!--; }
  if (s % Math.max(1, Math.floor(60 / (rate + 2))) === 0) sim.accept(core, rateItem, 0);
  for (let i = 0; i < 30; i++) sim.tick(1 / 30);
}
console.log('flights done', st.flights, 'next', JSON.stringify(sim.currentMission()?.deliver));
if (st.flights !== 1) throw new Error('flight not completed');
if (sim.currentMission()!.deliver === m.deliver || JSON.stringify(sim.currentMission()!.deliver) === JSON.stringify(m.deliver)) throw new Error('next flight is the same');
console.log('flights check ok');
