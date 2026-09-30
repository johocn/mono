import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/*
 * D7 复核探针：`?theme=off`（裸 skin.json，无主题装配）与出厂 theme（config/theme.json）
 * 的手机视口（390×844, dpr=2）逐像素对比，确认 palette 是否真的落到了画面上。
 *
 * 差异由**浏览器内 canvas** 计算（不引入 pngjs 等解码依赖）：
 *   - diffPx / pct：有多少像素不同
 *   - bbox：差异包围盒（CSS 坐标 = dpr2 像素 / 2）
 *   - maxDelta / avgDelta：单像素 RGB 绝对差之和的最大值 / 平均值
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const base = 'play=1&seed=20260928&humans=4&tour=0&debug=1';
const url = (theme) => `${ORIGIN}/mono.html?${base}${theme ? `&theme=${theme}` : ''}`;

/* [标签, theme 查询值（'' = 出厂默认）, 棋盘特写输出文件] */
const VARIANTS = [
  ['off', 'off', 'mono-d7-off-board.png'],
  ['factory', '', 'mono-d7-factory-board.png'],
  ['warm-market', 'warm-market', 'mono-d7-warm-board.png'],
  ['night-neon', 'night-neon', 'mono-d7-neon-board.png'],
];

const md5 = (b) => createHash('md5').update(b).digest('hex');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shots = {};
for (const [label, theme, file] of VARIANTS) {
  await page.goto(url(theme), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 20000 });
  /* 连拍两张：同 URL 应字节一致（证明画面是静止的，差异不是动画抖动）；整屏只留在内存里做逐像素对比 */
  const b1 = await page.screenshot();
  const b2 = await page.screenshot();
  shots[label] = { file, buf: b1, hash: md5(b1), stable: md5(b1) === md5(b2) };
  /* 棋盘特写（同一张图裁出来，供肉眼核对配色是否真的换了） */
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: 0, y: 92, width: 390, height: 214 } });
}

/* —— 差异计算（浏览器内 canvas，无需外部 PNG 解码库） —— */
const differ = await context.newPage();
await differ.goto('about:blank');
const toUrl = (b) => `data:image/png;base64,${b.toString('base64')}`;

const pairs = {};
const CMP = [
  ['off_vs_factory', 'off', 'factory'],
  ['off_vs_warm-market', 'off', 'warm-market'],
  ['off_vs_night-neon', 'off', 'night-neon'],
  ['factory_vs_warm-market', 'factory', 'warm-market'],
  ['factory_vs_night-neon', 'factory', 'night-neon'],
];
for (const [name, a, b] of CMP) {
  const r = await differ.evaluate(async ([ua, ub]) => {
    const load = (u) => new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = no;
      img.src = u;
    });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    const w = ia.naturalWidth;
    const h = ia.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(ia, 0, 0);
    const da = cx.getImageData(0, 0, w, h).data;
    cx.clearRect(0, 0, w, h);
    cx.drawImage(ib, 0, 0);
    const db = cx.getImageData(0, 0, w, h).data;
    let n = 0, sum = 0, max = 0;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 0) {
          n++; sum += d;
          if (d > max) max = d;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      w, h, diffPx: n,
      pct: Number(((n / (w * h)) * 100).toFixed(3)),
      maxDelta: max,
      avgDelta: n ? Number((sum / n).toFixed(2)) : 0,
      bboxCss: n ? [minX / 2, minY / 2, (maxX + 1) / 2, (maxY + 1) / 2] : null,
    };
  }, [toUrl(shots[a].buf), toUrl(shots[b].buf)]);
  pairs[name] = r;
}

const out = {
  origin: ORIGIN,
  hashes: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, { file: v.file, hash: v.hash, stable: v.stable }])),
  pairs,
  errors,
};
console.log(JSON.stringify(out, null, 2));

await context.close();
await browser.close();