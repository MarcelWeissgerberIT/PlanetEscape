// Draws the sprites of the newer parts and the logic / computer parts in the style of the original buildings: chamfered steel housings with
// bevels, bolts, panel seams, glowing cyan strips and orange accents. Run from the project root:
//   node tools/sprites-parts.mjs            (writes public/assets/buildings/*.webp and items/crate.webp)
//   node tools/sprites-parts.mjs sheet.png  (also writes a contact sheet for a quick look)
import sharp from 'sharp';

const CYAN = '#22d3ee', ORANGE = '#f97316', AMBER = '#f59e0b', GREEN = '#34d399', RED = '#f43f5e';

const defs = `<defs>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c8593"/><stop offset="0.45" stop-color="#555d6a"/><stop offset="1" stop-color="#2d333c"/></linearGradient>
  <linearGradient id="steelV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7886"/><stop offset="1" stop-color="#343a44"/></linearGradient>
  <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a525e"/><stop offset="1" stop-color="#2a3038"/></linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset="1" stop-color="#0d1015"/></linearGradient>
  <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b6470"/><stop offset="0.5" stop-color="#c9d1db"/><stop offset="1" stop-color="#4b535e"/></linearGradient>
  <linearGradient id="chromeV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6470"/><stop offset="0.5" stop-color="#c9d1db"/><stop offset="1" stop-color="#4b535e"/></linearGradient>
  <linearGradient id="crate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e38a2c"/><stop offset="1" stop-color="#9a4a12"/></linearGradient>
  <linearGradient id="cell" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f5f46"/><stop offset="0.45" stop-color="#34d399"/><stop offset="1" stop-color="#0b4a37"/></linearGradient>
  <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30353d"/><stop offset="1" stop-color="#23272e"/></linearGradient>
  <linearGradient id="roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#65707e"/><stop offset="1" stop-color="#363d47"/></linearGradient>
  <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#aeb7c2"/><stop offset="0.5" stop-color="#f1f5f9"/><stop offset="1" stop-color="#9aa3ae"/></linearGradient>
  <radialGradient id="glowC"><stop offset="0" stop-color="#a5f3fc"/><stop offset="0.5" stop-color="${CYAN}"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient>
  <radialGradient id="plasma"><stop offset="0" stop-color="#f5f3ff"/><stop offset="0.35" stop-color="#c084fc"/><stop offset="0.7" stop-color="#7c3aed"/><stop offset="1" stop-color="#4c1d95" stop-opacity="0"/></radialGradient>
  <radialGradient id="dial"><stop offset="0" stop-color="#1e252e"/><stop offset="1" stop-color="#0b0e12"/></radialGradient>
  <pattern id="hazard" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#1a1d22"/><rect width="8" height="16" fill="${AMBER}"/></pattern>
  <pattern id="ribs" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#3e4652"/><rect width="10" height="3" fill="#2a3038"/><rect y="3" width="10" height="1" fill="#6b7482" opacity="0.6"/></pattern>
  <pattern id="ribsV" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#46505d"/><rect width="3" height="10" fill="#2c323b"/><rect x="3" width="1" height="10" fill="#7c8593" opacity="0.5"/></pattern>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="6"/><feComponentTransfer><feFuncA type="linear" slope="0.6"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>`;

/** Chamfered octagon path. */
const oct = (x, y, w, h, c) => `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`;
const bolt = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#8b94a1" stroke="#15191f" stroke-width="2"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#dbe2ea" opacity="0.8"/>`;
/** Steel housing with bevel, grain, seams and corner bolts. */
function housing(x = 22, y = 22, w = 212, h = 212, c = 30) {
  const i = 11;
  return `<g filter="url(#shadow)">
    <path d="${oct(x, y, w, h, c)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
    <path d="${oct(x, y, w, h, c)}" fill="#000" filter="url(#grain)" opacity="0.9"/>
    <path d="${oct(x + 3, y + 3, w - 6, h - 6, c - 1)}" fill="none" stroke="#b7c0cc" stroke-opacity="0.35" stroke-width="2"/>
    <path d="${oct(x + i, y + i, w - 2 * i, h - 2 * i, c - 5)}" fill="url(#plate)" stroke="#161a20" stroke-width="3"/>
    <path d="${oct(x + i + 2, y + i + 2, w - 2 * i - 4, h - 2 * i - 4, c - 6)}" fill="none" stroke="#8a94a2" stroke-opacity="0.25" stroke-width="1.5"/>
  </g>
  ${bolt(x + c * 0.62, y + c * 0.62)}${bolt(x + w - c * 0.62, y + c * 0.62)}${bolt(x + c * 0.62, y + h - c * 0.62)}${bolt(x + w - c * 0.62, y + h - c * 0.62)}`;
}
const strip = (x, y, w, h, color = CYAN) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${color}" filter="url(#glow)"/><rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, w - 2)}" height="${Math.max(1, h - 2)}" rx="${Math.min(w, h) / 2}" fill="#ecfeff" opacity="0.55"/>`;
const led = (x, y, color = GREEN, r = 5) => `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="${color}" opacity="0.35" filter="url(#softglow)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#0b0e12" stroke-width="1.5"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="${r * 0.35}" fill="#fff" opacity="0.8"/>`;
/** Glowing output chevron pointing north at (x, y). */
const chevron = (x, y, s = 16, color = CYAN) => `<path d="M${x - s} ${y + s * 0.55}L${x} ${y - s * 0.45}L${x + s} ${y + s * 0.55}" fill="none" stroke="${color}" stroke-width="${s * 0.42}" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>`;
const vents = (x, y, n, w = 26, gap = 7) => Array.from({ length: n }, (_, k) => `<rect x="${x}" y="${y + k * gap}" width="${w}" height="3.5" rx="1.7" fill="#0c0f13"/><rect x="${x}" y="${y + k * gap + 3.5}" width="${w}" height="1" fill="#8792a0" opacity="0.35"/>`).join('');
const hazard = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hazard)" stroke="#12161b" stroke-width="2"/>`;
/** A short piece of conveyor running north through the tile (for pass-through parts). */
function beltStrip(x, y, w, h) {
  const chev = [0.25, 0.55, 0.85].map((f) => chevron(x + w / 2, y + h * f, w * 0.2)).join('');
  return `<rect x="${x - 8}" y="${y}" width="8" height="${h}" fill="url(#chromeV)" stroke="#12161b" stroke-width="2"/><rect x="${x + w}" y="${y}" width="8" height="${h}" fill="url(#chromeV)" stroke="#12161b" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#dark)"/>${Array.from({ length: Math.floor(h / 14) }, (_, k) => `<rect x="${x}" y="${y + k * 14 + 6}" width="${w}" height="2" fill="#262c35"/>`).join('')}${chev}`;
}

const S = {};

// ---------- detail kit: small technical bits that make a housing look used and alive ----------
const MONO = 'DejaVu Sans Mono, monospace';
const txt = (x, y, t, size = 11, color = '#cbd5e1', anchor = 'middle') => `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="bold" fill="${color}" text-anchor="${anchor}" letter-spacing="0.5">${t}</text>`;
/** Type plate with two screws and stencil text. */
const plate = (x, y, w, h, t, color = '#e2e8f0', bg = '#1b2027') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${bg}" stroke="#0b0e12" stroke-width="2"/><rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="2" fill="#fff" opacity="0.08"/><circle cx="${x + 5}" cy="${y + h / 2}" r="2" fill="#6b7482"/><circle cx="${x + w - 5}" cy="${y + h / 2}" r="2" fill="#6b7482"/>${txt(x + w / 2, y + h / 2 + h * 0.3, t, Math.min(h * 0.72, 14), color)}`;
/** A row of rivets between two points. */
const rivets = (x1, y1, x2, y2, n, r = 2.4) => Array.from({ length: n }, (_, k) => { const f = n === 1 ? 0.5 : k / (n - 1), x = x1 + (x2 - x1) * f, y = y1 + (y2 - y1) * f; return `<circle cx="${x}" cy="${y}" r="${r}" fill="#9aa4b1" stroke="#15191f" stroke-width="1"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff" opacity="0.6"/>`; }).join('');
/** Cooling fan behind a grille. */
function fan(x, y, r) {
  const blades = Array.from({ length: 6 }, (_, k) => `<path d="M${x} ${y}q${r * 0.55} ${-r * 0.2} ${r * 0.72} ${-r * 0.62}q${-r * 0.35} ${-r * 0.1} ${-r * 0.72} ${r * 0.62}z" fill="#3b4452" transform="rotate(${k * 60} ${x} ${y})"/>`).join('');
  return `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="#0b0e12"/><circle cx="${x}" cy="${y}" r="${r + 1.5}" fill="none" stroke="url(#chrome)" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${r}" fill="#11151b"/>${blades}<circle cx="${x}" cy="${y}" r="${r * 0.22}" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/>${[0.45, 0.8].map((k) => `<circle cx="${x}" cy="${y}" r="${r * k}" fill="none" stroke="#6b7482" stroke-width="1.2" opacity="0.7"/>`).join('')}<path d="M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}" stroke="#6b7482" stroke-width="1.2" opacity="0.7"/>`;
}
/** A hose or cable along a path, with a highlight and clamp rings at the given points. */
const hose = (d, w = 8, color = '#262d37', clamps = []) => `<path d="${d}" fill="none" stroke="#07090c" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="${Math.max(1, w * 0.28)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1 -1)"/>${clamps.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${w * 0.72}" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/>`).join('')}`;
/** Analogue gauge. */
function gauge(x, y, r, v = 0.6, color = AMBER) {
  const a = (-135 + 270 * v) * (Math.PI / 180);
  const ticks = Array.from({ length: 7 }, (_, k) => { const t = (-135 + 45 * k) * (Math.PI / 180); return `<line x1="${x + Math.sin(t) * r * 0.62}" y1="${y - Math.cos(t) * r * 0.62}" x2="${x + Math.sin(t) * r * 0.8}" y2="${y - Math.cos(t) * r * 0.8}" stroke="${k > 4 ? RED : '#94a3b8'}" stroke-width="1.6"/>`; }).join('');
  return `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="#0b0e12"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#chrome)"/><circle cx="${x}" cy="${y}" r="${r * 0.84}" fill="#e8edf2"/>${ticks}<line x1="${x}" y1="${y}" x2="${x + Math.sin(a) * r * 0.72}" y2="${y - Math.cos(a) * r * 0.72}" stroke="${color === AMBER ? '#b91c1c' : color}" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${r * 0.14}" fill="#1f2937"/>`;
}
/** A row of tiny status LEDs. */
const ledRow = (x, y, colors, gap = 9, r = 2.6) => colors.map((c, k) => `<circle cx="${x + k * gap}" cy="${y}" r="${r + 1.2}" fill="#07090c"/><circle cx="${x + k * gap}" cy="${y}" r="${r}" fill="${c}" ${c === '#1f2937' ? '' : 'filter="url(#glow)"'}/>`).join('');
/** Cooling fins. */
const heatsink = (x, y, w, h, n) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#1b2027" stroke="#0b0e12" stroke-width="1.5"/>${Array.from({ length: n }, (_, k) => `<rect x="${x + 2 + k * ((w - 4) / n)}" y="${y + 2}" width="${(w - 4) / n - 2}" height="${h - 4}" rx="1" fill="url(#chromeV)" opacity="0.8"/>`).join('')}`;
/** Small monitor with a trace, bars or text lines. */
function screen(x, y, w, h, kind = 'graph', color = CYAN) {
  let body = '';
  if (kind === 'graph') {
    const pts = Array.from({ length: 9 }, (_, k) => `${x + 4 + k * ((w - 8) / 8)},${y + h * (0.35 + 0.3 * Math.sin(k * 1.3) * Math.cos(k * 0.7))}`).join(' ');
    body = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" filter="url(#glow)"/>`;
  } else if (kind === 'bars') {
    body = Array.from({ length: 6 }, (_, k) => { const bh = (h - 8) * (0.3 + 0.6 * Math.abs(Math.sin(k * 1.7 + 1))); return `<rect x="${x + 4 + k * ((w - 8) / 6)}" y="${y + h - 4 - bh}" width="${(w - 8) / 6 - 2}" height="${bh}" fill="${color}" opacity="0.85"/>`; }).join('');
  } else {
    body = Array.from({ length: Math.floor((h - 6) / 7) }, (_, k) => `<rect x="${x + 4}" y="${y + 4 + k * 7}" width="${(w - 8) * (0.4 + 0.5 * Math.abs(Math.sin(k * 2.1)))}" height="3" fill="${color}" opacity="0.8"/>`).join('');
  }
  return `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="4" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#04121a"/>${body}<rect x="${x}" y="${y}" width="${w}" height="${h * 0.4}" rx="2" fill="#fff" opacity="0.05"/>`;
}
/** Warning triangle. */
const warn = (x, y, s = 16, color = AMBER) => `<path d="M${x} ${y - s * 0.55}L${x + s * 0.55} ${y + s * 0.45}H${x - s * 0.55}Z" fill="${color}" stroke="#12161b" stroke-width="1.8" stroke-linejoin="round"/><rect x="${x - 1.2}" y="${y - s * 0.22}" width="2.4" height="${s * 0.36}" fill="#12161b"/><circle cx="${x}" cy="${y + s * 0.28}" r="1.5" fill="#12161b"/>`;
/** Bar code sticker. */
const barcode = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e5e7eb" stroke="#0b0e12" stroke-width="1"/>${Array.from({ length: Math.floor((w - 4) / 2.2) }, (_, k) => (k * 7) % 3 ? `<rect x="${x + 2 + k * 2.2}" y="${y + 2}" width="${(k * 5) % 2 ? 1.4 : 0.8}" height="${h - 4}" fill="#111827"/>` : '').join('')}`;
/** Grab handle. */
const handle = (x, y, w, vertical = false) => vertical
  ? `<rect x="${x - 3}" y="${y}" width="6" height="${w}" rx="3" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/><rect x="${x - 5}" y="${y - 2}" width="10" height="5" rx="2" fill="#475569"/><rect x="${x - 5}" y="${y + w - 3}" width="10" height="5" rx="2" fill="#475569"/>`
  : `<rect x="${x}" y="${y - 3}" width="${w}" height="6" rx="3" fill="url(#chromeV)" stroke="#0b0e12" stroke-width="1.5"/><rect x="${x - 2}" y="${y - 5}" width="5" height="10" rx="2" fill="#475569"/><rect x="${x + w - 3}" y="${y - 5}" width="5" height="10" rx="2" fill="#475569"/>`;
/** Knob with an indicator notch. */
const knob = (x, y, r, a = 40) => `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="#0b0e12"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#chrome)"/><circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="url(#steel)"/><line x1="${x}" y1="${y}" x2="${x + Math.sin(a * Math.PI / 180) * r * 0.8}" y2="${y - Math.cos(a * Math.PI / 180) * r * 0.8}" stroke="${ORANGE}" stroke-width="2.4" stroke-linecap="round"/>`;
/** Panel seam with screws. */
const seam = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#12161b" stroke-width="2"/><line x1="${x1 + 1}" y1="${y1 + 1}" x2="${x2 + 1}" y2="${y2 + 1}" stroke="#8a94a2" stroke-opacity="0.25" stroke-width="1"/>`;


S.timer = `${housing()}
  <circle cx="128" cy="134" r="66" fill="#0b0e12" stroke="#15191f" stroke-width="4"/>
  <circle cx="128" cy="134" r="62" fill="url(#chrome)" opacity="0.7"/>
  <circle cx="128" cy="134" r="55" fill="url(#dial)" stroke="#07090c" stroke-width="3"/>
  ${Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2, r1 = k % 3 ? 44 : 40; return `<line x1="${128 + Math.sin(a) * r1}" y1="${134 - Math.cos(a) * r1}" x2="${128 + Math.sin(a) * 50}" y2="${134 - Math.cos(a) * 50}" stroke="#94a3b8" stroke-width="${k % 3 ? 2 : 4}" stroke-linecap="round"/>`; }).join('')}
  <path d="M128 90A44 44 0 1 1 84 134" fill="none" stroke="${CYAN}" stroke-width="7" stroke-linecap="round" filter="url(#glow)"/>
  <line x1="128" y1="134" x2="128" y2="96" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round"/>
  <line x1="128" y1="134" x2="156" y2="150" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="128" cy="134" r="8" fill="#cbd5e1" stroke="#0b0e12" stroke-width="2"/>
  ${chevron(128, 48, 13)}
  ${led(58, 206, GREEN, 4)}${led(198, 206, AMBER, 4)}
  ${vents(40, 70, 4, 18)}${vents(198, 70, 4, 18)}`;

S.sensor = `${beltStrip(88, 22, 80, 212)}
  <g filter="url(#shadow)">
    <path d="${oct(22, 86, 58, 84, 12)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
    <path d="${oct(176, 86, 58, 84, 12)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  </g>
  <rect x="32" y="98" width="38" height="60" rx="6" fill="url(#plate)" stroke="#12161b" stroke-width="2"/>
  <rect x="186" y="98" width="38" height="60" rx="6" fill="url(#plate)" stroke="#12161b" stroke-width="2"/>
  ${hazard(32, 160, 38, 8)}${hazard(186, 160, 38, 8)}
  <circle cx="70" cy="128" r="11" fill="#12161b"/><circle cx="70" cy="128" r="7" fill="${RED}" filter="url(#glow)"/>
  <circle cx="186" cy="128" r="11" fill="#12161b"/><circle cx="186" cy="128" r="7" fill="#7f1d1d"/>
  <line x1="74" y1="128" x2="182" y2="128" stroke="${RED}" stroke-width="4" filter="url(#glow)"/>
  <line x1="74" y1="128" x2="182" y2="128" stroke="#ffe4e6" stroke-width="1.5"/>
  ${bolt(40, 92, 4)}${bolt(62, 92, 4)}${bolt(194, 92, 4)}${bolt(216, 92, 4)}
  ${led(51, 110, GREEN, 3.5)}${led(205, 110, AMBER, 3.5)}`;

S.radio = `${housing()}
  ${vents(46, 176, 4, 40)}${vents(170, 176, 4, 40)}
  <rect x="104" y="196" width="48" height="26" rx="5" fill="#0c0f13" stroke="#4b5563" stroke-width="2"/>
  <rect x="110" y="202" width="36" height="6" fill="#1f2937"/>
  <ellipse cx="128" cy="118" rx="58" ry="58" fill="url(#chrome)" stroke="#12161b" stroke-width="4"/>
  <ellipse cx="128" cy="118" rx="48" ry="48" fill="url(#dial)" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="128" cy="118" r="30" fill="none" stroke="#475569" stroke-width="2"/>
  <line x1="128" y1="118" x2="128" y2="64" stroke="url(#chrome)" stroke-width="7" stroke-linecap="round"/>
  <line x1="128" y1="118" x2="92" y2="148" stroke="#64748b" stroke-width="4"/><line x1="128" y1="118" x2="164" y2="148" stroke="#64748b" stroke-width="4"/>
  <circle cx="128" cy="60" r="9" fill="${AMBER}" filter="url(#glow)"/>
  <g fill="none" stroke="${CYAN}" stroke-width="5" stroke-linecap="round" filter="url(#glow)">
    <path d="M104 42a34 34 0 0 0 0 36"/><path d="M152 42a34 34 0 0 1 0 36"/>
    <path d="M88 30a56 56 0 0 0 0 60"/><path d="M168 30a56 56 0 0 1 0 60"/>
  </g>
  ${led(54, 58, GREEN, 5)}${led(202, 58, AMBER, 5)}`;

S.battery = `${housing()}
  ${[64, 128, 192].map((x) => `
    <rect x="${x - 26}" y="58" width="52" height="150" rx="16" fill="#0f1319" stroke="#12161b" stroke-width="3"/>
    <rect x="${x - 22}" y="62" width="44" height="142" rx="13" fill="url(#chrome)" opacity="0.55"/>
    <rect x="${x - 17}" y="92" width="34" height="106" rx="9" fill="url(#cell)" filter="url(#glow)"/>
    <rect x="${x - 17}" y="92" width="34" height="8" rx="4" fill="#a7f3d0" opacity="0.8"/>
    <rect x="${x - 10}" y="44" width="20" height="18" rx="4" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/>`).join('')}
  <path d="M40 58h176" stroke="#b45309" stroke-width="5"/><path d="M40 58h176" stroke="${ORANGE}" stroke-width="2"/>
  <path d="M136 108l-22 40h18l-12 36 34-50h-18l12-26z" fill="#fde047" stroke="#713f12" stroke-width="3" filter="url(#glow)"/>`;

const pickerBase = `${housing(38, 38, 180, 180, 26)}
  ${hazard(54, 196, 148, 12)}
  <circle cx="128" cy="128" r="54" fill="#0c0f13"/>
  <circle cx="128" cy="128" r="50" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  <circle cx="128" cy="128" r="38" fill="url(#steel)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return bolt(128 + Math.cos(a) * 44, 128 + Math.sin(a) * 44, 3.5); }).join('')}
  <circle cx="128" cy="128" r="16" fill="#1f2937" stroke="${CYAN}" stroke-width="3" filter="url(#glow)"/>
  ${chevron(128, 30, 12)}`;
S.picker_base = pickerBase;
S.picker = `${pickerBase}
  <g filter="url(#shadow)">
    <path d="M128 128L84 80" stroke="#12161b" stroke-width="26" stroke-linecap="round"/>
    <path d="M128 128L84 80" stroke="url(#chrome)" stroke-width="20" stroke-linecap="round"/>
    <path d="M84 80L112 40" stroke="#12161b" stroke-width="20" stroke-linecap="round"/>
    <path d="M84 80L112 40" stroke="url(#chromeV)" stroke-width="14" stroke-linecap="round"/>
    <circle cx="84" cy="80" r="13" fill="${ORANGE}" stroke="#12161b" stroke-width="3"/>
    <path d="M104 40l-8-16M120 40l8-16" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round"/>
  </g>
  <circle cx="128" cy="128" r="14" fill="${ORANGE}" stroke="#12161b" stroke-width="3"/>`;

S.road = `<rect width="256" height="256" fill="url(#asphalt)"/><rect width="256" height="256" fill="#000" filter="url(#grain)"/>
  <rect y="0" width="256" height="20" fill="url(#chromeV)" opacity="0.7"/><rect y="236" width="256" height="20" fill="url(#chromeV)" opacity="0.7"/>
  <rect y="20" width="256" height="3" fill="#0b0d10"/><rect y="233" width="256" height="3" fill="#0b0d10"/>
  ${[0, 64, 128, 192].map((x) => `<rect x="${x + 10}" y="123" width="40" height="10" rx="3" fill="#e5b83a"/>`).join('')}
  <circle cx="44" cy="70" r="4" fill="#0b0d10" opacity="0.6"/><circle cx="200" cy="180" r="5" fill="#0b0d10" opacity="0.5"/><circle cx="150" cy="60" r="3" fill="#9ca3af" opacity="0.25"/>`;

S.dock = `${housing()}
  <rect x="50" y="52" width="140" height="152" rx="8" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 7 }, (_, k) => `<rect x="58" y="${62 + k * 20}" width="124" height="12" rx="6" fill="url(#chromeV)" stroke="#12161b" stroke-width="1.5"/><circle cx="62" cy="${68 + k * 20}" r="2.2" fill="#475569"/><circle cx="178" cy="${68 + k * 20}" r="2.2" fill="#475569"/>`).join('')}
  ${hazard(50, 34, 140, 14)}
  <rect x="196" y="52" width="26" height="100" rx="5" fill="url(#steelV)" stroke="#12161b" stroke-width="2.5"/>
  ${screen(200, 58, 18, 26, 'bars', GREEN)}${ledRow(203, 96, [GREEN, AMBER], 11, 2.6)}
  <rect x="202" y="108" width="14" height="10" rx="2" fill="${RED}" stroke="#0b0e12" stroke-width="1.5"/><rect x="202" y="124" width="14" height="10" rx="2" fill="${GREEN}" stroke="#0b0e12" stroke-width="1.5"/>
  ${hose('M209 152 C 209 180, 196 196, 180 212', 5, '#1f2937', [[206, 172]])}
  ${plate(56, 208, 82, 14, 'DOCK-B', '#e2e8f0')}
  ${strip(36, 70, 5, 116)}
  ${chevron(120, 124, 20)}`;

S.merger = `${housing()}
  <rect x="100" y="36" width="56" height="92" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  <rect x="100" y="128" width="56" height="94" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  <rect x="34" y="100" width="94" height="56" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  <rect x="128" y="100" width="94" height="56" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${[0.35, 0.72].map((f) => chevron(128, 128 + 94 * f, 12)).join('')}
  <g transform="rotate(90 128 128)">${[0.35, 0.72].map((f) => chevron(128, 128 + 94 * f, 12)).join('')}</g>
  <g transform="rotate(-90 128 128)">${[0.35, 0.72].map((f) => chevron(128, 128 + 94 * f, 12)).join('')}</g>
  <circle cx="128" cy="128" r="30" fill="#0b0e12"/><circle cx="128" cy="128" r="26" fill="none" stroke="url(#chrome)" stroke-width="6"/>
  <circle cx="128" cy="128" r="14" fill="${AMBER}" opacity="0.9" filter="url(#glow)"/><circle cx="128" cy="128" r="7" fill="#fde68a"/>
  ${chevron(128, 62, 16, AMBER)}${chevron(128, 92, 12, AMBER)}
  ${plate(160, 206, 56, 13, 'MRG-3')}${ledRow(44, 50, [GREEN, AMBER], 11)}`;

S.service = `${housing(10, 10, 236, 236, 30)}
  <rect x="30" y="30" width="112" height="112" rx="10" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  <circle cx="86" cy="86" r="40" fill="none" stroke="${AMBER}" stroke-width="4" stroke-dasharray="10 7" opacity="0.8"/>
  ${hazard(40, 130, 92, 8)}
  <g filter="url(#shadow)">
    ${[[86 - 26, 86 - 26], [86 + 26, 86 - 26], [86 - 26, 86 + 26], [86 + 26, 86 + 26]].map(([x, y]) => `<line x1="86" y1="86" x2="${x}" y2="${y}" stroke="url(#chrome)" stroke-width="6" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="11" fill="#0b0e12" opacity="0.6"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#94a3b8" stroke-width="2"/>`).join('')}
    <rect x="72" y="74" width="28" height="24" rx="5" fill="url(#steel)" stroke="#12161b" stroke-width="3"/>
    <circle cx="86" cy="86" r="5" fill="${AMBER}" filter="url(#glow)"/></g>
  <rect x="154" y="30" width="72" height="112" rx="8" fill="url(#steelV)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 4 }, (_, k) => `<rect x="162" y="${40 + k * 24}" width="56" height="16" rx="3" fill="#1b2027" stroke="#0b0e12" stroke-width="1.5"/><rect x="166" y="${44 + k * 24}" width="${14 + k * 9}" height="8" rx="2" fill="${k < 2 ? GREEN : AMBER}" opacity="0.85"/>`).join('')}
  <g transform="translate(58 160) rotate(-35)"><rect x="0" y="-7" width="92" height="14" rx="7" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/><path d="M92 -18a20 20 0 1 1 0 36l6-12a8 8 0 1 0 0-12z" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/></g>
  ${plate(146, 206, 84, 16, 'SERVICE', '#fde68a')}${ledRow(40, 214, [GREEN, AMBER, CYAN], 12)}${strip(154, 152, 72, 6, AMBER)}`;

S.recycler = `${housing()}
  <g transform="rotate(180 128 124)">
  <path d="M60 58h136l-22 58H82z" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${[0, 1, 2, 3, 4].map((k) => `<path d="M${74 + k * 24} 116l12 -22l12 22z" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/>`).join('')}
  <rect x="70" y="116" width="116" height="44" rx="6" fill="#141a22" stroke="#12161b" stroke-width="3"/>
  ${[0, 1].map((r) => `<circle cx="${104 + r * 48}" cy="138" r="17" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>` + Array.from({ length: 8 }, (_, k) => `<rect x="${104 + r * 48 - 2}" y="${138 - 20}" width="4" height="8" fill="#94a3b8" transform="rotate(${k * 45} ${104 + r * 48} 138)"/>`).join('')).join('')}
  <path d="M100 176h56l-8 20h-40z" fill="url(#steelV)" stroke="#12161b" stroke-width="3"/>
  </g>
  ${chevron(128, 44, 14, GREEN)}
  <g fill="none" stroke="${GREEN}" stroke-width="5" stroke-linecap="round" filter="url(#glow)"><path d="M40 150a88 88 0 0 1 10 -64"/><path d="M216 106a88 88 0 0 1 -10 64"/></g>
  ${plate(92, 204, 72, 14, 'RE-CYCLE', '#bbf7d0')}${warn(206, 214, 12)}`;

S.kitport = `${housing()}
  <rect x="50" y="118" width="156" height="88" rx="6" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 4 }, (_, k) => `<rect x="58" y="${128 + k * 19}" width="140" height="11" rx="5.5" fill="url(#chromeV)" stroke="#12161b" stroke-width="1.2"/>`).join('')}
  <g filter="url(#shadow)"><rect x="92" y="46" width="72" height="62" rx="6" fill="#0369a1" stroke="#0c4a6e" stroke-width="4"/>
  <rect x="100" y="54" width="56" height="46" rx="3" fill="#e0f2fe" opacity="0.9"/>
  <path d="M108 90V64h16l8 10h16v16z" fill="none" stroke="#0369a1" stroke-width="4" stroke-linejoin="round"/></g>
  ${chevron(128, 36, 12)}
  ${plate(58, 210, 70, 13, 'KIT-OUT')}${ledRow(160, 216, [GREEN, CYAN], 11)}
  ${strip(36, 120, 5, 84)}${strip(215, 120, 5, 84)}`;

S.mast = `<g filter="url(#shadow)">
  <path d="${oct(58, 58, 140, 140, 24)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  ${[[128, 128, 60, 60], [128, 128, 196, 60], [128, 128, 60, 196], [128, 128, 196, 196]].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#chrome)" stroke-width="9" stroke-linecap="round"/>`).join('')}
  <rect x="100" y="100" width="56" height="56" fill="none" stroke="#9aa6b5" stroke-width="5"/>
  <path d="M100 100L156 156M156 100L100 156" stroke="#64748b" stroke-width="3"/>
  <circle cx="128" cy="128" r="18" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/></g>
  <g fill="none" stroke="${AMBER}" stroke-width="5" stroke-linecap="round" filter="url(#glow)"><path d="M100 70a40 40 0 0 1 56 0"/><path d="M84 52a64 64 0 0 1 88 0"/></g>
  ${led(128, 128, RED, 6)}${plate(96, 206, 64, 14, 'RLY')}`;

S.drone = `<g filter="url(#shadow)">
  ${[[64, 64], [192, 64], [64, 176], [192, 176]].map(([x, y]) => `<line x1="128" y1="120" x2="${x}" y2="${y}" stroke="#12161b" stroke-width="16" stroke-linecap="round"/><line x1="128" y1="120" x2="${x}" y2="${y}" stroke="url(#chrome)" stroke-width="10" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="30" fill="#0b0e12" opacity="0.55"/><circle cx="${x}" cy="${y}" r="30" fill="none" stroke="#94a3b8" stroke-width="3"/><circle cx="${x}" cy="${y}" r="9" fill="url(#chrome)" stroke="#0b0e12" stroke-width="2"/>`).join('')}
  <path d="${oct(92, 84, 72, 72, 16)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  <rect x="104" y="96" width="48" height="20" rx="5" fill="#141a22"/>${strip(108, 100, 40, 6)}
  <circle cx="128" cy="136" r="10" fill="#0b0e12"/><circle cx="128" cy="136" r="6" fill="${AMBER}" filter="url(#glow)"/></g>
  ${led(64, 64, RED, 4)}${led(192, 64, GREEN, 4)}`;

S.depot = `${housing(10, 10, 236, 236, 30)}
  <rect x="24" y="24" width="208" height="70" rx="6" fill="url(#roof)" stroke="#12161b" stroke-width="3"/>
  ${seam(24, 58, 232, 58)}
  ${fan(52, 58, 21)}
  ${screen(84, 32, 60, 36, 'graph', GREEN)}${ledRow(88, 80, [GREEN, GREEN, AMBER, '#1f2937', CYAN], 11, 2.6)}
  <circle cx="170" cy="55" r="16" fill="#0b0e12"/><circle cx="170" cy="55" r="13" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/><circle cx="170" cy="55" r="8" fill="#7c2d12" stroke="#0b0e12" stroke-width="1.5"/><circle cx="167" cy="52" r="2.5" fill="#fdba74" opacity="0.8"/>
  ${heatsink(194, 32, 30, 50, 5)}
  ${plate(62, 98, 132, 18, 'R-DEPOT 04', '#fde68a')}
  ${warn(40, 107, 15)}${warn(216, 107, 15)}
  ${[0, 1, 2, 3].map((k) => {
    const x = 24 + k * 53;
    return `<rect x="${x}" y="122" width="49" height="102" rx="5" fill="#0a0d11" stroke="#12161b" stroke-width="3"/>
    <rect x="${x + 3}" y="125" width="43" height="14" fill="url(#ribs)"/>
    ${txt(x + 24.5, 150, String(k + 1), 12, '#94a3b8')}
    <rect x="${x + 7}" y="156" width="35" height="50" rx="4" fill="#111820" stroke="${CYAN}" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="4 3"/>
    <rect x="${x + 16}" y="196" width="17" height="6" rx="2" fill="url(#chromeV)"/><rect x="${x + 19}" y="198" width="4" height="2" fill="${GREEN}"/><rect x="${x + 26}" y="198" width="4" height="2" fill="${GREEN}"/>
    ${hazard(x + 3, 212, 43, 8)}`;
  }).join('')}
  ${hose('M30 96 C 20 120, 22 160, 26 200', 5, '#1f2937', [[24, 150]])}${hose('M226 96 C 236 120, 234 160, 230 200', 5, '#7c2d12', [[232, 150]])}
  ${barcode(196, 100, 26, 12)}`;

S.stacker = `${housing()}
  <rect x="54" y="42" width="14" height="172" rx="4" fill="url(#chromeV)" stroke="#12161b" stroke-width="2"/>
  <rect x="188" y="42" width="14" height="172" rx="4" fill="url(#chromeV)" stroke="#12161b" stroke-width="2"/>
  ${[0, 1, 2].map((k) => `<g filter="url(#shadow)"><rect x="${80 + k * 6}" y="${150 - k * 42}" width="${96 - k * 12}" height="46" rx="6" fill="url(#crate)" stroke="#5a2a0a" stroke-width="3"/>
    <path d="M${80 + k * 6} ${173 - k * 42}h${96 - k * 12}M128 ${150 - k * 42}v46" stroke="#5a2a0a" stroke-width="3"/>
    <rect x="${84 + k * 6}" y="${153 - k * 42}" width="${88 - k * 12}" height="6" rx="3" fill="#fdba74" opacity="0.5"/></g>`).join('')}
  <rect x="68" y="204" width="120" height="10" rx="3" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/>
  ${chevron(128, 44, 12)}
  ${strip(40, 60, 5, 60)}${strip(211, 60, 5, 60)}`;

S.hall = `${housing(10, 10, 236, 236, 26)}
  <rect x="26" y="26" width="204" height="204" rx="6" fill="url(#ribsV)" stroke="#12161b" stroke-width="3"/>
  ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${40 + c * 62}" y="${40 + r * 62}" width="52" height="52" rx="5" fill="#0c0f13" stroke="#56606d" stroke-width="2"/>
    <rect x="${46 + c * 62}" y="${60 + r * 62}" width="40" height="26" rx="3" fill="${['#e38a2c', '#94a3b8', '#b87333', '#67e8f9', '#e38a2c', '#a3e635', '#94a3b8', '#e38a2c', '#c4b5fd'][r * 3 + c]}" opacity="0.9"/>
    <rect x="${46 + c * 62}" y="${46 + r * 62}" width="${[36, 20, 40, 12, 28, 40, 8, 32, 24][r * 3 + c]}" height="5" rx="2" fill="${CYAN}" filter="url(#glow)"/>`).join('')).join('')}
  ${hazard(26, 232, 204, 8)}`;

const hallSizes = () => {
for (const n of [4, 8, 12, 16]) {
  S[`hall${n}`] = `${S.hall}<rect x="84" y="112" width="88" height="34" rx="8" fill="#0c0f13" stroke="${CYAN}" stroke-width="3" filter="url(#glow)"/><text x="128" y="137" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ecfeff">${n}×${n}</text>`;
}
};

const windBase = `<g filter="url(#shadow)"><path d="${oct(30, 30, 196, 196, 40)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  <path d="${oct(30, 30, 196, 196, 40)}" fill="#000" filter="url(#grain)"/></g>
  <path d="${oct(44, 44, 168, 168, 34)}" fill="url(#plate)" stroke="#12161b" stroke-width="3"/>
  ${[[60, 60], [196, 60], [60, 196], [196, 196]].map(([x, y]) => bolt(x, y, 6)).join('')}
  ${hazard(62, 200, 132, 10)}
  <circle cx="128" cy="128" r="46" fill="#0c0f13"/><circle cx="128" cy="128" r="42" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  <rect x="112" y="88" width="32" height="96" rx="14" fill="url(#steelV)" stroke="#12161b" stroke-width="3"/>
  ${strip(118, 164, 20, 5)}`;
S.wind_base = windBase;
S.wind = `${windBase}
  <g filter="url(#shadow)">${[0, 120, 240].map((a) => `<g transform="rotate(${a} 128 128)"><path d="M128 124C136 96 140 60 134 20L122 20C118 60 120 96 128 124Z" fill="url(#blade)" stroke="#475569" stroke-width="2"/><path d="M124 20h10l-1 16h-8z" fill="${RED}"/></g>`).join('')}</g>
  <circle cx="128" cy="128" r="15" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/><circle cx="128" cy="128" r="5" fill="#1f2937"/>`;

S.reactor = `${housing(8, 8, 240, 240, 44)}
  ${[[36, 36], [220, 36], [36, 220], [220, 220]].map(([x, y]) => `<line x1="128" y1="128" x2="${x}" y2="${y}" stroke="#12161b" stroke-width="22"/><line x1="128" y1="128" x2="${x}" y2="${y}" stroke="url(#chrome)" stroke-width="16"/><line x1="128" y1="128" x2="${x}" y2="${y}" stroke="#38bdf8" stroke-width="3" opacity="0.8"/>`).join('')}
  ${[[40, 40], [216, 40], [40, 216], [216, 216]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="url(#steel)" stroke="#12161b" stroke-width="3"/><circle cx="${x}" cy="${y}" r="8" fill="#0ea5e9" filter="url(#glow)"/>`).join('')}
  <circle cx="128" cy="128" r="84" fill="#0c0f13" stroke="#12161b" stroke-width="4"/>
  <circle cx="128" cy="128" r="80" fill="url(#chrome)" opacity="0.8"/>
  <circle cx="128" cy="128" r="70" fill="url(#dark)" stroke="#475569" stroke-width="3"/>
  ${Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2; return `<rect x="-5" y="-12" width="10" height="24" rx="3" fill="url(#steelV)" stroke="#12161b" stroke-width="1.5" transform="translate(${128 + Math.cos(a) * 60} ${128 + Math.sin(a) * 60}) rotate(${(a * 180) / Math.PI + 90})"/>`; }).join('')}
  <circle cx="128" cy="128" r="46" fill="none" stroke="#a855f7" stroke-width="16" filter="url(#glow)" opacity="0.9"/>
  <circle cx="128" cy="128" r="46" fill="none" stroke="#f5d0fe" stroke-width="4"/>
  <circle cx="128" cy="128" r="26" fill="url(#plasma)"/>
  <circle cx="128" cy="128" r="18" fill="#1e1b4b" stroke="#c084fc" stroke-width="3"/>
  <circle cx="128" cy="128" r="8" fill="#f5f3ff" filter="url(#glow)"/>
  ${hazard(96, 16, 64, 10)}${hazard(96, 230, 64, 10)}`;

S.robot = `<g filter="url(#shadow)">
  ${[[54, 62], [202, 62], [54, 194], [202, 194]].map(([x, y]) => `<rect x="${x - 15}" y="${y - 26}" width="30" height="52" rx="9" fill="#0b0e12" stroke="#374151" stroke-width="2"/>${Array.from({ length: 5 }, (_, k) => `<rect x="${x - 13}" y="${y - 22 + k * 10}" width="26" height="4" fill="#1f2937"/>`).join('')}<circle cx="${x}" cy="${y}" r="6" fill="url(#chrome)" stroke="#0b0e12" stroke-width="1.5"/>`).join('')}
  <path d="${oct(60, 24, 136, 210, 24)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  <path d="${oct(60, 24, 136, 210, 24)}" fill="#000" filter="url(#grain)"/>
  ${hazard(72, 26, 112, 10)}
  <rect x="76" y="40" width="104" height="34" rx="8" fill="#141a22" stroke="#12161b" stroke-width="3"/>
  ${strip(84, 44, 88, 6)}
  <rect x="80" y="54" width="22" height="14" rx="4" fill="#fef9c3" filter="url(#glow)"/><rect x="154" y="54" width="22" height="14" rx="4" fill="#fef9c3" filter="url(#glow)"/>
  ${screen(110, 54, 36, 16, 'text', GREEN)}
  <rect x="72" y="84" width="112" height="118" rx="8" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 6 }, (_, k) => `<rect x="78" y="${92 + k * 18}" width="100" height="11" rx="5.5" fill="url(#chromeV)" opacity="0.6"/>`).join('')}
  ${rivets(66, 84, 66, 200, 6, 2.4)}${rivets(190, 84, 190, 200, 6, 2.4)}
  <circle cx="128" cy="216" r="15" fill="#0b0e12"/><circle cx="128" cy="216" r="12" fill="#1e293b" stroke="${CYAN}" stroke-width="2.5" filter="url(#glow)"/><circle cx="124" cy="212" r="3" fill="#a5f3fc"/>
  ${txt(100, 222, '07', 11, '#fde68a')}
  <line x1="170" y1="212" x2="182" y2="190" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/><circle cx="182" cy="190" r="3" fill="${RED}" filter="url(#glow)"/>
  </g>`;

// ---------- logic and computer parts (were flat icons) ----------

/** Side ports (inputs) on the west, east and south edges, output chevron north. */
function ports(sides = ['w', 'e', 's'], color = '#c084fc') {
  const p = {
    w: `<rect x="20" y="112" width="20" height="32" rx="4" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/><rect x="24" y="120" width="8" height="16" rx="2" fill="${color}" filter="url(#glow)"/>`,
    e: `<rect x="216" y="112" width="20" height="32" rx="4" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/><rect x="224" y="120" width="8" height="16" rx="2" fill="${color}" filter="url(#glow)"/>`,
    s: `<rect x="112" y="216" width="32" height="20" rx="4" fill="url(#chrome)" stroke="#12161b" stroke-width="2"/><rect x="120" y="224" width="16" height="8" rx="2" fill="${CYAN}" filter="url(#glow)"/>`,
  };
  return sides.map((k) => p[k]).join('');
}
/** A module chip in the middle with a glowing symbol. */
function chip(symbol, color) {
  const legs = Array.from({ length: 6 }, (_, k) => `<rect x="${78 + k * 18}" y="68" width="8" height="12" fill="url(#chromeV)"/><rect x="${78 + k * 18}" y="176" width="8" height="12" fill="url(#chromeV)"/><rect x="68" y="${78 + k * 18}" width="12" height="8" fill="url(#chrome)"/><rect x="176" y="${78 + k * 18}" width="12" height="8" fill="url(#chrome)"/>`).join('');
  return `${legs}<g filter="url(#shadow)"><rect x="78" y="78" width="100" height="100" rx="10" fill="url(#dark)" stroke="#12161b" stroke-width="3"/></g>
    <rect x="84" y="84" width="88" height="88" rx="7" fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="2"/>
    <circle cx="92" cy="92" r="3" fill="#94a3b8"/>
    ${symbol}`;
}
const glowPath = (d, color, w = 12) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" filter="url(#glow)"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="${w * 0.3}" stroke-linecap="round"/>`;

S.adder = `${housing()}${ports(['w', 'e', 's'], GREEN)}${chip(glowPath('M128 104V152M104 128H152', GREEN), GREEN)}${chevron(128, 44, 12)}`;
S.subtractor = `${housing()}${ports(['w', 'e', 's'], AMBER)}${chip(glowPath('M100 128H156', AMBER, 16), AMBER)}${chevron(128, 44, 12)}`;
S.multiplier = `${housing()}${ports(['e', 's'], '#c084fc')}${chip(glowPath('M108 108L148 148M148 108L108 148', '#c084fc'), '#c084fc')}${chevron(128, 44, 12)}`;
S.divider = `${housing()}${ports(['e', 's'], '#f472b6')}${chip(`${glowPath('M104 128H152', '#f472b6')}<circle cx="128" cy="108" r="7" fill="#f472b6" filter="url(#glow)"/><circle cx="128" cy="148" r="7" fill="#f472b6" filter="url(#glow)"/>`, '#f472b6')}${chevron(128, 44, 12)}`;
S.register = `${housing()}${ports(['e', 's'], AMBER)}${chip(`${Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<rect x="${94 + c * 18}" y="${94 + r * 18}" width="14" height="14" rx="2" fill="${(r * 4 + c) % 3 ? '#0e7490' : CYAN}" ${(r * 4 + c) % 3 ? '' : 'filter="url(#glow)"'}/>`).join('')).join('')}`, CYAN)}${chevron(128, 44, 12)}`;

S.oscillator = `${housing()}
  ${[98, 158].map((x) => `<rect x="${x - 4}" y="150" width="8" height="46" fill="url(#chromeV)" stroke="#12161b" stroke-width="1.5"/>`).join('')}
  <g filter="url(#shadow)"><rect x="66" y="64" width="124" height="94" rx="46" fill="url(#chrome)" stroke="#12161b" stroke-width="4"/></g>
  <rect x="80" y="76" width="96" height="70" rx="34" fill="url(#steelV)" stroke="#94a3b8" stroke-width="2"/>
  <path d="M128 80l18 16v26l-18 18-18-18V96z" fill="#67e8f9" opacity="0.9" stroke="#0e7490" stroke-width="3" filter="url(#glow)"/>
  <path d="M128 80l18 16-18 10-18-10z" fill="#e0fdff" opacity="0.8"/>
  ${glowPath('M52 214q12-20 24 0t24 0 24 0 24 0 24 0 24 0', CYAN, 5)}
  ${led(200, 46, CYAN, 5)}`;

S.bus = `<g filter="url(#shadow)"><rect x="14" y="14" width="228" height="228" rx="18" fill="#0f3d2e" stroke="#0a2a20" stroke-width="4"/></g>
  <rect x="14" y="14" width="228" height="228" rx="18" fill="#000" filter="url(#grain)"/>
  ${Array.from({ length: 6 }, (_, k) => `<path d="M${30 + k * 36} 24v24M${30 + k * 36} 208v24" stroke="#14553f" stroke-width="4"/>`).join('')}
  ${['M128 14V242', 'M14 128H242'].map((d) => `<path d="${d}" stroke="#7c2d12" stroke-width="30"/><path d="${d}" stroke="#d97706" stroke-width="22"/><path d="${d}" stroke="#fbbf24" stroke-width="6" opacity="0.7"/>`).join('')}
  <circle cx="128" cy="128" r="26" fill="#b45309" stroke="#7c2d12" stroke-width="4"/><circle cx="128" cy="128" r="18" fill="#fcd34d"/><circle cx="128" cy="128" r="8" fill="#1c1917"/>
  ${[[56, 56], [200, 56], [56, 200], [200, 200]].map(([x, y]) => `<rect x="${x - 16}" y="${y - 10}" width="32" height="20" rx="3" fill="#1f2937" stroke="#94a3b8" stroke-width="2"/><rect x="${x - 16}" y="${y - 10}" width="7" height="20" fill="#cbd5e1"/><rect x="${x + 9}" y="${y - 10}" width="7" height="20" fill="#cbd5e1"/>`).join('')}`;

S.terminal = `${housing(8, 8, 240, 240, 26)}
  <rect x="28" y="28" width="200" height="124" rx="10" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  <rect x="34" y="34" width="188" height="112" rx="6" fill="#041014" stroke="#0b0e12" stroke-width="2"/>
  <rect x="34" y="34" width="188" height="112" rx="6" fill="${CYAN}" opacity="0.06"/>
  <path d="M44 60h40M44 76h70M44 92h30" stroke="${CYAN}" stroke-width="5" stroke-linecap="round" opacity="0.7" filter="url(#glow)"/>
  <rect x="34" y="34" width="188" height="30" fill="#fff" opacity="0.04"/>
  <rect x="30" y="160" width="190" height="58" rx="8" fill="url(#dark)" stroke="#12161b" stroke-width="2"/>
  ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 8 }, (_, c) => `<rect x="${36 + c * 22 + (r % 2) * 6}" y="${166 + r * 17}" width="18" height="13" rx="3" fill="${r === 2 && c === 7 ? ORANGE : 'url(#steelV)'}" stroke="#0b0e12" stroke-width="1.5"/>`).join('')).join('')}
  <rect x="30" y="224" width="130" height="14" rx="4" fill="#0c0f13"/>
  <rect x="224" y="156" width="16" height="56" rx="4" fill="#0c0f13"/>`;

S.keyboard = `${housing(8, 40, 240, 176, 22)}
  <rect x="24" y="58" width="208" height="140" rx="10" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 10 - (r === 3 ? 4 : 0) }, (_, c) => {
    const x = 32 + c * 19.5 + r * 5, y = 66 + r * 28;
    return `<rect x="${x}" y="${y + 3}" width="16" height="22" rx="3" fill="#0b0e12"/><rect x="${x}" y="${y}" width="16" height="20" rx="3" fill="url(#steelV)" stroke="#0b0e12" stroke-width="1.2"/><rect x="${x + 2}" y="${y + 2}" width="12" height="4" rx="2" fill="#cbd5e1" opacity="0.35"/>`;
  }).join('')).join('')}
  <rect x="112" y="150" width="88" height="23" rx="3" fill="#0b0e12"/><rect x="112" y="148" width="88" height="21" rx="3" fill="url(#steelV)" stroke="#0b0e12" stroke-width="1.2"/>
  <rect x="202" y="150" width="24" height="20" rx="3" fill="${CYAN}" filter="url(#glow)"/>
  <rect x="84" y="20" width="88" height="24" rx="6" fill="#0c0f13" stroke="#475569" stroke-width="2"/>
  <text x="128" y="38" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="bold" font-size="16" fill="${CYAN}">KDOS</text>
  ${led(212, 32, GREEN, 5)}`;

S.screen = `${housing()}
  <rect x="38" y="62" width="180" height="128" rx="12" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  <rect x="46" y="70" width="164" height="112" rx="8" fill="#061a2e" stroke="#0b0e12" stroke-width="2"/>
  <rect x="46" y="70" width="164" height="112" rx="8" fill="url(#glowC)" opacity="0.25"/>
  <path d="M112 100v52l42-26z" fill="#e0f2fe" filter="url(#glow)"/>
  ${Array.from({ length: 14 }, (_, k) => `<rect x="46" y="${72 + k * 8}" width="164" height="2" fill="#000" opacity="0.25"/>`).join('')}
  <path d="M96 30l32 26 32-26" fill="none" stroke="url(#chrome)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="96" cy="30" r="6" fill="${RED}" filter="url(#glow)"/><circle cx="160" cy="30" r="6" fill="#94a3b8"/>
  <rect x="46" y="196" width="164" height="12" rx="4" fill="#0c0f13"/>`;

S.speaker = `${housing()}
  <circle cx="128" cy="122" r="80" fill="#0c0f13"/>
  <circle cx="128" cy="122" r="76" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return bolt(128 + Math.cos(a) * 68, 122 + Math.sin(a) * 68, 3.5); }).join('')}
  <circle cx="128" cy="122" r="58" fill="#15191f" stroke="#0b0e12" stroke-width="3"/>
  ${[50, 40, 30].map((r, k) => `<circle cx="128" cy="122" r="${r}" fill="none" stroke="#2b323c" stroke-width="${5 - k}"/>`).join('')}
  <circle cx="128" cy="122" r="22" fill="url(#steel)" stroke="#0b0e12" stroke-width="3"/>
  <circle cx="122" cy="116" r="8" fill="#cbd5e1" opacity="0.35"/>
  <g fill="none" stroke="${GREEN}" stroke-width="5" stroke-linecap="round" filter="url(#glow)"><path d="M204 96a40 40 0 0 1 0 52"/></g>
  <rect x="36" y="202" width="184" height="14" rx="4" fill="#0c0f13"/>`;

S.matrix = `${housing()}
  <rect x="40" y="40" width="176" height="176" rx="8" fill="#05070a" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => {
    const cols = ['#22d3ee', '#f43f5e', '#a3e635', '#f59e0b', '#c084fc', '#60a5fa', '#f472b6', '#fde047'];
    const on = (r * 7 + c * 3 + ((r * c) % 5)) % 3 !== 0;
    const col = cols[(r + c * 2) % 8];
    return on ? `<rect x="${48 + c * 20.5}" y="${48 + r * 20.5}" width="16" height="16" rx="3" fill="${col}" filter="url(#glow)"/><rect x="${50 + c * 20.5}" y="${50 + r * 20.5}" width="6" height="4" rx="2" fill="#fff" opacity="0.5"/>` : `<rect x="${48 + c * 20.5}" y="${48 + r * 20.5}" width="16" height="16" rx="3" fill="#161b22"/>`;
  }).join('')).join('')}`;

S.switch = `${housing()}
  <rect x="100" y="58" width="56" height="136" rx="28" fill="#0c0f13" stroke="#12161b" stroke-width="3"/>
  <rect x="106" y="64" width="44" height="124" rx="22" fill="url(#dark)" stroke="#475569" stroke-width="2"/>
  <g filter="url(#shadow)"><rect x="110" y="70" width="36" height="60" rx="14" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/></g>
  <rect x="116" y="84" width="24" height="5" rx="2.5" fill="#475569"/><rect x="116" y="96" width="24" height="5" rx="2.5" fill="#475569"/><rect x="116" y="108" width="24" height="5" rx="2.5" fill="#475569"/>
  ${strip(56, 118, 32, 6)}${strip(168, 118, 32, 6)}
  ${chevron(128, 44, 12)}
  ${led(128, 168, GREEN, 6)}`;

S.lamp = `${housing()}
  <circle cx="128" cy="128" r="70" fill="#0c0f13"/>
  <circle cx="128" cy="128" r="66" fill="url(#chrome)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2 + 0.5; return bolt(128 + Math.cos(a) * 58, 128 + Math.sin(a) * 58, 3.5); }).join('')}
  <circle cx="128" cy="128" r="48" fill="#11161d" stroke="#0b0e12" stroke-width="3"/>
  <circle cx="128" cy="128" r="40" fill="url(#dial)"/>
  <circle cx="128" cy="128" r="40" fill="none" stroke="#e2e8f0" stroke-opacity="0.15" stroke-width="2"/>
  <ellipse cx="114" cy="112" rx="14" ry="9" fill="#fff" opacity="0.18" transform="rotate(-35 114 112)"/>
  ${chevron(128, 38, 10, 'rgba(34,211,238,0.6)')}`;


// ---------- extra details on the remaining parts ----------
const DETAILS = {
  timer: `${rivets(62, 36, 194, 36, 7)}${knob(128, 212, 8, 60)}${plate(146, 204, 50, 14, 'SEC')}${barcode(64, 205, 40, 12)}`,
  sensor: `${warn(51, 76, 14)}${warn(205, 76, 14)}${hose('M51 170 C 51 200, 70 214, 84 228', 4, '#1f2937', [[60, 206]])}${hose('M205 170 C 205 200, 186 214, 172 228', 4, '#7c2d12', [[196, 206]])}${txt(51, 186, 'TX', 9, '#fca5a5')}${txt(205, 186, 'RX', 9, '#fca5a5')}`,
  radio: `${plate(98, 150, 60, 14, 'CH 1-8')}${rivets(44, 150, 44, 220, 5)}${rivets(212, 150, 212, 220, 5)}${gauge(54, 128, 11, 0.7)}${ledRow(186, 128, [GREEN, CYAN], 11)}`,
  battery: `${plate(90, 214, 76, 14, '7.2 kV', '#fde68a')}${warn(36, 128, 14)}${hose('M64 208 C 64 222, 40 222, 36 230', 4, '#7c2d12')}${hose('M192 208 C 192 222, 216 222, 220 230', 4, '#1f2937')}${ledRow(206, 44, [GREEN, GREEN, AMBER], 0.01, 0)}`,
  picker_base: `${plate(92, 44, 72, 13, 'ARM-1')}${hose('M170 170 C 190 190, 200 200, 206 214', 5, '#1f2937', [[190, 192]])}${ledRow(58, 60, [GREEN, AMBER, '#1f2937'], 9)}${warn(196, 62, 13)}`,
  picker: `${plate(92, 44, 72, 13, 'ARM-1')}${ledRow(58, 60, [GREEN, AMBER, '#1f2937'], 9)}`,
  stacker: `${gauge(46, 178, 10, 0.4, CYAN)}${plate(170, 190, 30, 14, '8x')}${ledRow(174, 44, [GREEN, AMBER], 10)}${hose('M72 214 C 90 226, 166 226, 184 214', 4, '#1f2937', [[128, 224]])}`,
  wind_base: `${plate(92, 36, 72, 14, 'WT-08')}${handle(150, 196, 30)}${rivets(56, 90, 56, 166, 4)}${rivets(200, 90, 200, 166, 4)}${ledRow(116, 200, [GREEN, AMBER], 12)}`,
  wind: `${plate(92, 36, 72, 14, 'WT-08')}`,
  reactor: `${warn(128, 34, 18, '#facc15')}${plate(92, 214, 72, 14, 'FUSION', '#e9d5ff')}${gauge(70, 128, 10, 0.8, '#a855f7')}${gauge(186, 128, 10, 0.55, '#a855f7')}${ledRow(106, 72, [GREEN, GREEN, '#a855f7', AMBER], 11)}`,
  adder: `${plate(96, 196, 64, 13, 'ADD')}${ledRow(58, 60, [GREEN, '#1f2937'], 9)}${rivets(196, 64, 196, 96, 3)}`,
  subtractor: `${plate(96, 196, 64, 13, 'SUB')}${ledRow(58, 60, [AMBER, '#1f2937'], 9)}${rivets(196, 64, 196, 96, 3)}`,
  multiplier: `${plate(96, 196, 64, 13, 'MUL')}${ledRow(58, 60, ['#c084fc', '#1f2937'], 9)}${rivets(196, 64, 196, 96, 3)}`,
  divider: `${plate(96, 196, 64, 13, 'DIV')}${ledRow(58, 60, ['#f472b6', '#1f2937'], 9)}${rivets(196, 64, 196, 96, 3)}`,
  register: `${plate(96, 196, 64, 13, 'RAM')}${ledRow(58, 60, [CYAN, AMBER], 9)}${barcode(174, 56, 26, 10)}`,
  oscillator: `${plate(52, 168, 44, 14, 'XTAL')}${gauge(186, 174, 11, 0.65, CYAN)}${rivets(60, 40, 110, 40, 4)}`,
  terminal: `${barcode(168, 226, 44, 12)}${ledRow(196, 144, [GREEN], 1)}${rivets(34, 154, 34, 214, 4, 2)}`,
  keyboard: `${hose('M40 40 C 40 24, 60 18, 84 30', 5, '#1f2937', [[48, 26]])}${barcode(186, 16, 36, 14)}${rivets(20, 70, 20, 190, 6, 2)}`,
  screen: `${fan(206, 196, 12)}${plate(50, 206, 70, 14, 'RX-VID')}${ledRow(136, 212, [GREEN, CYAN, '#1f2937'], 10)}`,
  speaker: `${plate(92, 204, 72, 14, '80 W')}${knob(44, 206, 8, -40)}${knob(212, 206, 8, 70)}`,
  matrix: `${rivets(56, 30, 200, 30, 6)}${rivets(56, 226, 200, 226, 6)}${txt(128, 237, '8x8 RGB', 9, '#94a3b8')}`,
  switch: `${plate(46, 196, 52, 14, 'SW')}${warn(206, 204, 14)}${rivets(60, 40, 90, 40, 2)}${rivets(166, 40, 196, 40, 2)}`,
  lamp: `${plate(102, 206, 52, 13, 'LUX')}${ledRow(48, 50, [AMBER], 1)}${rivets(196, 44, 212, 60, 2)}`,
  bus: `${txt(200, 106, 'BUS-A1', 10, '#bbf7d0')}${txt(56, 162, 'R12', 9, '#bbf7d0')}${[[92, 92], [164, 164]].map(([x, y]) => `<rect x="${x - 7}" y="${y - 3.5}" width="14" height="7" rx="1.5" fill="#d6c7a1" stroke="#1c1917" stroke-width="1"/><rect x="${x - 2}" y="${y - 3.5}" width="1.6" height="7" fill="#b91c1c"/><rect x="${x + 1}" y="${y - 3.5}" width="1.6" height="7" fill="#1d4ed8"/>`).join('')}`,
  hall: `${fan(34, 34, 10)}${fan(222, 34, 10)}${plate(92, 12, 72, 12, 'STORE')}`,
};
for (const [k, v] of Object.entries(DETAILS)) if (S[k]) S[k] += v;
hallSizes();

const ITEMS = {
  kit: `<g filter="url(#shadow)"><rect x="30" y="40" width="196" height="186" rx="14" fill="#075985" stroke="#082f49" stroke-width="8"/>
    <rect x="30" y="40" width="196" height="186" rx="14" fill="#000" filter="url(#grain)"/>
    <rect x="46" y="58" width="164" height="150" rx="8" fill="#e0f2fe" opacity="0.18" stroke="#7dd3fc" stroke-width="3" stroke-dasharray="10 6"/>
    <rect x="96" y="24" width="64" height="30" rx="6" fill="url(#chrome)" stroke="#082f49" stroke-width="4"/>
    <path d="M52 216h152" stroke="#fbbf24" stroke-width="8"/></g>`,
  motor: `<g filter="url(#shadow)"><rect x="40" y="70" width="150" height="116" rx="20" fill="url(#steel)" stroke="#12161b" stroke-width="6"/>
    ${Array.from({ length: 7 }, (_, k) => `<rect x="${52 + k * 19}" y="74" width="9" height="108" rx="3" fill="#2d333c"/>`).join('')}
    <rect x="186" y="104" width="40" height="48" rx="8" fill="url(#chromeV)" stroke="#12161b" stroke-width="5"/>
    <rect x="222" y="118" width="22" height="20" rx="5" fill="#cbd5e1" stroke="#12161b" stroke-width="4"/>
    <rect x="16" y="96" width="30" height="64" rx="8" fill="${AMBER}" stroke="#7c2d12" stroke-width="5"/>
    <path d="M60 52h40l-10-14" fill="none" stroke="${AMBER}" stroke-width="8" stroke-linecap="round"/></g>`,
  cell: `<g filter="url(#shadow)"><rect x="78" y="44" width="100" height="186" rx="26" fill="#0f1319" stroke="#12161b" stroke-width="6"/>
    <rect x="86" y="52" width="84" height="170" rx="20" fill="url(#chrome)" opacity="0.6"/>
    <rect x="94" y="96" width="68" height="118" rx="14" fill="url(#cell)" filter="url(#glow)"/>
    <rect x="106" y="24" width="44" height="26" rx="6" fill="url(#chrome)" stroke="#12161b" stroke-width="4"/>
    <path d="M136 112l-20 38h16l-10 34 30-46h-16l10-26z" fill="#fde047" stroke="#713f12" stroke-width="3"/></g>`,
  robot: S.robot,
  crate: `<g filter="url(#shadow)"><rect x="30" y="30" width="196" height="196" rx="16" fill="url(#crate)" stroke="#5a2a0a" stroke-width="8"/>
    <rect x="30" y="30" width="196" height="196" rx="16" fill="#000" filter="url(#grain)"/>
    <rect x="48" y="48" width="160" height="160" rx="8" fill="none" stroke="#7c3a10" stroke-width="6"/>
    <path d="M48 48L208 208M208 48L48 208" stroke="#7c3a10" stroke-width="10" opacity="0.55"/>
    ${[[30, 30], [196, 30], [30, 196], [196, 196]].map(([x, y]) => `<rect x="${x}" y="${y}" width="30" height="30" rx="6" fill="url(#chrome)" stroke="#3f2a18" stroke-width="3"/>`).join('')}
    <rect x="84" y="84" width="88" height="88" rx="12" fill="#fde7c7" opacity="0.92" stroke="#7c3a10" stroke-width="4"/>
    <rect x="36" y="36" width="184" height="10" rx="5" fill="#fdba74" opacity="0.45"/></g>`,
};

const svg = (inner, size = 256) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">${defs}${inner}</svg>`;
const render = (inner, px) => sharp(Buffer.from(svg(inner)), { density: 144 }).resize(px, px).webp({ quality: 92 });

for (const [name, inner] of Object.entries(S)) await render(inner, 256).toFile(`public/assets/buildings/${name}.webp`);
for (const [name, inner] of Object.entries(ITEMS)) await render(inner, 128).toFile(`public/assets/items/${name}.webp`);

const sheet = process.argv[2];
if (sheet) {
  const names = Object.keys(S);
  const tiles = await Promise.all(names.map((n) => sharp(`public/assets/buildings/${n}.webp`).resize(160, 160).png().toBuffer()));
  tiles.push(await sharp('public/assets/items/crate.webp').resize(160, 160).png().toBuffer());
  const cols = 6, rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * 170, height: rows * 170, channels: 4, background: '#2a2f37' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * 170 + 5, top: Math.floor(i / cols) * 170 + 5 })))
    .png()
    .toFile(sheet);
}
console.log('sprites:', Object.keys(S).length, 'buildings,', Object.keys(ITEMS).length, 'items');
