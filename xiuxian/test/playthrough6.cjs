/**
 * P3-4 装备品质色阶 + 词缀随机化试玩：高 bias 获得装备→品质/词缀记录→equip 数值缩放→背包色阶截图。
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
  await safe(() => { window.__game.startNewGame("品质试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(180); }
  await step(300);

  const equip = await safe(() => {
    const g = window.__game;
    g.player.addItem("qingfeng-jian", 1, 1.0); // 高 bias → 必高品质
    const r = g.player.rarityOf("qingfeng-jian");
    const atkBefore = g.player.effAtk;
    g.player.equip("qingfeng-jian");
    const atkAfter = g.player.effAtk;
    const af = g.player.affixes["qingfeng-jian"];
    return { rarity: r, hasAffix: !!af, affixKeys: af ? Object.keys(af) : [], atkBefore, atkAfter };
  });

  await safe(() => { window.__game.bag.show(); return 1; });
  await step(300);
  await shot("11_bag_rarity");
  await safe(() => { window.__game.bag.hide(); return 1; });

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ equip, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
