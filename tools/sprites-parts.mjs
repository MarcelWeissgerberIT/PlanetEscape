// Draws the sprites of the newer parts in the style of the original buildings: chamfered steel housings with
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
  <rect x="50" y="50" width="156" height="156" rx="10" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 7 }, (_, k) => `<rect x="60" y="${66 + k * 19}" width="136" height="12" rx="6" fill="url(#chromeV)" stroke="#12161b" stroke-width="1.5"/>`).join('')}
  ${hazard(50, 34, 156, 14)}
  ${strip(34, 70, 6, 116)}${strip(216, 70, 6, 116)}
  ${chevron(128, 118, 22)}
  ${led(40, 212, GREEN, 4)}${led(216, 212, AMBER, 4)}`;

S.depot = `${housing(14, 14, 228, 228, 34)}
  <rect x="30" y="30" width="196" height="54" rx="8" fill="url(#roof)" stroke="#12161b" stroke-width="3"/>
  ${vents(46, 42, 4, 50)}${vents(160, 42, 4, 50)}
  <rect x="112" y="36" width="32" height="42" rx="6" fill="#0c0f13" stroke="#475569" stroke-width="2"/>${led(128, 57, GREEN, 6)}
  ${[36, 134].map((x) => `
    <rect x="${x}" y="96" width="86" height="126" rx="8" fill="#0c0f13" stroke="#12161b" stroke-width="3"/>
    <rect x="${x + 5}" y="101" width="76" height="88" fill="url(#ribs)"/>
    ${strip(x + 8, 92, 70, 6)}
    <rect x="${x + 14}" y="176" width="58" height="40" rx="10" fill="url(#steel)" stroke="#12161b" stroke-width="2"/>
    <rect x="${x + 20}" y="180" width="46" height="8" rx="4" fill="${CYAN}" filter="url(#glow)"/>`).join('')}
  ${hazard(36, 222, 184, 8)}`;

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

for (const n of [4, 8, 12, 16]) {
  S[`hall${n}`] = `${S.hall}<rect x="84" y="112" width="88" height="34" rx="8" fill="#0c0f13" stroke="${CYAN}" stroke-width="3" filter="url(#glow)"/><text x="128" y="137" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ecfeff">${n}×${n}</text>`;
}

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
  ${[[62, 58], [178, 58], [62, 190], [178, 190]].map(([x, y]) => `<rect x="${x - 16}" y="${y - 24}" width="32" height="48" rx="8" fill="#0c0f13" stroke="#374151" stroke-width="2"/>`).join('')}
  <path d="${oct(58, 28, 140, 200, 26)}" fill="url(#steel)" stroke="#12161b" stroke-width="4"/>
  <path d="${oct(58, 28, 140, 200, 26)}" fill="#000" filter="url(#grain)"/>
  <rect x="74" y="88" width="108" height="124" rx="10" fill="url(#dark)" stroke="#12161b" stroke-width="3"/>
  ${Array.from({ length: 5 }, (_, k) => `<rect x="80" y="${96 + k * 23}" width="96" height="14" rx="7" fill="url(#chromeV)" opacity="0.55"/>`).join('')}
  <rect x="76" y="40" width="104" height="36" rx="10" fill="#1f2937" stroke="#12161b" stroke-width="3"/>
  ${strip(84, 34, 88, 8)}
  </g>${led(92, 58, CYAN, 5)}${led(164, 58, CYAN, 5)}`;

const ITEMS = {
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
