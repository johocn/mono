import { describe, it, expect } from 'vitest';
import {
  interestOf, loanLimitOf, mortgageLimitOf, overdueOf, penaltyOf, type DebtBook,
} from '../../src/core/bank';
import { LOAN_CAP } from '../../src/data/bank';
import type { Estates } from '../../src/core/estate';

describe('core.bank 额度（M20.2，spec §3.2）', () => {
  it('信用额度 = min(￥2000, 净资产 30%)，四舍五入', () => {
    expect(loanLimitOf(1000)).toBe(300);
    expect(loanLimitOf(3333)).toBe(1000); // 999.9 → 1000
    expect(loanLimitOf(10000)).toBe(LOAN_CAP); // 3000 → 封顶 2000
    expect(loanLimitOf(0)).toBe(0);
  });

  it('抵押额度 = 变卖价 × 80%', () => {
    // L1 变卖价 = sellValue(1) = 30 → 24
    const estates: Estates = { 3: { index: 3, owner: 1, level: 1, processing: false } };
    expect(mortgageLimitOf(estates, 3)).toBe(24);
    // 无主地块 → 0
    expect(mortgageLimitOf(estates, 5)).toBe(0);
  });
});

describe('core.bank 利息与逾期（M20.2，spec §3.3 / §3.4）', () => {
  const book = (over: Partial<DebtBook> = {}): DebtBook => ({
    principal: 1000, rate: 0.06, due: 8, overdue: 0, ...over,
  });

  it('单轮利息 = 本金 × 利率（四舍五入）', () => {
    expect(interestOf(book())).toBe(60);
    expect(interestOf(book({ principal: 1005, rate: 0.03 }))).toBe(30); // 30.15 → 30
  });

  it('逾期推进：到期轮不算逾期，下一轮起 +1；未逾期归零', () => {
    expect(overdueOf(book({ due: 8, overdue: 0 }), 8)).toBe(0);
    expect(overdueOf(book({ due: 8, overdue: 0 }), 9)).toBe(1);
    expect(overdueOf(book({ due: 8, overdue: 2 }), 9)).toBe(3);
    expect(overdueOf(book({ due: 8, overdue: 2 }), 7)).toBe(0);
  });

  it('罚息 = 租金 × 50%（四舍五入）', () => {
    expect(penaltyOf(100)).toBe(50);
    expect(penaltyOf(33)).toBe(17); // 16.5 → 17
    expect(penaltyOf(0)).toBe(0);
  });
});
