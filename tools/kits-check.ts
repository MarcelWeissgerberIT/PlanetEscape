// Headless check for the kit system: the core prints building kits, sites wait for them, removing gives kits back.
import { BUILDINGS, printSeconds } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

function world(): { st: GameState; sim: Sim; tick: (s: number) => void } {
  const st = newGame(21, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
  const sim = new Sim(st);
  st.kits = {};
  st.inventory = { iron_plate: 300, copper_plate: 100, machine_part: 20 };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  return { st, sim, tick };
}
const place = (sim: Sim, type: Building['type'], x: number, y: number, dir: Dir = 0) => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type}: ${sim.placementError(type, x, y)}`);
  return b;
};

// a free-play game starts with kits instead of free intermediate products
{
  const st = newGame(3, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false });
  console.log('free play start: inventory', st.inventory, 'kits', st.kits);
  if (st.inventory.machine_part || st.inventory.circuit || !st.kits?.miner) throw new Error('free play start stock not converted to kits');
}

// without a kit: material is paid, a site waits, the printer finishes it after printSeconds
{
  const { st, sim, tick } = world();
  const before = st.inventory.iron_plate!;
  const s = place(sim, 'storage', 10, 10);
  console.log('storage site', s.site, 'queue', sim.printQueue().map((j) => `${j.type}:${j.left}`), 'iron', before, '->', st.inventory.iron_plate);
  if (!s.site || st.inventory.iron_plate !== before - BUILDINGS.storage.cost.iron_plate!) throw new Error('site did not pay its material');
  if (sim.accept(s, 'iron_plate', 0)) throw new Error('a site accepted an item');
  tick(printSeconds('storage') - 0.3);
  if (!s.site) throw new Error('site finished too early');
  tick(0.6);
  console.log('after', printSeconds('storage'), 's: site', !!s.site, 'queue', sim.printQueue().length);
  if (s.site || sim.printQueue().length) throw new Error('site not finished by the printer');
  // removing a finished building puts its kit into stock, placing again uses it at once
  sim.remove(s);
  if (st.kits!.storage !== 1) throw new Error('removal did not return the kit');
  const again = place(sim, 'storage', 12, 10);
  if (again.site || st.kits!.storage !== 0) throw new Error('kit from stock not used');
}

// sites print in order; removing a waiting site refunds its material and keeps the rest in order
{
  const { st, sim, tick } = world();
  const a = place(sim, 'smelter', 5, 5);
  const b = place(sim, 'smelter', 7, 5);
  const c = place(sim, 'smelter', 9, 5);
  const posB = sim.siteInfo(b).pos, posC = sim.siteInfo(c).pos;
  console.log('queue positions', sim.siteInfo(a).pos, posB, posC);
  if (sim.siteInfo(a).pos !== 0 || posB !== 1 || posC !== 2) throw new Error('site queue order wrong');
  const iron = st.inventory.iron_plate!;
  sim.remove(b);
  if (st.inventory.iron_plate !== iron + BUILDINGS.smelter.cost.iron_plate! || sim.printQueue().length !== 2) throw new Error('removing a site did not refund / dequeue');
  tick(printSeconds('smelter') * 2 + 0.5);
  if (a.site || c.site) throw new Error('remaining sites not finished');
}

// kits for the stock; a kit printed for the stock serves a waiting site at once
{
  const { st, sim, tick } = world();
  if (sim.queuePrint('miner', 2) !== 2) throw new Error('stock jobs not queued');
  tick(printSeconds('miner') * 2 + 0.3);
  console.log('stock kits', st.kits);
  if (st.kits!.miner !== 2) throw new Error('stock kits not printed');
  // cancel a stock job refunds
  sim.queuePrint('solar', 1);
  const cu = st.inventory.copper_plate!;
  if (!sim.cancelPrint(0) || st.inventory.copper_plate !== cu + BUILDINGS.solar.cost.copper_plate!) throw new Error('cancel did not refund');
  // auto print off: no kit, no building
  st.autoPrint = false;
  if (sim.placementError('solar', 20, 20) !== 'err_no_kit') throw new Error('auto print off must need a kit');
  st.autoPrint = true;
  // stock job first, then a site of the same type: when the stock kit is done it completes the site and drops the site job
  sim.queuePrint('printer', 1);
  const site = place(sim, 'printer', 30, 30);
  const jobs = sim.printQueue().length;
  tick(printSeconds('printer') + 0.3);
  console.log('printer site done by the stock kit', !site.site, 'jobs', jobs, '->', sim.printQueue().length, 'kits', st.kits!.printer ?? 0);
  if (site.site || sim.printQueue().length !== 0 || (st.kits!.printer ?? 0) !== 0) throw new Error('stock kit did not serve the waiting site');
}

// the playground stays instant and free
{
  const st = newGame(4, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 40, h: 40, blank: true });
  const sim = new Sim(st);
  const b = sim.place('hall16', 2, 2, 0)!;
  if (!b || b.site || sim.printQueue().length) throw new Error('playground must not print');
}
console.log('kits check ok');
