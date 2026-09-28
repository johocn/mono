import { describe, it, expect } from 'vitest';
import {
  autoPlay, autoTurn, createGame, currentPlayer, netWorth, winnerOf,
  type Game,
} from '../../src/core/game';
import { PASS_START_BONUS, ROUND_LIMIT, START_CASH } from '../../src/data/economy';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：让每一局走位完全可预期（验收截图与断言都靠它复现） */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 完整跑一位玩家的回合（掷 → 移动 → 结算 → 结束） */
const playTurn = (g: Game): void => {
  g.rollDice();
  g.moveCurrent();
  g.settleCurrent();
  g.endTurn();
};

/**
 * M5 起开局手牌含「免罚」，落在他人地块会自动抵消租金。
 * 租金/破产口径的用例先摘掉免罚，验证的是「无免罚时必须付租」的 M4 数学。
 */
const dropPardon = (g: Game): void => {
  g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'pardon');
};

describe('game 开局与阶段门槛（spec §5.1）', () => {
  it('开局：4 名玩家 ￥3000 / 位置 0 / 第 1 轮 / idle / 无地产', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    expect(s.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(s.players.every((p) => p.cash === START_CASH && p.pos === 0 && !p.bankrupt)).toBe(true);
    expect(s.current).toBe(0);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('idle');
    expect(s.dice).toBeNull();
    expect(s.estates).toEqual({});
    expect(s.over).toBe(false);
  });

  it('阶段门槛：未掷骰不能移动 / 未移动不能结算；越序抛错且格式可定位', () => {
    const g = createGame({ dice: fixed(2, 3) });
    expect(() => g.moveCurrent()).toThrow('[mono] moveCurrent @phase=idle');

    const r = g.rollDice();
    expect(r).toEqual({ d1: 2, d2: 3, total: 5 });
    expect(g.state.phase).toBe('rolled');
    expect(g.state.dice).toEqual({ d1: 2, d2: 3, total: 5 });
    expect(() => g.settleCurrent()).toThrow('[mono] settleCurrent @phase=rolled');

    const mv = g.moveCurrent();
    expect(mv).toEqual({ from: 0, to: 5, steps: 5, passedStart: false });
    expect(g.state.phase).toBe('moved');
    expect(() => g.endTurn()).toThrow('[mono] endTurn @phase=moved');
  });
});

describe('game 移动与经过起点（spec §5.4）', () => {
  it('越过终点回绕并 +￥200', () => {
    const g = createGame({ dice: fixed(2, 3) });
    g.state.players[0].pos = 30;
    g.rollDice();
    const mv = g.moveCurrent();
    expect(mv.passedStart).toBe(true);
    expect(g.state.players[0].pos).toBe(3);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('正好落在起点也 +￥200（停留触发）', () => {
    const g = createGame({ dice: fixed(2, 2) });
    g.state.players[0].pos = 28;
    g.rollDice();
    expect(g.moveCurrent()).toEqual({ from: 28, to: 0, steps: 4, passedStart: true });
    expect(g.state.players[0].pos).toBe(0);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
    expect(g.settleCurrent()).toEqual({ kind: 'start', index: 0 });
  });
});

describe('game 落格结算（spec §5.2）', () => {
  it('无主 shop → vacant 且报价 ￥60；买下后归属本人', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'vacant', index: 1, price: 60 });
    expect(g.state.phase).toBe('settled');
    expect(g.buyCurrent()).toEqual({ ok: true, cost: 60, cash: 3140 });
    expect(g.state.players[0].cash).toBe(3140);
    expect(g.state.estates[1]).toEqual({ index: 1, owner: 1, level: 1, processing: false });
  });

  it('非 shop 地块买不了：返回 not-buyable，不改现金', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 8 });
    g.state.players[0].pos = 3;
    g.rollDice();
    g.moveCurrent();
    /* M5 起 `event` 细分为 `fate` / `chance` 并带卡面 id（翻牌动画消费） */
    const r = g.settleCurrent();
    expect(r.kind).toBe('chance');
    expect(r.kind === 'chance' ? r.cardId.startsWith('c-') : false).toBe(true);
    expect(g.state.lastDraw?.deck).toBe('chance');
    expect(g.buyCurrent()).toEqual({ ok: false, reason: 'not-buyable' });
    expect(g.state.players[0].cash).toBe(START_CASH);
  });

  it('现金不足买地 → not-enough-cash，不写地产', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    /* 31→1 会经过起点 +￥200，故在走步后再把现金压到买不起（原计划的 ￥59 会在 +￥200 后反而够买） */
    g.state.players[0].cash = 59;
    expect(g.settleCurrent()).toEqual({ kind: 'vacant', index: 1, price: 60 });
    expect(g.buyCurrent()).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(g.state.estates[1]).toBeUndefined();
  });

  it('停在他人 L2 地块 → 付 ￥45 给地主', () => {
    const g = createGame({ dice: fixed(1, 1) });
    dropPardon(g);
    g.state.estates[4] = { index: 4, owner: 2, level: 2, processing: false };
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 45, paid: 45, sold: [], bankrupt: false });
    expect(g.state.players[0].cash).toBe(2955);
    expect(g.state.players[1].cash).toBe(3045);
    expect(g.state.players[0].bankrupt).toBe(false);
  });

  it('停在自有地块 → own，可升级 ￥180 并置施工中', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'own', index: 1, level: 1 });
    expect(g.upgradeCurrent()).toEqual({ ok: true, cost: 180, cash: 3020, level: 2 });
    expect(g.state.estates[1]).toEqual({ index: 1, owner: 1, level: 2, processing: true });
  });
});

describe('game 破产清算（spec §5.4）', () => {
  it('现金不足且无地可卖 → 破产：余额归地主、现金清零、地块仍在', () => {
    const g = createGame({ dice: fixed(1, 1) });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
    g.state.players[0].cash = 10;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 40, sold: [3], bankrupt: true });
    expect(g.state.players[0].cash).toBe(0);
    expect(g.state.players[0].bankrupt).toBe(true);
    expect(g.state.players[1].cash).toBe(3040);
    expect(g.state.estates[3]).toBeUndefined();
    expect(Object.keys(g.state.estates)).toEqual(['4']);
  });

  it('卖地能抵清 → 不破产：按变卖价低者先卖，只卖到够付', () => {
    const g = createGame({ dice: fixed(1, 1) });
    dropPardon(g);
    g.state.estates[1] = { index: 1, owner: 1, level: 1, processing: false };
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[8] = { index: 8, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
    g.state.players[0].cash = 50;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 105, sold: [1, 3], bankrupt: false });
    expect(g.state.players[0].cash).toBe(5);
    expect(g.state.players[0].bankrupt).toBe(false);
    expect(g.state.players[1].cash).toBe(3105);
    expect(g.state.estates[1]).toBeUndefined();
    expect(g.state.estates[3]).toBeUndefined();
    expect(g.state.estates[8]).toEqual({ index: 8, owner: 1, level: 1, processing: false });
  });
});

describe('game 换手 / 轮次 / 胜负（spec §5.1 / §5.4）', () => {
  it('endTurn 交下一位并解除其施工中；一轮走完 round +1', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[1] = { index: 1, owner: 2, level: 1, processing: true };
    playTurn(g);
    expect(g.state.current).toBe(1);
    expect(g.state.phase).toBe('idle');
    expect(g.state.dice).toBeNull();
    expect(g.state.estates[1].processing).toBe(false);
    expect(g.state.round).toBe(1);
    expect(g.state.over).toBe(false);

    const g2 = createGame({ dice: fixed(1, 1) });
    playTurn(g2);
    playTurn(g2);
    playTurn(g2);
    expect(g2.state.current).toBe(3);
    expect(g2.state.round).toBe(1);
    playTurn(g2);
    expect(g2.state.current).toBe(0);
    expect(g2.state.round).toBe(2);
  });

  it('仅剩 1 名未破产 → 立即结束，该玩家获胜', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    s.players[1].bankrupt = true;
    s.players[2].bankrupt = true;
    s.players[3].bankrupt = true;
    playTurn(g);
    expect(s.over).toBe(true);
    expect(winnerOf(s)).toBe(1);
  });

  it('跑满 ROUND_LIMIT 轮 → 按净资产排名定胜者（不再看现金）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    s.players[0].cash = 1000;
    s.players[1].cash = 1200;
    s.players[2].cash = 1000;
    s.players[3].cash = 800;
    s.estates[30] = { index: 30, owner: 3, level: 3, processing: false };
    s.round = ROUND_LIMIT;
    s.current = 3;
    s.phase = 'settled';
    g.endTurn();
    expect(s.round).toBe(ROUND_LIMIT + 1);
    expect(s.over).toBe(true);
    expect(winnerOf(s)).toBe(3);
  });

  it('未结束时 winnerOf 返回 null；netWorth = 现金 + 地产账面投入', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const s = g.state;
    expect(winnerOf(s)).toBeNull();
    s.players[0].cash = 100;
    s.estates[6] = { index: 6, owner: 1, level: 2, processing: false };
    expect(netWorth(s, s.players[0])).toBe(340);
    expect(netWorth(s, s.players[1])).toBe(START_CASH);
  });
});

describe('game 自动对局（M4 端到端整局）', () => {
  it('autoTurn 自动完成一位玩家的整回合并交给下一位', () => {
    /* seed 8：M5 起命运/机会会改写走位，7/33/51 首张命运为 f-swap 会让 p0 归 0（不再满足 pos≥2） */
    const g = createGame({ seed: 8 });
    autoTurn(g);
    expect(g.state.over).toBe(false);
    expect(g.state.current).toBe(1);
    expect(currentPlayer(g.state).id).toBe(2);
    expect(g.state.phase).toBe('idle');
    expect(g.state.players[0].pos).toBeGreaterThanOrEqual(2);
  });

  it('autoPlay 用同 seed 跑到分出胜负，且不超轮次上限', () => {
    const g = createGame({ seed: 20260928 });
    const w = autoPlay(g);
    expect(g.state.over).toBe(true);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(4);
    expect(g.state.round).toBeLessThanOrEqual(ROUND_LIMIT + 1);
  });
});