/**
 * P3-5 野外采集点 + 炼丹闭环试玩：验证采集点标记/提示、采集交互、灵草炼丹产出、不崩。
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
  await safe(() => { window.__game.startNewGame("采集试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  // 第一个灵草采集点（自适应 activeGathers，已吸附到可走格）
  const gather = await safe(() => {
    const g = window.__game;
    const gs = g.activeGathers || [];
    const t = gs.find((x) => x.mat === "ling-cao") || gs[0];
    return { hasGather: !!t, mat: t && t.mat, n: t && t.n, count: gs.length };
  });
  await step(200);
  await shot("16_gather");

  // 同帧内定位到灵草点 → 检测 nearGather → 采集（避免帧逻辑覆盖坐标）
  const picked = await safe(() => {
    const g = window.__game;
    const gs = g.activeGathers || [];
    const t = gs.find((x) => x.mat === "ling-cao") || gs[0];
    if (!t) return { err: "no gather" };
    g.player.gx = t.gx; g.player.gy = t.gy;
    g.updateNearGather();
    const gotNear = !!g.nearGather;
    const near = g.nearGather ? g.nearGather.mat : null;
    const before = g.player.countItem(t.mat);
    if (g.nearGather) g.gather(g.nearGather);
    return { before, after: g.player.countItem(t.mat), near, gotNear };
  });

  // 补足灵草到 3 个以炼丹
  await safe(() => { const g = window.__game; while (g.player.countItem("ling-cao") < 3) g.player.addItem("ling-cao", 1); });
  const alch = await safe(() => {
    const g = window.__game;
    const r = g.player.alchemize("r-cao-dan", () => 0);
    return { ok: r.ok, success: r.success, huixue: g.player.countItem("huixue-dan") };
  });

  // 打开炼丹（炼器台）面板截图核验丹方
  await safe(() => { window.__game.openAlchemy(); return 1; });
  await step(400);
  await shot("17_alchemy");
  await safe(() => { window.__game.forgePanel.hide(); return 1; });
  await step(200);

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ gather, picked, alch, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
