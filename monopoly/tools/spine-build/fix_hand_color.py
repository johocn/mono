# -*- coding: utf-8 -*-
"""臂图手部配色统一：把手区肉色系染为袖口黄 (250,212,92)，与臂根颜色一致。
判定：R>G>B、R>150、G/R∈(0.55,0.85)、B/G∈(0.55,0.85) 视为肉色；蓝色腕口/黄袖/深描边不受影响。
幂等：肉色→黄后再跑不满足肉色条件。用法: python fix_hand_color.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

PARTS = Path(__file__).parent / "parts"
ARMS = ["右手下垂", "左手下垂", "右手高举", "左手高举", "右手高举抛", "左手高举抛"]
HAND_RGB = (250, 212, 92)  # 与黄袖一致


def main():
    for name in ARMS:
        p = PARTS / f"孙悟空{name}.png"
        img = np.asarray(Image.open(p).convert("RGBA")).astype(np.int16)
        r, g, b, a = img[..., 0], img[..., 1], img[..., 2], img[..., 3]
        skin = (r > g) & (g > b) & (r > 150) & (a > 0) \
            & (g / np.maximum(r, 1) > 0.55) & (g / np.maximum(r, 1) < 0.85) \
            & (b / np.maximum(g, 1) > 0.55) & (b / np.maximum(g, 1) < 0.85)
        img[skin, 0], img[skin, 1], img[skin, 2] = HAND_RGB
        Image.fromarray(img.astype(np.uint8), "RGBA").save(p)
        print(f"{name}: skin px={int(skin.sum())} -> {HAND_RGB}")


if __name__ == "__main__":
    main()
