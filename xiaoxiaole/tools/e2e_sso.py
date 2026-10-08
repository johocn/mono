# -*- coding: utf-8 -*-
"""
消消乐 SSO 端到端验证（手机视口 390x844 dpr=2）
流程：访问(带 invite_code) → 跳 SSO 登录页 → 账号登录 → 回跳换会话 → 主菜单 → 邀请按钮
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://game.yourbao.cn"
SSO_USER = "gametest01"
SSO_PASS = "a963963"
SHOT_DIR = Path(r"d:\zhao\xiaoxiaole\design\e2e-sso")
SHOT_DIR.mkdir(parents=True, exist_ok=True)


def shot(page, name):
    path = SHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"[shot] {path}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
            ),
        )
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1. 带 invite_code 访问消消乐入口 → 应跳 SSO 登录页且透传 invite_code
        page.goto(f"{BASE}/tour/xxl/?invite_code=99GPTCJV", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        url = page.url
        print(f"[1] redirected: {url}")
        assert "h.joho.cn" in url, f"未跳转 SSO：{url}"
        assert "app_code=game-xxl" in url, "app_code 缺失"
        assert "invite_code=99GPTCJV" in url, "invite_code 未透传"
        page.wait_for_load_state("networkidle")
        shot(page, "1-sso-login-page")

        # 2. 动态发现登录表单
        inputs = page.locator("input:visible")
        n = inputs.count()
        print(f"[2] visible inputs: {n}")
        for i in range(n):
            el = inputs.nth(i)
            print(f"    input[{i}] type={el.get_attribute('type')} ph={el.get_attribute('placeholder')}")
        if n < 2:
            # 可能有 tab 需要切换（微信登录/账号登录）
            page.screenshot(path=str(SHOT_DIR / "2-recon.png"))
            body = page.inner_text("body")[:500]
            print(f"    body text: {body}")
            sys.exit("登录表单未找到，见 2-recon.png")

        inputs.nth(0).fill(SSO_USER)
        inputs.nth(1).fill(SSO_PASS)
        shot(page, "2-login-filled")

        # 3. 点登录按钮
        btn = page.get_by_role("button").filter(has_text="登").first
        if btn.count() == 0:
            btn = page.locator("button:visible, .btn:visible, uni-button:visible").filter(has_text="登").first
        btn.click()
        print("[3] clicked login")

        # 4. 等待回跳游戏域（sso-exchange 后显示主菜单 canvas）
        for _ in range(30):
            page.wait_for_timeout(1000)
            if "h.joho.cn" not in page.url and "/tour/xxl" in page.url:
                break
        print(f"[4] back at: {page.url}")
        assert "/tour/xxl" in page.url and "h.joho.cn" not in page.url, f"未回跳：{page.url}"
        page.wait_for_timeout(5000)  # 等 sso-exchange + 主菜单渲染
        shot(page, "3-main-menu")

        # 5. 点「邀请」按钮（inviteRect: x=w-122..w-72, y=16..66 → 中心(293,41)）
        page.mouse.click(293, 41)
        page.wait_for_timeout(1500)
        shot(page, "4-invite-dialog")

        # 6. 错误汇总
        real_errors = [e for e in errors if "favicon" not in e.lower()]
        print(f"[5] console errors: {json.dumps(real_errors, ensure_ascii=False)[:800]}")
        browser.close()
        print("E2E_OK")


if __name__ == "__main__":
    main()
