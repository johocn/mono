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
    g.state.news = null;                              // M20.6：隔离随机开局的板块新闻（否则会改租金系数）
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

describe('M20.2 信贷 · 两条违约链与破产清债务（spec §3.4 链二/链三 · §3.5）', () => {
  /** 直接给 1 号玩家挂一笔抵押（免去走 9 号格办理） */
  const giveMortgage = (g: Game, index: number, principal: number, due: number): void => {
    g.state.players[0].mortgages.push({ principal, rate: MORTGAGE_RATE, due, overdue: 0, index });
  };

  it('链二：逾期满 3 轮 → 轮末强执未抵押地产，队列跳过抵押地块', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    giveEstate(g, 1);
    giveEstate(g, 2);
    giveMortgage(g, 2, 24, 99);
    p.loan = { principal: 200, rate: LOAN_RATE, due: 1, overdue: 2 };
    g.state.round = 1;
    passRound(g);                                  // round → 2 ⇒ 逾期 3 ⇒ 触发强执
    /* 只拍未抵押的 1 号；抵押中的 2 号原地不动 */
    expect(g.state.estates[1]?.owner).not.toBe(1);
    expect(g.state.estates[2]?.owner).toBe(1);
    expect(p.mortgages.map((m) => m.index)).toEqual([2]);
    /* settleBooks 先把本金复利到 212，成交款恰好冲抵 ⇒ 债务清零 */
    expect(p.loan).toBeNull();
    expect(g.state.auction).toBeNull();
  });

  it('链三：抵押超期 → 轮末开 mortgage-overdue 拍卖（起拍价 = 借款额）；挂起不换手', () => {
    /* 2 号玩家为真人 ⇒ 拍卖挂起等其出价（验证「挂起期间不推进玩家」） */
    const g = createGame({ dice: fixed(1, 1), seats: [null, null, 'conservative', 'conservative'] });
    const p = g.state.players[0];
    giveEstate(g, 1);
    giveMortgage(g, 1, 24, 1);
    p.cash = 3024;                                 // 3000 + 借款 24
    g.state.round = 1;
    passRound(g);
    /* round → 2 > due(1) ⇒ 开拍；真人未出价 ⇒ 挂起，不换手 */
    expect(g.state.current).toBe(g.state.players.length - 1);
    expect(g.state.phase).toBe('settled');
    const a = g.state.auction;
    expect(a?.trigger).toBe('mortgage-overdue');
    expect(a?.lot.index).toBe(1);
    expect(a?.lot.startPrice).toBe(Math.round(24 * 1.04));   // 起拍价 = 复利后的借款额 25
    /* 收尾：成交款先还该笔（25），余额归借款人 ⇒ 现金净增；抵押解除 */
    g.autoResolveAuction();
    expect(g.state.auction).toBeNull();
    expect(g.state.current).toBe(0);               // 挂起解除后补上被暂存的换手
    expect(g.state.phase).toBe('idle');
    expect(p.mortgages).toEqual([]);
    expect(g.state.estates[1]?.owner).not.toBe(1);
    expect(p.cash).toBeGreaterThan(3024);
  });

  it('破产：债务清零且未赎回抵押物进清仓拍卖', () => {
    const g = createGame({ dice: step(1) });
    const p = g.state.players[0];
    g.state.estates[1] = { index: 1, owner: 2, level: 1, processing: false };
    giveEstate(g, 2);
    giveMortgage(g, 2, 24, 99);
    p.cash = 0;
    p.loan = { principal: 50, rate: LOAN_RATE, due: 99, overdue: 0 };
    g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'pardon');
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r.kind).toBe('rent');
    expect(p.bankrupt).toBe(true);
    expect(p.loan).toBeNull();
    expect(p.mortgages).toEqual([]);
    expect(g.state.estates[2]?.owner).not.toBe(1);
    expect(g.state.auction).toBeNull();
  });
});

describe('M20.2 信贷 · 银行格与清算顺序（spec §3.5 / §3.7）', () => {
  it('落 9 号银行格：领「存款红包」= round(存款 × 5%)，存款本金不动', () => {
    const g = createGame({ dice: fixed(1, 1) });
    const p = g.state.players[0];
    p.pos = 7;                         // +2 步落 9 号银行格
    p.deposit = 1000;
    g.rollDice();
    g.moveCurrent();
    expect(g.settleCurrent()).toMatchObject({ kind: 'bank', index: 9, bonus: 50 });
    expect(p.deposit).toBe(1000);      // 只是发红包，存款仍在账上
    expect(p.cash).toBe(START_CASH + 50);
  });

  it('清算优先取存款：现金不足时先全额取存款补齐，不触拍卖、不动自有地产', () => {
    const g = createGame({ dice: step(1) });
    g.state.news = null;                 // M20.6：板块新闻会改租金，租金口径用例与新闻解耦
    const p = g.state.players[0];
    g.state.estates[1] = { index: 1, owner: 2, level: 1, processing: false };   // 2 号收租格
    giveEstate(g, 3);                  // 自有未抵押地产（若误走拍卖会被卖掉）
    p.cash = 5;
    p.deposit = 500;
    g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'pardon');
    g.state.current = 0;
    p.pos = 0;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent() as { kind: string; paid: number; sold: number[] };
    expect(r).toMatchObject({ kind: 'rent', paid: 15, sold: [] });   // L1 租金 15
    expect(p.deposit).toBe(0);         // 存款已全额取出
    expect(p.cash).toBe(490);          // 5 + 500 − 15
    expect(g.state.estates[3]?.owner).toBe(1);
    expect(g.state.auction).toBeNull();
  });
});
