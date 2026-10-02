import { describe, it, expect } from 'vitest';
import { priceOf, resaleOf } from '../../src/core/item-shop';
import { STORE_CATALOG } from '../../src/data/item-shop';

describe('道具商店纯函数（spec §5.2）', () => {
  it('resaleOf = 售价 × 50% 向下取整（奇数售价取低档，杜绝买卖套利）', () => {
    expect(resaleOf(300)).toBe(150);
    expect(resaleOf(150)).toBe(75);
    expect(resaleOf(500)).toBe(250);
    expect(resaleOf(250)).toBe(125);
    expect(resaleOf(200)).toBe(100);
    /* 奇数尾数：floor 而非 round */
    expect(resaleOf(101)).toBe(50);
  });

  it('priceOf 查表命中即售价，未收录 kind 返回 undefined', () => {
    expect(priceOf('bomb')).toBe(300);
    expect(priceOf('demolish')).toBe(500);
    expect(priceOf('pardon')).toBe(250);
    expect(priceOf('not-a-card')).toBeUndefined();
    expect(priceOf('')).toBeUndefined();
  });

  it('每个目录项的回收价都严格小于售价（低买高卖不可行）', () => {
    for (const p of STORE_CATALOG) {
      expect(resaleOf(p.price)).toBeLessThan(p.price);
    }
  });
});
