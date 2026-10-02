# M20.5 · 经济平衡与风险（存取款金额 · 爆仓补仓 · 查税 · 景气 · 经济道具 · 新闻公平）设计

> 上位真源：[2026-10-01-monopoly-interaction-roadmap-design.md](./2026-10-01-monopoly-interaction-roadmap-design.md)
> 前序：M20.1 拍卖与自由出售 · M20.2 银行信贷 · M20.3 股票（含杠杆）与卡片 · M20.4 设施入股与每轮新闻（均已交付）
> 本轮定位：M20「经济闭环」的**平衡与风险增强轮**。M20.1–M20.4 解决「有没有」，本轮解决「好不好玩、风险收益是否对等、玩家会不会滥用」。

## 1. 背景与目标

客户复盘（原话，口径不得更改）：

> 「银行存取款需要输入金额，不能一次都存入，或都取出。股票使用杠杆应该提示爆仓点，允许抵押贷款等追加保证金，不然贷款没人使用，等于开发无用功能，另外经济上要有平衡机制，风险收益平衡。增加经济相关道具。风险收益怕查税，租地收益怕经济不景气，收益变少。新闻对经济有影响，但要随机公平出现。」

拆为 6 条交付项：

| # | 交付项 | 现状缺口（代码级核对 2026-10-02） |
| --- | --- | --- |
| ① | **存取款需金额输入**（禁止一键全存 / 全取） | 引擎 `deposit(amount)` / `withdraw(amount)` **已支持金额**（`src/core/game.ts:1326-1343`），但 UI 层是**一键全量**：`main.ts:873-874` 直接传 `p.cash` / `p.deposit`。缺口在 **UI**，不在引擎 |
| ② | 杠杆需**爆仓点提示** + 允许用**抵押贷款追加保证金** | 有 `LIQUIDATION_RATIO = 1.2` 与轮末强平（`game.ts:1512-1516`），但**全盘无任何爆仓线提示**；`p.margin` 只能被动等强平，**无补仓入口**（`addMargin` 零命中）⇒ 杠杆=单程票，客户判断「贷款没人使用」 |
| ③ | **经济平衡机制**（风险 ↔ 收益对等） | 全盘无任何「高收益伴随高风险」的耦合：收租是纯收益、无对应风险（`audit` / `economyIndex` 零命中） |
| ④ | 新增**经济类道具** | `ITEM_CARDS` 8 种（M20.3-B 后），与经济系统无关 |
| ⑤ | 风险侧：**查税**、**经济不景气**（租地收益下降） | 无查税、无景气度；租金恒为 `rentAt(level)` 常量（`game.ts:778`） |
| ⑥ | **新闻**影响经济但必须**随机公平**出现 | M20.4 有新闻（`NEWS_TABLE` 10 条），但抽取是**纯均匀随机** `NEWS_TABLE[floor(rng()×10)]`（`game.ts:393-395`）⇒ 会连续同向 / 连续同一目标，谈不上「公平」 |

**设计意图**：把「收租 = 稳赚」的单调结构，改造成 **收益 / 风险对等** 的三角——
**景气度**（系统性机会与风险，新闻驱动）× **查税**（个体高收益的代价）× **杠杆补仓**（可控的高风险通道）。

## 2. 范围

**本轮交付**：① 银行存款金额键盘（含引擎上限截断）；② 保证金子系统（爆仓线提示三处 + `addMargin` 双来源补仓）；
③ 景气度 `economyIndex`（驱动租金）；④ 查税判定链（含避税道具）；⑤ 3 张经济道具 + 商店目录扩容版式；
⑥ 新闻公平抽取（冷却 + 同向上限 + 新增「大盘」新闻）；⑦ AI 相应策略；⑧ 单测 / 闸门 / 手机截图 / 手册。

**本轮不做**：不改 M20.1–M20.4 已交付的业务口径（拍卖 / 信贷三条产品线 / 设施股本 / 分红公式）；
不新增随机源以外的任何非确定性；不做景气度的历史曲线图；不做查税的申诉 / 复议玩法。

## 3. 口径决策（本轮定稿，实现以本节为准）

新决策项自 **D38** 起编号（D1–D37 归属见上位路线图 §8；D32–D37 已被 M22 占用）。

| # | 决策点 | 定稿 | 依据 / 理由 |
| --- | --- | --- | --- |
| **D38** | 本轮定位 | M20 经济闭环的**平衡与风险增强轮**；M20.1–M20.4 口径不动 | 客户 6 条诉求全部是「已有系统的深化」，非新子系统 |
| **D39** | 存取款金额形态 | 银行浮层「存款」页右列换为**金额键盘**：示数条 + 数字键 `1-9 0` + `⌫` + `清空` + 快捷档 `+100 / +500 / +1000` + **两枚确认键「存入 ￥X」/「取出 ￥X」并排**（共用同一键盘金额，各自按可用现金 / 存款截断）。**不提供「全部」档** | 直接落实「不能一次都存入，或都取出」；存取两条通路各自有独立入口（客户补充要求）；键盘是移动端最贴近「输入金额」直觉的形态（方案 A，见 §6.1 mockup） |
| **D40** | 爆仓点提示位置 | 三处：① 银行新增**第 4 张产品卡「保证金」**（4 行：借款 / 持仓市值 / 爆仓线 / 距爆仓）② 股票浮层**角标**在「接近爆仓」时改警示文案 `⚠爆仓 N%` ③ HUD 债务条的**债务段并入保证金借款**（不新增第 5 段，避免 234px 宽挤爆） | 提示必须出现在「玩家会看到的地方」，但不能动已有元素数量（HUD 段数 / BUBBLE_DEPTH 连锁） |
| **D41** | 追加保证金来源 | `addMargin(amount, source)` 双来源：**`cash`** = 现金直接冲减保证金借款；**`mortgage`** = 以自有地块抵押借入，**款项直接补入保证金账户**（须站 9 号格，额度 `sellAt × 80%`、利率 4% / 6 轮，与既有抵押贷款**同规**）。`amount` 缺省 = 全额 | 落实「允许抵押贷款等追加保证金」。`mortgage` 复用既有抵押常量与锁定语义（抵押地块仍锁出售 / 升级、仍可收租） |
| **D42** | 经济景气度 | `state.economyIndex`（初始 `1.0`，域 `[0.7, 1.3]`）；**租金 = `round(rentAt(level) × economyIndex)`**；轮末按独立新流 `econRng = makeRng(seed ^ 0x0econ)` 随机游走 `±ECON_VOL(0.08)`，再叠加当期新闻的 `bias` | 「经济不景气 → 租地收益变少」的唯一落点；独立流 ⇒ 既有 `cardRng / marketRng / newsRng` 序列不变 |
| **D43** | 查税（风险） | 玩家**单轮收租累计** `p.roundRent`（轮末清零）→ 轮末 `auditChance = clamp(roundRent × AUDIT_PER_RENT(0.0002), 0, AUDIT_MAX(0.4))`（即**每 ￥100 租金 +2%，上限 40%**）；命中则补税 `round(roundRent × AUDIT_RATE(0.3))`，走 `settleDebt` 并入既有清算链（先拍卖 → 折股 → 破产）；独立流 `auditRng = makeRng(seed ^ 0x0a0d17)`；逐玩家按 id 升序判定 | **风险 ↔ 收益对等的核心**：赚得越多越容易被盯上。走 `settleDebt` 是为了与既有破产 / 拍卖链完全一致，不发明第二套清算 |
| **D44** | 避税道具 | `taxShield`「避税凭证」：查税**判定命中后**免疫一次并消耗（未命中不消耗） | 给高风险玩家一条可控的保命线；「命中才消耗」避免玩家因运气白白浪费 |
| **D45** | 新增经济道具 | 3 张，全部 `target: 'none'`：`taxShield` 避税凭证（免疫一次查税，商店 ￥350）· `subsidy` 惠农补贴（立即 `+￥300`，商店 ￥400）· `boom` 造势（**本轮** 景气度 `+0.2`，商店 ￥500）。`priority`：`taxShield 15` / `subsidy 25` / `boom 55` | 覆盖「防守 / 即时收益 / 周期博弈」三种经济决策；售价按「期望收益 ≈ 售价 × 0.75」反推（避税期望 ≈ 30%×单轮租金，补贴固定 300，造势影响全场）；`HAND_SIZE = ITEM_CARDS.length` 自动 8 → 11 |
| **D46** | 商店目录扩容版式 | 目录 8 → 11 项 ⇒ 道具商店浮层改用 `showcase.panelTall`（370×480 @ `PANEL_DRAW_Y=150`）：左列 11 行（y0 = 190，step 32 → 190..542），右列详情 + 两枚操作键（`PANEL_BANK_BTN_Y/2` 下移到 552 / 556，均 **< 606**） | 11 行在 300..600 的 `showcase.panel` 内装不下（256px / 11 行 ≈ 23px/行，字会溢出）；`panelTall` 已在册，零新增元素 |
| **D47** | 新闻公平抽取 | `rollNews(rng, history)` 升级为**公平抽取**：① **冷却**——最近 `NEWS_COOLDOWN(4)` 条出现过的 `id` 不重复抽（候选池为空则放宽）② **同向上限**——连续同向（利好 / 利空）达 `NEWS_STREAK_MAX(3)` 条后，候选池收窄为反向（反向池空则放宽）③ target 与「谁持有得多」无关，规则对四位玩家完全同一 | 「随机公平出现」的落地：去连续重复、去同向连击、去针对性；仍是固定表 + 独立流 ⇒ **可回放** |
| **D48** | 新增「大盘」新闻 | `NewsScope` 增 `'economy'`：`n-econ-boom`（利好，景气 `+0.15`）/ `n-econ-bust`（利空，景气 `−0.15`）；其它新闻对景气 `+0.05 / −0.05` | 让「新闻 → 经济」存在**直接可见**的通路（原 M20.4 新闻只驱动分红与股价） |

## 4. 数据层

### 4.1 扩展 `src/data/economy.ts`

```ts
/* —— M20.5 景气度与查税（spec §3 D42/D43）—— */
/** 景气度初始值 */
export const ECON_INDEX_START = 1.0;
/** 景气度下限 / 上限（租金系数不会被压成 0 或翻倍失控） */
export const ECON_INDEX_MIN = 0.7;
export const ECON_INDEX_MAX = 1.3;
/** 轮末随机游走幅度（±） */
export const ECON_VOL = 0.08;
/** 新闻对景气度的偏置：大盘新闻 ±0.15 / 其它 ±0.05 */
export const ECON_BIAS_ECONOMY = 0.15;
export const ECON_BIAS_NORMAL = 0.05;

/** 查税：每 ￥1 租金收入带来的被查概率（0.0002 ⇒ 每 ￥100 租金 +2%） */
export const AUDIT_PER_RENT = 0.0002;
/** 被查概率上限（40%） */
export const AUDIT_MAX = 0.4;
/** 补税额 = 本轮租金收入 × 30% */
export const AUDIT_RATE = 0.3;

/* —— M20.5 经济道具（D45）—— */
/** `subsidy` 立即领取额 */
export const SUBSIDY_AMOUNT = 300;
/** `boom` 景气度抬升量 */
export const BOOM_DELTA = 0.2;
```

### 4.1b 扩展 `src/data/cards.ts` 与 `src/data/item-shop.ts`

```ts
/* cards.ts：ItemCardKind 追加 3 种，并追加进 ITEM_CARDS（表尾追加，`priority` 决定手牌 / 商店排序） */
export type ItemCardKind = /* …既有 8 种… */ | 'taxShield' | 'subsidy' | 'boom';
{ kind: 'taxShield', name: '避税凭证', desc: '被税务抽查时自动抵免一次（未触发不消耗）', target: 'none', priority: 15 },
{ kind: 'subsidy',   name: '惠农补贴', desc: '立即领取 ￥300',                              target: 'none', priority: 25 },
{ kind: 'boom',      name: '造势',     desc: '本轮景气度 +0.2，全场租金随之上浮',            target: 'none', priority: 55 },

/* item-shop.ts：STORE_CATALOG 同步追加（顺序恒等 priority 升序） */
{ kind: 'taxShield', price: 350 },
{ kind: 'subsidy',   price: 400 },
{ kind: 'boom',      price: 500 },
```

### 4.2 扩展 `src/data/news.ts`

```ts
export type NewsScope = 'facility' | 'stock' | 'economy';   // D48
export const NEWS_COOLDOWN = 4;      // D47 冷却条数
export const NEWS_STREAK_MAX = 3;    // D47 同向上限

/* 表尾追加 2 条大盘新闻（scope: 'economy'，target: 'market'） */
{ id: 'n-econ-boom', sentiment: 'good', scope: 'economy', target: 'market', title: '消费回暖，全城租金水涨船高', magnitude: NEWS_COEF.good },
{ id: 'n-econ-bust', sentiment: 'bad',  scope: 'economy', target: 'market', title: '市场遇冷，租地收益普遍下滑', magnitude: NEWS_COEF.bad  },
```

### 4.3 新建 `src/core/cycle.ts`（景气度 + 查税纯函数）

与 `core/bank.ts` / `core/facility.ts` 同规：只依赖 `data/*`，**不 import `game.ts` 运行时**；全链路纯算术、零 `Math.random`。

```ts
/** 夹到 [MIN, MAX]，四舍五入到 3 位小数（避免浮点尾数进断言） */
export function clampIndex(v: number): number;
/** 当期新闻 → 景气偏置（economy 大盘 ±ECON_BIAS_ECONOMY / 其它 ±ECON_BIAS_NORMAL / 无新闻 0） */
export function econBiasOf(news: NewsItem | null): number;
/** 轮末景气游走：`clampIndex(cur + (2·rng()−1) × ECON_VOL + bias)` */
export function nextEconomyIndex(cur: number, rng: () => number, news: NewsItem | null): number;
/** 被查概率：`clamp(roundRent × AUDIT_PER_RENT, 0, AUDIT_MAX)` */
export function auditChanceOf(roundRent: number): number;
/** 补税额：`round(roundRent × AUDIT_RATE)` */
export function auditTaxOf(roundRent: number): number;
```

### 4.4 新建 `src/core/news.ts`（公平抽取）

```ts
/** 公平抽取（D47）：冷却去重 → 反向保底；`history` 为**由新到旧**的 id 列表 */
export function rollNews(rng: () => number, history: readonly string[]): NewsItem;
/** 由历史推导某 sentiment 的连续条数（队首同向计数） */
export function sentimentStreak(history: readonly string[], table: readonly NewsItem[]): { sentiment: Sentiment; count: number } | null;
```

> `game.ts` 内的私有 `rollNews` 迁出到本文件（行为升级），`newsHistory` 存 `GameState`。

## 5. core（`src/core/game.ts`）

### 5.1 状态与字段

```ts
/* Player 增字段 */
/** M20.5 本轮累计收租（轮末用于查税判定后清零） */
roundRent: number;
/** M20.5 避税凭证是否已持有 —— 复用既有手牌（`hands`）判定，不新增字段 */

/* GameState 增字段 */
/** M20.5 景气度（租金系数，D42） */
economyIndex: number;
/** M20.5 新闻抽取历史（由新到旧，最多 `NEWS_COOLDOWN` 条，D47） */
newsHistory: string[];
```

- `createGame`：`economyIndex = ECON_INDEX_START`；`news = rollNews(newsRng, [])`；`newsHistory = [news.id]`；各玩家 `roundRent = 0`。
- **零回归**：`economyIndex = 1.0` 时 `round(rentAt × 1.0) = rentAt`，既有租金断言逐值不变；`roundRent` 初始 0 ⇒ 查税概率 0。

### 5.2 租金挂景气度（D42）

`settleCurrent()` 中 `const base = rentAt(state.estates, index)` →

```ts
const base = Math.round(rentAt(state.estates, index) * state.economyIndex);
```

收款方累计：`owner.roundRent += debt.paid`（在 `settleDebt` 回填 `paid` 之后；`waived` 不计）。
**唯一改动点**：只作用于「玩家之间付租」，拍卖估值 / AI 估值 / 建筑投入价一律不走景气度。

### 5.3 `addMargin`（D41）

```ts
export type MarginSource = 'cash' | 'mortgage';
export type MarginOutcome = { ok: true; added: number; principal: number } | { ok: false; reason: BankFail };

/** 追加保证金：现金直接冲减 / 抵押借入直接补入（只作用于当前玩家） */
addMargin(amount?: number, source?: MarginSource): MarginOutcome;
```

语义：

| 来源 | 前置 | 额度 | 记账 |
| --- | --- | --- | --- |
| `cash`（缺省） | 有保证金借款 + 现金 > 0 | `min(amount ?? cash, cash, principal)` | `cash −= added`；`margin.principal −= added`；归零则 `margin = null` |
| `mortgage` | **站 9 号格** + 有保证金借款 + 有可抵押地块 | `min(mortgageLimitOf(tile), principal)` | 新增 `mortgages` 一笔（利率 `MORTGAGE_RATE`/期限 `MORTGAGE_TERM`，地块锁）；`margin.principal −= added`。**款项不落现金**（直接补仓），故 `principal` 净额可能 ≤ 0 → 归零后余款**不返现**（抵押已成立、余款进现金），即 `added = min(limit, principal)`，超出部分不进抵押 |

> 为什么「超出部分不进抵押」：避免玩家用补仓名义无上限套现（否则等于绕开信用贷款额度）。补仓只补齐到「保证金借款归零」为止。

### 5.4 轮末收口（在 M20.4 的 7 步上插 2 步 → 9 步）

```ts
const onRoundBoundary = (): void => {
  settleBooks();                                        // ① 计息（含银行现金流）
  margin 复利                                            // ②
  state.quotes = market.tick(force)                      // ③
  爆仓判定                                               // ④
  payFacilityDividends();                               // ⑤
  settleAudits();                                       // ⑥ 【新】逐玩家按 id 升序查税（D43）
  state.economyIndex = nextEconomyIndex(                 // ⑦ 【新】景气度游走（D42）
    state.economyIndex, econRng, state.news);
  const next = rollNews(newsRng, state.newsHistory);     // ⑧ 抽下一条新闻（D47）
  state.newsHistory = [next.id, ...state.newsHistory].slice(0, NEWS_COOLDOWN);
  state.news = next;
  state.stockForce = state.stockForce.map(() => null);   // ⑨ 清强制方向
};
```

`settleAudits()`：

```ts
for (const p of state.players) {
  if (p.bankrupt) continue;
  const chance = auditChanceOf(p.roundRent);
  const hit = chance > 0 && auditRng() < chance;      // 概率 0 时**不消耗 rng**（保短路）
  if (hit && (state.hands[p.id-1] ?? []).includes('taxShield')) {
    consumeCard(state.hands[p.id-1], 'taxShield');    // D44：命中才消耗
  } else if (hit) {
    const tax = auditTaxOf(p.roundRent);
    const d = settleDebt(p, tax, null);               // 复用既有清算链
    state.lastEvent = { kind: 'audit', player: p.id, rent: p.roundRent, tax, paid: d.paid, bankrupt: d.bankrupt };
  }
  p.roundRent = 0;
}
```

> **短路保确定性**：`chance === 0` 时不调用 `auditRng()`，与 `market.tick` 的 force 短路同法 ⇒ 低租金玩家的序列不受影响。

### 5.5 `EventLog` 增变体

```ts
| { kind: 'audit'; player: number; rent: number; tax: number; paid: number; bankrupt: boolean }
| { kind: 'marginAdd'; player: number; added: number; source: MarginSource }
| { kind: 'economy'; index: number }        // 造势道具触发的景气变动（即时结算）
```

（`MOOD_BY_EVENT` 非穷举 switch，新增变体不破坏既有消费方。）

### 5.6 经济道具效果（`useCard`）

| kind | 效果 |
| --- | --- |
| `taxShield` | `target: 'none'`，**不可主动使用**（仅作为查税免疫的持有物；`useCard` 返回 `no-effect` 并保留手牌） |
| `subsidy` | 立即 `cash += SUBSIDY_AMOUNT`；`lastEvent = { kind: 'subsidy', amount }`（复用既有 `gift` 口径的展示） |
| `boom` | `economyIndex = clampIndex(economyIndex + BOOM_DELTA)`；`lastEvent = { kind: 'economy', index }` |

> `taxShield` 做成「被动持有」而非主动出牌，是为了避免「用了却没被查 → 白给」的负体验（D44 已定「命中才消耗」）。

## 6. UI

### 6.1 银行浮层（版式 C → C2：右列按产品页分支）

底板 / 左列 / 角标 / 关闭键**不变**；左列由 3 行扩为 **4 行**（新增「保证金」，y0 344 → 4 行 344..528，仍落在 300..600 内）。

- **存款页**（D39）：右列 = 示数条（`ui.amount`，186×30 @ 中心 277/348）+ **数字键盘**（`ui.key` ×12，56×34，3 列 × 4 行，x0 = 187，y0 = 370 → 370..524）+ 快捷档 3 枚（`+100 / +500 / +1000`，y 530..554）+ **两枚确认键并排**（`存入 ￥X` 主键 / `取出 ￥X` 次键，各 89×24 @ y 560..584，**< 606**）。
  键盘布局：`1 2 3 / 4 5 6 / 7 8 9 / 清空 0 ⌫`。上限 = `存入` 用现金、`取出` 用存款，确认时截断；金额为 0 时两键均禁用。
- **保证金页**（D40/D41）：右列 = 4 行文案（借款 / 持仓市值 / 爆仓线 / 距爆仓）+ 主键「现金追加」（走键盘金额）+ 次键「抵押补仓」（一键全额，`atBank && margin && 有可抵押地块` 才可点）。

> 新增 2 个注册元素：`ui.amount`（示数条）、`ui.key`（键盘按键）；均需登记 `registry.ts` + `public/skins/default/skin.json` + `tools/registry-ids.json`。

### 6.2 股票浮层角标警示（D40）

保证金存在且 `市值 < 借款 × 1.5` 时，`ui.badge` 文案改为 `⚠爆仓 N%`（N = `round((市值 − 爆仓线) / 爆仓线 × 100)`，负数显 `已爆仓`），并走警示色；否则维持现状。**不新增元素、不改版式**。

### 6.3 HUD 债务条（D40）

`bankDebtView.debt` 并入 `p.margin?.principal ?? 0`；段数与宽度不变。

### 6.4 道具商店（D46）

改用 `showcase.panelTall`；左列 11 行（`PANEL_STORE_ROW_H = 32`，y0 190）；右列详情 + 两枚操作键下移（主 552 / 次 556，均 < 606）。

### 6.5 新闻条（D48）

`newsTickerSpecOf` 文案前缀加景气度：`景气 105% · 利好 · 消费回暖，全城租金水涨船高`。

## 7. AI（`src/core/ai.ts`）

| 场景 | 策略 |
| --- | --- |
| 存款 | 既有 `pickBank` 的存款分支改用**金额**（保留 `START_CASH` 之外的保留线，不再全额） |
| 保证金 | 新分支：`p.margin && 市值 < 借款 × 1.3` 时，优先 `addMargin(undefined, 'cash')`；现金不足且站银行格 → `addMargin(undefined, 'mortgage')` |
| 新道具 | `subsidy` / `boom` 抽到即可用（加入 `settledPlan` 的用牌候选，`priority` 决定的顺序）；`taxShield` **不出牌**（被动） |
| 商店 | 目录扩容后 `ai-store` 的候选集自动含新 3 项；沿用既有「持有即不买」规则 |

## 8. 验收

| 项 | 方式 | 通过标准 |
| --- | --- | --- |
| 确定性 | 新增 `test/core/cycle.spec.ts` / `test/core/news.spec.ts` | 同 seed 两次 `rollNews` / `nextEconomyIndex` 逐值相同；源码闸门 `test/smoke.spec.ts` 仍禁 `Math.random` |
| 金额键盘 | `test/ui/panels-bank.spec.ts` | 键盘 12 键 + 3 快捷档 + 1 确认键共 16 个命中区，全部 `y < 606`；`data-action` 与金额解析纯函数可测 |
| 爆仓提示 | `test/core/game-margin.spec.ts` | `addMargin('cash'/'mortgage')` 记账逐值可验；`margin` 归零即 `null`；`mortgage` 生成一笔 `mortgages` |
| 景气度 | `test/core/game-economy.spec.ts` | `economyIndex` 夹在 `[0.7, 1.3]`；租金 = `round(base × index)`；`INDEX = 1` 时逐值回旧口径 |
| 查税 | 同上 | `auditChanceOf(1000) = 0.2`；`chance = 0` 不消耗 rng；`taxShield` 命中才消耗；补税走 `settleDebt` |
| 新闻公平 | `test/core/news.spec.ts` | 最近 4 条不重复；同向第 4 条必反向；表内 id 全覆盖且不越界 |
| 商店版式 | `test/ui/panels-store.spec.ts` | 11 行全部落在 190..542；两枚操作键 `y < 606` |
| 渲染 | `npm run check`（含 `check-hardcoded` / `lint:skin`） | 裸值只在 L4 内建兜底；新元素三处登记齐全 |
| 取证 | `local/mono-shots-m205.mjs` | 手机视口 390×844 @dpr2，`errors: []`；覆盖 存款键盘 / 保证金页 / 商店 11 项 / 新闻条景气 |
| 手册 | `monopoly/docs/manual-mono.md` | 追加 M20.5 专节并引用截图 |
| 收尾 | `npm run deploy` → `npm run check:prod` | 7 步绿；线上 gate 全 true |

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 新增 `ui.key` / `ui.amount` 两元素 → 皮肤三处登记遗漏 | 与 M20.4 同法：`registry.ts` + `public/skins/default/skin.json` + `tools/registry-ids.json` 三处同改，`test/skin/registry.spec.ts` 兜底 |
| 银行左列 3 → 4 行与右列按钮 / 关闭键重叠 | 4 行 y 344..528；右列主键 560..594、关闭键 307..329，x 区间不重叠（左列 20..172 / 右列 187..370） |
| 景气度进租金 ⇒ 既有租金断言全崩 | `ECON_INDEX_START = 1.0` ⇒ 单轮用例逐值不变；跨轮用例按新口径更新（预期内） |
| 新闻公平抽取改变既有 `news` 序列 | 属**有意行为变更**；同步更新 M20.4 的新闻断言，spec 中已记录 |
| 查税大额补税诱发意外破产 | 补税上限即 30% 单轮租金，且走既有清算链；`AUDIT_RATE` 可通过皮肤数值调档 |
| 商店 11 行挤压右列详情 | 详情折行宽 `PANEL_STORE_LINE_W` 不变、行数由 `storeDetail` 控制（≤5 行），右列仍有 190..540 空间 |
