// End card of the trailer: the logo over the darkened night sky, tagline and "coming to Steam" line.
import sharp from 'sharp';
const [,, out, lang] = process.argv;
const W = 1920, H = 1080;
const size = 150;
const tag = lang === 'de' ? 'GESTRANDET. DRUCKEN. BAUEN. STARTEN.' : 'STRANDED. PRINT. BUILD. ESCAPE.';
const soon = lang === 'de' ? 'Bald auf Steam · Demo jetzt spielen: planet-escape.dev' : 'Coming soon to Steam · Play the demo: planet-escape.dev';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${size * 0.07}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="s" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.85"/></filter>
<radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset="0.3" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#v)"/>
<g font-family="DejaVu Sans" font-weight="bold" text-anchor="middle" letter-spacing="${size * 0.12}">
<text x="${W / 2}" y="${H * 0.44}" font-size="${size}" fill="#e2e8f0" filter="url(#s)">PLANET</text>
<text x="${W / 2}" y="${H * 0.44 + size * 1.02}" font-size="${size}" fill="#22d3ee" filter="url(#g)">ESCAPE</text></g>
<text x="${W / 2}" y="${H * 0.44 + size * 1.62}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="34" letter-spacing="8" fill="#f59e0b">${tag}</text>
<text x="${W / 2}" y="${H * 0.9}" text-anchor="middle" font-family="DejaVu Sans" font-size="30" fill="#cbd5e1">${soon}</text></svg>`;
const bg = await sharp('../../public/assets/ui/title_bg.webp').resize(W, H, { fit: 'cover' }).blur(6).modulate({ brightness: 0.45 }).toBuffer();
await sharp(bg).composite([{ input: Buffer.from(svg) }]).png().toFile(out);
