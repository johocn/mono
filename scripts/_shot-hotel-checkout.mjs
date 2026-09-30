// 手机视口（390x844 dpr2）截图：详情页日期条 → 购物车酒店行 → 结算页折叠/展开
// 默认指向生产 t2 渠道与国庆 2 晚场景（2026-10-07 → 2026-10-09），并做 DOM 文本断言。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'https://www.youshop.cn/t2';
const SLUG = process.env.HOTEL_SLUG || '国信南山温泉节假日房间';
const CHECK_IN = process.env.CHECK_IN || '2026-10-07';
const CHECK_OUT = process.env.CHECK_OUT || '2026-10-09';
const OUT = 'docs/manual/shots/2026-09-30-hotel-orderline';
mkdirSync(OUT, { recursive: true });

const failures = [];
// 在页面可见文本中断言存在指定片段；失败则记录并打印实际文本
async function expectText(scope, needle, label) {
  const loc = scope.getByText(needle, { exact: false }).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`PASS  ${label}：命中「${needle}」`);
  } catch {
    const txt = (await scope.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800);
    console.error(`FAIL  ${label}：未找到「${needle}」\n      实际文本：${txt}`);
    failures.push(label);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

// 详情页：用查询串预填入离日期，拿到 2 晚
const detailUrl = `${BASE}/product/${encodeURIComponent(SLUG)}?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}`;
console.log('详情页 →', detailUrl);
await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
await page.getByText('逐日计价').first().waitFor({ timeout: 30000 });
await expectText(page, '¥1880', '详情页-预估总价');
await expectText(page, '¥1000', '详情页-逐晚价(节假日)');
await expectText(page, '¥880', '详情页-逐晚价(平日)');
await page.screenshot({ path: `${OUT}/01-detail-datebar.png`, fullPage: false });

// 加入购物车
const addBtn = page.getByRole('button', { name: /加入购物车|Add to cart/ }).first();
await addBtn.waitFor({ timeout: 15000 });
await addBtn.click();

// 购物车为页头触发的侧滑面板（无独立 /cart 路由）
const cartTrigger = page.locator('header button:has([class*="shopping-cart"])');
await cartTrigger.first().waitFor({ timeout: 15000 });
await cartTrigger.first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
const dialog = page.locator('[role="dialog"]').last();
await dialog.getByText('共 2 晚', { exact: false }).first().waitFor({ timeout: 15000 });
await expectText(dialog, '共 2 晚', '购物车-晚数');
await expectText(dialog, '1880.00', '购物车-金额');
await expectText(dialog, '2026-10-07 至 2026-10-09', '购物车-日期区间');
await page.screenshot({ path: `${OUT}/02-cart-hotel-line.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {});

// 结算页
await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' });
await page.getByText('逐晚明细', { exact: false }).first().waitFor({ timeout: 30000 });
await expectText(page, '共 2 晚', '结算页-晚数');
await page.screenshot({ path: `${OUT}/03-checkout-collapsed.png`, fullPage: false });

// 展开逐晚明细
await page.getByText('逐晚明细', { exact: false }).first().click();
await page.getByText('住宿合计', { exact: false }).first().waitFor({ timeout: 15000 });
await expectText(page, '住宿合计', '结算页-展开-住宿合计');
await expectText(page, '1880.00', '结算页-展开-金额');
await expectText(page, '¥1000.00', '结算页-展开-逐晚价(节假日)');
await expectText(page, '¥880.00', '结算页-展开-逐晚价(平日)');
await page.screenshot({ path: `${OUT}/04-checkout-expanded.png`, fullPage: false });

// 首页页头品牌
await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
await page.locator('header').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/05-header-brand.png`, fullPage: false });

await browser.close();
console.log('screenshots →', OUT);
if (failures.length) {
  console.error(`断言失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}
