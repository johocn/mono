"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.startNewGame("截图"); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test/shot-iso.png" });
  // 再切到青玉仙镇主题看配色
  await page.evaluate(() => { try { window.__game.map.setTheme("qingyu"); } catch (e) {} });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test/shot-iso-qingyu.png" });
  await browser.close();
  console.log("SHOT_DONE");
})().catch((e) => { console.error("SHOT_FAIL:", e && e.stack); process.exit(1); });
