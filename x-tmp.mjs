import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('pe_intro_seen', '1'); localStorage.setItem('pe_lang', 'de'); localStorage.setItem('pe_kora_voice', 'text'); });
await p.goto('http://localhost:4272/');
await p.waitForTimeout(1200);
// two-way toggle in title settings
await p.click('[data-act="settingsview"]'); await p.waitForTimeout(400);
const before = await p.evaluate(() => localStorage.getItem('pe_music'));
await p.click('[data-music="on"]'); await p.waitForTimeout(300);
const after1 = await p.evaluate(() => localStorage.getItem('pe_music'));
await p.click('[data-music="on"]'); await p.waitForTimeout(300);
const after2 = await p.evaluate(() => localStorage.getItem('pe_music'));
console.log('toggle music:', before, '->', after1, '->', after2);
await p.keyboard.press('Escape');
await p.evaluate(() => window.__pe.hud.cb.onNewGame(11, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }));
await p.waitForTimeout(800);
await p.evaluate(() => {
  const { sim, renderer } = window.__pe;
  const c = sim.state.buildings.find((b) => b.type === 'core');
  let x0 = 0, y0 = 0;
  const free = (x, y) => sim.state.terrain[y * sim.state.width + x] === 'ground' && !sim.at(x, y);
  outer: for (let r = 4; r < 40; r++) for (let yy = c.y - r; yy <= c.y + r; yy++) for (let xx = c.x - r; xx <= c.x + r; xx++) {
    let ok = true;
    for (let dy = 0; ok && dy < 10; dy++) for (let dx = 0; ok && dx < 16; dx++) if (!free(xx + dx, yy + dy)) ok = false;
    if (ok) { x0 = xx; y0 = yy; break outer; }
  }
  const P = (t, x, y, d = 0) => sim.place(t, x0 + x, y0 + y, d);
  const s1 = P('storage', 3, 6, 0); s1.store = { iron_plate: 300 };
  P('picker', 3, 5, 0);
  const ov = P('overflow', 3, 4, 0);
  const full = P('storage', 3, 3, 0); full.store = { copper_plate: 1e6 };
  P('storage', 2, 4, 3); P('storage', 4, 4, 1);
  const s2 = P('storage', 11, 6, 0); s2.store = { glass: 300 };
  P('picker', 11, 5, 0);
  const v = P('valve', 11, 4, 0); v.recipe = 'glass'; v.threshold = 50;
  sim.state.inventory.glass = 20;
  P('storage', 11, 3, 0);
  window.__ov = ov; window.__v = v;
  renderer.centerOn(x0 + 7, y0 + 4);
});
await p.waitForTimeout(7000);
for (const k of ['__ov', '__v']) {
  await p.evaluate((k) => window.__pe.hud.selectBuilding(window[k]), k);
  await p.waitForTimeout(700);
  await (await p.$('.info-panel')).screenshot({ path: `x-p${k}.png` });
}
await p.evaluate(() => { window.__pe.sim.state.inventory.glass = 80; });
await p.waitForTimeout(800);
await (await p.$('.info-panel')).screenshot({ path: 'x-p__v2.png' });
console.log('errors', errs);
await b.close();
