import { describe, it, expect } from 'vitest';
import { TILES, ringPath, typeAt, shortAt, nameAt, RING_SIZE, tileIndexOf, START_PUBLIC_LEVEL } from '../../src/data/board';

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
    expect(nameAt(0)).toBe('鹿乡特色小镇');
    expect(shortAt(0)).toBe('鹿乡小镇');
  });

  it('命运 / 机会各 3 格，商家 17 格不动，四个新特殊格各 1 格（M7 补全）', () => {
    const types = TILES.map((t) => t.type);
    expect(types.filter((t) => t === 'fate').length).toBe(3);
    expect(types.filter((t) => t === 'chance').length).toBe(3);
    expect(types.filter((t) => t === 'shop').length).toBe(17);
    expect(typeAt(9)).toBe('bank');
    expect(typeAt(21)).toBe('lottery');
    expect(typeAt(23)).toBe('tax');
    expect(typeAt(25)).toBe('hospital');
  });

  it('ringPath(11,7) 边长为 10 / 6（倾斜长方形），环长仍 32', () => {
    const p = ringPath(11, 7);
    expect(p.length).toBe(32);
    expect(p[0]).toEqual([1, 7]);
    expect(p[10]).toEqual([11, 7]);
    expect(p[11]).toEqual([11, 6]);
    expect(p[16]).toEqual([11, 1]);
    expect(p[26]).toEqual([1, 1]);
    expect(p[31]).toEqual([1, 6]);
  });

  it('tileIndexOf 可反查（供棋子/建筑定位，11×7 盘）', () => {
    expect(tileIndexOf(0, 0)).toBe(-1);
    expect(tileIndexOf(1, 7)).toBe(0);
    expect(tileIndexOf(11, 6)).toBe(11);
    expect(tileIndexOf(1, 6)).toBe(31);
  });
});

describe('START_PUBLIC_LEVEL · M18 开局公共设施楼（D1）', () => {
  it('只保留 4 栋：起点 L3 / 银行 L2 / 股票所 L2 / 医院 L2', () => {
    expect(START_PUBLIC_LEVEL).toEqual({ 0: 3, 9: 2, 19: 2, 25: 2 });
  });

  it('4 处全是非商家格 —— 商家格开局一律无楼', () => {
    for (const key of Object.keys(START_PUBLIC_LEVEL)) {
      const i = Number(key);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(RING_SIZE);
      expect(typeAt(i)).not.toBe('shop');
    }
    expect(typeAt(0)).toBe('core');
    expect(typeAt(9)).toBe('bank');
    expect(typeAt(19)).toBe('stock');
    expect(typeAt(25)).toBe('hospital');
  });
});