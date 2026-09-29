/**
 * 商家配置加载闸门（商业闭环·阶段一「静态认领」，design §6.3/§6.4 / §7.1-①③）
 *
 * 不部署、不改代码：用 Playwright 拦截 `config/shops.json`，注入一份**演示用**商家清单
 * （非真实商家名 —— 真名授权前禁止上屏 / 禁止部署），验证：
 *   ① 改配置后游戏内**店招/字牌文案变化**（截图，390×844 @dpr2）
 *   ② 配置 → `overrides` 映射正确；图片素材按皮肤包同源解析并预装成功
 *   ③ 配置缺失（不拦截，走 public/config/shops.json 空清单）→ **零变化**（回退内建 board.ts）
 *
 * 依赖本地 dev（`npm run dev` → http://127.0.0.1:52300）。产物入 docs/verify/。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/** 演示清单：占位名（**非真实商家**）+ 一个已存在的纹理路径证明图片覆盖链路 */
const FIXTURE = {
  shops: [
    { slot: 4, merchantName: '示例商家·甲', short: '示例甲', brand: '示例商号甲' },
    { slot: 18, merchantName: '示例商家·乙', short: '示例乙', brand: '示例商号乙', sign: { src: 'tex/tree.png' } },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const open = async (query) => {
  await page.goto(`${BASE}${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });
};

const labelsOf = () => page.evaluate(() => {
  const nodes = window.__monoMain.stage.layers.labels.children;
  return nodes.filter((n) => typeof n.text === 'string').map((n) => n.text);
});

/* —— ① 配置生效：字牌 + 店招文案随配置变化（截图） —— */
await page.route('**/config/shops.json', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(FIXTURE),
}));

await open('?demo=1&show=0');
await page.screenshot({ path: `${OUT}/mono-shops-01-board.png` });
const labelsInjected = await labelsOf();

await open('?demo=1&show=b');
await page.screenshot({ path: `${OUT}/mono-shops-02-showcase-b.png` });

/* —— ② 映射与图片预装（photo 皮肤内已有 tex/tree.png） —— */
await open('?demo=1&show=0&skin=photo');
await page.screenshot({ path: `${OUT}/mono-shops-03-photo-sign.png` });
const injected = await page.evaluate(() => ({
  overrides: window.__monoMain.shops.overrides,
  missing: window.__monoMain.missingAssets,
}));

/* —— ③ 零配置回退：不拦截 → 走 shipped 空清单 → 与内建默认完全一致（截图） —— */
await page.unroute('**/config/shops.json');
await open('?demo=1&show=0');
await page.screenshot({ path: `${OUT}/mono-shops-04-board-zero-config.png` });
const labelsDefault = await labelsOf();
const zeroCfg = await page.evaluate(() => ({
  overrides: window.__monoMain.shops.overrides,
  images: window.__monoMain.shops.images,
}));

const sign = injected.overrides['building.s18.sign'];

const gate = {
  /* ① 字牌随配置变化，且旧默认名被替换 */
  labels32: labelsInjected.length === 32,
  labelsInjected: labelsInjected.includes('示例甲') && labelsInjected.includes('示例乙'),
  labelsReplaced: !labelsInjected.includes('国信温泉') && !labelsInjected.includes('鹿茸市场'),
  /* ② overrides 映射 + 图片预装无缺失 */
  overrideSign: Boolean(sign) && sign.kind === 'image' && sign.src === 'tex/tree.png',
  overrideMissing: injected.missing.length === 0,
  /* ③ 零配置 → 零变化 */
  zeroOverrides: Object.keys(zeroCfg.overrides).length === 0 && zeroCfg.images.length === 0,
  zeroLabels: labelsDefault.includes('国信温泉') && labelsDefault.includes('鹿茸市场')
    && !labelsDefault.includes('示例甲'),
  noErrors: errors.length === 0,
};

console.log(JSON.stringify({ gate, injected, zeroCfg, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
