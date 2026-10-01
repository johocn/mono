import { chromium } from 'playwright';

/*
 * M20.1 · 破产拍卖 + 自由出售 e2e（真实页面 + 真实点击，全程走 UI 命中层）。
 *
 * 页面 A（破产拍卖）：布置「破产者持 L3 地产 + 现金 ￥10」且「13 号 shop 归玩家 2」，
 *   掷骰 → 读点数 → 校正落点 → 前进 → 结算（13 号收租 L3 ￥105）；因现金不足且有地 ⇒ 进入拍卖。
 *   断言：auction() 非空且 pending = [2,3,4]；浮层三档出价键 + 放弃键；逐位真人点「起拍价」档
 *   （第一枚可用出价键）直到落槌；成交后地块转移给玩家 2（并列取小 id）、楼层保留 L3、原主不破产。
 * 页面 B（自由出售）：布置「当前真人持 3 号 L3 地产 + 现金 ￥100」，点 HUD「出售」→ 选目标态
 *   （自有地块金框）→ 点该格 → estate 删键回归可购买、现金 100 → 430、uiSel 清空。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */

const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour').replace(/\/+$/, '');
const SEED = 20261002;
const PAYER_TILE = 3;                       // 破产者地产（L3，起拍 ￥330）
const RENT_TILE = 13;                       // shop 格（TILE_TYPES[13] === 'shop'；L3 租金 ￥105）
const VIEW = { width: 390, height: 844 };
const WALL_MS = 60000;

const errors = [];
const facts = {};
const browser = await chromium.launch();
let fatal = null;

/** 建页 + 等 game 就绪 */
const openPage = async (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`;
  facts.url = url;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
};

/** 格号 → 页面 CSS 坐标（与 main.ts 命中层换算同口径：按 `#mono-ui` 放映矩形求 k） */
const cssOf = (page, tile) => page.evaluate((t) => {
  const q = window.__monoMain.cellXY(t);
  const rect = document.getElementById('mono-ui').getBoundingClientRect();
  const k = rect.width / 390;
  return { x: rect.left + q.x * k, y: rect.top + q.y * k, k };
}, tile);

try {
  /* ============ 页面 A：破产拍卖 ============ */
  const a = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await openPage(a);

  facts.setupA = await a.evaluate(({ payer, rent }) => {
    const m = window.__monoMain;
    const s = m.game.state;
    const me = s.players[s.current];
    const foe = s.players.find((pl) => pl.id !== me.id).id;
    me.cash = 10;
    /* 移除「免罚」：起始手牌全送含 `pardon`，会在收租时自动抵消租金而无法触发清算/拍卖 */
    s.hands[me.id - 1] = s.hands[me.id - 1].filter((k) => k !== 'pardon');
    s.estates[payer] = { index: payer, owner: me.id, level: 3, processing: false };
    s.estates[rent] = { index: rent, owner: foe, level: 3, processing: false };
    m.paint();
    return { current: me.id, foe, estate: s.estates[payer], rent: s.estates[rent] };
  }, { payer: PAYER_TILE, rent: RENT_TILE });

  /* 掷骰 → 读点数 → 校正落点 → 前进 → 结算 */
  await a.locator('#mono-hud button[data-action="roll"]').click();
  await a.waitForFunction(() => window.__monoMain.game.state.dice !== null, null, { timeout: 5000 });
  const total = await a.evaluate(() => window.__monoMain.game.state.dice.total);
  await a.evaluate(({ rent, total: t }) => {
    const s = window.__monoMain.game.state;
    s.players[s.current].pos = (rent - t + 32) % 32;
    window.__monoMain.paint();
  }, { rent: RENT_TILE, total });
  await a.locator('#mono-hud button[data-action="move"]').click();
  /* 落点校正：`createGame({ abilities: true })` ⇒ 当前玩家带技能「筋斗云」(stepBonus=1)，
     实际前进 = dice.total + 1，会越过 13 落在 14。故「前进」后把 pos 钉到 RENT_TILE 再结算，
     保证必落 13 号 shop 格触发收租破产拍卖（与 setup 同源的确定性布置，仍走真实 HUD 点击）。 */
  await a.evaluate(({ rent }) => {
    const s = window.__monoMain.game.state;
    s.players[s.current].pos = rent;
    window.__monoMain.paint();
  }, { rent: RENT_TILE });
  await a.locator('#mono-hud button[data-action="settle"]').click();
  await a.waitForFunction(() => window.__monoMain.auction() !== null, null, { timeout: 5000 });

  const pending = await a.evaluate(() => window.__monoMain.auction().pending.slice());
  const bidKeys = await a.locator('#mono-panels button[data-action="auction:bid"]').count();
  const passKeys = await a.locator('#mono-panels button[data-action="auction:pass"]').count();
  facts.auction = { pending, bidKeys, passKeys };
  if (pending.length !== 3) throw new Error(`待出价真人应为 3 名，实际 ${JSON.stringify(pending)}`);
  if (bidKeys !== 3) throw new Error(`出价档位应为 3 枚，实际 ${bidKeys}`);
  if (passKeys !== 1) throw new Error(`「放弃」键应为 1 枚，实际 ${passKeys}`);

  /* 逐位真人点「起拍价」档（第一枚可用出价键），直到落槌 */
  for (let guard = 0; guard < 8; guard++) {
    if (!(await a.evaluate(() => window.__monoMain.auction() !== null))) break;
    const clicked = await a.evaluate(() => {
      const btns = [...document.querySelectorAll('#mono-panels button[data-action="auction:bid"]')];
      const b = btns.find((x) => !x.disabled) ?? document.querySelector('#mono-panels button[data-action="auction:pass"]');
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) throw new Error('拍卖浮层无可用出价键 / 放弃键（不应发生）');
    await a.waitForTimeout(60);
  }
  await a.waitForFunction(() => window.__monoMain.auction() === null, null, { timeout: 5000 });

  facts.afterAuction = await a.evaluate((payer) => {
    const s = window.__monoMain.game.state;
    return { estate: s.estates[payer] ?? null, cash: s.players[0].cash, bankrupt: s.players[0].bankrupt };
  }, PAYER_TILE);
  const w = facts.afterAuction;
  if (!w.estate) throw new Error('拍卖后地产应转移（不得删键）');
  if (w.estate.owner !== 2) throw new Error(`中标者应为玩家 2（并列取小 id），实际 ${w.estate.owner}`);
  if (w.estate.level !== 3) throw new Error(`成交后楼层应保留 L3，实际 L${w.estate.level}`);
  if (w.bankrupt !== false) throw new Error('拍卖筹够即停 ⇒ 原主不应破产');
  await a.close();

  /* ============ 页面 B：自由出售 ============ */
  const b = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await openPage(b);
  facts.setupB = await b.evaluate((payer) => {
    const m = window.__monoMain;
    const s = m.game.state;
    const me = s.players[s.current];
    me.cash = 100;
    s.estates[payer] = { index: payer, owner: me.id, level: 3, processing: false };
    m.paint();
    return { current: me.id, cash: me.cash };
  }, PAYER_TILE);

  await b.locator('#mono-hud button[data-action="sell"]').click();
  await b.waitForFunction(() => window.__monoMain.uiSel()?.kind === 'sell', null, { timeout: 5000 });
  const cands = await b.evaluate(
    () => window.__monoMain.scene.instancesOf().filter((i) => i.id === 'board.tile.candidate').length,
  );
  facts.sellSelect = { uiSel: await b.evaluate(() => window.__monoMain.uiSel()), candidates: cands };
  if (cands <= 0) throw new Error('出售选目标态应高亮自有地块候选（board.tile.candidate）');

  const pt = await cssOf(b, PAYER_TILE);
  await b.mouse.click(pt.x, pt.y);
  await b.waitForFunction(() => window.__monoMain.uiSel() === null, null, { timeout: 5000 }).catch(() => {});
  await b.waitForTimeout(40);

  facts.afterSell = await b.evaluate((payer) => {
    const s = window.__monoMain.game.state;
    return { estate: s.estates[payer] ?? null, cash: s.players[0].cash, uiSel: window.__monoMain.uiSel() };
  }, PAYER_TILE);
  const sold = facts.afterSell;
  if (sold.estate) throw new Error('出售后地块应删键回归可购买（estate 仍在）');
  if (sold.cash !== 430) throw new Error(`出售 L3 应入账 ￥330（100 → 430），实际 ${sold.cash}`);
  if (sold.uiSel !== null) throw new Error('出售落库后 uiSel 应清空');
  await b.close();

  facts.elapsedMs = Date.now() - (facts.url ? 0 : 0);
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
  console.error(`\n[e2e:m20-1] FAIL · ${why}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
