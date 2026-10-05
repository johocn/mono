# -*- coding: utf-8 -*-
"""从 wukong.atlas 提取各 region 坐标，裁出 leg/skirt/torso 区域供核对。"""
import re
from pathlib import Path
from PIL import Image

atlas_text = Path("out/wukong.atlas").read_text(encoding="utf-8")
img = Image.open("out/wukong.png")
print("atlas page size:", img.size)

# spine atlas 文本: region 名下跟 x,y,width,height(4.1 无 rotate 时)
lines = [l.strip() for l in atlas_text.splitlines()]
regions = {}
i = 0
while i < len(lines):
    name = lines[i]
    kv = {}
    j = i + 1
    while j < len(lines) and ":" in lines[j]:
        k, v = lines[j].split(":", 1)
        kv[k.strip()] = v.strip()
        j += 1
    if kv and ("x" in kv or "bounds" in kv):
        regions[name] = kv
        i = j
    else:
        i += 1

print("regions:", len(regions))
for name in ("leg", "skirt", "torso", "staff", "hand_fist", "tassel", "head", "headband", "arm", "dice", "burst"):
    kv = regions.get(name)
    if not kv:
        print(name, "-> NOT FOUND")
        continue
    if "bounds" in kv:  # 4.2 atlas 格式
        x, y, w, h = map(int, kv["bounds"].split(","))
    else:
        x, y = int(kv["x"]), int(kv["y"])
        w, h = int(kv["width"]), int(kv["height"])
    crop = img.crop((x, y, x + w, y + h))
    out = f"atlas_check_{name}.png"
    crop.save(out)
    print(f"{name}: xywh=({x},{y},{w},{h}) rotate={kv.get('rotate','none')} -> {out}")
