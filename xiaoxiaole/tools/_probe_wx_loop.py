# -*- coding: utf-8 -*-
"""模拟微信 OAuth 回调后的完整转发链路：login-callback(带真token) → 回跳 → sso-exchange → 主菜单"""
import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

SHOT_DIR = Path(r"d:\zhao\xiaoxiaole\design\e2e-sso")
SSO_USER, SSO_PASS = "gametest01", "a963963"

# 1. 密码登录拿真实 access_token（等价于微信 OAuth 回调后 SSO 签发的 token）
req = urllib.request.Request(
    "https://h.joho.cn/api/zhao-sso/v1/auth/login",
    data=json.dumps({"type": "password", "identifier": SSO_USER, "password": SSO_PASS, "app_code": "game-xxl"}).encode(),
    headers={"Content-Type": "application/json"},
)
res = json.loads(urllib.request.urlopen(req).read())
token = res.get("access_token") or res.get("data", {}).get("access_token")
assert token, f"no token: {json.dumps(res)[:200]}"
print(f"[1] got sso token: {token[:24]}...")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    )
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # 2. 打开 login-callback（微信回调 302 的目的地），应转发 token 到 return_url
    page.goto(
        "https://h.joho.cn/#/pages/sso/login-callback?return_url="
        "https%3A%2F%2Fgame.yourbao.cn%2Ftour%2Fxxl%2F&app_code=game-xxl&token=" + token,
        wait_until="domcontentloaded",
    )
    for i in range(30):
        page.wait_for_timeout(1000)
        if "h.joho.cn" not in page.url and "/tour/xxl" in page.url:
            break
    print(f"[2] forwarded to: {page.url[:120]}")
    assert "/tour/xxl" in page.url and "h.joho.cn" not in page.url, f"未回跳游戏域：{page.url}"

    # 3. 等 sso-exchange + 主菜单渲染
    page.wait_for_timeout(6000)
    page.screenshot(path=str(SHOT_DIR / "wx-loop-main-menu.png"))
    real_errors = [e for e in errors if "favicon" not in e.lower()]
    print(f"[3] console errors: {json.dumps(real_errors[:5], ensure_ascii=False)}")
    browser.close()
    print("WX_LOOP_OK")
