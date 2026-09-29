// Landscape features: volcanoes (3x3), lava, molten metal and water as rivers and lakes. They are impassable like rock
// (terrain 'rock', listed in state.features so the renderer draws them as what they are). Rules that keep maps fair:
// nothing near the start, nothing on or next to a deposit (two tiles apart), rivers leave fords to cross, and a feature
// that would cut the start off from a deposit is taken back. The story chapters follow a fixed plan so every kind shows
// up once; other maps get a random mix that fits their biome and size.
import type { Feature, FeatureKind, TerrainId } from './types';
import { biomeIdFor } from './scenery';

interface Plan {
  volcanoes: number;
  riversPerVolcano: number;
  lavaLakes: number;
  metalLakes: number;
  metalRivers: number;
  waterLakes: number;
  waterRivers: number;
  /** lake radius range in tiles */
  lake: [number, number];
}

const NONE: Plan = { volcanoes: 0, riversPerVolcano: 0, lavaLakes: 0, metalLakes: 0, metalRivers: 0, waterLakes: 0, waterRivers: 0, lake: [1.6, 2.6] };

/** The story walks through the planet: a pond first, then metal, rivers, ice lakes, the first volcano, fire, everything. */
const STORY: Record<number, Plan> = {
  1101: { ...NONE, waterLakes: 1, lake: [1.4, 1.9] },
  1202: { ...NONE, metalLakes: 1, lake: [1.4, 2] },
  1303: { ...NONE, waterLakes: 1, waterRivers: 1, lake: [1.6, 2.3] },
  1404: { ...NONE, waterLakes: 2, waterRivers: 1, lake: [1.8, 2.6] },
  1505: { ...NONE, volcanoes: 1, riversPerVolcano: 1, metalLakes: 1, metalRivers: 1, lake: [1.6, 2.4] },
  1606: { ...NONE, volcanoes: 2, riversPerVolcano: 1, lavaLakes: 1, lake: [1.8, 2.8] },
  1707: { ...NONE, volcanoes: 2, riversPerVolcano: 1, lavaLakes: 1, metalLakes: 1, metalRivers: 1, waterLakes: 1, lake: [2, 3.2] },
};

function randomPlan(seed: number, w: number, h: number, rand: () => number): Plan {
  if (Math.min(w, h) < 40) return NONE;
  const f = Math.max(0.35, Math.min(3, (w * h) / 14400));
  const n = (base: number) => Math.max(0, Math.round(base * f + (rand() - 0.5) * 0.8));
  const lake: [number, number] = [1.8, 2.4 + Math.min(2, f)];
  switch (biomeIdFor(seed)) {
    case 'volcanic':
      return { ...NONE, volcanoes: Math.max(1, n(2)), riversPerVolcano: rand() < 0.5 ? 2 : 1, lavaLakes: n(1), lake };
    case 'rust':
      return { ...NONE, metalLakes: Math.max(1, n(2)), metalRivers: n(1.2), volcanoes: f > 1.2 ? 1 : 0, riversPerVolcano: 1, lake };
    case 'ice':
      return { ...NONE, waterLakes: Math.max(1, n(2.5)), waterRivers: n(1), lake };
    case 'moss':
      return { ...NONE, waterLakes: Math.max(1, n(2)), waterRivers: n(1.3), lake };
    default:
      return { ...NONE, volcanoes: n(1), riversPerVolcano: 1, waterLakes: Math.max(1, n(1)), metalLakes: n(0.6), metalRivers: n(0.6), lake };
  }
}

/** mulberry32 (the same generator as the world; kept here so this module has no import cycle) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Add the features to a freshly generated terrain (mutates it) and return them for the save. */
export function addFeatures(terrain: TerrainId[], w: number, h: number, seed: number, story: boolean): Feature[] {
  const rand = rng(seed ^ 0x2f6b1a3d);
  const plan = story ? (STORY[seed] ?? NONE) : randomPlan(seed, w, h, rand);
  const cx = w / 2, cy = h / 2;
  const coreClear = Math.min(12, Math.min(w, h) * 0.3);
  const idx = (x: number, y: number) => y * w + x;
  const isDeposit = (t: TerrainId) => t !== 'ground' && t !== 'rock';
  // tiles within two of a deposit stay free
  const nearDeposit = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isDeposit(terrain[idx(x, y)])) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) nearDeposit[idx(nx, ny)] = 1;
    }
  }
  const taken = new Uint8Array(w * h); // feature tiles and a one-tile gap around them (features do not merge)
  const free = (x: number, y: number) => x >= 2 && y >= 2 && x < w - 2 && y < h - 2 && terrain[idx(x, y)] === 'ground' && !nearDeposit[idx(x, y)] && !taken[idx(x, y)] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) >= coreClear;

  // fairness: every deposit reachable from the start before stays reachable after
  const reachableDeposits = () => {
    const seen = new Uint8Array(w * h);
    const q = [idx(Math.floor(cx), Math.floor(cy))];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop()!;
      if (isDeposit(terrain[i])) n++;
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = idx(nx, ny);
        if (seen[j] || terrain[j] === 'rock') continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    return n;
  };
  const baseline = reachableDeposits();
  const features: Feature[] = [];
  const commit = (kind: FeatureKind, tiles: number[], lake = false): Feature | null => {
    if (!tiles.length) return null;
    for (const i of tiles) terrain[i] = 'rock';
    if (reachableDeposits() < baseline) {
      for (const i of tiles) terrain[i] = 'ground'; // it would wall something off: take it back
      return null;
    }
    for (const i of tiles) {
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) taken[idx(nx, ny)] = 1;
      }
    }
    const f: Feature = { kind, tiles, ...(lake ? { lake: true } : {}) };
    features.push(f);
    return f;
  };
  const farSpot = (minDist: number): [number, number] | null => {
    for (let tries = 0; tries < 300; tries++) {
      const x = 3 + Math.floor(rand() * (w - 6)), y = 3 + Math.floor(rand() * (h - 6));
      if (Math.hypot(x - cx, y - cy) >= minDist && free(x, y)) return [x, y];
    }
    return null;
  };

  /** A river: a wandering line from (x, y) heading roughly one way, with fords every few tiles. */
  const river = (x: number, y: number, heading: number, len: number): number[] => {
    const tiles: number[] = [];
    let d = heading;
    const fordEvery = 8 + Math.floor(rand() * 5);
    for (let step = 0; step < len; step++) {
      const r = rand();
      if (r < 0.18) d = (heading + 1) % 4;
      else if (r < 0.36) d = (heading + 3) % 4;
      else if (r < 0.7) d = heading;
      const tryDirs = [d, heading, (heading + 1) % 4, (heading + 3) % 4];
      let moved = false;
      for (const nd of tryDirs) {
        const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1];
        if (!free(nx, ny) || tiles.includes(idx(nx, ny))) continue;
        x = nx;
        y = ny;
        moved = true;
        break;
      }
      if (!moved) break;
      if (step > 2 && step % fordEvery < 2) continue; // a ford: two tiles of dry ground to cross on
      tiles.push(idx(x, y));
      if (rand() < 0.16) {
        const side = DIRS[(d + (rand() < 0.5 ? 1 : 3)) % 4];
        const sx = x + side[0], sy = y + side[1];
        if (free(sx, sy) && !tiles.includes(idx(sx, sy))) tiles.push(idx(sx, sy));
      }
    }
    return tiles.length >= 4 ? tiles : [];
  };
  /** The direction from a point that leads away from the start. */
  const away = (x: number, y: number) => {
    const dx = x - cx, dy = y - cy;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
  };
  const lake = (kind: FeatureKind, [r0, r1]: [number, number], minDist: number) => {
    const spot = farSpot(minDist);
    if (!spot) return null;
    const [lx, ly] = spot;
    const r = r0 + rand() * (r1 - r0);
    const wob = [0, 1, 2, 3, 4, 5].map(() => 0.8 + rand() * 0.4);
    const tiles: number[] = [];
    const ri = Math.ceil(r) + 1;
    for (let y = ly - ri; y <= ly + ri; y++) for (let x = lx - ri; x <= lx + ri; x++) {
      const a = Math.atan2(y - ly, x - lx);
      const k = wob[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6];
      if (Math.hypot(x - lx, y - ly) <= r * k && free(x, y)) tiles.push(idx(x, y));
    }
    return tiles.length >= 5 ? commit(kind, tiles, true) : null;
  };
  const riverFrom = (kind: FeatureKind, f: Feature | null, len: number) => {
    if (!f) return;
    // leave from the lake / volcano edge on the side away from the start
    const edge = f.tiles.map((i) => [i % w, Math.floor(i / w)] as [number, number]).sort((a, b) => Math.hypot(b[0] - cx, b[1] - cy) - Math.hypot(a[0] - cx, a[1] - cy))[0];
    const heading = away(edge[0], edge[1]);
    // the source tiles stop being "taken" for the river's first step only
    const [sx, sy] = [edge[0] + DIRS[heading][0], edge[1] + DIRS[heading][1]];
    const saved = taken[idx(sx, sy)];
    taken[idx(sx, sy)] = 0;
    const tiles = river(edge[0], edge[1], heading, len);
    if (!tiles.length) taken[idx(sx, sy)] = saved;
    commit(kind, tiles);
  };
  const riverLen = () => Math.round(10 + rand() * 14 + Math.min(w, h) * 0.08);
  const farOut = Math.max(coreClear + 3, Math.min(w, h) * 0.24);

  // volcanoes first (3x3, with lava running out of them)
  for (let v = 0; v < plan.volcanoes; v++) {
    let placed: Feature | null = null;
    for (let tries = 0; tries < 200 && !placed; tries++) {
      const x = 3 + Math.floor(rand() * (w - 8)), y = 3 + Math.floor(rand() * (h - 8));
      if (Math.hypot(x + 1.5 - cx, y + 1.5 - cy) < farOut + 2) continue;
      let ok = true;
      for (let dy = -1; dy <= 3 && ok; dy++) for (let dx = -1; dx <= 3 && ok; dx++) if (!free(x + dx, y + dy)) ok = false;
      if (!ok || features.some((f) => f.kind === 'volcano' && Math.abs((f.tiles[0] % w) - x) < 10 && Math.abs(Math.floor(f.tiles[0] / w) - y) < 10)) continue;
      const tiles: number[] = [];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) tiles.push(idx(x + dx, y + dy));
      placed = commit('volcano', tiles);
    }
    for (let r = 0; r < plan.riversPerVolcano; r++) riverFrom('lava', placed, riverLen());
  }
  for (let i = 0; i < plan.lavaLakes; i++) lake('lava', plan.lake, farOut);
  for (let i = 0; i < plan.metalLakes; i++) {
    const f = lake('metal', plan.lake, farOut);
    if (i < plan.metalRivers) riverFrom('metal', f, riverLen());
  }
  for (let i = 0; i < plan.waterLakes; i++) {
    const f = lake('water', plan.lake, farOut - 2);
    if (i < plan.waterRivers) riverFrom('water', f, riverLen());
  }
  return features;
}
