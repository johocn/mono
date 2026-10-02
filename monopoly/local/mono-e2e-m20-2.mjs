import { chromium } from 'playwright';

/*
 * M20.2 · 银行信贷 e2e（真实页面 + 真实 UI 点击，全程走 `#mono-hud` / `#mono-panels` 命中层）。
 *
 * 六个页面（各自独立确定性布置；信贷全链路零随机）：
 *   A 存取款：站 9 号格现金 ￥2000 → 点「存入」→ 存款 ￥2000 / 现金 ￥0 / 债务条入画；
 *             点「取出」→ 存款 ￥0 / 现金 ￥2000 / 债务条整条隐藏（零回归）。
 *   B 借款与还款：站 9 号格现金 ￥500 + 一块 L1 地产 → 「借款」入账额度、首轮免息、到期 = round+8；
 *             「还款」全额结清（现金回 ￥500、loan 归 null）。
 *   C 逾期罚息：持逾期信用贷款落对手 L3 商铺收租 → 租金照付地主，额外 50% 罚息直冲本金（不给地主），
 *             债务条走警示（overdue > 0）。
 *   D 抵押与赎回：站 9 号格持 L3 地产 → 「抵押」得 ￥264（= 330×80%）并锁定地块；「赎回」付清解锁。
 *   E 强执（loan-overdue）：轮末逾期满 3 轮 → 强制拍卖未抵押地产（起拍价 = 变卖价）；
 *             成交款冲抵贷款本金至结清。
 *   F 抵押超期（mortgage-overdue）：轮末 `round > due` → 拍卖抵押物（起拍价 = 借款额）；
 *             成交后该笔抵押清账、地块转移。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */

const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour').replace(/\/+$/, '');
const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const BANK_TILE = 9;                 // BANK_TILE_INDEX
const SHOP_RENT_TILE = 13;           // TILE_TYPES[13] === 'shop'（L3 租金 ￥105 / 变卖 ￥330）

const errors = [];
const facts = {};
const browser = await chromium.launch();
let fatal = null;

/** 断言（失败即抛，落进 `fatal` 闸门） */
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/** 建页 + 等 game 就绪 */
const openPage = async () => {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  watch(page);
  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`;
  facts.url = url;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  return page;
};

/** 可见元素实例计数（`scene.instancesOf()` 的 id 计数） */
const ids = (page) => page.evaluate(() => {
  const list = window.__monoMain.scene.instancesOf();
  const c = {};
  for (const i of list) c[i.id] = (c[i.id] ?? 0) + 1;
  return c;
});

/** 读当前玩家的信贷口径（含 `pos` / `round` / `phase`） */
const read = (page) => page.evaluate(() => {
  const s = window.__monoMain.game.state;
  const p = s.players[s.current];
  return {
    current: p.id, round: s.round, phase: s.phase, pos: p.pos,
    cash: p.cash, deposit: p.deposit,
    loan: p.loan ? { ...p.loan } : null,
    mortgages: p.mortgages.map((m) => ({ ...m })),
  };
});

/** 点 HUD「银行」键开浮层（可选切到某产品页） */
const openBank = async (page, sel) => {
  await page.locator('#mono-hud button[data-action="bank"]').click();
  await page.waitForFunction(() => window.__monoMain.bank().open === true, null, { timeout: 5000 });
  if (sel) {
    await page.locator(`#mono-panels button[data-action="bank:select"][data-target="${sel}"]`).click();
    await page.waitForFunction((s) => window.__monoMain.bank().sel === s, sel, { timeout: 5000 });
  }
  await page.waitForTimeout(60);
};

/** 逐位真人点「起拍价」档（第一枚可用出价键），直到落槌 */
const drainAuction = async (page) => {
  for (let guard = 0; guard < 12; guard++) {
    if (!(await page.evaluate(() => window.__monoMain.auction() !== null))) break;
    const ok = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#mono-panels button[data-action="auction:bid"]')];
      const b = btns.find((x) => !x.disabled) ?? document.querySelector('#mono-panels button[data-action="auction:pass"]');
      if (!b) return false;
      b.click();
      return true;
    });
    assert(ok, '拍卖浮层无可用出价键 / 放弃键（不应发生）');
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => window.__monoMain.auction() === null, null, { timeout: 5000 });
};

try {
  /* ============ 页面 A：存取款 ============ */
  {
    const page = await openPage();
    facts.aSetup = await page.evaluate((bank) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 2000; me.deposit = 0; me.loan = null; me.mortgages = []; me.pos = bank;
      m.paint();
      return { me: me.id, cash: me.cash };
    }, BANK_TILE);
    await openBank(page);
    assert(await page.locator('#mono-panels button[data-action="bank:deposit"]').count() === 1, '存款页应有「存入」主键');
    assert(await page.locator('#mono-panels button[data-action="bank:withdraw"]').count() === 1, '存款页应有「取出」次键');

    await page.locator('#mono-panels button[data-action="bank:deposit"]').click();
    await page.waitForTimeout(60);
    const afterDep = await read(page);
    const barDep = (await ids(page))['ui.debtBar'] ?? 0;
    facts.aDeposit = { ...afterDep, debtBar: barDep };
    assert(afterDep.deposit === 2000 && afterDep.cash === 0,
      `存入后应为 存款￥2000 / 现金￥0，实际 ${JSON.stringify({ cash: afterDep.cash, deposit: afterDep.deposit })}`);
    assert(barDep === 1, '有存款后债务条应入画（ui.debtBar ×1）');

    await page.locator('#mono-panels button[data-action="bank:withdraw"]').click();
    await page.waitForTimeout(60);
    const afterWd = await read(page);
    const barWd = (await ids(page))['ui.debtBar'] ?? 0;
    facts.aWithdraw = { ...afterWd, debtBar: barWd };
    assert(afterWd.deposit === 0 && afterWd.cash === 2000,
      `取出后应回到 存款￥0 / 现金￥2000，实际 ${JSON.stringify({ cash: afterWd.cash, deposit: afterWd.deposit })}`);
    assert(barWd === 0, '信贷清空后债务条应整条隐藏（零回归）');
    await page.close();
  }

  /* ============ 页面 B：借款与还款 ============ */
  {
    const page = await openPage();
    facts.bSetup = await page.evaluate((bank) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 500; me.deposit = 0; me.loan = null; me.mortgages = []; me.pos = bank;
      s.estates[3] = { index: 3, owner: me.id, level: 1, processing: false };
      m.paint();
      return { me: me.id, cash: me.cash };
    }, BANK_TILE);
    await openBank(page, 'loan');
    assert(await page.locator('#mono-panels button[data-action="bank:borrow"]').count() === 1, '贷款页应有「借款」主键');

    await page.locator('#mono-panels button[data-action="bank:borrow"]').click();
    await page.waitForTimeout(60);
    const afterBorrow = await read(page);
    facts.bBorrow = afterBorrow;
    assert(afterBorrow.loan !== null, '借款后应有未结清贷款');
    assert(afterBorrow.cash === 500 + afterBorrow.loan.principal,
      `借款入账应等于额度（cash=${afterBorrow.cash}, principal=${afterBorrow.loan.principal}）`);
    assert(afterBorrow.loan.freeFirstRound === true, '落 9 号格当回合借款应带首轮免息标记');
    assert(afterBorrow.loan.due === afterBorrow.round + 8,
      `贷款到期应为 round+8（实际 due=${afterBorrow.loan.due}, round=${afterBorrow.round}）`);

    await page.locator('#mono-panels button[data-action="bank:repay"]').click();
    await page.waitForTimeout(60);
    const afterRepay = await read(page);
    facts.bRepay = afterRepay;
    assert(afterRepay.loan === null, '全额还款后贷款应结清（loan = null）');
    assert(afterRepay.cash === 500, `全额还款后现金应回 ￥500，实际 ${afterRepay.cash}`);
    await page.close();
  }

  /* ============ 页面 C：逾期罚息 ============ */
  {
    const page = await openPage();
    facts.cSetup = await page.evaluate((shop) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      const foe = s.players.find((p) => p.id !== me.id).id;
      /* 移除「免罚」：起始手牌全送含 `pardon`，会在收租时自动抵消租金而进不了罚息分支 */
      s.hands[me.id - 1] = s.hands[me.id - 1].filter((k) => k !== 'pardon');
      s.estates[shop] = { index: shop, owner: foe, level: 3, processing: false };
      me.loan = { principal: 100, rate: 0.06, due: s.round - 1, overdue: 1 };
      me.deposit = 0; me.mortgages = [];
      m.paint();
      return { me: me.id, foe, foeCash: s.players[foe - 1].cash };
    }, SHOP_RENT_TILE);

    await page.locator('#mono-hud button[data-action="roll"]').click();
    await page.waitForFunction(() => window.__monoMain.game.state.dice !== null, null, { timeout: 5000 });
    await page.locator('#mono-hud button[data-action="move"]').click();
    await page.waitForFunction(() => window.__monoMain.game.state.phase === 'moved', null, { timeout: 5000 });
    /* 钉到 13 号商铺并重置现金：消除「筋斗云」stepBonus=1 与过起点红包的不确定 */
    await page.evaluate((shop) => {
      const s = window.__monoMain.game.state;
      s.players[s.current].pos = shop;
      s.players[s.current].cash = 1000;
      window.__monoMain.paint();
    }, SHOP_RENT_TILE);
    await page.locator('#mono-hud button[data-action="settle"]').click();
    await page.waitForTimeout(80);

    const afterC = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const me = s.players[s.current];
      const foe = s.players.find((p) => p.id !== s.current + 1);
      return {
        cash: me.cash,
        principal: me.loan ? me.loan.principal : null,
        overdue: me.loan ? me.loan.overdue : 0,
        foeCash: foe ? foe.cash : null,
      };
    });
    const barC = (await ids(page))['ui.debtBar'] ?? 0;
    facts.cPenalty = { ...afterC, debtBar: barC, foeCash0: facts.cSetup.foeCash, foe: facts.cSetup.foe };
    /* 租金 L3 = ￥105；罚息 = round(105×50%) = ￥53；现金 1000 − 105 − 53 = 842；本金 100 − 53 = 47 */
    assert(afterC.cash === 842, `逾期收租后现金应为 ￥842，实际 ${afterC.cash}`);
    assert(afterC.principal === 47, `罚息应直冲本金至 ￥47，实际 ${afterC.principal}`);
    assert(afterC.foeCash === facts.cSetup.foeCash + 105,
      `地主应只收租金 ￥105（罚息不给地主），实收 ${afterC.foeCash - facts.cSetup.foeCash}`);
    assert(afterC.overdue === 1, `逾期轮数应保持 1，实际 ${afterC.overdue}`);
    assert(barC === 1, '逾期债务条应入画（ui.debtBar ×1）');
    await page.close();
  }

  /* ============ 页面 D：抵押与赎回 ============ */
  {
    const page = await openPage();
    facts.dSetup = await page.evaluate((bank) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 500; me.deposit = 0; me.loan = null; me.mortgages = []; me.pos = bank;
      s.estates[3] = { index: 3, owner: me.id, level: 3, processing: false };
      m.paint();
      return { me: me.id };
    }, BANK_TILE);
    await openBank(page, 'mortgage');
    const mBtn = page.locator('#mono-panels button[data-action="bank:mortgage"]');
    assert(await mBtn.count() === 1, '抵押页应有「抵押」主键');
    const target = await mBtn.getAttribute('data-target');
    facts.dMortgageKey = { target: Number(target) };
    assert(Number(target) === 3, `「抵押」键应携带首个可抵押地块 3，实际 ${target}`);

    await mBtn.click();
    await page.waitForTimeout(60);
    const afterM = await read(page);
    facts.dMortgage = afterM;
    assert(afterM.mortgages.length === 1 && afterM.mortgages[0].index === 3, '抵押后应有 1 笔 index=3 的抵押');
    assert(afterM.mortgages[0].principal === 264,
      `抵押额应为变卖价×80% = ￥264（330×0.8），实际 ${afterM.mortgages[0].principal}`);
    assert(afterM.cash === 764, `抵押入账后现金应为 ￥764，实际 ${afterM.cash}`);

    await page.locator('#mono-panels button[data-action="bank:redeem"]').click();
    await page.waitForTimeout(60);
    const afterR = await read(page);
    facts.dRedeem = afterR;
    assert(afterR.mortgages.length === 0, '赎回后抵押应清空（地块解锁）');
    assert(afterR.cash === 500, `赎回付清后现金应回 ￥500，实际 ${afterR.cash}`);
    await page.close();
  }

  /* ============ 页面 E：贷款强执（loan-overdue） ============ */
  {
    const page = await openPage();
    facts.eSetup = await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      const payer = s.players[3];
      s.current = 3; s.phase = 'settled';                 // 末位玩家结束回合 → 跨 0 推进一轮
      payer.cash = 200; payer.deposit = 0; payer.mortgages = [];
      payer.loan = { principal: 100, rate: 0.06, due: s.round - 1, overdue: 2 };
      s.estates[3] = { index: 3, owner: payer.id, level: 1, processing: false };
      m.paint();
      return { payer: payer.id, round: s.round, cash: payer.cash };
    });
    await page.waitForTimeout(60);
    await page.locator('#mono-hud button[data-action="end"]').click();
    await page.waitForFunction(() => window.__monoMain.auction() !== null, null, { timeout: 5000 });
    facts.eAuction = await page.evaluate(() => {
      const a = window.__monoMain.auction();
      return { trigger: a.trigger, lot: a.lot, pending: a.pending.slice(), amount: a.amount };
    });
    assert(facts.eAuction.trigger === 'loan-overdue',
      `应触发贷款强执拍卖（trigger=loan-overdue），实际 ${facts.eAuction.trigger}`);
    assert(facts.eAuction.lot.index === 3, `强执拍品应为未抵押地块 3，实际 ${facts.eAuction.lot.index}`);
    assert(facts.eAuction.pending.length === 3, `应等 3 名真人出价，实际 ${facts.eAuction.pending.length}`);

    await drainAuction(page);
    const afterE = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[3];
      return {
        loan: p.loan ? { ...p.loan } : null, cash: p.cash, bankrupt: p.bankrupt,
        estate3Owner: s.estates[3] ? s.estates[3].owner : null,
      };
    });
    facts.eAfter = afterE;
    assert(afterE.estate3Owner === 1, `成交后地块应转移给玩家 1（并列取小 id），实际 ${afterE.estate3Owner}`);
    assert(afterE.bankrupt === false, '成交款冲抵后原主不应破产');
    assert(afterE.loan === null, `成交款应冲抵本金至结清（loan = null），实际 ${JSON.stringify(afterE.loan)}`);
    /* 本金 100×1.06 = ￥106；起拍价 = 变卖价 ￥30；成交 ￥30；现金 200 + 30 − 106 = ￥124 */
    assert(afterE.cash === 124, `强执终态现金应为 ￥124（200 + 30 − 106），实际 ${afterE.cash}`);
    await page.close();
  }

  /* ============ 页面 F：抵押超期（mortgage-overdue） ============ */
  {
    const page = await openPage();
    facts.fSetup = await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      const payer = s.players[3];
      s.current = 3; s.phase = 'settled';
      payer.cash = 3000; payer.deposit = 0; payer.loan = null;
      s.estates[11] = { index: 11, owner: payer.id, level: 1, processing: false };
      payer.mortgages = [{ principal: 200, rate: 0.04, due: s.round - 1, overdue: 0, index: 11 }];
      m.paint();
      return { payer: payer.id, round: s.round };
    });
    await page.waitForTimeout(60);
    await page.locator('#mono-hud button[data-action="end"]').click();
    await page.waitForFunction(() => window.__monoMain.auction() !== null, null, { timeout: 5000 });
    facts.fAuction = await page.evaluate(() => {
      const a = window.__monoMain.auction();
      return { trigger: a.trigger, lot: a.lot, pending: a.pending.slice(), amount: a.amount };
    });
    assert(facts.fAuction.trigger === 'mortgage-overdue',
      `应触发抵押超期拍卖（trigger=mortgage-overdue），实际 ${facts.fAuction.trigger}`);
    assert(facts.fAuction.lot.index === 11, `拍品应为抵押物地块 11（王氏鹿膏），实际 ${facts.fAuction.lot.index}`);
    assert(facts.fAuction.lot.startPrice === 208,
      `起拍价应为借款额（200×1.04 = ￥208），实际 ${facts.fAuction.lot.startPrice}`);

    await drainAuction(page);
    const afterF = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[3];
      return {
        mortgages: p.mortgages.length, cash: p.cash, bankrupt: p.bankrupt,
        estate11Owner: s.estates[11] ? s.estates[11].owner : null,
      };
    });
    facts.fAfter = afterF;
    assert(afterF.estate11Owner === 1, `成交后抵押物应转移给玩家 1，实际 ${afterF.estate11Owner}`);
    assert(afterF.mortgages === 0, `成交款应还清该笔抵押（mortgages 清空），实际 ${afterF.mortgages}`);
    assert(afterF.bankrupt === false, '原主不应破产');
    await page.close();
  }
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
  console.error(`\n[e2e:m20-2] FAIL · ${why}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
