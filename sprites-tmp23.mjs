import sharp from 'sharp';
const body = `<defs><linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5261"/><stop offset="1" stop-color="#22272f"/></linearGradient>
<linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3038"/><stop offset="1" stop-color="#1b1f25"/></linearGradient></defs>`;
const frame = `<rect x="24" y="24" width="208" height="208" rx="34" fill="url(#body)" stroke="#11151b" stroke-width="6"/>`;
const svgs = {
  picker: frame + `<circle cx="128" cy="150" r="30" fill="#0f1319" stroke="#9aa6b5" stroke-width="6"/>
  <path d="M128 150L70 92" stroke="#cbd5e1" stroke-width="16" stroke-linecap="round"/>
  <path d="M70 92L52 74M70 92L88 74" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round"/>
  <circle cx="128" cy="150" r="9" fill="#e2e8f0"/>
  <circle cx="60" cy="84" r="16" fill="#f59e0b" stroke="#7c2d12" stroke-width="4"/>
  <path d="M150 62l40 0-12-14M190 62l-12 14" fill="none" stroke="#22d3ee" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="200" cy="200" r="7" fill="#22d3ee"/>`,
  road: `<rect x="0" y="0" width="256" height="256" fill="url(#road)"/>
  <rect x="0" y="0" width="256" height="18" fill="#3b4250"/><rect x="0" y="238" width="256" height="18" fill="#3b4250"/>
  <path d="M0 128h256" stroke="#e5c15a" stroke-width="8" stroke-dasharray="36 28"/>
  <circle cx="60" cy="70" r="3" fill="#0f1319" opacity="0.6"/><circle cx="190" cy="190" r="4" fill="#0f1319" opacity="0.6"/>`,
  depot: frame + `<rect x="44" y="70" width="168" height="120" rx="12" fill="#0f1319" stroke="#5b6675" stroke-width="3"/>
  <rect x="60" y="86" width="60" height="88" rx="8" fill="#1f2937"/><rect x="136" y="86" width="60" height="88" rx="8" fill="#1f2937"/>
  <rect x="70" y="120" width="40" height="40" rx="8" fill="#22d3ee"/><rect x="146" y="120" width="40" height="40" rx="8" fill="#22d3ee" opacity="0.5"/>
  <circle cx="78" cy="166" r="6" fill="#111"/><circle cx="102" cy="166" r="6" fill="#111"/><circle cx="154" cy="166" r="6" fill="#111"/><circle cx="178" cy="166" r="6" fill="#111"/>
  <rect x="96" y="40" width="64" height="24" rx="6" fill="#9aa6b5"/><circle cx="200" cy="56" r="7" fill="#34d399"/>`,
  dock: frame + `<rect x="44" y="60" width="168" height="80" rx="10" fill="#0f1319" stroke="#5b6675" stroke-width="3"/>
  <rect x="56" y="72" width="144" height="56" rx="6" fill="#1f2937"/>
  <path d="M64 100h128" stroke="#e5c15a" stroke-width="6" stroke-dasharray="18 14"/>
  <rect x="88" y="150" width="80" height="56" rx="8" fill="#334155" stroke="#9aa6b5" stroke-width="4"/>
  <path d="M128 156v40M112 180l16 16 16-16" fill="none" stroke="#22d3ee" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="200" cy="200" r="7" fill="#f59e0b"/>`,
  stacker: frame + `<rect x="56" y="140" width="144" height="60" rx="8" fill="#a16207" stroke="#713f12" stroke-width="5"/>
  <path d="M56 170h144M128 140v60" stroke="#713f12" stroke-width="5"/>
  <rect x="72" y="100" width="112" height="36" rx="6" fill="#ca8a04" stroke="#713f12" stroke-width="5"/>
  <rect x="88" y="64" width="80" height="32" rx="6" fill="#eab308" stroke="#713f12" stroke-width="5"/>
  <path d="M40 60v140" stroke="#9aa6b5" stroke-width="10" stroke-linecap="round"/><path d="M40 60h40" stroke="#9aa6b5" stroke-width="10" stroke-linecap="round"/>
  <circle cx="200" cy="56" r="7" fill="#22d3ee"/>`,
};
const items = {
  crate: `<rect x="32" y="72" width="192" height="152" rx="16" fill="#b45309" stroke="#78350f" stroke-width="10"/>
  <path d="M32 120h192M128 72v152" stroke="#78350f" stroke-width="10"/>
  <path d="M60 96l40 0M156 96l40 0" stroke="#fcd34d" stroke-width="10" stroke-linecap="round"/>
  <rect x="32" y="72" width="192" height="30" rx="10" fill="#d97706" opacity="0.6"/>`,
};
for (const [n, inner] of Object.entries(svgs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body}${inner}</svg>`;
  await sharp(Buffer.from(svg), { density: 300 }).resize(256, 256).webp({ quality: 90 }).toFile(`public/assets/buildings/${n}.webp`);
}
for (const [n, inner] of Object.entries(items)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${inner}</svg>`;
  await sharp(Buffer.from(svg), { density: 300 }).resize(128, 128).webp({ quality: 90 }).toFile(`public/assets/items/${n}.webp`);
}
console.log('sprites ok');
