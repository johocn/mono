import { describe, it, expect } from 'vitest';
import { DICE_FACES, createDice, makeRng, type Dice } from '../../src/core/dice';

describe('dice 双骰（spec §5.1）', () => {
  it('两颗骰，点数 1..6，总和 = d1 + d2', () => {
    const dice = createDice(1);
    for (let i = 0; i < 500; i++) {
      const r = dice.roll();
      expect(r.d1).toBeGreaterThanOrEqual(1);
      expect(r.d1).toBeLessThanOrEqual(DICE_FACES);
      expect(r.d2).toBeGreaterThanOrEqual(1);
      expect(r.d2).toBeLessThanOrEqual(DICE_FACES);
      expect(r.total).toBe(r.d1 + r.d2);
    }
    expect(DICE_FACES).toBe(6);
  });

  it('同 seed → 同序列（验收截图与线上回归可复现）', () => {
    const seq = (s: number): number[] => {
      const d: Dice = createDice(s);
      return Array.from({ length: 20 }, () => d.roll().total);
    };
    expect(seq(20260928)).toEqual(seq(20260928));
  });

  it('不同 seed → 不同序列', () => {
    const seq = (s: number): number[] => {
      const d: Dice = createDice(s);
      return Array.from({ length: 20 }, () => d.roll().total);
    };
    expect(seq(1)).not.toEqual(seq(2));
  });

  it('分布：2..12 全部出现，7 是众数（20000 次）', () => {
    const dice = createDice(7);
    const counts = new Array(13).fill(0) as number[];
    for (let i = 0; i < 20000; i++) counts[dice.roll().total] += 1;
    for (let s = 2; s <= 12; s++) expect(counts[s]).toBeGreaterThan(0);
    const max = Math.max(...counts.slice(2));
    expect(counts[7]).toBe(max);
    /* 7 的理论概率 6/36 = 1/6，给 ±25% 容差 */
    expect(counts[7]).toBeGreaterThan((20000 / 6) * 0.75);
    expect(counts[7]).toBeLessThan((20000 / 6) * 1.25);
  });

  it('makeRng 输出落在 [0,1)，且同 seed 逐步相同', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});