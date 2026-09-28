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
  const byId = (id) => ids.filter((i) => i === id).length;
  const innerDecos = inst.filter((i) => /^board\.inner\.d\d$/.test(i.id));
  const labels = window.__monoMain.stage.layers.labels.children;
  return {
    total: inst.length,
    buildings: ids.filter((i) => i.startsWith('building.')).length,
    walls: ids.filter((i) => /^building\.s\d+\.l\d$/.test(i)).length,
    wallsL1: ids.filter((i) => /^building\.s\d+\.l1$/.test(i)).length,
    wallsL2: ids.filter((i) => /^building\.s\d+\.l2$/.test(i)).length,
    wallsL3: ids.filter((i) => /^building\.s\d+\.l3$/.test(i)).length,
    signs: ids.filter((i) => /^building\.s\d+\.sign$/.test(i)).length,
    awning: byId('prop.awning'),
    rooftopBox: byId('prop.rooftopBox'),
    signTower: byId('prop.signTower'),
    lantern: byId('prop.lantern'),
    banner: byId('prop.banner'),
    tree: byId('prop.tree'),
    lamp: byId('prop.lamp'),
    inner: ids.filter((i) => i === 'board.inner.deco').length,
    innerDecos: innerDecos.length,
    innerDecosShop: innerDecos.filter((i) => i.provider.preset === 'shop').length,
    tiles32: ids.filter((i) => i.startsWith('board.tile.')).length,
    pieces: ids.filter((i) => i.startsWith('piece.')).length,
    labelNodes: labels.length,
    labelVisible: [...labels].every((c) => c.visible !== false),
    levels: inst.reduce((acc, i) => { acc['L' + i.level] = (acc['L' + i.level] || 0) + 1; return acc; }, {}),
  };
});

await page.screenshot({ path: `${OUT}/mono-m3-01-board.png` });
await page.screenshot({ path: `${OUT}/mono-m3-02-buildings.png`, clip: { x: 0, y: 34, width: 390, height: 320 } });
await page.screenshot({ path: `${OUT}/mono-m3-03-inner.png`, clip: { x: 60, y: 150, width: 270, height: 230 } });

const gate = {
  tiles32: facts.tiles32 === 32,
  inner49: facts.inner === 49,
  innerDecos8: facts.innerDecos === 8,
  innerShop8: facts.innerDecosShop === 8,
  buildings27: facts.buildings === 27,
  walls18: facts.walls === 18 && facts.wallsL1 === 9 && facts.wallsL2 === 6 && facts.wallsL3 === 3,
  signs9: facts.signs === 9,
  props: facts.awning === 9 && facts.rooftopBox === 9 && facts.signTower === 3 && facts.lantern === 36 && facts.banner === 5,
  street: facts.tree === 2 && facts.lamp === 4,
  labels64: facts.labelNodes === 64 && facts.labelVisible,
  pieces4: facts.pieces === 4,
  zeroFallback: facts.levels.L4 === undefined,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);