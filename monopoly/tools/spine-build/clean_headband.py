# -*- coding: utf-8 -*-
"""金箍图去白底：白色区域色键为透明，保留金边与装饰"""
from PIL import Image
from pathlib import Path

PARTS = Path(__file__).parent / "parts"
src = PARTS / "生成骨架动画与游戏人物设计开发 (1).png"
img = Image.open(src).convert("RGBA")
px = img.load()
w, h = img.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        # 白度：低饱和且亮度高 → 按 white 分量衰减 alpha（软边过渡）
        mn, mx = min(r, g, b), max(r, g, b)
        sat = mx - mn
        if sat < 28 and mx > 200:
            # 200→255 渐进透明，避免硬边白晕
            px[x, y] = (r, g, b, int(a * (255 - mx) / 55))
img.save(PARTS / "生成骨架动画与游戏人物设计开发 (1)_clean.png")
print("ok -> (1)_clean.png")
