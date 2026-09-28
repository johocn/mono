import { describe, it, expect } from 'vitest';
import { ipos, dia, up, win, depthKey, compareDepth, hostHeight } from '../../src/render/iso';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('iso', () => {
  it('ipos：行列镜像对称（c-r 决定 x，c+r 决定 y）', () => {
    expect(ipos(1, 1, GEO)).toEqual([195, 117]);
    expect(ipos(2, 1, GEO)).toEqual([216, 127.5]);
    expect(ipos(1, 2, GEO)).toEqual([174, 127.5]);
  });

  it('ipos：等距每步 x 差 = hw，y 差 = hh', () => {
    const [x0, y0] = ipos(3, 3, GEO);
    const [x1, y1] = ipos(4, 3, GEO);
    expect(x1 - x0).toBe(21);
    expect(y1 - y0).toBe(10.5);
  });

  it('dia：返回 4 点菱形的左下→右→上→左顺序', () => {
    expect(dia(100, 200, GEO.hw, GEO.hh)).toEqual([
      [100, 210.5], [121, 200], [100, 189.5], [79, 200],
    ]);
  });

  it('dia：lift 为正时整块上移', () => {
    expect(dia(100, 200, GEO.hw, GEO.hh, 5)).toEqual([
      [100, 205.5], [121, 195], [100, 184.5], [79, 195],
    ]);
  });

  it('up：只改 y', () => {
    expect(up([7, 9], 4)).toEqual([7, 5]);
  });

  it('win：墙面参数化四边形（u 沿底边，v 沿高度向上）', () => {
    const pts = win([0, 0], [100, 0], 50, 0.2, 0.4, 0.1, 0.5);
    expect(pts).toEqual([[20, -5], [40, -5], [40, -25], [20, -25]]);
  });

  it('depthKey：c+r 为主键，c 为次键（远处先画）', () => {
    expect(depthKey(1, 1)).toBe(2);
    expect(compareDepth({ c: 1, r: 2 }, { c: 2, r: 1 })).toBeLessThan(0); // 同 c+r，c 小者先
    expect(compareDepth({ c: 2, r: 2 }, { c: 1, r: 1 })).toBeGreaterThan(0);
  });

  it('hostHeight：层级 → 墙高（数值来自注册表传参，不写死）', () => {
    const H = { 1: 26, 2: 46, 3: 72 };
    expect(hostHeight(1, H)).toBe(26);
    expect(hostHeight(3, H)).toBe(72);
    expect(hostHeight(2, H)).toBe(46);
  });
});