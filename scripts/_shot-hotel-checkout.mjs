// 手机视口（390x844 dpr2）截图：详情页日期条 → 购物车酒店行 → 结算页折叠/展开
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000/t2';
const SLUG = process.env.HOTEL_SLUG;
const OUT = 'docs/manual/shots/2026-09-30-hotel-orderline';
if (!SLUG) { console.error('缺少 HOTEL_SLUG'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto(`${BASE}/product/${SLUG}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/01-detail-datebar.png`, fullPage: false });

await page.getByRole('button', { name: /加入购物车|Add to cart/ }).first().click();
await page.waitForTimeout(1500);

// 购物车为页头触发的侧滑面板（无独立 /cart 路由），点击页头购物车按钮展开
const cartTrigger = page
  .locator('header button')
  .filter({ has: page.locator('[class*="shopping-cart"]') });
if (await cartTrigger.count()) {
  await cartTrigger.first().click();
} else {
  await page.locator('header button').last().click();
}
await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-cart-hotel-line.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/03-checkout-collapsed.png`, fullPage: false });
const toggle = page.getByText(/逐晚明细|Nightly breakdown/).first();
if (await toggle.count()) {
  await toggle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-checkout-expanded.png`, fullPage: false });
}

await page.goto(`${BASE}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/05-header-brand.png`, fullPage: false });

await browser.close();
console.log('screenshots →', OUT);
