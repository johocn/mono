// 常驻预览服务器：node serve.mjs [端口=52666]，浏览器打开 http://localhost:52666/ 实时预览
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2]) || 52666;
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const MIME = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".atlas": "text/plain" };

createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = decodeURIComponent(u.pathname);
  const file = p === "/" ? "/test.html" : p;
  try {
    let data = await readFile(join(ROOT, file));
    if (file === "/test.html") {
      const pixiVer = u.searchParams.get("pixi") || "8.6.6"; // spine-pixi 2.1.1 与 pixi 8.20+ 不兼容
      data = Buffer.from(data.toString().replaceAll("__PIXI_VER__", pixiVer));
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("nf"); }
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}/`));
