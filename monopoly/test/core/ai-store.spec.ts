import { describe, expect, it } from 'vitest';
import { createGame, currentPlayer, type Game } from '../../src/core/game';
import { applyStep, decideTurn, pickStore } from '../../src/core/ai';
import { personaParams } from '../../src/data/ai';
import { STORE_CATALOG } from '../../src/data/item-shop';
import type { ItemCardKind } from '../../src/data/cards';

/** 固定点数骰：测试不引入随机源 */
const fixed = (d1: number, d2: number) => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 建档：开局每人赠送全部道具，故测试前先清空当前玩家手牌 */
const setup = (seed?: number): Game => {
  const g = createGame({ dice: fixed(1, 1), seed });
  g.state.hands[0] = [];
  return g;
};

const P = personaParams('aggressive');
const bomb = STORE_CATALOG.find((p) => p.kind === 'bomb')!;

/** 手牌之外最便宜的道具售价（复算 pickStore 规则②的口径） */
const cheapestMissing = (hand: readonly string[]): number =>
  STORE_CATALOG.filter((p) => !hand.includes(p.kind))
    .reduce((min, p) => (p.price < min ? p.price : min), Number.POSITIVE_INFINITY);

describe('pickStore：决定论采购（spec §5.6）', () => {
  it('① 缺 pardon 且现金 ≥ 3 × 最便宜未持有售价 → 买 pardon', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    const hand: ItemCardKind[] = ['bomb', 'barrier', 'teleport', 'demolish', 'doubleRent'];
    g.state.hands[0] = hand;
    const need = 3 * cheapestMissing(hand);       // 唯一未持有 = pardon(250) → 750
    me.cash = need;
    expect(pickStore(g.state, P)).toEqual([{ kind: 'buyItem', card: 'pardon' }]);
    me.cash = need - 1;                           // 边界：差 1 元不买 pardon
    expect(pickStore(g.state, P)).toEqual([]);
  });

  it('② 缺 bomb 且现金 ≥ 2 × 炸弹售价 → 买 bomb（pardon 已持有时不抢买）', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    g.state.hands[0] = ['pardon', 'barrier', 'teleport', 'demolish', 'doubleRent'];
    me.cash = 2 * bomb.price;                     // = 600
    expect(pickStore(g.state, P)).toEqual([{ kind: 'buyItem', card: 'bomb' }]);
    me.cash = 2 * bomb.price - 1;                 // 边界：差 1 元不买
    expect(pickStore(g.state, P)).toEqual([]);
  });

  it('③ 保命线：持牌 ≥5 且现金 <500 → 不买（同一手牌、现金抬过 500 即买）', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    g.state.hands[0] = ['pardon', 'barrier', 'teleport', 'demolish', 'doubleRent'];
    me.cash = 499;
    expect(pickStore(g.state, P)).toEqual([]);
    me.cash = 600;                                // 越过保命线后即刻补炸弹
    expect(pickStore(g.state, P)).toEqual([{ kind: 'buyItem', card: 'bomb' }]);
  });

  it('④ 现金不足 / 道具齐备 / 破产 → 不动', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    me.cash = 0;
    expect(pickStore(g.state, P)).toEqual([]);    // 现金不足任何门槛
    me.cash = 99999;
    expect(pickStore(g.state, P)).toEqual([{ kind: 'buyItem', card: 'pardon' }]);
    g.state.hands[0] = STORE_CATALOG.map((p) => p.kind);
    expect(pickStore(g.state, P)).toEqual([]);    // 齐备 → 无候选
    me.bankrupt = true;
    expect(pickStore(g.state, P)).toEqual([]);
  });
});

describe('pickStore：纯函数性质', () => {
  it('每回合至多 1 步；重复调用结果一致且不改状态', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    g.state.hands[0] = ['barrier'];
    me.cash = 5000;
    const a = pickStore(g.state, P);
    const b = pickStore(g.state, P);
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual({ kind: 'buyItem', card: 'pardon' });
    expect(b).toEqual(a);
    expect(g.state.hands[0]).toEqual(['barrier']);   // 纯函数：无副作用
    expect(me.cash).toBe(5000);
  });

  it('决策与 seed 无关：同局面不同真源结果一致', () => {
    const run = (seed: number): unknown => {
      const g = setup(seed);
      const me = currentPlayer(g.state);
      g.state.hands[0] = ['barrier', 'teleport'];
      me.cash = 1200;
      return pickStore(g.state, P);
    };
    expect(run(11)).toEqual(run(99));
    expect(run(11)).toEqual([{ kind: 'buyItem', card: 'pardon' }]);
  });
});

describe('applyStep：商店步映射到 Game API', () => {
  it('buyItem 扣售价入手牌；sellItem 回收 50% 并移出手牌', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    me.cash = 1000;
    expect(applyStep(g, { kind: 'buyItem', card: 'bomb' })).toEqual({ ok: true, kind: 'bomb', price: bomb.price });
    expect(g.state.hands[0]).toContain('bomb');
    expect(me.cash).toBe(1000 - bomb.price);
    expect(applyStep(g, { kind: 'sellItem', card: 'bomb' })).toEqual({ ok: true, kind: 'bomb', price: Math.floor(bomb.price * 0.5) });
    expect(g.state.hands[0]).not.toContain('bomb');
    expect(me.cash).toBe(1000 - bomb.price + Math.floor(bomb.price * 0.5));
  });

  it('去重口径：同种道具第二次买入被拒（already-owned）', () => {
    const g = setup();
    currentPlayer(g.state).cash = 5000;
    const kind: ItemCardKind = 'pardon';
    expect(applyStep(g, { kind: 'buyItem', card: kind })).toMatchObject({ ok: true });
    expect(applyStep(g, { kind: 'buyItem', card: kind })).toEqual({ ok: false, reason: 'already-owned' });
  });
});

describe('decideTurn：settled 计划内含商店步（每回合至多一步）', () => {
  it('缺 pardon 且现金充裕 → 计划中出现且仅出现一步 buyItem', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    g.state.hands[0] = ['barrier'];
    me.cash = 5000;
    me.pos = 1;                                   // 空地，无地可买/升级干扰
    g.state.phase = 'settled';
    const plan = decideTurn(g.state, 'aggressive');
    const buys = plan.filter((s) => s.kind === 'buyItem');
    expect(buys).toHaveLength(1);
    expect(buys[0]).toEqual({ kind: 'buyItem', card: 'pardon' });
    expect(plan[plan.length - 1].kind).toBe('end');
  });

  it('无采购时不产生 buyItem / sellItem 步', () => {
    const g = setup();
    const me = currentPlayer(g.state);
    g.state.hands[0] = ['barrier'];
    me.cash = 100;                                // 低于任何门槛
    me.pos = 1;
    g.state.phase = 'settled';
    const plan = decideTurn(g.state, 'aggressive');
    expect(plan.some((s) => s.kind === 'buyItem' || s.kind === 'sellItem')).toBe(false);
  });
});
