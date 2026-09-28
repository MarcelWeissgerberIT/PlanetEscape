import { chromium } from 'playwright';
const SP = '/tmp/claude-0/-home-user-PlanetEscape/df760632-f5e3-5f5f-b0a9-49fe681eb24b/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, locale: 'de-DE' });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('pe_lang', 'de'));
for (const ex of ['kdos', 'adder']) {
  await page.goto('http://localhost:4179/', { waitUntil: 'load' });
  await page.waitForSelector('[data-act="playview"]', { timeout: 15000 });
  await page.click('[data-act="playview"]');
  await page.waitForSelector(`[data-example="${ex}"]`);
  await page.click(`[data-example="${ex}"]`);
  await page.waitForTimeout(1500);
  const c = await page.$('.modal [data-act="close"]');
  if (c) await c.click();
  const yes = await page.$('.modal [data-act="yes"], .modal .primary');
  if (yes) await yes.click().catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SP}/shot-${ex}.png` });
}
await browser.close();
