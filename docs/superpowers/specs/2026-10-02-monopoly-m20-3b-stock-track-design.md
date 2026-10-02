# M20.3-B · 股票轨（浮层 A 版式 · 涨跌卡 · 红利卡 · 杠杆与爆仓）设计

> 上位真源：[2026-10-01-monopoly-interaction-roadmap-design.md](./2026-10-01-monopoly-interaction-roadmap-design.md)（§4.3 / D5–D9 / D30–D31）
> 前序：[M20.3-A 手牌版式与道具商店](./2026-10-02-monopoly-m20-3-hand-and-item-shop-design.md)（本轨的干净底子）
> 本轮定位：M20.3「股票（含杠杆）与卡片」的**主批**。M20.3-A 已把手牌行改成「由 `ITEM_CARDS.length` 驱动的可横滑单行」、
> 商店目录由 `ITEM_CARDS` 派生，故本轨往表里追加两种卡后，手牌自动变 8 槽、商店自动变 8 行，**零版式返工**。

## 1. 背景与目标

客户原话：「股票不能指定买那只，也不能选择性卖出」（抱怨缺功能）+ 需要涨跌卡 / 红利卡 + 第 8 轮后股票开杠杆。

三条硬需求：

1. **可指定标的与数量**：逐行选中某支股票 → 选数量档（1 手 / 5 手 / 全仓）→ 买入或卖出，支持只卖其中一支。
2. **两张股票卡**：涨跌卡（指定一支、带方向、下轮必涨/必跌）、红利卡（按持仓领分红）。
3. **杠杆与爆仓**：第 8 轮起 2× / 3×，保证金借款 6%/轮；持仓市值跌破借款额 120% → 强平，余债转信用贷款。

## 2. 范围

**本轮交付**：① 股票浮层 A 版式（逐行选中 + 买三档 / 卖三档）；② 涨跌卡 `bullBear`（第 7 种道具）；
③ 红利卡 `dividend`（第 8 种道具）；④ 保证金杠杆 2×/3× + 轮末计息 + 爆仓强平；⑤ AI 打新卡与三档交易；
⑥ 单测 / e2e / 手机截图 / 手册。

**本轮不做**：设施入股与每轮新闻（M20.4）；对既有持仓追加/释放杠杆；杠杆独立于股票账户的保证金专户；分时行情。

## 3. 口径决策（本轮定稿，实现以本节为准）

| # | 决策点 | 定稿 | 理由 |
| --- | --- | --- | --- |
| **B-D1** | 底部数量档形态 | **A2 · 买三档 + 卖三档**（6 键，一次点击成交） | 与「一触即用」的既有手感一致；行高与 A1 相同，面板总高不变；`持有 0 股则卖档禁用` 兜住误点 |
| **B-D2** | 涨跌卡成交方式 | **选方向 + 点股票行即成交**（方向默认「押涨」） | 1–2 次点击；与 D7「一张卡带方向」一致 |
| **B-D3** | 爆仓清偿范围 | **只用股票账户清偿**（照 D31 原文） | 卖出全部持仓 → 先还借入 → 不足转信用贷款；不动现金/存款，规则可预期 |
| **B-D4** | 杠杆适用范围 | **只在新买入时可选** | 状态机只覆盖「买入路径」；不允许事后追加杠杆 |
| **B-D5** | 保证金抵押物范围 | **整个股票账户**（不绑定个股） | 爆仓判据 = `marketValue(portfolio) < principal × 1.2`；卖出任意股票所得**先还借入、余额入现金** |
| **B-D6** | 数量档定义 | 1 手 = `SHARE_LOT` 股；5 手 = 5 股；全仓 = 按可用资金/持股数算满 | 纯函数推导，无随机源 |
| **B-D7** | 红利卡数值 | 每股 ￥20；无持仓折现 ￥100（D8） | 与商店「买入价 × 50% 回收」量级自洽 |
| **B-D8** | 杠杆档位与利率 | 2× / 3× 两档；借入 6%/轮复利（D30） | 沿用信用贷款利率 |
| **B-D9** | 解锁时点 | `round >= 8` 才显示杠杆分段；之前整行不出 | 承接客户「8 轮后」口径 |

> B-D5 的取舍：把保证金与个股解耦后，「卖出 → 自动还债」是一条无分支的确定性规则，且天然覆盖「爆仓 = 卖光持仓还债」，
> 不需要为「哪几股是借来的」再维护一套分摊账。代价是玩家无法在负债期间只卖普通股份，属于可接受的简化。

## 4. 数据层

### 4.1 `src/data/cards.ts`

```ts
export type ItemCardKind =
  | 'bomb' | 'barrier' | 'pardon' | 'teleport' | 'doubleRent' | 'demolish'
  | 'bullBear' | 'dividend';                     // M20.3-B 新增两种

export type ItemTarget = 'none' | 'tile' | 'foe' | 'self' | 'stock';   // 增 'stock'
```

`ITEM_CARDS` 追加（保持数组序 = priority 升序，第三键兜底不变）：

| kind | 名称 | target | priority | desc |
| --- | --- | --- | --- | --- |
| `bullBear` | 涨跌卡 | `stock` | 70 | 指定一支股票，下轮必涨或必跌 |
| `dividend` | 红利卡 | `none` | 80 | 按持仓每股领 ￥20；无持仓折现 ￥100 |

`HAND_SIZE === ITEM_CARDS.length === 8`（已是派生值，无需改动）。

### 4.2 `src/data/stocks.ts`

```ts
export const LOT_TIERS = [1, 5] as const;      // 前两档；第三档为「全仓」（'all'）
export type LotTier = number | 'all';
export const LEVERAGES = [2, 3] as const;      // 仅在 round >= MARGIN_UNLOCK_ROUND 时可选
export const MARGIN_UNLOCK_ROUND = 8;
export const MARGIN_RATE = 0.06;               // 借入复利，与信用贷款同率
export const LIQUIDATION_RATIO = 1.2;          // 爆仓线 = 借入 × 1.2
export const DIVIDEND_PER_SHARE = 20;
export const DIVIDEND_REFUND = 100;            // 无持仓折现
```

## 5. core

### 5.1 股票账户保证金（`Player` 增字段）

```ts
/** M20.3-B 保证金借款（null = 无负债）。抵押物 = 该玩家整个股票账户（B-D5） */
export interface MarginBook {
  /** 借入本金（轮末按 MARGIN_RATE 复利） */
  principal: number;
  rate: number;
}
```

`Player` 增 `margin: MarginBook | null`；`createGame` 初始化为 `null`。

### 5.2 交易 API 扩张

```ts
trade(code: string, shares: number, leverage?: number): TradeOutcome   // leverage 缺省 1
```

- 前置不变：`p.pos !== STOCK_TILE_INDEX → 'not-at-market'`；`shares === 0 → 'bad-lot'`。
- **买入**（`shares > 0`）：
  - `leverage <= 1`：走既有 `buyShares`（**逐字节零回归**）。
  - `leverage > 1`：`cost = price × shares`；`own = Math.ceil(cost / leverage)`；`borrowed = cost − own`；
    `cash < own → 'not-enough-cash'`；成功则 `p.cash -= own`、`portfolio` 增股、`margin.principal += borrowed`
    （`margin` 为 null 时新建 `{ principal: borrowed, rate: MARGIN_RATE }`）。
  - `leverage ∉ LEVERAGES` → `'bad-lot'`。
- **卖出**（`shares < 0`）：走既有 `sellShares` 得到 `proceeds`；**若 `p.margin` 非 null，先把 `proceeds` 冲抵 `principal`**
  （`principal -= proceeds`，`≤ 0` 则差额入现金并置 `margin = null`，否则 `p.cash` 不变）。无负债时行为与现状一致。

### 5.3 轮末（`onRoundBoundary`）

顺序固定（全部确定性，无新随机源）：

1. `settleBooks()`（存款复利 / 信用贷款复利 / 抵押计息 —— 不变）
2. **保证金计息**：`p.margin.principal = Math.round(p.margin.principal × (1 + MARGIN_RATE))`
3. **股价 tick**：`market.tick(force)`，`force` 来自新的强制方向表（§5.4）
4. **爆仓判定**：对每个 `margin` 非 null 且未破产的玩家，
   `marketValue(portfolio, quotes) < principal × LIQUIDATION_RATIO` → `liquidate(p)`
5. 清空强制方向表

```ts
/** 强平：卖出全部持仓 → 先还借入 → 余额入现金 → 不足转信用贷款 */
const liquidate = (p: Player): void => {
  const proceeds = marketValue(p.portfolio, state.quotes);
  p.portfolio = {};                       // 清空股票账户
  const rest = p.margin.principal - proceeds;
  p.margin = null;
  if (rest > 0) {
    /* 余债转入信用贷款（与既有 DebtBook 同构；已有贷款则合并本金，期限取较早者） */
    p.loan = p.loan
      ? { ...p.loan, principal: p.loan.principal + rest }
      : { principal: rest, rate: LOAN_RATE, due: state.round + LOAN_TERM, overdue: 0, freeFirstRound: false };
  } else {
    p.cash += -rest;
  }
};
```

> 爆仓不消耗动效队列、不挂起（非拍卖类），故 `aiDriver` 无需改动；判定并入轮末，与违约链并列。

### 5.4 强制方向表（涨跌卡与内幕消息同源）

`state.stockTip: (string|null)[]` 改为 `state.stockForce: ({ code: string; dir: 1 | -1 }|null)[]`：

- `c-stockTip`（内幕消息）：写 `{ code, dir: 1 }`（随机一支、必涨，语义不变）。
- 涨跌卡：写 `{ code, dir }`，`dir = 'up' → 1 / 'down' → -1`。
- `Market.tick(force: { code, dir }[] = [])`：命中该标的时 `delta = d.vol * f.dir`；
  **未命中才调用 `rng()`** —— 与既有 `tips.includes(code) ? … : …` 的短路结构逐字节一致，**不改变既有 seed 回放序列**。

### 5.5 两张卡的落库

`useCard(kind, target?, stock?)` 增第三参：

```ts
export interface StockPlay { code: string; dir: 'up' | 'down' }
useCard(kind: ItemCardKind, target?: number, stock?: StockPlay): CardOutcome
```

| 卡 | 行为 | 失败分支 |
| --- | --- | --- |
| `bullBear` | 校验 `stock.code` 在 `STOCKS` 内 → 写 `state.stockForce[i] = { code, dir: dir==='up'?1:-1 }` → 消耗手牌 → `lastEvent = { kind:'card', card:'bullBear', target:null }` | `no-target`（stock 缺）/ `unknown-code` |
| `dividend` | `shares = Σ portfolio[code].shares`；`gain = shares > 0 ? shares × DIVIDEND_PER_SHARE : DIVIDEND_REFUND`；`cash += gain` → 消耗手牌 | 无（恒成功） |

两者都**不推进回合**（与既有道具卡同构）。

## 6. UI

### 6.1 股票浮层 · 版式 A

面板 `370×360 @ (10, 292)`（原 300 高 → 360；浮层本就覆盖手牌行，不遮 HUD）。

| 区域 | 台位 | 元素 | 说明 |
| --- | --- | --- | --- |
| 角标 | `PANEL_BADGE_Y` | `ui.badge` | 「股票交易所」 |
| 标的行 ×4 | `PANEL_STOCK_ROW_Y=336`，行高 `PANEL_ROW_H=34` / 间距 6 | `ui.stockRow` | 可点选中；选中行加 `selected`，行内含 现价 / 涨跌 / 持股 / 市值 |
| 走势图 | `PANEL_CHART_Y` | `ui.stockChart` | **跟随选中标的**（原恒为第一支） |
| 杠杆分段 | `PANEL_STOCK_LEV_Y` | `ui.qk` ×3 | 「无 / 2× / 3×」；`round < 8` 时整行不产出 |
| 买三档 | `PANEL_STOCK_BUY_Y` | `ui.tradeBuy` ×3 | 「买 1 手 / 买 5 手 / 买全仓」 |
| 卖三档 | `PANEL_STOCK_SELL_Y` | `ui.tradeSell` ×3 | 「卖 1 手 / 卖 5 手 / 卖全仓」；持股不足该档 → 禁用 |

- 命中区 `data-target` 编码为 `` `${code}:${tier}` ``（`tier ∈ '1' | '5' | 'all'`），由 `main.ts` 解析。
- 新增 UI 态：`stockSel`（默认 `STOCKS[0].code`）、`stockLev`（默认 1）。
- 新增纯函数：`stockRows(state, sel)`（带 `selected`）、`stockDetail(state, code)`（现价/涨跌/持股/市值/现金/借款）、
  `lotShares(tier, price, cash, held)`（档位 → 股数；`'all'` 按买入用现金、卖出用持股推导）。

### 6.2 涨跌卡浮层

`OverlayKind` 增 `'bullbear'`，优先级链：`auction > settle > bank > store > stock > bullbear > draw`。

- 触发：手牌点 `card:bullBear` → `bullbearOpen = true`（**不进选目标态**，与 `teleport/barrier` 区分）。
- 内容：角标「涨跌卡」+ 方向分段（押涨 / 押跌，复用 `ui.qk` ×2）+ 4 行 `ui.stockRow`（可点，`bullbear:pick`）+ 取消键。
- `bullbear:pick`（`data-target = code`）→ 落库 `{ kind:'card', card:'bullBear', stock:{ code, dir } }` → 关面板。
- 新增 UI 态：`bullbearOpen`、`bullbearDir`（默认 `'up'`）。

### 6.3 手牌与商店的自动扩容

`ITEM_CARDS` 变 8 项后：手牌 8 槽（`contentW = 482`、`maxScroll = 92`，M20.3-A 已实现横滑）、
商店 8 行（`PANEL_STORE_ROW_H = 34`，8 行 → 342..618，落在面板 300..600 之内需 `PANEL_STORE_ROW_H` 复核）。
`dividend` 走既有 `default` 之外的新分支，一次点击直接结算。

## 7. AI

- `settledPlan` 股票步：`pickStock` 不变，但改用 `trade(code, 1)`（仍 1 股，不用杠杆——保守，避免 AI 自杀式爆仓）。
- **打 `dividend`**：`Σ portfolio shares > 0` 时打出（无脑最优）；无持仓不浪费。
- **打 `bullBear`**：押**自己持仓最重**的那支（并列取表序小者）为「涨」。
- `pickStore`：把 `bullBear` / `dividend` 纳入目录后，既有规则自动生效（`pardon` 优先、`bomb` 次之）。

## 8. 四级可回退体系影响

- **零新增皮肤元素**：股票浮层复用 `ui.stockRow` / `ui.stockChart` / `ui.tradeBuy` / `ui.tradeSell` / `ui.qk` / `ui.badge` / `showcase.panel`。
- 新增台位常量全部落在 `src/skin/layout.ts`（`PANEL_STOCK_LEV_Y` / `PANEL_STOCK_BUY_Y` / `PANEL_STOCK_SELL_Y` / `PANEL_STOCK_PANEL_H`）；
  `src/render` 内不出现裸色值 / 裸尺寸（`tools/check-hardcoded.mjs` 闸门）。

## 9. 验收

| 项 | 内容 |
| --- | --- |
| 单测 · 数据 | 8 种卡 `priority` 全序且与 spec 表逐值一致；`HAND_SIZE === 8`；股票常量值 |
| 单测 · core | 杠杆买入（2×/3× 的 own/borrowed 拆分、现金不足、非法倍数）；卖出先还债 + 余额入现金；轮末复利；
爆仓强平（含「不足转信用贷款」与「有余额入现金」两分支）；`market.tick` 强制方向（涨/跌 + rng 不消耗）；
`bullBear` 落库与失败分支；`dividend` 有/无持仓两分支 |
| 单测 · ui | 股票浮层 A：行选中、三档启用判据、杠杆第 8 轮显隐、命中区 `code:tier` 编码；`bullbear` 浮层优先级与命中区 |
| 单测 · ai | AI 打 `dividend`（有持仓）/ 不打（无持仓）；打 `bullBear` 押自己最重仓 |
| e2e | `local/mono-e2e-playthrough.mjs` 全通（新增 `bullbear:` / `stock:buy` 三档路径覆盖） |
| 截图 | `local/mono-shots-m20-3b.mjs`（手机视口 390×844 @ dpr2）：① 浮层 A 选中行 + 三档；② 杠杆档位（第 8 轮）；
③ 涨跌卡浮层；④ 红利卡结算前后手牌/现金 |
| 手册 | `docs/manual-mono.md` 补「股票指定买卖与三档」「涨跌卡与红利卡」「杠杆与爆仓」三节 + 4 张手机截图 |
| 闸门 | `npm run check`（lint + lint:skin + test）通过 |

## 10. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 改 `stockTip` 结构破坏既有 seed 回放 | 强制时不调用 `rng()`，与既有短路结构逐字节一致；新增「同 seed 同序列」单测 |
| 杠杆让 AI 自杀式爆仓 | AI 恒用 `leverage = 1`（本轮 AI 不碰杠杆） |
| 卖出自动还债让玩家困惑 | 面板详情行显式展示「借款 / 卖出将优先偿还」；爆仓后 `lastEvent` 记 `margin-call` 供 UI 气泡 |
| 商店 8 行超面板高度 | `PANEL_STORE_ROW_H` 由 34 复核为 32（8 行 → 342..606），或面板下限放宽；单测断言行底 ≤ 面板底 |
| 三档「全仓」在卖出侧除零 | `lotShares` 对 `held = 0` 返回 0，卖档据 0 禁用；单测覆盖 |
