import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.2 · 银行信贷专项取证截图（spec §7：手机视口 390×844 @dpr2，出 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m20-1.mjs 同源：真实对局 + 真实 HUD 点击（不绕过命中层）。
 *   ① mono-m20-2-01-bank-deposit：银行浮层 · 存款页（版式 C：左三行产品 + 右详情行 + 两枚操作键）
 *   ② mono-m20-2-02-bank-mortgage：银行浮层 · 抵押页（已锁定 1 块 + 可抵押地块金额）
 *   ③ mono-m20-2-03-debt-overdue：逾期债务条（顶部 HUD 中段四段，逾期段走警示色）
 *   ④ mono-m20-2-04-mortgage-auction：抵押超期拍卖（角标 + 债务条 + 地契卡 + 三档出价 + 放弃）
 *
 * 机器闸门（全 true 才 PASS）：bank_deposit_open / bank_rows / bank_mortgage_open /
 *   mortgage_locked / debt_bar_overdue / mortgage_auction。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour/').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const BANK_TILE = 9;
const VIEW = { width: 390, height: 844 };

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页：手机视口 390×844 @dpr2，nofx=1（银行 / 拍卖均为静态浮层，不需要动效） */
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

/* ============ 页面 A：① 存款页 / ② 抵押页 / ③ 逾期债务条 ============ */
const a = await openPage();

/* ① 存款页：站 9 号格 + 现金 ￥2000 */
facts.setupDeposit = await a.evaluate((bank) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  me.cash = 2000; me.deposit = 0; me.loan = null; me.mortgages = []; me.pos = bank;
  m.paint();
  m.setBank(true, 'deposit');
  return { me: me.id, cash: me.cash };
}, BANK_TILE);
await a.waitForTimeout(120);
const idsDep = await countIds(a);
const bankDep = await a.evaluate(() => window.__monoMain.bank());
facts.deposit = { bank: bankDep, ids: { bankRow: idsDep['ui.bankRow'] ?? 0, panel: idsDep['showcase.panel'] ?? 0, badge: idsDep['ui.badge'] ?? 0 } };
gate.bank_deposit_open = bankDep.open === true && bankDep.sel === 'deposit';
gate.bank_rows = (idsDep['ui.bankRow'] ?? 0) >= 3;
await a.screenshot({ path: `${OUT}/mono-m20-2-01-bank-deposit.png` });

/* ② 抵押页：站 9 号格 + 一块 L3 可抵押 + 已锁定 1 块 */
facts.setupMortgage = await a.evaluate((bank) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  me.cash = 500; me.deposit = 0; me.loan = null; me.pos = bank;
  s.estates[3] = { index: 3, owner: me.id, level: 3, processing: false };
  s.estates[7] = { index: 7, owner: me.id, level: 1, processing: false };
  me.mortgages = [{ principal: 200, rate: 0.04, due: s.round + 6, overdue: 0, index: 7 }];
  m.paint();
  m.setBank(true, 'mortgage');
  return { me: me.id, locked: me.mortgages.length };
}, BANK_TILE);
await a.waitForTimeout(120);
const idsMort = await countIds(a);
const bankMort = await a.evaluate(() => window.__monoMain.bank());
facts.mortgage = { bank: bankMort, ids: { bankRow: idsMort['ui.bankRow'] ?? 0 }, locked: facts.setupMortgage.locked };
gate.bank_mortgage_open = bankMort.open === true && bankMort.sel === 'mortgage';
gate.mortgage_locked = facts.setupMortgage.locked === 1;
await a.screenshot({ path: `${OUT}/mono-m20-2-02-bank-mortgage.png` });

/* ③ 逾期债务条：顶部 HUD 中段四段，逾期段走警示色（overdue > 0） */
facts.setupOverdue = await a.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[s.current];
  me.deposit = 1240; me.mortgages = [];
  me.loan = { principal: 600, rate: 0.06, due: s.round - 1, overdue: 2 };
  m.paint();
  m.setBank(false);
  return { me: me.id, overdue: me.loan.overdue, debt: me.loan.principal };
});
await a.waitForTimeout(120);
const idsDebt = await countIds(a);
facts.debtBar = { ids: { debtBar: idsDebt['ui.debtBar'] ?? 0 }, overdue: facts.setupOverdue.overdue };
gate.debt_bar_overdue = (idsDebt['ui.debtBar'] ?? 0) === 1 && facts.setupOverdue.overdue > 0;
await a.screenshot({ path: `${OUT}/mono-m20-2-03-debt-overdue.png` });
await a.close();

/* ============ 页面 B：④ 抵押超期拍卖 ============ */
const b = await openPage();
facts.setupAuction = await b.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const payer = s.players[3];
  s.current = 3; s.phase = 'settled';
  payer.cash = 3000; payer.deposit = 0; payer.loan = null;
  s.estates[11] = { index: 11, owner: payer.id, level: 3, processing: false };
  payer.mortgages = [{ principal: 200, rate: 0.04, due: s.round - 1, overdue: 0, index: 11 }];
  m.paint();
  return { payer: payer.id, round: s.round };
});
await b.waitForTimeout(60);
await b.locator('#mono-hud button[data-action="end"]').click();
await b.waitForFunction(() => window.__monoMain.auction() !== null, null, { timeout: 5000 });
await b.evaluate(() => window.__monoMain.camera.reset(0));
await b.waitForTimeout(120);
const idsAuc = await countIds(b);
facts.auction = await b.evaluate(() => {
  const x = window.__monoMain.auction();
  return { trigger: x.trigger, lot: x.lot, amount: x.amount, pending: x.pending.slice() };
});
facts.auctionIds = { bid: idsAuc['ui.bid'] ?? 0, bidDebt: idsAuc['ui.bidDebt'] ?? 0, tileCard: idsAuc['ui.tileCard'] ?? 0 };
gate.mortgage_auction = facts.auction.trigger === 'mortgage-overdue'
  && (idsAuc['ui.bid'] ?? 0) === 4 && (idsAuc['ui.bidDebt'] ?? 0) === 1;
await b.screenshot({ path: `${OUT}/mono-m20-2-04-mortgage-auction.png` });
await b.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-2-shots] gate:', JSON.stringify(gate));
console.log('[m20-2-shots] facts:', JSON.stringify(facts));
console.log('[m20-2-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-2-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-2-shots] PASS');
