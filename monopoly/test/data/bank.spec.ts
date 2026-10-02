import { describe, it, expect } from 'vitest';
import {
  BANK_DEPOSIT_BONUS, DEPOSIT_RATE, LOAN_CAP, LOAN_NET_RATIO, LOAN_RATE, LOAN_TERM,
  MORTGAGE_LTV, MORTGAGE_RATE, MORTGAGE_TERM, OVERDUE_SEIZE_ROUNDS, RENT_PENALTY,
} from '../../src/data/bank';

describe('data.bank 信贷数值真源（M20.2，spec §3.2）', () => {
  it('存款 +3%/轮、落格红包 5%', () => {
    expect(DEPOSIT_RATE).toBe(0.03);
    expect(BANK_DEPOSIT_BONUS).toBe(0.05);
  });

  it('信用贷款 6%·8 轮·额度上限 ￥2000·净资产 30%', () => {
    expect(LOAN_RATE).toBe(0.06);
    expect(LOAN_TERM).toBe(8);
    expect(LOAN_CAP).toBe(2000);
    expect(LOAN_NET_RATIO).toBe(0.3);
  });

  it('抵押贷款 4%·6 轮·变卖价 80%', () => {
    expect(MORTGAGE_RATE).toBe(0.04);
    expect(MORTGAGE_TERM).toBe(6);
    expect(MORTGAGE_LTV).toBe(0.8);
  });

  it('违约链：罚息 +50% / 逾期满 3 轮强执', () => {
    expect(RENT_PENALTY).toBe(0.5);
    expect(OVERDUE_SEIZE_ROUNDS).toBe(3);
  });
});
