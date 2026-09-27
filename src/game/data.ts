import type { BuildingDef, BuildingId, ItemDef, ItemId, MissionDef, RecipeDef, TerrainId } from './types';

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
  hull_plate: { id: 'hull_plate', color: '#d7dde3', tier: 3 },
  engine: { id: 'engine', color: '#ff7a1a', tier: 3 },
  nav_computer: { id: 'nav_computer', color: '#22d3ee', tier: 3 },
  fuel_cell: { id: 'fuel_cell', color: '#b4f542', tier: 3 },
  life_support: { id: 'life_support', color: '#7cf0d0', tier: 3 },
};

export const ITEM_ORDER: ItemId[] = Object.keys(ITEMS) as ItemId[];

export const TERRAIN_ITEM: Record<TerrainId, ItemId | null> = {
  ground: null,
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
  assembler: { id: 'assembler', kind: 'machine', size: 2, cost: { iron_plate: 12, copper_plate: 6 }, power: 4, rotatable: true },
  refinery: { id: 'refinery', kind: 'machine', size: 2, cost: { iron_plate: 14, copper_wire: 6, glass: 4 }, power: 5, rotatable: true },
  solar: { id: 'solar', kind: 'power', size: 1, cost: { iron_plate: 4, copper_plate: 4 }, power: -4, rotatable: false },
  generator: { id: 'generator', kind: 'power', size: 2, cost: { iron_plate: 16, copper_wire: 8, glass: 4 }, power: -20, rotatable: true },
  storage: { id: 'storage', kind: 'storage', size: 1, cost: { iron_plate: 8 }, power: 0, rotatable: true },
  splitter: { id: 'splitter', kind: 'splitter', size: 1, cost: { iron_plate: 4 }, power: 0, rotatable: true },
};

export const BUILD_ORDER: BuildingId[] = [
  'conveyor',
  'miner',
  'smelter',
  'solar',
  'assembler',
  'splitter',
  'storage',
  'refinery',
  'generator',
];

export const RECIPES: RecipeDef[] = [
  // Smelter (auto-selects by input)
  { id: 'iron_plate', machine: 'smelter', inputs: { iron_ore: 1 }, output: 'iron_plate', outputCount: 1, seconds: 2 },
  { id: 'copper_plate', machine: 'smelter', inputs: { copper_ore: 1 }, output: 'copper_plate', outputCount: 1, seconds: 2 },
  { id: 'glass', machine: 'smelter', inputs: { quartz: 1 }, output: 'glass', outputCount: 1, seconds: 2.5 },
  // Assembler
  { id: 'copper_wire', machine: 'assembler', inputs: { copper_plate: 1 }, output: 'copper_wire', outputCount: 2, seconds: 1.5 },
  { id: 'steel_frame', machine: 'assembler', inputs: { iron_plate: 3 }, output: 'steel_frame', outputCount: 1, seconds: 3 },
  { id: 'circuit', machine: 'assembler', inputs: { iron_plate: 1, copper_wire: 2 }, output: 'circuit', outputCount: 1, seconds: 3 },
  { id: 'hull_plate', machine: 'assembler', inputs: { steel_frame: 2, glass: 1 }, output: 'hull_plate', outputCount: 1, seconds: 5 },
  { id: 'life_support', machine: 'assembler', inputs: { glass: 2, circuit: 1, water: 2 }, output: 'life_support', outputCount: 1, seconds: 6 },
  { id: 'engine', machine: 'assembler', inputs: { steel_frame: 3, circuit: 2, fuel: 1 }, output: 'engine', outputCount: 1, seconds: 8 },
  { id: 'nav_computer', machine: 'assembler', inputs: { circuit: 3, silicon: 2, glass: 1 }, output: 'nav_computer', outputCount: 1, seconds: 8 },
  { id: 'fuel_cell', machine: 'assembler', inputs: { steel_frame: 1, fuel: 3 }, output: 'fuel_cell', outputCount: 1, seconds: 5 },
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
  hull_plate: 16,
  engine: 4,
  nav_computer: 2,
  fuel_cell: 8,
  life_support: 3,
};

export const MISSIONS: MissionDef[] = [
  { id: 'm1', deliver: { iron_ore: 10 }, unlocks: ['smelter'], unlockRecipes: ['iron_plate', 'copper_plate'] },
  { id: 'm2', deliver: { iron_plate: 15 }, unlocks: ['solar', 'assembler'], unlockRecipes: ['copper_wire', 'steel_frame'] },
  { id: 'm3', deliver: { copper_wire: 10, steel_frame: 4 }, unlocks: ['splitter'], unlockRecipes: ['circuit', 'glass'] },
  { id: 'm4', deliver: { circuit: 8, glass: 6 }, unlocks: ['refinery', 'storage'], unlockRecipes: ['water', 'fuel', 'hull_plate', 'life_support'] },
  { id: 'm5', deliver: { water: 10, fuel: 6 }, unlocks: ['generator'], unlockRecipes: ['silicon', 'engine', 'nav_computer', 'fuel_cell'] },
  { id: 'm6', deliver: { ...SHIP_PARTS }, unlocks: [], unlockRecipes: [] },
];

export const STARTING_INVENTORY: Partial<Record<ItemId, number>> = {
  iron_plate: 80,
  copper_plate: 16,
};

export const STARTING_BUILDINGS: BuildingId[] = ['conveyor', 'miner'];
export const STARTING_RECIPES: string[] = [];

export const BELT_SPEED = 1.6; // tiles per second
export const BELT_SPACING = 0.28; // min distance between items on a belt
export const BUFFER_CAP = 6; // max per input item in a machine
export const OUTPUT_CAP = 6;
export const STORAGE_CAP = 60;
export const MINE_SECONDS = 1.6;
export const GENERATOR_FUEL_SECONDS = 12; // seconds of full power per fuel unit
