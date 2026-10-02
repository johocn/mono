import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.3-A · 手牌排序与道具商店取证截图（spec §7：手机视口 390×844 @dpr2，出 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m20-2.mjs 同源：真实对局 + 真实 HUD / 浮层点击（不绕过命中层）。
 *   ① mono-m20-3-01-hand-sorted：手牌行（三键排序：持有在前 → 常用在前 → 表序兜底；未持有淡显在右）
 *   ② mono-m20-3-02-store-panel：道具商店浮层（6 目录行 + 4 详情行 + 买入 / 卖出 / 关闭）
 *   ③ mono-m20-3-03-store-bought：真实点击「炸弹」行 + 买入 → 现金 −300、手牌新增炸弹
 *   ④ mono-m20-3-04-store-sold：真实点击「卖出」→ 回收 ￥150 到账、手牌移出炸弹
 *
 * 机器闸门（全 true 才 PASS）：hand_slots / hand_row_fits / store_open / store_rows / store_badge /
 *   store_buttons / buy_cash / buy_hand / sell_cash / sell_hand。
 *
 * MONO_ORIGIN 默认打本地预览；线上：$env:MONO_ORIGIN='https://game.joho.cn/tour/'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52302').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
/** `ITEM_CARDS.length`（本里程碑 6 种；M20.3-B 追加两种后自动变 8） */
const CARD_KINDS = 6;
/** 商店右列详情行数（spec §5.4：用途 / 售价与回收 / 持有 / 现金） */
const DETAIL_LINES = 4;
const BOMB = 300;
const BOMB_RESALE = 150;

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页：手机视口 390×844 @dpr2，nofx=1（均为静态浮层，不需要动效） */
const openPage = async () => {
  const p = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  watch(p);
  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`;
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  return p;
};

/** 实例计数（可见元素）：scene.instancesOf() 的 id 计数 */
const countIds = (p) => p.evaluate(() => {
  const list = window.__monoMain.scene.instancesOf();
  const c = {};
  for (const i of list) c[i.id] = (c[i.id] ?? 0) + 1;
  return c;
});

/** 当前玩家手牌与现金快照 */
const snap = (p) => p.evaluate(() => {
  const s = window.__monoMain.game.state;
  const me = s.players[s.current];
  return { cash: me.cash, hand: (s.hands[s.current] ?? []).slice(), lastEvent: s.lastEvent ?? null };
});

/* ============ 页面 A：① 手牌排序 / ② 商店浮层 / ③ 买入后 / ④ 卖出后 ============ */
const a = await openPage();

/* ① 手牌行：玩家 0 持 3 张（pardon / bomb / teleport），其余 3 张未持有淡显在右 */
facts.setupHand = await a.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.current = 0;
  s.phase = 'idle';
  s.hands[0] = ['pardon', 'bomb', 'teleport'];
  m.paint();
  return { hand: s.hands[0].slice() };
});
await a.locator('#mono-hud button[data-action="hand"]').click();
await a.waitForTimeout(120);
const idsHand = await countIds(a);
facts.hand = {
  ids: {
    handSlot: idsHand['ui.handSlot'] ?? 0,
    handBar: idsHand['ui.handBar'] ?? 0,
    bankRow: idsHand['ui.bankRow'] ?? 0,
  },
  scroll: await a.evaluate(() => window.__monoMain.handScroll()),
};
gate.hand_slots = facts.hand.ids.handSlot === CARD_KINDS;
/* 6 张 × 55px + 5 × 6px 间隙 = 360 ≤ 390 → 恰好一屏：无滑动条、滚动量恒 0 */
gate.hand_row_fits = facts.hand.ids.handBar === 0 && facts.hand.scroll === 0;
await a.screenshot({ path: `${OUT}/mono-m20-3-01-hand-sorted.png` });

/* ② 商店浮层：直接开面板取景（选中「炸弹」行） */
facts.setupStore = await a.evaluate((bomb) => {
  const m = window.__monoMain;
  m.setStore(true, 'bomb');
  return { sel: bomb === 'bomb' };
}, 'bomb');
await a.waitForTimeout(120);
const idsStore = await countIds(a);
const storeUi = await a.evaluate(() => window.__monoMain.store());
facts.store = {
  ui: storeUi,
  ids: {
    bankRow: idsStore['ui.bankRow'] ?? 0,
    panel: idsStore['showcase.panel'] ?? 0,
    badge: idsStore['ui.badge'] ?? 0,
    primary: idsStore['ui.button.primary'] ?? 0,
    secondary: idsStore['ui.button.secondary'] ?? 0,
    handSlot: idsStore['ui.handSlot'] ?? 0,
  },
};
gate.store_open = facts.store.ui.open === true && facts.store.ui.sel === 'bomb';
gate.store_rows = facts.store.ids.bankRow === CARD_KINDS + DETAIL_LINES;
gate.store_badge = facts.store.ids.badge === 1 && facts.store.ids.panel === 1;
/* 命中层：6 行 `store:select`（`data-target` = kind，顺序恒等目录）+ 买 / 卖 / 关闭各 1；
   浮层展开时手牌行的 DOM 键位全部撤下（`panelHitAreas` 的浮层分支互斥） */
facts.storeDom = await a.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('#mono-panels button[data-action]'));
  const store = btns.filter((b) => (b.dataset.action ?? '').startsWith('store:'));
  const count = (action) => store.filter((b) => b.dataset.action === action).length;
  return {
    total: store.length,
    select: count('store:select'),
    buy: count('store:buy'),
    sell: count('store:sell'),
    close: count('store:close'),
    other: btns.length - store.length,
  };
});
gate.store_buttons = facts.storeDom.select === CARD_KINDS && facts.storeDom.buy === 1
  && facts.storeDom.sell === 1 && facts.storeDom.close === 1 && facts.storeDom.other === 0;
await a.screenshot({ path: `${OUT}/mono-m20-3-02-store-panel.png` });

/* ③ 买入：真实点击「炸弹」目录行 → 买入键（现金 1000 → 700，手牌新增 bomb） */
facts.setupBuy = await a.evaluate(() => {
  const s = window.__monoMain.game.state;
  s.players[s.current].cash = 1000;
  s.hands[0] = ['barrier'];
  window.__monoMain.paint();
  return { cash: s.players[s.current].cash, hand: s.hands[0].slice() };
});
await a.locator('#mono-panels button[data-action="store:select"][data-target="bomb"]').click();
await a.locator('#mono-panels button[data-action="store:buy"]').click();
await a.waitForTimeout(120);
facts.bought = await snap(a);
const idsBought = await countIds(a);
gate.buy_cash = facts.bought.cash === 1000 - BOMB;
gate.buy_hand = facts.bought.hand.includes('bomb')
  && facts.bought.lastEvent?.kind === 'item-shop' && facts.bought.lastEvent.action === 'buy'
  && facts.bought.lastEvent.card === 'bomb' && facts.bought.lastEvent.price === BOMB
  && (idsBought['ui.bankRow'] ?? 0) === CARD_KINDS + DETAIL_LINES;   // 面板仍开着（非模态）
await a.screenshot({ path: `${OUT}/mono-m20-3-03-store-bought.png` });

/* ④ 卖出：真实点击卖出键（回收 ￥150 到账，手牌移出 bomb） */
await a.locator('#mono-panels button[data-action="store:sell"]').click();
await a.waitForTimeout(120);
facts.sold = await snap(a);
gate.sell_cash = facts.sold.cash === 1000 - BOMB + BOMB_RESALE;
gate.sell_hand = !facts.sold.hand.includes('bomb')
  && facts.sold.lastEvent?.kind === 'item-shop' && facts.sold.lastEvent.action === 'sell'
  && facts.sold.lastEvent.card === 'bomb' && facts.sold.lastEvent.price === BOMB_RESALE;
await a.screenshot({ path: `${OUT}/mono-m20-3-04-store-sold.png` });
await a.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-3-shots] gate:', JSON.stringify(gate));
console.log('[m20-3-shots] facts:', JSON.stringify(facts));
console.log('[m20-3-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-3-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-3-shots] PASS');
