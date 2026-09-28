import { chromium } from 'playwright';

/*
 * 中端安卓 60fps 的「可复现代理测量」（CDP CPU 节流）——**分开测两种成本**。
 *
 * 为什么必须分开（读 src/main.ts / render/Scene.ts / render/stage.ts 的结论）：
 *   - 每帧：Pixi `TickerPlugin` 以 UPDATE_PRIORITY.LOW 把 `app.render` 挂进 ticker，
 *     每帧执行 `app.renderer.render({container: app.stage})`——只渲染**既有场景图**，
 *     不 `instantiate` 任何元素（`paint()` 每帧都不会被调用，全仓仅 boot 与动作路径调用）。
 *     GSAP 补间跑在 gsap 自己的 rAF ticker 上，逐帧改实例属性。
 *   - 状态切换：`__monoMain.paint()` = `scene.reset()` + 全量 `instantiate()` 189 个元素 +
 *     重建场景图 + labels/HUD/浮层——只在离散动作（roll/move/settle/buy/upgrade/card）时机发生。
 * 故「能否稳定 60fps」只能由**每帧渲染成本**支撑；`paint()` 是**状态切换的一次性卡顿**。
 *
 * 代理倍率（`Emulation.setCPUThrottlingRate`，打**线上真实 URL**）：
 *   1× 桌面基线 / 4× ≈ 中端安卓代理（判定基准）/ 6× ≈ 低端机压力（只报告）
 * 页内 performance.now() 采样：
 *   ① 每帧渲染成本：patch `app.renderer.render`（ticker 每帧真实调用的那个入口），
 *      不改渲染路径、不额外多渲染；空闲 & **动效播放中**各采 ≥30 帧
 *   ② 状态切换全量重绘：rAF 逐帧计时 `paint()`，≥30 样本
 *   ③ 首屏可交互（timeOrigin → `__monoMain.game` 就绪）、`scene.stats()` 元素数
 *   ④ 4× 下跑整局 `sim()`：墙钟 + round/over + 状态切换次数（= 交互路径下全量重绘次数）
 *
 * 判定：**每帧渲染** p95 > 16.7ms（60fps 帧预算）或 首屏 ≥ 3000ms → exit(1)；否则 exit(0)。
 * `--report-only`：只报告不判定（恒 exit 0）。
 * 注意：这是**代理**，不是真机实测；真机结论仍以手机打开 `?perf=1` 的读数为准。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const QUERY = 'play=1&nofx=1&perf=1';
const SAMPLES = 50;          // 每项采样总帧数
const WARMUP = 10;           // 丢弃前 N 帧预热 → 有效样本 = 40（≥30）
const RATES = [1, 4, 6];     // 1× 基线 / 4× 中端安卓代理（判定）/ 6× 低端压力
const GATE_RATE = 4;
const BUDGET = { frameMs: 16.7, interactiveMs: 3000 };
const FX_SLOW = 0.05;        // 动效测量时把 gsap 时轴拉到 1/20，使 tween 横跨足够多帧
const reportOnly = process.argv.includes('--report-only');

const pct = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  if (a.length === 0) return Number.NaN;
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};
const round1 = (v) => Math.round(v * 10) / 10;

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const client = await page.context().newCDPSession(page);

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const url = `${ORIGIN}/mono.html?${QUERY}`;

/* 预热一次（不节流）：填充 HTTP/资源缓存，使各倍率的「首屏」只反映 CPU 差异而非冷缓存 */
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 30000 });

/* 页内工具：逐帧采样既有场景图的每帧渲染成本（patch renderer.render，ticker 每帧真实调用） */
const FRAME_SAMPLER = `(async (frames) => {
  const rend = window.__monoMain.stage.app.renderer;
  const orig = rend.render.bind(rend);
  const costs = [];
  rend.render = (o) => { const t0 = performance.now(); const r = orig(o); costs.push(performance.now() - t0); return r; };
  await new Promise((resolve) => {
    let i = 0;
    const tick = () => { i += 1; if (i < frames) requestAnimationFrame(tick); else resolve(null); };
    requestAnimationFrame(tick);
  });
  rend.render = orig;
  return costs;
})`;

const rows = [];
for (const rate of RATES) {
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 30000 });

  /* ① 每帧渲染成本（空闲） */
  const idleFrames = await page.evaluate(`${FRAME_SAMPLER}(${SAMPLES})`);

  /* ② 状态切换全量重绘：rAF 逐帧计时 paint()，保证上一帧光栅队列排空，测稳态成本 */
  const redraw = await page.evaluate(async ({ samples, warmup }) => {
    const main = window.__monoMain;
    const raw = [];
    await new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        const t0 = performance.now();
        main.paint();
        raw.push(performance.now() - t0);
        i += 1;
        if (i < samples) requestAnimationFrame(tick); else resolve(null);
      };
      requestAnimationFrame(tick);
    });
    const st = main.scene.stats();
    return {
      costs: raw.slice(warmup),
      firstInteractiveMs: main.perf.firstInteractiveMs,
      scene: st.perPass[1] + st.perPass[2] + st.perPass[3],
      total: st.total,
    };
  }, { samples: SAMPLES, warmup: WARMUP });

  /* ③ 每帧渲染成本（动效播放中）：拉慢时轴 + 触发一段 move(hop) 动效，再逐帧采样 */
  await page.evaluate((s) => { window.__monoMain.fx.speed(s); window.__monoMain.fx.play(window.__monoMain.fxPreview('hop')); }, FX_SLOW);
  const animFrames = await page.evaluate(`${FRAME_SAMPLER}(${SAMPLES})`);
  await page.evaluate(() => { window.__monoMain.fx.skip(); });

  const cut = (arr) => arr.slice(WARMUP);
  const idle = cut(idleFrames);
  const anim = cut(animFrames);
  if (idle.length < 10 || anim.length < 10) throw new Error(`每帧采样不足：idle=${idle.length} anim=${anim.length}`);

  rows.push({
    rate,
    n: redraw.costs.length,
    idleP50: pct(idle, 50), idleP95: pct(idle, 95), idleMax: Math.max(...idle),
    animP50: pct(anim, 50), animP95: pct(anim, 95), animMax: Math.max(...anim),
    redrawP50: pct(redraw.costs, 50), redrawP95: pct(redraw.costs, 95), redrawMax: Math.max(...redraw.costs),
    firstInteractiveMs: redraw.firstInteractiveMs,
    scene: redraw.scene,
    total: redraw.total,
  });
}

/* ④ 4× 下跑整局：墙钟 + round/over + 状态切换次数（= 交互路径下全量重绘次数） */
await client.send('Emulation.setCPUThrottlingRate', { rate: GATE_RATE });
const sim = await page.evaluate(() => {
  const m = window.__monoMain;
  const g = m.game;
  const names = ['rollDice', 'moveCurrent', 'settleCurrent', 'buyCurrent', 'upgradeCurrent', 'skipTurn', 'endTurn', 'useCard', 'trade', 'clearEvent'];
  const orig = {};
  const counts = {};
  for (const n of names) { orig[n] = g[n].bind(g); counts[n] = 0; g[n] = (...a) => { counts[n] += 1; return orig[n](...a); }; }
  const t0 = performance.now();
  const winner = m.sim();
  const ms = performance.now() - t0;
  for (const n of names) g[n] = orig[n];
  return {
    ms, winner, over: g.state.over, round: g.state.round,
    actions: Object.values(counts).reduce((a, b) => a + b, 0),
    counts: Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0)),
  };
});

/* 收尾：复位节流 + 关浏览器 */
await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
await browser.close();

/* —— 报告 —— */
const pad = (s, n) => String(s).padEnd(n, ' ');
const num = (v) => (Number.isNaN(v) ? 'n/a' : round1(v).toFixed(1));
const cell = (v) => pad(v, 18);
const LABEL = { 1: '1× 桌面基线', 4: '4× 中端安卓代理', 6: '6× 低端压力' };
const g = rows.find((r) => r.rate === GATE_RATE);
if (!g) { console.error(`缺少 ${GATE_RATE}× 门控行`); process.exit(2); }

const line = (name, fn) => console.log(pad(name, 28) + rows.map((r) => cell(fn(r))).join(''));
console.log('mono · 中端安卓 60fps 代理测量（CDP CPU 节流，非真机）');
console.log(`URL: ${url}`);
console.log('');
console.log(pad('指标', 28) + rows.map((r) => cell(LABEL[r.rate] ?? `${r.rate}×`)).join(''));
line('有效样本 n', (r) => r.n);
line('每帧渲染 p50 (ms)', (r) => num(r.idleP50));
line('每帧渲染 p95 (ms)', (r) => num(r.idleP95));
line('每帧渲染 max (ms)', (r) => num(r.idleMax));
line('每帧渲染·动效中 p50 (ms)', (r) => num(r.animP50));
line('每帧渲染·动效中 p95 (ms)', (r) => num(r.animP95));
line('每帧渲染·动效中 max (ms)', (r) => num(r.animMax));
line('状态切换重绘 p50 (ms)', (r) => num(r.redrawP50));
line('状态切换重绘 p95 (ms)', (r) => num(r.redrawP95));
line('状态切换重绘 max (ms)', (r) => num(r.redrawMax));
line('首屏可交互 (ms)', (r) => round1(r.firstInteractiveMs));
line('场景元素数 pass 1-3', (r) => r.scene);
line('整帧元素数 total', (r) => r.total);
console.log('');

const gate = {
  frameP95UnderBudget: g.idleP95 <= BUDGET.frameMs,
  animFrameP95UnderBudget: g.animP95 <= BUDGET.frameMs,
  interactiveUnder3000: g.firstInteractiveMs < BUDGET.interactiveMs,
  simCompleted: sim.winner >= 1 && sim.winner <= 4 && sim.over === true,
  noErrors: errors.length === 0,
};
const pass = gate.frameP95UnderBudget && gate.animFrameP95UnderBudget && gate.interactiveUnder3000;

const blocked = g.redrawP95 / BUDGET.frameMs;
console.log(`判定（${GATE_RATE}×，60fps 由**每帧渲染**驱动）：空闲每帧 p95 = ${num(g.idleP95)} ms / 动效中 p95 = ${num(g.animP95)} ms vs ${BUDGET.frameMs} ms 帧预算 → ${pass ? 'PASS' : 'FAIL'}`);
console.log(`状态切换（一次性卡顿，不计入帧预算判定）：p95 = ${num(g.redrawP95)} ms ≈ ${round1(blocked)} 帧预算（≈占用 ${Math.ceil(blocked)} 帧 / 掉 ${Math.max(0, Math.ceil(blocked) - 1)} 帧）；整局 ≈ ${sim.actions} 次状态切换（交互路径下每次切换触发 1 次全量重绘）`);
console.log(`整局 sim（${GATE_RATE}× 节流）：墙钟 ${round1(sim.ms)} ms · winner=${sim.winner} · round=${sim.round} · over=${sim.over} · 切换分布 ${JSON.stringify(sim.counts)}`);
console.log(`gate: ${JSON.stringify(gate)}`);
if (errors.length) console.log(`errors: ${JSON.stringify(errors.slice(0, 5))}`);
console.log(pass ? '结论：代理口径下每帧渲染在 60fps 帧预算内（真机仍需人工 spot-check）' : '结论：代理口径下**每帧渲染**超出 60fps 帧预算（见上面真实数字）');

if (!reportOnly && (!pass || errors.length > 0)) process.exit(1);
