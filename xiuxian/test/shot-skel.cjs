"use strict";
// 临时核验：等骨骼就绪 → 传送至空地 → 逐 clip 截图（idle/walk/skill），确认代码驱动骨骼动画
const { chromium } = require("../../laya-brawler/node_modules/playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  await p.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ready = await p.evaluate(async () => {
    const g = window.__game;
    g.startNewGame("骨骼");
    // 等分体部件加载 + 骨骼构建
    for (let i = 0; i < 40; i++) {
      if (g.player.rig.skelReady) break;
      await new Promise((res) => setTimeout(res, 120));
    }
    g.player.gx = 10.5; g.player.gy = 9.5; g.player.stop();
    const ok = g.player.rig.skelReady;
    // 等相机插值跟上传送后的位置
    await new Promise((res) => setTimeout(res, 1800));
    return ok;
  });
  console.log("SKEL_READY:", ready);
  if (!ready) { console.log("SKEL_NOT_READY"); await b.close(); process.exit(1); }
  for (const clip of ["idle", "walk", "walk2", "attack", "skill"]) {
    if (clip === "walk" || clip === "walk2") {
      // 真实走路：按住 A/D 让状态机进入 walk（两朝向各验一次镜像表现）
      await p.keyboard.down(clip === "walk" ? "a" : "d");
      await p.waitForTimeout(320);
    } else {
      // 屏蔽状态机覆盖（rig.play 会被每帧拉回 idle）后直驱骨架，确定性截挥击中段
      await p.evaluate((c) => {
        const r = window.__game.player.rig;
        r.play = () => {};
        r.clip = c;
        r.skelRig.play(c, false);
      }, clip);
      await p.waitForTimeout(clip === "attack" ? 120 : (clip === "skill" ? 180 : 340));
    }
    await p.screenshot({ path: `test/shot-skel-${clip}.png` });
    await p.screenshot({ path: `test/shot-skel-${clip}-zoom.png`, clip: { x: 390, y: 110, width: 300, height: 340 } });
    console.log(`shot-skel-${clip}.png`);
    if (clip === "walk" || clip === "walk2") await p.keyboard.up(clip === "walk" ? "a" : "d");
    await p.waitForTimeout(150);
  }
  await b.close();
  console.log("SKEL_SHOT_DONE");
})().catch((e) => { console.error("FAIL:", e && e.stack); process.exit(1); });
