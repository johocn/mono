"use strict";
/**
 * 一次性处理用户提供的 AI 立绘（韩立 / 民宅）：
 * 抠底（四角采样洪水填充）→ 抹右下角水印 → 连通域去碎屑 → 裁透明边 → 缩放(max 512) → 落盘。
 * 韩立 → public/art/cut/hanli.png（玩家 Rig 立绘）；民宅 → public/assets/sprites/house.png（地图建筑）。
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("../../laya-brawler/node_modules/playwright");

const SRC_DIR = "C:/Users/lenovo/AppData/Local/CodeBuddyExtension/Data/aac6dfbf-59b5-478a-b2d9-d133af172572/CodeBuddyIDE/aac6dfbf-59b5-478a-b2d9-d133af172572/history/c7aaf76550d5d327e834d1bb335d66ca/9544045e4ea44890bb254058b24fc3de/assets";
const SRCS = [
  path.join(SRC_DIR, "中国仙侠村落民居立绘 (1).1304921ccd.png"), // 用户：韩立
  path.join(SRC_DIR, "中国仙侠村落民居立绘.f3e1ea0e2a.png"), // 用户：民宅
];
const TMP = path.join(__dirname, "..", "public", "tmp-cutout");

(async () => {
  // 1) 拷贝到 dev server 可访问的临时目录（file:// 画布会污染，必须走 http 同源）
  fs.mkdirSync(TMP, { recursive: true });
  const tmpNames = SRCS.map((p, i) => {
    const n = `src${i}.png`;
    fs.copyFileSync(p, path.join(TMP, n));
    return n;
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });

  const results = await page.evaluate(async (names) => {
    const out = [];
    for (const n of names) {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = `/tmp-cutout/${n}`;
      });
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, W, H);
      const d = id.data;
      const at = (x, y) => (y * W + x) * 4;

      // —— 抠底：四角采样 + 边界洪水填充（与生产 cutoutBackground 同算法，另加 alpha 感知）——
      const sample = (cx, cy) => {
        let r = 0, g = 0, b = 0, k = 0;
        for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) { const i = at(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
        return [r / k, g / k, b / k];
      };
      const bgs = [sample(0, 0), sample(W - 6, 0), sample(0, H - 6), sample(W - 6, H - 6)];
      const lum = (v) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
      const T = Math.min(72, Math.max(30, lum(bgs[0]) > 200 ? 52 : 28)) * 3;
      const isBg = (i) => {
        if (d[i + 3] < 200) return true;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        for (const v of bgs) if (Math.abs(r - v[0]) + Math.abs(g - v[1]) + Math.abs(b - v[2]) < T) return true;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return (mx - mn) < 20 && mn > 195;
      };
      const seen = new Uint8Array(W * H);
      const stack = [];
      const push = (x, y) => { const k = y * W + x; if (!seen[k] && isBg(k * 4)) { seen[k] = 1; stack.push(x, y); } };
      for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
      for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x > 0) push(x - 1, y);
        if (x < W - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < H - 1) push(x, y + 1);
      }

      // —— 抹右下角水印（「豆包 AI生成」），该区域无主体内容（靴/宅基均在 0.70W 以左 / 0.90H 以上）——
      const wx0 = Math.floor(W * 0.70), wy0 = Math.floor(H * 0.90);
      for (let y = wy0; y < H; y++) for (let x = wx0; x < W; x++) seen[y * W + x] = 1;

      // —— 连通域去碎屑：仅保留与主体相连的大块（水印残字/噪点面积 < max(2% 最大块, 400px)）——
      const comp = new Int32Array(W * H).fill(-1);
      const areas = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (seen[k] || d[k * 4 + 3] < 128 || comp[k] >= 0) continue;
        const cid = areas.length;
        let a = 0;
        comp[k] = cid;
        const q = [x, y];
        let kk = 0;
        while (q.length) {
          const yy = q.pop(), xx = q.pop();
          a++;
          if (xx > 0 && !seen[kk = yy * W + xx - 1] && d[kk * 4 + 3] >= 128 && comp[kk] < 0) { comp[kk] = cid; q.push(xx - 1, yy); }
          if (xx < W - 1 && !seen[kk = yy * W + xx + 1] && d[kk * 4 + 3] >= 128 && comp[kk] < 0) { comp[kk] = cid; q.push(xx + 1, yy); }
          if (yy > 0 && !seen[kk = (yy - 1) * W + xx] && d[kk * 4 + 3] >= 128 && comp[kk] < 0) { comp[kk] = cid; q.push(xx, yy - 1); }
          if (yy < H - 1 && !seen[kk = (yy + 1) * W + xx] && d[kk * 4 + 3] >= 128 && comp[kk] < 0) { comp[kk] = cid; q.push(xx, yy + 1); }
        }
        areas.push(a);
      }
      const maxA = Math.max.apply(null, areas);
      const minA = Math.max(0.02 * maxA, 400);
      let dropped = 0;
      for (let k = 0; k < W * H; k++) {
        if (comp[k] >= 0 && areas[comp[k]] < minA) { seen[k] = 1; dropped++; }
      }

      // —— 应用：抠除像素置透明白（RGB=255 防二次抠底误伤）；边缘羽化 ——
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x, i = k * 4;
        if (seen[k]) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0; continue; }
        const adj = (x > 0 && seen[k - 1]) || (x < W - 1 && seen[k + 1]) || (y > 0 && seen[k - W]) || (y < H - 1 && seen[k + W]);
        if (adj) d[i + 3] = 150;
      }
      ctx.putImageData(id, 0, 0);

      // —— 裁透明边（主体 bbox + 4px 余量）——
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(W - 1, x1 + 4); y1 = Math.min(H - 1, y1 + 4);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const cc = document.createElement("canvas");
      cc.width = cw; cc.height = ch;
      cc.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);

      // —— 缩放：最长边 ≤ 512 ——
      const M = Math.max(cw, ch);
      let fin = cc;
      if (M > 512) {
        const sc = 512 / M;
        const fc = document.createElement("canvas");
        fc.width = Math.round(cw * sc); fc.height = Math.round(ch * sc);
        const fctx = fc.getContext("2d");
        fctx.imageSmoothingEnabled = true;
        fctx.imageSmoothingQuality = "high";
        fctx.drawImage(cc, 0, 0, fc.width, fc.height);
        fin = fc;
      }
      out.push({
        aspect: +(W / H).toFixed(3),
        size: `${W}x${H}`,
        comps: areas.length,
        droppedPx: dropped,
        final: `${fin.width}x${fin.height}`,
        kind: W / H < 0.9 ? "hanli" : "house", // 竖长为人物立绘，近方形为民宅
        dataUrl: fin.toDataURL("image/png"),
      });
    }
    return out;
  }, tmpNames);

  await browser.close();

  // 2) 落盘：韩立 → 玩家立绘位；民宅 → 地图建筑精灵
  const root = path.join(__dirname, "..");
  for (const r of results) {
    const b64 = r.dataUrl.replace(/^data:image\/png;base64,/, "");
    const target = r.kind === "hanli"
      ? path.join(root, "public", "art", "cut", "hanli.png")
      : path.join(root, "public", "assets", "sprites", "house.png");
    fs.writeFileSync(target, Buffer.from(b64, "base64"));
    console.log(`[${r.kind}] src=${r.size} aspect=${r.aspect} comps=${r.comps} droppedPx=${r.droppedPx} -> ${path.relative(root, target)} (${r.final})`);
  }

  // 3) 清理临时目录
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("CUTOUT_DONE");
})().catch((e) => { console.error("CUTOUT_FAIL:", e && e.stack); process.exit(1); });
