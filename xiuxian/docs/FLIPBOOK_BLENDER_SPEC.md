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

## 8. 韩立 CC0 改造清单（路线②实操手册）
目标：拿到干净可绑骨的人形基底 → 改造韩立（青袍/墨发髻/竹绿腰带/长矛）→ 绑骨 → 8 个同名 Action → 交 prep+bake。
本手册给你照着做；真模型到手后，游戏侧 `Player.ts` 的 `sheet` 配置**一行都不用改**。

### 8.1 选基底（去哪找、怎么挑）
- **许可优先级**：`CC0`（可改可再分发）> `CC-BY`（需署名、可改）> 免费商用（逐条看条款）> `Mixamo`（免费可用但**角色源不可再分发/改源**，仅适合直接吃它的动画，不适合本项目「改源+烘焙再分发」）。**本项目要改源，强烈建议 CC0 / CC-BY。**
- 推荐站点 / 关键词：
  - **Sketchfab**：搜 `humanoid base mesh` / `stylized male` / `anime character base`，左侧筛选 `License = CC0 或 CC-BY`、`Downloadable`、有 rig 更佳（但仍建议自家 Rigify 重绑以保证骨骼名统一）。
  - **Quaternius** / **Kenney.nl**：CC0 低面数人形，拓扑干净，卡通友好。
  - **Blendswap**：CC0 专区；**Poly Pizza**：低面数 CC0。
- 挑选标准（重要性排序）：
  1. **拓扑干净、四边面为主、关节有余量环线**（肩/肘/膝/裙摆）——决定权重变形是否破面。
  2. 比例接近真人或轻动漫（头身比 ~6.5–7.5），别太高或太 Q。
  3. 已有基础绑骨可省事，但**最终用 Rigify 重绑**最稳（骨骼命名统一、IK 现成）。
  4. 面数：游戏里角色约 80px 高、2.5D 卡通，**1k–15k 面足够**；别拿电影级高模（烘焙慢且没必要）。

### 8.2 改造韩立（部位拆解 + 配色）
韩立是《凡人修仙传》男主：出身农家、后成仙，常着素袍。本项目定妆：**青袍 + 墨发髻 + 竹绿腰带 + 长矛**。
- **身体 / 衣**：基底自带衣裤，或直接加一件 **青袍** 外罩（用 cone/cylinder 做下摆 + 躯干片）覆盖下半身与肩。色取沉稳青蓝绿，`RGB≈(0.10, 0.42, 0.40)`（十六进制 ~`#1A6B66`）。
- **头 / 发**：基底头 + 加 **墨发髻**——头顶一个黑色发髻（球/胶囊，黑 `RGB≈(0.02,0.02,0.03)`），可加发带；面部留素面或简单五官。
- **腰带**：腰间一圈 **竹绿** 腰带（torus 或薄圆柱），`RGB≈(0.42,0.55,0.18)`（~`#6B8C2E`）。
- **武器 长矛**：细长杆（cylinder，长约身高 1.3 倍）+ 枪头（cone）。**必须 parent 到手骨**——用 `parent_set(type='BONE')` 保留世界变换，别手动设 `parent_bone`（会偏移，见 §7 坑）。
- 配色录入：prep 的 `toonify` 会**保留原材质颜色**（读原有 Base Color 输入；无则回退灰）。所以直接在 Blender 里把各部位材质颜色调好即可，prep 只换 shader 为 Toon、不覆盖色。

### 8.3 绑骨（Rigify）
- 加 `Armature` → `Add` → `Armature` → 选 **Human (metarig)**（Rigify 的）。
- 编辑 metarig 对齐基底关节（肩/肘/腕/髋/膝/踝）；手指/面部可简化（2.5D 看不清，省事）。
- Object Mode → 选中 Armature 物体 → 侧栏 `Armature` → `Rigify Buttons` → **Generate Rig**（生成带 IK 的 `rig`）。
- 选中网格 + 选 `rig` → `Parent` → **With Automatic Weights**。
- 裙摆 / 披风：加 2–3 根额外骨骼驱动，或挂 **Cloth 模拟**（烘焙时出真实飘动，最省事的次级运动）；用 Cloth 需让 prep/bake 场景里能结算（EEVEE 可跑 cloth，无需预烘）。
- 权重修：肩/肘/膝/裙摆处补几笔，避免穿插/破面。

### 8.4 做 8 个命名 Action（严格同名！）
bake 脚本**按名字取帧**，名字错一个字母就丢 clip。命名必须：`idle / walk / attack / cast / skill / hurt / death / dodge`。
| clip | 内容要点 | fps×帧 | 备注 |
|---|---|---|---|
| idle  | 呼吸微动（胸/肩起伏） | 8×16  | 循环，脚不动 |
| walk  | 双腿反相迈步 + 重心左右移 | 10×12 | 循环，**根骨原位**（相机固定只动骨，脚落同点） |
| attack| 抬矛过头 → 下劈 → 回弹 | 20×10 | **第 6 帧=打击帧**（hit:6） |
| cast  | 聚气后仰 + 双手前推（可加发光空物体） | 10×16 | 循环 |
| skill | 提气后仰 → 前送爆发 | 20×18 | **第 11 帧=打击帧**（hit:11） |
| hurt  | 后仰 + 退半步 | 12×6  | |
| death | 前旋 / 后倒地 | 12×14 | |
| dodge | 侧翻 / 急闪 | 20×8  | |
- 每个 action 长度 **至少** 表里 `count` 帧（bake 从 action 首帧连取 `count` 帧；不足会提前停、多余帧忽略）。
- 根骨/原点固定、相机固定、**只动骨骼** → 脚始终落同点，帧间构图一致（2.5D 序列帧的关键）。
- 打击帧在动作里打 marker，bake 用 `hit` 偏移触发刀光/伤害（与游戏 A1 打击帧机制对齐）。

### 8.5 导出 / 交给我
- 存 `.blend` 直接给我最稳（保留全部 rig/action/材质）。
- 或导出 `.glb`：`File → Export → glTF 2.0`，勾 `Include`（全选 armature+meshes）、`Transform`（+Y Up 由导出器处理）、`Animation`（Export Animation ✓）、`Skinning`（Export Skinning ✓）。
- **交付前自检**：场景里有那 8 个同名 Action（Dope Sheet → Action Editor 下拉能看到，或 NLA）；角色大致在原点、脚贴地；武器已绑到手骨。
- 然后我跑：
```pwsh
$b = "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
& $b --background --python tools/blender_prep.py -- --in 韩立.glb --out 韩立_prepped.blend
& $b --background --python tools/blender_bake.py -- --blend 韩立_prepped.blend --out public/art/hanli_sheet.png --usecamera
```
- 若渲出来面朝左：prep 加 `--view -1,1,0.6` 翻向；若构图太满/太松：调 `--pad`。

### 8.6 常见坑（对照 §7）
- 手动 `parent_bone` 导致网格偏移 → 用 `parent_set(type='BONE')`。
- headless 渲染 `TrackTo` 不求值 → 已改 `aim_camera`；**你自己模型里也别依赖 TrackTo 相机**，交给 prep 的自动取景。
- Action 命名 / 数量不对 → 图集对应 clip 空白或错位。
- 角色不在原点 / 尺度离谱 → prep 自动取景能救，但根骨固定仍是好习惯。
- 面数过高 / 用 Cloth 却没让场景结算 → 烘焙慢或飘动不生效。

