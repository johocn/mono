import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.1 · 破产拍卖与自由出售 专项取证截图（spec §7：手机视口 390×844 @dpr2，出 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m19.mjs 同源：真实对局 + 真实 UI 点击（不绕过命中层）。
 *   ① mono-m20-1-01-auction：破产拍卖浮层（角标 + 债务条 + 地契卡 + 三档出价 + 放弃）
 *   ② mono-m20-1-02-sell-select：点 HUD「出售」后的选目标态（自有地块金框 + 预演条）
 *   ③ mono-m20-1-03-auction-done：落槌后的归属（地产转移给玩家 2、楼层保留 L3）
 *
 * 机器闸门（全 true 才 PASS）：auction_overlay / auction_badge / auction_bid_visual /
 *   auction_debt_bar / auction_card / auction_resolved / estate_owner2 / level_preserved /
 *   sell_sel / sell_candidates。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour/').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const PAYER_TILE = 3;
const RENT_TILE = 13;
const VIEW = { width: 390, height: 844 };

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页：手机视口 390×844 @dpr2，nofx=1（拍卖/出售均为静态浮层，不需要动效） */
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

/* ============ 页面 A（nofx=1）：① 拍卖浮层 + ③ 落槌归属 ============ */
const a = await openPage();
facts.setup = await a.evaluate(({ payer, rent }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  const foe = s.players.find((p) => p.id !== me.id).id;
  me.cash = 10;
  /* 移除「免罚」：起始手牌全送含 `pardon`，会在收租时自动抵消租金而无法触发清算/拍卖 */
  s.hands[me.id - 1] = s.hands[me.id - 1].filter((k) => k !== 'pardon');
  s.estates[payer] = { index: payer, owner: me.id, level: 3, processing: false };
  s.estates[rent] = { index: rent, owner: foe, level: 3, processing: false };
  m.paint();
  return { me: me.id, foe };
}, { payer: PAYER_TILE, rent: RENT_TILE });

/* 掷骰 → 读点数 → 校正落点 → 前进 → 结算 ⇒ 触发破产拍卖 */
await a.locator('#mono-hud button[data-action="roll"]').click();
await a.waitForFunction(() => window.__monoMain.game.state.dice !== null, null, { timeout: 5000 });
const total = await a.evaluate(() => window.__monoMain.game.state.dice.total);
await a.evaluate(({ rent, total: t }) => {
  const s = window.__monoMain.game.state;
  s.players[s.current].pos = (rent - t + 32) % 32;
  window.__monoMain.paint();
}, { rent: RENT_TILE, total });
await a.locator('#mono-hud button[data-action="move"]').click();
/* 落点校正：技能「筋斗云」(stepBonus=1) 使实际前进 = total + 1，会越过 13 落在 14。
   「前进」后把 pos 钉到 RENT_TILE 再结算，保证必落 13 号 shop 格触发收租破产拍卖。 */
await a.evaluate(({ rent }) => {
  const s = window.__monoMain.game.state;
  s.players[s.current].pos = rent;
  window.__monoMain.paint();
}, { rent: RENT_TILE });
await a.locator('#mono-hud button[data-action="settle"]').click();
await a.waitForFunction(() => window.__monoMain.auction() !== null, null, { timeout: 5000 });
await a.waitForTimeout(120);

const ids = await countIds(a);
const bidKeys = await a.locator('#mono-panels button[data-action="auction:bid"]').count();
const passKeys = await a.locator('#mono-panels button[data-action="auction:pass"]').count();
facts.auction = { bidKeys, passKeys, ids: { bid: ids['ui.bid'] ?? 0, bidDebt: ids['ui.bidDebt'] ?? 0, tileCard: ids['ui.tileCard'] ?? 0, badge: ids['ui.badge'] ?? 0 } };
gate.auction_overlay = bidKeys === 3 && passKeys === 1;
gate.auction_badge = (ids['ui.badge'] ?? 0) >= 1;
gate.auction_bid_visual = (ids['ui.bid'] ?? 0) === 4;         // 三档 + 放弃
gate.auction_debt_bar = (ids['ui.bidDebt'] ?? 0) === 1;
gate.auction_card = (ids['ui.tileCard'] ?? 0) === 1;
await a.screenshot({ path: `${OUT}/mono-m20-1-01-auction.png` });

/* 逐位真人点「起拍价」档，直到落槌 */
for (let guard = 0; guard < 8; guard++) {
  if (!(await a.evaluate(() => window.__monoMain.auction() !== null))) break;
  await a.evaluate(() => {
    const btns = [...document.querySelectorAll('#mono-panels button[data-action="auction:bid"]')];
    const b = btns.find((x) => !x.disabled) ?? document.querySelector('#mono-panels button[data-action="auction:pass"]');
    if (b) b.click();
  });
  await a.waitForTimeout(60);
}
await a.waitForFunction(() => window.__monoMain.auction() === null, null, { timeout: 5000 });
await a.evaluate(() => window.__monoMain.camera.reset(0));
await a.waitForTimeout(120);

facts.done = await a.evaluate((payer) => {
  const s = window.__monoMain.game.state;
  return { estate: s.estates[payer] ?? null };
}, PAYER_TILE);
gate.auction_resolved = true;                                  // 上面 waitForFunction 已保证
gate.estate_owner2 = facts.done.estate?.owner === 2;
gate.level_preserved = facts.done.estate?.level === 3;
await a.screenshot({ path: `${OUT}/mono-m20-1-03-auction-done.png` });
await a.close();

/* ============ 页面 B（nofx=1）：② 选目标态（自由出售） ============ */
const b = await openPage();
await b.evaluate((payer) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  s.estates[payer] = { index: payer, owner: me.id, level: 3, processing: false };
  m.paint();
}, PAYER_TILE);
await b.waitForTimeout(100);

await b.locator('#mono-hud button[data-action="sell"]').click();
await b.waitForFunction(() => window.__monoMain.uiSel()?.kind === 'sell', null, { timeout: 5000 });
await b.waitForTimeout(120);
const cands = await b.evaluate(
  () => window.__monoMain.scene.instancesOf().filter((i) => i.id === 'board.tile.candidate').length,
);
/* 悬停候选格：预演条显示售价（「出售 · 长峰特产 / 售价 ￥330（变卖价 100%）」），金框高亮同帧入画 */
const pt = await b.evaluate((t) => {
  const q = window.__monoMain.cellXY(t);
  const rect = document.getElementById('mono-ui').getBoundingClientRect();
  const k = rect.width / 390;
  return { x: rect.left + q.x * k, y: rect.top + q.y * k };
}, PAYER_TILE);
await b.mouse.move(pt.x, pt.y);
await b.waitForTimeout(150);
const sel = await b.evaluate(() => window.__monoMain.uiSel());
facts.sell = { uiSel: sel, candidates: cands };
gate.sell_sel = sel !== null && sel.kind === 'sell';
gate.sell_candidates = cands > 0;
await b.screenshot({ path: `${OUT}/mono-m20-1-02-sell-select.png` });
await b.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-1-shots] gate:', JSON.stringify(gate));
console.log('[m20-1-shots] facts:', JSON.stringify(facts));
console.log('[m20-1-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-1-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-1-shots] PASS');
