/**
 * 全景试玩：基础流程 + 真实战斗 + 结缘结局 + 秘境 + 全系统面板遍历（镇妖塔/竞技场/灵兽/炼丹炼器/社交/门派/坊市/天赋/图鉴/成就/日常/战令）+ 渡劫/飞升尽力触发。
 * 每面板开关检测 visible + 截图。需先 npm run dev(5180)。
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
  const shot = (name) => page.screenshot({ path: path.join(shots, name + ".png") });
  const step = (ms) => page.waitForTimeout(ms);

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await step(2600);
  await safe(() => { window.__game.startNewGame("全景试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(200); }
  await step(400);

  // 结缘结局（验证弹层修复）
  await safe(() => { const g = window.__game; g.player.friends.lin = { affinity: 10, lastDay: "" }; g.openFriendEnding("lin"); return 1; });
  const ending = await safe(() => ({ endingId: window.__game.player.friendEnding.lin, dlgVisible: !!(window.__game.dlgBox && (window.__game.dlgBox.visible || (window.__game.dlgBox.root && window.__game.dlgBox.root.visible))), open: window.__game.dialogue.isOpen }));
  await shot("10_ending");
  await safe(() => { const g = window.__game; g.dialogue.close(); if (g.dlgBox && g.dlgBox.close) g.dlgBox.close(); return 1; });
  await step(150);

  // 真实战斗（秘境）
  await safe(() => { window.__game.enterRogue({ gx: 11, gy: 11 }); return 1; });
  await step(700);
  const rogueIn = await safe(() => ({ zone: window.__game.currentZoneId, monsters: window.__game.monsters.filter((m) => m.alive).length, floor: window.__game.rogueFloor }));
  await shot("11_rogue");
  const engage = await safe(() => { const g = window.__game; const w = g.monsters.find((m) => m.alive); if (!w) return { noMonster: true }; w.gx = g.player.gx + 1.3; w.gy = g.player.gy; return { mon: w.def && w.def.id, hp: Math.round(w.hp) }; });
  await shot("07_combat_engage");
  const combat = await safe(() => {
    const g = window.__game;
    const w = g.monsters.find((m) => m.alive) || g.monsters[0];
    if (!w) return { noMonster: true };
    w.gx = g.player.gx + 1.3; w.gy = g.player.gy;
    const before = { kills: g.player.kills, exp: g.player.exp };
    let guard = 0;
    while (w.alive && guard++ < 160) {
      g.player.hp = g.player.maxHp || 120;
      g.player.mp = g.player.maxMp || 9999;
      g.useSkill(0);
      for (let i = 0; i < 20; i++) g.debugStep(1 / 60);
    }
    return { killed: !w.alive, killsGain: g.player.kills - before.kills, expGain: g.player.exp - before.exp };
  });
  await shot("08_combat_result");
  await safe(() => { window.__game.enterZone("ch1"); return 1; });
  await step(300);

  // 全系统面板遍历：openXxx 触发 + 检测 visible + 截图（挑选代表性）
  const openMap = [
    ["towerPanel", "openTower"], ["arenaPanel", "openArena"], ["beastPanel", "openBeast"],
    ["socialPanel", "openSocial"], ["sectPanel", "openSect"], ["shopPanel", "openShop"],
    ["forgePanel", "openForge"], ["forgePanel", "openAlchemy"], ["eventPanel", "openEvent"],
    ["talentPanel", "talentPanel"], ["codexPanel", "codexPanel"], ["achievementsPanel", "achievementsPanel"],
    ["dailyPanel", "dailyPanel"], ["battlePassPanel", "battlePassPanel"],
  ];
  const panels = {};
  const shotName = { towerPanel: "20_tower", arenaPanel: "21_arena", beastPanel: "22_beast", socialPanel: "23_social", sectPanel: "24_sect", shopPanel: "25_shop", forgePanel: "26_forge", eventPanel: "27_event", talentPanel: "28_talent", codexPanel: "29_codex", achievementsPanel: "30_ach", dailyPanel: "31_daily", battlePassPanel: "32_battlepass" };
  for (const [panel, opener] of openMap) {
    await safe((args) => { const g = window.__game; const panel = args[0], opener = args[1]; const fn = g[opener]; if (typeof fn === "function") fn.call(g); else if (g[panel] && g[panel].toggle) g[panel].toggle(); return 1; }, [panel, opener]);
    await step(380);
    panels[panel] = await safe((p) => !!(window.__game[p] && window.__game[p].visible), panel);
    if (shotName[panel]) await shot(shotName[panel]);
    // 关闭该面板：优先 hide()
    await safe((p) => { const g = window.__game; if (g[p] && g[p].hide) g[p].hide(); return 1; }, panel);
    await step(150);
  }

  // 渡劫（尽力触发）：设 pendingTribulation 后手动触发
  const trib = await safe(() => {
    const g = window.__game;
    g.player.pendingTribulation = 1;
    g.tryManualTribulate();
    return { pending: g.player.pendingTribulation, dialogue: g.dialogue.isOpen, cutscene: g.cutscene && g.cutscene.active };
  });
  await shot("40_tribulation");
  await safe(() => { const g = window.__game; g.dialogue.close(); if (g.dlgBox && g.dlgBox.close) g.dlgBox.close(); return 1; });
  await step(150);

  // 飞升（尽力触发）：满足条件后 openAscend
  const ascend = await safe(() => {
    const g = window.__game;
    g.player.realm = "大乘期";
    g.player.exp = 999999;
    g.openAscend();
    return { ascending: !!g.ascending, dialogue: g.dialogue.isOpen, cutscene: g.cutscene && g.cutscene.active };
  });
  await shot("41_ascend");

  console.log("FULL_PLAYTHROUGH " + JSON.stringify({ ending, rogueIn, engage, combat, panels, trib, ascend, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("FULL_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
