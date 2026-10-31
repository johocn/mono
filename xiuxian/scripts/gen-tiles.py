#!/usr/bin/env python3
"""
生成等距地图菱形瓦片的「方形无缝原图」到 public/assets/tiles/<kind>.png。
IsoMap.drawGround 已支持「贴图优先」：loadMapAssets() 会把这里生成的方形原图
经 bakeDiamond 烘焙成 64x32 菱形平铺；缺失则回退程序化着色。

设计：纯程序化 + 整数频率正弦叠加 → 严格无缝（周期等于图宽），零外部素材、
零版权风险、风格统一（规避 AI 出图一致性难题）。运行：python scripts/gen-tiles.py
"""
import os
import math
import numpy as np
from PIL import Image

S = 256  # 无缝原图边长
OUT = os.path.join("public", "assets", "tiles")
os.makedirs(OUT, exist_ok=True)


def periodic_noise(seed: int, octaves: int = 3) -> np.ndarray:
    """整数频率正弦叠加 → 周期=S 的无缝噪声场，归一化到 [0,1]"""
    rng = np.random.default_rng(seed)
    field = np.zeros((S, S))
    xx = np.arange(S)
    yy = np.arange(S)
    X, Y = np.meshgrid(xx, yy)
    for _ in range(octaves):
        fx = rng.integers(1, 6)
        fy = rng.integers(1, 6)
        px = rng.random() * 2 * math.pi
        py = rng.random() * 2 * math.pi
        amp = rng.random() * 0.5 + 0.5
        field += amp * np.sin(2 * math.pi * (fx * X / S + fy * Y / S) + px + py)
    fmin = field.min()
    fmax = field.max()
    rng2 = fmax - fmin
    field -= fmin
    if rng2 > 1e-6:
        field /= rng2
    return field


def build(kind: str, base: tuple, amp: int, seed: int,
          tufts: bool = False, ripple: bool = False, tuft_dark=(50, 80, 45), tuft_lit=(92, 122, 72)):
    n = periodic_noise(seed, 3)
    n2 = periodic_noise(seed + 99, 2) if tufts else None
    img = np.zeros((S, S, 3), dtype=np.float32)
    for c in range(3):
        img[:, :, c] = base[c] + (n - 0.5) * amp
    if ripple:
        X, Y = np.meshgrid(np.arange(S), np.arange(S))
        r = 0.5 + 0.5 * np.sin(2 * math.pi * (2 * X / S)) * np.sin(2 * math.pi * (1 * Y / S))
        for c in range(3):
            img[:, :, c] += (r - 0.5) * 26
    if tufts and n2 is not None:
        dark = n2 > 0.82
        lit = n2 < 0.16
        img[dark] = tuft_dark
        img[lit] = tuft_lit
    img = np.clip(img, 0, 255).astype(np.uint8)
    return img


# 主题中立的悦目基色（瓦片为跨主题通用纹理；主题差异仍由雾/背景/装饰体现）
TILES = {
    "grass":  dict(base=(74, 104, 64),  amp=22, seed=11, tufts=True),
    "path":   dict(base=(120, 112, 92), amp=26, seed=23),
    "water":  dict(base=(44, 78, 98),   amp=14, seed=37, ripple=True),
    "sand":   dict(base=(190, 166, 112), amp=22, seed=53),
    "arena":  dict(base=(116, 92, 60),  amp=20, seed=67),
    "reef":   dict(base=(88, 108, 110), amp=20, seed=83),
    "portal": dict(base=(40, 70, 100),  amp=16, seed=97),
}

if __name__ == "__main__":
    for kind, kw in TILES.items():
        img = build(kind, **kw)
        Image.fromarray(img, "RGB").save(os.path.join(OUT, f"{kind}.png"))
        print(f"  tiles/{kind}.png  {img.shape[1]}x{img.shape[0]}  base={kw['base']}")
    print(f"OK 生成 {len(TILES)} 张无缝瓦片 -> {OUT}")
