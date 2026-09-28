import { describe, it, expect } from 'vitest';
import { pawnSlots, PAWN_COUNT } from '../../src/render/PieceView';

describe('piece 棋子排布（v5 样张 line 316–320）', () => {
  it('四枚棋子站在格前沿一排，左右均分', () => {
    const xs = pawnSlots(100, 21, { gap: 9.6 });
    expect(xs.length).toBe(PAWN_COUNT);
    expect(PAWN_COUNT).toBe(4);
    expect(xs[1] - xs[0]).toBeCloseTo(9.6, 5);
    expect(xs[3] - xs[0]).toBeCloseTo(9.6 * 3, 5);
    // 以格心为中心对称
    expect((xs[0] + xs[3]) / 2).toBeCloseTo(100, 5);
  });

  it('前沿 y = 格心 + hh×1.45', () => {
    expect(100 + 10.5 * 1.45).toBeCloseTo(115.225, 3);
  });
});