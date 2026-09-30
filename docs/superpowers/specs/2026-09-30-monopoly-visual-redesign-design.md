# 大富翁 · 画面重设计（配色装配 + 素材扩充 + 店名上房顶 + Q 版小人）Design

**日期：** 2026-09-30
**范围：** `d:\zhao\monopoly`（仓库根 `d:\zhao`）
**目标一句话：** 把画面从「青色霓虹 cyber city」纠正为「吉林双阳鹿乡邻里」的暖调在地感；交付 **5 套配色方案全保留 + 可按单个建筑/单个道具指派配色 + 单个素材可独立设计风格** 的装配体系；把素材库扩到**建筑 6 原型 / 道具 16 / 环境 7 层**；**店铺名从地面移到楼顶、字号加大 +61%**，并**标明当前停留位置**；把棋子从无五官圆柱换成**可爱讨喜的 Q 版小朋友（两男两女、大眼睛 + 腮红 + 围巾铃铛）**，停留事件以**头顶气泡**显性呈现。

---

## 1. 背景与动机

线上现状：`https://game.joho.cn/tour/mono.html`（`mono.js` 483744 bytes，51 文件 / 435 例单测全绿）。玩法闭环（回合 / AI / 卡牌 / 股票 / 引导 / 音效 / 分享）已完备，**问题全部在画面层**。

### 1.1 取证修正（本轮新发现，推翻了上一版结论）

| 原结论 | 实测真相 | 证据 |
|---|---|---|
| 「`building.*.l3` → `hue:200` 导致青玻璃幕墙」 | **该条 skin.json 配置从未生效**。楼体外观被渲染层写死的元素级覆盖挡在 L1 | [BuildingView.ts L90](file:///d:/zhao/monopoly/src/render/BuildingView.ts#L90) `overrides: only(wallId, proc('shop', { levels: lv, hue, brand }))`；[instantiate.ts L84](file:///d:/zhao/monopoly/src/skin/instantiate.ts#L84) 合并后经 [resolve.ts L83](file:///d:/zhao/monopoly/src/skin/resolve.ts#L83) **L1 命中即返回** |
| 「去掉 `hue:200`」 | 青蓝色来自 **4 号玩家的归属色相** | [BuildingView.ts L48-51](file:///d:/zhao/monopoly/src/render/BuildingView.ts#L48-L51) `hueOf()` 取 `OWNER_HUE`；[board.ts L111](file:///d:/zhao/monopoly/src/data/board.ts#L111) `OWNER_HUE = {1:145, 2:32, 3:338, 4:200}` ← 145 青绿 / 200 青蓝 |
| — | **后果**：只要不解除这层写死，任何 skin.json / theme.json 的配色都改不动楼体 | 同上 |

**这条修正决定了本任务的第一个动作**：把「楼体用哪个 preset、什么颜色」下放给 `skin.json` + `theme.json`；渲染层只保留「这栋楼是谁的、几级、叫什么」（走 `state`）。这是让「后台按建筑指派配色」成立的前提。

### 1.2 画面问题清单（含本节修正后的证据）

| # | 问题 | 证据锚点 | 影响 |
|---|---|---|---|
| 1 | **棋盘太小、位置太挤** | `geo.hw=21` → 宽 `16×21=336px`；`BOARD_TOP=34`、棋盘底 ≈276 → **仅占 28.6% 屏高** | 画面主角是画面上最小的一块 |
| 2 | **32 格店名读不出** | [LabelView.ts L48-49](file:///d:/zhao/monopoly/src/render/LabelView.ts#L48-L49) 只 `.fill()` **无描边**；[main.ts L63](file:///d:/zhao/monopoly/src/main.ts#L63) `fs=6.2`；字牌压在**格前沿地面**，与楼体投影抢同一带像素 | 玩家认不出自己站在哪家店门口 |
| 3 | **大量死黑、无空间层次** | `bgTop#1a2b2a / bgBottom#0c1513`，无星点、无远山、无街景 | `?demo=1` 下中部+底部 ≈65% 纯黑 |
| 4 | **风格与题材打架** | 归属色相 145/200 染楼体（见 §1.1）；`board.inner.d1..d8` → `hue:205/268/192/320` 冷色霓虹 | 标题「双阳 · 鹿乡邻里」vs cyber city；与品牌金 `#f5c451` 冷暖对撞 |
| 5 | **中部橱窗与棋盘重复表达同一对象** | `SHOWCASE_Y=322 / SHOWCASE_H=268` 常驻渲染与棋盘同一栋楼 | 占 268px 纵向零新增信息，直接挤压问题 1 |
| 6 | **底部 HUD 无主次** | `HUD_DOCK_H=184`；4 条**等权**资产条（`HUD_BAR_W=86 × 4`） | 三条横向信息带权重相同 |
| 7 | （本轮新增）**素材库过薄** | 建筑只有 1 个 `shop` preset 参数化出 3 级；道具 8 个；环境层 **0 个** | 「多风格」无米下锅——换配色只是换颜色，换不出形态 |

**为什么现在做**：`instantiate()` 的多级回退链 + 「可见像素一律走注册表」纪律（`check-hardcoded.mjs` 强制）已经把「换素材」做成工程能力。**画风重设计不需要碰 `src/core/` 任何一行**。

---

## 2. 非目标（明确不做）

- **不重写棋盘投影**：不做「平面环形桌游」（需重写 `BoardView` / `iso.ts` 投影、命中与全部动画台位）——列为后续独立里程碑，见 §12.2。
- 不改 `src/core/**`（规则、经济、AI、卡牌、股票）；不改存档 / `localStorage` 语义。
- 不改经济数值、棋盘格数 / 索引 / 类型序列、`TILE_*` 数据口径。
- 不改任何动效时长与形态（`FX_*` 保持）；只改**静态画面**与**动效落点台位**（中部橱窗移除后）。
- 不做竖屏以外适配（仍是 390×844 单视口）。
- **不引入位图美术素材**：全部程序化（`proc` preset + 配色参数），零新增网络请求（守 M11「默认皮肤零素材请求」结论）。
- 不做独立 Web 管理后台（本轮形态 = 配置文件 + 游戏内风格控制台，见 §9）。

---

## 3. 视觉规范（Visual Direction）

### 3.1 题材与幻想

**幻想**：你是双阳的一个街坊，在这张「鹿乡镇 32 家好店」的棋盘上买地、盖楼、收租——画面里应该有**鹿茸市场凌晨的灯火、温泉的汤雾、木格窗里的暖光**，而不是一座赛博都市。

**视角**：固定等距（2.5D），无相机控制。玩家动作：掷骰 / 前进 / 结算 / 买地 / 升级 / 用牌。

### 3.2 材质语言

| 项 | 现状 | 目标 |
|---|---|---|
| 楼体 L1 | `shop(1, hue:32)` 平顶小屋 | **坡顶摊位**：木架 + 布篷 + 一盏暖灯泡 |
| 楼体 L2 | `shop(2, hue:30)` | **木格窗门店**：暖黄窗光 + 门头布幌 |
| 楼体 L3 | `shop(3, hue:200)` 青玻璃幕墙 | **灰瓦商超**：砖红瓦顶 + 成排暖窗 + 招牌塔 + 旗杆（**去掉青幕墙与霓虹描边**） |
| 归属编码 | 楼体色相（145/338/200 冷色） | **不再染楼**。改三处编码：① 地砖描边色（既有）② 屋顶归属小旗 ③ 名牌左侧 3px 色条 |
| 地砖 | 深绿灰 `#2f4238` / 边 `#5b7b6a` | 夯土暖褐，**按街区配色**（见 §4.3） |
| 店名 | 6.2px 胶囊压在**格前沿地面** | **楼顶名牌**：`fs 9` 金边深底胶囊 + 描边，见 §6 |
| 背景 | 纯色渐变 | 夜空（星点 + 月 + 远山剪影）+ 近景街市（街灯暖光池 + 灯笼串 + 摊位剪影） |
| 光源 | 无统一光源 | **统一暖光源** `#ffcf7a`：所有窗光 / 灯 / 灯笼同色温；冷色只许出现在「股票所 / 监狱」功能格 |
| 棋子 | 无五官的等距圆柱，整只染归属色 | **Q 版小朋友（两男两女）**：二头身 + 大眼睛高光 + 腮红 + 围巾铃铛；归属只染围巾与头饰（§6.6） |
| 停留反馈 | 地砖描边加粗 + 底栏一行小字 | **头顶事件气泡**（暖白底金边，与深底名牌反相）+ 地砖金环 + 名牌放大（§6.4 / §6.7） |

### 3.3 排版层级

| 角色 | 字号 | 字重 | 用途 |
|---|---|---|---|
| 数字主值 | 13 | 600 | 现金 `￥2820`、租金 `￥105` |
| 标题 / 店名 | 14–15 | 600 | 地块卡店名、面板标题 |
| **楼顶名牌** | **10（4 字）/ 11（≤3 字）**，5 字降 8 | 600 | 32 格店名（原 6.2 → **+61%**），几何上限见 §6.2 |
| **当前格名牌** | 上值 **×1.25** + 亮金描边 | 700 | 玩家停留位置（§6.4） |
| 正文 | 12 | 500 | 状态行、店招、按钮文字 |
| 元信息 | 10 | 400 | 轮次、持有者、说明句 |

### 3.4 动效基调

**不改动效**，只改落点台位：中部橱窗移除后，以 `FX_CARD_CY` / `PLAY_SHOWCASE_Y` 为落点的事件需重新指向棋盘格心或地块卡。基调不变：**先落库、后回放**，动画只消费 `instantiate()` 的实例，绝不写 `state`。

### 3.5 反模式（不许做）

- 不在 `src/render/**` 写裸色值 / 裸时长（`check-hardcoded` 拦截）；**楼体的 preset 名与色值不得再写死在渲染层**（§1.1 的病根）。
- 不为了塞内容缩小字号（名牌最低 `fs=8`，仅限 5 字自动降级；不得再借「挤不下」把字号调回 6 字级）。
- 商铺名与当前格标记的显著性不许只靠颜色：必须叠加尺寸 / 描边 / 形状编码（§6.4）。
- 不给每栋楼配各自颜色——颜色只编码「**配色方案**」，归属只编码在地砖 / 旗帜 / 名牌色条上。
- 不加常驻新面板（已删一个 268px 常驻面板，不许以任何名义补回）。
- 不做渐变卡片底 / 彩色卡片填充（沿用既有 UI 纪律）。

---

## 4. 架构：三层装配模型

**核心思想**：把「画成什么样」从**代码**彻底搬到**数据**，分三层，逐层可覆盖、可单独替换。

```
┌ L0 素材形态 ─────────────────────────────────────────────┐
│ proc-preset（stall / shop / market3 / onsenHouse / gate / │
│ barn …） = 「这块积木长什么形状」                          │
│ 或 image / atlas / frames（商家实拍图、美术位图）           │
├ L1 配色方案 palette（5 套，theme.json 的 palettes 表）────┤
│ 每套 8 个色键 = 「这块积木什么颜色」                        │
├ L2 元素绑定 binding（theme.json 的 bindings 表）──────────┤
│ 「哪个元素用哪个 preset + 哪套 palette + 额外 params」      │
│ 支持 glob 通配 / 按 slot 轮转 / 精确到单个 id              │
└ L3 单素材独立风格 ────────────────────────────────────────┘
  binding 的 params 逐键压过 palette ⇒ 同一素材的另一种「风格」
  甚至可换 preset ⇒ 同一位置换成另一种素材形态
```

**这三层全部编译成一张 `Record<elementId, ProviderSpec>`**，喂给既有 `resolve()` 的 overrides 形参（回退链第 1 级）——**零新增渲染通路**。

### 4.1 五套配色方案（palette）

一套 palette = 8 个色键，全部 5 套**同键名**（可互换）：

| 键 | 含义 |
|---|---|
| `wallL / wallR` | 楼体左墙 / 右墙（右墙亮、左墙暗，保持既有光照方向） |
| `roof` | 屋顶 / 瓦面 |
| `win` | 窗光（统一暖光源基准色） |
| `sign` | 招牌 / 名牌镶边 |
| `tileFill / tileEdge` | 该街区地砖填充 / 描边 |
| `glow` | 氛围光（灯笼、街灯、门口暖光池） |

| # | palette id | 名称 | wallL | wallR | roof | win | sign | tileFill | tileEdge | glow |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | `warm-market` | **暖木市集**（默认） | `#cdb78f` | `#a8926a` | `#8f4a33` | `#ffcf7a` | `#f5c451` | `#4a3b2a` | `#8a7550` | `#ffd9a0` |
| S2 | `snow-deer` | 雪夜鹿乡 | `#dfe7ee` | `#b7c4d0` | `#6f8296` | `#ffcf7a` | `#ffd98a` | `#8fa3b5` | `#c9d6e0` | `#ffe6b8` |
| S3 | `papercut` | 剪纸年画 | `#f5e6c8` | `#e0c49a` | `#c0392b` | `#ffd23f` | `#ffd23f` | `#1f6b3a` | `#f5e6c8` | `#ffd23f` |
| S4 | `onsen-mist` | 温泉汤雾 | `#e8e6e0` | `#c9c6bd` | `#5a6360` | `#ffe9c0` | `#8fc4b8` | `#3a3d3a` | `#8a8f8b` | `#ffe9c0` |
| S5 | `night-neon` | 夜市霓虹 | `#3a3140` | `#2c2532` | `#ff8a3d` | `#ffd23f` | `#ff8a3d` | `#20262e` | `#ff8a3d` | `#ffd23f` |

> 五套的视觉打样本轮已出（「一套素材 × 五套配色」「素材库扩充」两张卡片）。

### 4.2 `theme.json` 数据模型（新增，权威配置）

放在 `public/config/theme.json`，与既有 `shops.json` 同级、同风格（含 `_readme` / `_schema`）：

```jsonc
{
  "_readme": "画面配色装配表。运营改此文件即生效，无需改渲染代码。",
  "_schema": {
    "palettes": "配色方案表：id → 8 个色键",
    "bindings[].match": "元素 id 的 glob（* 匹配任意字符）；按注册表 id 展开",
    "bindings[].preset": "proc preset 名（缺省 → 沿用 skin.json / 内建）",
    "bindings[].palette": "整条 binding 统一用哪套配色",
    "bindings[].paletteBySlot": "32 长度数组，按地块序号逐格给配色；优先于 palette",
    "bindings[].params": "元素级参数，逐键压过 palette（单素材独立风格）"
  },
  "palettes": { "warm-market": { "wallL": "#cdb78f", "…": "…" }, "snow-deer": {}, "…": {} },
  "bindings": [
    { "match": "building.*.l1", "preset": "stall",     "palette": "warm-market" },
    { "match": "building.*.l2", "preset": "shop",      "paletteBySlot": ["warm-market", "…32 项"] },
    { "match": "building.*.l3", "preset": "market3",   "paletteBySlot": ["…"] },

    { "match": "building.s4.*", "preset": "onsenHouse", "palette": "onsen-mist", "params": { "steam": true } },
    { "match": "building.s19.*", "preset": "gate",      "palette": "papercut" },
    { "match": "prop.signTower", "preset": "signTower", "palette": "papercut", "params": { "glow": false } },
    { "match": "board.tile.chance", "palette": "night-neon" },
    { "match": "board.inner.*", "preset": "shop", "palette": "warm-market", "params": { "dim": 0.72 } }
  ]
}
```

**编译（`src/skin/theme.ts`，纯函数）**：

```
compileTheme(theme, allElementIds()) → Record<elementId, ProviderSpec>
  for each binding:
    ids = allElementIds().filter(glob(match))
    for each id, slot:
      palette = paletteBySlot?.[slot] ?? binding.palette
      preset  = binding.preset ?? (由 skin 解析，见 §4.4)
      params  = { ...paletteTokens(palette), ...binding.params }   // params 最后展开 ⇒ 单素材独立风格
      out[id] = { kind:'proc', preset, params }
```

- 坏数据一律**静默跳过该条**（`match` 非字符串 / `palette` 不存在 / `paletteBySlot` 长度 ≠ 32 → 忽略），绝不抛错（沿用 `parseShopConfig` 口径）。
- 与 `shops.json` 的合并顺序：`{ ...themeCompiled, ...shopOverrides }` ⇒ **商家实拍素材永远赢过配色方案**（商家认领优先）。

### 4.3 出厂默认：分区轮转（用户选定）

32 格分 6 条街区，`paletteBySlot` 依序 S1→S5→S1：

| 街区 | slot | palette |
|---|---|---|
| 鹿乡小镇 · 金鹿源 · 命运 · 长峰特产 · 国信温泉 · 机会 | 0–5 | **S1** 暖木市集 |
| 御龙温泉 · 福利 · 吉吉特产 · 命运 · 国玉庄园 · 王氏鹿膏 | 6–11 | **S2** 雪夜鹿乡 |
| 监狱 · 鹿品街 · 机会 · 刘氏鹿茸 · 守鏊仁 · 命运 | 12–17 | **S3** 剪纸年画 |
| 鹿茸市场 · 股票所 · 鹿博物馆 · 机会 · 广生农产 · 命运 | 18–23 | **S4** 温泉汤雾 |
| 黑鱼葡萄 · 机会 · 东龙度假 · 福利 · 巨农采摘 · 命运 | 24–29 | **S5** 夜市霓虹 |
| 神鹿峰 · 机会 | 30–31 | **S1** 暖木市集 |

**效果**：首屏一次看到全部 5 套配色，画面立刻有「城区」层次；后台仍可逐格改（改 `paletteBySlot` 一个元素）。

### 4.4 与既有 `resolve()` 回退链的接合

| 层 | 来源 | 优先级 |
|---|---|---|
| L0 | 商家素材 `public/config/shops.json`（既有，阶段一静态认领） | 最高 |
| L1 | **`theme.json` 编译结果**（palette + binding + 单素材 params） | ↓ |
| L2 | 皮肤包 `skin.json` 的 `elements` / `tokens` / `label` / `geo` | ↓ |
| L3 | 全局默认皮肤 `default` | ↓ |
| L4 | `proc-base.ts` 内建兜底 | 最低 |

实现方式：`main.ts` 装配时 `overrides = { ...compileTheme(theme, allElementIds()), ...shops.overrides }`，其余**零改动**。

---

## 5. 素材库扩充（建筑 6 原型 / 道具 16 / 环境 7 / 棋子 1 / 气泡 1）

### 5.1 建筑原型 6（`src/render/providers/proc-building.ts`）

同一 slot 的楼体 id（`building.s{n}.l{lv}`）**不变**，换的是 binding 指派的 preset：

| preset | 名称 | 形态要点 | 用在 |
|---|---|---|---|
| `stall` | 坡顶摊位 | 木架 + 布篷 + 暖灯泡 + 平摊台面 | L1（`TILE_LEVEL===1`） |
| `shop` | 木格窗门店 | **既有 `shop` 的 L1/L2 分支**（木格窗 + 门洞暖光 + 店招灯箱） | L2 |
| `market3` | 灰瓦商超 | 从既有 `shop` 的 L3 分支**抽出独立**：灰瓦 + 成排暖窗 + 招牌塔 + 旗杆；**删除 `neon` 青描边与 `glass3` 青幕墙** | L3 |
| `onsenHouse` | 温泉汤屋 | 暖帘门 + 汤池 + 汤雾（复用既有 `pool`/`steam` 分支） | 温泉类地块（`s4`/`s6` 等） |
| `gate` | 牌楼门 | 双柱 + 横匾 + 顶檐 + 石狮位 | 地标（`s0` 鹿乡小镇 / `s30` 神鹿峰） |
| `barn` | 鹿舍仓房 | 大坡瓦顶 + 横木门 + 干草堆 | 农产类地块（`s22` 广生农产 / `s28` 巨农采摘） |

**关键改动**：`BuildingView.buildingSpecs` 不再写 `proc('shop', {levels, hue, brand})`，改为**只传 `state`**（`level` / `owner` / `brand`），preset 与色值全部交给 theme + skin 解析。`shop`/`sign` preset 的 `brand` 改从 `ctx.state.brand` 读取（`? p.brand` 兜底）。

### 5.2 道具 16（`prop.*`）

既有 8：`awning` 遮阳篷 / `lantern` 灯笼 / `banner` 幌子 / `rooftopBox` 屋顶箱 / `signTower` 招牌塔 / `antenna` 天线 / `tree` 树 / `lamp` 路灯。

**新增 8**（`src/render/providers/proc-props.ts`，并注册 8 个新 id）：

| 新 id | 名称 | 形态 |
|---|---|---|
| `prop.flagpole` | 旗杆 | 细杆 + 三角旗（归属色可染） |
| `prop.chimney` | 烟囱 | 砖砌方柱 + 暖烟（爬山虎感） |
| `prop.barrel` | 木桶 | 圆柱体 + 箍环 |
| `prop.lionStone` | 石狮 | 基座 + 坐狮剪影 |
| `prop.snowPile` | 雪堆 | 半圆积雪 + 冷高光（S2 街区分区用） |
| `prop.clothesline` | 晾衣绳 | 两点弧线 + 三片布 |
| `prop.steamVent` | 汤雾口 | 石槽 + 上升雾气 |
| `prop.stoneLantern` | 石灯笼 | 基座 + 火袋 + 宝顶（暖光） |

### 5.3 环境层 7（`bg.*`，新增 `src/render/AtmosphereView.ts`）

最底遍（pass 0），静态不随状态重绘：

| 元素 ID | preset | 参数 |
|---|---|---|
| `bg.sky` | `skyGradient` | `top / bottom` |
| `bg.stars` | `starField` | `count / rMin / rMax / fill / alpha` |
| `bg.moon` | `moonDisc` | `x / y / r / fill / haloR / haloAlpha` |
| `bg.ridge` | `ridgeSilhouette` | `peaks[] / fill / alpha` |
| `bg.street` | `streetBand` | `y / h / fill / silhouettes[] / windowFill` |
| `bg.streetLamp` | `streetLamp` | `x / y / poleH / glowFill / glowR` |
| `bg.lanternString` | `lanternString` | `x0 / x1 / y / sag / n / fill / glowAlpha` |

> 命名避开既有 `prop.lamp` / `prop.lantern`（那两件是**挂在格子上**的实体道具，环境层是**背景氛围**）。

### 5.4 棋子与停留气泡（配套素材，见 §6.6 / §6.7）

| id | preset | 说明 |
|---|---|---|
| `piece.p1..p4`（既有 id，**换 preset**） | `pawn`（重写为 Q 版人物） | 四玩家共用 1 个 preset，靠 `state.owner` + `params.style` 分四套造型（男孩短发 / 女孩双马尾 / 男孩小帽 / 女孩丸子头）、`state.mood` 分三表情；**不新增 id** |
| `ui.bubble`（**新增 id**） | `bubble` | 头顶事件气泡，四态参数化（标题 / 金额 / 图标 / 主色）；条件绘制、条件消失 |

**元素预算复核**：当前场景 pass 1–3 = **189 < 200**；氛围 +7、气泡 +1、道具新增不常驻（多数地块不挂）→ 预计 **197**。若超：`bg.stars` 改为单 `Graphics` 多点绘制（合批）。只看 `?perf=1` 的 `scene` 字段。

---

## 6. 店名显示 · 棋子形象 · 停留效果图（用户新要求）

> 视觉打样见本轮对话的「店名浮到楼顶 · 当前停留位置三重标记」与「Q 版小朋友棋子 + 头顶事件气泡」两张卡片。

### 6.1 名词消歧（回答「能不能显示棋盘名称或商铺名称」）

| 概念 | 现成数据 | 显示位置 | 显著性 |
|---|---|---|---|
| **棋盘名称** | 页面标题「大富翁 · 双阳鹿乡邻里」 | **顶栏**（既有，非棋盘内）+ 中庭地面石板 | 中（全局信息，不需争夺注意力） |
| **商铺名称（短名）** | `TILE_SHORT` / `shops.json.short`（2–4 字） | **楼顶名牌**（本轮新增，每个有楼地块一块） | **最高**（每格一块，玩家最常认的锚点） |
| **商家全名 / 品牌** | `TILE_BRAND` / `shops.json.brand` | `building.s{n}.sign` 店招灯箱（既有，可换图片素材） | 中高（商家品牌位，认领用） |
| **当前停留位置** | `currentPlayer().pos` | **三重标记**（§6.4） | **最高**（瞬时状态，必须一眼看到） |

**结论**：商铺名 = 楼顶名牌（新），棋盘名 = 顶栏 + 中庭（既有），两者不冲突、不重复。

### 6.2 名牌字号：几何上限推导（决定「能有多显著」）

等距棋盘密铺 ⇒ 同排相邻格中心差 `Δ = (hw, hh) = (24, 13)`：

```
相邻名牌纵向间距 ≡ 2×hh = 26px（同一排） / 13px（斜邻格）
⇒ 胶囊高度 h 必须 ≤ 13px 才不会互相压住（h=13 时恰好相切）
⇒ 纵向容差被锁死 ⇒ 只能靠横向吃满格宽来放大字号

相邻格横向间距 ≡ 2×hw = 48px
⇒ 胶囊宽 W = n×fs + padX ≤ 48
   n=4, padX=6 → fs ≤ 10.5 → 取 fs = 10（W = 46）
   n=3, padX=6 → fs ≤ 14   → 取 fs = 11（W = 39，留呼吸）
   n=5, padX=6 → fs ≤ 8.4  → 降 fs = 8（W = 46）
   n>5        → 截断为 4 字 + '…'（W = 42）
```

| 字数 | 字号 | 胶囊宽 | 相邻格宽 48 余量 |
|---|---|---|---|
| 2 | 11 | 28 | 20 ✅ |
| 3 | **11** | 39 | 9 ✅ |
| 4 | **10** | 46 | 2 ✅ |
| 5 | 8 | 46 | 2 ✅（自动降级） |
| >5 | — | — | 截 4 字 + `…` |

**对比现状**：`fs 6.2`、无描边、**压在格前沿地面**（与楼体投影抢像素）→ 改为 `fs 10–11`、金描边、**浮到楼顶空域**（周围只有天空/屋顶，对比度最高）。**字号 +61%，背景对比度质变**——这才是「显著」的真正来源，单纯加字号不够。

### 6.3 落位与显著性增强

| 项 | 规则 |
|---|---|
| 落位 | 有楼地块：`y = cy − BUILDING_HEIGHTS[level]×s − 5 − h/2`（浮在楼顶上方 `5px`）；`x = cx`（水平横排，**不随等距旋转**，横排最清晰） |
| 无楼功能格 | 保留地面胶囊（格前沿），沿用现有形态与参数 |
| 描边 | 金边 `1.1px`（`#f5c451`）+ 深底 `#120d09`（对比度 ≈ 11:1，远超 WCAG AA 的 4.5:1） |
| 绘制遍 | **pass 2 压最上层**（既有），任何楼体都盖不住名牌 |
| 顶栏避让 | 后排 L3 楼顶 `y≈58` → 名牌顶边 `≈44` > `BOARD_TOP 34` ✅（`oy 96→104` 下移后余量更足） |
| 与店招分工 | 名牌 = 通用识别（人人可读）；`building.s{n}.sign` = 商家品牌位（可换图）——互补不重复 |

### 6.4 当前停留位置：三重标记（回答「玩家停在哪儿也要标明」）

| # | 标记 | 实现 | 作用 |
|---|---|---|---|
| 1 | **地砖金色双环** | 内环 `1.6px` 实金 + 外环 `3px` 半透明金晕（`dia(..., HW±1.5, HH±1.5)`） | 在棋盘上直接圈出「你在这儿」 |
| 2 | **名牌放大** | 当前格名牌 `×1.25`（`fs 10→12.5` / `11→13.75`）、亮金描边 `1.8px`、文字转**纯白**、胶囊下方加**金色指示三角** | 名字变大 + 变亮 + 有向下指向 |
| 3 | **棋子光晕** | 当前玩家棋子脚下暖色光环 `rgba(255,220,140,.42)` + 白色描边 | 与 AI 棋子（无光环）一眼区分 |

**为什么不只靠颜色**：同时用了**尺寸（×1.25）+ 描边粗细（1.1→1.8）+ 文字色（米白→纯白）+ 形状（加三角）+ 双环**五种编码 ⇒ 色盲 / 强光 / 小屏都成立（符合既有「位置 + 描边双重编码」纪律）。

**棋盘外补一行文字**：落地地块卡（§7.3）首行改为 **「● 停在 国信温泉 · 你在这里」**（金点 + 店名），把棋盘上的瞬时状态同步到文字层。

### 6.5 实现（四处，全在既有文件）

| 文件 | 动作 |
|---|---|
| [LabelView.ts](file:///d:/zhao/monopoly/src/render/LabelView.ts) | `labelPlacement` 增「楼顶分支 / 地面分支」+ 当前格 `×1.25`；`drawLabels` 增 `.stroke()` 与指示三角；`widthFor` 增字号自适应（§6.2 表）；新增 `currentSlot` 入参 |
| [paint.ts](file:///d:/zhao/monopoly/src/render/paint.ts) | 地砖金色双环（当前格 `board.tile.*` 的 `edge` 分支或 `tileEdge` preset 参数化） |
| [layout.ts](file:///d:/zhao/monopoly/src/skin/layout.ts) | 新增 `LABEL_ROOF = { fs:10, fsShort:11, padX:6, h:13, rx:6, lift:5, strokeW:1.1 }`、`LABEL_CURRENT_SCALE = 1.25`、`LABEL_GROUND`（原地面参数） |
| [main.ts](file:///d:/zhao/monopoly/src/main.ts) | `LABEL_PARAMS`（L63 硬编码）**迁出**到 layout；`drawLabels` 增 `levelOf`（复用 `slotLevelsOf()`，与楼体同源）与 `currentSlot`（`currentPlayer(g.state).pos`） |

回退链：`skin.label` → `LABEL_ROOF` / `LABEL_GROUND` → 内建默认。`strokeW` 缺省 0 ⇒ 现有 `photo` 包行为不变。

### 6.6 棋子形象：Q 版人物（回答「人物形象能优化一些，可爱讨喜」）

**现状**（[proc-pawn.ts](file:///d:/zhao/monopoly/src/render/providers/proc-pawn.ts) 31 行）：**无五官的等距圆柱**——影 + 左墙 + 右墙 + 顶面高光 + 顶面椭圆；四位玩家仅靠**整只染色**区分。既不「可爱」，归属色也不讨喜（整只染 `#3fbf7f` 泛绿）。

**形象定调**：**Q 版小朋友（两男两女）**——大头身比、**大眼睛**、围巾 + 头饰，站姿面向画面。不要动物形象。

**目标画法表**（`proc-pawn.ts` 重写；全部图元程序化，零位图）：

| 部位 | 画法 | 关键像素 |
|---|---|---|
| 头身比 | **二头身**：头径 ≈ 总高 **43%** | `box 8.4×4.2×13 → 12×6×20` |
| 头 / 脸 | 大圆头 + 两枚圆耳 + 肤色 `#ffe2c8` | 头 `r 5.3`（设计单位） |
| **眼睛** | **大眼：眼径 `2.7`（占脸宽 1/3）+ 白色高光 `1.1`**（**这是「可爱」的最关键图元**） | 眼 `1.35×1.55` 椭圆 + 高光 `r 0.55` |
| 腮红 | 两团半透明粉 | `rgba(240,150,150,.42)` |
| 头发 | 男孩短发 / 女孩双马尾 · 丸子头（**性别靠发型轮廓区分**） | 刘海椭圆 `5.45×2.95` |
| 身体 | 米白毛衣 + 双臂 + 双手 + 双腿 + 圆头鞋 | 衣 `#fdf6e8` / 鞋 `#3a2f28` |
| **围巾 + 铃铛** | 归属色围巾 + 金色小铃铛 | 围巾 `9.0×2.7` / 铃 `#f5c451` |
| 头饰 | 小帽 / 发圈 / 丸子头绳（**亦染归属色**） | 帽 `5.6×3.0` |

**归属编码迁移**：从「染整只棋子」改为**只染「围巾 + 头饰」**（`state.owner`），**衣服统一米白** ⇒ 保证可爱、同时保留归属识别（属 `skin.json` 的 `owner1..4` 令牌，不新增 ID）。

| 玩家 | 围巾 / 头饰色（`owner*`） | 造型（`params.style`） |
|---|---|---|
| P1 **小满** | `#3fbf7f` 绿 | 男孩 · 短发 |
| P2 **阿桃** | `#f0a039` 橙 | 女孩 · 双马尾（发圈染归属色） |
| P3 **石头** | `#e0607e` 粉 | 男孩 · 小帽（帽染归属色） |
| P4 **雪见** | `#4aa3e0` 蓝 | 女孩 · 丸子头（头绳染归属色） |

**尺寸校验**：`12 <` 格宽 `48` ✅；同格 4 枚按既有 `pawnIndex` 错开步距 12 → 总宽 36 ≤ 48 ✅（既有错开逻辑本就支持，无需改动画台位）。

**三表情**（`state.mood`，**离散切换、非逐帧动画**）：

| mood | 画法 | 触发（由 `runAction` 落库写入，`fx` 结束回落 `calm`） |
|---|---|---|
| `calm` 常态 | 圆眼 + 高光 + 腮红 + 小弧嘴 | 默认 |
| `happy` 开心 | 弯月眼 `^ ^` + 张嘴笑 + 大腮红 + 两侧小星 | 买地 / 收租 / 升级 / 掷出 6 |
| `sad` 沮丧 | 八字眉 + 下垂眼 + 扁嘴 + 眼角一滴泪 | 付租 / 破产 / 进监狱 |

复用既有 fx 生命周期（`fx.play` 结束时重新 `instantiate`），**不新增动画通路**。

**备选风格待业主选**（见 §13.7）：**A 邻里小朋友（本文默认，休闲装）** / B 店员制服（围裙 + 帽，更「营业感」）/ C 冬装（棉袄 + 耳罩，更「鹿乡雪季」）。三选一只换图元清单，几何与编码不变。

### 6.7 停留效果图：头顶事件气泡（回答「任务停留效果图能加上面」）

**问题**：现状停留只有地砖描边加粗 + 底栏一行小字，**棋盘上看不到「发生了什么」**。

**方案**：新增 `ui.bubble` 元素 + `src/render/providers/proc-bubble.ts`，**一次性出现、`fx` 结束时消失**：

| 状态 | 标题 | 金额/说明 | 主色 |
|---|---|---|---|
| 买地 | `长峰特产` | `买地 ￥180` | 绿 `#3fbf7f` |
| 收租 | `御龙温泉` | `租金 -￥105` | 金 `#f5c451` |
| 抽卡 | `命运卡` | `抽到「鹿茸涨价」` | 紫 `#a26bf0` |
| 进监狱 | `监狱` | `停留 1 回合` | 红 `#e5573f` |

**几何**：气泡 `100×44`（打样为 `76×34` 简化版），锚点 = 棋子**头顶上方 `8px`**、水平居中；**暖白底 `#fff7e6` + 金边**（与深底名牌**反相**，天然区分「静态名牌 / 瞬时气泡」）；下方三角指向棋子。

**不挡不吞**：**不进 `hitAreas()`、`pointer-events: none`** ⇒ 不影响 `e2e:play` 973 次点击。

**与地块卡分工**：气泡 = 棋盘上的**即时事件图**；地块卡（§7.3）= 底部的**可操作面板**——一上一下、不重复表达。

**实现**：`proc-bubble.ts` 新 preset（参数化 标题/金额/图标/主色/箭头）+ 注册 `ui.bubble` + `paint.ts` 在 pass 4 后按 `state.lastEvent` 条件绘制。

---

## 7. 布局：改前 → 改后

### 7.1 改前

```
  0 ┌──────────── 分享 / 音效 ─────────────┐
 34 │        等距棋盘 240px（28.6%）        │  geo.hw=21,hh=10.5
276 ├───────────────────────────────────────┤
300 │  中部橱窗（常驻 268px，与棋盘同对象）  │  SHOWCASE_Y=322
568 ├───────────────────────────────────────┤
550 │  手牌行 5 槽（横排，压住橱窗底）        │  PANEL_HAND_Y=550
606 ├──────────── 底部操作坞 184px ─────────┤
    │  状态行 · 4 条等权资产条 · 骰面 · 主按钮│  HUD_DOCK_H=184
790 └───────────────────────────────────────┘
```

### 7.2 改后

```
  0 ┌──────────── 分享 / 音效 ─────────────┐
 34 │      夜空：星点 + 月 + 远山剪影        │  bg.sky/stars/moon/ridge
 40 │                                       │
    │        等距棋盘 280px（33.2%）        │  geo.hw=24,hh=13 → 384×208
    │        + 楼顶店名名牌（fs 10–11 + 金描边）│  LABEL_ROOF
    │        + 当前格金环 / 放大名牌 / 棋子光晕 │  §6.4 三重标记
320 ├───────────────────────────────────────┤
320 │   近景街市带 180px（氛围 + 事件浮层）  │  bg.street/streetLamp/lanternString
500 ├───────────────────────────────────────┤
508 │  地块卡 76px（仅落地时滑入，非常驻）   │  TILE_CARD_*
584 ├───────────────────────────────────────┤
606 │ 状态行(614) + 牌袋/战报  ── 22px      │
    │ 单条 4 段式资产条 ──────── 40px       │  4 等权卡 → 1 条分段
    │ 骰面 ×2 + 主按钮(180×52) ─ 52px      │
790 │ 买地 / 升级 次要键 ─────── 36px       │
    └───────────────────────────────────────┘
```

**三条关键取舍**：
1. **中部橱窗：常驻 → 落地滑入**。`?show=b|c` 演示版式**完整保留**；只把 `play` 模式的常驻渲染改条件渲染。
2. **手牌行：常驻横排 → 牌袋抽屉**（省 56px）。抽屉打开仍用 `PANEL_HAND_Y=550` 原台位与 `ui.handSlot` 元素，**不新增 ID**。
3. **底坞总高不变（184px）**，仅内部重分组：4 行（22 / 40 / 52 / 36）+ 3 段 gap。

### 7.3 HUD 常量重排

| 组 | 新常量 | 值（606 + Δ） |
|---|---|---|
| 状态行 | `HUD_LABEL_Y` | 606+8（中心 614） |
| 资产条 | `HUD_BAR_X0 / _W / _H` | 6 / **378 / 40**（1 条 4 段，每段 94.5） |
| 骰面 | `HUD_DICE_X0 / _DX / _Y` | 14 / 60 / 606+84 |
| 主按钮 | `HUD_BTN_PRIMARY_X / _W / _H` | **196 / 180 / 52** |
| 次要键 | `HUD_BTN_BUY_X / HUD_BTN_UPGRADE_X` | 31 / 209，`H=36`，`Y=606+148` |
| 地块卡 | `TILE_CARD_X / Y / W / H` | 8 / 508 / 374 / 76 |
| 地块卡首行 | 文案 | **「● 停在 国信温泉 · 你在这里」**（金点 + 店名，同步棋盘瞬时状态，§6.4） |

**命中区同步**：`hitAreas()` 必须同源改（否则 `e2e:play` 的 973 次真实点击全错位）——本任务**最高风险回归点**，见 §11。

---

## 8. 改动清单（文件表）

| 文件 | 动作 | 归属 |
|---|---|---|
| `public/config/theme.json` | **新增**（palettes ×5 + bindings + paletteBySlot 分区轮转） | 美术/运营 |
| `src/skin/theme.ts` | **新增**（`compileTheme` 纯函数 + glob 匹配 + 坏数据静默跳过） | 皮肤 |
| `src/render/AtmosphereView.ts` | **新增**（环境层 7 元素） | 渲染 |
| `src/render/providers/proc-building.ts` | 修改（+4 原型 `stall`/`market3`/`onsenHouse`/`gate`/`barn`；删 `neon` 青描边；`brand` 改读 `state`） | 渲染 |
| `src/render/providers/proc-props.ts` | 修改（+8 道具 preset） | 渲染 |
| `src/render/providers/proc-base.ts` | 修改（+7 环境 preset） | 渲染 |
| `src/render/BuildingView.ts` | **修改（解除 `proc('shop',{hue})` 写死，只传 `state`）** ← §1.1 病根 | 渲染 |
| `src/render/providers/proc-pawn.ts` | **重写**（无五官圆柱 → Q 版小朋友两男两女：二头身 + 大眼高光 + 腮红 + 围巾铃铛 + 三表情，只染围巾与头饰） | 渲染 |
| `src/render/providers/proc-bubble.ts` | **新增**（头顶事件气泡 preset：标题/金额/图标/主色/指向箭头，暖白底金边） | 渲染 |
| `src/render/LabelView.ts` | 修改（楼顶名牌 + 描边 + 字号自适应） | 渲染 |
| `src/render/paint.ts` | 修改（接氛围层 + 地块卡条件渲染 + 棋子 mood/lastEvent 透传 + 气泡绘制） | 渲染 |
| `src/render/providers/proc-panel.ts` | 修改（+地块卡 preset） | 渲染 |
| `src/skin/registry.ts` | 修改（**+16 id** = 8 道具 + 7 环境 + 1 `ui.bubble`；`piece.p1..p4` 与 `building.s{n}.sign` 保留） | 皮肤 |
| `src/skin/types.ts` · `skinLoader.ts` · `instantiate.ts` | 修改（`label` 块、`theme` 装载、新 id） | 皮肤 |
| `src/skin/layout.ts` | 修改（`LABEL_ROOF`/`LABEL_GROUND` + HUD 常量重排 + `TILE_CARD_*`） | 布局 |
| `src/ui/Hud.ts` · `src/ui/panels.ts` | 修改（HUD 分组重绘、手牌抽屉、地块卡、`hitAreas()`） | UI |
| `src/ui/themeConsole.ts` | **新增**（游戏内风格控制台，仅 `?debug=1`） | UI |
| `src/main.ts` | 修改（`compileTheme` 装配、`LABEL_PARAMS` 迁出、氛围层接入、移除 play 常驻橱窗） | 入口 |
| `public/skins/default/skin.json` · `photo/skin.json` | 修改（`label` 块 + 暖调 token；`default` 保留为回退底座） | 美术 |
| `public/registry-ids.json` | 重新生成（`node tools/gen-registry-ids.mjs`，**+16 id**） | 皮肤 |
| `tools/lint-skin.mjs` | 修改（新增 `theme.json` 校验：palette 键齐、`paletteBySlot` 长度、match 可展开） | 工具 |
| `test/skin/theme.spec.ts` | **新增**（编译 / 通配 / 坏数据 / 优先级） | 测试 |
| `test/render/label.spec.ts` | 新增（楼顶落位 / 字号降级 / 截断） | 测试 |
| `test/render/pawn.spec.ts` | **新增**（Q 版人物：参数兜底 / 四 `style` / 三 `mood` 几何不同 / 人脸五官件齐备 / 不抛错） | 测试 |
| `local/mono-shots-visual.mjs` | **新增**（手机视口截图 390×844 @dpr2） | 工具 |
| `local/mono-prod-check.mjs` · `mono-e2e-playthrough.mjs` | 修改（V 系列 gate） | 工具 |
| `docs/manual-mono.md` | 修改（M13 小节 + URL 参数表 + 最终验收第 12 项） | 文档 |

**`src/core/**` 零改动**。

---

## 9. 游戏内风格控制台（`?debug=1`）

既有 `?debug=1` 已有「棋盘 / 橱窗B / 对照C」切换器。本轮扩成**风格控制台**（`src/ui/themeConsole.ts`，仅 debug 出现，生产版零占用）：

| 能力 | 说明 |
|---|---|
| 逐栋选色 | 点棋盘任一格 → 弹出 5 套 palette 色卡 → 选中即 `paint()` 实时预览 |
| 按类批量 | 「全部 L1 / L2 / L3」「全部道具」「全部环境层」批量指派 |
| 单素材微调 | 选中某元素后展开其 `params` 表单（如 `signTower.glow`、`shop.brand`）——**单素材独立风格**的可视化入口 |
| 导出 | 「导出 theme.json」按钮 → 控制台输出完整 JSON（复制即可回填 `public/config/theme.json`） |
| 不落库 | 控制台改动只存内存，**不写 `localStorage`**（避免与 `?skin=` 语义互串）；权威永远是 theme.json |

---

## 10. 兼容与回退链

- 缺字段 / 坏 JSON 一律**逐项回退**、绝不抛错（沿用 `parseShopConfig` / `readSkinPack` 口径）；坏 binding 静默跳过。
- `?skin=photo` 的 `image` 素材仍优先于 `proc` ⇒ **photo 包不受影响**（M3-5 / M7-2 的 `missingAssets===[]` 结论保持）。
- 未引用 / 引用无效 palette ⇒ 回退 `default` 皮肤的内建色，**不取「平台最新启用包」**（沿用既有回退语义）。
- 新增 URL 参数：`?theme=<paletteId>` 全局强制单色（预览用）、`?theme=off` 只用 `skin.json`（回归用）；`?debug=1` 开风格控制台。既有 `?skin=` / `?seed=` / `?speed=` / `?nofx=1` / `?perf=1` / `?play=1` / `?demo=1` 全部保持不变。

---

## 11. 回归计划

### 11.1 必须绿（既有）

```powershell
npm run check            # lint + lint:skin + vitest（51 文件 / 435 例基线）
npx tsc --noEmit
npm run check:prod       # 线上闸门
npm run e2e:play         # ⚠️ 真实点击整局 973 次
```

### 11.2 新增闸门

| # | 闸门 | 判据 |
|---|---|---|
| V1 | `theme.json` 合法 | `palette` × 5 键齐（8 键全在）；`paletteBySlot` 长度 === 32；每条 `match` 至少展开 1 个注册表 id |
| V2 | 配色可换 | `?theme=` × 5 各出一张全屏截图，两两**主色不同**；`?theme=off` 回落 `skin.json` |
| V3 | 单元素指派生效 | 断言 `building.s4.l2` 的实例 `provider.params.wallL` === S4 的 `wallL`；改 binding 后即时变化 |
| V4 | 单素材独立风格 | `prop.signTower` 的 `params` 覆盖生效（`params` 压过 palette），且不影响其他 `prop.*` |
| V5 | **楼体不再被归属色相染色** | `BuildingView` 产物中**不含** `hue` 键；`OWNER_HUE` 不再参与楼体色 |
| V6 | **店名与当前格可读** | 32 张名牌齐备、`strokeW > 0`；4 字名牌宽 ≤ 48px 且 `fs=10`；3 字 `fs=11`；5 字自动降 `fs=8`；>5 字截断加 `…`；**当前格名牌为基准的 1.25×** 且带指示三角；截图 `mono-visual-02-labels.png` |
| V6b | **当前停留位置三重标记** | 当前格地砖有金色双环、名牌放大 1.25×、玩家棋子有光晕（三处同时成立，缺一即失败）；地块卡首行含「停在 <店名>」；截图 `mono-visual-04-tilecard.png` |
| V7 | 棋盘占比 | `geo.hw === 24`、棋盘纵向 ≤320 且 ≥40 ⇒ 占比 ≥33% |
| V8 | 无死黑 | 中部条带（320..508）非纯背景像素比例 > 20%（街市带生效） |
| V9 | HUD 分段资产条 | `ui.playerBar` 实例数 === **1**；`hitAreas()` 的 4 段可点区与视觉段一一对齐 |
| V10 | 落地点击闭环 | `phase==='settled'` 时地块卡出现且「升级」可点；`idle` 时不可见 ⇒ 不吞点击、不挡棋盘 |
| V11 | 手牌抽屉 | 牌袋键可开关；关闭时 `ui.handSlot` 不参与命中（既有键位不误触） |
| V12 | 素材库完备 | 6 原型 + 16 道具 + 7 环境层 preset 全部可达；`?perf=1` 的 `scene` ≤ 200；`missingAssets === []` |
| V13 | **棋子形象（人物 · 可爱讨喜）** | `pawn` preset 产物含**人形五官件**：≥2 眼（含白高光）+ 腮红 + 头发；四玩家 `params.style` 互不相同且覆盖**两男两女**（短发 / 双马尾 / 小帽 / 丸子头）；`trim` 色 === `owner1..4` 令牌且**衣服统一米白**（不整只染）；`mood` 三态（`calm`/`happy`/`sad`）几何互不相同；截图 `mono-visual-09-players.png` |
| V14 | **停留事件气泡** | 买地 / 收租 / 抽卡 / 进监狱四态各产出一枚 `ui.bubble` 实例；气泡**不在 `hitAreas()` 内**；`idle` 态无气泡（不残留）；`e2e:play` 973 次点击仍全绿 |

### 11.3 手机视口截图（**硬性口径：390×844, dpr=2**）

新增 `local/mono-shots-visual.mjs`，产出并入库 `docs/verify/`：

| 文件 | 内容 |
|---|---|
| `mono-visual-01a..01e-<palette>.png` | 五套配色各一张全屏 |
| `mono-visual-02-labels.png` | 棋盘区放大切图（**楼顶名牌可读性核对**） |
| `mono-visual-03-hud.png` | 底坞特写（分段资产条 + 骰面 + 主按钮） |
| `mono-visual-04-tilecard.png` | 落地态地块卡滑入 |
| `mono-visual-05-street.png` | 中部街市带 + 事件浮层 |
| `mono-visual-06-drawer.png` | 牌袋抽屉打开 |
| `mono-visual-07-catalog.png` | 素材库总览（6 原型 + 16 道具 + 7 环境层） |
| `mono-visual-08-console.png` | 风格控制台（逐栋选色 + 导出） |
| `mono-visual-09-players.png` | **Q 版人物四造型（两男两女）+ 三表情（calm/happy/sad）+ 停留气泡态**（棋盘局部放大） |

### 11.4 操作手册

`monopoly/docs/manual-mono.md` 增 **M13 画面重设计** 小节：目标 / 改动范围 / **五套配色对照表** / **`theme.json` 字段说明（含单素材独立风格示例）** / **棋子形象与停留气泡说明** / 上述 9 张截图 / V1–V14 闸门口径 / 部署与线上回归记录。同步更新 §1 URL 参数表（新增 `?theme=`、风格控制台）与「最终验收」表（新增第 12 项）。

---

## 12. 风险与取舍

| 风险 | 等级 | 处置 |
|---|---|---|
| **`hitAreas()` 与视觉台位脱节** → `e2e:play` 973 次点击失效 | 高 | HUD 与 `hitAreas` **同源同常量**（一律取自 `layout.ts`）；**先跑 `e2e:play` 再跑截图** |
| **解除 `BuildingView` 写死后楼体外观变了**，可能连带 M3 视觉回归样张失效 | 高 | 先跑 §11.1 四项基线并记录**改前样张**；`?theme=off` 提供「回落旧观感」通道用于 A/B 对比 |
| 楼顶名牌与相邻名牌 / 后排楼体 / 顶栏碰撞 | 中 | 几何已锁死：胶囊 `h=13` 与相邻格 `Δy=13` 恰好相切；名牌宽按字数吃满格宽（4 字 46 ≤ 48）；`oy 96→104` 留 13px 顶栏余量。V6 逐项断言 |
| 单条 4 段资产条替代 4 卡后**持有者信息密度下降** | 中 | 段内保留「色条 + 名 + 现金」；当前玩家段加金框 + 淡金底（位置 + 描边双重编码） |
| 元素预算逼近 200（189 + 环境 7 + 气泡 ≈ 197） | 中 | `bg.stars` 用单 `Graphics` 多点绘制；只看 `?perf=1` 的 `scene` 字段 |
| `paint()` 全量重绘的一次性卡顿（4× 代理 p95 42–56ms） | 中 | 氛围层放**最底遍且静态不变** → 只在 boot 与换配色时构建一次 |
| **棋子 box 从 `8.4×4.2×13` 放大到 `12×6×20`** → 可能压住地砖 / 遮挡名牌 / 与动画落点台位不符 | 中 | 尺寸已校验 `12 <` 格宽 `48`、同格 4 枚错开总宽 `36 ≤ 48`；`lift`/`pawnIndex` 沿用既有 `instantiate` 逻辑；跑 `e2e:play` 与 `mono-visual-09-players` 视觉核对 |
| **气泡挡棋盘 / 与楼顶名牌重叠**（气泡浮在棋子头顶，可能盖到后排名牌） | 中 | 气泡 `pointer-events: none` + 不进 `hitAreas()`；气泡高度 `44` + 头顶 `8px` 余量，名牌在 `pass 2`、气泡在 `pass 4` 后但**同格时才绘制**，二者不同格时天然分离；V14 断言四态 |
| 归属编码从「染整只棋子」改为「只染围巾 + 头饰」→ **四人区分度下降** | 中 | 围巾为高饱和纯色 + 金色铃铛描边；叠加既有「地砖描边 / 屋顶小旗 / 名牌色条」三处归属编码（§3.2），并保留 `params.style` 发型差异（两男两女）；V13 断言四 `trim` 色 === `owner1..4` |
| **Q 版人物在小尺寸下五官糊成一团**（眼/腮红/嘴件多） | 中 | 大眼占脸宽 `1/3`（约 `2.7px` 设计单位），高光 `1.1px`；在 `390×844` 手机视口用 `mono-visual-09-players` 放大核对，必要时先保证「眼 + 腮红」两件清晰，其余件可降透明度 |
| 分区轮转（6 街区 5 配色）可能显得杂乱 | 中 | `paletteBySlot` 是一行数组，改回单色只需替换数组内容；控制台实时预览后再定稿 |
| 素材库翻倍带来 preset 回归量 | 中 | 每个新 preset 至少 1 条单测（几何边界 / 参数兜底 / 不抛错）+ 1 张截图 |
| 五套配色 + theme.json 维护成本 | 低 | 全部是 JSON 数据；新增 `lint-skin` 对 `theme.json` 的静态校验 |

---

## 13. 待办与未决

1. **分区轮转的分区边界待业主确认**：本方案按「每 6 格一街区」（§4.3）。若希望按**地标聚簇**（如温泉街 3 格同色），改 `paletteBySlot` 一个数组即可。
2. **建筑 6 原型的具体归属地块**待视觉逐格定稿（本文只给了建议：`onsenHouse` 给温泉类、`gate` 给地标、`barn` 给农产类）。
3. **`board.inner.d1..d8` 内环 8 栋装饰楼**在五套配色里的具体色值待定稿（只定规则：冷色只许出现在「股票所 / 监狱」功能格）。
4. **名牌是否显示等级**（L1/L2/L3 小圆点）：图上信息已足够时不加；若加属独立增量。
5. **商铺名是否加副标题（商家全名）**：名牌空间被几何锁死（§6.2），副标题只能进落地地块卡或店招灯箱；若业主希望名牌出全名，需放弃「≤4 字」约定并接受字号回落，请拍板。
6. **独立 Web 管理后台**（选建筑→选配色→存服务端）：本轮不做；`theme.json` + 控制台导出已能覆盖运营需求，若后续要做再单独立项。
7. **棋子风格待业主拍板**（三选一，见图与 §6.6）：**A 邻里小朋友（本文默认，休闲装）**——最贴近「街坊」；**B 店员制服**——围裙 + 帽，更「营业感」；**C 冬装**——棉袄 + 耳罩，更「鹿乡雪季」。选 A/B/C 决定 `proc-pawn.ts` 图元清单（本文画法表按 A 写，几何与编码不变）。
8. **四位角色名与性别分配待定**：本文暂定 P1 小满（男·绿）/ P2 阿桃（女·橙）/ P3 石头（男·粉）/ P4 雪见（女·蓝）；若与游戏内 NPC 设定冲突，改 `params.style` + 文案即可。
9. **停留气泡文案口吻待定**：本文取「动词 + 金额」直白口径（`买地 ￥180` / `租金 -￥105`）；若希望更拟人（如「拿下啦！」），只改文案不求改几何，属枚举增量。

---

## 14. 验收（对照本 spec）

| # | 条目 | 证据 |
|---|---|---|
| 1 | **5 套配色全部可用**且可切换、零新增网络请求 | V1 + V2 + `mono-visual-01a..01e` |
| 2 | **后台可按单个建筑指派配色**（改 `theme.json` 即生效） | V3 + V1 + 手册 §M13 字段说明 |
| 3 | **单个素材可独立设计风格**（`params` 压过 palette，甚至换 preset） | V4 + `mono-visual-08-console` |
| 4 | **素材扩充到位**：建筑 6 原型 / 道具 16 / 环境 7 层 | V12 + `mono-visual-07-catalog` |
| 5 | **店名上房顶、显著**：4 字 `fs 10` / 3 字 `fs 11` + 金描边 + 不重叠 | V6 + `mono-visual-02-labels` |
| 5b | **当前停留位置三重标记**（金环 + 放大名牌 + 棋子光晕 + 地块卡文字） | V6b + `mono-visual-04-tilecard` |
| 5c | **棋子形象可爱讨喜（Q 版人物 · 两男两女）**：二头身 + 大眼睛高光 + 腮红；归属只染围巾与头饰；三表情 | V13 + `mono-visual-09-players` |
| 5d | **停留效果图显性**（头顶事件气泡四态：买地 / 收租 / 抽卡 / 进监狱；不挡不吞） | V14 + `mono-visual-09-players` |
| 6 | 楼体不再被归属色相染色（§1.1 病根已除） | V5 |
| 7 | 棋盘占比 ≥ 33% | V7 |
| 8 | 中部无死黑（街市带生效） | V8 + `mono-visual-05-street` |
| 9 | HUD 有主次（1 条分段资产条） | V9 + `mono-visual-03-hud` |
| 10 | 常驻橱窗 → 落地卡（不挡棋盘、不吞点击）；手牌抽屉不误触 | V10 / V11 + `mono-visual-04` / `06` |
| 11 | 既有闸门全绿 | `check` / `tsc` / `check:prod` / `e2e:play` 均退出码 0 |
| 12 | `src/core/**` 零改动 + `src/render/**` 无裸色值裸时长 | `git diff --stat src/core` 为空；`npm run lint` 0 错 |
| 13 | 手机视口截图入库 + 手册更新 | `monopoly/docs/manual-mono.md` §M13 |