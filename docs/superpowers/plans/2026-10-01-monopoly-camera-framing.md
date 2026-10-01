# 大富翁 · 相机取景策略 落地规格

- 日期：2026-10-01
- 仓库：`d:\zhao\monopoly`（双阳鹿乡大富翁营销小游戏）
- 目标：**在不降低清晰度、不缩 UI、不拖节奏、不改游戏判定的前提下，把"当前操作对象"放大到近景。**
- 一句话方案：把世界层从统一基准里解耦出来，给它一个自带相机（`translate + scale`）；移动 / 买卖 / 收租时按「导演镜头」三段编排把相机推到棋子跟前，UI 层与游戏逻辑完全不受影响。

---

## 0. 先定验收口径：什么叫「不影响游戏效果」

七条硬保障，每条都对应一个可自动化的闸门（§8）。任何一条不成立，本规格不算达成。

| # | 保障 | 机制 | 闸门 |
|---|---|---|---|
| G1 | **UI 尺寸不缩** | DOM 覆盖层（HUD / 面板 / 引导 / 底坞）挂在 `#mono-ui`，不在相机作用域内 | V16 |
| G2 | **清晰度不降** | 世界内容为矢量 `Graphics`，放大只是把同一份矢量按更大的 backing-store 区域栅格化；单帧绘制区间的**源逻辑像素密度只增不减** | V15 |
| G3 | **命中不错位** | 移动期为阻塞态（世界层无可点项）；仅在决策期取景时对 `onPick` 做一次相机反变换 | V19 + e2e |
| G4 | **动效不跑位** | `fx` 层按空间归属拆成 `fxWorld`（跟相机）/ `fxUi`（不跟相机） | §7 清单 + e2e |
| G5 | **首屏零回归** | `CAM_IDLE_ZOOM = 1.0`，静止态相机 = 恒等变换，与改动前逐像素一致 | V19 |
| G6 | **节奏不变慢** | 单次取景总时长 ≤ `CAM_MAX_TOTAL_MS`；AI 回合压缩；`?nofx=1` / `prefers-reduced-motion` 直接 snap | V19 + e2e |
| G7 | **可一键关停** | `?cam=0` 完全回到现状（用于线上兜底与 A/B 回归对比） | V19 |

---

## 1. 现状与根因（已核实的数据）

### 1.1 当前缩放模型

- `mono.html` 只有 `<div id="mono-fit"><canvas id="stage"></canvas></div>`；`src/main.ts` 的 `fitStage()` 计算 `k = min(vw/390, vh/844)` 并把 `translate(dx,dy) scale(k)` 写到 `#mono-fit`。
- **画布与全部 DOM 覆盖层都是 `#mono-fit` 的子节点** —— 一个变换同时缩了世界与 UI。
- 后果：360×640 手机 `k≈0.76`（14px 字 → 10.6px、46px 按钮 → 35px）；1440×900 桌面 `k≈1.07` 但只用掉 416px 宽（两侧各 512px 黑边）。
- 这是**等比缩小降级**，不是画质降级 —— `createStage()` 用 `resolution: devicePixelRatio || 2` + `autoDensity: true`，画质本身是够的。

### 1.2 棋盘几何（本规格全部取景数字的来源）

`src/skin/layout.ts:56` `DEFAULT_GEO = { hw: 21.5, hh: 18, ox: 152, oy: 64 }`；`src/data/board.ts:10-11` `BOARD_COLS=11, BOARD_ROWS=7`（环长 32）。

| 量 | 值 |
|---|---|
| 等距单步位移（沿一条边前进 1 格） | `(±hw, ±hh) = (±21.5, ±18)` |
| 单格屏幕足迹 | `2hw × 2hh = 43 × 36` |
| 棋盘屏幕外包（含格足） | `387 × 324`，落在舞台 y ∈ [46, 370] |
| 舞台 | `STAGE_W=390, STAGE_H=844` |

> 注：`(c−r)` 取值域 `−6..10` 共 16 步 ⇒ 水平跨 344 + 格足 43 = 387；`(c+r)` 取值域 `0..16` 共 16 步 ⇒ 垂直跨 288 + 格足 36 = 324。

### 1.3 取景视口（相机可用的舞台区域）

上下被 DOM 占据的部分不能被相机使用：

```
export const CAM_VIEW_TOP    = 34;    // = BOARD_TOP，顶带 HUD_TOP_H(30) 之下
export const CAM_VIEW_BOTTOM = 606;   // = DOCK_Y，底坞之上
export const CAM_VIEW_CX     = STAGE_W / 2;                        // 195
export const CAM_VIEW_CY     = (CAM_VIEW_TOP + CAM_VIEW_BOTTOM) / 2; // 320
export const CAM_VIEW_W      = STAGE_W;                            // 390
export const CAM_VIEW_H      = CAM_VIEW_BOTTOM - CAM_VIEW_TOP;     // 572
```

---

## 2. 相机模型

### 2.1 坐标系分层

```
#mono-world  ← fitStage() 统一缩放（页面适配，与现状同源）
  └─ canvas#stage
       └─ pixi app.stage
            ├─ world      ← 【相机作用域】scale(z) + position，承载 ground/labels/pieces/fxWorld
            └─ fxUi       ← 【不跟相机】骰子翻滚 / 卡面翻牌 等 UI 空间动效
#mono-ui     ← fitUi() 独立缩放，挂 HUD / panels / slots / tour / setup / share（DOM）
```

关键：**相机是画布内部的容器变换，不是画布自身的变换**。`#mono-fit` 的页面适配逻辑保持不变（只是作用对象收敛到 `#mono-world`）。

### 2.2 映射公式

给定目标中心 `(cx, cy)`（舞台空间）与倍率 `z`：

```
world.scale.set(z);
world.position.set(CAM_VIEW_CX - cx * z, CAM_VIEW_CY - cy * z);
```

`z = 1, cx = CAM_VIEW_CX, cy = CAM_VIEW_CY` 时退化为恒等变换 ⇒ 首屏与现状逐像素一致。

### 2.3 为什么放大不糊（G2 的技术依据）

| | 全景 (z=1) | 近景 (z=2.0) |
|---|---|---|
| 棋盘可见宽度 | 387 逻辑单位 | 195 逻辑单位（棋盘的 50%） |
| 画布 backing store | 390 × dpr | 390 × dpr |
| 源逻辑单位 → 物理像素 | 1 : dpr | 1 : 2·dpr |

近景下**每个源逻辑单位用掉两倍的物理像素**，方向是变密而不是变稀。加上建筑全部由 `src/render/providers/proc-building.ts` 的矢量 `Graphics` 程序化生成（无位图放大），**放大近景在数学上不可能比全景更糊**。

唯一的位图来源是贴图素材（`assets.ts` 的 `getTexture`）；规格要求对这类 sprite 统一开 `mipmap: 'on'`，避免线性采样的锯齿。

---

## 3. 取景策略规格

### 3.1 三种策略对照

| 策略 | 行为 | 6 步时的倍率 | 优点 | 致命问题 |
|---|---|---|---|---|
| **A 固定取景** | 全程一个框，框住整条路径 | ≈ 2.02× | 起点终点同屏，一眼看清全程 | **长距离会反而缩小**：12 步时 fit=1.21×，16 步时 fit<1× |
| **B 恒定跟拍** | 固定倍率，镜头跟着棋子平移 | 3.60×（固定） | 格子最清楚，有速度感 | 起点与终点都在画外，"前进 6 步"读不出来 |
| **C 导演镜头** ⭐ | 拉远框全程 → 推近跟拍 → 落点回拉 | 2.02 → 3.60 → 3.02 | 自适应步数，兼顾"看懂"与"好看" | 三段编排，实现量最大 |

**采用 C。** A 会被长距离反噬、B 会丢失上下文，只有 C 能在 1 步到 30 步的全区间都给出合理取景。

### 3.2 C 的三段编排

| 段 | 取景 | 时长 | 用什么驱动 |
|---|---|---|---|
| ① 起势 lead | `frameFor(整条路径的 bbox)` | `CAM_LEAD_MS = 380` | 一次 `to()` |
| ② 跟拍 follow | 中心 = 棋子当前格（逐格插值），倍率 = `CAM_FOLLOW_ZOOM` | `FX_HOP_MS × (格数−1)` | 与 fx 共时轴的折线时间线 |
| ③ 落点 settle | `frameFor(落点格 ∪ 前 1 格 ∪ 后 1 格)` | `CAM_SETTLE_MS = 320` | 一次 `to()` |
| ④ 归位 back | `zoom = 1` 恒等 | `CAM_BACK_MS = 520` | 结算关闭后 |

② 的长度由 fx 决定（`FX_HOP_MS × (格数−1)`，6 步 = 1600ms），**相机不能自行压缩它**——压缩了就会与棋子位移脱同步，立刻露馅。

因此 `CAM_MAX_TOTAL_MS = 1600` 的口径是 **①+③+④ 的"编排开销"上限**，不是整段取景的总时长：

```
overhead = CAM_LEAD_MS + CAM_SETTLE_MS + CAM_BACK_MS = 1220  ≤ 1600   ✅
若 CAM_AI_SCALE 生效：overhead × 0.6 = 732                                   ✅
```

当 ①（起势）按 §3.3 被判定为退化而跳过时，overhead 进一步降到 840。

### 3.3 倍率公式与 clamp / 退化规则

```
frameFor(bbox, view, zRange):
  fit  = min(view.w / bbox.w, view.h / bbox.h)
  zoom = clamp(fit, zRange.min, zRange.max)
  return { cx: bbox.cx, cy: bbox.cy, zoom }
```

bbox 计算（`padCells` 为外扩格数，规格取 `CAM_TILE_PAD = 1`）：

```
bboxOf(cells):
  用 ipos(c, r, geo) 换算格心
  w = (maxX − minX) + 2·hw + 2·padCells·hw
  h = (maxY − minY) + 2·hh + 2·padCells·hh
  cx = (maxX + minX) / 2 ;  cy = (maxY + minY) / 2
```

**实测倍率表**（视口 390×572，`hw=21.5, hh=18, pad=1`）：

| 场景 | bbox（舞台单位） | fit | clamp 后 |
|---|---|---|---|
| 单格 | 86 × 72 | min(4.53, 7.94) = 4.53 | **4.00**（受 `CAM_MAX_ZOOM`） |
| 落点 3 格 | 129 × 108 | min(3.02, 5.30) = 3.02 | **3.02** |
| 6 步笔直段 | 193.5 × 162 | min(2.02, 3.53) = 2.02 | **2.02** |
| 8 步笔直段 | 236.5 × 198 | min(1.65, 2.89) = 1.65 | **1.65** |
| **9 步笔直段** | 251 × 216 | min(1.55, 2.65) = 1.55 | **1.55 < min ⇒ 退化** |
| 12 步笔直段 | 322.5 × 270 | min(1.21, 2.12) = 1.21 | **退化** |
| 全景 | 387 × 324 | min(1.01, 1.77) = 1.01 | **1.00** |

**退化规则（最重要的一条护栏）**：

> 当 `fit < CAM_MIN_ZOOM`（本盘几何下即 **步数 ≥ 9**）时，**跳过 ① 起势段**，直接由全景推到 ② 跟拍。
> 否则 A 的取景会把相机拉得比全景还远，出现"越走越远"的反效果。

**拐角修正**：等距环在拐角处转向，单轴位移会反向。实测**拐角不会让 bbox 变大**（每步在两轴各自最多 `hw`/`hh`，5 步的上界就是笔直段），所以拐角只会让取景更宽松。但算法仍必须用**并集包围盒**（`bboxUnion`）而非路径形状，否则拐角处会算出一个装不下路径的框。

### 3.4 常量（可直接粘贴进 `src/skin/layout.ts`）

```ts
/* —— 相机取景（spec：2026-10-01-monopoly-camera-framing）——
   `src/render/camera.ts` 与 `src/core/framing.ts` 处于「禁写死」gate 作用域内，
   故裸倍率/时长/边距一律集中在此（本文件不在 gate 内）。 */
export const CAM_VIEW_TOP = 34;
export const CAM_VIEW_BOTTOM = 606;
export const CAM_VIEW_CX = STAGE_W / 2;
export const CAM_VIEW_CY = (CAM_VIEW_TOP + CAM_VIEW_BOTTOM) / 2;
export const CAM_VIEW_W = STAGE_W;
export const CAM_VIEW_H = CAM_VIEW_BOTTOM - CAM_VIEW_TOP;
export const CAM_IDLE_ZOOM = 1;          // 静止态 = 恒等变换（首屏零回归）
export const CAM_MIN_ZOOM = 1.6;         // 低于此值判为「退化」，跳过起势段
export const CAM_MAX_ZOOM = 4;           // 单格取景的理论值为 4.53，封顶防过近
export const CAM_FOLLOW_ZOOM = 3.6;      // 跟拍段固定倍率（可见 ≈2.5 格宽 × 4.4 格高）
export const CAM_TILE_PAD = 1;           // 取景外扩格数
export const CAM_DEGRADE_EPS = 0.02;     // fit 与 CAM_MIN_ZOOM 的容差（浮点）
export const CAM_LEAD_MS = 380;
export const CAM_PUSH_MS = 420;          // 起势 → 跟拍 的过渡
export const CAM_SETTLE_MS = 320;
export const CAM_BACK_MS = 520;
export const CAM_MAX_TOTAL_MS = 1600;    // ①+③+④ 编排开销上限（② 与 fx 共时轴，不可压缩）
export const CAM_AI_SCALE = 0.6;         // AI 回合取景时长压缩比
export const CAM_EASE = FX_EASE_FALLBACK;

/* —— 拆层（DOM 空间）—— */
export const UI_BREAK_W = 900;           // ≥ 此宽度视为桌面：UI 不再跟 min() 一起缩
export const UI_SIDE_W = 220;            // 桌面常驻侧栏宽度
export const UI_MIN_HIT = 44;            // 按钮命中高下限
export const UI_MIN_FONT = 12;           // 正文最小字号

/* —— 烘焙（与相机共存）—— */
export const BAKE_DPR_CAP = 2;           // 仅用于 RenderTexture；主画布 resolution 不动
```

---

## 4. 触发时机表

| 时机 | 相位 | 取景 | 备注 |
|---|---|---|---|
| 首屏 / 归位 | `idle` | `zoom = 1` 恒等 | G5 |
| 掷骰动效 | `idle` | 轻推至 `CAM_MIN_ZOOM`，中心 = 掷骰者所在格 | 骰子本体在 `fxUi`，不跟相机 |
| **前进 N 步** | `roll → settle` | ① 起势 → ② 跟拍 → ③ 落点（N ≥ 9 时跳过 ①） | 主用例 |
| 停留结算 | `settle` | 保持 ③ 落点取景 | 直到面板关闭 |
| 买地 / 升级 | `settled` | `frameFor(该格 ∪ 环上前后各 1 格)` = 3.02× | 320ms |
| 收租 | `settled` | `frameFor(收租方格 ∪ 地主格)` 并集 | 320ms |
| **抽卡 / 命运 / 结算面板** | 面板期 | **不取景**（回位到 1.0） | 面板占 `y ∈ [150, 630]`，与 `CAM_VIEW` 几乎完全重叠，取景会被遮住，纯浪费且干扰读数 |
| AI 回合 | 全部 | 同规则，时长 × `CAM_AI_SCALE` | 与「加速 ×2 / 跳过」快捷键不冲突（跳过时直接 snap 归位） |

**取景禁区**：当 `#mono-panels` 有任一浮层展开时，相机**保持不动**（不推近也不回拉），避免与面板边缘产生视差抖动。

---

## 5. 新增模块与接口

### 5.1 `src/core/framing.ts`（新增，纯函数，可单测）

```ts
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }
export interface CamPose { cx: number; cy: number; zoom: number }
export interface CamKeyframe { at: number; pose: CamPose }   // at = 归一化时间 0..1

/** 格序列 → 舞台空间包围盒（含格足与 padCells 外扩） */
export function bboxOf(cells: readonly (readonly [number, number])[], padCells: number,
                       geo: Geo): BBox;

/** 并集包围盒（路径跨拐角必须用并集，不能用首尾连线） */
export function bboxUnion(a: BBox, b: BBox): BBox;

/** 把 bbox 装进 view，倍率 clamp 到 [min, max] */
export function frameFor(b: BBox, view: View, min: number, max: number): CamPose;

/** C 的三段编排；返回 fit < min+eps 时自动跳过起势段的序列 */
export function choreography(cells: readonly (readonly [number, number])[],
                             geo: Geo, view: View,
                             opts: { min: number; max: number; follow: number; pad: number }): CamKeyframe[];
```

`choreography` 必须覆盖的边界用例（写成 vitest）：

- 1 格 / 2 格 / 6 格 / 8 格 / 9 格 / 16 格 / 32 格（整圈）
- 笔直段 vs 单拐角 vs 双拐角
- `fit` 恰好等于 `CAM_MIN_ZOOM ± CAM_DEGRADE_EPS` 的临界
- 空数组（防御性返回恒等位姿）

### 5.2 `src/render/camera.ts`（新增，有副作用）

```ts
export interface CameraHandle {
  /** 补间到目标位姿（ms 为 0 时等价于 snap） */
  to(pose: CamPose, ms: number, ease?: string): void;
  /** 立即到位（`?nofx=1` / prefers-reduced-motion / 跳过时用） */
  snap(pose: CamPose): void;
  /** 归位到恒等（zoom = 1） */
  reset(ms?: number): void;
  /** 跟拍段的折线时间线：沿 cells 逐格推进，倍率恒为 follow */
  follow(cells: readonly (readonly [number, number])[], totalMs: number, geo: Geo): void;
  current(): CamPose;
  busy(): boolean;
  /** 与 fx 同一时轴缩放源（`?speed=` / `?nofx=1` 联动） */
  setTimeScale(v: number): void;
  destroy(): void;
}

export function createCamera(deps: { world: Container; app: Application }): CameraHandle;
```

**时轴同源**：`camera` 与 `fx` 必须共用同一 `timeScale`。若 `fx.speed()` 的实现是全局 timeline 缩放（GSAP `globalTimeline.timeScale`），则零改动；否则在 `main.ts` 的两处 `fx.speed(...)` 调用点旁并联 `camera.setTimeScale(...)`。**这是 G6 的关键点，实现时必须先确认 `fx.ts` 的 `speed()` 实现方式。**

### 5.3 `src/render/stage.ts`（改造）

```ts
export interface Stage {
  app: Application;
  world: Container;                       // 新增：相机作用域
  layers: {
    ground: Container; labels: Container; pieces: Container;
    fxWorld: Container;                   // 原 fx 中「世界空间」部分
    fxUi: Container;                      // 原 fx 中「UI 空间」部分（app.stage 直挂，不受相机影响）
  };
  destroy(): void;
}
```

容器树：

```
app.stage
  ├─ world  (cullable = true, cullArea 跟随相机)
  │    ├─ ground → labels → pieces → fxWorld
  └─ fxUi
```

### 5.4 `src/render/fx.ts`（改造）

- `FxDeps.fxLayer` 拆为 `fx: { world: Container; ui: Container }`。
- 新增空间归属映射表（**逐 `FxKind` 归类，漏一个就是可见错位**）：

| 空间 | `FxKind` | 依据 |
|---|---|---|
| **world**（跟相机） | `hop`、`dust`、`buy`、`upgrade`、`rent`、`shard`、`end` | 落点由格坐标 `ipos` 算出，属世界空间 |
| **ui**（不跟相机） | `dice`、`card`、`deck`、`stock`、`shine` | 落点用 `FX_DICE_CX/CY`、`FX_CARD_CX/CY` 等底坞 / 面板常量 |

- `FxContext` 新增 `cells?: readonly (readonly [number, number])[]`（本次移动经过的格序列），供相机 `follow()` 复用同一份路径，**避免两处各算一次路径**。

### 5.5 `src/ui/tutorial.ts`（改造 —— 拆层后必须改）

已核实：引导环是 **DOM**（`#mono-tour` 内的 `<div class="mono-tour-hl">`），不是 Canvas。

- 现状：`layer.style` 写死 `width:390px;height:844px`，高亮 `left/top/width/height` 直接取 `step.rects`（舞台空间）。
- 拆层后 `#mono-tour` 挂到不缩放的 `#mono-ui`，容器必须改 `inset:0` 撑满视口，否则只盖住左上角、`0 0 0 9999px` 挖洞压暗也只压左上角一块。
- **已核实 [data/tutorial.ts](../../../monopoly/src/data/tutorial.ts) 的 4 步共 6 个 rect 全部指向 UI 层元素**（底坞主按钮、骰子、买地/升级按钮、顶部资产条、手牌槽、AI 资产条），**无一指向棋盘世界层** ⇒ 只需为引导层提供**单一的 UI 空间变换**，6 个 rect 的数值一个都不用改。

---

## 6. 逐文件改动清单

### P0 · 解耦与相机基座（目标：无任何可见变化，闸门全绿）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `mono.html` | `#mono-fit` 拆为 `#mono-world`（含 canvas）与 `#mono-ui`；`transform-origin: 0 0` 各自保留 |
| 2 | `src/main.ts` | `fitStage()` 只作用于 `#mono-world`；新增 `fitUi()`（`vw ≥ UI_BREAK_W` 时只跟高，否则沿用 `min()`）；DOM 挂点 `fitRoot` 改 `#mono-ui`；`resize/orientationchange` 两个监听同时调两个 fit |
| 3 | `src/render/stage.ts` | 新增 `world` 容器与 `cullable`；`fx` 拆 `fxWorld` / `fxUi` |
| 4 | `src/render/fx.ts` | `fxLayer` → `{ world, ui }`；新增 `FX_SPACE` 归属表；`FxContext` 加 `cells?` |
| 5 | `src/skin/layout.ts` | 粘贴 §3.4 全部常量 |
| 6 | `src/core/framing.ts` | **新增**（纯函数，§5.1） |
| 7 | `src/render/camera.ts` | **新增**（§5.2） |
| 8 | `src/ui/tutorial.ts` | `#mono-tour` 改 `inset:0` + rect 经 `fitUi()` 换算 |
| 9 | `local/mono-prod-check.mjs` | 新增 V15–V17 |
| 10 | `docs/manual-mono.md` | 新增 M15 节（拆层行为 + `?cam=0` 说明） |

### P1 · 取景编排（C 三段生效）

| # | 文件 | 改动 |
|---|---|---|
| 11 | `src/main.ts` | 解析 `?cam=0/1`；在移动 / 买卖 / 收租 / 归位各处接 `camera`；`fx.speed()` 旁并联 `camera.setTimeScale()` |
| 12 | `src/core/board-path.ts` | 暴露「本次移动经过的格序列」（若 `advance` 已产出则直接复用，不新造） |
| 13 | `src/ui/aiDriver.ts` | AI 回合时长 × `CAM_AI_SCALE`；「跳过本次」时直接 `camera.reset(0)` |
| 14 | `src/render/Scene.ts` | `onPick` 增相机反变换；`cullArea` 跟随相机包围盒 |
| 15 | `src/render/assets.ts` | sprite 统一 `mipmap: 'on'` |
| 16 | `src/ui/themeConsole.ts` | `?debug=1` 控制台加相机面板（只读显示 `current()` + `CAM_FOLLOW_ZOOM` 滑杆），用于调参 |
| 17 | `local/mono-prod-check.mjs` | 新增 V18–V20 |
| 18 | `local/mono-e2e-playthrough.mjs` | 断言移动期 `world.scale.x ≥ CAM_MIN_ZOOM` 且归位后回到 1.0 |

### P2 · 近景建筑增强（近景放大后才看得见，故排最后）

| # | 文件 | 改动 |
|---|---|---|
| 19 | `src/render/providers/proc-building.ts` | 体型变体 / 轮廓阶梯 / 台阶铺装（**新增几何一律以 params 键落地走取值器，否则被 `check-hardcoded.mjs` 拦下**） |
| 20 | `public/skins/default/skin.json` + `tools/registry-ids.json` | 新增 `variant` / `step` / `apron` 键并登记 |
| 21 | `local/mono-shots-*.mjs` | 新增「取景态」手机视口截图（390×844 @dpr2） |

> 与既有 B+ 规格的关系：B+ 的**烘焙（RenderTexture）与后处理**仍是 P1 项，但**优先级低于相机** —— 相机的收益（可读性）是确定的，后处理是观感加分。两者可并行，互不阻塞：后处理在 `app.stage` 层，不受 `world` 变换影响。

---

## 7. 风险与回退

| # | 风险 | 触发条件 | 缓解 / 回退 |
|---|---|---|---|
| R1 | **引导环错位** | `tutorial.ts` 漏改（`inset:0` 或 `fitUi()` 换算漏一处） | 已核实只需单一 UI 空间变换，6 个 rect 无需改数值；V16 覆盖 |
| R2 | **fx 空间错配** | `FX_SPACE` 表漏归类某个 `FxKind` | 漏一个即"取景时骰子飘到世界坐标"。缓解：`FxKind` 是联合类型，用 `Record<FxKind, 'world' \| 'ui'>` 让 TS 穷尽检查（漏一个编译就报错）——**用类型系统而不是人工核对来兜这条** |
| R3 | **取景态绘制量上升** | 放大后棋盘 32 格多数在画布外，Pixi 若不裁剪则 draw 数不降反升 | `world.cullable = true` + `cullArea` 跟随相机；退化路径 = 关闭后处理 + `CAM_MAX_ZOOM` 降到 3.0；V20 兜底 |
| R4 | **长距离取景退化遗漏** | 9 步以上仍走起势段 ⇒ 越走越远 | `choreography()` 内部判定，不用调用方判断；vitest 覆盖 9/16/32 格 |
| R5 | **相机与 fx 不同步** | `fx.speed()` 非全局 timeline 缩放 ⇒ `?nofx=1` 时相机还在补间 | 实现前先确认 `fx.ts` 的 `speed()` 实现；V19 断言 `?nofx=1` 下取景瞬间到位 |
| R6 | **桌面 UI 变小** | 拆层后桌面 `k` 不再放大 UI | 这是**有意为之**（两端格子物理尺寸拉齐），但需 V17 确认 `#mono-world` 占宽 ≤ 40% 且侧栏存在，避免"空了一半屏" |
| R7 | **烘焙失效时机**（B+ 既有） | 漏一次 `invalidate()` ⇒"买了地没显示" | e2e 973 次点击覆盖；V18 断言静止态重绘 = 0 |

**总回退开关**：`?cam=0` → 相机完全不介入（`to/snap/reset` 全部退化为恒等），行为与改动前一致。用于线上兜底与回归对比。

---

## 8. 新增闸门（`local/mono-prod-check.mjs`）

| 闸门 | 断言 |
|---|---|
| **V15** | canvas backing store 的 `resolution` 与改动前一致（**未降 dpr**）—— 对应 G2 |
| **V16** | `#mono-ui` 的 computed transform 不含 `scale(k≠1)`；361×640 视口下按钮命中高 ≥ `UI_MIN_HIT` —— 对应 G1 |
| **V17** | 1440×900 下 `#mono-world` 占宽 ≤ 40% 且左右侧栏存在 —— 对应 R6 |
| **V18** | 烘焙层存在时，静止态连续 2 帧 `RenderTexture` 重绘次数 = 0 —— 对应 R7 |
| **V19** | 取景态 `world.scale.x ∈ [CAM_MIN_ZOOM, CAM_MAX_ZOOM]`；退出后回到 `1.0 ± 0.01`；`?cam=0` 与 `?nofx=1` 下恒为 `1.0` —— 对应 G3/G5/G6/G7 |
| **V20** | `?perf=1` 采样 300 帧，p95 帧间隔 ≤ 16.7ms；超限时后处理自动关闭且 `CAM_MAX_ZOOM` 降到 3.0 —— 对应 R3 |

---

## 9. 验收（DoD）

- [ ] `npx tsc --noEmit` = 0
- [ ] `npm run build` 通过（含 `tools/check-hardcoded.mjs` clean —— `camera.ts` / `framing.ts` 在 gate 作用域内，**不得出现裸倍率 / 裸时长**）
- [ ] `npm run lint:skin` 通过（本轮若未动 skin 则不受影响）
- [ ] `npx vitest run`：新增 `framing.spec.ts`，覆盖 §5.1 的全部边界用例
- [ ] `npm run deploy` 成功（本地构建 → scp → 服务器解压 + `pm2 restart`，**不在服务器构建**）
- [ ] `npm run check:prod` V1–V20 全 `true`
- [ ] `npm run e2e:play` PASS，且新增取景态断言通过
- [ ] **手机视口截图（390×844，dpr=2，Playwright 移动视口）**：全景 / 起势 / 跟拍 / 落点 / 归位 五态各一张，补进 `docs/manual-mono.md` M15 节
- [ ] 360×640 真机视口跑一遍，确认取景态格子命中率不下降

---

## 10. 非目标（明确排除）

- **不做自由拖拽 / 捏合缩放** —— 会与 DOM 命中层坐标系打架，收益也不如编排式取景
- **不做旋转 / 倾斜**
- **不做第三人称跟随** —— 棋盘是俯视等距，没有"背后视角"的语义
- **不改游戏判定** —— 相机是纯视觉层，**不写入任何 state**，与 `fx` 同一原则
- **不改主画布 `resolution`** —— 保持 `devicePixelRatio || 2`，零清晰度回归（`BAKE_DPR_CAP` 只作用于烘焙纹理）

---

## 附：改动后的相机映射示意

```
#mono-world（fitStage 统一页适配）
┌────────────────────────────────┐ y=0
│   #mono-ui 顶带（DOM，不跟相机）  │
├────────────────────────────────┤ y=34   ← CAM_VIEW_TOP
│                                │
│        ┌──────────────┐        │
│        │  world 容器   │        │
│        │  scale(z)     │  取景区 │
│        │  position     │        │
│        └──────────────┘        │
│                                │ y=606  ← CAM_VIEW_BOTTOM
├────────────────────────────────┤
│   #mono-ui 底坞（DOM，不跟相机）  │
└────────────────────────────────┘ y=844
```

`world.position = (CAM_VIEW_CX − cx·z, CAM_VIEW_CY − cy·z)`，使得目标中心 `(cx, cy)` 恰好落在取景区中心 `(195, 320)`。