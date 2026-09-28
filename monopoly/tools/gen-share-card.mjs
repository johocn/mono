#!/usr/bin/env node
/*
 * M8 分享缩略图生成（`public/share/share-card.png`，800×640 = 5:4）。
 *
 * 铁律：分享卡必须是**真实的、好看的、可被微信抓取的小图**——不是占位方块，也不走 AI 生图（中文易糊）。
 * 做法：Playwright 打开真实游戏画面 → 截取棋盘区（390×312 @dpr2 = 780×624，正好 5:4）
 * → 在 800×640 的 HTML 模板里做全幅 hero + 渐变蒙版 + 标题（系统中文粗体，字清且小）
 * → 截图为 PNG。整图是扁平矢量风棋盘，PNG 压缩友好（目标 ≤ 300KB，微信缩略图软上限）。
 *
 * 用法（需先 `npm run dev`，默认 http://127.0.0.1:52300）：
 *   node tools/gen-share-card.mjs            # 用默认 ORIGIN
 *   ORIGIN=https://game.joho.cn/tour node tools/gen-share-card.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MONO = resolve(HERE, '..');
const OUT = resolve(MONO, 'public/share/share-card.png');

const ORIGIN = (process.env.ORIGIN || 'http://127.0.0.1:52300').replace(/\/$/, '');
const W = 800;
const H = 640;
const MAX_BYTES = 300 * 1024;

/* 截棋盘区：y 16..328（棋盘顶 BOARD_TOP=34），宽 390 → dpr2 得 780×624（= 5:4，hero 无需裁切） */
const CLIP = { x: 0, y: 16, width: 390, height: 312 };

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
try {
  /* —— 1) 真实游戏画面：棋盘区 —— */
  const game = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await game.goto(`${ORIGIN}/mono.html?nofx=1&seed=20260928`, { waitUntil: 'networkidle' });
  await game.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 20000 });
  await game.waitForTimeout(150);
  /* 抹掉所有 DOM 覆盖层（CTA / 命中层 / 性能层），只留画布画面 */
  await game.addStyleTag({ content: '#mono-share,#mono-hud,#mono-panels,#mono-perf,#mono-debug,#mono-views{display:none!important}' });
  const heroBuf = await game.screenshot({ clip: CLIP });
  await game.close();

  /* —— 2) 合成 5:4 分享卡 —— */
  const card = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative; background: #0c1513; color: #fff;
    font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
  }
  .hero { position: absolute; inset: 0; width: ${W}px; height: ${H}px; object-fit: cover; object-position: center; }
  .veil { position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,14,12,.30) 0%, rgba(6,14,12,0) 34%, rgba(6,14,12,.90) 100%); }
  .badge { position: absolute; top: 22px; left: 24px; padding: 7px 15px; border-radius: 999px;
    background: rgba(6,10,8,.74); border: 1px solid #f5c451; color: #f5c451; font-size: 17px; letter-spacing: .5px; }
  .foot { position: absolute; left: 34px; right: 34px; bottom: 36px; }
  h1 { font-size: 54px; line-height: 1.08; font-weight: 800; letter-spacing: 1px;
    text-shadow: 0 3px 16px rgba(0,0,0,.8); }
  h1 em { color: #f5c451; font-style: normal; }
  p { margin-top: 14px; font-size: 23px; color: #e2ece6; text-shadow: 0 2px 12px rgba(0,0,0,.85); }
</style></head><body>
  <img class="hero" src="data:image/png;base64,${heroBuf.toString('base64')}">
  <div class="veil"></div>
  <div class="badge">吉林双阳 · 邻里商业版</div>
  <div class="foot">
    <h1>大富翁 · <em>双阳邻里</em></h1>
    <p>掷骰逛遍 32 家街坊好店 · 买地收租炒股</p>
  </div>
</body></html>`;
  await card.setContent(html, { waitUntil: 'load' });
  const cardBuf = await card.screenshot({ type: 'png' });
  await card.close();

  writeFileSync(OUT, cardBuf);
  const bytes = statSync(OUT).size;
  console.log(`[share-card] ${OUT}`);
  console.log(`[share-card] ${W}x${H} ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB) · 上限 ${(MAX_BYTES / 1024) | 0}KB → ${bytes <= MAX_BYTES ? 'OK' : 'TOO BIG'}`);
  if (bytes > MAX_BYTES) process.exitCode = 1;
} finally {
  await browser.close();
}
