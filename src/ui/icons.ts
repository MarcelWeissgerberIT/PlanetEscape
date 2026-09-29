// Inline SVG icon set for the HUD: one consistent line style (2px, round caps) with a soft glow via CSS.
const P: Record<string, string> = {
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  fast: '<path d="M4 5.5v13l8-6.5z"/><path d="M12 5.5v13l8-6.5z"/>',
  scan: '<circle cx="12" cy="12" r="3.2"/><path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"/><path d="M2.5 12h4M17.5 12h4"/>',
  contracts: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  research: '<path d="M9 3h6M10 3v5.5L5.2 17a2.6 2.6 0 0 0 2.3 3.9h9a2.6 2.6 0 0 0 2.3-3.9L14 8.5V3"/><path d="M7.5 15h9"/>',
  minimap: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/>',
  center: '<circle cx="12" cy="12" r="5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  chevron: '<path d="M6 9.5l6 6 6-6"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.5 4 2.5 4H6"/>',
  box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/><path d="M17.5 12h.01"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M19 12a7 7 0 1 1-2.6-5.4"/><path d="M19 4v4.5h-4.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M8.5 7.5H15a4.5 4.5 0 0 1 0 9H7"/><path d="M11 4 7.5 7.5 11 11"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  transfer: '<path d="M4 8h13M14 4.5 17.5 8 14 11.5M20 16H7M10 12.5 6.5 16l3.5 3.5"/>',
  blueprint: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M4 8h16"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
  pipette: '<path d="M14 5.5 18.5 10M16.2 3.3a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8L18 10.5 13.5 6z"/><path d="M13.5 6 5.5 14a2 2 0 0 0-.5 1v3h3a2 2 0 0 0 1-.5l8-8"/>',
  bolt: '<path d="M13 2.5 5.5 13.5H12l-1 8 7.5-11H12z"/>',
  storm: '<path d="M4 7h11a3 3 0 1 0-2.8-4M3 12h15a3 3 0 1 1-2.8 4M5 17h7a2.5 2.5 0 1 1-2.3 3.5"/>',
  swap: '<path d="M7 4.5v15M3.5 8 7 4.5 10.5 8M17 19.5v-15M13.5 16l3.5 3.5 3.5-3.5"/>',
  note: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 11h6M9 14.5h6M9 18h3"/>',
  pencil: '<path d="M4 20l4.2-1 10.3-10.3a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L5 15.8z"/><path d="M13.5 6.5l4 4"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2-2.2-.8 2.2-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5a3 3 0 0 0 3 4M16 5.5h3a3 3 0 0 1-3 4"/><path d="M12 13v3.5M8.5 20h7M9.5 20l.8-3.5h3.4l.8 3.5"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  power: '<path d="M12 3.5v8"/><path d="M7.2 6.5a7 7 0 1 0 9.6 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
};

export type IconName = keyof typeof P;

/** An inline SVG icon; `cls` is added to the svg element. */
export function icon(name: IconName, cls = ''): string {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}
