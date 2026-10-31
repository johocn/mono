/**
 * P3-6 社交实时化：跨玩家邮件 / 宗门贡献榜 / 软实时在线道友。
 * 自带起游戏后端(3210)与 dev(5180)，双账号端到端验证，并校验 UI 三页签无崩溃。
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
  // 起游戏后端（独立测试库）
  const dbPath = path.join(ROOT, "test", "data", "p3-6.db");
  try { fs.rmSync(dbPath); } catch {}
  const srv = spawn("node", ["--experimental-sqlite", "server/server.cjs"], {
    cwd: ROOT, env: { ...process.env, PORT: "3210", XIUXIAN_DB: dbPath }, stdio: "ignore",
  });
  const srvUp = await waitUp("http://127.0.0.1:3210/api/leaderboard");
  console.log("SRV_UP", srvUp);
  if (!srvUp) { console.error("P6_FAIL: 后端未启动"); srv.kill(); process.exit(1); }

  // 起 dev（若未运行）
  let devUp = false;
  try { const r = await fetch("http://localhost:5180"); if (r.ok) devUp = true; } catch {}
  let devProc;
  if (!devUp) {
    devProc = spawn("cmd.exe", ["/c", "npm run dev > dev.log 2>&1"], { cwd: ROOT, stdio: "ignore", detached: true });
    for (let i = 0; i < 50; i++) { try { const r = await fetch("http://localhost:5180"); if (r.ok) { devUp = true; break; } } catch {} await sleep(200); }
  }

  const shots = path.join(__dirname, "shots");
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const safe = (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ err: String(e && e.message ? e.message : e) }));
  const shot = (n) => page.screenshot({ path: path.join(shots, n + ".png") });

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await sleep(2600);
  console.log("PAGE_LOADED devUp=" + devUp);

  const res = await safe(async () => {
    const g = window.__game;
    g.startNewGame("甲");
    for (let i = 0; i < 50 && !g.token; i++) await new Promise((r) => setTimeout(r, 100));
    const tokenA = g.token;
    const r2 = await g.cloud.login("乙");
    const tokenB = r2 && r2.token;

    const sent = await g.cloud.sendMail(tokenA, "乙", { title: "论道邀约", body: "后山一叙", reward: { exp: 100, stones: 50 } });
    const sentNone = await g.cloud.sendMail(tokenA, "不存在的散修", { title: "x", body: "y" });

    const inbox = await g.cloud.getMail(tokenB);
    const mail = inbox && inbox.find((m) => m.fromName === "甲");
    const mailId = mail ? mail.id : -1;
    const reward = mailId >= 0 ? await g.cloud.claimMail(tokenB, mailId) : null;
    const doubleClaim = await g.cloud.claimMail(tokenB, mailId); // 应 null

    // UI：切到乙，验证收件箱渲染
    g.token = tokenB;
    const m2 = await g.cloud.getMail(tokenB);
    g.player.syncMailbox(m2);
    g.openSocial();
    g.socialPanel.selectTab("mail");
    const mailboxLen = g.player.mailbox.length;

    // 宗门贡献榜：写乙贡献后聚合
    const prof = g.player.exportSocial();
    prof.sectContribution = 300;
    await g.cloud.putSocial(tokenB, prof);
    g.socialPanel.selectTab("sect");
    await new Promise((r) => setTimeout(r, 400));
    const sectLb = g.socialPanel.sectLb;

    // 软实时在线道友：乙上报 presence
    await g.cloud.putPresence(tokenB, 7, 8, "ch2");
    g.socialPanel.selectTab("dao");
    await new Promise((r) => setTimeout(r, 400));
    const presence = g.socialPanel.presence;
    g.socialPanel.hide();

    return {
      tokenA: !!tokenA, tokenB: !!tokenB, sent, sentNone, mailId,
      rewardExp: reward && reward.exp, rewardStones: reward && reward.stones,
      doubleClaimNull: doubleClaim === null, mailboxLen,
      sectHas乙: Array.isArray(sectLb) && sectLb.some((e) => e.nickname === "乙" && e.contribution === 300),
      presenceHas乙: Array.isArray(presence) && presence.some((p) => p.nickname === "乙"),
    };
  });
  await shot("27_p3-6_social");

  console.log("P6_SOCIAL " + JSON.stringify({ res, errors: errors.slice(0, 6) }, null, 2));
  await browser.close();
  srv.kill();
  if (devProc) try { process.kill(-devProc.pid); } catch {}
})().catch((e) => { console.error("P6_SOCIAL_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
