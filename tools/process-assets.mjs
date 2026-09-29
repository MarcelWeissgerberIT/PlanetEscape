// Converts the raw OpenArt renders in tools/raw into optimized game assets in public/assets.
// Usage: npm run assets
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';

const RAW = 'tools/raw';
const OUT = 'public/assets';
for (const d of ['buildings', 'items', 'terrain', 'ui', 'deco']) mkdirSync(`${OUT}/${d}`, { recursive: true });

const BUILDINGS = ['core', 'conveyor', 'tunnel', 'miner', 'smelter', 'assembler', 'refinery', 'solar', 'generator', 'storage', 'splitter', 'fabricator', 'printer', 'sorter', 'overflow', 'mixer', 'valve', 'core_0', 'core_1', 'core_2'];
const TERRAIN = ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'rock'];
const ITEMS = [
  'iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'iron_plate', 'copper_plate', 'copper_wire', 'glass', 'silicon',
  'water', 'fuel', 'steel_frame', 'circuit', 'machine_part', 'precision_part', 'hull_plate', 'engine', 'nav_computer', 'fuel_cell', 'life_support',
];

async function tile(src, dst, size) {
  if (!existsSync(src)) { console.warn('missing', src); return; }
  await sharp(src).resize(size, size, { fit: 'cover' }).webp({ quality: 86 }).toFile(dst);
  console.log('tile', dst);
}

/** Remove a near-white background by flood filling from the image border. */
async function cutout(src, dst, size) {
  if (!existsSync(src)) { console.warn('missing', src); return; }
  const img = sharp(src).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return r > 228 && g > 228 && b > 228 && Math.abs(r - g) < 14 && Math.abs(g - b) < 14;
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    data[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // soften the edge: pixels next to transparent ones get partial alpha based on brightness
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (alpha[p] === 0) continue;
      const nb = alpha[p - 1] === 0 || alpha[p + 1] === 0 || alpha[p - w] === 0 || alpha[p + w] === 0;
      if (!nb) continue;
      const i = p * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 200) data[i + 3] = Math.round(255 * (1 - (lum - 200) / 55));
    }
  }
  // crop to content bounds with padding, then fit into a square
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = 12;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const side = Math.max(cw, ch);
  const cropped = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: cw, height: ch })
    .png().toBuffer();
  const squared = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left: Math.floor((side - cw) / 2), top: Math.floor((side - ch) / 2) }])
    .png().toBuffer();
  await sharp(squared).resize(size, size).webp({ quality: 88 }).toFile(dst);
  console.log('cutout', dst);
}

// map decoration (volcanoes, craters, plants, ...): cut out; the crater comes with its own ground, faded to a circle.
// `node tools/process-assets.mjs deco` redoes only these.
const DECO = ['volcano', 'crater', 'plants', 'bones', 'vent', 'lava', 'crystals', 'pebbles'];
async function roundFade(src, dst, size) {
  const r = size / 2;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g"><stop offset="0.6" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="${r}" cy="${r}" r="${r * 0.86}" fill="url(#g)"/></svg>`);
  await sharp(src).resize(size, size).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 88 }).toFile(dst);
  console.log('round', dst);
}
for (const d of DECO) {
  if (d === 'crater') await roundFade(`${RAW}/d_${d}.png`, `${OUT}/deco/${d}.webp`, 256);
  else await cutout(`${RAW}/d_${d}.png`, `${OUT}/deco/${d}.webp`, 256);
}
if (process.argv[2] === 'deco') process.exit(0);

for (const b of BUILDINGS) await tile(`${RAW}/${b}.png`, `${OUT}/buildings/${b}.webp`, 256);
for (const t of TERRAIN) await tile(`${RAW}/t_${t}.png`, `${OUT}/terrain/${t}.webp`, 256);
for (const it of ITEMS) await cutout(`${RAW}/i_${it}.png`, `${OUT}/items/${it}.webp`, 128);

if (existsSync(`${RAW}/title_bg.png`)) await sharp(`${RAW}/title_bg.png`).resize(1920).webp({ quality: 82 }).toFile(`${OUT}/ui/title_bg.webp`);
if (existsSync(`${RAW}/ship.png`)) await sharp(`${RAW}/ship.png`).resize({ height: 1400 }).webp({ quality: 84 }).toFile(`${OUT}/ui/ship.webp`);
for (const n of ['story_1', 'story_2', 'story_3', 'story_4']) if (existsSync(`${RAW}/${n}.png`)) await sharp(`${RAW}/${n}.png`).resize(1280).webp({ quality: 80 }).toFile(`${OUT}/ui/${n}.webp`);
if (existsSync(`${RAW}/kora.png`)) await sharp(`${RAW}/kora.png`).resize(256).webp({ quality: 86 }).toFile(`${OUT}/ui/kora.webp`);
if (existsSync(`${RAW}/icon.png`)) {
  await sharp(`${RAW}/icon.png`).resize(512).png().toFile(`public/icon-512.png`);
  await sharp(`${RAW}/icon.png`).resize(192).png().toFile(`public/icon-192.png`);
  await sharp(`${RAW}/icon.png`).resize(180).png().toFile(`public/apple-touch-icon.png`);
  await sharp(`${RAW}/icon.png`).resize(64).png().toFile(`public/favicon.png`);
}
console.log('assets done');
