# M20.4 · 公共设施入股 + 每轮新闻（经济闭环第 4 轨道）设计

> 上位真源：[2026-10-01-monopoly-interaction-roadmap-design.md](./2026-10-01-monopoly-interaction-roadmap-design.md)（§4.3 / D25–D29）
> 前序：[M20.3-B 股票轨](./2026-10-02-monopoly-m20-3b-stock-track-design.md)（杠杆与强制方向通道，本轨复用）
> 本轮定位：M20「经济闭环 4 轨道」的**收官轨**（D24 拆分口径的第 4 条）。交付后 M20 全量闭环。

## 1. 背景与目标

客户诉求（路线图 §1 第 10 条）：「**不买地也要有收益来源**——银行 / 股票所等公共设施可以入股分红（不是买地）；
**收益每轮发布一次**；**收益多少由新闻利好 / 利空决定**」。

两条硬需求：

1. **公共设施入股**：5 处设施（银行 / 交易所 / 医院 / 乐透 / 福利中心）各有固定股本与认购价，
   玩家认购后**每轮末拿分红**；分红 = 基础分红 + 该设施本轮收到的现金流按持股比例分成。
2. **每轮新闻**：每轮 1 条，驱动三处 —— ① 设施分红系数（利好 ×1.5 / 利空 ×0.5）② 股价（下轮必涨 / 必跌）
   ③ 板块租金（×1.25，**本轮裁剪**，见 F-D6）。

设计意图：形成**第二条资产赛道**——「不买地也能收租」，收益与对设施的掌控度挂钩。

## 2. 范围

**本轮交付**：① 设施数据层（5 处股本 / 认购价 / 分红率）与新闻表；② 认购 API 与「先到先得」库存；
③ 轮末分红结算（基础分红 + 四个现金流分成的挂载点）；④ 每轮新闻抽取 + 三处驱动（分红系数 / 股价 / 裁剪板块租金）；
⑤ 设施浮层（复用银行 C 版式）+ 新闻条元素 + 第 5 枚 HUD 快键；⑥ AI 认购策略；⑦ 单测 / e2e / 手机截图 / 手册。

**本轮不做**：板块租金 ×1.25（商圈 tier 未接入，见 F-D6）；设施股的二级交易 / 赎回退出；新闻影响地产升级费；
M21 街区事件的「按商圈生效 3 轮」持续性规则（D29 只要求**同源**，M21 落地时再扩）。

## 3. 口径决策（本轮定稿，实现以本节为准）

D25–D29 已由上位路线图拍板，不得再询问。以下为**落地细化**（F- 前缀 = Facility / News 轨的落地决策）。

| # | 决策点 | 定稿 | 依据 / 理由 |
| --- | --- | --- | --- |
| **F-D1** | 设施建模粒度 | **按设施 id 建模**（`FacilityId = 'bank'\|'exchange'\|'hospital'\|'lottery'\|'welfare'`），非按格号 | 福利中心占 7 与 27 **两格**但 D25 算**一处**；按格号建模会出现「同设施两份股本」的错账 |
| **F-D2** | 股本 / 认购价 / 分红率 | 每处 **20 股**；认购价 银行 ￥200 / 交易所 ￥180 / 医院 ￥150 / 乐透 ￥120 / 福利 ￥100；基础分红率 **5%/轮** | D26 逐值照抄（20 轮回本、高于存款 3%） |
| **F-D3** | 分红公式 | `分红 = round((shares × price × 0.05 + cashflow × shares / 20) × coef)` | D27 `(基础分红 + 现金流) × 新闻系数 × 持股比例` 的展开；`coef` = 该设施当期新闻系数（利好 1.5 / 利空 0.5 / 无关 1） |
| **F-D4** | 现金流挂载点（四个分成的落点） | **银行** = 轮末**贷款利息**（`interestOf`，含信用 + 抵押）／**乐透** = 入场费 `LOTTERY_STAKE`／**交易所** = 交易手续费（`STOCK_FEE_RATIO = 0` ⇒ 现为 0）／**医院** = 住院罚金（现无罚金 ⇒ 0）；**福利中心** = 0 | D27 逐项对齐 §4.3 正文。**四项均零余额回归**：利息是资本化记账（`settleBooks` 只改 `principal`，不动任何现金）、乐透入场费现在被「凭空扣除」（不改玩家现金净额）、手续费与医院罚金现为 0、福利未列 |
| **F-D5** | 新闻结构 | `NewsItem { id, sentiment: 'good'\|'bad', scope: 'facility'\|'stock', target, title, magnitude }` | D28 字段（`sentiment` / `scope` / `target` / `magnitude`）逐项落地 |
| **F-D6** | 新闻第三影响面（板块租金 ×1.25） | **本轮裁剪**（不实现） | D28 原文标「**可裁剪**」。`PROPOSED_TILE_TIER`（商圈 tier）在 `board.ts` 注释明确「**未接入代码**」，无板块归属真源；M21 商圈连锁落地时一并接入（D29 同源） |
| **F-D7** | 新闻随机源 | 新增**独立流** `newsRng = makeRng((seed ^ 0x2468ace) >>> 0)` | 不动既有 `cardRng` / `marketRng` ⇒ 既有回放序列逐字节不变（零回归） |
| **F-D8** | 新闻时序 | `createGame` 发布**第 1 轮**新闻；此后**每轮末**先结算再抽下一条 | D28「轮首发、轮末结算」 |
| **F-D9** | 轮末顺序 | `settleBooks`（累计银行利息现金流）→ 保证金复利 → `market.tick`（玩家 force + 当期**新闻** force）→ 爆仓判定 → **分红结算**（用当期新闻系数）→ **抽下一条新闻** → 清空 `stockForce` | 分红必须用**当期**新闻系数（新闻随轮末发布，当期未换）；股价 force 与玩家涨跌卡**同通道**（`StockForce`，命中不消耗 `rng`，零回归） |
| **F-D10** | 新闻影响股价的通道 | 复用既有 `state.stockForce`（写 `{ code, dir }`），**不新增 tick 分支** | `market.tick` 的短路结构逐字节不变（M20.3-B 已证） |
| **F-D11** | 新闻展示位 | 新增注册元素 `ui.newsTicker`，落**自由带** `SHOWCASE_Y(406)..508` 内的 474..500 横条 | 该带在 play 模式为空（被 300..600 浮层覆盖）；浮层展开时新闻条被自然盖住（可接受） |
| **F-D12** | 设施浮层版式 | **100% 复用银行版式 C**（左列 `ui.bankRow` row ×5 + 右列 line ×5 + 两枚操作键 + 右上关闭键），**零新增 layout 常量** | 5 行 344..576 落在底板 300..600 内（银行 3 行 344..480，扩到 5 行仍不越底）；x / 键位复用 `PANEL_BANK_*` |
| **F-D13** | 认购最小单位与操作键 | primary「认购 1 股」/ secondary「认购 5 股」；售罄或现金不足 → 禁用 | 与 M20.3-B 股票三档同手感；纯函数推导、无随机 |
| **F-D14** | 设施股退出 | **不提供**（本轮认购即持有到终局） | D25–D29 未提退出机制；M21「动态要约收购」若需要再扩，避免本轮凭空发明规则 |
| **F-D15** | HUD 入口 | 新增第 5 枚常驻快键「设施」，快键行由 4 槽重排为 **5 槽**（步距 76，x0 = 7 → 7 / 83 / 159 / 235 / 311） | 既有四枚的**相对顺序不变**（设施 < 商店 < 银行 < 出售 < 手牌），只整体平移；银行/商店/出售/手牌的键位常量重定义后，`hud.spec` 的相对顺序断言随常量自动通过 |

> F-D4 的取舍：四项现金流都做成「**零余额回归**」的挂载（不改任何玩家现金净额），是为了让本轮**不影响既有平衡与既有回归基线**——
> 既有单测里设施的现金流本就是 0（利息只资本化、入场费凭空扣除），因此「设施未售出时」整条分红链恒为 0，逐值不变。
> 代价是「大股东吃现金流」在演示局的体感偏弱（只有基础分红 5%）；等 M21 接入板块租金与新的收费口径后，现金流分成才会显著。这一点写入手册明示。

## 4. 数据层

### 4.1 新建 `src/data/facilities.ts`

```ts
/** 5 处可入股设施（D25；福利中心占 7 与 27 两格但算一处，故按 id 建模，F-D1） */
export type FacilityId = 'bank' | 'exchange' | 'hospital' | 'lottery' | 'welfare';

export interface FacilityDef {
  id: FacilityId;
  name: string;
  /** 设施所在格（福利两格）；供 UI 说明与「落该格」提示用 */
  tiles: number[];
  /** 认购价（每股，D26） */
  price: number;
  /** 总股本（D26） */
  shares: number;
  /** 基础分红率（每股 / 轮，D26） */
  rate: number;
}

export const FACILITIES: FacilityDef[] = [
  { id: 'bank',     name: '鹿乡银行',   tiles: [9],      price: 200, shares: 20, rate: 0.05 },
  { id: 'exchange', name: '股票交易所', tiles: [19],     price: 180, shares: 20, rate: 0.05 },
  { id: 'hospital', name: '医院',       tiles: [25],     price: 150, shares: 20, rate: 0.05 },
  { id: 'lottery',  name: '乐透彩',     tiles: [21],     price: 120, shares: 20, rate: 0.05 },
  { id: 'welfare',  name: '福利中心',   tiles: [7, 27],  price: 100, shares: 20, rate: 0.05 },
];

export const FACILITY_SHARES = 20;          // 每处总股本（D26）
export const FACILITY_DIV_RATE = 0.05;      // 基础分红率 5%/轮（D26）
export function facilityOf(id: FacilityId): FacilityDef;
/** 格号 → 设施 id（两格归一处；非设施格 → null） */
export function facilityAtTile(index: number): FacilityId | null;
```

### 4.2 新建 `src/data/news.ts`

```ts
export type Sentiment = 'good' | 'bad';
export type NewsScope = 'facility' | 'stock';

export interface NewsItem {
  id: string;
  sentiment: Sentiment;
  scope: NewsScope;
  /** facility 时为 `FacilityId`；stock 时为股票 `code` */
  target: string;
  title: string;
  /** D28 的 magnitude：本轮仅设施分红系数用（利好 1.5 / 利空 0.5）；个股新闻保留字段但由 `dir` 驱动股价 */
  magnitude: number;
}

/** 利好 / 利空 → 分红系数（D28 ①；无关设施 = 1，由 `newsCoefOf` 判定） */
export const NEWS_COEF = { good: 1.5, bad: 0.5 } as const;

/** 固定新闻表（D28：从固定表抽取 → 可回放）；设施 6 条 + 个股 4 条 */
export const NEWS_TABLE: readonly NewsItem[];
```

新闻表（示例，实施时按此 10 条落表）：

| id | sentiment | scope | target | title |
| --- | --- | --- | --- | --- |
| `n-bank-good` | good | facility | `bank` | 鹿乡银行揽储大增，股东分红看涨 |
| `n-bank-bad` | bad | facility | `bank` | 银行坏账暴露，股东分红缩水 |
| `n-exch-good` | good | facility | `exchange` | 鹿茸交易火爆，交易所手续费水涨船高 |
| `n-hosp-bad` | bad | facility | `hospital` | 医疗事故赔偿，医院股东承压 |
| `n-lot-good` | good | facility | `lottery` | 乐透彩购彩热潮，股东分红上扬 |
| `n-welf-good` | good | facility | `welfare` | 福利中心募捐踊跃，分红提升 |
| `n-stock01-up` | good | stock | `SY01` | 鹿业股份获大单，行情看涨 |
| `n-stock02-down` | bad | stock | `SY02` | 温泉文旅客流下滑，行情承压 |
| `n-stock03-up` | good | stock | `SY03` | 山泉饮品新品热销，行情看涨 |
| `n-stock04-down` | bad | stock | `SY04` | 有机农业歉收，行情承压 |

纯函数（`src/core/facility.ts`，与 `core/bank.ts` 同规：类型在此，`game.ts` 反向 import）：

```ts
/** 新闻系数：仅设施新闻且命中该设施时生效（利好 1.5 / 利空 0.5），否则 1（D28 ①） */
export function newsCoefOf(news: NewsItem | null, id: FacilityId): number;
/** 新闻 → 股价强制方向（仅 scope === 'stock'；D28 ②，复用 M20.3-B 的 `StockForce` 通道，F-D10） */
export function newsForceOf(news: NewsItem | null): StockForce | null;
/** 某设施已售股数（先到先得：Σ 各玩家持股；F-D1 的聚合口径） */
export function soldSharesOf(players: Player[], id: FacilityId): number;
/** 认购校验：剩余股 / 现金（纯函数，零随机） */
export function canSubscribe(players, id, shares, cash): { ok: boolean; reason?: FacilityFail; cost: number };
/** 单笔分红（F-D3） */
export function dividendOf(def: FacilityDef, shares: number, cashflow: number, coef: number): number;
```

## 5. core（`src/core/game.ts`）

### 5.1 状态与字段

```ts
/* Player 增字段 */
/** M20.4 设施持股（`FacilityId` → 股数；未持有为缺键） */
facilities: Partial<Record<FacilityId, number>>;

/* GameState 增字段 */
/** M20.4 当期新闻（每轮 1 条，D28；null = 尚未发布） */
news: NewsItem | null;
/** M20.4 本设施累计的现金流（轮末结算后清空；供分红与 UI 说明） */
facilityCashflow: Record<FacilityId, number>;
```

- `createGame`：`facilities` 初始化为 `{}`、`news = rollNews(newsRng)`（发布第 1 轮，F-D8）、`facilityCashflow` 全零。
- **零回归**：新增字段不影响既有单测的既有断言（初始 0 股 ⇒ 分红恒 0）。

### 5.2 现金流累计（四处挂载点，F-D4）

| 设施 | 挂载位置 | 累计口径 |
| --- | --- | --- |
| `bank` | `settleBooks()` 内，逐玩家 `p.loan`（非首轮免息时）与 `p.mortgages` 的 `interestOf(book)` 求和 | **资本化记账，不动任何现金** ⇒ 零余额回归 |
| `lottery` | `resolveLottery()` 的 `stake` 处（`p.cash -= stake` 之后） | 现在这笔钱「凭空消失」，改为计入设施现金流 ⇒ **现金净额不变** |
| `exchange` | `trade()` 买入 / 卖出成功分支，`Math.round(cost × STOCK_FEE_RATIO)` | `STOCK_FEE_RATIO = 0` ⇒ 恒 0 |
| `hospital` | 无（现无罚金） ⇒ 恒 0 | §4.3 提及「住院罚金」但现版本无此收费，**不新增收费**（属平衡变更） |
| `welfare` | 无（D27 未列，§4.3 的「奖池抽取分成」需新增收费） ⇒ 恒 0 | 同上，不新增收费 |

> 结论：`facilityCashflow` 在本轮**只在银行与乐透**上可能出现非零值，且都**不改任何玩家现金净额**。

### 5.3 认购 API

```ts
export type FacilityFail = 'unknown-facility' | 'bad-shares' | 'sold-out' | 'not-enough-cash';
export type FacilityOutcome =
  | { ok: true; facility: FacilityId; shares: number; cost: number; cash: number }
  | { ok: false; reason: FacilityFail };

/** 认购设施股（先到先得，F-D13：最小 1 股；不推进回合，与银行六 API / 商店同构） */
buyFacility(facility: FacilityId, shares: number): FacilityOutcome;
```

实现：`shares` 非正整数 → `bad-shares`；`soldSharesOf + shares > 20` → `sold-out`（先到先得）；`cost = price × shares`；
`p.cash < cost` → `not-enough-cash`；成功则 `p.cash -= cost`、`p.facilities[facility] += shares`、
`lastEvent = { kind: 'facility', facility, shares, cost }`（`EventLog` 增该变体）。

### 5.4 轮末分红与新闻（F-D9 顺序）

`onRoundBoundary` 扩为 **7 步**（在 M20.3-B 的 5 步上插入 2 步）：

```ts
const onRoundBoundary = (): void => {
  settleBooks();                                  // ① 计息（同时累计银行现金流，F-D4）
  for (const p of state.players) {                // ② 保证金复利（不变）
    if (p.bankrupt || !p.margin) continue;
    p.margin.principal = Math.round(p.margin.principal * (1 + MARGIN_RATE));
  }
  const force = state.stockForce.filter((f): f is StockForce => f !== null);
  const nf = newsForceOf(state.news);             // ③ 当期新闻的股价强制方向（F-D10，同通道）
  if (nf) force.push(nf);
  state.quotes = market.tick(force);
  state.priceHistory = market.history();
  for (const p of state.players) {                // ④ 爆仓判定（不变）
    if (p.bankrupt || !p.margin) continue;
    if (marketValue(state.portfolios[p.id - 1], state.quotes) < p.margin.principal * LIQUIDATION_RATIO) liquidate(p);
  }
  payFacilityDividends();                         // ⑤ 分红结算（用**当期**新闻系数）
  state.news = rollNews(newsRng);                 // ⑥ 抽下一条（F-D8）
  state.stockForce = state.stockForce.map(() => null);   // ⑦ 清空强制方向（不变）
};
```

```ts
/** 每处设施：对每个持股玩家，按 F-D3 分红；随后清空现金流 */
const payFacilityDividends = (): void => {
  for (const def of FACILITIES) {
    const coef = newsCoefOf(state.news, def.id);
    const cf = state.facilityCashflow[def.id];
    for (const p of state.players) {
      if (p.bankrupt) continue;
      const shares = p.facilities[def.id] ?? 0;
      if (shares <= 0) continue;
      const gain = dividendOf(def, shares, cf, coef);
      if (gain > 0) p.cash += gain;
    }
    state.facilityCashflow[def.id] = 0;
  }
};

/** 抽一条新闻（固定表 + 独立 rng 流，F-D7） */
const rollNews = (rng: () => number): NewsItem => NEWS_TABLE[Math.floor(rng() * NEWS_TABLE.length)];
```

**零回归论证**：未售出任何设施股时（`p.facilities` 全空）⇒ `payFacilityDividends` 的每个玩家都 `shares = 0` 跳过 ⇒
不产生任何 `p.cash` 变更；`newsForceOf` 只在 `scope === 'stock'` 时返回力，而新闻是**新抽的独立流**，
其命中标的会改变该标的的 tick 方向 —— ⚠️ **这一项会影响 tick 结果**（见 §10 风险 1）。

## 6. UI

### 6.1 设施浮层（复用银行版式 C，F-D12）

`OverlayKind` 增 `'facility'`，优先级链：
`auction > settle > bank > store > facility > stock > bullbear > draw`（设施与银行 / 商店同属常驻入口，三者互斥，只开一个）。

| 区域 | 台位（全部复用 `PANEL_BANK_*`） | 元素 | 说明 |
| --- | --- | --- | --- |
| 底板 / 角标 | `PANEL_X/Y`(370×300 @ 10,300) / `PANEL_BADGE_Y=318` | `showcase.panel` / `ui.badge` | 角标「公共设施 · 入股」 |
| 左列 5 行 | `PANEL_BANK_ROW_X/W/H/GAP`，`PANEL_BANK_ROW_Y0=344` → 344..576 | `ui.bankRow`（row 变体） | 5 处设施；选中行 `selected`；行内 summary = `￥{price} · 已售 {sold}/20` |
| 右列详情 ×5 | `PANEL_BANK_DETAIL_CX=277`，`PANEL_BANK_LINE_Y0=350` / `DY=22` → 350..438 | `ui.bankRow`（line 变体） | 名称 / 认购价 / 已售 / 你的持股 / 预估分红（`￥{perRound}/轮`，含当期新闻系数提示） |
| 两枚操作键 | `PANEL_BANK_BTN_X=228 / Y=456`、`PANEL_BANK_BTN2_X=222 / Y=510` | `ui.button.primary` / `ui.button.secondary` | 「认购 1 股 ￥{price}」/「认购 5 股 ￥{price×5}」 |
| 关闭键 | `PANEL_BANK_CLOSE_X=300 / Y=307` | `ui.qk` 「关闭」 | 右上 |

- 命中区 `data-action`：`facility:select`（`target = FacilityId`）+ `facility:buy1` / `facility:buy5`（`target = FacilityId`）+ `facility:close`。
- 新增 UI 态 `FacilityUiState { open: boolean; sel: FacilityId }` + `FACILITY_UI_DEFAULTS`（收起、选中 `bank`）。
- 新增纯函数：`facilityRows(state, sel)`（含 `selected`）、`facilityDetail(state, sel)`（含两枚键的 label 与 enabled）。

**越界校验**：第 5 行底 576 ≤ 600（底板底）✓；左列最右 172 < 右列最左 184 ✓；
两枚操作键 456..502 / 510..556 均在 600 内 ✓；浮层内可点元素**全部收在 606 之上** ⇒ 不与 HUD 快键行（607..629）冲突 ✓。

> **实施期必要偏差（F-D12 补充）**：两枚认购键标签「认购 1 股 ￥200」/「认购 5 股 ￥1000」比银行键标签长，
> 默认 `btnFs = 15` 下实测宽 110.4 / 119.7px **溢出键宽** 98 / 110px，而 `uiButton` 标签色 `#1b1b1b`（为金底设计的深色）
> 压到深色底板上**肉眼像被裁切**（目视复核 01/02/04 三张 PNG 发现）。修法：`uiButton` 支持**逐实例字号覆写** `state.fs`
> （`render/providers/proc-hud.ts`），设施分支两枚键传 `PANEL_FACILITY_CTA_FS = 12`（`skin/layout.ts`）
> → 压到 88.3 / 95.7px、两侧各留 ≥ 5px。**台位 / 键宽仍 100% 复用银行版式**（F-D12 不变），仅字号逐实例覆写；
> 银行 / 商店分支不带 `fs`，沿用 skin 参数默认，**零回归**（`test/ui/panels-facility.spec.ts` 有对应断言）。

### 6.2 新闻条（新增注册元素 `ui.newsTicker`，F-D11）

| 项 | 值 |
| --- | --- |
| 台位 | `NEWS_TICKER_X = 10` / `NEWS_TICKER_Y = 474` / `W = 370` / `H = 26` |
| 元素 | `ui.newsTicker`（新增注册项：`registry.ts` + `public/skins/default/skin.json`） |
| 状态 | `{ sentiment, scope, title, target, coef }` —— 利好金底 / 利空灰底由 preset 按 `sentiment` 选语义色 |
| 产出 | `newsTickerSpecOf(state)`：`state.news === null` → 不出；否则 1 条 |
| 深度 | `hudSpecs` 在 `panelSpecs` **之前**合并（`main.ts` 566/570 行）⇒ 浮层自然盖住新闻条 |

新闻条是**信息条**（不吃事件），故不进任何命中区。

### 6.3 HUD 第 5 枚快键（F-D15）

`src/skin/layout.ts` 重定义快键行（步距 76 = `HUD_QK_W(72) + 4`）：

```ts
export const HUD_QK_FACILITY_X = 7;      // 设施（新增）
export const HUD_QK_STORE_X = 83;        // 商店（原 59）
export const HUD_QK_BANK_X = 159;        // 银行（原 135）
export const HUD_QK_FAST_X = 235;        // 出售 / AI 加速（原 211）
export const HUD_QK_SKIP_X = 311;        // 手牌 / AI 跳过本次（原 287）
```

- `HudActionId` 增 `'facility'`；`HudUiOpts` 增 `facilityOpen?: boolean`（仅切标签「设施 / 设施 ✓」）。
- `hudSpecs` 新增 `pushFacilityKey()`（r = 17，与商店 15 / 银行 16 同段；静音键 r 顺延为 18/19，其余 r 递增）。
  > 注：`r` 只需**单调递增**即可保证绘制序（depth = c + r），故新增一键后把后续 r 顺延 +1 即可。
- `hitAreas` 增 `{ action: 'facility', x: HUD_QK_FACILITY_X, ... }`（仅真人回合）。
- 既有四枚的相对顺序断言（`HUD_QK_STORE_X + W <= HUD_QK_BANK_X` 等）随常量自动通过；
  `test/ui/hud.spec.ts` 里「**四枚** `ui.qk`」的计数断言需改为**五枚**。

## 7. AI

- `AiStep` 增 `{ kind: 'facility'; facility: FacilityId; shares: number }`；`applyStep` → `g.buyFacility(...)`。
- 新增 `pickFacility(state, P)`（确定性，零随机）：
  - **保命线**：`p.cash < FACILITY_RESERVE(￥500)` 不认购（避免把现金买空后破产）；
  - 按 `FACILITIES` **表序**（银行 → 交易所 → 医院 → 乐透 → 福利）取第一处「未售罄 且 现金 ≥ 认购价 × 2」的设施，认购 **1 股**；
  - 已满仓（自己持有该设施全部 20 股）或有更优先目标时跳过。
- `settledPlan` 插入该步：**买地 ① → 升级 ② → 股票 ③ → 设施 ④ → 银行 ⑤ → 商店 ⑥ → 投机 ⑦ → 卡片 ⑧**
  （设施排在股票之后：股票有杠杆/波动，收益弹性更高；设施是「无风险 5% 底仓」）。

## 8. 四级可回退体系影响

- **新增 1 个皮肤元素**：`ui.newsTicker`（`src/skin/registry.ts` + `public/skins/default/skin.json` 同步注册，`npm run lint:skin` 与 `tools/registry-ids.json` 计数随之更新）。
- **零新增 layout 台位常量**（设施浮层 100% 复用 `PANEL_BANK_*`）；新增仅 `NEWS_TICKER_X/Y/W/H`（4 个）与快键行 5 个 x 常量。
- `src/render` 内不得出现裸色值 / 裸尺寸（`tools/check-hardcoded.mjs` 闸门）；`ui.newsTicker` 在 L4 内建兜底里给 `fb({...})`。

## 9. 验收

| 项 | 内容 |
| --- | --- |
| 单测 · 数据 | 5 处设施 id / name / tiles / price / shares / rate 逐值与 D26 一致；`FACILITY_SHARES === 20`；`facilityAtTile(7) === facilityAtTile(27) === 'welfare'`；`facilityAtTile(12/23/0) === null`；`NEWS_TABLE` 每条 `magnitude` 与 `sentiment` 自洽、id 唯一 |
| 单测 · core | `newsCoefOf`（利好 1.5 / 利空 0.5 / 无关 1 / null → 1）；`newsForceOf`（stock 新闻给方向、facility 新闻 → null）；`soldSharesOf` 聚合；`canSubscribe` 四分支（`bad-shares` / `sold-out` / `not-enough-cash` / ok）；`dividendOf` 逐值；`buyFacility` 落库 + 售罄 + 现金不足 + `lastEvent` |
| 单测 · core 轮末 | 分红两分支（有持股 → 现金增；无持股 → 现金逐值不变）；**利好设施分红 = 基础 × 1.5、利空 = × 0.5**；银行利息计入现金流后按持股比例分成；乐透入场费计入；新闻每轮末换 1 条且**同 seed 同序列**；**未入股局的现金 / 股价序列与 M20.3-B 基线逐值一致**（零回归闸门，见 §10） |
| 单测 · ui | `overlayOf` 增 `facility` 且优先级低于 `store`、高于 `stock`；设施浮层 5 行、恰一行 `selected`、两枚键 label / enabled；命中区 `facility:select` / `facility:buy1` / `facility:buy5` / `facility:close` 台位与行底 ≤ 600；`ui.newsTicker` 台位 474..500 |
| 单测 · hud | `ui.qk` **五枚**且 x 与常量一致；四枚既有相对顺序仍成立；`hitAreas` 含 `facility` |
| 单测 · ai | 现金 < ￥500 不认购；按表序选第一处可买设施；已满仓跳过；`applyStep` 透传 |
| e2e | `local/mono-e2e-playthrough.mjs` 全通（新增 `facility:buy1` 路径覆盖） |
| 截图 | `local/mono-shots-m20-4.mjs`（手机视口 390×844 @ dpr2）：① 设施浮层（选中行 + 两枚认购键）；② 认购后详情（已售 / 持股 / 预估分红）；③ 新闻条（利好 + 利空各一张）；④ 轮末分红后现金变化 |
| 手册 | `docs/manual-mono.md` 追加「M20.4 公共设施入股与每轮新闻」专节 + 4 张手机截图 |
| 闸门 | `npm run check`（lint + lint:skin + test）通过 → `npm run build`（check-hardcoded clean） |

## 10. 风险与对策

| 风险 | 对策 |
| --- | --- |
| **新闻影响股价 ⇒ tick 序列变化 ⇒ 既有 e2e / autoPlay 长局漂移** | 新闻是**独立 rng 流**（F-D7），只在「命中个股新闻」的那一轮改变该标的 tick 方向。**症状可枚举、可控**：实施后重跑 `vitest` 全量 + `mono-e2e-playthrough.mjs`，把「漂移的期望值」重新基线并**在设计文档与手册中显式记录改了哪几条断言**；不用「关掉新闻影响股价」来回避（那是 D28 明文要求） |
| 新闻改变股价让「同 seed 回放」不再等于 M20.3-B 结果 | 提供**唯一口径的零回归闸门**：新增单测「构造一个全部设施未售出的对局，断言 `p.cash` 序列与 M20.3-B 基线一致、且 tick 只受新闻 force 影响（可用 `newsForceOf(state.news)` 复算）」 |
| 设施浮层 5 行越出底板 / 压住 HUD 快键行 | 5 行底 576 ≤ 600；两枚键底 556 ≤ 600；命中区与视觉同源常量；单测断言行底与键底 |
| 快键行改 5 槽压住状态行文字 | 状态行文字居中于 195、快键行 7..383；状态行**画在下、快键画在上**（既有层级不变）；`hud.spec` 断言修正为 5 枚；prod-check V11 按**标签**判断，不受坐标平移影响 |
| 新增注册项漏登记 → `lint:skin` / `registry-ids` 计数失败 | 与 `showcase.panelStock` 同流程：`registry.ts` + `default/skin.json` 同时改，跑 `npm run lint:skin` 与 `npm run check` |
| AI 把现金买空后破产 | `FACILITY_RESERVE = ￥500` 保命线 + 只买 1 股 + 排在股票之后 |
| 分红改动 `p.cash` 影响 `netWorth` / 胜负判定 | 分红计入现金是**设计意图**（D27）；但必须重跑胜负相关单测，确认只在新入股局漂移 |