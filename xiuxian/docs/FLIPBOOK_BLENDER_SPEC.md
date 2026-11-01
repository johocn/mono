# Flipbook 渲染预设（Blender 3D → 2D 序列帧）

本规格用于把 **Blender 里建的 3D 角色** 渲染成 2D 序列帧图集，接入 `src/core/Rig.ts` 的 Flipbook 模式
（`FlipbookDef`）。这是「用 Blender 对标主流 2D 骨骼观感」的落地桥梁：Blender 负责真骨骼/IK/布料次级运动，
导出静态帧后由游戏以精灵表播放，**不需要任何新运行时**（用 Laya 的 `drawTexture` 即可）。

> 选 Blender 而非 Spine/DragonBones 的一线理由：它绕开了「AI 平图切件→2D 绑骨→接缝/色差」这道死坎。

## 1. 相机（必须和游戏等距视角一致）
- **Orthographic（正交）相机**，避免透视畸变。
- 旋转匹配游戏 2.5D 观感：**俯角约 25–30°**（看得到头顶、脚踩地），左右摆到角色**面朝 +X（右）**。
- 角色在 Blender 里世界坐标固定（只动骨骼，**原点/根骨不动**），相机固定 → 每帧构图一致，脚始终落在同一位置。
- 取景框把角色放进一个**竖长方形**单元（角色高≈2×宽），单元比例建议 `1 : 2`（如 256×512）。

## 2. 材质与描边（卡通、统一色板）
- 用 **Toon / Cel 着色**（Shader→RGB 或材质自带的 toon ramp），不要写实 PBR。
- **描边**：Freestyle（统一线宽）或背面外扩壳（Solidify backface hull）。线宽逐帧一致。
- 色板对齐现有韩立立绘：青灰长袍、竹绿腰带、墨黑发髻、淡金灵气（蓄力时）。
- 关闭运动模糊 / 景深 / 辉光；平面打光，避免逐帧亮度抖动。

## 3. 透明底导出
- `Scene → Film → Transparent` 勾选，渲染 **PNG（RGBA）**，背景透明。
- 这样序列帧直接叠在游戏等距瓦片之上，无需抠图（再次规避接缝问题）。

## 4. 帧布局（全局帧序 = row×cols + col，0 起，左→右、上→下）
每个 clip 连续排布。锚点：**脚底在单元格底部中心**（`anchorX=0.5, anchorY=1.0`，即 FlipbookDef 默认）。

推荐布局（100 帧，正好塞进 **20×5** 图集）：

| clip | from | count | fps | loop | hit(帧内偏移) |
|---|---|---|---|---|---|
| idle  | 0   | 16 | 8  | ✓ | — |
| walk  | 16  | 12 | 10 | ✓ | — |
| attack| 28  | 10 | 20 | — | 6 |
| cast  | 38  | 16 | 10 | ✓ | — |
| skill | 54  | 18 | 20 | — | 11 |
| hurt  | 72  | 6  | 12 | — | — |
| death | 78  | 14 | 12 | — | — |
| dodge | 92  | 8  | 20 | — | — |

- `hit` 是**相对本 clip 起点的帧偏移**，到点触发 `onFrameEvent("hit")`（对齐伤害/刀光，与 A1 打击帧机制一致）。
- 帧数/帧率可按观感增减，但 **总帧数必须 ≤ cols×rows**，且 `from + count` 不能越界或重叠。
- **图集尺寸约束**：单格 200×400（竖长方形，贴合人物 1:2 比例），20×5 → **4000×2000**。
  这是刻意为之：多数移动 GPU 的**最大纹理尺寸是 4096**，若用 10×10（2560×5120）高度会越界加载失败。
  换更大角色时优先扩 `cols`（宽度）而非 `rows`（高度）。

## 5. 接入游戏（`Rig.FlipbookDef`）
图集落到 `public/` 下（如 `public/art/hanli_sheet.png`），在 `Player.ts` 的 Rig opts 里解开示例 `sheet`：
```ts
sheet: {
  sheet: "art/hanli_sheet.png", cols: 20, rows: 5, // 20×5（受 4096 纹理上限约束）
  clips: {
    idle:  { from: 0,  count: 16, fps: 8,  loop: true },
    walk:  { from: 16, count: 12, fps: 10, loop: true },
    attack:{ from: 28, count: 10, fps: 20, hit: 6 },
    cast:  { from: 38, count: 16, fps: 10, loop: true },
    skill: { from: 54, count: 18, fps: 20, hit: 11 },
    hurt:  { from: 72, count: 6,  fps: 12 },
    death: { from: 78, count: 14, fps: 12 },
    dodge: { from: 92, count: 8,  fps: 20 },
  },
},
```
Flipbook 在 `Rig.ts` 里**优先级最高**（高于骨架/立绘），图集加载完成后自动接管渲染；
未烘焙的 clip 会回退到程序化兜底。其余（灵气环、蓄力辉光、朝向镜像、打击帧事件）仍由 `Rig` 统一处理。

## 6. 代价提醒
- 序列帧比 Spine 骨骼占内存/包体：**单主角 + 少量 NPC 无所谓；几十个敌人会膨胀**（这就是 Spine 存在的理由）。
- 运行时**换装/复用骨架**不如 Spine 灵活（换装需烘焙多套或把装备当 2D 叠层）。
- 不要图省事把 Blender 模型以 3D 塞进 LayaAir 3D 场景——那要改整个 2D 渲染架构，对单人项目是大坑。坚持「渲成 2D 帧」。

## 7. 自动化脚本（仓库 `tools/`，本机已装 Blender 5.2）
三步走，模型替换零成本：

**(a) 占位/原型**：`tools/blender_placeholder.py` — 零建模生成占位韩立（骨架 + 8 命名 Action），用于先验证整条链路。
```pwsh
& "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_placeholder.py
```

**(b) 预处理**：`tools/blender_prep.py` — 导入任意已绑骨的 `.glb/.gltf/.obj/.fbx/.blend`，一键套用渲染预设
（正交相机**按包围盒自动取景** / Toon 卡通材质 / Freestyle 描边 / 透明底 / 打光）。你只管改造青袍发髻长矛 + 做动作。
```pwsh
& "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_prep.py -- `
   --in 你的韩立.glb --out 预处理后.blend
```
> 烘焙按名字取 8 个 Action（`idle/walk/attack/cast/skill/hurt/death/dodge`）。基底动作名不同就在 Blender 里重命名/NLA 推给这 8 个。

**(c) 烘焙**：`tools/blender_bake.py` — 用预处理好的相机渲序列帧，numpy 拼成 20×5 图集。
```pwsh
& "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/blender_bake.py -- `
   --blend 预处理后.blend --out public/art/hanli_sheet.png --usecamera
```
> 不传 `--usecamera` 时脚本自建一个固定相机（适合占位/未预处理场景）。

关键坑（已修复，记在此备查）：头less 渲染时 `TrackTo` 约束不会被求值，相机停在默认位姿导致整张透明；
脚本改用 `mathutils.to_track_quat` 直接算相机朝向。另外 Blender 里手动 `parent_bone` 会导致网格偏移，
务必用 `bpy.ops.object.parent_set(type='BONE')` 保留世界变换。

