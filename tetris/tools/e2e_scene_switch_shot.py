# tetris 场景切换回归（390x844 dpr=2）：主菜单→游戏→回主菜单→道具中心→返回
# 验证 setScene 先 destroy 后 construct 修复：切换场景后按钮 handler 不失效。
# canvas 渲染，DOM 定位器无效，坐标按源码矩形换算：
#   收下(195,508) 开始游戏(195,319) 道具中心(195,401) 房子(292,42) 道具中心返回(60,40)
import json
from playwright.sync_api import sync_playwright

URL = "https://game.yourbao.cn/tetris/"
OUT = r"d:\zhao\tetris\docs\screenshot-scene-switch-shop-390x844.png"

CLAIM, START, HOME, SHOP, BACK = (195, 508), (195, 319), (292, 42), (195, 401), (60, 40)

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
    page.mouse.click(*CLAIM)          # 关每日礼包
    page.wait_for_timeout(800)
    page.mouse.click(*START)          # 进游戏
    page.wait_for_timeout(1500)
    page.mouse.click(*HOME)           # 回主菜单（触发 setScene）
    page.wait_for_timeout(1000)
    page.mouse.click(*SHOP)           # 进道具中心（旧 bug：此处点不动）
    page.wait_for_timeout(1200)
    page.mouse.click(*BACK)           # 道具中心返回主菜单
    page.wait_for_timeout(1000)
    page.screenshot(path=OUT)
    print(json.dumps({"console_errors": console_errors, "failed_requests": failed}, ensure_ascii=False, indent=1))
    browser.close()
