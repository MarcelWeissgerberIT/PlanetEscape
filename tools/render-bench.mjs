// Render benchmark in a real browser (not part of CI): build, serve the site on port 4179 with the vite
// preview server, then: node tools/render-bench.mjs [save name] (default kora-blocks).
// Prints where a 3 s window of frames goes: simulation ticks, drawing, HUD refreshes.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const save = readFileSync(`saves/${process.argv[2] || 'kora-blocks'}.json`, 'utf8');
const browser = await chromium.launch(process.env.PE_CHROMIUM ? { executablePath: process.env.PE_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:4179/');
await page.waitForTimeout(1200);
await page.evaluate((txt) => window.__pe.hud.importText(txt), save);
await page.waitForTimeout(1500);
const r = await page.evaluate(() => new Promise((res) => {
  const pe = window.__pe; const acc = {};
  const wrap = (obj, name, key) => { const o = obj[name].bind(obj); obj[name] = (...a) => { const t0 = performance.now(); const v = o(...a); acc[key] = (acc[key] ?? 0) + performance.now() - t0; acc[key + '#'] = (acc[key + '#'] ?? 0) + 1; return v; }; };
  wrap(pe.sim, 'tick', 'sim.tick'); wrap(pe.renderer, 'draw', 'draw'); wrap(pe.hud, 'refresh', 'hud.refresh');
  if (pe.hud.renderBottom) wrap(pe.hud, 'renderBottom', 'hud.renderBottom');
  if (pe.hud.renderTop) wrap(pe.hud, 'renderTop', 'hud.renderTop');
  const t0 = performance.now();
  setTimeout(() => res({ total: performance.now() - t0, acc }), 3000);
}));
console.log('3 s window:', JSON.stringify(Object.fromEntries(Object.entries(r.acc).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
await browser.close();
