import { chromium } from 'playwright';

/*
 * 回归取证 · 相机取景下的「选目标命中」（防复发）。
 *
 * 背景（用户报障）：「炸弹、路障无法放置到棋盘上且道具不产生作用」。
 * 根因：`#mono-pick` 命中层把**舞台坐标**直接喂给 `tileAtPoint`，未过相机逆变换
 * （`toWorld`）。正常游玩（`?play=1`，`camOn = true`）时落格特写 zoom ≈ 3.2–3.6，
 * 画布上棋盘被放大，而命中层按未变换坐标反查格号 ⇒ 点到的永远是放大后的别处。
 * 既有 `mono-shots-*.mjs` 全部带 `nofx=1`（`camOn = opts.cam && !opts.nofx` ⇒ false），
 * zoom 恒 1，恰好掩盖了该缺陷——故本脚本**刻意不带 `nofx=1`**。
 *
 * 机器闸门（全 true 才 PASS）：
 *   cam_zoom_active —— 相机确实处于非恒等位姿（zoom > 1）
 *   bomb_armed      —— 点手牌「炸弹」后进入选目标态（`uiSel() != null`）
 *   pick_would_miss —— 旧算法（舞台坐标直查）在同一像素上解出的格号 ≠ 目标格（证明本用例有效）
 *   bomb_landed     —— 真实点击目标格后 `lastEvent` = 炸弹 × 目标格
 *   estate_demoted  —— 目标地块层级由 2 降为 1（道具确实产生作用）
 *
 * MONO_ORIGIN 默认打本地预览；线上：$env:MONO_ORIGIN='https://game.joho.cn/tour/'
 */
const ORIGIN = (process.env.MONO_ORIGIN || 'http://127.0.0.1:52301').replace(/\/+$/, '');
const SEED = 20261002;
const VIEW = { width: 390, height: 844 };

/** 目标格：3 号（`TILE_TYPES[3] = 'shop'`，可被炸弹命中）；对手 = 2 号玩家（玩家 id 从 1 起） */
const TARGET = 3;
const FOE = 2;
const ZOOM = 3.4;
const RING_SIZE = 32;
/** `skin/layout.TILE_PICK_TOL`（命中容差，舞台口径） */
const TOL = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

/* 刻意**不带** nofx：相机必须处于开启态（camOn = opts.cam && !opts.nofx） */
const url = `${ORIGIN}/mono.html?play=1&seed=${SEED}&humans=4&tour=0`;
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await page.addStyleTag({ content: '#mono-share{display:none}' });

const facts = {};
const gate = {};

/* ① 布景：真人 0 号持「炸弹」，3 号格 = 对手 1 号 L2 商铺，相机会顶到 zoom 3.4 对准 3 号格 */
facts.setup = await page.evaluate(({ target, foe, zoom }) => {
  const m = window.__monoMain;
  const s = m.game.state;
  s.current = 0;
  s.phase = 'settled';
  s.estates = {};
  s.estates[target] = { index: target, owner: foe, level: 2, processing: false };
  const me = s.players[0];
  me.cash = 5000; me.pos = 0;
  s.hands[0] = ['bomb'];
  m.paint();
  const c = m.cellXY(target);
  m.camera.snap({ cx: c.x, cy: c.y, zoom });
  return { me: me.id, estate: s.estates[target].level, pose: m.camera.current() };
}, { target: TARGET, foe: FOE, zoom: ZOOM });
gate.cam_zoom_active = facts.setup.pose.zoom > 1.5;

/* ② 开手牌抽屉 → 点「炸弹」（真实 HUD / 浮层点击，不绕过命中层） */
await page.locator('#mono-hud button[data-action="hand"]').click();
await page.locator('#mono-panels button[data-action="card:bomb"]').click();
await page.waitForTimeout(80);
facts.armed = await page.evaluate(() => {
  const m = window.__monoMain;
  return { uiSel: m.uiSel(), pickEvents: getComputedStyle(document.getElementById('mono-pick')).pointerEvents };
});
gate.bomb_armed = facts.armed.uiSel !== null && facts.armed.uiSel.kind === 'bomb'
  && facts.armed.pickEvents === 'auto';

/* ③ 取「目标格的世界坐标 → 屏幕上该点的视口坐标」，并顺带算旧算法在同一像素上解出的格号 */
facts.aim = await page.evaluate(({ target, ring, tol }) => {
  const m = window.__monoMain;
  const w = m.cellXY(target);
  /* 世界坐标 → 舞台逻辑坐标（相机 apply 的正变换，直接借 Pixi 自身算） */
  const g = m.stage.world.toGlobal({ x: w.x, y: w.y });
  const rect = document.getElementById('mono-pick').getBoundingClientRect();
  const k = rect.width / 390;
  const clientX = rect.left + g.x * k;
  const clientY = rect.top + g.y * k;

  /* 旧算法复算：拿舞台逻辑坐标（g.x/g.y）直查最近格心（正是修复前的行为） */
  let best = null, bestD = Infinity;
  for (let i = 0; i < ring; i++) {
    const c = m.cellXY(i);
    const d = Math.hypot(g.x - c.x, g.y - c.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  const oldIdx = bestD <= tol ? best : null;
  return { world: w, stage: g, client: { x: clientX, y: clientY }, oldIdx, oldD: bestD };
}, { target: TARGET, ring: RING_SIZE, tol: TOL });
gate.pick_would_miss = facts.aim.oldIdx !== TARGET;

/* ④ 真实点击目标格 */
await page.mouse.click(facts.aim.client.x, facts.aim.client.y);
await page.waitForTimeout(120);
facts.after = await page.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  return {
    lastEvent: s.lastEvent ?? null,
    estate: s.estates[3] ? s.estates[3].level : null,
    hand: (s.hands[0] ?? []).slice(),
  };
});
gate.bomb_landed = facts.after.lastEvent?.kind === 'card'
  && facts.after.lastEvent.card === 'bomb'
  && facts.after.lastEvent.target === TARGET;
gate.estate_demoted = facts.after.estate === 1 && !facts.after.hand.includes('bomb');

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[campick] gate:', JSON.stringify(gate));
console.log('[campick] facts:', JSON.stringify({ setup: facts.setup, armed: facts.armed, aim: facts.aim, after: facts.after }));
console.log('[campick] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[campick] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[campick] PASS');
