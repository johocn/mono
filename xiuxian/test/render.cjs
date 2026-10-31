"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.g = window.__game; });
  const log = {};
  const step = async (n, fn) => { try { log[n] = await fn(); } catch (e) { log[n] = "ERR:" + e.message; } };

  await step("enter", async () => { await page.mouse.click(640, 382); await page.waitForTimeout(500); return page.evaluate(() => g.phase); });
  await step("dismiss", async () => {
    for (let i = 0; i < 120; i++) { const o = await page.evaluate(() => g.dlgBox.visible); if (!o) break; await page.mouse.click(640, 650); await page.waitForTimeout(80); }
    return page.evaluate(() => g.dlgBox.visible);
  });
  await step("counts", async () => page.evaluate(() => ({
    waterTiles: g.map.waterTiles.length,
    ambient: g.map.ambient.length,
    props: g.map.propEntries().length,
    zoom: +g.map.zoom.toFixed(3),
  })));
  await step("wheelZoom", async () => {
    const before = await page.evaluate(() => g.map.zoom);
    // 向上滚（deltaY 负）应放大：在 canvas 上派发多次 wheel
    await page.evaluate(() => {
      const c = document.querySelector("canvas");
      for (let i = 0; i < 10; i++) c.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => g.map.zoom);
    return { before: +before.toFixed(3), after: +after.toFixed(3), changed: Math.abs(after - before) > 0.05 };
  });
  await step("walk", async () => {
    // 点远处地面走几步，确认相机跟随不报错且玩家在移动
    const a = await page.evaluate(() => ({ x: g.player.px, y: g.player.py }));
    await page.mouse.click(900, 300);
    await page.waitForTimeout(900);
    const b = await page.evaluate(() => ({ x: g.player.px, y: g.player.py }));
    return { moved: Math.hypot(b.x - a.x, b.y - a.y) > 5 };
  });
  await page.screenshot({ path: "test/_render.png" });
  console.log("RENDER", JSON.stringify({ ...log, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
