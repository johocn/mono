import { describe, it, expect } from 'vitest';
import { TILES, ringPath, typeAt, shortAt, nameAt, RING_SIZE, tileIndexOf } from '../../src/data/board';

describe('board 数据（spec §4）', () => {
  it('正好 32 格', () => {
    expect(TILES.length).toBe(RING_SIZE);
    expect(RING_SIZE).toBe(32);
  });

  it('ringPath(9,9) 形状与 spec 一致：下边 c=1→9、右边 r=8→2、上边 c=9→1、左边 r=2→8', () => {
    const p = ringPath(9, 9);
    expect(p.length).toBe(32);
    expect(p[0]).toEqual([1, 9]);
    expect(p[8]).toEqual([9, 9]);
    expect(p[9]).toEqual([9, 8]);
    expect(p[16]).toEqual([9, 1]);
    expect(p[24]).toEqual([1, 1]);
    expect(p[31]).toEqual([1, 8]);
  });

  it('index 0 是起点 core，index 12 是监狱 jail，index 19 是股票所 stock', () => {
    expect(typeAt(0)).toBe('core');
    expect(typeAt(12)).toBe('jail');
    expect(typeAt(19)).toBe('stock');
    expect(nameAt(0)).toBe('优美惠市集生鲜超市');
    expect(shortAt(0)).toBe('优美惠超市');
  });

  it('命运卡 5 格 / 机会卡 5 格（与 v5 样张 TYPES 分布一致）', () => {
    const types = TILES.map((t) => t.type);
    expect(types.filter((t) => t === 'fate').length).toBe(5);
    expect(types.filter((t) => t === 'chance').length).toBe(5);
  });

  it('tileIndexOf 可反查（供棋子/建筑定位）', () => {
    expect(tileIndexOf(0, 0)).toBe(-1);
    expect(tileIndexOf(1, 9)).toBe(0);
    expect(tileIndexOf(9, 8)).toBe(9);
    expect(tileIndexOf(1, 8)).toBe(31);
  });
});