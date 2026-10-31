"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__game && window.__game.startNewGame) window.__game.startNewGame("试玩"); return 1; });
  await page.waitForTimeout(400);
  // 关掉开场旁白/对话 + 过场，避免面板遮挡与世界冻结
  await page.evaluate(() => {
    const g = window.__game;
    let i = 0;
    while (g.dialogue.isOpen && i++ < 60) g.dlgBox.onAdvance(0);
    g.dialogue.close();
    if (g.cutscene) { g.cutscene.skip(); for (let j = 0; j < 40; j++) g.cutscene.update(1 / 60); }
    return 1;
  });
  // 等主角骨架就绪
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => !!(window.__game && window.__game.player && window.__game.player.rig && window.__game.player.rig.artReady));
    if (ready) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);

  const playerRect = () => page.evaluate(() => {
    const g = window.__game;
    const ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    return { sx: Z * g.player.px + rootX, sy: Z * g.player.py + rootY, Z, state: g.player.state };
  });
  const clipOf = (r) => {
    const h = 66 * r.Z, halfW = h * 0.62;
    return { x: Math.max(0, r.sx - halfW), y: Math.max(0, r.sy - h * 1.02), width: halfW * 2, height: h * 1.22 };
  };

  // 待机特写
  let r = await playerRect();
  await page.screenshot({ path: path.join(OUT, "player_idle.png"), clip: clipOf(r) });

  // 真实寻路移动 → 行走特写（动画随位移自然推进）
  const mv = await page.evaluate(() => {
    const g = window.__game;
    const ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    const gx = Math.floor(g.player.gx), gy = Math.floor(g.player.gy);
    let tx = gx + 2, ty = gy;
    if (g.map.map.blocked[ty] && g.map.map.blocked[ty][tx]) { tx = gx - 2; }
    const c = ms.worldOf(tx, ty);
    return { sx: Z * c.x + rootX, sy: Z * c.y + rootY };
  });
  await page.mouse.click(mv.sx, mv.sy);
  await page.waitForTimeout(420); // 行走中
  r = await playerRect();
  await page.screenshot({ path: path.join(OUT, "player_walk.png"), clip: clipOf(r) });
  await page.waitForTimeout(260); // 行走另一相位
  r = await playerRect();
  await page.screenshot({ path: path.join(OUT, "player_walk2.png"), clip: clipOf(r) });
  await page.waitForTimeout(1800); // 到位后回 idle

  const state = await page.evaluate(() => ({ state: window.__game.player.state, kills: window.__game.player.kills }));
  console.log("done", JSON.stringify(state), "ready:", ready);
  await browser.close();
})().catch((e) => { console.error("SHOT_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
