import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/core/game';
import type { Dice } from '../../src/core/dice';
import type { ChanceCardDef, FateCardDef } from '../../src/data/cards';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

const TRIBUTE: FateCardDef = { id: 'f-tribute', name: '进贡', kind: 'tribute', amount: 100, text: '向每户进贡 ￥100' };
const HARVEST: FateCardDef = { id: 'f-harvest', name: '丰收', kind: 'harvest', amount: 100, text: '向每户收取 ￥100' };
const COLLECT: ChanceCardDef = { id: 'c-collect', name: '众筹', kind: 'collect', amount: 100, text: '向每户收取 ￥100' };

/** 把当前玩家摆到「已移动未结算」的指定格 */
const standAt = (g: ReturnType<typeof createGame>, index: number): void => {
  g.state.players[g.state.current].pos = index;
  g.state.phase = 'moved';
};

const FATE_INDEX = 2;      // 命运卡
const CHANCE_INDEX = 5;    // 机会卡

describe('M20.6 D50 · 多人分账走 settleDebt（AI 席位同步跑完）', () => {
  it('tribute：actor 逐位付款给对手（无拍卖，一次跑完）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 7, decks: { fate: [TRIBUTE] } });
    standAt(g, FATE_INDEX);
    const r = g.settleCurrent();

    expect(r).toEqual({
      kind: 'fate', index: FATE_INDEX, cardId: 'f-tribute',
      effect: { kind: 'tribute', amount: 100, total: 300, paid: 300, bankrupt: false },
    });
    expect(g.state.pendingMulti).toBeNull();
    expect(g.state.players[0].cash).toBe(3000 - 300);
    for (const p of g.state.players.slice(1)) expect(p.cash).toBe(3100);
    expect(g.state.lastEvent).toEqual(r);
  });

  it('harvest：对手逐位付给 actor', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 7, decks: { fate: [HARVEST] } });
    standAt(g, FATE_INDEX);
    const r = g.settleCurrent();

    expect(r).toEqual({
      kind: 'fate', index: FATE_INDEX, cardId: 'f-harvest',
      effect: { kind: 'harvest', amount: 100, total: 300 },
    });
    expect(g.state.pendingMulti).toBeNull();
    expect(g.state.players[0].cash).toBe(3000 + 300);
    for (const p of g.state.players.slice(1)) expect(p.cash).toBe(2900);
  });

  it('collect（机会卡）：对手逐位付给 actor', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 7, decks: { chance: [COLLECT] } });
    standAt(g, CHANCE_INDEX);
    const r = g.settleCurrent();

    expect(r).toEqual({
      kind: 'chance', index: CHANCE_INDEX, cardId: 'c-collect',
      effect: { kind: 'collect', amount: 100, total: 300 },
    });
    expect(g.state.pendingMulti).toBeNull();
    expect(g.state.players[0].cash).toBe(3000 + 300);
  });

  it('tribute：付款人付不起且无资产 ⇒ 破产并终止后续队列（不付空）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 7, decks: { fate: [TRIBUTE] } });
    const p0 = g.state.players[0];
    p0.cash = 50;                       // 连第 1 位都付不起，且无地产 / 无持股
    standAt(g, FATE_INDEX);
    const r = g.settleCurrent();

    expect(r).toEqual({
      kind: 'fate', index: FATE_INDEX, cardId: 'f-tribute',
      effect: { kind: 'tribute', amount: 100, total: 300, paid: 50, bankrupt: true },
    });
    expect(g.state.pendingMulti).toBeNull();
    expect(p0.bankrupt).toBe(true);
    expect(p0.cash).toBe(0);
    expect(g.state.players[1].cash).toBe(3050);          // 只收到第一笔 ￥50
    expect(g.state.players[2].cash).toBe(3000);
    expect(g.state.players[3].cash).toBe(3000);
  });
});

describe('M20.6 D50 · 分账中付款人清算挂起 → 拍卖收尾后续跑', () => {
  it('harvest：对手付不起有地产 ⇒ settleCurrent 返回 auction，autoResolveAuction 续跑至完成', () => {
    const g = createGame({
      dice: fixed(1, 1), seed: 7, decks: { fate: [HARVEST] },
      seats: [null, null, null, null],                 // 全真人 ⇒ 拍卖挂起
    });
    /* 2 号玩家现金 0、持一块 L5（变卖价远高于 ￥100 ⇒ 拍卖后必定付清） */
    g.state.players[1].cash = 0;
    g.state.estates[3] = { index: 3, owner: 2, level: 5, processing: false };
    standAt(g, FATE_INDEX);

    const r = g.settleCurrent();
    expect(r.kind).toBe('auction');
    expect(g.state.auction).not.toBeNull();
    expect(g.state.pendingMulti).not.toBeNull();
    expect(g.state.pendingMulti!.queue).toEqual([2, 3, 4]);   // 队首仍停在挂起者

    g.autoResolveAuction();

    expect(g.state.auction).toBeNull();
    expect(g.state.pendingMulti).toBeNull();
    const ev = g.state.lastEvent;
    expect(ev?.kind).toBe('fate');
    if (ev?.kind === 'fate') {
      expect(ev.effect).toEqual({ kind: 'harvest', amount: 100, total: 300 });
    }
    /* 3、4 号各实付 ￥100（2 号经拍卖付清 ￥100） */
    expect(g.state.players[2].cash).toBe(3000 - 100);
    expect(g.state.players[3].cash).toBe(3000 - 100);
  });
});