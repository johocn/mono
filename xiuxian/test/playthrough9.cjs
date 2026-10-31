/**
 * P3-1b 格挡/弹反/连招试玩：验证格挡减伤、弹反免伤、连击 UI 显示、不崩。
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
  await safe(() => { window.__game.startNewGame("格挡试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  // 1) 真实按住 Q 键 → 格挡姿态持续 + Hud「御」图标显示
  await page.keyboard.down("q");
  await step(200);
  const block = await safe(() => {
    const g = window.__game;
    g.player.hp = 1000; g.player.maxHp = 1000;
    return { blocking: g.player.blocking };
  });
  const blockUi = await safe(() => ({ visible: window.__game.hud.blockMark.visible }));
  await shot("18_block");
  await page.keyboard.up("q");
  await step(100);

  // 2) 弹反：举盾瞬间被命中 → 完全免伤（同帧内 tryBlock + 命中，避免自动 endBlock）
  const parry = await safe(() => {
    const g = window.__game;
    const m = { effAtk: 60, element: undefined, rng: () => 0.5, gx: g.player.gx, gy: g.player.gy, addBuff() {}, applyKnockback() {} };
    g.player.hp = 1000; g.player.invincible = 0;
    g.player.blocking = true; g.player.blockT = 0; g.player.blockCd = 0;
    const hp0 = g.player.hp;
    g.damagePlayer(m, 1);
    return { dmg: hp0 - g.player.hp, blocking: g.player.blocking };
  });
  await safe(() => { window.__game.player.endBlock(); return 1; });

  // 3) 普通格挡：举盾后超时 → 减伤（伤害低于无格挡）
  const guard = await safe(() => {
    const g = window.__game;
    const m = { effAtk: 60, element: undefined, rng: () => 0.5, gx: g.player.gx, gy: g.player.gy, addBuff() {}, applyKnockback() {} };
    g.player.hp = 1000; g.player.invincible = 0; g.player.blocking = false;
    const hpA = g.player.hp; g.damagePlayer(m, 1); const full = hpA - g.player.hp;
    g.player.hp = 1000; g.player.invincible = 0;
    g.player.blocking = true; g.player.blockT = 1.0; g.player.blockCd = 0;
    const hpB = g.player.hp; g.damagePlayer(m, 1); const blocked = hpB - g.player.hp;
    return { full, blocked, ratio: full > 0 ? blocked / full : -1 };
  });
  await safe(() => { window.__game.player.endBlock(); return 1; });
  await step(100);

  // 4) 连击 UI：置连击数并同帧强制刷新 Hud → 「X 连击」显示
  const streak = await safe(() => {
    const g = window.__game;
    g.dialogue.isOpen = false;
    g.streak = 7; g.streakT = 2.0; // 维持连击窗口，避免一帧衰减清零
    g.hud.setStreak(g.streak);
    return { streak: g.streak };
  });
  await shot("19_streak");
  const streakUi = await safe(() => ({ visible: window.__game.hud.streakPanel.visible, text: window.__game.hud.streakText.text }));
  await safe(() => { window.__game.streak = 0; window.__game.hud.setStreak(0); return 1; });

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ block, blockUi, parry, guard, streak, streakUi, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
