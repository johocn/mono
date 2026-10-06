import { describe, it, expect } from 'vitest';
import {
  AUDIT_MAX, AUDIT_PER_RENT, AUDIT_RATE,
  ECON_BIAS_ECONOMY, ECON_BIAS_NORMAL, ECON_INDEX_MAX, ECON_INDEX_MIN, ECON_INDEX_START, ECON_VOL,
} from '../../src/data/economy';
import type { NewsItem } from '../../src/data/news';
import {
  auditChanceOf, auditTaxOf, clampIndex, econBiasOf, nextEconomyIndex,
} from '../../src/core/cycle';
import { makeRng } from '../../src/core/dice';

const news = (scope: NewsItem['scope'], sentiment: NewsItem['sentiment']): NewsItem => ({
  id: `t-${scope}-${sentiment}`, sentiment, scope, target: scope === 'economy' ? 'market' : 'bank', title: 't', magnitude: 1,
});

describe('M20.5 景气度与查税纯函数（spec §4.3）', () => {
  it('常量口径：初始 1.0、域 [0.7, 1.3]、波动 ±0.08、偏置 0.15/0.05', () => {
    expect(ECON_INDEX_START).toBe(1.0);
    expect([ECON_INDEX_MIN, ECON_INDEX_MAX]).toEqual([0.7, 1.3]);
    expect(ECON_VOL).toBe(0.08);
    expect([ECON_BIAS_ECONOMY, ECON_BIAS_NORMAL]).toEqual([0.15, 0.05]);
    expect([AUDIT_PER_RENT, AUDIT_MAX, AUDIT_RATE]).toEqual([0.0002, 0.4, 0.3]);
  });

  it('clampIndex：夹在 [0.7, 1.3]，圆整到 3 位小数，1.0 恒等（零回归）', () => {
    expect(clampIndex(1)).toBe(1);
    expect(clampIndex(0.5)).toBe(0.7);
    expect(clampIndex(2)).toBe(1.3);
    expect(clampIndex(1.23456)).toBe(1.235);
    expect(clampIndex(1.0004)).toBe(1);
  });

  it('econBiasOf：大盘 ±0.15 / 其它 ±0.05 / 无新闻 0', () => {
    expect(econBiasOf(null)).toBe(0);
    expect(econBiasOf(news('economy', 'good'))).toBe(0.15);
    expect(econBiasOf(news('economy', 'bad'))).toBe(-0.15);
    expect(econBiasOf(news('facility', 'good'))).toBe(0.05);
    expect(econBiasOf(news('stock', 'bad'))).toBe(-0.05);
  });

  it('nextEconomyIndex：游走 ±ECON_VOL 内 + 新闻偏置，且被夹在域内', () => {
    /* rng 恒 0.5 ⇒ 游走项 0，只剩偏置 */
    expect(nextEconomyIndex(1.0, () => 0.5, null)).toBe(1.0);
    expect(nextEconomyIndex(1.0, () => 0.5, news('economy', 'good'))).toBe(1.15);
    expect(nextEconomyIndex(1.0, () => 0.5, news('economy', 'bad'))).toBe(0.85);
    /* rng 恒 1 ⇒ +0.08；rng 恒 0 ⇒ −0.08 */
    expect(nextEconomyIndex(1.0, () => 1, null)).toBe(1.08);
    expect(nextEconomyIndex(1.0, () => 0, null)).toBe(0.92);
    /* 上限 / 下限夹紧 */
    expect(nextEconomyIndex(1.3, () => 1, news('economy', 'good'))).toBe(1.3);
    expect(nextEconomyIndex(0.7, () => 0, news('economy', 'bad'))).toBe(0.7);
  });

  it('同 seed 逐值可复现（零 Math.random）', () => {
    const a = makeRng(0x1234);
    const b = makeRng(0x1234);
    const seq = (rng: () => number): number[] => {
      const out: number[] = [];
      let cur = ECON_INDEX_START;
      for (let i = 0; i < 8; i++) {
        cur = nextEconomyIndex(cur, rng, i % 2 === 0 ? news('economy', 'good') : null);
        out.push(cur);
      }
      return out;
    };
    expect(seq(a)).toEqual(seq(b));
  });

  it('auditChanceOf：每 ￥100 租金 +2%，上限 40%，非正数 0', () => {
    expect(auditChanceOf(0)).toBe(0);
    expect(auditChanceOf(-5)).toBe(0);
    expect(auditChanceOf(100)).toBeCloseTo(0.02, 10);
    expect(auditChanceOf(1000)).toBeCloseTo(0.2, 10);
    expect(auditChanceOf(5000)).toBe(AUDIT_MAX);
    expect(auditChanceOf(1e9)).toBe(AUDIT_MAX);
  });

  it('auditTaxOf：本轮租金的 30% 四舍五入；非正数 0', () => {
    expect(auditTaxOf(0)).toBe(0);
    expect(auditTaxOf(100)).toBe(30);
    expect(auditTaxOf(333)).toBe(100);   // 99.9 → 100
    expect(auditTaxOf(15)).toBe(5);      // 4.5 → 5
  });

  /* —— M20.6 D54：newsMult 放大新闻偏置 —— */
  it('nextEconomyIndex：newsMult 缺省 1 时逐值回旧口径', () => {
    for (const r of [0, 0.5, 1]) {
      for (const n of [null, news('economy', 'good'), news('economy', 'bad')]) {
        expect(nextEconomyIndex(1.0, () => r, n)).toBe(nextEconomyIndex(1.0, () => r, n, 1));
      }
    }
  });

  it('nextEconomyIndex：newsMult 放大偏置（大盘 +0.15 × 2 = +0.3）', () => {
    expect(nextEconomyIndex(1.0, () => 0.5, news('economy', 'good'), 2)).toBeCloseTo(1.3, 10);
    expect(nextEconomyIndex(1.0, () => 0.5, news('economy', 'bad'), 2)).toBeCloseTo(0.7, 10);
    /* 无新闻 → 偏置 0，newsMult 无影响 */
    expect(nextEconomyIndex(1.0, () => 0, null, 2)).toBeCloseTo(0.92, 10);
  });

  it('nextEconomyIndex：newsMult 放大后仍被夹在域内', () => {
    expect(nextEconomyIndex(1.3, () => 1, news('economy', 'good'), 2)).toBe(ECON_INDEX_MAX);
    expect(nextEconomyIndex(0.7, () => 0, news('economy', 'bad'), 2)).toBe(ECON_INDEX_MIN);
  });
});
