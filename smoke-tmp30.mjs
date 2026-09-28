import { chromium } from 'playwright';
const SP = '/tmp/claude-0/-home-user-PlanetEscape/df760632-f5e3-5f5f-b0a9-49fe681eb24b/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, locale: 'de-DE' });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('pe_lang', 'de'));
await page.goto('http://localhost:4179/', { waitUntil: 'load' });
await page.waitForSelector('[data-act="playview"]', { timeout: 15000 });
await page.click('[data-act="playview"]');
await page.waitForSelector('[data-example="logistics"]');
await page.click('[data-example="logistics"]');
await page.waitForTimeout(1500);
const close = await page.$('.modal [data-act="close"]');
if (close) await close.click();
await page.waitForTimeout(6000);
// zoom in on the depot (below the road, left of the solar panels)
await page.mouse.move(560, 610);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(120); }
await page.waitForTimeout(800);
await page.screenshot({ path: `${SP}/shot-depot.png` });
await browser.close();
