"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const fs = require("fs");
const path = require("path");

// 赵子龙骨骼部件批处理：
//  1) 角采样抠底（品红 #FF00FF 幕 / 暗红幕通吃）：边缘洪水填充 + 高饱和幕布全局键控 + 双级羽化
//  2) 连通域清理：largestOnly 只保留主体（清 core 顶部漂浮金带、全身图水印残字）
//  3) 头身比自动纵向压缩：AI 单件易拉长 —— 腿压到 0.82*coreH（腰-脚 ≈ 身高 50%），裙压到 0.55*腿长
// 产出透明 PNG：parts/（游戏运行时直接用）+ dragonbones/parts/（DragonBones Pro 导入素材）
// 幂等：重复运行时腿/裙长已达标 → 压缩系数≈1，不会二次压缩（仅边缘多蚀 1px，无碍）
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "public/art/skel/hanli/parts_raw"); // 原图（品红/暗红底），固定输入
const PARTS = path.join(ROOT, "public/art/skel/hanli/parts"); // 产物（透明），游戏运行时直接用
const DB_PARTS = path.join(ROOT, "public/art/skel/hanli/dragonbones/parts");
const CUT = path.join(ROOT, "public/art/cut");

const JOBS = [
  { out: "core.png", src: "core.png", largestOnly: true },
  { out: "skirt.png", src: "skirt.png", squash: "skirt", largestOnly: true },
  { out: "legfront.png", src: "legfront.png", squash: "leg", largestOnly: true },
  { out: "legback.png", src: "legfront.png", copyOf: "legfront.png" },
  { out: "armfront.png", src: "armfront.png" },
  { out: "arm.png", src: "arm.png", largestOnly: true, fit: "arm" },
  { out: "arm2.png", src: "arm2.png", largestOnly: true, fit: "arm2" },
  { out: "spear.png", src: "spear.png", largestOnly: true, fit: "spear" },
  { out: "cape.png", src: "cape.png", largestOnly: true },
  { out: "hanli.png", src: path.join(ROOT, "public/art/hanli_full.png"), largestOnly: true, dir: [CUT] },
  // 韩立青袍全身立绘（整体律动模式用）：品红幕抠底 + largestOnly 清残字，保持原比例（不加 squash）
  { out: "hanli-robe.png", src: path.join(ROOT, "public/art/hanli-robe-full.png"), largestOnly: true, dir: [CUT] },
];

const guard = setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 120000);

(async () => {
  fs.mkdirSync(DB_PARTS, { recursive: true });
  fs.mkdirSync(CUT, { recursive: true });
  console.log("launching chromium...");
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("about:blank");
  console.log("page ready");

  // —— 阶段 A：抠底 + 清理 + 裁剪（返回内容尺寸，供头身比计算）——
  const phaseA = async (imgUrl, largestOnly) => p.evaluate(async (o) => {
    const du = o.du, lo = o.lo;
    function once(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const im = ctx.getImageData(0, 0, w, h), d = im.data;
          const at = (x, y) => (y * w + x) * 4;
          const sample = (cx, cy) => { let r = 0, g = 0, b2 = 0, n = 0; for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) { const i = at(x, y); r += d[i]; g += d[i + 1]; b2 += d[i + 2]; n++; } return [r / n, g / n, b2 / n]; };
          const bgs = [sample(0, 0), sample(w - 6, 0), sample(0, h - 6), sample(w - 6, h - 6)];
          const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
          const T = (lum(bgs[0]) > 200 ? 52 : 20) * 3;
          const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
          const chromaBg = sat(bgs[0]) > 60 && (lum(bgs[0]) > 200 || sat(bgs[0]) > 150);
          const sc = bgs[0]; // 幕布基准色（四角一致）
          const isBg = (i) => {
            const r = d[i], g = d[i + 1], b2 = d[i + 2];
            for (const c of bgs) if (Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b2 - c[2]) < T) return true;
            if (!chromaBg) { const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2); return (mx - mn) < 20 && mn > 195; }
            // 色键幕：抗锯齿边缘（高通道仍高、低通道仍低）也判为幕布，避免残留粉色描边
            if (sc[1] < 70 && g < 110 && r > 110 && b2 > 110) return true; // 品红幕
            if (sc[0] < 70 && r < 110 && g > 110 && b2 > 110) return true; // 绿幕
            return false;
          };
          const seen = new Uint8Array(w * h); const st = [];
          const push = (x, y) => { const k = y * w + x; if (!seen[k] && isBg(k * 4)) { seen[k] = 1; st.push(x, y); } };
          for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
          for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
          while (st.length) { const y = st.pop(), x = st.pop(); if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
          if (chromaBg) { for (let k = 0; k < w * h; k++) if (!seen[k] && isBg(k * 4)) seen[k] = 1; }
          const ring1 = new Uint8Array(w * h), ring2 = new Uint8Array(w * h);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const k = y * w + x; if (seen[k]) continue;
            if ((x > 0 && seen[k - 1]) || (x < w - 1 && seen[k + 1]) || (y > 0 && seen[k - w]) || (y < h - 1 && seen[k + w])) ring1[k] = 1;
            else if ((x > 0 && ring1[k - 1]) || (x < w - 1 && ring1[k + 1]) || (y > 0 && ring1[k - w]) || (y < h - 1 && ring1[k + w])) ring2[k] = 1;
          }
          for (let k = 0; k < w * h; k++) { if (seen[k] || ring1[k]) d[k * 4 + 3] = 0; else if (ring2[k]) d[k * 4 + 3] = 255; } // 去羽化：硬边（消除缩小后的软光晕）
          // 连通域：largestOnly 只留主体（漂浮杂物/水印整块清除），否则按 2% 阈值去碎屑
          const comp = new Int32Array(w * h).fill(-1); const areas = [];
          for (let s0 = 0; s0 < w * h; s0++) {
            if (d[s0 * 4 + 3] <= 32 || comp[s0] >= 0) continue;
            const id = areas.length; let a = 0; comp[s0] = id; const stk = [s0];
            while (stk.length) {
              const k = stk.pop(); a++; const kx = k % w;
              if (kx > 0 && d[(k - 1) * 4 + 3] > 32 && comp[k - 1] < 0) { comp[k - 1] = id; stk.push(k - 1); }
              if (kx < w - 1 && d[(k + 1) * 4 + 3] > 32 && comp[k + 1] < 0) { comp[k + 1] = id; stk.push(k + 1); }
              if (k >= w && d[(k - w) * 4 + 3] > 32 && comp[k - w] < 0) { comp[k - w] = id; stk.push(k - w); }
              if (k < w * (h - 1) && d[(k + w) * 4 + 3] > 32 && comp[k + w] < 0) { comp[k + w] = id; stk.push(k + w); }
            }
            areas.push(a);
          }
          if (areas.length) {
            const maxA = Math.max(...areas);
            const minA = lo ? maxA : Math.max(0.02 * maxA, 400);
            for (let k = 0; k < w * h; k++) if (comp[k] >= 0 && areas[comp[k]] < minA) d[k * 4 + 3] = 0;
          }
          ctx.putImageData(im, 0, 0);
          // 卫生处理：全透明像素 RGB 清零（防运行时把残留幕布色误当底色二次键控）
          for (let k = 0; k < w * h; k++) if (d[k * 4 + 3] === 0) { d[k * 4] = 0; d[k * 4 + 1] = 0; d[k * 4 + 2] = 0; }
          let minX = w, minY = h, maxX = 0, maxY = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 32) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
          if (maxX <= minX) { resolve(null); return; }
          const cw = maxX - minX + 1, ch = maxY - minY + 1;
          const cv2 = document.createElement("canvas"); cv2.width = cw; cv2.height = ch;
          cv2.getContext("2d").putImageData(im, -minX, -minY);
          resolve({ url: cv2.toDataURL("image/png"), cw, ch });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    return await once(du);
  }, { du: imgUrl, lo: largestOnly });

  // —— 阶段 B：纵向压缩（只压高不压宽，保持肩/胯宽度匹配）——
  const phaseB = (imgUrl, kx, ky) => p.evaluate(async (o) => {
    const du = o.du, kx = o.kx, ky = o.ky;
    function once(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          const nw = Math.max(1, Math.round(w * kx));
          const nh = Math.max(1, Math.round(h * ky));
          const cv = document.createElement("canvas"); cv.width = nw; cv.height = nh;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h, 0, 0, nw, nh);
          const im = ctx.getImageData(0, 0, nw, nh), d = im.data;
          for (let k = 0; k < nw * nh; k++) if (d[k * 4 + 3] === 0) { d[k * 4] = 0; d[k * 4 + 1] = 0; d[k * 4 + 2] = 0; }
          let minX = nw, minY = nh, maxX = 0, maxY = 0;
          for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const i = (y * nw + x) * 4; if (d[i + 3] > 32) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
          const cw = maxX - minX + 1, ch = maxY - minY + 1;
          const cv2 = document.createElement("canvas"); cv2.width = cw; cv2.height = ch;
          cv2.getContext("2d").putImageData(im, -minX, -minY);
          resolve({ url: cv2.toDataURL("image/png"), cw, ch });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    return await once(du);
  }, { du: imgUrl, kx, ky });

  const readSrc = (j) => fs.readFileSync(typeof j.src === "string" && path.isAbsolute(j.src) ? j.src : path.join(RAW, j.src));
  const results = {};
  for (const j of JOBS) {
    if (j.copyOf) continue;
    const raw = readSrc(j);
    const du = "data:image/png;base64," + raw.toString("base64");
    console.log("cutout " + j.out + " (" + (raw.length / 1024 | 0) + " KB)...");
    const r = await phaseA(du, !!j.largestOnly);
    if (!r) { console.log("FAIL " + j.out); continue; }
    results[j.out] = r;
  }
  // 头身比：腿目标 = 0.82*coreH（core 画到胯甲下缘，腰带≈0.81 处 → 腰-脚≈身高 50%）
  const coreH = results["core.png"] ? results["core.png"].ch : 0;
  const legRaw = results["legfront.png"];
  let legSq = 1, skirtSq = 1, skirtKx = 1;
  if (coreH && legRaw) {
    legSq = Math.min(1, Math.max(0.6, (coreH * 0.82) / legRaw.ch));
    const legH2 = legRaw.ch * legSq;
    if (results["skirt.png"]) skirtSq = Math.min(1, Math.max(0.35, (legH2 * 0.55) / results["skirt.png"].ch));
    // 战裙新图自带锥形轮廓，不再横向压缩
    skirtKx = 1;
  }
  console.log("proportion: coreH=" + coreH + " legRaw=" + (legRaw ? legRaw.ch : "-") + " legSq=" + legSq.toFixed(3) + " skirtSq=" + skirtSq.toFixed(3));
  // 小臂/矛归一到躯干比例：小臂等比例缩小到当前一半(≈0.2*coreH)；矛全长≈0.9*coreH（枪尖略高于脚）
  const coreCw = results["core.png"] ? results["core.png"].cw : 0;
  const armRaw = results["arm.png"];
  const armK = armRaw && coreH ? Math.min(2.5, Math.max(0.2, (coreH * 0.4) / armRaw.ch)) : 1;
  const armKy = armK, armKx = armK;
  const arm2Raw = results["arm2.png"];
  const arm2K = arm2Raw && coreH ? Math.min(2.5, Math.max(0.2, (coreH * 0.4) / arm2Raw.ch)) : 1;
  const spearRaw = results["spear.png"];
  const spearKy = spearRaw && coreH ? Math.min(2.5, Math.max(0.4, (coreH * 0.9) / spearRaw.ch)) : 1;
  console.log("fit: arm=" + armK.toFixed(2) + " spear=" + spearKy.toFixed(2));
  const finalB = {};
  for (const j of JOBS) {
    let bytes = finalB[j.out];
    if (!bytes) {
      if (j.copyOf) { bytes = finalB[j.copyOf]; }
      else {
        let r = results[j.out];
        if (!r) { console.log("SKIP " + j.out); continue; }
        if (j.squash === "leg" && legSq < 0.999) r = await phaseB(r.url, 1, legSq);
        if (j.squash === "skirt" && (skirtSq < 0.999 || skirtKx < 0.999)) r = await phaseB(r.url, skirtKx, skirtSq);
        if (j.fit === "arm") r = await phaseB(r.url, armKx, armKy);
        if (j.fit === "arm2") r = await phaseB(r.url, arm2K, arm2K);
        if (j.fit === "spear") r = await phaseB(r.url, spearKy, spearKy);
        if (!r) { console.log("FAIL2 " + j.out); continue; }
        bytes = Buffer.from(r.url.split(",")[1], "base64");
        finalB[j.out] = bytes;
      }
      if (!bytes) { console.log("SKIP " + j.out); continue; }
    }
    const dirs = j.dir || [PARTS, DB_PARTS];
    for (const dir of dirs) fs.writeFileSync(path.join(dir, j.out), bytes);
    console.log("OK " + j.out + " (" + (bytes.length / 1024 | 0) + " KB) -> " + dirs.map((d) => path.relative(ROOT, d)).join(" + "));
  }
  await b.close();
  clearTimeout(guard);
  console.log("DONE");
})().catch((e) => { console.error(e); process.exit(1); });
