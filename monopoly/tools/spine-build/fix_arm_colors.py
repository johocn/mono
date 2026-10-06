# -*- coding: utf-8 -*-
"""臂图配色统一（用户校准）：上臂红色→袖黄、手腕黑色→深蓝。
处理全部右臂/左臂图，幂等（黄/蓝目标色不会被再次命中）。
"""
import numpy as np
from PIL import Image
from pathlib import Path

PARTS = Path(__file__).parent / "parts"
ARMS = ["孙悟空右手臂向下", "孙悟空右手叉腰", "孙悟空右手振臂握拳",
        "孙悟空右手臂手心朝上可以抛东西", "孙悟空右手臂手掌张开",
        "孙悟空左手臂向下", "孙悟空左手臂振臂握拳",
        "孙悟空左手臂手部张开", "孙悟空左手臂手心朝上抛东西"]
YELLOW = (250, 212, 92)   # 与黄袖一致
BLUE = (47, 62, 138)      # 与深蓝腕口一致

for name in ARMS:
    p = PARTS / f"{name}.png"
    if not p.exists():
        continue
    img = Image.open(p).convert("RGBA")
    arr = np.asarray(img).copy()
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    mx = np.maximum(np.maximum(r, g), b)
    # 红色区：红显著高于绿蓝（红袖管）
    red = (r > 130) & (r > g * 1.45) & (r > b * 1.45)
    # 黑色区：整体极暗且低饱和（黑腕），排除暖棕描边(r>b 明显)
    black = (mx < 80) & (np.abs(r - b) < 28)
    for mask, color in ((red, YELLOW), (black, BLUE)):
        n = int(mask.sum())
        if n:
            arr[:, :, 0][mask] = color[0]
            arr[:, :, 1][mask] = color[1]
            arr[:, :, 2][mask] = color[2]
        print(f"{name}: {'红->黄' if mask is red else '黑->蓝'} {n}px")
    Image.fromarray(arr, "RGBA").save(p)
