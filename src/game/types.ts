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
  | 'machine_part'
  | 'precision_part'
  | 'hull_plate'
  | 'engine'
  | 'nav_computer'
  | 'fuel_cell'
  | 'life_support';

export type TerrainId = 'ground' | 'rock' | 'iron_ore' | 'copper_ore' | 'quartz' | 'ice' | 'oil';

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
  | 'splitter'
  | 'tunnel'
  | 'fabricator'
  | 'printer'
  | 'sorter'
  | 'overflow'
  | 'mixer'
  | 'valve';

export type MachineKind = 'core' | 'conveyor' | 'miner' | 'machine' | 'power' | 'storage' | 'splitter' | 'tunnel' | 'logic';

export type Status = 'ok' | 'idle' | 'no_recipe' | 'starved' | 'blocked' | 'low_power' | 'no_fuel' | 'jammed' | 'dead_end' | 'unpaired' | 'depleted' | 'closed' | 'waiting';

export interface ItemDef {
  id: ItemId;
  color: string; // fallback colour when the sprite has not loaded
  tier: number;
}

export interface RecipeDef {
  id: string;
  machine: 'smelter' | 'assembler' | 'refinery' | 'fabricator' | 'printer';
  auto?: boolean; // machine picks this recipe automatically from its first input
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
  // logic modules: mixer side buffers, valve threshold, mixer ratio index, valve open state
  bufL?: ItemId[];
  bufR?: ItemId[];
  threshold?: number;
  ratio?: number;
  open?: boolean;
  // tunnel: id of the paired tunnel (entrance <-> exit); `exit` marks the exit end
  pair?: number | null;
  exit?: boolean;
  // diagnostics (transient, recomputed every tick)
  status?: Status;
  missing?: ItemId[];
  stuck?: number; // seconds the front item has been blocked
  rate?: number; // produced items per minute (rolling)
  produced?: number; // items produced in the current rate window
  rateT?: number;
}

export type UpgradeId = 'belt' | 'miner' | 'machine' | 'power';

export interface Contract {
  id: number;
  item: ItemId;
  amount: number;
  delivered: number;
  deadline: number; // game time
  reward: Partial<Record<ItemId, number>>;
  accepted: boolean;
}

export interface MissionDef {
  id: string;
  deliver: Partial<Record<ItemId, number>>;
  build?: Partial<Record<BuildingId, number>>; // buildings that must exist
  unlocks: BuildingId[];
  unlockRecipes: string[];
}

export type GameMode = 'story' | 'free';

export interface GameOptions {
  mode: GameMode;
  mapSize: 'small' | 'medium' | 'large';
  infiniteOre: boolean;
  allUnlocked: boolean;
  storms: boolean;
}

export interface GameState {
  version: number;
  options: GameOptions;
  seed: number;
  width: number;
  height: number;
  terrain: TerrainId[]; // width*height
  buildings: Building[];
  nextId: number;
  inventory: Partial<Record<ItemId, number>>; // items in the Landing Core
  delivered: Partial<Record<ItemId, number>>; // totals delivered per mission (reset per mission)
  missionIndex: number;
  ship: Partial<Record<ItemId, number>>; // ship parts installed so far
  ore: number[]; // remaining units per deposit tile (0 for ground)
  upgrades: Record<UpgradeId, number>; // level per upgrade
  contracts: Contract[];
  contractsDone: number;
  nextContractAt: number; // game time
  storm: number; // seconds of dust storm remaining
  nextStormAt: number;
  tutorialStep: number; // -1 = finished / skipped
  introSeen: boolean;
  stats: { produced: Partial<Record<ItemId, number>>; delivered: Partial<Record<ItemId, number>> };
  unlockedBuildings: BuildingId[];
  unlockedRecipes: string[];
  time: number; // seconds of play
  launched: boolean;
  powerSupply: number;
  powerDemand: number;
}

export interface BlueprintItem {
  type: BuildingId;
  dx: number;
  dy: number;
  dir: Dir;
  recipe?: string | null;
  threshold?: number;
  ratio?: number;
}

export interface Blueprint {
  name: string;
  w: number;
  h: number;
  items: BlueprintItem[];
}
