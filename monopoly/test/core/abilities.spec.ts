import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { buyOffer, hudSpecs } from '../../src/ui/Hud';
import { PASS_START_BONUS, START_CASH } from '../../src/data/economy';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：让走位完全可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 摘掉免罚（默认手牌含它，会自动抵消租金，挡住租金减免的验证） */
const dropPardon = (g: Game, i: number): void => {
  g.state.hands[i] = g.state.hands[i].filter((k) => k !== 'pardon');
};

/** 把某玩家摆到「落在指定格、已移动未结算」的局面 */
const standAt = (g: Game, seat: number, index: number): void => {
  g.state.current = seat;
  g.state.players[seat].pos = index;
  g.state.phase = 'moved';
};

/** 空置 shop 格的「已结算」局面（买地报价 / buyCurrent 的前置阶段） */
const arrivedVacant = (g: Game, seat: number, index: number): void => {
  standAt(g, seat, index);
  g.settleCurrent();
};

describe('角色技能 · 四众各一技（entities 落在引擎上的效果）', () => {
  it('技能局开启：state.abilitiesOn = true；未开启则 false', () => {
    expect(createGame({ dice: fixed(1, 1), abilities: true }).state.abilitiesOn).toBe(true);
    expect(createGame({ dice: fixed(1, 1) }).state.abilitiesOn).toBe(false);
  });

  it('孙悟空「筋斗云」：每回合额外前进 1 格（掷 5 → 走 6）', () => {
    const g = createGame({ dice: fixed(2, 3), abilities: true });
    g.rollDice();
    expect(g.moveCurrent()).toEqual({ from: 0, to: 6, steps: 6, passedStart: false });
    expect(g.state.players[0].pos).toBe(6);
    /* 额外格数同样计入路障扫描（与真实走位一致，不跳过拦截） */
    const g2 = createGame({ dice: fixed(2, 3), abilities: true });
    g2.state.barriers[4] = { index: 4, owner: 2 };
    g2.rollDice();
    expect(g2.moveCurrent()).toEqual({ from: 0, to: 4, steps: 4, passedStart: false, barrier: 4 });
  });

  it('猪八戒「九齿钉耙」：买地八折（￥60 → ￥48）', () => {
    const g = createGame({ dice: fixed(1, 1), abilities: true });
    standAt(g, 1, 3);                       // 3 = 长峰土特产品商店（shop）
    expect(g.settleCurrent()).toEqual({ kind: 'vacant', index: 3, price: 60 });
    expect(g.buyCurrent()).toEqual({ ok: true, cost: 48, cash: START_CASH - 48 });
    expect(g.state.players[1].cash).toBe(START_CASH - 48);
    expect(g.state.estates[3].level).toBe(1);
  });

  it('沙悟净「任劳任怨」：经过起点额外领 ￥100', () => {
    const g = createGame({ dice: fixed(2, 3), abilities: true });
    g.state.current = 2;
    g.state.players[2].pos = 30;
    g.rollDice();
    expect(g.moveCurrent().passedStart).toBe(true);
    expect(g.state.players[2].cash).toBe(START_CASH + PASS_START_BONUS + 100);
  });

  it('唐三藏「慈悲为怀」：应付租金减免 25%（￥45 → ￥34，四舍五入到元）', () => {
    const g = createGame({ dice: fixed(1, 1), abilities: true });
    dropPardon(g, 3);
    g.state.estates[3] = { index: 3, owner: 1, level: 2, processing: false };
    standAt(g, 3, 3);
    expect(g.settleCurrent()).toMatchObject({ kind: 'rent', index: 3, owner: 1, rent: 34, paid: 34 });
    expect(g.state.players[3].cash).toBe(START_CASH - 34);
  });
});

describe('角色技能 · 关闭时逐值回旧口径（既有回归基线不动）', () => {
  it('筋斗云的 +1 格不生效（掷 5 → 走 5）', () => {
    const g = createGame({ dice: fixed(2, 3) });
    g.rollDice();
    expect(g.moveCurrent()).toEqual({ from: 0, to: 5, steps: 5, passedStart: false });
  });

  it('九齿钉耙的八折不生效（按原价 ￥60 付款）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    arrivedVacant(g, 1, 3);
    expect(g.buyCurrent()).toEqual({ ok: true, cost: 60, cash: START_CASH - 60 });
  });

  it('任劳任怨的起点津贴不生效（只领 ￥200）', () => {
    const g = createGame({ dice: fixed(2, 3) });
    g.state.current = 2;
    g.state.players[2].pos = 30;
    g.rollDice();
    g.moveCurrent();
    expect(g.state.players[2].cash).toBe(START_CASH + PASS_START_BONUS);
  });

  it('慈悲为怀的租金减免不生效（满租 ￥45）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    dropPardon(g, 3);
    g.state.estates[3] = { index: 3, owner: 1, level: 2, processing: false };
    standAt(g, 3, 3);
    expect(g.settleCurrent()).toMatchObject({ kind: 'rent', index: 3, owner: 1, rent: 45, paid: 45 });
  });
});

describe('角色技能 · HUD 露出（技能名徽标 + 折扣后报价）', () => {
  it('四席位资产条各挂自己的技能名；未开启技能则不挂（空串）', () => {
    const on = hudSpecs(createGame({ dice: fixed(1, 1), abilities: true }).state);
    expect(on.filter((s) => s.id === 'ui.playerBar').map((s) => s.state?.skill))
      .toEqual(['筋斗云', '九齿钉耙', '任劳任怨', '慈悲为怀']);
    const off = hudSpecs(createGame({ dice: fixed(1, 1) }).state);
    expect(off.filter((s) => s.id === 'ui.playerBar').every((s) => s.state?.skill === '')).toBe(true);
  });

  it('买地报价按技能折扣显示（技能局 八戒 ￥48 / 非技能局 ￥60）', () => {
    const g = createGame({ dice: fixed(1, 1), abilities: true });
    arrivedVacant(g, 1, 3);
    expect(buyOffer(g.state)).toEqual({ price: 48, enabled: true });

    const g2 = createGame({ dice: fixed(1, 1) });
    arrivedVacant(g2, 1, 3);
    expect(buyOffer(g2.state)).toEqual({ price: 60, enabled: true });
  });
});