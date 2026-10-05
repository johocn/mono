// 悟空骨骼截图验证：本地 http 服务 + Playwright 手机视口（390×844 dpr2，标准 780×1688）
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const MIME = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".atlas": "text/plain" };

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = decodeURIComponent(u.pathname);
  const file = p === "/" ? "/test.html" : p;
  try {
    let data = await readFile(join(ROOT, file));
    if (file === "/test.html") {
      const pixiVer = u.searchParams.get("pixi") || "8.6.6"; // spine-pixi 2.1.1 与 pixi 8.20+ ViewContainer(autoGarbageCollect) 不兼容
      data = Buffer.from(data.toString().replaceAll("__PIXI_VER__", pixiVer));
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(52680, r)); // 52666 留给常驻 serve.mjs

const anims = ["idle_calm", "idle_happy", "idle_sad", "walk", "spin", "throw_dice"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message, "\n", e.stack ?? ""));

for (const anim of anims) {
  await page.goto(`http://localhost:52680/?anim=${anim}`, { waitUntil: "load" });
  try {
    await page.waitForFunction("window.__ready === true", { timeout: 15000 });
    await page.evaluate(() => { window.__skel.state.tracks[0].timeScale = 0; }); // 定格，防 400ms 漂移
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot_${anim}.png` });
    console.log("ok", anim);
  } catch {
    console.log("FAIL", anim, "— ready 超时（检查 pageerror 日志）");
  }
}
await browser.close();
server.close();
