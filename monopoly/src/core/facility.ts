/**
 * M20.4 设施分红与新闻纯函数（spec §4.2 / §5）。
 *
 * 与 `core/bank.ts` 同规：只依赖 `data/*` 与 `core/stocks.ts` 的类型，
 * **不 import `game.ts` 运行时**（避免 `game → facility → game` 循环依赖）。
 * 全链路纯算术、零随机 ⇒ SSR 友好、易测、可回放。
 */
import { FACILITIES, facilityOf, type FacilityDef, type FacilityId } from '../data/facilities';
import { NEWS_COEF, type NewsItem } from '../data/news';
import type { StockForce } from './stocks';

/** 认购失败原因（spec §5.3） */
export type FacilityFail = 'unknown-facility' | 'bad-shares' | 'sold-out' | 'not-enough-cash';

/** 持股玩家最小形状（只取聚合与认购校验所需字段，避免依赖 `game.ts`） */
export interface FacilityHolder {
  /** 已破产玩家不再计入（其持股随清算消失） */
  bankrupt?: boolean;
  /** 设施持股（`FacilityId` → 股数；未持有为缺键） */
  facilities: Partial<Record<FacilityId, number>>;
}

/**
 * 新闻系数（D28 ① / spec F-D3）：**仅设施新闻且命中该设施**时生效
 * （利好 ×1.5 / 利空 ×0.5），否则 1。
 */
export function newsCoefOf(news: NewsItem | null, id: FacilityId): number {
  if (!news || news.scope !== 'facility' || news.target !== id) return 1;
  return news.sentiment === 'good' ? NEWS_COEF.good : NEWS_COEF.bad;
}

/**
 * 新闻 → 股价强制方向（D28 ②）：仅 `scope === 'stock'` 生效，
 * 复用 M20.3-B 的 `StockForce` 通道（命中不消耗 `rng`，spec F-D10）。
 */
export function newsForceOf(news: NewsItem | null): StockForce | null {
  if (!news || news.scope !== 'stock') return null;
  return { code: news.target, dir: news.sentiment === 'good' ? 1 : -1 };
}

/** 某设施已售股数（先到先得：Σ 各未破产玩家持股，spec F-D1 的聚合口径） */
export function soldSharesOf(players: readonly FacilityHolder[], id: FacilityId): number {
  let sum = 0;
  for (const p of players) {
    if (p.bankrupt) continue;
    sum += p.facilities[id] ?? 0;
  }
  return sum;
}

/**
 * 认购校验（纯函数、零随机，spec §5.3 / F-D13）：
 * 非正整数股 → `bad-shares`；超出剩余股本 → `sold-out`；现金不足 → `not-enough-cash`。
 */
export function canSubscribe(
  players: readonly FacilityHolder[],
  id: FacilityId,
  shares: number,
  cash: number,
): { ok: boolean; reason?: FacilityFail; cost: number } {
  const def = FACILITIES.find((f) => f.id === id);
  if (!def) return { ok: false, reason: 'unknown-facility', cost: 0 };
  if (!Number.isInteger(shares) || shares <= 0) return { ok: false, reason: 'bad-shares', cost: 0 };
  const cost = def.price * shares;
  if (soldSharesOf(players, id) + shares > def.shares) return { ok: false, reason: 'sold-out', cost };
  if (cash < cost) return { ok: false, reason: 'not-enough-cash', cost };
  return { ok: true, cost };
}

/**
 * 单笔分红（spec F-D3 / D27）：
 *   `round((shares × price × rate + cashflow × shares / shares_total) × coef)`
 * 即「基础分红 + 该设施本轮现金流按持股比例分成」再乘当期新闻系数。
 */
export function dividendOf(def: FacilityDef, shares: number, cashflow: number, coef: number): number {
  const base = shares * def.price * def.rate;
  const flow = (cashflow * shares) / def.shares;
  return Math.round((base + flow) * coef);
}

/** 预估下轮分红（UI 用；与 `dividendOf` 同式，`?? 0` 只是取默认设施防御） */
export function estimateDividend(id: FacilityId, shares: number, cashflow: number, coef: number): number {
  return dividendOf(facilityOf(id), shares, cashflow, coef);
}
