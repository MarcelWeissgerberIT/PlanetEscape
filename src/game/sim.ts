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
  SHIP_PARTS,
  SHIP_TOTAL,
  STORAGE_CAP,
  TERRAIN_ITEM,
  TUNNEL_RANGE,
  CONTRACT_INTERVAL,
  BOOST_FACTOR,
  BOOST_SECONDS,
  EVENT_DECIDE_SECONDS,
  EVENT_INTERVAL,
  EVENT_MIN_MISSION,
  HARD_STORM_FACTOR,
  METEOR_ORE,
  CONTRACT_ITEMS,
  STORM_INTERVAL,
  STORM_SECONDS,
  STORM_SOLAR_FACTOR,
  UPGRADE_BY_ID,
  MIXER_RATIOS,
  recipesFor,
} from './data';
import type { Blueprint, BlueprintItem, Building, BuildingId, Contract, Dir, EventKind, GameEvent, GameState, ItemId, RecipeDef, Status, TerrainId, UpgradeId } from './types';
import { DX, DY } from './types';
import { BOARD_PARTS, CHIP8_PALETTE, CHIP_ROM_BYTES, CRYSTAL_HZ, ITEMS, MATRIX_SIZE, SCREEN_REGION, itemRgb, ORE_PER_TILE, OSCILLATOR_CRYSTALS, TERMINAL_HZ_MAX, REGISTER_MAX, SWITCH_PULSE_SECONDS, TERMINAL_BANK_BYTES, TERMINAL_CRYSTALS, TERMINAL_DISPLAY, TERMINAL_RAM_BANKS, TERMINAL_TRACE, TERMINAL_TRACE_HZ } from './data';
import { Chip8, assemble, CHIP8_W, CHIP8_H } from './chip8';
import { CHIP8_PROGRAMS } from './chip8programs';

export type SimEvent =
  | { type: 'mission'; index: number }
  | { type: 'launch' }
  | { type: 'delivered'; item: ItemId; count: number }
  | { type: 'craft'; b: Building; item: ItemId }
  | { type: 'depleted'; x: number; y: number }
  | { type: 'contract_offer'; contract: Contract }
  | { type: 'contract_done'; contract: Contract }
  | { type: 'contract_failed'; contract: Contract }
  | { type: 'storm'; on: boolean }
  | { type: 'event'; event: GameEvent }
  | { type: 'event_done'; event: GameEvent; choice: 'a' | 'b' }
  | { type: 'meteor'; x: number; y: number }
  | { type: 'beep'; b: Building };

export const ARITH = new Set<BuildingId>(['register', 'adder', 'subtractor', 'multiplier', 'divider']);
const ITEM_RGB = (Object.keys(ITEMS) as ItemId[]).map((id) => {
  const v = itemRgb(id);
  return { id, r: v >> 16, g: (v >> 8) & 255, b: v & 255 };
});
/** The item whose colour is closest to the pixel, or null for a dark pixel (lamp off). */
function nearestItem(r: number, g: number, b: number): ItemId | null {
  if (r + g + b < 90) return null;
  let best: ItemId | null = null, bd = Infinity;
  for (const it of ITEM_RGB) {
    const d = (it.r - r) ** 2 + (it.g - g) ** 2 + (it.b - b) ** 2;
    if (d < bd) {
      bd = d;
      best = it.id;
    }
  }
  return best;
}

/** A terminal's mainboard: connected tiles, its RAM cells in address order and the crystals of its oscillators. */
export type Board = { key: string; tiles: Set<number>; cells: Building[]; crystals: number; turbo: number };

export interface Problem {
  building: Building;
  status: Status;
  missing?: ItemId[];
}

const JAM_SECONDS = 2;
const RATE_WINDOW = 10;
const MINER_BUFFER = 4;

/**
 * The simulation: belts, machines, power, missions and diagnostics.
 * Spatial index: tile -> building. Rebuilt whenever buildings change.
 */
export class Sim {
  state: GameState;
  grid: (Building | null)[];
  events: SimEvent[] = [];
  powerRatio = 1;
  private rrOut = new Map<number, number>();

  factor(id: UpgradeId): number {
    return UPGRADE_BY_ID[id].factor(this.state.upgrades[id] ?? 0);
  }

  upgradeCost(id: UpgradeId): Partial<Record<ItemId, number>> | null {
    const def = UPGRADE_BY_ID[id];
    const lvl = this.state.upgrades[id] ?? 0;
    if (lvl >= def.maxLevel) return null;
    return def.cost(lvl + 1);
  }

  /** Research tree: is the prerequisite track far enough? */
  upgradeUnlocked(id: UpgradeId): boolean {
    const req = UPGRADE_BY_ID[id].requires;
    return !req || (this.state.upgrades[req.id] ?? 0) >= req.level;
  }

  canUpgrade(id: UpgradeId): boolean {
    const cost = this.upgradeCost(id);
    if (!cost || !this.upgradeUnlocked(id)) return false;
    for (const k in cost) if ((this.state.inventory[k as ItemId] ?? 0) < cost[k as ItemId]!) return false;
    return true;
  }

  buyUpgrade(id: UpgradeId): boolean {
    if (!this.canUpgrade(id)) return false;
    const cost = this.upgradeCost(id)!;
    for (const k in cost) this.addInv(k as ItemId, -cost[k as ItemId]!);
    this.state.upgrades[id] = (this.state.upgrades[id] ?? 0) + 1;
    return true;
  }

  storageCap(): number {
    return Math.round(STORAGE_CAP * this.factor('buffer'));
  }

  /** The item a lamp currently shows, if any. */
  lampItem(b: Building): ItemId | null {
    const k = Object.keys(b.output ?? {})[0] as ItemId | undefined;
    if (k) return k;
    // pass mode: an item that just ran through keeps the lamp lit for a moment, otherwise it would never be seen
    return b.mode === 'pass' && (b.timer ?? 0) > 0 && b.mineItem ? b.mineItem : null;
  }

  /** Empty a lamp; the item goes back to the core stock. */
  clearLamp(b: Building) {
    if (b.type === 'matrix') {
      b.px = undefined;
      return;
    }
    const k = this.lampItem(b);
    if (k) this.addInv(k, 1);
    b.output = {};
  }

  toggleSwitch(b: Building) {
    b.open = b.open === false;
  }

  /** Remaining ore under a miner (sum of its tile). */
  oreLeft(x: number, y: number): number {
    return this.state.ore[y * this.state.width + x] ?? 0;
  }

  constructor(state: GameState) {
    this.state = state;
    this.grid = new Array(state.width * state.height).fill(null);
    this.rebuildGrid();
    this.creative = state.options.mode === 'playground'; // the playground is always free of cost and requirements
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

  byId(id: number | null | undefined): Building | null {
    if (id == null) return null;
    return this.state.buildings.find((b) => b.id === id) ?? null;
  }

  terrain(x: number, y: number) {
    return this.state.terrain[y * this.state.width + x];
  }

  isDeposit(x: number, y: number) {
    return this.inBounds(x, y) && !!TERRAIN_ITEM[this.terrain(x, y)];
  }

  // ---------- Building placement ----------

  canAfford(type: BuildingId): boolean {
    const cost = BUILDINGS[type].cost;
    for (const k in cost) if ((this.state.inventory[k as ItemId] ?? 0) < cost[k as ItemId]!) return false;
    return true;
  }

  /** Returns null if placement is valid, otherwise a reason key. */
  /** Level editor: everything unlocked, nothing costs anything. */
  creative = false;

  placementError(type: BuildingId, x: number, y: number): string | null {
    const def = BUILDINGS[type];
    if (!this.creative && !this.state.unlockedBuildings.includes(type)) return 'err_locked';
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        if (!this.inBounds(x + dx, y + dy)) return 'err_bounds';
        if (this.at(x + dx, y + dy)) return 'err_occupied';
        if (this.terrain(x + dx, y + dy) === 'rock') return 'err_rock';
        // deposits are reserved for miners
        if (def.placeOn !== 'deposit' && this.isDeposit(x + dx, y + dy)) return 'err_deposit_only_miner';
      }
    }
    if (def.placeOn === 'deposit' && !this.isDeposit(x, y)) return 'err_deposit';
    if (!this.creative && !this.canAfford(type)) return 'err_cost';
    return null;
  }

  /** Editor brush: set the terrain of a square of tiles around (x,y). Tiles under buildings are skipped. */
  paintTerrain(x: number, y: number, terrain: TerrainId, brush = 1): { x: number; y: number }[] {
    const st = this.state;
    const r = Math.floor(brush / 2);
    const changed: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!this.inBounds(tx, ty) || this.at(tx, ty)) continue;
        const i = ty * st.width + tx;
        if (st.terrain[i] === terrain && (terrain === 'ground' || terrain === 'rock' || st.ore[i] > 0)) continue;
        st.terrain[i] = terrain;
        st.ore[i] = terrain === 'ground' || terrain === 'rock' ? 0 : ORE_PER_TILE[1];
        changed.push({ x: tx, y: ty });
      }
    return changed;
  }

  /** Editor: move the core so that its top-left lands on (x,y); needs free ground under all 9 tiles. */
  moveCore(x: number, y: number): boolean {
    const core = this.state.buildings[0];
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 3; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!this.inBounds(tx, ty) || this.terrain(tx, ty) !== 'ground') return false;
        const b = this.at(tx, ty);
        if (b && b !== core) return false;
      }
    core.x = x;
    core.y = y;
    this.rebuildGrid();
    return true;
  }

  place(type: BuildingId, x: number, y: number, dir: Dir): Building | null {
    if (this.placementError(type, x, y)) return null;
    const def = BUILDINGS[type];
    if (!this.creative) for (const k in def.cost) this.addInv(k as ItemId, -def.cost[k as ItemId]!);
    const b: Building = { id: this.state.nextId++, type, x, y, dir: def.rotatable ? dir : 0 };
    if (type === 'conveyor' || type === 'tunnel') b.items = [];
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
    if (type === 'storage') {
      b.store = {};
      b.recipe = null;
    }
    if (type === 'generator') {
      b.input = {};
      b.fuelSeconds = 0;
    }
    if (type === 'tunnel') {
      b.pair = null;
      b.exit = false;
    }
    if (def.kind === 'logic') {
      b.output = {};
      b.recipe = null; // sorter / valve: item filter
      if (type === 'mixer') {
        b.bufL = [];
        b.bufR = [];
        b.ratio = 0;
      }
      if (type === 'valve') {
        b.threshold = 50;
        b.open = true;
      }
      if (type === 'lamp') b.mode = 'hold';
      if (type === 'switch') b.open = true;
      if (type === 'terminal') {
        b.run = false;
        b.recipe = 'copper_wire';
        b.ram = 0;
        b.clock = 0;
      }
      if (ARITH.has(type)) {
        b.value = type === 'multiplier' ? 2 : type === 'divider' ? 2 : 0;
        b.acc = 0;
        b.debt = 0;
        b.bufL = []; // pending output items (unary result)
      }
    }
    this.state.buildings.push(b);
    this.index(b);
    if (type === 'tunnel') this.pairTunnel(b);
    return b;
  }

  /** Pair a new tunnel piece with an unpaired one in line with it (behind = we are the exit, ahead = we are the entrance). */
  private pairTunnel(b: Building) {
    const candidates = (dir: Dir, ahead: boolean) => {
      for (let i = 1; i <= TUNNEL_RANGE + 1; i++) {
        const x = b.x + DX[dir] * i, y = b.y + DY[dir] * i;
        const t = this.at(x, y);
        if (t?.type === 'tunnel' && t.dir === b.dir && t.pair == null) {
          // behind: partner must be an entrance (not exit). ahead: partner must not already be an entrance with pair
          if (!ahead && !t.exit) return t;
          if (ahead && !t.exit) return t; // an unpaired piece ahead becomes the exit
        }
      }
      return null;
    };
    const back = ((b.dir + 2) & 3) as Dir;
    const behind = candidates(back, false);
    if (behind) {
      behind.pair = b.id;
      b.pair = behind.id;
      b.exit = true;
      behind.exit = false;
      return;
    }
    const ahead = candidates(b.dir, true);
    if (ahead) {
      ahead.pair = b.id;
      ahead.exit = true;
      ahead.items = [];
      b.pair = ahead.id;
      b.exit = false;
    }
  }

  /** Replace an existing building's direction. */
  rotate(b: Building, dir: Dir) {
    if (!BUILDINGS[b.type].rotatable) return;
    if (b.dir === dir) return;
    if (b.type === 'tunnel') this.unpair(b);
    b.dir = dir;
    if (b.items) {
      for (const it of b.items) this.addInv(it.item, 1);
      b.items = [];
    }
    if (b.type === 'tunnel') this.pairTunnel(b);
  }

  private unpair(b: Building) {
    const p = this.byId(b.pair);
    if (p) {
      p.pair = null;
      p.exit = false;
      if (p.items) {
        for (const it of p.items) this.addInv(it.item, 1);
        p.items = [];
      }
    }
    b.pair = null;
    b.exit = false;
  }

  remove(b: Building) {
    if (b.type === 'core') return;
    const def = BUILDINGS[b.type];
    if (b.type === 'terminal') {
      this.clearTerminalDisplay(b);
      this.cpus.delete(b.id);
      this.cpuErrors.delete(b.id);
      if (!this.creative) {
        if (b.ram) this.addInv('circuit', b.ram);
        if (b.clock) this.addInv('glass', b.clock);
      }
    }
    // full refund incl. buffered items (player friendly)
    if (!this.creative) for (const k in def.cost) this.addInv(k as ItemId, def.cost[k as ItemId]!);
    const dump = (rec?: Partial<Record<ItemId, number>>) => {
      if (!rec) return;
      for (const k in rec) this.addInv(k as ItemId, rec[k as ItemId] ?? 0);
    };
    dump(b.input);
    dump(b.output);
    dump(b.store);
    if (b.items) for (const it of b.items) this.addInv(it.item, 1);
    for (const it of b.bufL ?? []) this.addInv(it, 1);
    for (const it of b.bufR ?? []) this.addInv(it, 1);
    if (b.type === 'tunnel') this.unpair(b);
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
    if (b.input) for (const k in b.input) this.addInv(k as ItemId, b.input[k as ItemId] ?? 0);
    b.input = {};
    b.progress = 0;
    b.recipe = recipeId;
  }

  // ---------- Item transfer ----------

  /** Could building b ever take items arriving in direction `from`? (static check used for dead-end detection) */
  canReceiveFrom(b: Building, from: Dir): boolean {
    switch (BUILDINGS[b.type].kind) {
      case 'core':
        return true;
      case 'conveyor':
        return ((from + 2) & 3) !== b.dir;
      case 'tunnel':
        return !b.exit && from === b.dir && b.pair != null;
      case 'machine':
      case 'storage':
        return !this.isOutputSide(b, from);
      case 'power':
        return b.type === 'generator';
      case 'splitter':
      case 'miner':
        return from === b.dir;
      case 'logic':
        if (b.type === 'mixer') return from === ((b.dir + 1) & 3) || from === ((b.dir + 3) & 3);
        if (b.type === 'lamp') return ((from + 2) & 3) !== b.dir; // a pixel takes input from every side except its front
        if (b.type === 'terminal') return true; // parts are installed from any side
        if (ARITH.has(b.type)) return from === b.dir || from === ((b.dir + 1) & 3) || from === ((b.dir + 3) & 3); // back = main input, sides = second operand / signal
        if (b.type === 'switch') return from !== ((b.dir + 2) & 3); // behind = items to gate, sides = control pulses
        return from === b.dir;
    }
  }

  /** Try to give an item to building b arriving from direction `from` (direction of travel). */
  accept(b: Building, item: ItemId, from: Dir, viaTunnel = false): boolean {
    const def = BUILDINGS[b.type];
    switch (def.kind) {
      case 'core': {
        const need = SHIP_PARTS[item];
        if (need && (this.state.ship[item] ?? 0) < need) this.state.ship[item] = (this.state.ship[item] ?? 0) + 1; // installed on the ship
        else this.addInv(item, 1);
        this.state.delivered[item] = (this.state.delivered[item] ?? 0) + 1;
        this.bump(this.state.stats.delivered, item, 1);
        for (const c of this.state.contracts) if (c.accepted && c.item === item && c.delivered < c.amount) c.delivered++;
        this.events.push({ type: 'delivered', item, count: 1 });
        return true;
      }
      case 'conveyor': {
        if (((from + 2) & 3) === b.dir) return false; // never head-on
        const items = b.items!;
        const entry = from === b.dir ? 0 : 0.5; // from behind -> start, from the side -> merge in the middle
        for (const it of items) if (Math.abs(it.pos - entry) < BELT_SPACING) return false;
        items.push({ item, pos: entry });
        items.sort((a, c) => a.pos - c.pos);
        return true;
      }
      case 'tunnel': {
        if (b.exit) {
          if (!viaTunnel) return false;
        } else if (from !== b.dir || b.pair == null) return false;
        const items = b.items!;
        for (const it of items) if (it.pos < BELT_SPACING) return false;
        items.push({ item, pos: 0 });
        items.sort((a, c) => a.pos - c.pos);
        return true;
      }
      case 'machine': {
        if (!b.recipe) {
          // auto-select machines pick the recipe that uses the first item they receive
          const r = recipesFor(b.type as RecipeDef['machine']).find((rc) => rc.auto && rc.inputs[item] && this.state.unlockedRecipes.includes(rc.id));
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
        if (total >= this.storageCap()) return false;
        b.store![item] = (b.store![item] ?? 0) + 1;
        return true;
      }
      case 'splitter': {
        if (from !== b.dir) return false;
        if (b.output && Object.keys(b.output).length) return false;
        b.output = { [item]: 1 };
        return true;
      }
      case 'logic': {
        if (b.type === 'mixer') {
          const fromLeft = from === ((b.dir + 1) & 3); // travelling clockwise-next = came from the left side
          const fromRight = from === ((b.dir + 3) & 3);
          if (!fromLeft && !fromRight) return false;
          const buf = fromLeft ? b.bufL! : b.bufR!;
          if (buf.length >= 4) return false;
          buf.push(item);
          return true;
        }
        if (b.type === 'matrix') {
          // a pixel bucket: every item fills the next dark pixel in its colour
          const px = b.px ?? (b.px = new Array<number>(MATRIX_SIZE * MATRIX_SIZE).fill(0));
          const i = px.indexOf(0);
          if (i < 0) return false;
          px[i] = itemRgb(item);
          return true;
        }
        if (b.type === 'oscillator') {
          if ((b.clock ?? 0) + (b.turbo ?? 0) >= OSCILLATOR_CRYSTALS) return false;
          if (item === 'quartz') b.clock = (b.clock ?? 0) + 1;
          else if (item === 'glass') b.turbo = (b.turbo ?? 0) + 1; // glass = turbo crystal
          else return false;
          return true;
        }
        if (b.type === 'bus') return false;
        if (b.type === 'terminal') {
          // the computer is assembled from delivered parts: circuits become memory banks, quartz/glass become oscillator crystals
          if (item === 'circuit' && (b.ram ?? 0) < TERMINAL_RAM_BANKS) {
            b.ram = (b.ram ?? 0) + 1;
            this.applyMemory(b);
            return true;
          }
          if ((item === 'quartz' || item === 'glass') && (b.clock ?? 0) < TERMINAL_CRYSTALS) {
            b.clock = (b.clock ?? 0) + 1;
            return true;
          }
          return false;
        }
        if (ARITH.has(b.type)) return this.acceptArith(b, item, from);
        if (b.type === 'switch' && from !== b.dir && from !== ((b.dir + 2) & 3)) {
          // control pulse from a side (the pulse item is consumed): in pulse mode it holds the switch open for a
          // moment per item (a burst = a long press), otherwise it flips the switch
          if (b.mode === 'pulse') {
            b.timer = (b.timer ?? 0) + SWITCH_PULSE_SECONDS;
            b.open = true;
          } else b.open = b.open === false;
          return true;
        }
        if (b.type === 'lamp') {
          if (((from + 2) & 3) === b.dir) return false;
          if (b.recipe && b.recipe !== item) return false; // optional colour filter
        } else if (from !== b.dir) return false;
        if (b.type === 'switch' && b.open === false) return false;
        if (b.output && Object.keys(b.output).length) return false;
        if (b.type === 'valve' && !b.recipe) b.recipe = item; // valve watches the first item it sees
        b.output = { [item]: 1 };
        return true;
      }
      case 'miner': {
        // miners pass items through from behind so several can be chained across a deposit
        if (from !== b.dir) return false;
        const total = Object.values(b.output!).reduce((a, c) => a + (c ?? 0), 0);
        if (total >= MINER_BUFFER) return false;
        b.output![item] = (b.output![item] ?? 0) + 1;
        return true;
      }
    }
  }

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

  /** Is there any building in front that could take output? */
  hasOutputTarget(b: Building): boolean {
    return this.frontTiles(b).some((t) => {
      const target = this.at(t.x, t.y);
      return !!target && target !== b && this.canReceiveFrom(target, b.dir);
    });
  }

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
          if (b.fuelSeconds! > 0) supply += -p * this.factor('power');
          b.status = b.fuelSeconds! > 0 ? 'ok' : 'no_fuel';
        } else if (b.type === 'solar') supply += -p * this.factor('power') * (st.storm > 0 ? STORM_SOLAR_FACTOR : 1);
        else supply += -p;
      } else if (p > 0 && !(b.type === 'miner' && b.status === 'depleted')) demand += p;
    }
    if ((st.boostUntil ?? 0) > st.time) supply *= BOOST_FACTOR; // overclocked after a power surge event
    st.powerSupply = Math.round(supply);
    st.powerDemand = demand;
    const ratio = demand <= supply ? 1 : supply / demand;
    this.powerRatio = ratio;

    for (const b of st.buildings) {
      switch (b.type) {
        case 'conveyor':
          this.tickBelt(b, dt);
          break;
        case 'tunnel':
          this.tickTunnel(b, dt);
          break;
        case 'miner':
          this.tickMiner(b, dt, ratio);
          break;
        case 'smelter':
        case 'printer':
        case 'assembler':
        case 'refinery':
        case 'fabricator':
          this.tickMachine(b, dt, ratio);
          break;
        case 'storage':
          this.tickStorage(b);
          break;
        case 'splitter':
          this.tickSplitter(b);
          break;
        case 'sorter':
        case 'overflow':
        case 'valve':
        case 'mixer':
        case 'lamp':
        case 'switch':
          this.tickLogic(b);
          break;
        case 'generator':
          if (b.fuelSeconds! > 0) b.fuelSeconds = Math.max(0, b.fuelSeconds! - dt);
          break;
        case 'terminal':
          this.tickTerminal(b, dt, ratio);
          break;
        case 'register':
          this.tickArith(b);
          this.pushRegisterLamps(b);
          break;
        case 'oscillator':
          b.status = (b.clock ?? 0) + (b.turbo ?? 0) ? 'ok' : 'starved';
          b.missing = (b.clock ?? 0) + (b.turbo ?? 0) ? undefined : ['quartz'];
          break;
        case 'bus':
        case 'matrix':
          b.status = 'ok';
          break;
        case 'screen':
          b.working = this.state.time - (b.progress ?? -10) < 1; // a frame arrived within the last second
          b.status = b.working ? 'ok' : 'idle';
          break;
        case 'adder':
        case 'subtractor':
        case 'multiplier':
        case 'divider':
          this.tickArith(b);
          break;
      }
    }
    this.tickWorld(dt);
    this.checkMission();
  }

  private bump(rec: Partial<Record<ItemId, number>>, item: ItemId, n: number) {
    rec[item] = (rec[item] ?? 0) + n;
  }

  private tickWorld(_dt: number) {
    const st = this.state;
    // dust storms (only once solar power matters)
    if (st.storm > 0) {
      st.storm -= _dt;
      if (st.storm <= 0) {
        st.storm = 0;
        this.events.push({ type: 'storm', on: false });
      }
    } else if (st.time >= st.nextStormAt) {
      const hard = st.options.difficulty === 'hard' ? HARD_STORM_FACTOR : 1;
      st.nextStormAt = st.time + (STORM_INTERVAL[0] + Math.random() * (STORM_INTERVAL[1] - STORM_INTERVAL[0])) * hard;
      if (st.options.storms && this.countBuildings('solar') > 0) {
        st.storm = STORM_SECONDS;
        this.events.push({ type: 'storm', on: true });
      }
    }
    // contracts
    for (let i = st.contracts.length - 1; i >= 0; i--) {
      const c = st.contracts[i];
      if (c.accepted && c.delivered >= c.amount) {
        for (const k in c.reward) this.addInv(k as ItemId, c.reward[k as ItemId]!);
        st.contractsDone++;
        st.contracts.splice(i, 1);
        this.events.push({ type: 'contract_done', contract: c });
      } else if (st.time >= c.deadline) {
        st.contracts.splice(i, 1);
        if (c.accepted) this.events.push({ type: 'contract_failed', contract: c });
      }
    }
    // events: KORA reports a situation and waits for a decision
    if (st.event) {
      if (st.time >= st.event.until) this.resolveEvent('b');
    } else if (st.time >= (st.nextEventAt ?? Infinity) && st.missionIndex >= EVENT_MIN_MISSION && !st.launched) {
      st.nextEventAt = st.time + EVENT_INTERVAL[0] + Math.random() * (EVENT_INTERVAL[1] - EVENT_INTERVAL[0]);
      const ev = this.makeEvent();
      if (ev) {
        st.event = ev;
        st.eventsSeen = (st.eventsSeen ?? 0) + 1;
        this.events.push({ type: 'event', event: ev });
      }
    }
    if (st.time >= st.nextContractAt && st.missionIndex >= 1 && st.contracts.length < 2) {
      st.nextContractAt = st.time + CONTRACT_INTERVAL;
      const pool = CONTRACT_ITEMS.filter((c) => st.missionIndex >= c.minMission);
      if (pool.length) {
        const def = pool[Math.floor(Math.random() * pool.length)];
        const amount = def.amount[0] + Math.floor(Math.random() * (def.amount[1] - def.amount[0] + 1));
        const c: Contract = { id: st.nextId++, item: def.item, amount, delivered: 0, deadline: st.time + def.seconds + 120, reward: def.reward(amount), accepted: false };
        st.contracts.push(c);
        this.events.push({ type: 'contract_offer', contract: c });
      }
    }
  }

  // ---------- KORA Terminal (CHIP-8) ----------

  private cpus = new Map<number, Chip8>();
  private cpuErrors = new Map<number, string[]>();
  private cpuBeeping = new Set<number>();
  private cpuFrame = new Map<number, number>(); // display version per terminal (renderer cache key)
  private cpuStale = new Map<number, number>(); // ticks a dirty frame has waited for a sync point
  private switchWas = new Map<number, boolean>(); // rim switch state last tick (keys act on transitions only)

  /** The running CPU of a terminal, assembled from its program on first use. Null when the program has errors. */
  cpu(b: Building): Chip8 | null {
    const c = this.cpus.get(b.id);
    if (c) return c;
    if (this.cpuErrors.has(b.id)) return null;
    const src = b.prog ?? CHIP8_PROGRAMS[0].source;
    const asm = assemble(src);
    if (asm.errors.length || !asm.rom.length) {
      this.cpuErrors.set(b.id, asm.errors.length ? asm.errors : ['empty program']);
      return null;
    }
    const cpu = new Chip8(asm.rom);
    this.cpus.set(b.id, cpu);
    this.applyMemory(b);
    return cpu;
  }

  // ---------- Mainboard: parts touching the terminal (through bus traces) form its board ----------

  private boards = new Map<number, Board>();
  private cellShadow = new Map<number, Uint8Array>(); // last synced byte per RAM cell (detects who changed it: CPU or player)

  /** Everything connected to the terminal through 4-neighbourhood over bus traces, registers and oscillators. */
  board(b: Building): Board {
    const st = this.state;
    const key = `${st.buildings.length}:${st.nextId}`;
    const cached = this.boards.get(b.id);
    if (cached && cached.key === key) return cached;
    const s = BUILDINGS[b.type].size;
    const tiles = new Set<number>();
    const seen = new Set<number>();
    const cells: Building[] = [];
    let crystals = 0, turbo = 0;
    const queue: number[] = [];
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) seen.add(y * st.width + x);
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) queue.push(y * st.width + x);
    while (queue.length && tiles.size < 4096) {
      const idx = queue.shift()!;
      const x = idx % st.width, y = Math.floor(idx / st.width);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= st.width || ny >= st.height) continue;
        const ni = ny * st.width + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        const p = this.at(nx, ny);
        if (!p || !BOARD_PARTS.has(p.type)) continue;
        tiles.add(ni);
        queue.push(ni);
        if (p.type === 'register') cells.push(p);
        else if (p.type === 'oscillator') {
          crystals += p.clock ?? 0;
          turbo += p.turbo ?? 0;
        }
      }
    }
    cells.sort((p, q) => p.y - q.y || p.x - q.x); // address order: row by row, like reading
    const board: Board = { key, tiles, cells, crystals, turbo };
    this.boards.set(b.id, board);
    return board;
  }

  /** Crystals ticking for a terminal: its own quartz plus the oscillators on its board. */
  terminalCrystals(b: Building): { quartz: number; glass: number } {
    const board = this.board(b);
    return { quartz: (b.clock ?? 0) + board.crystals, glass: board.turbo };
  }

  /** Bytes the current program needs and bytes installed (RAM cells on the board + circuit banks); the chip carries the first 512 B itself. */
  terminalMemory(b: Building): { need: number; have: number; cells: number; banks: number; banksNeeded: number } {
    const cpu = this.cpus.get(b.id);
    const romLen = cpu ? cpu.romLength : assemble(b.prog ?? CHIP8_PROGRAMS[0].source).rom.length;
    const cells = this.board(b).cells.length, banks = b.ram ?? 0;
    return { need: romLen, have: cells + banks * TERMINAL_BANK_BYTES, cells, banks, banksNeeded: Math.ceil(Math.max(0, romLen - cells) / TERMINAL_BANK_BYTES) };
  }

  /** Instructions per second: quartz 100 Hz each, glass 2 kHz each (turbo), capped; trace mode crawls at 2 Hz. */
  terminalHz(b: Building): number {
    const c = this.terminalCrystals(b);
    const full = Math.min(TERMINAL_HZ_MAX, c.quartz * CRYSTAL_HZ.quartz + c.glass * CRYSTAL_HZ.glass);
    return b.trace ? Math.min(full, TERMINAL_TRACE_HZ) : full;
  }

  /** The RAM cell holding a memory address, if the board has one. */
  cellAt(b: Building, addr: number): Building | undefined {
    return this.board(b).cells[addr - CHIP_ROM_BYTES];
  }

  /**
   * RAM cells are the memory: cell i holds byte 0x200+i as an item count. Before the CPU runs, a cell the player
   * changed (items delivered, side pulse, cleared) is written into memory; afterwards bytes the CPU changed are
   * written into the cells. New or re-ordered cells are flashed with the current memory image.
   */
  private syncCells(b: Building, cpu: Chip8, after: boolean) {
    const cells = this.board(b).cells;
    let shadow = this.cellShadow.get(b.id);
    if (!shadow || shadow.length !== cells.length) {
      shadow = new Uint8Array(cells.length);
      for (let i = 0; i < cells.length; i++) {
        shadow[i] = cpu.mem[CHIP_ROM_BYTES + i];
        cells[i].value = shadow[i];
        if (!cells[i].recipe) cells[i].recipe = 'circuit';
      }
      this.cellShadow.set(b.id, shadow);
      return;
    }
    for (let i = 0; i < cells.length; i++) {
      const a = CHIP_ROM_BYTES + i;
      if (after) {
        const m = cpu.mem[a];
        if (m !== shadow[i]) {
          shadow[i] = m;
          cells[i].value = m;
          if (!cells[i].recipe) cells[i].recipe = 'circuit';
        }
      } else {
        const v = Math.min(255, cells[i].value ?? 0);
        if (v !== shadow[i]) {
          shadow[i] = v;
          cpu.mem[a] = v;
        }
      }
    }
  }

  /** The 8x22 tile block above the terminal where lamps show PC, opcode, I and V0-VF as bits. */
  terminalTraceRect(b: Building): { x: number; y: number; w: number; h: number } {
    return { x: b.x + TERMINAL_TRACE.dx, y: b.y + TERMINAL_TRACE.dy, w: TERMINAL_TRACE.w, h: TERMINAL_TRACE.h };
  }

  /** Bytes shown in the trace block, top to bottom. */
  traceBytes(cpu: Chip8): number[] {
    const op = (cpu.mem[cpu.pc] << 8) | cpu.mem[cpu.pc + 1];
    return [cpu.pc >> 8, cpu.pc & 0xff, op >> 8, op & 0xff, cpu.i >> 8, cpu.i & 0xff, ...Array.from(cpu.v)];
  }

  /** Execute exactly one instruction (trace mode, paused). */
  stepTerminal(b: Building) {
    const cpu = this.cpu(b);
    if (!cpu || cpu.halted) return;
    this.syncCells(b, cpu, false);
    this.applyMemory(b);
    cpu.step();
    this.pushDisplay(b, cpu, true);
    this.pushTrace(b, cpu);
    this.syncCells(b, cpu, true);
  }

  private pushTrace(b: Building, cpu: Chip8) {
    const r = this.terminalTraceRect(b);
    const item = (b.recipe as ItemId | null) ?? 'copper_wire';
    const bytes = this.traceBytes(cpu);
    for (let row = 0; row < r.h; row++) {
      const v = bytes[row] ?? 0;
      for (let col = 0; col < r.w; col++) {
        const l = this.at(r.x + col, r.y + row);
        if (l?.type !== 'lamp') continue;
        l.mode = 'hold';
        const on = (v >> (7 - col)) & 1;
        const has = !!Object.keys(l.output ?? {}).length;
        if (on && !has) l.output = { [item]: 1 };
        else if (!on && has) l.output = {};
      }
    }
  }

  private applyMemory(b: Building) {
    const cpu = this.cpus.get(b.id);
    if (!cpu) return;
    const limit = Math.min(4096, CHIP_ROM_BYTES + this.board(b).cells.length + (b.ram ?? 0) * TERMINAL_BANK_BYTES);
    if (limit !== cpu.memLimit) {
      cpu.memLimit = limit;
      if (cpu.halted?.startsWith('memory')) cpu.halted = null; // continues once the memory arrived
    }
  }

  /** Creative / editor helper: install every part at once. */
  installAll(b: Building) {
    b.ram = TERMINAL_RAM_BANKS;
    b.clock = TERMINAL_CRYSTALS;
    this.applyMemory(b);
  }

  // ---------- Arithmetic modules: numbers are item counts ----------

  private acceptArith(b: Building, item: ItemId, from: Dir): boolean {
    const fromBack = from === b.dir;
    const out = b.bufL!;
    if (out.length >= 32) return false; // output queue full: back-pressure like a belt
    switch (b.type) {
      case 'register': {
        if (fromBack) {
          // store
          if ((b.value ?? 0) >= REGISTER_MAX) return false;
          b.value = (b.value ?? 0) + 1;
          b.recipe = item; // remembers what it holds
          return true;
        }
        // signal from a side: release the whole stored count as items (the signal item itself is consumed)
        const n = b.value ?? 0;
        const what = (b.recipe as ItemId | null) ?? item;
        for (let k = 0; k < n; k++) out.push(what);
        b.value = 0;
        b.acc = (b.acc ?? 0) + 1;
        return true;
      }
      case 'adder':
        out.push(item); // a + b: everything arriving leaves again
        b.acc = (b.acc ?? 0) + 1;
        return true;
      case 'subtractor':
        if (fromBack) {
          if ((b.debt ?? 0) > 0) b.debt = b.debt! - 1; // cancelled by a right-hand item
          else out.push(item);
          b.acc = (b.acc ?? 0) + 1;
          return true;
        }
        b.debt = Math.min(255, (b.debt ?? 0) + 1); // each side item cancels one future/back item
        return true;
      case 'multiplier':
        if (fromBack) {
          const k = Math.max(1, b.value ?? 1);
          if (out.length + k > 64) return false;
          for (let i = 0; i < k; i++) out.push(item);
          b.acc = (b.acc ?? 0) + 1;
          return true;
        }
        b.value = Math.min(9, (b.value ?? 0) + 1); // side items raise the factor (wraps at 9 -> 1)
        if (b.value === 9 && (b.acc ?? 0) < 0) b.value = 1;
        return true;
      case 'divider':
        if (fromBack) {
          const k = Math.max(1, b.value ?? 1);
          b.acc = (b.acc ?? 0) + 1;
          if (b.acc % k === 0) out.push(item); // one out per k in; remainder stays inside
          return true;
        }
        b.value = Math.min(9, (b.value ?? 0) + 1);
        return true;
    }
    return false;
  }

  private tickArith(b: Building) {
    const out = b.bufL!;
    b.status = 'ok';
    if (!out.length) return;
    if (this.pushDir(b, out[0], b.dir)) out.shift();
    else b.status = 'blocked';
  }

  /** Value a register shows on lamps in front of it: up to 8 lamps in a row = bits (MSB nearest). */
  private pushRegisterLamps(b: Building) {
    const v = b.value ?? 0;
    const item = (b.recipe as ItemId | null) ?? 'copper_wire';
    for (let i = 0; i < 8; i++) {
      const x = b.x + DX[b.dir] * (i + 1), y = b.y + DY[b.dir] * (i + 1);
      const l = this.at(x, y);
      if (l?.type !== 'lamp') break;
      const on = (v >> (7 - i)) & 1;
      l.mode = 'hold';
      const has = !!Object.keys(l.output ?? {}).length;
      if (on && !has) l.output = { [item]: 1 };
      else if (!on && has) l.output = {};
    }
  }

  cpuErrorsOf(b: Building): string[] {
    return this.cpuErrors.get(b.id) ?? [];
  }

  cpuFrameOf(b: Building): number {
    return this.cpuFrame.get(b.id) ?? 0;
  }

  /** Load a new program (assembly source or hex). Returns assembler errors; on success the terminal restarts. */
  setProgram(b: Building, source: string): string[] {
    b.prog = source;
    this.cpus.delete(b.id);
    this.cpuErrors.delete(b.id);
    const cpu = this.cpu(b);
    if (!cpu) return this.cpuErrorsOf(b);
    b.run = true;
    this.clearTerminalDisplay(b);
    this.cellShadow.delete(b.id);
    this.syncCells(b, cpu, true);
    return [];
  }

  resetTerminal(b: Building) {
    const cpu = this.cpu(b);
    cpu?.reset();
    this.clearTerminalDisplay(b);
    this.cellShadow.delete(b.id); // flash the RAM cells with the fresh image
    if (cpu) {
      this.pushDisplay(b, cpu, true);
      this.syncCells(b, cpu, true);
    }
  }

  terminalKey(b: Building, key: number, down: boolean) {
    const cpu = this.cpu(b);
    if (!cpu) return;
    if (down) cpu.keyDown(key);
    else cpu.keyUp(key);
  }

  /** Switches touching the terminal's rim act as keys: clockwise from the top-left corner = 1,2,3,...,C; a switch with a `threshold` uses that key. */
  terminalSwitches(b: Building): { sw: Building; key: number }[] {
    const s = BUILDINGS[b.type].size;
    const ring: { x: number; y: number }[] = [];
    for (let x = b.x - 1; x <= b.x + s; x++) ring.push({ x, y: b.y - 1 });
    for (let y = b.y; y <= b.y + s; y++) ring.push({ x: b.x + s, y });
    for (let x = b.x + s - 1; x >= b.x - 1; x--) ring.push({ x, y: b.y + s });
    for (let y = b.y + s - 1; y >= b.y; y--) ring.push({ x: b.x - 1, y });
    const out: { sw: Building; key: number }[] = [];
    let i = 0;
    for (const t of ring) {
      const sw = this.at(t.x, t.y);
      if (sw?.type === 'switch') {
        out.push({ sw, key: sw.threshold !== undefined && sw.threshold >= 0 && sw.threshold <= 15 ? sw.threshold : (i + 1) & 15 });
        i++;
      }
    }
    return out;
  }

  /** The 64x32 tile region right of the terminal where lamps become pixels. */
  terminalDisplayRect(b: Building): { x: number; y: number; w: number; h: number } {
    return { x: b.x + TERMINAL_DISPLAY.dx, y: b.y + TERMINAL_DISPLAY.dy, w: CHIP8_W, h: CHIP8_H };
  }

  private clearTerminalDisplay(b: Building) {
    const r = this.terminalDisplayRect(b);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const l = this.at(r.x + x, r.y + y);
        if (l?.type === 'lamp') l.output = {};
        else if (l?.type === 'matrix' && x < r.w / MATRIX_SIZE && y < r.h / MATRIX_SIZE) l.px = undefined;
      }
  }

  // ---------- Video receiver ----------

  /** Pixel region a receiver drives: 64x32 px (8x4 matrices) per scale step, right of the building. */
  screenRect(b: Building): { x: number; y: number; w: number; h: number } {
    const k = Math.max(1, Math.min(4, b.value ?? 1));
    return { x: b.x + SCREEN_REGION.dx, y: b.y, w: SCREEN_REGION.w * MATRIX_SIZE * k, h: SCREEN_REGION.h * MATRIX_SIZE * k };
  }

  /** Write an RGBA frame (w x h, the receiver's resolution) onto matrices (8x8 blocks) and lamps (one pixel per tile). */
  pushFrame(b: Building, rgba: Uint8ClampedArray, w: number, h: number) {
    const r = this.screenRect(b);
    if (w !== r.w || h !== r.h) return;
    b.progress = this.state.time;
    const tilesW = w / MATRIX_SIZE, tilesH = h / MATRIX_SIZE;
    for (let my = 0; my < tilesH; my++)
      for (let mx = 0; mx < tilesW; mx++) {
        const m = this.at(r.x + mx, r.y + my);
        if (m?.type !== 'matrix') continue;
        const px = m.px ?? new Array<number>(MATRIX_SIZE * MATRIX_SIZE).fill(0);
        for (let yy = 0; yy < MATRIX_SIZE; yy++)
          for (let xx = 0; xx < MATRIX_SIZE; xx++) {
            const i = ((my * MATRIX_SIZE + yy) * w + mx * MATRIX_SIZE + xx) * 4;
            const rr = rgba[i], gg = rgba[i + 1], bb = rgba[i + 2];
            px[yy * MATRIX_SIZE + xx] = rr + gg + bb < 60 ? 0 : (rr << 16) | (gg << 8) | bb;
          }
        m.px = px;
      }
    // lamps: one pixel per tile, nearest item colour
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const l = this.at(r.x + x, r.y + y);
        if (l?.type !== 'lamp') continue;
        const i = (y * w + x) * 4;
        const item = nearestItem(rgba[i], rgba[i + 1], rgba[i + 2]);
        l.mode = 'hold';
        const cur = l.output ? Object.keys(l.output)[0] : undefined;
        if (item && cur !== item) l.output = { [item]: 1 };
        else if (!item && cur) l.output = {};
      }
  }

  /** Packed colour of a display value: 1 = the terminal's own item, others from the palette. */
  private displayRgb(b: Building, v: number): number {
    if (!v) return 0;
    const item = CHIP8_PALETTE[v & 15] ?? ((b.recipe as ItemId | null) ?? 'copper_wire');
    return itemRgb(item);
  }

  private pushDisplay(b: Building, cpu: Chip8, force = false) {
    if (!cpu.dirty && !force) return;
    // wait for the program's own frame boundary (timer read / key wait) so half-drawn frames never reach the lamps
    const stale = (this.cpuStale.get(b.id) ?? 0) + 1;
    if (!force && !cpu.syncHint && !cpu.halted && cpu.waitingKey < 0 && stale < 8) {
      this.cpuStale.set(b.id, stale);
      return;
    }
    this.cpuStale.set(b.id, 0);
    cpu.syncHint = false;
    cpu.dirty = false;
    this.cpuFrame.set(b.id, (this.cpuFrame.get(b.id) ?? 0) + 1);
    const r = this.terminalDisplayRect(b);
    const item = (b.recipe as ItemId | null) ?? 'copper_wire';
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const l = this.at(r.x + x, r.y + y);
        if (l?.type !== 'lamp') continue;
        l.mode = 'hold';
        const v = cpu.display[y * CHIP8_W + x];
        const want = v ? (CHIP8_PALETTE[v] ?? item) : null;
        const cur = l.output ? Object.keys(l.output)[0] : undefined;
        if (want && cur !== want) l.output = { [want]: 1 };
        else if (!want && cur) l.output = {};
      }
    // LED matrices in the top-left 8x4 tiles of the region show 8x8 pixel blocks each (64 pixels per tile)
    for (let my = 0; my < r.h / MATRIX_SIZE; my++)
      for (let mx = 0; mx < r.w / MATRIX_SIZE; mx++) {
        const m = this.at(r.x + mx, r.y + my);
        if (m?.type !== 'matrix') continue;
        const px = m.px ?? new Array<number>(MATRIX_SIZE * MATRIX_SIZE).fill(0);
        let changed = !m.px;
        for (let yy = 0; yy < MATRIX_SIZE; yy++)
          for (let xx = 0; xx < MATRIX_SIZE; xx++) {
            const rgb = this.displayRgb(b, cpu.display[(my * MATRIX_SIZE + yy) * CHIP8_W + mx * MATRIX_SIZE + xx]);
            const k = yy * MATRIX_SIZE + xx;
            if (px[k] !== rgb) {
              px[k] = rgb;
              changed = true;
            }
          }
        if (changed) m.px = px;
      }
  }

  private tickTerminal(b: Building, dt: number, ratio: number) {
    const cpu = this.cpu(b);
    if (!cpu) {
      b.status = 'no_recipe';
      return;
    }
    // rim switches are keys: only their transitions count, so keyboard and keypad can share the same keys
    for (const { sw, key } of this.terminalSwitches(b)) {
      const down = sw.open !== false;
      const was = this.switchWas.get(sw.id);
      if (was === undefined || was !== down) {
        this.switchWas.set(sw.id, down);
        if (was !== undefined) {
          if (down) cpu.keyDown(key);
          else cpu.keyUp(key);
        }
      }
    }
    // the board: RAM cells mirror memory both ways, crystals come from oscillators too
    this.syncCells(b, cpu, false);
    this.applyMemory(b);
    // parts first: no crystal = no clock, too little memory = the program does not fit
    const mem = this.terminalMemory(b);
    const crystals = this.terminalCrystals(b).quartz + this.terminalCrystals(b).glass;
    if (!crystals || mem.have < mem.need) {
      b.status = 'starved';
      b.missing = [...(!crystals ? (['quartz'] as ItemId[]) : []), ...(mem.have < mem.need ? (['circuit'] as ItemId[]) : [])];
      b.working = false;
      return;
    }
    b.missing = undefined;
    if (!b.run) {
      b.status = 'idle';
      return;
    }
    if (cpu.halted) {
      b.status = 'blocked';
      return;
    }
    b.status = ratio < 1 ? 'low_power' : 'ok';
    b.working = true;
    // instructions scale with installed crystals and power; timers run at 60 Hz
    b.progress = (b.progress ?? 0) + dt * this.terminalHz(b) * ratio;
    const n = Math.floor(b.progress);
    b.progress -= n;
    cpu.run(n);
    b.rateT = (b.rateT ?? 0) + dt * 60 * Math.max(0.25, ratio);
    let beep = false;
    while (b.rateT >= 1) {
      b.rateT -= 1;
      if (cpu.tickTimers()) beep = true;
    }
    if (beep && !this.cpuBeeping.has(b.id)) {
      this.cpuBeeping.add(b.id);
      this.events.push({ type: 'beep', b });
    } else if (!beep) this.cpuBeeping.delete(b.id);
    this.pushDisplay(b, cpu, !!b.trace && n > 0);
    if (n > 0) {
      this.pushTrace(b, cpu); // register lamps above the terminal follow every tick (a real CPU run to watch)
      this.syncCells(b, cpu, true);
    } // register lamps above the terminal follow every tick (a real CPU run to watch)
  }

  // ---------- Events ----------

  private makeEvent(): GameEvent | null {
    const st = this.state;
    const kinds: EventKind[] = ['wreck', 'meteorite'];
    if (this.countBuildings('solar') > 0) kinds.push('power_surge');
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const ev: GameEvent = { id: st.nextId++, kind, until: st.time + EVENT_DECIDE_SECONDS };
    if (kind === 'meteorite') {
      const spot = this.meteorSite();
      if (!spot) return null;
      const types: TerrainId[] = ['iron_ore', 'copper_ore'];
      if (st.unlockedRecipes.includes('glass')) types.push('quartz');
      if (st.unlockedRecipes.includes('water')) types.push('ice');
      ev.x = spot.x;
      ev.y = spot.y;
      ev.terrain = types[Math.floor(Math.random() * types.length)];
    }
    return ev;
  }

  /** A free 3×3 patch of ground 8–22 tiles from the core. */
  private meteorSite(): { x: number; y: number } | null {
    const st = this.state;
    const core = st.buildings[0];
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 14;
      const x: number = Math.round(core.x + 1 + Math.cos(a) * d);
      const y: number = Math.round(core.y + 1 + Math.sin(a) * d);
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!this.inBounds(x + dx, y + dy) || this.terrain(x + dx, y + dy) !== 'ground' || this.at(x + dx, y + dy)) { ok = false; break; }
      if (ok) return { x, y };
    }
    return null;
  }

  /** Can option a be taken right now? (Overclocking costs copper plates.) */
  eventOptionAvailable(ev: GameEvent, choice: 'a' | 'b'): boolean {
    if (ev.kind === 'power_surge' && choice === 'a') return (this.state.inventory.copper_plate ?? 0) >= 12;
    return true;
  }

  /** Apply the player's decision for the pending event. */
  resolveEvent(choice: 'a' | 'b') {
    const st = this.state;
    const ev = st.event;
    if (!ev) return;
    if (!this.eventOptionAvailable(ev, choice)) choice = 'b';
    st.event = null;
    switch (ev.kind) {
      case 'meteorite':
        if (choice === 'a' && ev.x !== undefined && ev.y !== undefined && ev.terrain) {
          // it lands: a fresh deposit blob appears on free ground
          const ex: number = ev.x, ey: number = ev.y;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > 2) continue;
              const x = ex + dx, y = ey + dy;
              if (!this.inBounds(x, y) || this.terrain(x, y) !== 'ground' || this.at(x, y)) continue;
              const idx = y * st.width + x;
              st.terrain[idx] = ev.terrain;
              st.ore[idx] = Math.round(METEOR_ORE[0] + Math.random() * (METEOR_ORE[1] - METEOR_ORE[0]));
            }
          this.events.push({ type: 'meteor', x: ev.x, y: ev.y });
        } else this.addInv('iron_plate', 20);
        break;
      case 'wreck':
        if (choice === 'a') {
          this.addInv('iron_plate', 24);
          this.addInv('copper_plate', 12);
        } else this.addInv('machine_part', 6);
        break;
      case 'power_surge':
        if (choice === 'a') {
          this.addInv('copper_plate', -12);
          st.boostUntil = st.time + BOOST_SECONDS;
        } else if (st.options.storms) {
          st.storm = Math.max(st.storm, 45);
          this.events.push({ type: 'storm', on: true });
        }
        break;
    }
    this.events.push({ type: 'event_done', event: ev, choice });
  }

  /** End-of-game score: fast, lean and complete factories score highest. */
  score(): { total: number; time: number; parts: number; thrift: number; contracts: number; hard: boolean } {
    const st = this.state;
    let parts = 0;
    for (const k in SHIP_PARTS) parts += Math.min(st.ship[k as ItemId] ?? 0, SHIP_PARTS[k as ItemId]!) * 50;
    const time = Math.max(0, 6000 - Math.floor(st.time / 2));
    const thrift = Math.max(0, 2500 - st.buildings.length * 5);
    const contracts = st.contractsDone * 100;
    const hard = st.options.difficulty === 'hard';
    const total = Math.round((time + parts + thrift + contracts) * (hard ? 1.5 : 1));
    return { total, time, parts, thrift, contracts, hard };
  }

  acceptContract(c: Contract) {
    c.accepted = true;
    c.delivered = 0;
    c.deadline = this.state.time + (c.deadline - this.state.time); // timer starts on accept (deadline already includes offer window)
  }

  declineContract(c: Contract) {
    const i = this.state.contracts.indexOf(c);
    if (i >= 0) this.state.contracts.splice(i, 1);
  }

  private moveItems(b: Building, dt: number, deliver: (item: ItemId) => boolean) {
    const items = b.items!;
    if (!items.length) {
      b.stuck = 0;
      b.status = 'ok';
      return;
    }
    const step = BELT_SPEED * this.factor('belt') * dt;
    let blocked = false;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const ahead = i < items.length - 1 ? items[i + 1].pos - BELT_SPACING : Infinity;
      let target = Math.min(it.pos + step, ahead);
      if (target >= 1) {
        if (deliver(it.item)) {
          items.splice(i, 1);
          continue;
        }
        target = 1;
        if (i === items.length - 1) blocked = true;
      }
      it.pos = Math.max(it.pos, target);
    }
    b.stuck = blocked ? (b.stuck ?? 0) + dt : 0;
    b.status = (b.stuck ?? 0) > JAM_SECONDS ? 'jammed' : 'ok';
  }

  private tickBelt(b: Building, dt: number) {
    const nx = b.x + DX[b.dir], ny = b.y + DY[b.dir];
    const next = this.at(nx, ny);
    let delivered = 0;
    this.moveItems(b, dt, (item) => {
      const ok = !!next && this.accept(next, item, b.dir);
      if (ok) delivered++;
      return ok;
    });
    if (b.status === 'jammed' && (!next || !this.canReceiveFrom(next, b.dir))) b.status = 'dead_end';
    // throughput is only measured where a belt hands over to a machine, depot or the core (overlay tag)
    if (next && next.type !== 'conveyor') this.countRate(b, dt, delivered);
    else if (b.rate !== undefined) {
      b.rate = undefined;
      b.rateT = undefined;
      b.produced = undefined;
    }
  }

  /** Items per minute a belt can carry at the current upgrade level. */
  beltCapacity(): number {
    return ((BELT_SPEED * this.factor('belt')) / BELT_SPACING) * 60;
  }

  private tickTunnel(b: Building, dt: number) {
    const pair = this.byId(b.pair);
    if (!pair) {
      b.status = 'unpaired';
      return;
    }
    if (b.exit) {
      const nx = b.x + DX[b.dir], ny = b.y + DY[b.dir];
      const next = this.at(nx, ny);
      this.moveItems(b, dt, (item) => !!next && this.accept(next, item, b.dir));
      if (b.status === 'jammed' && (!next || !this.canReceiveFrom(next, b.dir))) b.status = 'dead_end';
    } else {
      this.moveItems(b, dt, (item) => this.accept(pair, item, b.dir, true));
    }
  }

  private countRate(b: Building, dt: number, produced: number) {
    b.rateT = (b.rateT ?? 0) + dt;
    b.produced = (b.produced ?? 0) + produced;
    if (b.rateT >= RATE_WINDOW) {
      b.rate = (b.produced / b.rateT) * 60;
      b.rateT = 0;
      b.produced = 0;
    }
  }

  private tickMiner(b: Building, dt: number, ratio: number) {
    const item = b.mineItem!;
    // push whatever is buffered (own ore or passed-through items)
    for (const k in b.output) {
      const n = b.output[k as ItemId] ?? 0;
      if (n > 0) {
        if (this.pushOut(b, k as ItemId)) b.output[k as ItemId] = n - 1;
        break;
      }
    }
    const total = Object.values(b.output!).reduce((a, c) => a + (c ?? 0), 0);
    let produced = 0;
    if (total >= 2) {
      b.working = false;
      b.status = 'blocked';
    } else {
      const idx = b.y * this.state.width + b.x;
      if ((this.state.ore[idx] ?? 0) <= 0) {
        b.working = false;
        b.status = 'depleted';
      } else {
        b.working = true;
        b.status = ratio < 1 ? 'low_power' : 'ok';
        b.progress = (b.progress ?? 0) + (dt * ratio * this.factor('miner')) / MINE_SECONDS;
        if (b.progress >= 1) {
          b.progress -= 1;
          b.output![item] = (b.output![item] ?? 0) + 1;
          produced = 1;
          // deposit yield research: only a fraction of the mined units is taken from the ground
          if (!this.state.options.infiniteOre && Math.random() < 1 / this.factor('yield')) this.state.ore[idx]--;
          this.bump(this.state.stats.produced, item, 1);
          if (this.state.ore[idx] <= 0) {
            this.state.terrain[idx] = 'ground';
            this.events.push({ type: 'depleted', x: b.x, y: b.y });
          }
        }
      }
    }
    this.countRate(b, dt, produced);
  }

  private tickMachine(b: Building, dt: number, ratio: number) {
    b.working = false;
    let produced = 0;
    for (const k in b.output) {
      const n = b.output[k as ItemId] ?? 0;
      if (n > 0 && this.pushOut(b, k as ItemId)) b.output[k as ItemId] = n - 1;
    }
    if (!b.recipe) {
      b.status = 'no_recipe';
      b.missing = undefined;
      this.countRate(b, dt, 0);
      return;
    }
    const r: RecipeDef = RECIPE_BY_ID[b.recipe];
    const outN = b.output![r.output] ?? 0;
    if (outN >= OUTPUT_CAP) {
      b.status = 'blocked';
      this.countRate(b, dt, 0);
      return;
    }
    if (!b.progress) {
      const missing: ItemId[] = [];
      for (const k in r.inputs) if ((b.input![k as ItemId] ?? 0) < r.inputs[k as ItemId]!) missing.push(k as ItemId);
      if (missing.length) {
        b.status = 'starved';
        b.missing = missing;
        this.countRate(b, dt, 0);
        return;
      }
      for (const k in r.inputs) b.input![k as ItemId]! -= r.inputs[k as ItemId]!;
      b.progress = 1e-6;
    }
    b.working = true;
    b.missing = undefined;
    b.status = ratio < 1 ? 'low_power' : 'ok';
    const fast = b.type === 'printer' || b.type === 'fabricator' ? this.factor('printer') : 1;
    b.progress += (dt * ratio * this.factor('machine') * fast) / r.seconds;
    if (b.progress >= 1) {
      b.progress = 0;
      b.output![r.output] = outN + r.outputCount;
      produced = r.outputCount;
      this.bump(this.state.stats.produced, r.output, r.outputCount);
      this.events.push({ type: 'craft', b, item: r.output });
    }
    this.countRate(b, dt, produced);
  }

  private tickStorage(b: Building) {
    const store = b.store!;
    b.status = 'ok';
    // With a filter only that item leaves. Otherwise try every stored item type in turn, so one
    // item the target refuses never blocks the others.
    const keys = (b.recipe ? [b.recipe] : Object.keys(store)) as ItemId[];
    if (!keys.length) return;
    const start = b.rr ?? 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[(start + i) % keys.length];
      const n = store[k] ?? 0;
      if (n <= 0) continue;
      if (this.pushOut(b, k)) {
        if (n - 1 <= 0) delete store[k];
        else store[k] = n - 1;
        b.rr = (start + i + 1) % Math.max(1, keys.length);
        return;
      }
    }
    if (Object.values(store).reduce((a, c) => a + (c ?? 0), 0) >= this.storageCap()) b.status = 'blocked';
  }

  private tickSplitter(b: Building) {
    b.status = 'ok';
    if (!b.output) return;
    const key = Object.keys(b.output)[0] as ItemId | undefined;
    if (!key) return;
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
    b.status = 'blocked';
  }

  private pushDir(b: Building, item: ItemId, d: Dir): boolean {
    const t = this.at(b.x + DX[d], b.y + DY[d]);
    return !!t && t !== b && this.accept(t, item, d);
  }

  private tickLogic(b: Building) {
    const left = ((b.dir + 3) & 3) as Dir, right = ((b.dir + 1) & 3) as Dir;
    if (b.type === 'mixer') {
      const [na, nb] = MIXER_RATIOS[b.ratio ?? 0];
      const pattern: ('L' | 'R')[] = [...Array(na).fill('L'), ...Array(nb).fill('R')];
      const phase = (b.rr ?? 0) % pattern.length;
      const side = pattern[phase];
      const buf = side === 'L' ? b.bufL! : b.bufR!;
      if (!buf.length) {
        b.status = (b.bufL!.length || b.bufR!.length) ? 'waiting' : 'ok';
        return;
      }
      if (this.pushDir(b, buf[0], b.dir)) {
        buf.shift();
        b.rr = (phase + 1) % pattern.length;
        b.status = 'ok';
      } else b.status = 'blocked';
      return;
    }
    const key = Object.keys(b.output ?? {})[0] as ItemId | undefined;
    if (b.type === 'lamp') {
      // hold: the pixel keeps its item and stays lit; pass: it forwards the item and is lit while one is inside
      b.status = 'ok';
      if ((b.timer ?? 0) > 0) b.timer = Math.max(0, b.timer! - 1 / 30);
      if (key && b.mode === 'pass' && this.pushDir(b, key, b.dir)) {
        b.output = {};
        b.mineItem = key;
        b.timer = 0.3; // afterglow
      }
      return;
    }
    if (b.type === 'terminal' || ARITH.has(b.type)) return;
    if (b.type === 'switch') {
      if ((b.timer ?? 0) > 0) {
        b.timer = b.timer! - 1 / 30;
        if (b.timer <= 0) {
          b.timer = 0;
          b.open = false;
        }
      }
      b.status = b.open === false ? 'closed' : 'ok';
      if (key && b.open !== false && this.pushDir(b, key, b.dir)) {
        b.output = {};
        if (b.mode === 'pulse' && !(b.timer ?? 0)) b.open = false; // one item per tap
      }
      return;
    }
    if (b.type === 'valve') {
      const limit = b.threshold ?? 50;
      const have = b.recipe ? (this.state.inventory[b.recipe as ItemId] ?? 0) : 0;
      b.open = !b.recipe || have < limit;
      if (!key) {
        b.status = b.open ? 'ok' : 'closed';
        return;
      }
      if (!b.open) {
        b.status = 'closed';
        return;
      }
      if (this.pushDir(b, key, b.dir)) b.output = {};
      b.status = 'ok';
      return;
    }
    if (!key) {
      b.status = 'ok';
      return;
    }
    if (b.type === 'sorter') {
      const d = b.recipe && key === b.recipe ? left : b.dir;
      if (this.pushDir(b, key, d)) {
        b.output = {};
        b.status = 'ok';
      } else b.status = 'blocked';
      return;
    }
    // overflow: forward first, then left, then right
    for (const d of [b.dir, left, right] as Dir[]) {
      if (this.pushDir(b, key, d)) {
        b.output = {};
        b.status = 'ok';
        return;
      }
    }
    b.status = 'blocked';
  }

  // ---------- Blueprints ----------

  /** Copy every building whose top-left lies inside the tile rectangle (core excluded). */
  capture(x0: number, y0: number, x1: number, y1: number, name = ''): Blueprint | null {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const items: BlueprintItem[] = [];
    for (const b of this.state.buildings) {
      if (b.type === 'core') continue;
      const s = BUILDINGS[b.type].size;
      if (b.x < minX || b.y < minY || b.x + s - 1 > maxX || b.y + s - 1 > maxY) continue;
      items.push({ type: b.type, dx: b.x - minX, dy: b.y - minY, dir: b.dir, recipe: b.recipe ?? null, threshold: b.threshold, ratio: b.ratio, mode: b.mode, open: b.type === 'switch' ? b.open : undefined, value: ARITH.has(b.type) ? b.value : undefined });
    }
    if (!items.length) return null;
    // normalise to the bounding box of the copied buildings
    const bx = Math.min(...items.map((i) => i.dx)), by = Math.min(...items.map((i) => i.dy));
    for (const i of items) {
      i.dx -= bx;
      i.dy -= by;
    }
    const w = Math.max(...items.map((i) => i.dx + BUILDINGS[i.type].size));
    const h = Math.max(...items.map((i) => i.dy + BUILDINGS[i.type].size));
    return { name, w, h, items };
  }

  static rotateBlueprint(bp: Blueprint): Blueprint {
    return {
      name: bp.name,
      w: bp.h,
      h: bp.w,
      items: bp.items.map((i) => {
        const s = BUILDINGS[i.type].size;
        return { ...i, dx: bp.h - i.dy - s, dy: i.dx, dir: (BUILDINGS[i.type].rotatable ? ((i.dir + 1) & 3) : 0) as Dir };
      }),
    };
  }

  static blueprintCost(bp: Blueprint): Partial<Record<ItemId, number>> {
    const cost: Partial<Record<ItemId, number>> = {};
    for (const i of bp.items) for (const k in BUILDINGS[i.type].cost) cost[k as ItemId] = (cost[k as ItemId] ?? 0) + BUILDINGS[i.type].cost[k as ItemId]!;
    return cost;
  }

  /** Place a blueprint with its top-left at (x,y). Returns how many buildings were placed / skipped. */
  paste(bp: Blueprint, x: number, y: number): { placed: Building[]; skipped: number; reason: string | null } {
    const placed: Building[] = [];
    let skipped = 0;
    let reason: string | null = null;
    // belts first so machines find their outputs, then everything else in reading order
    const order = [...bp.items].sort((a, b) => (a.type === 'conveyor' ? 0 : 1) - (b.type === 'conveyor' ? 0 : 1));
    for (const i of order) {
      const err = this.placementError(i.type, x + i.dx, y + i.dy);
      if (err) {
        skipped++;
        if (err === 'err_cost' || !reason) reason = err;
        continue;
      }
      const b = this.place(i.type, x + i.dx, y + i.dy, i.dir);
      if (!b) {
        skipped++;
        continue;
      }
      if (i.recipe !== undefined) b.recipe = i.recipe ?? null;
      if (i.threshold !== undefined) b.threshold = i.threshold;
      if (i.ratio !== undefined) b.ratio = i.ratio;
      if (i.mode !== undefined) b.mode = i.mode;
      if (i.open !== undefined) b.open = i.open;
      if (i.value !== undefined && (b.type === 'multiplier' || b.type === 'divider')) b.value = i.value;
      placed.push(b);
    }
    return { placed, skipped, reason };
  }

  /** Can the whole blueprint be placed here? Used for the ghost colouring. */
  pasteErrors(bp: Blueprint, x: number, y: number): Set<number> {
    const bad = new Set<number>();
    bp.items.forEach((i, idx) => {
      const err = this.placementError(i.type, x + i.dx, y + i.dy);
      if (err && err !== 'err_cost') bad.add(idx);
    });
    return bad;
  }

  // ---------- Diagnostics ----------

  /** Everything that currently keeps a chain from running. */
  analyze(): Problem[] {
    const out: Problem[] = [];
    for (const b of this.state.buildings) {
      const s = b.status;
      if (!s || s === 'ok' || s === 'idle' || s === 'closed' || s === 'waiting') continue;
      if (s === 'low_power') continue; // reported globally
      if (s === 'blocked' && BUILDINGS[b.type].kind === 'logic') continue; // a full belt behind a module is normal
      if (s === 'blocked' && (b.type === 'miner' || BUILDINGS[b.type].kind === 'machine')) {
        // only report blocked machines that have nowhere to output; a full buffer on a busy belt is normal
        if (this.hasOutputTarget(b)) continue;
      }
      out.push({ building: b, status: s, missing: b.missing });
    }
    return out;
  }

  /** Follow belts from a building's output until they reach something else. Returns tile centres and the target. */
  traceFlow(b: Building): { path: { x: number; y: number }[]; target: Building | null } {
    const path: { x: number; y: number }[] = [];
    let target: Building | null = null;
    const seen = new Set<number>();
    let cur: Building | null = null;
    for (const t of this.frontTiles(b)) {
      const n = this.at(t.x, t.y);
      if (n && n !== b && this.canReceiveFrom(n, b.dir)) {
        cur = n;
        break;
      }
    }
    let guard = 0;
    while (cur && guard++ < 400 && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === 'conveyor' || cur.type === 'tunnel') {
        path.push({ x: cur.x + 0.5, y: cur.y + 0.5 });
        if (cur.type === 'tunnel' && !cur.exit) {
          const p = this.byId(cur.pair);
          if (!p) break;
          cur = p;
          path.push({ x: cur.x + 0.5, y: cur.y + 0.5 });
          seen.add(cur.id);
        }
        const next = this.at(cur.x + DX[cur.dir], cur.y + DY[cur.dir]);
        if (!next || !this.canReceiveFrom(next, cur.dir)) break;
        cur = next;
      } else {
        target = cur;
        break;
      }
    }
    return { path, target };
  }

  /** 0..1 how much of the ship has been assembled. */
  shipProgress(): number {
    let n = 0;
    for (const k in SHIP_PARTS) n += Math.min(SHIP_PARTS[k as ItemId]!, this.state.ship[k as ItemId] ?? 0);
    return n / SHIP_TOTAL;
  }

  // ---------- Missions ----------

  countBuildings(type: BuildingId): number {
    let n = 0;
    for (const b of this.state.buildings) if (b.type === type) n++;
    return n;
  }

  currentMission() {
    return MISSIONS[this.state.missionIndex] ?? null;
  }

  private checkMission() {
    const m = this.currentMission();
    if (!m || this.state.launched) return;
    for (const k in m.deliver) {
      const have = Math.max(this.state.delivered[k as ItemId] ?? 0, this.state.ship[k as ItemId] ?? 0);
      if (have < m.deliver[k as ItemId]!) return;
    }
    if (m.build) for (const k in m.build) if (this.countBuildings(k as BuildingId) < m.build[k as BuildingId]!) return;
    for (const u of m.unlocks) if (!this.state.unlockedBuildings.includes(u)) this.state.unlockedBuildings.push(u);
    for (const r of m.unlockRecipes) if (!this.state.unlockedRecipes.includes(r)) this.state.unlockedRecipes.push(r);
    if (m.reward) for (const k in m.reward) this.addInv(k as ItemId, m.reward[k as ItemId]!);
    this.state.delivered = {};
    this.state.missionIndex++;
    this.events.push({ type: 'mission', index: this.state.missionIndex - 1 });
    if (this.state.missionIndex >= MISSIONS.length) {
      this.state.launched = true;
      this.events.push({ type: 'launch' });
    }
  }
}
