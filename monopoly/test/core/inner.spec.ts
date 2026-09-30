import { describe, it, expect } from 'vitest';
import { innerKind, INNER_DECO_SLOTS, plazaCells } from '../../src/data/inner';

describe('inner 内环（11×7 盘）', () => {
  it('内环 = c ∈ 2..10、r ∈ 2..6', () => {
    expect(innerKind(2, 2)).toBe('road');
    expect(innerKind(6, 4)).toBe('plaza');
    expect(innerKind(1, 4)).toBe(null);   // 外圈不是内环
    expect(innerKind(6, 7)).toBe(null);
  });

  it('广场 = 以中心 (6,4) 为心的 3×3', () => {
    const cells = plazaCells();
    expect(cells.length).toBe(9);
    expect(cells).toContainEqual([5, 3]);
    expect(cells).toContainEqual([7, 5]);
  });

  it('石板路 = 广场外一圈；其余绿地', () => {
    expect(innerKind(4, 4)).toBe('road');
    expect(innerKind(8, 5)).toBe('road');
    expect(innerKind(6, 6)).toBe('road');
    expect(innerKind(2, 4)).toBe('lawn');
  });

  it('8 栋内环装饰楼只落在绿地格上', () => {
    expect(Object.keys(INNER_DECO_SLOTS)).toEqual(['2,3', '2,5', '3,3', '3,5', '9,3', '9,5', '10,3', '10,5']);
    expect(INNER_DECO_SLOTS['2,3']).toEqual({ levels: 3, deco: 'd1' });
    for (const key of Object.keys(INNER_DECO_SLOTS)) {
      const [c, r] = key.split(',').map(Number);
      expect(innerKind(c, r)).toBe('lawn');
    }
  });
});