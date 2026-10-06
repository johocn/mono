# -*- coding: utf-8 -*-
"""大富翁·悟空 Spine 骨骼构建 v4 —— 居中锚定重构版
原则（用户 2026-10 定稿）：
1) 全部中文标注部件（parts/*.png 按用户命名直接映射语义名）
2) 零偏移：所有附件图心=骨心（x=0,y=0），组合关系由骨布局自然形成
3) 左右臂是独立图（非镜像），挂各自骨不再 scaleX=-1
4) 骨布局由部件实际尺寸按比例自动计算（构建时量图），无手调像素
输出: out/wukong.json + out/wukong.png + out/wukong.atlas
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
PARTS = ROOT / "parts"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

SCALE = 0.42          # 图素 → 骨架单位
PAGE = 2048           # 图集页尺寸
OVERLAP = 0.12        # 相邻部件纵向重叠比例（组合自然衔接）

# ---------------- 部件选型（中文标注文件名 → 语义名） ----------------
PICK = {
    # 头部组
    "孙悟空毛发重头部": "head",
    "孙悟空大笑头部": "head_laugh",
    "孙悟空委屈头部": "head_sad",
    "孙悟空嬉笑头部": "head_grin",
    "孙悟空恨咬牙头部": "head_grit",
    "孙悟空目瞪口呆头部": "head_shock",
    "孙悟空颈部衔接件": "neck_part",
    # 金箍组
    "孙悟空金箍": "headband",
    "孙悟空金箍头发": "headband_hair",
    "孙悟空生成金箍动画": "headband_anim",
    # 躯干/裙
    "孙悟空衣服没有手臂": "torso",
    "孙悟空衣服没有手部": "torso_hands",
    "孙悟空衣服穗子": "tassel",
    "孙悟空虎皮裙绿色腰带": "skirt",   # 用户统一指定：所有裙均用此图
    # 臂组（用户命名权威版：画面左=右手图、画面右=左手图，镜像约定）
    "孙悟空右手下垂": "arm_l_down",
    "孙悟空右手高举": "arm_l_raise",
    "孙悟空右手高举抛": "arm_l_toss",
    "孙悟空左手下垂": "arm_r_down",
    "孙悟空左手高举": "arm_r_raise",
    "孙悟空左手高举抛": "arm_r_toss",
    # 腿组（双腿整图）
    "孙悟空足部向前走1": "legs_walk1",
    "孙悟空足部向前走2": "legs_walk2",
    "孙悟空足部向右走": "legs_right",
    "孙悟空足部向左踮脚": "legs_tiptoe_l",
    # 棒组
    "孙悟空金箍棒全图15度角": "staff_15",
    "孙悟空金箍棒全图30度角": "staff_30",
    "孙悟空金箍棒全图45度角": "staff_45",
    "孙悟空金箍棒特写": "staff_close",
    # 骰子/特效
    "骰子": "dice",
    "孙悟空后手抛骰子": "dice_throw_back",
    "孙悟空向右抛出骰子": "dice_throw_right",
    "孙悟空足部金箍火花": "spark",
    # 特写手（右手手部/拳头仅此部位，适合特写放大）
    "孙悟空右手手部": "hand_close",
    "孙悟空右手拳头": "fist_close",
}
# 特写件（手部/拳头特写构图，同 SCALE 会偏大）
SIZE_SCALE = {"hand_close": 0.5, "fist_close": 0.5, "staff_close": 0.6,
              "dice": 0.42, "spark": 0.7, "headband_anim": 0.9, "tassel": 0.6,
              "skirt": 0.92}  # 裙身紧贴腰身（用户校准）

SEM_OF = {v: k for k, v in PICK.items()}   # 语义名 → 文件 stem


def img_size(sem):
    return Image.open(PARTS / f"{SEM_OF[sem]}.png").size


# ---------------- 1. Atlas 打包 ----------------
def pack_atlas():
    names = list(PICK.values())
    regions = []
    for name in names:
        img = Image.open(PARTS / f"{SEM_OF[name]}.png").convert("RGBA")
        img = img.resize(
            (max(1, round(img.width * SCALE)), max(1, round(img.height * SCALE))),
            Image.LANCZOS,
        )
        regions.append((name, img))
    regions.sort(key=lambda r: -max(r[1].size))

    page = Image.new("RGBA", (PAGE, PAGE), (0, 0, 0, 0))
    rects = {}
    x = y = row_h = 0
    PAD = 2
    for name, img in regions:
        w, h = img.size
        if x + w + PAD > PAGE:
            x = 0
            y += row_h + PAD
            row_h = 0
        if y + h > PAGE:
            raise SystemExit(f"图集溢出 {PAGE}：放不下 {name}，请减小 SCALE")
        page.paste(img, (x, y))
        rects[name] = (x, y, w, h)
        x += w + PAD
        row_h = max(row_h, h)
    page.save(OUT / "wukong.png")

    lines = ["wukong.png", f"size: {PAGE},{PAGE}", "format: RGBA8888",
             "filter: Linear,Linear", "repeat: none"]
    for name, (rx, ry, rw, rh) in rects.items():
        lines += [name, f"  bounds: {rx}, {ry}, {rw}, {rh}"]
    (OUT / "wukong.atlas").write_text("\n".join(lines), encoding="utf-8")
    return rects


# ---------------- 2. 骨架（布局由尺寸自动计算） ----------------
def make_attachment(sem, bone_extra=(0, 0)):
    """零偏移居中：图心=骨心（bone_extra 供特殊件微移，默认 0）"""
    w, h = img_size(sem)
    s = SIZE_SCALE.get(sem, 1)
    return {"x": bone_extra[0], "y": bone_extra[1],
            "width": round(w * SCALE * s, 2), "height": round(h * SCALE * s, 2)}


def build_skeleton():
    # 量取关键部件尺寸（骨架单位）
    D = {sem: (w * SCALE, h * SCALE) for sem, (w, h) in
         ((s, img_size(s)) for s in PICK.values())}
    leg_h = D["legs_walk1"][1]
    torso_h = D["torso"][1]
    torso_w = D["torso"][0]
    neck_h = D["neck_part"][1]
    head_h = D["head"][1]
    band_h = D["headband"][1]
    arm_h = D["arm_l_down"][1]
    skirt_h = D["skirt"][1]

    # 骨布局：部件图心=骨心，骨位=链式几何（比例参数在此集中可调）
    hips_y = round(leg_h * 0.5)                                  # 腿图心=骨心 → 腿底≈地面
    spine_y = round((leg_h + torso_h) / 2 - leg_h * OVERLAP)     # 躯干底与腿顶重叠
    neck_y = round(torso_h / 2 + neck_h / 2 - neck_h * OVERLAP - 100)  # 颈以上整体下移 100（用户校准）
    head_y = round(neck_h / 2 + head_h / 2 - head_h * OVERLAP * 1.5)  # 头底压颈顶
    band_y = round(head_h / 2 - band_h * 0.55)                   # 金箍图心在头上沿
    arm_w = D["arm_l_raise"][0]
    arm_y = round(torso_h * 0.26)
    arm_x = round(arm_w * 0.45)                                  # 臂骨内移贴躯干（用户校准：尽量对齐衣服）
    hand_y = round(arm_h * 0.62)                                 # 手随臂骨（槽内切换时臂图自带手，此骨备用）
    skirt_y = round(leg_h * 0.12 + 80 + 10 + 15)                 # 裙上移 105（用户校准：100再上移5）
    # 裙宽贴合腰身：目标宽 = 躯干宽×1.05（动态覆盖 SIZE_SCALE，用户校准「裙与腰部大小对齐」）
    SIZE_SCALE["skirt"] = round(torso_w * 1.05 / D["skirt"][0], 3)
    # 足部缩小至能被裙覆盖：腿宽 = 裙宽×0.9（动态）
    leg_fit = round(D["skirt"][0] * SIZE_SCALE["skirt"] * 0.9 / D["legs_walk1"][0], 3)
    for k in ("legs_walk1", "legs_walk2", "legs_right", "legs_tiptoe_l"):
        SIZE_SCALE[k] = leg_fit

    BONES = [
        ("root",     None,     0, 0, {}),
        ("hips",     "root",   0, hips_y, {}),
        ("legs",     "hips",   0, 10, {}),                      # 腿随裙以下部位上移 10（用户校准）
        ("skirt_b",  "hips",   0, skirt_y, {}),
        ("spine",    "hips",   0, spine_y, {}),
        ("neck_b",   "spine",  0, neck_y, {}),
        ("chest",    "spine",  0, round(spine_y * 0.45), {}),
        ("head",     "neck_b", 0, head_y, {}),
        ("band_b",   "head",   0, band_y, {}),
        ("arm_l",    "chest", -arm_x, arm_y, {}),
        ("arm_r",    "chest",  arm_x, arm_y, {}),
        ("hand_l",   "arm_l",  0, -hand_y, {}),
        ("hand_r",   "arm_r",  0, -hand_y, {}),
        ("weapon",   "chest",  round(arm_x * 1.15), round(arm_y - arm_h * 0.35), {}),
        ("prop",     "chest", -round(arm_x * 1.1), round(arm_y + arm_h * 0.30), {}),
        ("fx",       "root",   0, round(hips_y + spine_y + torso_h * 0.4), {}),
        ("closeup",  "root",   round(torso_w * 1.4), round(hips_y + spine_y * 1.6), {}),
    ]

    # slot: (name, bone, [附件语义名], default)
    SLOTS = [
        # 绘制顺序=数组顺序（后者在上层）：腿→臂在衣服下→躯干→裙/穗→颈→头→手/棒/骰/特效最上
        ("legs",     "legs",    ["legs_walk1", "legs_walk2", "legs_right",
                                 "legs_tiptoe_l"], "legs_walk1"),
        ("arm_l",    "arm_l",   ["arm_l_down", "arm_l_raise", "arm_l_toss"], "arm_l_down"),
        ("arm_r",    "arm_r",   ["arm_r_down", "arm_r_raise", "arm_r_toss"], "arm_r_down"),
        ("torso",    "spine",   ["torso", "torso_hands"], "torso"),
        ("skirt",    "skirt_b", ["skirt"], "skirt"),
        ("tassel",   "skirt_b", ["tassel"], "tassel"),
        ("neck",     "neck_b",  ["neck_part"], "neck_part"),
        ("head",     "head",    ["head", "head_laugh", "head_sad", "head_grin",
                                 "head_grit", "head_shock"], "head"),
        ("headband", "band_b",  ["headband", "headband_hair", "headband_anim"], "headband"),
        ("hand_l",   "hand_l",  ["hand_close"], None),
        ("hand_r",   "hand_r",  ["fist_close"], None),
        ("weapon",   "weapon",  ["staff_15", "staff_30", "staff_45", "staff_close"], None),
        ("prop",     "prop",    ["dice"], None),
        ("fx",       "fx",      ["spark", "dice_throw_right", "dice_throw_back"], None),
    ]

    bones = []
    for name, parent, x, y, extra in BONES:
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if x or y:
            b["x"], b["y"] = x, y
        b.update(extra)
        bones.append(b)

    slots, skin = [], {}
    for slot_name, bone, atts, default in SLOTS:
        slots.append({"name": slot_name, "bone": bone, "attachment": default})
        entries = {}
        for sem in atts:
            a = make_attachment(sem)
            entries[sem] = a
        skin[slot_name] = entries
    return {
        "skeleton": {"spine": "4.2.24", "hash": "zhao-wukong-4", "x": -400, "y": -100,
                     "width": 800, "height": 800, "images": "./parts/"},
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": skin}],
    }


# ---------------- 3. 动画 ----------------
def build_animations():
    anims = {}

    def att(anim, slot, frames):
        anims.setdefault(anim, {"slots": {}})["slots"].setdefault(slot, {
            "attachment": [{"time": t, "name": n} for t, n in frames]})

    def rot(anim, bone, frames):
        a = anims.setdefault(anim, {})
        a.setdefault("bones", {}).setdefault(bone, {})["rotate"] = \
            [{"time": t, "value": a_} for t, a_ in frames]   # Spine 4.2: rotate 帧用 value

    def tra(anim, bone, frames):
        a = anims.setdefault(anim, {})
        a.setdefault("bones", {}).setdefault(bone, {})["translate"] = \
            [{"time": t, "x": x, "y": y} for t, x, y in frames]

    # —— idle_calm：右叉腰 + 左垂臂 + 呼吸微摆 ——
    T = 2.4
    att("idle_calm", "arm_l", [(0, "arm_l_down")])   # 新批无叉腰图：双臂自然垂
    rot("idle_calm", "chest", [(0, 0), (T / 2, 1.5), (T, 0)])
    tra("idle_calm", "chest", [(0, 0, 0), (T / 2, 0, 4), (T, 0, 0)])
    rot("idle_calm", "head", [(0, 0), (T / 2, 2), (T, 0)])

    # —— idle_happy：双臂振拳（臂图自带举姿）+ 正面踮脚蹦跳 + 大笑头 ——
    T = 1.2
    att("idle_happy", "arm_r", [(0, "arm_r_raise")])
    att("idle_happy", "arm_l", [(0, "arm_l_raise")])
    att("idle_happy", "head", [(0, "head_laugh")])
    tra("idle_happy", "head", [(0, 0, -12), (T, 0, -12)])  # 头整体下移 12（用户校准：7再下移5）
    att("idle_happy", "headband", [(0, "headband_hair")])  # 金箍头发一体件：补头发，头发层在金箍上
    att("idle_happy", "legs", [(0, "legs_tiptoe_l"), (T / 2, "legs_walk1"), (T, "legs_tiptoe_l")])
    tra("idle_happy", "hips", [(0, 0, 0), (T / 4, 0, 18), (T / 2, 0, 0),
                               (3 * T / 4, 0, 18), (T, 0, 0)])
    rot("idle_happy", "arm_r", [(0, 0), (T / 4, 8), (T / 2, 0), (3 * T / 4, 8), (T, 0)])
    rot("idle_happy", "arm_l", [(0, 8), (T / 4, 0), (T / 2, 8), (3 * T / 4, 0), (T, 8)])

    # —— idle_sad：委屈头 + 双垂臂 + 低头塌胸 ——
    T = 3.0
    att("idle_sad", "head", [(0, "head_sad")])
    att("idle_sad", "headband", [(0, "headband_hair")])  # 金箍头发一体件：补头发
    att("idle_sad", "arm_r", [(0, "arm_r_down")])
    att("idle_sad", "arm_l", [(0, "arm_l_down")])
    rot("idle_sad", "head", [(0, 0), (T / 3, 4), (T, 4)])
    rot("idle_sad", "chest", [(0, 0), (T / 3, 2), (T, 2)])
    tra("idle_sad", "chest", [(0, 0, 0), (T / 3, 0, -5), (T, 0, -5)])

    # —— walk：正面腿 1/2 交替 + 左右摆裙 + 双臂张开反相摆 ——
    T = 1.0
    att("walk", "legs", [(0, "legs_walk1"), (T / 2, "legs_walk2"), (T, "legs_walk1")])
    # 裙统一单图后无摆动切帧（用户指定所有裙用同一张）
    att("walk", "arm_r", [(0, "arm_r_down")])
    att("walk", "arm_l", [(0, "arm_l_down")])
    rot("walk", "arm_r", [(0, -6), (T / 2, 6), (T, -6)])   # 反向小摆：手端朝下划弧，防翘到脸边
    rot("walk", "arm_l", [(0, 6), (T / 2, -6), (T, 6)])
    tra("walk", "hips", [(0, 0, 0), (T / 4, 0, 8), (T / 2, 0, 0),
                         (3 * T / 4, 0, 8), (T, 0, 0)])
    rot("walk", "chest", [(0, 0), (T / 2, 1.5), (T, 0)])

    # —— spin：棒 15/30/45 度帧切换 + 骨旋转 = 耍棒透视效果 ——
    T = 1.5
    att("spin", "weapon", [(0, "staff_30"), (0.18, "staff_15"), (0.42, "staff_45"),
                           (0.66, "staff_30"), (0.9, "staff_15"), (T, "staff_30")])
    att("spin", "arm_r", [(0, "arm_r_down")])   # 新批无握棒手型：垂臂+棒独立旋转
    att("spin", "arm_l", [(0, "arm_l_down")])
    rot("spin", "weapon", [(0, 0), (0.18, 90), (0.42, 200), (0.66, 320),
                           (0.9, 420), (1.2, 640), (T, 720)])
    rot("spin", "arm_r", [(0, 0), (0.42, -12), (0.9, 10), (T, 0)])
    rot("spin", "head", [(0, 0), (0.42, 4), (T, 0)])
    tra("spin", "chest", [(0, 0, 0), (0.42, 0, 3), (T, 0, 0)])

    # —— throw_dice：左臂托骰举起 → 掷出（骰上抛弧线+火花）→ 收回 ——
    T = 2.2
    att("throw_dice", "arm_l", [(0, "arm_l_toss"), (1.5, "arm_l_toss"), (1.8, "arm_l_down")])
    att("throw_dice", "arm_r", [(0, "arm_r_down")])
    att("throw_dice", "prop", [(0, "dice"), (1.25, "dice"), (1.26, None)])
    att("throw_dice", "fx", [(1.25, "spark"), (1.55, None)])
    tra("throw_dice", "prop", [(0, 0, 0), (1.1, 0, 10), (1.3, 60, 150),
                               (1.5, 40, 40), (1.7, 20, -60)])
    rot("throw_dice", "arm_l", [(0, 0), (1.1, -20), (1.25, -55), (1.5, -10), (1.8, 0)])
    tra("throw_dice", "chest", [(0, 0, 0), (1.1, 0, 4), (1.3, 0, -4), (T, 0, 0)])
    rot("throw_dice", "head", [(0, 0), (1.1, -6), (1.3, 8), (T, 0)])

    return anims


def main():
    pack_atlas()
    skel = build_skeleton()
    skel["animations"] = build_animations()
    (OUT / "wukong.json").write_text(
        json.dumps(skel, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = len(PICK)
    print(f"v4 构建 OK：{n} 部件 → out/wukong.(json|png|atlas)")


if __name__ == "__main__":
    main()
