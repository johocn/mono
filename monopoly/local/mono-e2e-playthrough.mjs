import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

/*
 * M7 补充闸门 · 「整局可跑」的真实点击证据（spec §11 表 1 / §11.7「可完整打一局」）。
 *
 * 与既有证据的区别：
 *   - `__monoMain.sim()`（M4/M7）= 程序化 headless，**绕过 UI**；
 *   - M4 的三连点 = 只走了一回合（roll → move → settle）。
 * 本闸门**全程只用真实交互**（Playwright 在透明命中层的 `<button>` 上派发真实鼠标点击），
 * 把一局从开机打到「破产/胜利（state.over===true）」，并按 spec 采集关键状态截图。
 *
 * 断言：
 *   1 线上 URL（?play=1&seed=20260928&nofx=1）就绪、无 pageerror / 无 console error
 *   2 逐步点击：点前读 `window.__monoMain.game.state` 决定动作，点后比对状态签名，
 *     若某次点击**未改变状态** → 判 UI 缺陷，立即失败并 dump 状态
 *   3 合法路径：idle→掷骰 / rolled→前进 / moved→结算 / settled→(用卡 ≥1 次 · 买地 · 升级 · 结束回合)；
 *     jail 禁行→跳过；到手牌/股票浮层时用一次卡、做一笔股票交易
 *   4 state.over===true 且结算面板给出胜者与 4 行名次（由点击到达，非 sim()）
 *   5 关键截图 7 张：开局/首次买地/首次升级/踩监狱/抽卡/股票盘/终局；两两内容哈希不同且非空
 *   6 硬上限：轮数 ≤ 61（设计目标）+ 墙钟超时（避免卡死挂住）
 *   7 仅当以上全真 exit 0；`--report-only` 恒 exit 0
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
const SEED = 20260928;
const MAX_ROUNDS = 61;              // 设计目标：ROUND_LIMIT(60) 之后一回合内必结束
const MAX_CLICKS = 8000;            // 点击次数硬上限
const WALL_MS = 420000;             // 墙钟上限 7 分钟
const REPORT_ONLY = process.argv.includes('--report-only');
mkdirSync(OUT, { recursive: true });

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

const errors = [];
const gate = {};
const facts = { tally: {}, clicks: 0, shots: {} };
const problems = [];

const browser = await chromium.launch();
const viewport = { width: 390, height: 844 };

/** 读整局状态快照（含浮层判定与命中层可点性） */
const readState = () => page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const hud = document.querySelector('#mono-hud');
  const panels = document.querySelector('#mono-panels');
  const enabled = (root, sel) => {
    const el = root && root.querySelector(sel);
    return el ? !el.disabled : null;
  };
  const overlay = s.over
    ? 'settle'
    : (s.phase !== 'settled'
      ? null
      : (s.players[s.current].pos === 19 ? 'stock' : (s.lastDraw ? 'draw' : null)));
  return {
    phase: s.phase,
    over: s.over,
    current: s.current,
    round: s.round,
    pos: s.players.map((p) => p.pos),
    cash: s.players.map((p) => p.cash),
    bankrupt: s.players.map((p) => p.bankrupt),
    jail: s.jail.slice(),
    dice: s.dice ? s.dice.total : null,
    estates: Object.keys(s.estates).map((k) => [Number(k), s.estates[k].owner, s.estates[k].level]),
    hands: s.hands.map((h) => h.slice().join(',')),
    lastDraw: s.lastDraw ? s.lastDraw.deck : null,
    lastEvent: s.lastEvent ? s.lastEvent.kind : null,
    overlay,
    primaryAction: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    buyEnabled: enabled(hud, 'button[data-action="buy"]'),
    upgradeEnabled: enabled(hud, 'button[data-action="upgrade"]'),
    closeEnabled: enabled(panels, 'button[data-action="card:close"]'),
    stockBuyEnabled: enabled(panels, 'button[data-action="stock:buy"]'),
    stockSellEnabled: enabled(panels, 'button[data-action="stock:sell"]'),
    cardDoubleRentEnabled: enabled(panels, 'button[data-action="card:doubleRent"]'),
  };
});

/** 状态签名：任何「有效点击」都必须让它变化，否则说明点了没反应（UI 缺陷） */
const sig = (s) => JSON.stringify({
  phase: s.phase, over: s.over, current: s.current, round: s.round,
  pos: s.pos, cash: s.cash, bankrupt: s.bankrupt, jail: s.jail, dice: s.dice,
  estates: s.estates, hands: s.hands, lastDraw: s.lastDraw, lastEvent: s.lastEvent,
});

let page;
const shot = async (label) => {
  const name = `mono-e2e-${label}.png`;
  const file = `${OUT}/${name}`;
  const buf = await page.screenshot({ path: file });
  facts.shots[label] = { file, hash: md5(buf), bytes: buf.length };
  return facts.shots[label];
};

/** 等动画层静止（nofx 下极快），再截关键帧，保证画面是终帧而非中间帧 */
const settleFx = async () => {
  await page.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(30);
};

/**
 * 真实交互：按选择器解析透明命中层的 `<button>` 并派发真实 `click` 事件
 * （走 `mountHud`/`mountPanels` 的 onclick → runAction → 引擎，与 M4 闸门同一口径；
 * 不用 `sim()`、不按坐标、不直接调引擎）。
 * 若元素缺失或 disabled → 直接抛错（即 UI 命中层缺陷），不静默跳过。
 * 只在「状态未变」时重试，杜绝重复触发。
 */
const click = async (sel, sigBefore) => {
  for (let i = 0; i < 3; i += 1) {
    try {
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) throw new Error(`命中层缺失 ${s}`);
        if (el.disabled) throw new Error(`命中键被禁用 ${s}`);
        el.click();
      }, sel);
    } catch (e) {
      if (i === 2) throw e;
    }
    await page.waitForTimeout(8);
    const st = await readState();
    if (sig(st) !== sigBefore) return st;
  }
  return readState();
};

const used = { card: false, trade: false };
let finalState = null;
let fatal = null;

try {
  page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  /* 空场景 baseline：用于证明每张截图确实画了东西（非空白） */
  const blank = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await blank.goto('about:blank');
  const blankBuf = await blank.screenshot();
  await blank.close();
  const blankHash = md5(blankBuf);

  const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=4&tour=0`;
  facts.url = url;
  facts.origin = ORIGIN;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

  let s = await readState();
  facts.seed = SEED;
  await shot('01-start');

  const t0 = Date.now();
  while (!s.over) {
    if (facts.clicks >= MAX_CLICKS) throw new Error(`点击次数越限 ${MAX_CLICKS}`);
    if (Date.now() - t0 > WALL_MS) throw new Error(`墙钟超时 ${WALL_MS}ms @round=${s.round}`);
    if (s.round > MAX_ROUNDS) throw new Error(`轮数越限 ${s.round} > ${MAX_ROUNDS}（仍未 over）`);

    let sel;
    let action;
    if (s.phase === 'idle' || s.phase === 'rolled' || s.phase === 'moved') {
      if (!s.primaryAction) throw new Error(`${s.phase} 阶段却无主按钮（命中层缺失）`);
      sel = '#mono-hud button[data-primary]';
      action = s.primaryAction;               // roll / move / settle / skip
    } else if (s.overlay === 'draw') {
      if (!facts.shots['05-draw']) { await settleFx(); await shot('05-draw'); }
      sel = '#mono-panels button[data-action="card:close"]';
      action = 'card:close';
    } else if (s.overlay === 'stock') {
      if (!facts.shots['06-stock']) { await settleFx(); await shot('06-stock'); }
      if (!used.trade && s.stockBuyEnabled) {
        sel = '#mono-panels button[data-action="stock:buy"]';
        action = 'stock:buy';
        used.trade = true;
      } else {
        sel = '#mono-hud button[data-primary]';
        action = s.primaryAction;             // end
      }
    } else if (!used.card && s.cardDoubleRentEnabled) {
      sel = '#mono-panels button[data-action="card:doubleRent"]';
      action = 'card:doubleRent';
      used.card = true;
    } else if (s.buyEnabled) {
      sel = '#mono-hud button[data-action="buy"]';
      action = 'buy';
    } else if (s.upgradeEnabled) {
      sel = '#mono-hud button[data-action="upgrade"]';
      action = 'upgrade';
    } else {
      sel = '#mono-hud button[data-primary]';
      action = s.primaryAction;               // end
    }

    if (!sel || !action) throw new Error(`无法决策下一步 phase=${s.phase} overlay=${s.overlay}`);

    const before = sig(s);
    const landedPos = s.phase === 'moved' ? s.pos[s.current] : null;
    /* eslint-disable no-await-in-loop */
    const next = await click(sel, before);
    if (sig(next) === before) {
      throw new Error(`点击未改变状态：${action} @phase=${s.phase} round=${s.round}`
        + ` selector=${sel} → 仍为 phase=${next.phase}`);
    }
    facts.clicks += 1;
    facts.tally[action] = (facts.tally[action] ?? 0) + 1;
    s = next;

    if (action === 'buy' && !facts.shots['02-firstbuy']) { await settleFx(); await shot('02-firstbuy'); }
    if (action === 'upgrade' && !facts.shots['03-firstupgrade']) { await settleFx(); await shot('03-firstupgrade'); }
    if (action === 'settle' && landedPos === 12 && !facts.shots['04-jail']) { await settleFx(); await shot('04-jail'); }
  }

  finalState = s;
  await settleFx();
  await shot('07-final');

  /* 终局：由点击到达（loop 退出即 over），且结算面板给出胜者 + 4 行名次 */
  facts.final = await page.evaluate(() => {
    const inst = window.__monoMain.scene.instancesOf();
    return {
      over: window.__monoMain.game.state.over,
      round: window.__monoMain.game.state.round,
      label: inst.find((i) => i.id === 'ui.label')?.state?.text ?? null,
      badge: inst.find((i) => i.id === 'ui.badge')?.state?.text ?? null,
      settleRows: inst.filter((i) => i.id === 'ui.settleRow').length,
      primary: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    };
  });

  gate.over = finalState.over === true;
  gate.winner = typeof facts.final.label === 'string'
    && facts.final.label.includes('胜者') && facts.final.settleRows === 4;
  gate.round = finalState.round <= MAX_ROUNDS;
  gate.reached_by_clicks = facts.clicks > 0 && facts.tally.roll > 0;
  gate.used_card = used.card === true;
  gate.used_trade = used.trade === true;

  /* 截图断言：7 张齐全、非空、两两不同 */
  const labels = ['01-start', '02-firstbuy', '03-firstupgrade', '04-jail', '05-draw', '06-stock', '07-final'];
  gate.shots_present = labels.every((l) => facts.shots[l] && facts.shots[l].bytes > 3000);
  gate.shots_nonblank = labels.every((l) => facts.shots[l] && facts.shots[l].hash !== blankHash);
  const hashes = labels.map((l) => facts.shots[l]?.hash);
  gate.shots_distinct = new Set(hashes.filter(Boolean)).size === labels.length;
  facts.blankHash = blankHash;
} catch (e) {
  fatal = e;
  problems.push(String(e && e.stack ? e.stack : e));
} finally {
  gate.noErrors = errors.length === 0;
}

/*
 * 追加：AI 局（1 真人 + 3 AI）跑到 over=true。
 * 真人回合沿用**真实点击**推进（与上面整局用例同口径）；AI 回合调用 `__monoMain.aiDriver.skipRest()`
 * —— 即 HUD「跳过本次」的同一公开 API（decideTurn → applyStep → runAction 全链路照跑），
 * 只是省去 450ms/步 的演出等待：否则 60 轮 × 3 AI × ~5 步会把整局拖过墙钟超时。
 */
try {
  const aiPage = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  aiPage.on('pageerror', (e) => errors.push(String(e)));
  aiPage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await aiPage.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=1&tour=0`, { waitUntil: 'networkidle' });
  await aiPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

  const tAI = Date.now();
  let aiClicks = 0;
  while (Date.now() - tAI < 180000) {
    const st = await aiPage.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      return {
        over: s.over,
        isHuman: m.seats[s.current] === null,
        phase: s.phase,
        lastDraw: Boolean(s.lastDraw),
        pos: s.players[s.current].pos,
      };
    });
    if (st.over) break;
    if (st.isHuman) {
      /* 真人回合：浮层先关（抽卡），否则走主按钮（roll/move/settle/skip/end） */
      const sel = st.phase === 'settled' && st.lastDraw && st.pos !== 19
        ? '#mono-panels button[data-action="card:close"]'
        : '#mono-hud button[data-primary]';
      await aiPage.evaluate((x) => {
        const el = document.querySelector(x);
        if (el && !el.disabled) el.click();
      }, sel);
      aiClicks += 1;
      await aiPage.waitForTimeout(20);
    } else {
      /* AI 回合：等价于点「跳过本次」——把本席位一次走完 */
      await aiPage.evaluate(() => window.__monoMain.aiDriver.skipRest());
      await aiPage.waitForTimeout(10);
    }
  }

  facts.aiGame = await aiPage.evaluate(() => {
    const m = window.__monoMain;
    const s = m.game.state;
    return {
      over: s.over,
      round: s.round,
      aiSeats: m.seats.filter((x) => x !== null).length,
      humans: m.seats.filter((x) => x === null).length,
    };
  });
  facts.aiClicks = aiClicks;
  gate.aiGame = facts.aiGame.over === true;
  await aiPage.screenshot({ path: `${OUT}/mono-e2e-08-ai-final.png` });
  facts.shots['08-ai-final'] = { file: `${OUT}/mono-e2e-08-ai-final.png` };
  await aiPage.close();
} catch (e) {
  gate.aiGame = false;
  problems.push(String(e && e.stack ? e.stack : e));
}

await browser.close();

facts.errors = errors;
facts.problems = problems;
const failed = Object.entries(gate).filter(([, v]) => !v).map(([k]) => k);

/* —— 摘要 —— */
console.log(JSON.stringify({
  url: facts.url,
  seed: facts.seed,
  round: finalState?.round ?? null,
  over: finalState?.over ?? null,
  clicks: facts.clicks,
  tally: facts.tally,
  final: facts.final ?? null,
  shots: facts.shots,
  blankHash: facts.blankHash ?? null,
  gate,
  errors,
}, null, 2));

if (fatal) console.error(`\n[fatal] ${fatal.stack ?? fatal}`);

const ok = failed.length === 0 && !fatal;
const exitCode = ok || REPORT_ONLY ? 0 : 1;
console.log(`\n[e2e:play] ${ok ? 'PASS' : 'FAIL'} · round=${finalState?.round ?? '-'}`
  + ` · clicks=${facts.clicks} · 命中动作 tally=${JSON.stringify(facts.tally)}`
  + ` · 退出码=${exitCode}${!ok && REPORT_ONLY ? '（--report-only 强制 0）' : ''}`);

process.exit(exitCode);
