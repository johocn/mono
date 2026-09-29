import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

/*
 * M6 闸门（spec §5.6 九条动效）：用 `?speed=0.25` 慢放，按 `fx.progress()` 的**真实相位**
 * 截中间帧（不靠墙钟推算——此前正是按 durationMs 推算，截在动画结束后与 baseline 字节相同）。
 * 断言强度：
 *   - 9 张截图两两内容哈希不同，且每张都 ≠ 空场景 baseline；
 *   - 每张截图的动效自身包围盒 `fx.bounds()` ≥ 40×40（390×844 下确实「看得见」）；
 *   - 截图瞬间 `fx.busy()` 为真、state 相位未二次变化。
 * 另录一段视频作补充证据（recordVideo → mono-m6-anim.webm）。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
const SPEED = 0.25;
const MIN_PX = 40;               // 单帧最小可见尺寸（390×844 手机屏上的可辨识门槛）
mkdirSync(OUT, { recursive: true });

/* §5.6 九行：[kind, 截图文件, 中间帧相位 progress(0..1)] */
const KINDS = [
  ['dice', 'mono-m6-01-dice.png', 0.35],
  ['hop', 'mono-m6-02-hop.png', 0.2],
  ['buy', 'mono-m6-03-buy.png', 0.25],
  ['upgrade', 'mono-m6-04-upgrade.png', 0.7],
  ['rent', 'mono-m6-05-rent.png', 0.25],
  ['card', 'mono-m6-06-card.png', 0.3],
  ['deck', 'mono-m6-07-deck.png', 0.35],
  ['stock', 'mono-m6-08-stock.png', 0.15],
  ['end', 'mono-m6-09-end.png', 0.4],
];

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

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

await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&speed=${SPEED}&humans=4&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 20000 });

/* 先进到 rolled 阶段（动画不得改状态，故全程 phase 必须恒为 rolled） */
await page.evaluate(() => {
  const m = window.__monoMain;
  m.fx.speed(0.25);
  m.game.rollDice();
  m.paint();
});
const phase0 = await page.evaluate(() => window.__monoMain.game.state.phase);

/* 空场景 baseline：动效层已清（刚 paint 过），用于证明每张截图确实画了东西 */
const baselineHash = md5(await page.screenshot());

const facts = {};
const gate = {};
const hashes = [];

for (const [kind, file, frac] of KINDS) {
  await page.evaluate((k) => { window.__monoMain.fx.play(window.__monoMain.fxPreview(k)); }, kind);
  /* 等真实相位到达目标进度（时轴由 gsap 驱动，慢放 4 倍） */
  await page.waitForFunction(
    (f) => window.__monoMain.fx.progress() >= f,
    frac,
    { polling: 'raf', timeout: 30000 },
  );
  const snap = await page.evaluate(() => {
    const m = window.__monoMain;
    const b = m.fx.bounds();
    return {
      busy: m.fx.busy(),
      progress: m.fx.progress(),
      totalMs: m.fx.totalMs(),
      phase: m.game.state.phase,
      fxChildren: m.stage.layers.fx.children.length,
      bounds: b,
    };
  });
  const buf = await page.screenshot({ path: `${OUT}/${file}` });
  const hash = md5(buf);
  hashes.push(hash);
  facts[kind] = {
    phase: snap.phase,
    progress: Number(snap.progress.toFixed(3)),
    totalMs: Math.round(snap.totalMs),
    fxChildren: snap.fxChildren,
    bounds: snap.bounds
      ? { w: Math.round(snap.bounds.w), h: Math.round(snap.bounds.h) }
      : null,
    hash,
    file,
  };
  gate[`${kind}_busy`] = snap.busy === true;
  gate[`${kind}_stable`] = snap.phase === phase0;
  gate[`${kind}_progress`] = snap.progress >= frac;
  gate[`${kind}_visible`] = Boolean(snap.bounds) && snap.bounds.w >= MIN_PX && snap.bounds.h >= MIN_PX;
  gate[`${kind}_differs_baseline`] = hash !== baselineHash;
}

facts.baselineHash = baselineHash;
gate.hashesDistinct = new Set(hashes).size === KINDS.length;

/* skip() 一致性：状态早已落库，跳过只影响观感时长 */
await page.evaluate(() => { window.__monoMain.fx.play(window.__monoMain.fxPreview('hop')); });
await page.waitForTimeout(80);
await page.evaluate(() => window.__monoMain.fx.skip());
const afterSkip = await page.evaluate(() => window.__monoMain.game.state.phase);
gate.skipConsistent = afterSkip === phase0;

gate.noErrors = errors.length === 0;

const video = page.video();
await page.close();
facts.video = video ? await video.saveAs(`${OUT}/mono-m6-anim.webm`).then(() => `${OUT}/mono-m6-anim.webm`).catch(() => null) : null;

console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await context.close();
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);