// Planet looks and scenery: every map gets a biome (ground colours, large colour patches) and scattered decoration
// (volcanoes on rock formations, craters, alien plants, bones, steam vents, lava cracks, crystals, pebbles).
// Purely visual and derived from the map seed and terrain, so nothing is saved and the game rules do not change.
import { TILE } from './camera';
import type { Feature, GameState } from './types';

export type DecoKind = 'volcano' | 'crater' | 'plants' | 'bones' | 'vent' | 'lava' | 'crystals' | 'pebbles' | 'wreck' | 'obelisk' | 'tree' | 'icespire' | 'meteor' | 'scrap';

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
  basalt: { id: 'basalt', ground: '#373d45', speckLight: 'rgba(255,255,255,0.04)', speckDark: 'rgba(0,0,0,0.22)', patch: ['#2b4d5a', '#4d3f36'], deco: { pebbles: 4, crystals: 2, crater: 2, plants: 1.2, lava: 0.8, vent: 0.8, bones: 0.4, wreck: 0.5, scrap: 0.6, meteor: 0.4, obelisk: 0.3 }, volcanoes: 0.1, critter: '#5eead4' },
  rust: { id: 'rust', ground: '#4a3b34', speckLight: 'rgba(255,220,190,0.05)', speckDark: 'rgba(30,10,0,0.22)', patch: ['#70412b', '#2f2524'], deco: { pebbles: 4, crater: 3, bones: 1.3, crystals: 1, vent: 0.5, plants: 0.4, scrap: 1.2, wreck: 0.6, meteor: 0.6, obelisk: 0.3 }, volcanoes: 0.05, critter: '#fbbf24' },
  ice: { id: 'ice', ground: '#3c4855', speckLight: 'rgba(220,240,255,0.06)', speckDark: 'rgba(0,10,30,0.2)', patch: ['#5f7d96', '#2c3845'], deco: { icespire: 2.6, pebbles: 3, crater: 2, vent: 1.5, crystals: 0.8, bones: 0.4, wreck: 0.4, meteor: 0.3 }, volcanoes: 0.03, critter: '#93c5fd' },
  moss: { id: 'moss', ground: '#2f3b3a', speckLight: 'rgba(200,255,230,0.05)', speckDark: 'rgba(0,20,10,0.22)', patch: ['#2b5a47', '#46355e'], deco: { plants: 5, crystals: 2, pebbles: 2, bones: 0.8, crater: 1, tree: 2.2, obelisk: 0.6 }, volcanoes: 0.04, critter: '#c084fc' },
  volcanic: { id: 'volcanic', ground: '#352f30', speckLight: 'rgba(255,180,120,0.05)', speckDark: 'rgba(0,0,0,0.28)', patch: ['#5c2718', '#1e1b1f'], deco: { lava: 4, vent: 3, pebbles: 3, crater: 2, bones: 0.3, crystals: 0.5, meteor: 1, scrap: 0.4 }, volcanoes: 0.22, critter: '#fb923c' },
};

/** Ground colour along rivers and lakes: frost, lush moss, wet dark stone. */
const SHORE_TINT: Record<Biome['id'], [number, number, number]> = { ice: [150, 178, 200], moss: [36, 92, 62], basalt: [30, 36, 44], rust: [58, 40, 32], volcanic: [26, 22, 24] };

/** Size in tiles per kind (volcanoes stand on rock and reach up past their tile). */
const SIZE: Record<DecoKind, number> = { volcano: 3.5, crater: 1.05, plants: 0.85, bones: 1.6, vent: 0.8, lava: 1, crystals: 0.62, pebbles: 0.75, wreck: 1.5, obelisk: 1.35, tree: 1.45, icespire: 1.15, meteor: 1, scrap: 0.95 };
/** Big decoration keeps two tiles from any deposit, small one tile. */
const BIG = new Set<DecoKind>(['bones', 'wreck', 'obelisk', 'tree', 'icespire', 'meteor', 'crater']);

export type LiquidKind = 'lava' | 'metal' | 'water';
/** A river or lake, ready to draw: its outline in world pixels, bounds in tiles, the way it flows. */
export interface Liquid {
  kind: LiquidKind;
  lake: boolean;
  feature: number; // index in state.features
  path: Path2D;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  flow: [number, number];
  /** tiles (every few) that light up the night */
  glow: [number, number][];
}

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

export function biomeIdFor(seed: number): Biome['id'] {
  return STORY_BIOMES[seed] ?? ORDER[Math.floor(hash(seed, 7, 11) * ORDER.length)];
}

export function biomeFor(s: GameState): Biome {
  return BIOMES[biomeIdFor(s.seed)];
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
  liquids: Liquid[];
  /** tiles of landscape features (drawn as liquid or volcano, not as rock) */
  hidden: Set<number>;
  /** tile -> index in state.features, for a tap on the map */
  featureAt: Map<number, number>;
  /** tile -> decoration standing there, for a tap on the map */
  decoAt: Map<number, Deco>;
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
  // distance (in tiles, up to 3) to the nearest deposit: decoration stays out of mining areas
  const depDist = new Uint8Array(w * h).fill(9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = terrain[y * w + x];
    if (t === 'ground' || t === 'rock') continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < depDist[ny * w + nx]) depDist[ny * w + nx] = d;
    }
  }
  // landscape features: volcanoes stand on their own 3x3 ground, rivers and lakes are drawn as liquid
  const features = s.features ?? [];
  const hidden = new Set<number>(); // feature tiles: not drawn as rock
  const featureAt = new Map<number, number>();
  const liquids: Liquid[] = [];
  features.forEach((f, fi) => {
    for (const i of f.tiles) {
      hidden.add(i);
      featureAt.set(i, fi);
    }
    const xs = f.tiles.map((i) => i % w), ys = f.tiles.map((i) => Math.floor(i / w));
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    if (f.kind === 'volcano') {
      decos.push({ kind: 'volcano', tx: x0 + 1, ty: y0 + 1, cx: x0 + 1.5, cy: y0 + 1.5 - 0.35, size: SIZE.volcano, flip: hash(x0, y0, 3) < 0.5 });
      return;
    }
    liquids.push(liquidShape(f, fi, w, x0, y0, x1, y1));
  });
  // distance (tiles, up to 3) to the nearest river or lake: the shore gets its own plants and stones
  const shoreDist = new Uint8Array(w * h).fill(9);
  features.forEach((f) => {
    if (f.kind === 'volcano') return;
    for (const i of f.tiles) {
      const x = i % w, y = Math.floor(i / w);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < shoreDist[ny * w + nx]) shoreDist[ny * w + nx] = d;
      }
    }
  });
  const SHORE: Record<Biome['id'], Exclude<DecoKind, 'volcano'>[]> = { ice: ['icespire', 'pebbles', 'icespire', 'pebbles'], moss: ['plants', 'plants', 'tree', 'pebbles'], basalt: ['pebbles', 'plants', 'crystals', 'pebbles'], rust: ['pebbles', 'bones', 'pebbles', 'scrap'], volcanic: ['pebbles', 'vent', 'pebbles', 'crystals'] };
  // ground decoration, weighted by the biome; it grows in loose groups (a noise field sets the density) and
  // neighbours tend to be of a kind (the kind follows a second, slower field), the shore has its own set
  const kinds = Object.entries(biome.deco) as [Exclude<DecoKind, 'volcano'>, number][];
  const total = kinds.reduce((a, [, k]) => a + k, 0);
  const taken = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (terrain[y * w + x] !== 'ground') continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 6) continue; // the start area stays clear
      const shore = shoreDist[y * w + x];
      const group = Math.max(0, noise(seed + 5, x, y) - 0.38) / 0.62;
      const local = shore <= 2 ? density * 4 : density * (0.25 + group * 3.2);
      if (hash(x, y, seed) >= local) continue;
      if (depDist[y * w + x] < 2) continue; // never in or at a mining area
      if (taken.has((y - 1) * w + x - 1) || taken.has((y - 1) * w + x) || taken.has((y - 1) * w + x + 1) || taken.has(y * w + x - 1)) continue; // never two side by side
      let r = (noise(seed + 9, x * 1.6, y * 1.6) * 0.65 + hash(x, y, seed + 17) * 0.35) * total;
      let kind = kinds[kinds.length - 1][0];
      for (const [k, wgt] of kinds) if ((r -= wgt) < 0) { kind = k; break; }
      if (shore <= 2) kind = SHORE[biome.id][Math.floor(hash(x, y, seed + 71) * 4)];
      if (BIG.has(kind) && depDist[y * w + x] < 3) kind = 'pebbles'; // big things keep a wider berth
      const size = SIZE[kind] * (0.85 + hash(x, y, seed + 29) * 0.3);
      const jx = (hash(x, y, seed + 41) - 0.5) * 0.3, jy = (hash(x, y, seed + 53) - 0.5) * 0.3;
      taken.add(y * w + x);
      decos.push({ kind, tx: x, ty: y, cx: x + 0.5 + jx, cy: y + 0.5 + jy, size, flip: hash(x, y, seed + 67) < 0.5 });
    }
  }
  // flat things first, standing things later, volcanoes last (they overlap the tiles above)
  const layer: Record<DecoKind, number> = { lava: 0, crater: 0, bones: 1, scrap: 1, pebbles: 2, vent: 2, meteor: 2, crystals: 3, plants: 3, wreck: 3, icespire: 3, obelisk: 3, tree: 3, volcano: 4 };
  decos.sort((a, b) => layer[a.kind] - layer[b.kind] || a.cy - b.cy);
  const decoAt = new Map<number, Deco>();
  for (const d of decos) if (d.kind !== 'volcano') decoAt.set(d.ty * w + d.tx, d);
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
      let a = Math.min(1, Math.abs(v - 0.5) * 2.2) * 0.55;
      let col = c;
      const sd = shoreDist[y * w + x];
      if (sd <= 1) {
        // the ground takes on the shore's colour towards the water
        col = SHORE_TINT[biome.id];
        a = [0.42, 0.22, 0][sd];
      }
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return { biome, decos, shade, liquids, hidden, featureAt, decoAt };
}

/**
 * Outline of a river or lake as smooth shore lines: a field sampled every half tile (1 at a water tile's centre,
 * the mean of the touching tiles on its edges and corners) is traced at a threshold (marching squares), and the
 * loops are rounded off (Chaikin). Islands come out as holes (fill with even-odd).
 */
function liquidShape(f: Feature, fi: number, w: number, x0: number, y0: number, x1: number, y1: number): Liquid {
  const set = new Set(f.tiles);
  const path = new Path2D();
  const has = (x: number, y: number) => x >= 0 && x < w && y >= 0 && set.has(y * w + x);
  // sample grid in half tiles, one ring of padding
  const gx0 = x0 * 2 - 2, gy0 = y0 * 2 - 2, gw = (x1 - x0 + 1) * 2 + 5, gh = (y1 - y0 + 1) * 2 + 5;
  const val = (sx: number, sy: number): number => {
    const X = gx0 + sx, Y = gy0 + sy; // X, Y in half tiles; odd = tile centre, even = tile edge
    const xs = X % 2 !== 0 ? [(X - 1) / 2] : [X / 2 - 1, X / 2];
    const ys = Y % 2 !== 0 ? [(Y - 1) / 2] : [Y / 2 - 1, Y / 2];
    let n = 0, c = 0;
    for (const ty of ys) for (const tx of xs) { n++; if (has(tx, ty)) c++; }
    return c / n;
  };
  const field = new Float32Array(gw * gh);
  for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) field[sy * gw + sx] = val(sx, sy);
  const thr = f.lake ? 0.34 : 0.42;
  const V = (sx: number, sy: number) => field[sy * gw + sx];
  // crossing points on cell edges, keyed so neighbouring cells share them
  const pts = new Map<string, [number, number]>();
  const adj = new Map<string, string[]>();
  const point = (ax: number, ay: number, bx: number, by: number): string => {
    const key = ax < bx || (ax === bx && ay < by) ? `${ax},${ay},${bx},${by}` : `${bx},${by},${ax},${ay}`;
    if (!pts.has(key)) {
      const va = V(ax, ay), vb = V(bx, by);
      const k = (thr - va) / (vb - va);
      pts.set(key, [(gx0 + ax + (bx - ax) * k) / 2, (gy0 + ay + (by - ay) * k) / 2]);
    }
    return key;
  };
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let sy = 0; sy < gh - 1; sy++)
    for (let sx = 0; sx < gw - 1; sx++) {
      const a = V(sx, sy) > thr, b = V(sx + 1, sy) > thr, c = V(sx + 1, sy + 1) > thr, d = V(sx, sy + 1) > thr;
      const cs = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
      if (cs === 0 || cs === 15) continue;
      const top = () => point(sx, sy, sx + 1, sy), right = () => point(sx + 1, sy, sx + 1, sy + 1);
      const bottom = () => point(sx, sy + 1, sx + 1, sy + 1), left = () => point(sx, sy, sx, sy + 1);
      switch (cs) {
        case 1: case 14: link(left(), bottom()); break;
        case 2: case 13: link(bottom(), right()); break;
        case 3: case 12: link(left(), right()); break;
        case 4: case 11: link(top(), right()); break;
        case 6: case 9: link(top(), bottom()); break;
        case 7: case 8: link(left(), top()); break;
        case 5: link(left(), top()); link(bottom(), right()); break;
        case 10: link(top(), right()); link(left(), bottom()); break;
      }
    }
  // walk the loops, round them off, add them to the path
  const seen = new Set<string>();
  for (const startKey of adj.keys()) {
    if (seen.has(startKey)) continue;
    let loop: [number, number][] = [];
    let prev = '', cur = startKey;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur)!);
      const next = (adj.get(cur) ?? []).find((k) => k !== prev && !seen.has(k)) ?? '';
      prev = cur;
      cur = next;
    }
    if (loop.length < 3) continue;
    // an irregular shore: halve the steps, then push each point in or out along its normal by a smooth noise
    const fine: [number, number][] = [];
    for (let k = 0; k < loop.length; k++) {
      const [ax, ay] = loop[k], [bx, by] = loop[(k + 1) % loop.length];
      fine.push([ax, ay], [(ax + bx) / 2, (ay + by) / 2]);
    }
    const amp = f.lake ? 0.2 : 0.09;
    const seed = fi * 1.37 + 0.5;
    loop = fine.map(([px, py], k) => {
      const [ax, ay] = fine[(k - 1 + fine.length) % fine.length], [bx, by] = fine[(k + 1) % fine.length];
      let nx = by - ay, ny = -(bx - ax);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const n = Math.sin(px * 1.3 + py * 0.7 + seed) * 0.55 + Math.sin(px * 0.45 - py * 1.1 + seed * 2.1) * 0.45;
      return [px + nx * n * amp, py + ny * n * amp];
    });
    for (let it = 0; it < 3; it++) {
      const out: [number, number][] = [];
      for (let k = 0; k < loop.length; k++) {
        const [ax, ay] = loop[k], [bx, by] = loop[(k + 1) % loop.length];
        out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      loop = out;
    }
    path.moveTo(loop[0][0] * TILE, loop[0][1] * TILE);
    for (let k = 1; k < loop.length; k++) path.lineTo(loop[k][0] * TILE, loop[k][1] * TILE);
    path.closePath();
  }
  // rivers flow from their first tile to their last, lakes drift slowly
  const a = f.tiles[0], b = f.tiles[f.tiles.length - 1];
  let fx = (b % w) - (a % w), fy = Math.floor(b / w) - Math.floor(a / w);
  const len = Math.hypot(fx, fy) || 1;
  fx /= len;
  fy /= len;
  const glow: [number, number][] = f.tiles.filter((_, k) => k % 3 === 0).map((i) => [(i % w) + 0.5, Math.floor(i / w) + 0.5]);
  return { kind: f.kind as LiquidKind, lake: !!f.lake, feature: fi, path, x0, y0, x1, y1, flow: f.lake ? [0.6, 0.35] : [fx, fy], glow };
}
