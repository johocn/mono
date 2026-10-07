# -*- coding: utf-8 -*-
"""验证 SSO 登录页 invite-view 埋点：真实浏览器打开带 invite_code 的登录页，
监听上报请求并校验 DB 记录。手机视口 390x844 dpr=2（硬规范）。"""
import json
import subprocess
from playwright.sync_api import sync_playwright

URL = ("https://h.joho.cn/#/pages/sso/login?app_code=game-xxl"
       "&return_url=https%3A%2F%2Fgame.joho.cn%2Ftour%2Fxxl%2F&invite_code=99GPTCJV")

SQL = ("select event_type, invite_code, app_code, device_type, referrer_domain, session_id "
       "from zhao_browser_logs where event_type='invite-view' order by created_at desc limit 5;")


def db_query():
    cmd = ("docker exec 1Panel-postgresql-pIe0 psql -U strapi -d strapi -c \"" + SQL + "\"")
    r = subprocess.run(["ssh", "joho", cmd], capture_output=True, text=True, timeout=60)
    return r.stdout


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    )
    page = ctx.new_page()
    hits = []
    page.on("request", lambda req: hits.append(req.url) if "invite-view" in req.url else None)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)
    page.screenshot(path="design/e2e-sso/4-sso-login-invite-view.png")

    print("[1] invite-view requests:", len(hits))
    for h in hits:
        print("   ", h[:110])
    print("[2] page errors:", errors or "none")
    browser.close()

print("[3] DB records:")
print(db_query())
