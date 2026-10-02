import { describe, it, expect } from 'vitest';
import { createGame, type Game } from '../../src/core/game';
import { ECON_INDEX_MAX, ECON_INDEX_MIN, ECON_INDEX_START, START_CASH, rentOf } from '../../src/data/economy';
import { makeRng, type Dice } from '../../src/core/dice';
import type { ItemCardKind } from '../../src/data/cards';
import type { BuildLevel } from '../../src/data/board';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });

/** 给 2 号玩家一块 L1 地块（index 1，基础租金 15） */
const giveEstate = (g: Game, index: number, owner: number, level: BuildLevel): void => {
  g.state.estates[index] = { index, owner, level, processing: false };
};
/** 让 index 号玩家落到 1 号格并进入 moved 相位 */
const landOn = (g: Game, playerIdx: number, index: number): void => {
  g.state.current = playerIdx;
  g.state.players[playerIdx].pos = index;
  g.state.phase = 'moved';
};
/** 触发一次轮末（把当前玩家设为末位并结束回合 ⇒ next===0 ⇒ round+1 + onRoundBoundary） */
const passRound = (g: Game): void => {
  g.state.current = g.state.players.length - 1;
  g.state.phase = 'settled';
  g.endTurn();
};
/** 从手牌移除某张（默认开局全持有，测试按需剔除） */
const dropCard = (g: Game, playerIdx: number, kind: ItemCardKind): void => {
  g.state.hands[playerIdx] = g.state.hands[playerIdx].filter((k) => k !== kind);
};
/** 找一个「首次 auditRng() < limit」的 seed（查税命中可复现） */
const seedForAuditHit = (limit: number): number => {
  for (let s = 1; s < 100000; s++) {
    if (makeRng((s ^ 0x0a0d17) >>> 0)() < limit) return s;
  }
  throw new Error('no audit-hit seed');
};

describe('M20.5 景气度（spec §5.2 D42）', () => {
  it('开局景气 1.0、新闻历史记首条', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.state.economyIndex).toBe(ECON_INDEX_START);
    expect(g.state.newsHistory).toEqual([g.state.news!.id]);
  });

  it('租金 = round(基础租金 × 景气度)：1.0 逐值回旧口径、1.3 上浮', () => {
    /* index = 1.0（默认）→ rentOf(1) = 15 */
    const g1 = createGame({ seed: 11, dice: fixed(1, 1) });
    dropCard(g1, 0, 'pardon');
    giveEstate(g1, 1, 2, 1);
    landOn(g1, 0, 1);
    const r1 = g1.settleCurrent();
    expect(r1.kind).toBe('rent');
    if (r1.kind === 'rent') expect(r1.rent).toBe(rentOf(1));
    expect(g1.state.players[0].cash).toBe(START_CASH - rentOf(1));
    expect(g1.state.players[1].cash).toBe(START_CASH + rentOf(1));

    /* index = 1.3 → round(15 × 1.3) = 20 */
    const g2 = createGame({ seed: 12, dice: fixed(1, 1) });
    dropCard(g2, 0, 'pardon');
    g2.state.economyIndex = 1.3;
    giveEstate(g2, 1, 2, 1);
    landOn(g2, 0, 1);
    const r2 = g2.settleCurrent();
    expect(r2.kind).toBe('rent');
    if (r2.kind === 'rent') expect(r2.rent).toBe(20);
    expect(g2.state.players[1].cash).toBe(START_CASH + 20);
  });

  it('地主本轮累计收租 roundRent（查税基数）；被免除（pardon）不计', () => {
    const g = createGame({ seed: 13, dice: fixed(1, 1) });
    /* 先免除：开局持有 pardon ⇒ 首次付租被免，地主 roundRent 不增 */
    giveEstate(g, 1, 2, 1);
    landOn(g, 0, 1);
    const r0 = g.settleCurrent();
    expect(r0.kind).toBe('rent');
    if (r0.kind === 'rent') expect(r0.waived).toBe(true);
    expect(g.state.players[1].roundRent).toBe(0);

    /* 再实付：摘掉 pardon ⇒ 正常收租，roundRent 累计 */
    dropCard(g, 0, 'pardon');
    giveEstate(g, 3, 2, 1);
    landOn(g, 0, 3);
    g.settleCurrent();
    expect(g.state.players[1].roundRent).toBe(rentOf(1));
  });

  it('轮末 roundRent 清零；景气度落在域 [0.7, 1.3] 内且同 seed 可复现', () => {
    const run = (): number[] => {
      const g = createGame({ seed: 21, dice: fixed(1, 1) });
      const out: number[] = [];
      g.state.players[0].roundRent = 300;
      for (let i = 0; i < 12; i++) {
        passRound(g);
        out.push(g.state.economyIndex);
      }
      expect(g.state.players[0].roundRent).toBe(0);
      return out;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(ECON_INDEX_MIN);
      expect(v).toBeLessThanOrEqual(ECON_INDEX_MAX);
    }
  });
});

describe('M20.5 查税（spec §5.4 D43 / D44）', () => {
  it('命中：补税 = round(roundRent × 30%)，走 settleDebt 扣现金', () => {
    const seed = seedForAuditHit(0.4);
    const g = createGame({ seed, dice: fixed(1, 1) });
    dropCard(g, 0, 'taxShield');
    g.state.players[0].roundRent = 2000;               // 概率 = min(0.4, 0.4) = 0.4
    passRound(g);
    const ev = g.state.lastEvent;
    expect(ev?.kind).toBe('audit');
    if (ev?.kind === 'audit') {
      expect(ev.player).toBe(1);
      expect(ev.rent).toBe(2000);
      expect(ev.tax).toBe(600);
      expect(ev.paid).toBe(600);
      expect(ev.bankrupt).toBe(false);
    }
    expect(g.state.players[0].cash).toBe(START_CASH - 600);
    expect(g.state.players[0].roundRent).toBe(0);
  });

  it('避税凭证：命中后免疫一次并消耗（未命中不消耗）', () => {
    const seed = seedForAuditHit(0.4);
    const g = createGame({ seed, dice: fixed(1, 1) });
    expect(g.state.hands[0]).toContain('taxShield');    // 开局全持有
    g.state.players[0].roundRent = 2000;
    passRound(g);
    expect(g.state.hands[0]).not.toContain('taxShield');
    expect(g.state.players[0].cash).toBe(START_CASH);   // 未被补税
    expect(g.state.lastEvent?.kind).not.toBe('audit');

    /* 未命中（roundRent = 0 → 概率 0）时不消耗：重新开一局验证凭证仍在 */
    const g2 = createGame({ seed, dice: fixed(1, 1) });
    passRound(g2);
    expect(g2.state.hands[0]).toContain('taxShield');
  });

  it('概率 0（无收租）不触发查税：即使用「必命中」seed 也不扣现金', () => {
    const seed = seedForAuditHit(0.4);
    const g = createGame({ seed, dice: fixed(1, 1) });
    dropCard(g, 0, 'taxShield');
    g.state.players[0].roundRent = 0;
    passRound(g);
    expect(g.state.players[0].cash).toBe(START_CASH);
    expect(g.state.lastEvent?.kind).not.toBe('audit');
  });
});

describe('M20.5 经济道具（spec §5.6）', () => {
  it('subsidy：立即 +￥300 并消耗手牌', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.useCard('subsidy')).toEqual({ ok: true, kind: 'subsidy' });
    expect(g.state.players[0].cash).toBe(START_CASH + 300);
    expect(g.state.hands[0]).not.toContain('subsidy');
    expect(g.state.lastEvent).toEqual({ kind: 'subsidy', amount: 300 });
  });

  it('boom：本轮景气度 +0.2（封顶 1.3）并消耗手牌', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.useCard('boom')).toEqual({ ok: true, kind: 'boom' });
    expect(g.state.economyIndex).toBe(1.2);
    expect(g.state.lastEvent).toEqual({ kind: 'economy', index: 1.2 });
    expect(g.state.hands[0]).not.toContain('boom');
  });

  it('taxShield：被动持有，不可主动出牌且不消耗手牌', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.useCard('taxShield')).toEqual({ ok: false, reason: 'passive' });
    expect(g.state.hands[0]).toContain('taxShield');
  });

  it('未持有 → not-held（三张同判）', () => {
    const g = createGame({ dice: fixed(1, 1) });
    for (const k of ['subsidy', 'boom', 'taxShield'] as ItemCardKind[]) dropCard(g, 0, k);
    for (const k of ['subsidy', 'boom', 'taxShield'] as ItemCardKind[]) {
      expect(g.useCard(k)).toEqual({ ok: false, reason: 'not-held' });
    }
  });
});
