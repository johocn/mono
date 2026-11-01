"""
blender_prep.py —— 把任意「已绑骨的模型」预处理成可直接烘焙的状态。

用途：你拿 CC0 人形基底（或自己建模）改造出韩立后，用它一键套用项目的渲染预设，
      省掉每次手点相机/材质/描边/透明底/打光。然后跑 blender_bake.py --usecamera 即可出图集。

用法（本机 Blender 5.2）：
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_prep.py -- \
      --in 模型.glb            （支持 .blb/.gltf/.obj/.fbx/.blend）
      --out 预处理后.blend      （默认 原文件名_prepped.blend）
      --fw 200 --fh 400        （单元格尺寸，需与 blender_bake.py 一致，用于正确取景宽高比）
      --view 1,1,0.6           （相机方向：从「前-右-上」看向角色，可改）
      --margin 1.15            （取景留白）
      --toon 1                 （1=把材质转 Toon 卡通着色，保留原色/贴图；0=不动材质）

做了什么：
  - 自动计算世界包围盒 → 正交相机 ortho_scale 自适应取景（贴合 FW/FH 宽高比）
  - 卡通材质：Toon BSDF 替换原 BSDF，保留 Base Color / 贴图连接（得到硬边 cel 观感）
  - Freestyle 统一黑描边（线宽 1.2）
  - 透明底（Film Transparent）+ EEVEE
  - 主光(顺相机方向打亮正面) + 补光
  - 不碰动画：原 .blend/.glb 里的 Action 全部保留

重要：烘焙按名字取 8 个 Action（idle/walk/attack/cast/skill/hurt/death/dodge）。
      若你的基底动作名不同，请在 Blender 里重命名（或 NLA 推给这 8 个名字）后再烘焙。
"""
import bpy
import sys
import os
import math
import mathutils

argv = sys.argv
if '--' in argv:
    argv = argv[argv.index('--') + 1:]


def getarg(k, d):
    return argv[argv.index(k) + 1] if k in argv else d


def aim_camera(cam_obj, loc, target, up='Y'):
    """直接算相机朝向（取代 TrackTo 约束，避免头less 渲染时约束未求值）。"""
    cam_obj.location = mathutils.Vector(loc)
    direction = mathutils.Vector(target) - mathutils.Vector(loc)
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = direction.to_track_quat('-Z', up)


IN = getarg('--in', None)
OUT = getarg('--out', None)
FW = int(getarg('--fw', '200'))
FH = int(getarg('--fh', '400'))
VIEW = [float(x) for x in getarg('--view', '1,1,0.6').split(',')]
TOON = getarg('--toon', '1') not in ('0', 'false', 'no')
MARGIN = float(getarg('--margin', '1.15'))

if not IN:
    raise SystemExit("--in 必填（支持 .blend/.glb/.gltf/.obj/.fbx）")

ext = IN.lower().rsplit('.', 1)[-1]
if ext == 'blend':
    bpy.ops.wm.open_mainfile(filepath=IN)
elif ext in ('glb', 'gltf'):
    bpy.ops.import_scene.gltf(filepath=IN)
elif ext == 'obj':
    bpy.ops.import_scene.obj(filepath=IN)
elif ext == 'fbx':
    bpy.ops.import_scene.fbx(filepath=IN)
else:
    raise SystemExit("不支持的格式: " + ext)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'

meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit("未找到网格对象")


def bbox():
    mn = [1e9, 1e9, 1e9]
    mx = [-1e9, -1e9, -1e9]
    for o in meshes:
        for v in o.bound_box:
            p = o.matrix_world @ mathutils.Vector(v)
            for i in range(3):
                mn[i] = min(mn[i], p[i])
                mx[i] = max(mx[i], p[i])
    return mn, mx


mn, mx = bbox()
center = mathutils.Vector([(mn[i] + mx[i]) / 2 for i in range(3)])
size = mathutils.Vector([mx[i] - mn[i] for i in range(3)])

aspect = FW / FH
ortho = max(size.z, size.x / aspect) * MARGIN

# ---- 相机：正交 + 自适应取景 + 看向中心 ----
cam = bpy.data.cameras.new('IsoCam')
cam.type = 'ORTHO'
cam.ortho_scale = ortho
cam.clip_start = 0.01
cam.clip_end = 1000
cam_obj = bpy.data.objects.new('IsoCam', cam)
scene.collection.objects.link(cam_obj)
D = max(size) * 4 + 2
view = mathutils.Vector(VIEW).normalized()
cam_obj.location = center - view * D
aim_camera(cam_obj, center - view * D, center)
scene.camera = cam_obj

# ---- 灯光：主光顺相机方向打亮正面 + 补光 ----
for o in [o for o in scene.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o, do_unlink=True)
key = bpy.data.lights.new('Key', 'SUN')
key.energy = 2.2
ko = bpy.data.objects.new('Key', key)
scene.collection.objects.link(ko)
ko.location = center - view * 5
fill = bpy.data.lights.new('Fill', 'SUN')
fill.energy = 0.5
fo = bpy.data.objects.new('Fill', fill)
scene.collection.objects.link(fo)
fo.location = center + mathutils.Vector((1, -1, 1)).normalized() * 5

# ---- 透明底 ----
scene.render.film_transparent = True

# ---- Freestyle 描边 ----
scene.render.use_freestyle = True
rl = scene.view_layers[0]
ls = rl.freestyle_settings.linesets.new('Toon') if not rl.freestyle_settings.linesets else rl.freestyle_settings.linesets[0]
ls.visibility = 'VISIBLE'
ls.select_silhouette = True
ls.linestyle = bpy.data.linestyles.new('ToonOutline')
ls.linestyle.thickness = 1.2
ls.linestyle.color = (0, 0, 0)


def toonify(mat):
    if not mat:
        return
    if not mat.use_nodes:
        col = list(mat.diffuse_color)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        toon = nodes.new('ShaderNodeBsdfToon')
        toon.inputs['Color'].default_value = col
        if 'Smoothness' in toon.inputs:
            toon.inputs['Smoothness'].default_value = 0.25
        mat.node_tree.links.new(toon.outputs['BSDF'], out.inputs['Surface'])
        return
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type in ('BSDF_PRINCIPLED', 'BSDF_DIFFUSE', 'BSDF_TOON')), None)
    if bsdf is None or bsdf.type == 'BSDF_TOON':
        return
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if out is None:
        return
    color_in = None
    for k in ('Base Color', 'Color'):
        if k in bsdf.inputs:
            color_in = bsdf.inputs[k]
            break
    src = None
    if color_in and color_in.links:
        src = color_in.links[0].from_socket
    toon = nodes.new('ShaderNodeBsdfToon')
    toon.location = bsdf.location
    if src:
        mat.node_tree.links.new(src, toon.inputs['Color'])
    else:
        c = color_in.default_value if color_in else (0.8, 0.8, 0.8, 1)
        toon.inputs['Color'].default_value = tuple(c) if isinstance(c, (list, tuple)) else (0.8, 0.8, 0.8, 1)
    if 'Smoothness' in toon.inputs:
        toon.inputs['Smoothness'].default_value = 0.25
    mat.node_tree.links.new(toon.outputs['BSDF'], out.inputs['Surface'])
    nodes.remove(bsdf)


if TOON:
    for mat in bpy.data.materials:
        toonify(mat)

# ---- 预览输出尺寸（bake 会按帧覆盖） ----
scene.render.resolution_x = FW
scene.render.resolution_y = FH
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

if not OUT:
    OUT = os.path.splitext(IN)[0] + '_prepped.blend'
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print(f"PREP SAVED: {OUT}  ortho_scale={ortho:.3f}  center={tuple(round(c, 2) for c in center)}  size={tuple(round(s, 2) for s in size)}")
