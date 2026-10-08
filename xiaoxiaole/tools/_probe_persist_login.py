# -*- coding: utf-8 -*-
"""一次性探针：SSO 持久化登录浏览器级验证（手机视口 390x844 dpr=2）
1) SSO 登录回跳  2) localStorage 持久化 refreshToken  3) 重载不掉线
4) 用持久化 refreshToken 实际调 /auth/refresh 换发+轮换  5) 记录 >=400 响应定位 400
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://game.yourbao.cn"
SSO_USER = "gametest01"
SSO_PASS = "a963963"
SHOT_DIR = Path(r"d:\zhao\xiaoxiaole\design\e2e-sso")


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
        bad = []
        page.on(
            "response",
            lambda r: bad.append(f"{r.status} {r.request.method} {r.url}") if r.status >= 400 else None,
        )
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1. SSO 登录
        page.goto(f"{BASE}/tour/xxl/", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        assert "h.joho.cn" in page.url, f"未跳 SSO: {page.url}"
        page.screenshot(path=str(SHOT_DIR / "p0-landing.png"))
        # 若默认为微信登录 tab，切到账号登录
        for tab_text in ("账号登录", "账号", "密码登录"):
            tab = page.locator(f"text={tab_text}").first
            try:
                if tab.count() and tab.is_visible():
                    tab.click()
                    page.wait_for_timeout(1000)
                    break
            except Exception:
                pass
        inputs = page.locator("input:visible")
        if inputs.count() < 2:
            sys.exit("登录表单未找到，见 p0-landing.png")
        inputs.nth(0).fill(SSO_USER)
        inputs.nth(1).fill(SSO_PASS)
        btn = page.get_by_role("button").filter(has_text="登").first
        if btn.count() == 0:
            btn = page.locator("button:visible, .btn:visible, uni-button:visible, div[class*=btn]:visible").filter(has_text="登").first
        page.screenshot(path=str(SHOT_DIR / "p1-filled.png"))
        btn.click()
        for _ in range(30):
            page.wait_for_timeout(1000)
            if "h.joho.cn" not in page.url and "/tour/xxl" in page.url:
                break
        assert "h.joho.cn" not in page.url, f"未回跳: {page.url}"
        page.wait_for_timeout(5000)

        # 2. 持久化检查
        auth = page.evaluate("() => localStorage.getItem('bg_auth_v1')")
        data = json.loads(auth) if auth else {}
        rt1 = data.get("refreshToken")
        exp = data.get("expiresAt")
        print(f"[auth] hasToken={bool(data.get('token'))} hasRT={bool(rt1)} "
              f"expiresAt={exp} isGuest={data.get('isGuest')} nickname={data.get('nickname')}")

        # 3. 重载 → 不得跳 SSO（持久化登录）
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        stayed = "h.joho.cn" not in page.url
        auth2 = page.evaluate("() => localStorage.getItem('bg_auth_v1')")
        d2 = json.loads(auth2) if auth2 else {}
        print(f"[reload] stayed_on_game={stayed} url={page.url[:80]} still_authed={bool(d2.get('token'))}")
        page.screenshot(path=str(SHOT_DIR / "5-persist-reload.png"))

        # 4. 用持久化 refreshToken 实际换发（浏览器上下文内）
        refresh_probe = page.evaluate(
            """async () => {
                const d = JSON.parse(localStorage.getItem('bg_auth_v1') || '{}');
                if (!d.refreshToken) return { ok: false, why: 'no refreshToken persisted' };
                const r = await fetch('/api/client/v1/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: d.refreshToken }),
                });
                const j = await r.json();
                return {
                    http: r.status, code: j.code,
                    gotNewToken: !!(j.data && j.data.token),
                    rotated: !!(j.data && j.data.refreshToken && j.data.refreshToken !== d.refreshToken),
                    expiresIn: j.data && j.data.expiresIn,
                };
            }"""
        )
        print(f"[refresh] {json.dumps(refresh_probe)}")

        print(f"[bad responses] {json.dumps(bad, ensure_ascii=False)}")
        real = [e for e in errors if "favicon" not in e.lower()]
        print(f"[console errors] {json.dumps(real, ensure_ascii=False)[:600]}")
        browser.close()
        ok = stayed and bool(d2.get("token")) and refresh_probe.get("ok", refresh_probe.get("code") == 0) and refresh_probe.get("rotated")
        print("PERSIST_OK" if ok else "PERSIST_FAIL")


if __name__ == "__main__":
    main()
