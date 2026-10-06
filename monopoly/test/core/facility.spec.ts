import { describe, it, expect } from 'vitest';
import {
  canSubscribe, dividendOf, estimateDividend, newsCoefOf, newsForceOf, soldSharesOf,
  type FacilityHolder,
} from '../../src/core/facility';
import { facilityOf, type FacilityId } from '../../src/data/facilities';
import type { NewsItem } from '../../src/data/news';
import { STOCKS } from '../../src/data/stocks';

function holder(facilities: Partial<Record<FacilityId, number>>, bankrupt = false): FacilityHolder {
  return { bankrupt, facilities };
}

function news(partial: Partial<NewsItem>): NewsItem {
  return { id: 'n', sentiment: 'good', scope: 'facility', target: 'bank', title: 't', magnitude: 1.5, ...partial };
}

describe('newsCoefOf（D28 ① / F-D3）', () => {
  it('设施利好命中 → 1.5', () => {
    expect(newsCoefOf(news({ sentiment: 'good', target: 'bank' }), 'bank')).toBe(1.5);
  });

  it('设施利空命中 → 0.5', () => {
    expect(newsCoefOf(news({ sentiment: 'bad', target: 'bank' }), 'bank')).toBe(0.5);
  });

  it('设施新闻但非本设施 → 1（无关）', () => {
    expect(newsCoefOf(news({ sentiment: 'good', target: 'lottery' }), 'bank')).toBe(1);
  });

  it('个股新闻 / null → 1', () => {
    expect(newsCoefOf(news({ scope: 'stock', target: 'SY01' }), 'bank')).toBe(1);
    expect(newsCoefOf(null, 'bank')).toBe(1);
  });
});

describe('newsForceOf（D28 ② / F-D10）', () => {
  it('个股利好 → dir 1；个股利空 → dir -1', () => {
    expect(newsForceOf(news({ scope: 'stock', target: 'SY01', sentiment: 'good' }))).toEqual({ code: 'SY01', dir: 1 });
    expect(newsForceOf(news({ scope: 'stock', target: 'SY02', sentiment: 'bad' }))).toEqual({ code: 'SY02', dir: -1 });
  });

  it('设施新闻 / null → null', () => {
    expect(newsForceOf(news({ scope: 'facility', target: 'bank' }))).toBeNull();
    expect(newsForceOf(null)).toBeNull();
  });

  it('force 的 code 一定落在 STOCKS 内（可被 market.tick 命中）', () => {
    const codes = STOCKS.map((s) => s.code);
    for (let i = 0; i < 20; i++) {
      const f = newsForceOf(news({ scope: 'stock', target: codes[i % codes.length] }));
      expect(codes).toContain(f?.code);
    }
  });
});

describe('soldSharesOf 聚合（F-D1 先到先得）', () => {
  it('全缺键 → 0', () => {
    expect(soldSharesOf([holder({}), holder({})], 'bank')).toBe(0);
  });

  it('多玩家求和', () => {
    expect(soldSharesOf([holder({ bank: 3 }), holder({ bank: 5 }), holder({})], 'bank')).toBe(8);
  });

  it('不同设施互不串账', () => {
    expect(soldSharesOf([holder({ bank: 3, lottery: 7 })], 'bank')).toBe(3);
    expect(soldSharesOf([holder({ bank: 3, lottery: 7 })], 'lottery')).toBe(7);
    expect(soldSharesOf([holder({ bank: 3 })], 'welfare')).toBe(0);
  });

  it('已破产玩家的持股不计入', () => {
    expect(soldSharesOf([holder({ bank: 20 }, true), holder({ bank: 1 })], 'bank')).toBe(1);
  });
});

describe('canSubscribe 四分支（spec §5.3 / F-D13）', () => {
  const players = [holder({})];

  it('bad-shares：0 股 / 负股 / 小数', () => {
    expect(canSubscribe(players, 'bank', 0, 9999).reason).toBe('bad-shares');
    expect(canSubscribe(players, 'bank', -1, 9999).reason).toBe('bad-shares');
    expect(canSubscribe(players, 'bank', 1.5, 9999).reason).toBe('bad-shares');
  });

  it('sold-out：超出剩余股本（先到先得）', () => {
    const held = [holder({ bank: 18 })];
    expect(canSubscribe(held, 'bank', 1, 9999).ok).toBe(true);
    expect(canSubscribe(held, 'bank', 3, 9999).reason).toBe('sold-out');
    expect(canSubscribe([holder({ bank: 20 })], 'bank', 1, 9999).reason).toBe('sold-out');
  });

  it('not-enough-cash：现金 < 认购价 × 股数', () => {
    expect(canSubscribe(players, 'bank', 1, 199).reason).toBe('not-enough-cash');
    expect(canSubscribe(players, 'bank', 5, 999).reason).toBe('not-enough-cash');
  });

  it('ok：现金恰好等 / 超过，cost = 认购价 × 股数', () => {
    const r1 = canSubscribe(players, 'bank', 1, 200);
    expect(r1).toEqual({ ok: true, cost: 200 });
    const r5 = canSubscribe(players, 'exchange', 5, 900);
    expect(r5).toEqual({ ok: true, cost: 900 });
  });

  it('unknown-facility 防御', () => {
    expect(canSubscribe(players, 'nope' as never, 1, 9999).reason).toBe('unknown-facility');
  });
});

describe('dividendOf（F-D3 / D27；M20.6 D53 强化：flow×2 + 6% 基础率）', () => {
  it('银行 10 股、现金流 200、利好 1.5 → round((120 + 200) × 1.5) = 480', () => {
    expect(dividendOf(facilityOf('bank'), 10, 200, 1.5)).toBe(480);
  });

  it('利空 0.5 → round((120 + 200) × 0.5) = 160', () => {
    expect(dividendOf(facilityOf('bank'), 10, 200, 0.5)).toBe(160);
  });

  it('无新闻系数（1）且无现金流 → 纯基础分红（6%）', () => {
    expect(dividendOf(facilityOf('bank'), 10, 0, 1)).toBe(120);
    expect(dividendOf(facilityOf('welfare'), 20, 0, 1)).toBe(120);
  });

  it('0 股 → 0（零回归关键）', () => {
    for (const id of ['bank', 'exchange', 'hospital', 'lottery', 'welfare'] as FacilityId[]) {
      expect(dividendOf(facilityOf(id), 0, 500, 1.5)).toBe(0);
    }
  });

  it('现金流按持股比例 × 通过系数分成：福利 5 股、现金流 100 → 基础 30 + 分成 50 = 80', () => {
    expect(dividendOf(facilityOf('welfare'), 5, 100, 1)).toBe(80);
  });

  it('estimateDividend 与 dividendOf 同值', () => {
    expect(estimateDividend('bank', 4, 40, 1.5)).toBe(dividendOf(facilityOf('bank'), 4, 40, 1.5));
  });
});
