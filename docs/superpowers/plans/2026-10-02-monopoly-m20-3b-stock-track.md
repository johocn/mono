# M20.3-B · 股票轨（浮层 A 版式 · 涨跌卡 · 红利卡 · 杠杆与爆仓）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付客户抱怨的三件事：① 股票**可指定标的与数量**（逐行选中 + 买三档 / 卖三档，支持只卖其中一支）；
② 新增两张股票卡——涨跌卡 `bullBear`（选方向 + 指定标的，下轮必涨/必跌）、红利卡 `dividend`（按持仓每股 ￥20，无持仓折现 ￥100）；
③ 第 8 轮起解锁保证金杠杆 2× / 3×（借入 6%/轮复利）+ 爆仓强平（持仓市值 < 借款额 × 120% → 清仓还债，不足转信用贷款）。

**Architecture:** 沿用项目四级可回退体系（L1 元素覆盖 → L2 皮肤包 skin.json → L3 默认皮肤 → L4 内建 `fb({...})`），数据 / core 纯函数 / render 表现 / ui 四层分离。
本轨 **零新增皮肤元素**：股票浮层 A 版式 100% 复用 `ui.stockRow` / `ui.stockChart` / `ui.tradeBuy` / `ui.tradeSell` / `ui.qk` / `ui.badge` / `showcase.panel`；
新增台位常量全部落 `src/skin/layout.ts`。数据层往 `ITEM_CARDS` 追加两种卡后，手牌自动变 8 槽、商店目录自动变 8 行（M20.3-A 已把槽数与目录改为派生），**零版式返工**。
全链路**零新增随机源**（`market.tick` 强制标的走短路、不消耗 `rng()`，保证既有 seed 回放序列逐字节不变）。

**Tech Stack:** PixiJS 8 · TypeScript 5 · Vite 6 · Vitest 2 · Playwright · ESLint 9 + 本地 `tools/eslint-plugin-mono` · GSAP。

## 规格来源与硬约束

- **上位设计（唯一真源）**：`docs/superpowers/specs/2026-10-02-monopoly-m20-3b-stock-track-design.md`（§3 口径决策已定稿，本计划不得偏离）。
- **上位路线图**：`docs/superpowers/specs/2026-10-01-monopoly-interaction-roadmap-design.md`（§4.3 / D5–D9 / D30–D31）。
- **格式参考**：`docs/superpowers/plans/2026-10-02-monopoly-m20-3-hand-and-item-shop.md`。
- **全程中文**：本计划、提交信息、代码注释一律中文。
- **口径定稿（spec §3，不得再询问用户）**：
  B-D1 = A2「买三档 + 卖三档」；B-D2 = 涨跌卡「选方向 + 点股票行即成交」（方向默认押涨）；B-D3 = 爆仓**只用股票账户清偿**；
  B-D4 = 杠杆**只在新买入时可选**；B-D5 = 保证金抵押物 = **整个股票账户**（卖出所得先还借入、余额入现金）。
- **确定性**：任何随机必须走 `makeRng(seed)`，禁止 `Math.random`（`test/smoke.spec.ts` 有源码闸门）。
- **零回归口径**：`leverage <= 1` 的买入路径逐字节等同既有 `buyShares`；`market.tick(force)` 在 `force` 命中时**不调用 `rng()`**，与既有 `tips.includes(code) ? … : …` 短路结构逐字节一致。
- **四级可回退体系**：裸色值 / 裸视觉常数只允许出现在 L4 内建兜底 `fb({...})`；`src/render` 内不得出现裸值（`tools/check-hardcoded.mjs` 闸门）。
- **机器闸门**：`tools/check-hardcoded.mjs`（作用域 `src/render`，`npm run build` 前置）；`tools/lint-skin.mjs`。禁 `eslint-disable`。
- **17 个商家格一个不动**；不改 `TILE_TYPES` / `ringPath`（股票浮层沿用 index 19）。
- **环境**：`npm` / `npx` / `node` 的 cwd = `d:\zhao\monopoly`；`git` 的 cwd = `d:\zhao`。
- **命令约定**：PowerShell 不支持 heredoc，提交信息用单引号 `-m '...'`；多命令用 `;` 串联。
- **只 add 指定文件**：`git -C d:\zhao add <指定文件>`，禁用 `git add .` / `git add -A`。
- **交付 = 实现 + 单测/闸门 + 手机视口截图（390×844 @ dpr=2）+ 操作手册条目**。
- **收尾「一气呵成」**：`npm run check` → `npm run deploy` → `npm run check:prod` → 提交 → `git -C d:\zhao push`。

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `monopoly/src/data/cards.ts` | Modify | `ItemCardKind` 增 `bullBear` / `dividend`；`ItemTarget` 增 `'stock'`；`ITEM_CARDS` 追加两项（priority 70 / 80） |
| `monopoly/src/data/stocks.ts` | Modify | 新增 `LOT_TIERS` / `LotTier` / `LEVERAGES` / `MARGIN_UNLOCK_ROUND` / `MARGIN_RATE` / `LIQUIDATION_RATIO` / `DIVIDEND_PER_SHARE` / `DIVIDEND_REFUND` |
| `monopoly/src/core/stocks.ts` | Modify | `Market.tick(force)` 取代 `tick(tips)`；新增 `lotShares(tier, …)` 纯函数 |
| `monopoly/src/core/game.ts` | Modify | `Player.margin` / `MarginBook`；`trade(code, shares, leverage?)`；`liquidate`；`onRoundBoundary` 扩为 5 步；`stockTip` → `stockForce`；`useCard(kind, target?, stock?)` 增两卡显式 case |
| `monopoly/src/core/ai.ts` | Modify | `pickStock` 保持 1 股不用杠杆；新增打 `dividend` / 打 `bullBear` 的策略 |
| `monopoly/src/ui/panels.ts` | Modify | `stockRows(state, sel)` 带 `selected`；`stockDetail` / `lotShares`；股票浮层 A 台位与命中区 `code:tier`；`OverlayKind` 增 `'bullbear'`；`bullbearRows` / 命中区 |
| `monopoly/src/main.ts` | Modify | UI 态 `stockSel` / `stockLev` / `bullbearOpen` / `bullbearDir`；命中区解析 `code:tier`；`card:bullBear` / `bullbear:pick` 落库 |
| `monopoly/src/ui/Hud.ts` | Modify | `card:bullBear` 触发浮层（非选目标态） |
| `monopoly/src/ui/aiDriver.ts` | Modify | `bullbear` 浮层展开时暂停（同银行 / 商店） |
| `monopoly/src/skin/layout.ts` | Modify | 新增 `PANEL_STOCK_PANEL_H` / `PANEL_STOCK_LEV_Y` / `PANEL_STOCK_BUY_Y` / `PANEL_STOCK_SELL_Y` / `PANEL_STOCK_TIER_W` / `PANEL_STOCK_TIER_GAP` / `PANEL_STOCK_TIER_H` / `PANEL_BULLBEAR_*` |
| `monopoly/test/data/cards.spec.ts` | Modify | 8 种卡 priority 全序 + `HAND_SIZE === 8` |
| `monopoly/test/data/stocks.spec.ts` | Modify | 新增常量逐值断言 |
| `monopoly/test/core/stocks.spec.ts` | Modify | `tick(force)` 涨/跌 + 不消耗 `rng()`；`lotShares` 各档 |
| `monopoly/test/core/game-stock-track.spec.ts` | Create | 杠杆买入 / 卖出还债 / 轮末复利 / 爆仓两分支 / 两卡落库 |
| `monopoly/test/ui/panels.spec.ts` | Modify | 股票浮层 A 断言（选中行 / 三档 / 杠杆显隐 / `code:tier`）；`bullbear` 浮层 |
| `monopoly/test/core/ai.spec.ts` | Modify | AI 打 `dividend` / `bullBear` 策略 |
| `monopoly/local/mono-shots-m5.mjs` | Modify | 同步既有股票截图断言（`ui.stockRow` 计数 / `buyLabel`） |
| `monopoly/local/mono-shots-m20-3b.mjs` | Create | 手机视口截图取证（4 张） |
| `monopoly/docs/manual-mono.md` | Modify | 三节新条目 + 4 张手机截图 |

---

## Task 1：数据层（两张卡 + 股票常量）

- [ ] `src/data/cards.ts`：`ItemCardKind` 追加 `'bullBear' | 'dividend'`；`ItemTarget` 追加 `'stock'`（注释说明「M20.3-B：涨跌卡指定一支股票」）。
- [ ] `src/data/cards.ts`：`ITEM_CARDS` 追加两项（保持数组序 = priority 升序，第三键兜底不变）：
      `{ kind:'bullBear', name:'涨跌卡', desc:'指定一支股票，下轮必涨或必跌', target:'stock', priority:70 }`、
      `{ kind:'dividend', name:'红利卡', desc:'按持仓每股领 ￥20；无持仓折现 ￥100', target:'none', priority:80 }`。
- [ ] `src/data/stocks.ts`：按 spec §4.2 新增 `LOT_TIERS = [1,5] as const`、`type LotTier = number | 'all'`、
      `LEVERAGES = [2,3] as const`、`MARGIN_UNLOCK_ROUND = 8`、`MARGIN_RATE = 0.06`、`LIQUIDATION_RATIO = 1.2`、
      `DIVIDEND_PER_SHARE = 20`、`DIVIDEND_REFUND = 100`，逐项带中文口径注释。
- [ ] `test/data/cards.spec.ts`：断言 8 种卡 `priority` 逐值与 spec §4.1 表一致、两两互不相等（全序）、`HAND_SIZE === 8`、两新卡 `target` 正确。
- [ ] `test/data/stocks.spec.ts`：断言新增常量逐值 + `LOT_TIERS.length === 2` + `LEVERAGES` 升序。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/data/cards.spec.ts test/data/stocks.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/data/cards.ts monopoly/src/data/stocks.ts monopoly/test/data/cards.spec.ts monopoly/test/data/stocks.spec.ts` → `-m 'M20.3-B Task1: 数据层新增涨跌卡/红利卡与股票杠杆常量'`。

## Task 2：core 股票三档与保证金（`core/stocks.ts` + `game.ts`）

- [ ] `src/core/stocks.ts`：`Market.tick(force?: { code: string; dir: 1 | -1 }[])` 取代 `tick(tips?: string[])`；
      循环内 `const f = force.find((x) => x.code === d.code); const delta = f ? d.vol * f.dir : d.vol * (2 * rng() - 1);`
      —— 命中时**不调用 `rng()`**（与既有 `tips.includes(code) ? … : …` 短路逐字节一致）。
- [ ] `src/core/stocks.ts`：新增纯函数 `lotShares(tier: LotTier, price: number, cash: number, held: number): number`
      —— `1 → SHARE_LOT`；`5 → 5`；`'all' → cash > 0 ? Math.floor(cash / price) : 0` 买侧 / 卖侧用 `held`（由调用方按方向传参，见 UI 层签名）；
      `held = 0` 返回 0（不出除零）。带中文注释。
- [ ] `src/core/game.ts`：新增 `export interface MarginBook { principal: number; rate: number }`；`Player` 增 `margin: MarginBook | null`；`createGame` 初始化为 `null`。
- [ ] `src/core/game.ts`：`trade(code, shares, leverage = 1)`：
      `leverage <= 1` 走既有 `buyShares`（零回归）；`leverage > 1` 时 `cost = price × shares`、`own = Math.ceil(cost / leverage)`、
      `borrowed = cost − own`、`cash < own → 'not-enough-cash'`，成功则 `p.cash -= own`、写 `portfolio`、`margin.principal += borrowed`（null 时新建 `{ principal: borrowed, rate: MARGIN_RATE }`）；
      `leverage ∉ LEVERAGES && leverage > 1 → 'bad-lot'`。
      卖出侧：走既有 `sellShares` 得 `proceeds`；若 `p.margin` 非 null，先 `principal -= proceeds`（`<= 0` 则 `p.cash += -rest` 且 `margin = null`，否则 `p.cash` 不变）；无负债时行为与现状一致。
- [ ] `src/core/game.ts`：新增 `liquidate(p)`（spec §5.3）：`proceeds = marketValue(p.portfolio, state.quotes)` → `p.portfolio = {}` → `rest = p.margin.principal − proceeds` → `p.margin = null` →
      `rest > 0` 则并入 `p.loan`（无则新建 `{ principal: rest, rate: LOAN_RATE, due: state.round + LOAN_TERM, overdue: 0, freeFirstRound: false }`），否则 `p.cash += -rest`；`lastEvent = { kind:'marginCall', player: p.id, debt: rest }`（EventLog 增该变体）。
- [ ] `src/core/game.ts`：`onRoundBoundary` 扩为固定 5 步：① `settleBooks()` → ② 保证金复利 `p.margin.principal = Math.round(p.margin.principal * (1 + MARGIN_RATE))` → ③ `market.tick(force)` → ④ 爆仓判定（`marketValue(p.portfolio, state.quotes) < p.margin.principal * LIQUIDATION_RATIO` → `liquidate(p)`）→ ⑤ 清空 `stockForce`。
- [ ] `src/core/game.ts`：`Game` 接口 `trade` 签名同步增第三参。
- [ ] `test/core/stocks.spec.ts`：`tick(force)` 命中涨（`+vol`）/ 跌（`−vol`）；**同 seed 下「用 force 命中」与「不传 force」的后续 `rng()` 序列一致**（证明不消耗随机源）；`lotShares` 三档 + `held=0`。
- [ ] 新建 `test/core/game-stock-track.spec.ts`：2× / 3× 买入的 `own` / `borrowed` 拆分与现金精确值；现金不足；非法倍数 `'bad-lot'`；
      卖出先还债（`principal` 归零 → `margin = null`、余额入现金）；未还清时 `p.cash` 不变；轮末保证金复利取整；爆仓两分支（余债转 `loan` / 有余入现金）。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/core/stocks.spec.ts test/core/game-stock-track.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/core/stocks.ts monopoly/src/core/game.ts monopoly/test/core/stocks.spec.ts monopoly/test/core/game-stock-track.spec.ts` → `-m 'M20.3-B Task2: 股票三档与保证金杠杆/爆仓核心逻辑'`。

## Task 3：core 强制方向表与两张卡（`game.ts`）

- [ ] `src/core/game.ts`：`state.stockTip: (string|null)[]` 改为 `state.stockForce: ({ code: string; dir: 1 | -1 }|null)[]`；`createGame` 初始化同步。
- [ ] `src/core/game.ts`：`c-stockTip`（内幕消息）分支改写 `state.stockForce[i] = { code, dir: 1 }`；`ChanceEffect` 的 `stockTip` 变体保持不变（回放口径不动）。
- [ ] `src/core/game.ts`：`useCard(kind, target?, stock?)` 增第三参 `stock?: { code: string; dir: 'up' | 'down' }`；
      **新增两个显式 case**（必须写在 `default` 之前，否则被 `doubleRent` 的 default 吃掉）：
      `bullBear`：`stock` 缺 → `'no-target'`；`stock.code` 不在 `STOCKS` → `'unknown-code'`（`CardFail` 增该值）；成功写 `state.stockForce[i] = { code, dir: dir === 'up' ? 1 : -1 }` + `consumeCard` + `lastEvent = { kind:'card', card:'bullBear', target:null }`。
      `dividend`：`shares = Σ portfolio[code].shares`；`gain = shares > 0 ? shares * DIVIDEND_PER_SHARE : DIVIDEND_REFUND`；`p.cash += gain` + `consumeCard` + `lastEvent`。恒成功。
      两者均**不推进回合**。
- [ ] `src/core/game.ts`：`Game` 接口 `useCard` 签名同步增第三参；`CardOutcome` 成功分支可选带 `stock`（供 UI 断言）。
- [ ] `test/core/game-stock-track.spec.ts` 追加：`bullBear` 落库三态（成功 / `no-target` / `unknown-code`）+ 强制方向在下一轮 tick 生效且方向正确；`dividend` 有持仓（13 股 → +￥260）/ 无持仓（+￥100）两分支 + `not-held`。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/core/game-stock-track.spec.ts test/core/game.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/core/game.ts monopoly/test/core/game-stock-track.spec.ts` → `-m 'M20.3-B Task3: 强制方向表与涨跌卡/红利卡落库'`。

## Task 4：版式常量与股票浮层 A（`skin/layout.ts` + `ui/panels.ts`）

- [x] `src/skin/layout.ts` 新增：`PANEL_STOCK_W/PANEL_STOCK_PANEL_H = 370/330`（新增注册项 `showcase.panelStock`，300..630，不压底坞资产条 632）、`PANEL_STOCK_ROW_Y = 336` / `PANEL_STOCK_ROW_GAP = 4`、`PANEL_CHART_*`、`PANEL_STOCK_LEV_Y`、`PANEL_STOCK_BUY_Y`、`PANEL_STOCK_SELL_Y`（由买档顶 + 档高 + 3 推导）、
      `PANEL_STOCK_TIER_S = 0.7` 与由基座常量推导的 `PANEL_STOCK_TIER_W/H`（= `ui.tradeBuy`/`ui.tradeSell` 的 box 150×38 × 0.7，渲染侧与命中侧写出同一表达式，避免浮点漂移）、`PANEL_STOCK_TIER_GAP`、`PANEL_STOCK_TIER_X0`；附中文注释说明各段垂直顺序（角标 305..331 → 标的行 ×4 336..484 → 走势图 487..541 → 杠杆 544..566 → 买档 569..595.6 → 卖档 598.6..625.2 → 面板底 630）。
- [x] `src/ui/panels.ts`：`stockRows(state, sel)` 增第二参 `sel: string`，`StockRowView` 增 `selected: boolean`。
- [x] `src/ui/panels.ts`：新增 `stockDetail(state, code)`（现价 / 涨跌 / 持股 / 市值 / 现金 / 借款）与
      `tierShares` / `stockTiers` / `leverageChips`（档位 → 股数；底层换算走 `core/stocks.ts` 的 `lotShares`，导出以便单测与 `main.ts` 共用）。
- [x] `src/ui/panels.ts`：`panelSpecs` 股票分支改为版式 A——底板换新增注册项 `showcase.panelStock`（370×330）；4 行 `ui.stockRow` 带 `selected`；
      `ui.stockChart` 跟随 `sel`；`round >= MARGIN_UNLOCK_ROUND` 时推 `ui.qk` ×3（「无 / 2× / 3×」）；买三档 / 卖三档各 3 键（`ui.tradeBuy` / `ui.tradeSell`，缩 `s=0.7`），启用判据走 `stockTiers`。
- [x] `src/ui/panels.ts`：`panelHitAreas` 股票分支暴露 4 行选中键（`stock:select`，`target = code`）+ 杠杆键（`stock:lev`）+ 6 档键，
      `data-target` 编码 `` `${code}:${tier}` ``（`tier ∈ '1' | '5' | 'all'`）；`panelHitAreas` / `panelSpecs` 签名末位增 `stock: StockUiState` 参数（带默认值，保持既有调用零改动）。
- [x] `test/ui/panels.spec.ts`：改写既有股票断言 → 断言 4 行且恰一行 `selected`、`ui.stockChart` 跟随 `sel`、`round >= 8` 才有 `ui.qk`、买三档 / 卖三档各 3 键、命中区 `code:tier` 编码与禁用态（持股 0 时卖档全禁用）；另有两个历史股票单测同步改为三档口径。
- [x] `local/mono-shots-m5.mjs`：同步股票断言（`ui.stockRow` 计数、买键改点 `data-target="SY01:1"`、`buyLabels` 三档、`sellAfter` 3、底板 `showcase.panelStock`、`stock:select` 4 键）。
- [x] 新增注册项 `showcase.panelStock`（`registry.ts` + `public/skins/default/skin.json`）与 `ui.stockRow` 选中态（`proc-panel.ts`）；`npm run lint:skin` 通过。
- [x] 跑 `npx tsc --noEmit` 与 `npx vitest run test/ui/panels.spec.ts`（31 绿）。
- [ ] 提交：`git -C d:\zhao add monopoly/src/skin/layout.ts monopoly/src/ui/panels.ts monopoly/test/ui/panels.spec.ts monopoly/local/mono-shots-m5.mjs` → `-m 'M20.3-B Task4: 股票浮层 A 版式（选中行 + 买三档/卖三档）'`。

## Task 5：涨跌卡浮层纯函数（`ui/panels.ts`）

- [x] `src/ui/panels.ts`：`OverlayKind` 增 `'bullbear'`；`overlayOf` 的 `opts` 增 `bullbearOpen?: boolean`，
      优先级链改为 `auction > settle > bank > store > stock > bullbear > draw`（把 `phase === 'settled'` 从早退改为分别守护 `stock` / `draw`，使涨跌卡随时可开、同时仍被股票盘压住）。
- [x] `src/skin/layout.ts`：新增 `PANEL_BULLBEAR_*`（方向分段 / 4 行标的 / 取消键）台位常量（角标复用 `PANEL_BADGE_Y`，底板复用 370×300 的 `showcase.panel`）。
- [x] `src/ui/panels.ts`：`panelSpecs` 增 `bullbear` 分支——`showcase.panel` + `ui.badge`「涨跌卡」+ `ui.qk` ×2（押涨 / 押跌，选中态）+ 4 行 `ui.stockRow` + 取消键（`ui.qk`「取消」）；签名末位增 `bullbear: BullbearUiState`。
- [x] `src/ui/panels.ts`：`panelHitAreas` 增 `bullbear` 分支——方向键（`bullbear:dir`，`target='up'|'down'`）+ 4 行（`bullbear:pick`，`target=code`）+ 取消（`bullbear:cancel`）。
- [x] `test/ui/panels.spec.ts` 追加：`bullbearOpen` 时 `overlayOf === 'bullbear'`；优先级低于 `stock` 高于 `draw`；命中区 `bullbear:pick` 的 `target` 为 4 个 code。
- [x] 跑 `npx tsc --noEmit` 与 `npx vitest run test/ui/panels.spec.ts`（34 绿）。
- [x] 提交：`git -C d:\zhao add monopoly/src/ui/panels.ts monopoly/src/skin/layout.ts monopoly/test/ui/panels.spec.ts` → `-m 'M20.3-B Task5: 涨跌卡浮层纯函数与命中区'`。

## Task 6：`main.ts` 接线（三档 / 杠杆 / 涨跌卡）

- [x] `src/main.ts`：新增 UI 态 `stockSel = STOCKS[0].code`、`stockLev = 1`、`bullbearOpen = false`、`bullbearDir: 'up'|'down' = 'up'`；每回合切换时重置（选股保留、杠杆回 1、面板关闭）。
- [x] `src/main.ts`：`stepOfPanel` 增 `stock:select`（切 `stockSel`）/ `stock:lev`（切 `stockLev`）只改 UI 态；
      `stock:buy` / `stock:sell` 解析 `target` 的 `` `${code}:${tier}` ``，用 `tierShares` 换算股数后 `trade(code, ±n, stockLev)`。
- [x] `src/main.ts`：`panelHitAreas(...)` 调用处传入 `stockSel` / `stockLev`；`panelSpecs(...)` 调用处同样透传。
- [x] `src/main.ts`：`card:bullBear` 分支 → `bullbearOpen = true`（**不进选目标态**，与 `teleport/barrier` 区分）；
      `bullbear:dir` → 切 `bullbearDir`；`bullbear:pick` → `useCard('bullBear', undefined, { code: String(target), dir: bullbearDir })` 成功后关面板；`bullbear:cancel` → 关面板。
- [x] `src/main.ts`：`card:dividend` 走通用兜底 `{ kind:'card', card:'dividend' }`（点即用，无浮层）。
- [x] `src/ui/Hud.ts`：手牌槽命中实际由 `ui/panels.ts` 产出 `card:${kind}`，故 `card:bullBear` 在 `panels.ts` 的 `PanelActionId` 登记、由 `stepOfPanel` 拦截，Hud 无需改动。
- [x] `src/ui/aiDriver.ts`：涨跌卡浮层展开时暂停——经 `main.ts` 注入的 `paused: () => bankOpen || storeOpen || bullbearOpen` 落实（aiDriver 无需改动）。
- [x] `npx tsc --noEmit` 通过（781 测试全绿）。
- [x] 提交：`git -C d:\zhao add monopoly/src/main.ts monopoly/src/ui/panels.ts docs/superpowers/plans/2026-10-02-monopoly-m20-3b-stock-track.md` → `-m 'M20.3-B Task6: 股票三档/杠杆/涨跌卡接线'`。

## Task 7：AI 策略（`core/ai.ts`）

- [ ] `src/core/ai.ts`：`pickStock` 保持 `trade(code, 1)`（**AI 恒不用杠杆**，避免自杀式爆仓）。
- [ ] `src/core/ai.ts`：新增「打 `dividend`」步——`Σ portfolio shares > 0` 时打出（无持仓不打，不浪费手牌）。
- [ ] `src/core/ai.ts`：新增「打 `bullBear`」步——押**自己持仓最重**的那支为「涨」（并列取表序小者）；无持仓不打。
- [ ] `test/core/ai.spec.ts`：断言 AI 有持仓时打 `dividend`、无持仓不打；有持仓时打 `bullBear` 且 `stock.code` = 最重仓、`dir === 'up'`。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/core/ai.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/core/ai.ts monopoly/test/core/ai.spec.ts` → `-m 'M20.3-B Task7: AI 决策论打出红利卡与涨跌卡'`。

## Task 8：e2e / 截图 / 手册 / 收尾闸门

- [ ] `local/mono-e2e-playthrough.mjs`：确认 8 槽手牌与 `bullbear:` / `stock:buy` 三档路径不破坏既有整局（必要时补 `stock:buy` 三档代打分支）。
- [ ] 新建 `local/mono-shots-m20-3b.mjs`（手机视口 390×844 @ dpr=2，`nofx`）：4 张截图 →
      ① 股票浮层 A 选中行 + 三档；② 杠杆档位（第 8 轮）；③ 涨跌卡浮层；④ 红利卡结算前后手牌/现金。输出到 `docs/manual/shots/`。
- [ ] `docs/manual-mono.md`：补「股票指定买卖与三档」「涨跌卡与红利卡」「杠杆与爆仓」三节 + 4 张手机截图。
- [ ] 收尾闸门：`npm run check`（lint + lint:skin + test 全绿）→ `npm run build` → `npm run deploy` → `npm run check:prod`。
- [ ] 提交：`git -C d:\zhao add monopoly/local/mono-e2e-playthrough.mjs monopoly/local/mono-shots-m20-3b.mjs monopoly/docs/manual-mono.md docs/manual/shots` → `-m 'M20.3-B Task8: 股票轨取证截图、操作手册与收尾闸门'`。
- [ ] `git -C d:\zhao push`。
