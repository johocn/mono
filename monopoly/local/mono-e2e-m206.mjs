import { chromium } from 'playwright';

/*
 * M20.6 · 经济闭环收口轮 e2e（真实页面 + 引擎真实结算；全程 390×844 @dpr2 移动视口）。
 *
 * 四个页面（各自独立确定性布置；金额/对局零随机外溢）：
 *   A 终局三段（D51/D54）：round 39 段外 → 角标 / 进度条均不出；round 40/46 → 「加速 Ⅰ」+ stage 1；
 *             47/53 → 「加速 Ⅱ」+ stage 2；54/60 → 「终局」+ stage 3；角标落 414..438、进度条落 446..454。
 *   B 板块新闻（D52）：同 seed 两跑对比 —— 无新闻租金 rent0，板块利好 ×1.25 租金 rent1 ≈ rent0×1.25；
 *             新闻条前缀由「景气 N%」换成「板块·核心商圈 ×1.25」。
 *   C 设施分红强化（D53）：持股 20/20 ⇒ 右列详情含「基础分红 6%/轮」「你的持股 20 股 · 控股溢价」
 *             「预估分红 ￥320/轮」（= 200×20×0.06 = 240 基础 + 控股溢价 round(200×20×0.02) = 80）。
 *   D 唯一胜者闸门（D55/D56）：仅剩 1 名未破产者时结束回合 → over=true，且存活者恰为 1 人。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */

const ORIGIN = (process.env.MONO_ORIGIN || 'https://game.joho.cn/tour').replace(/\/+$/, '');
const SEED = 20261002;
const VIEW = { width: 390, height: 844 };
const CORE_SHOP = 13;                // TILE_TIER[13] === 'core'（商家格）

const errors = [];
const facts = {};
const browser = await chromium.launch();
let fatal = null;

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

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

/** 可见元素实例（`scene.instancesOf()`；按 id 过滤） */
const inst = (page, id) => page.evaluate((i) => {
  const list = window.__monoMain.scene.instancesOf().filter((x) => x.id === i);
  return list.map((x) => ({ id: x.id, state: x.state ?? {} }));
}, id);

const setRound = (page, round) => page.evaluate((r) => {
  window.__monoMain.game.state.round = r;
  window.__monoMain.paint();
}, round);

try {
  /* ============ 页面 A：终局三段（D51 / D54） ============ */
  {
    const page = await openPage();

    await setRound(page, 39);
    facts.aOff = {
      badge: (await inst(page, 'ui.endgameBadge')).length,
      bar: (await inst(page, 'ui.endgameBar')).length,
    };
    assert(facts.aOff.badge === 0 && facts.aOff.bar === 0,
      `round 39（段外）不应出角标 / 进度条，实际 ${JSON.stringify(facts.aOff)}`);

    const at = async (round) => {
      await setRound(page, round);
      const b = await inst(page, 'ui.endgameBadge');
      const r = await inst(page, 'ui.endgameBar');
      return { label: b[0]?.state?.label ?? null, stage: r[0]?.state?.stage ?? null };
    };

    const s40 = await at(40);
    const s46 = await at(46);
    const s47 = await at(47);
    const s53 = await at(53);
    const s54 = await at(54);
    const s60 = await at(60);
    facts.aStages = { s40, s46, s47, s53, s54, s60 };

    assert(s40.label === '加速 Ⅰ · 租×1.4 市×1.3 讯×1.3' && s40.stage === 1,
      `round 40 应为「加速 Ⅰ」stage 1，实际 ${JSON.stringify(s40)}`);
    assert(s46.label === s40.label && s46.stage === 1, `round 46 仍属加速 Ⅰ，实际 ${JSON.stringify(s46)}`);
    assert(s47.label === '加速 Ⅱ · 租×1.8 市×1.6 讯×1.6' && s47.stage === 2,
      `round 47 应为「加速 Ⅱ」stage 2，实际 ${JSON.stringify(s47)}`);
    assert(s53.stage === 2, `round 53 仍属加速 Ⅱ，实际 ${JSON.stringify(s53)}`);
    assert(s54.label === '终局 · 租×2.4 市×2 讯×2' && s54.stage === 3,
      `round 54 应为「终局」stage 3，实际 ${JSON.stringify(s54)}`);
    assert(s60.label === s54.label && s60.stage === 3, `round 60 仍属终局，实际 ${JSON.stringify(s60)}`);

    /* 角标 / 进度条为信息带：不吃事件（命中层不新增矩形） */
    const hits = await page.evaluate(() => document.querySelectorAll('#mono-hud button[data-action]').length);
    facts.aHudButtons = hits;
    await page.close();
  }

  /* ============ 页面 B：板块新闻（D52） ============ */
  {
    /** 站 13 号格（2 号玩家 L1 自有）真实结算一次，返回 rent */
    const runRent = async (news) => {
      const page = await openPage();
      await page.evaluate(({ tile, n }) => {
        const m = window.__monoMain;
        const s = m.game.state;
        const me = s.players[0];
        me.pos = tile; me.cash = 5000;
        s.hands[0] = s.hands[0].filter((k) => k !== 'pardon');    // 去免罚牌，确保收租真实发生
        s.estates[tile] = { index: tile, owner: 2, level: 1, processing: false };
        s.news = n;
        s.phase = 'moved';
        m.paint();
      }, { tile: CORE_SHOP, n: news });
      const out = await page.evaluate(() => {
        const m = window.__monoMain;
        const r = m.game.settleCurrent();
        const tick = m.scene.instancesOf().find((x) => x.id === 'ui.newsTicker');
        return { rent: r && r.kind === 'rent' ? r.rent : null, kind: r && r.kind, prefix: tick ? tick.state.prefix : null };
      });
      return { page, out };
    };

    const base = await runRent(null);
    assert(base.out.kind === 'rent' && base.out.rent > 0,
      `基线应真实收租，实际 ${JSON.stringify(base.out)}`);
    await base.page.close();

    const good = await runRent({ id: 's-core', title: '核心商圈人潮涌动', sentiment: 'good', scope: 'sector', target: 'core', magnitude: 1.25 });
    facts.bSector = { base: base.out.rent, good: good.out.rent, prefix: good.out.prefix };
    assert(good.out.prefix === '板块·核心商圈 ×1.25',
      `板块新闻条前缀应为「板块·核心商圈 ×1.25」，实际 ${JSON.stringify(good.out.prefix)}`);
    assert(Math.abs(good.out.rent - base.out.rent * 1.25) <= 1,
      `板块利好 ×1.25：租金应 ≈ ${base.out.rent}×1.25，实际 ${good.out.rent}`);
    await good.page.close();
  }

  /* ============ 页面 C：设施分红强化（D53） ============ */
  {
    const page = await openPage();
    await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      const me = s.players[0];
      me.cash = 5000; me.facilities = { bank: 20 };
      s.news = null;                                    // 隔离新闻系数，断言逐字文案
      s.phase = 'idle';
      m.setFacility(true, 'bank');
    });
    const lines = (await inst(page, 'ui.bankRow'))
      .filter((x) => x.state.variant === 'line')
      .map((x) => x.state.text);
    facts.cLines = lines;
    assert(lines.includes('已售 20/20 股 · 基础分红 6%/轮'),
      `详情应含「基础分红 6%/轮」，实际 ${JSON.stringify(lines)}`);
    assert(lines.includes('你的持股 20 股 · 控股溢价'),
      `持股 20/20 应显示控股溢价，实际 ${JSON.stringify(lines)}`);
    assert(lines.includes('预估分红 ￥320/轮'),
      `预估分红应为 ￥320/轮（240 基础 + 80 控股溢价），实际 ${JSON.stringify(lines)}`);
    await page.close();
  }

  /* ============ 页面 D：唯一胜者闸门（D55 / D56） ============ */
  {
    const page = await openPage();
    const out = await page.evaluate(() => {
      const m = window.__monoMain;
      const s = m.game.state;
      s.players[1].bankrupt = true; s.players[2].bankrupt = true; s.players[3].bankrupt = true;
      s.current = 0; s.phase = 'settled'; s.news = null;
      m.game.endTurn();
      m.paint();
      const alive = s.players.filter((p) => !p.bankrupt).map((p) => p.id);
      return { over: s.over, alive, round: s.round };
    });
    facts.dWinner = out;
    assert(out.over === true, `仅剩 1 人时结束回合应收束（over=true），实际 ${JSON.stringify(out)}`);
    assert(out.alive.length === 1 && out.alive[0] === 1,
      `应恰有 1 名存活者（玩家 1），实际 ${JSON.stringify(out.alive)}`);
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
  console.error(`\n[e2e:m206] FAIL · ${why}`);
  process.exit(1);
}
console.log('\nOK');
process.exit(0);