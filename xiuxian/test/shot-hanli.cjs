// 韩立青袍新形象核验：全屏 + 大幅特写，idle/walk/dodge 三态
const { chromium } = require("../../laya-brawler/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__game && window.__game.startNewGame) window.__game.startNewGame("试玩"); return 1; });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.__game;
    let i = 0;
    while (g.dialogue.isOpen && i++ < 60) g.dlgBox.onAdvance(0);
    g.dialogue.close();
    if (g.cutscene) { g.cutscene.skip(); for (let j = 0; j < 40; j++) g.cutscene.update(1 / 60); }
    return 1;
  });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => !!(window.__game && window.__game.player && window.__game.player.rig && window.__game.player.rig.artReady));
    if (ready) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);

  const rect = () => page.evaluate(() => {
    const g = window.__game;
    const ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    return { sx: Z * g.player.px + rootX, sy: Z * g.player.py + rootY, Z, state: g.player.state, clip: g.player.rig.current };
  });
  const clipOf = (r, k) => {
    const h = 66 * r.Z * k, halfW = h * 0.62;
    return { x: Math.max(0, r.sx - halfW), y: Math.max(0, r.sy - h * 1.02), width: halfW * 2, height: h * 1.22 };
  };

  // 1) 全屏（看角色与场景比例）
  await page.screenshot({ path: path.join(OUT, "hanli_full.png") });
  // 2) idle 大特写（k=1.5 包住全身）
  let r = await rect();
  console.log("idle", JSON.stringify(r));
  await page.screenshot({ path: path.join(OUT, "hanli_idle.png"), clip: clipOf(r, 1.5) });

  // 3) walk 三相位
  const mv = await page.evaluate(() => {
    const g = window.__game;
    const ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    const gx = Math.floor(g.player.gx), gy = Math.floor(g.player.gy);
    let tx = gx + 2, ty = gy;
    if (g.map.map.blocked[ty] && g.map.map.blocked[ty][tx]) { tx = gx - 2; }
    const c = ms.worldOf(tx, ty);
    return { sx: Z * c.x + rootX, sy: Z * c.y + rootY };
  });
  await page.mouse.click(mv.sx, mv.sy);
  for (const tag of ["walkA", "walkB", "walkC"]) {
    await page.waitForTimeout(180);
    r = await rect();
    await page.screenshot({ path: path.join(OUT, `hanli_${tag}.png`), clip: clipOf(r, 1.5) });
  }
  await page.waitForTimeout(1600);

  // 4) dodge 翻滚（tryRoll 定向）
  const rolled = await page.evaluate(() => { const g = window.__game; return g.player.tryRoll ? g.player.tryRoll(1, 0) : false; });
  console.log("tryRoll:", rolled);
  for (const [tag, wait] of [["dodgeA", 90], ["dodgeB", 120], ["dodgeC", 120]]) {
    await page.waitForTimeout(wait);
    r = await rect();
    await page.screenshot({ path: path.join(OUT, `hanli_${tag}.png`), clip: clipOf(r, 1.5) });
  }
  const fin = await page.evaluate(() => ({ state: window.__game.player.state, clip: window.__game.player.rig.current, skel: !!window.__game.player.rig.skelRig }));
  console.log("done", JSON.stringify(fin), "ready:", ready);
  await browser.close();
})();
