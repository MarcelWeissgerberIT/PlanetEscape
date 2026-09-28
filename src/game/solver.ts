// Automatic planner: routes belts and builds whole production chains.
// DOM-free so it can run in the game, in tests and in the MCP server.
import { BUILDINGS, MINE_SECONDS, PLANT_FUEL, RECIPES, TERRAIN_ITEM } from './data';
import type { Sim } from './sim';
import type { Building, BuildingId, Dir, ItemId, TerrainId } from './types';
import { DX, DY } from './types';

export interface SolverLog {
  ok: boolean;
  steps: string[];
  placed: Building[];
  error?: string;
  fatal?: boolean; // out of resources: retrying elsewhere cannot help
  fatalType?: BuildingId; // the building that could not be afforded
}

interface Target {
  building: Building;
}

/** Buildable free tile: inside the map, ground (no deposit, no rock), unoccupied. */
export function isFree(sim: Sim, x: number, y: number): boolean {
  return sim.inBounds(x, y) && sim.terrain(x, y) === 'ground' && !sim.at(x, y);
}

/**
 * Find the cheapest belt path from `start` (a free tile that the belt line starts on) to any tile from
 * which `target` accepts items. Turns cost extra so routes stay straight. Returns tiles with directions.
 */
export function routeBelt(sim: Sim, start: { x: number; y: number }, target: Target, maxNodes = 40000): { x: number; y: number; dir: Dir }[] | null {
  const W = sim.state.width;
  if (!isFree(sim, start.x, start.y)) return null;
  const tb = target.building;
  const key = (x: number, y: number, d: number) => (y * W + x) * 4 + d;
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  // simple binary heap
  const heap: { k: number; c: number }[] = [];
  const push = (k: number, c: number) => {
    heap.push({ k, c });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].c <= heap[i].c) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].c < heap[m].c) m = l;
        if (r < heap.length && heap[r].c < heap[m].c) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (let d = 0; d < 4; d++) {
    const k = key(start.x, start.y, d);
    dist.set(k, 0);
    push(k, 0);
  }
  // belts that hug other machines or deposits block their access later, so they cost extra
  const hugCache = new Map<number, number>();
  const hug = (x: number, y: number) => {
    const ck = y * W + x;
    let v = hugCache.get(ck);
    if (v === undefined) {
      v = 0;
      for (let d = 0; d < 4; d++) {
        const ax = x + DX[d], ay = y + DY[d];
        if (!sim.inBounds(ax, ay)) continue;
        const nb = sim.at(ax, ay);
        if (nb && nb !== tb && nb.type !== 'conveyor') v += 3;
        else if (!nb && sim.isDeposit(ax, ay)) v += 1;
      }
      hugCache.set(ck, v);
    }
    return v;
  };
  let nodes = 0;
  let endKey = -1;
  while (heap.length && nodes++ < maxNodes) {
    const { k, c } = pop();
    if ((dist.get(k) ?? Infinity) < c) continue;
    const d = k % 4;
    const cell = (k - d) / 4;
    const x = cell % W, y = (cell - x) / W;
    // does a belt here pointing `d` deliver into the target?
    const nx = x + DX[d], ny = y + DY[d];
    const nb = sim.at(nx, ny);
    if (nb === tb && sim.canReceiveFrom(tb, d as Dir)) {
      endKey = k;
      break;
    }
    // continue straight or turn (turning means the belt on this tile points the new way)
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3)) continue;
      const tx = x + DX[nd], ty = y + DY[nd];
      if (!isFree(sim, tx, ty)) continue;
      const nk = key(tx, ty, nd);
      const nc = c + 1 + (nd === d ? 0 : 2) + hug(tx, ty);
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, k);
        push(nk, nc);
      }
    }
  }
  if (endKey < 0) return null;
  // reconstruct the chain of states; a state's d is the direction it was entered with, so the belt on
  // tile i points in the direction of state i+1, and the last belt points into the target
  const states: number[] = [];
  let k: number | undefined = endKey;
  const seen = new Set<number>();
  while (k !== undefined && !seen.has(k)) {
    seen.add(k);
    states.push(k);
    k = prev.get(k);
  }
  states.reverse();
  const out: { x: number; y: number; dir: Dir }[] = [];
  for (let i = 0; i < states.length; i++) {
    const sk = states[i];
    const d = sk % 4;
    const cell = (sk - d) / 4;
    const x = cell % W, y = (cell - x) / W;
    const dir = (i < states.length - 1 ? states[i + 1] % 4 : d) as Dir;
    out.push({ x, y, dir });
  }
  return out;
}

/** Place belts along a path. Existing belts on the path are re-pointed. */
export function layPath(sim: Sim, path: { x: number; y: number; dir: Dir }[], log: SolverLog): boolean {
  for (const p of path) {
    const b = sim.at(p.x, p.y);
    if (b?.type === 'conveyor') {
      sim.rotate(b, p.dir);
      continue;
    }
    const nb = sim.place('conveyor', p.x, p.y, p.dir);
    if (!nb) {
      const err = sim.placementError('conveyor', p.x, p.y);
      log.error = `belt at ${p.x},${p.y}: ${err}`;
      if (err === 'err_cost') {
        log.fatal = true;
        log.fatalType = 'conveyor';
      }
      return false;
    }
    log.placed.push(nb);
  }
  return true;
}

/** Spiral search for a spot where `type` fits and its front tiles are free (so output can be routed). */
export function findSpot(sim: Sim, type: BuildingId, near: { x: number; y: number }, dir: Dir, maxR = 14): { x: number; y: number } | null {
  const s = BUILDINGS[type].size;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = near.x + dx, y = near.y + dy;
        if (sim.placementError(type, x, y) && sim.placementError(type, x, y) !== 'err_cost') continue;
        // front tiles free
        const fake: Building = { id: -1, type, x, y, dir };
        const fronts = sim.frontTiles(fake);
        if (!fronts.every((t) => isFree(sim, t.x, t.y))) continue;
        // at least one side tile free for inputs
        let sideFree = 0;
        for (let i = 0; i < s; i++) {
          for (const [ox, oy] of [
            [-1, i],
            [s, i],
            [i, -1],
            [i, s],
          ]) {
            if (isFree(sim, x + ox, y + oy)) sideFree++;
          }
        }
        if (sideFree < 2) continue;
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Candidate spots for a machine that should feed `consumer`: sorted by distance, facing the consumer with
 * at least one free tile in front (for the output belt) and free tiles behind or beside it (for inputs).
 */
export function spotsFacing(sim: Sim, type: BuildingId, consumer: Building, maxR = 16, source?: { x: number; y: number } | null): { x: number; y: number; dir: Dir }[] {
  const s = BUILDINGS[type].size;
  const cs = BUILDINGS[consumer.type].size;
  const cc = { x: consumer.x + (cs - 1) / 2, y: consumer.y + (cs - 1) / 2 };
  const out: { x: number; y: number; dir: Dir; d: number }[] = [];
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const x = Math.round(cc.x + dx - (s - 1) / 2), y = Math.round(cc.y + dy - (s - 1) / 2);
      const err = sim.placementError(type, x, y);
      if (err && err !== 'err_cost') continue;
      const mc = { x: x + (s - 1) / 2, y: y + (s - 1) / 2 };
      const dir = dirTowards(mc, cc);
      const fake: Building = { id: -1, type, x, y, dir };
      const fronts = sim.frontTiles(fake);
      if (!fronts.every((t) => isFree(sim, t.x, t.y))) continue;
      // one more free tile ahead so the output belt does not have to wrap around the machine
      const ahead = fronts.map((t) => ({ x: t.x + DX[dir], y: t.y + DY[dir] }));
      const aheadOk = ahead.some((t) => isFree(sim, t.x, t.y) || sim.at(t.x, t.y) === consumer);
      if (!aheadOk) continue;
      // free input access: back tiles or lateral tiles
      let access = 0;
      const back = ((dir + 2) & 3) as Dir;
      for (let i = 0; i < s; i++) {
        const bx = dir === 1 ? x - 1 : dir === 3 ? x + s : x + i;
        const by = dir === 2 ? y - 1 : dir === 0 ? y + s : y + i;
        if (isFree(sim, bx, by)) access++;
      }
      void back;
      for (let i = 0; i < s; i++) {
        const l1 = dir === 0 || dir === 2 ? { x: x - 1, y: y + i } : { x: x + i, y: y - 1 };
        const l2 = dir === 0 || dir === 2 ? { x: x + s, y: y + i } : { x: x + i, y: y + s };
        if (isFree(sim, l1.x, l1.y)) access++;
        if (isFree(sim, l2.x, l2.y)) access++;
      }
      if (access < 2) continue;
      let d = Math.abs(dx) + Math.abs(dy);
      if (d < 2) continue;
      // sit between the consumer and the raw source so chains stay in their own sector around the consumer
      if (source) d += 0.7 * (Math.abs(mc.x - source.x) + Math.abs(mc.y - source.y));
      out.push({ x, y, dir, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Where the raw material for `item` comes from: the nearest free deposit tile of its (first) raw ingredient. */
export function rawSource(sim: Sim, item: ItemId, near: { x: number; y: number }, depth = 0): { x: number; y: number } | null {
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((t) => TERRAIN_ITEM[t] === item);
  if (terrain) {
    const e = depositEdges(sim, terrain, near)[0];
    return e ? { x: e.x, y: e.y } : null;
  }
  if (depth > 4) return null;
  const recipe = RECIPES.find((r) => r.output === item && sim.state.unlockedRecipes.includes(r.id));
  if (!recipe) return null;
  // average over the ingredients' sources
  let sx = 0, sy = 0, n = 0;
  for (const k in recipe.inputs) {
    const src = rawSource(sim, k as ItemId, near, depth + 1);
    if (src) {
      sx += src.x;
      sy += src.y;
      n++;
    }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

/** Direction from `from` roughly towards `to`. */
function dirTowards(from: { x: number; y: number }, to: { x: number; y: number }): Dir {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

/** Deposit tiles of a type with a free neighbour, sorted by distance to `near`. */
function depositEdges(sim: Sim, terrain: TerrainId, near: { x: number; y: number }): { x: number; y: number; dir: Dir; d: number }[] {
  const st = sim.state;
  const out: { x: number; y: number; dir: Dir; d: number }[] = [];
  for (let y = 0; y < st.height; y++) {
    for (let x = 0; x < st.width; x++) {
      if (st.terrain[y * st.width + x] !== terrain || sim.at(x, y) || (st.ore[y * st.width + x] ?? 0) <= 0) continue;
      const d = Math.abs(x - near.x) + Math.abs(y - near.y);
      // prefer the exit direction that points toward the consumer
      const dirs: Dir[] = [dirTowards({ x, y }, near), 0, 1, 2, 3];
      for (const dir of dirs) {
        if (isFree(sim, x + DX[dir], y + DY[dir])) {
          out.push({ x, y, dir, d });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

export function machineRate(sim: Sim, recipeId: string): number {
  const r = RECIPES.find((rc) => rc.id === recipeId)!;
  return ((r.outputCount * 60) / r.seconds) * sim.factor('machine');
}

export function minerRate(sim: Sim): number {
  return (60 / MINE_SECONDS) * sim.factor('miner');
}

export function beltCapacity(sim: Sim): number {
  return sim.beltCapacity();
}

/**
 * Build a chain that delivers `item` into `consumer` at roughly `perMin` items per minute.
 * Places miners on the nearest deposit (chained on the deposit for more throughput), one machine per
 * recipe step near the consumer, and routes belts between them.
 */
export function buildChain(sim: Sim, item: ItemId, consumer: Building, perMin: number, log: SolverLog, depth = 0): boolean {
  const st = sim.state;
  const consumerCenter = { x: consumer.x + Math.floor(BUILDINGS[consumer.type].size / 2), y: consumer.y + Math.floor(BUILDINGS[consumer.type].size / 2) };
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((t) => TERRAIN_ITEM[t] === item);
  if (terrain) {
    // raw resource: miners on the nearest deposit edge
    const edges = depositEdges(sim, terrain, consumerCenter);
    if (!edges.length) {
      log.error = `no reachable ${item} deposit`;
      return false;
    }
    const want = Math.max(1, Math.min(4, Math.ceil(perMin / minerRate(sim))));
    for (const e of edges.slice(0, 24)) {
      if (!st.unlockedBuildings.includes('miner')) {
        log.error = 'miner locked';
        return false;
      }
      const path = routeBelt(sim, { x: e.x + DX[e.dir], y: e.y + DY[e.dir] }, { building: consumer });
      if (!path) continue;
      const miner = sim.place('miner', e.x, e.y, e.dir);
      if (!miner) {
        if (sim.placementError('miner', e.x, e.y) === 'err_cost') {
          log.error = 'cannot afford a miner';
          log.fatal = true;
          log.fatalType = 'miner';
          return false;
        }
        continue;
      }
      log.placed.push(miner);
      log.steps.push(`miner on ${item} at ${e.x},${e.y} facing ${e.dir}`);
      // chain more miners behind the first one (they pass items through)
      let bx = e.x - DX[e.dir], by = e.y - DY[e.dir];
      for (let n = 1; n < want; n++) {
        if (!sim.isDeposit(bx, by) || st.terrain[by * st.width + bx] !== terrain || sim.at(bx, by)) break;
        const m = sim.place('miner', bx, by, e.dir);
        if (!m) break;
        log.placed.push(m);
        bx -= DX[e.dir];
        by -= DY[e.dir];
      }
      if (!layPath(sim, path, log)) return false;
      log.steps.push(`belt ${path.length} tiles from miner to ${consumer.type}`);
      return true;
    }
    log.error = `no belt route from ${item} deposit to ${consumer.type}`;
    return false;
  }
  const recipe = RECIPES.find((r) => r.output === item && st.unlockedRecipes.includes(r.id));
  if (!recipe) {
    log.error = `no unlocked recipe for ${item}`;
    return false;
  }
  if (!st.unlockedBuildings.includes(recipe.machine)) {
    log.error = `${recipe.machine} locked`;
    return false;
  }
  // machine near the consumer, facing it; retry other spots when the inputs cannot be routed
  const spots = spotsFacing(sim, recipe.machine, consumer, 16, rawSource(sim, item, consumerCenter));
  if (!spots.length) {
    log.error = `no space for ${recipe.machine} near ${consumer.type}`;
    return false;
  }
  for (let attempt = 0; attempt < Math.min(6, spots.length); attempt++) {
    const spot = spots[attempt];
    const before = log.placed.length;
    const stepsBefore = log.steps.length;
    const machine = sim.place(recipe.machine, spot.x, spot.y, spot.dir);
    if (!machine) {
      const err = sim.placementError(recipe.machine, spot.x, spot.y);
      log.error = `cannot place ${recipe.machine}: ${err}`;
      if (err === 'err_cost') {
        log.fatal = true;
        log.fatalType = recipe.machine;
      }
      return false;
    }
    log.placed.push(machine);
    sim.setRecipe(machine, recipe.id);
    const front = sim.frontTiles(machine)[0];
    const outPath = routeBelt(sim, front, { building: consumer });
    let good = !!outPath && layPath(sim, outPath, log);
    if (good && depth <= 6) {
      for (const k in recipe.inputs) {
        const need = (perMin * recipe.inputs[k as ItemId]!) / recipe.outputCount;
        if (!buildChain(sim, k as ItemId, machine, need, log, depth + 1)) {
          good = false;
          break;
        }
      }
    }
    if (good) {
      log.steps.push(`${recipe.machine} (${recipe.id}) at ${spot.x},${spot.y} facing ${spot.dir}`);
      return true;
    }
    // undo everything this attempt placed and try the next spot
    const failed = log.error;
    for (const b of log.placed.splice(before)) if (sim.state.buildings.includes(b)) sim.remove(b);
    log.steps.length = stepsBefore;
    log.error = failed;
    if (log.fatal) return false;
  }
  log.error = log.error ?? `could not connect ${recipe.machine} for ${item}`;
  return false;
}

/** Is `item` already flowing into `target` from some producer? */
export function hasSupply(sim: Sim, item: ItemId, target: Building): boolean {
  for (const b of sim.state.buildings) {
    const out = b.type === 'miner' ? b.mineItem : b.recipe && RECIPES.find((r) => r.id === b.recipe)?.output;
    if (out !== item) continue;
    if (sim.traceFlow(b).target === target) return true;
  }
  return false;
}

/** Build everything the current order still needs, delivering into the core. */
/** Static power balance of the current layout (the sim only computes it while ticking). */
export function powerBalance(sim: Sim): { supply: number; demand: number } {
  let supply = 0, demand = 0;
  for (const b of sim.state.buildings) {
    const p = BUILDINGS[b.type].power;
    if (p < 0) {
      if (PLANT_FUEL[b.type]) continue; // needs fuel, do not count on it
      supply += -p * (b.type === 'solar' ? sim.factor('power') : b.type === 'wind' ? sim.factor('power') * 0.5 : 1);
    } else if (p > 0 && !(b.type === 'miner' && b.status === 'depleted')) demand += p;
  }
  return { supply, demand };
}

/** Place solar panels near the core until the supply covers the demand. */
export function ensurePower(sim: Sim, log: SolverLog): boolean {
  if (!sim.state.unlockedBuildings.includes('solar')) return true;
  const core = sim.state.buildings[0];
  let placed = 0;
  for (let guard = 0; guard < 40; guard++) {
    const { supply, demand } = powerBalance(sim);
    if (supply >= demand) break;
    if (!sim.canAfford('solar')) {
      log.steps.push(`power short by ${demand - supply} but no plates for more solar panels`);
      return false;
    }
    const spot = findSpot(sim, 'solar', { x: core.x - 5, y: core.y - 5 }, 0, 24);
    if (!spot) {
      log.steps.push('no space for solar panels');
      return false;
    }
    const b = sim.place('solar', spot.x, spot.y, 0);
    if (!b) return false;
    log.placed.push(b);
    placed++;
  }
  if (placed) log.steps.push(`${placed} solar panel(s) near the core`);
  return true;
}

export function solveOrder(sim: Sim, perMin = 10): SolverLog {
  const log: SolverLog = { ok: true, steps: [], placed: [] };
  const m = sim.currentMission();
  const core = sim.state.buildings[0];
  if (!m) {
    log.steps.push('no open order');
    return log;
  }
  if (m.build) {
    for (const k in m.build) {
      const type = k as BuildingId;
      if (sim.countBuildings(type) >= m.build[type]!) continue;
      // machines the order wants built are fed through the deliverable below; place a bare one if none gets built
      log.steps.push(`order needs ${type}`);
    }
  }
  for (const k in m.deliver) {
    const item = k as ItemId;
    if (hasSupply(sim, item, core)) {
      log.steps.push(`${item}: already supplied`);
      continue;
    }
    if (!buildChain(sim, item, core, perMin, log)) {
      log.ok = false;
      if (log.fatal) {
        // out of plates: make sure plates flow into the core so the caller can tick, then solve again
        const err = log.error;
        const cost = BUILDINGS[log.fatalType ?? 'conveyor'].cost;
        const missing = (Object.keys(cost) as ItemId[]).filter((k) => (sim.state.inventory[k] ?? 0) < cost[k]!);
        if (!missing.includes('iron_plate')) missing.push('iron_plate'); // belts always need plates
        for (const mat of missing) {
          if (hasSupply(sim, mat, core)) continue;
          const l2: SolverLog = { ok: true, steps: [], placed: [] };
          if (buildChain(sim, mat, core, perMin, l2)) {
            log.steps.push(...l2.steps, `${mat} now flows into the core (building material)`);
            log.placed.push(...l2.placed);
          }
        }
        log.error = `${err} — out of ${missing.join('/')}. Let the game run (pe_tick) to collect material, then solve again.`;
      }
      ensurePower(sim, log);
      return log;
    }
  }
  ensurePower(sim, log);
  return log;
}
