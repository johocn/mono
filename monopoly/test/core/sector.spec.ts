import { describe, it, expect } from 'vitest';
import { SECTOR_RENT_COEF, type NewsItem } from '../../src/data/news';
import { sectorRentCoefOf } from '../../src/core/sector';
import { tierOf } from '../../src/data/board';

const sectorNews = (target: string, sentiment: NewsItem['sentiment']): NewsItem => ({
  id: `n-${target}-${sentiment}`, sentiment, scope: 'sector', target, title: 't',
  magnitude: SECTOR_RENT_COEF[sentiment],
});

describe('M20.6 板块租金系数（spec §5.2 D52）', () => {
  it('常量：利好 ×1.25 / 利空 ×0.8', () => {
    expect(SECTOR_RENT_COEF).toEqual({ good: 1.25, bad: 0.8 });
  });

  it('无新闻 / null → 1', () => {
    expect(sectorRentCoefOf(null, 0)).toBe(1);
    expect(sectorRentCoefOf(null, 4)).toBe(1);
  });

  it('非板块新闻（设施 / 个股 / 大盘）→ 1', () => {
    const fac: NewsItem = { id: 'f', sentiment: 'good', scope: 'facility', target: 'bank', title: 't', magnitude: 1.5 };
    const stk: NewsItem = { id: 's', sentiment: 'good', scope: 'stock', target: 'SY01', title: 't', magnitude: 1.5 };
    const eco: NewsItem = { id: 'e', sentiment: 'good', scope: 'economy', target: 'market', title: 't', magnitude: 1.5 };
    expect(sectorRentCoefOf(fac, 0)).toBe(1);
    expect(sectorRentCoefOf(stk, 0)).toBe(1);
    expect(sectorRentCoefOf(eco, 0)).toBe(1);
  });

  it('板块利好命中 → 1.25；板块利空命中 → 0.8（core 格 0）', () => {
    expect(tierOf(0)).toBe('core');
    expect(sectorRentCoefOf(sectorNews('core', 'good'), 0)).toBe(1.25);
    expect(sectorRentCoefOf(sectorNews('core', 'bad'), 0)).toBe(0.8);
  });

  it('板块新闻命中 tourism / town', () => {
    expect(tierOf(4)).toBe('tourism');
    expect(sectorRentCoefOf(sectorNews('tourism', 'good'), 4)).toBe(1.25);
    expect(tierOf(16)).toBe('town');
    expect(sectorRentCoefOf(sectorNews('town', 'bad'), 16)).toBe(0.8);
  });

  it('板块新闻未命中（不同商圈）→ 1', () => {
    expect(sectorRentCoefOf(sectorNews('tourism', 'good'), 0)).toBe(1);   // core 格遇 tourism 新闻
    expect(sectorRentCoefOf(sectorNews('core', 'bad'), 4)).toBe(1);
  });

  it('无商圈归属的格（银行 9 / 监狱 12 / 股票 19）→ 1，即便有板块新闻', () => {
    for (const i of [9, 12, 19, 25]) {
      expect(tierOf(i)).toBeNull();
      expect(sectorRentCoefOf(sectorNews('core', 'good'), i)).toBe(1);
    }
  });

  it('全商家格：命中所属板块利好恒得 1.25（与 tierOf 真源一致）', () => {
    for (const idx of [0, 1, 3, 4, 6, 8, 10, 11, 13, 15, 16, 18, 20, 22, 24, 26, 28, 30]) {
      const tier = tierOf(idx)!;
      expect(sectorRentCoefOf(sectorNews(tier, 'good'), idx)).toBe(1.25);
    }
  });
});