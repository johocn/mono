# 大富翁 · AI 对手 + 新手引导 Design

**日期：** 2026-09-29
**范围：** `d:\zhao\monopoly`（仓库根 `d:\zhao`）
**目标一句话：** 让裸链接进站即可单人开局——真人可选 1~4 人，其余席位由**性格化 AI**自动接管，并在首次进站时用**分步蒙层**教会上手。

---

## 1. 背景与动机

现状（评估结论）：

- 核心玩法闭环已完整并上线（`https://game.joho.cn/tour/mono.html`），工程纪律极强（45 文件 / 365 单测全绿、每里程碑有手机视口截图、线上回归 + 真实点击 973 次 e2e）。
- 但 **4 个席位全是真人热座**：单人打开只能自己操作全部回合，或必须凑齐 4 人。这是"进站即玩"最大的体验断点。
- 已有 `autoTurn(g)`（贪心：够钱就买/升级，保留 200 现金）仅供 e2e / `sim()` 使用，**不是决策层，也不会自己推进回合**。
- 无任何新手引导，新人面对棋盘 + HUD 不知从哪点起。

因此本次补齐两块：**AI 对手（含开局选人数）** 与 **首次分步蒙层引导**。

---

## 2. 非目标（明确不做）

- 不做 AI 难度分级（本设计用**性格**区分，不引入 轻松/普通/困难 三档参数）。
- 不做联机对战 / 房间 / 匹配。
- 不做 i18n 多语言（文案集中一处便于后续接入，但本任务不引入 i18n 框架）。
- 不做后端接口；AI 决策与开局选择全部在客户端完成。
- 不改经济数值、棋盘数据、皮肤系统。
- 不改 `?demo=1` 演示棋盘路径的既有行为。

---

## 3. 架构：模块边界与数据流

**核心原则：`src/core/` 保持纯规则、无时间概念；节奏与演出只允许出现在 `src/ui/`。**

新增 5 个文件 + 修改 2 个：

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/core/ai.ts` | **纯函数决策层**：`decideTurn(state, persona)` → 有序动作计划；无 await / 无定时器 | 新增 |
| `src/ui/aiDriver.ts` | **回合驱动器**：AI 席位自动推进、节奏控制、浮层收口、加速/跳过 | 新增 |
| `src/ui/setup.ts` | **开局设置面板**：真人数量 + AI 性格分配 | 新增 |
| `src/ui/tutorial.ts` | **新手分步蒙层引导** | 新增 |
| `src/data/tutorial.ts` | 引导文案与步骤表（集中一处，便于后续接 i18n） | 新增 |
| `src/main.ts` | 唯一接线点：判定席位归属、创建并启动 driver、挂 setup / tutorial、新增 URL 参数 | 修改 |
| `src/ui/Hud.ts` | AI 回合禁用命中区 + 主按钮文案「AI 思考中 · <性格>」；底坞右侧「加速 / 跳过」 | 修改 |

数据流（与既有 `runAction` 唯一出画口复用）：

```
真人点击 HUD ─┐
              ├─→ runAction(动作) ─→ 状态落库 → paint() → fx.play() → paint()
AI 决策层 ────┘
   ↑ aiDriver 按 tick 送动作
```

`src/core/ai.ts` 只产出"要做什么"，`aiDriver` 决定"什么时候做、做多久"。两者分离保证：决策可单测、节奏可独立调、`core` 不被演出污染。

**席位归属与命名**：`PLAYER_NAME`（`src/data/board.ts`）保持 4 个既有名字；AI 席位在其旁显示性格徽标（如「保守 · 丽丽」）。

---

## 4. `src/core/ai.ts` —— 性格化 AI 决策层

### 4.1 接口

```ts
export type Persona = 'conservative' | 'aggressive' | 'speculative';

/** 计划中的一步：对既有 Game API 的调用意图（不含时间概念） */
export type AiStep =
  | { kind: 'skip' }                                              // 监狱禁行
  | { kind: 'card'; card: ItemCardKind; target?: number }          // 打手牌
  | { kind: 'trade'; code: string; shares: number }                // 股票买卖
  | { kind: 'buy' } | { kind: 'upgrade' }
  | { kind: 'roll' } | { kind: 'move' } | { kind: 'settle' }
  | { kind: 'end' };

export interface AiParams {
  reserve: number;          // 保留现金线
  buyMax: number;           // 高于此价的地不买（Infinity = 无上限）
  upgradeEager: boolean;    // 是否积极升级
  cardPolicy: 'defensive' | 'offensive' | 'arbitrage';
  stockPolicy: 'none' | 'momentum' | 'dip';
  targetLeader: boolean;    // 是否针对净资产领先者
}

export function personaParams(p: Persona): AiParams;
export function decideTurn(state: GameState, persona: Persona): AiStep[];
```

- **决策顺序（每回合）**：监狱禁行 → 打牌时机 → 掷骰 · 前进 · 结算 → 买地 / 升级 → 股票（仅当站在股票交易所 index 19）→ 结束。
- **合法优先**：任一步在生成时就校验前置条件（钱够不够、阶段是否允许、是否站在交易所）；不满足则**不产出该步**，绝不产出非法动作，绝不抛错。沿用既有 `autoTurn` 的防御风格。
- **确定性**：不引入新的随机源；需要随机（如手牌目标、股票方向）时从 `state` 可推导的信息决定（例如净资产排名），保证同 seed 同决策。`autoTurn` 现有贪心即"中立基线"，三种性格是它的参数化。
- **复用而非重写**：`autoTurn(g)` 保留原样，继续供 e2e / `sim()` 使用。

### 4.2 性格参数表

| 参数 | 保守 conservative | 激进 aggressive | 投机 speculative |
|---|---|---|---|
| `reserve` 保留现金线 | 400 | 100 | 200 |
| `buyMax` 买地上限 | 300 | Infinity | Infinity |
| `upgradeEager` 升级积极度 | false | true | true（仅在已持同级 ≥2 块时） |
| `cardPolicy` 手牌策略 | defensive（免罚 / 自保） | offensive（炸弹、路障打领先者） | arbitrage（租金翻倍、迁点到自家高租金） |
| `stockPolicy` 股票参与 | none | momentum（短线追涨） | dip（低位吸纳） |
| `targetLeader` 针对领先者 | false | true | true（仅末段：`round >= 8` 时生效） |

### 4.3 测试（`test/core/ai.spec.ts`）

- **性格差异**：同一 state 下，保守在现金低于 `reserve` 时不买地；激进会对手牌目标选择净资产最高者；投机在 `round < 8` 时不针对领先者。
- **合法性**：对随机生成的 N 个 state 调用 `decideTurn`，产出的每一步都必须能被对应 `Game` API 成功执行（不抛错、不返回 `ok:false` 中的非法分支）。
- **确定性**：同 state + 同 persona 调用两次，结果深度相等。

---

## 5. `src/ui/aiDriver.ts` —— 回合驱动器

### 5.1 职责与循环

1. 读取"当前席位是 `human` 还是 `ai`"。
2. **`human`** → 停下，等待玩家点击 HUD（不干预）。
3. **`ai`** → 调 `decideTurn(state, persona)` 取计划，逐步把每个 `AiStep` 映射为对应 `Game` API 调用，**走与 HUD 完全相同的 `runAction`**（因此动效、截图闸门、线上回归、e2e 全部沿用，无需改渲染层）。
4. 每步之间：等 `fx.busy()` 结束 → 停顿 `AI_STEP_MS`（默认 450ms）→ 下一步。
5. 计划执行完毕 → 轮转下一席位 → 回到 1。

### 5.2 关键行为

| 行为 | 规则 |
|---|---|
| **单一 tick 源** | `requestAnimationFrame` 轮询 `state`；不引入事件总线；不改 `paint()` 语义 |
| **浮层收口** | AI 触发抽卡 / 结算浮层时，停顿后自动 `game.clearEvent()`，不阻塞玩家 |
| **节奏控制** | 底坞右侧常驻「加速 ×2」（把 `AI_STEP_MS` 减半）与「跳过本次」 |
| **跳过语义** | 「跳过本次」把当前 AI 席位**剩余步骤一次性补齐**（状态权威），只播一个收尾动效；点屏仍可 `fx.skip()`，只影响观感时长 |
| **AI 回合的 HUD** | 命中区全部 `enabled: false`；主按钮文案变「AI 思考中 · 保守 / 激进 / 投机」 |
| **真人中断** | 真人点任意命中区时立即 `fx.skip()`（沿用既有行为） |
| **结束态** | `state.over` 后停止轮询，不再推进 |

### 5.3 常量

`AI_STEP_MS = 450`（默认步间停顿）、`AI_FAST_FACTOR = 2`（加速倍率）。两者放 `src/skin/layout.ts` 同域常量区，遵守"禁裸值"lint gate。

### 5.4 测试（`test/ui/ai-driver.spec.ts`）

- 用 fake timer + stub `Game`：AI 席位会推进到 `human` 席位后停止。
- 「跳过本次」后 AI 回合的所有步骤都被执行（state 与不跳过时一致），且**同一个回合不会被驱动两次**。
- AI 回合时 `hitAreas(state)` 全部 `enabled: false`。

---

## 6. `src/ui/setup.ts` —— 开局设置面板

- **时机**：裸链接进站，若 URL **未带 `?humans=`** → 先显示全屏面板（DOM overlay，`z-index` 高于 `#mono-hud`）；选完再 `createGame()` 并启动。
- **内容**：
  - 标题「大富翁 · 双阳」+ 副标题「选好人数就能开局」
  - 「真人玩家」：1 / 2 / 3 / 4 人（**默认 1**）
  - 「AI 席位性格」：其余席位按序补 AI，每个可切 **保守 / 激进 / 投机**（默认按序分配 conservative → aggressive → speculative）
  - 主按钮「开始游戏」；角落「重看引导」
  - 底部说明「进站即玩 · 剩余席位由 AI 接管」
- **记忆**：`localStorage: mono.setup`（存真人数与 AI 性格序列）——下次进站直接按上次选择开局；面板仍可从底坞「设置」重开。
- **确定性入口**：`?humans=1&ai=conservative,aggressive,speculative` **跳过面板**直接开局（闸门 / e2e 用）。

对应 `main.ts` 变更：`parseOptions` 增 `humans?: number` 与 `ai?: Persona[]`；`createGame({ playerCount })` 沿用既有参数。

---

## 7. `src/ui/tutorial.ts` —— 新手分步蒙层引导

### 7.1 触发条件

- **默认**：首次进站、**第一轮第一个真人回合前**自动弹一次；完成后写 `localStorage: mono.tour.done`。
- **`?tour=1`** 强制显示（忽略 localStorage，闸门 / e2e 用）；**`?tour=0`** 关闭。
- **重看入口**：开局面板角落 + 底坞「设置」内各一个「重看引导」。
- **仅在含真人席位的局弹**；整局只触发一次，不重复打扰。

### 7.2 四步

| 步 | 高亮目标 | 标题 | 说明 |
|---|---|---|---|
| 1 | 主按钮 + 骰子 | 点这里掷骰 | 再依次点「前进」「结算」 |
| 2 | 次要按钮位（买地 / 升级） | 买地与升级 | 踩到空地可买下，自己的地能升级 |
| 3 | 资产条 + 手牌槽 | 资产与手牌 | 这里看现金与领先者；手牌能放炸弹、路障、租金翻倍 |
| 4 | AI 性格徽标 | 其余是 AI | AI 会自己走；想快可点加速或跳过 |

### 7.3 实现约束

- **高亮矩形来源**（消除与渲染漂移）：
  - 主 / 次要按钮 → `hitAreas(state)` 的矩形
  - 骰子 → `HUD_DICE_X0 / HUD_DICE_Y / HUD_DICE_SIZE`（`src/skin/layout.ts`）
  - 资产条 → `HUD_BAR_X0 / HUD_BAR_W / HUD_BAR_H`（第 0 条）
  - 手牌槽 → `panels` 既有槽台位
  - AI 徽标 → 资产条矩形（第 1 条）
- **气泡位置**：按目标矩形自动落在其上/下方，边距 `--spacer-12`；不与高亮框重叠。
- **不吞操作**：仅蒙层与气泡吃事件；引导结束才放开游戏动作。
- **文案集中**：标题 ≤ 6 字、说明 ≤ 20 字，全部放 `src/data/tutorial.ts`，与 `src/data/share.ts` 同样做法（便于后续接 i18n）。

### 7.4 测试与闸门

- `test/ui/tutorial.spec.ts`：步进 / 跳过 / 标记写入 / `?tour=0` 不弹 / `?tour=1` 忽略标记。
- 新闸门 `local/mono-shots-ai.mjs`：`?tour=1` 逐步截图 4 张（390×844 @dpr2）。

---

## 8. URL 参数与兼容

| 参数 | 含义 |
|---|---|
| `?humans=1..4` | 真人数；缺省 → 显示开局面板 |
| `?ai=conservative,aggressive,speculative` | AI 席位性格序列（与 `humans` 搭配） |
| `?tour=1` / `?tour=0` | 强制 / 关闭新手引导 |
| 既有 `?demo=1` / `?play=0` | 演示棋盘，**不受本设计影响** |
| 既有 `?skin` `?debug` `?seed` `?speed` `?show` `?nofx` `?perf` | 语义不变 |

兼容性：`?demo=1` 路径不创建 `Game`、不挂 HUD，因此不创建 driver / setup / tutorial；裸入口默认行为（上一版改为"进站即交互局"）由本设计的开局面板接管。

---

## 9. 验证与交付

**单测**：`test/core/ai.spec.ts`、`test/ui/ai-driver.spec.ts`、`test/ui/tutorial.spec.ts`，并保持既有 365 例全绿。

**闸门**：新增 `local/mono-shots-ai.mjs` —— ①1 真人 + 3 AI 开局（`?humans=1`）断言 3 席为 AI、②AI 回合自动推进（等待后 `state.current` 变化）、③AI 回合 HUD 全禁用、④`?tour=1` 四步截图。

**线上回归**：`local/mono-prod-check.mjs` 增一条 `?humans=1` gate（裸入口仍走开局面板，需先点「开始游戏」或走 `?humans=1`）。

**e2e**：`local/mono-e2e-playthrough.mjs` 增「AI 局能跑到 `over=true`」用例（真人回合用真实点击，AI 回合等待自动推进）。

**硬规范**：功能测试必须用手机视口截图（390×844、dpr=2），并把截图补进 `docs/manual-mono.md`。

**手册**：`docs/manual-mono.md` 增 M9（AI 对手 + 开局）与 M10（新手引导）两节，含 URL 参数与验收表。

**部署**：本地构建 → `node d:\zhao\scripts\deploy-mono.mjs` → 线上回归退出码 0（绝不在服务器构建）。

---

## 10. 风险与取舍

| 风险 | 取舍 / 缓解 |
|---|---|
| AI 决策与真人视觉不一致 | 强制走同一个 `runAction`，动效与闸门天然复用 |
| 「针对领先者」让玩家被 3 打 1 | 只在**激进**性格恒开、**投机**末段才开；保守永不针对 |
| AI 回合拖慢节奏 | 步间停顿 450ms + 「加速 ×2」+「跳过本次」三重兜底 |
| 引导与渲染坐标漂移 | 高亮矩形全部取自 `hitAreas()` / `layout.ts` 常量，不另造坐标 |
| 开局面板阻断"进站即玩" | 记忆上次选择；`?humans=` 可跳过；默认 1 人一屏可完成 |
| 浮层阻塞自动推进 | AI 回合停顿后自动 `clearEvent()` |

---

## 11. 验收清单

1. 裸链接进站 → 首屏为开局面板；选「1 人」点开始 → 3 席为 AI，AI 回合自动推进且可加速/跳过。
2. AI 回合 HUD 全部禁用，主按钮显示「AI 思考中 · <性格>」。
3. 三种性格行为可区分（保守不冒进、激进针对领先者、投机末段才针对）。
4. 首次进站自动弹 4 步引导；`?tour=0` 不弹；`?tour=1` 强制；可从面板/设置重看。
5. `?humans=1&ai=...` 跳过面板，行为确定可复现。
6. `?demo=1` 演示棋盘行为不变（分享卡仍为纯棋盘）。
7. `npm run check` 全绿（lint 禁裸值 + skin 校验 + 全部单测）。
8. 线上回归退出码 0；新增闸门与 e2e 全绿；手机视口截图入库并补进手册。