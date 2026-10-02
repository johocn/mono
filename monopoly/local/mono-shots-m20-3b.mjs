import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.3-B · 股票轨取证截图（spec §6 手机视口 390×844 @dpr2 → 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m20-3.mjs / mono-shots-m19.mjs 同源：**真实对局 + 真实 HUD / 浮层点击**，
 * 不绕过 `#mono-panels` / `#mono-hud` 命中层（唯一例外：手牌横滑用 `__monoMain.setHandScroll`
 * 直接定位——这是 M20.3-A 就登记好的取证 API，等价于用户拖到最右）。
 *   · 停格走「真实掷骰 + 反推起点」：`pos = (19 − 点数) mod 32` → `moveCurrent` → `settleCurrent`
 *     （与 mono-shots-m5.mjs 的股票盘取证同法，seed 固定故点数固定）。
 *   · 截图 4 张：
 *       ① mono-m20-3b-01-stock-panel   股票浮层 A：逐行选中（SY02 高亮）+ 买三档 / 卖三档
 *       ② mono-m20-3b-02-leverage      第 8 轮起解锁杠杆分段（无 / 2× / 3×，选中 2×）+ 2× 买 5 手后
 *                                     走势图角标出现「借款 ￥N」
 *       ③ mono-m20-3b-03-bullbear      涨跌卡浮层（押跌 + 4 行标的 + 取消）
 *       ④ mono-m20-3b-04-dividend      红利卡结算后：手牌横滑到最右，红利卡槽转「未持有」淡显、现金到账
 *
 * 机器闸门（确定性，全 true 才 PASS）：见文件末尾 `gate` 的逐项含义。
 *
 * MONO_ORIGIN 默认打本地预览（`npm run preview` 的 52302）；线上：$env:MONO_ORIGIN='https://game.joho.cn/tour/'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52302').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const STOCK_TILE = 19;                 // `TILE_TYPES[19] === 'stock'`（`STOCK_TILE_INDEX`）
const TIER_LOT = 5;                    // 「买 5 手」= 5 股（`SHARE_LOT = 1`）
const LEV = 2;                         // 杠杆取证选的倍数
const UNLOCK_ROUND = 8;                // `MARGIN_UNLOCK_ROUND`
const DIVIDEND_PER_SHARE = 20;         // `DIVIDEND_PER_SHARE`

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页：手机视口 390×844 @dpr2，nofx=1（全是静态浮层取证，不需要动效） */
const openPage = async () => {
  const p = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  watch(p);
  await p.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  return p;
};

/**
 * 让 0 号玩家真实停到股票交易所（19 号格）→ 盘面常开（settled + pos === 19）。
 *
 * 坑：`moveCurrent` 的实际步数 = `dice.total + 技能「筋斗云」stepBonus`（座 0 = 悟空 → +1），
 * 直接按 `(tile − dice.total)` 反推起点会**多走一格**（实测落到 20 号格）。
 * 故先做一次「探步」把技能加成量出来：起点归零 → 真实掷骰 + 前进 → 落点即 `total + stepBonus`；
 * 探步距离 < 32 不会绕圈、开局无路障，故不会污染探步结果。探完**手动回 `idle`**
 * （不调 `settleCurrent`，避免误触拍卖 / 买地弹窗），再按真实步数反推起点正式落地。
 */
const landOnStock = (p) => p.evaluate((tile) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const RING = 32;
  if (s.phase !== 'idle') m.game.endTurn();
  s.current = 0;
  s.jail[0] = 0;
  /* 探步：量出含技能加成的实际步数 → 反推技能加成 `bonus` */
  s.players[0].pos = 0;
  const r0 = m.game.rollDice();
  m.game.moveCurrent();
  const bonus = s.players[0].pos - r0.total;
  s.phase = 'idle';
  /* 正式落地：起点 = 目标格 − （本次点数 + 技能加成），真实前进恰好停到目标格 */
  const r1 = m.game.rollDice();
  const steps = r1.total + bonus;
  s.players[0].pos = (((tile - steps) % RING) + RING) % RING;
  m.game.moveCurrent();
  const settle = m.game.settleCurrent();
  m.paint();
  return { bonus, steps, settle: settle.kind, pos: s.players[0].pos, phase: s.phase, round: s.round };
}, STOCK_TILE);

/** 命中层按钮快照：`action` 精确匹配，返回 `{ target, disabled }[]`（DOM 顺序 = `panelHitAreas` 产出顺序） */
const hitBtns = (p, action) => p.evaluate((a) => {
  return Array.from(document.querySelectorAll(`#mono-panels button[data-action="${a}"]`))
    .map((b) => ({ target: b.dataset.target ?? null, disabled: b.disabled }));
}, action);

/** 实例计数（`scene.instancesOf()` 按 id 计数） */
const countIds = (p) => p.evaluate(() => {
  const c = {};
  for (const i of window.__monoMain.scene.instancesOf()) c[i.id] = (c[i.id] ?? 0) + 1;
  return c;
});

/* ============ 页面 A：① 股票浮层 A（选中行 + 三档）② 杠杆分段 ============ */
const a = await openPage();
facts.land = await landOnStock(a);
await a.waitForTimeout(150);

/* ① 逐行选中：点第 2 行（温泉文旅 SY02）→ 恰一行 `selected`，走势图跟随该标的 */
await a.locator('#mono-panels button[data-action="stock:select"][data-target="SY02"]').click();
await a.waitForTimeout(120);
const idsA = await countIds(a);
facts.panel = await a.evaluate(() => {
  const inst = window.__monoMain.scene.instancesOf();
  const rows = inst.filter((i) => i.id === 'ui.stockRow');
  const chart = inst.find((i) => i.id === 'ui.stockChart');
  const labels = (id) => inst.filter((i) => i.id === id).map((i) => i.state?.label ?? null);
  return {
    ui: window.__monoMain.stock(),
    rows: rows.length,
    selected: rows.filter((r) => r.state?.selected === true).map((r) => r.state?.code),
    chartLabel: chart?.state?.label ?? null,
    buyLabels: labels('ui.tradeBuy'),
    sellLabels: labels('ui.tradeSell'),
    bankRow: inst.filter((i) => i.id === 'ui.bankRow').length,
  };
});
facts.panelBtns = {
  select: await hitBtns(a, 'stock:select'),
  buy: await hitBtns(a, 'stock:buy'),
  sell: await hitBtns(a, 'stock:sell'),
  levRound1: await hitBtns(a, 'stock:lev'),      // 第 1 轮：整段不产出
};
gate.stock_rows = facts.panel.rows === 4 && facts.panel.selected.join(',') === 'SY02';
gate.stock_chart_follows = String(facts.panel.chartLabel).startsWith('SY02 走势');
gate.stock_tiers = facts.panelBtns.buy.length === 3 && facts.panelBtns.sell.length === 3
  && facts.panelBtns.buy.every((b) => !b.disabled)                 // 现金 ￥3000 足买最低档
  && facts.panelBtns.sell.every((b) => b.disabled)                 // 持股 0 → 卖三档全禁用
  && facts.panelBtns.buy.map((b) => b.target).join(',') === 'SY02:1,SY02:5,SY02:all'
  && new Set(facts.panel.buyLabels).size === 3 && new Set(facts.panel.sellLabels).size === 3;
gate.stock_lev_locked = facts.panelBtns.levRound1.length === 0;    // 第 1 轮不产出杠杆分段（B-D9）
gate.overlay_panel = (idsA['showcase.panelStock'] ?? 0) === 1;     // 底板换 370×330 的加高版
await a.screenshot({ path: `${OUT}/mono-m20-3b-01-stock-panel.png` });

/* ② 第 8 轮起解锁杠杆：选中 2× → 真实点「买 5 手」（自有资金 = ⌈成本/2⌉，其余记保证金借款） */
await a.evaluate((round) => {
  const m = window.__monoMain;
  m.game.state.round = round;
  m.paint();
}, UNLOCK_ROUND);
await a.waitForTimeout(120);
facts.levBtns = await hitBtns(a, 'stock:lev');
await a.locator('#mono-panels button[data-action="stock:lev"][data-target="2"]').click();
await a.waitForTimeout(60);
await a.locator('#mono-panels button[data-action="stock:buy"][data-target="SY02:5"]').click();
await a.waitForTimeout(150);
facts.lev = await a.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const p = s.players[0];
  const chart = m.scene.instancesOf().find((i) => i.id === 'ui.stockChart');
  const h = s.portfolios[0]?.SY02 ?? null;
  return {
    ui: m.stock(),
    shares: h?.shares ?? 0,
    cost: h?.cost ?? 0,
    price: s.quotes.SY02,
    cash: p.cash,
    margin: p.margin?.principal ?? 0,
    chartLabel: chart?.state?.label ?? null,
    buyBtns: Array.from(document.querySelectorAll('#mono-panels button[data-action="stock:buy"]'))
      .map((b) => ({ target: b.dataset.target, disabled: b.disabled })),
  };
});
gate.lev_unlocked = facts.levBtns.length === 3 && facts.levBtns.every((b) => !b.disabled);
gate.lev_selected = facts.lev.ui.lev === LEV;
gate.lev_buy_split = facts.lev.price === 80
  && facts.lev.shares === TIER_LOT                                        // 「买 5 手」= 5 股
  && facts.lev.cost === facts.lev.price * TIER_LOT / LEV                  // 自有资金 = ⌈成本/倍数⌉（成本整除）
  && facts.lev.margin === facts.lev.price * TIER_LOT - facts.lev.cost     // 余额记保证金借款（B-D8）
  && facts.lev.cash === 3000 - facts.lev.cost;                            // 现金只扣自有资金那部分
gate.lev_chart_debt = String(facts.lev.chartLabel).includes(`借款 ￥${facts.lev.margin}`);
await a.screenshot({ path: `${OUT}/mono-m20-3b-02-leverage.png` });
await a.close();

/* ============ 页面 B：③ 涨跌卡浮层 ============ */
const b = await openPage();
/* 真实路径：HUD 牌袋键开抽屉 → 点「涨跌卡」槽（第 7 槽，scroll=0 时可见）→ 浮层展开 */
await b.locator('#mono-hud button[data-action="hand"]').click();
await b.waitForTimeout(120);
await b.locator('#mono-panels button[data-action="card:bullBear"]').click();
await b.waitForTimeout(120);
/* 收起抽屉：浮层底板（300..600）与手牌行（550..602）台位重叠，取景时只留浮层 */
await b.locator('#mono-hud button[data-action="hand"]').click();
await b.waitForTimeout(120);
await b.locator('#mono-panels button[data-action="bullbear:dir"][data-target="down"]').click();
await b.waitForTimeout(120);
facts.bullbear = await b.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf();
  return {
    ui: m.bullbear(),
    badge: inst.find((i) => i.id === 'ui.badge')?.state?.text ?? null,
    rows: inst.filter((i) => i.id === 'ui.stockRow').length,
    qkLabels: inst.filter((i) => i.id === 'ui.qk').map((i) => i.state?.label ?? null),
    handSlots: inst.filter((i) => i.id === 'ui.handSlot').length,
    dirs: document.querySelectorAll('#mono-panels button[data-action="bullbear:dir"]').length,
    picks: Array.from(document.querySelectorAll('#mono-panels button[data-action="bullbear:pick"]'))
      .map((x) => x.dataset.target),
    cancel: document.querySelectorAll('#mono-panels button[data-action="bullbear:cancel"]').length,
  };
});
gate.bullbear_open = facts.bullbear.ui.open === true && facts.bullbear.ui.dir === 'down';
gate.bullbear_panel = facts.bullbear.badge === '涨跌卡' && facts.bullbear.rows === 4
  && facts.bullbear.dirs === 2 && facts.bullbear.cancel === 1
  && facts.bullbear.picks.join(',') === 'SY01,SY02,SY03,SY04'
  && facts.bullbear.qkLabels.includes('押涨') && facts.bullbear.qkLabels.includes('押跌')
  && facts.bullbear.qkLabels.includes('取消') && facts.bullbear.handSlots === 0;
await b.screenshot({ path: `${OUT}/mono-m20-3b-03-bullbear.png` });

/* 点标的行即成交：押跌 SY02 → 强制方向表落 `dir = -1`、手牌移出涨跌卡、浮层收起 */
await b.locator('#mono-panels button[data-action="bullbear:pick"][data-target="SY02"]').click();
await b.waitForTimeout(150);
facts.bullbearPick = await b.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  return {
    open: m.bullbear().open,
    force: s.stockForce[0] ?? null,
    held: s.hands[0].includes('bullBear'),
    last: s.lastEvent ?? null,
  };
});
gate.bullbear_play = facts.bullbearPick.force?.code === 'SY02' && facts.bullbearPick.force?.dir === -1
  && facts.bullbearPick.held === false && facts.bullbearPick.open === false
  && facts.bullbearPick.last?.kind === 'card' && facts.bullbearPick.last?.card === 'bullBear';
await b.close();

/* ============ 页面 C：④ 红利卡结算（有持仓·按股分红） ============ */
const c = await openPage();
facts.c = { land: await landOnStock(c) };
await c.waitForTimeout(150);
/* 真实点「选中 SY01」+「买全仓」（第 1 轮现金 ￥3000 / SY01 ￥120 → 25 股，现金归零）为分红攒持仓 */
await c.locator('#mono-panels button[data-action="stock:select"][data-target="SY01"]').click();
await c.waitForTimeout(60);
await c.locator('#mono-panels button[data-action="stock:buy"][data-target="SY01:all"]').click();
await c.waitForTimeout(120);
facts.dividend = await c.evaluate(() => {
  const s = window.__monoMain.game.state;
  return {
    shares: Object.values(s.portfolios[0]).reduce((n, h) => n + h.shares, 0),
    cash: s.players[0].cash,
    held: s.hands[0].includes('dividend'),
  };
});
gate.dividend_holding = facts.dividend.shares > TIER_LOT && facts.dividend.held === true;

/* 离场（股票盘只在 19 号格 settled 时常开）→ 开抽屉 → 横滑到最右（红利卡是第 8 槽）→ 点卡即结算 */
await c.evaluate(() => {
  const m = window.__monoMain;
  m.game.endTurn();
  m.game.state.current = 0;
  m.paint();
});
await c.locator('#mono-hud button[data-action="hand"]').click();
await c.waitForTimeout(120);
await c.evaluate(() => window.__monoMain.setHandScroll(999));
await c.waitForTimeout(120);
facts.dividendScroll = await c.evaluate(() => window.__monoMain.handScroll());
const cashBefore = await c.evaluate(() => window.__monoMain.game.state.players[0].cash);
await c.locator('#mono-panels button[data-action="card:dividend"]').click();
await c.waitForTimeout(150);
facts.dividendAfter = await c.evaluate(() => {
  const s = window.__monoMain.game.state;
  return {
    cash: s.players[0].cash,
    held: s.hands[0].includes('dividend'),
    last: s.lastEvent ?? null,
    slots: window.__monoMain.scene.instancesOf().filter((i) => i.id === 'ui.handSlot').length,
  };
});
facts.dividendAfter.gain = facts.dividendAfter.cash - cashBefore;
gate.dividend_paid = facts.dividendScroll > 0
  && facts.dividendAfter.gain === facts.dividend.shares * DIVIDEND_PER_SHARE
  && facts.dividendAfter.held === false
  && facts.dividendAfter.last?.kind === 'card' && facts.dividendAfter.last?.card === 'dividend';
await c.screenshot({ path: `${OUT}/mono-m20-3b-04-dividend.png` });
await c.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-3b-shots] gate:', JSON.stringify(gate));
console.log('[m20-3b-shots] facts:', JSON.stringify(facts));
console.log('[m20-3b-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-3b-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-3b-shots] PASS');
