/**
 * 本地深入试玩：Roguelike 秘境真实战斗击杀闭环 + 技能连段 + NPC 结缘多结局 + 代表面板。
 * 出生点无怪，故战斗放在有怪的秘境(rogue)内验证。截图到 test/shots/。需先 npm run dev(5180)。
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
  await safe(() => { window.__game.startNewGame("深度试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(200); }
  await step(400);

  // —— NPC 结缘多结局（③，不依赖怪）——
  await safe(() => { const g = window.__game; g.player.friends.lin = { affinity: 10, lastDay: "" }; g.openFriendEnding("lin"); return 1; });
  const ending = await safe(() => ({
    endingId: window.__game.player.friendEnding.lin,
    speaker: window.__game.dialogue.current && window.__game.dialogue.current.speaker,
    open: window.__game.dialogue.isOpen,
    dlgVisible: !!(window.__game.dlgBox && (window.__game.dlgBox.visible || (window.__game.dlgBox.root && window.__game.dlgBox.root.visible))),
  }));
  await shot("10_ending");
  await safe(() => { const g = window.__game; g.dialogue.close(); if (g.dlgBox && g.dlgBox.close) g.dlgBox.close(); return 1; });

  // —— 进入秘境（②，必有怪）——
  await safe(() => { window.__game.enterRogue({ gx: 11, gy: 11 }); return 1; });
  await step(700);
  const rogueIn = await safe(() => ({ zone: window.__game.currentZoneId, monsters: window.__game.monsters.filter((m) => m.alive).length, floor: window.__game.rogueFloor }));
  await shot("11_rogue");

  // —— 真实战斗：拉一只怪到身旁 → 连放技能1 直到击杀 ——
  const engage = await safe(() => {
    const g = window.__game;
    const w = g.monsters.find((m) => m.alive);
    if (!w) return { noMonster: true };
    w.gx = g.player.gx + 1.3; w.gy = g.player.gy;
    return { mon: w.def && w.def.id, hp: Math.round(w.hp), max: Math.round(w.maxHp) };
  });
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
    return {
      mon: w.def && w.def.id,
      killed: !w.alive,
      killsGain: g.player.kills - before.kills,
      expGain: g.player.exp - before.exp,
      invKeys: [...(g.player.inv ? g.player.inv.keys() : [])].slice(0, 8),
    };
  });
  await shot("08_combat_result");

  // —— 技能连段 1-4（有怪时可投射命中）——
  const skills = await safe(() => {
    const g = window.__game;
    const w = g.monsters.find((m) => m.alive);
    if (w) { w.gx = g.player.gx + 2; w.gy = g.player.gy; }
    const out = [];
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < 60; i++) g.debugStep(1 / 60); // 等待上一技能吟唱/冷却结束
      g.player.mp = g.player.maxMp || 9999;
      const mpBefore = g.player.mp;
      g.useSkill(s);
      const casting = !!g.player.casting;
      for (let i = 0; i < 40 && g.player.casting; i++) g.debugStep(1 / 60);
      out.push({ slot: s + 1, casting, mpUsed: Math.round(mpBefore - g.player.mp) });
    }
    return out;
  });
  await shot("09_skills");

  // —— 退回落霞镇 → 代表面板：镇妖塔 / 社交 / 炼丹(forgePanel) ——
  await safe(() => { window.__game.enterZone("ch1"); return 1; });
  await step(300);
  const panels = {};
  await safe(() => { window.__game.towerPanel.show(); return 1; }); await step(350);
  panels.tower = await safe(() => window.__game.towerPanel.visible);
  await safe(() => { window.__game.towerPanel.hide(); return 1; }); await step(200);
  await safe(() => { window.__game.openSocial(); return 1; }); await step(400);
  panels.social = await safe(() => window.__game.socialPanel.visible);
  await shot("12_social");
  await safe(() => { window.__game.socialPanel.hide(); return 1; }); await step(200);
  await safe(() => { window.__game.openAlchemy(); return 1; }); await step(400);
  panels.alchemy = await safe(() => window.__game.forgePanel.visible);
  await shot("13_alchemy");
  await safe(() => { window.__game.forgePanel.hide(); return 1; }); await step(200);

  console.log("DEEP_PLAYTHROUGH " + JSON.stringify({ ending, rogueIn, engage, combat, skills, panels, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("DEEP_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
