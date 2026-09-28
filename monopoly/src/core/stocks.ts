/**
 * 股票盘（spec §5.5）：回合制涨跌 + 买卖 + 市值。纯逻辑，不依赖引擎、不触碰 `GameState`。
 *
 * 涨跌模型：`Math.round(prev * (1 + vol * (2 * rng() - 1)))` 且 `Math.max(1, …)`——单回合幅度 ≤ vol。
 * tick **按「轮」而非「回合」**（每位玩家各完成一次回合 = round+1 时统一 tick 一次），
 * 避免四人局里先手玩家每轮吃到多次波动的先手优势，也让 seed 复现稳定。
 *
 * `tips`：`c-stockTip` 的「内幕消息」标的，下一次 tick 强制按上限 +vol 上涨（仍落在幅度约束内）。
 */
import { SHARE_LOT, STOCKS, type StockDef } from '../data/stocks';

export type Quotes = Record<string, number>;

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
  /** 统一 tick 一次（轮末）；`tips` 内的标的下次必涨 */
  tick(tips?: string[]): Quotes;
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
    tick: (tips: string[] = []): Quotes => {
      for (const d of defs) {
        const prev = prices[d.code];
        const delta = tips.includes(d.code) ? d.vol : d.vol * (2 * rng() - 1);
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

/** 持仓市值 = Σ shares × 当前价；空仓为 0 */
export function marketValue(portfolio: Portfolio, quotes: Quotes): number {
  let sum = 0;
  for (const code of Object.keys(portfolio)) {
    sum += portfolio[code].shares * (quotes[code] ?? 0);
  }
  return sum;
}