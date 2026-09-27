import type { Building, GameState, TerrainId } from './types';
import { STARTING_BUILDINGS, STARTING_INVENTORY, STARTING_RECIPES } from './data';

export const SAVE_VERSION = 1;

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

export function generateTerrain(seed: number, w: number, h: number): TerrainId[] {
  const rand = rng(seed);
  const terrain: TerrainId[] = new Array(w * h).fill('ground');
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  // Ring of deposits around the core at increasing distance; nearest ones are the basics.
  const plan: { type: TerrainId; dist: number; r: number }[] = [
    { type: 'iron_ore', dist: 7, r: 2.6 },
    { type: 'copper_ore', dist: 8, r: 2.3 },
    { type: 'iron_ore', dist: 11, r: 2.4 },
    { type: 'quartz', dist: 12, r: 2.2 },
    { type: 'ice', dist: 13, r: 2.2 },
    { type: 'copper_ore', dist: 14, r: 2.2 },
    { type: 'oil', dist: 15, r: 2.0 },
    { type: 'iron_ore', dist: 17, r: 2.8 },
    { type: 'quartz', dist: 18, r: 2.0 },
    { type: 'ice', dist: 19, r: 2.2 },
    { type: 'oil', dist: 20, r: 2.0 },
    { type: 'copper_ore', dist: 20, r: 2.4 },
  ];
  let angle = rand() * Math.PI * 2;
  for (const p of plan) {
    angle += (Math.PI * 2) / 5 + rand() * 0.9;
    const px = Math.round(cx + Math.cos(angle) * p.dist);
    const py = Math.round(cy + Math.sin(angle) * p.dist * 0.8);
    blob(terrain, w, h, px, py, p.r, p.type, rand);
  }
  // keep the core area clean
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) terrain[y * w + x] = 'ground';
  return terrain;
}

export function newGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const width = 48;
  const height = 48;
  const terrain = generateTerrain(seed, width, height);
  const core: Building = {
    id: 1,
    type: 'core',
    x: Math.floor(width / 2) - 1,
    y: Math.floor(height / 2) - 1,
    dir: 0,
  };
  return {
    version: SAVE_VERSION,
    seed,
    width,
    height,
    terrain,
    buildings: [core],
    nextId: 2,
    inventory: { ...STARTING_INVENTORY },
    delivered: {},
    missionIndex: 0,
    unlockedBuildings: [...STARTING_BUILDINGS],
    unlockedRecipes: [...STARTING_RECIPES],
    time: 0,
    launched: false,
    powerSupply: 10,
    powerDemand: 0,
  };
}
