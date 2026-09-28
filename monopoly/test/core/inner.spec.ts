import { describe, it, expect } from 'vitest';
import { innerKind, INNER_DECO_SLOTS, plazaCells } from '../../src/data/inner';

describe('inner 内环', () => {
  it('内环 = c/r 均在 2..8', () => {
    expect(innerKind(2, 2)).toBe('lawn');
    expect(innerKind(5, 5)).toBe('plaza');
    expect(innerKind(1, 5)).toBe(null);   // 外圈不是内环
  });

  it('广场 = c/r 均在 4..6', () => {
    const cells = plazaCells();
    expect(cells.length).toBe(9);
    expect(cells).toContainEqual([4, 4]);
    expect(cells).toContainEqual([6, 6]);
  });

  it('石板路 = 3/7 行列；其余绿地', () => {
    expect(innerKind(3, 5)).toBe('road');
    expect(innerKind(7, 2)).toBe('road');
    expect(innerKind(5, 7)).toBe('road');
    expect(innerKind(2, 5)).toBe('lawn');
  });

  it('8 栋内环装饰楼位置与 v5 样张一致', () => {
    expect(Object.keys(INNER_DECO_SLOTS)).toEqual(['2,4', '2,6', '4,2', '6,2', '8,4', '8,6', '4,8', '6,8']);
    expect(INNER_DECO_SLOTS['2,4']).toEqual({ levels: 3, deco: 'd1' });
  });
});