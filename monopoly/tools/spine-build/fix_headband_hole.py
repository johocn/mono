# -*- coding: utf-8 -*-
"""金箍内芯透明化：金箍图中央白色椭圆实心 → 透明。
内芯=不接触图像边缘的浅色连通域（金环包围），复用 process_parts 内洞逻辑。
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

PARTS = Path(__file__).parent / "parts"
TARGETS = ["孙悟空金箍", "孙悟空金箍头发", "孙悟空生成金箍动画"]


def clear_inner_hole(path):
    img = Image.open(path).convert("RGBA")
    arr = np.asarray(img).copy()
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]
    h, w, _ = rgb.shape
    mx = rgb.max(axis=2).astype(np.float32)
    mn = rgb.min(axis=2).astype(np.float32)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    # 候选：已被上一轮抠透明(alpha=0)的也算，内芯=仍不透明的浅色区
    cand = ((mn >= 255 * 0.72) & (sat <= 0.30)) | (alpha == 0)
    # 找不接触边缘的 cand 连通域（8 邻接 BFS）
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    ys0, xs0 = np.where(cand & (alpha > 0))  # 只需遍历仍不透明的候选
    cleared = 0
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
                if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = cur
                    q.append((ny, nx))
                    pix.append((ny, nx))
        ys = [p[0] for p in pix]; xs = [p[1] for p in pix]
        touches = min(ys) == 0 or min(xs) == 0 or max(ys) == h-1 or max(xs) == w-1
        if not touches and len(pix) > 300:  # 大面积内芯才清，保住金环上的高光小点
            arr[ys, xs, 3] = 0
            cleared += len(pix)
    Image.fromarray(arr, "RGBA").save(path)
    print(f"{path.name}: 内芯清除 {cleared} px")


for name in TARGETS:
    p = PARTS / f"{name}.png"
    if p.exists():
        clear_inner_hole(p)
