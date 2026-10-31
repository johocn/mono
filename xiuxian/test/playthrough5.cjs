/**
 * P3-2 秘境事件房 + 祝福/遗物池试玩：验证事件触发、祝福/遗物/问号效果应用、不崩。
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
  await safe(() => { window.__game.startNewGame("事件试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(200); }
  await step(300);
  await safe(() => { window.__game.enterRogue({ gx: 11, gy: 11 }); return 1; });
  await step(700);
  const rogue = await safe(() => ({ zone: window.__game.currentZoneId, events: window.__game.rogueEvents.length }));

  // 事件房：商人（开坊市面板 + 弹层）
  const shop = await safe(() => {
    const g = window.__game;
    g.triggerRogueEvent("shop");
    return {
      dlgOpen: g.dialogue.isOpen,
      shopVisible: !!(g.shopPanel && (g.shopPanel.visible || (g.shopPanel.root && g.shopPanel.root.visible))),
    };
  });
  await shot("09_shop_event");
  await safe(() => { window.__game.dialogue.close(); if (window.__game.shopPanel && window.__game.shopPanel.close) window.__game.shopPanel.close(); return 1; });
  await step(300);

  // 祝福（当层临时增益）
  const blessing = await safe(() => {
    const g = window.__game; const before = g.player.buffs.length;
    g.applyEffects([{ t: "rogueBlessing" }]);
    return { before, after: g.player.buffs.length, hasTemp: g.player.buffs.some((b) => !b.persistent) };
  });

  // 遗物（整局持久增益）
  const relic = await safe(() => {
    const g = window.__game; const before = g.player.buffs.length;
    g.applyEffects([{ t: "rogueRelic" }]);
    return { before, after: g.player.buffs.length, hasPersistent: g.player.buffs.some((b) => b.persistent) };
  });

  // 问号（随机，不应崩）
  const mystery = await safe(() => {
    const g = window.__game; const before = g.player.buffs.length;
    g.applyEffects([{ t: "rogueMystery" }]);
    return { before, after: g.player.buffs.length, err: null };
  });

  await shot("10_event_buffs");

  console.log("P3_PLAYTHROUGH " + JSON.stringify({ rogue, shop, blessing, relic, mystery, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P3_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
