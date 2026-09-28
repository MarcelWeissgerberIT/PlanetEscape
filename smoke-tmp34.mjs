import { chromium } from 'playwright';
const SP = '/tmp/claude-0/-home-user-PlanetEscape/df760632-f5e3-5f5f-b0a9-49fe681eb24b/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, locale: 'de-DE' });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('pe_lang', 'de'));
await page.goto('http://localhost:4179/', { waitUntil: 'load' });
await page.waitForSelector('[data-act="freeview"]', { timeout: 15000 });
await page.click('[data-act="freeview"]');
await page.waitForTimeout(300);
await page.click('[data-opt="allUnlocked"][data-val="1"]').catch(() => {});
await page.click('[data-act="free"]');
await page.waitForTimeout(2500);
for (const sel of ['.modal [data-act="close"]', '.modal .primary']) { const b = await page.$(sel); if (b) { await b.click().catch(() => {}); await page.waitForTimeout(300); } }
// open the chain catalogue via the diagnostics pill, then the circuit blueprint
await page.click('[data-act="diag"]');
await page.waitForTimeout(400);
await page.click('.modal [data-chain="circuit"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SP}/bp-circuit.png` });
await page.click('.modal [data-rate="30"]');
await page.waitForTimeout(300);
await page.click('.modal .bp-node[data-bp-item="copper_wire"]');
await page.waitForTimeout(400);
console.log('after node click:', await page.$eval('.modal h2', (e) => e.textContent));
await page.click('.modal [data-bp-back]');
await page.waitForTimeout(300);
console.log('after back:', await page.$eval('.modal h2', (e) => e.textContent));
await page.click('.modal [data-bp-building="depot"]').catch(async () => { await page.click('.modal [data-act="close"]'); });
await page.waitForTimeout(300);
// building blueprint from the diagnostics catalogue
await page.click('.modal [data-act="close"]').catch(() => {});
await page.click('[data-act="diag"]');
await page.waitForTimeout(400);
await page.click('.modal [data-bp-building="wind"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SP}/bp-wind.png` });
console.log('building bp:', await page.$eval('.modal h2', (e) => e.textContent));
await browser.close();
