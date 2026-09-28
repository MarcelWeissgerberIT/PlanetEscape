import type { BuildingDef, BuildingId, ItemDef, ItemId, MissionDef, RecipeDef, TerrainId, UpgradeId } from './types';

export const ITEMS: Record<ItemId, ItemDef> = {
  iron_ore: { id: 'iron_ore', color: '#b5654a', tier: 0 },
  copper_ore: { id: 'copper_ore', color: '#d98a3a', tier: 0 },
  quartz: { id: 'quartz', color: '#c9b8ff', tier: 0 },
  ice: { id: 'ice', color: '#bfeaff', tier: 0 },
  oil: { id: 'oil', color: '#2f4a3a', tier: 0 },
  iron_plate: { id: 'iron_plate', color: '#9aa4ad', tier: 1 },
  copper_plate: { id: 'copper_plate', color: '#e0813f', tier: 1 },
  copper_wire: { id: 'copper_wire', color: '#f0a050', tier: 2 },
  glass: { id: 'glass', color: '#a8e8f5', tier: 1 },
  silicon: { id: 'silicon', color: '#3b3f6b', tier: 1 },
  water: { id: 'water', color: '#4fa8ff', tier: 1 },
  fuel: { id: 'fuel', color: '#7ee36a', tier: 1 },
  steel_frame: { id: 'steel_frame', color: '#6c7580', tier: 2 },
  circuit: { id: 'circuit', color: '#2fbf71', tier: 2 },
  machine_part: { id: 'machine_part', color: '#a3a9b3', tier: 2 },
  precision_part: { id: 'precision_part', color: '#5eead4', tier: 2 },
  hull_plate: { id: 'hull_plate', color: '#d7dde3', tier: 3 },
  engine: { id: 'engine', color: '#ff7a1a', tier: 3 },
  nav_computer: { id: 'nav_computer', color: '#22d3ee', tier: 3 },
  fuel_cell: { id: 'fuel_cell', color: '#b4f542', tier: 3 },
  life_support: { id: 'life_support', color: '#7cf0d0', tier: 3 },
  // components of the newer machines: they have to be produced, not just paid from the starting stock
  motor: { id: 'motor', color: '#f59e0b', tier: 2 },
  cell: { id: 'cell', color: '#34d399', tier: 2 },
  robot: { id: 'robot', color: '#22d3ee', tier: 3 },
};

export const ITEM_ORDER: ItemId[] = Object.keys(ITEMS) as ItemId[];


export const TERRAIN_ITEM: Record<TerrainId, ItemId | null> = {
  ground: null,
  rock: null,
  iron_ore: 'iron_ore',
  copper_ore: 'copper_ore',
  quartz: 'quartz',
  ice: 'ice',
  oil: 'oil',
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  core: { id: 'core', kind: 'core', size: 3, cost: {}, power: -10, rotatable: false, hidden: true },
  conveyor: { id: 'conveyor', kind: 'conveyor', size: 1, cost: { iron_plate: 1 }, power: 0, rotatable: true },
  miner: { id: 'miner', kind: 'miner', size: 1, cost: { iron_plate: 6, copper_plate: 2 }, power: 2, rotatable: true, placeOn: 'deposit' },
  smelter: { id: 'smelter', kind: 'machine', size: 1, cost: { iron_plate: 8 }, power: 3, rotatable: true },
  printer: { id: 'printer', kind: 'machine', size: 2, cost: { iron_plate: 20, copper_plate: 10 }, power: 4, rotatable: true },
  assembler: { id: 'assembler', kind: 'machine', size: 2, cost: { machine_part: 6, copper_plate: 6 }, power: 4, rotatable: true },
  refinery: { id: 'refinery', kind: 'machine', size: 2, cost: { machine_part: 8, steel_frame: 4, glass: 4 }, power: 5, rotatable: true },
  fabricator: { id: 'fabricator', kind: 'machine', size: 2, cost: { precision_part: 8, steel_frame: 8, glass: 6 }, power: 8, rotatable: true },
  solar: { id: 'solar', kind: 'power', size: 1, cost: { iron_plate: 4, copper_plate: 4 }, power: -4, rotatable: false },
  generator: { id: 'generator', kind: 'power', size: 2, cost: { machine_part: 6, circuit: 4, glass: 4 }, power: -20, rotatable: true },
  storage: { id: 'storage', kind: 'storage', size: 1, cost: { iron_plate: 8 }, power: 0, rotatable: true },
  splitter: { id: 'splitter', kind: 'splitter', size: 1, cost: { iron_plate: 4 }, power: 0, rotatable: true },
  tunnel: { id: 'tunnel', kind: 'tunnel', size: 1, cost: { iron_plate: 5 }, power: 0, rotatable: true },
  sorter: { id: 'sorter', kind: 'logic', size: 1, cost: { iron_plate: 6, copper_plate: 2 }, power: 0, rotatable: true },
  overflow: { id: 'overflow', kind: 'logic', size: 1, cost: { iron_plate: 6 }, power: 0, rotatable: true },
  mixer: { id: 'mixer', kind: 'logic', size: 1, cost: { iron_plate: 8, copper_wire: 4 }, power: 0, rotatable: true },
  valve: { id: 'valve', kind: 'logic', size: 1, cost: { iron_plate: 6, circuit: 2 }, power: 0, rotatable: true },
  // display & control elements: a lamp is one pixel, a switch is a hand-operated gate
  lamp: { id: 'lamp', kind: 'logic', size: 1, cost: { iron_plate: 2, copper_wire: 1 }, power: 0, rotatable: true },
  // 8x8 RGB LED matrix: 64 pixels on one tile, any colour; a terminal drives 8x4 of them as its display, belts fill it pixel by pixel
  matrix: { id: 'matrix', kind: 'logic', size: 1, cost: { iron_plate: 4, circuit: 2, glass: 1 }, power: 0, rotatable: false },
  // video receiver: streams a shared browser tab, the camera or a video file onto the matrices / lamps right of it
  screen: { id: 'screen', kind: 'logic', size: 1, cost: { circuit: 4, glass: 4, copper_wire: 6 }, power: 2, rotatable: false },
  // speaker: plays the receiver's sound when wired to it (touching or via bus traces), shows a VU meter
  speaker: { id: 'speaker', kind: 'logic', size: 1, cost: { iron_plate: 4, copper_wire: 4 }, power: 1, rotatable: false },
  // keyboard: typed characters go to the terminal it is wired to (LD Vx, KB in the program)
  keyboard: { id: 'keyboard', kind: 'logic', size: 2, cost: { iron_plate: 6, copper_wire: 8, circuit: 2 }, power: 1, rotatable: false },
  // circuit helpers: a timer opens every n seconds, a sensor pulses its sides when an item runs through,
  // a radio carries items over any distance on a channel (tx -> rx), a battery stores surplus power
  // a grabber arm: takes one item at a time from the building or belt behind it and puts it into the one in front (reach 1 or 2)
  picker: { id: 'picker', kind: 'logic', size: 1, cost: { iron_plate: 3, motor: 1 }, power: 1, rotatable: true },
  // roads and robots: a depot sends its robots over road tiles between loading docks
  road: { id: 'road', kind: 'road', size: 1, cost: { iron_plate: 1 }, power: 0, rotatable: false },
  dock: { id: 'dock', kind: 'logic', size: 1, cost: { iron_plate: 4, motor: 1 }, power: 1, rotatable: true },
  depot: { id: 'depot', kind: 'logic', size: 2, cost: { iron_plate: 10, steel_frame: 2, circuit: 2 }, power: 4, rotatable: false },
  // a stacker packs eight equal items into one crate (an item of its own on the belt); in unpack mode it opens crates again
  stacker: { id: 'stacker', kind: 'logic', size: 1, cost: { iron_plate: 6, motor: 2 }, power: 2, rotatable: true },
  // warehouses: big depots that take any item from every side and show their shelves; output only when switched on
  hall4: { id: 'hall4', kind: 'storage', size: 4, cost: { iron_plate: 20, steel_frame: 4 }, power: 0, rotatable: true },
  hall8: { id: 'hall8', kind: 'storage', size: 8, cost: { iron_plate: 60, steel_frame: 12, circuit: 2 }, power: 1, rotatable: true },
  hall12: { id: 'hall12', kind: 'storage', size: 12, cost: { iron_plate: 120, steel_frame: 24, circuit: 4 }, power: 2, rotatable: true },
  hall16: { id: 'hall16', kind: 'storage', size: 16, cost: { iron_plate: 200, steel_frame: 40, circuit: 8 }, power: 3, rotatable: true },
  // power plants next to solar: a wind turbine (wind changes, storms help) and a fusion plant burning water
  wind: { id: 'wind', kind: 'power', size: 2, cost: { iron_plate: 10, copper_wire: 6, motor: 2 }, power: -8, rotatable: false },
  reactor: { id: 'reactor', kind: 'power', size: 3, cost: { steel_frame: 20, circuit: 10, precision_part: 6, glass: 10 }, power: -60, rotatable: false },
  // puts the kits of far construction sites on a belt (must stand within the core's reach)
  kitport: { id: 'kitport', kind: 'logic', size: 1, cost: { iron_plate: 6, copper_wire: 4 }, power: 1, rotatable: true },
  // radio mast: relays radio bridges (tx -> rx) beyond their own range
  mast: { id: 'mast', kind: 'logic', size: 1, cost: { iron_plate: 4, copper_wire: 4, circuit: 1 }, power: 1, rotatable: false },
  timer: { id: 'timer', kind: 'logic', size: 1, cost: { iron_plate: 4, copper_wire: 2, circuit: 1 }, power: 1, rotatable: true },
  sensor: { id: 'sensor', kind: 'logic', size: 1, cost: { iron_plate: 3, copper_wire: 2 }, power: 0, rotatable: true },
  radio: { id: 'radio', kind: 'logic', size: 1, cost: { circuit: 2, copper_wire: 6, cell: 1 }, power: 3, rotatable: true },
  battery: { id: 'battery', kind: 'power', size: 1, cost: { iron_plate: 4, cell: 4 }, power: 0, rotatable: false },
  switch: { id: 'switch', kind: 'logic', size: 1, cost: { iron_plate: 3 }, power: 0, rotatable: true },
  // an 8-bit computer (CHIP-8): drives a 64x32 lamp display to its right, reads switches on its rim as keys
  terminal: { id: 'terminal', kind: 'logic', size: 2, cost: { machine_part: 10, steel_frame: 4 }, power: 6, rotatable: false },
  // arithmetic in items: a number is a count of items. register stores a count and releases it on a signal;
  // adder merges (a+b), subtractor cancels (a-b), multiplier emits k per item (a*k), divider emits 1 per k items (a/k)
  register: { id: 'register', kind: 'logic', size: 1, cost: { iron_plate: 6, circuit: 1 }, power: 0, rotatable: true },
  // mainboard parts: an oscillator holds crystals (clock), a bus trace connects parts; registers touching the board are RAM cells (1 byte each)
  oscillator: { id: 'oscillator', kind: 'logic', size: 1, cost: { iron_plate: 4, copper_wire: 2 }, power: 1, rotatable: false },
  bus: { id: 'bus', kind: 'logic', size: 1, cost: { copper_wire: 1 }, power: 0, rotatable: false },
  adder: { id: 'adder', kind: 'logic', size: 1, cost: { iron_plate: 6, copper_wire: 4 }, power: 1, rotatable: true },
  subtractor: { id: 'subtractor', kind: 'logic', size: 1, cost: { iron_plate: 6, copper_wire: 4 }, power: 1, rotatable: true },
  multiplier: { id: 'multiplier', kind: 'logic', size: 1, cost: { iron_plate: 8, circuit: 1 }, power: 1, rotatable: true },
  divider: { id: 'divider', kind: 'logic', size: 1, cost: { iron_plate: 8, circuit: 1 }, power: 1, rotatable: true },
};

export const MIXER_RATIOS: [number, number][] = [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1]];
export const VALVE_THRESHOLDS = [10, 20, 50, 100, 200, 500];

export const TUNNEL_RANGE = 4; // max tiles between entrance and exit

/** Seconds the core needs to print a building kit: grows with the material in it. */
export function printSeconds(id: BuildingId): number {
  const cost = BUILDINGS[id].cost;
  let n = 0;
  for (const k in cost) n += cost[k as ItemId] ?? 0;
  return Math.min(40, Math.round((0.2 + 0.12 * n) * 10) / 10);
}

export const BUILD_ORDER: BuildingId[] = [
  'conveyor',
  'miner',
  'smelter',
  'storage',
  'hall4',
  'hall8',
  'hall12',
  'hall16',
  'printer',
  'solar',
  'wind',
  'assembler',
  'splitter',
  'tunnel',
  'sorter',
  'overflow',
  'mixer',
  'valve',
  'picker',
  'road',
  'dock',
  'kitport',
  'mast',
  'depot',
  'stacker',
  'lamp',
  'matrix',
  'screen',
  'speaker',
  'keyboard',
  'timer',
  'sensor',
  'radio',
  'battery',
  'switch',
  'terminal',
  'oscillator',
  'bus',
  'register',
  'adder',
  'subtractor',
  'multiplier',
  'divider',
  'refinery',
  'generator',
  'reactor',
  'fabricator',
];

export const RECIPES: RecipeDef[] = [
  // Smelter (auto-selects by input)
  { id: 'iron_plate', machine: 'smelter', auto: true, inputs: { iron_ore: 1 }, output: 'iron_plate', outputCount: 1, seconds: 2 },
  { id: 'copper_plate', machine: 'smelter', auto: true, inputs: { copper_ore: 1 }, output: 'copper_plate', outputCount: 1, seconds: 2 },
  { id: 'glass', machine: 'smelter', auto: true, inputs: { quartz: 1 }, output: 'glass', outputCount: 1, seconds: 2.5 },
  // Assembler
  { id: 'copper_wire', machine: 'assembler', inputs: { copper_plate: 1 }, output: 'copper_wire', outputCount: 2, seconds: 1.5 },
  { id: 'steel_frame', machine: 'assembler', inputs: { iron_plate: 3 }, output: 'steel_frame', outputCount: 1, seconds: 3 },
  { id: 'circuit', machine: 'assembler', inputs: { iron_plate: 1, copper_wire: 2 }, output: 'circuit', outputCount: 1, seconds: 3 },
  { id: 'motor', machine: 'assembler', inputs: { machine_part: 1, copper_wire: 2 }, output: 'motor', outputCount: 1, seconds: 4 },
  { id: 'cell', machine: 'assembler', inputs: { copper_plate: 2, glass: 1 }, output: 'cell', outputCount: 1, seconds: 3 },
  { id: 'robot', machine: 'assembler', inputs: { motor: 2, cell: 1, circuit: 1 }, output: 'robot', outputCount: 1, seconds: 8 },
  { id: 'hull_plate', machine: 'fabricator', inputs: { steel_frame: 2, glass: 1 }, output: 'hull_plate', outputCount: 1, seconds: 5 },
  { id: 'life_support', machine: 'fabricator', inputs: { glass: 2, circuit: 1, water: 2 }, output: 'life_support', outputCount: 1, seconds: 6 },
  { id: 'engine', machine: 'fabricator', inputs: { steel_frame: 3, circuit: 2, fuel: 1 }, output: 'engine', outputCount: 1, seconds: 8 },
  { id: 'nav_computer', machine: 'fabricator', inputs: { circuit: 3, silicon: 2, glass: 1 }, output: 'nav_computer', outputCount: 1, seconds: 8 },
  { id: 'fuel_cell', machine: 'fabricator', inputs: { steel_frame: 1, fuel: 3 }, output: 'fuel_cell', outputCount: 1, seconds: 5 },
  // 3D printer (auto-selects by input)
  { id: 'machine_part', machine: 'printer', auto: true, inputs: { iron_plate: 2, copper_wire: 1 }, output: 'machine_part', outputCount: 1, seconds: 4 },
  { id: 'precision_part', machine: 'printer', auto: true, inputs: { steel_frame: 1, circuit: 1 }, output: 'precision_part', outputCount: 1, seconds: 6 },
  // Refinery
  { id: 'water', machine: 'refinery', inputs: { ice: 1 }, output: 'water', outputCount: 2, seconds: 2 },
  { id: 'fuel', machine: 'refinery', inputs: { oil: 1, water: 1 }, output: 'fuel', outputCount: 2, seconds: 3 },
  { id: 'silicon', machine: 'refinery', inputs: { quartz: 2, water: 1 }, output: 'silicon', outputCount: 1, seconds: 4 },
];

export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function recipesFor(machine: RecipeDef['machine']): RecipeDef[] {
  return RECIPES.filter((r) => r.machine === machine);
}

/** The ship: what has to be delivered to the Landing Core to launch. */
export const SHIP_PARTS: Partial<Record<ItemId, number>> = {
  hull_plate: 30,
  engine: 6,
  nav_computer: 4,
  fuel_cell: 14,
  life_support: 6,
};
export const SHIP_PART_IDS = Object.keys(SHIP_PARTS) as ItemId[];
export const SHIP_TOTAL = Object.values(SHIP_PARTS).reduce((a, c) => a + (c ?? 0), 0);

/** Minimum machine utilisation for the third star of a chapter. */
export const STAR_EFFICIENCY = 0.45;

export const MISSIONS: MissionDef[] = [
  { id: 'm1', deliver: { iron_ore: 10 }, unlocks: ['smelter'], unlockRecipes: ['iron_plate', 'copper_plate'] },
  { id: 'm2', rate: { iron_plate: 10 }, rateHold: 45, deliver: { iron_plate: 20, copper_plate: 10 }, unlocks: ['assembler', 'printer', 'storage', 'kitport'], unlockRecipes: ['copper_wire', 'machine_part'], reward: { machine_part: 8 } },
  { id: 'm3', rate: { machine_part: 4 }, rateHold: 45, deliver: { machine_part: 6 }, build: { printer: 1 }, unlocks: ['solar', 'wind', 'splitter', 'tunnel', 'sorter', 'overflow', 'picker', 'lamp', 'speaker', 'switch', 'sensor'], unlockRecipes: ['steel_frame', 'motor'] },
  { id: 'm4', rate: { copper_wire: 8, steel_frame: 3 }, rateHold: 45, deliver: { copper_wire: 10, steel_frame: 6 }, unlocks: ['road', 'dock', 'depot', 'battery', 'hall4', 'hall8', 'matrix', 'screen', 'keyboard', 'timer'], unlockRecipes: ['circuit', 'glass', 'cell', 'robot'] },
  { id: 'm5', rate: { circuit: 4 }, rateHold: 45, deliver: { circuit: 8, glass: 6 }, unlocks: ['refinery', 'mixer', 'valve', 'terminal', 'oscillator', 'bus', 'radio', 'mast', 'stacker', 'hall12', 'hall16', 'register', 'adder', 'subtractor', 'multiplier', 'divider'], unlockRecipes: ['water', 'fuel', 'precision_part'] },
  { id: 'm6', rate: { precision_part: 2 }, rateHold: 45, deliver: { water: 10, fuel: 6, precision_part: 6 }, unlocks: ['generator', 'reactor', 'fabricator'], unlockRecipes: ['silicon', 'hull_plate', 'life_support', 'engine', 'nav_computer', 'fuel_cell'] },
  { id: 'm7', deliver: { ...SHIP_PARTS }, unlocks: [], unlockRecipes: [] },
];

export const STARTING_INVENTORY: Partial<Record<ItemId, number>> = {
  iron_plate: 70,
  copper_plate: 12,
};

export const STARTING_BUILDINGS: BuildingId[] = ['conveyor', 'miner'];
export const STARTING_RECIPES: string[] = [];

export const BELT_SPEED = 1.6; // tiles per second
export const BELT_SPACING = 0.35; // min distance between items on a belt (about 270 items per minute)
export const ORE_BULK = 1.8; // raw materials (ores, ice, oil) are bulky: they need this much more belt space
/** Belt space an item needs: raw materials are bulky, crates and everything made are compact. */
export function itemSpacing(id: string): number {
  if (id.startsWith('crate:') || id.startsWith('kit:')) return BELT_SPACING;
  return ITEMS[id as ItemId]?.tier === 0 ? BELT_SPACING * ORE_BULK : BELT_SPACING;
}
export const BUFFER_CAP = 6; // max per input item in a machine
export const OUTPUT_CAP = 6;
export const STORAGE_CAP = 120;
export const MINE_SECONDS = 1.6;
export const GENERATOR_FUEL_SECONDS = 12; // seconds of full power per fuel unit
/** Fuel of the power plants that burn something: item and seconds of full power per unit. */
export const PLANT_FUEL: Partial<Record<BuildingId, { item: ItemId; seconds: number }>> = { generator: { item: 'fuel', seconds: GENERATOR_FUEL_SECONDS }, reactor: { item: 'water', seconds: 8 } }; // fusion: one water every 8 s

// ---------- Upgrades (bought from KORA with printed parts) ----------
export interface UpgradeDef {
  id: UpgradeId;
  maxLevel: number;
  cost: (level: number) => Partial<Record<ItemId, number>>; // cost to reach `level` (1-based)
  factor: (level: number) => number; // multiplier at `level`
  requires?: { id: UpgradeId; level: number }; // research tree: prerequisite track and level
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'belt', maxLevel: 3, cost: (l) => ({ machine_part: 6 * l, copper_wire: 10 * l }), factor: (l) => 1 + 0.35 * l },
  { id: 'miner', maxLevel: 3, cost: (l) => ({ machine_part: 8 * l, iron_plate: 20 * l }), factor: (l) => 1 + 0.3 * l },
  { id: 'machine', maxLevel: 3, cost: (l) => (l < 3 ? { machine_part: 10 * l, circuit: 6 * l } : { precision_part: 10, circuit: 20 }), factor: (l) => 1 + 0.25 * l },
  { id: 'power', maxLevel: 3, cost: (l) => ({ machine_part: 6 * l, glass: 8 * l }), factor: (l) => 1 + 0.4 * l },
  // second tier of the research tree
  { id: 'yield', maxLevel: 3, cost: (l) => ({ machine_part: 8 * l, glass: 6 * l }), factor: (l) => 1 + 0.5 * l, requires: { id: 'miner', level: 1 } },
  { id: 'buffer', maxLevel: 2, cost: (l) => ({ steel_frame: 6 * l, machine_part: 6 * l }), factor: (l) => 1 + 0.5 * l, requires: { id: 'machine', level: 1 } },
  { id: 'printer', maxLevel: 2, cost: (l) => ({ precision_part: 6 * l, circuit: 8 * l }), factor: (l) => 1 + 0.3 * l, requires: { id: 'machine', level: 2 } },
];
export const UPGRADE_DEFAULTS = (): Record<UpgradeId, number> => Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>;

// ---------- Events: KORA reports a situation, the player decides ----------
export const EVENT_INTERVAL: [number, number] = [360, 720]; // seconds between events
export const EVENT_DECIDE_SECONDS = 90;
export const EVENT_MIN_MISSION = 2;
export const METEOR_ORE: [number, number] = [140, 260];
export const BOOST_SECONDS = 120;
export const TERMINAL_HZ = 600; // CHIP-8 instructions per second at full power and all crystals
export const TERMINAL_RAM_BANKS = 16; // circuits -> 256 B each = 4 KB
export const TERMINAL_BANK_BYTES = 256;
export const TERMINAL_CRYSTALS = 6; // quartz / glass -> 100 Hz each
export const REGISTER_MAX = 255;
export const MATRIX_SIZE = 8; // default pixels per side of an LED matrix
export const MATRIX_SIZES = [4, 8, 16, 32, 64]; // selectable LEDs per side
export const MATRIX_SAVE_MAX = 16; // pictures of larger matrices are live only (a 64x64 wall would not fit the browser store)
export const SCREEN_MAX_PX = 1024; // widest frame a receiver samples
export const SCREEN_PX_PER_ITEM = 1_000_000; // one delivered item = a million pixel updates
export const SCREEN_BUDGET_MAX = 40 * SCREEN_PX_PER_ITEM;
export const SCREEN_BASE_HZ = 100; // the receiver's own little clock; oscillators on its board add to it
export const SCREEN_PX_PER_LANE_TICK = 64; // pixels one bus lane into the wall carries per clock tick
export const SCREEN_PX_PER_CELL = 4096; // frame buffer a register on the receiver's board provides
export const SCREEN_TINT = 0.35; // how much the delivered item's colour tints the picture
export const SCREEN_SAMPLE_RATE = 4;
/** Build menu tabs. */
export const BUILD_GROUPS: { id: 'logistics' | 'storage' | 'production' | 'energy' | 'circuit' | 'computer'; items: BuildingId[] }[] = [
  { id: 'logistics', items: ['conveyor', 'tunnel', 'splitter', 'sorter', 'overflow', 'mixer', 'valve', 'picker', 'kitport', 'road', 'dock', 'depot', 'radio', 'mast'] },
  { id: 'storage', items: ['storage', 'hall4', 'hall8', 'hall12', 'hall16', 'stacker'] },
  { id: 'production', items: ['miner', 'smelter', 'assembler', 'printer', 'refinery', 'fabricator'] },
  { id: 'energy', items: ['solar', 'wind', 'battery', 'generator', 'reactor'] },
  { id: 'circuit', items: ['lamp', 'matrix', 'switch', 'timer', 'sensor', 'bus', 'register', 'adder', 'subtractor', 'multiplier', 'divider'] },
  { id: 'computer', items: ['terminal', 'oscillator', 'keyboard', 'screen', 'speaker'] },
];
/** Warehouse sizes (tiles per side); every tile is one shelf slot. */
export const HALL_SIZE: Partial<Record<BuildingId, number>> = { hall4: 4, hall8: 8, hall12: 12, hall16: 16 };
export function isHall(id: BuildingId): boolean {
  return HALL_SIZE[id] !== undefined;
}
export const HALL_SLOT_CAP = 50; // items per shelf slot
export const WIND_STORM_FACTOR = 1.6;
/** Construction logistics: the core builds directly within CORE_REACH tiles; farther sites need their kit delivered. */
export const CORE_REACH = 14;
export const CORE_DRONES = 2; // construction drones of the core (slow fallback for far sites)
export const DRONE_SPEED = 3; // tiles per second
export const DRONE_DELAY = 8; // seconds a far site waits for a kit port before a drone takes it
export const KITPORT_RATE = 1; // kits per second a kit port puts out
export const KIT_TRANSIT_TIMEOUT = 90; // a kit sent by belt that never arrives: after this a drone brings one
export const KIT_PREFIX = 'kit:';
export function isKit(id: string): boolean {
  return id.startsWith(KIT_PREFIX);
}
export function kitOf(id: string): BuildingId | null {
  return isKit(id) ? (id.slice(KIT_PREFIX.length) as BuildingId) : null;
}
export function kitId(type: BuildingId): ItemId {
  return (KIT_PREFIX + type) as ItemId;
}
export const PICKER_RATE = 1; // items per second a grabber arm moves
export const PICKER_REACH = [1, 2]; // tiles between the arm and its source / target
export const ROBOT_SPEED = 3; // tiles per second on a road
export const ROBOT_CAP = 8; // items one robot carries
export const ROBOT_RATE = 4; // items per second loaded / unloaded at a dock
export const DOCK_CAP = 8; // items a dock buffers
export const DEPOT_ROBOTS_MAX = 4;
export const ROBOT_DRAIN = 0.004; // battery used per tile driven (about 250 tiles on a full charge)
export const ROBOT_DRAIN_WORK = 0.003; // battery used per item loaded or unloaded
export const ROBOT_LOW = 0.3; // below this a robot without cargo drives home to charge
export const ROBOT_CHARGE_RATE = 0.2; // battery charged per second in a depot bay (5 s from empty)
export const ROBOT_LIMP = 0.35; // speed factor with an empty battery
export const TIMER_PERIODS = [1, 2, 3, 5, 10, 30]; // seconds between two openings
export const TIMER_OPEN = 0.5; // seconds the timer stays open
export const RADIO_CHANNELS = 8;
export const RADIO_QUEUE = 8; // items in flight per channel
export const RADIO_RATE = 2; // items per second a receiver puts out
export const RADIO_RANGE = 20; // tiles a radio bridge or mast reaches (masts relay further)
export const BATTERY_CAP = 300; // power-seconds one battery stores
export const BATTERY_RATE = 10; // power one battery can deliver
/** Program ids a program may start with EXEC n (n = index + 1); KDOS lists them as files. */
export const EXEC_PROGRAMS = ['pong', 'brix', 'ray', 'blockshd', 'trailer', 'kdos', 'kora']; // colour samples per second the receiver puts on the belt to its left
export const SCREEN_SCAN_STEP = 97; // pixels skipped between two scan samples (prime: walks the whole frame)
/** Pixels per side of a matrix: 8x8 by default. */
export function matrixSize(b: { value?: number }): number {
  return b.value && MATRIX_SIZES.includes(b.value) ? b.value : MATRIX_SIZE;
}
export const SCREEN_REGION = { dx: 2, w: 8, h: 4 }; // receiver display: 8x4 matrices (64x32 px) per scale step, right of the receiver
/** Item colour as a packed 0xRRGGBB number (LED matrix pixels). */
/** Crates: eight equal items packed by a stacker travel as one belt item whose id is `crate:<item>`. */
export const CRATE_SIZE = 8;
export const CRATE_PREFIX = 'crate:';
export function isCrate(id: string): boolean {
  return id.startsWith(CRATE_PREFIX);
}
export function crateOf(id: string): ItemId | null {
  return isCrate(id) ? (id.slice(CRATE_PREFIX.length) as ItemId) : null;
}
export function crateId(item: ItemId): ItemId {
  return (CRATE_PREFIX + item) as ItemId;
}
/** Fallback colour of an item (crates take their content's colour). */
export function itemColor(id: string): string {
  if (id.startsWith('kit:')) return '#38bdf8';
  return ITEMS[(crateOf(id) ?? id) as ItemId]?.color ?? '#b45309';
}
export function itemRgb(id: ItemId): number {
  return parseInt(itemColor(id).replace('#', ''), 16) || 0x22d3ee;
}
/** Display colours: pixel value (plane bitmask 1..15) -> item whose colour the lamp shows; 1 = the terminal's own colour item. */
export const CHIP8_PALETTE: (ItemId | null)[] = [null, null, 'iron_ore', 'iron_plate', 'fuel', 'copper_ore', 'circuit', 'water', 'hull_plate', 'engine', 'quartz', 'ice', 'precision_part', 'fuel_cell', 'nav_computer', 'oil'];
export const OSCILLATOR_CRYSTALS = 3; // crystals one oscillator holds
export const CRYSTAL_HZ = { quartz: 100, glass: 2000 }; // glass = turbo crystal
export const TERMINAL_HZ_MAX = 60000;
export const CHIP_ROM_BYTES = 0x200; // interpreter area + font live on the chip itself; every program byte needs a RAM cell or a bank
export const BOARD_PARTS: Set<BuildingId> = new Set(['bus', 'register', 'oscillator']);
export const TERMINAL_DISPLAY = { dx: 3, dy: 0, w: 64, h: 32 }; // lamp display region relative to the terminal
export const TERMINAL_TRACE = { dx: 0, dy: -23, w: 8, h: 22 }; // register lamps above the terminal: PC, opcode, I, V0-VF (one byte per row)
export const TERMINAL_TRACE_HZ = 2;
export const SWITCH_PULSE_SECONDS = 0.25; // items on a belt arrive every 0.175 s, so a burst reads as one continuous press
export const BOOST_FACTOR = 1.5;
export const HARD_ORE_FACTOR = 0.6;
export const HARD_STORM_FACTOR = 0.6;
export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

// ---------- Contracts: optional timed side orders from KORA ----------
export const CONTRACT_ITEMS: { item: ItemId; minMission: number; amount: [number, number]; seconds: number; reward: (n: number) => Partial<Record<ItemId, number>> }[] = [
  { item: 'iron_plate', minMission: 1, amount: [20, 40], seconds: 360, reward: (n) => ({ copper_plate: Math.round(n * 0.5) }) },
  { item: 'copper_plate', minMission: 1, amount: [15, 30], seconds: 360, reward: (n) => ({ iron_plate: n }) },
  { item: 'machine_part', minMission: 2, amount: [6, 14], seconds: 480, reward: (n) => ({ glass: n }) },
  { item: 'copper_wire', minMission: 3, amount: [20, 40], seconds: 420, reward: (n) => ({ machine_part: Math.round(n / 5) }) },
  { item: 'steel_frame', minMission: 3, amount: [10, 20], seconds: 480, reward: (n) => ({ machine_part: Math.round(n / 3) }) },
  { item: 'circuit', minMission: 4, amount: [10, 24], seconds: 540, reward: (n) => ({ precision_part: Math.round(n / 4) }) },
  { item: 'glass', minMission: 4, amount: [15, 30], seconds: 420, reward: (n) => ({ machine_part: Math.round(n / 4) }) },
  { item: 'fuel', minMission: 5, amount: [10, 24], seconds: 540, reward: (n) => ({ precision_part: Math.round(n / 4) }) },
  { item: 'silicon', minMission: 6, amount: [8, 16], seconds: 600, reward: (n) => ({ precision_part: Math.round(n / 3) }) },
  { item: 'precision_part', minMission: 6, amount: [6, 12], seconds: 720, reward: (n) => ({ hull_plate: Math.round(n / 3) }) },
];
export const CONTRACT_INTERVAL = 240; // seconds between offers
/** Automation contracts: from this mission on, this share of the offers asks for controlled deliveries. */
export const AUTOMATION_MIN_MISSION = 3;
export const AUTOMATION_SHARE = 0.4;
export const STORM_INTERVAL: [number, number] = [420, 900];
export const STORM_SECONDS = 60;
export const STORM_SOLAR_FACTOR = 0.35;
export const ORE_PER_TILE: [number, number] = [220, 420];

// ---------- Story chapters: small fixed maps that grow with each order ----------
export interface LevelDef {
  seed: number;
  size: number;
  basics: { type: TerrainId; dist: number; r: number }[]; // guaranteed deposits near the core
  extraTypes: TerrainId[];
  extra: number; // additional random deposits
  rocks: number; // rock formations
  storms: boolean;
  contracts: boolean;
  inventory: Partial<Record<ItemId, number>>;
  kits?: Partial<Record<BuildingId, number>>; // building kits the chapter starts with
  par: number; // seconds for a three-star finish
}

export const LEVELS: LevelDef[] = [
  { seed: 1101, size: 36, basics: [{ type: 'iron_ore', dist: 5, r: 2.2 }], extraTypes: [], extra: 0, rocks: 0, storms: false, contracts: false, inventory: { iron_plate: 60, copper_plate: 10 }, par: 240 },
  { seed: 1202, size: 40, basics: [{ type: 'iron_ore', dist: 6, r: 2.4 }, { type: 'copper_ore', dist: 7, r: 2.2 }], extraTypes: [], extra: 0, rocks: 0, storms: false, contracts: false, inventory: { iron_plate: 90, copper_plate: 20 }, par: 420 },
  { seed: 1303, size: 44, basics: [{ type: 'iron_ore', dist: 6, r: 2.6 }, { type: 'copper_ore', dist: 8, r: 2.4 }, { type: 'iron_ore', dist: 12, r: 2.2 }], extraTypes: [], extra: 0, rocks: 3, storms: false, contracts: false, inventory: { iron_plate: 160, copper_plate: 70 }, kits: { assembler: 1, conveyor: 30 }, par: 600 },
  { seed: 1404, size: 52, basics: [{ type: 'iron_ore', dist: 7, r: 2.6 }, { type: 'copper_ore', dist: 8, r: 2.6 }, { type: 'quartz', dist: 12, r: 2.0 }, { type: 'iron_ore', dist: 14, r: 2.4 }], extraTypes: ['copper_ore'], extra: 1, rocks: 6, storms: false, contracts: true, inventory: { iron_plate: 140, copper_plate: 60 }, kits: { assembler: 3, printer: 1, conveyor: 40 }, par: 780 },
  { seed: 1505, size: 60, basics: [{ type: 'iron_ore', dist: 7, r: 2.8 }, { type: 'copper_ore', dist: 9, r: 2.6 }, { type: 'quartz', dist: 11, r: 2.4 }, { type: 'iron_ore', dist: 15, r: 2.4 }, { type: 'copper_ore', dist: 17, r: 2.2 }], extraTypes: ['quartz', 'iron_ore'], extra: 2, rocks: 10, storms: false, contracts: true, inventory: { iron_plate: 180, copper_plate: 70 }, kits: { assembler: 4, printer: 1, hall4: 1, conveyor: 50 }, par: 960 },
  { seed: 1606, size: 72, basics: [{ type: 'iron_ore', dist: 7, r: 2.8 }, { type: 'copper_ore', dist: 9, r: 2.6 }, { type: 'quartz', dist: 12, r: 2.4 }, { type: 'ice', dist: 12, r: 2.4 }, { type: 'oil', dist: 15, r: 2.0 }, { type: 'iron_ore', dist: 18, r: 2.6 }], extraTypes: ['copper_ore', 'ice', 'quartz'], extra: 3, rocks: 16, storms: true, contracts: true, inventory: { iron_plate: 260, copper_plate: 110 }, kits: { assembler: 6, printer: 2, refinery: 3, mixer: 1, miner: 4, smelter: 3, solar: 2, conveyor: 80 }, par: 1260 },
  { seed: 1707, size: 96, basics: [{ type: 'iron_ore', dist: 7, r: 3.0 }, { type: 'copper_ore', dist: 9, r: 2.8 }, { type: 'quartz', dist: 12, r: 2.6 }, { type: 'ice', dist: 13, r: 2.6 }, { type: 'oil', dist: 15, r: 2.4 }, { type: 'iron_ore', dist: 19, r: 3.0 }, { type: 'copper_ore', dist: 21, r: 2.6 }], extraTypes: ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil'], extra: 10, rocks: 30, storms: true, contracts: true, inventory: { iron_plate: 340, copper_plate: 140 }, kits: { assembler: 8, printer: 3, refinery: 4, fabricator: 4, generator: 1, mixer: 1, miner: 6, smelter: 4, solar: 4, conveyor: 120 }, par: 1800 },
];
