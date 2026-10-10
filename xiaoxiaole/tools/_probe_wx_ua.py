# -*- coding: utf-8 -*-
"""微信 UA 下消消乐 SSO 链路复现（对比普通 UA E2E）"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://game.yourbao.cn/tour/xxl/"
SHOT_DIR = Path(r"d:\zhao\xiaoxiaole\design\e2e-sso")
SHOT_DIR.mkdir(parents=True, exist_ok=True)

WX_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "MicroMessenger/8.0.49(0x18003123) NetType/WIFI Language/zh_CN"
)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=WX_UA,
    )
    page = ctx.new_page()
    trail = []
    page.on("framenavigated", lambda f: trail.append(f.url))
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(BASE, wait_until="domcontentloaded")
    for i in range(15):
        page.wait_for_timeout(1000)
        cur = page.url
        print(f"[t+{i+1}s] {cur[:160]}")
        if "open.weixin" in cur or "weixin" in cur.lower() or "oauth2" in cur:
            break
        if "h.joho.cn" in cur and i >= 4:
            # SSO 页已稳定，看是停在登录页还是又跳走了
            if i >= 9:
                break
    page.wait_for_timeout(3000)
    print(f"[final] {page.url[:300]}")
    page.screenshot(path=str(SHOT_DIR / "wx-ua-final.png"))
    body = ""
    try:
        body = page.inner_text("body")[:300]
    except Exception:
        pass
    print(f"[body] {body}")
    print(f"[trail] {json.dumps(trail[-6:], ensure_ascii=False, default=str)}")
    print(f"[errors] {json.dumps(errors[:5], ensure_ascii=False)}")
    browser.close()
