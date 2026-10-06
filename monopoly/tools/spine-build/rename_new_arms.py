# -*- coding: utf-8 -*-
"""新臂批次按语义重命名 + (7) 水平翻转补左手垂臂。处理完后清理数字名中间件。"""
import shutil
from pathlib import Path

from PIL import Image

PARTS = Path(__file__).parent / "parts"
STEM = "生成骨架动画与游戏人物设计开发"
# 子代理看图定名 → 语义文件名；(7) 翻转为左臂
MAP = {
    f"{STEM} (1)": "孙悟空右手臂手掌张开",
    f"{STEM} (2)": "孙悟空右手臂手心朝上可以抛东西",
    f"{STEM} (3)": "孙悟空右手臂向下",
    f"{STEM} (4)": "孙悟空右手臂手掌并拢斜推掌",
    f"{STEM} (5)": "孙悟空左手臂手掌并拢斜推掌",
    f"{STEM} (6)": "孙悟空左手臂手部张开",
    f"{STEM} (7)": "孙悟空左手臂向下",           # 原右臂垂下 → 水平翻转当左臂
    f"{STEM} (8)": "孙悟空右手臂手掌张开竖掌",
}
for src, dst in MAP.items():
    p = PARTS / f"{src}.png"
    if not p.exists():
        print(f"缺 {src}")
        continue
    img = Image.open(p).convert("RGBA")
    if src.endswith("(7)"):
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    img.save(PARTS / f"{dst}.png")
    p.unlink()  # 删数字名中间件
    print(f"{src} -> {dst}")
