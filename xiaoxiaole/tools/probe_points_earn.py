# -*- coding: utf-8 -*-
r"""
实证探针：消消乐积分接口 POST /api/client/v1/xiao/points/earn 400 复现
假设：前端 earnPoints 发 JSON 字符串 body 但未设 Content-Type: application/json，
     浏览器默认 text/plain → Nest/Express 不解析 JSON → DTO 校验失败 → 400。
对照：同一 body 分别不带 / 带 Content-Type 各调一次，比较状态码。
（gametest01 测试号，probe 成功会 +1 积分，可接受）
"""
import json
from playwright.sync_api import sync_playwright

BASE = "https://game.yourbao.cn"
SSO_USER = "gametest01"
SSO_PASS = "a963963"

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
    page.on(
        "response",
        lambda r: print(f"[http] {r.status} {r.request.method} {r.url}") if r.status >= 400 else None,
    )

    # SSO 登录（同 e2e_sso.py）
    page.goto(f"{BASE}/tour/xxl/", wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    assert "h.joho.cn" in page.url, f"未跳转 SSO：{page.url}"
    inputs = page.locator("input:visible")
    assert inputs.count() >= 2
    inputs.nth(0).fill(SSO_USER)
    inputs.nth(1).fill(SSO_PASS)
    btn = page.get_by_role("button").filter(has_text="登").first
    if btn.count() == 0:
        btn = page.locator("button:visible, .btn:visible, uni-button:visible").filter(has_text="登").first
    btn.click()
    for _ in range(30):
        page.wait_for_timeout(1000)
        if "h.joho.cn" not in page.url and "/tour/xxl" in page.url:
            break
    page.wait_for_timeout(5000)

    tok = page.evaluate("() => { try { const d = JSON.parse(localStorage.getItem('bg_auth_v1')); return d && d.token; } catch { return null; } }")
    assert tok, "未取到 bg_auth_v1.token"
    print("[auth] token ok, len =", len(tok))

    probe = page.evaluate(
        """async (tok) => {
          const url = 'https://game.yourbao.cn/api/client/v1/xiao/points/earn';
          const body = JSON.stringify({ amount: 1, type: 'probe_ctype_test' });
          const call = async (ct) => {
            const headers = { Authorization: 'Bearer ' + tok };
            if (ct) headers['Content-Type'] = ct;
            const r = await fetch(url, { method: 'POST', headers, body });
            let env = null; try { env = await r.json(); } catch {}
            return { status: r.status, code: env && env.code, msg: env && env.msg, data: env && env.data };
          };
          const a = await call(null);                    // 不带 Content-Type（复刻前端现状）
          const b = await call('application/json');      // 带 Content-Type
          return { noCT: a, withCT: b };
        }""",
        tok,
    )
    print("[probe] no Content-Type  →", json.dumps(probe["noCT"], ensure_ascii=False))
    print("[probe] application/json →", json.dumps(probe["withCT"], ensure_ascii=False))

    assert probe["noCT"]["status"] == 400, "预期不带 CT 返回 400（复现失败则假设不成立）"
    assert probe["withCT"]["status"] == 200 and probe["withCT"]["code"] == 0, "预期带 CT 成功"
    print("PROBE_OK：根因确认 = 缺失 Content-Type: application/json")
    browser.close()
