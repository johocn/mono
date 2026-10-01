import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * P1 相机取景「五态」手机视口截图（spec §9 DoD：全景 / 起势 / 跟拍 / 落点 / 归位）。
 *
 * 口径：
 *   · 390×844 @dpr2（项目硬规范的标准手机视口），入 `docs/verify/`，供手册 M15 引用；
 *   · 前四态用 `__monoMain.camPreview(state)` —— 取「6 步笔直段」choreography 的代表关键帧并 **snap**，
 *     故截图确定性高、可反复复现（与 `test/core/framing.spec.ts` 同源）；
 *   · 「归位」不走 snap：**真实点击** roll → move → 结算，等相机补间回到恒等（zoom = 1、`busy() === false`）
 *     再截 —— 这样画面是「已走位、已结算」的真实局面，与首张「全景」在内容上可区分。
 *
 * MONO_ORIGIN 默认打线上；本地自测可 `MONO_ORIGIN=http://127.0.0.1:52301` 覆盖。
 *
 * 另含 **360×640 窄屏「取景态画布命中」回归**（`?debug=1` 点选）：同一个世界点分别在取景态与恒等态
 * 各点一次，两次必须选到同一格 —— 验证 `toWorld()` 反变换在放大态下不错位。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/* 与 `src/skin/layout.ts` 同值内联（本文件不在「禁写死」gate 作用域内） */
const CAM_IDLE_ZOOM = 1;
const CAM_MIN_ZOOM = 1.6;
const CAM_MAX_ZOOM = 4;
const CAM_FOLLOW_ZOOM = 3.6;
const inBand = (z) => typeof z === 'number' && z >= CAM_MIN_ZOOM - 1e-6 && z <= CAM_MAX_ZOOM + 1e-6;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

const facts = {};
const shoot = async (name, label) => {
  const pose = await page.evaluate(() => window.__monoMain.camera.current());
  await page.screenshot({ path: `${OUT}/${name}` });
  facts[label] = { file: `${OUT}/${name}`, cx: Number(pose.cx.toFixed(2)), cy: Number(pose.cy.toFixed(2)), zoom: Number(pose.zoom.toFixed(3)) };
  return pose;
};

/* ① 全景：恒等（zoom = 1，首屏零回归的基线态） */
await page.evaluate(() => window.__monoMain.camPreview('idle'));
await page.waitForTimeout(150);
const p1 = await shoot('mono-cam-01-idle.png', 'idle');

/* ② 起势：整条路径 bbox 的 fit 位姿 */
await page.evaluate(() => window.__monoMain.camPreview('lead'));
await page.waitForTimeout(150);
const p2 = await shoot('mono-cam-02-lead.png', 'lead');

/* ③ 跟拍：follow 段固定倍率 */
await page.evaluate(() => window.__monoMain.camPreview('follow'));
await page.waitForTimeout(150);
const p3 = await shoot('mono-cam-03-follow.png', 'follow');

/* ④ 落点：落点 ∪ 前 1 ∪ 后 1 的 fit 位姿 */
await page.evaluate(() => window.__monoMain.camPreview('settle'));
await page.waitForTimeout(150);
const p4 = await shoot('mono-cam-04-settle.png', 'settle');

/* ⑤ 归位：真实走位 + 结算 → 等相机回到恒等 */
await page.evaluate(() => window.__monoMain.camera.reset(0));
await page.waitForTimeout(120);
const primary = page.locator('#mono-hud button[data-primary]');
await primary.click();   // 掷骰（真实时长）
await page.waitForFunction(() => window.__monoMain?.game?.state?.phase === 'rolled', null, { timeout: 8000 }).catch(() => {});
await page.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
await primary.click();   // 前进（真实时长：跟拍 → 落点）
await page.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 15000 }).catch(() => {});
for (let i = 0; i < 20; i += 1) {
  const st = await page.evaluate(() => {
    const m = window.__monoMain;
    const close = document.querySelector('#mono-panels button[data-action="card:close"]');
    return {
      zoom: m.camera.current().zoom,
      busy: m.camera.busy(),
      phase: m.game.state.phase,
      over: m.game.state.over,
      hasClose: Boolean(close && !close.disabled),
    };
  });
  if (!st.busy && Math.abs(st.zoom - CAM_IDLE_ZOOM) <= 0.01) break;
  if (st.phase === 'idle' || st.over) { await page.waitForTimeout(80); continue; }
  const sel = st.hasClose ? '#mono-panels button[data-action="card:close"]' : '#mono-hud button[data-primary]';
  await page.evaluate((s) => { const el = document.querySelector(s); if (el && !el.disabled) el.click(); }, sel);
  await page.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(80);
}
const p5 = await shoot('mono-cam-05-reset.png', 'reset');
await page.close();

/* ============ 360×640 窄屏「取景态画布命中」回归（spec §9 DoD） ============
   口径：取景态下 `world.scale ≠ 1`，画布坐标 ≠ 世界坐标；`themeConsole.onCanvasDown` 必须先过
   `toWorld()` 反变换。用 **round-trip** 取证：同**一个世界点**分别在「取景态」与「恒等态」点一次，
   两次必须选到**同一格** —— 只看反变换对不对，不依赖任何写死的像素位置。
   （`?debug=1` 的点选结果落在控制台的「选中」输入框，可直接读。） */
const STAGE_W = 390;
const STAGE_H = 844;
const CAM_VIEW_CX = 195;
const CAM_VIEW_CY = 320;

const narrow = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
narrow.on('pageerror', (e) => errors.push(String(e)));
narrow.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await narrow.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await narrow.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
/* 控制台面板是 `position:fixed; left:6; top:6; width:198` 的调试浮层，在 360×640 下刚好盖住棋盘
   上中部 —— 真实鼠标点击会落在面板上而非画布。此处只把它**隐藏**（DOM 仍在，'选中' 输入框仍可读），
   被测对象（画布命中 + 相机反变换）不受影响。 */
await narrow.evaluate(() => {
  const b = document.getElementById('mono-theme-console');
  if (b) b.style.display = 'none';
});

const nrect = await narrow.evaluate(() => {
  const c = document.getElementById('stage').getBoundingClientRect();
  return { left: c.left, top: c.top, w: c.width, h: c.height };
});
const toClient = (lx, ly) => ({ x: nrect.left + (lx * nrect.w) / STAGE_W, y: nrect.top + (ly * nrect.h) / STAGE_H });
const readSel = () => narrow.evaluate(() => document.querySelector('#mono-theme-console input')?.value || '');

/* 取景态：找一个「中心附近确实能点到棋盘格」的画布点 */
await narrow.evaluate(() => window.__monoMain.camPreview('follow'));
const nPose = await narrow.evaluate(() => window.__monoMain.camera.current());
let framing = null;
for (const ly of [320, 340, 300, 360, 280, 380, 260]) {
  for (const lx of [195, 175, 215, 155, 235]) {
    const c = toClient(lx, ly);
    await narrow.mouse.click(c.x, c.y);
    const id = await readSel();
    if (/^board\.tile\./.test(id)) { framing = { lx, ly, id }; break; }
  }
  if (framing) break;
}

/* 恒等态：把「取景态所点的世界点」换算回恒等态的画布点再点一次，须选到同一格。
   世界点 w = toWorld(取景态画布点)；恒等态（z=1、cx/cy=视口中心）下该点渲染在画布 (w.x, w.y)。 */
let identityId = null;
let worldPoint = null;
if (framing) {
  worldPoint = {
    x: nPose.cx + (framing.lx - CAM_VIEW_CX) / nPose.zoom,
    y: nPose.cy + (framing.ly - CAM_VIEW_CY) / nPose.zoom,
  };
  await narrow.evaluate(() => window.__monoMain.camPreview('idle'));
  const c = toClient(worldPoint.x, worldPoint.y);
  await narrow.mouse.click(c.x, c.y);
  identityId = await readSel();
}
await narrow.close();

const gate = {
  idle: Math.abs(p1.zoom - CAM_IDLE_ZOOM) <= 1e-6,
  lead: inBand(p2.zoom) && p2.zoom > CAM_IDLE_ZOOM,
  follow: Math.abs(p3.zoom - CAM_FOLLOW_ZOOM) <= 1e-6,
  settle: inBand(p4.zoom) && p4.zoom > CAM_IDLE_ZOOM,
  reset: Math.abs(p5.zoom - CAM_IDLE_ZOOM) <= 0.01,
  narrowPick: Boolean(framing) && framing.id === identityId,
  noErrors: errors.length === 0,
};
facts.narrow = {
  viewport: '360x640',
  zoomed: Number(nPose.zoom.toFixed(3)),
  framingPick: framing ? framing.id : null,
  identityPick: identityId,
  worldPoint: worldPoint ? { x: Number(worldPoint.x.toFixed(2)), y: Number(worldPoint.y.toFixed(2)) } : null,
};

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
console.log('[cam-shots] PASS · 五态截图入 docs/verify/mono-cam-01..05 · 窄屏命中 round-trip 一致');