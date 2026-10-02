# M20.5 实施计划 · 经济平衡与风险

> 设计真源：[spec](../specs/2026-10-02-monopoly-m20-5-economy-balance-design.md)（D38–D48）
> 仓库：`d:\zhao\monopoly`（npm/npx 的 cwd）；git 仓库根 `d:\zhao`
> 收尾：一气呵成 `check → build → deploy → check:prod → 提交 → push`

## 任务分解（TDD：先写失败用例 → 实现 → 跑绿）

### T1 数据层（无依赖，可先行）
- `src/data/economy.ts`：追加 M20.5 常量（`ECON_INDEX_* / ECON_VOL / ECON_BIAS_* / AUDIT_* / SUBSIDY_AMOUNT / BOOM_DELTA`）。
- `src/data/news.ts`：`NewsScope` 增 `'economy'`；追加 `n-econ-boom` / `n-econ-bust`；导出 `NEWS_COOLDOWN` / `NEWS_STREAK_MAX`；`newsTargetsValid()` 放行 `economy`。
- `src/data/cards.ts`：`ItemCardKind` 追加 `taxShield / subsidy / boom`；`ITEM_CARDS` 表尾追加 3 项（priority 15 / 25 / 55）。
- `src/data/item-shop.ts`：`STORE_CATALOG` 追加 `taxShield 350 / subsidy 400 / boom 500`（顺序恒等 priority 升序）。
- 测试：`test/data/news.spec.ts`（若不存在则并入既有 data 用例）/ `test/data/cards-data.spec.ts` / `test/data/item-shop.spec.ts` 追加断言。

### T2 core 纯函数（依赖 T1）
- 新建 `src/core/cycle.ts`：`clampIndex` / `econBiasOf` / `nextEconomyIndex` / `auditChanceOf` / `auditTaxOf`。
- 新建 `src/core/news.ts`：`rollNews(rng, history)` / `sentimentStreak(history, table)`。
- 测试：`test/core/cycle.spec.ts` / `test/core/news.spec.ts`（含公平性：冷却 4 不重复、同向 3 条后必反向、同 seed 逐值可复现）。

### T3 core 引擎（依赖 T2）
`src/core/game.ts`：
- `Player` 增 `roundRent`；`GameState` 增 `economyIndex` / `newsHistory`。
- 新增独立流 `econRng = makeRng(seed ^ 0x0ece11)` / `auditRng = makeRng(seed ^ 0x0a0d17)`（常量集中定义，勿散落）。
- `settleCurrent`：`base = round(rentAt × economyIndex)`；收款方 `roundRent += paid`。
- `bankDebtView` 的债务并入 margin（在 UI 层算，见 T4）。
- 新增 `addMargin(amount?, source?)`（D41）+ `MarginOutcome` / `MarginSource`。
- `onRoundBoundary` 扩为 9 步（插 `settleAudits` 与景气游走）。
- `useCard`：`subsidy` / `boom` 生效；`taxShield` 返回不可主动使用。
- `EventLog` 增 `audit` / `marginAdd` / `economy` 变体；`GameAPI` 导出 `addMargin`。
- 测试：`test/core/game-economy.spec.ts`（景气夹逼 / 租金口径 / index=1 回旧值）、`test/core/game-margin.spec.ts`（补仓记账 / 抵押补仓 / 归零）、`test/core/game-audit.spec.ts`（概率 0 短路 / 避税消耗 / 走 settleDebt）。

### T4 UI / 渲染（依赖 T3）
- `src/skin/layout.ts`：新增金额键盘 / 示数条 / 保证金页 / 商店 tall 版式常量（几何与命中同源）。
- `src/skin/registry.ts` + `public/skins/default/skin.json` + `tools/registry-ids.json`：登记 `ui.amount` / `ui.key`。
- `src/render/providers/proc-panel.ts`（或 proc-hud）：绘制 `ui.amount` / `ui.key`（L4 内建兜底，裸值只在此）。
- `src/ui/panels.ts`：银行左列 4 行；存款页键盘 + 双确认键；保证金页；商店 tall；股票角标警示；`newsTickerSpecOf` 加景气前缀；新增动作位 `bank:digit|bank:clear|bank:back|bank:quick|bank:marginCash|bank:marginMortgage`。
- `src/ui/Hud.ts`：债务条债务段并入 margin。
- 测试：`test/ui/panels-bank.spec.ts` / `test/ui/panels-store.spec.ts` / `test/ui/panels.spec.ts` 追加（命中区 y < 606 闸门）。

### T5 接线与 AI（依赖 T4）
- `src/main.ts`：键盘 UI 态（`amountInput`）+ 动作分发 + `addMargin` 调用；移除「一键全存 / 全取」旧路径。
- `src/core/ai.ts`：存款改金额分档；保证金补仓分支；新道具出牌策略。
- `test/ui/ai-driver.spec.ts` / e2e 脚本 `local/mono-e2e-m205.mjs`。

### T6 取证与手册
- `local/mono-shots-m205.mjs`：390×844 @dpr2 截图（存款键盘 / 保证金页 / 商店 11 项 / 新闻景气），`errors: []`。
- `monopoly/docs/manual-mono.md` 追加 M20.5 专节并引用截图。

### T7 收尾
`npm run check`（lint + lint:skin + vitest）→ `npm run build`（含 check-hardcoded）→ `npm run deploy` → `npm run check:prod` → 提交（分主题多次）→ push。

## 不变量（每步都要守）
- 禁 `Math.random`（`test/smoke.spec.ts` 源码闸门）。
- `src/render` 内禁裸值（`tools/check-hardcoded.mjs`）；几何常量落 `layout.ts`。
- 新元素三处登记齐全。
- 浮层内可点元素一律 `y < 606`（HUD 快键行 607..629 在浮层之上）。
- `BUBBLE_DEPTH` 复算：本轮**不新增 HUD 带 `r` 的元素**（只有债务条文案变化），理论上无需改；T4 完成后跑 `test/render/bubble.spec.ts` 确认。
- 确定性：新增字段默认值不得改变既有单例断言（`economyIndex = 1.0`、`roundRent = 0`）。
