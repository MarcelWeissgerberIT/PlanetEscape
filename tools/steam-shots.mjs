// Store screenshots at 1920×1080: story factories built by the solver, the blueprint overlay, logistics, the
// KORA terminal and the challenges. Needs the site served (npm run build && npx vite preview --port 4179).
// Usage: node tools/steam-shots.mjs [en|de]   (writes steam-assets/screenshots/<lang>-*.png)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const lang = process.argv[2] === 'de' ? 'de' : 'en';
const URL = process.env.PE_URL ?? 'http://localhost:4179/';
execSync('npx esbuild tools/shot-saves.ts --bundle --platform=node --format=esm --outfile=mcp/dist/shot-saves.mjs --log-level=warning && node mcp/dist/shot-saves.mjs', { stdio: 'inherit' });
mkdirSync('steam-assets/screenshots', { recursive: true });
const browser = await chromium.launch(process.env.PE_CHROMIUM ? { executablePath: process.env.PE_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(URL);
await page.waitForTimeout(1500);
await page.click(`[data-lang="${lang}"]`);
let n = 0;
const shot = async (name) => {
  await page.mouse.move(1900, 540); // no tooltip in the picture
  await page.waitForTimeout(700);
  await page.screenshot({ path: `steam-assets/screenshots/${lang}-${++n}-${name}.png` });
  console.log('shot', n, name);
};
await shot('title');
const load = async (file) => {
  await page.evaluate((txt) => window.__pe.hud.importText(txt), readFileSync(file, 'utf8'));
  await page.waitForTimeout(1500);
};
for (const ch of [4, 6]) {
  await load(`steam-assets/.saves/chapter${ch}.json`);
  await page.evaluate(() => { const r = window.__pe.renderer; r.centerOnCore(); r.cam.zoom = 0.75; window.__pe.hud.closeModal?.(); });
  await page.waitForTimeout(2500);
  await shot(`chapter${ch}`);
}
await page.evaluate(() => window.__pe.hud.showChain('precision_part'));
await shot('blueprint');
await page.evaluate(() => window.__pe.hud.closeModal());
for (const ex of ['logistics', 'pong']) {
  await page.evaluate(() => { window.__pe.hud.titleView = 'playground'; window.__pe.hud.showTitle(); });
  await page.waitForTimeout(400);
  await page.click(`[data-example="${ex}"]`);
  await page.waitForTimeout(400);
  const yes = page.locator('.modal [data-act="yes"]');
  if (await yes.count()) await yes.click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__pe.hud.closeModal());
  await page.waitForTimeout(ex === 'pong' ? 6000 : 3000);
  if (ex === 'logistics') await page.evaluate(() => { const pe = window.__pe; const d = pe.sim.state.buildings.find((b) => b.type === 'depot'); if (d) pe.renderer.centerOn(d.x + 6, d.y - 2, 1.15); });
  await shot(ex);
}
await page.evaluate(() => { window.__pe.hud.titleView = 'challenges'; window.__pe.hud.showTitle(); });
await shot('challenges');
await browser.close();
