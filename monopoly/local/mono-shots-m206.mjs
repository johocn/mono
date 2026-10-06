import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M20.6 · 经济闭环收口轮取证截图（spec §6 手机视口 390×844 @dpr2 → 780×1688 PNG，入 docs/verify/）。
 *
 * 口径与 mono-shots-m205.mjs 同源：**真实对局 + 真实 HUD 点击**，不绕过 `#mono-hud` 命中层。
 * 两处例外（浮层/局面无法按键指定）：
 *   ① 终局段位：直接改 `state.round` 后 `paint()`（段位只读 round，无副作用）；
 *   ② 板块新闻 / 设施控股：直接布置 `state.news` / `p.facilities` 后 `paint()`；
 *      板块小标必须走**真实前进**才能出气泡（`bubble` 为 main 内部闭包，不可程序化设置）。
 *
 * 截图 5 张：
 *   ① mono-m20-6-01-endgame-2.png    终局加速 Ⅱ（round 47）：角标「加速 Ⅱ · 租×1.8 市×1.6 讯×1.6」+ 进度条第 2 段高亮
 *   ② mono-m20-6-02-endgame-3.png    终局（round 54）：角标「终局 · 租×2.4 市×2 讯×2」+ 进度条第 3 段高亮
 *   ③ mono-m20-6-03-sector.png       板块新闻：新闻条前缀「板块·核心商圈 ×1.25」+ 前进气泡顶边「板块利好 ×1.25」小标
 *   ④ mono-m20-6-04-facility.png     设施浮层控股溢价：「基础分红 6%/轮」「你的持股 20 股 · 控股溢价」「预估分红 ￥320/轮」
 *   ⑤ mono-m20-6-05-winner.png       唯一胜者：破产 3 人后结束回合 → over=true、仅 1 人存活
 *
 * 机器闸门（确定性，全 true 才 PASS）：见文件末尾 `gate` 的逐项含义。
 *
 * MONO_ORIGIN 默认打本地预览（`npm run preview` 的 52301；端口被占会自动顺延，用启动日志里的实际端口覆盖）。
 * 线上：$env:MONO_ORIGIN='https://game.joho.cn/tour'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52301').replace(/\/+$/, '');
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const HUD_QK_Y = 607;                  // 快键行顶（浮层内可点元素底必须 ≤ 606，见 layout.ts 硬约束）

const CORE_TILE = 1;                   // TILE_TIER[1] === 'core'（商家格，板块利好命中）
const START_CASH = 5000;               // 布置局面的现金（够付租）
const FACILITY_SHARES = 20;            // 鹿乡银行设施总股本 20 ⇒ 全持 = 控股
const CONTROLLING_DIVIDEND = 320;      // 240 基础（200×20×0.06）+ 80 控股溢价 round(200×20×0.02)

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
  const badge = inst.find((i) => i.id === 'ui.endgameBadge');
  const ebar = inst.find((i) => i.id === 'ui.endgameBar');
  const news = inst.find((i) => i.id === 'ui.newsTicker');
  const sector = inst.find((i) => i.id === 'ui.sectorTag');
  const bubble = inst.find((i) => i.id === 'ui.bubble');
  return {
    badge: badge ? badge.state : null,
    ebar: ebar ? ebar.state : null,
    badgeCount: inst.filter((i) => i.id === 'ui.endgameBadge').length,
    barCount: inst.filter((i) => i.id === 'ui.endgameBar').length,
    newsCount: inst.filter((i) => i.id === 'ui.newsTicker').length,
    news: news ? news.state : null,
    sector: sector ? sector.state : null,
    bubble: bubble ? bubble.state : null,
    lines: rows.filter((r) => r.state?.variant === 'line').map((r) => r.state?.text ?? null),
    panel: inst.filter((i) => i.id === 'showcase.panel').length,
  };
});

/** 命中层按钮快照（`#mono-hud` DOM 顺序 = HUD 按钮产出顺序） */
const hudActionCount = (p) => p.evaluate(() => document.querySelectorAll('#mono-hud button[data-action]').length);

/** 浮层内所有命中按钮的底边（CSS 像素）——必须 ≤ 606（HUD 快键行画在其上且可点） */
const hitBottom = (p) => p.evaluate(() => {
  const ys = [...document.querySelectorAll('#mono-panels button')]
    .map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height; });
  return ys.length ? Math.max(...ys) : null;
});

/* ============ 页面 A：①② 终局三段角标与进度条 ============ */
const a = await openPage();

const setRound = async (round) => {
  await a.evaluate((r) => { window.__monoMain.game.state.round = r; window.__monoMain.paint(); }, round);
  await a.waitForTimeout(120);
  return snapshot(a);
};

/* 段外（round 39）：角标 / 进度条均不出 */
const off = await setRound(39);
facts.off = { badgeCount: off.badgeCount, barCount: off.barCount };
gate.endgame_off = off.badgeCount === 0 && off.barCount === 0;
const hudButtonsOff = await hudActionCount(a);

/* 加速 Ⅰ（round 40）断言（不出图） */
const s40 = await setRound(40);
gate.endgame_stage1 = s40.badge?.label === '加速 Ⅰ · 租×1.4 市×1.3 讯×1.3' && s40.ebar?.stage === 1;

/* ② 加速 Ⅱ（round 47）出图 */
const s47 = await setRound(47);
facts.stage2 = { badge: s47.badge, ebar: s47.ebar };
gate.endgame_stage2 = s47.badge?.label === '加速 Ⅱ · 租×1.8 市×1.6 讯×1.6' && s47.ebar?.stage === 2;
await a.screenshot({ path: `${OUT}/mono-m20-6-01-endgame-2.png` });

/* ③ 终局（round 54）出图 */
const s54 = await setRound(54);
facts.stage3 = { badge: s54.badge, ebar: s54.ebar };
gate.endgame_stage3 = s54.badge?.label === '终局 · 租×2.4 市×2 讯×2' && s54.ebar?.stage === 3;
await a.screenshot({ path: `${OUT}/mono-m20-6-02-endgame-3.png` });

/* 角标 / 进度条为信息带：不吃事件 ⇒ HUD 命中按钮数逐值不变 */
const hudButtonsOn = await hudActionCount(a);
facts.hudButtons = { off: hudButtonsOff, on: hudButtonsOn };
gate.endgame_info_only = hudButtonsOn === hudButtonsOff;
await a.close();

/* ============ 页面 B：③ 板块新闻条前缀 + 前进气泡板块小标 ============ */
const b = await openPage();

/* 布置：站 0 号格 + 1 号格（core）为 2 号玩家 L1 自有 + 板块利好 ×1.25；
   关技能（孙悟空「筋斗云」stepBonus +1 会让落格偏移），使步数 = 骰点，便于精确落格 */
facts.sectorSetup = await b.evaluate(({ tile, cash }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const me = s.players[0];
  s.abilitiesOn = false;
  me.pos = 0; me.cash = cash;
  s.hands[0] = s.hands[0].filter((k) => k !== 'pardon');    // 去免罚牌，确保收租真实发生
  s.estates[tile] = { index: tile, owner: 2, level: 1, processing: false };
  s.news = {
    id: 'shot-sector', sentiment: 'good', scope: 'sector', target: 'core',
    title: '核心商圈客流爆棚，地租水涨船高', magnitude: 1.25,
  };
  s.current = 0; s.phase = 'idle'; s.lastDraw = null;
  m.paint();
  return { pos: me.pos, news: s.news.id };
}, { tile: CORE_TILE, cash: START_CASH });

/* 真实点 HUD「掷骰」→ 读总点数 → 回拨站位，使「前进」恰好落在 1 号格（core） */
await b.locator('#mono-hud button[data-action="roll"]').click();
await b.waitForTimeout(120);
facts.backstep = await b.evaluate(({ tile, size }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  const total = s.dice?.total ?? 0;
  s.players[0].pos = ((tile - total) % size + size) % size;
  m.paint();
  return { dice: total, pos: s.players[0].pos };
}, { tile: CORE_TILE, size: 32 });

/* 真实点 HUD「前进」→ 落 1 号格（core）⇒ 前进气泡 + 顶边「板块利好 ×1.25」小标。
   气泡是**定时收起**（`BUBBLE_MOVE_HOLD_MS = 820ms`），比一次 780×1688 截图还短 ⇒ 截图与快照
   无法在同一瞬间取全。故**只屏蔽「delay 恰为 820ms」的那次定时器**（其它定时器照常放行），
   让真实点击链路产生的气泡 / 板块小标在取景期间保持可见；气泡与文案本身不经任何改写。 */
await b.evaluate(() => {
  const raw = window.setTimeout.bind(window);
  window.setTimeout = ((fn, ms, ...rest) =>
    (ms === 820 ? 0 : raw(fn, ms, ...rest)));
});
await b.locator('#mono-hud button[data-action="move"]').click();
await b.waitForTimeout(200);
const snapSector = await snapshot(b);
facts.sectorPage = snapSector;
await b.screenshot({ path: `${OUT}/mono-m20-6-03-sector.png` });

gate.sector_prefix = snapSector.newsCount === 1
  && snapSector.news?.prefix === '板块·核心商圈 ×1.25';
gate.sector_tag = snapSector.sector?.text === '板块利好 ×1.25' && snapSector.sector?.sentiment === 'good';
gate.sector_tag_over_bubble = snapSector.bubble !== null && snapSector.sector !== null
  && snapSector.bubble?.tone === 'move';
await b.close();

/* ============ 页面 C：④ 设施浮层控股溢价 ============ */
const c = await openPage();
facts.facilitySetup = await c.evaluate(({ shares }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.players[0].cash = 5000;
  s.players[0].facilities = { bank: shares };
  s.news = null;                                    // 隔离新闻系数，断言逐字文案
  s.phase = 'idle';
  m.setFacility(true, 'bank');
  return { shares };
}, { shares: FACILITY_SHARES });
await c.waitForTimeout(150);
const snapFac = await snapshot(c);
facts.facilityPage = snapFac;
facts.facilityBottom = await hitBottom(c);
gate.facility_pct = snapFac.lines.includes('已售 20/20 股 · 基础分红 6%/轮');
gate.facility_controlling = snapFac.lines.includes(`你的持股 ${FACILITY_SHARES} 股 · 控股溢价`);
gate.facility_estimate = snapFac.lines.includes(`预估分红 ￥${CONTROLLING_DIVIDEND}/轮`);
gate.facility_no_overlap = facts.facilityBottom !== null && facts.facilityBottom <= HUD_QK_Y;
await c.screenshot({ path: `${OUT}/mono-m20-6-04-facility.png` });
await c.close();

/* ============ 页面 D：⑤ 唯一胜者闸门 ============ */
const d = await openPage();
facts.winner = await d.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  /* 破产三席：清空现金 / 存款 / 持仓 / 地产（与真实破产清算后的净资产口径一致，结算表才读得通） */
  for (const id of [2, 3, 4]) {
    const p = s.players[id - 1];
    p.bankrupt = true; p.cash = 0; p.deposit = 0;
    s.portfolios[id - 1] = {};
  }
  for (const k of Object.keys(s.estates)) {
    if (s.estates[Number(k)].owner !== 1) delete s.estates[Number(k)];
  }
  s.current = 0; s.phase = 'settled'; s.news = null;
  m.game.endTurn();
  m.paint();
  return {
    over: s.over,
    alive: s.players.filter((p) => !p.bankrupt).map((p) => p.id),
    round: s.round,
  };
});
await d.waitForTimeout(150);
facts.winnerPage = await snapshot(d);
await d.screenshot({ path: `${OUT}/mono-m20-6-05-winner.png` });
gate.winner_gate = facts.winner.over === true
  && facts.winner.alive.length === 1 && facts.winner.alive[0] === 1;
await d.close();

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m20-6-shots] gate:', JSON.stringify(gate));
console.log('[m20-6-shots] facts:', JSON.stringify(facts));
console.log('[m20-6-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m20-6-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m20-6-shots] PASS');