/**
 * P3-5余 奇遇/宝箱/动态刷怪试玩：验证宝箱开启掉落、奇遇对话触发、动态刷怪补怪、不崩。
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
  await safe(() => { window.__game.startNewGame("奇遇试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  // 1) 宝箱：站到第一个宝箱（自适应 activeChests）→ 同帧检测 → 开启获得掉落
  const chest = await safe(() => {
    const g = window.__game;
    const cs = g.activeChests || [];
    const t = cs[0];
    if (!t) return { err: "no chest", count: cs.length };
    g.player.gx = t.gx; g.player.gy = t.gy;
    g.updateNearChest();
    const gotNear = !!g.nearChest;
    const before = g.player.countItem("huixue-dan");
    if (g.nearChest) g.openChest(g.nearChest);
    const key = "chest:" + g.currentZoneId + ":" + t.gx + "," + t.gy;
    return { count: cs.length, gotNear, before, after: g.player.countItem("huixue-dan"), flagged: !!g.player.flags[key] };
  });
  await shot("20_chest");
  await step(100);

  // 2) 奇遇：强制打开一个奇遇节点（验证 STORY 合并 + 对话可开启/关闭）
  const enc = await safe(() => {
    const g = window.__game;
    g.dialogue.open("enc_fox");
    const open = g.dialogue.isOpen;
    g.dialogue.advance(0); // 无 choices → 关闭
    return { open, closed: !g.dialogue.isOpen };
  });
  await safe(() => { window.__game.dialogue.open("enc_mystic"); return 1; });
  await shot("21_encounter");
  await safe(() => { if (window.__game.dialogue.isOpen) window.__game.dialogue.close(); return 1; });
  await step(100);

  // 3) 动态刷怪：直接驱动 dynSpawnTick 验证在玩家附近补怪
  const dyn = await safe(() => {
    const g = window.__game;
    const before = g.monsters.length;
    g.dynSpawnT = 0;
    g.dynSpawnTick(10);
    g.dynSpawnTick(10);
    g.dynSpawnTick(10);
    return { before, after: g.monsters.length, spawned: g.monsters.length - before };
  });

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ chest, enc, dyn, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
