import { describe, it, expect } from 'vitest';
import {
  FACILITIES, FACILITY_DIV_RATE, FACILITY_SHARES, facilityAtTile, facilityOf,
} from '../../src/data/facilities';
import { ECONOMY_TARGET, NEWS_COEF, NEWS_TABLE, newsTargetsValid } from '../../src/data/news';
import { STOCKS } from '../../src/data/stocks';

describe('公共设施数据（M20.4 spec §4.1 / D25–D26）', () => {
  it('5 处设施逐值：id / name / tiles / price / shares / rate 与 D26 一致', () => {
    expect(FACILITIES.map((f) => f.id)).toEqual(['bank', 'exchange', 'hospital', 'lottery', 'welfare']);
    const byId = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));
    expect(byId.bank).toMatchObject({ name: '鹿乡银行', tiles: [9], price: 200, shares: 20, rate: 0.05 });
    expect(byId.exchange).toMatchObject({ name: '股票交易所', tiles: [19], price: 180, shares: 20, rate: 0.05 });
    expect(byId.hospital).toMatchObject({ name: '医院', tiles: [25], price: 150, shares: 20, rate: 0.05 });
    expect(byId.lottery).toMatchObject({ name: '乐透彩', tiles: [21], price: 120, shares: 20, rate: 0.05 });
    expect(byId.welfare).toMatchObject({ name: '福利中心', tiles: [7, 27], price: 100, shares: 20, rate: 0.05 });
  });

  it('总股本与基础分红率为全表唯一口径（D26：20 股 / 5%）', () => {
    expect(FACILITY_SHARES).toBe(20);
    expect(FACILITY_DIV_RATE).toBe(0.05);
    for (const f of FACILITIES) {
      expect(f.shares).toBe(FACILITY_SHARES);
      expect(f.rate).toBe(FACILITY_DIV_RATE);
    }
  });

  it('福利中心占 7 与 27 两格但算一处（F-D1）', () => {
    expect(facilityAtTile(7)).toBe('welfare');
    expect(facilityAtTile(27)).toBe('welfare');
  });

  it('设施格映射：银行 9 / 交易所 19 / 乐透 21 / 医院 25', () => {
    expect(facilityAtTile(9)).toBe('bank');
    expect(facilityAtTile(19)).toBe('exchange');
    expect(facilityAtTile(21)).toBe('lottery');
    expect(facilityAtTile(25)).toBe('hospital');
  });

  it('非设施格 → null（监狱 12 / 税务局 23 / 起点 0 不入股，D25）', () => {
    expect(facilityAtTile(12)).toBeNull();
    expect(facilityAtTile(23)).toBeNull();
    expect(facilityAtTile(0)).toBeNull();
  });

  it('facilityOf 命中与越界防御', () => {
    expect(facilityOf('bank').name).toBe('鹿乡银行');
    expect(() => facilityOf('nope' as never)).toThrow(/unknown facility/);
  });
});

describe('新闻表数据（M20.4 spec §4.2 / D28）', () => {
  it('12 条：设施 6 + 个股 4 + 大盘 2，id 唯一', () => {
    expect(NEWS_TABLE.length).toBe(12);
    expect(new Set(NEWS_TABLE.map((n) => n.id)).size).toBe(12);
    expect(NEWS_TABLE.filter((n) => n.scope === 'facility').length).toBe(6);
    expect(NEWS_TABLE.filter((n) => n.scope === 'stock').length).toBe(4);
    /* M20.5 D48：大盘新闻一利好一利空，target 恒为 market */
    expect(NEWS_TABLE.filter((n) => n.scope === 'economy').length).toBe(2);
    expect(NEWS_TABLE.filter((n) => n.scope === 'economy').map((n) => n.target)).toEqual(['market', 'market']);
  });

  it('每条 magnitude 与 sentiment 自洽（利好 1.5 / 利空 0.5）', () => {
    for (const n of NEWS_TABLE) {
      expect(n.magnitude).toBe(NEWS_COEF[n.sentiment]);
    }
    expect(NEWS_COEF).toEqual({ good: 1.5, bad: 0.5 });
  });

  it('target 落在对应真源内（设施 → FACILITIES / 个股 → STOCKS / 大盘 → market）', () => {
    expect(newsTargetsValid()).toBe(true);
    for (const n of NEWS_TABLE) {
      if (n.scope === 'facility') {
        expect(FACILITIES.map((f) => f.id as string)).toContain(n.target);
      } else if (n.scope === 'stock') {
        expect(STOCKS.map((s) => s.code)).toContain(n.target);
      } else {
        expect(n.target).toBe(ECONOMY_TARGET);
      }
    }
  });
});
