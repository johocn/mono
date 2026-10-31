/**
 * P3-7 多周目（NG+）试玩：触发通关授予元进度 → 开 NG+ 新档验证继承（修为/灵石/效率）。
 * 需先 npm run dev(5180)。
 */
"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

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
  await safe(() => { window.__game.startNewGame("轮回试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(120); }
  await step(300);

  // 触发通关：置 ch1_win 并走 applyEffects → onChapterWin 授予元进度（cloud 降级不影响落盘）
  await safe(() => {
    const g = window.__game;
    g.player.flags["ch1_win"] = true;
    g.applyEffects([{ t: "giveExp", n: 1 }]);
    return true;
  });
  await step(900); // 等 onChapterWin 异步落盘

  const meta = await safe(() => {
    const raw = localStorage.getItem("xiuxian.meta.v1");
    return raw ? JSON.parse(raw) : null;
  });

  // 开启新一轮（NG+）：应继承周目加成
  const carry = await safe(() => {
    const g = window.__game;
    g.startNewGame("轮回试玩2");
    return { ngPlus: g.player.ngPlus, stones: g.player.stones, exp: g.player.exp };
  });
  await step(400);
  await shot("23_ngplus");

  console.log("P7_NGPLUS " + JSON.stringify({ meta, carry, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P7_NGPLUS_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
