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

  it('建造价 [0,60,180,420] 与租金 [0,15,45,105] 与 board 展示表同源', () => {
    expect(PRICE_BY_LEVEL).toEqual([0, 60, 180, 420]);
    expect(RENT_BY_LEVEL).toEqual([0, 15, 45, 105]);
    expect(buyPrice(1)).toBe(60);
    expect(buyPrice(3)).toBe(420);
    expect(rentOf(0)).toBe(0);
    expect(rentOf(3)).toBe(105);
  });

  it('破产线：现金 < 0 且无可变卖地产（0 为分界值）', () => {
    expect(BANKRUPT_CASH_LINE).toBe(0);
  });

  it('canUpgrade 只有 1/2 级可升；nextLevel 在 3 级封顶', () => {
    expect(MAX_LEVEL).toBe(3);
    expect([canUpgrade(0), canUpgrade(1), canUpgrade(2), canUpgrade(3)]).toEqual([false, true, true, false]);
    expect(nextLevel(1)).toBe(2);
    expect(nextLevel(3)).toBe(3);
  });

  it('施工工期 1 回合、变卖价 = 累计投入的一半', () => {
    expect(BUILD_TURNS).toBe(1);
    expect(SELL_RATIO).toBe(0.5);
    expect(sellValue(0)).toBe(0);
    expect(sellValue(1)).toBe(30);    // 60 / 2
    expect(sellValue(2)).toBe(120);   // (60+180) / 2
    expect(sellValue(3)).toBe(330);   // (60+180+420) / 2
  });

  it('回合上限 60 轮（胜负兜底：零和租金不会自行收敛，需时间上限）', () => {
    expect(ROUND_LIMIT).toBe(60);
  });
});