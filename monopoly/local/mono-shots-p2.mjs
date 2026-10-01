import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/*
 * P2 · 近景建筑增强（体型变体 / 轮廓阶梯 / 台阶铺装）专项取证截图。
 *
 * 口径（spec `2026-10-01-monopoly-camera-framing` §6 P2 第 19–21 项）：
 *   · 390×844 @dpr2 手机视口，入 `docs/verify/`，供手册 M15 P2 小节引用；
 *   · 用 `?demo=1` + `scene.buildOne()` **逐件定格出图**（与 `mono-shots-visual.mjs` 同一取景手法），
 *     每件用 `overrides` 显式给定 provider.params ⇒ 不受 theme.json 分派影响，是**受控对照**；
 *   · 除目视外，每个对照对**同一画面区域**取像素哈希：开/关必须不同、四款变体必须两两不同 ——
 *     即「新增几何真的画出来了」的机器可判证据（非逐像素黄金图，只判存在性与互异性）。
 *
 * MONO_ORIGIN 默认打线上；本地自测可 `MONO_ORIGIN=http://127.0.0.1:52301` 覆盖。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?demo=1&nofx=1&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain), null, { timeout: 20000 });
await page.addStyleTag({ content: '#mono-share{display:none}' });

/** 在 fxUi 覆盖层上定格出图：`overrides` 直接给 provider（L1 级，不并 theme），故参数完全受控 */
const buildPanel = async (items) => page.evaluate((list) => {
  const m = window.__monoMain;
  m.scene.reset();
  m.scene.render();
  const fx = m.stage.layers.fxUi;
  for (const d of [...document.querySelectorAll('[data-p2-cap]')]) d.remove();
  const built = [];
  for (const it of list) {
    const cap = document.createElement('div');
    cap.setAttribute('data-p2-cap', '1');
    cap.textContent = it.caption;
    cap.style.cssText = 'position:fixed;width:195px;margin-left:-97px;text-align:center;'
      + `left:${it.cx}px;top:${it.cy - it.capDy}px;font:10px ui-monospace,monospace;`
      + `color:${it.title ? '#f5c451' : '#9fb3a8'};pointer-events:none`;
    document.body.appendChild(cap);
    const c = m.scene.buildOne({
      id: it.id, c: 0, r: 0, pass: 4, fixed: { cx: it.cx, cy: it.cy, s: it.s },
      state: it.state ?? {},
      overrides: { [it.id]: { kind: 'proc', preset: it.preset, params: it.params } },
    });
    fx.addChild(c);
    built.push({ id: it.id, nodes: c.children.length });
  }
  return built;
}, items);

const shot = async (name, clip) => {
  const buf = await page.screenshot({ path: `${OUT}/${name}`, clip });
  return createHash('sha1').update(buf).digest('hex').slice(0, 12);
};

const facts = {};
/* 取景框：以定格点为心向上取 200、向下 100（避开 y≥596 的底坞 DOM），单栋含屋顶完整入画 */
const clipOf = (cx, cy) => ({ x: cx - 95, y: Math.max(0, cy - 200), width: 190, height: 300 });

/* —— ① 体型变体四款（L2 商铺：plain / veranda / dormer / annex）——
   skin.json 的 variant 名册 = `['plain','veranda','dormer','annex']`，代码按 `state.slot % 4` 轮换；
   此处直接把 slot 摆成 0/1/2/3 复现轮换结果。 */
const VARIANTS = [
  ['plain', 0, 'plain（素体）'],
  ['veranda', 1, 'veranda（门廊立柱外廊）'],
  ['dormer', 2, 'dormer（屋顶老虎窗）'],
  ['annex', 3, 'annex（侧偏低屋）'],
];
const varItems = VARIANTS.map(([name, slot, caption], i) => ({
  id: 'building.s0.l2', preset: 'shop', cx: 100 + (i % 2) * 190, cy: 200 + Math.floor(i / 2) * 240, s: 1.7,
  params: { levels: 2, hue: 30, step: false, apron: false, variant: [name] },
  state: { level: 2, slot },
  caption: `${caption}  slot=${slot}`,
  title: i === 0,
  capDy: 115,
}));
facts.variantsBuilt = await buildPanel(varItems);
facts.variants = {};
varItems.forEach((it, i) => { facts.variants[VARIANTS[i][0]] = clipOf(it.cx, it.cy); });
facts.variantsHash = {};
for (const [name, , ] of VARIANTS) {
  const it = varItems.find((x) => x.params.variant[0] === name);
  facts.variantsHash[name] = await shot(`mono-p2-01-variants-${name}.png`, clipOf(it.cx, it.cy));
}
const varHashes = Object.values(facts.variantsHash);
facts.variantsDistinct = new Set(varHashes).size === varHashes.length;

/* —— ② 轮廓阶梯 B（加法檐带）：同一栋 L2，仅 `step` 开/关 —— */
const stepItems = [
  { id: 'building.s0.l2', preset: 'shop', cx: 100, cy: 460, s: 2, params: { levels: 2, hue: 30, step: true, apron: false, variant: ['plain'] }, caption: 'step: true（檐带 2 道）', title: true, capDy: 185 },
  { id: 'building.s0.l2', preset: 'shop', cx: 290, cy: 460, s: 2, params: { levels: 2, hue: 30, step: false, apron: false, variant: ['plain'] }, caption: 'step: false（零回归基线）', capDy: 150 },
];
facts.stepBuilt = await buildPanel(stepItems);
facts.stepHash = { on: await shot('mono-p2-02-step-on.png', clipOf(100, 460)), off: await shot('mono-p2-02-step-off.png', clipOf(290, 460)) };
facts.stepChangesPixels = facts.stepHash.on !== facts.stepHash.off;

/* —— ③ 台阶铺装（L3 market3）：同一栋，仅 `apron` 开/关 —— */
const apronItems = [
  { id: 'building.s1.l3', preset: 'market3', cx: 100, cy: 460, s: 1.4, params: { levels: 3, hue: 200, step: false, apron: true }, caption: 'apron: true（门前同心菱台 ×3）', title: true, capDy: 145 },
  { id: 'building.s1.l3', preset: 'market3', cx: 290, cy: 460, s: 1.4, params: { levels: 3, hue: 200, step: false, apron: false }, caption: 'apron: false', capDy: 145 },
];
facts.apronBuilt = await buildPanel(apronItems);
facts.apronHash = { on: await shot('mono-p2-03-apron-on.png', clipOf(100, 460)), off: await shot('mono-p2-03-apron-off.png', clipOf(290, 460)) };
facts.apronChangesPixels = facts.apronHash.on !== facts.apronHash.off;

/* —— ④ 结构退台 A（预留开关，默认关）：同一栋 L3，仅 `setback` 开/关 —— */
const sbItems = [
  { id: 'building.s1.l3', preset: 'market3', cx: 100, cy: 460, s: 1.4, params: { levels: 3, hue: 200, step: false, apron: false, setback: true }, caption: 'setback: true（屋顶上层退进体块）', title: true, capDy: 145 },
  { id: 'building.s1.l3', preset: 'market3', cx: 290, cy: 460, s: 1.4, params: { levels: 3, hue: 200, step: false, apron: false, setback: false }, caption: 'setback: false（默认关）', capDy: 145 },
];
facts.setbackBuilt = await buildPanel(sbItems);
facts.setbackHash = { on: await shot('mono-p2-04-setback-on.png', clipOf(100, 460)), off: await shot('mono-p2-04-setback-off.png', clipOf(290, 460)) };
facts.setbackChangesPixels = facts.setbackHash.on !== facts.setbackHash.off;

await browser.close();

const gate = {
  variantsDistinct: facts.variantsDistinct,
  stepChangesPixels: facts.stepChangesPixels,
  apronChangesPixels: facts.apronChangesPixels,
  setbackChangesPixels: facts.setbackChangesPixels,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
if (Object.values(gate).some((v) => !v)) process.exit(1);
console.log('[p2-shots] PASS · 变体四款两两不同 · step/apron/setback 开关均改变像素 · 截图入 docs/verify/mono-p2-*');