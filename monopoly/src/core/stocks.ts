/**
 * 股票盘（spec §5.5）：回合制涨跌 + 买卖 + 市值。纯逻辑，不依赖引擎、不触碰 `GameState`。
 *
 * 涨跌模型：`Math.round(prev * (1 + vol * (2 * rng() - 1)))` 且 `Math.max(1, …)`——单回合幅度 ≤ vol。
 * tick **按「轮」而非「回合」**（每位玩家各完成一次回合 = round+1 时统一 tick 一次），
 * 避免四人局里先手玩家每轮吃到多次波动的先手优势，也让 seed 复现稳定。
 *
 * `force`：下一轮 tick 的**强制方向表**（`c-stockTip` 内幕消息 / M20.3-B 涨跌卡同源）——
 * 命中的标的按下限幅度定向走动（`dir = 1` 按上限 +vol、`dir = -1` 按 −vol），
 * **命中时不调用 `rng()`**，故不改变未命中标的的既有随机序列（seed 回放逐字节一致）。
 */
import { LIQUIDATION_RATIO, SHARE_LOT, STOCKS, type LotTier, type StockDef } from '../data/stocks';

export type Quotes = Record<string, number>;

/** 强制方向（下一轮 tick 生效一次）：`dir = 1` 必涨 / `-1` 必跌 */
export interface StockForce {
  code: string;
  dir: 1 | -1;
}

export interface Holding {
  code: string;
  /** 持股数（整股） */
  shares: number;
  /** 累计买入成本（用于展示盈亏，不参与胜负） */
  cost: number;
}

export type Portfolio = Record<string, Holding>;

export interface Market {
  quotes(): Quotes;
  /** 每支标的的历史价（首点 = 发行价，每 tick 追加一点）——供行情走势折线消费 */
  history(): Record<string, number[]>;
  /** 统一 tick 一次（轮末）；`force` 内的标的按下限幅度定向走动 */
  tick(force?: StockForce[]): Quotes;
}

export function createMarket(rng: () => number, defs: StockDef[] = STOCKS): Market {
  const prices: Quotes = {};
  const series: Record<string, number[]> = {};
  for (const d of defs) {
    prices[d.code] = d.price0;
    series[d.code] = [d.price0];
  }
  return {
    quotes: (): Quotes => ({ ...prices }),
    history: (): Record<string, number[]> => {
      const out: Record<string, number[]> = {};
      for (const d of defs) out[d.code] = [...series[d.code]];
      return out;
    },
    tick: (force: StockForce[] = []): Quotes => {
      for (const d of defs) {
        const prev = prices[d.code];
        /* 命中强制方向 ⇒ 走定点幅度、**不消耗 `rng()`**；未命中才摇随机（与既有 tips 短路逐字节一致） */
        const f = force.find((x) => x.code === d.code);
        const delta = f ? d.vol * f.dir : d.vol * (2 * rng() - 1);
        prices[d.code] = Math.max(1, Math.round(prev * (1 + delta)));
        series[d.code].push(prices[d.code]);
      }
      return { ...prices };
    },
  };
}

export type TradeFail = 'bad-lot' | 'not-enough-cash' | 'not-enough-shares' | 'unknown-code';

export type TradeOutcome =
  | { ok: true; code: string; shares: number; price: number; cost: number; cash: number }
  | { ok: false; reason: TradeFail };

export function holdingOf(portfolio: Portfolio, code: string): Holding | null {
  return portfolio[code] ?? null;
}

/** 买入：整股、现金够；成功则原地写 `portfolio` 并返回剩余现金 */
export function buyShares(portfolio: Portfolio, quotes: Quotes, code: string, shares: number, cash: number): TradeOutcome {
  const price = quotes[code];
  if (price === undefined) return { ok: false, reason: 'unknown-code' };
  if (!Number.isInteger(shares) || shares < SHARE_LOT) return { ok: false, reason: 'bad-lot' };
  const cost = price * shares;
  if (cash < cost) return { ok: false, reason: 'not-enough-cash' };
  const h = portfolio[code] ?? { code, shares: 0, cost: 0 };
  h.shares += shares;
  h.cost += cost;
  portfolio[code] = h;
  return { ok: true, code, shares, price, cost, cash: cash - cost };
}

/** 卖出：不超过持股；卖空后从 `portfolio` 删除该键 */
export function sellShares(portfolio: Portfolio, quotes: Quotes, code: string, shares: number, cash: number): TradeOutcome {
  const price = quotes[code];
  if (price === undefined) return { ok: false, reason: 'unknown-code' };
  if (!Number.isInteger(shares) || shares < SHARE_LOT) return { ok: false, reason: 'bad-lot' };
  const h = portfolio[code];
  if (!h || h.shares < shares) return { ok: false, reason: 'not-enough-shares' };
  const proceeds = price * shares;
  h.shares -= shares;
  if (h.shares === 0) delete (portfolio as Record<string, Holding | undefined>)[code];
  return { ok: true, code, shares, price, cost: proceeds, cash: cash + proceeds };
}

/**
 * M20.5 爆仓线 = 保证金借款 × `LIQUIDATION_RATIO`（市值跌破即强制平仓；spec §6.2 D40）。
 * 与 `onRoundBoundary` 的强平判定同源，保证「提示的线 = 真正强平的线」。
 */
export function marginLineOf(principal: number): number {
  return Math.round(principal * LIQUIDATION_RATIO);
}

/** M20.5 距爆仓百分比：`round((市值 − 爆仓线) / 爆仓线 × 100)`；爆仓线 ≤ 0 时返回 0 */
export function marginGapPctOf(value: number, line: number): number {
  if (line <= 0) return 0;
  return Math.round(((value - line) / line) * 100);
}

/** 持仓市值 = Σ shares × 当前价；空仓为 0 */
export function marketValue(portfolio: Portfolio, quotes: Quotes): number {
  let sum = 0;
  for (const code of Object.keys(portfolio)) {
    sum += portfolio[code].shares * (quotes[code] ?? 0);
  }
  return sum;
}

/**
 * 数量档 → 股数（M20.3-B spec §6.1 纯函数，零随机）。
 * - 定值档（1 手 / 5 手）：返回 `tier` 本身，但按方向截断到上限；
 * - `'all'`：买侧 = `floor(现金 / 现价)`（连 1 股都买不起 → 0），卖侧 = 全部持股；
 * - 上限：买侧 = 现金可买股数（`price ≤ 0` → 0），卖侧 = `held`（**`held = 0` 返回 0，不出除零**）。
 */
export function lotShares(
  tier: LotTier, price: number, cash: number, held: number, side: 'buy' | 'sell',
): number {
  const cap = side === 'buy' ? (price > 0 ? Math.floor(cash / price) : 0) : held;
  const want = tier === 'all' ? cap : tier;
  return Math.max(0, Math.min(want, cap));
}