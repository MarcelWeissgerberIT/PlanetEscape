// Headless check for warehouses (4x4..16x16), the wind turbine and the fusion plant.
import { HALL_SLOT_CAP, WIND_STORM_FACTOR } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

function world() {
  const st: GameState = newGame(11, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 64, h: 64, blank: true });
  const sim = new Sim(st);
  sim.creative = true;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  const total = (b: Building) => Object.values(b.store ?? {}).reduce((a, c) => a + (c ?? 0), 0);
  return { st, sim, place, tick, total };
}

// a 4x4 hall takes two kinds of items from two sides, shelves them, and hands nothing out while storing
{
  const w = world();
  const hall = w.place('hall4', 10, 10, 0);
  const a = w.place('storage', 7, 11, 1);
  a.store = { iron_plate: 120 };
  w.place('conveyor', 8, 11, 1);
  w.place('conveyor', 9, 11, 1); // enters from the west
  const b = w.place('storage', 11, 16, 0);
  b.store = { copper_wire: 60 };
  w.place('conveyor', 11, 15, 0);
  w.place('conveyor', 11, 14, 0); // enters from the south
  const out = w.place('storage', 11, 9, 0); // on the output edge: must stay empty while storing
  w.tick(40);
  const layout = w.sim.hallLayout(hall);
  console.log('hall4: store', hall.store, 'shelves', layout.map((s) => `${s.item}:${s.n}`).join(' '), 'used', w.sim.hallUsed(hall), '/', w.sim.hallSlots(hall), 'out', w.total(out));
  if ((hall.store!.iron_plate ?? 0) < 50 || (hall.store!.copper_wire ?? 0) < 30) throw new Error('hall does not take items from two sides');
  if (layout.length !== w.sim.hallUsed(hall) || layout.some((s) => s.n > HALL_SLOT_CAP)) throw new Error('shelf layout wrong');
  if (w.total(out) !== 0) throw new Error('hall hands out while storing');
  // hand out: only the filtered item leaves at the output edge
  hall.mode = 'pass';
  hall.recipe = 'copper_wire';
  w.tick(10);
  console.log('hall4 hand out (wire only): out', out.store);
  if ((out.store!.copper_wire ?? 0) < 5 || out.store!.iron_plate) throw new Error('hand out / filter wrong');
}

// a full 4x4 hall refuses a 17th kind and a 16th shelf beyond capacity
{
  const w = world();
  const hall = w.place('hall4', 20, 20, 0);
  hall.store = { iron_plate: 15 * HALL_SLOT_CAP }; // 15 shelves
  const ok = w.sim.accept(hall, 'glass', 1);
  const full = w.sim.accept(hall, 'quartz', 1);
  console.log('hall4 capacity: 16th shelf', ok, '17th', full, 'used', w.sim.hallUsed(hall));
  if (!ok || full) throw new Error('shelf capacity wrong');
}

// the 16x16 hall places and has 256 shelves
{
  const w = world();
  const big = w.place('hall16', 30, 30, 2);
  console.log('hall16 shelves', w.sim.hallSlots(big));
  if (w.sim.hallSlots(big) !== 256) throw new Error('hall16 size wrong');
  const arm = w.place('picker', 29, 35, 3); // takes from the hall behind it (east) and drops west
  big.store = { circuit: 10 };
  const sink = w.place('storage', 28, 35, 3);
  w.tick(5);
  console.log('picker out of hall16:', arm.acc, sink.store);
  if ((sink.store!.circuit ?? 0) < 3) throw new Error('picker cannot empty a hall');
}

// wind: output varies over time and grows in storms
{
  const w = world();
  w.place('wind', 5, 40);
  const seen: number[] = [];
  for (let s = 0; s < 120; s += 10) {
    w.tick(10);
    seen.push(w.sim.windFactor());
  }
  const lo = Math.min(...seen), hi = Math.max(...seen);
  console.log('wind factor range', lo.toFixed(2), hi.toFixed(2), 'supply', w.st.powerSupply);
  if (hi - lo < 0.15) throw new Error('wind does not vary');
  const calm = w.sim.windFactor();
  w.st.storm = 30;
  const storm = w.sim.windFactor();
  console.log('wind in a storm', calm.toFixed(2), '->', storm.toFixed(2));
  if (Math.abs(storm - calm * WIND_STORM_FACTOR) > 0.02) throw new Error('storm factor off');
}

// fusion plant: burns water, gives 60 power, stops without water
{
  const w = world();
  const plant = w.place('reactor', 40, 10);
  const src = w.place('storage', 38, 11, 1);
  src.store = { water: 3 };
  w.place('conveyor', 39, 11, 1);
  w.tick(2);
  const base = w.st.powerSupply;
  console.log('reactor: supply', base, 'water left', src.store!.water ?? 0, 'fuel s', plant.fuelSeconds?.toFixed(1));
  if (base < 60) throw new Error('reactor gives no power');
  w.tick(40);
  console.log('reactor after 40 s:', w.st.powerSupply, plant.status);
  if (plant.status !== 'no_fuel' || w.st.powerSupply >= base) throw new Error('reactor does not run out');
}
console.log('storage check ok');
