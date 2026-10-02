/**
 * M5 浮层（spec §3.6 / §5.3 / §5.5）：手牌 6 槽 / 股票盘 / 抽卡翻牌 / 结算面板 + M19-D2 选目标预演条。
 *
 * 「状态 → 视图」全部做成**纯函数**（`handSlots` / `stockRows` / `drawCard` / `settlePanel` / `panelSpecs` /
 * `panelHitAreas`），脱离 DOM 与引擎即可单测；`mountPanels` 只负责透明 DOM 命中层与重画触发。
 * 可见像素一律由 `panelSpecs` 产出的 ElementSpec（注册表元素）画在画布上——符合 spec §3.6「可见元素可换素材」，
 * 与 `Hud.ts` 同为「透明层 + `data-action`」约定（像素拾取不放 Pixi 里做）。
 *
 * 浮层可见性：由 `overlayOf` 从状态派生（拍卖 > 结算 > 银行 > 股票盘 > 抽卡翻牌 > 无），天然满足 `?play=1` 默认收起。
 */
import { PLAYER_NAME, RING_SIZE, brandAt } from '../data/board';
import { ITEM_CARDS, type ItemCardKind } from '../data/cards';
import { LEVERAGES, LOT_TIERS, MARGIN_UNLOCK_ROUND, STOCKS, STOCK_TILE_INDEX, type LotTier } from '../data/stocks';
import { lotShares } from '../core/stocks';
import {
  BANK_DEPOSIT_BONUS, BANK_TILE_INDEX, DEPOSIT_RATE, LOAN_NET_RATIO, LOAN_RATE, LOAN_TERM,
  MORTGAGE_LTV, MORTGAGE_RATE, MORTGAGE_TERM,
} from '../data/bank';
import { loanLimitOf, mortgageLimitOf } from '../core/bank';
import { priceOf, resaleOf } from '../core/item-shop';
import { creditLocked, currentPlayer, netWorth, winnerOf, type Game, type GameState, type PendingAuction } from '../core/game';
import { STORE_CATALOG } from '../data/item-shop';
import { previewFor, type PickKind } from '../core/targeting';
import type { ElementSpec } from '../skin/instantiate';
import {
  HUD_QK_H, HUD_QK_W,
  PANEL_BADGE_DRAW_Y, PANEL_BADGE_Y,
  PANEL_BANK_BTN2_W, PANEL_BANK_BTN2_X, PANEL_BANK_BTN2_Y, PANEL_BANK_BTN_H,
  PANEL_BANK_BTN_W, PANEL_BANK_BTN_X, PANEL_BANK_BTN_Y, PANEL_BANK_CLOSE_X, PANEL_BANK_CLOSE_Y,
  PANEL_BANK_DETAIL_CX, PANEL_BANK_LINE_DY, PANEL_BANK_LINE_Y0,
  PANEL_BANK_ROW_GAP, PANEL_BANK_ROW_H, PANEL_BANK_ROW_W, PANEL_BANK_ROW_X, PANEL_BANK_ROW_Y0,
  PANEL_BID_CARD_CX, PANEL_BID_CARD_CY, PANEL_BID_CARD_S, PANEL_BID_H,
  PANEL_BID_S, PANEL_BID_STEP, PANEL_BID_W, PANEL_BID_X, PANEL_BID_Y0,
  PANEL_BULLBEAR_CANCEL_X, PANEL_BULLBEAR_CANCEL_Y, PANEL_BULLBEAR_DIR_GAP, PANEL_BULLBEAR_DIR_X0,
  PANEL_BULLBEAR_DIR_Y, PANEL_BULLBEAR_ROW_Y,
  PANEL_CANCEL_W, PANEL_CANCEL_X,
  PANEL_CARD_CX, PANEL_CARD_CY, PANEL_CARD_S,
  PANEL_CHART_H, PANEL_CHART_W, PANEL_CHART_X, PANEL_CHART_Y, PANEL_CLOSE_H, PANEL_CLOSE_W,
  PANEL_CLOSE_X, PANEL_CLOSE_Y, PANEL_CX, PANEL_DEBT_CX, PANEL_DEBT_CY, PANEL_DRAW_X, PANEL_DRAW_Y,
  PANEL_HAND_BAR_H, PANEL_HAND_BAR_W, PANEL_HAND_BAR_Y, PANEL_HAND_Y,
  PANEL_PREVIEW_W, PANEL_PREVIEW_X,
  PANEL_ROW_H, PANEL_ROW_W, PANEL_ROW_X, PANEL_SETTLE_ROW_GAP,
  PANEL_SETTLE_ROW_H, PANEL_SETTLE_ROW_Y, PANEL_SLOT_GAP, PANEL_SLOT_H, PANEL_SLOT_W,
  PANEL_SLOT_X0, PANEL_STOCK_BUY_Y, PANEL_STOCK_LEV_GAP, PANEL_STOCK_LEV_X0, PANEL_STOCK_LEV_Y,
  PANEL_STOCK_ROW_GAP, PANEL_STOCK_ROW_Y, PANEL_STOCK_SELL_Y,
  PANEL_STOCK_TIER_GAP, PANEL_STOCK_TIER_H, PANEL_STOCK_TIER_S, PANEL_STOCK_TIER_W,
  PANEL_STOCK_TIER_X0, PANEL_STOCK_Y, PANEL_STORE_DESC_DY, PANEL_STORE_LINE_W, PANEL_STORE_ROW_GAP,
  PANEL_STORE_ROW_H, PANEL_STORE_ROW_Y0,
  PANEL_X, PANEL_Y, STAGE_W,
} from '../skin/layout';

/** 浮层动作位（DOM 命中层 `data-action`；`data-target` 给目标格号 / 股票代码 / 银行产品 / 出价金额） */
export type PanelActionId =
  | 'card:bomb' | 'card:barrier' | 'card:teleport' | 'card:doubleRent' | 'card:demolish'
  /* M20.3-B 涨跌卡（spec §6.2）：展开选方向浮层（非选目标态）；`card:dividend` 无专用动作，走通用兜底 */
  | 'card:bullBear'
  | 'card:cancel'
  | 'stock:buy' | 'stock:sell' | 'stock:select' | 'stock:lev' | 'card:close' | 'settle:close'
  /* M20.3-B 涨跌卡浮层（spec §6.2）：方向分段（`target = 'up'|'down'`）+ 逐行选标的（`target = code`）+ 取消 */
  | 'bullbear:dir' | 'bullbear:pick' | 'bullbear:cancel'
  | 'auction:bid' | 'auction:pass'
  /* M20.2 银行信贷（spec §3.8）：选中产品行 + 六个 API + 关闭 */
  | 'bank:select' | 'bank:deposit' | 'bank:withdraw' | 'bank:borrow' | 'bank:repay'
  | 'bank:mortgage' | 'bank:redeem' | 'bank:close'
  /* M20.3 道具商店（spec §5.4）：选中商品行 + 买 / 卖 + 关闭（`data-target` 一律给 kind） */
  | 'store:select' | 'store:buy' | 'store:sell' | 'store:close';

/** M19-D2 选目标态（view → 纯函数的入参；`hovered` 为当前悬停/预选候选格号）；M20.1 增 `sell` 口径 */
export interface TargetingView {
  kind: PickKind;
  hovered: number | null;
}

/** M20.2 银行浮层 UI 态（`main.ts` 持有；`sel` = 左列选中行） */
export interface BankUiState {
  open: boolean;
  sel: BankProductKind;
}

/** M20.3 商店浮层 UI 态（`main.ts` 持有；`sel` = 左列选中商品） */
export interface StoreUiState {
  open: boolean;
  sel: ItemCardKind;
}

/** M20.3-B 股票浮层 UI 态（`main.ts` 持有；`sel` = 逐行选中的标的代码，`lev` = 杠杆倍数，1 = 不加杠杆）。
 *  与 `BankUiState` / `StoreUiState` 同规打包成一个参数，避免 `panelSpecs` / `panelHitAreas` 再摊两个位置参数。 */
export interface StockUiState {
  sel: string;
  lev: number;
}

/** 股票浮层 UI 态缺省值（选中首支标的、不加杠杆）——两处调用点共用，避免字面量漂移 */
export const STOCK_UI_DEFAULTS: StockUiState = { sel: STOCKS[0].code, lev: 1 };

/** M20.3-B 涨跌卡浮层 UI 态（`main.ts` 持有；`open` = 是否展开，`dir` = 押涨 / 押跌，默认押涨） */
export interface BullbearUiState {
  open: boolean;
  dir: 'up' | 'down';
}

/** 涨跌卡浮层 UI 态缺省值（收起、押涨） */
export const BULLBEAR_UI_DEFAULTS: BullbearUiState = { open: false, dir: 'up' };

/** 方向分段（押涨 / 押跌）——可见键与命中区同源一份，避免标签漂移 */
export function bullbearDirs(): { dir: 'up' | 'down'; label: string }[] {
  return [{ dir: 'up', label: '押涨' }, { dir: 'down', label: '押跌' }];
}

/** 浮层可见态（优先级：拍卖 > 结算 > 银行 > 商店 > 股票盘 > 涨跌卡 > 抽卡翻牌；无 → null） */
export type OverlayKind = 'auction' | 'settle' | 'bank' | 'store' | 'stock' | 'bullbear' | 'draw';

/* —— 目标解析（「可点性」真源） —— */

/** 炸弹 / 拆迁令可点性基准：序号最小的**对手**地块（无 → undefined） */
export function firstFoeTile(state: GameState): number | undefined {
  const me = state.players[state.current].id;
  const foes = Object.keys(state.estates)
    .map(Number)
    .filter((i) => state.estates[i].owner !== me)
    .sort((a, b) => a - b);
  return foes.length > 0 ? foes[0] : undefined;
}

/* —— 手牌 —— */

export interface HandSlotView {
  kind: ItemCardKind;
  name: string;
  /** 常用度排序键（`ITEM_CARDS.priority`，小 = 更常用）；随视图透出便于单测与调试 */
  priority: number;
  held: boolean;
  enabled: boolean;
}

/**
 * 手牌槽可点性（口径：与 `game.useCard` 的边界一致，引擎是权威，UI 不加更严的阶段门）：
 * - `pardon` 被动卡：不可主动点；
 * - `teleport` 只在 `rolled`（已掷骰待前进）时可替换移动；
 * - `bomb` / `demolish` 需存在对手地块；`barrier` 需还有空格可设；
 * - `doubleRent` 任意阶段可开。
 */
export function cardEnabled(kind: ItemCardKind, state: GameState): boolean {
  const i = state.current;
  if (!(state.hands[i] ?? []).includes(kind)) return false;
  if (kind === 'pardon') return false;
  if (kind === 'teleport') return state.phase === 'rolled';
  if (kind === 'bomb' || kind === 'demolish') return firstFoeTile(state) !== undefined;
  if (kind === 'barrier') return Object.keys(state.barriers).length < RING_SIZE;
  return true;
}

/**
 * 手牌槽（M20.3 spec §4.1 **三键稳定排序**）：
 * ① `held` 降序（持有在前，未持有点过后仍占位但淡显在后）；
 * ② `priority` 升序（常用在前，口径见 `cards.ts`）；
 * ③ `ITEM_CARDS` 表序升序兜底（保证全序、零随机——`sort` 本身稳定，此处显式写出以便阅读与断言）。
 */
export function handSlots(state: GameState): HandSlotView[] {
  const hand = state.hands[state.current] ?? [];
  const heldRank = (kind: ItemCardKind): number => (hand.includes(kind) ? 0 : 1);
  return ITEM_CARDS
    .map((c, order) => ({ c, order }))
    .sort((a, b) => {
      const h = heldRank(a.c.kind) - heldRank(b.c.kind);
      if (h !== 0) return h;
      if (a.c.priority !== b.c.priority) return a.c.priority - b.c.priority;
      return a.order - b.order;
    })
    .map(({ c }) => ({
      kind: c.kind,
      name: c.name,
      priority: c.priority,
      held: hand.includes(c.kind),
      enabled: cardEnabled(c.kind, state),
    }));
}

/** 手牌行版式：槽集合 + 内容宽 + 最大滚动量 + 可见槽下标（M20.3 spec §4.2） */
export interface HandLayoutView {
  /** 已按三键排序的槽（下标即槽位，与 `visible` 同一坐标系） */
  slots: HandSlotView[];
  /** 全部槽铺开的总宽（`n·W + (n−1)·GAP`；n = 0 时 0） */
  contentW: number;
  /** `max(0, contentW − STAGE_W)`；为 0 表示一屏放得下、无需滑动 */
  maxScroll: number;
  /** **已 clamp 到 `[0, maxScroll]`** 的滚动量：渲染与命中区必须用它，避免两处各自 clamp 出偏差 */
  scroll: number;
  /** 与舞台有交集的槽下标（半露也算可见；完全在 `[0, STAGE_W]` 之外的不入画、不可点） */
  visible: number[];
}

/**
 * 手牌行版式（纯函数）。可见判据 = 槽的 `[cx−W/2, cx+W/2]` 与 `[0, STAGE_W]` 有交集，
 * 即 `cx ∈ ( −W/2, STAGE_W + W/2 )`；半露的槽照常产出，由画布自身裁掉溢出部分。
 */
export function handLayout(state: GameState, scroll = 0): HandLayoutView {
  const slots = handSlots(state);
  const n = slots.length;
  const contentW = n === 0 ? 0 : n * PANEL_SLOT_W + (n - 1) * PANEL_SLOT_GAP;
  const maxScroll = Math.max(0, contentW - STAGE_W);
  const s = Math.min(Math.max(scroll, 0), maxScroll);
  const visible: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = handSlotCx(i, 0) - s;
    if (cx > -PANEL_SLOT_W / 2 && cx < STAGE_W + PANEL_SLOT_W / 2) visible.push(i);
  }
  return { slots, contentW, maxScroll, scroll: s, visible };
}

/** 滑动条视图（`ui.handBar` 的入画数据）；一屏放得下 → `null`（元素不入画） */
export function handBarView(state: GameState, scroll = 0): { ratio: number; offset: number } | null {
  const { contentW, maxScroll, scroll: s } = handLayout(state, scroll);
  if (maxScroll <= 0 || contentW <= 0) return null;
  return { ratio: STAGE_W / contentW, offset: s / maxScroll };
}

/* —— 股票盘 —— */

export interface StockRowView {
  code: string;
  name: string;
  price: number;
  /** 涨跌 = 现价 − 发行价（`STOCKS[].price0`）；口径定死：演示盘只做发行价基线，不做分时快照 */
  change: number;
  shares: number;
  value: number;
  /** 是否为当前选中标的（版式 A 靠它高亮整行；恰有一行为 true） */
  selected: boolean;
}

export function stockRows(state: GameState, sel: string = STOCKS[0].code): StockRowView[] {
  const pf = state.portfolios[state.current] ?? {};
  return STOCKS.map((d) => {
    const price = state.quotes[d.code] ?? d.price0;
    const shares = pf[d.code]?.shares ?? 0;
    return {
      code: d.code, name: d.name, price, change: price - d.price0,
      shares, value: shares * price, selected: d.code === sel,
    };
  });
}

/** 单支标的的账户口径（spec §6.1）：行情 + 持仓 + 现金 + 保证金借入本金，UI 一律从这里读、不另算 */
export interface StockDetailView {
  code: string;
  name: string;
  price: number;
  change: number;
  shares: number;
  value: number;
  /** 累计买入成本（只计自有资金，与 `game.trade` 杠杆买入的口径一致） */
  cost: number;
  cash: number;
  /** 保证金借入本金（无杠杆 → 0）；走势图角标据此提示「借款 ￥N」 */
  margin: number;
}

export function stockDetail(state: GameState, code: string): StockDetailView {
  const def = STOCKS.find((d) => d.code === code) ?? STOCKS[0];
  const p = currentPlayer(state);
  const price = state.quotes[def.code] ?? def.price0;
  const h = state.portfolios[p.id - 1]?.[def.code] ?? null;
  const shares = h?.shares ?? 0;
  return {
    code: def.code, name: def.name, price, change: price - def.price0,
    shares, value: shares * price, cost: h?.cost ?? 0,
    cash: p.cash, margin: p.margin?.principal ?? 0,
  };
}

/* —— 数量档（M20.3-B spec §6.1：买 / 卖各三档）—— */

/** 三档序列：`1 手 / 5 手 / 全仓`（前两档定值来自 `LOT_TIERS`，第三档按可用量推导） */
export const TIER_SEQ: LotTier[] = [...LOT_TIERS, 'all'];

/** `data-target` 第二段的档位编码（整数档写数字，全仓写 `all`） */
export function tierKey(tier: LotTier): string {
  return tier === 'all' ? 'all' : String(tier);
}

/** `tierKey` 的逆：`data-target` 第二段 → 数量档（`'all'` 原样；坏值／非正回落到 1 手，成交仍受 `tierShares` clamp） */
export function parseTierKey(raw: string): LotTier {
  if (raw === 'all') return 'all';
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * 档位 → 实际成交股数（买 / 卖共用；`main.ts` 点击时用同一函数换算，杜绝「UI 显示的与成交的不一致」）。
 * **不可用即 0**：定值档在可用量不足时返回 0（而不是悄悄减量），部分量只有「全仓」一档出口。
 * 杠杆买入按 `game.trade` 的 `own = ⌈成本 / 倍数⌉ ≤ 现金` 折成等效现金上界 `⌊现金 × 倍数 / 现价⌋`。
 */
export function tierShares(
  state: GameState, code: string, side: 'buy' | 'sell', tier: LotTier, leverage = 1,
): number {
  const d = stockDetail(state, code);
  const cash = side === 'buy' ? d.cash * Math.max(1, leverage) : d.cash;
  const cap = lotShares(tier, d.price, cash, d.shares, side);
  return tier === 'all' ? cap : (cap >= tier ? tier : 0);
}

export interface StockTierView {
  tier: LotTier;
  label: string;
  /** 成交股数；0 = 该档不可用 */
  shares: number;
  enabled: boolean;
}

/** 三档视图：`enabled ⟺ shares > 0`（**定值档不足即整档禁用**——持 3 股时「卖 5 手」禁用，不是悄悄卖 3 股） */
export function stockTiers(
  state: GameState, code: string, side: 'buy' | 'sell', leverage = 1,
): StockTierView[] {
  const verb = side === 'buy' ? '买' : '卖';
  return TIER_SEQ.map((tier) => {
    const shares = tierShares(state, code, side, tier, leverage);
    return {
      tier,
      label: tier === 'all' ? `${verb}全仓` : `${verb} ${tier} 手`,
      shares,
      enabled: shares > 0,
    };
  });
}

/** 三档按键的左上角 x（买 / 卖同列居中；370 宽内 3×105 + 2×8 = 331） */
export function tierX(i: number): number {
  return PANEL_STOCK_TIER_X0 + i * (PANEL_STOCK_TIER_W + PANEL_STOCK_TIER_GAP);
}

/** 杠杆分段的段位（1 = 不加杠杆 / 2× / 3×；段间用 `ui.qk` 的 `enabled` 表选中态） */
export function leverageChips(): { lev: number; label: string }[] {
  return [{ lev: 1, label: '无' }, ...LEVERAGES.map((l) => ({ lev: l, label: `${l}×` }))];
}

/* —— 抽卡翻牌 —— */

export interface DrawCardView {
  deck: 'fate' | 'chance';
  cardId: string;
  title: string;
  text: string;
}

/** 最近一次抽卡；标题/文案来自 `cards.ts` 数据（UI 不写死文案） */
export function drawCard(state: GameState): DrawCardView | null {
  const d = state.lastDraw;
  return d ? { deck: d.deck, cardId: d.cardId, title: d.title, text: d.text } : null;
}

/* —— 结算面板 —— */

export interface SettleRowView {
  rank: number;
  player: number;
  name: string;
  worth: number;
  winner: boolean;
}

export interface SettlePanelView {
  round: number;
  winner: number;
  rows: SettleRowView[];
}

/** 终局结算面板（净资产降序，含破产玩家）；未结束 → null */
export function settlePanel(state: GameState): SettlePanelView | null {
  if (!state.over) return null;
  const winner = winnerOf(state) ?? 0;
  const rows = state.players
    .map((p) => ({ p, worth: netWorth(state, p) }))
    .sort((a, b) => b.worth - a.worth || a.p.id - b.p.id)
    .map((r, i) => ({
      rank: i + 1, player: r.p.id, name: PLAYER_NAME[r.p.id - 1], worth: r.worth, winner: r.p.id === winner,
    }));
  return { round: state.round, winner, rows };
}

/* —— 破产拍卖（M20.1）—— */

/** 三档出价：起拍价 / ×1.5 / ×2.4（四舍五入到元）；现金低于档位 → 该档禁用 */
export function auctionBidTiers(startPrice: number, cash: number): { amount: number; label: string; enabled: boolean }[] {
  const amounts = [startPrice, Math.round(startPrice * 1.5), Math.round(startPrice * 2.4)];
  return amounts.map((amount) => ({ amount, label: `￥${amount}`, enabled: cash >= amount }));
}

/** 债务条口径：待清偿 = 欠款；已筹 = Σ已落槌价；还差 = max(0, 待清偿 − 已筹) */
export function auctionDebtView(a: PendingAuction): { total: number; raised: number; remain: number } {
  const raised = a.results.reduce((sum, r) => sum + r.price, 0);
  return { total: a.amount, raised, remain: Math.max(0, a.amount - raised) };
}

/** 当前应展开的浮层（未结算 / 无触发 → null，即默认收起）；待拍态优先于一切浮层。
 *  M20.2：`opts.bankOpen` 为真且未结束时返回 `'bank'`（银行键在 idle / settled 均可开）
 *  M20.3：`opts.storeOpen` 紧随其后（商店同为常驻 HUD 入口，与银行互斥，只开一个）
 *  M20.3-B：`opts.bullbearOpen` 夹在股票盘与抽卡之间（手牌打涨跌卡 → 展开选方向与标的，随时可开） */
export function overlayOf(
  state: GameState,
  opts: { bankOpen?: boolean; storeOpen?: boolean; bullbearOpen?: boolean } = {},
): OverlayKind | null {
  if (state.auction) return 'auction';
  if (state.over) return 'settle';
  if (opts.bankOpen) return 'bank';
  if (opts.storeOpen) return 'store';
  const settled = state.phase === 'settled';
  /* 站在股票交易所（index 19）→ 盘面常开（买卖后仍停留，便于连续操作） */
  if (settled && currentPlayer(state).pos === STOCK_TILE_INDEX) return 'stock';
  if (opts.bullbearOpen) return 'bullbear';
  if (settled && state.lastDraw) return 'draw';
  return null;
}

/* —— M20.2 银行信贷浮层（版式 C：左列表右详情；spec §3.8） —— */

/** 三条产品线（左列三行） */
export type BankProductKind = 'deposit' | 'loan' | 'mortgage';

/** 利率/比例 → 百分数整数（`0.03*100 = 3.0000000000000004`，故必须取整） */
const pct = (ratio: number): number => Math.round(ratio * 100);

export interface BankRowView {
  kind: BankProductKind;
  title: string;
  /** 摘要（如 `￥1,240` / `无债务` / `2 块锁定`） */
  summary: string;
  selected: boolean;
}

export interface BankButtonView {
  label: string;
  enabled: boolean;
}

export interface BankDetailView {
  kind: BankProductKind;
  title: string;
  /** 数值行（渲染为 `ui.bankRow` 的 line 变体） */
  lines: string[];
  /** 主操作键（存入 / 借款 / 抵押） */
  primary: BankButtonView;
  /** 次操作键（取出 / 还款 / 赎回） */
  secondary: BankButtonView;
}

/** 债务条口径（HUD 与浮层共用）；`overdue` = 所有债务书中最大逾期轮数 */
export interface BankDebtView {
  deposit: number;
  debt: number;
  mortgageCount: number;
  overdue: number;
}

/** 首个可抵押地块序号（自有 + 未施工 + 未被抵押；升序）；无 → undefined */
export function firstMortgageableTile(state: GameState): number | undefined {
  const me = currentPlayer(state).id;
  const list = Object.keys(state.estates)
    .map(Number)
    .filter((i) => state.estates[i].owner === me && !state.estates[i].processing && !creditLocked(state, i))
    .sort((a, b) => a - b);
  return list.length > 0 ? list[0] : undefined;
}

/** 左侧三行摘要（选中态由 UI 态的 `selected` 传入） */
export function bankRows(state: GameState, selected: BankProductKind = 'deposit'): BankRowView[] {
  const p = currentPlayer(state);
  const rows: { kind: BankProductKind; title: string; summary: string }[] = [
    { kind: 'deposit', title: '存款', summary: p.deposit > 0 ? `￥${p.deposit}` : '无存款' },
    { kind: 'loan', title: '信用贷款', summary: p.loan ? `欠 ￥${p.loan.principal}` : '无债务' },
    { kind: 'mortgage', title: '抵押', summary: p.mortgages.length > 0 ? `${p.mortgages.length} 块锁定` : '无抵押' },
  ];
  return rows.map((row) => ({ ...row, selected: row.kind === selected }));
}

/** 债务条口径（HUD 顶部条与浮层共用） */
export function bankDebtView(state: GameState, playerId: number): BankDebtView {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { deposit: 0, debt: 0, mortgageCount: 0, overdue: 0 };
  const debt = (p.loan?.principal ?? 0) + p.mortgages.reduce((sum, m) => sum + m.principal, 0);
  const overdue = Math.max(p.loan?.overdue ?? 0, ...p.mortgages.map((m) => m.overdue), 0);
  return { deposit: p.deposit, debt, mortgageCount: p.mortgages.length, overdue };
}

/** 右侧详情（数值行 + 两枚操作键可点性）；可点性与引擎六 API 的边界一致 */
export function bankDetail(state: GameState, kind: BankProductKind): BankDetailView {
  const p = currentPlayer(state);
  const atBank = p.pos === BANK_TILE_INDEX;
  if (kind === 'deposit') {
    return {
      kind,
      title: '存款',
      lines: [
        `存款余额 ￥${p.deposit}`,
        `可用现金 ￥${p.cash}`,
        `轮息 +${pct(DEPOSIT_RATE)}%（轮末复利）`,
        `落 9 号格领红包 ${pct(BANK_DEPOSIT_BONUS)}%`,
      ],
      primary: { label: '存入', enabled: p.cash > 0 },
      secondary: { label: '取出', enabled: p.deposit > 0 },
    };
  }
  if (kind === 'loan') {
    const limit = loanLimitOf(netWorth(state, p));
    const lines = p.loan
      ? [
          `本金 ￥${p.loan.principal}`,
          `利率 ${pct(LOAN_RATE)}%/轮 · 期限 ${LOAN_TERM} 轮`,
          `到期 第 ${p.loan.due} 轮 · 逾期 ${p.loan.overdue} 轮`,
          `可用现金 ￥${p.cash}`,
        ]
      : [
          `可借额度 ￥${limit}`,
          `利率 ${pct(LOAN_RATE)}%/轮 · 期限 ${LOAN_TERM} 轮`,
          `额度 = 净资产 × ${pct(LOAN_NET_RATIO)}%`,
          '首轮免息 · 须站在 9 号格',
        ];
    return {
      kind,
      title: '信用贷款',
      lines,
      primary: { label: '借款', enabled: atBank && p.loan === null && limit > 0 },
      secondary: { label: '还款', enabled: p.loan !== null && p.cash > 0 },
    };
  }
  const tile = firstMortgageableTile(state);
  const first = p.mortgages[0];
  return {
    kind,
    title: '抵押',
    lines: [
      `抵押块数 ${p.mortgages.length}`,
      `利率 ${pct(MORTGAGE_RATE)}%/轮 · 期限 ${MORTGAGE_TERM} 轮`,
      `成数 ${pct(MORTGAGE_LTV)}% 变卖价`,
      tile === undefined
        ? '无可抵押地块 · 须站在 9 号格'
        : `可抵押 ${brandAt(tile)}（借 ￥${mortgageLimitOf(state.estates, tile)}）`,
    ],
    primary: { label: '抵押', enabled: atBank && tile !== undefined },
    secondary: { label: '赎回', enabled: first !== undefined && p.cash >= first.principal },
  };
}

/* —— M20.3 道具商店浮层（版式 100% 复用银行 C：左列商品行 + 右列详情 + 两枚操作键）—— */

export interface StoreRowView {
  kind: ItemCardKind;
  title: string;
  /** 摘要：`￥售价 · 持有|—` */
  summary: string;
  price: number;
  resale: number;
  owned: boolean;
  selected: boolean;
}

export interface StoreDetailView {
  kind: ItemCardKind;
  title: string;
  /** 首行是用途描述（右列折行显示，故占两行高度），其后为 售价/回收 · 持有 · 现金 */
  lines: string[];
  primary: BankButtonView;
  secondary: BankButtonView;
}

/**
 * 商店左列（M20.3 spec §5.4）：**顺序恒等 `STORE_CATALOG`，不因持有与否移动**。
 * 若列表按「未持有优先」重排，买入后同一位置的下一项会顶上来，点击目标漂移、极易误买。
 */
export function storeRows(state: GameState, selected?: ItemCardKind): StoreRowView[] {
  const hand = state.hands[state.current] ?? [];
  return STORE_CATALOG.map((p) => {
    const owned = hand.includes(p.kind);
    return {
      kind: p.kind,
      title: ITEM_CARDS.find((c) => c.kind === p.kind)?.name ?? p.kind,
      summary: `￥${p.price} · ${owned ? '持有' : '—'}`,
      price: p.price,
      resale: resaleOf(p.price),
      owned,
      selected: p.kind === selected,
    };
  });
}

/** 商店右列详情（4 行文本 + 两枚操作键）；可点性与引擎 `buyItem` / `sellItem` 的边界一致 */
export function storeDetail(state: GameState, kind: ItemCardKind): StoreDetailView {
  const p = currentPlayer(state);
  const hand = state.hands[state.current] ?? [];
  const price = priceOf(kind) ?? 0;
  const resale = resaleOf(price);
  const owned = hand.includes(kind);
  const def = ITEM_CARDS.find((c) => c.kind === kind);
  return {
    kind,
    title: def?.name ?? kind,
    lines: [
      def?.desc ?? '',
      `售价 ￥${price} · 回收 ￥${resale}`,
      `持有 ${owned ? 1 : 0} 张`,
      `现金 ￥${p.cash}`,
    ],
    primary: { label: `买入 ￥${price}`, enabled: !owned && p.cash >= price },
    secondary: { label: `卖出 ￥${resale}`, enabled: owned },
  };
}

/* —— 视图组装（pass 4 + 定格台位；c 恒 0，depth = r 递增即绘制序） —— */

/** 手牌行第 i 槽的中心 x（`scroll` = 已 clamp 的横滑量；spec §4.2 版式 A） */
export function handSlotCx(i: number, scroll = 0): number {
  return PANEL_SLOT_X0 + PANEL_SLOT_W / 2 + i * (PANEL_SLOT_W + PANEL_SLOT_GAP) - scroll;
}

export function panelSpecs(
  state: GameState, handOpen = false, sel: TargetingView | null = null,
  bank: BankUiState = { open: false, sel: 'deposit' }, handScroll = 0,
  store: StoreUiState = { open: false, sel: STORE_CATALOG[0].kind },
  stock: StockUiState = STOCK_UI_DEFAULTS,
  bullbear: BullbearUiState = BULLBEAR_UI_DEFAULTS,
): ElementSpec[] {
  const out: ElementSpec[] = [];
  let r = 0;
  const push = (id: string, cx: number, cy: number, st: Record<string, unknown> = {}, s = 1): void => {
    out.push({ id, slot: null, c: 0, r: r++, pass: 4, fixed: { cx, cy, s }, state: st });
  };

  /* M19-D2 选目标态：手牌槽整行换成「预演条 + 取消键」（与手牌槽同中心线，二选一） */
  if (sel !== null) {
    const label = sel.kind === 'sell' ? '自由出售' : (ITEM_CARDS.find((c) => c.kind === sel.kind)?.name ?? sel.kind);
    const previewLines = sel.hovered !== null
      ? previewFor(sel.kind, sel.hovered, state)
      : [label, '点选棋盘上高亮的格作为目标', '点空处或「取消」返回'];
    push('ui.preview', PANEL_PREVIEW_X + PANEL_PREVIEW_W / 2, PANEL_HAND_Y + PANEL_SLOT_H / 2,
      { previewLines });
    push('ui.cancel', PANEL_CANCEL_X + PANEL_CANCEL_W / 2, PANEL_HAND_Y + PANEL_SLOT_H / 2,
      { label: '取消', enabled: true });
  } else if (handOpen) {
    /* 手牌：收进牌袋抽屉，仅展开时入画（spec §7.3；教程期间由 `main.ts` 强制展开）。
       M20.3 版式 A：单行 + 横向滑动，只画与舞台有交集的槽；一屏放不下时补一条 `ui.handBar` */
    const layout = handLayout(state, handScroll);
    for (const i of layout.visible) {
      const slot = layout.slots[i];
      push('ui.handSlot', handSlotCx(i, layout.scroll), PANEL_HAND_Y + PANEL_SLOT_H / 2, {
        name: slot.name, held: slot.held, enabled: slot.enabled,
      });
    }
    const bar = handBarView(state, handScroll);
    if (bar !== null) {
      push('ui.handBar', PANEL_HAND_BAR_W / 2, PANEL_HAND_BAR_Y + PANEL_HAND_BAR_H / 2,
        { ratio: bar.ratio, offset: bar.offset });
    }
  }

  const overlay = overlayOf(state, { bankOpen: bank.open, storeOpen: store.open, bullbearOpen: bullbear.open });
  if (overlay === 'auction' && state.auction) {
    const a = state.auction;
    const lots = a.results.length + a.queue.length;
    const cash = state.players.find((p) => p.id === a.pending[0])?.cash ?? 0;
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: `破产拍卖 · 第 ${a.results.length + 1}/${lots} 块` });
    push('ui.bidDebt', PANEL_DEBT_CX, PANEL_DEBT_CY, auctionDebtView(a));
    push('ui.tileCard', PANEL_BID_CARD_CX, PANEL_BID_CARD_CY,
      { title: brandAt(a.lot.index), sub: `Lv${a.lot.level} · 起拍 ￥${a.lot.startPrice}` }, PANEL_BID_CARD_S);
    auctionBidTiers(a.lot.startPrice, cash).forEach((tier, i) => {
      push('ui.bid', PANEL_BID_X + PANEL_BID_W / 2, PANEL_BID_Y0 + PANEL_BID_H / 2 + i * PANEL_BID_STEP,
        { label: tier.label, enabled: tier.enabled, primary: i === 0 }, PANEL_BID_S);
    });
    push('ui.bid', PANEL_BID_X + PANEL_BID_W / 2, PANEL_BID_Y0 + PANEL_BID_H / 2 + 3 * PANEL_BID_STEP,
      { label: '放弃', enabled: true, primary: false }, PANEL_BID_S);
  } else if (overlay === 'settle') {
    const panel = settlePanel(state);
    if (panel) {
      push('showcase.panel', PANEL_X, PANEL_Y);
      push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '本局结算' });
      panel.rows.forEach((row, i) => {
        push('ui.settleRow', PANEL_ROW_X + PANEL_ROW_W / 2,
          PANEL_SETTLE_ROW_Y + PANEL_SETTLE_ROW_H / 2 + i * (PANEL_SETTLE_ROW_H + PANEL_SETTLE_ROW_GAP),
          { rank: row.rank, name: row.name, worth: row.worth, winner: row.winner });
      });
    }
  } else if (overlay === 'bank') {
    /* 版式 C（spec §3.8）：左列 3 行产品 + 右列详情文本行 + 两枚操作键 + 右上关闭键。
       底板/角标复用既有元素；文本行用 `ui.bankRow` 的 line 变体（只画居中文字，不画底框） */
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '鹿乡银行 · 9 号格' });
    bankRows(state, bank.sel).forEach((row, i) => {
      push('ui.bankRow', PANEL_BANK_ROW_X + PANEL_BANK_ROW_W / 2,
        PANEL_BANK_ROW_Y0 + PANEL_BANK_ROW_H / 2 + i * (PANEL_BANK_ROW_H + PANEL_BANK_ROW_GAP),
        { variant: 'row', title: row.title, summary: row.summary, selected: row.selected });
    });
    const detail = bankDetail(state, bank.sel);
    detail.lines.forEach((line, i) => {
      push('ui.bankRow', PANEL_BANK_DETAIL_CX, PANEL_BANK_LINE_Y0 + i * PANEL_BANK_LINE_DY,
        { variant: 'line', text: line });
    });
    push('ui.button.primary',
      PANEL_BANK_BTN_X + PANEL_BANK_BTN_W / 2, PANEL_BANK_BTN_Y + PANEL_BANK_BTN_H / 2,
      { label: detail.primary.label, enabled: detail.primary.enabled });
    push('ui.button.secondary',
      PANEL_BANK_BTN2_X + PANEL_BANK_BTN2_W / 2, PANEL_BANK_BTN2_Y + PANEL_BANK_BTN_H / 2,
      { label: detail.secondary.label, enabled: detail.secondary.enabled });
    push('ui.qk', PANEL_BANK_CLOSE_X + HUD_QK_W / 2, PANEL_BANK_CLOSE_Y + HUD_QK_H / 2,
      { label: '关闭', enabled: true });
  } else if (overlay === 'store') {
    /* 版式与银行 C 同构：左列商品行（顺序恒等目录）+ 右列详情（首行用途描述折行）+ 两枚操作键 + 关闭键。
       左列行距用商店专用常量（6 项装不进银行的 40/8）；右列 x / 键位全部复用 `PANEL_BANK_*`。 */
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '道具商店' });
    storeRows(state, store.sel).forEach((row, i) => {
      push('ui.bankRow', PANEL_BANK_ROW_X + PANEL_BANK_ROW_W / 2,
        PANEL_STORE_ROW_Y0 + PANEL_STORE_ROW_H / 2 + i * (PANEL_STORE_ROW_H + PANEL_STORE_ROW_GAP),
        { variant: 'row', title: row.title, summary: row.summary, selected: row.selected });
    });
    const detail = storeDetail(state, store.sel);
    let lineY = PANEL_BANK_LINE_Y0;
    detail.lines.forEach((line, i) => {
      /* 首行（用途描述）超出右列净宽，交由 `ui.bankRow` 的 line 变体折行，故其后下移量更大 */
      push('ui.bankRow', PANEL_BANK_DETAIL_CX, lineY,
        i === 0 ? { variant: 'line', text: line, wrapW: PANEL_STORE_LINE_W } : { variant: 'line', text: line });
      lineY += i === 0 ? PANEL_STORE_DESC_DY : PANEL_BANK_LINE_DY;
    });
    push('ui.button.primary',
      PANEL_BANK_BTN_X + PANEL_BANK_BTN_W / 2, PANEL_BANK_BTN_Y + PANEL_BANK_BTN_H / 2,
      { label: detail.primary.label, enabled: detail.primary.enabled });
    push('ui.button.secondary',
      PANEL_BANK_BTN2_X + PANEL_BANK_BTN2_W / 2, PANEL_BANK_BTN2_Y + PANEL_BANK_BTN_H / 2,
      { label: detail.secondary.label, enabled: detail.secondary.enabled });
    push('ui.qk', PANEL_BANK_CLOSE_X + HUD_QK_W / 2, PANEL_BANK_CLOSE_Y + HUD_QK_H / 2,
      { label: '关闭', enabled: true });
  } else if (overlay === 'stock') {
    /* 版式 A（spec §6.1）：底板加高到 330（300..630，不压底坞资产条）。
       自上而下：角标 → 四行标的（可点选中，恰一行高亮）→ 走势图（跟随选中标的）→
       杠杆分段（第 8 轮起才产出）→ 买三档 → 卖三档。台位与 `panelHitAreas` 一一对应。 */
    push('showcase.panelStock', PANEL_X, PANEL_STOCK_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '股票交易所' });
    stockRows(state, stock.sel).forEach((row, i) => {
      push('ui.stockRow', PANEL_ROW_X + PANEL_ROW_W / 2,
        PANEL_STOCK_ROW_Y + PANEL_ROW_H / 2 + i * (PANEL_ROW_H + PANEL_STOCK_ROW_GAP),
        {
          code: row.code, name: row.name, price: row.price, change: row.change,
          shares: row.shares, value: row.value, selected: row.selected,
        });
    });
    const detail = stockDetail(state, stock.sel);
    push('ui.stockChart', PANEL_CHART_X + PANEL_CHART_W / 2, PANEL_CHART_Y + PANEL_CHART_H / 2,
      {
        series: state.priceHistory[detail.code] ?? [detail.price],
        /* 有保证金负债时角标补一句，杠杆局里玩家据此知道自己欠多少 */
        label: detail.margin > 0 ? `${detail.code} 走势 · 借款 ￥${detail.margin}` : `${detail.code} 走势`,
      });
    if (state.round >= MARGIN_UNLOCK_ROUND) {
      leverageChips().forEach((c, i) => {
        push('ui.qk', PANEL_STOCK_LEV_X0 + HUD_QK_W / 2 + i * (HUD_QK_W + PANEL_STOCK_LEV_GAP),
          PANEL_STOCK_LEV_Y + HUD_QK_H / 2, { label: c.label, enabled: c.lev === stock.lev });
      });
    }
    /* 买 / 卖各三档（可见键与 `panelHitAreas` 同源 `stockTiers`，启用判据不会漂） */
    stockTiers(state, stock.sel, 'buy', stock.lev).forEach((t, i) => {
      push('ui.tradeBuy', tierX(i) + PANEL_STOCK_TIER_W / 2, PANEL_STOCK_BUY_Y + PANEL_STOCK_TIER_H / 2,
        { label: t.label, enabled: t.enabled }, PANEL_STOCK_TIER_S);
    });
    stockTiers(state, stock.sel, 'sell').forEach((t, i) => {
      push('ui.tradeSell', tierX(i) + PANEL_STOCK_TIER_W / 2, PANEL_STOCK_SELL_Y + PANEL_STOCK_TIER_H / 2,
        { label: t.label, enabled: t.enabled }, PANEL_STOCK_TIER_S);
    });
  } else if (overlay === 'bullbear') {
    /* 涨跌卡浮层（spec §6.2）：底板复用 370×300；方向分段（押涨 / 押跌，选中态借 `ui.qk` 的 `enabled`：
       金底 = 选中）→ 4 行标的（点即落库，故无选中行）→ 取消键。台位与 `panelHitAreas` 一一对应。 */
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '涨跌卡' });
    bullbearDirs().forEach((d, i) => {
      push('ui.qk', PANEL_BULLBEAR_DIR_X0 + HUD_QK_W / 2 + i * (HUD_QK_W + PANEL_BULLBEAR_DIR_GAP),
        PANEL_BULLBEAR_DIR_Y + HUD_QK_H / 2, { label: d.label, enabled: d.dir === bullbear.dir });
    });
    stockRows(state).forEach((row, i) => {
      push('ui.stockRow', PANEL_ROW_X + PANEL_ROW_W / 2,
        PANEL_BULLBEAR_ROW_Y + PANEL_ROW_H / 2 + i * (PANEL_ROW_H + PANEL_STOCK_ROW_GAP),
        {
          code: row.code, name: row.name, price: row.price, change: row.change,
          shares: row.shares, value: row.value, selected: false,
        });
    });
    push('ui.qk', PANEL_BULLBEAR_CANCEL_X + HUD_QK_W / 2, PANEL_BULLBEAR_CANCEL_Y + HUD_QK_H / 2,
      { label: '取消', enabled: true });
  } else if (overlay === 'draw') {
    const card = drawCard(state);
    if (card) {
      /* 事件卡 ×2 专用高底板（370×480）：角标在上、卡面居中、关闭键在卡面正下方。
         不再复用 B 版式橱窗的夜空 / 天际线 / 广场（那套构图按 370×300 定位，套进 480 会散） */
      push('showcase.panelTall', PANEL_DRAW_X, PANEL_DRAW_Y);
      push('ui.badge', PANEL_CX, PANEL_BADGE_DRAW_Y, { text: card.deck === 'fate' ? '命运' : '机会' });
      push('ui.card', PANEL_CARD_CX, PANEL_CARD_CY, { title: card.title, text: card.text }, PANEL_CARD_S);
      /* 可见关闭键（台位与 `panelHitAreas` 的 `card:close` 完全一致） */
      push('ui.panelClose',
        PANEL_CLOSE_X + PANEL_CLOSE_W / 2, PANEL_CLOSE_Y + PANEL_CLOSE_H / 2,
        { label: '关闭', enabled: true });
    }
  }
  return out;
}

/* —— DOM 命中层 —— */

export interface PanelHit {
  action: PanelActionId;
  /** 目标：手牌给格号（number），股票给 code（string） */
  target?: number | string;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
}

/**
 * 命中区矩形（与 `panelSpecs` 的台位一一对应）。
 * 浮层展开时**只出浮层自己的按钮**（手牌行已被面板盖住，故不再可点），避免命中层与画面错位。
 * M19-D2：选目标态（`sel != null`）整行只出「取消」键——棋盘候选格改由 DOM 命中层反查格号。
 */
export function panelHitAreas(
  state: GameState, handOpen = false, sel: TargetingView | null = null,
  bank: BankUiState = { open: false, sel: 'deposit' }, handScroll = 0,
  store: StoreUiState = { open: false, sel: STORE_CATALOG[0].kind },
  stock: StockUiState = STOCK_UI_DEFAULTS,
  bullbear: BullbearUiState = BULLBEAR_UI_DEFAULTS,
): PanelHit[] {
  const out: PanelHit[] = [];
  if (sel !== null) {
    out.push({
      action: 'card:cancel', x: PANEL_CANCEL_X, y: PANEL_HAND_Y,
      w: PANEL_CANCEL_W, h: PANEL_SLOT_H, enabled: true,
    });
    return out;
  }
  const overlay = overlayOf(state, { bankOpen: bank.open, storeOpen: store.open, bullbearOpen: bullbear.open });
  if (!overlay) {
    /* 抽屉收起时手牌不可点（画面也没画）；牌袋键由 `Hud.ts` 提供 */
    if (!handOpen) return out;
    /* M20.3：手牌键与 `panelSpecs` 同源 `handLayout`，一律减去已 clamp 的滚动量 */
    const layout = handLayout(state, handScroll);
    for (const i of layout.visible) {
      const slot = layout.slots[i];
      out.push({
        action: `card:${slot.kind}` as PanelActionId,
        x: handSlotCx(i, layout.scroll) - PANEL_SLOT_W / 2, y: PANEL_HAND_Y,
        w: PANEL_SLOT_W, h: PANEL_SLOT_H, enabled: slot.enabled,
      });
    }
    return out;
  }
  if (overlay === 'auction' && state.auction) {
    const a = state.auction;
    const cash = state.players.find((p) => p.id === a.pending[0])?.cash ?? 0;
    auctionBidTiers(a.lot.startPrice, cash).forEach((tier, i) => {
      out.push({
        action: 'auction:bid', target: tier.amount,
        x: PANEL_BID_X, y: PANEL_BID_Y0 + i * PANEL_BID_STEP,
        w: PANEL_BID_W, h: PANEL_BID_H, enabled: tier.enabled,
      });
    });
    out.push({
      action: 'auction:pass',
      x: PANEL_BID_X, y: PANEL_BID_Y0 + 3 * PANEL_BID_STEP,
      w: PANEL_BID_W, h: PANEL_BID_H, enabled: true,
    });
  } else if (overlay === 'bank') {
    /* 左列三行（选中）+ 右列两枚操作键 + 关闭键；操作键的动作/目标随选中产品切换 */
    bankRows(state, bank.sel).forEach((row, i) => {
      out.push({
        action: 'bank:select', target: row.kind,
        x: PANEL_BANK_ROW_X, y: PANEL_BANK_ROW_Y0 + i * (PANEL_BANK_ROW_H + PANEL_BANK_ROW_GAP),
        w: PANEL_BANK_ROW_W, h: PANEL_BANK_ROW_H, enabled: true,
      });
    });
    const detail = bankDetail(state, bank.sel);
    const p = currentPlayer(state);
    const primaryAction: PanelActionId =
      bank.sel === 'deposit' ? 'bank:deposit' : bank.sel === 'loan' ? 'bank:borrow' : 'bank:mortgage';
    const secondaryAction: PanelActionId =
      bank.sel === 'deposit' ? 'bank:withdraw' : bank.sel === 'loan' ? 'bank:repay' : 'bank:redeem';
    out.push({
      action: primaryAction,
      /* 抵押键携带待抵押地块格号（引擎 API 需 index） */
      target: bank.sel === 'mortgage' ? firstMortgageableTile(state) : undefined,
      x: PANEL_BANK_BTN_X, y: PANEL_BANK_BTN_Y, w: PANEL_BANK_BTN_W, h: PANEL_BANK_BTN_H,
      enabled: detail.primary.enabled,
    });
    out.push({
      action: secondaryAction,
      /* 赎回键携带最早一笔抵押（引擎按 index 赎） */
      target: bank.sel === 'mortgage' ? p.mortgages[0]?.index : undefined,
      x: PANEL_BANK_BTN2_X, y: PANEL_BANK_BTN2_Y, w: PANEL_BANK_BTN2_W, h: PANEL_BANK_BTN_H,
      enabled: detail.secondary.enabled,
    });
    out.push({
      action: 'bank:close', x: PANEL_BANK_CLOSE_X, y: PANEL_BANK_CLOSE_Y,
      w: HUD_QK_W, h: HUD_QK_H, enabled: true,
    });
  } else if (overlay === 'store') {
    /* 左列商品行（`data-target` = kind）；买入 / 卖出键作用于当前选中项；关闭键 */
    storeRows(state, store.sel).forEach((row, i) => {
      out.push({
        action: 'store:select', target: row.kind,
        x: PANEL_BANK_ROW_X, y: PANEL_STORE_ROW_Y0 + i * (PANEL_STORE_ROW_H + PANEL_STORE_ROW_GAP),
        w: PANEL_BANK_ROW_W, h: PANEL_STORE_ROW_H, enabled: true,
      });
    });
    const detail = storeDetail(state, store.sel);
    out.push({
      action: 'store:buy', target: store.sel,
      x: PANEL_BANK_BTN_X, y: PANEL_BANK_BTN_Y, w: PANEL_BANK_BTN_W, h: PANEL_BANK_BTN_H,
      enabled: detail.primary.enabled,
    });
    out.push({
      action: 'store:sell', target: store.sel,
      x: PANEL_BANK_BTN2_X, y: PANEL_BANK_BTN2_Y, w: PANEL_BANK_BTN2_W, h: PANEL_BANK_BTN_H,
      enabled: detail.secondary.enabled,
    });
    out.push({
      action: 'store:close', x: PANEL_BANK_CLOSE_X, y: PANEL_BANK_CLOSE_Y,
      w: HUD_QK_W, h: HUD_QK_H, enabled: true,
    });
  } else if (overlay === 'draw') {
    out.push({
      action: 'card:close', x: PANEL_CLOSE_X, y: PANEL_CLOSE_Y,
      w: PANEL_CLOSE_W, h: PANEL_CLOSE_H, enabled: true,
    });
  } else if (overlay === 'stock') {
    /* 与 `panelSpecs` 股票分支同源：四行选中（`stock:select`，target = code）+ 杠杆分段 +
       买 / 卖各三档。买 / 卖键的 `data-target` 编码为 `${code}:${tier}`（`tier ∈ '1' | '5' | 'all'`），
       由 `main.ts` 拆开后再走 `tierShares` 换算股数——UI 与成交口径共用同一函数。 */
    stockRows(state, stock.sel).forEach((row, i) => {
      out.push({
        action: 'stock:select', target: row.code,
        x: PANEL_ROW_X, y: PANEL_STOCK_ROW_Y + i * (PANEL_ROW_H + PANEL_STOCK_ROW_GAP),
        w: PANEL_ROW_W, h: PANEL_ROW_H, enabled: true,
      });
    });
    if (state.round >= MARGIN_UNLOCK_ROUND) {
      leverageChips().forEach((c, i) => {
        out.push({
          action: 'stock:lev', target: c.lev,
          x: PANEL_STOCK_LEV_X0 + i * (HUD_QK_W + PANEL_STOCK_LEV_GAP), y: PANEL_STOCK_LEV_Y,
          w: HUD_QK_W, h: HUD_QK_H, enabled: true,
        });
      });
    }
    const enc = (tier: LotTier): string => `${stock.sel}:${tierKey(tier)}`;
    stockTiers(state, stock.sel, 'buy', stock.lev).forEach((t, i) => {
      out.push({
        action: 'stock:buy', target: enc(t.tier), x: tierX(i), y: PANEL_STOCK_BUY_Y,
        w: PANEL_STOCK_TIER_W, h: PANEL_STOCK_TIER_H, enabled: t.enabled,
      });
    });
    stockTiers(state, stock.sel, 'sell').forEach((t, i) => {
      out.push({
        action: 'stock:sell', target: enc(t.tier), x: tierX(i), y: PANEL_STOCK_SELL_Y,
        w: PANEL_STOCK_TIER_W, h: PANEL_STOCK_TIER_H, enabled: t.enabled,
      });
    });
  } else if (overlay === 'bullbear') {
    /* 与 `panelSpecs` 同源：方向分段（`target = 'up' | 'down'`）+ 4 行选标的（`target = code`）+ 取消。
       点行即落库（`{ kind:'card', card:'bullBear', stock:{ code, dir } }`），不设选中态。 */
    bullbearDirs().forEach((d, i) => {
      out.push({
        action: 'bullbear:dir', target: d.dir,
        x: PANEL_BULLBEAR_DIR_X0 + i * (HUD_QK_W + PANEL_BULLBEAR_DIR_GAP), y: PANEL_BULLBEAR_DIR_Y,
        w: HUD_QK_W, h: HUD_QK_H, enabled: true,
      });
    });
    stockRows(state).forEach((row, i) => {
      out.push({
        action: 'bullbear:pick', target: row.code,
        x: PANEL_ROW_X, y: PANEL_BULLBEAR_ROW_Y + i * (PANEL_ROW_H + PANEL_STOCK_ROW_GAP),
        w: PANEL_ROW_W, h: PANEL_ROW_H, enabled: true,
      });
    });
    out.push({
      action: 'bullbear:cancel', x: PANEL_BULLBEAR_CANCEL_X, y: PANEL_BULLBEAR_CANCEL_Y,
      w: HUD_QK_W, h: HUD_QK_H, enabled: true,
    });
  }
  return out;
}

export interface PanelHandle {
  /** 状态推进后重排命中层（画面由 `scene.render()` 重建，这里只管可点性） */
  update(): void;
  destroy(): void;
}

/** 命中层回调：动作 + 目标（`data-target`） */
export type PanelAct = (a: PanelActionId, target?: number | string) => void;

/**
 * 挂透明命中层：容器不吃事件，只有命中区 `<button>` 吃。
 * 按钮的**可见像素**由 `panelSpecs` + proc preset 画在画布上（spec §3.6：可见元素必须可换素材）。
 */
export function mountPanels(
  root: HTMLElement, game: Game, act: PanelAct,
  view: () => {
    handOpen: boolean; sel?: TargetingView | null; bank?: BankUiState;
    store?: StoreUiState; stock?: StockUiState; bullbear?: BullbearUiState; handScroll?: number;
  } = () => ({ handOpen: false }),
): PanelHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-panels';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    const v = view();
    const scroll = v.handScroll ?? 0;
    for (const a of panelHitAreas(game.state, v.handOpen, v.sel ?? null, v.bank, scroll, v.store, v.stock, v.bullbear)) {
      const b = document.createElement('button');
      b.dataset.action = a.action;
      if (a.target !== undefined) b.dataset.target = String(a.target);
      b.disabled = !a.enabled;
      b.style.cssText =
        `position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;` +
        `background:transparent;border:0;padding:0;` +
        (a.enabled ? 'pointer-events:auto;cursor:pointer;' : 'pointer-events:none;');
      b.onclick = () => act(a.action, a.target);
      layer.appendChild(b);
    }
  };

  update();
  return { update, destroy: () => layer.remove() };
}