// Core type definitions for Planet Escape.

export type Dir = 0 | 1 | 2 | 3; // 0 = up (north), 1 = right (east), 2 = down (south), 3 = left (west)

export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export type ItemId =
  | 'iron_ore'
  | 'copper_ore'
  | 'quartz'
  | 'ice'
  | 'oil'
  | 'iron_plate'
  | 'copper_plate'
  | 'copper_wire'
  | 'glass'
  | 'silicon'
  | 'water'
  | 'fuel'
  | 'steel_frame'
  | 'circuit'
  | 'hull_plate'
  | 'engine'
  | 'nav_computer'
  | 'fuel_cell'
  | 'life_support';

export type TerrainId = 'ground' | 'iron_ore' | 'copper_ore' | 'quartz' | 'ice' | 'oil';

export type BuildingId =
  | 'core'
  | 'conveyor'
  | 'miner'
  | 'smelter'
  | 'assembler'
  | 'refinery'
  | 'solar'
  | 'generator'
  | 'storage'
  | 'splitter';

export type MachineKind = 'core' | 'conveyor' | 'miner' | 'machine' | 'power' | 'storage' | 'splitter';

export interface ItemDef {
  id: ItemId;
  color: string; // fallback colour when the sprite has not loaded
  tier: number;
}

export interface RecipeDef {
  id: string;
  machine: 'smelter' | 'assembler' | 'refinery';
  inputs: Partial<Record<ItemId, number>>;
  output: ItemId;
  outputCount: number;
  seconds: number;
}

export interface BuildingDef {
  id: BuildingId;
  kind: MachineKind;
  size: number; // tiles per side
  cost: Partial<Record<ItemId, number>>;
  power: number; // positive = consumes, negative = produces (solar / generator)
  rotatable: boolean;
  placeOn?: 'deposit'; // miners must sit on a deposit
  hidden?: boolean; // core cannot be built
}

export interface BeltItem {
  item: ItemId;
  pos: number; // 0..1 along the belt
}

export interface Building {
  id: number;
  type: BuildingId;
  x: number; // top-left tile
  y: number;
  dir: Dir;
  // conveyor state
  items?: BeltItem[];
  // machine state
  recipe?: string | null;
  input?: Partial<Record<ItemId, number>>;
  output?: Partial<Record<ItemId, number>>;
  progress?: number; // 0..1
  working?: boolean;
  // miner
  mineItem?: ItemId;
  // splitter / output round robin
  rr?: number;
  // storage
  store?: Partial<Record<ItemId, number>>;
  // generator fuel buffer
  fuelSeconds?: number;
}

export interface MissionDef {
  id: string;
  deliver: Partial<Record<ItemId, number>>;
  unlocks: BuildingId[];
  unlockRecipes: string[];
}

export interface GameState {
  version: number;
  seed: number;
  width: number;
  height: number;
  terrain: TerrainId[]; // width*height
  buildings: Building[];
  nextId: number;
  inventory: Partial<Record<ItemId, number>>; // items in the Landing Core
  delivered: Partial<Record<ItemId, number>>; // totals delivered per mission (reset per mission)
  missionIndex: number;
  unlockedBuildings: BuildingId[];
  unlockedRecipes: string[];
  time: number; // seconds of play
  launched: boolean;
  powerSupply: number;
  powerDemand: number;
}
