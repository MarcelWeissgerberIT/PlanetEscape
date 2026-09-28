// Headless check for the service station (repairs worn machines in range from its own stock) and the recycler
// (half of a part's inputs come back, plates and raw materials are disposed of).
import { REPAIR_COST, SERVICE_RANGE, crateId, kitId } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState, ItemId } from '../src/game/types';
import { newGame } from '../src/game/world';

function world() {
  const st: GameState = newGame(17, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 96, h: 96, blank: true });
  const sim = new Sim(st);
  st.inventory = { iron_plate: 500, copper_plate: 200, machine_part: 50, copper_wire: 50, steel_frame: 20, circuit: 20 };
  st.kits = {};
  st.nextEventAt = st.nextContractAt = 1e12;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  return { st, sim, place, tick };
}

// service station: far from the core (no drones), repairs what is in range and stocked
{
  const w = world();
  const core = w.sim.core()!;
  const sx = core.x + 30, sy = core.y + 30;
  const station = w.place('service', sx, sy);
  const near = w.place('smelter', sx + 4, sy);
  const far = w.place('smelter', sx + SERVICE_RANGE + 6, sy);
  w.tick(60); // sites far out: the drones bring the kits
  if (station.site || near.site || far.site) throw new Error('sites not finished');
  near.wear = 0.95;
  far.wear = 1;
  w.tick(3);
  console.log('empty station:', station.status, 'near wear', near.wear);
  if (station.status !== 'starved' || (near.wear ?? 0) < 0.9) throw new Error('an empty station repaired');
  for (let i = 0; i < 6; i++) { w.sim.accept(station, 'machine_part', 0); w.sim.accept(station, 'iron_plate', 0); }
  for (let i = 0; i < 6; i++) w.sim.accept(station, 'iron_plate', 0);
  if (w.sim.accept(station, 'copper_plate', 0)) throw new Error('station took a wrong item');
  w.tick(3);
  console.log('stocked station: near wear', near.wear, 'far wear', far.wear, 'stock', JSON.stringify(station.store), 'repairs', station.acc);
  if ((near.wear ?? 0) > 0.05) throw new Error('station did not repair in range');
  if ((far.wear ?? 0) < 1) throw new Error('station repaired out of range');
  if (station.store!.machine_part !== 6 - REPAIR_COST.machine_part! || station.store!.iron_plate !== 12 - REPAIR_COST.iron_plate!) throw new Error('station stock accounting wrong');
  // a worn machine it covers is not a problem any more, the far one still is
  near.wear = 1;
  near.status = 'worn';
  const problems = w.sim.analyze().map((p) => p.building);
  far.status = 'worn';
  const problems2 = w.sim.analyze().map((p) => p.building);
  if (problems.includes(near)) throw new Error('a serviced machine is listed as a problem');
  if (!problems2.includes(far)) throw new Error('an uncovered worn machine is not listed');
}

// recycler: circuits come back as half their plates and wire, plates are disposed of, kits give half their material
{
  const w = world();
  const core = w.sim.core()!;
  const x = core.x + 6, y = core.y + 6;
  const rec = w.place('recycler', x, y, 1);
  w.place('conveyor', x + 1, y, 1);
  const box = w.place('storage', x + 2, y, 1);
  w.tick(3);
  const feed = (item: ItemId, n: number) => { let k = 0; for (let i = 0; i < 30 * 40 && k < n; i++) { if (w.sim.accept(rec, item, 1)) k++; w.sim.tick(1 / 30); } return k; };
  if (w.sim.accept(rec, 'circuit', 3)) throw new Error('recycler took an item through its output side');
  if (w.sim.accept(rec, crateId('iron_plate'), 1)) throw new Error('recycler took a crate');
  feed('circuit', 4); // circuit = 1 iron plate + 2 wire -> half: 0.5 plate + 1 wire each
  feed('iron_plate', 5); // made from ore: disposed of
  feed(kitId('miner'), 1); // miner kit = 6 iron + 2 copper -> 3 + 1
  w.tick(12);
  console.log('recycled into the box:', JSON.stringify(box.store), 'done', rec.acc);
  const got = box.store ?? {};
  if (got.copper_wire !== 4 || got.iron_plate !== 2 + 3 || got.copper_plate !== 1) throw new Error('salvage amounts wrong');
  if (rec.acc !== 10) throw new Error('not every item was recycled');
}
console.log('service check ok');
