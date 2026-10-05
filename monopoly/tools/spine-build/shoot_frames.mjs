// throw_dice 连拍：播放周期内多个时刻截图，诊断手臂挥动方向
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
    if (file === "/test.html") data = Buffer.from(data.toString().replaceAll("__PIXI_VER__", "8.6.6"));
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(52679, r));

const TIMES = [0.05, 0.25, 0.45, 0.6, 0.75, 1.0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:52679/?anim=throw_dice", { waitUntil: "load" });
await page.waitForFunction("window.__ready === true", { timeout: 15000 });

for (const t of TIMES) {
  await page.evaluate((tt) => {
    const tr = window.__skel.state.tracks[0];
    tr.trackTime = tt;
  }, t);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `fd_${String(t).replace(".", "_")}.png` });
  console.log("ok t=", t);
}
await browser.close();
server.close();
