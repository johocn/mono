/**
 * P3-8 诊断：复现 mo-zun 渲染崩溃，定位 DrawPolyCmd 空 points 来源。
 * 自带起游戏后端(3210)与 dev(5180)，注入 Laya 探针捕捉坏多边形。
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
  const dbPath = path.join(ROOT, "test", "data", "p3-8-diag.db");
  try { fs.rmSync(dbPath); } catch {}
  const srv = spawn("node", ["--experimental-sqlite", "server/server.cjs"], {
    cwd: ROOT, env: { ...process.env, PORT: "3210", XIUXIAN_DB: dbPath }, stdio: "ignore",
  });
  const srvUp = await waitUp("http://127.0.0.1:3210/api/season");
  console.log("SRV_UP", srvUp);
  if (!srvUp) { srv.kill(); process.exit(1); }

  let devUp = false;
  try { const r = await fetch("http://localhost:5180"); if (r.ok) devUp = true; } catch {}
  let devProc;
  if (!devUp) {
    devProc = spawn("cmd.exe", ["/c", "npm run dev > dev.log 2>&1"], { cwd: ROOT, stdio: "ignore", detached: true });
    for (let i = 0; i < 50; i++) { try { const r = await fetch("http://localhost:5180"); if (r.ok) { devUp = true; break; } } catch {} await sleep(200); }
  }
  console.log("DEV_UP", devUp);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push("PAGEERROR: " + (e.stack || e.message)));

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await sleep(2600);

  // 注入 Laya 探针：捕捉 DrawPolyCmd 空 points（创建时 + 渲染回收后两种情况）
  await page.evaluate(() => {
    const L = window.Laya;
    window.__diag = { badCreate: null, badRun: null };
    if (!L || !L.Graphics) { window.__diag.noLaya = true; return; }
    const tmp = new L.Sprite();
    tmp.graphics.drawPoly(0, 0, [0, 0, 1, 1], "#fff");
    const cmds = tmp.graphics._cmds;
    const cmd = cmds && cmds[cmds.length - 1];
    if (!cmd) { window.__diag.noCmd = true; return; }
    const Cls = cmd.constructor;
    if (Cls.create) {
      const oc = Cls.create;
      Cls.create = function (x, y, points, fc, lc, lw) {
        if (!points || points.length === 0) window.__diag.badCreate = new Error().stack;
        if (points) for (let i = 0; i < points.length; i++) if (!isFinite(points[i])) { window.__diag.badCreateNaN = { at: i, val: points[i], stack: new Error().stack }; break; }
        return oc.call(this, x, y, points, fc, lc, lw);
      };
    }
    const or = Cls.prototype.run;
    Cls.prototype.run = function (...a) {
      if (!this.points) {
        window.__diag.badRun = {
          x: this.x, y: this.y, fillColor: this.fillColor, lineColor: this.lineColor, lineWidth: this.lineWidth,
          stack: new Error().stack,
        };
        return; // 跳过以防崩溃，继续收集信息
      }
      return or.apply(this, a);
    };
  });

  // 启动游戏 + 进入活动副本（mo-zun）
  const res = await page.evaluate(async () => {
    const g = window.__game;
    g.startNewGame("甲");
    for (let i = 0; i < 50 && !g.token; i++) await new Promise((r) => setTimeout(r, 100));
    g.openEvent();
    await new Promise((r) => setTimeout(r, 400));
    g.enterEventDungeon();
    let guard = 0;
    while (!g.eventBoss && guard++ < 50) await new Promise((r) => setTimeout(r, 100));
    const spawned = !!g.eventBoss;
    // 等若干帧，触发渲染
    await new Promise((r) => setTimeout(r, 1500));
    g.eventPanel.hide();
    return { spawned, token: !!g.token };
  });

  await sleep(500);
  const diag = await page.evaluate(() => window.__diag || {});
  console.log("DIAG_RES " + JSON.stringify({ res, diag }, null, 2));
  console.log("LOGS_TAIL " + JSON.stringify(logs.slice(-12)));

  await browser.close();
  srv.kill();
  if (devProc) try { process.kill(-devProc.pid); } catch {}
})().catch((e) => { console.error("DIAG_FAIL:", e && e.stack ? e.stack : e); process.exit(1); });
