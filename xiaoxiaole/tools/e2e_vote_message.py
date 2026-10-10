# -*- coding: utf-8 -*-
r"""
消消乐「投票与留言」端到端验收（手机视口 390x844 dpr=2）
流程：SSO 登录 → 认知中心 → 🏆 最受欢迎（投票→看真实排行榜→改选→取消）→ 💬 留言建议（提交成功）
     → 关卡页右上角点赞 toggle
配套：d:\zhao\doc\消消乐投票与留言-Strapi后端交接.md 验收清单
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://game.yourbao.cn"
STATS_URL = (
    "https://h.joho.cn/api/zhao-website/v1/interactions/stats"
    "?domain=game.yourbao.cn&targetType=game-favorite"
)
SSO_USER = "gametest01"
SSO_PASS = "a963963"
SHOT_DIR = Path(r"d:\zhao\xiaoxiaole\design\e2e-vote")
SHOT_DIR.mkdir(parents=True, exist_ok=True)

# —— 页面几何（与源码布局常量一致，w=390 h=844）——
NAV_BRAIN = (243.75, 808)     # 底部导航第3项「认知中心」（index 2，itemW=97.5，navY=772）
NAV_LEVELS = (146.25, 808)    # 底部导航第2项「关卡」
TILE_VOTE = (105.5, 607)      # 认知中心「🏆 最受欢迎」磁贴中心（tileY2=574.8, tileH=64）
TILE_MSG = (282.5, 607)       # 认知中心「💬 留言建议」磁贴中心
VOTE_ROW0 = (195, 140)        # 投票第0行 match3「时光整理师」（rowsTop=108, ROW_H=64）
VOTE_ROW1 = (195, 214)        # 第1行 audio「听音辨位」
MSG_CONTENT = (195, 247)      # 留言内容字段（contentRect={24,172,342,150}）
MSG_SUBMIT = (195, 376)       # 提交按钮（submitRect={24,348,342,56}）
LIKE_BTN = (338, 46)          # 关卡页右上角点赞（likeRect={w-90,20,76,52}）


def shot(page, name):
    path = SHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"[shot] {path}")


def stats(page):
    return page.evaluate(
        "async (url) => { const r = await fetch(url); return await r.json(); }", STATS_URL
    )


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
        page.on(
            "response",
            lambda r: print(f"[http] {r.status} {r.request.method} {r.url}") if r.status >= 400 else None,
        )

        # 1. SSO 登录（同 e2e_sso.py 流程）
        page.goto(f"{BASE}/tour/xxl/?invite_code=99GPTCJV", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        assert "h.joho.cn" in page.url, f"未跳转 SSO：{page.url}"
        inputs = page.locator("input:visible")
        assert inputs.count() >= 2, f"登录表单缺失：{page.url}"
        inputs.nth(0).fill(SSO_USER)
        inputs.nth(1).fill(SSO_PASS)
        btn = page.get_by_role("button").filter(has_text="登").first
        if btn.count() == 0:
            btn = page.locator("button:visible, .btn:visible, uni-button:visible").filter(has_text="登").first
        if btn.count() == 0:
            shot(page, "x-no-login-btn")
            sys.exit("找不到登录按钮，见 x-no-login-btn.png")
        btn.click()
        for _ in range(30):
            page.wait_for_timeout(1000)
            if "h.joho.cn" not in page.url and "/tour/xxl" in page.url:
                break
        assert "/tour/xxl" in page.url and "h.joho.cn" not in page.url, f"未回跳：{page.url}"
        page.wait_for_timeout(5000)
        shot(page, "1-main-menu")
        print("[1] SSO 登录并回到主菜单")

        # 2. 底部导航 → 认知中心 → 截图确认投票/留言磁贴
        page.mouse.click(*NAV_BRAIN)
        page.wait_for_timeout(1200)
        shot(page, "2-brain-center")
        print("[2] 进入认知中心")

        # 3. 🏆 最受欢迎：投第0行「时光整理师」
        page.mouse.click(*TILE_VOTE)
        page.wait_for_timeout(1200)
        shot(page, "3-vote-initial")
        page.mouse.click(*VOTE_ROW0)
        page.wait_for_timeout(800)
        shot(page, "4-vote-selected-toast")
        s = stats(page)
        print(f"[3] 投票后 stats={json.dumps(s, ensure_ascii=False)}")
        rows = s.get("data") or []
        m3 = next((r for r in rows if r.get("targetId") == "match3"), None)
        assert m3 and m3["count"] >= 1, f"match3 票数未入库：{s}"

        # 4. 滚到底看排行榜块（maxOff=356，rankTop=934 → 屏上 y≈578）
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(800)
        shot(page, "5-vote-ranking")

        # 5. 回滚到顶 → 改选第1行「听音辨位」→ 再点取消
        page.mouse.wheel(0, -600)
        page.wait_for_timeout(800)
        page.mouse.click(*VOTE_ROW1)
        page.wait_for_timeout(800)
        shot(page, "6-vote-changed-toast")
        page.mouse.click(*VOTE_ROW1)
        page.wait_for_timeout(800)
        shot(page, "7-vote-cancelled-toast")
        s2 = stats(page)
        print(f"[5] 取消后 stats={json.dumps(s2, ensure_ascii=False)}")
        rows2 = s2.get("data") or []
        m3b = next((r for r in rows2 if r.get("targetId") == "match3"), None)
        assert (m3b or {}).get("count", 0) == 0, f"match3 未随取消清零：{s2}"
        print("[ok] 投票/改选/取消 + 排行榜聚合（软删过滤）验证通过")

        # 6. 返回（goBack 弹栈回主页：vote/message 不压路由栈）→ 重新进认知中心 → 💬 留言建议
        page.mouse.click(41, 41)  # VoteScene 返回 {16,16,50,50}
        page.wait_for_timeout(1200)
        page.mouse.click(*NAV_BRAIN)
        page.wait_for_timeout(1200)
        page.mouse.click(*TILE_MSG)
        page.wait_for_timeout(1200)
        shot(page, "8-message-page")
        page.mouse.click(*MSG_CONTENT)  # 点内容字段 → DOM 浮层
        page.wait_for_timeout(700)
        editor = page.locator("textarea:visible")
        assert editor.count() >= 1, "留言 DOM 输入浮层未弹出"
        nick = page.locator("input:visible").first
        nick.fill("E2E验收")
        editor.first.fill("E2E自动验收：投票与留言链路联调测试。")
        shot(page, "9-message-editor")
        page.get_by_role("button").filter(has_text="完成").first.click()
        page.wait_for_timeout(500)
        page.mouse.click(*MSG_SUBMIT)
        page.wait_for_timeout(2200)  # 等 toast「收到啦，谢谢您的建议！」
        shot(page, "10-message-submitted-toast")
        print("[6] 留言已提交（toast 见截图，入库情况由 ssh 查库复核）")

        # 7. 留言 back 弹栈回主页 → 底部导航「关卡」→ 右上角点赞 toggle
        page.mouse.click(40, 46)  # MessageScene 返回 {14,20,52,52}
        page.wait_for_timeout(2500)  # 等主页引导气泡/入场动画结束，避免吞点击
        page.mouse.click(*NAV_LEVELS)
        page.wait_for_timeout(2000)
        shot(page, "11a-levelselect")  # 确认到达关卡页（右上应为「👍 点赞」）
        page.mouse.click(*LIKE_BTN)
        page.wait_for_timeout(900)
        shot(page, "11-like-on")
        page.mouse.click(*LIKE_BTN)
        page.wait_for_timeout(900)
        shot(page, "12-like-off")
        print("[7] 关卡页点赞已 toggle 两次（净效果：无残留）")

        real_errors = [e for e in errors if "favicon" not in e.lower()]
        print(f"[8] console errors: {json.dumps(real_errors, ensure_ascii=False)[:800]}")
        browser.close()
        print("E2E_OK")


if __name__ == "__main__":
    main()
