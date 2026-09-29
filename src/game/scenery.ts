// Planet looks and scenery: every map gets a biome (ground colours, large colour patches) and scattered decoration
// (volcanoes on rock formations, craters, alien plants, bones, steam vents, lava cracks, crystals, pebbles).
// Purely visual and derived from the map seed and terrain, so nothing is saved and the game rules do not change.
import type { GameState } from './types';

export type DecoKind = 'volcano' | 'crater' | 'plants' | 'bones' | 'vent' | 'lava' | 'crystals' | 'pebbles';

export interface Deco {
  kind: DecoKind;
  /** tile the decoration belongs to (hidden while a building stands there) */
  tx: number;
  ty: number;
  /** centre in tiles and size in tiles */
  cx: number;
  cy: number;
  size: number;
  flip: boolean;
}

export interface Biome {
  id: 'basalt' | 'rust' | 'ice' | 'moss' | 'volcanic';
  ground: string;
  speckLight: string;
  speckDark: string;
  /** two colours for the large soft patches over the ground */
  patch: [string, string];
  /** relative weights of the ground decorations */
  deco: Partial<Record<Exclude<DecoKind, 'volcano'>, number>>;
  /** chance for a volcano on a rock tile inside a formation */
  volcanoes: number;
  /** eye / glow colour of the little critters */
  critter: string;
}

export const BIOMES: Record<Biome['id'], Biome> = {
  basalt: { id: 'basalt', ground: '#373d45', speckLight: 'rgba(255,255,255,0.04)', speckDark: 'rgba(0,0,0,0.22)', patch: ['#2b4d5a', '#4d3f36'], deco: { pebbles: 4, crystals: 2, crater: 2, plants: 1.2, lava: 0.8, vent: 0.8, bones: 0.4 }, volcanoes: 0.1, critter: '#5eead4' },
  rust: { id: 'rust', ground: '#4a3b34', speckLight: 'rgba(255,220,190,0.05)', speckDark: 'rgba(30,10,0,0.22)', patch: ['#70412b', '#2f2524'], deco: { pebbles: 4, crater: 3, bones: 1.3, crystals: 1, vent: 0.5, plants: 0.4 }, volcanoes: 0.05, critter: '#fbbf24' },
  ice: { id: 'ice', ground: '#3c4855', speckLight: 'rgba(220,240,255,0.06)', speckDark: 'rgba(0,10,30,0.2)', patch: ['#5f7d96', '#2c3845'], deco: { crystals: 3, crater: 2, pebbles: 2, vent: 1.5, bones: 0.4 }, volcanoes: 0.03, critter: '#93c5fd' },
  moss: { id: 'moss', ground: '#2f3b3a', speckLight: 'rgba(200,255,230,0.05)', speckDark: 'rgba(0,20,10,0.22)', patch: ['#2b5a47', '#46355e'], deco: { plants: 5, crystals: 2, pebbles: 2, bones: 0.8, crater: 1 }, volcanoes: 0.04, critter: '#c084fc' },
  volcanic: { id: 'volcanic', ground: '#352f30', speckLight: 'rgba(255,180,120,0.05)', speckDark: 'rgba(0,0,0,0.28)', patch: ['#5c2718', '#1e1b1f'], deco: { lava: 4, vent: 3, pebbles: 3, crater: 2, bones: 0.3, crystals: 0.5 }, volcanoes: 0.22, critter: '#fb923c' },
};

/** Size in tiles per kind (volcanoes stand on rock and reach up past their tile). */
const SIZE: Record<DecoKind, number> = { volcano: 2.3, crater: 1.05, plants: 0.85, bones: 1.6, vent: 0.8, lava: 1, crystals: 0.62, pebbles: 0.75 };

// the story chapters wander through different regions of the planet
const STORY_BIOMES: Record<number, Biome['id']> = { 1101: 'basalt', 1202: 'rust', 1303: 'moss', 1404: 'ice', 1505: 'basalt', 1606: 'volcanic', 1707: 'volcanic' };
const ORDER: Biome['id'][] = ['basalt', 'rust', 'ice', 'moss', 'volcanic'];

/** Deterministic hash of integers to [0, 1). */
export function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function biomeFor(s: GameState): Biome {
  const id = STORY_BIOMES[s.seed] ?? ORDER[Math.floor(hash(s.seed, 7, 11) * ORDER.length)];
  return BIOMES[id];
}

/** Smooth value noise in [0, 1] (bilinear over a hashed lattice, two octaves). */
function noise(seed: number, x: number, y: number): number {
  const oct = (fx: number, fy: number, s: number) => {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const u = fx - ix, v = fy - iy;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  return oct(x / 9, y / 9, seed) * 0.7 + oct(x / 3.5, y / 3.5, seed + 1) * 0.3;
}

export interface Scenery {
  biome: Biome;
  decos: Deco[];
  /** 1 pixel per tile: the soft colour patches, drawn scaled up with smoothing */
  shade: HTMLCanvasElement;
}

export function buildScenery(s: GameState): Scenery {
  const biome = biomeFor(s);
  const { width: w, height: h, terrain, seed } = s;
  const cx = w / 2, cy = h / 2;
  const decos: Deco[] = [];
  const blank = terrain.every((t) => t === 'ground'); // editor / playground maps stay quiet
  const density = blank ? 0.012 : 0.055;
  // volcanoes: inside rock formations, never two close together
  const volcanoes: Deco[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (terrain[y * w + x] !== 'rock') continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && terrain[(y + dy) * w + x + dx] === 'rock') n++;
      if (n < 2 || hash(x, y, seed ^ 0x51ed) >= biome.volcanoes) continue;
      if (volcanoes.some((v) => Math.abs(v.tx - x) < 5 && Math.abs(v.ty - y) < 5)) continue;
      volcanoes.push({ kind: 'volcano', tx: x, ty: y, cx: x + 0.5, cy: y + 1 - SIZE.volcano / 2, size: SIZE.volcano, flip: hash(x, y, 3) < 0.5 });
    }
  }
  // ground decoration, weighted by the biome
  const kinds = Object.entries(biome.deco) as [Exclude<DecoKind, 'volcano'>, number][];
  const total = kinds.reduce((a, [, k]) => a + k, 0);
  const taken = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (terrain[y * w + x] !== 'ground') continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 6) continue; // the start area stays clear
      if (hash(x, y, seed) >= density) continue;
      if (taken.has((y - 1) * w + x - 1) || taken.has((y - 1) * w + x) || taken.has((y - 1) * w + x + 1) || taken.has(y * w + x - 1)) continue; // never two side by side
      let r = hash(x, y, seed + 17) * total;
      let kind = kinds[0][0];
      for (const [k, wgt] of kinds) if ((r -= wgt) < 0) { kind = k; break; }
      const size = SIZE[kind] * (0.85 + hash(x, y, seed + 29) * 0.3);
      const jx = (hash(x, y, seed + 41) - 0.5) * 0.3, jy = (hash(x, y, seed + 53) - 0.5) * 0.3;
      taken.add(y * w + x);
      decos.push({ kind, tx: x, ty: y, cx: x + 0.5 + jx, cy: y + 0.5 + jy, size, flip: hash(x, y, seed + 67) < 0.5 });
    }
  }
  // flat things first, standing things later, volcanoes last (they overlap the tile above)
  const layer: Record<DecoKind, number> = { lava: 0, crater: 0, bones: 1, pebbles: 2, vent: 2, crystals: 3, plants: 3, volcano: 4 };
  decos.push(...volcanoes);
  decos.sort((a, b) => layer[a.kind] - layer[b.kind] || a.cy - b.cy);
  // colour patches
  const shade = document.createElement('canvas');
  shade.width = w;
  shade.height = h;
  const g = shade.getContext('2d')!;
  const img = g.createImageData(w, h);
  const [pa, pb] = biome.patch.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = noise(seed, x, y);
      const hi = v > 0.5;
      const c = hi ? pa : pb;
      const a = Math.min(1, Math.abs(v - 0.5) * 2.2) * 0.55;
      const i = (y * w + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return { biome, decos, shade };
}
