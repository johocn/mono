import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { START_CASH } from '../../src/data/economy';
import { MARGIN_RATE } from '../../src/data/stocks';
import { MORTGAGE_RATE, MORTGAGE_TERM } from '../../src/data/bank';
import type { Dice } from '../../src/core/dice';
import type { BuildLevel } from '../../src/data/board';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 把 1 号玩家放到 9 号银行格 + 造一笔保证金借款 */
const withMargin = (g: Game, principal: number, cash = START_CASH): void => {
  g.state.players[0].pos = 9;
  g.state.players[0].cash = cash;
  g.state.players[0].margin = { principal, rate: MARGIN_RATE };
};

/** 给玩家一块自有地块（默认 L1，变卖价 30 → 抵押额度 24） */
const giveEstate = (g: Game, index: number, owner = 1, level: BuildLevel = 1, processing = false): void => {
  g.state.estates[index] = { index, owner, level, processing };
};

describe('M20.5 追加保证金（spec §5.3 D41）', () => {
  it('无保证金借款 → no-debt（两来源同判）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.addMargin(100)).toEqual({ ok: false, reason: 'no-debt' });
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: false, reason: 'no-debt' });
  });

  it('cash：现金冲减借款，added = min(amount, 现金, 借款)', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 1000);
    expect(g.addMargin(400)).toEqual({ ok: true, added: 400, principal: 600 });
    expect(g.state.players[0].cash).toBe(START_CASH - 400);
    expect(g.state.players[0].margin?.principal).toBe(600);
    expect(g.state.lastEvent).toEqual({ kind: 'marginAdd', player: 1, added: 400, source: 'cash' });
  });

  it('cash 缺省 = 全额（现金与借款取小）；还清即 margin = null', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 1000);
    expect(g.addMargin()).toEqual({ ok: true, added: 1000, principal: 0 });
    expect(g.state.players[0].cash).toBe(START_CASH - 1000);
    expect(g.state.players[0].margin).toBeNull();
  });

  it('cash 超额只补到借款归零（不倒扣、不返现）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 300);
    expect(g.addMargin(9999)).toEqual({ ok: true, added: 300, principal: 0 });
    expect(g.state.players[0].cash).toBe(START_CASH - 300);
  });

  it('cash：现金为 0 → not-enough-cash；非法金额 → bad-amount', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 500, 0);
    expect(g.addMargin(100)).toEqual({ ok: false, reason: 'not-enough-cash' });
    g.state.players[0].cash = START_CASH;
    expect(g.addMargin(0)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(g.addMargin(2.5)).toEqual({ ok: false, reason: 'bad-amount' });
  });

  it('mortgage：非 9 号格 → not-at-bank', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 500);
    g.state.players[0].pos = 1;
    giveEstate(g, 1);
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: false, reason: 'not-at-bank' });
  });

  it('mortgage：无可抵押地块 → no-estate（已抵押 / 施工中都不算）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 500);
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: false, reason: 'no-estate' });
    giveEstate(g, 1, 1, 1, true);                     // 施工中
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: false, reason: 'no-estate' });
  });

  it('mortgage：借入 min(变卖价 × 80%, 借款) 直接补仓 —— 款项不落现金', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 100);
    giveEstate(g, 1);                                  // L1 变卖价 30 → 额度 24
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: true, added: 24, principal: 76 });
    expect(g.state.players[0].cash).toBe(START_CASH);   // 不落现金
    expect(g.state.players[0].margin?.principal).toBe(76);
    const m = g.state.players[0].mortgages;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ index: 1, principal: 24, rate: MORTGAGE_RATE, due: 1 + MORTGAGE_TERM, overdue: 0 });
    expect(g.state.lastEvent).toEqual({ kind: 'marginAdd', player: 1, added: 24, source: 'mortgage' });
  });

  it('mortgage：借款少于额度 → 只借「借款额」（超出额度不套现、不返现）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 20);
    giveEstate(g, 1);                                  // 额度 24 ≥ 借款 20
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: true, added: 20, principal: 0 });
    expect(g.state.players[0].margin).toBeNull();
    expect(g.state.players[0].cash).toBe(START_CASH);   // 额度余 4 不返现
    expect(g.state.players[0].mortgages[0].principal).toBe(20);
  });

  it('mortgage：已抵押地块被排除，改用另一块可抵押地块', () => {
    const g = createGame({ dice: fixed(1, 1) });
    withMargin(g, 100);
    giveEstate(g, 1);
    giveEstate(g, 2, 1, 3);                             // L3 变卖价 330 → 额度 264
    g.state.players[0].mortgages.push({ principal: 24, rate: MORTGAGE_RATE, due: 2, overdue: 0, index: 1 });
    expect(g.addMargin(undefined, 'mortgage')).toEqual({ ok: true, added: 100, principal: 0 });
    expect(g.state.players[0].mortgages.some((m) => m.index === 2)).toBe(true);
    expect(g.state.players[0].margin).toBeNull();
  });
});
