# 一次性：韩立青袍部件原图预处理
# 1) 抹右下角 AI 水印（灰色字 → 涂成品红幕布色，后续抠图统一吃掉）
# 2) 按文件名关键词重命名为导出脚本所需标准名（armfront+arm2 同源）
# 3) 备份赵子龙 parts_raw/ → parts_raw_zhaolong_backup/（仅首次）
# 4) 复制韩立标准名图覆盖 parts_raw/，供 export-dragonbones-parts.cjs 使用
import os, shutil
from PIL import Image

SRC = r"d:/zhao/xiuxian/public/art/skel/hanli/parts_raw_hanli"
RAW = r"d:/zhao/xiuxian/public/art/skel/hanli/parts_raw"
BAK = r"d:/zhao/xiuxian/public/art/skel/hanli/parts_raw_zhaolong_backup"

if not os.path.exists(BAK):
    shutil.copytree(RAW, BAK)
    print("backup parts_raw -> parts_raw_zhaolong_backup")

def match(name):
    # 关键词 → 导出脚本 JOBS 所需的原图文件名
    if "宽大衣" in name: return ["arm.png"]
    if "衣袖_" in name: return ["armfront.png", "arm2.png"]  # 握拳臂：旧分支 armfront + 新分支 arm2 同源
    if "袍摆下" in name: return ["skirt.png"]
    if "配套的青" in name: return ["legfront.png"]
    if "长矛" in name: return ["spear.png"]
    if "披风" in name: return ["cape.png"]
    if "修士韩立_身穿" in name or "躯干" in name: return ["core.png"]
    return None  # 已是标准名（幂等重跑直接跳过）

for fn in sorted(os.listdir(SRC)):
    if not fn.lower().endswith(".png"):
        continue
    outs = match(fn)
    if outs is None:
        continue
    img = Image.open(os.path.join(SRC, fn)).convert("RGB")
    w, h = img.size
    px = img.load()
    x0, y0 = int(w * 0.78), int(h * 0.94)
    n = 0
    for y in range(y0, h):
        for x in range(x0, w):
            r, g, b = px[x, y]
            sat = max(r, g, b) - min(r, g, b)
            if sat < 70 and max(r, g, b) > 60:  # 灰色系水印字（青袍 sat 高、品红幕 sat=255 均不受影响）
                px[x, y] = (255, 0, 255)
                n += 1
    for out in outs:
        img.save(os.path.join(SRC, out))
    os.remove(os.path.join(SRC, fn))
    print(f"{fn[:28]}... -> {outs} (watermark px={n})")

for fn in ["core.png", "skirt.png", "legfront.png", "armfront.png", "arm2.png", "arm.png", "spear.png", "cape.png"]:
    s = os.path.join(SRC, fn)
    if os.path.exists(s):
        shutil.copy2(s, os.path.join(RAW, fn))
        print("copied", fn)
print("done")
