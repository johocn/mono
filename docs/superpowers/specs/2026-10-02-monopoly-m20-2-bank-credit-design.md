# 大富翁（monopoly）M20.2 · 银行信贷 · 详细设计

- 日期：2026-10-02
- 范围：`d:\zhao\monopoly`（PixiJS 8 + TypeScript，等距棋盘，390×844 舞台）
- 状态：设计已定稿（银行浮层取 **C · 左列表右详情**，2026-10-02 用户内联 mockup 定稿；入口 = HUD「银行」键常开 + 落 9 号格自动弹出）
- 上位约束：`docs/superpowers/specs/2026-10-01-monopoly-interaction-roadmap-design.md` §4.3 银行信贷节 与决策 **D17–D25**
- 兄弟里程碑：M20.1 已交付（破产拍卖引擎 + 自由出售 + 选目标基建），本里程碑复用其拍卖引擎与「透明 DOM 命中层」约定

## 1. 目标与范围

对齐路线图诉求 ⑧「银行不只是路过领利息，要补上**存款 / 贷款 / 抵押贷款**三条产品线」与两条客户已定的违约规则（**贷款不还 → 多交房租惩罚**；**抵押贷款超期不还 → 拍卖抵押房产**）。

**本里程碑做**（M20.2 轨道，路线图 D24 第二条）：

1. 三类财务状态：**存款**（`deposit`）、**信用贷款**（`loan`，同时至多 1 笔）、**抵押贷款**（`mortgages`，可多笔）。
2. 三条产品线数值与期限（存款 +3%/轮复利；信用贷款 `min(￥2000, 净资产×30%)`·6%·8 轮；抵押 `sellAt()×80%`·4%·6 轮）。
3. 利息结算时点：轮末 `onRoundBoundary` 统一计息（纯算术、零随机）。
4. 两条违约链：逾期付租 **+50% 罚息**（直冲欠款本金、不给地主）→ 逾期满 **3 轮**转强制执行（拍卖其 1 块地产）；抵押超期 → 抵押地块**进入拍卖**。
5. 清算顺序改造：现金 → **存款自动取出** → 变卖地产（**跳过抵押中地块**）→ 折股 → 破产；破产时债务清零、未赎回抵押物一并进拍卖。
6. 拍卖引擎扩第二个/第三个触发源：`AuctionTrigger = 'bankrupt' | 'mortgage-overdue' | 'loan-overdue'`。
7. 银行格站位加成：把旧「现金 10% 计息封顶 ￥300」**改写**为「本回合申请贷款**首轮免息** + 领取**存款红包 = 存款 × 5%**」。
8. UI：**银行浮层（版式 C：左列表右详情）** + **HUD 债务条**（存款 · 债务 · 抵押块数 · 逾期倒计时）+ HUD「银行」常开键。
9. AI：新增 `pickBank(state, P)` 决定论策略，复用与真人同一套 API。

**本里程碑不做**（留给后续轨道，明确 YAGNI）：

- 股票交易 UI / 涨跌卡 / 红利卡（M20.3）；股票**杠杆**（D30/D31）随 M20.3 交付，本期不建保证金模型。
- 公共设施入股与新闻（M20.4）。
- 信贷周期（央行调息）与破产重组（M21，D16 辅线）。
- 多人分账债务（进贡 `tribute` / 抽成 `collect`）改走拍卖：**承接 M20.1-D6 已知限制**，本期仍走「自动变卖」，但自动变卖会补上「跳过抵押中地块」的新口径。
- 抵押物赎回的利息减免 / 议价、贷款展期等衍生机制。

## 2. 现状与缺口（代码级核对，2026-10-02）

| # | 事实 | 代码位置 | 与目标的差距 |
|---|---|---|---|
| 1 | `Player` 只有 `id / pos / cash / bankrupt` 四个字段 | `src/core/game.ts` L36–43 | 全项目**无存款 / 债务 / 抵押 / 逾期**任何状态（源码 `deposit`/`loan`/`mortgage`/`overdue` 零命中） |
| 2 | 银行格 = 按现金 10% 计息、单次封顶 ￥300，直接入账、不参与清算 | `src/core/game.ts` `resolveBank()` L641–648；常量 `src/core/special.ts` L53–56 | 是「被动领利息」，与三条产品线无关；D22 要求改写为「首轮免息 + 存款红包 5%」 |
| 3 | 清算顺序 = 现金 → 自动变卖最便宜的地（`releaseEstate` 归无主）/ 拍卖 → 折股 → 破产 | `src/core/game.ts` `settleDebt()` L488–493、`settleDebtAuto()` L496–526、`closeDebt()` L428–444 | 无「存款自动取出」、无「抵押中地块跳过」、破产不清债务、抵押物未处置 |
| 4 | 拍卖触发源枚举只开 `'bankrupt'`；`startAuction` 内 hardcode `trigger: 'bankrupt'` | `src/core/auction.ts` L12；`src/core/game.ts` `startAuction()` L462–485 | 需扩 `'mortgage-overdue' | 'loan-overdue'` 并让 `startAuction` 收 `trigger` 入参 |
| 5 | 拍卖成交款 `applyLot` 计入「payer.cash」后由 `closeDebt` 统一清偿 | `src/core/game.ts` `applyLot()` L390–406、`finishAuction()` L447–459 | 抵押超期拍卖的「成交款先还债、余额归借款人、不足继续追偿」可直接复用同一路径，只需换起拍价与触发源 |
| 6 | 浮层 = 状态纯函数 → `ElementSpec` → 透明 DOM 命中层；`OverlayKind` 四种 | `src/ui/panels.ts` L46、`overlayOf()` L177–185 | 银行浮层需新增 `'bank'` 分支；`overlayOf` 需接一个「UI 开关」入参（银行键可随时开） |
| 7 | HUD 已把「出售」放在真人回合空闲的 `HUD_QK_FAST_X` 位 | `src/ui/Hud.ts` L22、L143–148；`src/skin/layout.ts` L38–43 | 「银行」键复用同一快捷键区空位；债务条需新增 HUD 常驻条 |
| 8 | 皮肤四级：L1 元素覆盖 → L2 皮肤包 `skin.json` → L3 默认皮肤 → L4 内建 `fb({...})` | `src/skin/registry.ts`（`UI` 注册表）、`src/render/providers/proc-panel.ts`、`public/skins/default/skin.json` | 新增两个可见元素：`ui.debtBar`（HUD 债务条）、`ui.bankRow`（左侧产品行）；其余复用 `showcase.panel` / `ui.badge` / `ui.button.*` |
| 9 | AI 决策层为纯函数；`AiStep` 已有 `sell` / `auctionBid` 先例 | `src/core/ai.ts` L21–29、`applyStep()` L32+ | 需新增 `{ kind:'bank'; … }` 步与 `pickBank` 策略 |

### 2.1 不可破坏的既有约束

- **确定性**：一律 `makeRng(seed)` 分流，禁止 `Math.random`（`test/smoke.spec.ts` 有源码闸门）。**信贷全链路零随机**：利息/罚息/逾期均为纯算术，`pickBank` 为决定论公式。
- **四级可回退体系**：裸色值 / 裸视觉常数只允许出现在 L4 内建兜底 `fb({...})`；`tools/check-hardcoded.mjs`（作用域 `src/render`，`npm run build` 前置）与 `tools/lint-skin.mjs`（skin key 必须在注册表且符合 ID 正则）为机器闸门。禁 `eslint-disable`。
- **17 个商家格一个不动**：信贷只改 `Player` 的财务字段、`estates` 的抵押标记与 `cash`，不碰地砖 / 店招 / 楼体。
- **零回归（含唯一例外）**：`createGame()` 未传 `seats` / 未启用银行时，各玩家 `deposit = 0`、`loan = null`、`mortgages = []` ⇒ 利息为 0、无逾期、浮层不额外弹出 ⇒ 既有回归逐值不变。**唯一例外**：
  1. `resolveBank` 由「10% 计息封顶 300」改写为 D22 加成 ⇒ `test/core/special.spec.ts` L104、L112 两处 `interest` 期望值改口径；
  2. `BubbleView.ts` L60–61 的银行气泡文案由「利息 +￥N」改为「银行服务」口径。
- 交付 = 实现 + 单测/闸门 + 手机视口截图（390×844 @ dpr=2）+ 操作手册条目。

## 3. 设计

### 3.1 财务状态模型（M20.2-D1：挂在 `Player` 上）

```ts
/** 一笔计息债务（信用贷款 / 抵押贷款共用形状） */
export interface DebtBook {
  /** 本金余额（含已资本化的利息） */
  principal: number;
  /** 每轮利率（用于轮末复利） */
  rate: number;
  /** 到期轮次：`state.round > due` 即逾期 */
  due: number;
  /** 连续逾期轮数（0 = 未逾期）；满 `OVERDUE_SEIZE_ROUNDS` 触发强制执行 */
  overdue: number;
}

/** 抵押贷款 = 一笔债务 + 被锁地块 */
export interface MortgageBook extends DebtBook {
  index: number;
}

export interface Player {
  id: number;
  pos: number;
  cash: number;
  bankrupt: boolean;
  /* —— M20.2 信贷 —— */
  /** 存款（轮末 +3% 复利；欠款清算时优先自动取出，但不免死） */
  deposit: number;
  /** 信用贷款（同时至多 1 笔；null = 无） */
  loan: DebtBook | null;
  /** 抵押贷款（可多笔，按 `index` 升序） */
  mortgages: MortgageBook[];
}
```

理由：与 `cash` 同层、随玩家走；M20.1 已确立「`Player` 承载玩家财务」的边界（若放 `GameState` 数组则每次破产/结算要多一层下标映射）。新增字段在 `createGame` 初始化，**不动**既有字段语义。

### 3.2 三条产品线（M20.2-D2：数值真源 `src/data/bank.ts`）

| 产品 | 办理入口 | 额度 | 利率 | 期限 | 违约后果 |
|---|---|---|---|---|---|
| 存款 | 任意自己回合（HUD「银行」键常开） | 现金内不限 | **+3%/轮** 复利 | 随时支取 | 无（欠款清算时**优先自动取出**，但不免死） |
| 信用贷款 | **须站在 9 号银行格** | `min(￥2000, 净资产 × 30%)` | **6%/轮** | **8 轮** | 逾期 → 付租 **+50% 罚息**；满 **3 轮**转强制执行（拍卖其 1 块地产） |
| 抵押贷款 | 须站在 9 号银行格 + 选自有**未抵押**地块 | 抵押地块 `sellAt() × 80%` | **4%/轮** | **6 轮** | 超期 → 抵押地块**直接进入拍卖**，起拍价 = 借款额 |

```ts
/* src/data/bank.ts —— 信贷数值真源（裸值只在此处定义，UI/core 一律引用） */
export const DEPOSIT_RATE = 0.03;        // 存款 +3%/轮
export const LOAN_RATE = 0.06;           // 信用贷款 6%/轮
export const LOAN_TERM = 8;              // 8 轮
export const LOAN_CAP = 2000;            // 额度上限 ￥2000
export const LOAN_NET_RATIO = 0.3;       // 净资产 30%
export const MORTGAGE_RATE = 0.04;       // 抵押贷款 4%/轮
export const MORTGAGE_TERM = 6;          // 6 轮
export const MORTGAGE_LTV = 0.8;         // 变卖价 × 80%
export const RENT_PENALTY = 0.5;         // 逾期付租罚息 +50%（直冲本金，不给地主）
export const OVERDUE_SEIZE_ROUNDS = 3;   // 逾期满 3 轮 → 强制执行
export const BANK_DEPOSIT_BONUS = 0.05;  // 落银行格存款红包 = 存款 × 5%
```

要点：
- **额度基数**用既有 `netWorth()`（现金 + 地产账面投入 + 股票市值，`game.ts` L1097）；未把既有债务计入分母（口径从简，避免玩家还着贷款反而借得更多），在手册「已知限制」记录。
- **同时至多 1 笔信用贷款**：已有未结清 `loan` 时 `takeLoan` 返回 `'has-loan'`。抵押贷款按地块维度去重（同一地块不可二次抵押）。

### 3.3 利息结算时点（M20.2-D3：轮末统一 tick）

`advanceToNext()` 在 `next === 0`（一圈走完）时调用 `onRoundBoundary()`。本里程碑在**同处**追加 `settleBooks(state)`：

```
for 每位未破产玩家 p:
  ① 存款复利：p.deposit = round(p.deposit × (1 + DEPOSIT_RATE))
  ② 信用贷款：若有 loan：p.loan.principal = round(principal × (1 + LOAN_RATE))
  ③ 抵押贷款：逐笔 p.mortgages[i].principal = round(principal × (1 + MORTGAGE_RATE))
  ④ 逾期推进（见 §3.4）：对每笔债务，`state.round > due` ⇒ overdue += 1，否则 overdue = 0
```

- **纯算术、零随机**，与确定性回放同源；`makeRng(seed)` 不受影响。
- 计息发生在股价 tick **之前**（同一 `onRoundBoundary` 内顺序固定，先信贷后行情，保证复现）。
- 破产玩家跳过（其债务已在破产时清零，见 §3.5）。

### 3.4 逾期与两条违约链（M20.2-D4 / D5）

**逾期判定**：`overdue = state.round > due ? overdue + 1 : 0`（轮末 tick 推进）。

**链一 · 信用贷款逾期 → 多交房租（D20）**

- 触发点：`settleCurrent` 的收租分支（`src/core/game.ts` L550–567）。若付款人存在**逾期中的债务**（`loan?.overdue > 0` 或任一 `mortgages[].overdue > 0`），则：
  - 应付租金 `rent` 照常付给地主；
  - **额外** `penalty = round(rent × RENT_PENALTY)`，**直接从付款人现金/资产清算中扣除并冲抵其欠款本金**（不给地主）。
  - 实现：先走既有 `settleDebt(p, rent, owner)`，再走 `settleDebt(p, penalty, null)`，并把 `penalty` 按 `loan` → `mortgages` 顺序冲减本金（本金归零的债务从名下移除，抵押地块解锁）。
- 语义「逾期越久还债越快，但过程痛苦」：罚息并入清偿流水，等于强制加速还款。

**链二 · 逾期满 3 轮 → 强制执行（D21）**

- 轮末 tick 后，若某债务 `overdue >= OVERDUE_SEIZE_ROUNDS` 且该玩家仍有地产 ⇒ 走拍卖引擎 `startAuction(trigger='loan-overdue', amount = 该笔债务 principal, receiver = null（银行）)`：
  - 拍品队列按 `sellAt()` 升序（**跳过抵押中地块**，抵押物由链三单独处理）；
  - 成交款先清偿该债务本金，余额归玩家；
  - 拍完仍不足 ⇒ 债务清零（银行承担损失）、地块尽失时按既有口径破产。
- 强制执行有地产但无有效报价 ⇒ 流拍按既有权衡（债权人 = 银行 ⇒ 回归无主）。

**链三 · 抵押超期 → 拍卖抵押房产（D11 / D19）**

- 轮末 tick 后，若某 `mortgages[i].overdue > 0` 且 `state.round > due`（即超期未赎回）⇒ 该抵押地块以 `trigger='mortgage-overdue'` 进拍卖：
  - **起拍价 = 借款额**（= 原 `sellAt() × 80%` 的借款本金）；
  - 成交款**先还该笔债务、余额归借款人**，不足部分继续追偿（转入其信用贷款/或按既有清算破产判定）；
  - 转身分账沿用 `applyLot` + `closeDebt` 既有路径，`receiver` 为 `null`（银行）。
- 抵押期间地块**锁出售、锁升级、仍可收租**（D19）：`sellEstate` / `upgradeCurrent` 增加「该地块抵押中 → 拒绝」判定；`rentAt` 不变（仍可收租）。

### 3.5 清算顺序改造（M20.2-D6 / D9 / D23）

`settleDebt` 顺序由「现金 → 变卖地产 → 折股 → 破产」改为：

```
① 现金足额 → 直接付清（既有行为不改）
② 现金不足 → 存款自动取出（deposit 全额转入 cash，deposit = 0），再补齐
③ 仍不足且有未抵押地产 → 拍卖（既有 M20.1 路径，队列跳过抵押中地块）
④ 仍不足 → 折股（既有 closeDebt 尾段）
⑤ 仍不足 → 破产
```

- **破产处置（D23）**：`closeDebt` 判定破产时：① 债务清零（`loan = null`、`mortgages` 逐笔清零，银行承担损失）；② 其**未赎回抵押地块**一并进入一场 `'mortgage-overdue'` 拍卖（起拍价 = 各自借款额），成交款按 §3.4 链三分账。
- **自动变卖路径（`settleDebtAuto`）**同步补「跳过抵押中地块」；若仅剩抵押地块则不动它，直接进入折股 / 破产判定。

### 3.6 拍卖引擎复用（M20.2-D7）

`src/core/auction.ts`：

```ts
/** 拍卖触发源：M20.2 扩抵押超期与贷款强执 */
export type AuctionTrigger = 'bankrupt' | 'mortgage-overdue' | 'loan-overdue';
```

`src/core/game.ts` 的 `startAuction` 增 `trigger: AuctionTrigger` 入参（默认 `'bankrupt'` 保持既有调用点行为不变），并在 `PendingAuction.trigger` 写入。裁决 / 出价 / 泵送 / 落槌逻辑**一字不改**——三个触发源只换「起拍价口径」与「成交款如何冲抵债务」。

### 3.7 银行格站位加成（M20.2-D8 / D22）

`resolveBank` 由「10% 计息封顶 300」改写为：

```
落 9 号格：
① 若本回合（同一 round 内）申请信用贷款 ⇒ 该笔首轮免息（记 `loan.freeFirstRound = true`，轮末 tick 跳过该笔 1 次计息后清除标记）
② 领「存款红包」= round(deposit × BANK_DEPOSIT_BONUS)，一次性入 cash
③ 结算结果 `{ kind:'bank', index, bonus }`（`bonus` 取代旧 `interest` 字段）
```

- `BANK_RATE` / `BANK_CAP` 常量删除（无其他引用点，见 §2 影响面）；`SettleResult` 的 `{ kind:'bank'; interest }` 改为 `{ kind:'bank'; bonus }`。
- 让「走到银行」仍有正反馈，同时把利息收益交给存款产品（D22 原意）。

### 3.8 UI（M20.2-D10 / D11：版式 C 已定稿）

**A. 银行浮层（`OverlayKind` 增 `'bank'`）**

- 入口：HUD「银行」键（真人回合，`idle` / `settled` 均可开）+ **落 9 号格自动弹出**（`settled` 阶段）。
- 布局（390×844，复用既有面板坐标体系）：`showcase.panel`（`PANEL_X=10, PANEL_Y=300, 370×268`）+ `ui.badge`（「鹿乡银行 · 9 号格」）+ **左列表（3 行，`ui.bankRow`）+ 右详情（复用 `showcase.panel` 内区域 + `ui.button.*`）**。
  - 左列表三行：`存款 ￥1,240` / `信用贷款 无债务` / `抵押 2 块锁定`，选中行品牌色描边。
  - 右详情随选中行切换：数值行（余额/额度/利率/期限/逾期倒计时）+ 主操作键（存入 / 借款 / 抵押 / 还款 / 赎回）。
- 纯函数视图：
  - `bankRows(state): BankRowView[]`（三行摘要，`selected` 由 UI 态传入）
  - `bankDetail(state, kind): BankDetailView`（选中产品的字段与按钮可点性）
  - `bankDebtView(state, playerId)`（供 HUD 债务条与浮层共用口径）
- `PanelActionId` 增：`'bank:select'`（`data-target` = `'deposit'|'loan'|'mortgage'`）、`'bank:deposit'`、`'bank:withdraw'`、`'bank:borrow'`、`'bank:repay'`、`'bank:mortgage'`、`'bank:redeem'`、`'bank:close'`。
- `overlayOf(state, opts?)` 增可选 `opts.bankOpen`：`auction > settle > bank > stock > draw`（拍卖最高优先；银行次之，因其为玩家主动态）。

**B. HUD 债务条（新可见元素 `ui.debtBar`）**

- 常驻于 HUD 顶部状态行右侧（`HUD_LABEL_Y` 同线），单行四段：`存款 ￥N · 债务 ￥N · 抵押 M 块 · 逾期 K 轮`。
- 无信贷时（`deposit=0 && !loan && mortgages.length===0`）**整条隐藏**，保证零回归（老对局画面与截图逐像素不变）。
- 逾期段用 `warning` 语义色；其余中性。

**C. HUD「银行」键**

- `HudActionId` 增 `'bank'`；真人回合在新建的 `HUD_QK_BANK_X` 位（不挤占「出售」的 `HUD_QK_FAST_X` 与「跳过」的 `HUD_QK_SKIP_X`）。

**D. 皮肤新增元素（四级可回退）**

| 元素 id | 用途 | preset |
|---|---|---|
| `ui.debtBar` | HUD 常驻债务条 | `proc-panel.ts` 新增 `uiDebtBar` |
| `ui.bankRow` | 银行浮层左侧产品行 | `proc-panel.ts` 新增 `uiBankRow` |

- `skin/layout.ts` 新增 `HUD_DEBT_*`、`PANEL_BANK_*` 几何常量；`skin/registry.ts` 的 `UI` 注册两个 id；`public/skins/default/skin.json` 映射到新 preset；`proc.ts` 登记 preset。

### 3.9 AI（M20.2-D12）

`src/core/ai.ts` 新增纯函数与步骤：

```ts
export type BankAction = 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'mortgage' | 'redeem';
/* AiStep 增 */ | { kind: 'bank'; action: BankAction; amount?: number; index?: number }

/** 决定论：现金 < reserve 且有可抵押地块 → 抵押借款；现金充裕且无债务 → 存款；临近期限 → 优先还款 */
export function pickBank(state: GameState, P: AiParams): AiStep[];
```

- 玩家回合的 `post` 段在 `pickStock` 之后、`doubleRent` 之前插入 `pickBank`（只在**站在 9 号格**时产出贷款/抵押/还款步骤；存款任意回合可产）。
- `applyStep` 增 `'bank'` 映射到 `g.deposit/withdraw/takeLoan/repayLoan/takeMortgage/redeemMortgage`。
- 真人席位不出 `pickBank`（与 M20.1 拍卖同理，驱动器让位）。

## 4. 决策清单（M20.2-D1…D14）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 财务状态载体 | 扩 `Player`（`deposit` / `loan` / `mortgages`），随玩家走 |
| D2 | 数值真源 | 新建 `src/data/bank.ts`（§3.2 常量表），沿用 D17–D19 数值 |
| D3 | 利息结算时点 | 轮末 `onRoundBoundary` 统一计息（先信贷后行情），零随机 |
| D4 | 逾期判定 | `state.round > due` ⇒ 轮末 `overdue += 1`，否则归零 |
| D5 | 逾期罚息 | 付租额外 +50%，**直冲欠款本金、不给地主**（D20） |
| D6 | 强制执行阈值 | 逾期满 3 轮 → `trigger='loan-overdue'` 拍卖其 1 块地产（D21） |
| D7 | 拍卖触发源 | 扩为 `'bankrupt' | 'mortgage-overdue' | 'loan-overdue'`，`startAuction` 收 `trigger` |
| D8 | 银行格加成 | 改写为「贷款首轮免息 + 存款红包 5%」，删 `BANK_RATE`/`BANK_CAP`（D22） |
| D9 | 清算顺序 | 现金 → 存款自动取出 → 变卖（跳过抵押中）→ 折股 → 破产（D17） |
| D10 | 银行浮层版式 | **C · 左列表右详情**（2026-10-02 用户定稿）；入口 = HUD 键常开 + 落格自动弹出 |
| D11 | 债务条口径 | HUD 常驻 `存款 · 债务 · 抵押块数 · 逾期倒计时`；无信贷时整条隐藏（保零回归） |
| D12 | AI 策略 | `pickBank` 决定论；真人席位不产出 |
| D13 | 破产处置 | 债务清零（银行承担损失）；未赎回抵押物一并进 `'mortgage-overdue'` 拍卖（D23） |
| D14 | 多人分账路径 | **保持 M20.1-D6 限制**（仍走自动变卖），但补「跳过抵押中地块」口径；统一改造留待后续 |

## 5. 影响面与零回归核对

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/data/bank.ts` | Create | 信贷常量真源 |
| `src/data/ai.ts` | Modify | `AiParams` 增 `depositLine` / `loanLine`（AI 现金保留线与借款意愿）三档取值 |
| `src/core/bank.ts` | Create | 纯函数：`loanLimitOf` / `mortgageLimitOf` / `interestOf` / `overdueOf` / `penaltyOf` |
| `src/core/auction.ts` | Modify | `AuctionTrigger` 扩三值 |
| `src/core/game.ts` | Modify | `Player` 扩字段；`startAuction` 收 `trigger`；`settleDebt` 顺序改造；`settleBooks` 轮末计息；逾期罚息钩子；破产清债务 + 抵押物拍卖；`resolveBank` 改写；`Game` 增 6 个信贷 API；`autoTurn` 收尾补轮末 tick |
| `src/core/ai.ts` | Modify | `AiStep` 增 `'bank'`；`applyStep` 映射；`pickBank` |
| `src/ui/panels.ts` | Modify | `OverlayKind` 增 `'bank'`；`overlayOf` 收 `opts.bankOpen`；`bankRows`/`bankDetail`/`bankDebtView`；拍卖优先级前插入银行；命中区 |
| `src/ui/Hud.ts` | Modify | `HudActionId` 增 `'bank'`；真人回合推「银行」键；债务条入画条件 |
| `src/ui/aiDriver.ts` | Modify | 银行浮层展开时暂停（同拍卖） |
| `src/main.ts` | Modify | `bankOpen` UI 态接线；`bank:*` 动作分发；落 9 号格自动开浮层 |
| `src/skin/layout.ts` | Modify | 新增 `HUD_DEBT_*` / `PANEL_BANK_*` / `HUD_QK_BANK_X` |
| `src/skin/registry.ts` | Modify | `UI` 增 `ui.debtBar` / `ui.bankRow` |
| `src/render/providers/proc-panel.ts` | Modify | 新增 `uiDebtBar` / `uiBankRow` preset |
| `src/render/providers/proc.ts` | Modify | 登记两个 preset |
| `src/render/BubbleView.ts` | Modify | 银行气泡文案改口（`bonus`） |
| `public/skins/default/skin.json` | Modify | 映射 `ui.debtBar` / `ui.bankRow` |
| `test/data/bank.spec.ts` | Create | 常量与公式（额度、利息、罚息） |
| `test/core/bank.spec.ts` | Create | `loanLimitOf` / `mortgageLimitOf` / `overdueOf` / `penaltyOf` |
| `test/core/game-credit.spec.ts` | Create | 存/取/借/还/抵押/赎回全链路 + 逾期罚息 + 强执 + 抵押超期拍卖 |
| `test/core/special.spec.ts` | Modify | 银行格两处口径改 `bonus` |
| `test/core/auction.spec.ts` | Modify | `AuctionTrigger` 三值编译期覆盖 |
| `test/core/game.spec.ts` | Modify | 破产清算用例补「存款优先取出」「抵押地块不进队列」两条口径 |
| `test/ui/panels.spec.ts` | Modify | `overlayOf` 银行优先级；三行摘要 / 详情字段 / 命中区 |
| `test/ui/hud.spec.ts` | Modify | 「银行」键（真人可点 / AI 不出）；债务条显隐 |
| `local/mono-e2e-m20-2.mjs` | Create | 信贷端到端 |
| `local/mono-shots-m20-2.mjs` | Create | 手机视口截图取证 |
| `monopoly/docs/manual-mono.md` | Modify | M20.2 条目 + 截图清单 + 已知限制 |

**零回归断言**：`createGame()` 默认全 AI 且未启用银行 ⇒ `deposit=0 / loan=null / mortgages=[]`，`overlayOf` 不返回 `'bank'`，`HUD` 不画债务条与「银行」键 ⇒ M18/M19/M20.1 全部取证截图与单测逐值不变。**唯一改口径**：`special.spec.ts` 银行格两处 + `BubbleView` 文案。

## 6. 交付与验收

- 单测 / 闸门：`npx tsc --noEmit`、`npm run check`（lint / lint:skin / vitest）、`npm run build`（含 `check-hardcoded`）。
- 取证：手机视口截图 390×844 @dpr2 入 `docs/verify/`，脚本 `local/mono-shots-m20-2.mjs`，闸门须含 `errors: []`。截图清单：① 银行浮层-存款页 ② 银行浮层-抵押页（含左侧抵押锁定）③ 逾期中 HUD 债务条（警示色）④ 抵押超期拍卖。
- 文档：`docs/manual-mono.md` 追加 M20.2 小节并引用截图。
- 收尾：`npm run deploy` → `npm run check:prod` → commit → push（一次收口）。

## 7. 明确不做（YAGNI）

- 不做股票杠杆与保证金（D30/D31 归 M20.3）。
- 不做信贷周期（央行调息）与破产重组（M21）。
- 不做贷款展期 / 协商减免 / 抵押物部分赎回。
- 不为信贷新增随机源；不改 HUD 既有台位与开局流程。

## 8. 已知限制

- **多人分账债务**（进贡 `tribute` / 抽成 `collect`）仍走自动变卖（承接 M20.1-D6）；因这些路径一次结算串行触发多笔债务，改造面大，留待后续统一。
- **信用额度基数**用 `netWorth()`（不扣既有债务），可能出现「还着贷款仍可再借」的观感；口径从简，后续若需再调。
- **抵押地块不参与强制执行队列**（链二跳过抵押物），由链三（超期拍卖）单独处置，避免同一地块被两条链重复拍卖。
