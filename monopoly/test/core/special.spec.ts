import { describe, it, expect } from 'vitest';
import {
  BONUS_WEIGHTS, HOSPITAL_TURNS, JAIL_TURNS, LOTTERY_STAKE, LOTTERY_TABLE,
  nextJail, rollBonus, rollLottery, specialAt,
} from '../../src/core/special';
import { createGame } from '../../src/core/game';
import { makeRng, type Dice } from '../../src/core/dice';
import { ITEM_CARDS } from '../../src/data/cards';

/** 固定点数骰：每步走 2 格，落点完全可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 让 1 号玩家「掷→走→结算」后停在 pos（固定 seed：卡牌 / 乐透开奖均确定） */
const settleAt = (pos: number) => {
  const g = createGame({ dice: fixed(1, 1), seed: 1 });
  g.state.players[0].pos = (pos - 2 + 32) % 32;
  g.rollDice();
  g.moveCurrent();
  return { g, r: g.settleCurrent() };
};

describe('special 特殊格判定（spec §5.5）', () => {
  it('specialAt 读 board 真源：12 监狱 / 19 股票 / 7、27 福利 / 3 普通格', () => {
    expect(specialAt(12)).toBe('jail');
    expect(specialAt(19)).toBe('stock');
    expect(specialAt(7)).toBe('bonus');
    expect(specialAt(27)).toBe('bonus');
    expect(specialAt(3)).toBeNull();
    expect(specialAt(0)).toBeNull();
  });

  it('M7 新增四格：9 银行 / 21 乐透 / 23 税务 / 25 医院', () => {
    expect(specialAt(9)).toBe('bank');
    expect(specialAt(21)).toBe('lottery');
    expect(specialAt(23)).toBe('tax');
    expect(specialAt(25)).toBe('hospital');
  });

  it('JAIL_TURNS 定死 2；HOSPITAL_TURNS 定死 1；nextJail 2→1→0 且不为负', () => {
    expect(JAIL_TURNS).toBe(2);
    expect(HOSPITAL_TURNS).toBe(1);
    expect(nextJail(2)).toBe(1);
    expect(nextJail(1)).toBe(0);
    expect(nextJail(0)).toBe(0);
  });
});

describe('special 福利中心奖励（spec §5.5）', () => {
  it('rollBonus 三类各约 1/3（±25% 容差），且各档取值合法', () => {
    const rng = makeRng(2026);
    const tally = { cash: 0, item: 0, upgrade: 0 };
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const r = rollBonus(rng);
      tally[r.kind] += 1;
      if (r.kind === 'cash') expect([200, 400]).toContain(r.amount);
      else if (r.kind === 'item') expect(ITEM_CARDS.map((c) => c.kind)).toContain(r.item);
      else expect(r.kind).toBe('upgrade');
    }
    expect(BONUS_WEIGHTS.cash).toBe(1);
    for (const k of ['cash', 'item', 'upgrade'] as const) {
      const ratio = tally[k] / n;
      expect(ratio).toBeGreaterThan(0.25);
      expect(ratio).toBeLessThan(0.42);
    }
  });

  it('同 seed 的 rollBonus 序列一致', () => {
    const a = makeRng(77);
    const b = makeRng(77);
    const s1 = Array.from({ length: 12 }, () => rollBonus(a));
    const s2 = Array.from({ length: 12 }, () => rollBonus(b));
    expect(s1).toEqual(s2);
  });
});

describe('special 乐透彩开奖（M7 新增）', () => {
  it('奖级只取表内值；权重合计 100，空手占约 50%', () => {
    expect(LOTTERY_TABLE.reduce((s, t) => s + t.weight, 0)).toBe(100);
    const rng = makeRng(2026);
    const prizes = LOTTERY_TABLE.map((t) => t.prize);
    let zero = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const p = rollLottery(rng);
      expect(prizes).toContain(p);
      if (p === 0) zero += 1;
    }
    expect(zero / n).toBeGreaterThan(0.44);
    expect(zero / n).toBeLessThan(0.56);
  });

  it('同 seed 的 rollLottery 序列一致（确定性）', () => {
    const a = makeRng(9);
    const b = makeRng(9);
    expect(Array.from({ length: 20 }, () => rollLottery(a)))
      .toEqual(Array.from({ length: 20 }, () => rollLottery(b)));
  });
});

describe('special 银行 / 乐透 / 税金 / 医院 落格结算（M7 新增）', () => {
  it('鹿乡银行：领「存款红包」= round(存款 × 5%) 一次性入现金（无存款则 0）', () => {
    const { g, r } = settleAt(9);
    expect(r).toMatchObject({ kind: 'bank', index: 9, bonus: 0 });   // 无存款 ⇒ 红包 0
    expect(g.state.players[0].cash).toBe(3000);

    const g2 = createGame({ dice: fixed(1, 1), seed: 1 });
    g2.state.players[0].pos = 7;
    g2.state.players[0].deposit = 1000;
    g2.rollDice();
    g2.moveCurrent();
    expect(g2.settleCurrent()).toMatchObject({ kind: 'bank', bonus: 50 });   // round(1000 × 0.05)
    expect(g2.state.players[0].cash).toBe(3050);
  });

  it('乐透彩：先扣 ￥100 入场费，再按权重开奖（现金 = 开局 − 入场 + 奖金）', () => {
    const { g, r } = settleAt(21);
    expect(r.kind).toBe('lottery');
    const res = r as { stake: number; prize: number };
    expect(res.stake).toBe(LOTTERY_STAKE);
    expect(LOTTERY_TABLE.map((t) => t.prize)).toContain(res.prize);
    expect(g.state.players[0].cash).toBe(3000 - res.stake + res.prize);
  });

  it('乐透彩：现场现金不足时按现有现金扣，不因买彩票破产', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.players[0].pos = 19;
    g.state.players[0].cash = 40;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent() as { kind: string; stake: number };
    expect(r.kind).toBe('lottery');
    expect(r.stake).toBe(40);
    expect(g.state.players[0].bankrupt).toBe(false);
  });

  it('税务局：按现金 10% 征收、封顶 ￥500，走欠款清算', () => {
    const { g, r } = settleAt(23);
    expect(r).toMatchObject({ kind: 'tax', index: 23, amount: 300, paid: 300, sold: [], bankrupt: false });
    expect(g.state.players[0].cash).toBe(2700);
  });

  it('医院：住院 1 回合（复用禁行计时）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.hands[0] = [];                         // 清空手牌 → 无免罚卡
    g.state.players[0].pos = 23;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toMatchObject({ kind: 'hospital', turns: HOSPITAL_TURNS, waived: false });
    expect(g.state.jail[0]).toBe(HOSPITAL_TURNS);
  });

  it('医院免罚：手牌含免罚卡时 waived，且该卡被消耗', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    g.state.players[0].pos = 23;
    expect(g.state.hands[0]).toContain('pardon');  // 开局每人持一套道具卡
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent() as { kind: string; waived: boolean };
    expect(r).toMatchObject({ kind: 'hospital', waived: true });
    expect(g.state.hands[0]).not.toContain('pardon');
    expect(g.state.jail[0]).toBe(0);
  });
});