"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__game.startNewGame("摆腿验证"); return 1; });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.__game;
    let i = 0;
    while (g.dialogue.isOpen && i++ < 60) g.dlgBox.onAdvance(0);
    g.dialogue.close();
    if (g.cutscene) { g.cutscene.skip(); for (let j = 0; j < 40; j++) g.cutscene.update(1 / 60); }
    return 1;
  });
  for (let i = 0; i < 40; i++) {
    const r = await page.evaluate(() => !!(window.__game.player.rig && window.__game.player.rig.artReady));
    if (r) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  // 触发寻路移动
  await page.evaluate(() => {
    const g = window.__game, ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    const gx = Math.floor(g.player.gx), gy = Math.floor(g.player.gy);
    let tx = gx + 3, ty = gy;
    if (g.map.map.blocked[ty][tx]) tx = gx - 3;
    const c = ms.worldOf(tx, ty);
    g.lastClick = { sx: Z * c.x + rootX, sy: Z * c.y + rootY };
    return 1;
  });
  const c = await page.evaluate(() => window.__game.lastClick);
  await page.mouse.click(c.sx, c.sy);
  // 移动中每 130ms 采样一次腿/裙旋转
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => {
      const rig = window.__game.player.rig;
      const bones = rig && rig.skelRig && rig.skelRig.bones ? rig.skelRig.bones : null;
      if (!bones) return { state: window.__game.player.state, err: "no bones map" };
      const rot = (n) => { const b = bones.get ? bones.get(n) : bones[n]; return b && b.node ? Math.round((b.node.rotation || 0) * 10) / 10 : null; };
      return { state: window.__game.player.state, legfront: rot("legfront"), legback: rot("legback"), skirt: rot("skirt"), arm: rot("armfront") };
    });
    samples.push(s);
    await page.waitForTimeout(130);
  }
  console.log(JSON.stringify(samples, null, 1));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e && e.message); process.exit(1); });
