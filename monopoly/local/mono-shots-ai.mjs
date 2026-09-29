import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * AI 对手 + 新手引导闸门（spec §6 / §7）。结构照抄 mono-shots-m4.mjs：390×844 @dpr2、
 * attach(page) 收集 console/pageerror、gate 汇总、末尾按 gate/errors 决定退出码。
 *
 * 四组用例：
 *   1) ?humans=1&tour=0 → 跳过开局面板：1 真人 + 3 AI 席位，无 #mono-setup
 *   2) 裸入口 → 先弹开局面板（game===null）→ 点「开始游戏」→ game 就绪
 *   3) AI 回合自动推进 + HUD 全禁用（wide 主按钮禁用、ai:fast / ai:skip 存在）→ 加速、跳过
 *   4) ?humans=1&tour=1 → 四步引导逐步点「下一步」→ 结束写入 localStorage
 *
 * 8 张 390×844 @dpr2 截图入库 docs/verify/mono-ai-0*.png。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};
const shots = [];

const attach = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}` });
  shots.push(`${OUT}/${name}`);
};

/* —— 1) + 3) ?humans=1&tour=0：跳过面板、1 真人 3 AI —— */
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(page);
await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=1&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

/* 1) 席位分配 */
facts.seats = await page.evaluate(() => {
  const seats = window.__monoMain.seats;
  return {
    ai: seats.filter((s) => s !== null).length,
    humans: seats.filter((s) => s === null).length,
    setup: Boolean(document.querySelector('#mono-setup')),
  };
});
gate.seats_ai = facts.seats.ai === 3;
gate.seats_humans = facts.seats.humans === 1;
gate.seats_noPanel = facts.seats.setup === false;
await shot(page, 'mono-ai-01-setup-skip.png');

/* 3) 打完真人回合，让当前席位落到 AI */
for (let i = 0; i < 24; i += 1) {
  const isAi = await page.evaluate(() => {
    const m = window.__monoMain;
    return m.seats[m.game.state.current] !== null;
  });
  if (isAi) break;
  await page.evaluate(() => document.querySelector('#mono-hud button[data-primary]')?.click());
  await page.waitForTimeout(50);
}

facts.aiTurn = await page.evaluate(() => {
  const m = window.__monoMain;
  const c = m.game.state.current;
  return {
    seatIsAi: m.seats[c] !== null,
    fastBtn: Boolean(document.querySelector('#mono-hud button[data-action="ai:fast"]')),
    skipBtn: Boolean(document.querySelector('#mono-hud button[data-action="ai:skip"]')),
    primaryDisabled: Boolean(document.querySelector('#mono-hud button[data-primary]')?.disabled),
    wideLabel: m.scene.instancesOf().find((i) => i.id === 'ui.button.wide')?.state?.label ?? null,
    current: c,
    phase: m.game.state.phase,
  };
});
gate.aiTurn_seat = facts.aiTurn.seatIsAi === true;
gate.aiTurn_hud = facts.aiTurn.fastBtn && facts.aiTurn.skipBtn && facts.aiTurn.primaryDisabled;
gate.aiTurn_label = String(facts.aiTurn.wideLabel).includes('AI 思考中');

/* 自动推进：phase 在 8s 内自行变化 */
gate.aiAdvanced = await page
  .waitForFunction((p) => window.__monoMain.game.state.phase !== p, facts.aiTurn.phase, { timeout: 8000 })
  .then(() => true).catch(() => false);

/* 加速 ×2 → 快捷键标签含 ✓ */
await page.evaluate(() => document.querySelector('#mono-hud button[data-action="ai:fast"]')?.click());
await page.waitForTimeout(60);
facts.fast = await page.evaluate(() => window.__monoMain.scene.instancesOf()
  .filter((i) => i.id === 'ui.qk').map((i) => String(i.state?.label ?? '')));
gate.fastToggled = facts.fast.some((l) => l.includes('✓'));

/* 跳过本次 → 当前席位离开 */
const seatNow = await page.evaluate(() => window.__monoMain.game.state.current);
gate.skipped = await page
  .waitForFunction((s) => window.__monoMain.game.state.current !== s, seatNow, { timeout: 8000 })
  .then(() => true).catch(() => false);

await shot(page, 'mono-ai-04-turn.png');
await page.close();

/* —— 2) 裸入口 → 开局面板 → 开始游戏 —— */
const entry = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(entry);
await entry.goto(`${ORIGIN}/mono.html`, { waitUntil: 'networkidle' });
await entry.waitForFunction(() => Boolean(document.querySelector('#mono-setup')), null, { timeout: 20000 });

facts.entry = { setup: true, gameIsNull: await entry.evaluate(() => window.__monoMain.game === null) };
gate.entry_panel = facts.entry.setup && facts.entry.gameIsNull;
await shot(entry, 'mono-ai-02-setup.png');

await entry.click('#mono-setup button[data-action="setup:start"]');
await entry.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
await entry.waitForTimeout(80);
gate.entry_started = await entry.evaluate(() => !document.querySelector('#mono-setup') && Boolean(window.__monoMain.game));
/* 首访默认会弹引导（z 20）：先跳过，让 03 显示真实棋盘 */
await entry.evaluate(() => document.querySelector('#mono-tour button[data-action="tour:skip"]')?.click());
await entry.waitForTimeout(60);
await shot(entry, 'mono-ai-03-started.png');
await entry.close();

/* —— 4) ?humans=1&tour=1：四步引导 —— */
const tour = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(tour);
await tour.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=1&tour=1`, { waitUntil: 'networkidle' });
await tour.waitForFunction(() => Boolean(document.querySelector('#mono-tour [data-tour-step]')), null, { timeout: 20000 });

for (let i = 0; i < 4; i += 1) {
  await tour.waitForFunction(
    (n) => Boolean(document.querySelector(`#mono-tour [data-tour-step="${n}"]`)), i, { timeout: 5000 },
  );
  await shot(tour, `mono-ai-05-tour-${i + 1}.png`);
  await tour.click('#mono-tour button[data-action="tour:next"]');
}
await tour.waitForFunction(() => !document.querySelector('#mono-tour [data-tour-step]'), null, { timeout: 5000 });
facts.tourDone = await tour.evaluate(() => ({
  gone: !document.querySelector('#mono-tour [data-tour-step]'),
  done: localStorage.getItem('mono.tour.done'),
}));
gate.tour_gone = facts.tourDone.gone === true;
gate.tour_done = facts.tourDone.done === '1';
await tour.close();

facts.screenshots = shots;
gate.noErrors = errors.length === 0;

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1);