"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.g = window.__game; });
  const r = await page.evaluate(() => {
    const s = new Laya.Sprite();
    const t = new Laya.Text();
    return {
      spriteDefault: s.mouseEnabled,
      textDefault: t.mouseEnabled,
      titleRoot: g.titleUI.root.mouseEnabled,
      titleBtn: g.titleUI.root._children[7].mouseEnabled,
      worldRoot: g.worldMap.root.mouseEnabled,
      castRoot: g.castPanel.root.mouseEnabled,
      hudRoot: g.hud.root.mouseEnabled,
      skillRoot: g.skillBar.root.mouseEnabled,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
