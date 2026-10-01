import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M9 手机视口取证（390×844 @dpr2，spec 硬口径「每次功能测试必须用手机浏览视图截图」）。
 *
 * 覆盖本轮四项改动的**目视验收**：
 *   ① 战报遮挡事件卡：浮层（`overlayOf` 非 null）展开时 `#mono-slots`（右上轮播 + 左下战报）
 *      必须整块 `display:none`；无浮层时逐像素回现状（零回归）。
 *   ② 棋子放大（32px 主角化）+ 同格 4 人 2×2 方阵：是否压到邻格。
 *   ③ 楼体实时层级（演示层级 ∪ 地产层级）：L4/L5 长高后是否遮住后排地块/名牌。
 *   ④ 四个新特殊格地砖（9 银行 / 21 乐透 / 23 税务 / 25 医院）配色是否可辨。
 *
 * 坐标不猜：直接 `import('/src/render/BoardView.ts')` 取 `boardCells(geo)` 与 `ipos`
 * （vite dev 下与页面同一份模块实例），与渲染层共用同一套 iso 变换。
 *
 * MONO_ORIGIN 默认本地 dev（52301）；线上复核可 `MONO_ORIGIN=https://game.joho.cn/tour`。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52301';
const OUT = 'docs/verify';
const SEED = 20260928;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const facts = {};
const gate = {};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await page.addStyleTag({ content: '#mono-share{display:none}' });

/* 格号 → 舞台像素（与渲染层同源） */
const XY = await page.evaluate(async () => {
  const { boardCells } = await import('/src/render/BoardView.ts');
  const { ipos } = await import('/src/render/iso.ts');
  const geo = window.__monoMain.geo;
  const out = {};
  for (const cell of boardCells(geo)) out[cell.index] = ipos(cell.c, cell.r, geo);
  return out;
});

/** 取景框：以 (cx,cy) 为心取 w×h，夹到舞台内（截图不会被空边裁出） */
const clipAt = (index, w, h, dy = 0) => {
  const [x, y] = XY[index];
  const left = Math.max(0, Math.min(390 - w, x - w / 2));
  const top = Math.max(0, Math.min(844 - h, y - h / 2 + dy));
  return { x: Math.round(left), y: Math.round(top), width: Math.round(w), height: Math.round(h) };
};

const shot = (name, clip) => page.screenshot({ path: `${OUT}/${name}`, clip });

/* —— ① 同格 4 人 2×2 方阵（放 4 号商铺：左右邻格分别是 3 号商铺与 5 号机会）—— */
await page.evaluate(() => {
  const m = window.__monoMain;
  for (const p of m.game.state.players) p.pos = 4;
  m.paint();
});
/* 位姿不从状态推：直接量 pass 3（`layers.pieces`）里 4 个棋子的**实际绘制包围盒**
   （proc 画在绝对舞台坐标上，容器本身不动，故取 `getBounds()` 的中心当落位） */
facts.pawns = await page.evaluate(() => {
  const bs = window.__monoMain.stage.layers.pieces.children.map((k) => k.getBounds());
  const cx = bs.map((b) => b.x + b.width / 2);
  const cy = bs.map((b) => b.y + b.height / 2);
  return {
    count: bs.length,
    span: {
      w: Math.round(Math.max(...cx) - Math.min(...cx)),
      h: Math.round(Math.max(...cy) - Math.min(...cy)),
    },
    /** 单枚棋子的绘制尺寸（放大量化口径：主角化目标 ≈ 32px 高） */
    box: { w: Math.round(bs[0].width), h: Math.round(bs[0].height) },
  };
});
await shot('mono-m9-01-pawns-2x2.png', clipAt(4, 150, 130, 10));
await shot('mono-m9-02-pawns-board.png', { x: 0, y: 34, width: 390, height: 372 });
gate.pawns_4 = facts.pawns.count === 4;
/* 2×2：横向一列间距 = pawnGap(19) → 跨度 19；纵向 = pawnRowDy(22) → 22（容差 2px） */
gate.pawns_2x2 = Math.abs(facts.pawns.span.w - 19) <= 2 && Math.abs(facts.pawns.span.h - 22) <= 2;
/* 放大到主角尺寸：静帧高 ≈ 32px（旧口径 0.62 只有 ≈12.4px，故下限 26 即证明已放大） */
gate.pawns_scaled = facts.pawns.box.h >= 26 && facts.pawns.box.w >= 16;

/* —— ② 楼体实时层级：6 号升到 L5、8 号升到 L4（两者当前均为演示 L2/L1）—— */
await page.evaluate(() => {
  const m = window.__monoMain;
  for (const p of m.game.state.players) p.pos = 0;
  const es = m.game.state.estates;
  es[6] = { index: 6, owner: 2, level: 5, processing: false };
  es[8] = { index: 8, owner: 3, level: 4, processing: false };
  m.paint();
});
facts.levels = await page.evaluate(() => {
  const inst = window.__monoMain.scene.instancesOf();
  const walls = inst.filter((i) => /^building\.s\d+\.l[1-5]$/.test(i.id)).map((i) => i.id);
  return { l4: walls.filter((w) => w.endsWith('.l4')).length, l5: walls.filter((w) => w.endsWith('.l5')).length, walls };
});
await shot('mono-m9-03-l4-l5.png', clipAt(7, 170, 190, -20));
await shot('mono-m9-04-l4-l5-board.png', { x: 0, y: 34, width: 390, height: 372 });
gate.live_level_l5 = facts.levels.walls.includes('building.s6.l5');
gate.live_level_l4 = facts.levels.walls.includes('building.s8.l4');
/* 零回归：未售地块仍走演示层级（18 栋） */
gate.demo_kept = facts.levels.l4 === 1 && facts.levels.l5 === 1
  && facts.levels.walls.length === 18;

/* —— ③ 四个新特殊格地砖（9 银行 / 21 乐透 / 23 税务 / 25 医院）—— */
await page.evaluate(() => {
  const m = window.__monoMain;
  m.game.state.estates = {};
  for (const p of m.game.state.players) p.pos = 0;
  m.paint();
});
const SPECIALS = [[9, 'bank', '银行'], [21, 'lottery', '乐透'], [23, 'tax', '税务'], [25, 'hospital', '医院']];
for (const [index, key, cn] of SPECIALS) {
  await shot(`mono-m9-05-special-${key}-${index}.png`, clipAt(index, 110, 120, -8));
  facts[`special_${key}_at_${index}`] = XY[index].map(Math.round);
}
await shot('mono-m9-06-special-board.png', { x: 0, y: 34, width: 390, height: 372 });
gate.special_crops = SPECIALS.every(([i]) => Array.isArray(XY[i]));

/* —— ④ 战报遮挡：浮层（抽卡翻牌）展开 → `#mono-slots` 整块隐藏；关掉 → 回现状 —— */
const slotsDisplay = () => page.evaluate(
  () => getComputedStyle(document.querySelector('#mono-slots')).display,
);
facts.slotsBefore = await slotsDisplay();
await shot('mono-m9-07-slots-idle.png');
await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.phase = 'settled';
  s.lastDraw = { deck: 'fate', cardId: 'fate-01', title: '命运卡', text: '浮层展开时左下战报与右上轮播必须整块让位。' };
  m.paint();
});
facts.slotsOverlay = await slotsDisplay();
await shot('mono-m9-08-overlay-slots-hidden.png');
/* 浮层自身仍要在场（否则「隐藏战报」可能只是浮层没画出来）：关闭键必须可点 */
facts.overlayButtons = await page.evaluate(
  () => document.querySelectorAll('#mono-panels button').length,
);
await page.evaluate(() => {
  const m = window.__monoMain;
  m.game.state.lastDraw = null;
  m.game.state.phase = 'idle';
  m.paint();
});
facts.slotsAfter = await slotsDisplay();
gate.slots_hidden_on_overlay = facts.slotsOverlay === 'none';
gate.slots_restored = facts.slotsBefore !== 'none' && facts.slotsAfter === facts.slotsBefore;
gate.overlay_panel_visible = facts.overlayButtons > 0;

/* —— ⑤ 气泡引文（真实动作；不开 nofx ⇒ 气泡有停留时长）—— */
await page.close();
const live = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
live.on('pageerror', (e) => errors.push(String(e)));
live.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await live.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&humans=4&tour=0`, { waitUntil: 'networkidle' });
await live.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await live.addStyleTag({ content: '#mono-share{display:none}' });
const clickPrimary = async () => {
  await live.evaluate(() => document.querySelector('#mono-hud button[data-primary]')?.click());
  await live.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
  await live.waitForTimeout(40);
};
await clickPrimary();          // roll
await clickPrimary();          // move
/* settle：**不等 fx 结束**（气泡随 fx 收起）——落库后 220ms 单次取证：文案 + 真实包围盒 */
await live.evaluate(() => document.querySelector('#mono-hud button[data-primary]')?.click());
await live.waitForTimeout(220);
facts.bubble = await live.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf().find((i) => i.id === 'ui.bubble');
  /* 气泡在 fxUi 层里是唯一一块 100 宽 × ≈64 高的容器（资产条 94.5 宽但只有 40 高），
     故用宽高两条一起定位，避免误抓 HUD 资产条 */
  const box = (m.stage.layers.fxUi.children ?? [])
    .map((k) => k.getBounds())
    .find((b) => Math.abs(b.width - 100) <= 6 && b.height >= 55 && b.height <= 82);
  return {
    present: Boolean(inst),
    text: inst ? inst.state : null,
    bounds: box
      ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
      : null,
  };
});
await live.screenshot({ path: `${OUT}/mono-m9-09-bubble-quote.png`, clip: { x: 0, y: 34, width: 390, height: 420 } });
gate.bubble_drawn = facts.bubble.present === true;
if (facts.bubble.present) {
  const s = facts.bubble.text ?? {};
  facts.bubbleQuote = s.quote ?? '';
  gate.bubble_has_quote = typeof s.quote === 'string' && s.quote.length > 0;
  /* 气泡不得横向出血（左/右缘各留 ≥ 0px）；`bounds` 缺省（fxUi 层未命中）不判该条 */
  if (facts.bubble.bounds) {
    facts.bubbleEdges = {
      left: facts.bubble.bounds.x,
      right: facts.bubble.bounds.x + facts.bubble.bounds.w,
    };
    gate.bubble_in_stage = facts.bubbleEdges.left >= 0 && facts.bubbleEdges.right <= 390;
  }
}
await live.close();

await browser.close();
gate.noErrors = errors.length === 0;
facts.errors = errors;

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
const failed = Object.entries(gate).filter(([, v]) => !v).map(([k]) => k);
console.log(`\n[m9-shots] ${failed.length === 0 ? 'PASS' : `FAIL(${failed.join(',')})`}`
  + ` · 截图入 ${OUT}/mono-m9-*.png`);
process.exit(failed.length === 0 ? 0 : 1);