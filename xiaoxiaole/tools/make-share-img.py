# 生成微信分享缩略图 share.png（300x300，粉色调花朵图案，与游戏主视觉一致）
from PIL import Image, ImageDraw

SIZE = 300
img = Image.new("RGB", (SIZE, SIZE), "#ffc9de")
d = ImageDraw.Draw(img)

# 背景对角渐变感：叠一层半透明浅色三角
overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
od.polygon([(0, SIZE), (SIZE, SIZE), (SIZE, 0)], fill=(255, 128, 168, 120))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
d = ImageDraw.Draw(img)

# 中心花朵：8 花瓣 + 圆心
cx, cy = SIZE // 2, SIZE // 2 - 10
pr = 46  # 花瓣半径
for i in range(8):
    import math
    a = math.pi * 2 * i / 8
    px, py = cx + math.cos(a) * pr, cy + math.sin(a) * pr
    d.ellipse([px - 30, py - 30, px + 30, py + 30], fill="#ff80a8", outline="#8b1a3a", width=3)
d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill="#ffd54f", outline="#8b1a3a", width=3)

# 底部衬底圆角条 + 「XXL」字样（避免中文字体依赖）
d.rounded_rectangle([60, 232, 240, 276], radius=22, fill="#8b1a3a")
d.text((150, 254), "XXL", fill="#ffffff", anchor="mm")

img.save(r"d:\zhao\xiaoxiaole\bin\share.png", optimize=True)
print("saved", img.size)
