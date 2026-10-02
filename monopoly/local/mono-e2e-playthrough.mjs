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
 *   2b 首个动作点击用 Playwright **真实鼠标点击**（会派发 `pointerdown` → `audio.unlock()`）；
 *     其余仍用合成 `click` 以守住墙钟预算。gate `audio_unlocked` 证明 ctx 真被建起（spec §4.3c）
 *   3 合法路径：idle→掷骰 / rolled→前进 / moved→结算 / settled→(用卡 ≥1 次 · 买地 · 升级 · 结束回合)；
 *     jail 禁行→跳过；到手牌/股票浮层时用一次卡、做一笔股票交易
 *   3b 待拍态（`state.auction`）**优先于一切**：代真人在拍卖浮层点出价 / 放弃。`openLot` 只把真人
 *     竞拍人挂进 `pending`，而 `aiDriver.tick` / `skipRest` 在待拍态立即返回 ⇒ 真人不出价则整局永久挂起
 *   4 state.over===true 且结算面板给出胜者与 4 行名次（由点击到达，非 sim()）
 *   5 关键截图 7 张：开局/首次买地/首次升级/踩监狱/抽卡/股票盘/终局；两两内容哈希不同且非空
 *   6 硬上限：轮数 ≤ 61（设计目标）+ 墙钟超时（避免卡死挂住）
 *   6b 取景编排（spec §8 V19）：主整局跑 `?nofx=1` ⇒ `world.scale.x` 全程恒 1（gate cam_nofx_idle）；
 *     另开一页**不带 nofx**，断言移动期推近到 [CAM_MIN_ZOOM, CAM_MAX_ZOOM]（cam_framing）并归位
 *     到 1±0.01（cam_reset）——该段独立 catch，失败只置对应 gate、不污染主整局断言
 *   7 仅当以上全真 exit 0；`--report-only` 恒 exit 0
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
const SEED = 20260928;
const MAX_ROUNDS = 61;              // 设计目标：ROUND_LIMIT(60) 之后一回合内必结束
const MAX_CLICKS = 8000;            // 点击次数硬上限
const WALL_MS = 600000;             // 墙钟上限 10 分钟（4 真人整局实测 ≈ 1000 次点击 × ~0.45s/次）
const REPORT_ONLY = process.argv.includes('--report-only');
mkdirSync(OUT, { recursive: true });

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

const errors = [];
const gate = {};
const facts = { tally: {}, clicks: 0, shots: {}, audioUnlocked: null };
const problems = [];
/* 取景采样（gate cam_nofx_idle）：主整局每次读到状态都顺手收一次 `world.scale.x` */
const nofxScaleSamples = [];

const browser = await chromium.launch();
const viewport = { width: 390, height: 844 };

/** 读整局状态快照（含浮层判定与命中层可点性） */
const readState = () => page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  /* 待拍态：`openLot` 只把**真人**竞拍人放进 `pending`（AI 即时算价入 `bids`），
     故有 `auction` 即等于「轮到真人出价」——必须由本脚本代真人在浮层上点击，否则永久挂起。 */
  const auc = m.auction ? m.auction() : null;
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
    auction: auc ? {
      pending: auc.pending.slice(),
      bids: auc.bids.length,
      results: auc.results.length,
      lot: auc.lot ? auc.lot.index : null,
    } : null,
    /* 拍卖三档出价键里可能有禁用档（现金不足），故判据是「存在任一可用档」而非只看首键 */
    auctionBidEnabled: (() => {
      const els = panels ? [...panels.querySelectorAll('button[data-action="auction:bid"]')] : [];
      return els.some((x) => !x.disabled);
    })(),
    primaryAction: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    buyEnabled: enabled(hud, 'button[data-action="buy"]'),
    upgradeEnabled: enabled(hud, 'button[data-action="upgrade"]'),
    closeEnabled: enabled(panels, 'button[data-action="card:close"]'),
    stockBuyEnabled: enabled(panels, 'button[data-action="stock:buy"]'),
    stockSellEnabled: enabled(panels, 'button[data-action="stock:sell"]'),
    audioKeys: document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length,
    cardDoubleRentEnabled: enabled(panels, 'button[data-action="card:doubleRent"]'),
    /* 牌袋抽屉（spec §7.3）：手牌默认收起，打牌前要先点这枚键展开 */
    handKeyEnabled: enabled(hud, 'button[data-action="hand"]'),
    /* 取景采样（G6）：整局跑在 `?nofx=1` 下，相机不介入 ⇒ `world.scale.x` 必须全程恒 1 */
    worldScaleX: window.__monoMain?.stage?.world?.scale?.x ?? null,
  };
});

/** 状态签名：任何「有效点击」都必须让它变化，否则说明点了没反应（UI 缺陷） */
const sig = (s) => JSON.stringify({
  phase: s.phase, over: s.over, current: s.current, round: s.round,
  pos: s.pos, cash: s.cash, bankrupt: s.bankrupt, jail: s.jail, dice: s.dice,
  estates: s.estates, hands: s.hands, lastDraw: s.lastDraw, lastEvent: s.lastEvent,
  /* 出价本身不写 `lastEvent`（只有落槌才写 `auctionDone`），不带上它会让「点了但判为没反应」误报 */
  auction: s.auction,
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
 * 真实交互：默认在命中层派发合成 `click`（快，撑得住近千次点击的墙钟预算）；
 * `real === true` 时改用 Playwright **真实鼠标点击**——只有它会派发 `pointerdown`，
 * 从而触发 `main.ts` 的 `audio.unlock()`（spec §4.3c）。
 * 若元素缺失或 disabled → 直接抛错（即 UI 命中层缺陷），不静默跳过。
 * 只在「状态未变」时重试，杜绝重复触发。
 */
const click = async (sel, sigBefore, real = false) => {
  for (let i = 0; i < 3; i += 1) {
    try {
      if (real) {
        await page.locator(sel).click({ timeout: 5000 });
      } else {
        await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) throw new Error(`命中层缺失 ${s}`);
          if (el.disabled) throw new Error(`命中键被禁用 ${s}`);
          el.click();
        }, sel);
      }
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
/* 牌袋抽屉当前是否展开：打牌前展开、打完收起（开合不推进状态，故不走 `click()` 的签名校验） */
let drawerOpen = false;
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
  facts.minAudioKeys = s.audioKeys;
  facts.seed = SEED;
  if (typeof s.worldScaleX === 'number') nofxScaleSamples.push(s.worldScaleX);
  await shot('01-start');

  const t0 = Date.now();
  while (!s.over) {
    if (facts.clicks >= MAX_CLICKS) throw new Error(`点击次数越限 ${MAX_CLICKS}`);
    if (Date.now() - t0 > WALL_MS) throw new Error(`墙钟超时 ${WALL_MS}ms @round=${s.round}`);
    if (s.round > MAX_ROUNDS) throw new Error(`轮数越限 ${s.round} > ${MAX_ROUNDS}（仍未 over）`);

    let sel;
    let action;
    /* 待拍态优先于一切（`overlayOf`：auction > settle > bank > store > stock > draw）：
       `openLot` 只把**真人**竞拍人挂进 `pending`，真人不出价则引擎与 `aiDriver` 双双永久挂起。 */
    if (s.auction) {
      sel = s.auctionBidEnabled
        ? '#mono-panels button[data-action="auction:bid"]:not([disabled])'
        : '#mono-panels button[data-action="auction:pass"]';
      action = s.auctionBidEnabled ? 'auction:bid' : 'auction:pass';
    } else {
      /* 牌袋抽屉：还没打过牌、停在格、无浮层时先展开抽屉（否则手牌键与牌面键都不在命中层） */
      if (!used.card && !drawerOpen && s.phase === 'settled' && s.overlay === null && s.handKeyEnabled) {
        await page.evaluate(() => { document.querySelector('#mono-hud button[data-action="hand"]')?.click(); });
        await page.waitForTimeout(20);
        drawerOpen = true;
        s = await readState();
      }
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
    }

    if (!sel || !action) throw new Error(`无法决策下一步 phase=${s.phase} overlay=${s.overlay}`);

    const before = sig(s);
    const landedPos = s.phase === 'moved' ? s.pos[s.current] : null;
    /* eslint-disable no-await-in-loop */
    const next = await click(sel, before, facts.clicks === 0);   // 首个动作走真实手势 → pointerdown → unlock()
    if (sig(next) === before) {
      throw new Error(`点击未改变状态：${action} @phase=${s.phase} round=${s.round}`
        + ` selector=${sel} → 仍为 phase=${next.phase}`);
    }
    facts.clicks += 1;
    if (facts.clicks === 1) {
      facts.audioUnlocked = await page.evaluate(() => window.__monoMain.audio.isUnlocked());
    }
    facts.tally[action] = (facts.tally[action] ?? 0) + 1;
    s = next;
    facts.minAudioKeys = Math.min(facts.minAudioKeys, s.audioKeys);
    if (typeof s.worldScaleX === 'number') nofxScaleSamples.push(s.worldScaleX);   // 取景采样（G6）

    if (action === 'buy' && !facts.shots['02-firstbuy']) { await settleFx(); await shot('02-firstbuy'); }
    if (action === 'upgrade' && !facts.shots['03-firstupgrade']) { await settleFx(); await shot('03-firstupgrade'); }
    if (action === 'settle' && landedPos === 12 && !facts.shots['04-jail']) { await settleFx(); await shot('04-jail'); }

    /* 打完牌把抽屉收起，回到「地块卡 + 卡上买地/升级」的默认视图（与手册截图口径一致） */
    if (drawerOpen && used.card) {
      await page.evaluate(() => { document.querySelector('#mono-hud button[data-action="hand"]')?.click(); });
      await page.waitForTimeout(20);
      drawerOpen = false;
      s = await readState();
    }
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
  gate.audio_keys = facts.minAudioKeys === 2;   // 静音键在每一阶段（含 over 结算）都常驻命中层
  gate.audio_unlocked = facts.audioUnlocked === true;   // 首个真实手势确实建起了 AudioContext（spec §4.3c）

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

/* —— G6：主整局跑在 `?nofx=1` 下，相机完全不介入 ⇒ `world.scale.x` 全程恒 1（容差 1e-6）—— */
facts.camNofx = {
  samples: nofxScaleSamples.length,
  min: nofxScaleSamples.length ? Math.min(...nofxScaleSamples) : null,
  max: nofxScaleSamples.length ? Math.max(...nofxScaleSamples) : null,
};
gate.cam_nofx_idle = nofxScaleSamples.length > 0
  && nofxScaleSamples.every((v) => Math.abs(v - 1) <= 1e-6);

/*
 * 追加：AI 局（1 真人 + 3 AI）跑到 over=true。
 * 真人回合沿用**真实点击**推进（与上面整局用例同口径）；AI 回合调用 `__monoMain.aiDriver.skipRest()`
 * —— 即 HUD「跳过本次」的同一公开 API（decideTurn → applyStep → runAction 全链路照跑），
 * 只是省去 450ms/步 的演出等待：否则 60 轮 × 3 AI × ~5 步会把整局拖过墙钟超时。
 *
 * 先关掉上一局那个页面：它已结算但仍在逐帧渲染（软件 GL），实测会让本页的每次
 * `evaluate` 排队近 500ms（180s 只跑到第 55 轮）；关掉后恢复常态，留足 300s 预算。
 */
await page?.close();
try {
  const aiPage = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  aiPage.on('pageerror', (e) => errors.push(String(e)));
  aiPage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await aiPage.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&nofx=1&humans=1&tour=0`, { waitUntil: 'networkidle' });
  await aiPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  facts.aiAudioKeys = await aiPage.evaluate(
    () => document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length,
  );
  gate.ai_audio_keys = facts.aiAudioKeys === 2;   // AI 回合图标不被 `if (aiSeat)` 早退吞掉

  const tAI = Date.now();
  let aiClicks = 0;
  let iterations = 0;
  let skipCalls = 0;
  let auctionClicks = 0;
  let lastSt = null;
  while (Date.now() - tAI < 300000) {
    iterations += 1;
    const st = await aiPage.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      return {
        over: s.over,
        /* 待拍态：真人是竞拍人 ⇒ 必须代其出价，`skipRest` / `tick` 在 `state.auction` 下都会立刻返回 */
        auction: Boolean(m.auction ? m.auction() : s.auction),
        isHuman: m.seats[s.current] === null,
        phase: s.phase,
        lastDraw: Boolean(s.lastDraw),
        pos: s.players[s.current].pos,
      };
    });
    lastSt = st;
    if (st.over) break;
    if (st.auction) {
      /* 拍卖出价优先于「谁的回合」：只有真人会进 `pending`，AI 席位已即时算价入 `bids` */
      await aiPage.evaluate(() => {
        const btns = [...document.querySelectorAll('#mono-panels button[data-action="auction:bid"]')];
        const b = btns.find((x) => !x.disabled)
          ?? document.querySelector('#mono-panels button[data-action="auction:pass"]');
        if (b && !b.disabled) b.click();
      });
      auctionClicks += 1;
      await aiPage.waitForTimeout(20);
    } else if (st.isHuman) {
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
      skipCalls += 1;
      await aiPage.evaluate(() => window.__monoMain.aiDriver.skipRest());
      await aiPage.waitForTimeout(10);
    }
  }

  facts.aiDiag = {
    elapsedMs: Date.now() - tAI, iterations, aiClicks, skipCalls, auctionClicks, lastSt,
    seats: await aiPage.evaluate(() => window.__monoMain.seats),
    hasDriver: await aiPage.evaluate(() => Boolean(window.__monoMain.aiDriver)),
  };

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

/*
 * 追加：取景编排（spec §8 V19 / G3·G5）。
 * 上面整局跑 `?nofx=1`（守墙钟预算）**测不到推近**，故这里另开一页「不带 nofx」：
 *   cam_framing —— `move` 期间 `stage.world.scale.x` 的 max ∈ [CAM_MIN_ZOOM, CAM_MAX_ZOOM]；
 *   cam_reset   —— 关闭结算 / 结束回合并等 `camera.current().zoom` 回到 1±0.01。
 * 独立 catch：本段任何失败只置对应 gate 为 false 并把原因塞进 problems，不污染主整局断言。
 * 常量出处 `src/skin/layout.ts`（同值内联）。
 */
const CAM_MIN_ZOOM = 1.6;
const CAM_MAX_ZOOM = 4;
gate.cam_framing = false;
gate.cam_reset = false;
try {
  const camPage = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  camPage.on('pageerror', (e) => errors.push(String(e)));
  camPage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await camPage.goto(`${ORIGIN}/mono.html?play=1&seed=${SEED}&humans=4&tour=0`, { waitUntil: 'networkidle' });
  await camPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

  const primary = camPage.locator('#mono-hud button[data-primary]');
  await primary.click();   // roll（真实骰子动效）
  await camPage.waitForFunction(() => window.__monoMain?.game?.state?.phase === 'rolled', null, { timeout: 8000 })
    .catch(() => {});
  await camPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
  await primary.click();   // move（真实时长：相机应推近）

  /* move 期间连续 30 帧采样 `stage.world.scale.x`（rAF ≈16ms/帧） */
  facts.camMoveSamples = await camPage.evaluate((n) => new Promise((resolve) => {
    const out = [];
    const step = () => {
      const w = window.__monoMain && window.__monoMain.stage && window.__monoMain.stage.world;
      out.push(w ? w.scale.x : null);
      if (out.length >= n) resolve(out);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), 30);
  {
    const nums = facts.camMoveSamples.filter((v) => typeof v === 'number');
    facts.camMoveMax = nums.length ? Number(Math.max(...nums).toFixed(3)) : null;
    facts.camMoveMin = nums.length ? Number(Math.min(...nums).toFixed(3)) : null;
    gate.cam_framing = nums.length >= 20
      && facts.camMoveMax >= CAM_MIN_ZOOM && facts.camMoveMax <= CAM_MAX_ZOOM;
  }

  await camPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 15000 }).catch(() => {});
  /* 关闭结算 / 结束回合并等归位：有界轮询，读到 `zoom=1±0.01` 即停；`idle`/`over` 时只等不点 */
  let resetZoom = null;
  for (let i = 0; i < 20; i += 1) {
    const st = await camPage.evaluate(() => {
      const m = window.__monoMain;
      const c = m.camera;
      const close = document.querySelector('#mono-panels button[data-action="card:close"]');
      return {
        phase: m.game.state.phase, over: m.game.state.over,
        zoom: c ? c.current().zoom : null, busy: c ? c.busy() : true,
        hasClose: Boolean(close && !close.disabled),
      };
    });
    if (st.zoom !== null && Math.abs(st.zoom - 1) <= 0.01 && !st.busy) { resetZoom = st.zoom; break; }
    if (st.phase === 'idle' || st.over) { await camPage.waitForTimeout(80); continue; }
    const sel = st.hasClose ? '#mono-panels button[data-action="card:close"]' : '#mono-hud button[data-primary]';
    await camPage.evaluate((x) => { const el = document.querySelector(x); if (el && !el.disabled) el.click(); }, sel);
    await camPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
    await camPage.waitForTimeout(80);
  }
  facts.camResetZoom = resetZoom ?? await camPage.evaluate(
    () => (window.__monoMain.camera ? window.__monoMain.camera.current().zoom : null),
  );
  gate.cam_reset = typeof facts.camResetZoom === 'number' && Math.abs(facts.camResetZoom - 1) <= 0.01;
  await camPage.close();
} catch (e) {
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
  minAudioKeys: facts.minAudioKeys,
  audioUnlocked: facts.audioUnlocked,
  aiAudioKeys: facts.aiAudioKeys ?? null,
  tally: facts.tally,
  final: facts.final ?? null,
  shots: facts.shots,
  blankHash: facts.blankHash ?? null,
  gate,
  ai: facts.aiGame ?? null,
  aiDiag: facts.aiDiag ?? null,
  /* 取景编排事实（spec §8 V19）：nofx 全程恒 1 / move 期采样 max·min / 归位倍率 */
  cam: {
    nofx: facts.camNofx ?? null,
    moveMax: facts.camMoveMax ?? null,
    moveMin: facts.camMoveMin ?? null,
    moveSamples: facts.camMoveSamples ?? null,
    resetZoom: facts.camResetZoom ?? null,
  },
  problems,
  errors,
}, null, 2));

if (fatal) console.error(`\n[fatal] ${fatal.stack ?? fatal}`);

const ok = failed.length === 0 && !fatal;
const exitCode = ok || REPORT_ONLY ? 0 : 1;
console.log(`\n[e2e:play] ${ok ? 'PASS' : 'FAIL'} · round=${finalState?.round ?? '-'}`
  + ` · clicks=${facts.clicks} · 命中动作 tally=${JSON.stringify(facts.tally)}`
  + ` · 退出码=${exitCode}${!ok && REPORT_ONLY ? '（--report-only 强制 0）' : ''}`);

process.exit(exitCode);
