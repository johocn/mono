import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M6 闸门（spec §5.6 九条动效）：用 `?speed=0.25` 慢放，在每条动效的中间帧截图，
 * 并断言「动画期间 state 不二次变化」「skip() 后 phase 与不加动画一致」。
 * 另录一段视频作补充证据（recordVideo）。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
const SPEED = 0.25;
mkdirSync(OUT, { recursive: true });

/* §5.6 九行：[kind, 截图文件, durationMs（layout FX 段，用于算中间帧时刻）] */
const KINDS = [
  ['dice', 'mono-m6-01-dice.png', 520],
  ['hop', 'mono-m6-02-hop.png', 240],
  ['buy', 'mono-m6-03-buy.png', 460],
  ['upgrade', 'mono-m6-04-upgrade.png', 640],
  ['rent', 'mono-m6-05-rent.png', 520],
  ['card', 'mono-m6-06-card.png', 480],
  ['deck', 'mono-m6-07-deck.png', 420],
  ['stock', 'mono-m6-08-stock.png', 460],
  ['end', 'mono-m6-09-end.png', 900],
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&speed=${SPEED}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 20000 });

/* 先进到 rolled 阶段（动画不得改状态，故全程 phase 必须恒为 rolled） */
await page.evaluate(() => {
  const m = window.__monoMain;
  m.fx.speed(0.25);
  m.game.rollDice();
  m.paint();
});
const phase0 = await page.evaluate(() => window.__monoMain.game.state.phase);

const facts = {};
const gate = {};

for (const [kind, file, ms] of KINDS) {
  const onWall = Math.round(ms / SPEED);            // 慢放后的真实时长
  await page.evaluate((k) => {
    const m = window.__monoMain;
    m.fx.play(m.fxPreview(k));
  }, kind);
  await page.waitForTimeout(60);                    // 刚起播：busy=true，state 不应变化
  const snap = await page.evaluate(() => {
    const m = window.__monoMain;
    return { busy: m.fx.busy(), phase: m.game.state.phase, fxChildren: m.stage.layers.fx.children.length };
  });
  await page.waitForTimeout(Math.max(1, Math.round(onWall * 0.4)));  // 中间帧
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[kind] = { phase: snap.phase, fxChildren: snap.fxChildren, file };
  gate[`${kind}_busy`] = snap.busy === true;
  gate[`${kind}_spawned`] = snap.fxChildren > 0;
  gate[`${kind}_stable`] = snap.phase === phase0;
}

/* skip() 一致性：状态早已落库，跳过只影响观感时长 */
await page.evaluate(() => { window.__monoMain.fx.play(window.__monoMain.fxPreview('hop')); });
await page.waitForTimeout(80);
await page.evaluate(() => window.__monoMain.fx.skip());
const afterSkip = await page.evaluate(() => window.__monoMain.game.state.phase);
gate.skipConsistent = afterSkip === phase0;

gate.noErrors = errors.length === 0;

const video = page.video();
await page.close();
facts.video = video ? await video.path() : null;

console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await context.close();
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);