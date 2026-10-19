# 脑力花园 · match3-mem 记忆增强型三消（原型规格）

> 版本：v0.1（原型规格）　|　日期：2026-10-19　|　状态：原型代码已落地（配置块 + 评分分支 + 记忆机制纯逻辑 + Match3Scene overlay；剩余：paired/delayed 真机 playtest 与批量铺开）
> 关联设计文档：《脑力花园-康养认知训练游戏设计方案》第 2 章
> 目标：在保留三消手感的前提下，让**最多用户在日常最爱玩的玩法里也直接练到记忆力**，作为"核心三消 → 记忆增强型三消 → 专项记忆玩法"三级梯度的中间档。

---

## 1. 定位与复用底座

**新增玩法 id**：`match3-mem`（与现有 `match3` 并列，便于在 `CognitiveMap`/`CrossGameScorer` 中独立映射与评分，不影响既有 `match3` 关卡）。

**完全复用，不重写**：
- 三消引擎与棋盘（交换/消除/下落/连锁、`GoalConfig` 收集目标、`ObstacleConfig` 障碍：冰冻/锁链/黑洞/果冻）。
- `LevelConfig` 配置驱动框架（含 `adaptive: AdaptiveRange` 自适应）。
- `cloneAdjustedLevel(stepAdjust, contentAdjust)` 难度浮动。
- `CrossGameScorer` 纯函数评分（`accuracy/speed/stability` 三维）与 `CognitiveMap` 认知构念映射。
- 道具系统：`hint`/`reveal`/`reshuffle`/`undo`/`shield`/`hammer`，其中 `reveal`（揭看）可直接复用为"记忆困难时的提示"。

**新增部分**：仅在 `LevelConfig` 上**叠加一个 `memory` 配置块** + 一层"记忆 overlay 状态机"，三消内核不变。

---

## 2. 三种记忆机制（详细参数 + 难度缩放）

### 2.1 影子任务 Shadow Recall（空间/视觉工作记忆）
- **学习阶段**：开局短暂高亮 `targetCount` 个目标格的位置（如 4 个格子闪 1.5s）。
- **遮蔽阶段**：高亮消失，棋盘照常。
- **回忆阶段（即过关目标）**：在 `stepLimit` 步内，优先消除落在"刚才那几个位置"的块（位置记忆），达成 `targetCount` 次即记忆达成。
- **代理指标**：`memoryHitRate = 正确回忆位置消除数 / targetCount`。

### 2.2 配对线索 Paired Clue（联想/面孔-名字式绑定）
- **学习阶段**：棋盘上出现 `pairedPairs` 对"记忆牌"，短暂预览它们的配对关系（如 A↔B 同属一对）。
- **遮蔽阶段**：配对标识消失，牌面变回普通。
- **回忆阶段**：消除时须把"属于同一对的牌"凑在一起才算配对成功计分；误配对扣稳定分。
- **代理指标**：`memoryHitRate = 配对成功数 / pairedPairs`；误配对计入 `stability` 惩罚。

### 2.3 延迟保持 Delayed Retention（前瞻记忆微缩）
- **学习阶段**：游戏中出现一次"关键图案"提示（学一次）。
- **间隔**：正常消除 `recallSteps` 步后，要求优先消除该图案类型（"记得之前说过的那个，现在该处理了"）。
- **代理指标**：`memoryHitRate = 正确前瞻消除数 / 要求数`。呼应专项玩法 `pm`（事件型前瞻记忆）。

### 2.4 难度缩放参数表
| 参数 | L0 入门 | L1 基础 | L2 进阶 | L3 挑战 | 说明 |
|---|---|---|---|---|---|
| `targetCount` / `pairedPairs` | 3 | 4 | 5 | 6 | 记忆负荷 |
| `maskDelayMs` | 1800 | 1400 | 1100 | 900 | 预览越短越难 |
| `recallSteps`（延迟） | 2 | 3 | 4 | 5 | 干扰步数越多越难 |
| `stepLimit` | 宽松 | 标准 | 偏紧 | 紧 | 复用现有步数约束 |
| 障碍 | 无/少 | 冰冻×3 | 锁链×4 | 黑洞×5 | 复用 `ObstacleConfig` |

---

## 3. LevelConfig 扩展字段

在现有 `LevelConfig` 接口新增可选 `memory` 块（不破坏既有 40+ 关卡）：

```ts
export type MemoryType = "shadow" | "paired" | "delayed";

export interface MemoryConfig {
  type: MemoryType;
  targetCount: number;     // shadow: 目标格数 / delayed: 要求消除数
  pairedPairs?: number;    // paired 专用：配对对数
  maskDelayMs: number;     // 预览时长（越短越难）
  recallSteps?: number;    // delayed 专用：间隔步数
}

// 现有 LevelConfig 增加：
// memory?: MemoryConfig;
```

**示例关卡配置**：
```ts
export const LEVEL_MEM_1: LevelConfig = {
  id: "m-1", mode: "match3-mem", name: "花影寻踪", chapter: 1, theme: "spring",
  memory: { type: "shadow", targetCount: 3, maskDelayMs: 1800 },
  goal: { type: "collect", collect: { flower: 10 } },
  boardCols: 6, boardRows: 6, stepLimit: 24, passTarget: 2000,
  iconTypes: ["flower", "leaf", "fruit", "butterfly", "bird"],
  obstacles: { type: "frozen", count: 2 },
  items: { hint: 2, reshuffle: 1, reveal: 1, peek: 0, undo: 1, shield: 1, hammer: 0 },
  itemDropInterval: 7, itemDropChance: 0.35,
  adaptive: { stepDelta: 3, contentDelta: 1 },
  targetGameId: "brain-working-memory", // 新增目标游戏（需与目标团队对齐命名）
};
```

---

## 4. 评分接入（CrossGameScorer 分支 + 代理指标）

在 `CrossGameScorer.computeCrossGameScore` 新增 `match3-mem` 分支（`src/core/CrossGameScorer.ts`）：

| 维度 | 计算 | 来源 |
|---|---|---|
| `accuracy` | 主取 `memoryHitRate`（记忆命中率），未提供时回退到 `score/stepLimit` | `LevelMetrics.memoryHitRate` |
| `speed` | 移动中位时 / `stepLimit` 归一（保留加工速度维度） | 复用现有速度逻辑 |
| `stability` | 基础 1 − 误配对/总操作；Paired Clue 误配降分 | `LevelMetrics.mismatchCount` |

`LevelMetrics` 需新增可选字段：`memoryHitRate?`、`mismatchCount?`。

**认知构念映射**（`CognitiveMap`，新增 `match3-mem` 条目）：
- 主：`working_memory`（空间/工作记忆）
- 副：`visual_recognition_memory`（影子任务）、`associative_memory`（配对线索）、`prospective_memory`（延迟保持）、`processing_speed`（速度）
- `targetGameId`：`brain-working-memory`（占位，待对齐）

---

## 5. 交互状态机与 UI 草图（文字描述）

```
[LEARN 学习]  → 高亮/预览记忆内容（maskDelayMs），配语音"记住这些位置/配对"
      ↓
[MASK 遮蔽]    → 记忆内容隐藏，棋盘进入可操作态
      ↓
[PLAY 游玩]    → 标准三消（交换/消除/障碍/收集目标）；overlay 标记"待回忆目标"
      ↓（达到 stepLimit 或 收集完成）
[RECALL-CHECK] → 结算记忆命中率 + 常规分；困难时可用 reveal 道具"再看一眼"
      ↓
[RESULT]       → 复用 ResultScene 认知反馈 + 跨游戏徽标（targetGameId）
```

**适老化要点**：LEARN 阶段字体/高亮加大；提供"重看一次"按钮（等效 `reveal`，不计入惩罚首用）；失败以"差一点点，再试一次"温和鼓励，不直接判负。

---

## 6. 自适应与难度分级

- 接入现有 4 档 taxonomy（L0–L3，见设计文档第 4 章）：`match3-mem` 关卡统一从 L0/L1 起步。
- `cloneAdjustedLevel` 的 `contentDelta` 可复用为"记忆负荷浮动"（如 `targetCount ± contentDelta`）；若需独立调节，`AdaptiveRange` 可扩 `memoryDelta` 字段。
- 首玩依据 `Baseline` 与近 7 天表现由自适应进阶，避免"太难劝退"。

---

## 7. 验收标准与测试计划

**单元测试（node:test，复用现有评分器测试套件）**
- `match3-mem` 分支：`memoryHitRate=1` → `accuracy=100`；`memoryHitRate=0.5` → `accuracy=50`。
- Paired 误配：`mismatchCount` 增大 → `stability` 下降。
- 缺 `memoryHitRate` 时回退到 `score/stepLimit`，不抛错。

**玩法验收（playtest 清单）**
- LEARN→MASK→PLAY→RECALL→RESULT 五态流转正常，无卡死。
- 三档机制（shadow/paired/delayed）各自可过关、可结算记忆命中率。
- 难度缩放参数在 L0–L3 生效，自适应浮动不溢出边界。
- 跨游戏上报：已登录计入 `brain-working-memory`；游客弹登录横幅（复用现有 `ResultScene` 逻辑）。
- 适老化：长辈 3 次内理解"记住→消除"规则；reveal 提示可用。

---

## 8. 风险与未决项

1. **长辈挫败感**：遮蔽过短易劝退——缓解：L0 默认 `maskDelayMs=1800` + 首用免费 reveal；监控"记忆命中率 < 0.3"比例，低于阈值自动降档。
2. **`targetGameId` 命名**：`brain-working-memory` 为占位，须与目标游戏团队对齐后，同步改 `CrossGameMap.TARGET_GAMES` 与后端 `config/targets.ts` 白名单。
3. **工作量评估**：本规格仅新增"配置块 + overlay 状态机 + 评分分支"，三消内核零改动；预估 1 名前端 ~3–5 天（含三机制 + 自适应 + 验收）。
4. **与专项记忆玩法关系**：`match3-mem` 是"中强度、高频"的记忆训练入口；`corsi/memory/face/pm` 仍是"高强度、机制纯粹"的测评式训练，二者互补不替代。
