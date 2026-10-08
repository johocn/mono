# tetris 上线手机视口验收（390x844 dpr=2）：截图 + 控制台/请求零错误断言
import json
from playwright.sync_api import sync_playwright

URL = "https://game.yourbao.cn/tetris/"
OUT = r"d:\zhao\_tetris_shot.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    )
    console_errors = []
    failed = []
    earn = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    page.on("response", lambda r: earn.append({"status": r.status, "body": r.text()[:200]}) if "tetris/points/earn" in r.url else None)
    page.goto(URL, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)
    page.screenshot(path=OUT, full_page=False)
    print(json.dumps({
        "title": page.title(),
        "has_canvas": page.evaluate("!!document.querySelector('#GameCanvas')"),
        "loading_hidden": page.evaluate("!document.querySelector('#Loading') || document.querySelector('#Loading').style.display === 'none'"),
        "earn": earn,
        "console_errors": console_errors,
        "failed_requests": failed,
    }, ensure_ascii=False, indent=1))
    browser.close()
