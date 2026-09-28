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

await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 15000 });
await page.screenshot({ path: `${OUT}/mono-m4-01-hud.png` });

/* 1) HUD 元素与命中层 */
facts.hud = await page.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf();
  const ids = inst.map((i) => i.id);
  return {
    ui: ids.filter((id) => id.startsWith('ui.')).length,
    bars: ids.filter((id) => id === 'ui.playerBar').length,
    diceBodies: ids.filter((id) => id === 'dice.body').length,
    diceFaces: ids.filter((id) => id.startsWith('dice.face')).length,
    fxChildren: m.stage.layers.fx.children.length,
    hitButtons: document.querySelectorAll('#mono-hud button[data-action]').length,
    primaryAction: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
    phase: m.game.state.phase,
  };
});
gate.hud_bars = facts.hud.bars === 4;
gate.hud_dice = facts.hud.diceBodies === 2 && facts.hud.diceFaces === 2;
gate.hud_fx = facts.hud.fxChildren >= 13;
gate.hud_hit = facts.hud.hitButtons >= 1 && facts.hud.primaryAction === 'roll';

/* 2) 手动三连点：掷骰 → 前进 → 结算（验证 DOM 命中层与状态机接线） */
facts.manual = await page.evaluate(async () => {
  const seq = [];
  for (let i = 0; i < 3; i++) {
    const b = document.querySelector('#mono-hud button[data-primary]');
    if (!b) break;
    seq.push(`${b.dataset.action}:${b.textContent === '' ? 'ok' : 'ok'}`);
    b.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  const s = window.__monoMain.game.state;
  return { seq, phase: s.phase, pos: s.players[0].pos, dice: s.dice };
});
gate.manual_seq = facts.manual.seq.join(',') === 'roll:ok,move:ok,settle:ok';
gate.manual_phase = facts.manual.phase === 'settled';
gate.manual_dice = facts.manual.dice === null || typeof facts.manual.dice.total === 'number';

await page.screenshot({ path: `${OUT}/mono-m4-02-settled.png` });

/* 3) 端到端整局：headless 跑到胜负，再重画 */
facts.sim = await page.evaluate(() => {
  const m = window.__monoMain;
  const winner = m.sim();
  const s = m.game.state;
  return {
    winner, over: s.over, round: s.round,
    cash: s.players.map((p) => p.cash),
    bankrupt: s.players.map((p) => p.bankrupt),
    primary: document.querySelector('#mono-hud button[data-primary]')?.dataset.action ?? null,
  };
});
gate.sim_over = facts.sim.over === true;
gate.sim_winner = facts.sim.winner >= 1 && facts.sim.winner <= 4;
gate.sim_round = facts.sim.round <= 61;
gate.sim_hud = facts.sim.primary === null;

await page.screenshot({ path: `${OUT}/mono-m4-03-final.png` });
await page.close();

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);