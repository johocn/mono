/* M21 广告宣传版（方案 A showcase）手机截图回归 —— 390×844 @dpr2
 *
 * 覆盖：① 原版裸链接零回归（无 ad DOM / 无配色注入）② 广告版整屏（hero 轮播 /
 * 商圈 Tab / 商品卡 / 迷你棋盘 / 紧凑 HUD / 公共配色变量）③ Tab 过滤
 * ④ 落格联动（mock shops.json → is-hot 高亮 + 弹券抽屉 + key 防重复）
 * ⑤ ?plan= 预览不落库 + 未实现方案回退告警 ⑥ adSwitch 落库切换零残留重启。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/* 不带 ?debug=1：__monoMain 无条件暴露，debug 只会弹风格控制台遮挡广告区 */
const AD_URL = `${ORIGIN}/mono.html?ad=1&play=1&seed=20260928&humans=4&tour=0`;
const ORIG_URL = `${ORIGIN}/mono.html?play=1&seed=20260928&humans=4&tour=0`;

/* headless:false —— headless 的软件 GL 合成器会把 overflow-y:auto 滚动容器
 * 在 #mono-ad 裁剪区外的溢出带画成纯黑（伪影，真实 Chrome 无此问题，已 headed 复测确认） */
const browser = await chromium.launch({ headless: false });
const errors = [];
const warns = [];
const gate = {};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
/* headed Chrome 会为标签页请求 favicon（项目本无此文件，headless 不请求）→ 短路，避免误报 404 */
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 200, contentType: 'image/x-icon', body: '' }));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning' || m.type() === 'warn') warns.push(m.text());   // Playwright 类型名为 warning
});

/* ── 1) 原版裸链接零回归：无 ad 层、无配色注入、canvas HUD 照常 ── */
await page.goto(ORIG_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
const orig = await page.evaluate(() => ({
  adPlan: window.__monoMain.adPlan,
  adStyle: document.querySelector('#mono-ad-style') !== null,
  mallDom: document.querySelector('.moad-hero') !== null,
  adHud: document.querySelector('#mono-ad-hud') !== null,
  canvasQk: window.__monoMain.scene.instancesOf().some((i) => i.id === 'ui.qk'),
  rootVars: getComputedStyle(document.documentElement).getPropertyValue('--ad-bg').trim(),
}));
gate.orig_no_ad = orig.adPlan === null && !orig.adStyle && !orig.mallDom && !orig.adHud;
gate.orig_canvas_hud = orig.canvasQk && orig.rootVars === '';
await page.screenshot({ path: `${OUT}/mono-ad-01-original.png` });

/* ── 2) 广告版整屏：方案 A showcase ── */
await page.goto(AD_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
const ad = await page.evaluate(() => ({
  adPlan: window.__monoMain.adPlan,
  adStyle: document.querySelector('#mono-ad-style') !== null,
  hero: document.querySelectorAll('.moad-hero-item').length,
  tabs: Array.from(document.querySelectorAll('.moad-tab')).map((b) => ({
    label: b.textContent, on: b.className.includes(' on'),
  })),
  cards: document.querySelectorAll('.moad-card').length,
  adHud: document.querySelector('#mono-ad-hud') !== null,
  bars: document.querySelectorAll('#mono-ad-hud .moadh-bar').length,
  qkBtns: document.querySelectorAll('#mono-ad-hud .moadh-qk .moadh-btn').length,
  audioKeys: document.querySelectorAll('#mono-ad-hud .moadh-audio').length,
  canvasQk: window.__monoMain.scene.instancesOf().some((i) => i.id === 'ui.qk'),
  varBg: getComputedStyle(document.documentElement).getPropertyValue('--ad-bg').trim(),
  varGold: getComputedStyle(document.documentElement).getPropertyValue('--ad-gold').trim(),
}));
gate.ad_boot = ad.adPlan === 'showcase' && ad.adStyle && ad.adHud;
gate.ad_tokens = ad.varBg !== '' && ad.varGold !== '';
gate.ad_hero_tabs = ad.hero === 4 && ad.tabs.length === 4 && ad.tabs[0].on;
gate.ad_cards = ad.cards > 0;
gate.ad_hud_compact = ad.bars === 4 && ad.qkBtns === 5 && ad.audioKeys === 2;
gate.ad_canvas_hud_absent = !ad.canvasQk;   // 原 canvas HUD 不画（DOM 紧凑 HUD 接管）
await page.screenshot({ path: `${OUT}/mono-ad-02-mall.png` });

/* hero 自动轮播：4s 后 scrollLeft 前进（destroy 清定时器，逻辑见 MallView.ts） */
await page.waitForTimeout(4400);
gate.ad_hero_autoplay = await page.evaluate(() => document.querySelector('.moad-hero').scrollLeft > 0);

/* ── 3) 商圈 Tab 过滤：点「核心商圈」→ on 迁移 + 卡数变少且 >0 ── */
const tabs = await page.evaluate(() => {
  const all = document.querySelectorAll('.moad-card').length;
  document.querySelectorAll('.moad-tab')[1].click();
  return { all, after: document.querySelectorAll('.moad-card').length };
});
await page.waitForTimeout(60);
gate.ad_tab_filter = tabs.after > 0 && tabs.after < tabs.all
  && await page.evaluate(() => document.querySelectorAll('.moad-tab')[1].className.includes(' on'));
await page.screenshot({ path: `${OUT}/mono-ad-03-tab-filter.png` });
await page.evaluate(() => document.querySelectorAll('.moad-tab')[0].click());   // 回「全部」

/* ── 4) 落格联动：mock shops.json（slot 3 长峰特产 + 券）→ settle → is-hot + 弹券 ── */
await page.route('**/config/shops.json', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    shops: [{
      slot: 3, merchantName: '长峰特产旗舰店', short: '长峰特产', brand: '长峰特产',
      couponTemplateId: 'c-mock-001',
    }],
  }),
}));
await page.goto(AD_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
const landing = await page.evaluate(() => {
  const m = window.__monoMain;
  const g = m.game;
  g.rollDice();
  g.moveCurrent();   // 技能 stepBonus / 骰值不定 → move 后 settle 前传送，确定性落在 index 3
  g.state.players[0].pos = 3;   // index 3 = 长峰特产（mock 商家）
  g.settleCurrent();
  m.paint();   // paint → mall.update() → pickLanding 高亮 + 弹券
  return {
    phase: g.state.phase,
    hot: Array.from(document.querySelectorAll('.moad-card.is-hot')).map((c) => c.dataset.slot),
    drawer: document.querySelector('.moad-coupon')?.className ?? '',
    drawerTitle: document.querySelector('.moad-coupon-title')?.textContent ?? '',
  };
});
gate.ad_landing_hot = landing.phase === 'settled' && landing.hot.length === 1 && landing.hot[0] === '3';
gate.ad_landing_coupon = landing.drawer.includes('show') && landing.drawerTitle.includes('长峰特产');
/* key 防重复：再 paint 两次 → 抽屉不重复弹、高亮不叠加 */
await page.evaluate(() => { window.__monoMain.paint(); window.__monoMain.paint(); });
gate.ad_landing_guard = await page.evaluate(() =>
  document.querySelectorAll('.moad-card.is-hot').length === 1
  && document.querySelectorAll('.moad-coupon.show').length === 1);
await page.screenshot({ path: `${OUT}/mono-ad-04-landing.png` });
await page.evaluate(() => document.querySelector('.moad-coupon .ghost')?.click());
await page.waitForTimeout(60);
gate.ad_coupon_close = await page.evaluate(
  () => !document.querySelector('.moad-coupon')?.className.includes('show'),
);

/* ── 5) ?plan= 预览不落库 + 未实现方案回退告警 ── */
await page.goto(`${AD_URL}&plan=flagship`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
const preview = await page.evaluate(() => ({
  adPlan: window.__monoMain.adPlan,
  stored: window.localStorage.getItem('mono.adPlan'),
}));
gate.plan_preview_no_persist = preview.adPlan === 'showcase' && preview.stored === null;
gate.plan_fallback_warn = warns.some((w) => w.includes('flagship') && w.includes('showcase'));
await page.screenshot({ path: `${OUT}/mono-ad-05-plan-fallback.png` });

/* ── 6) adSwitch 落库切换（后台/e2e 入口）→ reload 重启零残留 ── */
await page.evaluate(() => window.__monoMain.adSwitch('showcase'));
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
const switched = await page.evaluate(() => ({
  adPlan: window.__monoMain.adPlan,
  stored: window.localStorage.getItem('mono.adPlan'),
  adStyle: document.querySelector('#mono-ad-style') !== null,
  hero: document.querySelectorAll('.moad-hero-item').length,
}));
gate.ad_switch_reboot = switched.adPlan === 'showcase' && switched.stored === 'showcase'
  && switched.adStyle && switched.hero === 4;
await page.screenshot({ path: `${OUT}/mono-ad-06-after-switch.png` });

await browser.close();

/* ── 汇总 ── */
const failed = Object.entries(gate).filter(([, v]) => !v);
for (const [k, v] of Object.entries(gate)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
console.log(`errors: ${JSON.stringify(errors)}`);
if (errors.length > 0 || failed.length > 0) {
  console.error(`mono-shots-ad: ${failed.length} gate(s) failed, ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log('mono-shots-ad: all gates passed');
}
