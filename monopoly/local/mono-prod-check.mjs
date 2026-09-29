import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M7 线上回归（spec §11.1 / §11.7）：打**真实 URL**，拦住「本地绿但部署漏文件 /
 * CDN 缓存 / 路径 base:'./' 在子目录下解析错」这类只在线上暴露的问题。
 *
 * 断言：
 *   0 裸入口（无参数）→ 默认即交互局：#mono-hud 存在 390×844、game 就绪、计数 32/4/2/5
 *   1 GET <ORIGIN>/mono.html → 200
 *   2 ?debug=1&play=1&seed=20260928：无 pageerror / 无 console error；__monoMain.game 就绪
 *   3 关键元素计数：board.tile.*=32 / ui.playerBar=4 / dice.body=2 / ui.handSlot=5（与本地闸门一致）
 *   4 ?skin=photo：missingAssets===0 且至少一个元素 providerKind==='image'
 *   5 整局可跑：?play=1 下 __monoMain.sim() 返回 1..4，state.over===true
 *   6 四张 390×844 @dpr2 截图入库 docs/verify/mono-prod-0{0,1,2,3}-*.png
 *   7 gate 全 true 且 errors===[]，否则 exit(1)
 *
 * MONO_ORIGIN 默认 https://game.joho.cn/tour（可用环境变量覆盖为本地 preview 自测）。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const gate = {};
const facts = {};
const errors = [];

/* 1) HTTP 200 */
const head = await fetch(`${ORIGIN}/mono.html`);
gate.http200 = head.status === 200;
facts.httpStatus = head.status;

const browser = await chromium.launch();
const attach = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/* 2) + 3) 默认皮肤：就绪、无报错、元素计数 */
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(page);
await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

gate.gameReady = await page.evaluate(() => Boolean(window.__monoMain?.game));

facts.counts = await page.evaluate(() => {
  const ids = window.__monoMain.scene.instancesOf().map((i) => i.id);
  return {
    tile: ids.filter((id) => id.startsWith('board.tile.')).length,
    playerBar: ids.filter((id) => id === 'ui.playerBar').length,
    diceBody: ids.filter((id) => id === 'dice.body').length,
    handSlot: ids.filter((id) => id === 'ui.handSlot').length,
  };
});
gate.counts =
  facts.counts.tile === 32 &&
  facts.counts.playerBar === 4 &&
  facts.counts.diceBody === 2 &&
  facts.counts.handSlot === 5;

await page.screenshot({ path: `${OUT}/mono-prod-01-board.png` });

/* 5) 整局可跑 */
facts.sim = await page.evaluate(() => {
  const m = window.__monoMain;
  const winner = m.sim();
  return { winner, over: m.game.state.over, round: m.game.state.round };
});
gate.sim = facts.sim.winner >= 1 && facts.sim.winner <= 4 && facts.sim.over === true;

await page.screenshot({ path: `${OUT}/mono-prod-02-play.png` });
await page.close();

/* 4) 换肤可用 */
const skinPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(skinPage);
await skinPage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&skin=photo`, { waitUntil: 'networkidle' });
await skinPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.skin = await skinPage.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf();
  return {
    missingAssets: m.missingAssets.length,
    imageInstances: inst.filter((i) => i.providerKind === 'image').length,
  };
});
gate.skinAssets = facts.skin.missingAssets === 0;
gate.skinImages = facts.skin.imageInstances >= 1;

await skinPage.screenshot({ path: `${OUT}/mono-prod-03-skin-photo.png` });
await skinPage.close();

/* 0) 裸入口（无参数）= 默认即交互局：HUD 必须齐备（本次回归盲点的看守） */
const entryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(entryPage);
await entryPage.goto(`${ORIGIN}/mono.html`, { waitUntil: 'networkidle' });
await entryPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.defaultEntry = await entryPage.evaluate(() => {
  const m = window.__monoMain;
  const hud = document.querySelector('#mono-hud');
  const ids = m.scene.instancesOf().map((i) => i.id);
  const r = hud ? hud.getBoundingClientRect() : null;
  return {
    hasGame: Boolean(m.game),
    hasHud: Boolean(hud),
    hudW: r ? Math.round(r.width) : 0,
    hudH: r ? Math.round(r.height) : 0,
    tile: ids.filter((id) => id.startsWith('board.tile.')).length,
    playerBar: ids.filter((id) => id === 'ui.playerBar').length,
    diceBody: ids.filter((id) => id === 'dice.body').length,
    handSlot: ids.filter((id) => id === 'ui.handSlot').length,
  };
});
gate.defaultEntry =
  facts.defaultEntry.hasGame &&
  facts.defaultEntry.hasHud &&
  facts.defaultEntry.hudW === 390 &&
  facts.defaultEntry.hudH === 844 &&
  facts.defaultEntry.tile === 32 &&
  facts.defaultEntry.playerBar === 4 &&
  facts.defaultEntry.diceBody === 2 &&
  facts.defaultEntry.handSlot === 5;

await entryPage.screenshot({ path: `${OUT}/mono-prod-00-default.png` });
await entryPage.close();

/* 7) 无报错 + 汇总 */
gate.noErrors = errors.length === 0;
facts.screenshots = [
  `${OUT}/mono-prod-00-default.png`,
  `${OUT}/mono-prod-01-board.png`,
  `${OUT}/mono-prod-02-play.png`,
  `${OUT}/mono-prod-03-skin-photo.png`,
];

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();

if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1);
