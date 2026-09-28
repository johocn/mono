import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?debug=1';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain), null, { timeout: 10000 });
await page.screenshot({ path: `${OUT}/mono-m1-01-boot.png` });

const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas#stage'));
const hasDebug = await page.evaluate(() => !!document.querySelector('#mono-debug'));
console.log(JSON.stringify({ hasCanvas, hasDebug, errors }, null, 2));
await browser.close();
if (!hasCanvas || !hasDebug || errors.length) process.exit(1);