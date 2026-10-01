import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M17 手机视口取证（390×844 @dpr2，spec 硬口径「每次功能测试必须用手机浏览视图截图」）。
 *
 * 本轮唯一改动：**角色形象 Q 版化**（1.75 头身，头径 ≈ 总高 57%、大眼宽 ≈ 头宽 28%），
 * 并按新头宽把同格单排间距 19 → 24。本脚本目视验收两件事：
 *   ① 四众 × 三表情总表：直接用**生产绘制器** `proc-pawn.ts` 的 `pawn()` 画一张对照表
 *      （4 列角色 × 3 行表情），确认 Q 版比例与可爱度，且原著特征（金箍·猴耳·虎皮裙 /
 *      长嘴大耳·圆肚 / 络腮胡·蓬发 / 毗卢帽·红袈裟）仍可辨。
 *   ② 真实对局里同格 4 人的 2×2 方阵：间距必须 = `pawnGap 24` / `pawnRowDy 22`。
 *
 * 总表在**清空图层**后的干净底上直出（避免棋盘喧宾夺主）；对局截图重新开页，
 * 保证「总表」不污染真实画面。格号 → 舞台像素经 `boardCells` + `ipos`（与渲染层同源）。
 *
 * MONO_ORIGIN 默认本地 dev（52301）；线上复核可 `MONO_ORIGIN=https://game.joho.cn/tour`。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52301';
const OUT = 'docs/verify';
const SEED = 20260928;
mkdirSync(OUT, { recursive: true });

/** 总表网格（CSS px）：4 列角色 × 3 行表情；`s = 2.6` 时人物约 53px 高 */
const COLS = [56, 144, 232, 320];
const ROWS = [150, 330, 510];
const STYLES = ['wukong', 'bajie', 'wujing', 'sanzang'];
const ALIAS = { wukong: '孙悟空', bajie: '猪八戒', wujing: '沙悟净', sanzang: '唐三藏' };
const MOODS = ['calm', 'happy', 'sad'];
const MOOD_CN = { calm: '平静', happy: '开心', sad: '难过' };

const browser = await chromium.launch();
const errors = [];
const facts = {};
const gate = {};

const open = async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  return p;
};

/* —— ① 四众 × 三表情总表（生产绘制器直出，清空图层后的干净底）—— */
const sheetPage = await open();
facts.sheet = await sheetPage.evaluate(async ({ cols, rows, styles, moods }) => {
  const { pawn } = await import('/src/render/providers/proc-pawn.ts');
  const m = window.__monoMain;
  const L = m.stage.layers;
  const Graphics = L.ground.children[0]?.constructor;
  if (typeof Graphics !== 'function') return { ok: false, why: 'no Graphics' };
  for (const k of ['ground', 'labels', 'pieces', 'fxWorld', 'fxUi']) L[k].removeChildren();
  document.querySelector('#mono-ui')?.remove();
  document.querySelector('#mono-share')?.style.setProperty('display', 'none');
  const back = new Graphics();
  back.rect(0, 0, 390, 844).fill({ color: '#1c2029' });
  L.ground.addChild(back);
  const g = new Graphics();
  for (let i = 0; i < styles.length; i += 1) {
    for (let j = 0; j < moods.length; j += 1) {
      pawn(g, {
        geo: m.geo, box: { w: 12, d: 6, h: 20 }, cx: cols[i], cy: rows[j], s: 2.6,
        params: { style: styles[i] }, state: { owner: i + 1, mood: moods[j], active: false },
      });
    }
  }
  L.ground.addChild(g);
  const b = g.getBounds();
  return { ok: true, bounds: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
}, { cols: COLS, rows: ROWS, styles: STYLES, moods: MOODS });
gate.sheet_drawn = facts.sheet.ok === true;

/* 表头 / 行名 / 原著特征（纯取证标注，不进产品代码） */
await sheetPage.evaluate(({ cols, rows, styles, moods, alias, moodCn }) => {
  const FEAT = {
    wukong: '金箍·猴耳·虎皮裙', bajie: '长嘴大耳·圆肚',
    wujing: '络腮胡·蓬发', sanzang: '毗卢帽·红袈裟',
  };
  const box = document.createElement('div');
  box.id = '__m17_labels';
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;'
    + 'font:600 13px/1.35 system-ui,"PingFang SC",sans-serif;color:#fff;'
    + 'text-shadow:0 0 3px rgba(0,0,0,.95),0 0 6px rgba(0,0,0,.7)';
  const put = (x, y, text, weight, wrap) => {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translateX(-50%);`
      + `font-weight:${weight};text-align:center;`
      + (wrap ? 'width:86px;white-space:normal;font-size:11px;line-height:1.25' : 'white-space:nowrap');
    box.appendChild(s);
  };
  styles.forEach((st, i) => {
    put(cols[i], 22, alias[st], 700, false);
    put(cols[i], 40, FEAT[st], 400, true);
  });
  moods.forEach((md, j) => put(22, rows[j] - 88, moodCn[md], 600));
  const title = document.createElement('div');
  title.textContent = '西游·取经四众 · Q 版形象（1.75 头身）';
  title.style.cssText = 'position:absolute;left:0;right:0;top:0;text-align:center;'
    + 'font:700 14px/24px system-ui,"PingFang SC",sans-serif;color:#fff;'
    + 'background:rgba(255,255,255,.10)';
  box.appendChild(title);
  document.body.appendChild(box);
}, { cols: COLS, rows: ROWS, styles: STYLES, moods: MOODS, alias: ALIAS, moodCn: MOOD_CN });

await sheetPage.screenshot({ path: `${OUT}/mono-m17-01-sheet-4x3.png`, clip: { x: 0, y: 0, width: 390, height: 600 } });
for (let i = 0; i < STYLES.length; i += 1) {
  await sheetPage.screenshot({
    path: `${OUT}/mono-m17-02-closeup-${STYLES[i]}.png`,
    clip: { x: Math.max(0, COLS[i] - 44), y: ROWS[0] - 96, width: 88, height: 110 },
  });
}
await sheetPage.close();

/* —— ② 真实对局：同格 4 人 2×2 方阵（间距应 = pawnGap 24 / pawnRowDy 22）—— */
const page = await open();
await page.addStyleTag({ content: '#mono-share{display:none}' });
await page.evaluate(() => {
  const m = window.__monoMain;
  for (const p of m.game.state.players) p.pos = 4;
  m.paint();
});
/* 位姿不从状态推：直接量 pass 3（`layers.pieces`）里 4 个棋子的实际绘制包围盒 */
facts.pawns = await page.evaluate(() => {
  const bs = window.__monoMain.stage.layers.pieces.children.map((k) => k.getBounds());
  const cx = bs.map((b) => b.x + b.width / 2);
  const cy = bs.map((b) => b.y + b.height / 2);
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width));
  const y1 = Math.max(...bs.map((b) => b.y + b.height));
  return {
    count: bs.length,
    /** 索引 0/1 与 2/3 是同列两排：横向差 = `pawnGap`、纵向差 = `pawnRowDy` */
    gapX: Math.round(cx[1] - cx[0]),
    rowDy: Math.round(Math.abs(cy[2] - cy[0])),
    union: { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) },
    /** 四众绘制尺寸（Q 版口径：头径过半 ⇒ 单枚宽 ≥ 20px、高 ≥ 30px） */
    boxes: bs.map((b) => ({ w: Math.round(b.width), h: Math.round(b.height) })),
  };
});
const U = facts.pawns.union;
const pad = 22;
await page.screenshot({
  path: `${OUT}/mono-m17-03-pawns-2x2.png`,
  clip: {
    x: Math.max(0, U.x - pad), y: Math.max(0, U.y - pad),
    width: Math.min(390, U.w + pad * 2), height: Math.min(844, U.h + pad * 2),
  },
});
gate.pawns_4 = facts.pawns.count === 4;
gate.pawns_gap_24 = Math.abs(facts.pawns.gapX - 24) <= 1;
gate.pawns_row_22 = Math.abs(facts.pawns.rowDy - 22) <= 1;
/* 造型可辨：四众的绘制外接框互不相同（Q 版后头同大，靠耳/帽/尾/发拉开轮廓） */
gate.silhouettes_distinct = new Set(facts.pawns.boxes.map((b) => `${b.w}x${b.h}`)).size === 4;
gate.q_size = facts.pawns.boxes.every((b) => b.w >= 20 && b.h >= 30);

/* —— ③ 手机全屏（整盘观感，棋子分散到四角）—— */
await page.evaluate(() => {
  const m = window.__monoMain;
  m.game.state.estates = {};
  const at = [2, 9, 18, 25];
  m.game.state.players.forEach((p, i) => { p.pos = at[i]; });
  m.paint();
});
await page.screenshot({ path: `${OUT}/mono-m17-04-pawns-board.png`, clip: { x: 0, y: 34, width: 390, height: 420 } });
await page.screenshot({ path: `${OUT}/mono-m17-05-board-full.png` });

await page.close();
await browser.close();
gate.noErrors = errors.length === 0;
facts.errors = errors;

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
const failed = Object.entries(gate).filter(([, v]) => !v).map(([k]) => k);
console.log(`\n[m17-shots] ${failed.length === 0 ? 'PASS' : `FAIL(${failed.join(',')})`}`
  + ` · 截图入 ${OUT}/mono-m17-*.png`);
process.exit(failed.length === 0 ? 0 : 1);