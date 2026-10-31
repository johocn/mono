/**
 * P3-7 叙事/选择分支试玩：验证云游客支线条件选项过滤 + setFlag + 任务对话交付全流程。
 * 需先 npm run dev(5180)。
 */
"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

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
  await safe(() => { window.__game.startNewGame("叙事试玩"); return 1; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  // 走到云游客苏砚旁，触发支线对话，验证条件选项过滤 + 任务交付
  const flow = await safe(() => {
    const g = window.__game;
    const lin = g.npcs.find((n) => n.def.id === "linyou");
    if (!lin) return { err: "no linyou npc" };
    const go = () => { g.player.gx = lin.def.gx; g.player.gy = lin.def.gy; g.talkNearest(); };
    go();
    const v1 = g.dialogue.visibleChoices.length; // 初始：接取/报酬/拒绝 = 3
    const stonesBefore = g.player.stones;
    g.dlgBox.onAdvance(0);                       // 选「替你寻来」→ 接取
    const accepted = g.player.flags.linyou_engaged === true && g.player.quests.active.includes("q_lostjade");
    const v2 = g.dialogue.visibleChoices.length; // linyou_accept 节点：1
    g.dlgBox.onAdvance(0);                       // 关闭
    go();
    const v3 = g.dialogue.visibleChoices.length; // 接取后：仅『交付』= 1
    g.dlgBox.onAdvance(0);                       // 交付 → 完成任务
    const done = g.player.flags.qdone_q_lostjade === true && g.player.quests.done.includes("q_lostjade");
    const stonesAfter = g.player.stones;
    g.dlgBox.onAdvance(0);                       // 关闭
    return { v1, v2, v3, accepted, done, stonesBefore, stonesAfter };
  });
  await shot("22_sidequest");

  console.log("P7_PLAYTHROUGH " + JSON.stringify({ flow, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P7_PLAYTHROUGH_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
