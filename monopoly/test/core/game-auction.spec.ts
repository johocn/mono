import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game';
import type { Dice } from '../../src/core/dice';
import type { FateCardDef } from '../../src/data/cards';

const fixed = (d1: number, d2: number): Dice => ({ roll: () => ({ d1, d2, total: d1 + d2 }) });
/** 摘免罚 + 去除当期新闻：租金口径用例须与板块新闻（M20.6）解耦 */
const dropPardon = (g: ReturnType<typeof createGame>): void => {
  g.state.hands[0] = g.state.hands[0].filter((k) => k !== 'pardon');
  g.state.news = null;
};
const FINE_150: FateCardDef = { id: 'f-fine', name: '违规罚金', kind: 'fine', amount: 150, text: '摊位违规，罚金 ￥150' };

describe('game 破产拍卖（spec §3.3 / §3.4，AI-only 同步）', () => {
  it('成交：所有权转移 + 楼层保留 + 拍够即停 + 余额归破产者', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 3, processing: false };  // 原主 L3
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };  // 债权人 L3（租金 105）
    g.state.players[0].cash = 10;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    /* 保守出价：round(105×6×0.6/10)×10 = 380；起拍 330；三人并列取小 id ⇒ 玩家 2 成交 */
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 105, sold: [3], bankrupt: false });
    expect(g.state.estates[3]).toEqual({ index: 3, owner: 2, level: 3, processing: false });
    expect(g.state.players[0].cash).toBe(285);      // 10 + 380 − 105
    expect(g.state.players[1].cash).toBe(2725);     // 3000 − 380 + 105
    expect(g.state.players[0].bankrupt).toBe(false);
  });

  it('流拍且债权人为人 → 转移抵债（按起拍价计入原主现金，楼层保留）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 5, processing: false };  // 原主 L5，起拍 1560
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };  // 债权人
    g.state.players[0].cash = 10;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    /* 保守估 L5 = round(420×6×0.6/10)×10 = 1510 < 起拍 1560 ⇒ 全员放弃流拍 */
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 105, sold: [3], bankrupt: false });
    expect(g.state.estates[3]).toEqual({ index: 3, owner: 2, level: 5, processing: false });
    expect(g.state.players[0].cash).toBe(1465);     // 10 + 1560 − 105
    expect(g.state.players[1].cash).toBe(3105);     // 3000 + 105
  });

  it('流拍且债权人为银行 → 删键回归无主（抵债价 0）', () => {
    const g = createGame({ dice: fixed(1, 1), decks: { fate: [FINE_150] } });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 5, processing: false };
    g.state.players[0].cash = 10;
    g.state.players[0].pos = 0;                     // 掷 2 落在 index 2 = 命运格
    g.rollDice();
    g.moveCurrent();
    expect(g.state.players[0].pos).toBe(2);
    const r = g.settleCurrent();
    expect(r).toEqual({
      kind: 'fate', index: 2, cardId: 'f-fine',
      effect: { kind: 'fine', amount: 150, paid: 10, bankrupt: true },
    });
    expect(g.state.estates[3]).toBeUndefined();     // 银行不收地 ⇒ 回归可购买
    expect(g.state.players[0].cash).toBe(0);
    expect(g.state.players[0].bankrupt).toBe(true);
  });

  it('不足由债权人承担差额（只收到 paid）', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1 });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };  // 起拍 30，最高只能拍到 50
    g.state.estates[4] = { index: 4, owner: 2, level: 3, processing: false };  // 租金 105
    g.state.players[0].cash = 0;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'rent', index: 4, owner: 2, rent: 105, paid: 50, sold: [3], bankrupt: true });
    expect(g.state.players[1].cash).toBe(3000);     // 3000 − 50（中标）+ 50（受偿）
    expect(g.state.players[0].cash).toBe(0);
    expect(g.state.players[0].bankrupt).toBe(true);
  });
});

describe('game 破产拍卖（真人待出价挂起，spec §3.4）', () => {
  it('有真人竞价 → settleCurrent 挂起（kind=auction）；bidAuction 推进并落槌', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1, seats: [null, null, 'conservative', 'conservative'] });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 3, level: 3, processing: false };  // 债权人 = 玩家 3
    g.state.players[0].cash = 0;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    const r = g.settleCurrent();
    expect(r).toEqual({ kind: 'auction', index: 4, payer: 1, creditor: 3, amount: 105, remaining: 1 });
    expect(g.state.auction).not.toBeNull();
    expect(g.state.auction?.pending).toEqual([2]);   // 玩家 2 是真人，等出价

    expect(g.bidAuction(0)).toEqual({ ok: true, amount: 0 });
    expect(g.state.auction).toBeNull();
    expect(g.state.estates[3]).toEqual({ index: 3, owner: 3, level: 1, processing: false });  // 并列取小 id：AI 玩家 3 中标
    expect(g.state.players[0].bankrupt).toBe(true);
    expect(g.state.lastEvent).toEqual({ kind: 'auctionDone', index: 3, winner: 3, price: 50 });
  });

  it('autoResolveAuction 把待出价真人按 AI 同源补全并收尾', () => {
    const g = createGame({ dice: fixed(1, 1), seed: 1, seats: [null, null, 'conservative', 'conservative'] });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 3, level: 3, processing: false };
    g.state.players[0].cash = 0;
    g.state.players[0].pos = 2;
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    expect(g.state.auction).not.toBeNull();
    g.autoResolveAuction();
    expect(g.state.auction).toBeNull();
    /* 补全后三人同价 50 ⇒ 取小 id：玩家 2 中标 */
    expect(g.state.estates[3]).toEqual({ index: 3, owner: 2, level: 1, processing: false });
    expect(g.state.players[0].bankrupt).toBe(true);
  });

  it('无拍卖时 bidAuction → no-auction；负价 / 非整数 → bad-amount', () => {
    const g = createGame({ dice: fixed(1, 1) });
    expect(g.bidAuction(0)).toEqual({ ok: false, reason: 'no-auction' });
    dropPardon(g);
    g.state.estates[3] = { index: 3, owner: 1, level: 1, processing: false };
    g.state.estates[4] = { index: 4, owner: 3, level: 3, processing: false };
    g.state.players[0].cash = 0;
    g.state.players[0].pos = 2;
    g.state.seats = [null, null, 'conservative', 'conservative'];
    g.rollDice();
    g.moveCurrent();
    g.settleCurrent();
    expect(g.state.auction).not.toBeNull();
    expect(g.bidAuction(-1)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(g.bidAuction(1.5)).toEqual({ ok: false, reason: 'bad-amount' });
  });
});
