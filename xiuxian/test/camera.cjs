"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.g = window.__game; });
  const log = {};
  const step = async (name, fn) => { try { log[name] = await fn(); } catch (e) { log[name] = "ERR:" + e.message; } };

  await step("enter", async () => { await page.mouse.click(640, 382); await page.waitForTimeout(500); return page.evaluate(() => g.phase); });
  await step("dismissDlg", async () => {
    for (let i = 0; i < 120; i++) { const o = await page.evaluate(() => g.dlgBox.visible); if (!o) break; await page.mouse.click(640, 650); await page.waitForTimeout(90); }
    return page.evaluate(() => g.dlgBox.visible);
  });

  // 把相机钳制到四个 iso 角，检查玩家是否落在视口内（修复前角落会出屏 → sx/sy 越界）
  await step("corners", async () => page.evaluate(() => {
    const b = g.map.worldBounds();
    const W = g.map.map.w, H = g.map.map.h;
    const zoom = g.map.zoom;
    const vw = g.viewW / zoom, vh = g.viewH / zoom;
    const Z = zoom * (g.cam.zoomMul || 1);
    const test = (wx, wy) => {
      g.cam.follow(wx, wy, vw, vh, 0.016, b);
      const rootX = -g.cam.x * zoom - wx * (Z - zoom);
      const rootY = -g.cam.y * zoom - wy * (Z - zoom);
      const sx = wx * Z + rootX, sy = wy * Z + rootY;
      return { sx: Math.round(sx), sy: Math.round(sy) };
    };
    const corners = {
      tl: test(-(H - 1) * 32, 0),            // grid(0,0) 附近左上
      bl: test(-(H - 1) * 32, (W - 1 + H - 1) * 16), // 左下 iso 角（最负 x）
      tr: test((W - 1) * 32, (W - 1) * 16),  // 右上
      br: test((W - 1) * 32, (W - 1 + H - 1) * 16), // 右下
    };
    return { bounds: b, view: { w: g.viewW, h: g.viewH }, corners };
  }));

  // 真实点击左上地图区域（避开 HUD 死区 240x104），应能从玩家当前位置寻路到达
  await step("walkTopLeft", async () => {
    // 选一个左上角可走格（gx=2,gy=2 附近），点击其屏幕坐标
    const r = await page.evaluate(() => {
      const b = g.map.worldBounds();
      const vw = g.viewW / g.map.zoom, vh = g.viewH / g.map.zoom;
      // 直接让相机跟随到玩家，确保玩家居中，再取左上角格屏幕坐标
      g.cam.follow(g.player.px, g.player.py, vw, vh, 0.016, b);
      // 取地图 grid(2,2) 的世界坐标并转屏幕
      const { gridToScreen } = g.map; // 不一定暴露，退而求其次用手算
      const wx = (2 - 2) * 32, wy = (2 + 2) * 16;
      const Z = g.map.zoom * (g.cam.zoomMul || 1);
      const rootX = -g.cam.x * g.map.zoom - g.player.px * (Z - g.map.zoom);
      const rootY = -g.cam.y * g.map.zoom - g.player.py * (Z - g.map.zoom);
      return { sx: wx * Z + rootX, sy: wy * Z + rootY };
    });
    const sx = Math.round(r.sx), sy = Math.round(r.sy);
    await page.mouse.click(sx, sy);
    await page.waitForTimeout(400);
    return page.evaluate(() => ({ target: g.player.path.length, gx: g.player.gx, gy: g.player.gy }));
  });

  console.log("CAMERA", JSON.stringify({ ...log, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
