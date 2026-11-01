"""
blender_bake.py —— 把带骨架 + 8 命名 Action 的 .blend 烘焙成 2D 序列帧图集。

用法（本机 Blender 5.2）：
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_bake.py -- --blend tools/placeholder_hanli.blend --out public/art/hanli_sheet.png

参数（-- 之后）：
  --blend  输入 .blend（必须含 idle/walk/attack/cast/skill/hurt/death/dodge 八个 Action）
  --out    输出图集 PNG
  --cols/--rows  网格列/行（默认 10x10，需 >= 总帧数 100）
  --fw/--fh       单帧宽/高（默认 256x512，竖长方形）

实现：
  - 正交相机 + 透明底（Film Transparent）+ EEVEE 平面光，匹配 FLIPBOOK_BLENDER_SPEC.md
  - 逐 clip 渲成序列帧（bpy 一次性 animation 渲染，快），再用 numpy 拼成网格图集
  - 图集帧序 = row*cols + col（0 起，左→右、上→下），与 Rig.ts 的 FlipbookDef 一致
  - 缺失某 clip 则跳过（游戏侧会回退程序化兜底）

注意：Action 的帧数/打击帧必须与 Player.ts 里 FlipbookDef 的 from/count/hit 对齐。
"""
import bpy
import sys
import os
import math
import tempfile
import shutil
import numpy as np
import mathutils

# 解析 -- 之后的参数
argv = sys.argv
if '--' in argv:
    argv = argv[argv.index('--') + 1:]


def aim_camera(cam_obj, loc, target, up='Y'):
    """直接算相机朝向（取代 TrackTo 约束，避免头less 渲染时约束未求值导致相机停在默认位姿）。"""
    cam_obj.location = mathutils.Vector(loc)
    direction = mathutils.Vector(target) - mathutils.Vector(loc)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = direction.to_track_quat('-Z', up)


def getarg(k, default):
    return argv[argv.index(k) + 1] if k in argv else default


BLEND = getarg('--blend', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'placeholder_hanli.blend'))
OUT = getarg('--out', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art', 'hanli_sheet.png'))
COLS = int(getarg('--cols', '20'))
ROWS = int(getarg('--rows', '5'))
FW = int(getarg('--fw', '200'))
FH = int(getarg('--fh', '400'))

# 与 Player.ts 的 FlipbookDef 示例严格对齐：(name, count, fps, loop, hit)
LAYOUT = [
    ('idle', 16, 8, True, None),
    ('walk', 12, 10, True, None),
    ('attack', 10, 20, False, 6),
    ('cast', 16, 10, True, None),
    ('skill', 18, 20, False, 11),
    ('hurt', 6, 12, False, None),
    ('death', 14, 12, False, None),
    ('dodge', 8, 20, False, None),
]

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene

# 找骨架
arm_obj = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
if arm_obj is None:
    raise SystemExit("ERROR: 找不到 ARMATURE 对象")

# 相机：默认自建（占位/未预处理时使用）。若传 --usecamera，则复用 prep 已取好景的相机
if '--usecamera' in argv:
    if scene.camera is None:
        raise SystemExit("ERROR: --usecamera 但场景无相机，请先用 blender_prep.py 预处理")
    cam_obj = scene.camera
    print("[bake] 使用场景现有相机（--usecamera）")
else:
    cam = bpy.data.cameras.new('BakeCam')
    cam.type = 'ORTHO'
    cam.ortho_scale = 2.4
    cam.clip_start = 0.01
    cam.clip_end = 50
    cam_obj = bpy.data.objects.new('BakeCam', cam)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    aim_camera(cam_obj, (0, -3.0, 1.0), (0, 0, 0.9))

# 渲染设置：透明底 + EEVEE 平面光 + PNG RGBA
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.resolution_x = FW
scene.render.resolution_y = FH
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

W = COLS * FW
H = ROWS * FH
atlas = np.zeros((H, W, 4), dtype=np.float32)
tmp = tempfile.mkdtemp()
arm_obj.animation_data_create()

offset = 0
for (name, cnt, fps, loop, hit) in LAYOUT:
    act = bpy.data.actions.get(name)
    if act is None:
        print(f"[bake] 跳过缺失 clip: {name}")
        offset += cnt
        continue
    arm_obj.animation_data.action = act
    scene.frame_start = 1
    scene.frame_end = cnt
    pat = os.path.join(tmp, name + '_')
    scene.render.filepath = pat
    bpy.ops.render.render(animation=True)
    for i in range(cnt):
        gi = offset + i
        col = gi % COLS
        row = gi // COLS
        fp = os.path.join(tmp, f"{name}_{i + 1:04d}.png")
        if not os.path.exists(fp):
            print(f"[bake] 警告：缺帧 {fp}")
            continue
        img = bpy.data.images.load(fp)
        iw, ih = img.size[0], img.size[1]
        arr = np.array(img.pixels[:]).reshape(ih, iw, 4)
        y0 = (ROWS - 1 - row) * FH   # Blender 图底朝上，图集 row0 在顶
        atlas[y0:y0 + FH, col * FW:col * FW + FW, :] = arr
        bpy.data.images.remove(img)
    offset += cnt

# 写出图集
os.makedirs(os.path.dirname(OUT), exist_ok=True)
atlas_img = bpy.data.images.new('atlas', W, H, alpha=True, float_buffer=False)
atlas_img.filepath = OUT
atlas_img.pixels[:] = atlas.flatten().tolist()
atlas_img.save_render(OUT)
shutil.rmtree(tmp, ignore_errors=True)
print(f"[bake] 完成 -> {OUT}  ({W}x{H}, 总帧 {offset})")
