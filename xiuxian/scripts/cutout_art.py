#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
透明底抠图：把带背景的 AI 立绘（云雾远山背景）转成透明 PNG，用于替换地图小人。

无 OpenCV 环境，采用「中心锚定区域生长」纯 numpy/PIL 方案：
  1. 用四边像素估计背景色（云雾多为浅灰 / 近白渐变）；
  2. 像素与背景色欧氏距离 < 阈值者判为背景；
  3. 以「中心区域 + 远离背景」的像素为种子，从种子出发只经「非强背景」像素做 4 连通生长，
     自然把相连的身体 / 浅色衣裙一并包进前景（背景云雾因颜色近背景被阻断）；
  4. 取含中心的最大连通域 → 形态学开运算去毛刺 + 填充内部孔洞 → 软边羽化；
  5. 裁到内容包围盒（留边）输出 512 高透明 PNG。

质量门禁（仅放行达标者；不达标不写文件，运行时回退程序化骨架）：
  四角透明、前景占比 12%~62%、高宽比 1.1~4.5、且非整图（说明真分出了主体）。

用法：
    python scripts/cutout_art.py            # 生成 public/art/cut/*.png
    python scripts/cutout_art.py --report  # 只输出质量报告，不写文件
"""
import argparse
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "public", "art")
OUT_DIR = os.path.join(SRC_DIR, "cut")

# 需要抠图的角色（与 public/art 下的源文件同名）
IDS = ["hanli", "nangongwan", "yinyue", "lifeiyu"]

WORK_W = 360          # 工作宽度（等比缩到该宽做分割，提速）
OUT_H = 512           # 输出高度
FEATHER = 1.6         # 软边羽化半径（px）
STRONG_BG = 34.0      # 与四边背景色欧氏距离 < 此值视为「强撞色背景」（0~441）

# GrabCut 矩形（归一化）：框住居中全身像，矩形外作为「硬背景」锚定背景 GMM
RECT = (0.10, 0.02, 0.90, 0.97)
GMM_K = 5
GRABCUT_ITERS = 6


class GMM:
    """对角协方差 GMM（EM 拟合，仅用于前景/背景似然打分）。"""
    def __init__(self, k: int = GMM_K):
        self.k = k

    def fit(self, X: np.ndarray) -> None:
        N = X.shape[0]
        X = X.astype(np.float64)
        rng = np.random.RandomState(7)
        centers = X[rng.choice(N, self.k, replace=False)]
        means = centers.copy()
        var = np.ones((self.k, 3)) * 400.0
        w = np.full(self.k, 1.0 / self.k)
        resp = np.full((N, self.k), 1.0 / self.k)
        for _ in range(10):
            Nk = resp.sum(0) + 1e-6
            w = (Nk / N)
            means = (resp.T @ X) / Nk[:, None]
            for j in range(self.k):
                d = X - means[j]
                var[j] = (resp[:, j] @ (d * d)) / Nk[j] + 1e-3
            logp = np.zeros((N, self.k))
            for j in range(self.k):
                d = X - means[j]
                logp[:, j] = -0.5 * np.sum(d * d / var[j], axis=1) - 0.5 * np.sum(np.log(var[j])) - 1.5 * np.log(2 * np.pi)
            logp += np.log(w + 1e-12)
            mx = logp.max(1, keepdims=True)
            resp = np.exp(logp - mx)
            resp /= resp.sum(1, keepdims=True) + 1e-12
        self.means = means
        self.var = var
        self.w = w

    def score(self, X: np.ndarray) -> np.ndarray:
        X = X.astype(np.float64)
        M = X.shape[0]
        logp = np.zeros((M, self.k))
        for j in range(self.k):
            d = X - self.means[j]
            logp[:, j] = -0.5 * np.sum(d * d / self.var[j], axis=1) - 0.5 * np.sum(np.log(self.var[j])) - 1.5 * np.log(2 * np.pi)
        logp += np.log(self.w + 1e-12)
        mx = logp.max(1, keepdims=True)
        return np.log(np.exp(logp - mx).sum(1) + 1e-12) + mx[:, 0]


def dilate(binmask: np.ndarray, it: int = 1) -> np.ndarray:
    m = binmask.astype(bool)
    for _ in range(it):
        pad = np.pad(m, 1, mode="constant")
        m = pad[1:-1, 1:-1] | pad[0:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, 0:-2] | pad[1:-1, 2:]
    return m


def erode(binmask: np.ndarray, it: int = 1) -> np.ndarray:
    m = binmask.astype(bool)
    for _ in range(it):
        pad = np.pad(m, 1, mode="constant")
        m = pad[1:-1, 1:-1] & pad[0:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, 0:-2] & pad[1:-1, 2:]
    return m


def fill_holes(binmask: np.ndarray) -> np.ndarray:
    h, w = binmask.shape
    outside = np.zeros_like(binmask, dtype=bool)
    q: deque = deque()
    for x in range(w):
        if not binmask[0, x]:
            outside[0, x] = True; q.append((0, x))
        if not binmask[h - 1, x]:
            outside[h - 1, x] = True; q.append((h - 1, x))
    for y in range(h):
        if not binmask[y, 0]:
            outside[y, 0] = True; q.append((y, 0))
        if not binmask[y, w - 1]:
            outside[y, w - 1] = True; q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx] and not binmask[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    return binmask | (~outside)


def largest_component(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    flat = mask.reshape(-1)
    seen = np.zeros(flat.shape, dtype=bool)
    best = np.zeros(flat.shape, dtype=bool)
    bestSize = 0
    idx = np.flatnonzero(flat)
    for s0 in idx:
        s = int(s0)
        if seen[s]:
            continue
        comp = []
        seen[s] = True
        q: deque = deque([s])
        while q:
            i = q.popleft()
            comp.append(i)
            y, x = divmod(i, w)
            for j in (i + w if y + 1 < h else -1, i - w if y > 0 else -1,
                      i + 1 if x + 1 < w else -1, i - 1 if x > 0 else -1):
                if j >= 0 and flat[j] and not seen[j]:
                    seen[j] = True
                    q.append(j)
        if len(comp) > bestSize:
            bestSize = len(comp)
            best = np.zeros(flat.shape, dtype=bool)
            best[comp] = True
    return best.reshape(h, w)


def segment(arr: np.ndarray):
    """迭代式 GMM 分割（类 GrabCut）：
       - 矩形外 = 硬背景，用于锚定背景 GMM（背景常含彩色山峦/天空，不能只靠颜色阈值）；
       - 中央竖向带内、且与四边背景色差异不过大的像素 = 硬前景，
         用以保住「浅色道袍 / 白衣」这类与背景撞色、会被 GMM 误判为背景的主体；
       - 其余像素由 GMM 似然迭代划分。
    返回前景布尔掩膜（已开运算 + 填洞 + 取最大连通域）。
    """
    h, w, _ = arr.shape
    rx0, ry0, rx1, ry1 = (int(RECT[0] * w), int(RECT[1] * h),
                           int(RECT[2] * w), int(RECT[3] * h))
    flat = arr.reshape(-1, 3).astype(np.float64)
    yy, xx = np.mgrid[0:h, 0:w]
    inRect = (xx >= rx0) & (xx <= rx1) & (yy >= ry0) & (yy <= ry1)

    # 四边背景色，用于判断「是否与背景撞色」
    bw = max(1, w // 20); bh = max(1, h // 20)
    border = np.concatenate([
        arr[0:bh, :, :].reshape(-1, 3), arr[-bh:, :, :].reshape(-1, 3),
        arr[:, 0:bw, :].reshape(-1, 3), arr[:, -bw:, :].reshape(-1, 3),
    ], axis=0).astype(np.float64)
    bg = np.median(border, axis=0)
    dEdge = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    isBgStrong = dEdge < STRONG_BG

    # 中央竖向带：保住撞色主体
    cx0, cx1 = int(0.30 * w), int(0.70 * w)
    cy0, cy1 = int(0.06 * h), int(0.96 * h)
    bandFg = (xx >= cx0) & (xx <= cx1) & (yy >= cy0) & (yy <= cy1) & (~isBgStrong)

    # 标签：0=背景 1=前景 2=硬背景(框外) 3=硬前景(中央带)
    lab = np.where(inRect, 1, 2)
    lab = np.where(bandFg, 3, lab)

    for _ in range(GRABCUT_ITERS):
        fgIdx = np.flatnonzero((lab == 1) | (lab == 3))
        bgIdx = np.flatnonzero((lab == 0) | (lab == 2))
        if fgIdx.size < 30 or bgIdx.size < 30:
            break
        fgGmm = GMM(); fgGmm.fit(flat[fgIdx])
        bgGmm = GMM(); bgGmm.fit(flat[bgIdx])
        sFg = fgGmm.score(flat)
        sBg = bgGmm.score(flat)
        soft = (sFg > sBg).reshape(h, w).astype(np.int8)
        # 硬约束：框外恒背景；中央带恒前景（除非强撞色已排除）
        lab = np.where(~inRect, 0, np.where(bandFg, 1, soft))

    fg = (lab == 1) | (lab == 3)
    fg = largest_component(fg)
    fg = erode(fg, 1)
    fg = dilate(fg, 1)
    fg = fill_holes(fg)
    return fg


def _ascii(mask: np.ndarray, cols: int = 56) -> None:
    """终端 ASCII 预览，便于无 GUI 复核分割形状（# 前景 / 空格 背景）。"""
    h, w = mask.shape
    rows = max(1, int(round(cols * h / float(w) * 0.5)))
    out = []
    for r in range(rows):
        y = int(r / rows * h)
        line = ""
        for c in range(cols):
            x = int(c / cols * w)
            line += "#" if mask[y, x] else " "
        out.append(line.rstrip())
    print("\n".join(out))


def cutout(name: str, report_only: bool):
    src = os.path.join(SRC_DIR, name + ".png")
    im = Image.open(src).convert("RGB")
    W, H = im.size
    scale = WORK_W / float(W)
    iw, ih = WORK_W, max(1, int(round(H * scale)))
    small = im.resize((iw, ih), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float32)

    fg = segment(arr)
    ys, xs = np.nonzero(fg)
    if ys.size == 0:
        print(f"[NG] {name}: 未分出主体（前景为空）")
        return False
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw = max(1, x1 - x0 + 1)
    bh = max(1, y1 - y0 + 1)
    # 质量指标
    corners = [fg[2, 2], fg[2, iw - 3], fg[ih - 3, 2], fg[ih - 3, iw - 3]]
    cornerTrans = sum(1 for c in corners if not c) / 4
    fgRatio = float(fg.sum()) / float(fg.size)
    aspect = bh / float(bw)
    full = (x0 <= 1 and y0 <= 1 and x1 >= iw - 2 and y1 >= ih - 2)

    ok = (cornerTrans >= 0.75 and 0.12 <= fgRatio <= 0.62 and 0.55 <= aspect <= 4.5 and not full)
    # 用原图分辨率裁切（更清晰）：把工作图 bbox 映射回原图
    sx0 = int(x0 / iw * W); sy0 = int(y0 / ih * H)
    sx1 = int(x1 / iw * W); sy1 = int(y1 / ih * H)
    m = 0.04
    padX = int((sx1 - sx0) * m); padY = int((sy1 - sy0) * m)
    sx0 = max(0, sx0 - padX); sy0 = max(0, sy0 - padY)
    sx1 = min(W, sx1 + padX); sy1 = min(H, sy1 + padY)
    crop = im.crop((sx0, sy0, sx1, sy1))
    targetW = max(1, int(round(OUT_H * (sx1 - sx0) / float(sy1 - sy0))))
    crop = crop.resize((targetW, OUT_H), Image.LANCZOS)
    cw, ch = crop.size

    if report_only:
        print(f"[REPORT] {name}: fg={fgRatio:.1%} aspect={aspect:.2f} corners={cornerTrans:.0%} bbox=({x0},{y0})-({x1},{y1}) -> {'OK' if ok else 'NG'}")
        _ascii(fg)
        return ok

    if not ok:
        print(f"[NG] {name}: 质量不达标（fg={fgRatio:.1%} aspect={aspect:.2f} corners={cornerTrans:.0%} full={full}），保留程序化骨架")
        return False

    # 羽化 alpha：用前景做软边
    amask = (fg[y0:y1 + 1, x0:x1 + 1].astype(np.uint8)) * 255
    amask = np.pad(amask, ((sy0, H - sy1), (sx0, W - sx1)), mode="constant")
    amask = Image.fromarray(amask, mode="L").resize((cw, ch), Image.NEAREST)
    amask = amask.filter(ImageFilter.GaussianBlur(FEATHER))
    out = crop.convert("RGBA")
    out.putalpha(amask)
    os.makedirs(OUT_DIR, exist_ok=True)
    out.save(os.path.join(OUT_DIR, name + ".png"), "PNG", optimize=True)
    print(f"[OK] {name}: fg={fgRatio:.1%} aspect={aspect:.2f} -> public/art/cut/{name}.png")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="只输出质量报告，不写文件")
    args = ap.parse_args()
    ok = True
    for name in IDS:
        ok = cutout(name, args.report) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
