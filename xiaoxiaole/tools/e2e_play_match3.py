# -*- coding: utf-8 -*-
"""消消乐可玩性测试 v3：硬编码棋盘几何（6列×6行，依 m1 截图像素诊断）→ 取色滤白字 → 找三连交换 → 真实对局"""
import io
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = "https://game.yourbao.cn"
SSO_USER = "gametest01"
SSO_PASS = "a963963"
SHOT = Path(r"d:\zhao\xiaoxiaole\design\e2e-sso")
COLS, ROWS = 6, 6
# 依 m1-board-clean.png 像素诊断：列距 ~57，行距 60，首行中心 y=280
COLS_X = [53.0, 110.0, 167.0, 223.0, 280.0, 337.0]
ROWS_Y = [280.0, 340.0, 400.0, 460.0, 520.0, 580.0]


def shot_rgb(page):
    return Image.open(io.BytesIO(page.screenshot())).convert("RGB")


def px(img, x_css, y_css):
    s = img.width / 390.0
    return img.getpixel((min(int(x_css * s), img.width - 1), min(int(y_css * s), img.height - 1)))


def is_piece(p):
    r, g, b = p[:3]
    return (0.299 * r + 0.587 * g + 0.114 * b) > 62 or max(r, g, b) - min(r, g, b) > 40


def close_popup(page):
    for i in range(6):
        page.mouse.click(195, 535)
        page.wait_for_timeout(1600)
        img = shot_rgb(page)
        cnt = sum(1 for x in range(40, 350, 6) if is_piece(px(img, x, 280)))
        print(f"[popup] try{i+1} piece_ratio={cnt}/{52}")
        if cnt > 20:
            return img
    return shot_rgb(page)


def cell_color(img, r, c):
    """格内 22x22 区域：剔除白字/近黑后均色"""
    x, y = COLS_X[c], ROWS_Y[r]
    s = img.width / 390.0
    cx, cy = int(x * s), int(y * s)
    data = []
    for xx in range(cx - 11, cx + 11, 2):
        for yy in range(cy - 11, cy + 11, 2):
            p = img.getpixel((xx, yy))
            R, G, B = p[:3]
            if R > 215 and G > 215 and B > 215:  # 白字
                continue
            if R + G + B < 130:  # 近黑纹
                continue
            data.append((R, G, B))
    if not data:
        return (0, 0, 0)
    n = len(data)
    return tuple(sum(ch[i] for ch in data) // n for i in range(3))


def classify_grid(img):
    sym = []
    for r in range(ROWS):
        row = []
        for c in range(COLS):
            R, G, B = cell_color(img, r, c)
            if R > 190 and G > 160 and B < 150:      # 黄 = 果
                k = "Y"
            elif R > 190 and B > 110 and G < 160:    # 粉 = 花
                k = "P"
            elif G > 130 and B > 120 and R < 150:    # 青 = 叶
                k = "C"
            else:
                k = f"?{R//40},{G//40},{B//40}"
            row.append(k)
        sym.append(row)
    return sym


def has3(g, r, c):
    k = g[r][c]
    if k in (None, "?"):
        return False
    n = 1
    for cc in range(c - 1, -1, -1):
        if g[r][cc] == k:
            n += 1
        else:
            break
    for cc in range(c + 1, COLS):
        if g[r][cc] == k:
            n += 1
        else:
            break
    if n >= 3:
        return True
    n = 1
    for rr in range(r - 1, -1, -1):
        if g[rr][c] == k:
            n += 1
        else:
            break
    for rr in range(r + 1, ROWS):
        if g[rr][c] == k:
            n += 1
        else:
            break
    return n >= 3


def find_match_swap(sym):
    for r in range(ROWS):
        for c in range(COLS):
            for dr, dc in ((0, 1), (1, 0)):
                r2, c2 = r + dr, c + dc
                if r2 >= ROWS or c2 >= COLS:
                    continue
                if sym[r][c].startswith("?") or sym[r2][c2].startswith("?"):
                    continue
                g2 = [row[:] for row in sym]
                g2[r][c], g2[r2][c2] = g2[r2][c2], g2[r][c]
                if has3(g2, r, c) or has3(g2, r2, c2):
                    return (r, c), (r2, c2)
    return None


def board_diff(img1, img2):
    """棋盘区域像素 diff 比例"""
    s = img1.width / 390.0
    box = (int(25 * s), int(245 * s), int(365 * s), int(600 * s))
    b1, b2 = img1.crop(box).tobytes(), img2.crop(box).tobytes()
    diff = sum(1 for i in range(0, len(b1), 3) if abs(b1[i] - b2[i]) > 30)
    return diff / (len(b1) / 3)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"),
    )
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    # 登录 → 进关 → 过教程
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    if "h.joho.cn" in page.url:
        inputs = page.locator("input:visible")
        inputs.nth(0).fill(SSO_USER)
        inputs.nth(1).fill(SSO_PASS)
        page.locator("button:visible, uni-button:visible").filter(has_text="登").first.click()
        for _ in range(30):
            page.wait_for_timeout(1000)
            if "game.yourbao.cn" in page.url:
                break
    page.wait_for_timeout(5000)
    page.mouse.click(195, 294)
    page.wait_for_timeout(2500)
    for i in range(3):
        page.mouse.click(195, 757)
        page.wait_for_timeout(1200)
    page.wait_for_timeout(1500)

    img = close_popup(page)
    img.save(str(SHOT / "v3-board0.png"))

    accepted = 0
    prev_img = img
    for rnd in range(6):
        sym = classify_grid(img)
        print(f"[round{rnd+1}]")
        for r in range(ROWS):
            print("  ", " ".join(sym[r][c] for c in range(COLS)))
        pair = find_match_swap(sym)
        if not pair:
            print(f"[round{rnd+1}] 无可消除交换对，停止搜索")
            break
        (a, b) = pair
        print(f"  swap {a}->{b}")
        page.mouse.click(COLS_X[a[1]], ROWS_Y[a[0]])
        page.wait_for_timeout(450)
        page.mouse.click(COLS_X[b[1]], ROWS_Y[b[0]])
        page.wait_for_timeout(3000)
        img = shot_rgb(page)
        img.save(str(SHOT / f"v3-round{rnd+1}.png"))
        d = board_diff(prev_img, img)
        print(f"  board_diff={d:.3f}")
        if d > 0.05:
            accepted += 1
        else:
            print("  （交换未生效或被还原）")
        prev_img = img

    print(f"[accepted-moves] {accepted}/6")
    real = [e for e in errors if "favicon" not in e.lower()]
    print(f"[console] {real if real else 'clean'}")
    browser.close()
    print("PLAY_OK" if accepted > 0 else "PLAY_FAIL")
