import { describe, it, expect } from 'vitest';
import {
  buyShares, createMarket, holdingOf, lotShares, marketValue, sellShares, type Portfolio,
} from '../../src/core/stocks';
import { makeRng } from '../../src/core/dice';
import { STOCKS } from '../../src/data/stocks';

const quotes = Object.fromEntries(STOCKS.map((s) => [s.code, s.price0]));

describe('stocks 盘面与涨跌（spec §5.5）', () => {
  it('初始价 = 各 price0；同 seed tick 序列一致、异 seed 不同', () => {
    const a = createMarket(makeRng(11));
    const b = createMarket(makeRng(11));
    const c = createMarket(makeRng(12));
    expect(a.quotes()).toEqual(Object.fromEntries(STOCKS.map((s) => [s.code, s.price0])));
    const seq1 = Array.from({ length: 3 }, () => a.tick());
    const seq2 = Array.from({ length: 3 }, () => b.tick());
    const seq3 = Array.from({ length: 3 }, () => c.tick());
    expect(seq1).toEqual(seq2);
    expect(seq1).not.toEqual(seq3);
  });

  it('价格恒 ≥ 1、单次变动 ≤ vol；4 支都出现涨与跌', () => {
    const m = createMarket(makeRng(5));
    let prev = m.quotes();
    const seen = new Map<string, Set<boolean>>();
    for (const s of STOCKS) seen.set(s.code, new Set());
    for (let k = 0; k < 60; k++) {
      const next = m.tick();
      for (const s of STOCKS) {
        const p = prev[s.code];
        const n = next[s.code];
        expect(n).toBeGreaterThanOrEqual(1);
        expect(Math.abs(n - p)).toBeLessThanOrEqual(p * s.vol + 1);
        if (n !== p) seen.get(s.code)!.add(n > p);
      }
      prev = next;
    }
    for (const s of STOCKS) expect(seen.get(s.code)!.size).toBe(2);
  });

  it('force 标的定向走到幅度上限：dir=1 涨停、dir=-1 跌停', () => {
    const m = createMarket(makeRng(5));
    const prev = m.quotes();
    const vol = STOCKS.find((s) => s.code === 'SY01')!.vol;
    const up = m.tick([{ code: 'SY01', dir: 1 }]);
    expect(up.SY01).toBe(Math.round(prev.SY01 * (1 + vol)));
    expect(up.SY01).toBeGreaterThan(prev.SY01);
    const down = m.tick([{ code: 'SY02', dir: -1 }]);
    const vol2 = STOCKS.find((s) => s.code === 'SY02')!.vol;
    expect(down.SY02).toBe(Math.round(up.SY02 * (1 - vol2)));
    expect(down.SY02).toBeLessThan(up.SY02);
  });

  it('命中 force 的标的不消耗 rng：同一 seed 下其余标的涨跌与强制方向无关', () => {
    const up = createMarket(makeRng(9));
    const down = createMarket(makeRng(9));
    const a = up.tick([{ code: 'SY01', dir: 1 }]);
    const b = down.tick([{ code: 'SY01', dir: -1 }]);
    expect(a.SY01).toBeGreaterThan(b.SY01);
    /* SY02..SY04 走的是同一批 rng 值 ⇒ 两次结果逐字节相同（证明 SY01 未抢走随机数） */
    for (const s of STOCKS.filter((d) => d.code !== 'SY01')) expect(a[s.code]).toBe(b[s.code]);
  });

  it('history()：首点 = 发行价；每 tick 追加一点且末点 === quotes()', () => {
    const m = createMarket(makeRng(7));
    const h0 = m.history();
    for (const s of STOCKS) expect(h0[s.code]).toEqual([s.price0]);

    const q1 = m.tick();
    const q2 = m.tick([{ code: 'SY02', dir: 1 }]);
    const h = m.history();
    for (const s of STOCKS) {
      expect(h[s.code]).toHaveLength(3);
      expect(h[s.code][0]).toBe(s.price0);
      expect(h[s.code][h[s.code].length - 1]).toBe(q2[s.code]);
    }
    expect(m.quotes()).toEqual(q2);
    /* 返回副本：外部改动不污染内部序列 */
    h.SY01.push(9999);
    expect(m.history().SY01).toHaveLength(3);
    expect(q1.SY01).toBeGreaterThanOrEqual(1);
  });

  /* —— M20.6 D54：volMult 放大波动幅度 —— */
  it('volMult 缺省 1 ⇒ 与显式 1 逐值相同（零回归）', () => {
    const a = createMarket(makeRng(21));
    const b = createMarket(makeRng(21));
    for (let i = 0; i < 4; i++) {
      expect(a.tick([], 1)).toEqual(b.tick());
    }
  });

  it('volMult 放大强制方向的定点幅度（dir=1 涨停 ×mult）', () => {
    const m = createMarket(makeRng(5));
    const prev = m.quotes();
    const vol = STOCKS.find((s) => s.code === 'SY01')!.vol;
    const up = m.tick([{ code: 'SY01', dir: 1 }], 2);
    expect(up.SY01).toBe(Math.round(prev.SY01 * (1 + vol * 2)));
  });

  it('volMult 放大随机波动幅度（同 seed 下 |Δ| 不超过 vol × mult）', () => {
    const m = createMarket(makeRng(33));
    let prev = m.quotes();
    for (let k = 0; k < 30; k++) {
      const next = m.tick([], 2);
      for (const s of STOCKS) {
        expect(next[s.code]).toBeGreaterThanOrEqual(1);
        expect(Math.abs(next[s.code] - prev[s.code])).toBeLessThanOrEqual(prev[s.code] * s.vol * 2 + 1);
      }
      prev = next;
    }
  });
});

describe('stocks 买卖（spec §5.5）', () => {
  it('买入：整股、现金够 → 扣现、持股增、cost 累加', () => {
    const p: Portfolio = {};
    const r1 = buyShares(p, quotes, 'SY01', 2, 1000);
    expect(r1).toEqual({ ok: true, code: 'SY01', shares: 2, price: 120, cost: 240, cash: 760 });
    expect(holdingOf(p, 'SY01')).toEqual({ code: 'SY01', shares: 2, cost: 240 });
    const r2 = buyShares(p, quotes, 'SY01', 1, 760);
    expect(r2.ok).toBe(true);
    expect(holdingOf(p, 'SY01')).toEqual({ code: 'SY01', shares: 3, cost: 360 });
  });

  it('现金不足 → not-enough-cash，状态不变', () => {
    const p: Portfolio = {};
    expect(buyShares(p, quotes, 'SY01', 1, 10)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(p).toEqual({});
  });

  it('卖出：不超过持股 → 加现减股；超过 → not-enough-shares；卖空后删键', () => {
    const p: Portfolio = { SY02: { code: 'SY02', shares: 2, cost: 160 } };
    expect(sellShares(p, quotes, 'SY02', 3, 0)).toEqual({ ok: false, reason: 'not-enough-shares' });
    const r = sellShares(p, quotes, 'SY02', 1, 0);
    expect(r).toEqual({ ok: true, code: 'SY02', shares: 1, price: 80, cost: 80, cash: 80 });
    expect(holdingOf(p, 'SY02')?.shares).toBe(1);
    expect(sellShares(p, quotes, 'SY02', 1, 80).ok).toBe(true);
    expect(holdingOf(p, 'SY02')).toBeNull();
  });

  it('bad-lot：shares = 0 或非整数 → 失败且不改状态', () => {
    const p: Portfolio = {};
    expect(buyShares(p, quotes, 'SY01', 0, 1000)).toEqual({ ok: false, reason: 'bad-lot' });
    expect(buyShares(p, quotes, 'SY01', 1.5, 1000)).toEqual({ ok: false, reason: 'bad-lot' });
    const q: Portfolio = { SY01: { code: 'SY01', shares: 2, cost: 240 } };
    expect(sellShares(q, quotes, 'SY01', 0, 0)).toEqual({ ok: false, reason: 'bad-lot' });
    expect(q.SY01.shares).toBe(2);
  });
});

describe('stocks 数量档 lotShares（M20.3-B spec §6.1）', () => {
  it('定值档按方向截断到上限；all 按现金 / 持股推导；held = 0 卖侧归零', () => {
    /* 买侧上限 = floor(现金 / 现价) */
    expect(lotShares(1, 120, 1000, 0, 'buy')).toBe(1);
    expect(lotShares(5, 120, 1000, 0, 'buy')).toBe(5);
    expect(lotShares(5, 120, 300, 0, 'buy')).toBe(2);        // 现金只够 2 股
    expect(lotShares('all', 120, 1000, 0, 'buy')).toBe(8);
    expect(lotShares('all', 120, 100, 0, 'buy')).toBe(0);    // 连 1 股都买不起
    expect(lotShares('all', 0, 1000, 0, 'buy')).toBe(0);     // 价格非正 ⇒ 0
    /* 卖侧上限 = 持股 */
    expect(lotShares(5, 120, 1000, 3, 'sell')).toBe(3);
    expect(lotShares('all', 120, 0, 3, 'sell')).toBe(3);
    expect(lotShares('all', 120, 0, 0, 'sell')).toBe(0);     // 空仓不出除零
    expect(lotShares(1, 120, 0, 0, 'sell')).toBe(0);
  });
});

describe('stocks 市值（spec §5.5）', () => {
  it('marketValue = Σ shares × 当前价；空仓为 0', () => {
    expect(marketValue({}, quotes)).toBe(0);
    const p: Portfolio = {
      SY01: { code: 'SY01', shares: 2, cost: 0 },
      SY04: { code: 'SY04', shares: 3, cost: 0 },
    };
    expect(marketValue(p, quotes)).toBe(2 * 120 + 3 * 40);
    expect(marketValue(p, { ...quotes, SY01: 130 })).toBe(2 * 130 + 3 * 40);
  });
});