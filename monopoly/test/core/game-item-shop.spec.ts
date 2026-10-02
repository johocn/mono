import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { START_CASH } from '../../src/data/economy';
import { resaleOf } from '../../src/core/item-shop';
import type { Dice } from '../../src/core/dice';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 开局每人送全部道具（`createGame` 第 361 行）；测「买入」前需先清空手牌 */
const emptyHand = (g: Game, i = 0): void => { g.state.hands[i] = []; };

describe('M20.3 道具商店 · 买入（spec §5.3）', () => {
  it('未知 kind → unknown-kind，现金与手牌均不变', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    const cash = g.state.players[0].cash;
    expect(g.buyItem('not-a-card')).toEqual({ ok: false, reason: 'unknown-kind' });
    expect(g.state.players[0].cash).toBe(cash);
    expect(g.state.hands[0]).toEqual([]);
  });

  it('已持有 → already-owned，现金不变（去重口径：每种至多 1 张）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.state.hands[0]).toContain('bomb');
    const cash = g.state.players[0].cash;
    expect(g.buyItem('bomb')).toEqual({ ok: false, reason: 'already-owned' });
    expect(g.state.players[0].cash).toBe(cash);
  });

  it('现金不足 → not-enough-cash，现金与手牌均不变', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    g.state.players[0].cash = 299;                 // 炸弹售价 300
    expect(g.buyItem('bomb')).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(g.state.players[0].cash).toBe(299);
    expect(g.state.hands[0]).toEqual([]);
  });

  it('成功：现金精确减少售价、手牌 +1、写 lastEvent', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    expect(g.state.players[0].cash).toBe(START_CASH);
    expect(g.buyItem('bomb')).toEqual({ ok: true, kind: 'bomb', price: 300 });
    expect(g.state.players[0].cash).toBe(START_CASH - 300);
    expect(g.state.hands[0]).toEqual(['bomb']);
    expect(g.state.lastEvent).toEqual({ kind: 'item-shop', action: 'buy', card: 'bomb', price: 300 });
  });

  it('恰好等于售价即可买入（边界 ≥ 而非 >）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    g.state.players[0].cash = 150;                 // 路障售价 150
    expect(g.buyItem('barrier')).toEqual({ ok: true, kind: 'barrier', price: 150 });
    expect(g.state.players[0].cash).toBe(0);
  });
});

describe('M20.3 道具商店 · 卖出（spec §5.3）', () => {
  it('未持有 → not-owned，现金不变', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    expect(g.sellItem('bomb')).toEqual({ ok: false, reason: 'not-owned' });
    expect(g.state.players[0].cash).toBe(START_CASH);
  });

  it('未知 kind → unknown-kind，现金不变', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.sellItem('not-a-card')).toEqual({ ok: false, reason: 'unknown-kind' });
    expect(g.state.players[0].cash).toBe(START_CASH);
  });

  it('成功：现金精确增加回收价（售价 × 50%）、手牌移除该类、写 lastEvent', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.state.hands[0]).toContain('demolish');   // 拆迁令售价 500 → 回收 250
    expect(g.sellItem('demolish')).toEqual({ ok: true, kind: 'demolish', price: 250 });
    expect(g.state.players[0].cash).toBe(START_CASH + resaleOf(500));
    expect(g.state.hands[0]).not.toContain('demolish');
    expect(g.state.lastEvent).toEqual({ kind: 'item-shop', action: 'sell', card: 'demolish', price: 250 });
  });

  it('买卖不推进回合：phase / current / round 全部不变', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const before = { phase: g.state.phase, current: g.state.current, round: g.state.round };
    g.sellItem('bomb');
    emptyHand(g);                       // 清空后再买，确保走成功分支
    g.buyItem('bomb');
    expect({ phase: g.state.phase, current: g.state.current, round: g.state.round }).toEqual(before);
  });

  it('买回卖出：一买一卖净损 售价 − 回收价（50% 折价、不可套利）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    emptyHand(g);
    g.buyItem('teleport');              // 售价 200
    g.sellItem('teleport');             // 回收 100
    expect(g.state.players[0].cash).toBe(START_CASH - 200 + 100);
    expect(g.state.hands[0]).toEqual([]);
  });
});
