import {
  BELT_SPACING,
  BELT_SPEED,
  BUFFER_CAP,
  BUILDINGS,
  GENERATOR_FUEL_SECONDS,
  MINE_SECONDS,
  MISSIONS,
  OUTPUT_CAP,
  RECIPE_BY_ID,
  STORAGE_CAP,
  TERRAIN_ITEM,
  recipesFor,
} from './data';
import type { Building, BuildingId, Dir, GameState, ItemId, RecipeDef } from './types';
import { DX, DY } from './types';

export type SimEvent =
  | { type: 'mission'; index: number }
  | { type: 'launch' }
  | { type: 'delivered'; item: ItemId; count: number };

/**
 * Spatial index: tile -> building. Rebuilt whenever buildings change.
 */
export class Sim {
  state: GameState;
  grid: (Building | null)[];
  events: SimEvent[] = [];
  private rrOut = new Map<number, number>();

  constructor(state: GameState) {
    this.state = state;
    this.grid = new Array(state.width * state.height).fill(null);
    this.rebuildGrid();
  }

  rebuildGrid() {
    this.grid.fill(null);
    for (const b of this.state.buildings) this.index(b);
  }

  private index(b: Building) {
    const s = BUILDINGS[b.type].size;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) this.grid[(b.y + y) * this.state.width + b.x + x] = b;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.state.width && y < this.state.height;
  }

  at(x: number, y: number): Building | null {
    if (!this.inBounds(x, y)) return null;
    return this.grid[y * this.state.width + x];
  }

  terrain(x: number, y: number) {
    return this.state.terrain[y * this.state.width + x];
  }

  // ---------- Building placement ----------

  canAfford(type: BuildingId): boolean {
    const cost = BUILDINGS[type].cost;
    for (const k in cost) if ((this.state.inventory[k as ItemId] ?? 0) < cost[k as ItemId]!) return false;
    return true;
  }

  /** Returns null if placement is valid, otherwise a reason key. */
  placementError(type: BuildingId, x: number, y: number): string | null {
    const def = BUILDINGS[type];
    if (!this.state.unlockedBuildings.includes(type)) return 'err_locked';
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        if (!this.inBounds(x + dx, y + dy)) return 'err_bounds';
        if (this.at(x + dx, y + dy)) return 'err_occupied';
      }
    }
    if (def.placeOn === 'deposit' && !TERRAIN_ITEM[this.terrain(x, y)]) return 'err_deposit';
    if (!this.canAfford(type)) return 'err_cost';
    return null;
  }

  place(type: BuildingId, x: number, y: number, dir: Dir): Building | null {
    if (this.placementError(type, x, y)) return null;
    const def = BUILDINGS[type];
    for (const k in def.cost) this.addInv(k as ItemId, -def.cost[k as ItemId]!);
    const b: Building = { id: this.state.nextId++, type, x, y, dir: def.rotatable ? dir : 0 };
    if (type === 'conveyor') b.items = [];
    if (def.kind === 'machine') {
      b.input = {};
      b.output = {};
      b.progress = 0;
      b.recipe = null;
    }
    if (type === 'miner') {
      b.mineItem = TERRAIN_ITEM[this.terrain(x, y)]!;
      b.progress = 0;
      b.output = {};
    }
    if (type === 'storage') b.store = {};
    if (type === 'generator') {
      b.input = {};
      b.fuelSeconds = 0;
    }
    this.state.buildings.push(b);
    this.index(b);
    return b;
  }

  /** Replace an existing conveyor's direction (used while drag-building belts). */
  rotate(b: Building, dir: Dir) {
    if (!BUILDINGS[b.type].rotatable) return;
    b.dir = dir;
    if (b.items) b.items = [];
  }

  remove(b: Building) {
    if (b.type === 'core') return;
    const def = BUILDINGS[b.type];
    // full refund incl. buffered items (player friendly)
    for (const k in def.cost) this.addInv(k as ItemId, def.cost[k as ItemId]!);
    const dump = (rec?: Partial<Record<ItemId, number>>) => {
      if (!rec) return;
      for (const k in rec) this.addInv(k as ItemId, rec[k as ItemId] ?? 0);
    };
    dump(b.input);
    dump(b.output);
    dump(b.store);
    if (b.items) for (const it of b.items) this.addInv(it.item, 1);
    const i = this.state.buildings.indexOf(b);
    if (i >= 0) this.state.buildings.splice(i, 1);
    for (let y = 0; y < def.size; y++) for (let x = 0; x < def.size; x++) this.grid[(b.y + y) * this.state.width + b.x + x] = null;
  }

  addInv(item: ItemId, n: number) {
    const v = (this.state.inventory[item] ?? 0) + n;
    if (v <= 0) delete this.state.inventory[item];
    else this.state.inventory[item] = v;
  }

  setRecipe(b: Building, recipeId: string | null) {
    if (b.recipe === recipeId) return;
    // return buffered inputs to the core so nothing is lost
    if (b.input) for (const k in b.input) this.addInv(k as ItemId, b.input[k as ItemId] ?? 0);
    b.input = {};
    b.progress = 0;
    b.recipe = recipeId;
  }

  // ---------- Item transfer ----------

  /** Try to give an item to building b arriving from direction `from` (direction of travel). */
  accept(b: Building, item: ItemId, from: Dir): boolean {
    const def = BUILDINGS[b.type];
    switch (def.kind) {
      case 'core': {
        this.addInv(item, 1);
        this.state.delivered[item] = (this.state.delivered[item] ?? 0) + 1;
        this.events.push({ type: 'delivered', item, count: 1 });
        return true;
      }
      case 'conveyor': {
        // belts cannot be fed head-on against their direction
        if (((from + 2) & 3) === b.dir) return false;
        const items = b.items!;
        // entry point: from behind -> 0, from the side -> 0.5 (merge)
        const entry = from === b.dir ? 0 : 0.5;
        for (const it of items) if (Math.abs(it.pos - entry) < BELT_SPACING) return false;
        items.push({ item, pos: entry });
        items.sort((a, c) => a.pos - c.pos);
        return true;
      }
      case 'machine': {
        if (!b.recipe && b.type === 'smelter') {
          // auto select the smelter recipe matching this input
          const r = recipesFor('smelter').find((rc) => rc.inputs[item] && this.state.unlockedRecipes.includes(rc.id));
          if (r) b.recipe = r.id;
        }
        if (!b.recipe) return false;
        const r = RECIPE_BY_ID[b.recipe];
        if (!r.inputs[item]) return false;
        if (this.isOutputSide(b, from)) return false;
        const cur = b.input![item] ?? 0;
        if (cur >= Math.max(BUFFER_CAP, r.inputs[item]! * 2)) return false;
        b.input![item] = cur + 1;
        return true;
      }
      case 'power': {
        if (b.type !== 'generator' || item !== 'fuel') return false;
        const cur = b.input!.fuel ?? 0;
        if (cur >= BUFFER_CAP) return false;
        b.input!.fuel = cur + 1;
        return true;
      }
      case 'storage': {
        if (this.isOutputSide(b, from)) return false;
        const total = Object.values(b.store!).reduce((a, c) => a + (c ?? 0), 0);
        if (total >= STORAGE_CAP) return false;
        b.store![item] = (b.store![item] ?? 0) + 1;
        return true;
      }
      case 'splitter': {
        if (from !== b.dir) return false; // only from behind
        if (b.output && Object.keys(b.output).length) return false;
        b.output = { [item]: 1 };
        return true;
      }
      case 'miner':
        return false;
    }
  }

  /** True when an item travelling in direction `from` would enter b through its output (front) edge. */
  private isOutputSide(b: Building, from: Dir): boolean {
    return ((from + 2) & 3) === b.dir;
  }

  /** Front-edge neighbour tiles of a building, in output order. */
  frontTiles(b: Building): { x: number; y: number }[] {
    const s = BUILDINGS[b.type].size;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < s; i++) {
      switch (b.dir) {
        case 0: out.push({ x: b.x + i, y: b.y - 1 }); break;
        case 1: out.push({ x: b.x + s, y: b.y + i }); break;
        case 2: out.push({ x: b.x + i, y: b.y + s }); break;
        case 3: out.push({ x: b.x - 1, y: b.y + i }); break;
      }
    }
    return out;
  }

  /** Try to push one item out of the building's front edge. */
  private pushOut(b: Building, item: ItemId): boolean {
    const tiles = this.frontTiles(b);
    const start = this.rrOut.get(b.id) ?? 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[(start + i) % tiles.length];
      const target = this.at(t.x, t.y);
      if (target && target !== b && this.accept(target, item, b.dir)) {
        this.rrOut.set(b.id, (start + i + 1) % tiles.length);
        return true;
      }
    }
    return false;
  }

  // ---------- Tick ----------

  tick(dt: number) {
    const st = this.state;
    st.time += dt;

    // power balance
    let supply = 0;
    let demand = 0;
    for (const b of st.buildings) {
      const p = BUILDINGS[b.type].power;
      if (p < 0) {
        if (b.type === 'generator') {
          if (b.fuelSeconds! <= 0 && (b.input!.fuel ?? 0) > 0) {
            b.input!.fuel!--;
            b.fuelSeconds! += GENERATOR_FUEL_SECONDS;
          }
          if (b.fuelSeconds! > 0) supply += -p;
        } else supply += -p;
      } else if (p > 0) demand += p;
    }
    st.powerSupply = supply;
    st.powerDemand = demand;
    const ratio = demand <= supply ? 1 : supply / demand;

    for (const b of st.buildings) {
      switch (b.type) {
        case 'conveyor':
          this.tickBelt(b, dt);
          break;
        case 'miner':
          this.tickMiner(b, dt * ratio);
          break;
        case 'smelter':
        case 'assembler':
        case 'refinery':
          this.tickMachine(b, dt * ratio);
          break;
        case 'storage':
          this.tickStorage(b);
          break;
        case 'splitter':
          this.tickSplitter(b);
          break;
        case 'generator':
          if (b.fuelSeconds! > 0) b.fuelSeconds = Math.max(0, b.fuelSeconds! - dt);
          break;
      }
    }
    this.checkMission();
  }

  private tickBelt(b: Building, dt: number) {
    const items = b.items!;
    if (!items.length) return;
    const step = BELT_SPEED * dt;
    // items sorted by pos ascending; move the front one first
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const ahead = i < items.length - 1 ? items[i + 1].pos - BELT_SPACING : Infinity;
      let target = Math.min(it.pos + step, ahead);
      if (target >= 1) {
        const nx = b.x + DX[b.dir];
        const ny = b.y + DY[b.dir];
        const next = this.at(nx, ny);
        if (next && this.accept(next, it.item, b.dir)) {
          items.splice(i, 1);
          continue;
        }
        target = 1;
      }
      it.pos = Math.max(it.pos, target);
    }
  }

  private tickMiner(b: Building, dt: number) {
    const item = b.mineItem!;
    const buffered = b.output![item] ?? 0;
    if (buffered > 0 && this.pushOut(b, item)) b.output![item] = buffered - 1;
    if ((b.output![item] ?? 0) >= 2) {
      b.working = false;
      return;
    }
    b.working = true;
    b.progress = (b.progress ?? 0) + dt / MINE_SECONDS;
    if (b.progress >= 1) {
      b.progress -= 1;
      b.output![item] = (b.output![item] ?? 0) + 1;
    }
  }

  private tickMachine(b: Building, dt: number) {
    b.working = false;
    // push outputs
    for (const k in b.output) {
      const n = b.output[k as ItemId] ?? 0;
      if (n > 0 && this.pushOut(b, k as ItemId)) b.output[k as ItemId] = n - 1;
    }
    if (!b.recipe) return;
    const r: RecipeDef = RECIPE_BY_ID[b.recipe];
    const outN = b.output![r.output] ?? 0;
    if (outN >= OUTPUT_CAP) return;
    if (b.progress === 0 || b.progress === undefined) {
      // can we start?
      for (const k in r.inputs) if ((b.input![k as ItemId] ?? 0) < r.inputs[k as ItemId]!) return;
      for (const k in r.inputs) b.input![k as ItemId]! -= r.inputs[k as ItemId]!;
      b.progress = 1e-6;
    }
    b.working = true;
    b.progress += dt / r.seconds;
    if (b.progress >= 1) {
      b.progress = 0;
      b.output![r.output] = outN + r.outputCount;
    }
  }

  private tickStorage(b: Building) {
    const store = b.store!;
    for (const k in store) {
      const n = store[k as ItemId] ?? 0;
      if (n > 0) {
        if (this.pushOut(b, k as ItemId)) {
          if (n - 1 <= 0) delete store[k as ItemId];
          else store[k as ItemId] = n - 1;
        }
        return; // one item per tick
      }
    }
  }

  private tickSplitter(b: Building) {
    if (!b.output) return;
    const key = Object.keys(b.output)[0] as ItemId | undefined;
    if (!key) return;
    // outputs: left, front, right (relative to dir)
    const dirs: Dir[] = [((b.dir + 3) & 3) as Dir, b.dir, ((b.dir + 1) & 3) as Dir];
    const start = b.rr ?? 0;
    for (let i = 0; i < 3; i++) {
      const d = dirs[(start + i) % 3];
      const t = this.at(b.x + DX[d], b.y + DY[d]);
      if (t && this.accept(t, key, d)) {
        b.rr = (start + i + 1) % 3;
        b.output = {};
        return;
      }
    }
  }

  // ---------- Missions ----------

  currentMission() {
    return MISSIONS[this.state.missionIndex] ?? null;
  }

  private checkMission() {
    const m = this.currentMission();
    if (!m || this.state.launched) return;
    for (const k in m.deliver) if ((this.state.delivered[k as ItemId] ?? 0) < m.deliver[k as ItemId]!) return;
    // complete
    for (const u of m.unlocks) if (!this.state.unlockedBuildings.includes(u)) this.state.unlockedBuildings.push(u);
    for (const r of m.unlockRecipes) if (!this.state.unlockedRecipes.includes(r)) this.state.unlockedRecipes.push(r);
    this.state.delivered = {};
    this.state.missionIndex++;
    this.events.push({ type: 'mission', index: this.state.missionIndex - 1 });
    if (this.state.missionIndex >= MISSIONS.length) {
      this.state.launched = true;
      this.events.push({ type: 'launch' });
    }
  }
}
