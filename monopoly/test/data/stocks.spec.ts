import { describe, it, expect } from 'vitest';
import {
  DIVIDEND_PER_SHARE, DIVIDEND_REFUND, LEVERAGES, LIQUIDATION_RATIO, LOT_TIERS,
  MARGIN_RATE, MARGIN_UNLOCK_ROUND, SHARE_LOT, STOCK_TILE_INDEX, STOCKS,
} from '../../src/data/stocks';

describe('股票盘数据（spec §4.2 / M20.3-B）', () => {
  it('四支演示盘：code 唯一、发行价与波动率恒为正', () => {
    expect(STOCKS.map((s) => s.code)).toEqual(['SY01', 'SY02', 'SY03', 'SY04']);
    expect(new Set(STOCKS.map((s) => s.code)).size).toBe(4);
    for (const s of STOCKS) {
      expect(s.price0).toBeGreaterThan(0);
      expect(s.vol).toBeGreaterThan(0);
      expect(s.vol).toBeLessThan(1);
    }
  });

  it('数量档：前两档为 1 手 / 5 手，「全仓」由 UI 纯函数推导（不入常量表）', () => {
    expect(LOT_TIERS).toEqual([SHARE_LOT, SHARE_LOT * 5]);
    expect(LOT_TIERS).toEqual([1, 5]);
  });

  it('杠杆档位：2× / 3× 两档，升序且都 > 1；第 8 轮解锁', () => {
    expect(LEVERAGES).toEqual([2, 3]);
    expect([...LEVERAGES].every((l) => l > 1)).toBe(true);
    expect([...LEVERAGES]).toEqual([...LEVERAGES].sort((a, b) => a - b));
    expect(MARGIN_UNLOCK_ROUND).toBe(8);
  });

  it('保证金口径：借入 6%/轮复利、爆仓线 = 借入 × 120%', () => {
    expect(MARGIN_RATE).toBe(0.06);
    expect(LIQUIDATION_RATIO).toBe(1.2);
  });

  it('红利卡：每股 ￥20；无持仓折现 ￥100', () => {
    expect(DIVIDEND_PER_SHARE).toBe(20);
    expect(DIVIDEND_REFUND).toBe(100);
  });

  it('股票交易所 = 19 号格、演示期免手续费', () => {
    expect(STOCK_TILE_INDEX).toBe(19);
  });
});
