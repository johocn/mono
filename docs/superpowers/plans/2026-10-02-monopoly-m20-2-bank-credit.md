# M20.2 · 银行信贷 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 PixiJS 大富翁小游戏落地 M20.2 里程碑：新增**存款 / 信用贷款 / 抵押贷款**三条产品线与两条违约链（逾期付租 +50% 罚息、逾期满 3 轮强执、抵押超期进拍卖），改造 `settleDebt` 清算顺序（现金 → 存款自动取出 → 变卖跳过抵押中 → 折股 → 破产），把银行格改写为「贷款首轮免息 + 存款红包 5%」；新增银行浮层（版式 C 左列表右详情）、HUD 债务条与「银行」常开键；AI 新增决定论 `pickBank`。

**Architecture:** 沿用项目四级可回退体系（L1 元素覆盖 → L2 皮肤包 skin.json → L3 默认皮肤 → L4 内建 `fb({...})`），数据 / core 纯函数 / render 表现 / ui 四层分离。新增 `src/data/bank.ts`（数值真源）与 `src/core/bank.ts`（纯函数，只依赖 `estate.ts` / `data/*`，不 import `game.ts` 运行时）；信贷状态挂 `Player`（`deposit` / `loan` / `mortgages`）；拍卖引擎复用 M20.1 现有实现，仅把 `AuctionTrigger` 由 1 值扩为 3 值并让 `startAuction` 收 `trigger`。信贷全链路**零随机**（利息/罚息/逾期均为纯算术，`pickBank` 为决定论公式）。

**Tech Stack:** PixiJS 8 · TypeScript 5 · Vite 6 · Vitest 2 · Playwright · ESLint 9 + 本地 `tools/eslint-plugin-mono` · GSAP。

## 规格来源与硬约束

- **上位设计（唯一真源）**：`docs/superpowers/specs/2026-10-02-monopoly-m20-2-bank-credit-design.md`（§3.1–§3.9 与决策 M20.2-D1..D14 已定稿，本计划不得偏离）。
- **格式参考（同项目已落地里程碑）**：`docs/superpowers/plans/2026-10-02-monopoly-m20-1-auction-and-sale.md`。
- **全程中文**：本计划、提交信息、代码注释一律中文。
- **确定性**：任何随机必须走 `makeRng(seed)`，禁止 `Math.random`（`test/smoke.spec.ts` 有源码闸门）。**信贷全链路零随机**。
- **四级可回退体系**：裸色值 / 裸视觉常数只允许出现在 L4 内建兜底 `fb({...})`；新增两个可见元素 `ui.debtBar` / `ui.bankRow`，注册表 `UI` 增 id → `public/skins/default/skin.json` 映射 preset → `proc-panel.ts` 新增 preset（几何常数走 `skin/layout.ts` 新增的 `HUD_DEBT_*` / `PANEL_BANK_*`，色值走 token / `fb({...})` 兜底）。
- **机器闸门**：`tools/check-hardcoded.mjs`（作用域 `src/render`，`npm run build` 前置）；`tools/lint-skin.mjs`（校验 skin.json 的 key 必须在注册表且符合 ID 正则）。禁 `eslint-disable`。
- **17 个商家格一个不动**：信贷只改 `Player` 财务字段、`estates` 抵押标记与 `cash`，不碰地砖 / 店招 / 楼体。
- **零回归**：`createGame()` 未启用银行 ⇒ `deposit=0 / loan=null / mortgages=[]`，利息 0、无逾期、浮层不额外弹、债务条整条隐藏 ⇒ M18/M19/M20.1 全部截图与单测逐值不变。**唯一例外**：`test/core/special.spec.ts` 银行格两处 `interest` 口径改 `bonus` + `BubbleView` 银行气泡文案。
- **环境**：`npm` / `npx` / `node` 的 cwd = `d:\zhao\monopoly`；`git` 的 cwd = `d:\zhao`。
- **命令约定**：PowerShell 不支持 heredoc，提交信息用单引号 `-m '...'`。
- **只 add 指定文件**：`git -C d:\zhao add <指定文件>`，禁用 `git add .` / `git add -A`（仓库有大量无关未跟踪文件）。
- **不动后台 dev server**；不跑全量测试套件（只跑本任务相关 spec + 必要闸门）。
- **交付 = 实现 + 单测/闸门 + 手机视口截图（390×844 @ dpr=2）+ 操作手册条目**。

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `monopoly/src/data/bank.ts` | Create | 信贷数值真源（§3.2 常量表） |
| `monopoly/src/data/ai.ts` | Modify | `AiParams` 增 `depositLine` / `loanLine`；`PERSONA_PARAMS` 三档补值 |
| `monopoly/src/core/bank.ts` | Create | 纯函数：`loanLimitOf` / `mortgageLimitOf` / `interestOf` / `overdueOf` / `penaltyOf` |
| `monopoly/src/core/auction.ts` | Modify | `AuctionTrigger` 扩 `'bankrupt' | 'mortgage-overdue' | 'loan-overdue'` |
| `monopoly/src/core/game.ts` | Modify | `Player` 扩字段；`startAuction(trigger)`；`settleDebt` 顺序改造；`settleBooks` 轮末计息；逾期罚息钩子；强执 / 抵押超期两链；破产清债务 + 抵押物拍卖；`resolveBank` 改写；`Game` 增 6 个信贷 API；`autoTurn` 收尾补 tick |
| `monopoly/src/core/ai.ts` | Modify | `AiStep` 增 `'bank'`；`applyStep` 映射；`pickBank` |
| `monopoly/src/ui/panels.ts` | Modify | `OverlayKind` 增 `'bank'`；`overlayOf(state, opts?)`；`bankRows` / `bankDetail` / `bankDebtView`；命中区 |
| `monopoly/src/ui/Hud.ts` | Modify | `HudActionId` 增 `'bank'`；真人回合推「银行」键；债务条入画条件 |
| `monopoly/src/ui/aiDriver.ts` | Modify | 银行浮层展开时暂停（同拍卖） |
| `monopoly/src/main.ts` | Modify | `bankOpen` UI 态接线；`bank:*` 分发；落 9 号格自动开浮层 |
| `monopoly/src/skin/layout.ts` | Modify | 新增 `HUD_DEBT_*` / `PANEL_BANK_*` / `HUD_QK_BANK_X` |
| `monopoly/src/skin/registry.ts` | Modify | `UI` 增 `ui.debtBar` / `ui.bankRow` |
| `monopoly/src/render/providers/proc-panel.ts` | Modify | 新增 `uiDebtBar` / `uiBankRow` preset |
| `monopoly/src/render/providers/proc.ts` | Modify | 登记两个 preset |
| `monopoly/src/render/BubbleView.ts` | Modify | 银行气泡文案改 `bonus` 口径 |
| `monopoly/public/skins/default/skin.json` | Modify | 映射 `ui.debtBar` / `ui.bankRow` |
| `monopoly/test/data/bank.spec.ts` | Create | 常量与公式 |
| `monopoly/test/core/bank.spec.ts` | Create | `loanLimitOf` / `mortgageLimitOf` / `overdueOf` / `penaltyOf` |
| `monopoly/test/core/game-credit.spec.ts` | Create | 存/取/借/还/抵押/赎回 + 逾期罚息 + 强执 + 抵押超期拍卖 |
| `monopoly/test/core/special.spec.ts` | Modify | 银行格两处改 `bonus` |
| `monopoly/test/core/auction.spec.ts` | Modify | `AuctionTrigger` 三值覆盖 |
| `monopoly/test/core/game.spec.ts` | Modify | 破产清算补「存款优先取出」「抵押地块不进队列」 |
| `monopoly/test/ui/panels.spec.ts` | Modify | 银行浮层优先级 / 摘要 / 详情 / 命中区 |
| `monopoly/test/ui/hud.spec.ts` | Modify | 「银行」键 + 债务条显隐 |
| `monopoly/local/mono-e2e-m20-2.mjs` | Create | 信贷端到端 |
| `monopoly/local/mono-shots-m20-2.mjs` | Create | 手机视口截图取证 |
| `monopoly/docs/manual-mono.md` | Modify | M20.2 条目 + 截图清单 + 已知限制 |

---

## Task 1：数据层数值真源（`data/bank.ts` + `AiParams`）

- [ ] 新建 `src/data/bank.ts`，按 spec §3.2 导出 10 个常量（`DEPOSIT_RATE` / `LOAN_RATE` / `LOAN_TERM` / `LOAN_CAP` / `LOAN_NET_RATIO` / `MORTGAGE_RATE` / `MORTGAGE_TERM` / `MORTGAGE_LTV` / `RENT_PENALTY` / `OVERDUE_SEIZE_ROUNDS` / `BANK_DEPOSIT_BONUS`），每个带中文注释说明口径与来源决策号。
- [ ] `src/data/ai.ts` 的 `AiParams` 增 `depositLine: number`（保留线以上才存款）与 `loanLine: number`（现金低于此线才借款）；`PERSONA_PARAMS` 三档取值：保守 `depositLine 800 / loanLine 400`、激进 `500 / 200`、投机 `700 / 300`。
- [ ] 新建 `test/data/bank.spec.ts`：断言常量取值与「20 轮回本」等口径注释一致（`DEPOSIT_RATE === 0.03`、`LOAN_TERM === 8`、`MORTGAGE_LTV === 0.8`、`OVERDUE_SEIZE_ROUNDS === 3`）。
- [ ] 新建 `test/data/ai.spec.ts` 增用例：三档 `personaParams` 返回的 `depositLine` / `loanLine` 取值。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/data/bank.spec.ts test/data/ai.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/data/bank.ts monopoly/src/data/ai.ts monopoly/test/data/bank.spec.ts monopoly/test/data/ai.spec.ts` → `-m 'M20.2 Task1: 数据层新增信贷数值真源与 AI 保留线参数'`。

## Task 2：core 纯函数（`core/bank.ts`）

- [ ] 新建 `src/core/bank.ts`（只依赖 `estate.ts` / `data/bank.ts` / `data/economy.ts`，不 import `game.ts`）：
  - `loanLimitOf(netWorth: number): number` = `min(LOAN_CAP, round(netWorth * LOAN_NET_RATIO))`
  - `mortgageLimitOf(estates: Estates, index: number): number` = `round(sellAt(estates, index) * MORTGAGE_LTV)`
  - `interestOf(book: DebtBook): number` = `round(book.principal * book.rate)`
  - `overdueOf(book: DebtBook, round: number): number` = `round > book.due ? book.overdue + 1 : 0`
  - `penaltyOf(rent: number): number` = `round(rent * RENT_PENALTY)`
  - `DepositBook` 无关；`DebtBook` / `MortgageBook` 类型定义放此处，`game.ts` 反向 import（与 M20.1 `auction.ts` 同法）。
- [ ] 新建 `test/core/bank.spec.ts`：额度封顶与四舍五入、抵押 80%、利息、逾期推进（到期轮 `round === due` 不算逾期、`round === due + 1` 起算）、罚息 50%。
- [ ] `npx vitest run test/core/bank.spec.ts` + `npx tsc --noEmit`。
- [ ] 提交：`-m 'M20.2 Task2: 新建 core/bank 纯函数（额度/利息/逾期/罚息）'`。

## Task 3：拍卖触发源扩容

- [ ] `src/core/auction.ts`：`AuctionTrigger` 改为 `'bankrupt' | 'mortgage-overdue' | 'loan-overdue'`，注释说明三源共享同一裁决、只换起拍价与分账口径。
- [ ] `src/core/game.ts`：`startAuction` 增第 4 参 `trigger: AuctionTrigger = 'bankrupt'`，写入 `PendingAuction.trigger`；既有两处调用点（`settleDebt`）不传即保持 `'bankrupt'`。
- [ ] `test/core/auction.spec.ts` 增：三值均可赋给 `PendingAuction.trigger`（编译期覆盖 + 运行期读取）。
- [ ] `npx vitest run test/core/auction.spec.ts` + `npx tsc --noEmit`。
- [ ] 提交：`-m 'M20.2 Task3: 拍卖触发源扩为破产/抵押超期/贷款强执 三值'`。

## Task 4：信贷状态与六个 API

- [ ] `src/core/game.ts`：
  - `Player` 增 `deposit: number`、`loan: DebtBook | null`、`mortgages: MortgageBook[]`（类型从 `core/bank.ts` 引）。
  - `createGame` 初始化 `deposit: 0, loan: null, mortgages: []`。
  - `Game` 增：`deposit(amount)` / `withdraw(amount)`（校验 `amount > 0` 且现金/存款够）、`takeLoan()`（须 `pos === BANK_TILE_INDEX(9)` 且无未结清 `loan` 且额度 > 0）、`repayLoan(amount?)`、`takeMortgage(index)`（须 9 号格、自有、未抵押、未施工）、`redeemMortgage(index)`。
  - 新增 `creditLocked(state, index): boolean`（该地块在其任一 `mortgages` 中）并在 `sellEstate` / `upgradeCurrent` 前置拦截（返回 `'mortgaged'` 失败原因）。
  - `SellOutcome` / `UpgradeOutcome` 失败枚举补 `'mortgaged'`。
- [ ] 新建 `test/core/game-credit.spec.ts`：存/取成功与越界、借款非 9 号格拒绝、有贷款再借拒绝、额度=min(2000, 净资产30%)、抵押锁定（`sellEstate`/`upgrade` 均拒绝）、赎回解锁、抵押中仍可收租。
- [ ] 跑 `npx vitest run test/core/game-credit.spec.ts test/core/estate.spec.ts` + `npx tsc --noEmit`。
- [ ] 提交：`-m 'M20.2 Task4: Player 信贷字段与存取借还抵押赎回六 API + 抵押锁定'`。

## Task 5：轮末计息与逾期推进

- [ ] `src/core/game.ts`：新增闭包 `settleBooks()`，在 `onRoundBoundary()` 内**先于**股价 tick 调用（spec §3.3）：存款复利、贷款复利、逐笔抵押复利、`overdue` 推进（`overdueOf`）；破产者跳过。
- [ ] `autoTurn` 收尾补一次 `settleBooks()` 口径对齐（保证 `autoPlay` 与手动回合一致）。
- [ ] `test/core/game-credit.spec.ts` 增：存 ￥1000 跑一圈 → ￥1030；借 ￥1000 8% 口径下跑一圈 → `principal === round(1000 × 1.06) === 1060`；到期轮 `round === due` `overdue === 0`、下一轮 `overdue === 1`；破产者不涨利息。
- [ ] `npx vitest run test/core/game-credit.spec.ts`。
- [ ] 提交：`-m 'M20.2 Task5: 轮末统一计息（存款复利/贷款复利/逾期推进）'`。

## Task 6：逾期罚息钩子（多交房租）

- [ ] `src/core/game.ts` 收租分支（`settleCurrent` 的 `rent` 路径，L550–567）：付款人若存在 `loan?.overdue > 0` 或任一 `mortgages[].overdue > 0`，在既有 `settleDebt(p, rent, owner)` **之后**追加 `penalty = penaltyOf(rent)` 的 `settleDebt(p, penalty, null)`；`SettleResult.kind === 'rent'` 增可选 `penalty: number`。
- [ ] 罚息清算所得按 `loan` → `mortgages`（`index` 升序）冲减本金；本金归零的债务从名下移除（抵押地块随之解锁）；若冲抵后仍有余额则并入 `bankrupt` 判定。
- [ ] `test/core/game-credit.spec.ts` 增：逾期玩家付 ￥100 租 → 地主仍收 ￥100、该玩家本金额外减 ￥50；未逾期玩家无罚息。
- [ ] `npx vitest run test/core/game-credit.spec.ts`。
- [ ] 提交：`-m 'M20.2 Task6: 逾期付租 +50% 罚息（直冲本金、不给地主）'`。

## Task 7：两条违约链（强执 + 抵押超期拍卖）

- [ ] `src/core/game.ts`：`settleBooks()` 末段逐玩家检查：
  - 债务 `overdue >= OVERDUE_SEIZE_ROUNDS` 且有**未抵押**地产 ⇒ `startAuction(..., trigger='loan-overdue')`，队列按 `sellAt()` 升序且**跳过抵押中地块**；成交款先还该笔本金、余额归玩家、不足则债务清零。
  - 任一抵押笔 `state.round > due` ⇒ `startAuction(..., trigger='mortgage-overdue')`，**起拍价 = 该笔借款本金**，成交款先还该笔、余额归借款人、不足继续追偿。
  - 拍卖与真人出价挂起语义复用 M20.1（`state.auction` + `pending`），驱动器暂停。
- [ ] `closeDebt` 破产分支：`loan = null`、`mortgages` 清零（债务清零、银行承担损失），未赎回抵押地块追加一场 `'mortgage-overdue'` 拍卖。
- [ ] `settleDebtAuto` 与拍卖队列构造统一补「跳过抵押中地块」。
- [ ] `test/core/game-credit.spec.ts` 增：逾期 3 轮触发 `loan-overdue` 拍卖且队列不含抵押地块；抵押超期触发 `mortgage-overdue` 拍卖、起拍价 = 借款额、成交后余额归借款人；破产时债务清零且抵押物进拍卖。
- [ ] `test/core/game.spec.ts` 破产清算用例补两条零回归口径断言。
- [ ] `npx vitest run test/core/game-credit.spec.ts test/core/game.spec.ts test/core/game-auction.spec.ts`。
- [ ] 提交：`-m 'M20.2 Task7: 逾期强执与抵押超期拍卖（复用 M20.1 引擎）+ 破产清债务'`。

## Task 8：清算顺序改造 + 银行格改写

- [ ] `settleDebt` 顺序（spec §3.5）：① 现金足额直接付 ② 存款自动取出（`cash += deposit; deposit = 0`）③ 有未抵押地产走拍卖 ④ 折股 ⑤ 破产。
- [ ] `resolveBank`（`src/core/game.ts` L641–648）改写为 `{ kind:'bank', index, bonus }`：领存款红包 `round(deposit × BANK_DEPOSIT_BONUS)`；若本回合申请信用贷款则置 `loan.freeFirstRound = true`（`settleBooks` 对该笔跳 1 次计息后清除标记）。`DebtBook` 增可选 `freeFirstRound?: boolean`。
- [ ] `SettleResult` 的 `{ kind:'bank'; interest }` → `{ kind:'bank'; bonus }`；删 `src/core/special.ts` 的 `BANK_RATE` / `BANK_CAP` 与 `game.ts` 引用。
- [ ] `src/render/BubbleView.ts` L60–61 银行气泡改 `bonus` 口径（标题「银行服务」）。
- [ ] `test/core/special.spec.ts` L104、L112 银行格期望改 `bonus`；`test/core/game-credit.spec.ts` 增「清算优先取存款」「拍卖队列跳过抵押地块」「存款红包 5%」。
- [ ] `npx vitest run test/core/special.spec.ts test/core/game-credit.spec.ts` + `npx tsc --noEmit`。
- [ ] 提交：`-m 'M20.2 Task8: 清算顺序改造（存款优先取出/跳过抵押）+ 银行格改首轮免息与存款红包'`。

## Task 9：UI 银行浮层（panels）

- [ ] `src/ui/panels.ts`：`OverlayKind` 增 `'bank'`；`overlayOf(state, opts?: { bankOpen?: boolean })` 优先级 `auction > settle > bank > stock > draw`（`bankOpen` 且未结束时返回 `'bank'`）。
- [ ] 新增视图纯函数：`bankRows(state, selected): BankRowView[]`（三行摘要 + 选中态）、`bankDetail(state, kind): BankDetailView`（字段行 + 按钮可点性）、`bankDebtView(state, playerId): { deposit, debt, mortgageCount, overdue }`。
- [ ] `panelSpecs` 增 `'bank'` 分支（版式 C：`showcase.panel` + `ui.badge` + 左 3×`ui.bankRow` + 右详情文本行 + `ui.button.primary` / `ui.button.secondary`）；`panelHitAreas` 增对应命中区。
- [ ] `PanelActionId` 增 `'bank:select' | 'bank:deposit' | 'bank:withdraw' | 'bank:borrow' | 'bank:repay' | 'bank:mortgage' | 'bank:redeem' | 'bank:close'`。
- [ ] `test/ui/panels.spec.ts` 增：银行浮层优先级（拍卖压银行、银行压股票）、三行摘要文案、详情字段随选中切换、命中区一一对应。
- [ ] `npx vitest run test/ui/panels.spec.ts` + `npx tsc --noEmit`。
- [ ] 提交：`-m 'M20.2 Task9: panels 银行浮层（版式C 左列表右详情）与命中区'`。

## Task 10：HUD（银行键 + 债务条）与接线

- [ ] `src/ui/Hud.ts`：`HudActionId` 增 `'bank'`；真人回合在 `HUD_QK_BANK_X` 推「银行」键；债务条入画条件 = `deposit > 0 || loan || mortgages.length > 0`（否则整条隐藏）。
- [ ] `src/main.ts`：`bankOpen` UI 态；HUD `'bank'` 与 `bank:*` 动作分发到 `Game` API；`settled` 且落 9 号格时自动置 `bankOpen = true`；`aiDriver` 在 `bankOpen` 时暂停（同拍卖）。
- [ ] `test/ui/hud.spec.ts` 增：「银行」键真人可点 / AI 回合不出 / 无信贷时债务条不出现、有信贷时出现且逾期段用警示色。
- [ ] `npx vitest run test/ui/hud.spec.ts`。
- [ ] 提交：`-m 'M20.2 Task10: HUD 银行键与债务条 + main 接线 + 驱动器暂停'`。

## Task 11：皮肤元素（四级可回退）

- [ ] `src/skin/layout.ts` 增 `HUD_DEBT_*` / `PANEL_BANK_*` / `HUD_QK_BANK_X` 几何常量。
- [ ] `src/skin/registry.ts` 的 `UI` 注册 `ui.debtBar` / `ui.bankRow`。
- [ ] `src/render/providers/proc-panel.ts` 新增 `uiDebtBar` / `uiBankRow` preset（几何走 layout 常量，色值走 token / `fb({...})` 兜底）；`src/render/providers/proc.ts` 登记。
- [ ] `public/skins/default/skin.json` 映射 `ui.debtBar` / `ui.bankRow`。
- [ ] 跑 `npm run lint:skin` + `npm run build`（含 `check-hardcoded`）+ `npx vitest run test/skin test/render`。
- [ ] 提交：`-m 'M20.2 Task11: 新增 ui.debtBar/ui.bankRow 皮肤元素（layout/registry/preset/skin.json）'`。

## Task 12：AI `pickBank`

- [ ] `src/core/ai.ts`：`AiStep` 增 `{ kind:'bank'; action: BankAction; amount?: number; index?: number }`；`applyStep` 映射到六个 API。
- [ ] `pickBank(state, P)`：现金低于 `loanLine` 且有可抵押地块 → 抵押借款；现金高于 `depositLine` 且无债务 → 存款；临近到期（`due - round <= 2`）→ 优先还款；站在 9 号格时产出贷款/抵押/还款，存款任意回合可产。
- [ ] 在玩家回合 `post` 段 `pickStock` 之后、`doubleRent` 之前插入 `pickBank`；真人席位不产出。
- [ ] `test/core/ai.spec.ts` 增：三档参数下的 `pickBank` 产出与顺序（决定论）。
- [ ] `npx vitest run test/core/ai.spec.ts test/core/game-credit.spec.ts`。
- [ ] 提交：`-m 'M20.2 Task12: AI pickBank 决定论策略与 applyStep 映射'`。

## Task 13：e2e / 截图取证 / 操作手册 / 收尾闸门

- [ ] 新建 `local/mono-e2e-m20-2.mjs`：存取款 → 借款 → 逾期罚息 → 强执 → 抵押 → 超期拍卖 全链路脚本，断言终态。
- [ ] 新建 `local/mono-shots-m20-2.mjs`：手机视口 390×844 @dpr2 截图四项（银行浮层-存款页 / 银行浮层-抵押页 / 逾期债务条 / 抵押超期拍卖），闸门 `errors: []`。
- [ ] `docs/manual-mono.md` 追加 M20.2 小节 + 截图清单 + 「已知限制」（多人分账仍自动变卖、额度基数不扣既有债务、抵押物不进强执队列）。
- [ ] 跑 `npm run check`（lint / lint:skin / vitest）+ `npx tsc --noEmit` + `npm run build`，确认全绿。
- [ ] 收尾一次完成：`npm run deploy` → `npm run check:prod` → 提交（含截图与手册）→ `git -C d:\zhao push`。

---

## Self-Review

**口径一致性**：本计划所有数值均取自 spec §3.2 常量表与决策 D1–D14；`AuctionTrigger` 三值（Task 3）与两链调用点（Task 7）一致；`resolveBank` 改写（Task 8）与 spec §3.7 一致。

**零回归核对**：Task 4 初始化 `deposit/loan/mortgages` 默认空 ⇒ 计息为 0、无逾期；Task 9 的 `overlayOf` 仅在 `opts.bankOpen` 时返回 `'bank'`，默认 `false` ⇒ 老对局浮层不变；Task 10 债务条「无信贷整条隐藏」+「银行键仅真人回合」⇒ 老截图逐像素不变。唯一改口径的两处（`special.spec.ts` + `BubbleView`）已在 spec §2.1 与 Task 8 明列。

**确定性核对**：全部新增逻辑为纯算术与决定论公式，未引入 `Math.random`/新 `makeRng` 源；`settleBooks` 在股价 tick 之前固定顺序执行。

**风险点**：Task 7 的两条拍卖链会在轮末触发，可能与既有 `endTurn` 的 `state.auction` 挂起语义交叉 —— 必须保证「轮末拍卖挂起时不再推进到下一位玩家」（复用 M20.1 的 `endTurn` 早退守卫），并在 Task 7 单测中断言「挂起后 `state.current` 不变」。
