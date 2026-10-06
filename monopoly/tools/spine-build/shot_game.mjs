// 临时验证：dev 页面截图 + 资源/页面状态诊断
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:52300/';
const out = process.argv[3] || 'shot_game_spine.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.on('response', (r) => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url()); });
page.on('console', (m) => { const t = m.text(); if (t.includes('spine') || m.type() === 'error') console.log('[' + m.type() + ']', t.slice(0, 250)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
/* 开局：默认 1 人 + AI，直接点开始 */
const start = page.locator('button', { hasText: '开始游戏' }).first();
if (await start.count()) { await start.click(); await page.waitForTimeout(1200); }
/* 跳过新手引导（可能连续多页） */
for (let i = 0; i < 6; i++) {
  const skip = page.locator('button', { hasText: '跳过' }).first();
  if (!(await skip.count())) break;
  await skip.click().catch(() => {});
  await page.waitForTimeout(500);
}
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({
  canvases: document.querySelectorAll('canvas').length,
  body: document.body.innerText.slice(0, 200).replace(/\n+/g, '|'),
}));
console.log('[info]', JSON.stringify(info));
await page.screenshot({ path: out });
/* 棋子区特写（左上起点） */
await page.screenshot({ path: out.replace('.png', '_zoom.png'), clip: { x: 0, y: 150, width: 130, height: 200 } });
console.log('saved', out);
await browser.close();
