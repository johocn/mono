# M20.4 · 公共设施入股 + 每轮新闻（经济闭环第 4 轨道）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付客户「不买地也要有收益来源」的诉求：① **5 处公共设施可入股**（银行 ￥200 / 交易所 ￥180 / 医院 ￥150 / 乐透 ￥120 / 福利 ￥100，
每处 20 股、先到先得），每轮末按 `(基础分红 5% + 该设施本轮现金流 × 持股比例) × 新闻系数` 分红；
② **每轮 1 条新闻**，驱动设施分红系数（利好 ×1.5 / 利空 ×0.5）与股价（下轮必涨 / 必跌）。

**Architecture:** 沿用四级可回退体系（L1 元素覆盖 → L2 皮肤包 skin.json → L3 默认皮肤 → L4 内建 `fb({...})`）与「数据 / core 纯函数 / render / ui」四层分离。
本轨**只新增 1 个皮肤元素** `ui.newsTicker`；设施浮层 **100% 复用银行版式 C 的台位与元素**（`ui.bankRow` / `ui.button.*` / `ui.qk` / `showcase.panel` / `ui.badge`），**零新增 layout 台位常量**。
新闻的股价影响**复用 M20.3-B 的 `StockForce` 通道**（命中不消耗 `rng`）；新闻抽取走**新增独立流** `makeRng(seed ^ 0x2468ace)`，不动既有 `cardRng` / `marketRng`。

**Tech Stack:** PixiJS 8 · TypeScript 5 · Vite 6 · Vitest 2 · Playwright · ESLint 9 + 本地 `tools/eslint-plugin-mono` · GSAP。

## 规格来源与硬约束

- **上位设计（唯一真源）**：`docs/superpowers/specs/2026-10-02-monopoly-m20-4-facility-and-news-design.md`（§3 的 F-D1–F-D15 已定稿，本计划不得偏离）。
- **上位路线图**：`docs/superpowers/specs/2026-10-01-monopoly-interaction-roadmap-design.md`（§4.3 / D25–D29）。
- **格式参考**：`docs/superpowers/plans/2026-10-02-monopoly-m20-3b-stock-track.md`。
- **全程中文**：本计划、提交信息、代码注释一律中文。
- **口径定稿（spec §3，不得再询问用户）**：
  F-D1 设施按 **id** 建模（福利中心 7+27 算一处）；F-D2 20 股 / 五档认购价 / 基础 5%；F-D3 分红公式（见 subtle 展开）；
  F-D4 现金流挂载点（银行=轮末贷款利息 / 乐透=入场费 / 交易所=0 / 医院=0 / 福利=0，**四项均零余额回归**）；
  F-D6 **裁剪**板块租金 ×1.25；F-D7 新闻独立 rng 流 `seed ^ 0x2468ace`；F-D9 轮末 7 步顺序；F-D11 新闻条落 474..500；
  F-D12 设施浮层复用银行 C 版式；F-D13 认购 1 股 / 5 股；F-D14 **不做**设施股退出；F-D15 HUD 快键行 4 槽 → **5 槽**。
- **确定性**：任何随机必须走 `makeRng(seed)`，禁止 `Math.random`（`test/smoke.spec.ts` 有源码闸门）。
- **零余额回归**：设施未售出时，整条分红链恒为 0，`p.cash` 逐值不变；四处现金流挂载点均不改任何玩家现金净额。
- **四级可回退体系**：裸色值 / 裸视觉常数只允许出现在 L4 内建兜底 `fb({...})`；`src/render` 内不得出现裸值（`tools/check-hardcoded.mjs` 闸门）。
- **机器闸门**：`tools/check-hardcoded.mjs`（作用域 `src/render`，`npm run build` 前置）；`tools/lint-skin.mjs`。禁 `eslint-disable`。
- **17 个商家格一个不动**；不改 `TILE_TYPES` / `ringPath`。
- **HUD 硬约束**：快键行 y 607..629 画在浮层之上且照常可点 ⇒ 浮层内可点元素必须全部收在 606 之上。
- **环境**：`npm` / `npx` / `node` 的 cwd = `d:\zhao\monopoly`；`git` 的 cwd = `d:\zhao`。
- **命令约定**：PowerShell 不支持 heredoc，提交信息用单引号 `-m '...'`；多命令用 `;` 串联。
- **只 add 指定文件**：`git -C d:\zhao add <指定文件>`，禁用 `git add .` / `git add -A`。
- **交付 = 实现 + 单测/闸门 + 手机视口截图（390×844 @ dpr=2）+ 操作手册条目**。
- **收尾「一气呵成」**：`npm run check` → `npm run build` → `npm run deploy` → `npm run check:prod` → 提交 → `git -C d:\zhao push`。

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `monopoly/src/data/facilities.ts` | Create | `FacilityId` / `FacilityDef` / `FACILITIES`(5 处) / `FACILITY_SHARES` / `FACILITY_DIV_RATE` / `facilityOf` / `facilityAtTile` |
| `monopoly/src/data/news.ts` | Create | `Sentiment` / `NewsScope` / `NewsItem` / `NEWS_COEF` / `NEWS_TABLE`(10 条) |
| `monopoly/src/core/facility.ts` | Create | `newsCoefOf` / `newsForceOf` / `soldSharesOf` / `canSubscribe` / `dividendOf` / `FacilityFail` |
| `monopoly/src/core/game.ts` | Modify | `Player.facilities`；`GameState.news` / `facilityCashflow`；`buyFacility`；`settleBooks` / `resolveLottery` / `trade` 三处现金流累计；`onRoundBoundary` 扩为 7 步（`payFacilityDividends` / `rollNews`）；`EventLog` 增 `facility` 变体 |
| `monopoly/src/core/ai.ts` | Modify | `AiStep` 增 `facility`；`pickFacility`；`settledPlan` 插入第 ④ 步 |
| `monopoly/src/skin/layout.ts` | Modify | 快键行重排（`HUD_QK_FACILITY_X` 新增 + 既有四枚 x 平移）；`NEWS_TICKER_X/Y/W/H` |
| `monopoly/src/skin/registry.ts` | Modify | 注册 `ui.newsTicker`（L4 内建 `fb({...})`） |
| `monopoly/public/skins/default/skin.json` | Modify | `ui.newsTicker` 的 box / proc / 状态样式 |
| `monopoly/tools/registry-ids.json` | Modify | 元素 id 计数（`lint:skin` 依赖） |
| `monopoly/src/ui/panels.ts` | Modify | `OverlayKind` 增 `'facility'`；`FacilityUiState` / `facilityRows` / `facilityDetail`；`panelSpecs` / `panelHitAreas` 增 facility 分支；`newsTickerSpecOf` |
| `monopoly/src/ui/Hud.ts` | Modify | `HudActionId` 增 `'facility'`；`HudUiOpts.facilityOpen`；`pushFacilityKey`；`hitAreas` 增 facility |
| `monopoly/src/main.ts` | Modify | UI 态 `facilityOpen` / `facilitySel`；`stepOfPanel` 处理 `facility:*`；`overlays()` 透传；`paused` 纳入 facilityOpen；渲染合并新闻条 |
| `monopoly/test/data/facilities.spec.ts` | Create | 5 处设施逐值 + `facilityAtTile` 边界 + 新闻表自洽 |
| `monopoly/test/core/facility.spec.ts` | Create | 五个纯函数逐值与四分支 |
| `monopoly/test/core/game-facility.spec.ts` | Create | `buyFacility` / 现金流累计 / 轮末分红 / 新闻轮换 / 零余额回归闸门 |
| `monopoly/test/ui/panels-facility.spec.ts` | Create | facility 浮层优先级 / 5 行 / 两枚键 / 命中区 / 台位越界 |
| `monopoly/test/ui/hud.spec.ts` | Modify | `ui.qk` 五枚 + x 逐值 + 相对顺序 + `facility` 命中区 |
| `monopoly/test/core/ai.spec.ts` | Modify | `pickFacility` 三分支 + `applyStep` 透传 |
| `monopoly/local/mono-shots-m20-4.mjs` | Create | 手机视口截图取证（4 张） |
| `monopoly/local/mono-e2e-playthrough.mjs` | Modify | 新增 `facility:buy1` 点击路径 |
| `monopoly/docs/manual-mono.md` | Modify | 「M20.4」专节 + 4 张手机截图 |
| `monopoly/docs/verify/mono-m20-4-*.png` | Create | 截图归档 |

---

## Task 1：数据层与设施纯函数（`data/facilities.ts` + `data/news.ts` + `core/facility.ts`）

- [ ] 新建 `src/data/facilities.ts`：按 spec §4.1 落 `FacilityId` / `FacilityDef` / `FACILITIES`（银行 200 / 交易所 180 / 医院 150 / 乐透 120 / 福利 100，各 20 股、rate 0.05，
      `tiles` 逐项 `[9]` / `[19]` / `[25]` / `[21]` / `[7, 27]`）/ `FACILITY_SHARES = 20` / `FACILITY_DIV_RATE = 0.05` /
      `facilityOf(id)` / `facilityAtTile(index)`（两格归一处；非设施格 → null）。逐项带中文口径注释（引 D25 / D26）。
- [ ] 新建 `src/data/news.ts`：按 spec §4.2 落 `Sentiment` / `NewsScope` / `NewsItem` / `NEWS_COEF = { good: 1.5, bad: 0.5 }` /
      `NEWS_TABLE`（10 条：设施 6 + 个股 4，id / title 照 spec 表逐字）。
- [ ] 新建 `src/core/facility.ts`（与 `core/bank.ts` 同规：只依赖 `data/*` 与 `core/stocks.ts` 的类型）：
      `newsCoefOf(news, id)`（设施新闻且命中 → 利好 1.5 / 利空 0.5，否则 1）/ `newsForceOf(news)`（仅 `scope === 'stock'` → `{ code: target, dir: sentiment === 'good' ? 1 : -1 }`，否则 null）/
      `soldSharesOf(players, id)`（Σ 各玩家持股）/ `canSubscribe(players, id, shares, cash)`（四分支）/ `dividendOf(def, shares, cashflow, coef)`（F-D3 公式，`Math.round`）。
- [ ] 新建 `test/data/facilities.spec.ts`：5 处 id / name / tiles / price / shares / rate 逐值；`FACILITY_SHARES === 20`；
      `facilityAtTile(7) === facilityAtTile(27) === 'welfare'`；`facilityAtTile(12 / 23 / 0) === null`；`facilityOf` 越界防御；
      `NEWS_TABLE` 每条 id 唯一、`scope === 'stock'` 时 target 在 `STOCKS` 内、`scope === 'facility'` 时 target 在 `FACILITIES` 内。
- [ ] 新建 `test/core/facility.spec.ts`：`newsCoefOf` 四态（利好命中 / 利空命中 / 设施不相关 / null → 1）；
      `newsForceOf` 两态（stock 利好 → dir 1、stock 利空 → dir -1、facility → null、null → null）；
      `soldSharesOf` 聚合（0 股 / 多玩家 / 缺键）；`canSubscribe` 四分支（`bad-shares` / `sold-out` / `not-enough-cash` / ok 且 `cost` 正确）；
      `dividendOf` 逐值（如 `bank` 10 股 cf=200 coef=1.5 → `round((10×200×0.05 + 200×10/20) × 1.5)` = `round((100 + 100) × 1.5)` = 300）。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/data/facilities.spec.ts test/core/facility.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/data/facilities.ts monopoly/src/data/news.ts monopoly/src/core/facility.ts monopoly/test/data/facilities.spec.ts monopoly/test/core/facility.spec.ts` → `-m 'M20.4 Task1: 设施与新闻数据层、分红/系数纯函数'`。

## Task 2：core 认购与轮末分红 / 新闻（`core/game.ts`）

- [ ] `src/core/game.ts`：`Player` 增 `facilities: Partial<Record<FacilityId, number>>`；`GameState` 增 `news: NewsItem | null` 与 `facilityCashflow: Record<FacilityId, number>`；
      `createGame` 初始化为 `{}` / `rollNews(newsRng)`（发布第 1 轮）/ 全零；新增 `const newsRng = makeRng((seed ^ 0x2468ace) >>> 0)`。
- [ ] `src/core/game.ts`：新增 `rollNews(rng)` = `NEWS_TABLE[Math.floor(rng() * NEWS_TABLE.length)]` 与 `payFacilityDividends()`（spec §5.4 逐字）。
- [ ] `src/core/game.ts`：新增 `buyFacility(facility, shares): FacilityOutcome`（spec §5.3：`bad-shares` / `sold-out` / `not-enough-cash` / ok；
      成功写 `p.cash` / `p.facilities` / `lastEvent = { kind:'facility', facility, shares, cost }`）。`Game` 接口同步。
- [ ] `src/core/game.ts`：`EventLog` 增 `| { kind: 'facility'; facility: FacilityId; shares: number; cost: number }`。
- [ ] `src/core/game.ts`：三处现金流累计（F-D4）——
      ① `settleBooks()` 内：对每位未破产玩家的 `p.loan`（非首轮免息支路）与每笔 `p.mortgages` 累加 `interestOf(book)` 到 `state.facilityCashflow.bank`（**不动任何现金**）；
      ② `resolveLottery()`：`p.cash -= stake` 之后累加 `stake` 到 `state.facilityCashflow.lottery`；
      ③ `trade()`：买卖成功分支累加 `Math.round(cost * STOCK_FEE_RATIO)`（现恒 0，留口子）。
- [ ] `src/core/game.ts`：`onRoundBoundary` 扩为 **7 步**（spec §5.4 代码块逐字）：settleBooks → 保证金复利 → `force` = 玩家 force + `newsForceOf(state.news)` → `market.tick(force)` → 爆仓判定 → `payFacilityDividends()` → `state.news = rollNews(newsRng)` → 清空 `stockForce`。
- [ ] 新建 `test/core/game-facility.spec.ts`：
      ① `buyFacility` 四分支 + 落库（现金 / 持股 / `lastEvent`）+ 售罄（20 股上限，含「跨玩家先到先得」）；
      ② 分红两分支（有持股 → 现金精确增；无持股 → 现金逐值不变）；
      ③ 利好设施分红 = 基础 × 1.5、利空 = × 0.5（用注入的 decks / 直接改 `state.news` 构造）；
      ④ 银行利息计入 `facilityCashflow.bank` 且按持股比例分成（构造一笔 `p.loan` 后过轮末）；
      ⑤ 乐透入场费计入 `facilityCashflow.lottery` 且**玩家现金净额与 M20.3-B 语义一致**；
      ⑥ 新闻每轮末换 1 条、**同 seed 同序列**（两次 `createGame(seed)` 逐轮比对 `state.news.id`）；
      ⑦ **零余额回归闸门**：全设施未售出的对局，断言现金序列与 M20.3-B 基线一致（只允许 tick 受 `newsForceOf` 影响，可用该函数复算）。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/core/game-facility.spec.ts test/core/game.spec.ts test/core/game-stock-track.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/core/game.ts monopoly/test/core/game-facility.spec.ts` → `-m 'M20.4 Task2: 设施认购、现金流累计与轮末分红/新闻'`。

## Task 3：AI 认购策略（`core/ai.ts`）

- [ ] `src/core/ai.ts`：`AiStep` 增 `{ kind: 'facility'; facility: FacilityId; shares: number }`；`applyStep` → `case 'facility': return g.buyFacility(step.facility, step.shares)`。
- [ ] `src/core/ai.ts`：新增 `FACILITY_RESERVE = 500` 与 `pickFacility(state, P)`（spec §7：现金 < 500 不认购；按 `FACILITIES` 表序取第一处「未售罄 且 现金 ≥ price×2」的设施认购 1 股；已满仓 / 无合适 → null）。
- [ ] `src/core/ai.ts`：`settledPlan` 插入第 ④ 步（买地 → 升级 → 股票 → **设施** → 银行 → 商店 → 投机 → 卡片）。
- [ ] `test/core/ai.spec.ts`：新增 `describe('ai 设施认购策略（M20.4 spec §7）')`：现金 < ￥500 不认购；按表序选第一处可买设施；已满仓跳过；`applyStep` 透传入账。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/core/ai.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/core/ai.ts monopoly/test/core/ai.spec.ts` → `-m 'M20.4 Task3: AI 按表序认购设施股'`。

## Task 4：HUD 第 5 枚快键 + 设施浮层 + 新闻条（`skin/layout.ts` + `registry.ts` + `skin.json` + `ui/panels.ts` + `ui/Hud.ts`）

- [ ] `src/skin/layout.ts`：快键行重排（spec §6.3）：新增 `HUD_QK_FACILITY_X = 7`，`HUD_QK_STORE_X = 83`、`HUD_QK_BANK_X = 159`、`HUD_QK_FAST_X = 235`、`HUD_QK_SKIP_X = 311`；
      附中文注释说明步距 76 与「既有四枚相对顺序不变，只整体平移」。新增 `NEWS_TICKER_X = 10` / `NEWS_TICKER_Y = 474` / `NEWS_TICKER_W = 370` / `NEWS_TICKER_H = 26`（附「自由带 406..508 在 play 模式为空」的注释）。
- [ ] `src/skin/registry.ts` + `public/skins/default/skin.json` + `tools/registry-ids.json`：注册 `ui.newsTicker`（370×26，L4 内建兜底 `fb({...})`；利好 / 利空两态语义色）。
- [ ] `src/ui/panels.ts`：`OverlayKind` 增 `'facility'`；`overlayOf` 的 `opts` 增 `facilityOpen?: boolean`，优先级链 `auction > settle > bank > store > facility > stock > bullbear > draw`。
- [ ] `src/ui/panels.ts`：新增 `FacilityUiState` / `FACILITY_UI_DEFAULTS` / `facilityRows(state, sel)`（5 行、含 `selected` 与 summary）
      / `facilityDetail(state, sel)`（5 行 detail + 两枚键 label / enabled）；`panelSpecs` / `panelHitAreas` 签名末位增 `facility: FacilityUiState`（带默认值，既有调用零改动）。
- [ ] `src/ui/panels.ts`：`panelSpecs` 增 facility 分支（spec §6.1 台位表：`showcase.panel` + `ui.badge`「公共设施 · 入股」+ 5 行 `ui.bankRow` row + 5 行 line + 两枚 `ui.button.*` + `ui.qk`「关闭」）；
      `panelHitAreas` 增 facility 分支（`facility:select` / `facility:buy1` / `facility:buy5` / `facility:close`）。
- [ ] `src/ui/panels.ts`：新增 `newsTickerSpecOf(state)`（spec §6.2：`state.news === null` → null，否则 `ui.newsTicker` 的 id / 台位 / state）。
- [ ] `src/ui/Hud.ts`：`HudActionId` 增 `'facility'`；`HudUiOpts` 增 `facilityOpen?: boolean`；新增 `pushFacilityKey()`（r = 17，标签「设施 / 设施 ✓」），
      原本 r=17/18 的静音键与后续 r 顺延 +1（r 只需单调递增）；`hitAreas` 增 `{ action: 'facility', x: HUD_QK_FACILITY_X, ... }`（仅真人回合，常开）。
- [ ] 新建 `test/ui/panels-facility.spec.ts`：`overlayOf` 三态（`facilityOpen` → `'facility'`；优先级低于 `store`、高于 `stock`）；
      浮层 5 行且恰一行 `selected`；两枚键 label 含认购价、启用判据（现金不足 / 售罄 → 禁用）；命中区四类动作 + **行底 576 ≤ 600、键底 556 ≤ 600、所有可点元素底 ≤ 606**；`newsTickerSpecOf` 两态与台位。
- [ ] `test/ui/hud.spec.ts`：把「**四枚** `ui.qk`」计数断言改为 **五枚**，并补 `cx` 逐值（含 `HUD_QK_FACILITY_X`）；
      保留既有相对顺序断言（随常量自动通过）；补 `hitAreas` 含 `facility`。
- [ ] 相关既有截图脚本 `local/mono-shots-m5.mjs`（若断言快键行坐标 / 元素计数）同步修正为 5 槽口径。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run test/ui/panels-facility.spec.ts test/ui/panels.spec.ts test/ui/panels-store.spec.ts test/ui/hud.spec.ts`。
- [ ] 提交：`git -C d:\zhao add monopoly/src/skin/layout.ts monopoly/src/skin/registry.ts monopoly/public/skins/default/skin.json monopoly/tools/registry-ids.json monopoly/src/ui/panels.ts monopoly/src/ui/Hud.ts monopoly/test/ui/panels-facility.spec.ts monopoly/test/ui/hud.spec.ts monopoly/local/mono-shots-m5.mjs` → `-m 'M20.4 Task4: 第5枚HUD快键、设施浮层与新闻条元素'`。

## Task 5：`main.ts` 接线与 e2e

- [ ] `src/main.ts`：新增 UI 态 `facilityOpen = false` / `facilitySel: FacilityId = 'bank'`；每回合切换时关闭浮层（选中保留）。
- [ ] `src/main.ts`：`overlays()` 增 `facilityOpen`（透传 `panelSpecs` / `panelHitAreas`）；`paused` 纳入 `facilityOpen`（AI 驱动器在浮层展开时暂停）。
- [ ] `src/main.ts`：`stepOfPanel` 增 `facility:select`（切 `facilitySel`，只改 UI 态）/ `facility:buy1` / `facility:buy5`（`buyFacility(facilitySel, 1|5)`）/ `facility:close`（关浮层）；
      HUD 命中层 `facility` 动作 → 切 `facilityOpen`（与 `bank` / `store` 同构，三者互斥：开一个先把另两个关掉）。
- [ ] `src/main.ts`：渲染合并处推入 `newsTickerSpecOf(state)`（`hudSpecs` 之后、`panelSpecs` 之前 —— 保证浮层自然盖住新闻条）。
- [ ] `local/mono-e2e-playthrough.mjs`：新增 `facility:buy1` 点击路径（在 `overlay` 分支里加 `facility` → 点 `facility:buy1`），tally 记录动作名。
- [ ] `local/mono-prod-check.mjs`：复核 V11 等 gate（V11 按**标签**判断 ⇒ 快键行平移不受影响）；按需补「设施浮层 / 新闻条」gate。
- [ ] 跑 `npx tsc --noEmit` 与 `npx vitest run`（全量），再跑 `node local/mono-e2e-playthrough.mjs`（整局 PASS）。
- [ ] 提交：`git -C d:\zhao add monopoly/src/main.ts monopoly/local/mono-e2e-playthrough.mjs monopoly/local/mono-prod-check.mjs` → `-m 'M20.4 Task5: main 接线设施浮层/新闻条与 e2e 路径'`。

## Task 6：手机截图取证与操作手册

- [ ] 新建 `local/mono-shots-m20-4.mjs`（手机视口 390×844 @ dpr=2，`nofx`，机器闸门逐项布尔）：4 张截图 →
      ① 设施浮层（选中行 + 两枚认购键）；② 认购后详情（已售 / 持股 / 预估分红）；③ 新闻条（利好 / 利空各一张）；④ 轮末分红后现金变化。
      输出到 `docs/verify/`（命名 `mono-m20-4-01-facility.png` … `-04-dividend.png`，与既有 `mono-*.png` 同口径）。
- [ ] **目视复核每张 PNG**（硬约束）：确认①浮层内两枚认购键与「关闭」键均**点得中**（不被 HUD 快键行 607..629 压住）；
      ②新闻条不与棋盘底角 / 战报条（342..406）重叠；③第 5 枚快键「设施」不压状态行文字到不可读。发现问题即修复并补单测。
- [ ] `docs/manual-mono.md`：追加「M20.4 公共设施入股与每轮新闻」专节 —— 两需求的落点表 / 分红公式与四个现金流挂载点（含「本轮现金流分成体感偏弱」的明示）/
      新闻三影响面与**裁剪板块租金的说明** / 设施浮层与新闻条版式 / 第 5 枚快键 / AI 策略 / 确定性（独立 rng 流）/ 四级回退 / 回归口径命令 / 4 张截图清单 / 取证脚本闸门清单。
- [ ] 跑 `npx vitest run`（全量）与 `npm run lint:skin`。
- [ ] 提交：`git -C d:\zhao add monopoly/local/mono-shots-m20-4.mjs monopoly/docs/manual-mono.md monopoly/docs/verify` → `-m 'M20.4 Task6: 设施与新闻取证截图、操作手册'`。

## Task 7：收尾闸门（一气呵成）

- [ ] `npm run check`（lint + lint:skin + test，全绿）。
- [ ] `npm run build`（`check-hardcoded` clean）。
- [ ] `npm run deploy`（本地构建产物 → 服务器解压 / `pm2 restart`）。
- [ ] `npm run check:prod`（线上约 20 项 gate 全通过）。
- [ ] 提交本计划的勾选状态：`git -C d:\zhao add docs/superpowers/plans/2026-10-02-monopoly-m20-4-facility-and-news.md docs/superpowers/specs/2026-10-02-monopoly-m20-4-facility-and-news-design.md` → `-m 'M20.4: 设计真源与实施计划回填'`。
- [ ] `git -C d:\zhao push`。