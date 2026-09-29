// Achievement icons: Steam wants two 256x256 images per achievement (earned in colour, locked in grey);
// the game shows small ones in its achievements list. Sources: tools/raw/ach/<API_NAME>.png
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';

const RAW = 'tools/raw/ach';
mkdirSync('steam-assets/achievements', { recursive: true });
mkdirSync('public/assets/ach', { recursive: true });
for (const f of readdirSync(RAW).filter((n) => n.endsWith('.png'))) {
  const id = f.replace(/\.png$/, '');
  const src = `${RAW}/${f}`;
  await sharp(src).resize(256, 256).jpeg({ quality: 92 }).toFile(`steam-assets/achievements/${id}.jpg`);
  await sharp(src).resize(256, 256).grayscale().modulate({ brightness: 0.55 }).jpeg({ quality: 90 }).toFile(`steam-assets/achievements/${id}_locked.jpg`);
  await sharp(src).resize(96, 96).webp({ quality: 85 }).toFile(`public/assets/ach/${id}.webp`);
}
console.log('achievement icons done');
