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

  // 1) 标题「开始」按钮：真实点击进入游戏
  await step("enter", async () => { await page.mouse.click(640, 382); await page.waitForTimeout(500); return page.evaluate(() => g.phase); });

  // 2) 关掉开场对话：反复点击对话框正文推进，直到对话关闭
  await step("dismissDlg", async () => {
    let forced = false;
    for (let i = 0; i < 120; i++) {
      const open = await page.evaluate(() => g.dlgBox.visible);
      if (!open) break;
      await page.mouse.click(640, 650);
      await page.waitForTimeout(90);
    }
    // 仍开着则用代码兜底关闭（仅清掉干扰层，不影响后续对 HUD 的真实命中测试）
    const stillOpen = await page.evaluate(() => g.dlgBox.visible);
    if (stillOpen) {
      await page.evaluate(() => { g.dialogue.isOpen = false; g.dlgBox.close(); g.dlgCatcher.visible = false; });
      forced = true;
    }
    const st = await page.evaluate(() => ({ open: g.dlgBox.visible, catcher: g.dlgCatcher.visible }));
    st.forced = forced;
    return st;
  });

  // 3) HUD「三界舆图」按钮：真实点击打开舆图
  await step("wmByClick", async () => { await page.mouse.click(52, 209); await page.waitForTimeout(300); return page.evaluate(() => g.worldMap.root.visible); });

  // 4) 舆图标注点击：真实点击「七玄门」标签 -> sel 变为其索引(8)
  await step("wmLabel", async () => { await page.mouse.click(312, 590); await page.waitForTimeout(200); return page.evaluate(() => g.worldMap.sel); });

  // 5) 点击舆图遮罩空白处关闭
  await step("closeWm", async () => { await page.mouse.click(5, 5); await page.waitForTimeout(200); return page.evaluate(() => !g.worldMap.root.visible); });

  // 6) HUD「人物志」按钮：真实点击打开
  await step("castByClick", async () => { await page.mouse.click(144, 209); await page.waitForTimeout(300); return page.evaluate(() => g.castPanel.root.visible); });

  // 7) 人物志角色切换 chip：真实点击第 2 个 -> sel 变为 1
  await step("castChip", async () => { await page.mouse.click(820, 169); await page.waitForTimeout(200); return page.evaluate(() => g.castPanel.sel); });

  // 8) 点击人物志遮罩空白处关闭
  await step("closeCast", async () => { await page.mouse.click(5, 5); await page.waitForTimeout(200); return page.evaluate(() => !g.castPanel.root.visible); });

  console.log("REALCLICK", JSON.stringify({ ...log, errors }, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
