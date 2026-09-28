// Automatic planner: routes belts and builds whole production chains.
// DOM-free so it can run in the game, in tests and in the MCP server.
import { ITEMS, TUNNEL_RANGE, BUILDINGS, MINE_SECONDS, PLANT_FUEL, RECIPES, TERRAIN_ITEM } from './data';
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

/** Does a building of `size` at (x, y) overlap the two-tile ring around the core that stays free for belts? */
export function inCoreRing(sim: Sim, x: number, y: number, size: number): boolean {
  const c = sim.state.buildings[0];
  if (!c || c.type !== 'core') return false;
  return x + size > c.x - 2 && x < c.x + 5 && y + size > c.y - 2 && y < c.y + 5;
}

/** Buildable free tile: inside the map, ground (no deposit, no rock), unoccupied. */
export function isFree(sim: Sim, x: number, y: number): boolean {
  return sim.inBounds(x, y) && sim.terrain(x, y) === 'ground' && !sim.at(x, y);
}

/**
 * Find the cheapest belt path from `start` (a free tile that the belt line starts on) to any tile from
 * which `target` accepts items. Turns cost extra so routes stay straight. Returns tiles with directions.
 */
export type PathTile = { x: number; y: number; dir: Dir; tunnel?: 'in' | 'out' };

export function routeBelt(sim: Sim, start: { x: number; y: number }, target: Target, maxNodes = 40000): PathTile[] | null {
  const W = sim.state.width;
  if (!isFree(sim, start.x, start.y)) return null;
  const tb = target.building;
  // a state is a tile, the direction the line entered it with, and whether that tile is a tunnel exit
  const key = (x: number, y: number, d: number, exit = 0) => ((y * W + x) * 4 + d) * 2 + exit;
  const tunnels = sim.state.unlockedBuildings.includes('tunnel') || sim.creative;
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
  const startKeys = new Set<number>();
  for (let d = 0; d < 4; d++) {
    const k = key(start.x, start.y, d);
    startKeys.add(k);
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
      // the ring around the core is kept for the lines that deliver into it
      if (inCoreRing(sim, x, y, 1)) v += tb.type === 'core' ? 1 : 12;
      hugCache.set(ck, v);
    }
    return v;
  };
  // into the core, a new line may also join a belt that already runs into it (from the side or from behind)
  const feeders = tb.type === 'core' ? coreFeeders(sim, tb) : null;
  const relax = (nk: number, nc: number, from: number) => {
    if (nc < (dist.get(nk) ?? Infinity)) {
      dist.set(nk, nc);
      prev.set(nk, from);
      push(nk, nc);
    }
  };
  let nodes = 0;
  let endKey = -1;
  while (heap.length && nodes++ < maxNodes) {
    const { k, c } = pop();
    if ((dist.get(k) ?? Infinity) < c) continue;
    const exit = k & 1;
    const d = (k >> 1) % 4;
    const cell = ((k >> 1) - d) / 4;
    const x = cell % W, y = (cell - x) / W;
    // does a belt here pointing `d` deliver into the target?
    const nx = x + DX[d], ny = y + DY[d];
    const nb = sim.at(nx, ny);
    if (nb === tb && sim.canReceiveFrom(tb, d as Dir)) {
      endKey = k;
      break;
    }
    if (feeders && nb && nb.type === 'conveyor' && feeders.has(nb.id) && d !== ((nb.dir + 2) & 3)) {
      endKey = k;
      break;
    }
    // continue straight or turn (turning means the belt on this tile points the new way); a tunnel exit only goes straight
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3) || (exit && nd !== d)) continue;
      const tx = x + DX[nd], ty = y + DY[nd];
      if (!isFree(sim, tx, ty)) continue;
      relax(key(tx, ty, nd), c + 1 + (nd === d ? 0 : 2) + hug(tx, ty), k);
    }
    // or dive under whatever is ahead: this tile becomes a tunnel entrance, the exit lands up to TUNNEL_RANGE tiles on
    if (tunnels && !exit && !startKeys.has(k) && !isFree(sim, nx, ny)) {
      for (let j = 2; j <= TUNNEL_RANGE + 1; j++) {
        const tx = x + DX[d] * j, ty = y + DY[d] * j;
        if (!sim.inBounds(tx, ty)) break;
        if (!isFree(sim, tx, ty)) continue;
        relax(key(tx, ty, d, 1), c + 8 + j + hug(tx, ty), k);
        break;
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
  const out: PathTile[] = [];
  for (let i = 0; i < states.length; i++) {
    const sk = states[i];
    const d = (sk >> 1) % 4;
    const cell = ((sk >> 1) - d) / 4;
    const x = cell % W, y = (cell - x) / W;
    const next = states[i + 1];
    const dir = (next !== undefined ? (next >> 1) % 4 : d) as Dir;
    const tile: PathTile = { x, y, dir };
    if (sk & 1) tile.tunnel = 'out';
    if (next !== undefined && next & 1) tile.tunnel = 'in';
    out.push(tile);
  }
  return out;
}

/** Place belts (and tunnel pairs) along a path. Existing belts on the path are re-pointed. */
export function layPath(sim: Sim, path: PathTile[], log: SolverLog): boolean {
  for (const p of path) {
    const b = sim.at(p.x, p.y);
    const type = p.tunnel ? 'tunnel' : 'conveyor';
    if (b?.type === 'conveyor' && type === 'conveyor') {
      sim.rotate(b, p.dir);
      continue;
    }
    const nb = sim.place(type, p.x, p.y, p.dir);
    if (!nb) {
      const err = sim.placementError(type, p.x, p.y);
      log.error = `${type === 'tunnel' ? 'tunnel' : 'belt'} at ${p.x},${p.y}: ${err}`;
      if (err === 'err_cost') {
        log.fatal = true;
        log.fatalType = type;
      }
      return false;
    }
    log.placed.push(nb);
  }
  return true;
}

/** Belts whose items end up in `core` (following belt directions). */
export function coreFeeders(sim: Sim, core: Building): Set<number> {
  const memo = new Map<number, boolean>();
  const reaches = (b: Building): boolean => {
    const chain: Building[] = [];
    let cur: Building | null = b;
    let ok = false;
    for (let guard = 0; cur && guard < 600; guard++) {
      const known = memo.get(cur.id);
      if (known !== undefined) {
        ok = known;
        break;
      }
      if (cur.type !== 'conveyor') {
        ok = cur === core;
        break;
      }
      memo.set(cur.id, false); // loop guard
      chain.push(cur);
      const next = sim.at(cur.x + DX[cur.dir], cur.y + DY[cur.dir]);
      if (!next || !sim.canReceiveFrom(next, cur.dir)) break;
      cur = next;
    }
    for (const c of chain) memo.set(c.id, ok);
    return ok;
  };
  const out = new Set<number>();
  for (const b of sim.state.buildings) if (b.type === 'conveyor' && !b.site && reaches(b)) out.add(b.id);
  return out;
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
        if (inCoreRing(sim, x, y, s)) continue;
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
      // keep a ring of two tiles around the core for belts: machines docked right onto it wall it in
      if (inCoreRing(sim, x, y, s)) continue;
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
export function depositEdges(sim: Sim, terrain: TerrainId, near: { x: number; y: number }): { x: number; y: number; dir: Dir; d: number }[] {
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
    for (const e of edges.slice(0, 60)) {
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
  // a machine with one raw input goes right to the deposit (drill feeds it directly), only its product travels
  if (atDeposit(sim, recipe, consumer, consumerCenter, perMin, log)) return true;
  if (log.fatal) return false;
  // machine near the consumer, facing it; retry other spots when the inputs cannot be routed
  const spots = spotsFacing(sim, recipe.machine, consumer, consumer.type === 'core' ? 24 : 16, rawSource(sim, item, consumerCenter));
  if (!spots.length) {
    log.error = `no space for ${recipe.machine} near ${consumer.type}`;
    return false;
  }
  // up to 6 real attempts; spots whose output cannot reach the consumer are skipped without counting
  let attempts = 0;
  for (let si = 0; si < Math.min(120, spots.length) && attempts < 6; si++) {
    const spot = spots[si];
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
    const outPath = routeBelt(sim, front, { building: consumer }, 15000);
    if (!outPath) {
      log.placed.splice(before);
      sim.remove(machine);
      continue;
    }
    attempts++;
    let good = layPath(sim, outPath, log);
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

/**
 * Drill on a deposit edge, the machine on the tile in front of it, and a belt from the machine to the consumer.
 * Keeps the crowded area around the consumer free for the later steps.
 */
function atDeposit(sim: Sim, recipe: (typeof RECIPES)[number], consumer: Building, consumerCenter: { x: number; y: number }, perMin: number, log: SolverLog): boolean {
  const inputs = Object.keys(recipe.inputs) as ItemId[];
  if (inputs.length !== 1 || BUILDINGS[recipe.machine].size !== 1) return false;
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((t) => TERRAIN_ITEM[t] === inputs[0]);
  if (!terrain || !sim.state.unlockedBuildings.includes('miner')) return false;
  const st = sim.state;
  // nearest edges first, but spread out: a crowded deposit must not use up all the tries
  const tried: { x: number; y: number }[] = [];
  const edges = depositEdges(sim, terrain, consumerCenter).filter((e) => {
    if (tried.length >= 16 || tried.some((t) => Math.abs(t.x - e.x) + Math.abs(t.y - e.y) < 4)) return false;
    tried.push(e);
    return true;
  });
  for (const e of edges) {
    const mx = e.x + DX[e.dir], my = e.y + DY[e.dir];
    if (!isFree(sim, mx, my) || inCoreRing(sim, mx, my, 1)) continue;
    const toward = dirTowards({ x: mx, y: my }, consumerCenter);
    const outs: Dir[] = [toward, 0, 1, 2, 3].filter((d, i, a) => a.indexOf(d) === i && d !== ((e.dir + 2) & 3)) as Dir[];
    for (const od of outs) {
      const front = { x: mx + DX[od], y: my + DY[od] };
      if (!isFree(sim, front.x, front.y)) continue;
      if (!routeBelt(sim, front, { building: consumer }, 20000)) continue;
      const before = log.placed.length;
      const miner = sim.place('miner', e.x, e.y, e.dir);
      const machine = miner && sim.place(recipe.machine, mx, my, od);
      if (!miner || !machine) {
        const failedType = !miner ? 'miner' : recipe.machine;
        if (miner) sim.remove(miner);
        if (sim.placementError(failedType, !miner ? e.x : mx, !miner ? e.y : my) === 'err_cost') {
          log.error = `cannot afford a ${failedType}`;
          log.fatal = true;
          log.fatalType = failedType;
          return false;
        }
        continue;
      }
      log.placed.push(miner, machine);
      sim.setRecipe(machine, recipe.id);
      // route again now that the drill and the machine stand (the first route may have crossed their tiles)
      const path = routeBelt(sim, front, { building: consumer }, 20000);
      if (!path) {
        for (const b of log.placed.splice(before)) if (st.buildings.includes(b)) sim.remove(b);
        continue;
      }
      // more drills behind the first one when the rate asks for it
      const want = Math.max(1, Math.min(3, Math.ceil(((perMin * recipe.inputs[inputs[0]]!) / recipe.outputCount) / minerRate(sim))));
      let bx = e.x - DX[e.dir], by = e.y - DY[e.dir];
      for (let n = 1; n < want; n++) {
        if (!sim.isDeposit(bx, by) || st.terrain[by * st.width + bx] !== terrain || sim.at(bx, by)) break;
        const m2 = sim.place('miner', bx, by, e.dir);
        if (!m2) break;
        log.placed.push(m2);
        bx -= DX[e.dir];
        by -= DY[e.dir];
      }
      if (!layPath(sim, path, log)) {
        for (const b of log.placed.splice(before)) if (st.buildings.includes(b)) sim.remove(b);
        if (log.fatal) return false;
        continue;
      }
      log.steps.push(`${recipe.machine} (${recipe.id}) at the deposit ${mx},${my}, belt ${path.length} tiles to ${consumer.type}`);
      return true;
    }
  }
  return false;
}

/** Is `item` already flowing into `target` from some producer? */
export function hasSupply(sim: Sim, item: ItemId, target: Building): boolean {
  for (const b of sim.state.buildings) {
    const out = b.type === 'miner' ? b.mineItem : b.recipe && RECIPES.find((r) => r.id === b.recipe)?.output;
    if (out !== item) continue;
    // a line whose drill ran dry (or a machine that has been starving with nothing made) supplies nothing any more
    if (b.type === 'miner' ? b.status === 'depleted' : b.status === 'starved' && !b.working && !(b.rate ?? 0)) continue;
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
  const failed: string[] = [];
  // drills on worked-out tiles go back into the kit stock, so their line gets rebuilt on a fresh edge
  for (const b of [...sim.state.buildings]) if (b.type === 'miner' && b.status === 'depleted') sim.remove(b);
  // building material first for the big ship orders: a plate line into the core, built before the chains wall the
  // core in, keeps belts, drills and solar panels affordable for the whole chapter
  const bigOrder = Object.keys(m.deliver).some((k) => (ITEMS[k as ItemId]?.tier ?? 0) >= 3);
  for (const mat of ['iron_plate', 'copper_plate'] as ItemId[]) {
    if (!bigOrder || m.deliver[mat] || hasSupply(sim, mat, core)) continue;
    const r = RECIPES.find((rc) => rc.output === mat);
    if (!r || !sim.state.unlockedRecipes.includes(r.id) || !sim.state.unlockedBuildings.includes(r.machine)) continue;
    const l2: SolverLog = { ok: true, steps: [], placed: [] };
    if (buildChain(sim, mat, core, 30, l2)) {
      log.steps.push(...l2.steps, `${mat} flows into the core (building material)`);
      log.placed.push(...l2.placed);
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
      if (!log.fatal) {
        // this part cannot be wired right now (space, routes): build the other parts first, a later round retries
        failed.push(`${item}: ${log.error}`);
        log.error = undefined;
        continue;
      }
      if (log.fatal) {
        // out of plates: make sure plates flow into the core so the caller can tick, then solve again
        const err = log.error;
        const cost = BUILDINGS[log.fatalType ?? 'conveyor'].cost;
        // short or running low (a few more buildings of this kind): make sure it flows into the core
        const missing = (Object.keys(cost) as ItemId[]).filter((k) => (sim.state.inventory[k] ?? 0) < cost[k]! * 4);
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
  if (failed.length) log.error = failed.join(' | ');
  ensurePower(sim, log);
  return log;
}
