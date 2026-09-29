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
  | 'life_support'
  | 'motor'
  | 'cell'
  | 'robot';

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
  | 'merger'
  | 'service'
  | 'recycler'
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
  | 'picker'
  | 'road'
  | 'dock'
  | 'kitport'
  | 'mast'
  | 'depot'
  | 'stacker'
  | 'hall4'
  | 'hall8'
  | 'hall12'
  | 'hall16'
  | 'wind'
  | 'reactor'
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

export type MachineKind = 'core' | 'conveyor' | 'miner' | 'machine' | 'power' | 'storage' | 'splitter' | 'tunnel' | 'logic' | 'road';

export type Status = 'ok' | 'worn' | 'idle' | 'no_recipe' | 'starved' | 'blocked' | 'low_power' | 'no_fuel' | 'jammed' | 'dead_end' | 'unpaired' | 'depleted' | 'closed' | 'waiting';

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
  site?: boolean; // placed, waiting for its kit to be printed by the core
  deliver?: boolean; // site outside the core's reach: its kit is ready and has to be brought here
  deliverAt?: number; // game time the kit became ready
  enroute?: 'drone' | 'item'; // how the kit is on its way
  enrouteAt?: number;
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
  merge?: (ItemId | null)[]; // merger: one waiting item per input side (behind, left, right)
  bufL?: ItemId[];
  bufR?: ItemId[];
  salvage?: Partial<Record<ItemId, number>>; // recycler: fractions of parts not handed out yet
  threshold?: number;
  mode?: 'hold' | 'pass' | 'pulse' | 'off' | 'avg' | 'centre' | 'scan' | 'tx' | 'rx' | 'load' | 'unload' | 'pack' | 'unpack'; // lamp: hold keeps the item lit, pass forwards it; switch: pulse closes itself after one item; screen: sample output
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
  wear?: number; // machines and miners: 0 fresh … 1 worn out (runs at half speed until repaired)
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
  // automation contracts (need circuits: timers, sensors, valves, registers)
  kind?: 'amount' | 'steady' | 'batch' | 'level';
  lo?: number; // steady: items per minute / level: stock, lower bound
  hi?: number; // upper bound
  hold?: number; // steady / level: seconds to stay in the band
  held?: number;
  log?: number[]; // steady: delivery times of the last minute
  n?: number; // batch: exactly n items per window
  window?: number; // batch: window length in seconds
  rounds?: number; // batch: windows in a row
  done?: number; // batch: windows done in a row
  winStart?: number;
  winCount?: number;
}

export interface MissionDef {
  id: string;
  deliver: Partial<Record<ItemId, number>>;
  build?: Partial<Record<BuildingId, number>>; // buildings that must exist
  unlocks: BuildingId[];
  unlockRecipes: string[];
  reward?: Partial<Record<ItemId, number>>; // items KORA hands over on completion (bootstraps the next chain)
  rate?: Partial<Record<ItemId, number>>; // throughput goal: items per minute arriving at the core ...
  rateHold?: number; // ... held for this many seconds (default 45)
}

export type GameMode = 'story' | 'free' | 'playground' | 'challenge'; // playground: build anything for free, no orders

export interface GameOptions {
  mode: GameMode;
  mapSize: 'small' | 'medium' | 'large' | 'huge' | 'giant';
  infiniteOre: boolean;
  allUnlocked: boolean;
  storms: boolean;
  difficulty?: 'normal' | 'hard'; // free play only; hard = less material, thinner deposits, more storms
}

export type EventKind = 'meteorite' | 'wreck' | 'power_surge' | 'trader' | 'quake';

/** A one-off situation KORA reports; the player picks option a or b (b happens by default when ignored). */
export interface GameEvent {
  id: number;
  kind: EventKind;
  until: number; // game time when it resolves on its own
  x?: number; // meteorite impact site
  y?: number;
  terrain?: TerrainId;
}

/** A landscape feature: impassable like rock, drawn as what it is (see features.ts). */
export type FeatureKind = 'volcano' | 'lava' | 'metal' | 'water';
export interface Feature {
  kind: FeatureKind;
  lake?: boolean;
  tiles: number[];
}

export interface GameState {
  version: number;
  options: GameOptions;
  seed: number;
  width: number;
  height: number;
  terrain: TerrainId[]; // width*height
  features?: Feature[]; // volcanoes, rivers and lakes (their tiles are 'rock' in terrain)
  buildings: Building[];
  nextId: number;
  inventory: Partial<Record<ItemId, number>>; // items in the Landing Core
  delivered: Partial<Record<ItemId, number>>; // totals delivered per mission (reset per mission)
  missionIndex: number;
  ship: Partial<Record<ItemId, number>>; // ship parts installed so far
  ore: number[]; // remaining units per deposit tile (0 for ground)
  upgrades: Record<UpgradeId, number>; // level per upgrade
  hintsSeen?: string[]; // KORA's first-time explanations already given in this game
  autoRepair?: boolean; // the core's drones service worn machines within reach (default on)
  projects?: string[]; // finished research projects (small packs of extra parts)
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
  challenge?: string; // challenge id (mode 'challenge')
  challengeDone?: number; // seconds it took, once the goal was met
  flights?: number;
  autoContractsDone?: number; // automation contracts completed // supply flights sent after the launch (endless goals)
  powerSupply: number;
  powerDemand: number;
  chapterStart?: number; // game time when the current story chapter began (for the star rating)
  rateLog?: Partial<Record<ItemId, number[]>>; // delivery times of items with a throughput goal (last minute)
  rateHeld?: number; // seconds the throughput goal has been met without a break
  eff?: { sum: number; n: number }; // machine utilisation samples of the current chapter / mission
  event?: GameEvent | null;
  nextEventAt?: number;
  boostUntil?: number; // overclocked power until this game time
  eventsSeen?: number;
  note?: { de?: string; en?: string; title?: string }; // shown once when a shared save is imported
  focus?: { x: number; y: number; zoom: number }; // camera position to show when the save is loaded
  showCore?: boolean; // playground map whose chains end in the core (the megafactory examples)
  robots?: Robot[]; // transport robots (depots)
  kits?: Partial<Record<BuildingId, number>>; // printed building kits in stock
  printQueue?: PrintJob[]; // the core's print jobs, first one is printing
  autoPrint?: boolean; // placing without a kit queues one (default on)
  drones?: Drone[]; // the core's construction drones
}

/** A construction drone: flies a kit from the core to a site outside the core's reach. */
export interface Drone {
  x: number;
  y: number;
  target: number | null;
  carry: BuildingId | null;
  state: 'idle' | 'out' | 'back';
}

/** A kit the core prints: for a construction site (site) or for the stock. */
export interface PrintJob {
  type: BuildingId;
  left: number; // seconds of printing left
  total: number;
  site: boolean;
}

/** A transport robot: lives at a depot, drives on roads between loading docks. Positions are tile coordinates (centre = +0.5). */
export interface Robot {
  id: number;
  depot: number; // depot building id
  x: number;
  y: number;
  dir: Dir;
  items: ItemId[];
  path: { x: number; y: number }[]; // remaining waypoints (tile centres)
  state: 'idle' | 'go' | 'load' | 'unload' | 'charge';
  charge?: number; // battery 0..1 (missing = full)
  home?: boolean; // driving back to its depot to charge
  target: number | null; // dock building id
  wait: number; // seconds before the next planning attempt
  t: number; // transfer accumulator
}

export interface BlueprintItem {
  type: BuildingId;
  dx: number;
  dy: number;
  dir: Dir;
  recipe?: string | null;
  threshold?: number;
  ratio?: number;
  mode?: 'hold' | 'pass' | 'pulse' | 'off' | 'avg' | 'centre' | 'scan' | 'tx' | 'rx' | 'load' | 'unload' | 'pack' | 'unpack';
  open?: boolean;
  value?: number;
}

export interface Blueprint {
  name: string;
  w: number;
  h: number;
  items: BlueprintItem[];
}
