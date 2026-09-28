import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';

/*
 * M8 分享入口本地闸门（390×844 @dpr2）。
 *
 * 断言：
 *   1 og / twitter meta 就位（title/description/image/url）
 *   2 og:image 是可解析的**真图**：fetch → 200 + content-type image/png + 字节数与本地 `public/share/share-card.png` 一致
 *   3 常驻「分享」CTA 渲染且**不与** #mono-hud 按键 / #mono-panels 手牌 / 橱窗带 / ?debug=1 右上切换器 相交（顶栏留白带）
 *   4 非微信环境 `__monoShareStatus === 'skipped'`、无 console error（降级不报错）
 *   5 微信 UA 且**签名端点未配置**（返回空签名）→ `__monoShareStatus === 'fallback'`、无 console error、
 *     浮层给出复制链接兜底且能复制（「端点不可达」分支由单测 throw 用例覆盖）
 *   6 终局（sim）后浮层出现「复制战绩」
 *   7 截图入库 docs/verify/mono-share-0{1,2,3}-*.png
 *
 * ORIGIN 默认本地 dev（http://127.0.0.1:52300），可用 MONO_ORIGIN 覆盖。
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52300').replace(/\/$/, '');
const OUT = 'docs/verify';
const LOCAL_IMG = 'public/share/share-card.png';
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN';
mkdirSync(OUT, { recursive: true });

const gate = {};
const facts = { shots: [] };
const errors = [];

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const browser = await chromium.launch();
const attach = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()}`); });
};
const rectOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, sel);

/* —— 1) 非微信 · play 模式 —— */
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(page);
await page.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&nofx=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await page.waitForSelector('#mono-share button[data-action="share"]', { timeout: 5000 });

const meta = await page.evaluate(() => {
  const g = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
  return {
    title: g('meta[property="og:title"]'),
    desc: g('meta[property="og:description"]'),
    image: g('meta[property="og:image"]'),
    url: g('meta[property="og:url"]'),
    tw: g('meta[name="twitter:card"]'),
    iw: g('meta[property="og:image:width"]'),
    ih: g('meta[property="og:image:height"]'),
  };
});
facts.meta = meta;
gate.meta = Boolean(meta.title && meta.desc && meta.image && meta.url
  && meta.tw === 'summary_large_image' && meta.iw === '800' && meta.ih === '640');

/* —— 2) og:image 是真图（200 + content-type + 字节数 == 本地） —— */
const imgRes = await fetch(meta.image);
const imgBytes = (await imgRes.arrayBuffer()).byteLength;
const localBytes = statSync(LOCAL_IMG).size;
facts.ogImage = { url: meta.image, status: imgRes.status, type: imgRes.headers.get('content-type'), bytes: imgBytes, localBytes };
gate.ogImage200 = imgRes.status === 200;
gate.ogImageType = (imgRes.headers.get('content-type') || '').includes('image/png');
gate.ogImageBytes = imgBytes === localBytes && imgBytes > 0;

/* —— 3) CTA 不与既有 UI 相交 —— */
const cta = await rectOf(page, '#mono-share button[data-action="share"]');
const hudPrimary = await rectOf(page, '#mono-hud button[data-primary]');
const hudBuy = await rectOf(page, '#mono-hud button[data-action="buy"]');
const panelSlots = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#mono-panels button')].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return els;
});
/* 橱窗带（play 版式中部）：布局常量 PLAY_SHOWCASE_Y=300 / PANEL_H=300 → 300..600 */
const showcaseBand = { x: 10, y: 300, w: 370, h: 300 };
const hits = [];
if (cta) {
  for (const [name, r] of [['hud.primary', hudPrimary], ['hud.buy', hudBuy], ...panelSlots.map((r, i) => [`panels.${i}`, r]), ['showcase.band', showcaseBand]]) {
    if (r && overlap(cta, r)) hits.push(name);
  }
}
facts.cta = { box: cta, collisions: hits, inTopStrip: Boolean(cta && cta.y >= 0 && cta.y + cta.h <= 34) };
gate.ctaTopStrip = Boolean(cta && cta.y >= 0 && cta.y + cta.h <= 34);
gate.ctaNoCollision = Boolean(cta) && hits.length === 0;

await page.screenshot({ path: `${OUT}/mono-share-01-cta.png` });

/* —— 4) 非微信：skipped + 无报错 —— */
facts.statusOutsideWechat = await page.evaluate(() => window.__monoShareStatus ?? null);
gate.skippedOutsideWechat = facts.statusOutsideWechat === 'skipped';

/* —— 5) 终局战绩：sim() 后浮层出现「复制战绩」 —— */
await page.evaluate(() => window.__monoMain.sim());
await page.waitForTimeout(120);
await page.click('#mono-share button[data-action="share"]');
const hasResult = await page.evaluate(() => Boolean(document.querySelector('#mono-share button[data-action="share:result"]')));
facts.hasResultButton = hasResult;
gate.resultShare = hasResult;
await page.screenshot({ path: `${OUT}/mono-share-02-result.png` });
await page.close();

/* —— 6) ?debug=1：CTA 不与右上切换器相交 —— */
const dbg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(dbg);
await dbg.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&nofx=1`, { waitUntil: 'networkidle' });
await dbg.waitForSelector('#mono-share button[data-action="share"]', { timeout: 5000 });
const ctaDbg = await rectOf(dbg, '#mono-share button[data-action="share"]');
const sw = await rectOf(dbg, '#mono-views');
facts.debug = { cta: ctaDbg, switcher: sw, collide: Boolean(ctaDbg && sw && overlap(ctaDbg, sw)) };
gate.debugSwitcher = Boolean(ctaDbg && sw) && !facts.debug.collide;
await dbg.close();

/* —— 7) 微信 UA + 签名端点不可达 → fallback + 无报错 + 复制兜底 —— */
const wx = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: WECHAT_UA });
attach(wx);
await wx.addInitScript(() => {
  window.__copied = [];
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__copied.push(String(t)); return Promise.resolve(); } },
    });
  } catch { /* ignore */ }
});
/* 5) 模拟「签名端点未配置」：返回 200 但无 signature → 走 fallback（无网络层报错，避免把浏览器资源加载失败误判为应用报错） */
await wx.route('**/v1/auth/jssdk-signature', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await wx.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&nofx=1`, { waitUntil: 'networkidle' });
await wx.waitForFunction(() => window.__monoShareStatus !== undefined, null, { timeout: 20000 });
await wx.waitForTimeout(200);
facts.statusInWechatFallback = await wx.evaluate(() => window.__monoShareStatus);
gate.fallbackInWechat = facts.statusInWechatFallback === 'fallback';

await wx.click('#mono-share button[data-action="share"]');
await wx.waitForSelector('#mono-share button[data-action="share:link"]', { timeout: 5000 });
const hint = await wx.evaluate(() => document.querySelector('#mono-share-sheet')?.textContent ?? '');
facts.fallbackHint = hint.includes('复制链接');
await wx.click('#mono-share button[data-action="share:link"]');
const copied = await wx.evaluate(() => window.__copied?.[0] ?? '');
facts.copied = copied;
gate.fallbackCopy = copied.includes('/tour/mono.html') || copied.includes('mono.html');
gate.fallbackHint = facts.fallbackHint;
await wx.screenshot({ path: `${OUT}/mono-share-03-fallback.png` });
await wx.close();

gate.noErrors = errors.length === 0;
facts.shots = [
  `${OUT}/mono-share-01-cta.png`,
  `${OUT}/mono-share-02-result.png`,
  `${OUT}/mono-share-03-fallback.png`,
];

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();

if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1);
