# -*- coding: utf-8 -*-
"""角色立绘抠图通用管线（品红幕基底）。

解决 AI 生图的两类顽疾：
  1) 描边/品红混合像素残留呈"黑色虚线" —— 品红软键控 + 最大连通域清理 + 硬边腐蚀 + 边缘去品红染
  2) GPU 大比例缩放发虚 —— 离线 Lanczos 预缩 + 锐化
人物内天然无品红特征（肤色/棕杆/青袍 mag=min(R,B)-G<0），故键控阈值可极紧，不会误伤。

用法（从项目根运行）：
  python scripts/fix-hanli-edge.py                 # 默认韩立（向后兼容）
  python scripts/fix-hanli-edge.py <role>          # 处理 public/art/<role>-robe-full.png -> cut/<role>-robe.png
  python scripts/fix-hanli-edge.py --all           # 批量处理所有 public/art/*-robe-full.png
  python scripts/fix-hanli-edge.py [输入] [输出]     # 显式路径（旧兼容）
新增角色零成本：以品红幕 #FF00FF 生成全身立绘 -> 复制为 public/art/<role>-robe-full.png -> 一条命令产出 cut。
"""
import sys
import os
import glob
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

TARGET_H = 760  # 预缩目标高（显示 ~285-570 物理 px，留余量让 GPU 只做轻度缩放）


def cutout(src, dst):
    im = Image.open(src).convert("RGBA")
    a = np.array(im).astype(np.float32)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]

    # 1) 品红软键控：品红度 = min(R,B) - G
    mag = np.minimum(R, B) - G
    soft = np.clip((mag - 4) / 10.0, 0, 1)
    alpha = A * (1.0 - soft)
    alpha[mag > 14] = 0.0  # 品红成分像素硬删（发丝间幕布穿透的关键）

    # 1.5) 最大连通域保留：清品红幕噪点云与"AI生成"水印残字
    lab, n = ndimage.label(alpha > 10)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab, dtype=np.float32), lab, range(1, n + 1))
        keep = 1 + int(np.argmax(sizes))
        alpha[lab != keep] = 0.0
        print(f"  largestOnly: {n} 个连通域 -> 保留 #{keep}（{int(sizes.max())} px）")

    # 2) 硬边腐蚀 2px：紧邻透明区的 2px 全部切掉（去半透暗边）
    solid = alpha > 110

    def erode(m):
        out = m.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            out &= np.roll(np.roll(m, dy, 0), dx, 1)
        return out

    edge1 = solid & ~erode(solid)
    edge2 = edge1 | (solid & ~erode(solid & ~edge1))
    alpha[edge2] = 0.0
    solid = alpha > 110

    # 3) 边缘 4px 带内去品红染：残余品红混合像素把 R/B 向 G 拉近（消暗粉虚线）
    near = solid.copy()
    for _ in range(4):
        grown = near.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            grown |= np.roll(np.roll(near, dy, 0), dx, 1)
        near = grown
    t = np.clip((mag - 12) / 45.0, 0, 1) * near
    a[..., 0] = R - t * (R - G) * 0.9
    a[..., 2] = B - t * (B - G) * 0.9
    a[..., 3] = alpha

    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")

    # 4) 裁内容包围盒
    bbox = out.getbbox()
    out = out.crop(bbox)

    # 5) 预缩小(Lanczos) + 轻锐化
    w, h = out.size
    nw = round(w * TARGET_H / h)
    out = out.resize((nw, TARGET_H), Image.LANCZOS)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=90, threshold=2))

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    print(f"OK {src} -> {dst}  {im.size} -> {out.size}")


def main():
    args = sys.argv[1:]
    if not args:  # 向后兼容：默认韩立
        cutout("public/art/hanli-robe-full.png", "public/art/cut/hanli-robe.png")
        return
    if args[0] == "--all":
        srcs = sorted(glob.glob("public/art/*-robe-full.png"))
        if not srcs:
            print("未找到任何 public/art/*-robe-full.png（请先用品红幕生成角色全身立绘）")
            return
        for src in srcs:
            role = os.path.basename(src).split("-robe-full")[0]
            cutout(src, f"public/art/cut/{role}-robe.png")
        return
    if len(args) >= 2 and os.path.isfile(args[0]):  # 显式路径兼容
        cutout(args[0], args[1])
        return
    role = args[0]  # 角色名模式
    src = f"public/art/{role}-robe-full.png"
    dst = f"public/art/cut/{role}-robe.png"
    if not os.path.isfile(src):
        print(f"未找到 {src}（请先以品红幕 #FF00FF 生成 {role} 全身立绘并复制到此路径）")
        sys.exit(1)
    cutout(src, dst)


if __name__ == "__main__":
    main()
