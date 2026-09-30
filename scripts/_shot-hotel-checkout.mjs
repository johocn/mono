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

// 加入购物车 → 打开侧滑购物车面板（无独立 /cart 路由）
// 首帧 hydration 未完成时首次点击可能落空（刚 pm2 restart 时尤甚），故按「面板是否含 共 2 晚」判定并重试；
// 仅在面板确为「购物车是空的」时才补点「加入购物车」，避免重复加购把数量变成 2、导致金额断言失配。
const addBtn = page.getByRole('button', { name: /加入购物车|Add to cart/ }).first();
await addBtn.waitFor({ timeout: 15000 });
const cartTrigger = page.locator('header button:has([class*="shopping-cart"])');
let dialog = page.locator('[role="dialog"]').last();
const closeCart = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
};
let needAdd = true;
for (let attempt = 1; attempt <= 3; attempt++) {
  if (needAdd) await addBtn.click();
  await cartTrigger.first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  dialog = page.locator('[role="dialog"]').last();
  const ok = await dialog
    .getByText('共 2 晚', { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (ok) break;
  needAdd = (await dialog.getByText('购物车是空的', { exact: false }).count()) > 0;
  console.log(`  购物车面板未出现「共 2 晚」（第 ${attempt} 次，面板${needAdd ? '为空' : '非空'}），关闭后重试…`);
  await closeCart();
}
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

/** 页头度量：横向溢出与品牌 logo 尺寸 */
async function headerMetrics() {
  return page.evaluate(() => {
    const h = document.querySelector('header');
    const doc = document.documentElement;
    // 品牌 logo：header left 插槽 a[aria-label="Home"] 内的 img/svg（排除购物车等图标）
    const logo = h?.querySelector('a[aria-label="Home"] img, a[aria-label="Home"] svg');
    const lb = logo?.getBoundingClientRect();
    return {
      docW: doc.clientWidth,
      scrollW: doc.scrollWidth,
      logoW: lb ? Math.round(lb.width) : 0,
      logoH: lb ? Math.round(lb.height) : 0,
    };
  });
}

// ① 结算页量一次：t2 租户名「二月兰会员」是最宽场景，修复前 scrollWidth=398（横向可滚）
const hmCheckout = await headerMetrics();
console.log('  页头度量(结算页):', JSON.stringify(hmCheckout));
const noOverflowCheckout = hmCheckout.scrollW <= hmCheckout.docW;
console.log(`${noOverflowCheckout ? 'PASS' : 'FAIL'}  页头-结算页无横向溢出：scrollWidth=${hmCheckout.scrollW} ≤ 视口 ${hmCheckout.docW}（修复前 398）`);
if (!noOverflowCheckout) failures.push('页头-结算页无横向溢出');

// ② 首页页头品牌：移动端租户按钮在 AppHeader 中隐藏（抽屉 #body 另有一份），
//    右侧组不再撑破视口，品牌 logo 不再是 32px 细缝。
await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
await page.locator('header').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/05-header-brand.png`, fullPage: false });

const hmHome = await headerMetrics();
console.log('  页头度量(首页):', JSON.stringify(hmHome));
const noOverflowHome = hmHome.scrollW <= hmHome.docW;
console.log(`${noOverflowHome ? 'PASS' : 'FAIL'}  页头-首页无横向溢出：scrollWidth=${hmHome.scrollW} ≤ 视口 ${hmHome.docW}`);
if (!noOverflowHome) failures.push('页头-首页无横向溢出');
const logoOk = hmHome.logoW >= 80;
console.log(`${logoOk ? 'PASS' : 'FAIL'}  页头-logo 可用宽 ≥80px：实际 ${hmHome.logoW}px（修复前 32px，被压成细缝）`);
if (!logoOk) failures.push('页头-logo 可用宽');

// ============ 普通商品行回归（全新 context，干净匿名购物车）
// 验证折行布局：商品名独占首行（可用宽 ≥200px）、单价与步进器折到第二行、56×56 缩略图 ============
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

// UI 正常流程加购：详情页 → 加入购物车 → 结算页。
// 站点刚重启/首屏 hydration 未完成时点击会落空，故加购后校验结算页是否真出现商品行，最多重试 3 次。
const normalUrl = `${BASE}/product/${encodeURIComponent(prod.slug)}`;
const normalLine = page2.locator('li:has([aria-label="增加数量"])').first();
let added = false;
for (let attempt = 1; attempt <= 3 && !added; attempt++) {
  console.log(`普通商品详情页 → ${normalUrl}（第 ${attempt} 次加购）`);
  await page2.goto(normalUrl, { waitUntil: 'domcontentloaded' });
  const normalAdd = page2.getByRole('button', { name: /加入购物车|Add to cart/ }).first();
  await normalAdd.waitFor({ timeout: 30000 });
  await page2.waitForTimeout(600); // 等 hydration，避免点击落空
  await normalAdd.click();
  await page2.waitForTimeout(2000);

  await page2.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' });
  added = await normalLine.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!added) console.log('  加购未生效，重试…');
}
if (!added) {
  console.error('FAIL  普通商品加购失败：结算页未出现商品行（已重试 3 次）');
  await browser.close();
  process.exit(1);
}

// 步进器 +1：1 → 2（同时验证步进器可用与行小计随之变化）。
// 刚重启后 hydration 未完成时首次点击可能落空，故按「当前数量」判断后重试，避免重复点击加多。
for (let attempt = 1; attempt <= 3; attempt++) {
  const qty = (await normalLine.locator('b').first().innerText().catch(() => '')).trim();
  if (qty === '2') break;
  await page2.locator('[aria-label="增加数量"]').first().click();
  const ok = await page2.getByText('¥336.00', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (ok) break;
  console.log(`  步进 +1 未生效（第 ${attempt} 次，当前数量 ${qty}），重试…`);
  await page2.waitForTimeout(800);
}
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

// 折行布局断言一：商品名独占首行（与操作行不在同一水平带）
const nameBox = await normalLine.locator('div.leading-tight > div').first().boundingBox();
const thumbBox = await normalLine.locator('img').first().boundingBox();
console.log('  boundingBox 商品名:', JSON.stringify(nameBox));
console.log('  boundingBox 缩略图:', JSON.stringify(thumbBox));

const thumbOk = thumbBox && Math.round(thumbBox.width) === 56 && Math.round(thumbBox.height) === 56;
console.log(`${thumbOk ? 'PASS' : 'FAIL'}  普通商品-缩略图 56×56：实际 ${thumbBox ? `${Math.round(thumbBox.width)}×${Math.round(thumbBox.height)}` : 'n/a'}`);
if (!thumbOk) failures.push('普通商品-缩略图 56×56');

const nameW = nameBox ? nameBox.width : NaN;
const nameOk = Number.isFinite(nameW) && nameW >= 200;
console.log(`${nameOk ? 'PASS' : 'FAIL'}  普通商品-商品名可用宽 ≥200px：实际 ${Number.isFinite(nameW) ? nameW.toFixed(1) : 'n/a'}px（改造前约 49px，仅容 1 字）`);
if (!nameOk) failures.push('普通商品-商品名可用宽');

const foldDy = nameBox && unitBox ? yc(unitBox) - yc(nameBox) : NaN;
console.log(`  y 中心：商品名 ${nameBox ? yc(nameBox).toFixed(1) : 'n/a'} ｜ 单价 ${unitBox ? yc(unitBox).toFixed(1) : 'n/a'} ｜ 差 = ${Number.isFinite(foldDy) ? foldDy.toFixed(1) : 'n/a'}px（折行应 >20）`);
if (Number.isFinite(foldDy) && foldDy > 20) {
  console.log('PASS  普通商品-折行：商品名独占首行，价格与操作折到第二行');
} else {
  console.error('FAIL  普通商品-折行：商品名与价格仍在同一水平带（未折行）');
  failures.push('普通商品-折行');
}

// 折行布局断言二：第二行内部 单价与步进器同带
const dy = plusBox && unitBox ? Math.abs(yc(plusBox) - yc(unitBox)) : NaN;
console.log(`  y 中心：单价 ${unitBox ? yc(unitBox).toFixed(1) : 'n/a'} ｜ 增加数量 ${plusBox ? yc(plusBox).toFixed(1) : 'n/a'} ｜ 差 = ${Number.isFinite(dy) ? dy.toFixed(1) : 'n/a'}px（阈值 <12）`);
if (Number.isFinite(dy) && dy < 12) {
  console.log('PASS  普通商品-操作行同带：单价与步进器并排于第二行');
} else {
  console.error('FAIL  普通商品-操作行同带：单价与步进器垂直错位');
  failures.push('普通商品-操作行同带');
}
console.log('  行内文本:', (await normalLine.innerText().catch(() => '')).replace(/\s+/g, ' '));

// —— 尺寸校验 780×1688（= 390×844 @2x） ——
const shotFile = `${OUT}/06-checkout-normal-product.png`;
const size = pngSize(shotFile);
const sizeOk = size.width === 780 && size.height === 1688;
console.log(`${sizeOk ? 'PASS' : 'FAIL'}  06-checkout-normal-product.png 尺寸：${size.width}×${size.height}（期望 780×1688）`);
if (!sizeOk) failures.push('尺寸 06-checkout-normal-product.png');

await ctx2.close();

// ============ 商品卡价格本地化：¥ 前缀（改前为「168.00 CNY」且币种缺省 EUR）============
const CAT = process.env.CAT_SLUG || '休闲娱乐';
// 卡片容器口径因页而异：分类页走 ProductCard（<article>），首页装修楼层走 JdProductGrid /
// GoodsCardBlock（NuxtLink 卡片，无 <article>）→ 统一按「卡片根 = article 或指向商品的链接」取样。
const CARD_SEL = 'article, a[href*="/product/"]';
const cardPrices = () =>
  page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      if (out.length >= 6) break;
      // 首页轮播/多屏滑片会同时存在不可见副本，只取真实可见卡片
      const r = root.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (getComputedStyle(root).visibility === 'hidden') continue;
      const hit = [...root.querySelectorAll('span, p, b, strong')]
        .map((s) => (s.textContent || '').trim())
        .filter((t) => t.length <= 24 && /\d/.test(t) && /(¥|CN¥|CNY|EUR|USD)/.test(t));
      if (hit.length) out.push(hit[0]);
    }
    return out;
  }, CARD_SEL);

for (const [label, url] of [['分类页', `${BASE}/category/${encodeURIComponent(CAT)}`], ['首页', BASE]]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator(`${CARD_SEL}:visible`).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  const prices = await cardPrices();
  console.log(`  ${label}商品卡价格:`, JSON.stringify(prices));
  // 断言：卡片价格不得出现裸币种代码（改前形如「168.00 CNY」/ 缺省 EUR），且至少一条带 ¥ 符号
  const noBareCode = prices.every((p) => !/(CNY|EUR|USD)/.test(p));
  const ok = prices.length > 0 && noBareCode && prices.some((p) => p.includes('¥'));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}-价格本地化：无裸币种代码且带 ¥ 符号（改前形如「168.00 CNY」）`);
  if (!ok) failures.push(`${label}-价格本地化`);
  // 截图要能看到卡片价格：首页首屏只有轮播 / 金刚区，需滚到「首个含价格的可见卡片」再截（留 80px 上边距）
  await page.evaluate((sel) => {
    for (const root of document.querySelectorAll(sel)) {
      const r = root.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (getComputedStyle(root).visibility === 'hidden') continue;
      const hit = [...root.querySelectorAll('span, p, b, strong')].some(
        (s) => /\d/.test(s.textContent || '') && /(¥|CN¥|CNY|EUR|USD)/.test(s.textContent || ''),
      );
      if (hit) {
        window.scrollTo({ top: window.scrollY + r.top - 80, behavior: 'instant' });
        return;
      }
    }
  }, CARD_SEL);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${label === '首页' ? '08-home-price' : '07-category-price'}.png`, fullPage: false });
}

await browser.close();
console.log('screenshots →', OUT);
if (failures.length) {
  console.error(`断言失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}
