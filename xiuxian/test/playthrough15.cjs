/**
 * P3-8 运营/赛季：赛季榜（双账号排名/保最优）+ 限时活动副本（魔尊试炼通关自动提交成绩）。
 * 自带起游戏后端(3210)与 dev(5180)。
 */
"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const { spawn } = require("child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await sleep(200);
  }
  return false;
}

(async () => {
  const dbPath = path.join(ROOT, "test", "data", "p3-8.db");
  try { fs.rmSync(dbPath); } catch {}
  const srv = spawn("node", ["--experimental-sqlite", "server/server.cjs"], {
    cwd: ROOT, env: { ...process.env, PORT: "3210", XIUXIAN_DB: dbPath }, stdio: "ignore",
  });
  const srvUp = await waitUp("http://127.0.0.1:3210/api/season");
  console.log("SRV_UP", srvUp);
  if (!srvUp) { console.error("P8_FAIL: 后端未启动"); srv.kill(); process.exit(1); }

  let devUp = false;
  try { const r = await fetch("http://localhost:5180"); if (r.ok) devUp = true; } catch {}
  let devProc;
  if (!devUp) {
    devProc = spawn("cmd.exe", ["/c", "npm run dev > dev.log 2>&1"], { cwd: ROOT, stdio: "ignore", detached: true });
    for (let i = 0; i < 50; i++) { try { const r = await fetch("http://localhost:5180"); if (r.ok) { devUp = true; break; } } catch {} await sleep(200); }
  }
  console.log("DEV_UP", devUp);

  const shots = path.join(__dirname, "shots");
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const safe = (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ err: String(e && e.message ? e.message : e) }));
  const shot = (n) => page.screenshot({ path: path.join(shots, n + ".png") });

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await sleep(2600);

  const res = await safe(async () => {
    const g = window.__game;
    g.startNewGame("甲");
    for (let i = 0; i < 50 && !g.token; i++) await new Promise((r) => setTimeout(r, 100));
    const tokenA = g.token;
    const r2 = await g.cloud.login("乙");
    const tokenB = r2 && r2.token;

    // 赛季榜：双账号提交，验证排名与保最优
    const rankA = await g.cloud.submitSeasonScore(tokenA, 5000, 30000);
    const rankB = await g.cloud.submitSeasonScore(tokenB, 8000, 20000);
    const s1 = await g.cloud.getSeason();
    const topIdsS1 = s1.top.map((e) => e.nickname);
    // 甲提交更差分数应被跳过（保最优）
    const rankA2 = await g.cloud.submitSeasonScore(tokenA, 3000, 55000);
    const s2 = await g.cloud.getSeason();

    // 限时活动副本：进入 → 击杀魔尊 → 成绩自动提交
    g.openEvent();                       // 拉取赛季信息（异步渲染面板）
    await new Promise((r) => setTimeout(r, 400));
    const seasonOpen = g.eventPanel.season && g.eventPanel.season.open;
    g.enterEventDungeon();
    // 等待 boss 生成
    let guard = 0;
    while (!g.eventBoss && guard++ < 50) await new Promise((r) => setTimeout(r, 100));
    const bossSpawned = !!g.eventBoss;
    const stonesBefore = g.player.stones;
    // 强制击杀魔尊（模拟速通）
    let bossAliveAfterKill = "no-boss";
    let eventActiveAfterKill = null;
    if (g.eventBoss) {
      g.eventBoss.takeDamage(1e9, { x: g.player.gx, y: g.player.gy }, 0);
      bossAliveAfterKill = g.eventBoss.alive;
      eventActiveAfterKill = g.eventDungeon.active;
    }
    const frameBefore = g.frame || 0;
    const loopRan = await (async () => {
      for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 100)); if ((g.frame || 0) > frameBefore) return true; }
      return false;
    })();
    // 等待成绩提交（endEventDungeon 异步调用 cloud.submitSeasonScore）
    let seasonAfter = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const s = await g.cloud.getSeason();
      const me = s.top.find((e) => e.nickname === "甲");
      if (me && me.score > 8000) { seasonAfter = s; break; }
    }
    // 兜底：若主循环未推进 updateEventDungeon，则手动触发一次验证提交逻辑
    let manualTriggered = false;
    if (!seasonAfter) {
      manualTriggered = true;
      g.updateEventDungeon(0.1);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const s = await g.cloud.getSeason();
        const me = s.top.find((e) => e.nickname === "甲");
        if (me && me.score > 8000) { seasonAfter = s; break; }
      }
    }
    const myEntry = seasonAfter && seasonAfter.top.find((e) => e.nickname === "甲");
    g.eventPanel.hide();

    return {
      tokenA: !!tokenA, tokenB: !!tokenB, rankA, rankB,
      topS1: topIdsS1, rankA2,
      seasonOpen, bossSpawned,
      bossAliveAfterKill, eventActiveAfterKill,
      loopRan, manualTriggered,
      dungeonScore: myEntry ? myEntry.score : null,
      dungeonRank: myEntry ? seasonAfter.top.indexOf(myEntry) + 1 : null,
      stonesGained: g.player.stones - stonesBefore,
      seasonBest: g.player.seasonBest,
    };
  });
  await shot("28_p3-8_season");

  console.log("P8_SEASON " + JSON.stringify({ res, errors: errors.slice(0, 6) }, null, 2));
  await browser.close();
  srv.kill();
  if (devProc) try { process.kill(-devProc.pid); } catch {}
})().catch((e) => { console.error("P8_SEASON_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
