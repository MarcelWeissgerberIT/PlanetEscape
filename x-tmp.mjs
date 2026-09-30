import { chromium } from 'playwright';
import sharp from 'sharp';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('pe_intro_seen', '1'));
await p.goto('http://localhost:4272/');
await p.waitForTimeout(1500);
await p.evaluate(() => window.__pe.hud.cb.onNewGame(11, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }));
await p.waitForTimeout(800);
const info = await p.evaluate(() => {
  const { sim, renderer } = window.__pe;
  const c = sim.state.buildings.find((b) => b.type === 'core');
  let x0 = 0, y0 = 0;
  const free = (x, y) => sim.state.terrain[y * sim.state.width + x] === 'ground' && !sim.at(x, y);
  outer: for (let r = 4; r < 40; r++) for (let yy = c.y - r; yy <= c.y + r; yy++) for (let xx = c.x - r; xx <= c.x + r; xx++) {
    let ok = xx > 0 && yy > 0 && xx + 16 < sim.state.width && yy + 16 < sim.state.height;
    for (let dy = 0; ok && dy < 16; dy++) for (let dx = 0; ok && dx < 14; dx++) if (!free(xx + dx, yy + dy)) ok = false;
    if (ok) { x0 = xx; y0 = yy; break outer; }
  }
  const P = (t, x, y, d = 0) => { const b = sim.place(t, x0 + x, y0 + y, d); if (!b) throw new Error(t + ' ' + sim.placementError(t, x0 + x, y0 + y)); return b; };
  for (let i = 0; i < 4; i++) P('solar', i, 14);
  const ore = P('hall4', 0, 0); ore.store = { iron_ore: 60, 'crate:copper_plate': 3 };
  P('smelter', 6, 1, 0); P('smelter', 6, 3, 0);
  const out = P('hall4', 9, 0);
  const st = P('forklift', 4, 6);
  const un = P('stacker', 8, 7, 1); un.mode = 'unpack';
  P('storage', 9, 7, 1);
  renderer.centerOn(x0 + 6, y0 + 4);
  renderer.cam.zoom = 1.6;
  return { st: st.id };
});
await p.waitForTimeout(9000);
const shots = [];
for (let k = 0; k < 40 && shots.length < 4; k++) {
  const ok = await p.evaluate(() => { const f = window.__pe.sim.forklifts()[0]; window.__pe.renderer.centerOn(f.x, f.y); window.__pe.renderer.cam.zoom = 3.2; return f.count > 0 || f.state === 'load'; });
  await p.waitForTimeout(120);
  if (ok) { await p.screenshot({ path: `x-z${shots.length}.png`, clip: { x: 420, y: 150, width: 600, height: 450 } }); shots.push(1); await p.waitForTimeout(700); }
  else await p.waitForTimeout(250);
}
console.log(await p.evaluate(() => JSON.stringify(window.__pe.sim.forklifts().map((f) => ({ s: f.state, x: f.x.toFixed(1), y: f.y.toFixed(1), it: f.item, n: f.count, l: f.lift.toFixed(2) })))));
console.log('errors', errs);
await b.close();
