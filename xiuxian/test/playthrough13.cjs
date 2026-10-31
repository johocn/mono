/**
 * P3-7 叙事/选择分支（续）：第二位支线 NPC 游方道人·玄机子的道德抉择分支。
 * 验证相助（接取→交付→奖励）与举报（举发私炼禁丹→赏银）两条互斥分支在真实浏览器下均正确。
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

  const helpFlow = await safe(() => {
    const g = window.__game;
    g.startNewGame("玄机-相助");
    return true;
  });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);

  const help = await safe(() => {
    const g = window.__game;
    const npc = g.npcs.find((n) => n.def.id === "xuanji");
    if (!npc) return { err: "no xuanji npc" };
    const go = () => { g.player.gx = npc.def.gx; g.player.gy = npc.def.gy; g.talkNearest(); };
    go();
    const v1 = g.dialogue.visibleChoices.length;            // 初始：相助/举报/告辞 = 3
    const idxHelp = g.dialogue.visibleChoices.findIndex((c) => c.text.includes("我愿相助"));
    g.dlgBox.onAdvance(idxHelp);                            // 选「相助」→ 接取
    const accepted = g.player.flags.xuanji_engaged === true && g.player.quests.active.includes("q_xuanji_herb");
    const v2 = g.dialogue.visibleChoices.length;            // xuanji_accept 节点：1
    g.dlgBox.onAdvance(0);                                  // 关闭
    go();
    const v3 = g.dialogue.visibleChoices.length;            // 接取后：仅『交付』= 1
    const stonesBefore = g.player.stones;
    g.dlgBox.onAdvance(0);                                  // 交付 → 完成任务（奖励：灵石+150）
    const done = g.player.flags.qdone_q_xuanji_herb === true && g.player.quests.done.includes("q_xuanji_herb");
    const stonesAfter = g.player.stones;
    g.dlgBox.onAdvance(0);                                  // 关闭
    return { v1, v2, v3, accepted, done, stonesBefore, stonesAfter };
  });
  await shot("24_xuanji_help");

  // 举报分支：开新档重置，验证互斥的另一条线
  await safe(() => { window.__game.startNewGame("玄机-举报"); return true; });
  await step(700);
  for (let i = 0; i < 14; i++) { await page.mouse.click(640, 610); await step(150); }
  await step(300);
  const report = await safe(() => {
    const g = window.__game;
    const npc = g.npcs.find((n) => n.def.id === "xuanji");
    const go = () => { g.player.gx = npc.def.gx; g.player.gy = npc.def.gy; g.talkNearest(); };
    go();
    const v1 = g.dialogue.visibleChoices.length;            // 初始：3
    const stonesBefore = g.player.stones;
    const idxReport = g.dialogue.visibleChoices.findIndex((c) => c.text.includes("换取赏银"));
    g.dlgBox.onAdvance(idxReport);                          // 选「举报」→ 举发私炼禁丹
    const reported = g.player.flags.xuanji_reported === true;
    const gone = g.player.flags.xuanji_gone === true;
    const stonesAfter = g.player.stones;                    // 应 +80 赏银
    g.dlgBox.onAdvance(0);                                  // 关闭
    return { v1, reported, gone, stonesBefore, stonesAfter };
  });
  await shot("25_xuanji_report");

  // 跨 NPC 世界线涟漪：举报玄机子后，村长对话据此变化
  const cunzhang = await safe(() => {
    const g = window.__game;
    const npc = g.npcs.find((n) => n.def.id === "cunzhang");
    const go = () => { g.player.gx = npc.def.gx; g.player.gy = npc.def.gy; g.talkNearest(); };
    go();
    const v = g.dialogue.visibleChoices.length;
    const stonesBefore = g.player.stones;
    const idx = g.dialogue.visibleChoices.findIndex((c) => c.text.includes("私炼禁丹"));
    g.dlgBox.onAdvance(idx);                                  // 选举报义举分支
    const sawReportBranch = g.dialogue.current.id === "cunzhang_xuanji_report";
    const stonesAfter = g.player.stones;                      // 应 +30
    g.dlgBox.onAdvance(0);                                   // 关闭
    return { v, idxGte0: idx >= 0, sawReportBranch, stonesBefore, stonesAfter };
  });
  await shot("26_cunzhang_worldline");

  console.log("P7_XUANJI " + JSON.stringify({ helpFlow, help, report, cunzhang, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("P7_XUANJI_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
