import { describe, it, expect } from 'vitest';
import { labelPlacement, labelTextOf } from '../../src/render/LabelView';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('label 标签（v5 样张 line 312–314）', () => {
  it('标签 y = 格心 + hh×比例，压在格前沿（不会被前排楼盖住）', () => {
    const p = labelPlacement(100, 200, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.cx).toBe(100);
    expect(p.cy).toBeCloseTo(204.83, 2);
    expect(p.h).toBe(9.4);
  });

  it('标签宽度 = 字数 × 字号 + 横向留白', () => {
    const p = labelPlacement(0, 0, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.widthFor('太平温泉')).toBe(6.2 * 4 + 5);
    expect(p.widthFor('优美惠超市')).toBe(6.2 * 5 + 5);
  });

  it('labelTextOf 用短名', () => {
    expect(labelTextOf(4)).toBe('太平温泉');
    expect(labelTextOf(0)).toBe('优美惠超市');
  });
});