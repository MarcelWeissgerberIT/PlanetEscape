// Reference solutions for the challenges the solver cannot build (robots only, radio only): proves each one
// can be won inside its kit quota and prints the time next to the medal times.
import { CHALLENGE_BY_ID, RADIO_RANGE } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { depositEdges, isFree } from '../src/game/solver';
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
  for (const ore of ['iron_ore', 'copper_ore'] as TerrainId[]) {
    const e = c.line(ore, 3);
    place('miner', e.x, e.y, e.dir);
    place('smelter', e.x + DX[e.dir], e.y + DY[e.dir], e.dir);
    const dx = e.x + DX[e.dir] * 2, dy = e.y + DY[e.dir] * 2;
    place('dock', dx, dy, e.dir);
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
  c.solars(3);
  c.run(30); // the depot kit may still be on its way
  while (sim.depotAddFromStock(depot));
  const t = c.run(1500);
  const m = CHALLENGE_BY_ID.c_robots.medals;
  console.log('c_robots reference:', t === undefined ? 'NOT DONE' : `${Math.round(t)} s`, `(medals ${m.join('/')})`, 'robots', sim.robots().length, 'delivered', JSON.stringify(c.st.delivered));
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
  for (const ore of ['iron_ore', 'copper_ore'] as TerrainId[]) {
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
  c.solars(4);
  const t = c.run(1500);
  const m = CHALLENGE_BY_ID.c_radio.medals;
  console.log('c_radio reference:', t === undefined ? 'NOT DONE' : `${Math.round(t)} s`, `(medals ${m.join('/')})`, 'distances', txs.map((tx) => Math.round(Math.hypot(tx.x - rx.x, tx.y - rx.y))).join('/'), 'delivered', JSON.stringify(c.st.delivered));
  if (t === undefined) throw new Error('c_radio reference solution failed');
}
console.log('challenge references ok');
