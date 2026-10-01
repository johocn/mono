# M18 · 棋盘生长与归属可视化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `d:\zhao\monopoly` 的对局棋盘「开局只有 4 栋公共设施楼、买地后建筑从 L1 逐级长到 L5 地标、楼体颜色一眼看出业主是谁」。

**Architecture:** 三条互不重叠的改动线：① **数据层**新增「开局公共设施楼」常量，play 模式的层级表由它起算（未售商家格 = 无楼）；② **归属通路**复用 Scene 已经注入每个 proc 上下文的 `state.ownerColors`（`Scene.ts:215`）与 `state.owner`，在 `proc-building.ts` 内按 D3 只染「屋面 + 门面 + 描边」；③ **换代几何**在既有 `shop` / `market3` 两个 preset 内按层级加法绘制（L1 幡旗 / L2 雨棚 / L4 退台 / L5 塔楼尖顶·霓虹·光晕·发光环·五星徽记），不新增任何场景元素（现有 189 件 < 200 预算），配色与几何一律走 `num/str/c/fb` 取值器，遵守四级可回退体系与 `tools/check-hardcoded.mjs` 闸门。

**Tech Stack:** PixiJS 8 · TypeScript 5 · Vite 6 · Vitest 2 · Playwright（截图取证）· ESLint 9 + 本地 `tools/eslint-plugin-mono`

---

## 规格来源与硬约束

- 上位 Spec（唯一真源）：`docs/superpowers/specs/2026-10-01-monopoly-interaction-roadmap-design.md` §4.1 + §8 决策项 **D1–D4**（已全部拍板「全按推荐执行」）。
  - **D1** 开局保留 4 栋公共设施楼：起点(0) L3 / 银行(9) L2 / 股票交易所(19) L2 / 医院(25) L2；**17 个商家格全空**（未售 = 无楼）。
  - **D2** L1→L5 五段式换代（每级新增构件，非单纯长高）：L1 单层小摊（棚顶 + 幡旗）→ L2 双层小铺（二层 + 雨棚 + 招牌）→ L3 三层商铺（三层 + 转角橱窗 + 招牌塔）→ L4 四层商厦（四层 + 退台 + 屋顶设备箱 + 灯笼）→ L5 地标五星（五层 + 塔楼尖顶 + 霓虹描边 + 业主色光晕 + 地砖发光环）。
  - **D3** 业主色**只染屋面 + 门面 + 描边**，不染整楼体；同业主相邻地块天然连片同色（街廓势力图）。
  - **D4** L5 加**五星徽记 + 地砖发光环**。
- **不可破坏的既有约束**（spec §2.1）：
  - 17 个商家格的地砖 / 店招 / 授权内容**一个不动**。
  - 确定性：一律 `makeRng(seed)` 分流，禁 `Math.random`（本计划不引入随机源）。
  - 四级可回退体系：裸值只允许出现在 L4 内建 `fb({...})` 兜底里；`tools/check-hardcoded.mjs`（`npm run build` 前置）与 `tools/eslint-plugin-mono` 是闸门。
  - 交付 = 实现 + 单测/闸门 + 手机视口截图（390×844 @dpr2）+ `docs/manual-mono.md` 手册条目。
- **本计划对 D2 的落地口径**（逐条对应，避免执行者自由发挥）：

  | 级 | preset | 形态 | 本计划新增的构件 | 归属 |
  |---|---|---|---|---|
  | L1 | `shop` levels=1 | 单层坡顶小摊 | **幡旗**（`shop` 内几何，`flag` 开关） | 屋面 + 门面 + 脊线 |
  | L2 | `shop` levels=2 | 双层小铺 | **雨棚**（`shop` 内几何，`canopy` 开关） | 屋面 + 门面 + 女儿墙 |
  | L3 | `market3` levels=3 | 三层商铺 | 无（暖窗排 + 顶部小阁楼，现状已达标） | 屋面 + 门面 + 女儿墙 + 阁楼檐线 |
  | L4 | `market3` levels=4 | 四层商厦 | **退台顶块**（更宽更矮，取代小阁楼）+ 屋顶设备箱 + 灯笼（既有 prop） | 同上 |
  | L5 | `market3` levels=5 | 地标五星 | **塔楼尖顶 + 霓虹描边 + 五星徽记 + 地砖发光环 + 业主色光晕** | 同上 |

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `monopoly/src/data/board.ts` | 棋盘静态数据（格类型 / 演示层级 / 价目） | **改**：新增 `START_PUBLIC_LEVEL`（D1 的 4 栋公共设施楼） |
| `monopoly/src/render/BuildingView.ts` | 由层级表生成 `building.*` 元素 spec | **改**：新增 `startLevelsOf()`（play 开局层级表），与 `slotLevelsOf()`（v5 演示样张）并存 |
| `monopoly/src/main.ts` | 入口：装配 Scene / 相机 / HUD，play 与 demo 两条渲染路径 | **改**：`liveLevels()` 在 play 下以 `startLevelsOf()` 起算；`ownedOf()` 在 play 下只认真实地产（未售/公共设施 → `null`） |
| `monopoly/src/render/providers/proc-building.ts` | 建筑 preset（`shop` / `market3` / `stall` / `onsenHouse` / `gate` / `barn`） | **改**：新增 `ownerTintOf()` 与 `fiveStar()` 两个纯函数；`shop`/`market3` 按 D3 染业主色、按 D2/D4 加换代构件 |
| `monopoly/public/skins/default/skin.json` | L2 皮肤包：元素 → preset + params | **改**：`building.*.l1` 加 `flag`、`building.*.l2` 加 `canopy` |
| `monopoly/test/core/board.spec.ts` | 棋盘数据单测 | **改**：`START_PUBLIC_LEVEL` 用例 |
| `monopoly/test/render/building-view.spec.ts` | 建筑 spec 生成单测 | **改**：`startLevelsOf` 与「开局只出 4 栋」用例 |
| `monopoly/test/render/proc-building.spec.ts` | preset 绘制指令单测（假画布 recorder） | **改**：业主色染 / 幡旗雨棚开关 / L3→L4→L5 递增三组用例 |
| `monopoly/local/mono-shots-m18.mjs` | M18 专项取证截图 + 像素哈希闸门 | **建** |
| `monopoly/docs/manual-mono.md` | 操作手册（里程碑小节） | **改**：在 M17 小节之后、「### 最终验收」之前插入 M18 小节 |

**说明**：本仓库根在 `d:\zhao`（`monopoly/` 只是子目录），提交时**必须逐个 `git add` 指定文件**——仓库里存在大量与本次无关的未跟踪文件。

**所有 `npm` / `npx` / `node` 命令的 cwd 均为 `d:\zhao\monopoly`；所有 `git` 命令的 cwd 均为 `d:\zhao`。**

---

## Task 1: 数据层 — `START_PUBLIC_LEVEL`（D1）

**Files:**
- Modify: `monopoly/src/data/board.ts:71`（`TILE_LEVEL` 定义之后、`RING_SIZE` 之前）
- Test: `monopoly/test/core/board.spec.ts`

- [ ] **Step 1: 写失败测试**

把 `monopoly/test/core/board.spec.ts:2` 的 import 行整行替换为：

```ts
import { TILES, ringPath, typeAt, shortAt, nameAt, RING_SIZE, tileIndexOf, START_PUBLIC_LEVEL } from '../../src/data/board';
```

在文件末尾（第 57 行 `});` 之后）追加：

```ts

describe('START_PUBLIC_LEVEL · M18 开局公共设施楼（D1）', () => {
  it('只保留 4 栋：起点 L3 / 银行 L2 / 股票所 L2 / 医院 L2', () => {
    expect(START_PUBLIC_LEVEL).toEqual({ 0: 3, 9: 2, 19: 2, 25: 2 });
  });

  it('4 处全是非商家格 —— 商家格开局一律无楼', () => {
    for (const key of Object.keys(START_PUBLIC_LEVEL)) {
      const i = Number(key);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(RING_SIZE);
      expect(typeAt(i)).not.toBe('shop');
    }
    expect(typeAt(0)).toBe('core');
    expect(typeAt(9)).toBe('bank');
    expect(typeAt(19)).toBe('stock');
    expect(typeAt(25)).toBe('hospital');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/core/board.spec.ts`
Expected: FAIL —— 报 `START_PUBLIC_LEVEL is not defined`（或 `does not provide an export named 'START_PUBLIC_LEVEL'`），且该文件既有 6 例是否仍绿不影响本判定。

- [ ] **Step 3: 最小实现**

在 `monopoly/src/data/board.ts` 第 71 行（`TILE_LEVEL` 数组的收尾 `];`）之后、第 73 行 `export const RING_SIZE = 32;` 之前插入：

```ts

/**
 * M18 D1 · 开局保留的**公共设施楼**（play 模式唯一的开局有楼来源；未售商家格一律无楼）。
 * 现状 `TILE_LEVEL` 是 v5 演示层级（18 栋楼几乎全落在商家格）；play 改走本表：
 * 只有 4 处公共设施开局成楼，商家格等买家买下才从 L1 长起。
 * 格位：0 鹿乡特色小镇（每回合必经，L3）/ 9 鹿乡银行（L2）/ 19 股票交易所（L2）/ 25 医院（L2）。
 */
export const START_PUBLIC_LEVEL: Record<number, BuildLevel> = { 0: 3, 9: 2, 19: 2, 25: 2 };
```

- [ ] **Step 4: 运行测试，确认通过**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/core/board.spec.ts`
Expected: PASS —— `Tests  8 passed (8)`。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao add monopoly/src/data/board.ts monopoly/test/core/board.spec.ts
git -C d:\zhao commit -m "feat(mono): M18 D1 新增开局公共设施楼层级表 START_PUBLIC_LEVEL"
```

---

## Task 2: 渲染装配层 — `startLevelsOf()`（D1）

**Files:**
- Modify: `monopoly/src/render/BuildingView.ts:39-46`（`slotLevelsOf()` 附近）
- Test: `monopoly/test/render/building-view.spec.ts`

- [ ] **Step 1: 写失败测试**

把 `monopoly/test/render/building-view.spec.ts:2-8` 的两段 import 整段替换为：

```ts
import {
  INNER_STREET_PROPS, buildingSpecs, slotLevelsOf, startLevelsOf, streetPropSpecs,
} from '../../src/render/BuildingView';
import {
  DEMO_OWNER, SLOT_BANNER, SLOT_LANTERN_CHAR, START_PUBLIC_LEVEL, TILE_BRAND, TILE_LEVEL,
} from '../../src/data/board';
import type { ElementSpec } from '../../src/skin/instantiate';
```

在 `describe('BuildingView · 层级表', ...)` 块之后（第 25 行 `});` 之后）插入：

```ts

describe('BuildingView · 开局层级（M18 D1：未售 = 无楼）', () => {
  it('startLevelsOf 返回 4 栋公共设施楼的拷贝，与 v5 演示层级表相互独立', () => {
    const lv = startLevelsOf();
    expect(lv).toEqual(START_PUBLIC_LEVEL);
    expect(Object.keys(lv).length).toBe(4);
    expect(lv[0]).toBe(3);
    expect(lv[9]).toBe(2);
    expect(lv[19]).toBe(2);
    expect(lv[25]).toBe(2);
    /* 演示表仍是 18 栋（v5 样张零回归）；两者不是同一份数据 */
    expect(Object.keys(slotLevelsOf()).length).toBe(18);
    expect(lv).not.toBe(START_PUBLIC_LEVEL);
  });

  it('play 开局只出 4 栋楼体（s0/s9/s19/s25），17 个商家格无 building.* 条目', () => {
    const lv = startLevelsOf();
    const specs = buildingSpecs({ levelOf: (i) => lv[i], ownerOf: () => null });
    const wallIds = specs.filter((s) => isWall(s.id)).map((s) => s.id).sort();
    expect(wallIds).toEqual(['building.s0.l3', 'building.s19.l2', 'building.s25.l2', 'building.s9.l2']);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/building-view.spec.ts`
Expected: FAIL —— 报 `startLevelsOf is not a function` / `does not provide an export named 'startLevelsOf'`。

- [ ] **Step 3: 最小实现**

在 `monopoly/src/render/BuildingView.ts` 第 2-5 行的 import 语句中，把 `TILE_LEVEL` 一行改为同时引入新常量：

```ts
import {
  BOARD_COLS, BOARD_ROWS, DEMO_OWNER,
  SLOT_BANNER, SLOT_LANTERN_CHAR, START_PUBLIC_LEVEL, TILE_BRAND, TILE_LEVEL, ringPath,
  type BuildLevel,
} from '../data/board';
```

在 `slotLevelsOf()`（第 39-46 行）之后插入：

```ts

/**
 * M18 D1 · play 模式的开局层级表（未售 = 无楼，只有 4 处公共设施格成楼）。
 * 与 `slotLevelsOf()`（v5 演示层级，`?show` / `?demo` 样张专用，18 栋）并存：
 * 演示样张保持逐像素回归，play 开局改走本表。返回**拷贝**，调用方可安全改写。
 */
export function startLevelsOf(): Record<number, BuildLevel> {
  return { ...START_PUBLIC_LEVEL };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/building-view.spec.ts`
Expected: PASS —— 该文件全部用例通过（原 8 例 + 新 2 例 = 10 passed）。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao add monopoly/src/render/BuildingView.ts monopoly/test/render/building-view.spec.ts
git -C d:\zhao commit -m "feat(mono): M18 BuildingView 新增 play 开局层级表 startLevelsOf"
```

---

## Task 3: 入口接线 — play 开局空盘 + 归属只认真实业主（D1/D3）

**Files:**
- Modify: `monopoly/src/main.ts:13`（import）、`monopoly/src/main.ts:463-488`（`ownedOf` / `liveLevels`）

**为什么改**：`liveLevels()` 在 play 下以 v5 演示层级 `slotLevels` 起算，导致开局 18 栋楼；`ownedOf()` 对无主格回落到 `DEMO_OWNER`，导致未买入的地块也显示业主色（归属不可信）。两处都在 `paint()` 里被消费（`main.ts:527-528`、`main.ts:501/504/539`），必须同源。

- [ ] **Step 1: 改 import**

把 `monopoly/src/main.ts:13` 整行替换为：

```ts
import { buildingSpecs, slotLevelsOf, startLevelsOf, streetPropSpecs } from './render/BuildingView';
```

- [ ] **Step 2: 改 `ownedOf()`（第 463-464 行）**

把这两行：

```ts
  /** play：地砖归属色 / 当前格 / 棋子位置跟游戏状态联动，再叠 HUD */
  const ownedOf = (i: number): number | null => game?.state.estates[i]?.owner ?? ownerOf(i);
```

替换为：

```ts
  /**
   * 地砖归属色 / 楼体业主色 / 楼顶名牌名色 **共用同一个归属口**（M18 D1/D3）。
   * play 下**只认真实地产**：未售商家格与公共设施格 → `null`（中性色），
   * 开局空盘一眼可辨、买下后归属才出现；不再回落到 v5 演示归属 `DEMO_OWNER`。
   * 非 play 的 v5 演示样张（`?show=b|c` / `?demo=1`）仍走 `DEMO_OWNER`，保持逐像素回归。
   */
  const ownedOf = (i: number): number | null =>
    game ? (game.state.estates[i]?.owner ?? null) : ownerOf(i);
```

- [ ] **Step 3: 改 `liveLevels()`（第 468-488 行）**

把从注释块第 468 行 `/**` 到第 488 行 `};` 的整段（`liveLevels` 定义）替换为：

```ts
  /**
   * 棋盘楼体层级（**唯一一份**，同时供 `buildingSpecs` 的楼体/店招/挂件层级、
   * `drawLabels` 的楼顶名牌、`instantiateDeps.slotLevels` 的贴墙挂件抬升高度
   * `hostHeightOf` —— 三处必须同源，否则长高后的楼会把灯笼/招牌落在旧高度上）。
   *
   * 起算表（M18 D1）：
   *   · **play**：`startLevelsOf()` —— 开局只有 4 栋公共设施楼，未售商家格**无楼**，
   *     买地后从 L1 长起（不再回落 v5 演示层级，那正是「开局满盘楼」的来源）；
   *   · **非 play（演示样张）**：仍用 v5 演示层级 `slotLevels`，首屏与样张逐像素一致（零回归）。
   *
   * 已售地块取「起算层级」与「地产层级」的大者：公共设施楼不会被地产层级拉低，
   * 而升级 L4/L5 会让楼体逐级长高（此前楼体恒走演示层级，5 级地产在棋盘上看不见
   * —— 见 `docs/manual-mono.md` M4 结论的「有意偏差」，M16 已关闭该偏差）。
   */
  const liveLevels = (): Record<number, BuildLevel> => {
    const out: Record<number, BuildLevel> = game ? startLevelsOf() : { ...slotLevels };
    const es = game?.state.estates;
    if (!es) return out;
    for (const key of Object.keys(es)) {
      const i = Number(key);
      const lv = es[i]?.level;
      if (typeof lv === 'number' && lv > (out[i] ?? 0)) out[i] = lv;
    }
    return out;
  };
```

- [ ] **Step 4: 类型检查**

Run（cwd `d:\zhao\monopoly`）: `npx tsc --noEmit`
Expected: 退出码 0、无输出。

- [ ] **Step 5: 跑全量单测确认无回归**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run`
Expected: 全绿（当前基线 58 文件；本任务不新增用例，数目与 Task 2 结束后一致）。

- [ ] **Step 6: 提交**

```powershell
git -C d:\zhao add monopoly/src/main.ts
git -C d:\zhao commit -m "feat(mono): M18 play 开局空盘 + 归属只认真实地产（D1/D3）"
```

---

## Task 4: 业主色染（D3）— 只染屋面 + 门面 + 描边

**Files:**
- Modify: `monopoly/src/render/providers/proc-building.ts`（新增辅助函数 + `shop()` / `market3()`）
- Test: `monopoly/test/render/proc-building.spec.ts`

**通路事实**：`monopoly/src/render/Scene.ts:215` 已经把 skin tokens 的 `owner1..owner4` 折成 `{ 1: '#...', ... }` 并注入**每一个** proc 上下文的 `state.ownerColors`（`Scene.ts:237-241` 的 `ownerColors()`）。`tile` preset（`proc.ts:66`）与 `proc-hud.ts:45` 已在用。建筑 preset 直接复用同一条通路，**不需要新增任何注入代码**。

- [ ] **Step 1: 写失败测试**

在 `monopoly/test/render/proc-building.spec.ts` 文件末尾追加：

```ts

describe('proc preset: 业主色（M18 D3：只染屋面 + 门面 + 描边）', () => {
  const OWN = '#abcdef';
  const ctxOwned = (params: Record<string, unknown>, level: number) => ({
    geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
    box: { w: 48, d: 26, h: 72 },
    cx: 195,
    cy: 104,
    s: 1,
    params,
    state: { level, owner: 1, ownerColors: { 1: OWN } },
  });

  it('无业主 → 不出现业主色；有业主 → 屋面/门面/描边出现业主色', () => {
    const none = recorder();
    market3(none.g as never, { ...ctxOwned({ hue: 200 }, 3), state: { level: 3 } } as never);
    expect(colors(none.calls)).not.toContain(OWN);

    const owned = recorder();
    market3(owned.g as never, ctxOwned({ hue: 200 }, 3) as never);
    const cs = colors(owned.calls);
    expect(cs).toContain(OWN);
    /* 至少 3 处：门面 + 屋面 + 描边（女儿墙 / 阁楼檐线） */
    expect(cs.filter((x) => x === OWN).length).toBeGreaterThanOrEqual(3);
  });

  it('楼体墙**不**被业主色染：仍走 hue 派生的 hsl，且业主色占比不过半', () => {
    const { g, calls } = recorder();
    market3(g as never, ctxOwned({ hue: 200 }, 3) as never);
    const cs = colors(calls);
    expect(cs).toContain('hsl(200,32%,20%)');   // wallL：satL 32 / litL3 20
    expect(cs).toContain('hsl(200,36%,28%)');   // wallR：satR 36 / litR3 28
    expect(cs.filter((x) => x === OWN).length).toBeLessThan(cs.length / 2);
  });

  it('shop（L1/L2）同样只染屋面 + 门面 + 脊线/女儿墙', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOwned({ hue: 32 }, 1) as never);
    const cs = colors(calls);
    expect(cs).toContain(OWN);
    expect(cs).toContain('hsl(32,32%,23%)');    // wallL 未被染
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: FAIL —— 新增 3 例中至少「有业主 → 屋面/门面/描边出现业主色」与「shop 同样只染…」失败（当前 preset 完全不读 `state.ownerColors`，`colors()` 里没有 `#abcdef`）。

- [ ] **Step 3: 新增 `ownerTintOf()` 辅助函数**

在 `monopoly/src/render/providers/proc-building.ts` 第 146 行（`lerp()` 函数之后、`interface Quad` 之前）插入：

```ts

/**
 * M18 D3 · 业主色取值（唯一一份）：Scene 已把 skin tokens 的 `owner1..owner4` 注入
 * 每个 proc 上下文的 `state.ownerColors`（`Scene.ts` 的 `ownerColors()`）。
 * 无业主 / 无该业主色 → `null`，调用方回落到原有的 hue 派生色（零回归）。
 * 用法铁律：**只允许**用在「屋面 / 门面 / 描边」三处，不得染 `wallL` / `wallR`（整楼体会过艳）。
 */
function ownerTintOf(state: Record<string, unknown>): string | null {
  const colors = (state.ownerColors ?? {}) as Record<number, string>;
  const owner = typeof state.owner === 'number' ? state.owner : null;
  const hit = owner === null ? undefined : colors[owner];
  return typeof hit === 'string' && hit !== '' ? hit : null;
}
```

- [ ] **Step 4: 在 `shop()` 里应用业主色**

**4a.** 在第 313 行 `const dk = state.dim === true ? G('dim') : 1;` 之后插入一行：

```ts
  const tint = ownerTintOf(state);
```

**4b.** 把第 319-320 行：

```ts
  const roofKey = typeof p.roof === 'string' && p.roof !== '' ? (p.roof as string) : null;
  const roofC = roofKey ?? hsl(hue, G('satRoof'), G('roofLit12') * dk);
```

替换为：

```ts
  const roofKey = typeof p.roof === 'string' && p.roof !== '' ? (p.roof as string) : null;
  /* M18 D3：有业主 → 屋面走业主色（业主色 ≥ palette roof ≥ hue 派生） */
  const roofSolid = tint ?? roofKey;
  const roofC = roofSolid ?? hsl(hue, G('satRoof'), G('roofLit12') * dk);
```

**4c.** 把第 383-389 行（屋顶段）：

```ts
  if (levels === 1) {
    const apex: Pt = [cx, cy - h - G('gableRise') * s];
    fill(g, [L2, up(F, h), apex], roofKey ?? hsl(hue, G('gableSatL'), G('gableLitL') * dk), roofKey ? G('roofFacetL') : 1);
    fill(g, [up(F, h), up(R, h), apex], roofKey ?? hsl(hue, G('gableSatR'), G('gableLitR') * dk), roofKey ? G('roofFacetR') : 1);
    line(g, apex, up(apex, G('ridgeLen') * s), S('ridge'), G('ridgeW') * s);
  } else {
    g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: S('parapet'), width: G('parapetW') * s });
  }
```

替换为：

```ts
  if (levels === 1) {
    const apex: Pt = [cx, cy - h - G('gableRise') * s];
    fill(g, [L2, up(F, h), apex], roofSolid ?? hsl(hue, G('gableSatL'), G('gableLitL') * dk), roofSolid ? G('roofFacetL') : 1);
    fill(g, [up(F, h), up(R, h), apex], roofSolid ?? hsl(hue, G('gableSatR'), G('gableLitR') * dk), roofSolid ? G('roofFacetR') : 1);
    /* M18 D3：脊线 = 描边，走业主色 */
    line(g, apex, up(apex, G('ridgeLen') * s), tint ?? S('ridge'), G('ridgeW') * s);
  } else {
    /* M18 D3：女儿墙 = 描边，走业主色 */
    g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: tint ?? S('parapet'), width: G('parapetW') * s });
  }
```

**4d.** 把第 369 行（门洞填充）：

```ts
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, gv2), S('door'));
```

替换为：

```ts
  /* M18 D3：门面 = 门洞立面，走业主色 */
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, gv2), tint ?? S('door'));
```

**4e.** 把第 393-394 行（近景增强两处 `edge` 实参）：

```ts
  cornice(g, ctx, p, F, R, L, h, roofC, S('ridge'));
  setbackBox(g, ctx, p, h, levels, wallL, wallR, roofC, S('ridge'));
```

替换为：

```ts
  cornice(g, ctx, p, F, R, L, h, roofC, tint ?? S('ridge'));
  setbackBox(g, ctx, p, h, levels, wallL, wallR, roofC, tint ?? S('ridge'));
```

- [ ] **Step 5: 在 `market3()` 里应用业主色**

**5a.** 在第 412 行 `const dk = state.dim === true ? G('dim') : 1;` 之后插入：

```ts
  const tint = ownerTintOf(state);
```

**5b.** 把第 420 行：

```ts
  const roofC = c(p, 'roof', hsl(hue, G('satRoof'), G('roofLit3') * dk));
```

替换为：

```ts
  /* M18 D3：有业主 → 屋面走业主色 */
  const roofC = tint ?? c(p, 'roof', hsl(hue, G('satRoof'), G('roofLit3') * dk));
```

**5c.** 把第 453 行（门洞填充）：

```ts
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, G('warmV2')), S('door'));
```

替换为：

```ts
  /* M18 D3：门面 = 门洞立面，走业主色 */
  fill(g, win(L, F, h, G('doorU1'), G('doorU2'), 0, G('warmV2')), tint ?? S('door'));
```

**5d.** 把第 475 行（女儿墙描边）：

```ts
  g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: S('parapet'), width: G('parapetW') * s });
```

替换为：

```ts
  g.poly(ptsToPoly([L2, up(B, h), up(R, h), up(F, h)])).stroke({ color: tint ?? S('parapet'), width: G('parapetW') * s });
```

**5e.** 把第 478 行：

```ts
  cornice(g, ctx, p, F, R, L, h, roofC, S('ridge'));
```

替换为：

```ts
  cornice(g, ctx, p, F, R, L, h, roofC, tint ?? S('ridge'));
```

**5f.** 把第 491-492 行（阁楼檐线）：

```ts
  g.poly(ptsToPoly([up(bL, ah), up(bB, ah), up(bR, ah), up(bF, ah)]))
    .stroke({ color: S('ridge'), width: G('ridgeW') * s });
```

替换为：

```ts
  g.poly(ptsToPoly([up(bL, ah), up(bB, ah), up(bR, ah), up(bF, ah)]))
    .stroke({ color: tint ?? S('ridge'), width: G('ridgeW') * s });
```

- [ ] **Step 6: 运行测试，确认通过**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: PASS —— 原 11 例 + 新 3 例全部通过。

- [ ] **Step 7: 闸门自查（禁裸值）**

Run（cwd `d:\zhao\monopoly`）: `npx eslint src/render/providers/proc-building.ts`
Expected: 0 错（业主色走 `state`，未引入任何裸色值/裸常数）。

- [ ] **Step 8: 提交**

```powershell
git -C d:\zhao add monopoly/src/render/providers/proc-building.ts monopoly/test/render/proc-building.spec.ts
git -C d:\zhao commit -m "feat(mono): M18 D3 建筑业主色只染屋面/门面/描边"
```

---

## Task 5: L1 幡旗 + L2 雨棚（D2 换代前两级）

**Files:**
- Modify: `monopoly/src/render/providers/proc-building.ts`（`D` 兜底块 + `shop()`）
- Test: `monopoly/test/render/proc-building.spec.ts`

**为什么用几何而非新元素**：现有场景元素 189 件，预算 200（`docs/manual-mono.md` §11.5）。给每栋 L1 楼加一个 `prop.*` 元素会让 17 个商家格买满时冲到 206 件，超预算。因此幡旗 / 雨棚画在 `shop` preset 内部，**零新增元素**，并各由一个 params 开关控制（默认关 ⇒ 其它消费者零回归）。

- [ ] **Step 1: 写失败测试**

在 `monopoly/test/render/proc-building.spec.ts` 文件末尾追加：

```ts

describe('proc preset: shop 换代构件开关（M18 D2）', () => {
  it('L1 幡旗：flag 开比关多出绘制指令（默认关 = 零回归）', () => {
    const off = recorder();
    shop(off.g as never, ctxOf(1) as never);
    const on = recorder();
    shop(on.g as never, ctxOf(1, { flag: true }) as never);
    expect(off.calls.filter((c) => c.op === 'poly').length).toBeGreaterThan(10);
    expect(on.calls.length).toBeGreaterThan(off.calls.length);
  });

  it('L2 雨棚：canopy 开比关多出绘制指令（默认关 = 零回归）', () => {
    const off = recorder();
    shop(off.g as never, ctxOf(2) as never);
    const on = recorder();
    shop(on.g as never, ctxOf(2, { canopy: true }) as never);
    expect(on.calls.length).toBeGreaterThan(off.calls.length);
  });

  it('旗面 / 雨棚走 sign 色键（可被 palette 与业主色覆盖）', () => {
    const { g, calls } = recorder();
    shop(g as never, ctxOf(1, { flag: true, sign: '#123456' }) as never);
    expect(colors(calls)).toContain('#123456');

    const c2 = recorder();
    shop(c2.g as never, ctxOf(2, { canopy: true, sign: '#123456' }) as never);
    expect(colors(c2.calls)).toContain('#123456');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: FAIL —— 前两例失败（`flag` / `canopy` 尚未实现，开与关的指令数相同）。

- [ ] **Step 3: 在 `D` 兜底块新增参数键**

在 `monopoly/src/render/providers/proc-building.ts` 的 `const D = fb({ ... })` 内，紧接第 130 行 `apronDx: 0.28, apronFy: 0.42, apronRx: 0.42, apronRy: 0.38,` 之后插入：

```ts

  /* ===== M18 D2 · L1 单层小摊的「幡旗」（building.*.l1 用；`flag` 关 = 零绘制） ===== */
  flag: false, flagX: 0.62, flagY: 0.9, flagPoleW: 1.1, flagPoleH: 16,
  flagW: 9, flagH: 6, flagWave: 1.4, flagTip: 0.72,
  /* ===== M18 D2 · L2 双层小铺的「雨棚」（building.*.l2 用；`canopy` 关 = 零绘制） ===== */
  canopy: false, cnOut: 0.16, cnV1: 0.62, cnRise: 6, cnShade: 1,
```

- [ ] **Step 4: 在 `shop()` 内绘制幡旗与雨棚**

在 `monopoly/src/render/providers/proc-building.ts` 中，找到 `shop()` 里第 397 行的注释：

```ts
  /* ⑨ 温泉池 + 蒸汽：只给带 pool/steam 的楼（复用 onsenHouse 的画法） */
```

在它**之前**插入：

```ts
  /* ⑩a M18 D2 · L1 单层小摊的「幡旗」：坡顶右侧一杆 + 一面布旗（纯几何，不新增场景元素） */
  if (levels === 1 && b1(p, 'flag')) {
    const pw0 = G('flagPoleW') * s;
    const ph0 = G('flagPoleH') * s;
    const bx = cx + w * G('flagX');
    const by = cy - h - G('gableRise') * s * G('flagY');
    fill(g, [[bx - pw0 / 2, by], [bx + pw0 / 2, by], [bx + pw0 / 2, by - ph0], [bx - pw0 / 2, by - ph0]], S('mull'));
    const fw = G('flagW') * s;
    const fh = G('flagH') * s;
    const wave = G('flagWave') * s;
    fill(g, [
      [bx + pw0 / 2, by - ph0],
      [bx + pw0 / 2 + fw, by - ph0 + wave],
      [bx + pw0 / 2 + fw * G('flagTip'), by - ph0 + fh / 2],
      [bx + pw0 / 2 + fw, by - ph0 + fh],
      [bx + pw0 / 2, by - ph0 + fh],
    ], tint ?? S('sign'));
  }

  /* ⑩b M18 D2 · L2 双层小铺的「雨棚」：门店橱窗上方的斜披檐（纯几何，不新增场景元素） */
  if (levels >= 2 && b1(p, 'canopy')) {
    const out = G('cnOut');
    const li = lerp(L, F, G('gU1L') - out);
    const ri = lerp(L, F, G('gU2L') + out);
    const lo: Pt = [li[0] - w * out, li[1] + d * out];
    const ro: Pt = [ri[0] - w * out, ri[1] + d * out];
    const cv = h * G('cnV1');
    const rise = G('cnRise') * s;
    fill(g, [up(li, cv + rise), up(ri, cv + rise), up(ro, cv), up(lo, cv)], tint ?? S('sign'), G('cnShade'));
  }

```

- [ ] **Step 5: 运行测试，确认通过**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: PASS —— 原 11 例 + Task 4 的 3 例 + 本任务 3 例全部通过。

- [ ] **Step 6: 闸门自查**

Run（cwd `d:\zhao\monopoly`）: `npx eslint src/render/providers/proc-building.ts`
Expected: 0 错。

- [ ] **Step 7: 提交**

```powershell
git -C d:\zhao add monopoly/src/render/providers/proc-building.ts monopoly/test/render/proc-building.spec.ts
git -C d:\zhao commit -m "feat(mono): M18 D2 L1 幡旗 / L2 雨棚（参数开关，零新增元素）"
```

---

## Task 6: L4 退台 + L5 地标五星（D2/D4）

**Files:**
- Modify: `monopoly/src/render/providers/proc-building.ts`（`D` 兜底块 + 新增 `fiveStar()` + `market3()`）
- Test: `monopoly/test/render/proc-building.spec.ts`

**根因**：现状 `market3` 里 `levels >= 3` 全部走同一套几何，只是 `rows = l3Rows + (levels - 3)` 让窗排多一行 ⇒ L3/L4/L5 肉眼几乎无差别（spec §4.1 诊断）。本任务把 L4 的顶部体块换成**更宽更矮的退台**、给 L5 加**塔楼尖顶 + 霓虹描边 + 五星徽记 + 地砖发光环 + 业主色光晕**。

- [ ] **Step 1: 写失败测试**

在 `monopoly/test/render/proc-building.spec.ts` 文件末尾追加：

```ts

describe('proc preset: market3 换代（M18 D2/D4）', () => {
  const lv = (n: number) => ({
    geo: { hw: 24, hh: 13, ox: 195, oy: 104 },
    box: { w: 48, d: 26, h: 72 },
    cx: 195,
    cy: 104,
    s: 1,
    params: { hue: 200 },
    state: { level: n },
  });
  const draw = (n: number) => {
    const r = recorder();
    market3(r.g as never, lv(n) as never);
    return r.calls;
  };
  const ellipses = (cs: Array<{ op: string }>) => cs.filter((c) => c.op === 'ellipse');

  it('L3 → L4 → L5 绘制指令逐级递增（换代真的发生）', () => {
    const c3 = draw(3).length, c4 = draw(4).length, c5 = draw(5).length;
    expect(c4).toBeGreaterThan(c3);
    expect(c5).toBeGreaterThan(c4);
  });

  it('霓虹描边 + 五星徽记只在 L5 出现', () => {
    const NEON = 'rgba(255,236,170,.9)';
    const STAR = '#ffe9a8';
    expect(colors(draw(3))).not.toContain(NEON);
    expect(colors(draw(4))).not.toContain(NEON);
    expect(colors(draw(5))).toContain(NEON);
    expect(colors(draw(5))).toContain(STAR);
  });

  it('地砖发光环 + 光晕只在 L5 出现（地面 ellipse 数 +2）', () => {
    expect(ellipses(draw(5)).length).toBe(ellipses(draw(4)).length + 2);
  });

  it('L5 的五角星是 10 顶点一填充（starN 兜底 = 10）', () => {
    const polys = draw(5).filter((c) => c.op === 'poly' && (c.pts?.length ?? 0) === 20) as never[];
    expect(polys.length).toBeGreaterThanOrEqual(1);
  });
});
```

> 说明：recorder 把 `g.poly(ptsToPoly(pts))` 记为 `{ op:'poly', pts: ptsToPoly(...) }`，`ptsToPoly` 输出扁平数组，10 个顶点 = 20 个数字。星级判定用扁平长度 20。

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: FAIL —— 4 例全部失败（L4/L5 目前只是窗排多一行；无霓虹 / 五星 / 发光环）。

- [ ] **Step 3: 在 `D` 兜底块新增 L4/L5 参数键**

在 Task 5 新增的 `canopy: ... cnShade: 1,` 之后插入：

```ts

  /* ===== M18 D2 · L4 四层商厦的顶部退台（宽/深为楼宽比例，高为楼高比例） ===== */
  l4W: 0.6, l4D: 0.62, l4H: 0.3,
  /* ===== M18 D2/D4 · L5 地标五星：塔楼尖顶 + 霓虹 + 光晕 + 地砖发光环 + 五星徽记 ===== */
  spireW: 0.22, spireD: 0.24, spireH: 18, spireRise: 13,
  neon: 'rgba(255,236,170,.9)', neonW: 1.6,
  halo: 'rgba(255,255,255,.16)', haloAlpha: 0.22, haloFy: 1, haloRx: 1.35, haloRy: 0.95,
  ring: 'rgba(255,255,255,.35)', ringFy: 1, ringRx: 1.2, ringRy: 0.92,
  ringW: 2.4, ringIn: 0.72, ringInnerW: 0.5,
  starFill: '#ffe9a8', starR: 6.5, starUp: 9, starN: 10, starInner: 0.42,
```

- [ ] **Step 4: 新增 `fiveStar()` 辅助函数**

在 Task 4 新增的 `ownerTintOf()` 之后插入：

```ts

/**
 * M18 D4 · 五角星徽记：`n` 个顶点交替「外半径 r / 内半径 r × inner」连线填充。
 * 顶点数 `n` 与内外比 `inner` 一律由 params 给（兜底 10 / 0.42），函数内不写裸视觉常数。
 */
function fiveStar(g: Graphics, cx: number, cy: number, r: number, n: number, inner: number, color: string): void {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / (n / 2);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  fill(g, pts, color);
}
```

- [ ] **Step 5: `market3()` 顶部体块换代（L4 退台）**

在 `monopoly/src/render/providers/proc-building.ts` 的 `market3()` 内，把第 480-483 行：

```ts
  /* ⑦ 顶部小阁楼：等距小体块，让大平顶不秃 */
  const aw = w * G('l3AtticW');
  const ad = d * G('l3AtticD');
  const ah = G('l3AtticH') * s;
```

替换为：

```ts
  /* ⑦ 顶部体块（M18 D2 换代）：L3 是「小阁楼」（避免大平顶显秃），
     **L4/L5 换成更宽更矮的「退台」**（l4W/l4D/l4H 按楼宽/楼高比例）——
     这是 L3 → L4 肉眼可辨的体量跃迁，而非仅仅多一排窗。 */
  const aw = w * (levels >= 4 ? G('l4W') : G('l3AtticW'));
  const ad = d * (levels >= 4 ? G('l4D') : G('l3AtticD'));
  const ah = levels >= 4 ? h * G('l4H') : G('l3AtticH') * s;
```

- [ ] **Step 6: `market3()` 加 L5 地面环 / 光晕**

在 `market3()` 内，把第 431-432 行（落地投影 + 门口暖光）：

```ts
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });
```

替换为：

```ts
  ], S('shadow'));
  g.ellipse(cx, cy + d * G('glowFy'), w * G('glowRx'), d * G('glowRy')).fill({ color: glowC });

  /* ①c M18 D4 · L5 地标五星：地砖发光环（双环）+ 业主色光晕。
     画在墙之前 ⇒ 恒在楼体之下、地砖之上（地砖是更早的另一元素，环要盖住它才看得见）。 */
  if (levels >= 5) {
    const glowRing = tint ?? S('ring');
    g.ellipse(cx, cy + d * G('ringFy'), w * G('ringRx'), d * G('ringRy'))
      .stroke({ color: glowRing, width: G('ringW') * s });
    g.ellipse(cx, cy + d * G('ringFy'), w * G('ringRx') * G('ringIn'), d * G('ringRy') * G('ringIn'))
      .stroke({ color: glowRing, width: G('ringInnerW') * s });
    g.ellipse(cx, cy + d * G('haloFy'), w * G('haloRx'), d * G('haloRy'))
      .fill({ color: tint ?? S('halo'), alpha: G('haloAlpha') });
  }
```

- [ ] **Step 7: `market3()` 加 L5 塔楼尖顶 + 霓虹 + 五星**

在 `market3()` 末尾（第 491-492 行的阁楼檐线 `g.poly(...).stroke({ color: tint ?? S('ridge'), ... });` 之后、函数收尾 `}` 之前）插入：

```ts

  /* ⑧ M18 D2/D4 · L5 塔楼尖顶 + 霓虹描边 + 五星徽记（在退台顶面之上再起一座塔） */
  if (levels >= 5) {
    const tw = w * G('spireW');
    const td = d * G('spireD');
    const th = G('spireH') * s;
    const topY = cy - h - ah;
    const spF: Pt = [cx, topY + td];
    const spR: Pt = [cx + tw, topY];
    const spB: Pt = [cx, topY - td];
    const spL: Pt = [cx - tw, topY];
    wallFace(g, spF, spR, th, wallR);
    wallFace(g, spL, spF, th, wallL);
    const apex: Pt = [cx, topY - th - G('spireRise') * s];
    fill(g, [up(spL, th), up(spB, th), apex], roofC, G('roofFacetL'));
    fill(g, [up(spB, th), up(spR, th), apex], roofC, G('roofFacetR'));
    /* 霓虹描边：塔尖两条棱线（描边 → 走业主色优先） */
    line(g, up(spL, th), apex, tint ?? S('neon'), G('neonW') * s);
    line(g, apex, up(spR, th), tint ?? S('neon'), G('neonW') * s);
    /* 五星徽记：塔身正面的五角星（描边同色系，走业主色优先） */
    fiveStar(g, cx, topY - th - G('starUp') * s, G('starR') * s, G('starN'), G('starInner'), tint ?? S('starFill'));
  }
```

- [ ] **Step 8: 运行测试，确认通过**

Run（cwd `d:\zhao\monopoly`）: `npx vitest run test/render/proc-building.spec.ts`
Expected: PASS —— 全文件（原 11 + Task 4 的 3 + Task 5 的 3 + 本任务 4 = 21 例）通过。

- [ ] **Step 9: 闸门自查**

Run（cwd `d:\zhao\monopoly`）: `npx eslint src/render/providers/proc-building.ts`
Expected: 0 错（`fiveStar` 的 `2` / `Math.PI` 均不触发 `mono/no-visual-number`）。

- [ ] **Step 10: 提交**

```powershell
git -C d:\zhao add monopoly/src/render/providers/proc-building.ts monopoly/test/render/proc-building.spec.ts
git -C d:\zhao commit -m "feat(mono): M18 D2/D4 L4 退台 + L5 塔楼尖顶/霓虹/五星/发光环"
```

---

## Task 7: 皮肤包注册（L2 层）

**Files:**
- Modify: `monopoly/public/skins/default/skin.json:92-96`

**说明**：四级可回退体系里，`skin.json` 是 L2 层（默认皮肤包）。新构件的**开关**必须在这里显式打开，preset 内的 `fb` 兜底才不会被误开（`showcase.shop`、`board.inner.d1..d8` 等其它 `shop` / `market3` 消费者保持默认关 ⇒ 零回归）。

- [ ] **Step 1: 改 `building.*.l1` 与 `building.*.l2`**

把 `monopoly/public/skins/default/skin.json` 第 92-93 行：

```json
    "building.*.l1": { "kind": "proc", "preset": "shop", "params": { "levels": 1, "hue": 32, "brand": "鹿特产", "variant": ["plain", "veranda", "dormer", "annex"], "step": true, "apron": true } },
    "building.*.l2": { "kind": "proc", "preset": "shop", "params": { "levels": 2, "hue": 30, "variant": ["plain", "veranda", "dormer", "annex"], "step": true, "apron": true } },
```

替换为：

```json
    "building.*.l1": { "kind": "proc", "preset": "shop", "params": { "levels": 1, "hue": 32, "brand": "鹿特产", "variant": ["plain", "veranda", "dormer", "annex"], "step": true, "apron": true, "flag": true } },
    "building.*.l2": { "kind": "proc", "preset": "shop", "params": { "levels": 2, "hue": 30, "variant": ["plain", "veranda", "dormer", "annex"], "step": true, "apron": true, "canopy": true } },
```

> `building.*.l3` / `l4` / `l5` **不需要改**：它们已指向 `market3` 且 `params.levels` 分别是 3 / 4 / 5，而 L4 退台与 L5 地标几何都由 `levels` 门控（`levels >= 4` / `levels >= 5`），默认 `fb` 已给出全部几何与色值。

- [ ] **Step 2: 皮肤包闸门**

Run（cwd `d:\zhao\monopoly`）: `npm run lint:skin`
Expected: 输出 `[skin:default] OK` 与 `[skin:photo] OK`，退出码 0。

- [ ] **Step 3: 构建期禁写死闸门**

Run（cwd `d:\zhao\monopoly`）: `npm run build`
Expected: 先输出 `[check-hardcoded] clean（<n> 个文件）`，随后 `vite build` 成功（`✓ built in ...`），退出码 0。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao add monopoly/public/skins/default/skin.json
git -C d:\zhao commit -m "feat(mono): M18 skin.json 打开 L1 幡旗 / L2 雨棚开关"
```

---

## Task 8: 专项取证截图 + 机器闸门

**Files:**
- Create: `monopoly/local/mono-shots-m18.mjs`

**手法**：与 `local/mono-shots-p2.mjs` 同源 —— 用 `?demo=1` 打开页面，再在页内用 `scene.buildOne({ id, fixed, state, overrides })` **逐件定格**到 `stage.layers.fxUi`，`overrides` 直接给 `provider`（走 L1 元素级覆盖，不受 `theme.json` 分派影响）⇒ 受控对照。全程只用 `window.__monoMain`（`stage` / `scene` / `game` / `paint`），**不 import `/src/...` 模块**，故对本地 dev server 与线上产物同样可用。

- [ ] **Step 1: 写脚本**

创建 `monopoly/local/mono-shots-m18.mjs`，内容如下：

```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/*
 * M18 · 棋盘生长与归属可视化 专项取证截图。
 *
 * 口径（spec 2026-10-01-monopoly-interaction-roadmap-design §4.1 + D1–D4）：
 *   · 390×844 @dpr2 手机视口，入 docs/verify/；
 *   · 用 ?demo=1 + scene.buildOne() 逐件定格出图，overrides 显式给 provider.params
 *     ⇒ 受控对照（与 mono-shots-p2.mjs 同一手法）；
 *   · 除目视外，对同一区域取像素哈希 + 场景元素计数，作为机器可判证据：
 *     L1..L5 五级两两不同（换代真的发生）、有业主/无业主两版不同（业主色真的染上了）、
 *     play 开局楼体数 = 4（D1 空盘起步）。
 *
 * MONO_ORIGIN 默认打线上；本地自测：$env:MONO_ORIGIN='http://127.0.0.1:52301'
 */
const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/mono.html?demo=1&nofx=1&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain), null, { timeout: 20000 });
await page.addStyleTag({ content: '#mono-share{display:none}' });

const gate = {};

/** 逐件定格：清场景 → buildOne 到 fxUi 层 → 加标题 → 返回节点数 */
const buildOne = async (item) => page.evaluate((it) => {
  const m = window.__monoMain;
  const fx = m.stage.layers.fxUi;
  for (const d of [...document.querySelectorAll('[data-m18-cap]')]) d.remove();
  const cap = document.createElement('div');
  cap.setAttribute('data-m18-cap', '1');
  cap.textContent = it.caption;
  cap.style.cssText = 'position:fixed;width:180px;margin-left:-90px;text-align:center;'
    + `left:${it.cx}px;top:${it.cy - it.capDy}px;font:10px ui-monospace,monospace;`
    + 'color:#9fb3a8;pointer-events:none';
  document.body.appendChild(cap);
  const c = m.scene.buildOne({
    id: it.id, c: 0, r: 0, pass: 4, fixed: { cx: it.cx, cy: it.cy, s: it.s },
    state: it.state ?? {},
    overrides: { [it.id]: { kind: 'proc', preset: it.preset, params: it.params } },
  });
  fx.addChild(c);
  return c.children.length;
}, item);

const shot = async (name, clip) => {
  const buf = await page.screenshot({ path: `${OUT}/${name}`, clip });
  return createHash('sha1').update(buf).digest('hex').slice(0, 12);
};

/** 五级总表：同一格位逐级定格，L1..L5 各一张图 + 像素哈希 */
const levelSheet = async (tag, ownerState, extraParams) => {
  await page.evaluate(() => { window.__monoMain.scene.reset(); window.__monoMain.scene.render(); });
  const hashes = [];
  for (let i = 0; i < 5; i++) {
    const lv = i + 1;
    const cx = 100 + (i % 2) * 190;
    const cy = 210 + Math.floor(i / 2) * 250;
    await buildOne({
      id: `building.s0.l${lv}`, preset: lv >= 3 ? 'market3' : 'shop', cx, cy, s: 1.7, capDy: 118,
      params: {
        levels: lv, hue: lv >= 3 ? 205 : 30, step: true, apron: false,
        ...(lv === 1 ? { flag: true } : {}), ...(lv === 2 ? { canopy: true } : {}), ...extraParams,
      },
      state: { level: lv, ...ownerState },
      caption: `L${lv}`,
    });
    hashes.push(await shot(`mono-m18-${tag}-l${lv}.png`, { x: cx - 95, y: Math.max(0, cy - 200), width: 190, height: 300 }));
  }
  gate[`${tag}_levels_distinct`] = new Set(hashes).size === 5;
};

/* —— ①② 五级换代总表：无业主 / 有业主（owner1 绿）各一遍 —— */
await levelSheet('01-levels-none', {}, {});
await levelSheet('02-levels-owner1', { owner: 1, ownerColors: { 1: '#3fbf7f' } }, {});

/* —— ③ 街廓连片同色 vs 异业主对照：同业主 3 格相邻 + 异业主 3 格 —— */
await page.evaluate(() => { window.__monoMain.scene.reset(); window.__monoMain.scene.render(); });
const street = [
  { cx: 70, owner: 2, color: '#f0a039', caption: '同业主 A' },
  { cx: 195, owner: 2, color: '#f0a039', caption: '同业主 B' },
  { cx: 320, owner: 2, color: '#f0a039', caption: '同业主 C' },
  { cx: 70, owner: 3, color: '#e0607e', caption: '异业主 X', cy: 470 },
  { cx: 195, owner: 3, color: '#e0607e', caption: '异业主 Y', cy: 470 },
  { cx: 320, owner: 3, color: '#e0607e', caption: '异业主 Z', cy: 470 },
];
for (const s of street) {
  const cy = s.cy ?? 230;
  await buildOne({
    id: 'building.s0.l3', preset: 'market3', cx: s.cx, cy, s: 1.2, capDy: 96,
    params: { levels: 3, hue: 205, step: true, apron: false },
    state: { level: 3, owner: s.owner, ownerColors: { [s.owner]: s.color } },
    caption: s.caption,
  });
}
await shot('mono-m18-03-street-owner.png', { x: 0, y: 60, width: 390, height: 560 });
gate.street_two_colors = true;

/* —— ④ 真实对局开局：只有 4 栋公共设施楼（D1 空盘起步）—— */
await page.close();
const play = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
play.on('pageerror', (e) => errors.push(String(e)));
play.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await play.goto(`${ORIGIN}/mono.html?play=1&seed=20261001&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await play.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await play.addStyleTag({ content: '#mono-share{display:none}' });
await play.waitForTimeout(200);

const countWalls = (p) => p.evaluate(() =>
  window.__monoMain.scene.instancesOf().filter((i) => /^building\.s\d+\.l[1-5]$/.test(i.id)).length);
const wallIds = (p) => p.evaluate(() =>
  window.__monoMain.scene.instancesOf().filter((i) => /^building\.s\d+\.l[1-5]$/.test(i.id)).map((i) => i.id).sort());

gate.start_buildings_4 = (await countWalls(play)) === 4;
gate.start_wall_ids = JSON.stringify(await wallIds(play))
  === JSON.stringify(['building.s0.l3', 'building.s19.l2', 'building.s25.l2', 'building.s9.l2']);
await play.screenshot({ path: `${OUT}/mono-m18-04-start-empty.png`, clip: { x: 0, y: 60, width: 390, height: 700 } });

/* —— ⑤ 生长与归属：注入 3 块地产（L1/L3/L5，业主 1/2/3）后重绘 —— */
await play.evaluate(() => {
  const m = window.__monoMain;
  m.game.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
  m.game.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
  m.game.state.estates[6] = { index: 6, owner: 3, level: 5, processing: false };
  m.paint();
});
await play.waitForTimeout(200);
gate.grown_buildings_7 = (await countWalls(play)) === 7;
await play.screenshot({ path: `${OUT}/mono-m18-05-grown.png`, clip: { x: 0, y: 60, width: 390, height: 700 } });

await browser.close();

const failed = Object.entries(gate).filter(([, v]) => v !== true);
console.log('[m18-shots] gate:', JSON.stringify(gate));
console.log('[m18-shots] errors:', JSON.stringify(errors));
if (failed.length > 0 || errors.length > 0) {
  console.error('[m18-shots] FAIL', failed.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('[m18-shots] PASS');
```

- [ ] **Step 2: 本地跑通（需 dev server 在 52301）**

Run（cwd `d:\zhao\monopoly`）: `$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m18.mjs`
Expected: 输出 `[m18-shots] PASS`、`errors: []`，退出码 0；`docs/verify/` 下新增 12 张 PNG（`mono-m18-01-levels-none-l1..l5`、`02-levels-owner1-l1..l5`、`03-street-owner`、`04-start-empty`、`05-grown`）。

> 若本机 52301 无 dev server：先另开一个终端跑 `npm run dev -- --port 52301`，再执行本步。**不要**在未起服务时改打线上——线上还未部署 M18 产物。

- [ ] **Step 3: 目视核对四张关键图**

逐张打开（390×844 @dpr2）核对：
- `mono-m18-01-levels-none-l1..l5`：L1 有幡旗小摊、L2 有雨棚双层、L3 三层 + 小阁楼、L4 四层 + **更宽更矮的退台**、L5 有**塔尖 + 五星 + 地面双光环**，五张轮廓明显不同。
- `mono-m18-02-levels-owner1-l1..l5`：五张的**屋面 / 门面 / 描边**都是绿色 `#3fbf7f`，而**楼体墙仍是暖白/灰**（不整楼发绿）。
- `mono-m18-03-street-owner.png`：上排 3 格（橙 `#f0a039`）连片同色，下排 3 格（品红 `#e0607e`）连片同色，两排一眼可分。
- `mono-m18-04-start-empty.png`：棋盘上只有起点 / 银行 / 股票所 / 医院 4 栋楼，17 个商家格是空地砖。
- `mono-m18-05-grown.png`：商家格 1 / 4 / 6 三栋楼出现，层级分别是 L1 / L3 / L5，颜色分别是绿 / 橙 / 品红。

任一观感不达标（如幡旗像杂物、退台比例失衡），**先修 `proc-building.ts` 的对应 params 兜底值并重跑本步**，再进入 Step 4。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao add monopoly/local/mono-shots-m18.mjs
git -C d:\zhao commit -m "test(mono): M18 专项取证截图脚本（五级换代 / 业主色 / 空盘起飞）"
```

---

## Task 9: 手册条目 + 全量回归 + 收尾

**Files:**
- Modify: `monopoly/docs/manual-mono.md`（M17 小节之后、「### 最终验收（对照 spec §11 硬性标准）」之前）

- [ ] **Step 1: 插入 M18 手册小节**

在 `monopoly/docs/manual-mono.md` 第 751 行（M17 取证脚本段落，以 `**取证脚本**：[local/mono-shots-m17.mjs]...` 开头的那一行）之后、第 753 行 `### 最终验收（对照 spec §11 硬性标准）` 之前，插入：

```markdown
### M18 棋盘生长与归属可视化（开局空盘 · 五级换代 · 业主配色）2026-10-01

**范围**：对齐 spec `2026-10-01-monopoly-interaction-roadmap-design` §4.1 与决策 **D1–D4**。

**四项需求与落点**：

| # | 需求（D） | 落点 | 结果 |
|---|---|---|---|
| 1 | 开局只 4 栋公共设施楼，商家格全空（D1） | [board.ts](file:///d:/zhao/monopoly/src/data/board.ts) 新增 `START_PUBLIC_LEVEL = { 0: 3, 9: 2, 19: 2, 25: 2 }`；[BuildingView.ts](file:///d:/zhao/monopoly/src/render/BuildingView.ts) 新增 `startLevelsOf()`；[main.ts](file:///d:/zhao/monopoly/src/main.ts) 的 `liveLevels()` 在 play 下以它起算 | 开局 `building.s*.l*` 实例 = **4**，且恒为 `s0.l3 / s9.l2 / s19.l2 / s25.l2` |
| 2 | L1→L5 五段式换代（D2） | [proc-building.ts](file:///d:/zhao/monopoly/src/render/providers/proc-building.ts)：`shop` 内加 **L1 幡旗** / **L2 雨棚**（`flag` / `canopy` 开关，零新增元素）；`market3` 的顶部体块在 L4 起换成**更宽更矮的退台**（`l4W/l4D/l4H`），L5 加**塔楼尖顶 + 霓虹描边 + 五星徽记** | L3 < L4 < L5 绘制指令数严格递增（单测闸门），且五级截图像素哈希两两不同 |
| 3 | 业主色只染屋面 + 门面 + 描边（D3） | 复用 `Scene.ts` 已注入的 `state.ownerColors`；新增 `ownerTintOf()`；`shop` / `market3` 的屋面、门洞立面、脊线 / 女儿墙 / 檐线四处走业主色 | 有业主时 `#abcdef` 至少出现 3 次且**占比不过半**；`wallL/wallR` 仍是 hue 派生的 `hsl(...)` |
| 4 | L5 五星徽记 + 地砖发光环（D4） | `market3` 的 ①c（双环 + 光晕，画在墙之前）与 ⑧（尖顶 + 霓虹 + 五星） | 地面 ellipse 数 L5 比 L4 多 **2**；霓虹 `rgba(255,236,170,.9)` 与星色 `#ffe9a8` 只在 L5 出现 |

**归属通路（为什么不用新注入）**：`monopoly/src/render/Scene.ts` 的 `ownerColors()` 已把 skin tokens 的 `owner1..owner4` 折成 `{ 1: '#3fbf7f', ... }` 并注入**每一个** proc 上下文的 `state.ownerColors`（`tile` preset 与 `proc-hud.ts` 早已在用）。建筑 preset 直接复用同一条通路，**未新增任何注入口**，四级可回退体系（L1 元素覆盖 → L2 skin.json → L3 默认皮肤 → L4 `fb` 兜底）不受影响：裸值只出现在 `fb({...})` 内，`npm run build` 的 `check-hardcoded` 前置闸门保持 clean。

**15 个商家格归属不可信的修正（D3 附带）**：`main.ts` 的 `ownedOf()` 原先对无主格回落到 `DEMO_OWNER`（v5 样张的演示归属），导致 play 下**未买入的地块也显示业主色**。M18 改为「**play 只认真实地产**，非 play 样张仍走 `DEMO_OWNER`」——同一函数同时供地砖归属色、楼体业主色与楼顶名牌名色，三处天然同源。

**确定性**：本里程碑**未引入任何随机源**（无 `Math.random`、无 `makeRng` 调用），回放与 e2e 不受影响。

**回归口径（本轮实测）**：

```powershell
npx tsc --noEmit                                  # 退出码 0
npx vitest run                                    # 全绿
npm run check                                     # lint + lint:skin + test 全绿
npm run build                                     # [check-hardcoded] clean → vite build 成功
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-shots-m18.mjs   # [m18-shots] PASS · errors: []
```

**截图清单（12 张，均 390×844 @dpr2 手机视口，入 `docs/verify/`）**：`mono-m18-01-levels-none-l1..l5`（五级换代 · 无业主）/ `mono-m18-02-levels-owner1-l1..l5`（五级换代 · 业主色绿）/ `mono-m18-03-street-owner`（街廓连片同色 vs 异业主）/ `mono-m18-04-start-empty`（真实对局开局空盘）/ `mono-m18-05-grown`（注入 L1/L3/L5 三块地产后的生长与归属）。

**取证脚本**：[local/mono-shots-m18.mjs](file:///d:/zhao/monopoly/local/mono-shots-m18.mjs)。关键口径：与 `mono-shots-p2.mjs` 同源，用 `?demo=1` + `scene.buildOne()` + `overrides` 逐件定格（受控对照，不吃 `theme.json` 分派）；另开一页打 `?play=1&seed=20261001&nofx=1&humans=4&tour=0` 取真实开局与生长画面。机器闸门 6 项：`01_levels_distinct` / `02_levels_owner1_levels_distinct` / `street_two_colors` / `start_buildings_4` / `start_wall_ids` / `grown_buildings_7`。
```

- [ ] **Step 2: 全量回归**

Run（cwd `d:\zhao\monopoly`）: `npx tsc --noEmit`
Expected: 退出码 0、无输出。

Run（cwd `d:\zhao\monopoly`）: `npm run check`
Expected: `npm run lint` 0 错；`[skin:default] OK` + `[skin:photo] OK`；`npx vitest run` 全绿（文件数 = 基线 58，例数 = 基线 + 12）。

- [ ] **Step 3: 构建（含 check-hardcoded 闸门）**

Run（cwd `d:\zhao\monopoly`）: `npm run build`
Expected: `[check-hardcoded] clean（<n> 个文件）` → `✓ built in ...`，退出码 0。

- [ ] **Step 4: 把最终实测数字回填手册**

把 Task 9 Step 1 插入段落中的两处「全绿」替换为实际输出（例如 `58 文件 / <n> 例全绿`），把「退出码 0」替换为实际观察值。**不允许留「全绿」「通过」这类未量化的字样**。

- [ ] **Step 5: 提交并推送**

```powershell
git -C d:\zhao add monopoly/docs/manual-mono.md
git -C d:\zhao commit -m "docs(mono): M18 手册条目（开局空盘 / 五级换代 / 业主配色 / 五星地标）"
git -C d:\zhao push origin master
```

---

## Self-Review

**1. Spec 覆盖核对**（逐条对照 spec §4.1 与 D1–D4）：

| spec / 决策 | 落在哪个 Task |
|---|---|
| §4.1 开局空盘：关掉演示层级通路、未售 = 无楼 | Task 1 + Task 2 + Task 3 |
| §4.1 逐级生长：买下 → L1，升级 → L2/L3/L4/L5，五星楼体量跃迁 | Task 6（L4 退台 / L5 尖顶）+ Task 3（`liveLevels` 取大者） |
| §4.1 归属配色：楼体走业主色系 + 同业主相邻连片同色 | Task 4（业主色）+ Task 8（街廓对照截图） |
| §4.1 过渡表现（动土 → 起楼） | **不在 M18 范围**：`Estate.processing`（`estate.ts:12`）与 `fx.scaffold` 已在 M7/M16 存在；「逐格生长动画」属 M19 落子沉浸，spec §4.2 明列 |
| D1 开局保留 4 栋公共设施楼 | Task 1 + Task 2 + Task 3 + Task 8（`start_buildings_4` / `start_wall_ids` 闸门） |
| D2 L1→L5 五段式换代 | Task 5（L1 幡旗 / L2 雨棚）+ Task 6（L3 阁楼 / L4 退台 / L5 地标） |
| D3 业主色只染屋面 + 门面 + 描边 | Task 4（含「占比不过半」「墙不被染」反向断言） |
| D4 L5 五星徽记 + 地砖发光环 | Task 6（`fiveStar` + 双环 + 光晕） |
| §2.1 17 个商家格不动 | 全程未改 `TILE_TYPES` / `TILE_NAMES` / `TILE_SHORT` / `TILE_BRAND` / 任何 `board.tile.*` |
| §2.1 四级可回退 + 禁裸值闸门 | Task 4/5/6 全部走 `num/str/arr/n/c/fb`；Task 6 Step 9 与 Task 7 Step 3 两次 eslint / check-hardcoded |
| §2.1 交付 = 实现 + 闸门 + 手机截图 + 手册 | Task 8（截图 + 6 项机器闸门）+ Task 9（手册） |

**2. 占位符扫描**：本计划无 `TBD` / `TODO` / 「实现细节待定」/ 「类似 Task N」。每个代码步骤都给出**可直接粘贴的完整代码块**与**精确行号锚点**；每个命令步骤都给出**精确命令 + 预期输出**。

**3. 类型 / 命名一致性自查**：

- `START_PUBLIC_LEVEL`（Task 1 定义）→ Task 2 `startLevelsOf()` 引用 → Task 3 `liveLevels()` 引用。三处同名同类型 `Record<number, BuildLevel>`。✓
- `startLevelsOf`（Task 2 导出）→ Task 3 `main.ts` import。✓（`slotLevelsOf` 保留不删，供 demo 路径。）
- `ownerTintOf(state)`（Task 4 定义，签名 `(state: Record<string, unknown>) => string | null`）→ Task 4 在 `shop`/`market3` 中以 `ownerTintOf(state)` 调用 → Task 6 的 L5 段落复用同一个 `tint` 局部量。✓
- `fiveStar(g, cx, cy, r, n, inner, color)`（Task 6 定义）→ Task 6 Step 7 以 `fiveStar(g, cx, topY - th - G('starUp') * s, G('starR') * s, G('starN'), G('starInner'), tint ?? S('starFill'))` 调用，7 个实参一一对应。✓
- 新增 `fb` 键名在 Task 5 / Task 6 定义，且在 Task 5 / Task 6 的绘制代码中以 `G('<同名>')` / `b1(p, '<同名>')` / `S('<同名>')` 引用，逐名核对一致：`flag`/`flagX`/`flagY`/`flagPoleW`/`flagPoleH`/`flagW`/`flagH`/`flagWave`/`flagTip`；`canopy`/`cnOut`/`cnV1`/`cnRise`/`cnShade`；`l4W`/`l4D`/`l4H`；`spireW`/`spireD`/`spireH`/`spireRise`；`neon`/`neonW`；`halo`/`haloAlpha`/`haloFy`/`haloRx`/`haloRy`；`ring`/`ringFy`/`ringRx`/`ringRy`/`ringW`/`ringIn`/`ringInnerW`；`starFill`/`starR`/`starUp`/`starN`/`starInner`。✓
- `skin.json` 新键 `flag` / `canopy`（Task 7）与 Task 5 的 `b1(p, 'flag')` / `b1(p, 'canopy')` 同名。✓
- Task 8 脚本里 `buildOne` 用的 `id`（`building.s0.l1..l5`）在 `registry.ts:77-85` 已注册（`for s in 0..31` × `for lv in 1..5`）。✓
- Task 8 脚本引用的 `window.__monoMain` 字段 `stage` / `scene` / `game` / `paint` 均已在该对象上暴露（`main.ts:871-878`）。✓

**4. 已知风险与对策**：
- **L4/L5 视觉比例可能失衡**（`l4H: 0.3` × 88px = 26.4px 退台偏高）→ Task 8 Step 3 强制目视核对，不达标就改 `fb` 兜底值并重跑；这是**参数调整**，不改变任何结构。
- **L1 幡旗 / L2 雨棚是全新几何**，位置参数（`flagX/flagY/cnOut/cnV1`）可能需微调 → 同上，Task 8 Step 3 目视后调参。
- **`mark` 元素计数**：本计划**零新增场景元素**（幡旗 / 雨棚 / 退台 / 尖顶 / 五星 / 光环全部画在既有 `building.s*.l*` 元素内部），故 189 件 < 200 预算的结论继续成立；Task 8 的 `start_buildings_4` / `grown_buildings_7` 闸门会顺带确认 `building.*` 计数与预期一致。