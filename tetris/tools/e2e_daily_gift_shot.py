# tetris 每日礼包回归：弹层出现 → 点收下 → 弹层关闭且页面可点击（390x844 dpr=2）
# 注意：游戏为 canvas 渲染，DOM 文本定位器无效，须按源码矩形换算坐标点击。
import json
from playwright.sync_api import sync_playwright

URL = "https://game.yourbao.cn/tetris/"
OUT1 = r"d:\zhao\tetris\docs\screenshot-dailygift-popup-390x844.png"
OUT2 = r"d:\zhao\tetris\docs\screenshot-dailygift-closed-390x844.png"

# NoticeScene 几何（视口 390x844，两行文案）：面板 py=(844-260)/2=292，按钮 by=482, bh=52 → 收下中心 (195,508)
CLAIM = (195, 508)
# MainMenuScene：startRect y=844*0.34≈287, h=64 → 开始游戏中心 (195,319)
START = (195, 319)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    )
    console_errors, failed = [], []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    page.goto(URL, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    page.screenshot(path=OUT1)

    # 点「收下」关闭礼包弹层
    page.mouse.click(*CLAIM)
    page.wait_for_timeout(1200)

    # 弹层关闭后画布恢复可点击：点「开始游戏」应进入游戏场景（画布出现棋盘/下落块）
    page.mouse.click(*START)
    page.wait_for_timeout(1500)
    page.screenshot(path=OUT2)
    print(json.dumps({
        "console_errors": console_errors,
        "failed_requests": failed,
    }, ensure_ascii=False, indent=1))
    browser.close()
