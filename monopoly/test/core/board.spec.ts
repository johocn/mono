import { describe, it, expect } from 'vitest';
import {
  TILES, ringPath, typeAt, shortAt, nameAt, RING_SIZE, tileIndexOf, START_PUBLIC_LEVEL,
  TILE_TIER, TIER_NAME, tierOf, PROPOSED_TILE_TIER,
} from '../../src/data/board';

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

describe('商圈分档真源 · M20.6 D51（TILE_TIER / tierOf）', () => {
  it('覆盖 18 个商家格（type === shop 或起点 core 0），值 ∈ {core,tourism,town}', () => {
    const keys = Object.keys(TILE_TIER).map(Number);
    expect(keys.length).toBe(18);
    for (const i of keys) {
      expect(typeAt(i) === 'shop' || i === 0).toBe(true);
      expect(['core', 'tourism', 'town']).toContain(TILE_TIER[i]);
    }
  });

  it('非商家格 → null（监狱 12 / 银行 9 / 股票 19 / 医院 25 / 税务 23）', () => {
    expect(tierOf(12)).toBeNull();
    expect(tierOf(9)).toBeNull();
    expect(tierOf(19)).toBeNull();
    expect(tierOf(25)).toBeNull();
    expect(tierOf(23)).toBeNull();
  });

  it('tierOf 抽取真源；TILES[i].tier 与真源一致', () => {
    expect(tierOf(0)).toBe('core');
    expect(tierOf(4)).toBe('tourism');
    expect(tierOf(16)).toBe('town');
    for (const t of TILES) {
      expect(t.tier).toBe(TILE_TIER[t.index] ?? null);
    }
  });

  it('PROPOSED_TILE_TIER 为 TILE_TIER 的 re-export（同引用，避免两处漂移）', () => {
    expect(PROPOSED_TILE_TIER).toBe(TILE_TIER);
  });

  it('TIER_NAME 三档中文名齐备', () => {
    expect(TIER_NAME).toEqual({ core: '核心商圈', tourism: '文旅商圈', town: '乡镇商圈' });
  });
});