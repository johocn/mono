# -*- coding: utf-8 -*-
"""豆包生成的部件图处理：抠掉烙死的棋盘格背景 → 擦水印 → 裁切 → 输出 RGBA PNG + 元数据。
用法: python process_parts.py <in_dir> <out_dir>
从图像边缘做洪水填充，只有与边缘连通的浅色区域才算背景，
裙子白毛/衣服留白等被深色描边包围的浅色不受影响。
部件周围的暖金色光晕保留（与游戏金色边缘光风格一致）。
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

BR, BC = 0.82, 0.22  # 亮度/饱和阈值：>=BR 且饱和<=BC 视为背景候选
# 仅这些图做内部空洞清理（毛发围空/裤裆残留）——骰子、金镜等白芯部件不能开
HOLE_FIX = {
    "生成骨架动画与游戏人物设计开发 (2)",
    "生成骨架动画与游戏人物设计开发 (18)",
    "生成骨架动画与游戏人物设计开发 (19)",
    "生成骨架动画与游戏人物设计开发 (20)",
}


def sat_brightness(arr):
    mx = arr.max(axis=2).astype(np.float32)
    mn = arr.min(axis=2).astype(np.float32)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return mn, sat  # min 通道当亮度（排除纯白高光误判），饱和度


def key_background(img, fix_holes=False):
    rgb = np.asarray(img.convert("RGB"), dtype=np.uint8)
    h, w, _ = rgb.shape
    mn, sat = sat_brightness(rgb)
    cand = (mn >= 255 * BR) & (sat <= BC)

    # 水印擦除：右下角固定区域（豆包水印），直接标记为背景
    cand[int(h * 0.94):, int(w * 0.70):] = True

    # 边缘洪水填充（numpy 迭代膨胀，快且稳）
    bg = np.zeros((h, w), dtype=bool)
    border = np.zeros((h, w), dtype=bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    seed = cand & border
    if not seed.any():
        seed[0, 0] = True
    bg = seed
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= cand
        if (grown == bg).all():
            break
        bg = grown

    # 二次清理：被困在部件内部的背景色空洞（如毛发围出的空隙）——
    # 找不接触图像边缘的 cand 连通域，面积超过阈值即视为背景。
    if fix_holes:
        not_bg_cand = cand & ~bg
        # 连通域标记（简易 BFS，8 邻接）；无 scipy 依赖
        labels = np.zeros((h, w), dtype=np.int32)
        cur = 0
        ys0, xs0 = np.where(not_bg_cand)
        for y, x in zip(ys0.tolist(), xs0.tolist()):
            if labels[y, x]:
                continue
            cur += 1
            q = deque([(y, x)])
            labels[y, x] = cur
            pix = [(y, x)]
            while q:
                cy, cx = q.popleft()
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1),
                               (cy-1,cx-1),(cy-1,cx+1),(cy+1,cx-1),(cy+1,cx+1)):
                    if 0 <= ny < h and 0 <= nx < w and not_bg_cand[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
                        pix.append((ny, nx))
            ys = [p[0] for p in pix]; xs = [p[1] for p in pix]
            touches = min(ys) == 0 or min(xs) == 0 or max(ys) == h-1 or max(xs) == w-1
            if not touches and len(pix) > 150:
                bg[ys, xs] = True

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, alpha])
    return Image.fromarray(out, "RGBA")


def trim(img, pad=8):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return img, (0, 0, img.width, img.height)
    x0, x1 = max(int(xs.min()) - pad, 0), min(int(xs.max()) + pad + 1, img.width)
    y0, y1 = max(int(ys.min()) - pad, 0), min(int(ys.max()) + pad + 1, img.height)
    return img.crop((x0, y0, x1, y1)), (x0, y0, x1, y1)


def main():
    in_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {}
    for p in sorted(in_dir.glob("*.png")):
        img = Image.open(p)
        keyed = key_background(img, fix_holes=p.stem in HOLE_FIX)
        trimmed, box = trim(keyed)
        if max(trimmed.size) > 640:
            s = 640 / max(trimmed.size)
            trimmed = trimmed.resize(
                (round(trimmed.width * s), round(trimmed.height * s)), Image.LANCZOS
            )
        name = p.stem
        trimmed.save(out_dir / f"{name}.png")
        meta[name] = {
            "src": p.name,
            "crop_box_in_src": box,
            "size": trimmed.size,
        }
        print(f"{name}: {img.size} -> trim {box} -> {trimmed.size}")
    (out_dir / "parts_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
