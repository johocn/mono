import { describe, it, expect } from 'vitest';
import { aiBidFor, lotOf, resolveLot, type AuctionBid, type AuctionTrigger } from '../../src/core/auction';
import { PERSONA_PARAMS } from '../../src/data/ai';
import type { Estates } from '../../src/core/estate';

describe('auction.AuctionTrigger（M20.2 三源）', () => {
  it('三值均可赋给 AuctionTrigger（编译期 + 运行期）', () => {
    const triggers: AuctionTrigger[] = ['bankrupt', 'mortgage-overdue', 'loan-overdue'];
    expect(triggers).toHaveLength(3);
    expect(new Set(triggers).size).toBe(3);
  });
});

describe('auction.lotOf（拍品快照，起拍价 = 变卖价）', () => {
  const es: Estates = { 3: { index: 3, owner: 1, level: 1, processing: false } };
  it('有主 → 快照带楼层与起拍价（L1 = ￥30）', () => {
    expect(lotOf(es, 3)).toEqual({ index: 3, level: 1, startPrice: 30 });
  });
  it('无主 → null', () => {
    expect(lotOf(es, 4)).toBeNull();
  });
});

describe('auction.resolveLot（一轮密封报价裁决）', () => {
  it('取最高价；并列取小 id', () => {
    const bids: AuctionBid[] = [
      { bidder: 3, amount: 60 }, { bidder: 2, amount: 60 }, { bidder: 4, amount: 50 },
    ];
    expect(resolveLot(bids, 30)).toEqual({ winner: 2, price: 60 });
  });
  it('低于起拍价的报价无效', () => {
    expect(resolveLot([{ bidder: 2, amount: 29 }], 30)).toEqual({ winner: null, price: 30 });
  });
  it('空报价 / 全放弃 → 流拍（price = 起拍价）', () => {
    expect(resolveLot([], 30)).toEqual({ winner: null, price: 30 });
    expect(resolveLot([{ bidder: 2, amount: 0 }], 30)).toEqual({ winner: null, price: 30 });
  });
});

describe('auction.aiBidFor（决定论出价，无随机）', () => {
  const lot = { index: 3, level: 3, startPrice: 330 };
  it('want = round(rent(level) × 6 × bidMult / 10) × 10；再被「现金 − 保留」封顶', () => {
    /* L3 租金 105：105×6=630 → 保守 ×0.6=378 → round(37.8)×10 = 380 */
    expect(aiBidFor(3000, lot, PERSONA_PARAMS.conservative)).toBe(380);
    /* 激进 ×1.4=882 → round(88.2)×10 = 880 */
    expect(aiBidFor(3000, lot, PERSONA_PARAMS.aggressive)).toBe(880);
    /* 投机 ×1.0=630 → round(63)×10 = 630 */
    expect(aiBidFor(3000, lot, PERSONA_PARAMS.speculative)).toBe(630);
  });
  it('估值低于起拍价 → 0（放弃）', () => {
    /* 保守估 L1 = round(15×6×0.6/10)×10 = 50；起拍 60 → 放弃 */
    expect(aiBidFor(3000, { index: 1, level: 1, startPrice: 60 }, PERSONA_PARAMS.conservative)).toBe(0);
  });
  it('现金 − 保留 < 起拍价 → 0；否则 min(want, cap)', () => {
    /* 激进保留 100：现金 400 → cap 300 < 330 → 0 */
    expect(aiBidFor(400, lot, PERSONA_PARAMS.aggressive)).toBe(0);
    /* 投机保留 200：现金 700 → cap 500，want 630 → min = 500 */
    expect(aiBidFor(700, lot, PERSONA_PARAMS.speculative)).toBe(500);
  });
});
