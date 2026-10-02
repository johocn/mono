import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.5 · 经济平衡与风险增强轮取证截图（spec §6 手机视口 390×844 @dpr2 → 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m20-4.mjs / mono-shots-m20-3.mjs 同源：**真实对局 + 真实 HUD / 浮层点击**，
 * 不绕过 `#mono-panels` / `#mono-hud` 命中层。两处例外（浮层定位无法按键指定）：
 *   ① 保证金页与股票角标：用 `__monoMain` 直接布置「借款 ￥500 + 持仓市值 ￥720」的杠杆局面；
 *   ② 新闻条景气前缀：直接改 `state.news` / `state.economyIndex` 并 `paint()`。
 * 其余（金额键盘逐键点击 / 存入 / 取出 / 商店 11 行）全走真实命中层点击。
 *
 * 截图 6 张：
 *   ① mono-m20-5-01-amount.png       存款页金额键盘（示数 ￥600 · 存入可用 / 取出禁用）
 *   ② mono-m20-5-02-deposited.png    真实「存入 ￥600」后（现金 3000→2400 / 存款 0→600，两键均可用）
 *   ③ mono-m20-5-03-margin.png       保证金页（借款 500 / 市值 720 / 爆仓线 600 / 距爆仓 20% + 两枚补仓键）
 *   ④ mono-m20-5-04-stock-warn.png   股票盘角标警示（`⚠爆仓 20%`）
 *   ⑤ mono-m20-5-05-store.png        道具商店 11 行（高底板 `showcase.panelTall`）
 *   ⑥ mono-m20-5-06-news-econ.png    新闻条大盘前缀（`景气 120% · 消费回暖…`）
 *
 * 机器闸门（确定性，全 true 才 PASS）：见文件末尾 `gate` 的逐项含义。
 *
 * MONO_ORIGIN 默认打本地预览（`npm run preview` 的 52301；端口被占会自动顺延，用启动日志里的实际端口覆盖）。
 * 线上：$env:MONO_ORIGIN='https://game.joho.cn/tour/'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52301').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const HUD_QK_Y = 607;                  // 快键行顶（浮层内可点元素底必须 ≤ 606，见 layout.ts 硬约束）

const START_CASH = 3000;               // 初始资金
const DEPOSIT = 600;                   // 本页存入 / 取出金额
const MARGIN_PRINCIPAL = 500;          // 构造的保证金借款
const MARGIN_SHARES = 6;               // SY01（￥120）× 6 = 市值 ￥720
const SY01_PRICE = 120;
const MARGIN_LINE = 600;               // round(500 × 120%) = 600
const MARGIN_VALUE = SY01_PRICE * MARGIN_SHARES;   // 720
const MARGIN_GAP = 20;                 // round((720 − 600) / 600 × 100)
const ECON_INDEX = 1.2;                // 构造景气度 → 前缀「景气 120%」
const SHOT_TILE = 13;                  // 鹿产品一条街（shop，用于解锁「抵押补仓」）

const STORE_TITLES = [
  '免罚', '避税凭证', '租金翻倍', '惠农补贴', '炸弹', '路障',
  '迁点', '造势', '拆迁令', '涨跌卡', '红利卡',
];

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

/** 画布元素实例快照（按 id 归组读 `state`） */
const snapshot = (p) => p.evaluate(() => {
  const inst = window.__monoMain.scene.instancesOf();
  const rows = inst.filter((i) => i.id === 'ui.bankRow');
  const news = inst.find((i) => i.id === 'ui.newsTicker');
  return {
    amount: inst.find((i) => i.id === 'ui.amount')?.state ?? null,
    keys: inst.filter((i) => i.id === 'ui.key').map((i) => ({ label: i.state?.label ?? null, enabled: i.state?.enabled === true })),
    wides: inst.filter((i) => i.id === 'ui.keyWide').map((i) => ({ label: i.state?.label ?? null, enabled: i.state?.enabled === true })),
    rowCount: rows.filter((r) => r.state?.variant === 'row').length,
    rowTitles: rows.filter((r) => r.state?.variant === 'row').map((r) => r.state?.title ?? null),
    rowSummaries: rows.filter((r) => r.state?.variant === 'row').map((r) => r.state?.summary ?? null),
    lineCount: rows.filter((r) => r.state?.variant === 'line').length,
    lines: rows.filter((r) => r.state?.variant === 'line').map((r) => r.state?.text ?? null),
    badge: inst.find((i) => i.id === 'ui.badge')?.state ?? null,
    panel: inst.filter((i) => i.id === 'showcase.panel').length,
    panelTall: inst.filter((i) => i.id === 'showcase.panelTall').length,
    panelStock: inst.filter((i) => i.id === 'showcase.panelStock').length,
    buttons: inst.filter((i) => i.id === 'ui.button.primary' || i.id === 'ui.button.secondary')
      .map((i) => ({ label: i.state?.label ?? null, enabled: i.state?.enabled === true })),
    newsCount: inst.filter((i) => i.id === 'ui.newsTicker').length,
    news: news ? news.state : null,
  };
});

/** 命中层按钮快照（`#mono-panels` DOM 顺序 = `panelHitAreas` 产出顺序） */
const hitBtns = (p, action) => p.evaluate((a) => Array.from(
  document.querySelectorAll(`#mono-panels button[data-action="${a}"]`),
).map((b) => ({ target: b.dataset.target ?? null, disabled: b.disabled })), action);

/** 浮层内所有命中按钮的底边（CSS 像素）——必须 ≤ 606（HUD 快键行画在其上且可点） */
const hitBottom = (p) => p.evaluate(() => {
  const ys = [...document.querySelectorAll('#mono-panels button')]
    .map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height; });
  return ys.length ? Math.max(...ys) : null;
});

/** 读玩家资金口径 */
const read = (p) => p.evaluate(() => {
  const m = window.__monoMain;
  const p0 = m.game.state.players[0];
  return { cash: p0.cash, deposit: p0.deposit };
});

/* ============ 页面 A：① 金额键盘 → ② 真实存入后 ============ */
const a = await openPage();

/* ① 真实点 HUD「银行」→ 默认选中「存款」→ 逐键点 6 / 0 / 0 → 示数 ￥600 */
await a.locator('#mono-hud button[data-action="bank"]').click();
await a.locator('#mono-panels button[data-action="bank:select"][data-target="deposit"]').click();
for (const k of ['6', '0', '0']) {
  await a.locator(`#mono-panels button[data-action="bank:key"][data-target="${k}"]`).click();
}
await a.waitForTimeout(150);
const snap1 = await snapshot(a);
facts.amountPage = snap1;
facts.amountKeysHit = await hitBtns(a, 'bank:key');
facts.amountTiersHit = await hitBtns(a, 'bank:tier');
facts.amountBottom = await hitBottom(a);
gate.amount_view = snap1.amount?.text === '￥600' && snap1.amount?.hint === `现金 ${START_CASH} · 存款 0`;
gate.amount_keys = snap1.keys.length === 15
  && snap1.keys.slice(0, 12).map((k) => k.label).join(',') === '1,2,3,4,5,6,7,8,9,清空,0,⌫'
  && snap1.keys.slice(12).map((k) => k.label).join(',') === '+100,+500,+1000';
gate.amount_tiers = snap1.keys[12]?.enabled === true && snap1.keys[14]?.enabled === true
  && snap1.keys[9]?.label === '清空' && snap1.keys[11]?.label === '⌫';
gate.amount_confirm = snap1.wides.length === 2
  && snap1.wides[0].label === `存入 ￥${DEPOSIT}` && snap1.wides[0].enabled === true
  && snap1.wides[1].label === `取出 ￥${DEPOSIT}` && snap1.wides[1].enabled === false;  // 存款 0 ⇒ 取出禁用
gate.amount_rows = snap1.rowCount === 4
  && snap1.rowTitles.join(',') === '存款,信用贷款,抵押,保证金'
  && snap1.rowSummaries[0] === '无存款' && snap1.rowSummaries[3] === '无杠杆';
gate.amount_hits = facts.amountKeysHit.length === 12 && facts.amountTiersHit.length === 3
  && facts.amountTiersHit.map((b) => b.target).join(',') === '100,500,1000';
gate.amount_no_overlap = facts.amountBottom !== null && facts.amountBottom <= HUD_QK_Y;
await a.screenshot({ path: `${OUT}/mono-m20-5-01-amount.png` });

/* ② 真实点「存入 ￥600」→ 现金 2400 / 存款 600；再点 6 / 0 / 0，两枚确认键均可用 */
await a.locator('#mono-panels button[data-action="bank:deposit"]').click();
await a.waitForTimeout(120);
facts.afterDeposit = await read(a);
gate.deposit_paid = facts.afterDeposit.cash === START_CASH - DEPOSIT && facts.afterDeposit.deposit === DEPOSIT;
for (const k of ['6', '0', '0']) {
  await a.locator(`#mono-panels button[data-action="bank:key"][data-target="${k}"]`).click();
}
await a.waitForTimeout(150);
const snap2 = await snapshot(a);
facts.depositedPage = snap2;
gate.deposited_view = snap2.amount?.text === '￥600'
  && snap2.amount?.hint === `现金 ${START_CASH - DEPOSIT} · 存款 ${DEPOSIT}`
  && snap2.wides[0].enabled === true && snap2.wides[1].enabled === true;   // 取款入口此时可用
await a.screenshot({ path: `${OUT}/mono-m20-5-02-deposited.png` });

/* 真实点「取出 ￥600」→ 现金回 3000 / 存款归 0（验证取款链路真的通） */
await a.locator('#mono-panels button[data-action="bank:withdraw"]').click();
await a.waitForTimeout(120);
facts.afterWithdraw = await read(a);
gate.withdraw_paid = facts.afterWithdraw.cash === START_CASH && facts.afterWithdraw.deposit === 0;

/* ============ 页面 A 续：③ 保证金页 → ④ 股票角标 ============ */
/* 布置杠杆局面：借款 ￥500 + 持仓 SY01×6（市值 ￥720）+ 站 9 号格 + 一块可抵押地产（解锁「抵押补仓」） */
facts.marginSetup = await a.evaluate(({ principal, shares, cash, tile }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const p = s.players[0];
  p.cash = cash;
  p.pos = 9;                                        // BANK_TILE_INDEX
  p.margin = { principal, rate: 0.06 };
  s.portfolios[0] = { SY01: { code: 'SY01', shares, cost: 120 * shares } };
  s.estates[tile] = { index: tile, owner: p.id, level: 1, processing: false };
  m.setBank(true, 'margin');
  return { cash: p.cash, principal: p.margin.principal, value: shares * 120 };
}, { principal: MARGIN_PRINCIPAL, shares: MARGIN_SHARES, cash: START_CASH, tile: SHOT_TILE });
await a.waitForTimeout(150);
const snap3 = await snapshot(a);
facts.marginPage = snap3;
facts.marginHits = await hitBtns(a, 'bank:marginCash');
facts.marginHits2 = await hitBtns(a, 'bank:marginMortgage');
facts.marginBottom = await hitBottom(a);
gate.margin_lines = snap3.lineCount === 4
  && snap3.lines.join('|') === [
    `借款 ￥${MARGIN_PRINCIPAL}`,
    `持仓市值 ￥${MARGIN_VALUE}`,
    `爆仓线 ￥${MARGIN_LINE}（借款 × 120%）`,
    `距爆仓 ${MARGIN_GAP}%`,
  ].join('|');
/* `ui.button.primary` 与 HUD 主键（掷骰 / 结束回合）同名，HUD 先画 ⇒ 按 label 取，避免误取 */
const addBtn = snap3.buttons.find((x) => x.label === '现金追加');
const mgBtn = snap3.buttons.find((x) => x.label === '抵押补仓');
gate.margin_btns = addBtn !== undefined && addBtn.enabled === true
  && mgBtn !== undefined && mgBtn.enabled === true;
gate.margin_hits = facts.marginHits.length === 1 && facts.marginHits[0].disabled === false
  && facts.marginHits2.length === 1 && facts.marginHits2[0].disabled === false;
gate.margin_no_overlap = facts.marginBottom !== null && facts.marginBottom <= HUD_QK_Y;
await a.screenshot({ path: `${OUT}/mono-m20-5-03-margin.png` });

/* ④ 股票盘角标：站股票交易所 + `settled` → 盘面常开，角标取「市值 < 借款 × 1.5」警示态 */
facts.stockWarn = await a.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.phase = 'settled';
  s.players[0].pos = 19;                            // STOCK_TILE_INDEX
  m.setBank(false);
  m.setStock('SY01', 1);
  m.paint();
  return { phase: s.phase, pos: s.players[0].pos };
});
await a.waitForTimeout(150);
const snap4 = await snapshot(a);
facts.stockBadgePage = snap4;
gate.stock_badge = snap4.panelStock === 1 && snap4.badge?.text === `⚠爆仓 ${MARGIN_GAP}%`
  && snap4.badge?.warn === true;
await a.screenshot({ path: `${OUT}/mono-m20-5-04-stock-warn.png` });
await a.close();

/* ============ 页面 B：⑤ 商店 11 行 → ⑥ 新闻景气 ============ */
const b = await openPage();

await b.evaluate(() => window.__monoMain.setStore(true));
await b.waitForTimeout(150);
const snap5 = await snapshot(b);
facts.storePage = snap5;
facts.storeBottom = await hitBottom(b);
gate.store_tall = snap5.panelTall === 1 && snap5.rowCount === 11 && snap5.lineCount === 4;
gate.store_rows = snap5.rowTitles.join(',') === STORE_TITLES.join(',')
  && snap5.rowSummaries.join('|') === STORE_TITLES.map((t, i) => `￥${[250, 350, 250, 400, 300, 150, 200, 500, 500, 400, 300][i]} · 持有`).join('|');
gate.store_hits = (await hitBtns(b, 'store:select')).length === 11
  && (await hitBtns(b, 'store:buy')).length === 1
  && (await hitBtns(b, 'store:sell')).length === 1;
gate.store_no_overlap = facts.storeBottom !== null && facts.storeBottom <= HUD_QK_Y;
await b.screenshot({ path: `${OUT}/mono-m20-5-05-store.png` });

/* ⑥ 新闻条大盘前缀：收起浮层 + 布置大盘利好新闻 + 景气度 1.20 */
facts.newsSetup = await b.evaluate(({ index }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.economyIndex = index;
  s.phase = 'idle';
  s.players[0].pos = 0;
  s.lastDraw = null;
  s.news = {
    id: 'shot-econ', sentiment: 'good', scope: 'economy', target: 'market',
    title: '消费回暖，全城租金水涨船高', magnitude: 1.5,
  };
  m.setStore(false);
  m.paint();
  return { economyIndex: s.economyIndex, news: s.news.id };
}, { index: ECON_INDEX });
await b.waitForTimeout(150);
const snap6 = await snapshot(b);
facts.newsPage = snap6;
gate.news_prefix = snap6.newsCount === 1 && snap6.news?.prefix === `景气 ${Math.round(ECON_INDEX * 100)}%`
  && snap6.news?.sentiment === 'good' && String(snap6.news?.title).includes('消费回暖');
await b.screenshot({ path: `${OUT}/mono-m20-5-06-news-econ.png` });
await b.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-5-shots] gate:', JSON.stringify(gate));
console.log('[m20-5-shots] facts:', JSON.stringify(facts));
console.log('[m20-5-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-5-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-5-shots] PASS');
