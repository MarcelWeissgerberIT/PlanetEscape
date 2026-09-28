// Headless check for the belt router: it dives under a wall with a tunnel pair and joins belts that already run into the core.
import { Sim } from '../src/game/sim';
import { layPath, routeBelt } from '../src/game/solver';
import type { SolverLog } from '../src/game/solver';
import { newGame } from '../src/game/world';

const st = newGame(8, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
const sim = new Sim(st);
sim.creative = true;
const core = sim.core()!;
// a closed box of storages around the core, two tiles out: only a tunnel gets through
for (let x = core.x - 3; x <= core.x + 5; x++) for (const y of [core.y - 3, core.y + 5]) sim.place('storage', x, y, 0);
for (let y = core.y - 2; y <= core.y + 4; y++) for (const x of [core.x - 3, core.x + 5]) sim.place('storage', x, y, 0);
const start = { x: core.x + 12, y: core.y + 1 };
const path = routeBelt(sim, start, { building: core });
console.log('route', path?.length, 'tunnel tiles', path?.filter((p) => p.tunnel).map((p) => `${p.tunnel}@${p.x},${p.y}`).join(' '));
if (!path || !path.some((p) => p.tunnel === 'in') || !path.some((p) => p.tunnel === 'out')) throw new Error('no tunnel through the wall');
const log: SolverLog = { ok: true, steps: [], placed: [] };
if (!layPath(sim, path, log)) throw new Error(`layPath: ${log.error}`);
const first = sim.at(start.x, start.y)!;
const before = st.delivered.iron_plate ?? 0;
for (let i = 0; i < 30 * 20; i++) {
  if (i % 30 === 0) sim.accept(first, 'iron_plate', first.dir);
  sim.tick(1 / 30);
}
console.log('delivered through the tunnel', (st.delivered.iron_plate ?? 0) - before);
if ((st.delivered.iron_plate ?? 0) - before < 15) throw new Error('items did not arrive');
// a second line may join the first one from the side
const start2 = { x: core.x + 12, y: core.y + 6 };
const path2 = routeBelt(sim, start2, { building: core });
console.log('second route', path2?.length);
if (!path2 || path2.length > 16) throw new Error('second line did not join the first');
console.log('route check ok');
