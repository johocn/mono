import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

/* 默认皮肤：[show, 截图, fx 层最少子节点数（B 14 / C 11）] */
const views = [
  ['0', 'mono-m3-01-board.png', 0],
  ['b', 'mono-m3-02-showcase-b.png', 14],
  ['c', 'mono-m3-03-codex-c.png', 11],
];

/* photo 皮肤（Task 21）：[show, 截图, image provider 实例数下限]
   show=0 / b：喷泉 1 + 树 2 + 灯 4 + 棋子 p1 = 8；show=c 再 + 迷你卡 ×3 = 11 */
const skinViews = [
  ['0', 'mono-m3-04-skin-photo-board.png', 8],
  ['b', 'mono-m3-05-skin-photo-showcase-b.png', 8],
  ['c', 'mono-m3-06-skin-photo-codex-c.png', 11],
];

const browser = await chromium.launch();
const errors = [];
const gate = {};
const facts = {};

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 15000 });
  return page;
}

for (const [show, file, minFx] of views) {
  const page = await open(`${ORIGIN}/mono.html?demo=1&debug=1&show=${show}`);
  const f = await page.evaluate(() => {
    const main = window.__monoMain;
    const inst = main.scene.instancesOf();
    const shots = inst.filter((i) => i.id.startsWith('showcase.'));
    return {
      fxChildren: main.stage.layers.fxUi.children.length,
      showcase: shots.length,
      showroomL4: shots.filter((i) => i.level === 4).length,
      viewButtons: document.querySelectorAll('#mono-views button').length,
    };
  });
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[`show=${show}`] = f;
  gate[`show${show}_fx`] = f.fxChildren >= minFx;
  gate[`show${show}_noL4`] = f.showroomL4 === 0;
  gate[`show${show}_switch`] = f.viewButtons === 3;
  await page.close();
}

for (const [show, file, minImages] of skinViews) {
  const page = await open(`${ORIGIN}/mono.html?demo=1&debug=1&skin=photo&show=${show}`);
  const f = await page.evaluate(() => {
    const main = window.__monoMain;
    const inst = main.scene.instancesOf();
    const kind = (id) => inst.find((i) => i.id === id)?.providerKind ?? null;
    return {
      missingAssets: main.missingAssets.length,
      imageInstances: inst.filter((i) => i.providerKind === 'image').length,
      p1: kind('piece.p1'),
      p2: kind('piece.p2'),
      showroomL4: inst.filter((i) => i.id.startsWith('showcase.') && i.level === 4).length,
      viewButtons: document.querySelectorAll('#mono-views button').length,
    };
  });
  await page.screenshot({ path: `${OUT}/${file}` });
  facts[`skin=photo&show=${show}`] = f;
  gate[`photo${show}_assets`] = f.missingAssets === 0;
  gate[`photo${show}_images`] = f.imageInstances >= minImages;
  gate[`photo${show}_fallback`] = f.p1 === 'image' && f.p2 === 'proc';
  gate[`photo${show}_noL4`] = f.showroomL4 === 0;
  gate[`photo${show}_switch`] = f.viewButtons === 3;
  await page.close();
}

gate.noErrors = errors.length === 0;
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);