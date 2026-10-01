import { describe, it, expect } from 'vitest';
import { autoPlay, createGame, type Game } from '../../src/core/game';
import { has, handIndexOf } from '../../src/core/cards';
import {
  CHANCE_DECK, FATE_DECK, ITEM_CARDS, PARDON_REFUND,
} from '../../src/data/cards';
import { PASS_START_BONUS, ROUND_LIMIT, START_CASH } from '../../src/data/economy';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰（走位完全可预期） */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 摘掉开局常驻的「免罚」（租金/入狱口径要验证「无免罚」时的真实结算） */
const dropPardon = (g: Game): void => {
  g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'pardon');
};

/** 抽指定命运/机会卡（固定牌堆顺序、不洗牌，逐张复现） */
const fateOf = (id: string) => FATE_DECK.find((c) => c.id === id)!;
const chanceOf = (id: string) => CHANCE_DECK.find((c) => c.id === id)!;

describe('game-cards 手牌开局（spec §5.3）', () => {
  it('4 名玩家开局各持 6 张道具卡（6 种齐全）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    for (const h of g.state.hands) {
      expect(h).toHaveLength(6);
      expect(new Set(h).size).toBe(6);
      for (const c of ITEM_CARDS) expect(handIndexOf(h, c.kind)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('game-cards 炸弹（spec §5.3）', () => {
  it('炸对手 L2 地块 → 降 1 级、仍归原主、手牌少 1 张', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.phase = 'settled';
    g.state.estates[4] = { index: 4, owner: 2, level: 2, processing: false };
    expect(g.useCard('bomb', 4)).toEqual({ ok: true, kind: 'bomb', target: 4 });
    expect(g.state.estates[4].level).toBe(1);
    expect(g.state.estates[4].owner).toBe(2);
    expect(has(g.state.hands[0], 'bomb')).toBe(false);
    expect(g.state.hands[0]).toHaveLength(5);
  });

  it('炸 L1 对手地块 → 炸回无主（删键）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.phase = 'settled';
    g.state.estates[4] = { index: 4, owner: 2, level: 1, processing: false };
    expect(g.useCard('bomb', 4)).toEqual({ ok: true, kind: 'bomb', target: 4 });
    expect(g.state.estates[4]).toBeUndefined();
  });

  it('失败原因：无主 / 非 shop → not-estate；自己地块 → own-tile；未持有 → not-held', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.phase = 'settled';
    expect(g.useCard('bomb', 4)).toEqual({ ok: false, reason: 'not-estate' });
    expect(g.useCard('bomb', 5)).toEqual({ ok: false, reason: 'not-estate' });
    g.state.estates[4] = { index: 4, owner: 1, level: 2, processing: false };
    expect(g.useCard('bomb', 4)).toEqual({ ok: false, reason: 'own-tile' });
    g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'bomb');
    expect(g.useCard('bomb', 4)).toEqual({ ok: false, reason: 'not-held' });
  });
});

describe('game-cards 拆迁令（useCard demolish）', () => {
  it('打完 demolish：目标归无主、手牌移除、lastEvent 记录目标', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const foe = g.state.players[(g.state.current + 1) % 4];
    /* 构造：对手拥有 L3 地块 1（shop） */
    g.state.estates[1] = { index: 1, owner: foe.id, level: 3, processing: false };
    g.state.hands[g.state.current] = ['demolish'];
    const r = g.useCard('demolish', 1);
    expect(r).toEqual({ ok: true, kind: 'demolish', target: 1 });
    expect(g.state.estates[1]).toBeUndefined();
    expect(g.state.hands[g.state.current]).not.toContain('demolish');
    expect(g.state.lastEvent).toEqual({ kind: 'card', card: 'demolish', target: 1 });
  });

  it('缺目标 → no-target；目标无楼 → not-estate；自有 → own-tile；且不消耗手牌', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const me = g.state.players[g.state.current];
    g.state.hands[g.state.current] = ['demolish'];
    expect(g.useCard('demolish')).toEqual({ ok: false, reason: 'no-target' });
    expect(g.useCard('demolish', 4)).toEqual({ ok: false, reason: 'not-estate' });
    g.state.estates[1] = { index: 1, owner: me.id, level: 2, processing: false };
    expect(g.useCard('demolish', 1)).toEqual({ ok: false, reason: 'own-tile' });
    expect(g.state.hands[g.state.current]).toContain('demolish');
  });
});

describe('game-cards 路障（spec §5.3）', () => {
  it('拦停下一位经过者：截断在路障格、路障消耗、moveCurrent 返回命中格号', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 31;
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    expect(g.useCard('barrier', 1)).toEqual({ ok: true, kind: 'barrier', target: 1 });
    expect(g.state.barriers[1]).toEqual({ index: 1, owner: 1 });
    g.endTurn();

    g.rollDice();
    const mv = g.moveCurrent();
    /* 骰 1+1=2 本应到 2，路障在 1 → 只走 1 步停在 1 */
    expect(mv).toEqual({ from: 0, to: 1, steps: 1, passedStart: false, barrier: 1 });
    expect(g.state.players[1].pos).toBe(1);
    expect(g.state.barriers[1]).toBeUndefined();
  });
});

describe('game-cards 免罚卡（spec §5.3）', () => {
  it('抵消租金：waived=true、现金不变、pardon 消耗', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'rent', index: 4, owner: 2, rent: 105, paid: 0, sold: [], bankrupt: false, waived: true,
    });
    expect(g.state.players[0].cash).toBe(START_CASH);
    expect(has(g.state.hands[0], 'pardon')).toBe(false);
  });

  it('抵消入狱：waived=true、turns=0、jail=0', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].pos = 10;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'jail', index: 12, turns: 0, waived: true });
    expect(g.state.jail[0]).toBe(0);
    expect(has(g.state.hands[0], 'pardon')).toBe(false);
  });
});

describe('game-cards 监狱禁行（spec §5.5）', () => {
  it('无免罚落 12 → jail=2；idle 下 rollDice 抛错、skipTurn 递减至可掷', () => {
    const g = createGame({ dice: fixed(1, 1) });
    dropPardon(g);
    g.state.players[0].pos = 10;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({ kind: 'jail', index: 12, turns: 2, waived: false });
    expect(g.state.jail[0]).toBe(2);

    /* 回到 idle（监狱禁行态）：唯一合法推进是 skipTurn */
    g.state.phase = 'idle';
    expect(() => g.rollDice()).toThrow('[mono] rollDice @jailed');
    expect(g.skipTurn()).toEqual({ skipped: true, remaining: 1 });
    expect(g.state.phase).toBe('idle');

    /* 下一轮再回到本人，继续跳过至 0 */
    g.state.current = 0;
    expect(g.skipTurn()).toEqual({ skipped: true, remaining: 0 });
    expect(g.state.jail[0]).toBe(0);
    expect(() => g.rollDice()).not.toThrow();
    expect(g.state.phase).toBe('rolled');
  });
});

describe('game-cards 迁点（spec §5.3）', () => {
  it('rolled 阶段迁到 19 → phase=moved，正常结算为 stock', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.rollDice();
    expect(g.useCard('teleport', 19)).toEqual({ ok: true, kind: 'teleport', target: 19 });
    expect(g.state.players[0].pos).toBe(19);
    expect(g.state.phase).toBe('moved');
    expect(g.settleCurrent()).toEqual({ kind: 'stock', index: 19 });
  });
});

describe('game-cards 租金翻倍（spec §5.3）', () => {
  it('本人下次收租翻倍（2 × rentOf），收完 buff 清空', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.estates[4] = { index: 4, owner: 2, level: 2, processing: false };
    /* 玩家 2 打出租金翻倍 */
    g.state.current = 1;
    g.state.phase = 'settled';
    expect(g.useCard('doubleRent')).toEqual({ ok: true, kind: 'doubleRent' });
    expect(g.state.doubleRent[1]).toBe(true);
    expect(has(g.state.hands[1], 'doubleRent')).toBe(false);

    /* 玩家 1 落到玩家 2 的 L2（rentOf=45 → 90） */
    g.state.current = 0;
    g.state.phase = 'idle';
    dropPardon(g);
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'rent', index: 4, owner: 2, rent: 90, paid: 90, sold: [], bankrupt: false,
    });
    expect(g.state.players[1].cash).toBe(START_CASH + 90);
    expect(g.state.doubleRent[1]).toBe(false);
  });
});

describe('game-cards 股票交易（spec §5.5）', () => {
  it('非交易所 → not-at-market；在 19 可买/卖；现金不足/超卖/未知/零股原因正确', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.trade('SY01', 1)).toEqual({ ok: false, reason: 'not-at-market' });

    g.state.players[0].pos = 19;
    const cash0 = g.state.players[0].cash;
    expect(g.trade('SY01', 1)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 120, cash: cash0 - 120 });
    expect(g.state.portfolios[0].SY01).toEqual({ code: 'SY01', shares: 1, cost: 120 });
    expect(g.state.players[0].cash).toBe(cash0 - 120);

    expect(g.trade('SY01', -1)).toEqual({ ok: true, code: 'SY01', shares: 1, price: 120, cost: 120, cash: cash0 });
    expect(g.state.portfolios[0].SY01).toBeUndefined();
    expect(g.state.players[0].cash).toBe(cash0);

    expect(g.trade('SY01', -1)).toEqual({ ok: false, reason: 'not-enough-shares' });
    expect(g.trade('SY04', 1000)).toEqual({ ok: false, reason: 'not-enough-cash' });
    expect(g.trade('NOPE', 1)).toEqual({ ok: false, reason: 'unknown-code' });
    expect(g.trade('SY01', 0)).toEqual({ ok: false, reason: 'bad-lot' });
  });
});

describe('game-cards 股票 tick（spec §5.5）', () => {
  it('走满一轮 → round=2 且股价变化；同 seed 可复现', () => {
    const round = (g: Game): void => {
      for (let i = 0; i < g.state.players.length; i++) {
        g.rollDice();
        g.moveCurrent();
        g.settleCurrent();
        g.endTurn();
      }
    };
    const g = createGame({ seed: 20260928 });
    const q0 = { ...g.state.quotes };
    expect(g.state.round).toBe(1);
    round(g);
    expect(g.state.round).toBe(2);
    expect(g.state.current).toBe(0);
    expect(g.state.quotes).not.toEqual(q0);

    const g2 = createGame({ seed: 20260928 });
    round(g2);
    expect(g2.state.quotes).toEqual(g.state.quotes);
  });
});

describe('game-cards 机会卡（spec §5.3）', () => {
  it('c-rollAgain：不结束回合（额外一掷），移动累加', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { chance: [chanceOf('c-rollAgain')] } });
    g.state.players[0].pos = 3;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-rollAgain', effect: { kind: 'rollAgain' },
    });
    expect(g.state.extraRoll).toBe(true);
    expect(g.state.phase).toBe('settled');
    /* settled 且 extraRoll → 允许再掷一次并再走 */
    const d = g.rollDice();
    expect(g.state.phase).toBe('rolled');
    g.moveCurrent();
    expect(g.state.players[0].pos).toBe((5 + d.total) % 32);
  });

  it('c-drawItem：手牌未满 → 得 1 张；手牌满 → 折现 PARDON_REFUND', () => {
    const draw = chanceOf('c-drawItem');
    const g = createGame({ dice: fixed(1, 1), decks: { chance: [draw] } });
    g.state.hands[0] = [];
    g.state.players[0].pos = 3;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r.kind).toBe('chance');
    if (r.kind === 'chance' && r.effect.kind === 'drawItem') {
      expect(r.effect.item).not.toBeNull();
      expect(r.effect.refund).toBe(0);
    }
    expect(g.state.hands[0]).toHaveLength(1);

    const g2 = createGame({ dice: fixed(1, 1), decks: { chance: [draw] } });
    const cash0 = g2.state.players[0].cash;
    g2.state.players[0].pos = 3;
    g2.rollDice();
    g2.moveCurrent();
    const r2 = g2.settleCurrent();
    expect(r2.kind).toBe('chance');
    if (r2.kind === 'chance' && r2.effect.kind === 'drawItem') {
      expect(r2.effect.item).toBeNull();
      expect(r2.effect.refund).toBe(PARDON_REFUND);
    }
    expect(g2.state.players[0].cash).toBe(cash0 + PARDON_REFUND);
  });
});

describe('game-cards 命运卡（spec §5.3）', () => {
  it('f-back：退 3 格（2 → -1 回绕 31）', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-back')] } });
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-back', effect: { kind: 'back', from: 2, to: 31 },
    });
    expect(g.state.players[0].pos).toBe(31);
  });

  it('f-weather：停业 1 回合（jail=1）', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-weather')] } });
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-weather', effect: { kind: 'weather', turns: 1 },
    });
    expect(g.state.jail[0]).toBe(1);
  });

  it('f-lockup：无免罚进监 2 回合；有免罚抵消为 0', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-lockup')] } });
    dropPardon(g);
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-lockup', effect: { kind: 'lockup', turns: 2 },
    });
    expect(g.state.jail[0]).toBe(2);

    const g2 = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-lockup')] } });
    g2.rollDice();
    g2.moveCurrent();
    expect(g2.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-lockup', effect: { kind: 'lockup', turns: 0 },
    });
    expect(g2.state.jail[0]).toBe(0);
    expect(has(g2.state.hands[0], 'pardon')).toBe(false);
  });

  it('f-swap：与随机一位玩家互换位置', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-swap')] } });
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r.kind).toBe('fate');
    if (r.kind === 'fate' && r.effect.kind === 'swap') {
      expect(r.effect.with).toBeGreaterThanOrEqual(1);
      expect(r.effect.with).toBeLessThanOrEqual(4);
    }
    /* 其余玩家都在 0，互换后本人回到 0 */
    expect(g.state.players[0].pos).toBe(0);
  });
});

describe('game-cards 福利中心（spec §5.5）', () => {
  it('落 7 → kind=bonus，三选一奖励且落库', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.players[0].pos = 5;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r.kind).toBe('bonus');
    expect(g.state.lastEvent?.kind).toBe('bonus');
    if (r.kind === 'bonus') {
      expect(['cash', 'item', 'upgrade']).toContain(r.reward.kind);
      if (r.reward.kind === 'cash') {
        expect([200, 400]).toContain(r.reward.amount);
        expect(g.state.players[0].cash).toBe(START_CASH + r.reward.amount);
      }
    }
  });

  it('落 27 → kind=bonus（第二处福利中心）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 2 });
    g.state.players[0].pos = 25;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent().kind).toBe('bonus');
  });
});

describe('game-cards 整局自动（M5 收敛）', () => {
  it('autoPlay 计入卡牌/股票后仍收敛，胜者 ∈ 1..4、轮次不超上限', () => {
    const g = createGame({ seed: 20260928 });
    const w = autoPlay(g);
    expect(g.state.over).toBe(true);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(4);
    expect(g.state.round).toBeLessThanOrEqual(ROUND_LIMIT + 1);
  });
});

/* ————————————————————————————————————————————————————————————
   扩容牌（cards.ts 各 20 张）：命运 8 种新机制 + 机会 4 种新机制。
   落点固定为 2（命运格）/ 5（机会格），牌堆注入单张 ⇒ 逐张可复现。
   ———————————————————————————————————————————————————————————— */

describe('game-cards 命运扩容（spec §5.3）', () => {
  /** 落到命运格 2 并抽指定牌 */
  const drawFate = (id: string): Game => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf(id)] } });
    g.rollDice();
    g.moveCurrent();
    return g;
  };

  it('f-advance-3：前进 3 格（2 → 5，落格不再二次结算）', () => {
    const g = drawFate('f-advance-3');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-advance-3',
      effect: { kind: 'advance', from: 2, to: 5, steps: 3 },
    });
    expect(g.state.players[0].pos).toBe(5);
  });

  it('f-advance-6：越过起点回绕并按掷骰同口径领取过路津贴', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [fateOf('f-advance-6')] } });
    g.state.players[0].pos = 27;
    g.rollDice();
    g.moveCurrent();                                   // 27 + 2 = 29（命运格）
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 29, cardId: 'f-advance-6',
      effect: { kind: 'advance', from: 29, to: 3, steps: 6 },
    });
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('f-toStart：回到起点 0 并领取过路津贴', () => {
    const g = drawFate('f-toStart');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-toStart', effect: { kind: 'toStart', from: 2 },
    });
    expect(g.state.players[0].pos).toBe(0);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('f-gift：直接入账 ￥250', () => {
    const g = drawFate('f-gift');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-gift', effect: { kind: 'gift', amount: 250 },
    });
    expect(g.state.players[0].cash).toBe(START_CASH + 250);
  });

  it('f-levy：按净资产 10% 缴税（开局 ￥3000 → ￥300）', () => {
    const g = drawFate('f-levy');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-levy',
      effect: { kind: 'levy', amount: 300, percent: 10, paid: 300, bankrupt: false },
    });
    expect(g.state.players[0].cash).toBe(START_CASH - 300);
  });

  it('f-repair：按地块级数总和计费（L2 + L3 = 5 级 → ￥200）', () => {
    const g = drawFate('f-repair');
    g.state.estates[4] = { index: 4, owner: 1, level: 2, processing: false };
    g.state.estates[6] = { index: 6, owner: 1, level: 3, processing: false };
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-repair',
      effect: { kind: 'repair', amount: 40, count: 5, paid: 200, bankrupt: false },
    });
    expect(g.state.players[0].cash).toBe(START_CASH - 200);
  });

  it('f-demote：自有最高级地块降 1 级；只有 L1 时无地可降', () => {
    const g = drawFate('f-demote');
    g.state.estates[4] = { index: 4, owner: 1, level: 2, processing: false };
    g.state.estates[6] = { index: 6, owner: 1, level: 3, processing: false };
    const r = g.settleCurrent();
    expect(r.kind).toBe('fate');
    if (r.kind === 'fate' && r.effect.kind === 'demote') {
      expect([4, 6]).toContain(r.effect.index);
      expect(r.effect.level).toBeGreaterThanOrEqual(1);
    }
    /* 两级各降 1 级：总和 5 → 4；L1 地块不被降回无主 */
    expect(g.state.estates[4].level + g.state.estates[6].level).toBe(4);
    expect(g.state.estates[4].owner).toBe(1);
    expect(g.state.estates[6].owner).toBe(1);

    const g2 = drawFate('f-demote');
    g2.state.estates[4] = { index: 4, owner: 1, level: 1, processing: false };
    expect(g2.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-demote', effect: { kind: 'demote', index: null, level: 0 },
    });
    expect(g2.state.estates[4].level).toBe(1);
  });

  it('f-harvest：向每位对手收 ￥80（3 人 → 共 ￥240）', () => {
    const g = drawFate('f-harvest');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-harvest', effect: { kind: 'harvest', amount: 80, total: 240 },
    });
    expect(g.state.players[0].cash).toBe(START_CASH + 240);
    expect(g.state.players.slice(1).every((p) => p.cash === START_CASH - 80)).toBe(true);
  });

  it('f-tribute：向每位对手付 ￥60（3 人 → 共 ￥180，对手各自入账）', () => {
    const g = drawFate('f-tribute');
    expect(g.settleCurrent()).toEqual({
      kind: 'fate', index: 2, cardId: 'f-tribute',
      effect: { kind: 'tribute', amount: 60, total: 180, paid: 180, bankrupt: false },
    });
    expect(g.state.players[0].cash).toBe(START_CASH - 180);
    expect(g.state.players.slice(1).every((p) => p.cash === START_CASH + 60)).toBe(true);
  });
});

describe('game-cards 机会扩容（spec §5.3）', () => {
  /** 落到机会格 5 并抽指定牌 */
  const drawChance = (id: string): Game => {
    const g = createGame({ dice: fixed(1, 1), decks: { chance: [chanceOf(id)] } });
    g.state.players[0].pos = 3;
    g.rollDice();
    g.moveCurrent();
    return g;
  };

  it('c-advance-5：前进 5 格（5 → 10）', () => {
    const g = drawChance('c-advance-5');
    expect(g.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-advance-5',
      effect: { kind: 'advance', from: 5, to: 10, steps: 5 },
    });
    expect(g.state.players[0].pos).toBe(10);
  });

  it('c-toStart：回到起点并领取过路津贴', () => {
    const g = drawChance('c-toStart');
    expect(g.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-toStart', effect: { kind: 'toStart', from: 5 },
    });
    expect(g.state.players[0].pos).toBe(0);
    expect(g.state.players[0].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('c-collect：向每位对手收 ￥50（3 人 → 共 ￥150）', () => {
    const g = drawChance('c-collect');
    expect(g.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-collect', effect: { kind: 'collect', amount: 50, total: 150 },
    });
    expect(g.state.players[0].cash).toBe(START_CASH + 150);
    expect(g.state.players.slice(1).every((p) => p.cash === START_CASH - 50)).toBe(true);
  });

  it('c-grant-*：指定道具入袋；已持同类则折现 ￥100', () => {
    const g = drawChance('c-grant-bomb');
    g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'bomb');
    expect(g.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-grant-bomb',
      effect: { kind: 'grantItem', item: 'bomb', refund: 0 },
    });
    expect(has(g.state.hands[0], 'bomb')).toBe(true);

    /* 开局手牌本就含炸弹（5 种齐全）→ 抽到同类即折现 */
    const g2 = drawChance('c-grant-bomb');
    expect(g2.settleCurrent()).toEqual({
      kind: 'chance', index: 5, cardId: 'c-grant-bomb',
      effect: { kind: 'grantItem', item: null, refund: PARDON_REFUND },
    });
    expect(g2.state.players[0].cash).toBe(START_CASH + PARDON_REFUND);
  });
});