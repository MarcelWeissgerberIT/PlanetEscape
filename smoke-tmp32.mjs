import { chromium } from 'playwright';
const SP = '/tmp/claude-0/-home-user-PlanetEscape/df760632-f5e3-5f5f-b0a9-49fe681eb24b/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, locale: 'de-DE' });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('pe_lang', 'de'));
await page.goto('http://localhost:4179/', { waitUntil: 'load' });
await page.waitForSelector('[data-act="freeview"]', { timeout: 15000 });
await page.click('[data-act="freeview"]');
await page.waitForTimeout(400);
await page.click('[data-opt="allUnlocked"][data-val="1"]').catch(() => console.log('no allUnlocked chip'));
await page.click('[data-act="free"]');
await page.waitForTimeout(2500);
for (const sel of ['.modal [data-act="close"]', '.modal [data-act="skip"]', '.modal .primary']) { const b = await page.$(sel); if (b) { await b.click().catch(() => {}); await page.waitForTimeout(300); } }
console.log('strip:', await page.$eval('.print-strip', (e) => e.innerText.replace(/\n/g, ' ')).catch(() => 'none'));
// place three storages (no kit in stock): they become sites
await page.click('[data-btab="storage"]').catch(() => {});
await page.waitForTimeout(200);
await page.click('[data-build="storage"]');
for (const [x, y] of [[560, 300], [620, 300], [680, 300]]) { await page.mouse.click(x, y); await page.waitForTimeout(150); }
await page.waitForTimeout(500);
await page.screenshot({ path: `${SP}/kit-sites.png` });
console.log('strip after:', await page.$eval('.print-strip', (e) => e.innerText.replace(/\n/g, ' ')).catch(() => 'none'));
await page.keyboard.press('Escape');
await page.click('.print-strip');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SP}/kit-printer.png` });
await browser.close();
