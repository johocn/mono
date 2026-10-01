import { chromium } from 'playwright';

/*
 * M19 Task 7b · 选目标交互 e2e（main 命中层 `#mono-pick` + `uiSel` 接线）。
 *
 * 与 `local/mono-e2e-playthrough.mjs` 同口径：真实页面 + 真实鼠标点击，全程走 UI 命中层。
 * 流程（契约要求）：
 *   开局 → 展开手牌抽屉（HUD 牌袋键）→ 点「拆迁令」`card:demolish`
 *   → 断言 `__monoMain.uiSel()` 非空（进入选目标态，未立即 dispatch）
 *   → 用 `__monoMain.cellXY(候选格号)` 取棋盘格中心（舞台逻辑坐标），
 *     按 `#mono-ui` 放映矩形换算为页面 CSS 坐标后 `page.mouse.click`
 *   → 断言该格 estate 消失 且 `uiSel()` 为 null。
 *
 * 为确定性（开局无「对手已成楼的商家格」，拆迁键默认不可点）：
 * 进站后直接给当前真人手上补一张「拆迁令」、在 SHOP_TILE 上安置一栋对手楼（estate），
 * 再**走与用户完全相同的 UI 路径**（牌袋键 → 手牌槽 → 棋盘点选），不绕过命中层。
 *
 * 成功打印 OK 并 exit 0；失败打印原因 path 并 exit 1。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const SEED = 20260928;
const SHOP_TILE = 13;                       // 右侧边中段 shop 格（TILE_TYPES[13] === 'shop'）
const VIEW = { width: 390, height: 844 };
const WALL_MS = 60000;

const errors = [];
const facts = {};
const browser = await chromium.launch();
let page;
let fatal = null;

/** 读关键状态（含命中层可点性与选目标态） */
const readState = () => page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const demolish = document.querySelector('#mono-panels button[data-action="card:demolish"]');
  return {
    phase: s.phase,
    over: s.over,
    current: s.current,
    hands: s.hands.map((h) => h.slice()),
    estates: Object.keys(s.estates).map((k) => [Number(k), s.estates[k].owner, s.estates[k].level]),
    uiSel: m.uiSel(),
    demolishEnabled: demolish ? !demolish.disabled : null,
  };
});

try {
  page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`;
  facts.url = url;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

  /* 确定性布置：补「拆迁令」+ 在 SHOP_TILE 放一栋对手楼 */
  facts.setup = await page.evaluate((tile) => {
    const m = window.__monoMain;
    const s = m.game.state;
    const me = s.players[s.current];
    const foe = s.players.find((p) => p.id !== me.id)?.id ?? (me.id % 4) + 1;
    const hand = s.hands[me.id - 1];
    if (!hand.includes('demolish')) hand.push('demolish');
    s.estates[tile] = { index: tile, owner: foe, level: 1, processing: false };
    m.paint();
    return { me: me.id, foe, hand: hand.slice(), estate: s.estates[tile] };
  }, SHOP_TILE);

  /* ① 展开手牌抽屉（HUD 牌袋键；真实点击会派发 pointerdown） */
  await page.locator('#mono-hud button[data-action="hand"]').click();
  await page.waitForTimeout(30);
  const opened = await readState();
  facts.afterDrawer = { demolishEnabled: opened.demolishEnabled };
  if (opened.demolishEnabled !== true) throw new Error('抽屉展开后「拆迁令」键仍不可点（enabled !== true）');

  /* ② 点「拆迁令」→ 进入选目标态（不应立刻 dispatch / 夷平） */
  await page.locator('#mono-panels button[data-action="card:demolish"]').click();
  await page.waitForTimeout(30);
  const sel = await readState();
  const estateStillThere = sel.estates.some((e) => e[0] === SHOP_TILE);
  facts.afterDemolish = { uiSel: sel.uiSel, estateStillThere };
  if (!sel.uiSel || sel.uiSel.kind !== 'demolish') {
    throw new Error(`点击「拆迁令」后未进入选目标态：uiSel=${JSON.stringify(sel.uiSel)}`);
  }
  if (!estateStillThere) throw new Error('进入选目标态即已夷平（应等待玩家点选目标格）');

  /* ③ 格号 → 舞台逻辑坐标 → 页面 CSS 坐标（按 `#mono-ui` 放映矩形求缩放比） */
  const pt = await page.evaluate((tile) => {
    const m = window.__monoMain;
    const p = m.cellXY(tile);
    const rect = document.getElementById('mono-ui').getBoundingClientRect();
    const k = rect.width / 390;                 // 逻辑宽 390，与 main.ts 命中层换算同口径
    return { x: rect.left + p.x * k, y: rect.top + p.y * k, stage: p, k };
  }, SHOP_TILE);
  facts.click = pt;

  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(40);

  const done = await readState();
  const estateGone = !done.estates.some((e) => e[0] === SHOP_TILE);
  facts.afterPick = { uiSel: done.uiSel, estateGone };
  if (done.uiSel !== null) throw new Error(`点选候选格后 uiSel 未清空：${JSON.stringify(done.uiSel)}`);
  if (!estateGone) throw new Error(`点选候选格后该格 estate 仍在：${JSON.stringify(done.estates)}`);

  facts.elapsedMs = Date.now() - t0;
  if (Date.now() - t0 > WALL_MS) throw new Error(`墙钟超时 ${WALL_MS}ms`);
} catch (e) {
  fatal = e;
} finally {
  if (errors.length) facts.errors = errors;
}

await browser.close();

facts.problems = fatal ? [String(fatal && fatal.stack ? fatal.stack : fatal)] : [];
console.log(JSON.stringify(facts, null, 2));

if (fatal || errors.length) {
  const why = fatal ? (fatal.message ?? String(fatal)) : `page errors=${errors.length}`;
  console.error(`\n[e2e:m19-select] FAIL · ${why}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);