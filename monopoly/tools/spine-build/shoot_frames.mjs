// 骨骼动画连拍：node shoot_frames.mjs <anim> [t1,t2,...]，诊断指定动画各时刻姿态
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ANIM = process.argv[2] || "throw_dice";
const TIMES = process.argv[3] ? process.argv[3].split(",").map(Number)
  : [0.05, 0.25, 0.45, 0.6, 0.75, 1.0];

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://localhost:52679/?anim=${ANIM}`, { waitUntil: "load" });
await page.waitForFunction("window.__ready === true", { timeout: 15000 });

for (const t of TIMES) {
  await page.evaluate((tt) => {
    const tr = window.__skel.state.tracks[0];
    tr.trackTime = tt;
  }, t);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `frames_${ANIM}_${String(t).replace(".", "_")}.png` });
  console.log("ok", ANIM, "t=", t);
}
await browser.close();
server.close();
