import {
  BELT_SPACING,
  BELT_SPEED,
  BUFFER_CAP,
  BUILDINGS,

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
  CHALLENGE_BY_ID,
  flightMission,
  PROJECTS,
  PROJECT_BY_ID,
  AUTOMATION_MIN_MISSION,
  AUTOMATION_SHARE,
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
  RECIPES,
  BUILD_ORDER,
  printSeconds,
} from './data';
import type { MissionDef, Drone, PrintJob, Robot, Blueprint, BlueprintItem, Building, BuildingId, Contract, Dir, EventKind, GameEvent, GameState, ItemId, RecipeDef, Status, TerrainId, UpgradeId } from './types';
import { DX, DY } from './types';
import { BOARD_PARTS, CHIP8_PALETTE, CHIP_ROM_BYTES, CRYSTAL_HZ, BATTERY_CAP, BATTERY_RATE, PICKER_RATE, itemSpacing, RADIO_RANGE, CORE_REACH, CORE_DRONES, DRONE_SPEED, DRONE_DELAY, KITPORT_RATE, KIT_TRANSIT_TIMEOUT, isKit, kitOf, kitId, HALL_SLOT_CAP, HALL_SIZE, isHall, PLANT_FUEL, WIND_STORM_FACTOR, ITEM_ORDER, CRATE_SIZE, isCrate, crateOf, crateId, ROBOT_SPEED, STORM_ROBOT_FACTOR, WEAR_SECONDS, WORN_SPEED, WEAR_MIN_MISSION, REPAIR_COST, QUAKE_WEAR, ROBOT_DRAIN, ROBOT_DRAIN_WORK, ROBOT_LOW, ROBOT_CHARGE_RATE, ROBOT_LIMP, ROBOT_CAP, ROBOT_RATE, DOCK_CAP, DEPOT_ROBOTS_MAX, EXEC_PROGRAMS, ITEMS, MATRIX_SIZE, RADIO_QUEUE, RADIO_RATE, SCREEN_BASE_HZ, TIMER_OPEN, TIMER_PERIODS, SCREEN_BUDGET_MAX, SCREEN_MAX_PX, SCREEN_PX_PER_CELL, SCREEN_PX_PER_ITEM, SCREEN_PX_PER_LANE_TICK, SCREEN_REGION, SCREEN_SAMPLE_RATE, SCREEN_SCAN_STEP, SCREEN_TINT, itemRgb, matrixSize, ORE_PER_TILE, OSCILLATOR_CRYSTALS, TERMINAL_HZ_MAX, REGISTER_MAX, SWITCH_PULSE_SECONDS, TERMINAL_BANK_BYTES, TERMINAL_CRYSTALS, TERMINAL_DISPLAY, TERMINAL_RAM_BANKS, TERMINAL_TRACE, TERMINAL_TRACE_HZ } from './data';
import { Chip8, assemble, CHIP8_W, CHIP8_H, HIRES_H, HIRES_W } from './chip8';
import { CHIP8_PROGRAMS } from './chip8programs';

export type SimEvent =
  | { type: 'mission'; index: number }
  | { type: 'launch' }
  | { type: 'delivered'; item: ItemId; count: number }
  | { type: 'craft'; b: Building; item: ItemId }
  | { type: 'depleted'; x: number; y: number }
  | { type: 'contract_offer'; contract: Contract }
  | { type: 'repaired'; b: Building }
  | { type: 'flight'; n: number }
  | { type: 'challenge_done'; seconds: number }
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

  /** Research project state: done, open (can be paid), waiting for a mission or another project. */
  projectState(id: string): 'done' | 'open' | 'mission' | 'requires' {
    const st = this.state;
    const p = PROJECT_BY_ID[id];
    if (st.projects?.includes(id) || p.unlocks.every((u) => st.unlockedBuildings.includes(u))) return 'done';
    if (!st.options.allUnlocked && st.options.mode !== 'playground' && st.missionIndex < p.after) return 'mission';
    if (p.requires?.some((r) => this.projectState(r) !== 'done')) return 'requires';
    return 'open';
  }

  canResearch(id: string): boolean {
    if (this.projectState(id) !== 'open') return false;
    const cost = PROJECT_BY_ID[id].cost;
    for (const k in cost) if ((this.state.inventory[k as ItemId] ?? 0) < cost[k as ItemId]!) return false;
    return true;
  }

  research(id: string): boolean {
    if (!this.canResearch(id)) return false;
    const p = PROJECT_BY_ID[id];
    for (const k in p.cost) this.addInv(k as ItemId, -p.cost[k as ItemId]!);
    (this.state.projects ??= []).push(id);
    for (const u of p.unlocks) if (!this.state.unlockedBuildings.includes(u)) this.state.unlockedBuildings.push(u);
    return true;
  }

  /** Projects a mission opens (for the mission-complete note). */
  projectsOpenedBy(missionIndex: number): string[] {
    return PROJECTS.filter((p) => p.after === missionIndex + 1).map((p) => p.id);
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
      b.acc = (b.acc ?? 0) + 1;
      return;
    }
    const k = this.lampItem(b);
    if (k) this.addInv(k, 1);
    b.output = {};
  }

  toggleSwitch(b: Building) {
    if (b.mode === 'pulse') {
      // one item per tap: a tap opens the switch for a moment (a key press); it also closes after passing an item
      b.open = true;
      b.timer = Math.max(b.timer ?? 0, 0.35);
      return;
    }
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
    state.kits ??= {};
    state.printQueue ??= [];
    this.syncUnlocks();
  }

  /** Older saves: grant what the finished missions (or an all-unlocked game) unlock today, e.g. recipes added later. */
  private syncUnlocks() {
    const st = this.state;
    if (!st.unlockedBuildings || !st.unlockedRecipes) return;
    const add = (list: string[], ids: string[]) => {
      for (const id of ids) if (!list.includes(id)) list.push(id);
    };
    if (st.options.allUnlocked || st.options.mode === 'playground') {
      add(st.unlockedRecipes, RECIPES.map((r) => r.id));
      add(st.unlockedBuildings, BUILD_ORDER);
      return;
    }
    for (let i = 0; i < Math.min(st.missionIndex ?? 0, MISSIONS.length); i++) {
      add(st.unlockedBuildings, MISSIONS[i].unlocks);
      add(st.unlockedRecipes, MISSIONS[i].unlockRecipes);
    }
    for (const id of st.projects ?? []) if (PROJECT_BY_ID[id]) add(st.unlockedBuildings, PROJECT_BY_ID[id].unlocks);
  }

  /** The playground has no ship to build: the core stays in the save as the base power source but takes no tiles. */
  get coreHidden(): boolean {
    return this.state.options.mode === 'playground';
  }

  rebuildGrid() {
    this.grid.fill(null);
    for (const b of this.state.buildings) {
      if (b.type === 'core' && this.coreHidden) continue;
      this.index(b);
    }
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

  /** A kit in stock, or (with auto print on) the material to print one. */
  canBuild(type: BuildingId): boolean {
    if ((this.state.kits?.[type] ?? 0) > 0) return true;
    return this.state.autoPrint !== false && this.canAfford(type);
  }

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
    if (!this.creative && !this.canBuild(type)) return this.state.autoPrint === false ? 'err_no_kit' : 'err_cost';
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
    // a kit from the stock builds at once; otherwise the material goes into a print job and the building waits as a site
    let site = false, deliver = false;
    if (!this.creative) {
      const kits = (this.state.kits ??= {});
      const far = !this.inReach(x, y, def.size);
      if ((kits[type] ?? 0) > 0) {
        kits[type] = kits[type]! - 1;
        if (far) site = deliver = true; // the kit is ready but has to travel
      } else {
        this.pay(type);
        const t = printSeconds(type);
        this.printQueue().push({ type, left: t, total: t, site: true });
        site = true;
      }
    }
    const b: Building = { id: this.state.nextId++, type, x, y, dir: def.rotatable ? dir : 0 };
    if (site) b.site = true;
    if (deliver) {
      b.deliver = true;
      b.deliverAt = this.state.time;
    }
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
    if (type === 'storage' || isHall(type)) {
      b.store = {};
      b.recipe = null;
      if (isHall(type)) b.mode = 'hold';
    }
    if (PLANT_FUEL[type]) {
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
      if (type === 'dock') {
        b.bufL = [];
        b.mode = 'load';
      }
      if (type === 'kitport') b.recipe = null;
      if (type === 'depot') {
        b.threshold = 2;
        b.value = 0; // robots in the depot (delivered)
      }
      if (type === 'stacker') {
        b.bufL = [];
        b.mode = 'pack';
      }
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
    if (b.type === 'depot' && this.state.robots) {
      for (const r of this.state.robots) if (r.depot === b.id) for (const it of r.items) this.addInv(it, 1);
      this.state.robots = this.state.robots.filter((r) => r.depot !== b.id);
      if (!this.creative && b.value) this.addInv('robot', b.value); // the robots go back to the stock
    }
    // a finished building goes back into the kit stock; a site cancels its print job (the material comes back)
    if (!this.creative) {
      if (b.site && b.deliver) {
        // a ready kit goes back to stock, unless it is on its way (a drone brings it home, an item arrives somewhere)
        if (!b.enroute) this.state.kits![b.type] = (this.state.kits![b.type] ?? 0) + 1;
      } else if (b.site) this.cancelSiteJob(b.type);
      else this.state.kits![b.type] = (this.state.kits![b.type] ?? 0) + 1;
    }
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
    // (a construction site answers like the finished building so belts can be planned to it; accept() still refuses items)
    switch (BUILDINGS[b.type].kind) {
      case 'core':
        return true;
      case 'road':
        return false;
      case 'conveyor':
        return ((from + 2) & 3) !== b.dir;
      case 'tunnel':
        return !b.exit && from === b.dir && b.pair != null;
      case 'machine':
      case 'storage':
        return (isHall(b.type) && b.mode !== 'pass') || !this.isOutputSide(b, from);
      case 'power':
        return !!PLANT_FUEL[b.type];
      case 'splitter':
        if (b.type === 'merger') return ((from + 2) & 3) !== b.dir; // from behind or either side
        return from === b.dir;
      case 'miner':
        return from === b.dir;
      case 'logic':
        if (b.type === 'mixer') return from === ((b.dir + 1) & 3) || from === ((b.dir + 3) & 3);
        if (b.type === 'lamp') return ((from + 2) & 3) !== b.dir; // a pixel takes input from every side except its front
        if (b.type === 'terminal') return true; // parts are installed from any side
        if (ARITH.has(b.type)) return from === b.dir || from === ((b.dir + 1) & 3) || from === ((b.dir + 3) & 3); // back = main input, sides = second operand / signal
        if (b.type === 'switch' || b.type === 'timer') return from !== ((b.dir + 2) & 3); // behind = items to gate, sides = control pulses
        if (b.type === 'sensor') return from !== ((b.dir + 2) & 3); // takes the belt from behind or from a side, like a corner
        if (b.type === 'picker' || b.type === 'kitport' || b.type === 'mast') return false; // they fetch their items themselves
        if (b.type === 'dock') return b.mode !== 'unload'; // a loading dock is filled from any side
        if (b.type === 'depot') return true; // robots are delivered from any side
        return from === b.dir;
    }
  }

  /** Try to give an item to building b arriving from direction `from` (direction of travel). */
  accept(b: Building, item: ItemId, from: Dir, viaTunnel = false): boolean {
    if (b.site) {
      if (b.deliver && item === kitId(b.type)) {
        this.finishSite(b);
        return true;
      }
      return false;
    }
    const def = BUILDINGS[b.type];
    if (isKit(item)) {
      if (def.kind === 'core') {
        const k = kitOf(item)!;
        this.state.kits![k] = (this.state.kits![k] ?? 0) + 1;
        return true;
      }
      if (def.kind === 'machine' || def.kind === 'power' || b.type === 'terminal' || b.type === 'oscillator' || b.type === 'depot') return false;
    }
    if (isCrate(item) && (def.kind === 'core' || def.kind === 'machine' || def.kind === 'power' || b.type === 'terminal' || b.type === 'oscillator')) return false; // crates must be unpacked first
    switch (def.kind) {
      case 'core': {
        const need = SHIP_PARTS[item];
        if (need && (this.state.ship[item] ?? 0) < need) this.state.ship[item] = (this.state.ship[item] ?? 0) + 1; // installed on the ship
        else this.addInv(item, 1);
        this.state.delivered[item] = (this.state.delivered[item] ?? 0) + 1;
        if (this.currentMission()?.rate?.[item]) ((this.state.rateLog ??= {})[item] ??= []).push(this.state.time);
        this.bump(this.state.stats.delivered, item, 1);
        for (const c of this.state.contracts) {
          if (!c.accepted || c.item !== item) continue;
          if (!c.kind || c.kind === 'amount') {
            if (c.delivered < c.amount) c.delivered++;
          } else if (c.kind === 'steady') (c.log ??= []).push(this.state.time);
          else if (c.kind === 'batch') c.winCount = (c.winCount ?? 0) + 1;
        }
        this.events.push({ type: 'delivered', item, count: 1 });
        return true;
      }
      case 'conveyor': {
        if (((from + 2) & 3) === b.dir) return false; // never head-on
        const items = b.items!;
        const entry = from === b.dir ? 0 : 0.5; // from behind -> start, from the side -> merge in the middle
        const sp = itemSpacing(item);
        for (const it of items) if (Math.abs(it.pos - entry) < (sp + itemSpacing(it.item)) / 2) return false;
        items.push({ item, pos: entry });
        items.sort((a, c) => a.pos - c.pos);
        return true;
      }
      case 'tunnel': {
        if (b.exit) {
          if (!viaTunnel) return false;
        } else if (from !== b.dir || b.pair == null) return false;
        const items = b.items!;
        for (const it of items) if (it.pos < (itemSpacing(item) + itemSpacing(it.item)) / 2) return false;
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
        const fuel = PLANT_FUEL[b.type];
        if (!fuel || item !== fuel.item) return false;
        const cur = b.input![item] ?? 0;
        if (cur >= BUFFER_CAP) return false;
        b.input![item] = cur + 1;
        return true;
      }
      case 'storage': {
        if (isHall(b.type)) {
          // a warehouse fills shelf after shelf; each slot holds one kind of item
          if (b.mode === 'pass' && this.isOutputSide(b, from)) return false;
          const n = b.store![item] ?? 0;
          const used = this.hallUsed(b) - Math.ceil(n / HALL_SLOT_CAP) + Math.ceil((n + 1) / HALL_SLOT_CAP);
          if (used > this.hallSlots(b)) return false;
          b.store![item] = n + 1;
          return true;
        }
        if (this.isOutputSide(b, from)) return false;
        const total = Object.values(b.store!).reduce((a, c) => a + (c ?? 0), 0);
        if (total >= this.storageCap()) return false;
        b.store![item] = (b.store![item] ?? 0) + 1;
        return true;
      }
      case 'splitter': {
        if (b.type === 'merger') {
          // one waiting item per input side, whatever it is
          const slot = from === b.dir ? 0 : from === ((b.dir + 1) & 3) ? 1 : from === ((b.dir + 3) & 3) ? 2 : -1;
          if (slot < 0) return false;
          const q = (b.merge ??= [null, null, null]);
          if (q[slot]) return false;
          q[slot] = item;
          return true;
        }
        if (from !== b.dir) return false;
        if (b.output && Object.keys(b.output).length) return false;
        b.output = { [item]: 1 };
        return true;
      }
      case 'road':
        return false;
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
          const s = matrixSize(b);
          const px = b.px ?? (b.px = new Array<number>(s * s).fill(0));
          const i = px.indexOf(0);
          if (i < 0) return false;
          px[i] = itemRgb(item);
          b.acc = (b.acc ?? 0) + 1; // picture version (renderer cache)
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
        if (b.type === 'screen') {
          // phosphor: every delivered item buys a million pixel updates; its colour tints the picture
          if ((b.budget ?? 0) >= SCREEN_BUDGET_MAX) return false;
          b.budget = Math.min(SCREEN_BUDGET_MAX, (b.budget ?? 0) + SCREEN_PX_PER_ITEM);
          b.recipe = item;
          return true;
        }
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
        if (b.type === 'picker' || b.type === 'kitport' || b.type === 'mast') return false;
        if (b.type === 'depot') {
          // the fleet is built elsewhere: every delivered robot joins the depot
          if (item !== 'robot' || (b.value ?? 0) >= DEPOT_ROBOTS_MAX) return false;
          b.value = (b.value ?? 0) + 1;
          return true;
        }
        if (b.type === 'stacker') {
          if (from !== b.dir) return false;
          const buf = b.bufL!;
          if (b.mode === 'unpack') {
            const inner = crateOf(item);
            if (!inner || buf.length) return false;
            for (let k = 0; k < CRATE_SIZE; k++) buf.push(inner);
            b.acc = (b.acc ?? 0) + 1;
            return true;
          }
          if (isCrate(item) || buf.length >= CRATE_SIZE || (buf.length && buf[0] !== item)) return false;
          buf.push(item);
          return true;
        }
        if (b.type === 'dock') {
          if (b.mode === 'unload' || b.bufL!.length >= DOCK_CAP) return false;
          if (b.recipe && b.recipe !== item) return false;
          b.bufL!.push(item);
          return true;
        }
        if (b.type === 'timer' && from !== b.dir && from !== ((b.dir + 2) & 3)) {
          // control pulse from a side: restarts the cycle and opens the timer (the pulse item is consumed)
          this.signal(b, from);
          return true;
        }
        if (b.type === 'radio') {
          if (b.mode === 'rx' || from !== b.dir) return false;
          const q = this.radioQueue(b.threshold ?? 1);
          if (q.length >= RADIO_QUEUE) return false;
          q.push({ item, tx: b.id });
          b.acc = (b.acc ?? 0) + 1;
          b.working = true;
          b.timer = 0.3;
          return true;
        }
        if (b.type === 'lamp') {
          if (((from + 2) & 3) === b.dir) return false;
          if (b.recipe && b.recipe !== item) return false; // optional colour filter
        } else if (b.type === 'sensor') {
          if (((from + 2) & 3) === b.dir) return false; // anything but head-on
        } else if (from !== b.dir) return false;
        if ((b.type === 'switch' || b.type === 'timer') && b.open === false) return false;
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
      if (b.site) continue;
      const p = BUILDINGS[b.type].power;
      if (p < 0) {
        const fuel = PLANT_FUEL[b.type];
        if (fuel) {
          if (b.fuelSeconds! <= 0 && (b.input![fuel.item] ?? 0) > 0) {
            b.input![fuel.item]!--;
            b.fuelSeconds! += fuel.seconds;
          }
          if (b.fuelSeconds! > 0) supply += -p * this.factor('power');
          b.status = b.fuelSeconds! > 0 ? 'ok' : 'no_fuel';
          b.working = b.fuelSeconds! > 0;
        } else if (b.type === 'wind') {
          supply += -p * this.factor('power') * this.windFactor();
          b.working = true;
        } else if (b.type === 'solar') supply += -p * this.factor('power') * (st.storm > 0 ? STORM_SOLAR_FACTOR : 1);
        else supply += -p;
      } else if (p > 0 && !(b.type === 'miner' && b.status === 'depleted')) demand += p;
    }
    if ((st.boostUntil ?? 0) > st.time) supply *= BOOST_FACTOR; // overclocked after a power surge event
    // batteries: charge from surplus, deliver up to their rate when the grid falls short
    let surplus = supply - demand;
    for (const b of st.buildings) {
      if (b.type !== 'battery' || b.site) continue;
      const charge = b.value ?? 0;
      if (surplus > 0 && charge < BATTERY_CAP) {
        const take = Math.min(surplus, BATTERY_RATE);
        b.value = Math.min(BATTERY_CAP, charge + take * dt);
        surplus -= take;
        b.status = 'ok';
        b.working = true;
      } else if (surplus < 0 && charge > 0) {
        const give = Math.min(-surplus, BATTERY_RATE, charge / dt);
        b.value = Math.max(0, charge - give * dt);
        supply += give;
        surplus += give;
        b.status = 'ok';
        b.working = true;
      } else {
        b.status = charge > 0 ? 'ok' : 'idle';
        b.working = false;
      }
    }
    st.powerSupply = Math.round(supply);
    st.powerDemand = demand;
    const ratio = demand <= supply ? 1 : supply / demand;
    this.powerRatio = ratio;
    this.tickPrint(dt, ratio);
    this.tickDrones(dt);

    for (const b of st.buildings) {
      if (b.site) continue;
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
        case 'hall4':
        case 'hall8':
        case 'hall12':
        case 'hall16':
          this.tickStorage(b);
          break;
        case 'splitter':
          this.tickSplitter(b);
          break;
        case 'merger':
          this.tickMerger(b);
          break;
        case 'sorter':
        case 'overflow':
        case 'valve':
        case 'mixer':
        case 'lamp':
        case 'switch':
          this.tickLogic(b);
          break;
        case 'timer':
          this.tickTimer(b, dt);
          break;
        case 'picker':
          this.tickPicker(b, dt);
          break;
        case 'kitport':
          this.tickKitport(b, dt);
          break;
        case 'mast':
          b.status = 'ok';
          b.working = true;
          break;
        case 'road':
          break;
        case 'dock':
          this.tickDock(b);
          break;
        case 'depot':
          this.tickDepot(b);
          break;
        case 'stacker':
          this.tickStacker(b);
          break;
        case 'sensor':
          this.tickSensor(b, dt);
          break;
        case 'radio':
          this.tickRadio(b, dt);
          break;
        case 'battery':
          break; // handled with the power balance
        case 'generator':
        case 'reactor':
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
          this.tickScreen(b, dt);
          break;
        case 'speaker': {
          const rx = this.linkedReceiver(b);
          b.working = !!rx?.working;
          b.status = rx ? 'ok' : 'unpaired';
          break;
        }
        case 'keyboard': {
          const tm = this.keyboardTerminal(b);
          b.working = !!tm?.working;
          b.status = tm ? 'ok' : 'unpaired';
          break;
        }
        case 'adder':
        case 'subtractor':
        case 'multiplier':
        case 'divider':
          this.tickArith(b);
          break;
      }
    }
    this.tickWorld(dt);
    this.sampleEfficiency(dt);
    this.checkMission(dt);
  }

  private bump(rec: Partial<Record<ItemId, number>>, item: ItemId, n: number) {
    rec[item] = (rec[item] ?? 0) + n;
  }

  private tickWorld(_dt: number) {
    const st = this.state;
    this.tickRobots(_dt);
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
    if (Math.floor(st.time) !== Math.floor(st.time - _dt)) this.autoRepair();
    // contracts
    for (let i = st.contracts.length - 1; i >= 0; i--) {
      const c = st.contracts[i];
      if (c.accepted && c.kind && c.kind !== 'amount') this.tickAutomation(c, _dt);
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
    } else if (st.time >= (st.nextEventAt ?? Infinity) && st.missionIndex >= EVENT_MIN_MISSION) {
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
      const auto = st.missionIndex >= AUTOMATION_MIN_MISSION && Math.random() < AUTOMATION_SHARE ? this.makeAutomationContract() : null;
      if (auto) {
        st.contracts.push(auto);
        this.events.push({ type: 'contract_offer', contract: auto });
      } else if (pool.length) {
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
        if (!p || p.site || !BOARD_PARTS.has(p.type)) continue;
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

  // ---------- Kits and the core's printer ----------

  printQueue(): PrintJob[] {
    return (this.state.printQueue ??= []);
  }

  private pay(type: BuildingId, sign = -1) {
    const cost = BUILDINGS[type].cost;
    for (const k in cost) this.addInv(k as ItemId, sign * cost[k as ItemId]!);
  }

  /** Queue kits for the stock; stops when the material runs out. Returns how many were queued. */
  queuePrint(type: BuildingId, n = 1): number {
    if (this.printLocked(type)) return 0;
    let done = 0;
    for (; done < n && this.canAfford(type); done++) {
      this.pay(type);
      const t = printSeconds(type);
      this.printQueue().push({ type, left: t, total: t, site: false });
    }
    return done;
  }

  /** Cancel a stock job (site jobs go with their site). The material comes back. */
  cancelPrint(index: number): boolean {
    const q = this.printQueue();
    const job = q[index];
    if (!job || job.site) return false;
    q.splice(index, 1);
    this.pay(job.type, 1);
    return true;
  }

  private cancelSiteJob(type: BuildingId) {
    const q = this.printQueue();
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].site && q[i].type === type) {
        q.splice(i, 1);
        this.pay(type, 1);
        return;
      }
    }
  }

  private waitingSites(type: BuildingId): Building[] {
    return this.state.buildings.filter((b) => b.site && !b.deliver && b.type === type).sort((a, c) => a.id - c.id);
  }

  /** A printed kit for a site: built at once within the core's reach, otherwise it waits for delivery. */
  private siteKitReady(b: Building) {
    if (this.inReach(b.x, b.y, BUILDINGS[b.type].size)) this.finishSite(b);
    else {
      b.deliver = true;
      b.deliverAt = this.state.time;
    }
  }

  private finishSite(b: Building) {
    delete b.site;
    delete b.deliver;
    delete b.deliverAt;
    delete b.enroute;
    delete b.enrouteAt;
    this.events.push({ type: 'craft', b, item: (Object.keys(BUILDINGS[b.type].cost)[0] as ItemId) ?? 'iron_plate' });
  }

  /** The core prints the first job; a finished kit completes the oldest waiting site or goes to the stock. */
  private tickPrint(dt: number, ratio: number) {
    const q = this.printQueue();
    if (!q.length || this.creative) return;
    const job = q[0];
    job.left -= dt * Math.max(0.25, ratio); // a weak grid slows the printer down
    if (job.left > 0) return;
    q.shift();
    const site = this.waitingSites(job.type)[0];
    if (job.site && site) this.siteKitReady(site);
    else {
      const kits = this.state.kits!;
      kits[job.type] = (kits[job.type] ?? 0) + 1;
      // a kit for the stock while a site of that type still waits for its own (unstarted) job: use it right away
      const waiting = this.waitingSites(job.type)[0];
      const j = q.findIndex((x) => x.site && x.type === job.type && x.left >= x.total);
      if (waiting && j >= 0) {
        q.splice(j, 1);
        this.pay(job.type, 1);
        kits[job.type]! -= 1;
        this.siteKitReady(waiting);
      }
    }
  }

  core(): Building | null {
    const b = this.state.buildings[0];
    return b?.type === 'core' ? b : this.state.buildings.find((x) => x.type === 'core') ?? null;
  }

  /** Is a footprint at (x, y) of `size` tiles within the core's construction reach? */
  inReach(x: number, y: number, size: number): boolean {
    const c = this.core();
    if (!c || this.creative) return true;
    const cs = BUILDINGS.core.size;
    const dx = Math.max(c.x - (x + size - 1), 0, x - (c.x + cs - 1));
    const dy = Math.max(c.y - (y + size - 1), 0, y - (c.y + cs - 1));
    return Math.max(dx, dy) <= CORE_REACH;
  }

  drones(): Drone[] {
    return (this.state.drones ??= []);
  }

  /** Far sites waiting for their kit, oldest first. */
  private deliverSites(): Building[] {
    return this.state.buildings.filter((b) => b.site && b.deliver).sort((a, c) => a.id - c.id);
  }

  private tickDrones(dt: number) {
    const core = this.core();
    if (!core || this.creative) return;
    const st = this.state;
    const home = { x: core.x + BUILDINGS.core.size / 2, y: core.y + BUILDINGS.core.size / 2 };
    const drones = this.drones();
    while (drones.length < CORE_DRONES) drones.push({ x: home.x, y: home.y, target: null, carry: null, state: 'idle' });
    const far = this.deliverSites();
    // a kit sent by belt that got lost: after a while a drone takes over
    for (const b of far) if (b.enroute === 'item' && st.time - (b.enrouteAt ?? 0) > KIT_TRANSIT_TIMEOUT) delete b.enroute;
    const speed = DRONE_SPEED * (st.storm > 0 ? 0.6 : 1) * dt;
    for (const d of drones) {
      if (d.state === 'idle') {
        const s = far.find((b) => !b.enroute && st.time - (b.deliverAt ?? 0) >= DRONE_DELAY);
        if (!s) continue;
        s.enroute = 'drone';
        d.target = s.id;
        d.carry = s.type;
        d.state = 'out';
      }
      const tgt = d.state === 'out' ? this.byId(d.target) : null;
      if (d.state === 'out' && (!tgt || !tgt.site || !tgt.deliver)) d.state = 'back'; // removed or delivered otherwise
      const size = tgt ? BUILDINGS[tgt.type].size : 0;
      const goal = d.state === 'out' && tgt ? { x: tgt.x + size / 2, y: tgt.y + size / 2 } : home;
      const dx = goal.x - d.x, dy = goal.y - d.y, dist = Math.hypot(dx, dy);
      if (dist > speed) {
        d.x += (dx / dist) * speed;
        d.y += (dy / dist) * speed;
        continue;
      }
      d.x = goal.x;
      d.y = goal.y;
      if (d.state === 'out' && tgt) {
        this.finishSite(tgt);
        d.carry = null;
        d.state = 'back';
      } else if (d.state === 'back') {
        if (d.carry) st.kits![d.carry] = (st.kits![d.carry] ?? 0) + 1;
        d.carry = null;
        d.target = null;
        d.state = 'idle';
      }
    }
  }

  /** Kit port: puts the kits of far sites on a belt, one per second. */
  private tickKitport(b: Building, dt: number) {
    if (!this.inReach(b.x, b.y, 1)) {
      b.status = 'dead_end';
      b.working = false;
      return;
    }
    b.rateT = Math.min(1, (b.rateT ?? 0) + dt * KITPORT_RATE);
    // nearest far site first, even if its kit is still being printed (then wait): a belt towards far sites builds
    // itself outwards and never carries a kit past a gap
    let s: Building | null = null, best = Infinity;
    for (const x of this.state.buildings) {
      if (!x.site || x.enroute || (b.recipe && b.recipe !== x.type)) continue;
      if (!x.deliver && this.inReach(x.x, x.y, BUILDINGS[x.type].size)) continue;
      const d = Math.abs(x.x - b.x) + Math.abs(x.y - b.y);
      if (d < best) {
        best = d;
        s = x;
      }
    }
    if (s && !s.deliver) {
      b.status = 'waiting';
      b.working = false;
      return;
    }
    if (!s) {
      b.status = 'idle';
      b.working = false;
      return;
    }
    if (b.rateT >= 1 && this.pushDir(b, kitId(s.type), b.dir)) {
      s.enroute = 'item';
      s.enrouteAt = this.state.time;
      b.rateT = 0;
      b.acc = (b.acc ?? 0) + 1;
      b.working = true;
      b.status = 'ok';
    } else if (b.rateT >= 1) b.status = 'blocked';
  }

  /** Where a construction site stands in the print queue: position (0 = printing now) and progress. */
  siteInfo(b: Building): { pos: number; progress: number } {
    const idx = this.waitingSites(b.type).indexOf(b);
    const q = this.printQueue();
    let k = 0;
    for (let i = 0; i < q.length; i++) {
      if (!q[i].site || q[i].type !== b.type) continue;
      if (k++ === idx) return { pos: i, progress: i === 0 ? 1 - q[i].left / q[i].total : 0 };
    }
    return { pos: -1, progress: 0 };
  }

  // ---------- Warehouses and power ----------

  hallSlots(b: Building): number {
    const n = HALL_SIZE[b.type] ?? 1;
    return n * n;
  }

  hallUsed(b: Building): number {
    let used = 0;
    for (const k in b.store) used += Math.ceil((b.store[k as ItemId] ?? 0) / HALL_SLOT_CAP);
    return used;
  }

  /** Shelf contents in display order: one entry per slot (item, count). */
  hallLayout(b: Building): { item: ItemId; n: number }[] {
    const keys = Object.keys(b.store ?? {}) as ItemId[];
    const rank = (k: ItemId) => {
      const i = ITEM_ORDER.indexOf(k);
      return i >= 0 ? i : ITEM_ORDER.length + ITEM_ORDER.indexOf(k.slice(6) as ItemId);
    };
    keys.sort((a, c) => rank(a) - rank(c));
    const out: { item: ItemId; n: number }[] = [];
    for (const k of keys) {
      let left = b.store![k] ?? 0;
      while (left > 0) {
        out.push({ item: k, n: Math.min(HALL_SLOT_CAP, left) });
        left -= HALL_SLOT_CAP;
      }
    }
    return out;
  }

  /** Wind strength 0.15..1 (x1.6 in a storm): two slow waves over the game time. */
  windFactor(): number {
    const t = this.state.time;
    const base = 0.55 + 0.3 * Math.sin(t / 37) + 0.15 * Math.sin(t / 11 + 2);
    return Math.max(0.15, Math.min(1, base)) * (this.state.storm > 0 ? WIND_STORM_FACTOR : 1);
  }

  // ---------- Roads, docks, robots ----------

  robots(): Robot[] {
    return (this.state.robots ??= []);
  }

  private isRoad(x: number, y: number): boolean {
    const b = this.at(x, y);
    return b?.type === 'road' && !b.site;
  }

  /** Road tiles touching a building's footprint. */
  roadsAround(b: Building): { x: number; y: number }[] {
    const s = BUILDINGS[b.type].size, out: { x: number; y: number }[] = [];
    for (let i = 0; i < s; i++) {
      for (const [x, y] of [[b.x + i, b.y - 1], [b.x + i, b.y + s], [b.x - 1, b.y + i], [b.x + s, b.y + i]]) if (this.isRoad(x, y)) out.push({ x, y });
    }
    return out;
  }

  /** Breadth-first search over road tiles from (sx, sy): distance map and parents for path reconstruction. */
  private roadSearch(sx: number, sy: number): { dist: Map<number, number>; parent: Map<number, number> } {
    const w = this.state.width, key = (x: number, y: number) => y * w + x;
    const dist = new Map<number, number>(), parent = new Map<number, number>();
    const q: number[] = [key(sx, sy)];
    dist.set(q[0], 0);
    for (let i = 0; i < q.length; i++) {
      const k = q[i], x = k % w, y = Math.floor(k / w), d = dist.get(k)!;
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir], ny = y + DY[dir], nk = key(nx, ny);
        if (dist.has(nk) || !this.isRoad(nx, ny)) continue;
        dist.set(nk, d + 1);
        parent.set(nk, k);
        q.push(nk);
      }
    }
    return { dist, parent };
  }

  private pathTo(search: { parent: Map<number, number> }, sx: number, sy: number, gx: number, gy: number): { x: number; y: number }[] {
    const w = this.state.width;
    const out: { x: number; y: number }[] = [];
    let k = gy * w + gx;
    const start = sy * w + sx;
    while (k !== start) {
      out.push({ x: k % w, y: Math.floor(k / w) });
      const p = search.parent.get(k);
      if (p === undefined) return [];
      k = p;
    }
    return out.reverse();
  }

  /** Route a robot back to a road tile next to its depot to charge. */
  private planHome(r: Robot, depot: Building): boolean {
    const sx = Math.floor(r.x), sy = Math.floor(r.y);
    const search = this.roadSearch(sx, sy);
    let best: { x: number; y: number; d: number } | null = null;
    for (const t of this.roadsAround(depot)) {
      const d = search.dist.get(t.y * this.state.width + t.x);
      if (d !== undefined && (!best || d < best.d)) best = { ...t, d };
    }
    if (!best) return false;
    r.path = this.pathTo(search, sx, sy, best.x, best.y);
    r.target = depot.id;
    r.home = true;
    r.state = r.path.length ? 'go' : 'charge';
    return true;
  }

  /** Nearest dock (by road distance) the robot can serve: a loading dock with items, or an unloading dock with room for what it carries. */
  private planRobot(r: Robot, kind: 'load' | 'unload'): boolean {
    const sx = Math.floor(r.x), sy = Math.floor(r.y);
    const search = this.roadSearch(sx, sy);
    let best: { dock: Building; tile: { x: number; y: number }; d: number } | null = null;
    for (const dock of this.state.buildings) {
      if (dock.type !== 'dock' || dock.site) continue;
      const mode = dock.mode === 'unload' ? 'unload' : 'load';
      if (mode !== kind) continue;
      if (kind === 'load' && !dock.bufL!.length) continue;
      if (kind === 'unload' && (dock.bufL!.length >= DOCK_CAP || (dock.recipe && !r.items.includes(dock.recipe as ItemId)))) continue;
      for (const tile of this.roadsAround(dock)) {
        const d = search.dist.get(tile.y * this.state.width + tile.x);
        if (d === undefined) continue;
        // spread the fleet: a dock another robot is already heading for counts as farther away
        const busy = this.robots().filter((o) => o !== r && o.target === dock.id).length;
        // fuller loading docks first (a full one stops its line), so a far dock is not left waiting forever
        const fill = kind === 'load' ? dock.bufL!.length / DOCK_CAP : 0;
        const score = d + busy * 6 - fill * 14 - (fill >= 1 ? 16 : 0);
        if (!best || score < best.d) best = { dock, tile, d: score };
      }
    }
    if (!best) return false;
    r.path = this.pathTo(search, sx, sy, best.tile.x, best.tile.y);
    r.target = best.dock.id;
    r.state = 'go';
    return true;
  }

  private tickRobots(dt: number) {
    const robots = this.robots();
    for (let i = robots.length - 1; i >= 0; i--) {
      const r = robots[i];
      const depot = this.byId(r.depot);
      if (!depot || depot.type !== 'depot') {
        robots.splice(i, 1);
        continue;
      }
      const charge = r.charge ?? 1;
      if (r.state === 'charge') {
        // parked in a bay: the battery fills up, then back to work
        r.charge = Math.min(1, charge + ROBOT_CHARGE_RATE * dt);
        if (r.charge >= 1) {
          r.state = 'idle';
          r.wait = 0;
          r.home = false;
          const tile = this.roadsAround(depot)[0];
          if (tile) {
            r.x = tile.x + 0.5;
            r.y = tile.y + 0.5;
          }
        }
        continue;
      }
      if (r.state === 'idle') {
        r.wait -= dt;
        if (r.wait > 0) continue;
        r.wait = 1;
        // a weak battery sends the robot home first (cargo stays on board)
        if (charge < ROBOT_LOW && this.planHome(r, depot)) continue;
        if (r.items.length) {
          if (!this.planRobot(r, 'unload')) this.planRobot(r, 'load'); // nowhere to unload: keep collecting
        } else this.planRobot(r, 'load');
        // range check: the trip, the way back to the depot and the handling must fit into the battery
        if ((r.state as Robot['state']) === 'go' && !r.home) {
          const dock = this.byId(r.target);
          const back = dock ? Math.abs(dock.x - depot.x) + Math.abs(dock.y - depot.y) : 0;
          if (charge < (r.path.length + back) * ROBOT_DRAIN + 2 * ROBOT_CAP * ROBOT_DRAIN_WORK + 0.03) {
            r.target = null;
            this.planHome(r, depot);
          }
        }
        continue;
      }
      if (r.state === 'go') {
        let budget = ROBOT_SPEED * dt * (charge > 0 ? 1 : ROBOT_LIMP) * (this.state.storm > 0 ? STORM_ROBOT_FACTOR : 1);
        const before = budget;
        while (budget > 0 && r.path.length) {
          const wp = r.path[0], tx = wp.x + 0.5, ty = wp.y + 0.5;
          const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy);
          if (Math.abs(dx) > Math.abs(dy)) r.dir = dx > 0 ? 1 : 3;
          else if (d > 0.001) r.dir = dy > 0 ? 2 : 0;
          if (d <= budget) {
            r.x = tx;
            r.y = ty;
            budget -= d;
            r.path.shift();
            if (!this.isRoad(wp.x, wp.y)) {
              // the road was removed under the route: stop and re-plan
              r.path = [];
              r.state = 'idle';
              r.wait = 0.5;
              break;
            }
          } else {
            r.x += (dx / d) * budget;
            r.y += (dy / d) * budget;
            budget = 0;
          }
        }
        r.charge = Math.max(0, charge - (before - budget) * ROBOT_DRAIN);
        if (!r.path.length && r.state === 'go' && r.home) {
          r.state = 'charge'; // arrived at its depot
          continue;
        }
        if (!r.path.length && r.state === 'go') {
          const dock = this.byId(r.target);
          if (!dock || dock.type !== 'dock') {
            r.state = 'idle';
            r.wait = 0.5;
            continue;
          }
          r.state = dock.mode === 'unload' ? 'unload' : 'load';
          r.t = 0;
          r.dir = (dock.x > r.x ? 1 : dock.x < r.x - 0.6 ? 3 : dock.y > r.y ? 2 : 0) as Dir;
        }
        continue;
      }
      const dock = this.byId(r.target);
      if (!dock || dock.type !== 'dock') {
        r.state = 'idle';
        r.wait = 0.5;
        continue;
      }
      r.t += dt * ROBOT_RATE;
      if (r.state === 'load') {
        if (dock.mode === 'unload' || !dock.bufL!.length || r.items.length >= ROBOT_CAP) {
          r.state = 'idle';
          r.wait = 0;
          continue;
        }
        while (r.t >= 1 && dock.bufL!.length && r.items.length < ROBOT_CAP) {
          r.items.push(dock.bufL!.shift()!);
          r.t -= 1;
          r.charge = Math.max(0, (r.charge ?? 1) - ROBOT_DRAIN_WORK);
        }
      } else {
        const idx = r.items.findIndex((it) => !dock.recipe || dock.recipe === it);
        if (dock.mode !== 'unload' || idx < 0 || dock.bufL!.length >= DOCK_CAP) {
          r.state = 'idle';
          r.wait = 0;
          continue;
        }
        while (r.t >= 1 && dock.bufL!.length < DOCK_CAP) {
          const j = r.items.findIndex((it) => !dock.recipe || dock.recipe === it);
          if (j < 0) break;
          dock.bufL!.push(r.items.splice(j, 1)[0]);
          r.t -= 1;
          r.charge = Math.max(0, (r.charge ?? 1) - ROBOT_DRAIN_WORK);
        }
      }
    }
  }

  /** An unloading dock pushes its buffer into the building in front; a loading dock just waits for robots. */
  private tickDock(b: Building) {
    const buf = b.bufL ?? (b.bufL = []);
    if (b.mode === 'unload') {
      b.working = buf.length > 0;
      if (buf.length && this.pushDir(b, buf[0], b.dir)) buf.shift();
      b.status = buf.length >= DOCK_CAP ? 'blocked' : buf.length ? 'ok' : 'idle';
    } else {
      b.working = buf.length > 0;
      b.status = buf.length >= DOCK_CAP ? 'waiting' : buf.length ? 'ok' : 'idle';
    }
    if (!this.roadsAround(b).length) b.status = 'dead_end';
  }

  /** Keeps the depot's fleet at the chosen size; robots appear on a road next to the depot. */
  /** Robots a depot owns: delivered robot items (the playground gives every depot a full fleet). */
  depotRobots(b: Building): number {
    return this.creative ? DEPOT_ROBOTS_MAX : Math.min(DEPOT_ROBOTS_MAX, b.value ?? 0);
  }

  /** Puts one robot from the stock into the depot. */
  depotAddFromStock(b: Building): boolean {
    if (this.creative || (b.value ?? 0) >= DEPOT_ROBOTS_MAX || (this.state.inventory.robot ?? 0) <= 0) return false;
    this.addInv('robot', -1);
    b.value = (b.value ?? 0) + 1;
    return true;
  }

  private tickDepot(b: Building) {
    b.threshold = Math.max(1, Math.min(DEPOT_ROBOTS_MAX, b.threshold ?? 2));
    const want = Math.min(b.threshold, this.depotRobots(b));
    const robots = this.robots();
    const mine = robots.filter((r) => r.depot === b.id);
    const roads = this.roadsAround(b);
    if (!roads.length) {
      b.status = 'dead_end';
      b.working = false;
      return;
    }
    while (mine.length > want) {
      const r = mine.pop()!;
      for (const it of r.items) this.addInv(it, 1);
      robots.splice(robots.indexOf(r), 1);
    }
    while (mine.length < want) {
      const tile = roads[mine.length % roads.length];
      const r: Robot = { id: this.state.nextId++, depot: b.id, x: tile.x + 0.5, y: tile.y + 0.5, dir: 0, items: [], path: [], state: 'idle', target: null, wait: 0, t: 0 };
      robots.push(r);
      mine.push(r);
    }
    b.working = mine.some((r) => r.state !== 'idle');
    b.status = want ? 'ok' : 'starved';
  }

  /** Pack: eight equal items become one crate. Unpack: a crate becomes eight items again. */
  private tickStacker(b: Building) {
    const buf = b.bufL ?? (b.bufL = []);
    if (b.mode === 'unpack') {
      b.working = buf.length > 0;
      if (buf.length && this.pushDir(b, buf[0], b.dir)) buf.shift();
      b.status = buf.length ? 'ok' : 'idle';
      return;
    }
    b.working = buf.length > 0;
    if (buf.length >= CRATE_SIZE) {
      if (this.pushDir(b, crateId(buf[0]), b.dir)) {
        b.bufL = [];
        b.acc = (b.acc ?? 0) + 1;
        b.status = 'ok';
      } else b.status = 'blocked';
    } else b.status = buf.length ? 'ok' : 'idle';
  }

  // ---------- Grabber arm ----------

  /** Takes one item out of a building: a depot's store, a belt, a machine's output tray or a register's queue. */
  takeFrom(src: Building, filter: ItemId | null): ItemId | null {
    if (src.type === 'core' || src.type === 'picker') return null;
    if (src.store) {
      const keys = (filter ? [filter] : Object.keys(src.store)) as ItemId[];
      for (const k of keys) {
        const n = src.store[k] ?? 0;
        if (n <= 0) continue;
        if (n - 1 <= 0) delete src.store[k];
        else src.store[k] = n - 1;
        return k;
      }
      return null;
    }
    if (src.items) {
      // belts: the item furthest along (closest to the arm)
      for (let i = src.items.length - 1; i >= 0; i--) {
        if (filter && src.items[i].item !== filter) continue;
        return src.items.splice(i, 1)[0].item;
      }
      return null;
    }
    if (src.bufL && ARITH.has(src.type)) {
      const i = filter ? src.bufL.indexOf(filter) : 0;
      if (i < 0 || !src.bufL.length) return null;
      return src.bufL.splice(i, 1)[0];
    }
    if (src.output) {
      const keys = (filter ? [filter] : Object.keys(src.output)) as ItemId[];
      for (const k of keys) {
        const n = src.output[k] ?? 0;
        if (n <= 0) continue;
        if (n - 1 <= 0) delete src.output[k];
        else src.output[k] = n - 1;
        return k;
      }
    }
    return null;
  }

  /** Grabber arm: once a second it lifts an item from `reach` tiles behind and drops it `reach` tiles in front. */
  private tickPicker(b: Building, dt: number) {
    const reach = b.threshold === 2 ? 2 : 1;
    b.threshold = reach;
    const held = Object.keys(b.output ?? {})[0] as ItemId | undefined;
    b.rateT = Math.min(1, (b.rateT ?? 0) + dt * PICKER_RATE);
    if (held) {
      // swing over, then drop it into the target
      if (b.rateT < 1) {
        b.status = 'ok';
        b.working = true;
        return;
      }
      const t = this.at(b.x + DX[b.dir] * reach, b.y + DY[b.dir] * reach);
      if (t && t !== b && this.accept(t, held, b.dir)) {
        b.output = {};
        b.rateT = 0;
        b.acc = (b.acc ?? 0) + 1;
        b.status = 'ok';
      } else b.status = 'blocked';
      b.working = true;
      return;
    }
    const back = ((b.dir + 2) & 3) as Dir;
    const src = this.at(b.x + DX[back] * reach, b.y + DY[back] * reach);
    const item = src && src !== b ? this.takeFrom(src, (b.recipe as ItemId | null) ?? null) : null;
    if (item) {
      b.output = { [item]: 1 };
      b.rateT = 0;
      b.status = 'ok';
      b.working = true;
    } else {
      b.status = src ? 'idle' : 'dead_end';
      b.working = false;
    }
  }

  // ---------- Timer, sensor, radio ----------

  private radioQueues = new Map<number, { item: ItemId; tx: number }[]>();

  radioQueue(channel: number): { item: ItemId; tx: number }[] {
    let q = this.radioQueues.get(channel);
    if (!q) {
      q = [];
      this.radioQueues.set(channel, q);
    }
    return q;
  }

  /** A control pulse without an item, as a side item would do it: flips / holds a switch, releases a register. */
  signal(target: Building, from: Dir): boolean {
    if (target.type === 'switch') {
      if (from === target.dir || from === ((target.dir + 2) & 3)) return false;
      if (target.mode === 'pulse') {
        target.timer = (target.timer ?? 0) + SWITCH_PULSE_SECONDS;
        target.open = true;
      } else target.open = target.open === false;
      return true;
    }
    if (target.type === 'register') {
      if (from === target.dir) return false;
      const n = target.value ?? 0;
      const what = (target.recipe as ItemId | null) ?? 'copper_wire';
      for (let k = 0; k < n; k++) target.bufL!.push(what);
      target.value = 0;
      target.acc = (target.acc ?? 0) + 1;
      return n > 0;
    }
    if (target.type === 'timer') {
      // a pulse restarts the cycle and opens the timer right away
      target.timer = target.threshold ?? 3;
      target.open = true;
      target.rateT = TIMER_OPEN;
      return true;
    }
    return false;
  }

  /** Opens for half a second every `threshold` seconds; items waiting behind it pass while it is open. */
  private tickTimer(b: Building, dt: number) {
    const period = b.threshold && TIMER_PERIODS.includes(b.threshold) ? b.threshold : 3;
    b.threshold = period;
    b.timer = (b.timer ?? period) - dt;
    if (b.timer <= 0) {
      b.timer = period;
      b.open = true;
      b.rateT = TIMER_OPEN;
    }
    if (b.open !== false) {
      b.rateT = (b.rateT ?? 0) - dt;
      if (b.rateT <= 0) b.open = false;
    }
    b.status = b.open !== false ? 'ok' : 'closed';
    const key = Object.keys(b.output ?? {})[0] as ItemId | undefined;
    if (key && b.open !== false && this.pushDir(b, key, b.dir)) b.output = {};
  }

  /** Passes items straight through and signals both sides for every item that runs through. */
  private tickSensor(b: Building, dt: number) {
    b.status = 'ok';
    if ((b.timer ?? 0) > 0) b.timer = Math.max(0, b.timer! - dt);
    b.working = (b.timer ?? 0) > 0;
    const key = Object.keys(b.output ?? {})[0] as ItemId | undefined;
    if (key && this.pushDir(b, key, b.dir)) {
      b.output = {};
      b.timer = 0.25;
      b.acc = (b.acc ?? 0) + 1;
      for (const side of [((b.dir + 1) & 3) as Dir, ((b.dir + 3) & 3) as Dir]) {
        const t = this.at(b.x + DX[side], b.y + DY[side]);
        if (t) this.signal(t, side);
      }
    }
  }

  /** tx: items vanish into the channel (see accept); rx: items of the channel appear in front of it. */
  private tickRadio(b: Building, dt: number) {
    if ((b.timer ?? 0) > 0) b.timer = Math.max(0, b.timer! - dt);
    if (b.mode !== 'rx') {
      b.working = (b.timer ?? 0) > 0;
      b.status = 'ok';
      return;
    }
    const q = this.radioQueue(b.threshold ?? 1);
    b.rateT = Math.min(1, (b.rateT ?? 0) + dt * RADIO_RATE);
    // only items from transmitters this receiver can hear (directly or over masts)
    const net = this.radioNet();
    const mine = net.get(b.id);
    const k = q.findIndex((e) => net.get(e.tx) === mine);
    b.status = k >= 0 ? 'ok' : q.length ? 'waiting' : 'idle';
    b.working = (b.timer ?? 0) > 0;
    if (k >= 0 && b.rateT >= 1 && this.pushDir(b, q[k].item, b.dir)) {
      q.splice(k, 1);
      b.rateT -= 1;
      b.timer = 0.3;
      b.acc = (b.acc ?? 0) + 1;
    }
  }

  /** Radio network: radios and masts within RADIO_RANGE of each other (or linked over masts) share a group id. */
  private netCache: { t: number; n: number; map: Map<number, number> } | null = null;
  radioNet(): Map<number, number> {
    const st = this.state;
    const nodes = st.buildings.filter((b) => (b.type === 'radio' || b.type === 'mast') && !b.site);
    if (this.netCache && this.netCache.t === st.time && this.netCache.n === nodes.length) return this.netCache.map;
    const parent = new Map<number, number>(nodes.map((b) => [b.id, b.id]));
    const find = (x: number): number => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!);
        x = parent.get(x)!;
      }
      return x;
    };
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], c = nodes[j];
        // two radios only hear each other directly; masts connect to everything in range
        if (a.type === 'radio' && c.type === 'radio' && (a.threshold ?? 1) !== (c.threshold ?? 1)) continue;
        if (Math.hypot(a.x - c.x, a.y - c.y) <= RADIO_RANGE) parent.set(find(a.id), find(c.id));
      }
    const map = new Map<number, number>(nodes.map((b) => [b.id, find(b.id)]));
    this.netCache = { t: st.time, n: nodes.length, map };
    return map;
  }

  /** Links to draw: pairs of radios / masts within range that belong to one network. */
  radioLinks(): [Building, Building][] {
    const nodes = this.state.buildings.filter((b) => (b.type === 'radio' || b.type === 'mast') && !b.site);
    const out: [Building, Building][] = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], c = nodes[j];
        if (a.type === 'radio' && c.type === 'radio' && (a.threshold ?? 1) !== (c.threshold ?? 1)) continue;
        if (Math.hypot(a.x - c.x, a.y - c.y) <= RADIO_RANGE) out.push([a, c]);
      }
    return out;
  }

  /** The terminal a keyboard is wired to: it touches the terminal or a part of its board. */
  keyboardTerminal(kb: Building): Building | null {
    const st = this.state;
    const around = new Set<number>();
    for (let y = kb.y - 1; y <= kb.y + 2; y++)
      for (let x = kb.x - 1; x <= kb.x + 2; x++) {
        if ((x < kb.x || x > kb.x + 1) && (y < kb.y || y > kb.y + 1)) continue; // corners are not adjacent
        if (x >= 0 && y >= 0 && x < st.width && y < st.height) around.add(y * st.width + x);
      }
    for (const t of st.buildings) {
      if (t.type !== 'terminal') continue;
      for (const idx of around) {
        const p = this.at(idx % st.width, Math.floor(idx / st.width));
        if (p === t) return t;
        if (p && this.board(t).tiles.has(idx)) return t;
      }
    }
    return null;
  }

  /** Type a character (ASCII 32..95, 8 = backspace, 13 = enter) on a keyboard; it lands in the wired terminal's buffer. */
  typeOn(kb: Building, code: number): boolean {
    const t = this.keyboardTerminal(kb);
    const cpu = t && this.cpu(t);
    if (!cpu) return false;
    if (cpu.kbuf.length >= 64) return false;
    cpu.kbuf.push(code & 0xff);
    if (cpu.waitingKey === -2) cpu.waitingKey = -1; // wakes a parked program
    return true;
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
    // keys on the board: switches with a key number next to a bus trace (or other board part) wired to the terminal
    const st = this.state;
    const seen = new Set(out.map((o) => o.sw.id));
    for (const idx of this.board(b).tiles) {
      const x = idx % st.width, y = Math.floor(idx / st.width);
      for (let d = 0; d < 4; d++) {
        const sw = this.at(x + DX[d], y + DY[d]);
        if (sw?.type === 'switch' && sw.threshold !== undefined && sw.threshold >= 0 && sw.threshold <= 15 && !seen.has(sw.id)) {
          seen.add(sw.id);
          out.push({ sw, key: sw.threshold });
        }
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
        else if (l?.type === 'matrix' && x * matrixSize(l) < r.w && y * matrixSize(l) < r.h) {
          l.px = undefined;
          l.acc = (l.acc ?? 0) + 1;
        }
      }
  }

  // ---------- Video receiver ----------

  /** Pixel region a receiver drives: 64x32 px (8x4 matrices) per scale step, right of the building. */
  screenRect(b: Building): { x: number; y: number; w: number; h: number } {
    let k = Math.max(1, Math.min(4, b.value ?? 1));
    const first = this.at(b.x + SCREEN_REGION.dx, b.y);
    const s = first?.type === 'matrix' ? matrixSize(first) : MATRIX_SIZE; // pixel density follows the first matrix
    while (k > 1 && SCREEN_REGION.w * s * k > SCREEN_MAX_PX) k--; // dense walls are capped at 1024 px wide
    return { x: b.x + SCREEN_REGION.dx, y: b.y, w: SCREEN_REGION.w * s * k, h: SCREEN_REGION.h * s * k };
  }

  private frames = new Map<number, { rgba: Uint8ClampedArray; w: number; h: number; scan: number; row: number; t: number }>(); // last frame per receiver
  private speakerLinks = new Map<number, Building>(); // speaker id -> receiver

  /** Speakers wired to a receiver: touching it or reachable through bus traces (and other speakers). */
  speakersOf(b: Building): Building[] {
    const st = this.state;
    const seen = new Set<number>([b.y * st.width + b.x]);
    const queue = [b.y * st.width + b.x];
    const out: Building[] = [];
    while (queue.length && seen.size < 512) {
      const idx = queue.shift()!;
      const x = idx % st.width, y = Math.floor(idx / st.width);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= st.width || ny >= st.height) continue;
        const ni = ny * st.width + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        const p = this.at(nx, ny);
        if (!p || (p.type !== 'bus' && p.type !== 'speaker')) continue;
        if (p.type === 'speaker') out.push(p);
        queue.push(ni);
      }
    }
    return out;
  }

  /** The receiver a speaker is wired to (looked up by the receivers' ticks). */
  linkedReceiver(speaker: Building): Building | null {
    const rx = this.speakerLinks.get(speaker.id);
    return rx && this.state.buildings.includes(rx) ? rx : null;
  }

  /** Loudness 0..1 the receiver should play with: the loudest wired speaker, silence without one. */
  receiverGain(b: Building): number {
    let g = 0;
    for (const s of this.speakersOf(b)) g = Math.max(g, Math.min(10, s.value ?? 7) / 10);
    return g;
  }

  private screenBoards = new Map<number, { key: string; tiles: Set<number>; lanes: number; hz: number; bufferPx: number; cells: number; quartz: number; glass: number }>();

  /**
   * Everything wired to a receiver: matrices, bus traces, speakers, registers and oscillators reachable from it.
   * Lanes = bus/conductor tiles in the column left of the wall, clock = the receiver's own 100 Hz plus its
   * oscillators, frame buffer = registers x 4096 px. Only wired matrices show the picture.
   */
  screenBoard(b: Building) {
    const st = this.state;
    const key = `${st.buildings.length}:${st.nextId}`;
    const cached = this.screenBoards.get(b.id);
    if (cached && cached.key === key) return cached;
    const conduct = new Set<BuildingId>(['bus', 'speaker', 'register', 'oscillator', 'matrix']);
    const tiles = new Set<number>();
    const seen = new Set<number>([b.y * st.width + b.x]);
    const queue = [b.y * st.width + b.x];
    let cells = 0, quartz = 0, glass = 0;
    while (queue.length && seen.size < 4096) {
      const idx = queue.shift()!;
      const x = idx % st.width, y = Math.floor(idx / st.width);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= st.width || ny >= st.height) continue;
        const ni = ny * st.width + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        const p = this.at(nx, ny);
        if (!p || !conduct.has(p.type)) continue;
        tiles.add(ni);
        queue.push(ni);
        if (p.type === 'register') cells++;
        else if (p.type === 'oscillator') {
          quartz += p.clock ?? 0;
          glass += p.turbo ?? 0;
        }
      }
    }
    const r = this.screenRect(b);
    const first = this.at(r.x, r.y);
    const dens = first?.type === 'matrix' ? matrixSize(first) : MATRIX_SIZE;
    let lanes = 0;
    for (let y = r.y; y < r.y + r.h / dens; y++) {
      const t = this.at(r.x - 1, y);
      if (t && t.type !== 'matrix' && (tiles.has(y * st.width + r.x - 1) || t === b)) lanes++;
    }
    const hz = SCREEN_BASE_HZ + quartz * CRYSTAL_HZ.quartz + glass * CRYSTAL_HZ.glass;
    const board = { key, tiles, lanes, hz, bufferPx: cells * SCREEN_PX_PER_CELL, cells, quartz, glass };
    this.screenBoards.set(b.id, board);
    return board;
  }

  /**
   * Grow a board: place `count` buildings of `type` on free tiles next to the seed tiles (each placed tile becomes a
   * seed, so everything stays connected). Stops when nothing can be afforded or no free tile is left.
   */
  private growBoard(seeds: Iterable<number>, avoid: (x: number, y: number) => boolean, type: BuildingId, count: number, dir: Dir = 1): Building[] {
    const st = this.state;
    const placed: Building[] = [];
    const seen = new Set<number>(seeds);
    const queue = [...seen];
    while (queue.length && placed.length < count) {
      const idx = queue.shift()!;
      const x = idx % st.width, y = Math.floor(idx / st.width);
      for (let d = 0; d < 4 && placed.length < count; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= st.width || ny >= st.height) continue;
        const ni = ny * st.width + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        if (this.at(nx, ny) || avoid(nx, ny)) continue;
        const b = this.place(type, nx, ny, dir);
        if (!b) return placed; // cannot afford or cannot build here: stop
        placed.push(b);
        queue.push(ni);
      }
    }
    return placed;
  }

  /** What "complete the wiring" would add to a receiver's board. */
  screenMissing(b: Building): { cells: number; lanes: number; oscillators: number } {
    const s = this.screenStats(b);
    const cells = Math.max(0, Math.ceil((s.w * s.h) / SCREEN_PX_PER_CELL) - s.cells);
    const tiles = s.h / (s.w / (SCREEN_REGION.w * Math.max(1, Math.min(4, b.value ?? 1)))); // wall rows in tiles
    const lanes = Math.max(0, Math.min(Math.round(tiles), Math.ceil(s.needPx / (s.hz * SCREEN_PX_PER_LANE_TICK))) - s.lanes);
    const lanesAfter = s.lanes + lanes;
    const hzNeed = lanesAfter ? s.needPx / (lanesAfter * SCREEN_PX_PER_LANE_TICK) : Infinity;
    const oscillators = hzNeed > s.hz ? Math.ceil((hzNeed - s.hz) / (3 * CRYSTAL_HZ.glass)) : 0;
    return { cells, lanes, oscillators };
  }

  /** Place the missing registers, bus lanes and oscillators for a receiver's wall. Crystals are filled only in creative mode. */
  autoWireScreen(b: Building): { cells: number; lanes: number; oscillators: number; incomplete: boolean } {
    const st = this.state;
    const r = this.screenRect(b);
    const first = this.at(r.x, r.y);
    const dens = first?.type === 'matrix' ? matrixSize(first) : MATRIX_SIZE;
    const tw = r.w / dens, th = r.h / dens;
    const avoid = (x: number, y: number) => (x >= r.x && x < r.x + tw && y >= r.y && y < r.y + th) || (x === b.x - 1 && y === b.y) || (x === b.x && (y === b.y - 1 || y === b.y + 1));
    const miss = this.screenMissing(b);
    let lanes = 0;
    for (let y = r.y; y < r.y + th && lanes < miss.lanes; y++) {
      if (this.at(r.x - 1, y)) continue;
      if (this.place('bus', r.x - 1, y, 0)) lanes++;
    }
    const seeds = () => [...this.screenBoard(b).tiles, b.y * st.width + b.x];
    const oscs = this.growBoard(seeds(), avoid, 'oscillator', miss.oscillators, 0);
    if (this.creative) for (const o of oscs) o.turbo = 3;
    const cells = this.growBoard(seeds(), avoid, 'register', miss.cells, 1);
    this.screenBoards.delete(b.id);
    return { cells: cells.length, lanes, oscillators: oscs.length, incomplete: cells.length < miss.cells || lanes < miss.lanes || oscs.length < miss.oscillators };
  }

  /** Place registers so the terminal's program fits into RAM. */
  autoWireTerminal(b: Building): { cells: number; incomplete: boolean } {
    const st = this.state;
    const mem = this.terminalMemory(b);
    const need = Math.max(0, mem.need - mem.have);
    const d = this.terminalDisplayRect(b), tr = this.terminalTraceRect(b);
    const s = BUILDINGS[b.type].size;
    const avoid = (x: number, y: number) =>
      (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) || (x >= tr.x && x < tr.x + tr.w && y >= tr.y && y < tr.y + tr.h) || (x >= b.x - 1 && x <= b.x + s && y >= b.y - 1 && y <= b.y + s);
    const seeds = [...this.board(b).tiles];
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) seeds.push(y * st.width + x);
    // the ring around the terminal is reserved for keys: start from a bus trace at the top-left corner's outside
    if (!seeds.some((i) => !this.at(i % st.width, Math.floor(i / st.width)) || this.at(i % st.width, Math.floor(i / st.width))?.type !== 'terminal')) {
      const bx = b.x - 1, by = b.y - 1;
      if (!this.at(bx, by) && this.place('bus', bx, by, 0)) seeds.push(by * st.width + bx);
    }
    const cells = this.growBoard(seeds, avoid, 'register', need, 1);
    this.boards.delete(b.id);
    return { cells: cells.length, incomplete: cells.length < need };
  }

  /** Numbers for the panel: what the wall needs per second and what lanes, clock, memory and phosphor give. */
  screenStats(b: Building) {
    const board = this.screenBoard(b);
    const r = this.screenRect(b);
    const fps = 1000 / Math.max(40, (r.w * r.h) / 8000);
    const needPx = r.w * r.h * fps;
    const capPx = board.lanes * board.hz * SCREEN_PX_PER_LANE_TICK;
    const rows = Math.min(r.h, Math.floor(board.bufferPx / r.w));
    return { ...board, w: r.w, h: r.h, fps, needPx, capPx, rows, budget: b.budget ?? 0, budgetMax: SCREEN_BUDGET_MAX };
  }

  private tickScreen(b: Building, dt: number) {
    b.working = this.state.time - (b.progress ?? -10) < 1; // a frame arrived within the last second
    b.status = b.working ? ((b.budget ?? 0) > 0 ? 'ok' : 'starved') : 'idle';
    b.missing = b.status === 'starved' ? ['copper_wire'] : undefined;
    for (const s of this.speakersOf(b)) this.speakerLinks.set(s.id, b);
    // out of phosphor: the picture fades, one step per second
    if (b.working && !(b.budget ?? 0)) {
      b.fuelSeconds = (b.fuelSeconds ?? 0) + dt;
      if (b.fuelSeconds >= 1) {
        b.fuelSeconds = 0;
        const r = this.screenRect(b);
        for (let my = 0; my < r.h / 4; my++)
          for (let mx = 0; mx < r.w / 4; mx++) {
            const m = this.at(r.x + mx, r.y + my);
            if (m?.type !== 'matrix' || !m.px) continue;
            let any = false;
            for (let i = 0; i < m.px.length; i++) {
              const v = m.px[i];
              if (!v) continue;
              const nr = ((v >> 16) * 0.8) | 0, ng = (((v >> 8) & 255) * 0.8) | 0, nb = ((v & 255) * 0.8) | 0;
              m.px[i] = nr + ng + nb < 30 ? 0 : (nr << 16) | (ng << 8) | nb;
              any = true;
            }
            if (any) m.acc = (m.acc ?? 0) + 1;
          }
      }
    }
    // sample output: a few items per second in the colour of the picture, onto the belt to the left
    const mode = b.mode ?? 'scan';
    const f = this.frames.get(b.id);
    if (!b.working || !f || mode === 'off' || mode === 'hold' || mode === 'pass' || mode === 'pulse' || mode === 'tx' || mode === 'rx' || mode === 'load' || mode === 'unload' || mode === 'pack' || mode === 'unpack') return;
    b.rateT = Math.min(2, (b.rateT ?? 0) + dt * SCREEN_SAMPLE_RATE);
    if (b.rateT < 1) return;
    const item = this.sampleOf(b, f, mode);
    if (item && this.pushDir(b, item, 3)) b.rateT -= 1;
    else if (!item) b.rateT -= 1; // dark pixel: nothing to send, the slot passes
  }

  private sampleOf(b: Building, f: { rgba: Uint8ClampedArray; w: number; h: number; scan: number }, mode: 'avg' | 'centre' | 'scan'): ItemId | null {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rgba, w, h } = f;
    let r = 0, g = 0, bl = 0;
    if (mode === 'avg') {
      let n = 0;
      for (let i = 0; i < w * h; i += 7) {
        r += rgba[i * 4];
        g += rgba[i * 4 + 1];
        bl += rgba[i * 4 + 2];
        n++;
      }
      r /= n;
      g /= n;
      bl /= n;
    } else {
      const i = mode === 'centre' ? (h >> 1) * w + (w >> 1) : f.scan;
      if (mode === 'scan') f.scan = (f.scan + SCREEN_SCAN_STEP) % (w * h);
      r = rgba[i * 4];
      g = rgba[i * 4 + 1];
      bl = rgba[i * 4 + 2];
    }
    void b;
    return nearestItem(r, g, bl);
  }

  /** Where the scan sample currently sits (pixel index), for the renderer's scan marker. */
  scanPos(b: Building): { x: number; y: number; w: number; h: number } | null {
    const f = this.frames.get(b.id);
    if (!f || !b.working) return null;
    return { x: f.scan % f.w, y: Math.floor(f.scan / f.w), w: f.w, h: f.h };
  }

  /** Write an RGBA frame (w x h, the receiver's resolution) onto matrices (8x8 blocks) and lamps (one pixel per tile). */
  pushFrame(b: Building, rgba: Uint8ClampedArray, w: number, h: number) {
    const r = this.screenRect(b);
    if (w !== r.w || h !== r.h) return;
    b.progress = this.state.time;
    const prev = this.frames.get(b.id);
    const frame = { rgba, w, h, scan: prev && prev.w === w && prev.h === h ? prev.scan : 0, row: prev && prev.w === w && prev.h === h ? prev.row : 0, t: this.state.time };
    this.frames.set(b.id, frame);
    if (!(b.budget ?? 0)) return; // no phosphor: nothing is drawn (the picture fades in tickScreen)
    const st = this.state;
    const board = this.screenBoard(b);
    // throughput: lanes x clock x 64 px per tick, over the time since the last frame; memory limits the rows
    const dtF = Math.max(0.02, Math.min(0.5, this.state.time - (prev?.t ?? this.state.time - 0.05)));
    const capRows = board.lanes ? Math.max(1, Math.floor((board.lanes * board.hz * SCREEN_PX_PER_LANE_TICK * dtF) / w)) : 0;
    const memRows = Math.min(h, Math.floor(board.bufferPx / w));
    if (!capRows || !memRows) return;
    const rowFrom = capRows >= memRows ? 0 : frame.row % memRows;
    const rowTo = capRows >= memRows ? memRows : Math.min(memRows, rowFrom + capRows);
    frame.row = rowTo >= memRows ? 0 : rowTo;
    b.budget = Math.max(0, (b.budget ?? 0) - (rowTo - rowFrom) * w);
    // tint by the delivered item's colour
    const tintItem = (b.recipe as ItemId | null) ?? 'copper_wire';
    const tv = itemRgb(tintItem);
    const tmax = Math.max(1, tv >> 16, (tv >> 8) & 255, tv & 255);
    const tr = 1 - SCREEN_TINT + (SCREEN_TINT * (tv >> 16)) / tmax, tg = 1 - SCREEN_TINT + (SCREEN_TINT * ((tv >> 8) & 255)) / tmax, tb = 1 - SCREEN_TINT + (SCREEN_TINT * (tv & 255)) / tmax;
    const tilesW = w / 4, tilesH = h / 4; // upper bound (4 px tiles); denser matrices cover several of these
    for (let my = 0; my < tilesH; my++)
      for (let mx = 0; mx < tilesW; mx++) {
        const m = this.at(r.x + mx, r.y + my);
        if (m?.type !== 'matrix') continue;
        const s = matrixSize(m);
        if (mx * s >= w || my * s >= h) continue;
        if (!board.tiles.has((r.y + my) * st.width + r.x + mx)) continue; // not wired to the receiver: stays dark
        const y0 = my * s, y1 = y0 + s;
        if (y1 <= rowFrom || y0 >= rowTo) continue;
        const px = m.px && m.px.length === s * s ? m.px : new Array<number>(s * s).fill(0);
        for (let yy = Math.max(0, rowFrom - y0); yy < Math.min(s, rowTo - y0); yy++)
          for (let xx = 0; xx < s; xx++) {
            const i = ((my * s + yy) * w + mx * s + xx) * 4;
            const rr = (rgba[i] * tr) | 0, gg = (rgba[i + 1] * tg) | 0, bb = (rgba[i + 2] * tb) | 0;
            px[yy * s + xx] = rr + gg + bb < 45 ? 0 : (rr << 16) | (gg << 8) | bb;
          }
        m.px = px;
        m.acc = (m.acc ?? 0) + 1;
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
    for (let my = 0; my < r.h / 4; my++)
      for (let mx = 0; mx < r.w / 4; mx++) {
        const m = this.at(r.x + mx, r.y + my);
        if (m?.type !== 'matrix') continue;
        const s = matrixSize(m);
        const hi = cpu.hires && s === 16; // a 16x16 matrix shows the hi-res picture (8x4 tiles = 128x64)
        if (mx * s >= (hi ? HIRES_W : r.w) || my * s >= (hi ? HIRES_H : r.h)) continue;
        const px = m.px && m.px.length === s * s ? m.px : new Array<number>(s * s).fill(0);
        let changed = px !== m.px;
        for (let yy = 0; yy < s; yy++)
          for (let xx = 0; xx < s; xx++) {
            const rgb = this.displayRgb(b, hi ? cpu.fb[(my * s + yy) * HIRES_W + mx * s + xx] : cpu.display[(my * s + yy) * CHIP8_W + mx * s + xx]);
            const k = yy * s + xx;
            if (px[k] !== rgb) {
              px[k] = rgb;
              changed = true;
            }
          }
        if (changed) {
          m.px = px;
          m.acc = (m.acc ?? 0) + 1;
        }
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
    }
    if (cpu.exec) {
      // EXEC n: the running program (KDOS) asks for another built-in program; the terminal loads it like the editor would
      const id = EXEC_PROGRAMS[cpu.exec - 1];
      const prog = CHIP8_PROGRAMS.find((p) => p.id === id);
      cpu.exec = 0;
      if (prog) this.setProgram(b, prog.source);
    } // register lamps above the terminal follow every tick (a real CPU run to watch)
  }

  // ---------- Events ----------

  private makeEvent(): GameEvent | null {
    const st = this.state;
    const kinds: EventKind[] = ['wreck', 'meteorite', 'trader'];
    if (this.countBuildings('solar') > 0) kinds.push('power_surge');
    if (this.wearOn() && st.buildings.filter((b) => b.working).length >= 4) kinds.push('quake');
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
    if (ev.kind === 'trader' && choice === 'a') return (this.state.inventory.copper_plate ?? 0) >= 20;
    if (ev.kind === 'quake' && choice === 'a') return (this.state.inventory.machine_part ?? 0) >= 6;
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
      case 'trader':
        // a passing trade drone: copper for circuits (or motors, before circuits exist)
        if (choice === 'a') {
          this.addInv('copper_plate', -20);
          if (st.unlockedRecipes.includes('circuit')) this.addInv('circuit', 5);
          else this.addInv('machine_part', 6);
        }
        break;
      case 'quake': {
        if (choice === 'a') this.addInv('machine_part', -6);
        else {
          // three working machines shake loose
          const hit = st.buildings.filter((b) => b.working && (BUILDINGS[b.type].kind === 'machine' || BUILDINGS[b.type].kind === 'miner'));
          for (let i = 0; i < 3 && hit.length; i++) {
            const b = hit.splice(Math.floor(Math.random() * hit.length), 1)[0];
            b.wear = Math.min(1, (b.wear ?? 0) + QUAKE_WEAR);
          }
        }
        break;
      }
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
    for (const k in SHIP_PARTS) parts += Math.min(st.ship[k as ItemId] ?? 0, SHIP_PARTS[k as ItemId]!) * 62;
    const time = Math.max(0, 6000 - Math.floor(st.time / 2));
    const thrift = Math.max(0, 2500 - st.buildings.length * 5);
    const contracts = st.contractsDone * 100;
    const hard = st.options.difficulty === 'hard';
    const total = Math.round((time + parts + thrift + contracts) * (hard ? 1.5 : 1));
    return { total, time, parts, thrift, contracts, hard };
  }

  /** A contract that needs control logic: a steady rate band, exact batches per window, or a stock level. */
  makeAutomationContract(kind?: Contract['kind']): Contract | null {
    const st = this.state;
    const items = (['iron_plate', 'copper_plate', 'copper_wire', 'machine_part', 'steel_frame', 'circuit'] as ItemId[]).filter((id) => {
      const r = RECIPES.find((x) => x.output === id);
      return r && st.unlockedRecipes.includes(r.id);
    });
    if (!items.length) return null;
    const item = items[Math.floor(Math.random() * items.length)];
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const k = kind ?? pick(['steady', 'batch', 'level'] as const);
    const base = { id: st.nextId++, item, amount: 1, delivered: 0, accepted: false, kind: k } as Contract;
    if (k === 'steady') {
      const r = pick([6, 8, 10, 12]);
      Object.assign(base, { lo: r - 2, hi: r + 2, hold: 90, held: 0, deadline: st.time + 720, reward: { machine_part: 8, circuit: 6, precision_part: 3 } });
    } else if (k === 'batch') {
      Object.assign(base, { n: pick([4, 6, 8]), window: 30, rounds: 4, done: 0, deadline: st.time + 600, reward: { machine_part: 10, circuit: 8, motor: 2 } });
    } else {
      const lo = pick([30, 40]);
      Object.assign(base, { lo, hi: lo + 20, hold: 90, held: 0, deadline: st.time + 720, reward: { steel_frame: 10, circuit: 8, cell: 2 } });
    }
    return base;
  }

  /** Stock of an item in depots and warehouses (the core does not count). */
  storedAmount(item: ItemId): number {
    let n = 0;
    for (const b of this.state.buildings) if (b.store && !b.site) n += b.store[item] ?? 0;
    return n;
  }

  /** Rate or stock an automation contract looks at right now. */
  automationValue(c: Contract): number {
    if (c.kind === 'steady') {
      const log = (c.log ??= []);
      while (log.length && log[0] < this.state.time - 60) log.shift();
      return log.length;
    }
    if (c.kind === 'level') return this.storedAmount(c.item);
    return c.winCount ?? 0;
  }

  private tickAutomation(c: Contract, dt: number) {
    if (c.kind === 'batch') {
      c.winStart ??= this.state.time;
      if (this.state.time >= c.winStart + c.window!) {
        c.done = (c.winCount ?? 0) === c.n ? (c.done ?? 0) + 1 : 0; // a wrong window starts the series again
        c.winCount = 0;
        c.winStart += c.window!;
      }
      if ((c.done ?? 0) >= c.rounds!) c.delivered = c.amount;
      return;
    }
    const v = this.automationValue(c);
    c.held = v >= c.lo! && v <= c.hi! ? (c.held ?? 0) + dt : 0;
    if (c.held >= c.hold!) c.delivered = c.amount;
  }

  acceptContract(c: Contract) {
    c.accepted = true;
    c.delivered = 0;
    c.held = 0;
    c.done = 0;
    c.winCount = 0;
    c.winStart = this.state.time;
    c.log = [];
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
      const ahead = i < items.length - 1 ? items[i + 1].pos - (itemSpacing(items[i + 1].item) + itemSpacing(it.item)) / 2 : Infinity;
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
  beltCapacity(item?: ItemId): number {
    return ((BELT_SPEED * this.factor('belt')) / (item ? itemSpacing(item) : BELT_SPACING)) * 60;
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
        const wf = this.wearTick(b, dt);
        b.status = ratio < 1 ? 'low_power' : wf < 1 ? 'worn' : 'ok';
        b.progress = (b.progress ?? 0) + (dt * ratio * wf * this.factor('miner')) / MINE_SECONDS;
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

  /** Does wear apply in this game? (Not in the playground, in the story once machine parts exist.) */
  wearOn(): boolean {
    const st = this.state;
    if (this.creative || st.options.mode === 'playground' || st.options.mode === 'challenge') return false;
    return st.options.mode !== 'story' || st.missionIndex >= WEAR_MIN_MISSION;
  }

  /** A working machine wears a little; returns its speed factor. */
  private wearTick(b: Building, dt: number): number {
    if (!this.wearOn()) return 1;
    b.wear = Math.min(1, (b.wear ?? 0) + dt / WEAR_SECONDS);
    return b.wear >= 1 ? WORN_SPEED : 1;
  }

  canRepair(b: Building): boolean {
    if ((b.wear ?? 0) <= 0.05) return false;
    for (const k in REPAIR_COST) if ((this.state.inventory[k as ItemId] ?? 0) < REPAIR_COST[k as ItemId]!) return false;
    return true;
  }

  /** Spare parts from the stock make a machine as good as new. */
  repair(b: Building): boolean {
    if (!this.canRepair(b)) return false;
    for (const k in REPAIR_COST) this.addInv(k as ItemId, -REPAIR_COST[k as ItemId]!);
    b.wear = 0;
    if (b.status === 'worn') b.status = 'ok';
    this.events.push({ type: 'repaired', b });
    return true;
  }

  /** The core's drones service worn machines within reach (far ones need a click). */
  private autoRepair() {
    if (this.state.autoRepair === false || !this.wearOn()) return;
    for (const b of this.state.buildings) {
      if ((b.wear ?? 0) < 1 || b.site) continue;
      if (!this.inReach(b.x, b.y, BUILDINGS[b.type].size)) continue;
      if (!this.repair(b)) return; // out of spare parts
    }
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
    const wf = this.wearTick(b, dt);
    b.status = ratio < 1 ? 'low_power' : wf < 1 ? 'worn' : 'ok';
    const fast = b.type === 'printer' || b.type === 'fabricator' ? this.factor('printer') : 1;
    b.progress += (dt * ratio * wf * this.factor('machine') * fast) / r.seconds;
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
    if (isHall(b.type)) {
      b.working = b.mode === 'pass';
      if (b.mode !== 'pass') return; // store only
    }
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
    if (!isHall(b.type) && Object.values(store).reduce((a, c) => a + (c ?? 0), 0) >= this.storageCap()) b.status = 'blocked';
  }

  /** Merger: the waiting items of its three inputs leave to the front in turn, so no input starves the others. */
  private tickMerger(b: Building) {
    const q = (b.merge ??= [null, null, null]);
    if (!q.some((x) => x)) {
      b.status = 'idle';
      return;
    }
    const start = b.rr ?? 0;
    for (let i = 0; i < 3; i++) {
      const s = (start + i) % 3;
      const item = q[s];
      if (!item) continue;
      if (this.pushDir(b, item, b.dir)) {
        q[s] = null;
        b.rr = (s + 1) % 3;
        b.status = 'ok';
      } else b.status = 'blocked';
      return;
    }
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
      if (i.value !== undefined && (b.type === 'multiplier' || b.type === 'divider' || b.type === 'matrix' || b.type === 'screen' || b.type === 'speaker')) b.value = i.value;
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
      if (s === 'worn' && this.state.autoRepair !== false && this.inReach(b.x, b.y, BUILDINGS[b.type].size) && this.canRepair(b)) continue; // the drones handle it
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

  private challengeMission: MissionDef | null = null;

  /** The running challenge, if any. */
  challenge() {
    return this.state.options.mode === 'challenge' && this.state.challenge ? CHALLENGE_BY_ID[this.state.challenge] ?? null : null;
  }

  /** Parts whose kits must not be printed in this game (challenge quota). */
  printLocked(type: BuildingId): boolean {
    return !!this.challenge()?.noPrint.includes(type);
  }

  currentMission() {
    const ch = this.challenge();
    if (ch) {
      if (this.challengeMission?.id !== ch.id) this.challengeMission = { id: ch.id, deliver: ch.deliver, rate: ch.rate, rateHold: ch.rateHold, unlocks: [], unlockRecipes: [] };
      return this.challengeMission;
    }
    if (this.state.launched && this.state.options.mode !== 'playground') return flightMission(this.state.flights ?? 0);
    return MISSIONS[this.state.missionIndex] ?? null;
  }

  /** Items per minute of `item` that reached the core during the last minute (the current mission's goal items only). */
  deliveryRate(item: ItemId): number {
    const log = this.state.rateLog?.[item];
    if (!log) return 0;
    const t = this.state.time;
    while (log.length && log[0] < t - 60) log.shift();
    return log.length;
  }

  /** Throughput goal of the current mission: met right now, and seconds held so far. */
  rateStatus(): { met: boolean; held: number; hold: number } | null {
    const m = this.currentMission();
    if (!m?.rate) return null;
    let met = true;
    for (const k in m.rate) if (this.deliveryRate(k as ItemId) < m.rate[k as ItemId]!) met = false;
    return { met, held: this.state.rateHeld ?? 0, hold: m.rateHold ?? 45 };
  }

  /** Once a second: share of machines and miners that are working (for the efficiency star). */
  private effT = 0;
  private sampleEfficiency(dt: number) {
    this.effT += dt;
    if (this.effT < 1) return;
    this.effT = 0;
    let n = 0, working = 0;
    for (const b of this.state.buildings) {
      const kind = BUILDINGS[b.type].kind;
      if (b.site || (kind !== 'machine' && kind !== 'miner') || b.status === 'depleted') continue;
      n++;
      if (b.working) working++;
    }
    if (!n) return;
    const e = (this.state.eff ??= { sum: 0, n: 0 });
    e.sum += working / n;
    e.n++;
  }

  /** Average machine utilisation of the current chapter (0..1). */
  efficiency(): number {
    const e = this.state.eff;
    return e && e.n ? e.sum / e.n : 0;
  }

  private checkMission(dt = 0) {
    const m = this.currentMission();
    if (!m) return;
    // the throughput clock runs on its own: it counts while every rate goal is met and restarts when one drops
    const rs = this.rateStatus();
    if (rs) this.state.rateHeld = rs.met ? (this.state.rateHeld ?? 0) + dt : 0;
    for (const k in m.deliver) {
      const have = this.state.launched ? this.state.delivered[k as ItemId] ?? 0 : Math.max(this.state.delivered[k as ItemId] ?? 0, this.state.ship[k as ItemId] ?? 0);
      if (have < m.deliver[k as ItemId]!) return;
    }
    if (rs && (this.state.rateHeld ?? 0) < rs.hold) return;
    if (m.build) for (const k in m.build) if (this.countBuildings(k as BuildingId) < m.build[k as BuildingId]!) return;
    if (this.challenge()) {
      if (this.state.challengeDone === undefined) {
        this.state.challengeDone = this.state.time;
        this.events.push({ type: 'challenge_done', seconds: this.state.time });
      }
      return;
    }
    if (this.state.launched) {
      // a supply flight leaves: its cargo is loaded from the stock, KORA pays with parts
      for (const k in m.deliver) this.addInv(k as ItemId, -Math.min(this.state.inventory[k as ItemId] ?? 0, m.deliver[k as ItemId]!));
      if (m.reward) for (const k in m.reward) this.addInv(k as ItemId, m.reward[k as ItemId]!);
      this.state.delivered = {};
      this.state.rateLog = {};
      this.state.rateHeld = 0;
      this.state.flights = (this.state.flights ?? 0) + 1;
      this.events.push({ type: 'flight', n: this.state.flights });
      return;
    }
    for (const u of m.unlocks) if (!this.state.unlockedBuildings.includes(u)) this.state.unlockedBuildings.push(u);
    for (const r of m.unlockRecipes) if (!this.state.unlockedRecipes.includes(r)) this.state.unlockedRecipes.push(r);
    if (m.reward) for (const k in m.reward) this.addInv(k as ItemId, m.reward[k as ItemId]!);
    this.state.delivered = {};
    this.state.rateLog = {};
    this.state.rateHeld = 0;
    this.state.missionIndex++;
    this.events.push({ type: 'mission', index: this.state.missionIndex - 1 });
    if (this.state.missionIndex >= MISSIONS.length) {
      this.state.launched = true;
      this.events.push({ type: 'launch' });
    }
  }
}
