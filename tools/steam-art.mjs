// Draft Steam store images in the required sizes from the game's own art (title background, ship, logo).
// Drafts to start from, not final marketing art. Run from the project root: node tools/steam-art.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'steam-assets';
mkdirSync(OUT, { recursive: true });
const BG = 'public/assets/ui/title_bg.webp';
const SHIP = 'public/assets/ui/ship.webp'; // (has its own background: only for layouts that frame it)

/** The game's logo as SVG text: PLANET in steel white, ESCAPE in cyan with a glow. */
function logo(w, h, { stacked = true } = {}) {
  // two lines of six letters: the width decides as often as the height
  const size = stacked ? Math.min(h * 0.36, w / 5.6) : Math.min(h * 0.5, w / 11);
  const glow = `<filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${size * 0.06}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const shadow = `<filter id="s" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="${size * 0.04}" stdDeviation="${size * 0.05}" flood-color="#000" flood-opacity="0.8"/></filter>`;
  const font = `font-family="DejaVu Sans" font-weight="bold" letter-spacing="${size * 0.12}"`;
  const body = stacked
    ? `<text x="50%" y="${h * 0.5 - size * 0.12}" text-anchor="middle" font-size="${size}" ${font} fill="#e2e8f0" filter="url(#s)">PLANET</text>
       <text x="50%" y="${h * 0.5 + size * 0.95}" text-anchor="middle" font-size="${size}" ${font} fill="#22d3ee" filter="url(#g)">ESCAPE</text>`
    : `<text x="50%" y="${h * 0.62}" text-anchor="middle" font-size="${size}" ${font}><tspan fill="#e2e8f0">PLANET </tspan><tspan fill="#22d3ee" filter="url(#g)">ESCAPE</tspan></text>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${glow}${shadow}</defs>${body}</svg>`);
}

/** A dark gradient from one side, so the logo stays readable over the art. */
const shade = (w, h, from = 'left', alpha = 0.75) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="d" x1="${from === 'left' ? 0 : 0}" y1="${from === 'bottom' ? 1 : 0}" x2="${from === 'left' ? 1 : 0}" y2="${from === 'bottom' ? 0 : 1}"><stop offset="0" stop-color="#05080d" stop-opacity="${alpha}"/><stop offset="0.65" stop-color="#05080d" stop-opacity="${alpha * 0.25}"/><stop offset="1" stop-color="#05080d" stop-opacity="0"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#d)"/></svg>`);

async function capsule(name, w, h, { logoBox, ship = false, text = true, from = 'left' }) {
  const bg = await sharp(BG).resize(w, h, { fit: 'cover', position: 'centre' }).modulate({ brightness: 0.9 }).toBuffer();
  const layers = [{ input: shade(w, h, from) }];
  if (ship) {
    const sh = Math.round(h * 0.95);
    const ship = await sharp(SHIP).resize({ height: sh }).toBuffer();
    const meta = await sharp(ship).metadata();
    layers.push({ input: ship, left: Math.round(w - meta.width - w * 0.04), top: Math.round((h - sh) / 2) });
  }
  if (text) {
    const [lx, ly, lw, lh] = logoBox;
    layers.push({ input: logo(lw, lh, { stacked: lh / lw > 0.3 }), left: lx, top: ly });
  }
  await sharp(bg).composite(layers).png().toFile(`${OUT}/${name}.png`);
  console.log(`${OUT}/${name}.png`, `${w}×${h}`);
}

// sizes as Steamworks asks for them (check the current list in Steamworks → Store page → Graphical assets)
await capsule('header_capsule', 920, 430, { logoBox: [30, 60, 520, 300] });
await capsule('small_capsule', 462, 174, { logoBox: [10, 8, 300, 158] });
await capsule('main_capsule', 1232, 706, { logoBox: [60, 120, 700, 440] });
await capsule('vertical_capsule', 748, 896, { logoBox: [74, 520, 600, 320], from: 'bottom', ship: false });
await capsule('library_capsule', 600, 900, { logoBox: [50, 560, 500, 300], from: 'bottom', ship: false });
await capsule('library_hero', 3840, 1240, { logoBox: [0, 0, 0, 0], text: false, from: 'left' });
// library logo: the logo alone on transparent ground
await sharp({ create: { width: 1280, height: 720, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logo(1280, 720) }])
  .png()
  .toFile(`${OUT}/library_logo.png`);
console.log(`${OUT}/library_logo.png`, '1280×720');
