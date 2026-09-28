import { describe, it, expect } from 'vitest';
import { BONUS_WEIGHTS, JAIL_TURNS, nextJail, rollBonus, specialAt } from '../../src/core/special';
import { makeRng } from '../../src/core/dice';
import { ITEM_CARDS } from '../../src/data/cards';

describe('special 特殊格判定（spec §5.5）', () => {
  it('specialAt 读 board 真源：12 监狱 / 19 股票 / 7、27 福利 / 3 普通格', () => {
    expect(specialAt(12)).toBe('jail');
    expect(specialAt(19)).toBe('stock');
    expect(specialAt(7)).toBe('bonus');
    expect(specialAt(27)).toBe('bonus');
    expect(specialAt(3)).toBeNull();
    expect(specialAt(0)).toBeNull();
  });

  it('JAIL_TURNS 定死 2；nextJail 2→1→0 且不为负', () => {
    expect(JAIL_TURNS).toBe(2);
    expect(nextJail(2)).toBe(1);
    expect(nextJail(1)).toBe(0);
    expect(nextJail(0)).toBe(0);
  });
});

describe('special 福利中心奖励（spec §5.5）', () => {
  it('rollBonus 三类各约 1/3（±25% 容差），且各档取值合法', () => {
    const rng = makeRng(2026);
    const tally = { cash: 0, item: 0, upgrade: 0 };
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const r = rollBonus(rng);
      tally[r.kind] += 1;
      if (r.kind === 'cash') expect([200, 400]).toContain(r.amount);
      else if (r.kind === 'item') expect(ITEM_CARDS.map((c) => c.kind)).toContain(r.item);
      else expect(r.kind).toBe('upgrade');
    }
    expect(BONUS_WEIGHTS.cash).toBe(1);
    for (const k of ['cash', 'item', 'upgrade'] as const) {
      const ratio = tally[k] / n;
      expect(ratio).toBeGreaterThan(0.25);
      expect(ratio).toBeLessThan(0.42);
    }
  });

  it('同 seed 的 rollBonus 序列一致', () => {
    const a = makeRng(77);
    const b = makeRng(77);
    const s1 = Array.from({ length: 12 }, () => rollBonus(a));
    const s2 = Array.from({ length: 12 }, () => rollBonus(b));
    expect(s1).toEqual(s2);
  });
});