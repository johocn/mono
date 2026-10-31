"use strict";
/**
 * 视觉回归（软检查，不阻塞 CI）：对关键界面截图并与 test/baseline/ 比对。
 * - baseline 不存在时自动生成并标 CREATED；
 * - 存在时比较文件大小相对差（>10%）与内容哈希，超阈值标 CHANGED 并打印报告。
 * 自动探测 5180 端口，不通则临时拉起 dev server（同一进程组，结束清理）。
 * playwright 解析同 browser-check：优先本项目 playwright，回退兄弟项目。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("../../laya-brawler/node_modules/playwright"));
}

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const BASE = path.join(__dirname, "baseline");
const URL = "http://localhost:5180";
const SIZE_DIFF = 0.1; // 文件大小相对差阈值

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(BASE, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

async function portUp() {
  return new Promise((res) => {
    const s = require("net").connect(5180, "127.0.0.1");
    s.setTimeout(600);
    s.on("connect", () => { s.destroy(); res(true); });
    s.on("error", () => { s.destroy(); res(false); });
    s.on("timeout", () => { s.destroy(); res(false); });
  });
}

async function ensureDev() {
  if (await portUp()) return null;
  const p = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: "ignore", detached: true });
  for (let i = 0; i < 40; i++) {
    await wait(500);
    if (await portUp()) return p;
  }
  return p;
}

async function main() {
  const dev = await ensureDev();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const shots = [
    { name: "vr-title" },
    {
      name: "vr-idle",
      prep: async () => {
        await page.evaluate(() => window.__game && window.__game.startNewGame && window.__game.startNewGame("vr"));
        await wait(1800);
      },
    },
    {
      name: "vr-map",
      prep: async () => {
        await page.evaluate(() => { const g = window.__game; if (g && g.player) g.map.zoom = 3; });
        await wait(600);
      },
    },
  ];

  let changed = 0;
  for (const s of shots) {
    if (s.prep) await s.prep();
    const f = path.join(SHOTS, s.name + ".png");
    await page.screenshot({ path: f });
    const b = path.join(BASE, s.name + ".png");
    if (!fs.existsSync(b)) {
      fs.copyFileSync(f, b);
      console.log(`CREATED baseline ${s.name}`);
    } else {
      const a = fs.statSync(f).size, c = fs.statSync(b).size;
      const diff = Math.abs(a - c) / c;
      const flag = diff > SIZE_DIFF || hash(f) !== hash(b) ? "CHANGED" : "OK";
      if (flag === "CHANGED") changed++;
      console.log(`${flag} ${s.name} sizeDiff=${(diff * 100).toFixed(1)}%`);
    }
  }

  await browser.close();
  if (dev) { try { process.kill(-dev.pid); } catch {} }
  console.log(`视觉回归完成：${changed} 张变化（软检查，不阻塞 CI）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
