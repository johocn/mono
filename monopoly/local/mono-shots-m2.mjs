import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MONO_URL || 'http://127.0.0.1:52300/mono.html?debug=1';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });

const facts = await page.evaluate(() => {
  const s = window.__monoMain.scene;
  const inst = s.instancesOf();
  const ids = inst.map((i) => i.id);
  return {
    total: inst.length,
    tiles: ids.filter((i) => i.startsWith('board.tile.')).length,
    inner: ids.filter((i) => i === 'board.inner.deco').length,
    innerDecos: ids.filter((i) => /^board\.inner\.d\d$/.test(i)).length,
    fountain: ids.filter((i) => i === 'board.center.fountain').length,
    // building.* 由 M3（Task 15–18）引入；M2 恒为 0，计划原条件 buildings>=18 顺延到 mono-shots-m3.mjs
    buildings: ids.filter((i) => i.startsWith('building.')).length,
    pieces: ids.filter((i) => i.startsWith('piece.')).length,
    // 标签层：32 格 × (底牌 + 文字) = 64 个节点；计划原 facts.labels 数的是 #mono-debug（调试面板），此处改为真实标签节点数
    labelNodes: window.__monoMain.stage.layers.labels.children.length,
    levels: inst.reduce((acc, i) => { acc['L' + i.level] = (acc['L' + i.level] || 0) + 1; return acc; }, {}),
  };
});

await page.screenshot({ path: `${OUT}/mono-m2-01-board.png` });
await page.screenshot({ path: `${OUT}/mono-m2-02-board-inner.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });
await page.screenshot({ path: `${OUT}/mono-m2-03-board-labels.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });
await page.screenshot({ path: `${OUT}/mono-m2-04-board-pawns.png`, clip: { x: 0, y: 34, width: 390, height: 300 } });

const gate = {
  tiles32: facts.tiles === 32,
  inner49: facts.inner === 49,
  innerDecos8: facts.innerDecos === 8,
  fountain1: facts.fountain === 1,
  labels32: facts.labelNodes === 64,
  pieces4: facts.pieces === 4,
  zeroFallback: facts.levels.L4 === undefined,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);