import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });

/* 1) 开局：手牌收进牌袋抽屉（spec §7.3）——默认收起（0 槽 / 0 键），点牌袋键才展开 5 槽 */
facts.handClosed = await page.evaluate(() => {
  const m = window.__monoMain;
  return {
    handLen: m.game.state.hands[0].length,
    handSlots: m.scene.instancesOf().filter((i) => i.id === 'ui.handSlot').length,
    buttons: document.querySelectorAll('#mono-panels button[data-action^="card:"]').length,
    handKey: document.querySelectorAll('#mono-hud button[data-action="hand"]').length,
    keyLabel: m.scene.instancesOf().find((i) => i.id === 'ui.qk')?.state?.label ?? null,
  };
});
gate.hand_len = facts.handClosed.handLen === 5;
gate.hand_closed = facts.handClosed.handSlots === 0 && facts.handClosed.buttons === 0
  && facts.handClosed.handKey === 1 && facts.handClosed.keyLabel === '手牌';

await page.evaluate(() => document.querySelector('#mono-hud button[data-action="hand"]')?.click());
await page.waitForTimeout(60);

/* 牌袋抽屉展开：5 槽入画 + 5 个道具键可点（牌袋键文案翻为「收起手牌」） */
facts.hand = await page.evaluate(() => {
  const m = window.__monoMain;
  const ids = m.scene.instancesOf().map((i) => i.id);
  return {
    handSlots: ids.filter((id) => id === 'ui.handSlot').length,
    buttons: document.querySelectorAll('#mono-panels button[data-action^="card:"]').length,
    overlay: document.querySelectorAll(
      '#mono-panels button[data-action="card:close"], #mono-panels button[data-action^="stock:"]',
    ).length,
    keyLabel: m.scene.instancesOf().find((i) => i.id === 'ui.qk')?.state?.label ?? null,
    phase: m.game.state.phase,
  };
});
gate.hand_slots = facts.hand.handSlots === 5;
gate.hand_hit = facts.hand.buttons === 5 && facts.hand.overlay === 0 && facts.hand.keyLabel === '收起手牌';

await page.screenshot({ path: `${OUT}/mono-m5-01-hand.png` });

/* 收起抽屉 → 回到默认视图（后续步骤与地块卡 / 棋盘口径一致） */
await page.evaluate(() => document.querySelector('#mono-hud button[data-action="hand"]')?.click());
await page.waitForTimeout(60);

/* 1.5) 落地地块卡（spec §7.3）：停在无主 shop → 卡滑入 + 卡上两枚次要键（命中区同源 TILE_CARD_BTN_Y） */
facts.tileCard = await page.evaluate(() => {
  const m = window.__monoMain;
  const g = m.game;
  const r = g.rollDice();
  g.state.players[0].pos = ((3 - r.total) % 32 + 32) % 32;   // index 3 = 长峰特产（无主 shop）
  g.moveCurrent();
  g.settleCurrent();
  m.paint();
  const inst = m.scene.instancesOf();
  const card = inst.find((i) => i.id === 'ui.tileCard');
  const buy = document.querySelector('#mono-hud button[data-action="buy"]');
  return {
    phase: g.state.phase,
    cards: inst.filter((i) => i.id === 'ui.tileCard').length,
    title: card?.state?.title ?? null,
    sub: card?.state?.sub ?? null,
    cardBox: card?.box ?? null,
    secCount: inst.filter((i) => i.id === 'ui.button.secondary').length,
    hitTop: buy ? Number.parseFloat(buy.style.top) : null,
    hitLeft: buy ? Number.parseFloat(buy.style.left) : null,
    hitW: buy ? Number.parseFloat(buy.style.width) : null,
    hitH: buy ? Number.parseFloat(buy.style.height) : null,
    handSlots: inst.filter((i) => i.id === 'ui.handSlot').length,
  };
});
gate.tile_card = facts.tileCard.phase === 'settled' && facts.tileCard.cards === 1
  && String(facts.tileCard.title).includes('停在') && String(facts.tileCard.title).includes('你在这里')
  && facts.tileCard.sub === '尚未售出 · 可买下';
/* 卡体 374×76（与 TILE_CARD_W/H 同源）；卡上买地键命中区 = TILE_CARD_BTN_Y(548) 起、
   宽高 = HUD_BTN_SECONDARY_W/H(110×46)、左 = HUD_BTN_BUY_X(31) —— 视觉与命中同源（spec §12 高风险项） */
gate.tile_card_btn = facts.tileCard.cardBox?.w === 374 && facts.tileCard.cardBox?.h === 76
  && facts.tileCard.secCount === 1
  && facts.tileCard.hitTop === 548 && facts.tileCard.hitLeft === 31
  && facts.tileCard.hitW === 110 && facts.tileCard.hitH === 46;
gate.tile_card_exclusive = facts.tileCard.handSlots === 0;   // 与牌袋抽屉互斥（台位重叠）

await page.screenshot({ path: `${OUT}/mono-m5-01b-tilecard.png` });

/* 收尾：结束该回合并把行动者还原为 0 号（后续步骤均按 0 号玩家写 pos） */
await page.evaluate(() => {
  const m = window.__monoMain;
  m.game.endTurn();
  m.game.state.current = 0;
  m.paint();
});

/* 2) 炸弹：L1 对手地块 → 炸回无主（删键），手牌消耗 */
facts.bomb = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
  m.paint();
  const before = s.estates[3]?.level ?? null;
  const out = m.game.useCard('bomb', 3);
  const after = s.estates[3] ?? null;
  m.paint();
  return {
    ok: out.ok, reason: out.reason ?? null, before,
    afterGone: after === null,
    held: s.hands[0].includes('bomb'),
  };
});
gate.bomb_ok = facts.bomb.ok === true;
gate.bomb_down = facts.bomb.before === 1 && facts.bomb.afterGone === true;
gate.bomb_used = facts.bomb.held === false;

await page.screenshot({ path: `${OUT}/mono-m5-02-bomb.png` });

/* 3) 抽卡翻牌：落到 fate 格 → 浮层出现卡面（文案取自 cards.ts） */
facts.draw = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const r = m.game.rollDice();
  s.players[0].pos = ((2 - r.total) % 32 + 32) % 32;
  m.game.moveCurrent();
  const settle = m.game.settleCurrent();
  m.paint();
  const ids = m.scene.instancesOf().map((i) => i.id);
  const badge = m.scene.instancesOf().find((i) => i.id === 'ui.badge');
  return {
    settleKind: settle.kind,
    pos: s.players[0].pos,
    deck: s.lastDraw?.deck ?? null,
    cardId: s.lastDraw?.cardId ?? null,
    title: s.lastDraw?.title ?? null,
    text: s.lastDraw?.text ?? null,
    cards: ids.filter((id) => id === 'ui.card').length,
    badgeText: badge?.state?.text ?? null,
    closeCount: document.querySelectorAll('#mono-panels button[data-action="card:close"]').length,
    /* 可见关闭键（注册表元素，非透明命中层） */
    closeVisible: m.scene.instancesOf().filter((i) => i.id === 'ui.panelClose').length,
    closeLabel: m.scene.instancesOf().find((i) => i.id === 'ui.panelClose')?.state?.label ?? null,
    /* 浮层展开时手牌行不可点：5 个道具键应为 0（`card:close` 不算手牌键） */
    handHit: document.querySelectorAll(
      '#mono-panels button[data-action="card:bomb"], #mono-panels button[data-action="card:barrier"],'
      + ' #mono-panels button[data-action="card:pardon"], #mono-panels button[data-action="card:teleport"],'
      + ' #mono-panels button[data-action="card:doubleRent"]',
    ).length,
  };
});
gate.draw_kind = facts.draw.settleKind === 'fate';
gate.draw_log = facts.draw.deck === 'fate' && typeof facts.draw.cardId === 'string'
  && typeof facts.draw.title === 'string' && typeof facts.draw.text === 'string';
gate.draw_panel = facts.draw.cards === 1 && facts.draw.badgeText === '命运';
gate.draw_close = facts.draw.closeCount === 1 && facts.draw.handHit === 0;
gate.draw_close_visible = facts.draw.closeVisible === 1 && facts.draw.closeLabel === '关闭';

await page.screenshot({ path: `${OUT}/mono-m5-03-draw.png` });

/* 关闭抽卡浮层（DOM 命中层 → clearEvent → 重画） */
await page.evaluate(() => document.querySelector('#mono-panels button[data-action="card:close"]')?.click());
await page.waitForTimeout(60);

/* 3.5) 预热若干轮：股价只在轮末 tick，折线图需要 ≥2 个历史点 */
facts.warm = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const target = s.round + 4;
  let turns = 0;
  /* 上一步（抽卡浮层那回合）停在 settled：先收尾回 idle 才能继续掷骰 */
  if (s.phase === 'settled') m.game.endTurn();
  while (s.round < target && turns < 40 && !s.over) {
    if (s.jail[s.current] > 0) {
      m.game.skipTurn();
    } else {
      m.game.rollDice();
      m.game.moveCurrent();
      m.game.settleCurrent();
      m.game.endTurn();
    }
    turns++;
  }
  m.paint();
  return {
    turns, round: s.round, over: s.over,
    histLen: (s.priceHistory?.SY01 ?? []).length,
  };
});
gate.warm_rounds = facts.warm.round >= 5 && facts.warm.over === false;
gate.warm_history = facts.warm.histLen >= 3;

/* 4) 股票盘：落到 index 19 → 盘面常开；DOM 点「买 1」→ 持股 +1、现金 −价 */
facts.stock = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  if (s.phase !== 'idle') m.game.endTurn();
  s.current = 0;
  s.jail[0] = 0;
  const r = m.game.rollDice();
  s.players[0].pos = ((19 - r.total) % 32 + 32) % 32;
  m.game.moveCurrent();
  const settle = m.game.settleCurrent();
  m.paint();
  const rows = m.scene.instancesOf().filter((i) => i.id === 'ui.stockRow').length;
  /* M20.3-B 版式 A：买键拆成三档（`data-target` = `code:tier`），点「买 1 手」= 1 股 */
  const buyBtn = document.querySelector('#mono-panels button[data-action="stock:buy"][data-target="SY01:1"]');
  const cashBefore = s.players[0].cash;
  const priceBefore = s.quotes.SY01;
  buyBtn?.click();
  const result = {
    settleKind: settle.kind, pos: s.players[0].pos, rows,
    buyBtn: buyBtn !== null,
    priceBefore, cashBefore,
    shares: s.portfolios[0].SY01?.shares ?? 0,
    spend: cashBefore - s.players[0].cash,
    tradeKind: s.lastEvent?.kind ?? null,
  };
  m.paint();
  const inst = m.scene.instancesOf();
  const row0 = inst.find((i) => i.id === 'ui.stockRow');
  const chart = inst.find((i) => i.id === 'ui.stockChart');
  return {
    ...result,
    rowsAfter: inst.filter((i) => i.id === 'ui.stockRow').length,
    /* 版式 A：底板换成加高注册项；四行选中键 + 买卖各三档 */
    panelId: inst.find((i) => i.id === 'showcase.panelStock')?.id ?? null,
    selKeys: document.querySelectorAll('#mono-panels button[data-action="stock:select"]').length,
    sellAfter: document.querySelectorAll('#mono-panels button[data-action="stock:sell"]').length,
    /* 可见买/卖键（注册表元素）+ 行情行持股/市值 + 折线序列 */
    buyVisible: inst.filter((i) => i.id === 'ui.tradeBuy').length,
    sellVisible: inst.filter((i) => i.id === 'ui.tradeSell').length,
    buyLabels: inst.filter((i) => i.id === 'ui.tradeBuy').map((i) => i.state?.label ?? null),
    closeVisible: inst.filter((i) => i.id === 'ui.panelClose').length,
    rowShares: row0?.state?.shares ?? null,
    rowValue: row0?.state?.value ?? null,
    chartSeries: Array.isArray(chart?.state?.series) ? chart.state.series.length : 0,
    chartLabel: chart?.state?.label ?? null,
  };
});
gate.stock_kind = facts.stock.settleKind === 'stock' && facts.stock.pos === 19;
gate.stock_rows = facts.stock.rows === 4 && facts.stock.rowsAfter === 4;
gate.stock_buy = facts.stock.buyBtn === true && facts.stock.shares === 1
  && facts.stock.spend === facts.stock.priceBefore && facts.stock.tradeKind === 'trade';
gate.stock_sell = facts.stock.sellAfter === 3;
gate.stock_keys_visible = facts.stock.buyVisible === 3 && facts.stock.sellVisible === 3
  && facts.stock.buyLabels.join('|') === '买 1 手|买 5 手|买全仓'
  && facts.stock.panelId === 'showcase.panelStock' && facts.stock.selKeys === 4
  && facts.stock.closeVisible === 0;
gate.stock_row_shares = facts.stock.rowShares === 1 && facts.stock.rowValue === facts.stock.priceBefore;
gate.stock_chart_line = facts.stock.chartSeries >= 3 && facts.stock.chartLabel === 'SY01 走势';

await page.screenshot({ path: `${OUT}/mono-m5-04-stock.png` });

/* 5) 监狱：落到 index 12（无免罚卡）→ 禁行 2；主按钮变「跳过（2）」；skipTurn → 1 */
facts.jail = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  m.game.endTurn();
  s.current = 0;
  s.hands[0] = s.hands[0].filter((k) => k !== 'pardon');
  const r = m.game.rollDice();
  s.players[0].pos = ((12 - r.total) % 32 + 32) % 32;
  m.game.moveCurrent();
  const settle = m.game.settleCurrent();
  m.game.endTurn();
  s.current = 0;
  m.paint();
  const primary = m.scene.instancesOf().find((i) => i.id === 'ui.button.primary');
  const label = m.scene.instancesOf().find((i) => i.id === 'ui.label');
  const btn = document.querySelector('#mono-hud button[data-primary]');
  return {
    settleKind: settle.kind, pos: s.players[0].pos, jail: s.jail[0],
    primaryAction: btn?.dataset.action ?? null,
    primaryLabel: primary?.state?.label ?? null,
    statusText: label?.state?.text ?? null,
  };
});
gate.jail_kind = facts.jail.settleKind === 'jail' && facts.jail.pos === 12;
gate.jail_turns = facts.jail.jail === 2;
gate.jail_hud = facts.jail.primaryAction === 'skip' && facts.jail.primaryLabel === '跳过（2）'
  && String(facts.jail.statusText).includes('禁行 2 回合');

await page.screenshot({ path: `${OUT}/mono-m5-05-jail.png` });

facts.skip = await page.evaluate(() => {
  const m = window.__monoMain;
  const out = m.game.skipTurn();
  m.paint();
  return { remaining: out.remaining, jail: m.game.state.jail[0] };
});
gate.jail_skip = facts.skip.remaining === 1 && facts.skip.jail === 1;

/* 6) 结算面板：headless 跑到胜负 → 4 行名次 + 主按钮禁用 */
facts.settle = await page.evaluate(() => {
  const m = window.__monoMain;
  const winner = m.sim();
  const s = m.game.state;
  return {
    winner, over: s.over, round: s.round,
    rows: m.scene.instancesOf().filter((i) => i.id === 'ui.settleRow').length,
    badge: m.scene.instancesOf().find((i) => i.id === 'ui.badge')?.state?.text ?? null,
    primary: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    handSlots: m.scene.instancesOf().filter((i) => i.id === 'ui.handSlot').length,
  };
});
gate.settle_over = facts.settle.over === true;
gate.settle_rows = facts.settle.rows === 4 && facts.settle.badge === '本局结算';
/* 结算常态：牌袋抽屉收起（手牌槽归零），故这里断言 0 槽 */
gate.settle_hud = facts.settle.primary === null && facts.settle.handSlots === 0;

await page.screenshot({ path: `${OUT}/mono-m5-06-settle.png` });
await page.close();

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);