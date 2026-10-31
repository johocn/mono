"use strict";
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.g = window.__game; });
  const log = {};
  const step = async (name, fn) => { try { log[name] = await fn(); } catch (e) { log[name] = "ERR:" + e.message; } };

  await step("enter", async () => { await page.mouse.click(640, 382); await page.waitForTimeout(500); return page.evaluate(() => g.phase); });
  await step("dismissDlg", async () => {
    for (let i = 0; i < 120; i++) { const o = await page.evaluate(() => g.dlgBox.visible); if (!o) break; await page.mouse.click(640, 650); await page.waitForTimeout(90); }
    return page.evaluate(() => g.dlgBox.visible);
  });

  // 1) 高物件已进角色层
  await step("props", async () => page.evaluate(() => {
    const ps = g.map.propEntries();
    return {
      count: ps.length,
      allInActorLayer: ps.every((p) => p.sprite.parent === g.map.actorLayer),
    };
  }));

  // 2) 碰撞合理性：玩家当前格必须是可走格（没踩进房子阻挡格）
  await step("playerTileWalkable", async () => page.evaluate(() => {
    const m = g.map.map;
    const gx = Math.floor(g.player.gx), gy = Math.floor(g.player.gy);
    return { gx, gy, walkable: gx >= 0 && gy >= 0 && gx < m.w && gy < m.h && !m.blocked[gy][gx] };
  }));

  // 3) 遮挡排序：玩家在房屋北侧（身后）时，房屋 zOrder 应大于玩家（画在玩家前面 → 遮住玩家）
  await step("occlusionOrder", async () => page.evaluate(() => {
    const ps = g.map.propEntries();
    if (!ps.length) return { skip: "no props" };
    const h = ps[0];
    // 玩家在房子北侧 = gy-1（屏幕上更靠上 = 更远）
    g.map.resort([
      { sprite: h.sprite, gx: h.gx, gy: h.gy },
      { sprite: g.player.rig.root, gx: h.gx, gy: h.gy - 1 },
    ]);
    const north = { houseZ: h.sprite.zOrder, playerZ: g.player.rig.root.zOrder, ok: h.sprite.zOrder > g.player.rig.root.zOrder };
    // 反向：玩家在房子南侧（身前）应露出
    g.map.resort([
      { sprite: h.sprite, gx: h.gx, gy: h.gy },
      { sprite: g.player.rig.root, gx: h.gx, gy: h.gy + 1 },
    ]);
    const south = { ok: h.sprite.zOrder < g.player.rig.root.zOrder };
    return { north, south };
  }));

  // 4) 采集点存在且提示链路：当前 zone 的 gathers 与底部提示
  await step("gathers", async () => page.evaluate(() => ({
    active: g.activeGathers ? g.activeGathers.length : g["activeGathers"]?.length ?? "n/a",
  })));

  // 场景截图（肉眼确认屋顶/树渲染正常）
  await page.screenshot({ path: "test/_occlusion.png" });

  console.log("OCCLUSION", JSON.stringify({ ...log, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
