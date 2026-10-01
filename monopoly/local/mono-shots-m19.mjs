import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M19 · 对抗玩法与落子沉浸 专项取证截图。
 *
 * 口径（spec 2026-10-02-monopoly-m19-combat-and-landing-design §3 / §7）：
 *   · 390×844 @dpr2 手机视口（出 780×1688 PNG），入 docs/verify/；
 *   · play 页**真实对局**，走与用户完全相同的 UI 路径（HUD 牌袋键 → 手牌槽 → 棋盘点选），
 *     不绕过 `#mono-pick` 命中层，不直接调 core API；
 *   · 确定性：开局无「对手成楼商家格」⇒ 拆迁键默认不可点，故先给当前真人手上补一张
 *     「拆迁令」、在 SHOP_TILE（13）安置一栋对手楼（level 1），再开抽屉 / 点卡 / 点格；
 *   · 截图项（3 张）：
 *       ① 手牌抽屉 6 槽（含「拆迁令」）
 *       ② 点「拆迁令」进入选目标态（候选格高亮 + 预演条 + 取消键）
 *       ③ 拆迁令命中后（目标格归无主 + 破坏表现：旧楼层幽灵下沉 + 碎屑）
 *     ⚠ 第 ③ 项要看破坏表现，故那一页**不加 `nofx=1`**（走真实动效）。
 *
 * 机器闸门（确定性，全 true 才 PASS）：
 *   ① hand_six_slots / demolish_enabled；
 *   ② ui_sel_demolish / candidates_present / target_intact_before_pick / cancel_key_present；
 *   ③ wreck_target_cleared / ui_sel_cleared。
 *   另打印 facts（含第 ③ 项是否抢到 fx.busy 中途帧），仅作记录、不进闸门。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour/').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const SHOP_TILE = 13;                       // 右侧边中段 shop 格（TILE_TYPES[13] === 'shop'）
const VIEW = { width: 390, height: 844 };

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页：手机视口 390×844 @dpr2；nofx = 是否关闭动效（第 ③ 项需保留动效） */
const openPage = async (nofx) => {
  const p = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  watch(p);
  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}${nofx ? '&nofx=1' : ''}&humans=4&tour=0`;
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  return p;
};

/** 确定性布置：补「拆迁令」+ 在 SHOP_TILE 放一栋对手楼（照抄 e2e 的 setup 口径） */
const setup = (p) => p.evaluate((tile) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  const foe = s.players.find((pl) => pl.id !== me.id)?.id ?? (me.id % 4) + 1;
  const hand = s.hands[me.id - 1];
  if (!hand.includes('demolish')) hand.push('demolish');
  s.estates[tile] = { index: tile, owner: foe, level: 1, processing: false };
  m.paint();
  return { me: me.id, foe, hand: hand.slice() };
}, SHOP_TILE);

/** 读关键状态（含命中层可点性 / 选目标态 / 候选高亮数 / 取消键） */
const readState = (p) => p.evaluate((tile) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  const btn = document.querySelector('#mono-panels button[data-action="card:demolish"]');
  const cancel = document.querySelector('#mono-panels button[data-action="card:cancel"]');
  const cands = m.scene.instancesOf().filter((i) => i.id === 'board.tile.candidate').length;
  return {
    hand: (s.hands[me.id - 1] ?? []).slice(),
    uiSel: m.uiSel(),
    candidates: cands,
    estateAtTile: Boolean(s.estates[tile]),
    demolishButton: btn ? !btn.disabled : null,
    cancelButton: Boolean(cancel),
  };
}, SHOP_TILE);

/* ============ 页面 A（nofx=1）：① 手牌 6 槽 ② 选目标态 ============ */
const a = await openPage(true);
facts.setup = await setup(a);
await a.waitForTimeout(150);

/* ① 展开手牌抽屉（HUD 牌袋键）→ 出 6 个槽 */
await a.locator('#mono-hud button[data-action="hand"]').click();
await a.waitForTimeout(120);
let st = await readState(a);
gate.hand_six_slots = st.hand.length === 6 && st.hand.includes('demolish');
gate.demolish_enabled = st.demolishButton === true;
await a.screenshot({ path: `${OUT}/mono-m19-01-hand-6.png` });

/* ② 点「拆迁令」→ 进入选目标态（不立即 dispatch） */
await a.locator('#mono-panels button[data-action="card:demolish"]').click();
await a.waitForTimeout(150);
st = await readState(a);
gate.ui_sel_demolish = st.uiSel !== null && st.uiSel.kind === 'demolish';
gate.candidates_present = st.candidates > 0;
gate.target_intact_before_pick = st.estateAtTile === true;
gate.cancel_key_present = st.cancelButton === true;
facts.select = { uiSel: st.uiSel, candidates: st.candidates };
await a.screenshot({ path: `${OUT}/mono-m19-02-select-target.png` });
await a.close();

/* ============ 页面 B（去掉 nofx=1）：③ 拆迁命中 + 破坏表现 ============ */
const b = await openPage(false);
await setup(b);
await b.waitForTimeout(150);
await b.locator('#mono-hud button[data-action="hand"]').click();
await b.waitForTimeout(120);
await b.locator('#mono-panels button[data-action="card:demolish"]').click();
await b.waitForFunction(() => window.__monoMain.uiSel() !== null, null, { timeout: 5000 });

/* 格号 → 舞台逻辑坐标 → 页面 CSS 坐标（照抄 e2e：按 `#mono-ui` 放映矩形求缩放比） */
const pt = await b.evaluate((tile) => {
  const m = window.__monoMain;
  const p = m.cellXY(tile);
  const rect = document.getElementById('mono-ui').getBoundingClientRect();
  const k = rect.width / 390;
  return { x: rect.left + p.x * k, y: rect.top + p.y * k, stage: p, k };
}, SHOP_TILE);
facts.click = pt;
await b.mouse.click(pt.x, pt.y);

/* 抢在破坏动画中途截图：先等 fx.busy() 为真，再让下沉/碎屑推进约 200ms（wreck 整段 520ms） */
const sawFx = await b.waitForFunction(() => window.__monoMain.fx?.busy?.(), null, { timeout: 3000 })
  .then(() => true).catch(() => false);
facts.wreck_fx_busy = sawFx;
if (sawFx) await b.waitForTimeout(200);
await b.screenshot({ path: `${OUT}/mono-m19-03-wreck-hit.png` });
await b.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});

st = await readState(b);
gate.wreck_target_cleared = st.estateAtTile === false;
gate.ui_sel_cleared = st.uiSel === null;
facts.afterPick = { estateAtTile: st.estateAtTile, uiSel: st.uiSel };
await b.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m19-shots] gate:', JSON.stringify(gate));
console.log('[m19-shots] facts:', JSON.stringify(facts));
console.log('[m19-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m19-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m19-shots] PASS');