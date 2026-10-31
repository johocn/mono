/**
 * P3-3 流派↔天赋共鸣试玩：验证切换流派后功法/天赋面板共鸣标记渲染、共鸣数值联动、不崩。
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
  await safe(() => { window.__game.startNewGame("共鸣试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  // 切换流派为剑修（共鸣剑道），打开功法面板截图
  const school = await safe(() => {
    const g = window.__game;
    const r = g.player.setSchool("jianxiu");
    if (!g.schoolPanel.visible) g.schoolPanel.toggle();
    return { ok: r.ok, syn: g.player.schoolSynergy, visible: g.schoolPanel.visible };
  });
  await step(400);
  await shot("14_school_synergy");
  await safe(() => { const g = window.__game; if (g.schoolPanel.visible) g.schoolPanel.toggle(); return 1; });
  await step(200);

  // 打开天赋面板（剑道分支应标「共鸣 ×1.5」），截图
  const talent = await safe(() => {
    const g = window.__game;
    g.talentPanel.show();
    return { syn: g.player.schoolSynergy, visible: g.talentPanel.visible };
  });
  await step(400);
  await shot("15_talent_synergy");
  await safe(() => { window.__game.talentPanel.hide(); return 1; });
  await step(200);

  // 共鸣数值联动：剑修点剑道天赋 vs 散修同天赋（effAtk 应更高）
  const num = await safe(() => {
    const g = window.__game;
    g.player.setSchool("jianxiu");
    g.player.talents["sw_jianxin"] = 1;
    const atkSword = g.player.effAtk;
    g.player.setSchool("sanxiu");
    const atkSan = g.player.effAtk;
    return { atkSword: Math.round(atkSword * 10) / 10, atkSan: Math.round(atkSan * 10) / 10, higher: atkSword > atkSan };
  });

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ school, talent, num, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
