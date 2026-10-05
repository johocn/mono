# -*- coding: utf-8 -*-
"""大富翁·悟空 Spine 骨骼一键构建 v2
1) 部件语义化选型 → shelf 打包 2048 atlas + Spine .atlas 坐标
2) Spine 4.1 JSON 骨架：镜像用骨骼 scaleX=-1（贴图零翻转）
3) 动画时间轴格式: rotate={time,angle} translate/scale={time,x,y} attachment={time,name}
输出: out/wukong.json + out/wukong.png + out/wukong.atlas
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
PARTS = ROOT / "parts"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

# ---------------- 部件选型（联络表编号 → 语义名） ----------------
PICK = {
    "生成骨架动画与游戏人物设计开发": "head",        # 完整猴头（含笑）
    "生成骨架动画与游戏人物设计开发 (1)_clean": "headband",  # 金箍（色键去白底，见 clean_headband.py）
    "生成骨架动画与游戏人物设计开发 (3)": "torso",     # 红黄短打+深蓝披带
    "生成骨架动画与游戏人物设计开发 (5)": "skirt",     # 虎皮裙·深蓝腰带
    "生成骨架动画与游戏人物设计开发 (6)": "arm",       # 黄袖弯臂
    "生成骨架动画与游戏人物设计开发 (14)": "hand_fist",
    "生成骨架动画与游戏人物设计开发 (13)": "hand_open",
    "生成骨架动画与游戏人物设计开发 (15)": "hand_grip",
    "生成骨架动画与游戏人物设计开发 (16)": "hand_dice",
    "生成骨架动画与游戏人物设计开发 (8)": "leg",       # 猴毛腿·直
    "生成骨架动画与游戏人物设计开发 (10)": "staff",    # 金箍棒
    "生成骨架动画与游戏人物设计开发 (34)": "dice",
    "生成骨架动画与游戏人物设计开发 (36)": "dice_swish",
    "生成骨架动画与游戏人物设计开发 (35)": "burst",
    "生成骨架动画与游戏人物设计开发 (12)": "tassel",
    # —— 第二批补充（v3）——
    "生成骨架动画与游戏人物设计开发 (39)": "face_sulk",   # 委屈脸（独立叠加槽）
    "生成骨架动画与游戏人物设计开发 (40)": "staff_spin",  # 耍棒旋转透视帧
    "生成骨架动画与游戏人物设计开发 (41)": "legs_walk_a", # 红裤腿·行走
    "生成骨架动画与游戏人物设计开发 (42)": "legs_walk_b", # 红裤腿·迈步交叉
    "生成骨架动画与游戏人物设计开发 (43)": "legs_tiptoe", # 红裤腿·踮脚
    "生成骨架动画与游戏人物设计开发 (44)": "legs_tiptoe2",# 红裤腿·踮脚高
    "生成骨架动画与游戏人物设计开发 (45)": "legs_run",    # 红裤腿·高抬腿
}
FACES = {  # 备用表情（head slot 内切换；默认不显示）
    "生成骨架动画与游戏人物设计开发 (21)": "face_calm",
    "生成骨架动画与游戏人物设计开发 (22)": "face_happy",
    "生成骨架动画与游戏人物设计开发 (23)": "face_annoyed",
    "生成骨架动画与游戏人物设计开发 (24)": "face_surprised",
    "生成骨架动画与游戏人物设计开发 (25)": "face_angry",
}
SEM_OF = {v: k for k, v in PICK.items()}  # 语义名 → stem
SEM_OF.update({v: k for k, v in FACES.items()})

# bbox 中心定位部件：语义名 → (bone, off_x, off_y)
# 用于整腿/表情/旋转棒等「图中心即锚点」的部件；offset 相对骨骼原点（y 向上）
# face_sulk 是叠脸槽：中心对准原头图的脸区（头图中心在 head 骨 y-18，脸区再往下 ~25）
CENTER_PLACEMENT = {
    "legs_walk_a":  ("leg_fx", 0, -124),
    "legs_walk_b":  ("leg_fx", 0, -124),
    "legs_tiptoe":  ("leg_fx", 0, -132),
    "legs_tiptoe2": ("leg_fx", 0, -140),
    "legs_run":     ("leg_fx", 0, -132),
    "face_sulk":    ("head", 0, 57),
    "staff_spin":   ("weapon", 0, 0),
}

# ---------------- 1. Atlas 打包 ----------------
def pack_atlas():
    names = list(PICK.values()) + list(FACES.values()) + ["blank"]
    regions = []
    for name in names:
        if name == "blank":  # 2×2 全透明：替代 null 附件做「隐藏」（4.2 读取器会丢 null 帧）
            regions.append((name, Image.new("RGBA", (2, 2), (0, 0, 0, 0))))
            continue
        stem = SEM_OF[name] if name in SEM_OF else stem_of_face(name)
        img = Image.open(PARTS / f"{stem}.png").convert("RGBA")
        # 关键：按骨架单位缩放，保证 region 尺寸与 attachment width/height 一致，
        # 否则 20 张 640 级原图撑爆 2048 页面导致 region y 越界、UV 采出白块
        img = img.resize(
            (max(1, round(img.width * SCALE)), max(1, round(img.height * SCALE))),
            Image.LANCZOS,
        )
        regions.append((name, img))
    regions.sort(key=lambda r: -max(r[1].size))

    PAGE = 2048
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
        page.paste(img, (x, y))
        rects[name] = (x, y, w, h)
        x += w + PAD
        row_h = max(row_h, h)
    page.save(OUT / "wukong.png")

    lines = ["wukong.png", "size: 2048,2048", "format: RGBA8888",
             "filter: Linear,Linear", "repeat: none"]
    for name, (rx, ry, rw, rh) in rects.items():
        lines += [name, f"  bounds: {rx}, {ry}, {rw}, {rh}"]
    (OUT / "wukong.atlas").write_text("\n".join(lines), encoding="utf-8")
    return rects


def stem_of_face(name):
    for stem, n in FACES.items():
        if n == name:
            return stem
    raise KeyError(name)


# ---------------- 2. 骨架 ----------------
SCALE = 0.42   # 图素 → 骨架单位
BONES = [  # (name, parent, x, y, extra)
    ("root",    None,    0,   0, {}),
    ("hips",    "root",  0, 262, {}),
    ("leg_fx",  "hips",   0,  -6, {}),   # 整腿图专用：步伐钟摆/起伏驱动
    ("leg_l",   "hips",  -46, 10, {}),
    ("leg_r",   "hips",   46, 10, {"scaleX": -1}),   # 镜像腿
    ("skirt_b", "hips",   0,  36, {}),
    ("spine",   "hips",   0,  34, {}),
    ("chest",   "spine",  0,  96, {}),
    ("neck",    "chest",  0, 118, {}),
    ("head",    "neck",   0,  46, {}),
    ("band_b",  "head",   0, 129, {}),   # 用户校准：金箍上移 10
    ("arm_l",   "chest", -88, 96, {}),   # 弯臂形态恢复原样（弯向身体）
    ("arm_r",   "chest",  88, 96, {"scaleX": -1}),
    ("hand_l",  "arm_l", -172, -8, {}),
    ("hand_r",  "arm_r", 172, -8, {}),
    ("weapon",  "chest", -60, -91, {"rotation": 45}),  # 棒贴画面左拳（互换后保持左侧）
    ("prop",    "chest", -60, -91, {}),   # 骰子同在左手心
    ("fx",      "root",   0, 420, {}),
]
# 部件: 语义名 → (bone, pivot_u, pivot_v, off_x, off_y)  pivot=图内锚点(px, 左上原点)
PLACEMENT = {
    "leg":       ("leg_l",  134,  64, 0, 0),
    "skirt":     ("skirt_b", 320,  58, 0, 0),
    "tassel":    ("skirt_b", 285,  64, 0, -14),
    "torso":     ("spine",   320, 560, 0, 0),
    "arm":       ("arm_l",   152,  96, 0, 0),
    "hand_fist": ("hand_l",  320, 520, 0, 0),
    "hand_open": ("hand_l",  298, 566, 0, 0),
    "hand_grip": ("hand_r",  308, 560, 0, 0),
    "hand_dice": ("hand_r",  362, 560, 0, 0),
    "head":      ("head",    312, 638, 0, -36),  # 用户校准：头下移 10
    "headband":  ("band_b",  320, 132, 0, 0),
    "staff":     ("weapon",  320, 270, 0, 0),
    "dice":      ("prop",    320, 320, 0, 0),
    "dice_swish":("fx",      320, 320, 0, 0),
    "burst":     ("fx",      320, 320, 0, 0),
}
# 附件额外缩放（region 自动拉伸映射，骰子/特效不应与躯干同大）
SIZE_SCALE = {"dice": 0.42, "burst": 0.8, "dice_swish": 0.8, "headband": 0.85,
              "staff_spin": 0.8, "face_sulk": 0.8,
              "legs_walk_a": 0.75, "legs_walk_b": 0.75, "legs_tiptoe": 0.75,
              "legs_tiptoe2": 0.75, "legs_run": 0.75}
# slot: (bone, [attachment 语义名...], default_attachment 或 None)
SLOTS = [
    ("fx",       ["burst", "dice_swish", "blank"], None),
    ("legs",     ["legs_walk_a", "legs_walk_b", "legs_tiptoe", "legs_tiptoe2", "legs_run", "blank"], None),
    ("leg_l",    ["leg", "blank"],               "leg"),
    ("leg_r",    ["leg", "blank"],               "leg"),
    ("skirt",    ["skirt"],                      "skirt"),
    ("tassel",   ["tassel"],                     "tassel"),
    ("torso",    ["torso"],                      "torso"),
    ("arm_l",    ["arm"],                        "arm"),
    ("hand_l",   ["hand_fist", "hand_open"],     None),   # arm 图自带手，变体留给动画切换
    ("arm_r",    ["arm"],                        "arm"),
    ("hand_r",   ["hand_fist", "hand_grip", "hand_dice"], None),
    ("weapon",   ["staff", "staff_spin", "blank"], "staff"),
    ("head",     ["head"] + list(FACES.values()), "head"),
    ("face",     ["face_sulk"],                  None),   # 叠脸槽：盖在头上、金箍之下
    ("headband", ["headband"],                   "headband"),
    ("prop",     ["dice", "blank"],              None),
]


def make_attachment(sem, extra=(0, 0)):
    if sem in CENTER_PLACEMENT:
        bone, ox, oy = CENTER_PLACEMENT[sem]
        img = Image.open(PARTS / f"{SEM_OF[sem]}.png")
        s = SIZE_SCALE.get(sem, 1)
        w, h = img.size[0] * SCALE * s, img.size[1] * SCALE * s
        # bbox 中心即锚点：图中心贴骨坐标 (ox, oy)（y 向上）
        return {
            "x": round(ox, 2),
            "y": round(oy, 2),
            "width": round(w, 2),
            "height": round(h, 2),
        }
    bone, pu, pv, ox, oy = PLACEMENT[sem]
    img = Image.open(PARTS / f"{SEM_OF[sem]}.png")
    s = SIZE_SCALE.get(sem, 1)
    w, h = img.size[0] * SCALE * s, img.size[1] * SCALE * s
    pu, pv = pu * SCALE, pv * SCALE
    # region attachment x/y = 图中心相对 bone 的偏移（y 向上）
    return {
        "x": round((w / 2 - pu) + ox, 2),
        "y": round((pv - h / 2) + oy, 2),
        "width": round(w, 2),
        "height": round(h, 2),
    }


def build_skeleton():
    bones = []
    for name, parent, x, y, extra in BONES:
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if x or y:
            b["x"], b["y"] = x, y
        b.update(extra)
        bones.append(b)

    def bone_of(sem):
        if sem in CENTER_PLACEMENT:
            return CENTER_PLACEMENT[sem][0]
        return PLACEMENT[sem][0]

    slots, skin = [], {}
    SLOT_BONES = {"leg_r": "leg_r", "arm_r": "arm_r", "hand_r": "hand_r"}  # 镜像槽位显式指定
    for slot_name, atts, default in SLOTS:
        bone = SLOT_BONES.get(slot_name) or bone_of(default or atts[0])
        slots.append({"name": slot_name, "bone": bone, "attachment": default})
        entries = {}
        for sem in atts:
            if sem == "blank":  # 透明附件：2×2 贴骨原点，不可见
                entries[sem] = {"x": 0, "y": 0, "width": 2, "height": 2}
                continue
            if slot_name == "head" and sem in FACES.values():
                continue  # 表情走下方统一复用 head 几何
            a = make_attachment(sem)
            if sem != atts[0]:
                a["path"] = sem  # 多附件 slot：attachment 名=语义名，region 复用同 path
            entries[sem] = a
        if slot_name == "head":  # 备用表情：同构图复用 head 几何，region 换 path
            for fname in FACES.values():
                entries[fname] = dict(entries["head"], path=fname)
        skin[slot_name] = entries
    return {
        "skeleton": {"spine": "4.2.43", "hash": "zhao-wukong-3",
                     "x": -430, "y": -50, "width": 860, "height": 800},
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": skin}],
        "animations": {},
    }


# ---------------- 3. 动画 ----------------
def build_animations(anims):
    def rot(name, bone, keys):
        # Spine 4.2 JSON 格式：单值时间轴（rotate/translatex/scalex…）帧字段为 "value"（4.1 及以前是 "angle"）
        anims.setdefault(name, {}).setdefault("bones", {}).setdefault(bone, {})["rotate"] = [
            {"time": round(t, 4), "value": round(a, 2)} for t, a in keys]

    def tra(name, bone, keys):
        anims.setdefault(name, {}).setdefault("bones", {}).setdefault(bone, {})["translate"] = [
            {"time": round(t, 4), "x": round(x, 2), "y": round(y, 2)} for t, x, y in keys]

    def att(name, slot, keys):
        # None → "blank"（透明附件）：4.2 读取器会丢弃 null 附件帧，用 blank 才能真正隐藏
        anims.setdefault(name, {}).setdefault("slots", {})[slot] = {"attachment": [
            {"time": round(t, 4), "name": n if n else "blank"} for t, n in keys]}

    # --- idle_calm：呼吸 + 头微摆（2s loop）---
    rot("idle_calm", "head", [(0, 0), (1.0, 2.4), (2.0, 0)])
    tra("idle_calm", "head", [(0, 0, -5), (2.0, 0, -5)])   # 用户校准：该动画头下移 5
    tra("idle_calm", "chest", [(0, 0, 0), (1.0, 0, 2.2), (2.0, 0, 0)])
    sca_key = [{"time": 0, "x": 1, "y": 1},
               {"time": 1.0, "x": 1.02, "y": 0.985},
               {"time": 2.0, "x": 1, "y": 1}]
    anims["idle_calm"]["bones"]["spine"] = {"scale": sca_key}
    rot("idle_calm", "arm_l", [(0, 0), (1.0, 1.6), (2.0, 0)])
    rot("idle_calm", "arm_r", [(0, 0), (1.0, -1.6), (2.0, 0)])

    # --- idle_happy：双臂高举挥舞 + 踮脚蹦跳（1.2s loop）---
    T = 1.2
    rot("idle_happy", "arm_l", [(0, -135), (T/2, -165), (T, -135)])
    rot("idle_happy", "arm_r", [(0, 135), (T/2, 165), (T, 135)])
    rot("idle_happy", "head", [(0, -2), (T/2, 2), (T, -2)])
    tra("idle_happy", "hips", [(0, 0, 0), (T/4, 0, 46), (T/2, 0, 0),
                               (3*T/4, 0, 46), (T, 0, 0)])
    # 蹦跳换踮脚整腿（隐藏单腿，落地姿态交给整腿图）
    att("idle_happy", "legs", [(0, "legs_tiptoe"), (T/4, "legs_tiptoe2"),
                               (T/2, "legs_tiptoe"), (3*T/4, "legs_tiptoe2"), (T, "legs_tiptoe")])
    att("idle_happy", "leg_l", [(0, None)])
    att("idle_happy", "leg_r", [(0, None)])

    # --- idle_sad：低头塌肩下沉 + 委屈脸（2s loop）---
    rot("idle_sad", "head", [(0, 14), (1.0, 17), (2.0, 14)])
    tra("idle_sad", "head", [(0, -10, 0), (2.0, -10, 0)])   # 用户校准：该动画头左移 10
    rot("idle_sad", "arm_l", [(0, 14), (1.0, 18), (2.0, 14)])
    rot("idle_sad", "arm_r", [(0, -14), (1.0, -18), (2.0, -14)])
    tra("idle_sad", "chest", [(0, 0, 0), (1.0, 0, -6), (2.0, 0, 0)])
    tra("idle_sad", "hips", [(0, 0, 0), (1.0, 0, -8), (2.0, 0, 0)])
    att("idle_sad", "face", [(0, "face_sulk")])

    # --- walk：正面双腿交替 + 摆臂起伏（0.8s loop）---
    T = 0.8
    att("walk", "legs", [(0, None)])   # 侧视红裤腿与正面躯干视角冲突，弃用
    rot("walk", "leg_l", [(0, 8), (T/2, -8), (T, 8)])     # 正面左右迈步
    rot("walk", "leg_r", [(0, -8), (T/2, 8), (T, -8)])
    rot("walk", "arm_l", [(0, 26), (T/4, 0), (T/2, -26), (3*T/4, 0), (T, 26)])
    rot("walk", "arm_r", [(0, -26), (T/4, 0), (T/2, 26), (3*T/4, 0), (T, -26)])
    tra("walk", "hips", [(0, 0, 0), (T/4, 0, 12), (T/2, 0, 0), (3*T/4, 0, 12), (T, 0, 0)])

    # --- spin：耍棒花（1.5s loop）棒挂手骨，旋转绕手心；手臂保持稳定 ---
    rot("spin", "weapon", [(0, 0), (0.2, 0), (0.95, 720), (1.1, 720), (1.5, 0)])
    att("spin", "weapon", [(0, "staff"), (0.2, "staff_spin"), (1.0, "staff")])
    rot("spin", "head", [(0, 0), (0.6, 5), (1.5, 0)])
    tra("spin", "head", [(0, 0, -5), (1.5, 0, -5)])   # 用户校准：该动画头下移 5
    tra("spin", "chest", [(0, 0, 0), (0.6, 0, 3), (1.5, 0, 0)])

    # --- throw_dice：举骰→甩出→骰子飞出（1.2s once）---
    # 掷骰手（互换后画面左侧）：抬臂平托胸前→掷出→放手收势
    rot("throw_dice", "arm_r", [(0, 30), (0.25, 75), (0.5, 80), (0.72, -20), (1.2, 0)])
    rot("throw_dice", "arm_l", [(0, -10), (0.35, -24), (0.5, -24), (1.2, -6)])
    rot("throw_dice", "chest", [(0, 0), (0.5, -8), (0.72, 10), (1.2, 4)])
    rot("throw_dice", "head", [(0, 0), (0.5, -6), (0.75, 6), (1.2, 0)])
    tra("throw_dice", "head", [(0, 0, -5), (1.2, 0, -5)])   # 用户校准：该动画头下移 5
    att("throw_dice", "prop", [(0, None), (0.05, "dice"), (0.55, None)])
    att("throw_dice", "fx", [(0, None), (0.55, "dice_swish"), (0.78, "burst"), (1.0, None)])
    # 注意：4.2 读取器会丢弃 attachment 时间轴的「首个 null 帧」，故先显式 staff 再 null 隐藏
    att("throw_dice", "weapon", [(0, "staff"), (0.05, None), (0.9, "staff")])
    # 骰子：起点=右手心；举臂阶段近似跟手（手举过头），甩出后抛物线飞出画面
    tra("throw_dice", "prop", [
        (0, 0, 0), (0.3, 10, 70), (0.5, 20, 90),
        (0.72, 90, 320), (1.0, 240, 200), (1.2, 330, 90)])
    anims["throw_dice"]["bones"]["prop"]["scale"] = [
        {"time": 0, "x": 1, "y": 1}, {"time": 0.5, "x": 1, "y": 1},
        {"time": 1.0, "x": 0.5, "y": 0.5}, {"time": 1.2, "x": 0.2, "y": 0.2}]


def main():
    pack_atlas()
    skeleton = build_skeleton()
    build_animations(skeleton["animations"])
    (OUT / "wukong.json").write_text(json.dumps(skeleton, ensure_ascii=False), encoding="utf-8")
    print(f"ok: {len(skeleton['slots'])} slots, {len(skeleton['animations'])} animations"
          f" -> out/wukong.(json|png|atlas)")


if __name__ == "__main__":
    main()
