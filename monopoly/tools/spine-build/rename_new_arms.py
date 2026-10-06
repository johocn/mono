# -*- coding: utf-8 -*-
"""臂图命名统一（以用户手工命名为权威）：
我的处理图 → 用户命名；缺左手高举抛 → 翻转右手高举抛补齐。
"""
from pathlib import Path

from PIL import Image

PARTS = Path(__file__).parent / "parts"
REN = {
    "孙悟空右手臂向下": "孙悟空右手下垂",
    "孙悟空左手臂向下": "孙悟空左手下垂",
    "孙悟空右手臂手掌张开竖掌": "孙悟空右手高举",
    "孙悟空左手臂手部张开": "孙悟空左手高举",
    "孙悟空右手臂手心朝上可以抛东西": "孙悟空右手高举抛",
}
for src, dst in REN.items():
    p = PARTS / f"{src}.png"
    t = PARTS / f"{dst}.png"
    if t.exists():
        t.unlink()   # 用户放入的未处理同名原图：以处理版替换
        print(f"替换未处理原件 {dst}")
    if p.exists():
        p.rename(t)
        print(f"{src} -> {dst}")
    else:
        print(f"缺 {src}")

# 左手高举抛：翻转右手高举抛
src = PARTS / "孙悟空右手高举抛.png"
dst = PARTS / "孙悟空左手高举抛.png"
if src.exists() and not dst.exists():
    t.unlink() if dst.exists() else None
    Image.open(src).convert("RGBA").transpose(Image.FLIP_LEFT_RIGHT).save(dst)
    print("翻转生成 孙悟空左手高举抛")

# 清理：我的批次中未对上用户命名的余图（推掌×2、手掌张开）
for extra in ("孙悟空右手臂手掌并拢斜推掌", "孙悟空左手臂手掌并拢斜推掌",
              "孙悟空右手臂手掌张开"):
    p = PARTS / f"{extra}.png"
    if p.exists():
        p.unlink()
        print(f"删除余图 {extra}")
