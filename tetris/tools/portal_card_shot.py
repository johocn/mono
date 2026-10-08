# 门户 tetris 卡片验收截图（390x844 dpr=2）
import json
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, user_agent=UA)
    page.goto("https://game.yourbao.cn/tour/home.html", wait_until="networkidle", timeout=30000)
    # 滚到休闲分区截图
    page.locator("text=俄罗斯方块").scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    page.screenshot(path=r"d:\zhao\_portal_shot.png")
    # 断言卡片 href 与点击落点
    href = page.locator("a.game-card", has_text="俄罗斯方块").get_attribute("href")
    print(json.dumps({"tetris_card_href": href}, ensure_ascii=False))
    browser.close()
