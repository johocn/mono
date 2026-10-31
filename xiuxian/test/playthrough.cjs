/**
 * 本地试玩脚本：真实 Chromium 打开 dev(5180)，走一遍 标题→开局→对话→移动→技能→背包，
 * 每步截图到 test/shots/ 并抓取状态，供人工核对渲染与可玩性。需先 npm run dev。
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
  const safe = (fn) => page.evaluate(fn).catch((e) => ({ err: String(e && e.message ? e.message : e) }));
  const shot = (name) => page.screenshot({ path: path.join(shots, name + ".png") });
  const step = (ms) => page.waitForTimeout(ms);

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await step(2600);
  await shot("01_title");
  const s0 = await safe(() => ({ hasGame: !!window.__game, phase: window.__game && window.__game.phase }));

  await safe(() => { window.__game.startNewGame("试玩道友"); return 1; });
  await step(700);
  await shot("02_intro_dialogue");
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(200); }
  await step(400);
  await shot("03_play");
  const s1 = await safe(() => ({
    phase: window.__game.phase,
    dialogue: window.__game.dialogue.isOpen,
    hp: window.__game.player.hp,
    zone: window.__game.currentZoneId,
    monsters: window.__game.monsters.filter((m) => m.alive).length,
    gx: Math.round(window.__game.player.gx),
    gy: Math.round(window.__game.player.gy),
  }));

  // 点击地面移动
  await page.mouse.click(820, 430);
  await step(1000);
  await shot("04_move");
  const s2 = await safe(() => ({ gx: Math.round(window.__game.player.gx), gy: Math.round(window.__game.player.gy) }));

  // 施放技能槽 1
  await page.keyboard.press("Digit1");
  await step(600);
  await shot("05_skill");
  const s3 = await safe(() => ({ mp: Math.round(window.__game.player.mp), casting: !!window.__game.player.casting }));

  // 打开/关闭背包
  await page.keyboard.press("KeyB");
  await step(500);
  await shot("06_bag");
  const sBag = await safe(() => window.__game.bag.visible);
  await page.keyboard.press("KeyB");
  await step(300);

  // 触屏控件（桌面下应隐藏）
  const sMob = await safe(() => ({ mobileVisible: window.__game.mobile.root.visible, joyActive: window.__game.input.joyActive }));

  console.log("PLAYTHROUGH " + JSON.stringify({ s0, s1, s2, s3, sBag, sMob, errors }, null, 2));
  await browser.close();
  if (errors.length > 0) process.exit(2);
})().catch((e) => { console.error("PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
