import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.4 · 公共设施入股 + 每轮新闻取证截图（spec §6 手机视口 390×844 @dpr2 → 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m20-3b.mjs / mono-shots-m20-3.mjs 同源：**真实对局 + 真实 HUD / 浮层点击**，
 * 不绕过 `#mono-panels` / `#mono-hud` 命中层。唯一例外：新闻条两态与轮末分红用 `__monoMain`
 * 直接改 `state.news` / `state.facilityCashflow` 并调 `game.endTurn()` 触发轮末（等价于「轮到第 4 位
 * 真人结束回合、跨过起点线」的真实轮末收口），因为新闻按固定表 + 独立 rng 流复现、无法按键指定。
 *
 * 截图 5 张（③ 利好 / 利空各一张）：
 *   ① mono-m20-4-01-facility.png     设施浮层（默认选中「鹿乡银行」，5 行 + 两枚认购键 + 关闭）
 *   ② mono-m20-4-02-subscribed.png   认购 1 股后详情（已售 1/20 · 你的持股 1 股 · 预估分红 ￥10/轮）
 *   ③ mono-m20-4-03-news-good.png    新闻条 · 利好（金底「利好 · 鹿乡银行揽储大增，股东分红看涨」×1.5）
 *      mono-m20-4-03-news-bad.png    新闻条 · 利空（灰底「利空 · 银行坏账暴露，股东分红缩水」×0.5）
 *   ④ mono-m20-4-04-dividend.png     轮末分红后现金变化（现金 ￥2800 → ￥2845，¥45 = 基础 10 + 现金流 20，×1.5）
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
const HUD_QK_Y = 607;                  // 快键行顶（浮层内可点元素底必须 ≤ 606，见 layout.ts 硬约束）
const FACILITY_PRICE = 200;            // 鹿乡银行认购价（data/facilities.ts）
const BUY1_COST = FACILITY_PRICE;      // 「认购 1 股」
const CASHFLOW_BANK = 400;             // 构造的银行本轮现金流（用于把分红体量放大到可见）
/* 两个合成新闻：id 刻意**不在** NEWS_TABLE 内（`n-` 前缀）⇒ 轮末 `rollNews` 换上的表内条目 id 必与其不同，
   从而确定性地证明「第 ⑥ 步抽下一条」真的跑了（标题 / 情绪 / 系数照抄表内真值）。 */
const GOOD = {
  id: 'shot-good', sentiment: 'good', scope: 'facility', target: 'bank',
  title: '鹿乡银行揽储大增，股东分红看涨', magnitude: 1.5,
};
const BAD = {
  id: 'shot-bad', sentiment: 'bad', scope: 'facility', target: 'bank',
  title: '银行坏账暴露，股东分红缩水', magnitude: 0.5,
};
/* 分红逐值（spec F-D3）：round((1×200×0.05 + 400×1/20) × 1.5) = round((10 + 20) × 1.5) = 45 */
const EXPECT_GAIN = 45;

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const openPage = async () => {
  const p = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  return p;
};

/** 画布元素实例快照（`scene.instancesOf()` 按 id 归组） */
const snapshot = (p) => p.evaluate(() => {
  const inst = window.__monoMain.scene.instancesOf();
  const rows = inst.filter((i) => i.id === 'ui.bankRow');
  const qk = inst.filter((i) => i.id === 'ui.qk').map((i) => i.state?.label ?? null);
  const news = inst.find((i) => i.id === 'ui.newsTicker');
  /* `ui.button.primary / secondary` 与 HUD 主 / 次要键同名（HUD 先画 ⇒ 先出现在列表中），
     设施浮层那两枚按「认购」前缀取，避免误取 HUD「掷骰」 */
  const btn = (id) => inst.filter((i) => i.id === id).map((i) => i.state ?? null)
    .find((s) => String(s?.label ?? '').startsWith('认购')) ?? null;
  return {
    badge: inst.find((i) => i.id === 'ui.badge')?.state?.text ?? null,
    rowCount: rows.filter((r) => r.state?.variant === 'row').length,
    lineCount: rows.filter((r) => r.state?.variant === 'line').length,
    selected: rows.filter((r) => r.state?.variant === 'row' && r.state?.selected === true)
      .map((r) => r.state?.title ?? null),
    rowTitles: rows.filter((r) => r.state?.variant === 'row').map((r) => r.state?.title ?? null),
    rowSummaries: rows.filter((r) => r.state?.variant === 'row').map((r) => r.state?.summary ?? null),
    lines: rows.filter((r) => r.state?.variant === 'line').map((r) => r.state?.text ?? null),
    primary: btn('ui.button.primary'),
    secondary: btn('ui.button.secondary'),
    panelBg: inst.filter((i) => i.id === 'showcase.panel').length,
    qk,
    newsCount: inst.filter((i) => i.id === 'ui.newsTicker').length,
    news: news ? news.state : null,
  };
});

/** 命中层按钮快照（DOM 顺序 = `panelHitAreas` 产出顺序） */
const hitBtns = (p) => p.evaluate(() => {
  const read = (root, sel) => Array.from(root.querySelectorAll(sel))
    .map((b) => ({ target: b.dataset.target ?? null, disabled: b.disabled, y: null }));
  const panels = document.querySelector('#mono-panels');
  const hud = document.querySelector('#mono-hud');
  return {
    select: read(panels, 'button[data-action="facility:select"]'),
    buy1: read(panels, 'button[data-action="facility:buy1"]'),
    buy5: read(panels, 'button[data-action="facility:buy5"]'),
    close: read(panels, 'button[data-action="facility:close"]'),
    facilityKey: read(hud, 'button[data-action="facility"]'),
  };
});

/* ============ 页面 A：① 设施浮层 → ② 认购后详情 → ③ 新闻条两态 → ④ 轮末分红 ============ */
const a = await openPage();

/* ① 真实点 HUD「设施」快键 → 浮层展开（默认选中「鹿乡银行 ￥200」） */
await a.locator('#mono-hud button[data-action="facility"]').click();
await a.waitForTimeout(150);
const snap1 = await snapshot(a);
const btns1 = await hitBtns(a);
facts.panel = snap1;
facts.panelBtns = btns1;
/* 浮层内可点元素底必须全部 ≤ 606（HUD 快键行 607..629 画在浮层之上且照常可点）；
   命中区 <button> 的顶 / 高由 `mountPanels` 内联样式给出，这里直接量 DOM 的 getBoundingClientRect（CSS 像素）。 */
facts.panelHitBottom = await a.evaluate(() => {
  const ys = [...document.querySelectorAll('#mono-panels button')]
    .map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height; });
  return ys.length ? Math.max(...ys) : null;
});
gate.panel_open = snap1.badge === '公共设施 · 入股' && snap1.panelBg === 1;
gate.panel_rows = snap1.rowCount === 5 && snap1.lineCount === 5
  && snap1.selected.join(',') === '鹿乡银行'
  && snap1.rowTitles.join(',') === '鹿乡银行,股票交易所,医院,乐透彩,福利中心'
  && snap1.rowSummaries[0] === '￥200 · 已售 0/20';
gate.panel_detail = snap1.lines.join('|')
  === '鹿乡银行 · 每股 ￥200|已售 0/20 股 · 基础分红 5%/轮|你的持股 0 股|预估分红 ￥0/轮|现金 ￥3000';
gate.panel_keys = snap1.primary?.label === '认购 1 股 ￥200' && snap1.primary?.enabled === true
  && snap1.secondary?.label === '认购 5 股 ￥1000' && snap1.secondary?.enabled === true
  && snap1.qk.includes('关闭');
gate.panel_hits = btns1.select.length === 5
  && btns1.select.map((b) => b.target).join(',') === 'bank,exchange,hospital,lottery,welfare'
  && btns1.buy1.length === 1 && btns1.buy1[0].target === 'bank' && btns1.buy1[0].disabled === false
  && btns1.buy5.length === 1 && btns1.buy5[0].disabled === false
  && btns1.close.length === 1
  && btns1.facilityKey.length === 1;
gate.panel_no_overlap = facts.panelHitBottom !== null && facts.panelHitBottom <= HUD_QK_Y;
await a.screenshot({ path: `${OUT}/mono-m20-4-01-facility.png` });

/* ② 真实点「认购 1 股 ￥200」→ 详情随持股更新（现金 3000 → 2800） */
await a.locator('#mono-panels button[data-action="facility:buy1"]').click();
await a.waitForTimeout(150);
const snap2 = await snapshot(a);
facts.subscribed = await a.evaluate(() => {
  const m = window.__monoMain;
  const p = m.game.state.players[0];
  return { cash: p.cash, shares: p.facilities.bank ?? 0, lastEvent: m.game.state.lastEvent ?? null };
});
facts.subscribedView = snap2;
gate.subscribe_paid = facts.subscribed.cash === 3000 - BUY1_COST && facts.subscribed.shares === 1
  && facts.subscribed.lastEvent?.kind === 'facility' && facts.subscribed.lastEvent?.facility === 'bank'
  && facts.subscribed.lastEvent?.shares === 1 && facts.subscribed.lastEvent?.cost === BUY1_COST;
gate.subscribe_detail = snap2.lines[1] === '已售 1/20 股 · 基础分红 5%/轮'
  && snap2.lines[2] === '你的持股 1 股'
  && snap2.lines[3] === '预估分红 ￥10/轮'        // 1×200×0.05 = 10（本处现金流 0 → 无新闻系数后缀）
  && snap2.lines[4] === `现金 ￥${3000 - BUY1_COST}`
  && snap2.primary?.enabled === true;
await a.screenshot({ path: `${OUT}/mono-m20-4-02-subscribed.png` });

/* 收起浮层：新闻条（474..500）在浮层底板之内，须先关掉设施浮层才可见 */
await a.locator('#mono-panels button[data-action="facility:close"]').click();
await a.waitForTimeout(120);

/* ③ 新闻条两态：利好（金底 ×1.5）→ 截一张；利空（灰底 ×0.5）→ 截一张 */
const setNews = (n) => a.evaluate((x) => {
  const m = window.__monoMain;
  m.game.state.news = x;
  m.paint();
}, n);
await setNews(GOOD);
await a.waitForTimeout(120);
const snapGood = await snapshot(a);
facts.newsGood = snapGood.news;
gate.news_good = snapGood.newsCount === 1 && snapGood.news?.sentiment === 'good'
  && snapGood.news?.coef === 1.5 && String(snapGood.news?.title).includes('鹿乡银行揽储大增');
await a.screenshot({ path: `${OUT}/mono-m20-4-03-news-good.png` });

await setNews(BAD);
await a.waitForTimeout(120);
const snapBad = await snapshot(a);
facts.newsBad = snapBad.news;
gate.news_bad = snapBad.newsCount === 1 && snapBad.news?.sentiment === 'bad'
  && snapBad.news?.coef === 0.5 && String(snapBad.news?.title).includes('银行坏账暴露');
await a.screenshot({ path: `${OUT}/mono-m20-4-03-news-bad.png` });

/* ④ 轮末分红：构造成「利好银行 + 银行现金流 ￥400 + 持股 1 股」→ 真实走一次轮末收口
     （等价第 4 位真人结束回合跨过起点线）。分红 = round((10 + 20) × 1.5) = 45。 */
facts.dividend = await a.evaluate(({ flow, news }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.news = news;
  s.facilityCashflow.bank = flow;
  const before = s.players[0].cash;
  /* 真实轮末：把当前席位挪到最后一位真人（index 3），phi 置 settled 后 endTurn → advanceToNext 跨圈 */
  s.current = 3;
  s.jail[3] = 0;
  s.players[3].bankrupt = false;
  s.phase = 'settled';
  m.game.endTurn();
  m.paint();
  const p = s.players[0];
  return {
    before, after: p.cash, gain: p.cash - before,
    round: s.round, phase: s.phase, current: s.current,
    cashflowAfter: s.facilityCashflow.bank,
    newsAfterId: s.news?.id ?? null,
    shares: p.facilities.bank ?? 0,
  };
}, { flow: CASHFLOW_BANK, news: GOOD });
gate.dividend_paid = facts.dividend.gain === EXPECT_GAIN
  && facts.dividend.cashflowAfter === 0            // 结算后清零（下一轮从 0 起算）
  && facts.dividend.newsAfterId !== GOOD.id;       // 轮末换下一条新闻（F-D8 第 ⑥ 步）

/* 取景：分红后再开设施浮层，详情「现金」行即分红后余额 */
await a.locator('#mono-hud button[data-action="facility"]').click();
await a.waitForTimeout(150);
const snap4 = await snapshot(a);
facts.afterDividendView = snap4;
gate.dividend_view = snap4.lines[2] === '你的持股 1 股'
  && snap4.lines[4] === `现金 ￥${facts.dividend.after}`;
await a.screenshot({ path: `${OUT}/mono-m20-4-04-dividend.png` });
await a.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-4-shots] gate:', JSON.stringify(gate));
console.log('[m20-4-shots] facts:', JSON.stringify(facts));
console.log('[m20-4-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-4-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-4-shots] PASS');
