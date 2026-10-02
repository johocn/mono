import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_ORDER, PERSONAS, PERSONA_DESC, PERSONA_LABEL, PERSONA_PARAMS,
  isPersona, parsePersonaList, personaParams,
} from '../../src/data/ai';
import { createGame, currentPlayer } from '../../src/core/game';
import { applyStep, decideTurn, pickBank, type AiStep } from '../../src/core/ai';
import { BANK_TILE_INDEX } from '../../src/data/bank';

describe('ai 性格档案', () => {
  it('三种性格的标签与说明齐备', () => {
    expect(PERSONAS).toEqual(['conservative', 'aggressive', 'speculative']);
    for (const p of PERSONAS) {
      expect(PERSONA_LABEL[p]).toBeTruthy();
      expect(PERSONA_DESC[p]).toBeTruthy();
    }
  });
  it('参数表逐项对齐 spec §4.2', () => {
    expect(PERSONA_PARAMS.conservative.reserve).toBe(400);
    expect(PERSONA_PARAMS.aggressive.reserve).toBe(100);
    expect(PERSONA_PARAMS.speculative.reserve).toBe(200);
    expect(PERSONA_PARAMS.conservative.buyMax).toBe(300);
    expect(PERSONA_PARAMS.aggressive.buyMax).toBe(Infinity);
    expect(PERSONA_PARAMS.conservative.upgradeEager).toBe(false);
    expect(PERSONA_PARAMS.aggressive.upgradeEager).toBe(true);
    expect(PERSONA_PARAMS.speculative.cardPolicy).toBe('arbitrage');
    expect(PERSONA_PARAMS.conservative.stockPolicy).toBe('none');
    expect(PERSONA_PARAMS.aggressive.stockPolicy).toBe('momentum');
    expect(PERSONA_PARAMS.speculative.stockPolicy).toBe('dip');
    expect(PERSONA_PARAMS.conservative.targetLeader).toBe(false);
    expect(PERSONA_PARAMS.aggressive.targetLeader).toBe(true);
    expect(personaParams('speculative')).toBe(PERSONA_PARAMS.speculative);
  });
  it('isPersona / parsePersonaList 丢弃非法项', () => {
    expect(isPersona('aggressive')).toBe(true);
    expect(isPersona('hard')).toBe(false);
    expect(parsePersonaList('conservative,aggressive,speculative')).toEqual(DEFAULT_AI_ORDER);
    expect(parsePersonaList('speculative,bogus,conservative')).toEqual(['speculative', 'conservative']);
    expect(parsePersonaList(null)).toEqual([]);
    expect(parsePersonaList('')).toEqual([]);
  });
});

describe('decideTurn 性格差异', () => {
  it('保守：现金低于 reserve(400) 时不买地；高于时可买', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 1; me.cash = 300;              // 空地 + 现金 300 < 400
    g.state.phase = 'settled';
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(false);
    me.cash = 2000;
    expect(decideTurn(g.state, 'conservative').some((s) => s.kind === 'buy')).toBe(true);
  });

  it('激进：手牌目标选净资产最高者（领先者）', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    g.state.phase = 'idle';
    const foe = g.state.players.filter((p) => p.id !== me.id);
    foe.forEach((p, i) => { p.pos = 2 + i * 4; });
    foe[1].cash = 99999;                    // 玩家 3 = 净资产最高
    /* 炸弹目标必须是真实地块（bombDown 对空地判 not-estate），故给领先者铺一块自有地 */
    g.state.estates[foe[1].pos] = { index: foe[1].pos, owner: foe[1].id, level: 3, processing: false };
    const step = decideTurn(g.state, 'aggressive').find((s) => s.kind === 'card') as
      Extract<AiStep, { kind: 'card' }> | undefined;
    expect(step).toBeTruthy();
    expect(step!.target).toBe(foe[1].pos);
  });

  it('投机：round < 8 不打领先者；round >= 8 才打', () => {
    const g = createGame({ seed: 3 });
    g.state.phase = 'idle';
    g.state.round = 1;
    expect(decideTurn(g.state, 'speculative').some((s) => s.kind === 'card')).toBe(false);
    g.state.round = 9;
    expect(decideTurn(g.state, 'speculative').length).toBeGreaterThan(0);
  });

  it('投机：phase=rolled 且未在交易所时，迁点到股票交易所 19', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = 5; g.state.phase = 'rolled'; me.cash = 3000;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'card', card: 'teleport', target: 19 });
    me.pos = 19;
    expect(decideTurn(g.state, 'speculative')[0]).toEqual({ kind: 'move' });
  });
});

describe('decideTurn 合法性与确定性', () => {
  it('随机 60 个 state：产出的每一步都能被对应 Game API 成功执行', () => {
    for (let k = 1; k <= 60; k++) {
      const g = createGame({ seed: k });
      for (let i = 0; i < 40; i++) {
        const persona = (['conservative', 'aggressive', 'speculative'] as const)[i % 3];
        const plan = decideTurn(g.state, persona);
        for (const step of plan) {
          const r = applyStep(g, step) as { ok?: boolean; reason?: string } | undefined;
          if (r && r.ok === false) {
            throw new Error(`seed ${k} step ${JSON.stringify(step)} → ${String(r.reason)}`);
          }
          if (g.state.over) break;
        }
        if (g.state.over) break;
      }
    }
  });

  it('同 state + 同 persona 调两次，结果深度相等', () => {
    const g = createGame({ seed: 11 });
    g.state.phase = 'settled';
    const a = decideTurn(g.state, 'aggressive');
    const b = decideTurn(g.state, 'aggressive');
    expect(a).toEqual(b);
  });

  it('结束态不再产出任何步骤', () => {
    const g = createGame({ seed: 5 });
    g.state.over = true;
    expect(decideTurn(g.state, 'aggressive')).toEqual([]);
  });
});

describe('ai 拆迁令决策（与炸弹同源挑选，互斥）', () => {
  /* 复用上方「激进：手牌目标选净资产最高者」的构造：领先者 foe[1] 坐拥一块 L3 自有地 */
  function buildAggressiveState() {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    g.state.phase = 'idle';
    const foe = g.state.players.filter((p) => p.id !== me.id);
    foe.forEach((p, i) => { p.pos = 2 + i * 4; });
    foe[1].cash = 99999;                    // 玩家 3 = 净资产最高
    g.state.estates[foe[1].pos] = { index: foe[1].pos, owner: foe[1].id, level: 3, processing: false };
    return { g, foe };
  }

  it('激进性格 + 持有 demolish → 拆迁令指向领先者最高级地块', () => {
    const { g, foe } = buildAggressiveState();
    const steps = decideTurn(g.state, 'aggressive');
    const card = steps.find((s): s is Extract<AiStep, { kind: 'card' }> => s.kind === 'card' && s.card === 'demolish');
    expect(card).toBeDefined();
    expect(card!.target).toBe(foe[1].pos);
  });

  it('demolish 与 bomb 互斥（不同格，保证整段 plan 可顺序执行）', () => {
    const { g } = buildAggressiveState();
    const cards = decideTurn(g.state, 'aggressive').filter((s): s is Extract<AiStep, { kind: 'card' }> => s.kind === 'card');
    const d = cards.find((c) => c.card === 'demolish');
    const b = cards.find((c) => c.card === 'bomb');
    expect(d).toBeDefined();
    expect(b).toBeUndefined();
  });
});

describe('ai 步骤映射：自由出售 / 拍卖出价（M20.1）', () => {
  it('applyStep({kind:"sell"})：售出自有地块，返回 price/cash', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.cash = 1000;
    g.state.estates[3] = { index: 3, owner: me.id, level: 3, processing: false };
    const r = applyStep(g, { kind: 'sell', index: 3 }) as { ok: boolean; price: number; cash: number };
    expect(r.ok).toBe(true);
    expect(r.price).toBe(330);              // sellValue(3)
    expect(r.cash).toBe(1330);
    expect(g.state.estates[3]).toBeUndefined();   // 售出 → 回归无主
  });

  it('applyStep({kind:"auctionBid"})：无待拍态 → { ok:false, reason:"no-auction" }', () => {
    const g = createGame({ seed: 3 });
    expect(applyStep(g, { kind: 'auctionBid', amount: 0 })).toEqual({ ok: false, reason: 'no-auction' });
  });
});

describe('ai pickBank 银行信贷策略（M20.2-D12）', () => {
  const bank = (seed = 3) => {
    const g = createGame({ seed });
    const me = currentPlayer(g.state);
    me.pos = BANK_TILE_INDEX;
    return { g, me };
  };

  it('站 9 号格 + 现金告急 + 有闲置地块 → 抵押序号最小的可抵押地块', () => {
    const { g, me } = bank();
    me.cash = 100;                                   // < 保守 loanLine(400)
    g.state.estates[3] = { index: 3, owner: me.id, level: 2, processing: false };
    g.state.estates[7] = { index: 7, owner: me.id, level: 1, processing: false };
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'mortgage', index: 3 }]);
  });

  it('无地可抵押 → 申请信用贷款；已有贷款则不重复借', () => {
    const { g, me } = bank();
    me.cash = 100;
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'borrow' }]);
    me.loan = { principal: 300, rate: 0.06, due: g.state.round + 8, overdue: 0 };
    expect(pickBank(g.state, personaParams('conservative'))).toEqual([]);
  });

  it('现金充裕且无债务 → 存余钱（留 reserve）；现金不超线则不存', () => {
    const { g, me } = bank();
    me.cash = 2000;
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'deposit', amount: 1600 }]);   // 2000 − reserve(400)
    me.cash = 800;                                   // 未超过 depositLine(800)
    expect(pickBank(g.state, personaParams('conservative'))).toEqual([]);
  });

  it('有债务时不存款（即便现金充裕）', () => {
    const { g, me } = bank();
    me.cash = 5000;
    me.loan = { principal: 300, rate: 0.06, due: g.state.round + 8, overdue: 0 };
    expect(pickBank(g.state, personaParams('conservative'))).toEqual([]);
    me.loan = null;
    me.mortgages = [{ principal: 200, rate: 0.04, due: g.state.round + 6, overdue: 0, index: 3 }];
    expect(pickBank(g.state, personaParams('conservative'))).toEqual([]);
  });

  it('临近到期（due − round ≤ 2，含已逾期）→ 还款优先于一切', () => {
    const { g, me } = bank();
    me.cash = 5000;
    g.state.estates[3] = { index: 3, owner: me.id, level: 2, processing: false };
    me.loan = { principal: 600, rate: 0.06, due: g.state.round + 2, overdue: 0 };
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'repay' }]);

    me.loan.due = g.state.round - 1;                  // 已逾期同样优先还款
    me.loan.overdue = 1;
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'repay' }]);
  });

  it('不站 9 号格 → 不产出借款/抵押（存款不受位置限制）', () => {
    const { g, me } = bank();
    me.pos = 5;
    me.cash = 100;
    g.state.estates[3] = { index: 3, owner: me.id, level: 2, processing: false };
    expect(pickBank(g.state, personaParams('conservative'))).toEqual([]);
    me.cash = 2000;                                   // 存款任意回合可产
    expect(pickBank(g.state, personaParams('conservative')))
      .toEqual([{ kind: 'bank', action: 'deposit', amount: 1600 }]);
  });

  it('决定论：同 state 连调两次结果深度相等', () => {
    const { g, me } = bank();
    me.cash = 2000;
    const a = pickBank(g.state, personaParams('aggressive'));
    const b = pickBank(g.state, personaParams('aggressive'));
    expect(a).toEqual(b);
  });

  it('settled 计划把银行步插在租金翻倍之前、收尾 end 之前', () => {
    const { g, me } = bank();                        // 站 9 号格 = 银行格
    me.cash = 250;                                   // < 投机 loanLine(300) 且 ≥ reserve(200)
    g.state.estates[19] = { index: 19, owner: me.id, level: 2, processing: false };
    g.state.hands[me.id - 1] = ['doubleRent'];
    g.state.phase = 'settled';
    const plan = decideTurn(g.state, 'speculative');
    expect(plan[0]).toEqual({ kind: 'bank', action: 'mortgage', index: 19 });
    expect(plan[1]).toEqual({ kind: 'card', card: 'doubleRent' });
    expect(plan[plan.length - 1]).toEqual({ kind: 'end' });
  });

  it('同回合既有消费步骤又有存款时，存款推迟到下一步（整段 plan 可顺序执行）', () => {
    const { g, me } = bank();
    me.pos = 3;                                      // 农家果蔬（shop）空地 → 可买
    me.cash = 2000;
    g.state.phase = 'settled';
    const plan = decideTurn(g.state, 'conservative');
    expect(plan.some((s) => s.kind === 'buy')).toBe(true);
    expect(plan.some((s) => s.kind === 'bank')).toBe(false);
    /* 买完地（钱已花掉）后再决策：此时才补上金额正确的存款步 */
    applyStep(g, { kind: 'buy' });
    expect(decideTurn(g.state, 'conservative')[0]).toEqual({ kind: 'bank', action: 'deposit', amount: 1540 });
  });

  it('applyStep 映射六个银行动作；deposit/withdraw 走金额、borrow/repay 走无参/全额', () => {
    const g = createGame({ seed: 3 });
    const me = currentPlayer(g.state);
    me.pos = BANK_TILE_INDEX;
    me.cash = 1000;
    expect(applyStep(g, { kind: 'bank', action: 'deposit', amount: 400 }))
      .toEqual({ ok: true, amount: 400 });
    expect(me.deposit).toBe(400);
    expect(applyStep(g, { kind: 'bank', action: 'withdraw', amount: 150 }))
      .toEqual({ ok: true, amount: 150 });
    expect(me.deposit).toBe(250);
    const borrow = applyStep(g, { kind: 'bank', action: 'borrow' }) as { ok: boolean; amount: number };
    expect(borrow.ok).toBe(true);
    expect(me.loan).not.toBeNull();
    const repay = applyStep(g, { kind: 'bank', action: 'repay' }) as { ok: boolean; amount: number };
    expect(repay.ok).toBe(true);
    expect(me.loan).toBeNull();                      // 全额还清（现金充足）
    g.state.estates[3] = { index: 3, owner: me.id, level: 2, processing: false };
    const mort = applyStep(g, { kind: 'bank', action: 'mortgage', index: 3 }) as { ok: boolean; amount: number };
    expect(mort.ok).toBe(true);
    expect(me.mortgages.map((m) => m.index)).toEqual([3]);
    const redeem = applyStep(g, { kind: 'bank', action: 'redeem', index: 3 }) as { ok: boolean };
    expect(redeem.ok).toBe(true);
    expect(me.mortgages).toEqual([]);
  });

  it('缺 index / 非法目标 → 不抛错，返回 ok:false', () => {
    const g = createGame({ seed: 3 });
    currentPlayer(g.state).pos = BANK_TILE_INDEX;
    expect(applyStep(g, { kind: 'bank', action: 'mortgage' })).toEqual({ ok: false, reason: 'no-estate' });
    expect(applyStep(g, { kind: 'bank', action: 'redeem', index: 3 })).toEqual({ ok: false, reason: 'no-mortgage' });
  });
});