/**
 * M20.1 · 破产拍卖裁决（spec §3.1）：纯函数、零随机、SSR 友好、易测。
 *
 * 只依赖 `estate.ts` / `data/*`，**不 import `game.ts` 运行时**（避免 `game → auction → game` 循环依赖）。
 * 一轮密封报价：所有报价一次性收齐后由 `resolveLot` 裁决；起拍价 = 该地块变卖价 `sellAt()`。
 */
import { sellAt, type Estates } from './estate';
import { BID_RENT_MULT, rentOf } from '../data/economy';
import type { AiParams } from '../data/ai';

/** 拍卖触发源（M20.2 将增 'mortgage-overdue'；本轮只开 'bankrupt'） */
export type AuctionTrigger = 'bankrupt';

/** 拍品快照：拍卖开始时的楼层（成交后按此保留，不从零复建） */
export interface AuctionLot {
  index: number;
  level: number;
  startPrice: number;
}

/** 一份密封报价（amount = 0 表示放弃） */
export interface AuctionBid {
  bidder: number;
  amount: number;
}

/** 裁决结果（winner = null 表示流拍） */
export interface AuctionWin {
  winner: number | null;
  price: number;
}

/** 拍品快照（无主 → null；起拍价 = 变卖价 sellAt） */
export function lotOf(estates: Estates, index: number): AuctionLot | null {
  const e = estates[index];
  if (!e) return null;
  return { index, level: e.level, startPrice: sellAt(estates, index) };
}

/**
 * 裁决：有效报价 = `amount >= startPrice`；取最高者，**并列取小 id**；
 * 无有效报价 → `{ winner: null, price: startPrice }`（流拍）。
 */
export function resolveLot(bids: readonly AuctionBid[], startPrice: number): AuctionWin {
  let best: AuctionBid | null = null;
  for (const b of bids) {
    if (b.amount < startPrice) continue;
    if (best === null || b.amount > best.amount || (b.amount === best.amount && b.bidder < best.bidder)) {
      best = b;
    }
  }
  return best === null ? { winner: null, price: startPrice } : { winner: best.bidder, price: best.amount };
}

/**
 * AI 出价（决定论，无随机）：
 *   want = round(rentOf(level) × BID_RENT_MULT × P.bidMult / 10) × 10
 *   cap  = cash − P.reserve
 *   want < startPrice 或 cap < startPrice → 0（放弃）
 *   否则 min(want, cap)
 */
export function aiBidFor(cash: number, lot: AuctionLot, P: AiParams): number {
  const want = Math.round((rentOf(lot.level) * BID_RENT_MULT * P.bidMult) / 10) * 10;
  const cap = cash - P.reserve;
  if (want < lot.startPrice || cap < lot.startPrice) return 0;
  return Math.min(want, cap);
}
