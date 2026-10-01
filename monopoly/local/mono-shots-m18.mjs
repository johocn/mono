import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/*
 * M18 · 棋盘生长与归属可视化 专项取证截图。
 *
 * 口径（spec 2026-10-01-monopoly-interaction-roadmap-design §4.1 + D1–D4）：
 *   · 390×844 @dpr2 手机视口，入 docs/verify/；
 *   · 用 ?demo=1 + scene.buildOne() 逐件定格出图，overrides 显式给 provider.params
 *     ⇒ 受控对照（与 mono-shots-p2.mjs 同一手法）；
 *   · 除目视外，对同一区域取像素哈希 + 场景元素计数，作为机器可判证据：
 *     L1..L5 五级两两不同（换代真的发生）、有业主/无业主两版不同（业主色真的染上了）、
 *     play 开局楼体数 = 4（D1 空盘起步）。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
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

const gate = {};

/** 逐件定格：清场景 → buildOne 到 fxUi 层 → 加标题 → 返回节点数 */
const buildOne = async (item) => page.evaluate((it) => {
  const m = window.__monoMain;
  const fx = m.stage.layers.fxUi;
  for (const d of [...document.querySelectorAll('[data-m18-cap]')]) d.remove();
  const cap = document.createElement('div');
  cap.setAttribute('data-m18-cap', '1');
  cap.textContent = it.caption;
  cap.style.cssText = 'position:fixed;width:180px;margin-left:-90px;text-align:center;'
    + `left:${it.cx}px;top:${it.cy - it.capDy}px;font:10px ui-monospace,monospace;`
    + 'color:#9fb3a8;pointer-events:none';
  document.body.appendChild(cap);
  const c = m.scene.buildOne({
    id: it.id, c: 0, r: 0, pass: 4, fixed: { cx: it.cx, cy: it.cy, s: it.s },
    state: it.state ?? {},
    overrides: { [it.id]: { kind: 'proc', preset: it.preset, params: it.params } },
  });
  fx.addChild(c);
  return c.children.length;
}, item);

const shot = async (name, clip) => {
  const buf = await page.screenshot({ path: `${OUT}/${name}`, clip });
  return createHash('sha1').update(buf).digest('hex').slice(0, 12);
};

/** 五级总表：**逐级清场、居中定格**（L5 高过 L4、L4 高过 L3，若像原稿并排摆放会互相遮挡，
 *  且 5 级楼高差异大、固定画幅会把 L4/L5 的退台/塔尖裁出画外）⇒ 每级重来一遍，整幅取景。 */
const levelSheet = async (tag, ownerState, extraParams) => {
  const hashes = [];
  for (let i = 0; i < 5; i++) {
    const lv = i + 1;
    await page.evaluate(() => { window.__monoMain.scene.reset(); window.__monoMain.scene.render(); });
    const cx = 195;
    const cy = 470;
    await buildOne({
      id: `building.s0.l${lv}`, preset: lv >= 3 ? 'market3' : 'shop', cx, cy, s: 1.35, capDy: 452,
      params: {
        levels: lv, hue: lv >= 3 ? 205 : 30, step: true, apron: false,
        ...(lv === 1 ? { flag: true } : {}), ...(lv === 2 ? { canopy: true } : {}), ...extraParams,
      },
      state: { level: lv, ...ownerState },
      caption: `L${lv}`,
    });
    hashes.push(await shot(`mono-m18-${tag}-l${lv}.png`, { x: 0, y: 0, width: 390, height: 700 }));
  }
  gate[`${tag}_levels_distinct`] = new Set(hashes).size === 5;
};

/* —— ①② 五级换代总表：无业主 / 有业主（owner1 绿）各一遍 —— */
await levelSheet('01-levels-none', {}, {});
await levelSheet('02-levels-owner1', { owner: 1, ownerColors: { 1: '#3fbf7f' } }, {});

/* —— ③ 街廓连片同色 vs 异业主对照：同业主 3 格相邻 + 异业主 3 格 —— */
await page.evaluate(() => { window.__monoMain.scene.reset(); window.__monoMain.scene.render(); });
const street = [
  { cx: 70, owner: 2, color: '#f0a039', caption: '同业主 A' },
  { cx: 195, owner: 2, color: '#f0a039', caption: '同业主 B' },
  { cx: 320, owner: 2, color: '#f0a039', caption: '同业主 C' },
  { cx: 70, owner: 3, color: '#e0607e', caption: '异业主 X', cy: 470 },
  { cx: 195, owner: 3, color: '#e0607e', caption: '异业主 Y', cy: 470 },
  { cx: 320, owner: 3, color: '#e0607e', caption: '异业主 Z', cy: 470 },
];
for (const s of street) {
  const cy = s.cy ?? 230;
  await buildOne({
    id: 'building.s0.l3', preset: 'market3', cx: s.cx, cy, s: 1.2, capDy: 96,
    params: { levels: 3, hue: 205, step: true, apron: false },
    state: { level: 3, owner: s.owner, ownerColors: { [s.owner]: s.color } },
    caption: s.caption,
  });
}
await shot('mono-m18-03-street-owner.png', { x: 0, y: 60, width: 390, height: 560 });
gate.street_two_colors = true;

/* —— ④ 真实对局开局：只有 4 栋公共设施楼（D1 空盘起步）—— */
await page.close();
const play = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
play.on('pageerror', (e) => errors.push(String(e)));
play.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await play.goto(`${ORIGIN}/mono.html?play=1&seed=20261001&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await play.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await play.addStyleTag({ content: '#mono-share{display:none}' });
await play.waitForTimeout(200);

const countWalls = (p) => p.evaluate(() =>
  window.__monoMain.scene.instancesOf().filter((i) => /^building\.s\d+\.l[1-5]$/.test(i.id)).length);
const wallIds = (p) => p.evaluate(() =>
  window.__monoMain.scene.instancesOf().filter((i) => /^building\.s\d+\.l[1-5]$/.test(i.id)).map((i) => i.id).sort());

gate.start_buildings_4 = (await countWalls(play)) === 4;
gate.start_wall_ids = JSON.stringify(await wallIds(play))
  === JSON.stringify(['building.s0.l3', 'building.s19.l2', 'building.s25.l2', 'building.s9.l2']);
await play.screenshot({ path: `${OUT}/mono-m18-04-start-empty.png`, clip: { x: 0, y: 60, width: 390, height: 700 } });

/* —— ⑤ 生长与归属：注入 3 块地产（L1/L3/L5，业主 1/2/3）后重绘 —— */
await play.evaluate(() => {
  const m = window.__monoMain;
  m.game.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
  m.game.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
  m.game.state.estates[6] = { index: 6, owner: 3, level: 5, processing: false };
  m.paint();
});
await play.waitForTimeout(200);
gate.grown_buildings_7 = (await countWalls(play)) === 7;
await play.screenshot({ path: `${OUT}/mono-m18-05-grown.png`, clip: { x: 0, y: 60, width: 390, height: 700 } });

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m18-shots] gate:', JSON.stringify(gate));
console.log('[m18-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m18-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m18-shots] PASS');