import { describe, it, expect } from 'vitest';
import { ptsToPoly, polyline, rectPath } from '../../src/render/paint';

describe('paint 原语', () => {
  it('ptsToPoly 把 [x,y] 数组摊平成 Pixi 需要的扁平数字数组', () => {
    expect(ptsToPoly([[1, 2], [3, 4], [5, 6]])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('polyline 闭合两点以上', () => {
    expect(polyline([[1, 2], [3, 4], [5, 6]])).toEqual([1, 2, 3, 4, 5, 6, 1, 2]);
  });
  it('rectPath 返回左上右下', () => {
    expect(rectPath(10, 20, 30, 40)).toEqual([10, 20, 40, 60]);
  });
});