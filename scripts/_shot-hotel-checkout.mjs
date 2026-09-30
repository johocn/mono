// 手机视口（390x844 dpr2）截图：详情页日期条 → 购物车酒店行 → 结算页折叠/展开
// 默认指向生产 t2 渠道与国庆 2 晚场景（2026-10-07 → 2026-10-09），并做 DOM 文本断言。
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

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

// ============ 普通商品行回归（全新 context，干净匿名购物车；验证 flex-wrap 改动未波及 v-else 分支） ============
const NORMAL_VARIANT_ID = process.env.NORMAL_VARIANT_ID || '57'; // t2「温泉门票」，hotelRoomConfig 为 null
const ADMIN_API = process.env.ADMIN_API || 'https://e.joho.cn/admin-api';
const ADMIN_USER = process.env.ADMIN_USER || 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'z123123';

/** Shop API 无 productVariant(id:)，改用 admin-api 由变体反查所属商品（slug/name） */
async function resolveVariantProduct(variantId) {
  let tok = null;
  async function gql(query, variables = {}, channelToken) {
    const headers = { 'content-type': 'application/json' };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (channelToken) headers['vendure-token'] = channelToken;
    const res = await fetch(ADMIN_API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const nt = res.headers.get('vendure-auth-token') || res.headers.get('admin-auth-token');
    if (nt) tok = nt;
    const j = await res.json();
    if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
    return j.data;
  }
  await gql('mutation($u:String!,$p:String!){ login(username:$u,password:$p,rememberMe:true){ __typename } }', { u: ADMIN_USER, p: ADMIN_PASS });
  const acc = await gql('query{ myTenantAccess{ channels{ code token } } }');
  const t2 = acc.myTenantAccess.channels.find((c) => c.code === 't2');
  if (!t2) throw new Error('admin-api 未返回 t2 渠道');
  const d = await gql('query($id:ID!){ productVariant(id:$id){ id name product{ id slug name } } }', { id: String(variantId) }, t2.token);
  const p = d.productVariant?.product;
  if (!p?.slug) throw new Error(`变体 ${variantId} 未解析到 product.slug`);
  return p;
}

async function expectVisible(locator, label) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log(`PASS  ${label}：可见`);
  } catch {
    console.error(`FAIL  ${label}：不可见`);
    failures.push(label);
  }
}

const pngSize = (file) => {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

const prod = await resolveVariantProduct(NORMAL_VARIANT_ID);
console.log(`\n变体 ${NORMAL_VARIANT_ID} → 商品「${prod.name}」slug=${prod.slug}（admin-api 解析）`);

// 全新浏览器上下文 = 干净匿名购物车（不沿用前面带酒店商品的会话）
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page2 = await ctx2.newPage();

// UI 正常流程加购：详情页 → 加入购物车
const normalUrl = `${BASE}/product/${encodeURIComponent(prod.slug)}`;
console.log('普通商品详情页 →', normalUrl);
await page2.goto(normalUrl, { waitUntil: 'domcontentloaded' });
const normalAdd = page2.getByRole('button', { name: /加入购物车|Add to cart/ }).first();
await normalAdd.waitFor({ timeout: 30000 });
await normalAdd.click();
await page2.waitForTimeout(1500);

// 结算页
await page2.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' });
const normalLine = page2.locator('li:has([aria-label="增加数量"])').first();
await normalLine.waitFor({ timeout: 30000 });

// 步进器 +1：1 → 2（同时验证步进器可用与行小计随之变化）
await page2.locator('[aria-label="增加数量"]').first().click();
await page2.getByText('¥336.00', { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {});
await page2.waitForTimeout(500);

await page2.screenshot({ path: `${OUT}/06-checkout-normal-product.png`, fullPage: false });

// —— 6 项 DOM 断言 ——
await expectText(page2, '温泉', '普通商品-商品名');
await expectText(page2, '¥168.00', '普通商品-单价');
await expectVisible(page2.locator('[aria-label="增加数量"]'), '普通商品-增加数量按钮');
await expectVisible(page2.locator('[aria-label="减少数量"]'), '普通商品-减少数量按钮');
await page2.getByText('¥336.00', { exact: true }).first().waitFor({ timeout: 15000 })
  .then(() => console.log('PASS  普通商品-行小计：命中「¥336.00」（= 单价 ¥168.00 × 2）'))
  .catch(() => { console.error('FAIL  普通商品-行小计：未找到「¥336.00」'); failures.push('普通商品-行小计'); });
await expectText(page2, '商品小计', '普通商品-商品小计口径');
await expectText(page2, '删除', '普通商品-删除按钮');

const plusBox = await page2.locator('[aria-label="增加数量"]').first().boundingBox();
const unitBox = await normalLine.getByText('¥168.00', { exact: true }).first().boundingBox();
const totalBox = await normalLine.getByText('¥336.00', { exact: true }).first().boundingBox();
const yc = (b) => b.y + b.height / 2;
console.log('  boundingBox 增加数量:', JSON.stringify(plusBox));
console.log('  boundingBox 单价  :', JSON.stringify(unitBox));
console.log('  boundingBox 行小计:', JSON.stringify(totalBox));
const dy = plusBox && unitBox ? Math.abs(yc(plusBox) - yc(unitBox)) : NaN;
console.log(`  y 中心：单价 ${unitBox ? yc(unitBox).toFixed(1) : 'n/a'} ｜ 增加数量 ${plusBox ? yc(plusBox).toFixed(1) : 'n/a'} ｜ 差 = ${Number.isFinite(dy) ? dy.toFixed(1) : 'n/a'}px（阈值 <12）`);
if (Number.isFinite(dy) && dy < 12) {
  console.log('PASS  普通商品-同一水平带：价格与步进器未因 flex-wrap 换行');
} else {
  console.error('FAIL  普通商品-同一水平带：价格与步进器垂直错位');
  failures.push('普通商品-同一水平带');
}
console.log('  行内文本:', (await normalLine.innerText().catch(() => '')).replace(/\s+/g, ' '));

// —— 尺寸校验 780×1688（= 390×844 @2x） ——
const shotFile = `${OUT}/06-checkout-normal-product.png`;
const size = pngSize(shotFile);
const sizeOk = size.width === 780 && size.height === 1688;
console.log(`${sizeOk ? 'PASS' : 'FAIL'}  06-checkout-normal-product.png 尺寸：${size.width}×${size.height}（期望 780×1688）`);
if (!sizeOk) failures.push('尺寸 06-checkout-normal-product.png');

await ctx2.close();

await browser.close();
console.log('screenshots →', OUT);
if (failures.length) {
  console.error(`断言失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}
