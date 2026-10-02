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
import { SHARE_LOT, STOCKS, STOCK_TILE_INDEX } from '../data/stocks';
import {
  BANK_DEPOSIT_BONUS, BANK_TILE_INDEX, DEPOSIT_RATE, LOAN_NET_RATIO, LOAN_RATE, LOAN_TERM,
  MORTGAGE_LTV, MORTGAGE_RATE, MORTGAGE_TERM,
} from '../data/bank';
import { loanLimitOf, mortgageLimitOf } from '../core/bank';
import { creditLocked, currentPlayer, netWorth, winnerOf, type Game, type GameState, type PendingAuction } from '../core/game';
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
  PANEL_CANCEL_W, PANEL_CANCEL_X,
  PANEL_CARD_CX, PANEL_CARD_CY, PANEL_CARD_S,
  PANEL_CHART_H, PANEL_CHART_W, PANEL_CHART_X, PANEL_CHART_Y, PANEL_CLOSE_H, PANEL_CLOSE_W,
  PANEL_CLOSE_X, PANEL_CLOSE_Y, PANEL_CX, PANEL_DEBT_CX, PANEL_DEBT_CY, PANEL_DRAW_X, PANEL_DRAW_Y, PANEL_HAND_Y,
  PANEL_PREVIEW_W, PANEL_PREVIEW_X,
  PANEL_ROW_GAP, PANEL_ROW_H, PANEL_ROW_W, PANEL_ROW_X, PANEL_SETTLE_ROW_GAP,
  PANEL_SETTLE_ROW_H, PANEL_SETTLE_ROW_Y, PANEL_SLOT_GAP, PANEL_SLOT_H, PANEL_SLOT_W,
  PANEL_SLOT_X0, PANEL_STOCK_ROW_Y, PANEL_TRADE_GAP, PANEL_TRADE_H, PANEL_TRADE_W,
  PANEL_TRADE_X0, PANEL_TRADE_Y, PANEL_X, PANEL_Y,
} from '../skin/layout';

/** 浮层动作位（DOM 命中层 `data-action`；`data-target` 给目标格号 / 股票代码 / 银行产品 / 出价金额） */
export type PanelActionId =
  | 'card:bomb' | 'card:barrier' | 'card:teleport' | 'card:doubleRent' | 'card:demolish'
  | 'card:cancel'
  | 'stock:buy' | 'stock:sell' | 'card:close' | 'settle:close'
  | 'auction:bid' | 'auction:pass'
  /* M20.2 银行信贷（spec §3.8）：选中产品行 + 六个 API + 关闭 */
  | 'bank:select' | 'bank:deposit' | 'bank:withdraw' | 'bank:borrow' | 'bank:repay'
  | 'bank:mortgage' | 'bank:redeem' | 'bank:close';

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

/** 浮层可见态（优先级：拍卖 > 结算 > 银行 > 股票盘 > 抽卡翻牌；无 → null） */
export type OverlayKind = 'auction' | 'settle' | 'bank' | 'stock' | 'draw';

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

/** 手牌 6 槽：顺序恒等 `ITEM_CARDS.kind`（槽位不因持有与否移动） */
export function handSlots(state: GameState): HandSlotView[] {
  const hand = state.hands[state.current] ?? [];
  return ITEM_CARDS.map((c) => ({
    kind: c.kind,
    name: c.name,
    held: hand.includes(c.kind),
    enabled: cardEnabled(c.kind, state),
  }));
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
}

export function stockRows(state: GameState): StockRowView[] {
  const pf = state.portfolios[state.current] ?? {};
  return STOCKS.map((d) => {
    const price = state.quotes[d.code] ?? d.price0;
    const shares = pf[d.code]?.shares ?? 0;
    return { code: d.code, name: d.name, price, change: price - d.price0, shares, value: shares * price };
  });
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
 *  M20.2：`opts.bankOpen` 为真且未结束时返回 `'bank'`（银行键在 idle / settled 均可开） */
export function overlayOf(state: GameState, opts: { bankOpen?: boolean } = {}): OverlayKind | null {
  if (state.auction) return 'auction';
  if (state.over) return 'settle';
  if (opts.bankOpen) return 'bank';
  if (state.phase !== 'settled') return null;
  /* 站在股票交易所（index 19）→ 盘面常开（买卖后仍停留，便于连续操作） */
  if (currentPlayer(state).pos === STOCK_TILE_INDEX) return 'stock';
  if (state.lastDraw) return 'draw';
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

/* —— 视图组装（pass 4 + 定格台位；c 恒 0，depth = r 递增即绘制序） —— */

/** 手牌行第 i 槽的中心 x */
export function handSlotCx(i: number): number {
  return PANEL_SLOT_X0 + PANEL_SLOT_W / 2 + i * (PANEL_SLOT_W + PANEL_SLOT_GAP);
}

export function panelSpecs(
  state: GameState, handOpen = false, sel: TargetingView | null = null,
  bank: BankUiState = { open: false, sel: 'deposit' },
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
    /* 手牌 6 槽：收进牌袋抽屉，仅展开时入画（spec §7.3；教程期间由 `main.ts` 强制展开） */
    handSlots(state).forEach((slot, i) => {
      push('ui.handSlot', handSlotCx(i), PANEL_HAND_Y + PANEL_SLOT_H / 2, {
        name: slot.name, held: slot.held, enabled: slot.enabled,
      });
    });
  }

  const overlay = overlayOf(state, { bankOpen: bank.open });
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
  } else if (overlay === 'stock') {
    push('showcase.panel', PANEL_X, PANEL_Y);
    push('ui.badge', PANEL_CX, PANEL_BADGE_Y, { text: '股票交易所' });
    const rows = stockRows(state);
    rows.forEach((row, i) => {
      push('ui.stockRow', PANEL_ROW_X + PANEL_ROW_W / 2,
        PANEL_STOCK_ROW_Y + PANEL_ROW_H / 2 + i * (PANEL_ROW_H + PANEL_ROW_GAP),
        { code: row.code, name: row.name, price: row.price, change: row.change, shares: row.shares, value: row.value });
    });
    const first = rows[0];
    push('ui.stockChart', PANEL_CHART_X + PANEL_CHART_W / 2, PANEL_CHART_Y + PANEL_CHART_H / 2,
      { series: state.priceHistory[first.code] ?? [first.price], label: `${first.code} 走势` });
    /* 可见买/卖键（台位与 `panelHitAreas` 完全一致；观感复用 `uiButton` preset） */
    const cash = state.players[state.current].cash;
    push('ui.tradeBuy',
      PANEL_TRADE_X0 + PANEL_TRADE_W / 2, PANEL_TRADE_Y + PANEL_TRADE_H / 2,
      { label: `买 ${SHARE_LOT}`, enabled: cash >= first.price });
    push('ui.tradeSell',
      PANEL_TRADE_X0 + PANEL_TRADE_W + PANEL_TRADE_GAP + PANEL_TRADE_W / 2, PANEL_TRADE_Y + PANEL_TRADE_H / 2,
      { label: `卖 ${SHARE_LOT}`, enabled: first.shares > 0 });
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
  bank: BankUiState = { open: false, sel: 'deposit' },
): PanelHit[] {
  const out: PanelHit[] = [];
  if (sel !== null) {
    out.push({
      action: 'card:cancel', x: PANEL_CANCEL_X, y: PANEL_HAND_Y,
      w: PANEL_CANCEL_W, h: PANEL_SLOT_H, enabled: true,
    });
    return out;
  }
  const overlay = overlayOf(state, { bankOpen: bank.open });
  if (!overlay) {
    /* 抽屉收起时手牌不可点（画面也没画）；牌袋键由 `Hud.ts` 提供 */
    if (!handOpen) return out;
    handSlots(state).forEach((slot, i) => {
      out.push({
        action: `card:${slot.kind}` as PanelActionId,
        x: PANEL_SLOT_X0 + i * (PANEL_SLOT_W + PANEL_SLOT_GAP), y: PANEL_HAND_Y,
        w: PANEL_SLOT_W, h: PANEL_SLOT_H, enabled: slot.enabled,
      });
    });
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
  } else if (overlay === 'draw') {
    out.push({
      action: 'card:close', x: PANEL_CLOSE_X, y: PANEL_CLOSE_Y,
      w: PANEL_CLOSE_W, h: PANEL_CLOSE_H, enabled: true,
    });
  } else if (overlay === 'stock') {
    const first = stockRows(state)[0];
    const cash = state.players[state.current].cash;
    out.push({
      action: 'stock:buy', target: first.code, x: PANEL_TRADE_X0, y: PANEL_TRADE_Y,
      w: PANEL_TRADE_W, h: PANEL_TRADE_H, enabled: cash >= first.price,
    });
    out.push({
      action: 'stock:sell', target: first.code,
      x: PANEL_TRADE_X0 + PANEL_TRADE_W + PANEL_TRADE_GAP, y: PANEL_TRADE_Y,
      w: PANEL_TRADE_W, h: PANEL_TRADE_H, enabled: first.shares > 0,
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
  view: () => { handOpen: boolean; sel?: TargetingView | null; bank?: BankUiState } = () => ({ handOpen: false }),
): PanelHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-panels';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9';
  root.appendChild(layer);

  const update = (): void => {
    layer.textContent = '';
    const v = view();
    for (const a of panelHitAreas(game.state, v.handOpen, v.sel ?? null, v.bank)) {
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