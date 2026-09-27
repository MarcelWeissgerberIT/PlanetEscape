import type { Building, GameOptions, GameState, TerrainId } from './types';
import { BUILD_ORDER, LEVELS, MISSIONS, ORE_PER_TILE, RECIPES, STARTING_BUILDINGS, STARTING_RECIPES } from './data';

export const SAVE_VERSION = 4;

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blob(terrain: TerrainId[], w: number, h: number, cx: number, cy: number, r: number, type: TerrainId, rand: () => number) {
  const ri = Math.ceil(r) + 1;
  for (let y = Math.max(0, cy - ri); y <= Math.min(h - 1, cy + ri); y++) {
    for (let x = Math.max(0, cx - ri); x <= Math.min(w - 1, cx + ri); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const noise = (rand() - 0.5) * 1.4;
      if (d + noise <= r) terrain[y * w + x] = type;
    }
  }
}

export interface TerrainParams {
  basics: { type: TerrainId; dist: number; r: number }[];
  extraTypes: TerrainId[];
  extra: number;
  rocks: number;
}

/** Free-play parameters scale with the map. */
export function freeParams(w: number, h: number, rand: () => number): TerrainParams {
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return {
    basics: [
      { type: 'iron_ore', dist: 6 + rand() * 3, r: 2.4 + rand() * 0.8 },
      { type: 'copper_ore', dist: 7 + rand() * 3, r: 2.1 + rand() * 0.7 },
      { type: pick(['quartz', 'ice']), dist: 10 + rand() * 3, r: 2.0 + rand() * 0.6 },
      { type: pick(['ice', 'quartz']), dist: 11 + rand() * 3, r: 2.0 + rand() * 0.6 },
      { type: 'oil', dist: 13 + rand() * 3, r: 1.8 + rand() * 0.6 },
      { type: 'iron_ore', dist: 12 + rand() * 4, r: 2.2 + rand() * 1.0 },
    ],
    extraTypes: ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'iron_ore', 'copper_ore'],
    extra: Math.round((w * h) / 380) + Math.floor(rand() * 8),
    rocks: Math.round((w * h) / 200) + Math.floor(rand() * 8),
  };
}

export function generateTerrain(seed: number, w: number, h: number, params?: TerrainParams): TerrainId[] {
  const rand = rng(seed);
  const p = params ?? freeParams(w, h, rand);
  const terrain: TerrainId[] = new Array(w * h).fill('ground');
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const maxDist = Math.min(w, h) / 2 - 4;
  const plan = p.basics.map((b) => ({ ...b, dist: Math.min(b.dist, maxDist) }));
  for (let i = 0; i < p.extra && p.extraTypes.length; i++) {
    const far = rand();
    plan.push({ type: pick(p.extraTypes), dist: Math.min(maxDist, 14 + far * (maxDist - 14)), r: 1.6 + rand() * 1.8 + far * 1.2 });
  }
  let angle = rand() * Math.PI * 2;
  const goldenStep = Math.PI * (3 - Math.sqrt(5));
  for (const d of plan) {
    angle += goldenStep + (rand() - 0.5) * 1.2;
    const stretch = 0.75 + rand() * 0.5;
    const px = Math.round(cx + Math.cos(angle) * d.dist);
    const py = Math.round(cy + Math.sin(angle) * d.dist * stretch);
    if (px < 2 || py < 2 || px > w - 3 || py > h - 3) continue;
    blob(terrain, w, h, px, py, d.r, d.type, rand);
    if (rand() < 0.45) blob(terrain, w, h, px + Math.round((rand() - 0.5) * 5), py + Math.round((rand() - 0.5) * 5), d.r * 0.7, d.type, rand);
  }
  // rock formations: impassable, force routing decisions (never on deposits, never near the core)
  for (let i = 0; i < p.rocks; i++) {
    const a = rand() * Math.PI * 2;
    const d = 13 + rand() * Math.max(2, Math.min(w, h) / 2 - 15);
    const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d);
    const len = 3 + Math.floor(rand() * 9);
    const horiz = rand() < 0.5;
    for (let k = 0; k < len; k++) {
      const x = px + (horiz ? k : Math.round((rand() - 0.5) * 1.2));
      const y = py + (horiz ? Math.round((rand() - 0.5) * 1.2) : k);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      if (terrain[y * w + x] !== 'ground') continue;
      if (Math.hypot(x - cx, y - cy) < 12) continue;
      terrain[y * w + x] = 'rock';
    }
  }
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) terrain[y * w + x] = 'ground';
  return terrain;
}

export const DEFAULT_OPTIONS: GameOptions = { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true };

export function newGame(seed = Math.floor(Math.random() * 1e9), options: GameOptions = DEFAULT_OPTIONS): GameState {
  if (options.mode === 'story') return levelState(null, 0, options);
  const width = options.mapSize === 'small' ? 80 : options.mapSize === 'large' ? 160 : 120;
  const height = width;
  const all = options.allUnlocked;
  const terrain = generateTerrain(seed, width, height);
  const r2 = rng(seed ^ 0x5bd1e995);
  const ore = terrain.map((t) => (t === 'ground' || t === 'rock' ? 0 : Math.round(ORE_PER_TILE[0] + r2() * (ORE_PER_TILE[1] - ORE_PER_TILE[0]))));
  const core: Building = { id: 1, type: 'core', x: Math.floor(width / 2) - 1, y: Math.floor(height / 2) - 1, dir: 0 };
  return {
    version: SAVE_VERSION,
    options: { ...options },
    seed,
    width,
    height,
    terrain,
    buildings: [core],
    nextId: 2,
    inventory: all ? { iron_plate: 400, copper_plate: 200, copper_wire: 100, glass: 60, machine_part: 80, precision_part: 30, steel_frame: 60, circuit: 40 } : { iron_plate: 120, copper_plate: 30 },
    delivered: {},
    missionIndex: all ? MISSIONS.length - 1 : 0,
    ship: {},
    ore,
    upgrades: { belt: 0, miner: 0, machine: 0, power: 0 },
    contracts: [],
    contractsDone: 0,
    nextContractAt: 300,
    storm: 0,
    nextStormAt: 600,
    tutorialStep: -1,
    introSeen: true,
    stats: { produced: {}, delivered: {} },
    unlockedBuildings: all ? [...BUILD_ORDER] : [...STARTING_BUILDINGS],
    unlockedRecipes: all ? RECIPES.map((r) => r.id) : [...STARTING_RECIPES],
    time: 0,
    launched: false,
    powerSupply: 10,
    powerDemand: 0,
  };
}

/** A story chapter: a fixed small map. Unlocks, upgrades and stats carry over from `prev`. */
export function levelState(prev: GameState | null, level: number, options: GameOptions = DEFAULT_OPTIONS): GameState {
  const def = LEVELS[Math.min(level, LEVELS.length - 1)];
  const width = def.size, height = def.size;
  const terrain = generateTerrain(def.seed, width, height, { basics: def.basics, extraTypes: def.extraTypes, extra: def.extra, rocks: def.rocks });
  const r2 = rng(def.seed ^ 0x5bd1e995);
  const ore = terrain.map((t) => (t === 'ground' || t === 'rock' ? 0 : Math.round(ORE_PER_TILE[0] + r2() * (ORE_PER_TILE[1] - ORE_PER_TILE[0]))));
  const core: Building = { id: 1, type: 'core', x: Math.floor(width / 2) - 1, y: Math.floor(height / 2) - 1, dir: 0 };
  const unlockedBuildings = prev ? [...prev.unlockedBuildings] : [...STARTING_BUILDINGS];
  const unlockedRecipes = prev ? [...prev.unlockedRecipes] : [...STARTING_RECIPES];
  return {
    version: SAVE_VERSION,
    options: { ...options, mode: 'story', storms: def.storms },
    seed: def.seed,
    width,
    height,
    terrain,
    buildings: [core],
    nextId: 2,
    inventory: { ...def.inventory },
    delivered: {},
    missionIndex: level,
    ship: {},
    ore,
    upgrades: prev ? { ...prev.upgrades } : { belt: 0, miner: 0, machine: 0, power: 0 },
    contracts: [],
    contractsDone: prev?.contractsDone ?? 0,
    nextContractAt: def.contracts ? 240 : 1e12,
    storm: 0,
    nextStormAt: def.storms ? 420 : 1e12,
    tutorialStep: prev ? prev.tutorialStep : 0,
    introSeen: prev?.introSeen ?? false,
    stats: prev ? { produced: { ...prev.stats.produced }, delivered: { ...prev.stats.delivered } } : { produced: {}, delivered: {} },
    unlockedBuildings,
    unlockedRecipes,
    time: prev?.time ?? 0,
    launched: false,
    powerSupply: 10,
    powerDemand: 0,
  };
}
