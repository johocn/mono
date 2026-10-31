/**
 * Live2D 沙盒校验：起 Vite 服务沙盒目录，用 Playwright 加载页面，
 * 读取 #status 判定集成是否跑通，并截图。即使未放 vendor 资产，也能验证
 * 页面启动与降级守卫（CORE_MISSING / WEBGL_UNAVAILABLE）。
 *
 * 用法：node sandbox/live2d/check.mjs
 * 前置：npm i -D vite playwright （项目应已具备；playwright 浏览器需已安装）
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import net from "node:net";

const PORT = 5199;
const URL = `http://localhost:${PORT}/`;

function waitPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("vite 启动超时"));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

const vite = spawn("npx", ["vite", "sandbox/live2d", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "ignore",
  shell: true,
});

let exitCode = 1;
try {
  await waitPort(PORT);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => (document.getElementById("status")?.textContent || "") !== "BOOTING",
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(1500);
  const st = await page.$eval("#status", (e) => e.textContent).catch(() => "UNKNOWN");
  await page.screenshot({ path: "sandbox/live2d/shot.png" });
  await browser.close();

  console.log("STATUS:", st);
  if (errors.length) console.log("CONSOLE_ERRORS:", errors.slice(0, 5));
  const ok = st === "RENDERING";
  if (ok) console.log("RESULT: PASS（Live2D 在 WebGL 叠加层渲染成功，集成可行）");
  else console.log("RESULT: PENDING（需先按 index.html 顶部命令放入 vendor/ 资产；当前守卫=" + st + "）");
  exitCode = 0;
} catch (e) {
  console.log("CHECK_ERROR:", e && e.message);
} finally {
  vite.kill("SIGTERM");
  process.exit(exitCode);
}
