import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { LOAN_RATE, LOAN_TERM } from '../../src/data/bank';
import { NEWS_TABLE, type NewsItem } from '../../src/data/news';
import { LOTTERY_STAKE } from '../../src/core/special';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰（本文件不依赖走位，仅满足 `createGame` 入参） */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 把局面拨到「只留 0 号玩家活跃 + `settled`」：一次 `endTurn` 即跨轮触发轮末收口 */
const soloBoundary = (g: Game): void => {
  for (const p of g.state.players.slice(1)) p.bankrupt = true;
  g.state.current = 0;
  g.state.phase = 'settled';
};

/** 造一条针对银行的设施新闻（只取本组断言需要的字段） */
const bankNews = (sentiment: 'good' | 'bad'): NewsItem => ({
  id: `n-bank-${sentiment}`,
  sentiment,
  scope: 'facility',
  target: 'bank',
  title: '测试新闻',
  magnitude: sentiment === 'good' ? 1.5 : 0.5,
});

describe('game-facility 认购（spec §5.3 / F-D13）', () => {
  it('四分支：未知设施 / 非正整数股 / 现金不足 / 成交逐值', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];

    expect(g.buyFacility('nope' as never, 1)).toEqual({ ok: false, reason: 'unknown-facility' });
    expect(g.buyFacility('bank', 0)).toEqual({ ok: false, reason: 'bad-shares' });
    expect(g.buyFacility('bank', 1.5)).toEqual({ ok: false, reason: 'bad-shares' });

    p.cash = 100;                                        // 银行 ￥200/股 ⇒ 买不起 1 股
    expect(g.buyFacility('bank', 1)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(p.cash).toBe(100);
    expect(p.facilities).toEqual({});

    p.cash = 3000;
    expect(g.buyFacility('bank', 2)).toEqual({ ok: true, facility: 'bank', shares: 2, cost: 400, cash: 2600 });
    expect(p.cash).toBe(2600);
    expect(p.facilities.bank).toBe(2);
    expect(g.state.lastEvent).toEqual({ kind: 'facility', facility: 'bank', shares: 2, cost: 400 });
  });

  it('累加认购：同一处再次买入股数叠加', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    g.buyFacility('welfare', 5);                         // 福利 ￥100/股
    g.buyFacility('welfare', 3);
    expect(p.facilities.welfare).toBe(8);
    expect(p.cash).toBe(3000 - 800);
  });

  it('售罄：先到先得（跨玩家聚合），满 20 股后拒绝', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    g.state.players[0].cash = 9999;
    g.state.players[1].cash = 9999;

    expect(g.buyFacility('bank', 20)).toMatchObject({ ok: true, shares: 20 });
    expect(g.buyFacility('bank', 1)).toEqual({ ok: false, reason: 'sold-out' });

    g.state.current = 1;                                 // 换 1 号玩家：股本已被占满
    expect(g.buyFacility('bank', 1)).toEqual({ ok: false, reason: 'sold-out' });

    g.state.current = 0;
    expect(g.buyFacility('lottery', 20)).toMatchObject({ ok: true });   // 别处不受影响
  });
});

describe('game-facility 轮末分红（spec §5.4 ⑤ / F-D3）', () => {
  it('利好系数 ×1.5：银行 10 股 + 现金流 200 → +300', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.facilities = { bank: 10 };
    g.state.news = bankNews('good');
    g.state.facilityCashflow.bank = 200;
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(p.cash).toBe(cash0 + 300);                    // round((100 + 100) × 1.5)
  });

  it('利空系数 ×0.5 → +100', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.facilities = { bank: 10 };
    g.state.news = bankNews('bad');
    g.state.facilityCashflow.bank = 200;
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(p.cash).toBe(cash0 + 100);                    // round((100 + 100) × 0.5)
  });

  it('无新闻（系数 1）：纯基础分红 + 现金流按持股比例分成，且现金流结算后清零', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.facilities = { welfare: 5 };                       // 福利 ￥100/股 → 基础 25
    g.state.news = null;
    g.state.facilityCashflow.welfare = 100;              // 分成 100 × 5 / 20 = 25
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(p.cash).toBe(cash0 + 50);
    expect(g.state.facilityCashflow).toEqual({ bank: 0, exchange: 0, hospital: 0, lottery: 0, welfare: 0 });
  });

  it('零余额回归：无人持股时设施链恒 0，现金逐值不变', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    g.state.news = null;
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(p.cash).toBe(cash0);
    expect(g.state.facilityCashflow).toEqual({ bank: 0, exchange: 0, hospital: 0, lottery: 0, welfare: 0 });
  });
});

describe('game-facility 现金流挂载点（spec §5.2 / F-D4）', () => {
  it('银行：轮末贷款利息计入现金流并按持股分成（只资本化记账，不动其他现金）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.facilities = { bank: 20 };
    p.loan = { principal: 1000, rate: LOAN_RATE, due: 1 + LOAN_TERM, overdue: 0, freeFirstRound: false };
    g.state.news = null;                                 // 系数 1
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    /* 利息 round(1000 × 0.06) = 60 → 分红 基础 200 + 分成 60 = 260 */
    expect(p.cash).toBe(cash0 + 260);
    expect(p.loan!.principal).toBe(1060);                // 计息照常资本化
    expect(p.loan!.freeFirstRound).toBe(false);
  });

  it('乐透：入场费计入现金流（stake = LOTTERY_STAKE），随后按持股分成', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.pos = 21;                                          // 乐透彩
    g.state.phase = 'moved';
    g.settleCurrent();
    expect(g.state.facilityCashflow.lottery).toBe(LOTTERY_STAKE);

    p.facilities = { lottery: 20 };
    g.state.news = null;
    const cash0 = p.cash;
    soloBoundary(g);
    g.endTurn();

    /* 基础 20 × 120 × 0.05 = 120 + 分成 100 = 220 */
    expect(p.cash).toBe(cash0 + 220);
  });

  it('交易所：当前费率 0 ⇒ 买卖均不产生现金流（零余额回归）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.pos = 19;                                          // 股票交易所
    g.trade('SY01', 2);
    expect(g.state.facilityCashflow.exchange).toBe(0);
    g.trade('SY01', -2);
    expect(g.state.facilityCashflow.exchange).toBe(0);
  });
});

describe('game-facility 每轮新闻（spec §5.4 ⑥ / F-D7 / F-D8）', () => {
  it('开局发布 1 条；同 seed 同序列；每轮末换下一条', () => {
    const a = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const b = createGame({ dice: fixed(1, 1), seed: 20261002 });

    expect(a.state.news).not.toBeNull();
    expect(NEWS_TABLE.map((n) => n.id)).toContain(a.state.news!.id);
    expect(a.state.news!.id).toBe(b.state.news!.id);

    const seen = new Set<string>([a.state.news!.id]);
    for (let k = 0; k < 5; k++) {
      soloBoundary(a);
      a.endTurn();
      soloBoundary(b);
      b.endTurn();
      expect(a.state.news!.id).toBe(b.state.news!.id);   // 同 seed 逐轮一致
      expect(NEWS_TABLE.map((n) => n.id)).toContain(a.state.news!.id);
      seen.add(a.state.news!.id);
    }
    expect(seen.size).toBeGreaterThan(1);                // 确实在轮换，而非卡死同一条
  });

  it('个股新闻写入下一轮股价强制方向（复用 stockForce 通道）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const item = NEWS_TABLE.find((n) => n.scope === 'stock' && n.sentiment === 'good')!;
    const prev = g.state.quotes[item.target];
    g.state.news = item;

    soloBoundary(g);
    g.endTurn();

    expect(g.state.quotes[item.target]).toBeGreaterThan(prev);
  });
});
