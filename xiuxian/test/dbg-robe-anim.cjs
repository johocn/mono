// 立绘律动幅度体检：逐 clip 采样 art.x/y/rotation/scaleY 的 min/max，换算屏幕像素评估可见性
"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__game && window.__game.startNewGame) window.__game.startNewGame("试玩"); return 1; });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.__game;
    let i = 0;
    while (g.dialogue.isOpen && i++ < 60) g.dlgBox.onAdvance(0);
    g.dialogue.close();
    if (g.cutscene) { g.cutscene.skip(); for (let j = 0; j < 40; j++) g.cutscene.update(1 / 60); }
    return 1;
  });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => !!(window.__game && window.__game.player && window.__game.player.rig && window.__game.player.rig.artReady));
    if (ready) break;
    await page.waitForTimeout(300);
  }
  console.log("ready:", ready);
  await page.waitForTimeout(400);

  const Z = await page.evaluate(() => window.__game.map.zoom * (window.__game.cam.zoomMul || 1));
  const artH = await page.evaluate(() => window.__game.player.rig.art.height);
  console.log("zoom Z:", Z, "art.height(世界px):", Math.round(artH));

  const clips = ["idle", "walk", "attack", "cast", "skill", "hurt", "dodge", "death"];
  for (const clip of clips) {
    const res = await page.evaluate((c) => new Promise((resolve) => {
      const g = window.__game;
      const rig = g.player.rig;
      const a = rig.art;
      const acc = { x: [1e9, -1e9], y: [1e9, -1e9], rot: [1e9, -1e9], sy: [1e9, -1e9] };
      const dur = { idle: 1500, walk: 1500, attack: 400, cast: 900, skill: 550, hurt: 350, dodge: 380, death: 600 }[c] || 600;
      rig.play(c);
      const t0 = performance.now();
      const iv = setInterval(() => {
        acc.x[0] = Math.min(acc.x[0], a.x); acc.x[1] = Math.max(acc.x[1], a.x);
        acc.y[0] = Math.min(acc.y[0], a.y); acc.y[1] = Math.max(acc.y[1], a.y);
        acc.rot[0] = Math.min(acc.rot[0], a.rotation); acc.rot[1] = Math.max(acc.rot[1], a.rotation);
        acc.sy[0] = Math.min(acc.sy[0], a.scaleY); acc.sy[1] = Math.max(acc.sy[1], a.scaleY);
        if (performance.now() - t0 > dur) { clearInterval(iv); resolve(acc); }
      }, 30);
    }), clip);
    const dx = (res.x[1] - res.x[0]).toFixed(1), dy = (res.y[1] - res.y[0]).toFixed(1);
    const dr = (res.rot[1] - res.rot[0]).toFixed(1), dsy = (res.sy[1] - res.sy[0]).toFixed(3);
    const scrY = (dy * Z).toFixed(1), scrX = (dx * Z).toFixed(1);
    // 旋转在角色顶部的视觉位移 ≈ rot(度)/180*PI*artH
    const rotPx = (dr * Math.PI / 180 * artH).toFixed(1);
    console.log(`${clip.padEnd(7)} dx=${dx}(${scrX}屏px) dy=${dy}(${scrY}屏px) dRot=${dr}°(顶部≈${rotPx}屏px) dScaleY=${dsy}`);
  }
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
