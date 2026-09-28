/**
 * 真名候选清单上屏留证（390×844 @dpr2）——供业主在**不部署**的前提下预览新商家名单。
 * 依赖本地 dev（`npm run dev` → http://127.0.0.1:52300）。产物入 docs/verify/。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const open = async (query) => {
  await page.goto(`${BASE}${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });
};

/* 1) 纯棋盘（含 32 字牌）：?show=0 关掉橱窗覆盖层 */
await open('?show=0');
await page.screenshot({ path: `${OUT}/mono-real-01-board.png` });
const labels = await page.evaluate(() => {
  const nodes = window.__monoMain.stage.layers.labels.children;
  return nodes.filter((n) => typeof n.text === 'string').map((n) => n.text);
});

/* 2) 棋盘区放大切图：字牌可读性 */
await page.screenshot({ path: `${OUT}/mono-real-02-labels.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });

/* 3) B 版式橱窗（样板地块 slot 4 = 国信南山温泉酒店） */
await open('?show=b');
await page.screenshot({ path: `${OUT}/mono-real-03-showcase-b.png` });

const gate = {
  labels32: labels.length === 32,
  hasNewNames: ['鹿乡小镇', '国信温泉', '鹿茸市场', '神鹿峰'].every((n) => labels.includes(n)),
  noPlaceholders: !labels.some((t) => t.includes('优美惠') || t.includes('太平温泉')),
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ labels, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);
