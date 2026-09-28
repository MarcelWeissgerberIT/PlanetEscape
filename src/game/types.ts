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
  | 'valve'
  | 'lamp'
  | 'matrix'
  | 'screen'
  | 'speaker'
  | 'keyboard'
  | 'timer'
  | 'sensor'
  | 'radio'
  | 'battery'
  | 'switch'
  | 'terminal'
  | 'oscillator'
  | 'bus'
  | 'register'
  | 'adder'
  | 'subtractor'
  | 'multiplier'
  | 'divider';

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
  px?: number[]; // LED matrix: 64 pixels row by row, packed 0xRRGGBB, 0 = off
  // splitter / output round robin
  rr?: number;
  // storage
  store?: Partial<Record<ItemId, number>>;
  // generator fuel buffer
  fuelSeconds?: number;
  budget?: number; // video receiver: pixel updates it may still draw (items delivered = phosphor)
  // logic modules: mixer side buffers, valve threshold, mixer ratio index, valve open state
  bufL?: ItemId[];
  bufR?: ItemId[];
  threshold?: number;
  mode?: 'hold' | 'pass' | 'pulse' | 'off' | 'avg' | 'centre' | 'scan' | 'tx' | 'rx'; // lamp: hold keeps the item lit, pass forwards it; switch: pulse closes itself after one item; screen: sample output
  ratio?: number;
  open?: boolean;
  // terminal: program source and run flag (the CPU itself lives in the Sim and is rebuilt on load)
  prog?: string;
  run?: boolean;
  trace?: boolean; // terminal: slow clock (2 Hz) and register lamps above it
  timer?: number; // switch in pulse mode: seconds it stays open (each side pulse adds 0.5 s)
  turbo?: number; // oscillator: glass crystals (2 kHz each)
  ram?: number; // installed memory banks (circuits delivered), 256 bytes each
  clock?: number; // installed oscillator crystals (quartz or glass delivered), 100 Hz each
  // arithmetic modules / register
  value?: number; // register content, multiplier factor, divisor
  acc?: number; // running counter (items seen on the primary input)
  debt?: number; // subtractor: right-hand items waiting to cancel left-hand ones
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

export type UpgradeId = 'belt' | 'miner' | 'machine' | 'power' | 'yield' | 'buffer' | 'printer';

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
  reward?: Partial<Record<ItemId, number>>; // items KORA hands over on completion (bootstraps the next chain)
}

export type GameMode = 'story' | 'free' | 'playground'; // playground: build anything for free, no orders

export interface GameOptions {
  mode: GameMode;
  mapSize: 'small' | 'medium' | 'large' | 'huge' | 'giant';
  infiniteOre: boolean;
  allUnlocked: boolean;
  storms: boolean;
  difficulty?: 'normal' | 'hard'; // free play only; hard = less material, thinner deposits, more storms
}

export type EventKind = 'meteorite' | 'wreck' | 'power_surge';

/** A one-off situation KORA reports; the player picks option a or b (b happens by default when ignored). */
export interface GameEvent {
  id: number;
  kind: EventKind;
  until: number; // game time when it resolves on its own
  x?: number; // meteorite impact site
  y?: number;
  terrain?: TerrainId;
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
  chapterStart?: number; // game time when the current story chapter began (for the star rating)
  event?: GameEvent | null;
  nextEventAt?: number;
  boostUntil?: number; // overclocked power until this game time
  eventsSeen?: number;
  note?: { de?: string; en?: string; title?: string }; // shown once when a shared save is imported
  focus?: { x: number; y: number; zoom: number }; // camera position to show when the save is loaded
}

export interface BlueprintItem {
  type: BuildingId;
  dx: number;
  dy: number;
  dir: Dir;
  recipe?: string | null;
  threshold?: number;
  ratio?: number;
  mode?: 'hold' | 'pass' | 'pulse' | 'off' | 'avg' | 'centre' | 'scan' | 'tx' | 'rx';
  open?: boolean;
  value?: number;
}

export interface Blueprint {
  name: string;
  w: number;
  h: number;
  items: BlueprintItem[];
}
