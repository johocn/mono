import { chromium } from 'playwright';

/*
 * M20.5 · 经济平衡与风险增强 e2e（真实页面 + 真实 UI 点击，全程走 `#mono-hud` / `#mono-panels` 命中层）。
 *
 * 五个页面（各自独立确定性布置；金额键盘 / 保证金 / 道具全链路零随机）：
 *   A 存款键盘（D39）：站 9 号格现金 ￥2000 → 12 键 + 3 快捷档 + 2 确认键入画；
 *             金额 0 时两确认键禁用；逐位输入 + 快捷档累加 → 「存入 ￥600」→ 存款 ￥600 / 现金 ￥1400 / 输入串清空；
 *             位数上限 6 位截断、「清空」归零、「⌫」退位；「取出」按金额取出（超存款由引擎截断）。
 *   B 保证金页（D40/D41）：借款 ￥500 + 一块 L3 地产 → 「抵押补仓」借入 ￥264 直冲保证金（不落现金）；
 *             「现金追加」用余钱把借款清零（账户归 null）；债务条入画（抵押计入债务段）。
 *   C 查税 / 景气（D42/D43/D48）：跑一轮轮末 → 四家 `roundRent` 全部归零（settleAudits 已执行）；
 *             新闻条文案带「景气 N%」前缀；`newsHistory` 最近 4 条不重复（公平抽取）。
 *   D 经济道具（D44/D45）：手牌 11 槽；`taxShield` 槽位禁用（被动持有）；`card:subsidy` 落袋 ￥300；
 *             `card:boom` 景气度 +0.2 且 `lastEvent.kind === 'economy'`。
 *   E 商店扩容（D46）：道具商店 11 行全部入画并可点；关闭键 < 606 不压 HUD 快键行。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */

const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour').replace(/\/+$/, '');
const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const BANK_TILE = 9;                 // BANK_TILE_INDEX
const SHOP_TILE_13 = 13;             // TILE_TYPES[13] === 'shop'（L3 变卖价 ￥330 ⇒ 抵押额 ￥264）

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

/** 银行 UI 态（含 M20.5 的金额输入串） */
const bankState = (page) => page.evaluate(() => window.__monoMain.bank());

/** 点 HUD「银行」键开浮层（默认落在存款页） */
const openBank = async (page) => {
  await page.locator('#mono-hud button[data-action="bank"]').click();
  await page.waitForFunction(() => window.__monoMain.bank().open === true, null, { timeout: 5000 });
  await page.waitForTimeout(60);
};

/** 点金额键盘上的某个键面（`data-target` = 1..9 / 0 / 清空 / ⌫） */
const tapKey = async (page, key) => {
  await page.locator(`#mono-panels button[data-action="bank:key"][data-target="${key}"]`).click();
  await page.waitForTimeout(40);
};

try {
  /* ============ 页面 A：存款键盘（D39） ============ */
  {
    const page = await openPage();
    facts.aSetup = await page.evaluate((bank) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 2000; me.deposit = 0; me.loan = null; me.mortgages = []; me.margin = null; me.pos = bank;
      m.paint();
      return { me: me.id, cash: me.cash };
    }, BANK_TILE);
    await openBank(page);

    const counts = await page.evaluate(() => {
      const q = (a) => document.querySelectorAll(`#mono-panels button[data-action="${a}"]`).length;
      const keys = [...document.querySelectorAll('#mono-panels button[data-action="bank:key"]')].map((b) => b.dataset.target);
      const tiers = [...document.querySelectorAll('#mono-panels button[data-action="bank:tier"]')].map((b) => Number(b.dataset.target));
      return {
        key: q('bank:key'), tier: q('bank:tier'), deposit: q('bank:deposit'), withdraw: q('bank:withdraw'),
        select: q('bank:select'), close: q('bank:close'), keys, tiers,
        depositDisabled: document.querySelector('#mono-panels button[data-action="bank:deposit"]').disabled,
        withdrawDisabled: document.querySelector('#mono-panels button[data-action="bank:withdraw"]').disabled,
      };
    });
    facts.aPanel = counts;
    assert(counts.select === 4, `银行左列应为 4 行（含保证金），实际 ${counts.select}`);
    assert(counts.key === 12 && counts.tier === 3, `键盘应为 12 键 + 3 快捷档，实际 ${counts.key}+${counts.tier}`);
    assert(counts.keys.join(' ') === '1 2 3 4 5 6 7 8 9 清空 0 ⌫',
      `键盘键面应为 1..9 / 清空 / 0 / ⌫，实际 ${counts.keys.join(' ')}`);
    assert(counts.tiers.join(',') === '100,500,1000', `快捷档应为 +100/+500/+1000，实际 ${counts.tiers.join(',')}`);
    assert(counts.deposit === 1 && counts.withdraw === 1, '存款页应有「存入 / 取出」两枚独立确认键');
    assert(counts.depositDisabled && counts.withdrawDisabled, '金额为 0 时两枚确认键应禁用');

    /* 逐位输入 100 → 快捷档 +500 累加 → 存入 ￥600 */
    await tapKey(page, '1');
    await tapKey(page, '0');
    await tapKey(page, '0');
    assert((await bankState(page)).amount === '100', `键盘输入应为 100，实际 ${(await bankState(page)).amount}`);
    await page.locator('#mono-panels button[data-action="bank:tier"][data-target="500"]').click();
    await page.waitForTimeout(40);
    assert((await bankState(page)).amount === '600', `快捷档应在现值上累加（100+500=600），实际 ${(await bankState(page)).amount}`);

    await page.locator('#mono-panels button[data-action="bank:deposit"]').click();
    await page.waitForTimeout(60);
    const aDep = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { cash: p.cash, deposit: p.deposit, amount: window.__monoMain.bank().amount };
    });
    const barA = (await ids(page))['ui.debtBar'] ?? 0;
    facts.aDeposit = { ...aDep, debtBar: barA };
    assert(aDep.deposit === 600 && aDep.cash === 1400,
      `存入 ￥600 后应为 存款 600 / 现金 1400，实际 ${JSON.stringify(aDep)}`);
    assert(aDep.amount === '', '成交后金额输入串应清空');
    assert(barA === 1, '有存款后债务条应入画（ui.debtBar ×1）');

    /* 位数上限 6 位 + 「清空」+「⌫」 */
    for (const k of ['9', '9', '9', '9', '9', '9', '9']) await tapKey(page, k);
    assert((await bankState(page)).amount === '999999',
      `输入应截断在 6 位，实际 ${(await bankState(page)).amount}`);
    await tapKey(page, '⌫');
    assert((await bankState(page)).amount === '99999', `⌫ 应退一位，实际 ${(await bankState(page)).amount}`);
    await tapKey(page, '清空');
    assert((await bankState(page)).amount === '', '「清空」应归零');
    await tapKey(page, '0');
    await tapKey(page, '7');
    assert((await bankState(page)).amount === '7', `前导 0 不应累积（0 → 7），实际 ${(await bankState(page)).amount}`);

    /* 取出：超存款金额由引擎截断（取出 = min(输入, 存款)） */
    await tapKey(page, '清空');
    await tapKey(page, '9');
    await page.locator('#mono-panels button[data-action="bank:tier"][data-target="1000"]').click();
    await page.waitForTimeout(40);
    assert((await bankState(page)).amount === '1009', `9 + 1000 应为 1009，实际 ${(await bankState(page)).amount}`);
    await page.locator('#mono-panels button[data-action="bank:withdraw"]').click();
    await page.waitForTimeout(60);
    const aWd = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { cash: p.cash, deposit: p.deposit, amount: window.__monoMain.bank().amount };
    });
    const barWd = (await ids(page))['ui.debtBar'] ?? 0;
    facts.aWithdraw = { ...aWd, debtBar: barWd };
    assert(aWd.deposit === 0 && aWd.cash === 2000,
      `取出 1009 应被截断到全部存款 600（现金回 2000 / 存款 0），实际 ${JSON.stringify(aWd)}`);
    assert(aWd.amount === '', '取出成交后金额输入串应清空');
    assert(barWd === 0, '信贷清空后债务条应整条隐藏（零回归）');
    await page.close();
  }

  /* ============ 页面 B：保证金页（D40 / D41） ============ */
  {
    const page = await openPage();
    facts.bSetup = await page.evaluate(({ bank, tile }) => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 300; me.deposit = 0; me.loan = null; me.mortgages = []; me.pos = bank;
      me.margin = { principal: 500, rate: 0.08 };
      s.estates[tile] = { index: tile, owner: me.id, level: 3, processing: false };
      m.setBank(true, 'margin');
      return { me: me.id };
    }, { bank: BANK_TILE, tile: SHOP_TILE_13 });

    const mBtns = await page.evaluate(() => {
      const c = document.querySelector('#mono-panels button[data-action="bank:marginCash"]');
      const s = document.querySelector('#mono-panels button[data-action="bank:marginMortgage"]');
      return { cash: Boolean(c), mortgage: Boolean(s), cashDisabled: c.disabled, mortgageDisabled: s.disabled };
    });
    facts.bPanel = mBtns;
    assert(mBtns.cash && mBtns.mortgage, '保证金页应有「现金追加 / 抵押补仓」两枚键');
    assert(mBtns.cashDisabled === false && mBtns.mortgageDisabled === false,
      `借款 ￥500 + 有可抵押地块 ⇒ 两键均可点，实际 ${JSON.stringify(mBtns)}`);

    await page.locator('#mono-panels button[data-action="bank:marginMortgage"]').click();
    await page.waitForTimeout(60);
    const bMort = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { cash: p.cash, principal: p.margin ? p.margin.principal : 0, mortgages: p.mortgages.map((m) => ({ i: m.index, p: m.principal })) };
    });
    facts.bMortgage = bMort;
    assert(bMort.mortgages.length === 1 && bMort.mortgages[0].i === SHOP_TILE_13,
      `抵押补仓应新增一笔 index=${SHOP_TILE_13} 的抵押，实际 ${JSON.stringify(bMort.mortgages)}`);
    assert(bMort.mortgages[0].p === 264, `抵押额应为变卖价×80% = ￥264，实际 ${bMort.mortgages[0].p}`);
    assert(bMort.principal === 236, `借款应从 500 降至 236（500−264），实际 ${bMort.principal}`);
    assert(bMort.cash === 300, `抵押补仓款项直冲保证金、不落现金，实际现金 ${bMort.cash}`);

    await page.locator('#mono-panels button[data-action="bank:marginCash"]').click();
    await page.waitForTimeout(60);
    const bCash = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { cash: p.cash, margin: p.margin, mortgages: p.mortgages.length };
    });
    const barB = (await ids(page))['ui.debtBar'] ?? 0;
    facts.bCashTopUp = { ...bCash, debtBar: barB };
    assert(bCash.margin === null, `现金追加 ￥300 应把 ￥236 借款清零（margin = null），实际 ${JSON.stringify(bCash.margin)}`);
    assert(bCash.cash === 64, `现金应为 300 − 236 = ￥64，实际 ${bCash.cash}`);
    assert(bCash.mortgages === 1, '抵押笔数不受现金追加影响');
    assert(barB === 1, '抵押计入债务段 ⇒ 债务条应入画（ui.debtBar ×1）');
    await page.close();
  }

  /* ============ 页面 C：查税 / 景气 / 新闻公平（D42 / D43 / D47 / D48） ============ */
  {
    const page = await openPage();
    facts.cSetup = await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      const last = s.players[3];
      s.current = 3; s.phase = 'settled';                  // 末位玩家结束回合 → 跨 0 推进一轮
      for (const p of s.players) { p.roundRent = 1000; p.bankrupt = false; }   // 概率 = min(0.4, 2000×0.0002) = 0.4
      last.cash = 5000;
      m.paint();
      return { round: s.round };
    });
    await page.waitForTimeout(60);
    await page.locator('#mono-hud button[data-action="end"]').click();
    await page.waitForFunction((r) => window.__monoMain.game.state.round > r, facts.cSetup.round, { timeout: 5000 });
    await page.waitForTimeout(80);

    const afterC = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      return {
        round: s.round,
        economyIndex: s.economyIndex,
        rentBrackets: s.players.map((p) => p.roundRent),
        news: s.news ? { ...s.news } : null,
        history: s.newsHistory.slice(),
        lastEvent: s.lastEvent ? { ...s.lastEvent } : null,
      };
    });
    facts.cAfter = afterC;
    assert(afterC.round === facts.cSetup.round + 1, `应跨入下一轮，实际 round=${afterC.round}`);
    assert(afterC.rentBrackets.every((r) => r === 0), `轮末查税应清零全部租金台账，实际 ${JSON.stringify(afterC.rentBrackets)}`);
    assert(afterC.economyIndex >= 0.7 && afterC.economyIndex <= 1.3,
      `景气度应夹在 [0.7, 1.3]，实际 ${afterC.economyIndex}`);
    assert(afterC.news !== null, '轮末应抽出下一条新闻');
    assert(new Set(afterC.history).size === afterC.history.length,
      `新闻历史最近 ${afterC.history.length} 条不应重复（冷却 + 同向上限），实际 ${JSON.stringify(afterC.history)}`);

    const tick = await page.evaluate(() => {
      const inst = window.__monoMain.scene.instancesOf().find((i) => i.id === 'ui.newsTicker');
      return inst ? { prefix: inst.state.prefix, sentiment: inst.state.sentiment, scope: inst.state.scope } : null;
    });
    facts.cTicker = tick;
    assert(tick !== null, '新闻条应入画（ui.newsTicker）');
    assert(/^景气 \d+%$/.test(String(tick.prefix)),
      `新闻条前缀应为「景气 N%」，实际 ${JSON.stringify(tick.prefix)}`);
    await page.close();
  }

  /* ============ 页面 D：经济道具（D44 / D45） ============ */
  {
    const page = await openPage();
    facts.dSetup = await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[s.current];
      me.cash = 1000; me.pos = 5;                          // 非银行 / 非交易所，排除信贷与股票步
      window.__monoMain.paint();
      return { me: me.id, cash: me.cash, hand: s.hands[me.id - 1].slice(), index: s.economyIndex };
    });
    assert(facts.dSetup.hand.length === 11, `开局应全持有 11 张道具，实际 ${facts.dSetup.hand.length}`);
    for (const k of ['taxShield', 'subsidy', 'boom']) {
      assert(facts.dSetup.hand.includes(k), `开局手牌应含 ${k}`);
    }

    await page.locator('#mono-hud button[data-action="hand"]').click();
    await page.waitForTimeout(80);
    const slots = await page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('#mono-panels button[data-action^="card:"]')) {
        out[b.dataset.action.slice(5)] = b.disabled;
      }
      return out;
    });
    facts.dSlots = slots;
    assert(Object.keys(slots).length === 7, `scroll=0 应入画 7 槽，实际 ${Object.keys(slots).length}`);
    assert(slots.taxShield === true, 'taxShield 为被动牌 ⇒ 槽位应禁用');

    await page.locator('#mono-panels button[data-action="card:subsidy"]').click();
    await page.waitForTimeout(80);
    const dSub = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { cash: p.cash, has: s.hands[p.id - 1].includes('subsidy'), lastEvent: s.lastEvent ? { ...s.lastEvent } : null };
    });
    facts.dSubsidy = dSub;
    assert(dSub.cash === 1300, `subsidy 应立即 +￥300（1000 → 1300），实际 ${dSub.cash}`);
    assert(dSub.has === false, 'subsidy 打出后应消耗手牌');
    assert(dSub.lastEvent.kind === 'subsidy' && dSub.lastEvent.amount === 300,
      `subsidy 应落 lastEvent.kind=subsidy，实际 ${JSON.stringify(dSub.lastEvent)}`);

    /* boom 在第 8 槽（priority 55），横滑到末尾才入画 */
    await page.evaluate(() => window.__monoMain.setHandScroll(999));
    await page.waitForTimeout(60);
    await page.locator('#mono-panels button[data-action="card:boom"]').click();
    await page.waitForTimeout(80);
    const dBoom = await page.evaluate(() => {
      const s = window.__monoMain.game.state;
      const p = s.players[s.current];
      return { index: s.economyIndex, has: s.hands[p.id - 1].includes('boom'), lastEvent: s.lastEvent ? { ...s.lastEvent } : null };
    });
    facts.dBoom = dBoom;
    assert(Math.abs(dBoom.index - (facts.dSetup.index + 0.2)) < 1e-9,
      `boom 应抬景气 +0.2（${facts.dSetup.index} → ${facts.dSetup.index + 0.2}），实际 ${dBoom.index}`);
    assert(dBoom.has === false && dBoom.lastEvent.kind === 'economy', 'boom 应消耗手牌并落 lastEvent.kind=economy');
    await page.close();
  }

  /* ============ 页面 E：道具商店 11 行（D46） ============ */
  {
    const page = await openPage();
    await page.locator('#mono-hud button[data-action="store"]').click();
    await page.waitForFunction(() => window.__monoMain.store().open === true, null, { timeout: 5000 });
    await page.waitForTimeout(80);
    const store = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#mono-panels button[data-action="store:select"]')];
      return {
        n: rows.length,
        targets: rows.map((b) => b.dataset.target),
        enabled: rows.every((b) => !b.disabled),
      };
    });
    facts.eStore = store;
    assert(store.n === 11, `道具商店左列应 11 行，实际 ${store.n}`);
    assert(store.enabled, '11 行商品应全部可点');
    assert(store.targets.includes('taxShield') && store.targets.includes('subsidy') && store.targets.includes('boom'),
      `11 行应含三张新道具，实际 ${store.targets.join(',')}`);
    const panel = await page.evaluate(() => ({
      tall: window.__monoMain.scene.instancesOf().filter((i) => i.id === 'showcase.panelTall').length,
    }));
    facts.ePanel = panel;
    assert(panel.tall === 1, '商店应改用 showcase.panelTall 底板（11 行容得下）');
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
  console.error(`\n[e2e:m205] FAIL · ${why}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
