/**
 * P3-1 战斗手感试玩：验证翻滚闪避（i-frame + 体力）与五行接入后战斗不崩。
 * 需先 npm run dev(5180)。
 */
"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const path = require("node:path");
const fs = require("node:fs");

(async () => {
  const shots = path.join(__dirname, "shots");
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const safe = (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ err: String(e && e.message ? e.message : e) }));
  const shot = (n) => page.screenshot({ path: path.join(shots, n + ".png") });
  const step = (ms) => page.waitForTimeout(ms);

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await step(2600);
  await safe(() => { window.__game.startNewGame("翻滚试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(200); }
  await step(300);

  // 进入秘境（有怪，便于战斗验证）
  await safe(() => { window.__game.enterRogue({ gx: 11, gy: 11 }); return 1; });
  await step(700);
  const rogue = await safe(() => ({ zone: window.__game.currentZoneId, monsters: window.__game.monsters.filter((m) => m.alive).length }));

  // 翻滚闪避验证：i-frame + 体力消耗
  const roll = await safe(() => {
    const g = window.__game; const p = g.player;
    const s0 = p.stamina;
    const ok = p.tryRoll(1, 0);
    return { ok, invincible: p.invincible, staminaBefore: s0, staminaAfter: p.stamina, rolling: p.rolling };
  });
  await shot("06_roll");
  await step(400);

  // 五行接入后战斗击杀闭环
  const engage = await safe(() => { const g = window.__game; const w = g.monsters.find((m) => m.alive); if (!w) return { noMonster: true }; w.gx = g.player.gx + 1.3; w.gy = g.player.gy; return { mon: w.def && w.def.id, hp: Math.round(w.hp) }; });
  await shot("07_combat_engage");
  const combat = await safe(() => {
    const g = window.__game; const w = g.monsters.find((m) => m.alive) || g.monsters[0];
    if (!w) return { noMonster: true };
    w.gx = g.player.gx + 1.3; w.gy = g.player.gy;
    g.player.baseAtk = 200; // 试玩临时拉高攻击力以破防验证战斗闭环（五行倍率已由 smoke 单测覆盖）
    const before = { kills: g.player.kills, exp: g.player.exp };
    let guard = 0;
    while (w.alive && guard++ < 160) {
      g.player.hp = g.player.maxHp || 120; g.player.mp = g.player.maxMp || 9999;
      g.useSkill(0);
      for (let i = 0; i < 20; i++) g.debugStep(1 / 60);
    }
    return { killed: !w.alive, killsGain: g.player.kills - before.kills, expGain: g.player.exp - before.exp };
  });
  await shot("08_combat_result");

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ rogue, roll, engage, combat, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
