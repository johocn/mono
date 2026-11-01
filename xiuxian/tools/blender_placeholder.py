"""
blender_placeholder.py —— 生成占位版「韩立」角色（零建模验证用）。

用法（本机 Blender 5.2）：
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_placeholder.py

产出：tools/placeholder_hanli.blend
  - 简易骨架（root/spine/head/armL/armR/legL/legR）+ 绑定网格（青袍/肤色/墨发/长矛）
  - 8 个命名 Action（与 FLIPBOOK_BLENDER_SPEC.md / Rig.ts 的 FlipbookDef 完全一致）：
    idle / walk / attack / cast / skill / hurt / death / dodge
  - 每个 Action 仅做明显肢体运动，证明「每帧姿态不同 → 烘焙出不同帧」

之后用 blender_bake.py 把它渲成 10x10 序列帧图集。
真实模型就绪后，只需替换 .blend（保持同名 Action），烘焙脚本无需改动。
"""
import bpy
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "placeholder_hanli.blend")

# ---------- 清空场景 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = False
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m


robe = mat("robe", (0.43, 0.56, 0.48))   # 青袍
skin = mat("skin", (0.91, 0.76, 0.62))
hair = mat("hair", (0.10, 0.10, 0.12))
wood = mat("wood", (0.55, 0.40, 0.25))
gold = mat("gold", (0.91, 0.85, 0.63))

# ---------- 骨架 ----------
arm = bpy.data.armatures.new("Arm")
arm_obj = bpy.data.objects.new("Hanli", arm)
col.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = arm.edit_bones[parent]
    return b


bone('root', (0, 0, 0), (0, 0, 0.02))
bone('spine', (0, 0, 0.90), (0, 0, 1.45), 'root')
bone('head', (0, 0, 1.45), (0, 0, 1.75), 'spine')
bone('armL', (0.16, 0, 1.35), (0.55, 0, 1.35), 'spine')
bone('armR', (-0.16, 0, 1.35), (-0.55, 0, 1.35), 'spine')
bone('legL', (0.10, 0, 0.90), (0.10, 0, 0.05), 'root')
bone('legR', (-0.10, 0, 0.90), (-0.10, 0, 0.05), 'root')
bpy.ops.object.mode_set(mode='OBJECT')


def add_part(kind, params, loc, bone_name, m, rot=(0, 0, 0)):
    if kind == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(radius=params[0], depth=params[1], location=loc)
    elif kind == 'sph':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=params[0], location=loc)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(radius1=params[0], radius2=params[1], depth=params[2], location=loc)
    o = bpy.context.active_object
    o.rotation_euler = rot
    o.data.materials.append(m)
    # 绑定到骨（用 parent_set 保留世界变换，避免手动设 parent_bone 导致的偏移）
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')
    arm_obj.data.bones.active = arm_obj.data.bones[bone_name]
    bpy.ops.object.parent_set(type='BONE')
    bpy.ops.object.mode_set(mode='OBJECT')
    return o


# 躯干 / 头 / 发髻 / 四肢 / 袍裙 / 长矛（绑定到对应骨，跟随摆动）
add_part('cyl', (0.17, 0.62), (0, 0, 1.15), 'spine', robe)
add_part('sph', (0.16,), (0, 0, 1.60), 'head', skin)
add_part('sph', (0.17,), (0, 0, 1.68), 'head', hair)
add_part('cyl', (0.05, 0.50), (0.355, 0, 1.35), 'armL', skin, rot=(0, math.radians(90), 0))
add_part('cyl', (0.05, 0.50), (-0.355, 0, 1.35), 'armR', skin, rot=(0, math.radians(90), 0))
add_part('cyl', (0.07, 0.85), (0.10, 0, 0.475), 'legL', robe)
add_part('cyl', (0.07, 0.85), (-0.10, 0, 0.475), 'legR', robe)
add_part('cone', (0.33, 0.14, 0.85), (0, 0, 0.475), 'spine', robe)
add_part('cyl', (0.02, 2.20), (-0.55, 0, 1.30), 'armR', wood)

# ---------- 灯光（EEVEE 需要光才能看见） ----------
bpy.ops.object.light_add(type='SUN', location=(3, -3, 6))
bpy.context.active_object.data.energy = 2.5

# ---------- 8 个动作 ----------
pb = arm_obj.pose.bones
arm_obj.animation_data_create()


def kf(f):
    for b in pb:
        b.keyframe_insert(data_path='rotation_euler', frame=f)
        b.keyframe_insert(data_path='location', frame=f)


def make_action(name, n, fn):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True  # 保活：否则未挂在对象上的 Action 存盘时被丢弃
    arm_obj.animation_data.action = act
    for f in range(1, n + 1):
        fn(pb, f, n)
        kf(f)
    return act


def idle(pb, f, n):
    s = math.sin(f / n * math.pi * 2)
    pb['spine'].rotation_euler = (0, 0, s * 0.03)
    pb['head'].rotation_euler = (0, 0, s * 0.02)


def walk(pb, f, n):
    a = math.sin(f / n * math.pi * 2)
    pb['legL'].rotation_euler = (a * 0.5, 0, 0)
    pb['legR'].rotation_euler = (-a * 0.5, 0, 0)
    pb['spine'].rotation_euler = (0, 0, a * 0.04)


def attack(pb, f, n):
    u = f / n
    if u < 0.4:
        ang = -0.2 - (u / 0.4) * 1.6          # 抬矛过头
    elif u < 0.7:
        ang = -1.8 + ((u - 0.4) / 0.3) * 2.4  # 下劈（打击帧附近）
    else:
        ang = 0.6 - ((u - 0.7) / 0.3) * 0.6    # 回弹
    pb['armR'].rotation_euler = (0, 0, ang)


def cast(pb, f, n):
    s = math.sin(f / n * math.pi * 2)
    pb['spine'].rotation_euler = (0, 0, -0.12 + s * 0.04)
    pb['armL'].rotation_euler = (0, 0, 0.3)
    pb['armR'].rotation_euler = (0, 0, -0.3)


def skill(pb, f, n):
    u = f / n
    if u < 0.4:
        ang = -0.3 - (u / 0.4) * 1.8
    elif u < 0.7:
        ang = -2.1 + ((u - 0.4) / 0.3) * 2.6
    else:
        ang = 0.5 - ((u - 0.7) / 0.3) * 0.5
    pb['armR'].rotation_euler = (0, 0, ang)
    pb['spine'].rotation_euler = (0, 0, -0.1)


def hurt(pb, f, n):
    u = f / n
    pb['spine'].rotation_euler = (0, 0, -0.25 * (1 - u))


def death(pb, f, n):
    u = f / n
    pb['spine'].rotation_euler = (0, 0, -1.4 * u)   # 前旋倒地 ~80°


def dodge(pb, f, n):
    u = f / n
    pb['spine'].rotation_euler = (0, 0, -u * math.pi * 2)  # 整圈侧翻


make_action('idle', 16, idle)
make_action('walk', 12, walk)
make_action('attack', 10, attack)
make_action('cast', 16, cast)
make_action('skill', 18, skill)
make_action('hurt', 6, hurt)
make_action('death', 14, death)
make_action('dodge', 8, dodge)

# ---------- 保存 ----------
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("PLACEHOLDER SAVED:", OUT)
