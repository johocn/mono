import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { LOAN_RATE, LOAN_TERM } from '../../src/data/bank';
import { DIVIDEND_PER_SHARE, DIVIDEND_REFUND, MARGIN_RATE, STOCKS, STOCK_TILE_INDEX } from '../../src/data/stocks';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰（本文件不依赖走位，仅满足 `createGame` 入参） */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/**
 * 把局面拨到「只留 0 号玩家活跃 + `settled`」：此时一次 `endTurn` 就会跨轮触发轮末收口
 * （`nextActiveFrom` 绕回 0 ⇒ `crossed` ⇒ `onRoundBoundary`）。0 号玩家不回挪位，故其现金不被地块结算污染。
 */
const soloBoundary = (g: Game): void => {
  for (const p of g.state.players.slice(1)) p.bankrupt = true;
  g.state.current = 0;
  g.state.phase = 'settled';
};

describe('game-stock-track 两张股票卡（M20.3-B spec §5.5）', () => {
  it('涨跌卡押涨：写强制方向表、消耗手牌、lastEvent 记卡', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.useCard('bullBear', undefined, { code: 'SY01', dir: 'up' })).toEqual({ ok: true, kind: 'bullBear' });
    expect(g.state.stockForce[0]).toEqual({ code: 'SY01', dir: 1 });
    expect(g.state.hands[0]).not.toContain('bullBear');
    expect(g.state.lastEvent).toEqual({ kind: 'card', card: 'bullBear', target: null });
  });

  it('涨跌卡押跌 → dir = −1', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.useCard('bullBear', undefined, { code: 'SY03', dir: 'down' });
    expect(g.state.stockForce[0]).toEqual({ code: 'SY03', dir: -1 });
  });

  it('涨跌卡失败分支：缺参数 no-target、未知标的 unknown-code、未持有 not-held（失败不消耗）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.useCard('bullBear')).toEqual({ ok: false, reason: 'no-target' });
    expect(g.useCard('bullBear', undefined, { code: 'NOPE', dir: 'up' })).toEqual({ ok: false, reason: 'unknown-code' });
    expect(g.state.hands[0]).toContain('bullBear');
    expect(g.state.stockForce[0]).toBeNull();
    g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'bullBear');
    expect(g.useCard('bullBear', undefined, { code: 'SY01', dir: 'up' })).toEqual({ ok: false, reason: 'not-held' });
  });

  it('涨跌卡押涨 → 下一轮该标的按 vol 上限上涨，随后强制方向表清空', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const prev = g.state.quotes.SY02;
    const vol = STOCKS.find((s) => s.code === 'SY02')!.vol;
    g.useCard('bullBear', undefined, { code: 'SY02', dir: 'up' });
    soloBoundary(g);
    g.endTurn();
    expect(g.state.quotes.SY02).toBe(Math.round(prev * (1 + vol)));
    expect(g.state.stockForce.every((f) => f === null)).toBe(true);
  });

  it('红利卡无持仓：折现 DIVIDEND_REFUND 入现金并消耗手牌', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    const cash0 = p.cash;
    expect(g.useCard('dividend')).toEqual({ ok: true, kind: 'dividend' });
    expect(p.cash).toBe(cash0 + DIVIDEND_REFUND);
    expect(g.state.hands[0]).not.toContain('dividend');
  });

  it('红利卡有持仓：跨标的合并统计持股 × DIVIDEND_PER_SHARE', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    g.state.portfolios[0] = {
      SY01: { code: 'SY01', shares: 2, cost: 240 },
      SY03: { code: 'SY03', shares: 3, cost: 180 },
    };
    const cash0 = p.cash;
    g.useCard('dividend');
    expect(p.cash).toBe(cash0 + 5 * DIVIDEND_PER_SHARE);
  });
});

describe('game-stock-track 杠杆买入（M20.3-B spec §5.2）', () => {
  it('2×：自有 = ⌈成本 / 2⌉，差额入保证金；现金与持仓成本只计自有资金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = STOCK_TILE_INDEX;
    /* 成本 120 × 2 = 240 → 自有 120 / 借入 120 */
    expect(g.trade('SY01', 2, 2)).toEqual({ ok: true, code: 'SY01', shares: 2, price: 120, cost: 120, cash: 2880 });
    expect(g.state.players[0].cash).toBe(2880);
    expect(g.state.players[0].margin).toEqual({ principal: 120, rate: MARGIN_RATE });
    expect(g.state.portfolios[0].SY01).toEqual({ code: 'SY01', shares: 2, cost: 120 });
  });

  it('3×：ceil(120 / 3) = 40 自有、80 借入；再次加仓则本金累加', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = STOCK_TILE_INDEX;
    expect(g.trade('SY01', 1, 3)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 40, cash: 2960 });
    expect(g.state.players[0].margin).toEqual({ principal: 80, rate: MARGIN_RATE });
    expect(g.trade('SY01', 1, 3)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 40, cash: 2920 });
    expect(g.state.players[0].margin).toEqual({ principal: 160, rate: MARGIN_RATE });
  });

  it('自有资金不足 → not-enough-cash 且状态零变化；非法倍数 / 未知标的 / 非交易所各归其因', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    p.cash = 10;
    expect(g.trade('SY01', 1, 3)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(p.cash).toBe(10);
    expect(p.margin).toBeNull();
    expect(g.state.portfolios[0]).toEqual({});

    p.cash = 3000;
    expect(g.trade('SY01', 1, 4)).toEqual({ ok: false, reason: 'bad-lot' });      // 不在 LEVERAGES
    expect(g.trade('SY01', 1, 2.5)).toEqual({ ok: false, reason: 'bad-lot' });
    expect(g.trade('NOPE', 1, 2)).toEqual({ ok: false, reason: 'unknown-code' });

    p.pos = 0;
    expect(g.trade('SY01', 1, 2)).toEqual({ ok: false, reason: 'not-at-market' });
  });
});

describe('game-stock-track 卖出先还债（M20.3-B spec §5.2）', () => {
  it('所得 < 借入：全额冲抵、现金不变；所得 > 借入：还清并把余额入现金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    /* 3× 买 3 股：成本 360 → 自有 120 / 借入 240，现金 2880 */
    expect(g.trade('SY01', 3, 3)).toEqual({ ok: true, code: 'SY01', shares: 3, price: 120, cost: 120, cash: 2880 });

    /* 卖 1 股得 120 < 借入 240 ⇒ 全部冲抵，现金不变、余债 120 */
    expect(g.trade('SY01', -1)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 120, cash: 2880 });
    expect(p.margin).toEqual({ principal: 120, rate: MARGIN_RATE });
    expect(p.cash).toBe(2880);
    expect(g.state.portfolios[0].SY01!.shares).toBe(2);

    /* 再卖 1 股得 120 = 余债 120 ⇒ 恰好还清、无余额入现金 */
    expect(g.trade('SY01', -1)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 120, cash: 2880 });
    expect(p.margin).toBeNull();
    expect(p.cash).toBe(2880);
  });

  it('所得 > 借入：margin 清空、余额补进现金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    /* 3× 买 1 股：自有 40 / 借入 80，现金 2960 */
    g.trade('SY01', 1, 3);
    expect(g.trade('SY01', -1)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 120, cash: 3000 });
    expect(p.margin).toBeNull();
    expect(p.cash).toBe(3000);                       // 2960 + (120 − 80)
    expect(g.state.portfolios[0].SY01).toBeUndefined();
  });
});

describe('game-stock-track 轮末保证金复利（M20.3-B spec §5.3）', () => {
  it('本金按 MARGIN_RATE 复利并取整；价格未触发爆仓时现金不变', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 20261002 });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    g.trade('SY01', 2, 2);                           // 借入 120
    const cash0 = p.cash;
    soloBoundary(g);
    g.endTurn();

    expect(g.state.round).toBe(2);
    expect(p.margin!.principal).toBe(Math.round(120 * (1 + MARGIN_RATE)));   // 127
    expect(p.cash).toBe(cash0);
    expect(g.state.portfolios[0].SY01!.shares).toBe(2);
  });
});

describe('game-stock-track 爆仓强平（M20.3-B spec §5.3 / B-D3）', () => {
  it('市值 < 借入 × 120% → 清仓；不足部分转入信用贷款（不动现金）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    p.margin = { principal: 1000, rate: MARGIN_RATE };
    g.state.portfolios[0] = { SY01: { code: 'SY01', shares: 1, cost: 120 } };
    /* 强制 SY01 跌到 vol 下限：round(120 × 0.88) = 106，远低于复利后 1060 × 1.2 */
    g.state.stockForce[0] = { code: 'SY01', dir: -1 };
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(g.state.quotes.SY01).toBe(106);
    expect(p.margin).toBeNull();
    expect(g.state.portfolios[0]).toEqual({});
    expect(p.cash).toBe(cash0);                      // B-D3：不动现金
    expect(p.loan).toMatchObject({ principal: 1060 - 106, rate: LOAN_RATE, due: 2 + LOAN_TERM });
    expect(g.state.lastEvent).toEqual({ kind: 'marginCall', player: 1, debt: 954, refund: 0 });
  });

  it('清仓后有余额 → 返还现金、不产生贷款', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = STOCK_TILE_INDEX;
    p.margin = { principal: 90, rate: MARGIN_RATE };          // 复利后 95，爆仓线 114
    g.state.portfolios[0] = { SY01: { code: 'SY01', shares: 1, cost: 120 } };
    g.state.stockForce[0] = { code: 'SY01', dir: -1 };         // 106 < 114 ⇒ 强平
    const cash0 = p.cash;

    soloBoundary(g);
    g.endTurn();

    expect(g.state.quotes.SY01).toBe(106);
    expect(p.margin).toBeNull();
    expect(g.state.portfolios[0]).toEqual({});
    expect(p.loan).toBeNull();
    expect(p.cash).toBe(cash0 + (106 - 95));                   // 121 − 95 = 11
    expect(g.state.lastEvent).toEqual({ kind: 'marginCall', player: 1, debt: 0, refund: 11 });
  });
});
