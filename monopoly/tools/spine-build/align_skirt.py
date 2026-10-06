# -*- coding: utf-8 -*-
"""虎皮裙摆动帧腰带对齐：skirt_l / skirt_r 以 skirt 主图为基准，
检测各自绿腰带 bbox，平移画面使腰带中心 x、顶 y 与主图一致——
walk 切帧时腰带纹丝不动，只有裙摆飘动（消除身体与裙脱离感）。
"""
import numpy as np
from PIL import Image
from pathlib import Path

PARTS = Path(__file__).parent / "parts"
BASE = "skirt"      # 主图（语义名）
ALIGNEES = ["skirt_l", "skirt_r"]


def green_bbox(img):
    arr = np.asarray(img.convert("RGB"), dtype=np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mask = (g > r * 1.15) & (g > b * 1.25) & (g > 60)
    ys, xs = np.where(mask)
    if len(xs) < 50:
        return None
    return xs.mean(), ys.min(), xs.min(), xs.max(), ys.max()


def shift_to_match(base_bbox, img, bbox):
    cx0, ty0 = base_bbox[0], base_bbox[1]
    cx1, ty1 = bbox[0], bbox[1]
    dx, dy = round(cx0 - cx1), round(ty0 - ty1)
    if dx == 0 and dy == 0:
        return img
    w, h = img.size
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(img, (dx, dy), img)
    return canvas


for sem in ALIGNEES:
    p = PARTS / f"孙悟空绿色虎皮裙{'左摆' if sem == 'skirt_l' else '右摆'}.png"
    img = Image.open(p)
    bb = green_bbox(img)
    if bb is None:
        print(f"{p.name}: 未检测到绿腰带，跳过")
        continue
    base_img = Image.open(PARTS / "孙悟空绿色腰带虎皮裙.png")
    bb0 = green_bbox(base_img)
    if bb0 is None:
        raise SystemExit("主图未检测到绿腰带")
    out = shift_to_match(bb0, img, bb)
    out.save(p)
    print(f"{p.name}: 腰带中心 x {bb[0]:.0f}->{bb0[0]:.0f}, 顶 y {bb[1]}->{bb0[1]} (shift {round(bb0[0]-bb[0])},{round(bb0[1]-bb[1])})")
