// Headless check for the logistics parts: grabber arm, roads with robots and docks, stacker / unstacker.
import { CRATE_SIZE, crateId } from '../src/game/data';
import { buildLogistics } from '../src/game/examples';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

function world() {
  const st: GameState = newGame(9, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
  const sim = new Sim(st);
  sim.creative = true;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  const count = (d: Building) => Object.values(d.store ?? {}).reduce((a, c) => a + (c ?? 0), 0);
  return { st, sim, place, tick, count };
}

// picker: from a depot into a depot, one per second; with a filter only that item; reach 2 skips a tile
{
  const w = world();
  const src = w.place('storage', 4, 4, 0);
  src.store = { iron_plate: 20, copper_wire: 20 };
  const arm = w.place('picker', 5, 4, 1);
  const sink = w.place('storage', 6, 4, 1);
  w.tick(10);
  console.log('picker: moved', arm.acc, 'sink', sink.store);
  if ((arm.acc ?? 0) < 8 || (arm.acc ?? 0) > 11 || w.count(sink) !== arm.acc) throw new Error('picker rate off');
  arm.recipe = 'copper_wire';
  w.tick(2); // the plate already on the arm still lands
  const before = sink.store!.copper_wire ?? 0, ironBefore = sink.store!.iron_plate ?? 0;
  w.tick(5);
  if ((sink.store!.copper_wire ?? 0) <= before || (sink.store!.iron_plate ?? 0) !== ironBefore) throw new Error('picker filter ignored');
  const far = w.place('storage', 10, 8, 0);
  far.store = { glass: 10 };
  const arm2 = w.place('picker', 12, 8, 1);
  arm2.threshold = 2;
  const sink2 = w.place('storage', 14, 8, 1);
  w.tick(5);
  console.log('picker reach 2: moved', arm2.acc, 'sink', sink2.store);
  if ((arm2.acc ?? 0) < 3 || (sink2.store!.glass ?? 0) !== arm2.acc) throw new Error('picker reach 2 broken');
}

// robots: pick-up dock at one end of a road, drop-off dock at the other, a depot with two robots in between
{
  const w = world();
  const src = w.place('storage', 10, 8, 2);
  src.store = { circuit: 100 };
  w.place('dock', 10, 9, 2); // pick-up, fed from the north
  for (let x = 10; x <= 24; x++) w.place('road', x, 10);
  const depot = w.place('depot', 16, 11);
  const drop = w.place('dock', 24, 9, 0);
  drop.mode = 'unload';
  const sink = w.place('storage', 24, 8, 0);
  w.tick(1);
  const fleet = w.sim.robots().filter((r) => r.depot === depot.id);
  console.log('robots spawned', fleet.length, 'at', fleet.map((r) => `${r.x},${r.y}`));
  if (fleet.length !== 2) throw new Error('depot did not spawn its robots');
  w.tick(40);
  console.log('robots: delivered', w.count(sink), 'states', fleet.map((r) => `${r.state}/${r.items.length}`), 'source left', src.store!.circuit);
  if (w.count(sink) < 24) throw new Error('robots do not deliver');
  // a filter on the drop-off dock: robots stop bringing circuits
  drop.recipe = 'iron_plate';
  w.tick(4); // what is already in the dock still goes out
  const n = w.count(sink);
  w.tick(15);
  if (w.count(sink) !== n) throw new Error('drop-off filter ignored');
  // removing the depot removes its robots
  w.sim.remove(depot);
  if (w.sim.robots().length !== 0) throw new Error('robots survive their depot');
}

// stacker: 16 plates -> 2 crates -> unstacker -> 16 plates; crates are refused by machines
{
  const w = world();
  const src = w.place('storage', 4, 20, 1);
  src.store = { iron_plate: 16 };
  const pack = w.place('stacker', 5, 20, 1);
  w.place('conveyor', 6, 20, 1);
  const mid = w.place('storage', 7, 20, 1);
  w.tick(20);
  console.log('stacker: crates', pack.acc, 'mid', mid.store);
  if ((pack.acc ?? 0) !== 2 || (mid.store![crateId('iron_plate')] ?? 0) !== 2) throw new Error('crates did not reach the depot');
  const un = w.place('stacker', 8, 20, 1);
  un.mode = 'unpack';
  const sink = w.place('storage', 9, 20, 1);
  w.tick(15);
  console.log('unstacker: opened', un.acc, 'sink', sink.store);
  if ((un.acc ?? 0) !== 2 || (sink.store!.iron_plate ?? 0) !== 2 * CRATE_SIZE) throw new Error('unstacker wrong');
  const crateSrc = w.place('storage', 4, 24, 1);
  crateSrc.store = { [crateId('iron_plate')]: 3 };
  const smelter = w.place('smelter', 5, 24, 1);
  w.tick(3);
  if ((crateSrc.store![crateId('iron_plate')] ?? 0) !== 3 || Object.keys(smelter.input ?? {}).length) throw new Error('a machine took a crate');
}

// the playground example runs: crates arrive, the arm moves wire
{
  const st = buildLogistics();
  const sim = new Sim(st);
  for (let i = 0; i < 30 * 90; i++) sim.tick(1 / 30);
  const sinks = st.buildings.filter((b) => b.type === 'hall4' && b.store && (b.store.iron_plate || b.store.copper_wire));
  const sink = sinks.find((b) => b.store!.iron_plate && b.store!.copper_wire);
  console.log('example: sink', sink?.store, 'robots', sim.robots().map((r) => `${r.state}/${r.items.length}`));
  if (!sink || (sink.store!.iron_plate ?? 0) < 16 || (sink.store!.copper_wire ?? 0) < 10) throw new Error('example chain does not deliver');
}
// battery: on a long road robots run low, drive home, charge in a bay and keep delivering
{
  const w = world();
  const src = w.place('storage', 2, 4, 2);
  src.store = { iron_plate: 400 };
  w.place('dock', 2, 5, 2);
  for (let x = 2; x <= 45; x++) w.place('road', x, 6);
  const drop = w.place('dock', 45, 5, 0);
  drop.mode = 'unload';
  const sink = w.place('hall4', 43, 1, 0); // big enough for ten minutes of deliveries
  const depot = w.place('depot', 3, 7);
  depot.threshold = 2;
  let charged = 0, minCharge = 1, wasCharging = new Set<number>();
  for (let i = 0; i < 30 * 600; i++) {
    w.sim.tick(1 / 30);
    for (const r of w.sim.robots()) {
      minCharge = Math.min(minCharge, r.charge ?? 1);
      if (r.state === 'charge' && !wasCharging.has(r.id)) { charged++; wasCharging.add(r.id); }
      if (r.state !== 'charge') wasCharging.delete(r.id);
    }
  }
  console.log('battery: charging stops', charged, 'lowest charge', minCharge.toFixed(2), 'delivered', w.count(sink), 'robots', w.sim.robots().map((r) => `${r.state}/${Math.round((r.charge ?? 1) * 100)}%`));
  if (charged < 2) throw new Error('robots never went home to charge');
  if (minCharge <= 0) throw new Error('a robot ran completely flat');
  if (w.count(sink) < 200) throw new Error('charging stalls the deliveries');
}

// collect from: a loading dock set to 8 waits for a full load before robots come
{
  const w = world();
  const src = w.place('storage', 10, 8, 2);
  src.store = { circuit: 5 };
  const pick = w.place('dock', 10, 9, 2);
  pick.threshold = 8;
  for (let x = 10; x <= 20; x++) w.place('road', x, 10);
  w.place('depot', 14, 11);
  const drop = w.place('dock', 20, 9, 0);
  drop.mode = 'unload';
  const sink = w.place('storage', 20, 8, 0);
  w.tick(15);
  console.log('collect from 8: with 5 waiting, delivered', w.count(sink), 'robots', w.sim.robots().map((r) => `${r.state}/${r.items.length}`));
  if (w.count(sink) !== 0) throw new Error('robots collected below the dock threshold');
  src.store = { circuit: 3 };
  w.tick(20);
  console.log('collect from 8: with 8 waiting, delivered', w.count(sink));
  if (w.count(sink) !== 8) throw new Error('robots did not collect the full load');
}

// free play (not the playground): robots have to be produced and delivered
{
  const st: GameState = newGame(13, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
  const sim = new Sim(st);
  if (sim.creative) throw new Error('free play must not be creative');
  st.inventory = { iron_plate: 200, steel_frame: 20, circuit: 20, copper_wire: 40, copper_plate: 40, glass: 20, machine_part: 20, motor: 4 };
  st.kits = { road: 11, depot: 1, assembler: 1, storage: 1, conveyor: 2, solar: 3 }; // kits in stock: everything builds at once
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  for (let x = 10; x <= 20; x++) place('road', x, 10);
  const depot = place('depot', 14, 11);
  tick(3);
  console.log('free play depot without robots:', sim.robots().length, 'status', depot.status);
  if (sim.robots().length !== 0 || depot.status !== 'starved') throw new Error('a depot spawned robots for free');
  // an assembler builds a robot from 2 motors, 1 cell, 1 circuit; a belt brings it to the depot
  const asm = place('assembler', 14, 14, 0);
  asm.recipe = 'robot';
  const feed = place('storage', 14, 17, 0);
  feed.store = { motor: 4, cell: 2, circuit: 2 };
  place('conveyor', 14, 16, 0);
  place('conveyor', 14, 13, 0); // assembler output (north) -> belt -> depot
  st.powerSupply = 0;
  place('solar', 20, 20); place('solar', 21, 20); place('solar', 22, 20);
  tick(40);
  console.log('assembler made robots, depot holds', depot.value, 'fleet', sim.robots().length);
  if ((depot.value ?? 0) < 1 || sim.robots().length < 1) throw new Error('delivered robots did not join the depot');
  // add one from stock, then remove the depot: the robots go back to the stock
  st.inventory.robot = 1;
  const before = depot.value ?? 0;
  if (!sim.depotAddFromStock(depot) || depot.value !== before + 1) throw new Error('adding from stock failed');
  sim.remove(depot);
  console.log('after removing the depot: stock robots', st.inventory.robot, 'fleet', sim.robots().length);
  if ((st.inventory.robot ?? 0) !== before + 1 || sim.robots().length) throw new Error('robots not refunded');
  // the new components are recipes of the assembler
  for (const r of ['motor', 'cell', 'robot']) if (!st.unlockedRecipes.includes(r)) throw new Error(`recipe ${r} not unlocked in an all-unlocked game`);
}
console.log('logistics check ok');
