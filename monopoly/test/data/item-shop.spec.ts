import { describe, it, expect } from 'vitest';
import { ITEM_CARDS } from '../../src/data/cards';
import { STORE_CATALOG, STORE_MARKUP } from '../../src/data/item-shop';

describe('道具商店目录（spec §5.2）', () => {
  it('目录与道具表一一对应：同长、无重复、均为已知 kind', () => {
    expect(STORE_CATALOG).toHaveLength(ITEM_CARDS.length);
    const kinds = STORE_CATALOG.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of kinds) {
      expect(ITEM_CARDS.some((c) => c.kind === k)).toBe(true);
    }
    /* 反向：每种道具都在目录里（否则手牌有卡、商店买不到） */
    for (const c of ITEM_CARDS) {
      expect(kinds).toContain(c.kind);
    }
  });

  it('售价恒为正整数，且目录顺序 = 常用度 priority 升序', () => {
    const priorityOf = (k: string): number => ITEM_CARDS.find((c) => c.kind === k)!.priority;
    const priorities = STORE_CATALOG.map((p) => priorityOf(p.kind));
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    for (const p of STORE_CATALOG) {
      expect(Number.isInteger(p.price)).toBe(true);
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it('回收价系数为 50%', () => {
    expect(STORE_MARKUP).toBe(0.5);
  });
});
