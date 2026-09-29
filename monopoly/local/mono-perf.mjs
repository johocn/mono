import { chromium } from 'playwright';

/*
 * M6 性能预算测量（spec §11.5 / §5.6 性能预算）。
 *
 * headless Chromium 只给「代理指标」——真机 60fps 由手册的人工核对行兜底：
 *   ① 首屏可交互 ms       门槛 < 3000（4G 语境；本地 dev 无节流）
 *   ② 单次全量重绘 p95 ms  门槛 ≤ 20（重绘耗时是「能否 60fps」的可测代理；
 *                          headless 的 rAF 被浏览器限到 ~20fps，帧间隔不可当真机用）
 *   ③ 场景绘制元素数       门槛 < 200（spec「单帧绘制调用 < 200」的可测口径 = 经
 *                          instantiate() 产出的 pass 1–3 场景元素；pass 4 是屏幕空间
 *                          HUD/浮层，不计入场景绘制调用，单独报告 total）
 *   ④ fx 峰值元素数        门槛 < 40
 * 任一门槛未过 → exit(1)。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const FRAMES = 300;
const REDRAWS = 100;
const BUDGET = { interactiveMs: 3000, redrawP95Ms: 20, drawScene: 200, fxPeak: 40 };

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const facts = {};
const gate = {};

async function sample(query, label) {
  await page.goto(`${ORIGIN}/mono.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.scene), null, { timeout: 20000 });
  await page.waitForFunction((n) => window.__monoMain.perf.intervals.length >= n, FRAMES, { timeout: 60000 }).catch(() => {});

  const f = await page.evaluate(async (redraws) => {
    const pct = (values, p) => {
      const a = [...values].sort((x, y) => x - y);
      if (a.length === 0) return Number.NaN;
      return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
    };
    const m = window.__monoMain;
    const warm = m.perf.intervals.slice(30);
    const frame = warm.length > 0 ? warm : m.perf.intervals.slice();

    /* 单次全量重绘耗时（render + labels + HUD）：p95 越低越有余量跑 60fps。丢弃前 10 次预热 */
    const raw = [];
    for (let i = 0; i < redraws; i++) {
      const t0 = performance.now();
      m.paint();
      raw.push(performance.now() - t0);
    }
    const costs = raw.slice(10);

    const st = m.scene.stats();
    const scene = st.perPass[1] + st.perPass[2] + st.perPass[3];

    /* fx 峰值：叠一层满配动效，采样 fx 层多出的 overlay 元素数 */
    const baseOverlay = m.stage.layers.fx.children.length - st.perPass[4];
    m.fx.speed(3);
    m.fx.play(m.fxPreview('end'));
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      const overlay = m.stage.layers.fx.children.length - st.perPass[4];
      if (overlay > peak) peak = overlay;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    m.fx.skip();

    return {
      firstInteractiveMs: Math.round(m.perf.firstInteractiveMs),
      frameN: frame.length,
      frameP50: Math.round(pct(frame, 50) * 10) / 10,
      frameP95: Math.round(pct(frame, 95) * 10) / 10,
      redrawP50: Math.round(pct(costs, 50) * 100) / 100,
      redrawP95: Math.round(pct(costs, 95) * 100) / 100,
      perPass: st.perPass,
      drawScene: scene,
      drawTotal: st.total,
      fxPeak: Math.max(peak, baseOverlay),
    };
  }, REDRAWS);

  facts[label] = f;
  return f;
}

const main = await sample('debug=1&play=1&perf=1&humans=4&tour=0', 'default');
const photo = await sample('debug=1&play=1&perf=1&skin=photo&humans=4&tour=0', 'photo');

gate.interactive = main.firstInteractiveMs < BUDGET.interactiveMs;
gate.redrawP95 = main.redrawP95 <= BUDGET.redrawP95Ms;
gate.drawScene = main.drawScene < BUDGET.drawScene;
gate.fxPeak = main.fxPeak < BUDGET.fxPeak;
gate.photoInteractive = photo.firstInteractiveMs < BUDGET.interactiveMs;
gate.photoRedrawP95 = photo.redrawP95 <= BUDGET.redrawP95Ms;
gate.photoDrawScene = photo.drawScene < BUDGET.drawScene;
gate.photoFxPeak = photo.fxPeak < BUDGET.fxPeak;
gate.noErrors = errors.length === 0;

console.log(JSON.stringify({ budget: BUDGET, facts, gate, errors }, null, 2));
await browser.close();
if (Object.values(gate).some((v) => !v)) process.exit(1);