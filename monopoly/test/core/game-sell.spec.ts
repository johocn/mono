import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game';
import type { Dice } from '../../src/core/dice';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

describe('game.sellEstate（M20.1 自由出售，spec §3.5）', () => {
  it('自有 L1：价 = 变卖价 ￥30，现金入账、地块回归可购买、记 lastEvent', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.players[0].cash = 100;
    expect(g.sellEstate(3)).toEqual({ ok: true, index: 3, price: 30, cash: 130 });
    expect(g.state.estates[3]).toBeUndefined();
    expect(g.state.players[0].cash).toBe(130);
    expect(g.state.lastEvent).toEqual({ kind: 'sell', index: 3, price: 30 });
  });

  it('自有 L3：价 = 变卖价 ￥330', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.estates[5] = { index: 5, owner: 1, level: 3, processing: false };
    expect(g.sellEstate(5)).toEqual({ ok: true, index: 5, price: 330, cash: 3330 });
  });

  it('无主 → no-estate', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    expect(g.sellEstate(2)).toEqual({ ok: false, reason: 'no-estate' });
  });

  it('非自有 → not-owner', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.estates[3] = { index: 3, owner: 2, level: 1, processing: false };
    expect(g.sellEstate(3)).toEqual({ ok: false, reason: 'not-owner' });
  });
});
