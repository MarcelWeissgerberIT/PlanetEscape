// Reference solutions for the challenges the solver cannot build (robots only, radio only): proves each one
// can be won inside its kit quota and prints the time next to the medal times.
import { CHALLENGE_BY_ID, RADIO_RANGE } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { depositEdges, isFree, layPath, routeBelt } from '../src/game/solver';
import type { SolverLog } from '../src/game/solver';
import type { Building, BuildingId, Dir, TerrainId } from '../src/game/types';
import { DX, DY } from '../src/game/types';
import { challengeState } from '../src/game/world';

function setup(id: string) {
  const st = challengeState(id);
  const sim = new Sim(st);
  const core = sim.core()!;
  const place = (type: BuildingId, x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`${id}: cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  /** A drill on a deposit edge with `n` free ground tiles in a row in front of it. */
  const line = (terrain: TerrainId, n: number) => {
    for (const e of depositEdges(sim, terrain, { x: core.x + 1, y: core.y + 1 })) {
      let ok = true;
      for (let i = 1; i <= n; i++) if (!isFree(sim, e.x + DX[e.dir] * i, e.y + DY[e.dir] * i)) ok = false;
      if (ok) return e;
    }
    throw new Error(`${id}: no free ${terrain} edge`);
  };
  /** Solar panels on free ground next to the core's ring. */
  const solars = (n: number) => {
    let placed = 0;
    for (let r = 4; r < 12 && placed < n; r++)
      for (let dx = -r; dx <= r && placed < n; dx++) {
        const x = core.x + 1 + dx, y = core.y - r;
        if (isFree(sim, x, y)) { place('solar', x, y); placed++; }
      }
  };
  const run = (limit: number) => {
    let t = 0;
    while (t < limit && st.challengeDone === undefined) {
      sim.tick(1 / 30);
      t += 1 / 30;
    }
    return st.challengeDone;
  };
  return { st, sim, core, place, line, solars, run };
}

/** Shortest path of free ground tiles from any of `from` to any of `to` (4-neighbour BFS). */
function bfs(sim: Sim, from: { x: number; y: number }[], to: { x: number; y: number }[], extraFree: (x: number, y: number) => boolean = () => false) {
  const W = sim.state.width;
  const goal = new Set(to.map((p) => p.y * W + p.x));
  const prev = new Map<number, number>();
  const q: number[] = [];
  for (const p of from) if (isFree(sim, p.x, p.y) || extraFree(p.x, p.y)) { q.push(p.y * W + p.x); prev.set(p.y * W + p.x, -1); }
  while (q.length) {
    const c = q.shift()!;
    if (goal.has(c)) {
      const out: { x: number; y: number }[] = [];
      for (let k = c; k !== -1; k = prev.get(k)!) out.push({ x: k % W, y: Math.floor(k / W) });
      return out.reverse();
    }
    const x = c % W, y = Math.floor(c / W);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], nk = ny * W + nx;
      if (prev.has(nk) || !(isFree(sim, nx, ny) || extraFree(nx, ny))) continue;
      prev.set(nk, c);
      q.push(nk);
    }
  }
  return null;
}
const around = (x: number, y: number) => [0, 1, 2, 3].map((d) => ({ x: x + DX[d], y: y + DY[d] }));

// ---------- No belts: drill -> smelter -> loading dock, roads to an unloading dock at the core, a depot with 3 robots ----------
{
  const c = setup('c_robots');
  const { sim, core, place } = c;
  const unload = place('dock', core.x + 1, core.y - 1, 2); // north side of the core, pushing south into it
  unload.mode = 'unload';
  let roads: { x: number; y: number }[] = [{ x: core.x + 1, y: core.y - 2 }];
  place('road', core.x + 1, core.y - 2);
  // the third smelter and one more panel come out of the printer
  if (sim.queuePrint('smelter', 1) !== 1 || sim.queuePrint('solar', 1) !== 1) throw new Error('c_robots: cannot print');
  c.run(6);
  for (const ore of ['iron_ore', 'iron_ore', 'copper_ore'] as TerrainId[]) {
    const e = c.line(ore, 3);
    place('miner', e.x, e.y, e.dir);
    place('smelter', e.x + DX[e.dir], e.y + DY[e.dir], e.dir);
    const dx = e.x + DX[e.dir] * 2, dy = e.y + DY[e.dir] * 2;
    const load = place('dock', dx, dy, e.dir);
    load.threshold = Number(process.env.PE_DOCKMIN) || 6; // robots collect full loads
    const path = bfs(sim, around(dx, dy), roads.flatMap((r) => around(r.x, r.y)));
    if (!path) throw new Error('c_robots: no road path');
    for (const p of path) if (!sim.at(p.x, p.y)) place('road', p.x, p.y);
    roads = roads.concat(path);
  }
  // depot next to the road near the core
  let depot: Building | null = null;
  for (const r of roads) {
    for (const [ox, oy] of [[1, 0], [-2, 0], [0, 1], [0, -2]]) {
      const x = r.x + ox, y = r.y + oy;
      if (!depot && [0, 1].every((i) => [0, 1].every((j) => isFree(sim, x + i, y + j)))) depot = place('depot', x, y);
    }
    if (depot) break;
  }
  if (!depot) throw new Error('c_robots: no depot spot');
  c.solars(4);
  c.run(30); // the depot kit may still be on its way
  while (sim.depotAddFromStock(depot));
  depot.threshold = 3; // all three robots out
  if (process.env.PE_DEBUG) for (let k = 0; k < 8; k++) {
    c.run(40);
    console.log('robots', Math.round(c.st.time), 'rates', sim.deliveryRate('iron_plate'), sim.deliveryRate('copper_plate'), 'robots', sim.robots().map((r) => `${r.state}/${r.items.length}/${Math.round((r.charge ?? 1) * 100)}`).join(' '), 'docks', c.st.buildings.filter((b) => b.type === 'dock').map((b) => `${b.mode ?? 'load'}:${b.bufL?.length}:${b.status}`).join(' '), 'smelters', c.st.buildings.filter((b) => b.type === 'smelter').map((b) => b.status).join(','));
  }
  const t = c.run(1500);
  const m = CHALLENGE_BY_ID.c_robots.medals;
  console.log('c_robots reference:', t === undefined ? 'NOT DONE' : `${Math.round(t)} s`, `(medals ${m.join('/')})`, 'rates', sim.deliveryRate('iron_plate'), sim.deliveryRate('copper_plate'), 'power', `${c.st.powerDemand}/${c.st.powerSupply}`, 'robots', sim.robots().length, 'delivered', JSON.stringify(c.st.delivered));
  if (t === undefined) throw new Error('c_robots reference solution failed');
}

// ---------- Radio factory: drill -> smelter -> transmitter, a receiver at the core, a mast when out of range ----------
{
  const c = setup('c_radio');
  const { sim, core, place } = c;
  const rx = place('radio', core.x + 1, core.y - 1, 2);
  rx.mode = 'rx';
  rx.threshold = 1;
  const txs: Building[] = [];
  if (sim.queuePrint('smelter', 1) !== 1 || sim.queuePrint('solar', 1) !== 1) throw new Error('c_radio: cannot print');
  c.run(6);
  for (const ore of ['iron_ore', 'iron_ore', 'copper_ore'] as TerrainId[]) {
    const e = c.line(ore, 3);
    place('miner', e.x, e.y, e.dir);
    place('smelter', e.x + DX[e.dir], e.y + DY[e.dir], e.dir);
    const tx = place('radio', e.x + DX[e.dir] * 2, e.y + DY[e.dir] * 2, e.dir);
    tx.threshold = 1;
    txs.push(tx);
  }
  // one mast halfway to whichever transmitter is farthest, when one is out of range
  const far = txs.map((tx) => ({ tx, d: Math.hypot(tx.x - rx.x, tx.y - rx.y) })).sort((a, b) => b.d - a.d)[0];
  if (far.d > RADIO_RANGE) {
    const mx = Math.round((far.tx.x + rx.x) / 2), my = Math.round((far.tx.y + rx.y) / 2);
    const spot = bfs(sim, [{ x: mx, y: my }], around(mx, my).concat([{ x: mx, y: my }]), () => false) ? { x: mx, y: my } : null;
    let placed = false;
    for (let r = 0; r < 6 && !placed; r++) for (let dx = -r; dx <= r && !placed; dx++) for (let dy = -r; dy <= r && !placed; dy++) if (isFree(sim, mx + dx, my + dy)) { place('mast', mx + dx, my + dy); placed = true; }
    void spot;
  }
  c.solars(5);
  const t = c.run(1500);
  const m = CHALLENGE_BY_ID.c_radio.medals;
  console.log('c_radio reference:', t === undefined ? 'NOT DONE' : `${Math.round(t)} s`, `(medals ${m.join('/')})`, 'distances', txs.map((tx) => Math.round(Math.hypot(tx.x - rx.x, tx.y - rx.y))).join('/'), 'rates', sim.deliveryRate('iron_plate'), sim.deliveryRate('copper_plate'), 'power', `${c.st.powerDemand}/${c.st.powerSupply}`, 'delivered', JSON.stringify(c.st.delivered));
  if (t === undefined) throw new Error('c_radio reference solution failed');
}
// ---------- Four drills: three chained iron drills -> splitter -> three smelters -> merger -> core, the fourth drill on copper ----------
{
  const c = setup('c_drills');
  const { sim, st, core, place } = c;
  const W = st.width;
  const free = (x: number, y: number) => isFree(sim, x, y);
  const iron = (x: number, y: number) => st.terrain[y * W + x] === 'iron_ore' && !sim.at(x, y);
  // auto print is off: print the splitter, the merger, the fourth smelter and two panels first
  for (const [type, n] of [['splitter', 1], ['merger', 1], ['smelter', 1], ['solar', 2]] as [BuildingId, number][]) if (sim.queuePrint(type, n) !== n) throw new Error(`c_drills: cannot print ${type}`);
  c.run(12);
  let built = false;
  for (const e of depositEdges(sim, 'iron_ore', { x: core.x + 1, y: core.y + 1 })) {
    const d = e.dir, l = ((d + 3) & 3) as Dir, r = ((d + 1) & 3) as Dir;
    const at = (k: number, side: Dir | null = null, s = 0) => ({ x: e.x + DX[d] * k + (side === null ? 0 : DX[side] * s), y: e.y + DY[d] * k + (side === null ? 0 : DY[side] * s) });
    const back1 = at(-1), back2 = at(-2);
    if (!iron(back1.x, back1.y) || !iron(back2.x, back2.y)) continue;
    const tiles = [at(1), at(2), at(2, l, 1), at(2, r, 1), at(3), at(3, l, 1), at(3, r, 1), at(4), at(4, l, 1), at(4, r, 1), at(5)];
    if (!tiles.every((t) => free(t.x, t.y))) continue;
    for (const m of [e, back1, back2]) place('miner', m.x, m.y, d);
    place('conveyor', at(1).x, at(1).y, d);
    place('splitter', at(2).x, at(2).y, d);
    // the splitter hands ore to its left and right neighbours and forward
    for (const t of [at(2, l, 1), at(2, r, 1), at(3)]) place('smelter', t.x, t.y, d);
    place('conveyor', at(3, l, 1).x, at(3, l, 1).y, d);
    place('conveyor', at(4, l, 1).x, at(4, l, 1).y, r); // left smelter's plates turn right into the merger
    place('conveyor', at(3, r, 1).x, at(3, r, 1).y, d);
    place('conveyor', at(4, r, 1).x, at(4, r, 1).y, l);
    place('merger', at(4).x, at(4).y, d);
    const path = routeBelt(sim, at(5), { building: core });
    const log: SolverLog = { ok: true, steps: [], placed: [] };
    if (!path || !layPath(sim, path, log)) throw new Error(`c_drills: iron line to the core: ${log.error ?? 'no route'}`);
    built = true;
    break;
  }
  if (!built) throw new Error('c_drills: no iron edge with room for the manifold');
  // copper: the fourth drill straight into a smelter, a belt to the core (the fourth smelter is printed)
  const e = c.line('copper_ore', 2);
  place('miner', e.x, e.y, e.dir);
  place('smelter', e.x + DX[e.dir], e.y + DY[e.dir], e.dir);
  const cpath = routeBelt(sim, { x: e.x + DX[e.dir] * 2, y: e.y + DY[e.dir] * 2 }, { building: core });
  const clog: SolverLog = { ok: true, steps: [], placed: [] };
  if (!cpath || !layPath(sim, cpath, clog)) throw new Error(`c_drills: copper line: ${clog.error ?? 'no route'}`);
  // power: 4 drills (8) + 4 smelters (12) against the core (10) and one panel (4): print two more panels
  c.solars(3);
  c.run(150);
  if (process.env.PE_DEBUG) console.log('c_drills after 150 s:', st.buildings.filter((b) => b.type !== 'conveyor' && b.type !== 'core').map((b) => `${b.type}@${b.x},${b.y}:${b.status}${b.site ? '(site)' : ''}${b.output ? JSON.stringify(b.output) : ''}`).join(' '), 'rates', sim.deliveryRate('iron_plate'), sim.deliveryRate('copper_plate'));
  const t = c.run(1350);
  const m = CHALLENGE_BY_ID.c_drills.medals;
  console.log('c_drills reference:', t === undefined ? 'NOT DONE' : `${Math.round(t)} s`, `(medals ${m.join('/')})`, 'rate iron', sim.deliveryRate('iron_plate'), 'copper', sim.deliveryRate('copper_plate'), 'power', `${st.powerDemand}/${st.powerSupply}`, 'kits', JSON.stringify(st.kits));
  if (t === undefined) throw new Error('c_drills reference solution failed');
}
console.log('challenge references ok');
