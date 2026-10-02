import { describe, it, expect } from 'vitest';
import { createGame, creditLocked, type Game } from '../../src/core/game';
import { rentOf, START_CASH } from '../../src/data/economy';
import { LOAN_RATE, LOAN_TERM, MORTGAGE_RATE, MORTGAGE_TERM } from '../../src/data/bank';
import { penaltyOf } from '../../src/core/bank';
import type { Dice } from '../../src/core/dice';

/** 固定点数骰：走位可预期 */
const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });
/** 前进恰好 n 步的骰（用于精确落格） */
const step = (n: number): Dice => ({ roll: () => ({ d1: n, d2: 0, total: n }) });

/** 把 1 号玩家瞬移到 9 号银行格（信贷办理前置） */
const atBank = (g: Game): void => { g.state.players[0].pos = 9; };

/** 给 1 号玩家一块 L1 地块（index 1，变卖价 30 / 抵押额度 24） */
const giveEstate = (g: Game, index = 1): void => {
  g.state.estates[index] = { index, owner: 1, level: 1, processing: false };
};

/** 触发一次轮末：把当前玩家设为末位并结束回合 ⇒ next===0 ⇒ round+1 + onRoundBoundary */
const passRound = (g: Game): void => {
  g.state.current = g.state.players.length - 1;
  g.state.phase = 'settled';
  g.endTurn();
};

describe('M20.2 信贷 · 存取款（spec §3.2）', () => {
  it('deposit 现金 → 存款；非法金额 / 现金不足拒绝', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.deposit(500)).toEqual({ ok: true, amount: 500 });
    expect(g.state.players[0].cash).toBe(START_CASH - 500);
    expect(g.state.players[0].deposit).toBe(500);
    expect(g.deposit(0)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(g.deposit(-5)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(g.deposit(99999)).toEqual({ ok: false, reason: 'not-enough-cash' });
  });

  it('withdraw 存款 → 现金；存款不足拒绝', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.deposit(500);
    expect(g.withdraw(200)).toEqual({ ok: true, amount: 200 });
    expect(g.state.players[0].cash).toBe(START_CASH - 300);
    expect(g.state.players[0].deposit).toBe(300);
    expect(g.withdraw(9999)).toEqual({ ok: false, reason: 'not-enough-deposit' });
    expect(g.withdraw(0)).toEqual({ ok: false, reason: 'bad-amount' });
  });
});

describe('M20.2 信贷 · 信用贷款（spec §3.2）', () => {
  it('非 9 号格不能借款', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.takeLoan()).toEqual({ ok: false, reason: 'not-at-bank' });
  });

  it('站 9 号格 → 额度 = min(2000, 净资产 30%) 入现金，记 1 笔债务', () => {
    const g = createGame({ dice: fixed(1, 1) });
    atBank(g);
    /* 净资产 = 现金 3000（无地无股）→ 额度 = round(3000 × 0.3) = 900 */
    expect(g.takeLoan()).toEqual({ ok: true, amount: 900 });
    expect(g.state.players[0].cash).toBe(START_CASH + 900);
    const loan = g.state.players[0].loan;
    expect(loan).not.toBeNull();
    expect(loan?.principal).toBe(900);
    expect(loan?.rate).toBe(LOAN_RATE);
    expect(loan?.due).toBe(1 + LOAN_TERM);
    expect(loan?.overdue).toBe(0);
  });

  it('已有未结清贷款 → has-loan（同时至多 1 笔）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    atBank(g);
    g.takeLoan();
    expect(g.takeLoan()).toEqual({ ok: false, reason: 'has-loan' });
  });

  it('额度封顶 ￥2000', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].cash = 50000;
    atBank(g);
    expect(g.takeLoan()).toEqual({ ok: true, amount: 2000 });
  });
});

describe('M20.2 信贷 · 还款（spec §3.2）', () => {
  it('无贷款 → no-debt', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.repayLoan()).toEqual({ ok: false, reason: 'no-debt' });
  });

  it('部分还款后本金减少，全额还清后债务清空', () => {
    const g = createGame({ dice: fixed(1, 1) });
    atBank(g);
    g.takeLoan();                       // 借 900，现金 3900
    expect(g.repayLoan(400)).toEqual({ ok: true, amount: 400 });
    expect(g.state.players[0].loan?.principal).toBe(500);
    expect(g.state.players[0].cash).toBe(START_CASH + 500);
    expect(g.repayLoan()).toEqual({ ok: true, amount: 500 });
    expect(g.state.players[0].loan).toBeNull();
  });
});

describe('M20.2 信贷 · 抵押与锁定（spec §3.4）', () => {
  it('非 9 号格不能抵押；非自有地块拒绝', () => {
    const g = createGame({ dice: fixed(1, 1) });
    giveEstate(g);
    expect(g.takeMortgage(1)).toEqual({ ok: false, reason: 'not-at-bank' });
    atBank(g);
    expect(g.takeMortgage(5)).toEqual({ ok: false, reason: 'no-estate' });
    g.state.estates[5] = { index: 5, owner: 2, level: 1, processing: false };
    expect(g.takeMortgage(5)).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('抵押成功：借款 = 变卖价 × 80% 入现金，地块被锁定', () => {
    const g = createGame({ dice: fixed(1, 1) });
    giveEstate(g);
    atBank(g);
    expect(g.takeMortgage(1)).toEqual({ ok: true, amount: 24 });   // 30 × 0.8
    expect(g.state.players[0].cash).toBe(START_CASH + 24);
    const m = g.state.players[0].mortgages[0];
    expect(m.index).toBe(1);
    expect(m.principal).toBe(24);
    expect(m.rate).toBe(MORTGAGE_RATE);
    expect(m.due).toBe(1 + MORTGAGE_TERM);
    expect(creditLocked(g.state, 1)).toBe(true);
  });

  it('同一地块不可二次抵押', () => {
    const g = createGame({ dice: fixed(1, 1) });
    giveEstate(g);
    atBank(g);
    g.takeMortgage(1);
    expect(g.takeMortgage(1)).toEqual({ ok: false, reason: 'mortgaged' });
  });

  it('抵押中卖出 / 升级被拒（仍可收租）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    giveEstate(g);
    atBank(g);
    g.takeMortgage(1);
    expect(g.sellEstate(1)).toEqual({ ok: false, reason: 'mortgaged' });
    g.state.players[0].pos = 1;
    g.state.phase = 'settled';
    expect(g.upgradeCurrent()).toEqual({ ok: false, reason: 'mortgaged' });
  });

  it('抵押中仍可收租（不改 estates，路过照收）', () => {
    const g = createGame({ dice: step(1) });
    giveEstate(g);
    atBank(g);
    g.takeMortgage(1);
    /* 2 号玩家从 0 走 1 步落到 1 号格付租；摘掉免罚避免被抵消 */
    g.state.hands[1] = g.state.hands[1].filter((k) => k !== 'pardon');
    g.state.current = 1;
    g.state.players[1].pos = 0;
    g.state.players[1].cash = 3000;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r.kind).toBe('rent');
    expect(g.state.players[0].cash).toBeGreaterThan(START_CASH + 24);
    expect(g.state.players[1].cash).toBeLessThan(3000);
  });

  it('赎回抵押：付清本金解锁；无该笔抵押 → no-mortgage', () => {
    const g = createGame({ dice: fixed(1, 1) });
    giveEstate(g);
    atBank(g);
    g.takeMortgage(1);
    const before = g.state.players[0].cash;
    expect(g.redeemMortgage(1)).toEqual({ ok: true, amount: 24 });
    expect(g.state.players[0].cash).toBe(before - 24);
    expect(creditLocked(g.state, 1)).toBe(false);
    expect(g.redeemMortgage(1)).toEqual({ ok: false, reason: 'no-mortgage' });
  });
});

describe('M20.2 信贷 · 轮末计息与逾期推进（spec §3.3 / §3.4）', () => {
  it('存款 +3%/轮 复利', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].deposit = 1000;
    passRound(g);
    expect(g.state.players[0].deposit).toBe(1030);
  });

  it('信用贷款按 6%/轮 复利（无免息标记）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].loan = { principal: 1000, rate: LOAN_RATE, due: 99, overdue: 0 };
    passRound(g);
    expect(g.state.players[0].loan?.principal).toBe(1060);
  });

  it('抵押贷款按 4%/轮 复利', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].mortgages = [{ principal: 1000, rate: MORTGAGE_RATE, due: 99, overdue: 0, index: 1 }];
    passRound(g);
    expect(g.state.players[0].mortgages[0].principal).toBe(1040);
  });

  it('首轮免息：站 9 号格借款后第 1 个轮末不计息，第 2 个轮末起计息', () => {
    const g = createGame({ dice: fixed(1, 1) });
    atBank(g);
    g.takeLoan();                       // 借 900，freeFirstRound
    passRound(g);
    expect(g.state.players[0].loan?.principal).toBe(900);
    expect(g.state.players[0].loan?.freeFirstRound).toBeFalsy();
    passRound(g);
    expect(g.state.players[0].loan?.principal).toBe(Math.round(900 * 1.06));
  });

  it('逾期推进：到期轮不算逾期，下一轮起 +1；未逾期归零', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].loan = { principal: 100, rate: LOAN_RATE, due: 2, overdue: 0 };
    g.state.round = 2;
    passRound(g);                       // round → 3 > due(2) ⇒ 逾期 1
    expect(g.state.players[0].loan?.overdue).toBe(1);
  });

  it('到期轮（round === due）不算逾期', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].loan = { principal: 100, rate: LOAN_RATE, due: 3, overdue: 0 };
    g.state.round = 2;
    passRound(g);                       // round → 3 === due → 未逾期
    expect(g.state.players[0].loan?.overdue).toBe(0);
  });

  it('破产者不涨利息', () => {
    const g = createGame({ dice: fixed(1, 1) });
    g.state.players[0].bankrupt = true;
    g.state.players[0].deposit = 1000;
    passRound(g);
    expect(g.state.players[0].deposit).toBe(1000);
  });
});

describe('M20.2 信贷 · 逾期付租罚息（spec §3.4 链一）', () => {
  /** 让 2 号玩家（逾期）走到 1 号格向 1 号玩家付租 */
  const rentFromOverdue = (g: Game) => {
    giveEstate(g);
    g.state.hands[1] = g.state.hands[1].filter((k) => k !== 'pardon');
    g.state.current = 1;
    g.state.players[1].pos = 0;
    g.state.players[1].cash = 3000;
    g.rollDice();
    g.moveCurrent();
    return g.settleCurrent();
  };

  it('逾期玩家付租额外 +50% 直冲本金，地主只收原租金', () => {
    const g = createGame({ dice: step(1) });
    g.state.players[1].loan = { principal: 500, rate: LOAN_RATE, due: 1, overdue: 2 };
    const ownerBefore = g.state.players[0].cash;
    const r = rentFromOverdue(g);
    const rent = rentOf(1);
    expect(r.kind).toBe('rent');
    expect(r.kind === 'rent' ? r.penalty : 0).toBe(penaltyOf(rent));
    expect(g.state.players[0].cash).toBe(ownerBefore + rent);
    expect(g.state.players[1].cash).toBe(3000 - rent - penaltyOf(rent));
    expect(g.state.players[1].loan?.principal).toBe(500 - penaltyOf(rent));
  });

  it('未逾期玩家无罚息', () => {
    const g = createGame({ dice: step(1) });
    g.state.players[1].loan = { principal: 500, rate: LOAN_RATE, due: 99, overdue: 0 };
    const r = rentFromOverdue(g);
    expect(r.kind === 'rent' ? r.penalty : 0).toBeUndefined();
    expect(g.state.players[1].loan?.principal).toBe(500);
  });
});
