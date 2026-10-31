"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const safeEval = (fn) => page.evaluate(fn).catch((e) => ({ evalErr: (e && e.message) || String(e) }));

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.g = window.__game; window.g.startNewGame("主题验证"); });
  await page.waitForTimeout(800);
  await safeEval(() => { const g = window.g; if (g.dialogue.isOpen) g.dialogue.close(); return 1; });
  await page.waitForTimeout(300);

  const before = await safeEval(() => ({
    zone: window.g.currentZoneId,
    npc: window.g.npcs.length,
    gathers: window.g.activeGathers.length,
    themeIdx: typeof window.g.themeIdx === "number" ? window.g.themeIdx : -1,
  }));

  for (let i = 0; i < 5; i++) { await page.keyboard.press("x"); await page.waitForTimeout(250); }
  const afterTheme = await safeEval(() => ({ themeIdx: window.g.themeIdx, npc: window.g.npcs.length }));

  // 功能校验：把玩家放到「山门」传送阵(1,11)格心，下一帧应弹出门派传送面板
  await safeEval(() => { const g = window.g; g.player.gx = 1.5; g.player.gy = 11.5; return 1; });
  await page.waitForTimeout(400);
  const gateDiag = await safeEval(() => {
    const g = window.g;
    return {
      gx: g.player.gx, gy: g.player.gy,
      cd: g.transferCooldown,
      anyPanel: g.anyPanelOpen(),
      panelVisible: !!(g.transferPanel && g.transferPanel.visible),
    };
  });
  const gateOpen = gateDiag.panelVisible;

  await page.waitForTimeout(200);
  console.log(JSON.stringify({
    开局: before,
    主题切换后: afterTheme,
    山门诊断: gateDiag,
    山门传送面板弹出: gateOpen,
    错误数: errors.length,
    错误: errors.slice(0, 8),
  }, null, 2));
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((e) => { console.error("THEME_CHECK_FAIL:", e && e.stack ? e.stack : e && e.message); process.exit(1); });
