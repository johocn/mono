import { describe, it, expect } from 'vitest';
import {
  BANKRUPT_CASH_LINE, BUILD_TURNS, MAX_LEVEL, PASS_START_BONUS, PRICE_BY_LEVEL, RENT_BY_LEVEL,
  ROUND_LIMIT, SELL_RATIO, START_CASH, buyPrice, canUpgrade, nextLevel, rentOf, sellValue,
} from '../../src/data/economy';

describe('economy 经济口径（spec §5.4）', () => {
  it('开局资金 ￥3000 / 经过起点 +￥200', () => {
    expect(START_CASH).toBe(3000);
    expect(PASS_START_BONUS).toBe(200);
  });

  it('建造价 [0,60,180,420,860,1600] 与租金 [0,15,45,105,220,420] 与 board 展示表同源', () => {
    expect(PRICE_BY_LEVEL).toEqual([0, 60, 180, 420, 860, 1600]);
    expect(RENT_BY_LEVEL).toEqual([0, 15, 45, 105, 220, 420]);
    expect(buyPrice(1)).toBe(60);
    expect(buyPrice(3)).toBe(420);
    expect(buyPrice(5)).toBe(1600);
    expect(rentOf(0)).toBe(0);
    expect(rentOf(3)).toBe(105);
    expect(rentOf(5)).toBe(420);
  });

  it('破产线：现金 < 0 且无可变卖地产（0 为分界值）', () => {
    expect(BANKRUPT_CASH_LINE).toBe(0);
  });

  it('canUpgrade 只有 1..4 级可升；nextLevel 在 5 级封顶', () => {
    expect(MAX_LEVEL).toBe(5);
    expect([canUpgrade(0), canUpgrade(1), canUpgrade(2), canUpgrade(3), canUpgrade(4), canUpgrade(5)])
      .toEqual([false, true, true, true, true, false]);
    expect(nextLevel(1)).toBe(2);
    expect(nextLevel(4)).toBe(5);
    expect(nextLevel(5)).toBe(5);
  });

  it('施工工期 1 回合、变卖价 = 累计投入的一半', () => {
    expect(BUILD_TURNS).toBe(1);
    expect(SELL_RATIO).toBe(0.5);
    expect(sellValue(0)).toBe(0);
    expect(sellValue(1)).toBe(30);    // 60 / 2
    expect(sellValue(2)).toBe(120);   // (60+180) / 2
    expect(sellValue(3)).toBe(330);   // (60+180+420) / 2
    expect(sellValue(4)).toBe(760);   // (60+180+420+860) / 2
    expect(sellValue(5)).toBe(1560);  // (60+180+420+860+1600) / 2
  });

  it('回合上限 60 轮（胜负兜底：零和租金不会自行收敛，需时间上限）', () => {
    expect(ROUND_LIMIT).toBe(60);
  });
});