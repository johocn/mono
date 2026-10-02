import { describe, it, expect } from 'vitest';
import {
  CHANCE_DECK, DECK_SIZE, FATE_DECK, HAND_SIZE, ITEM_CARDS, type ItemCardKind,
} from '../../src/data/cards';

describe('cards 数据（spec §5.3）', () => {
  it('道具 11 种、手牌 11 槽、命运 / 机会牌堆各 20 张', () => {
    expect(ITEM_CARDS.map((c) => c.kind)).toEqual(
      [
        'bomb', 'barrier', 'pardon', 'teleport', 'doubleRent', 'demolish', 'bullBear', 'dividend',
        /* M20.5 经济道具：数组序追加在表尾（排序由 priority 决定，不依赖数组序） */
        'taxShield', 'subsidy', 'boom',
      ],
    );
    expect(ITEM_CARDS).toHaveLength(11);
    /* 槽数由种类数派生（M20.3）：M20.5 追加三种经济道具后自动变 11 */
    expect(HAND_SIZE).toBe(ITEM_CARDS.length);
    expect(HAND_SIZE).toBe(11);
    expect(DECK_SIZE).toBe(20);
    expect(FATE_DECK).toHaveLength(20);
    expect(CHANCE_DECK).toHaveLength(20);
  });

  it('道具：炸弹/路障/迁点/拆迁令需棋盘选目标，涨跌卡需选股票，其余不需', () => {
    const targetOf = (k: ItemCardKind): string => ITEM_CARDS.find((c) => c.kind === k)!.target;
    expect([targetOf('bomb'), targetOf('barrier'), targetOf('teleport'), targetOf('demolish')])
      .toEqual(['foe', 'tile', 'tile', 'foe']);
    expect([targetOf('pardon'), targetOf('doubleRent')]).toEqual(['none', 'self']);
    expect([targetOf('bullBear'), targetOf('dividend')]).toEqual(['stock', 'none']);
    /* M20.5 经济道具全部即时生效，不需要选目标 */
    expect([targetOf('taxShield'), targetOf('subsidy'), targetOf('boom')]).toEqual(['none', 'none', 'none']);
  });

  it('常用度 priority（M20.3 spec §4.1 / M20.5 §4.1b）：取值固定且两两不等（全序、零随机）', () => {
    const priorityOf = (k: ItemCardKind): number => ITEM_CARDS.find((c) => c.kind === k)!.priority;
    expect([
      priorityOf('pardon'), priorityOf('doubleRent'), priorityOf('bomb'),
      priorityOf('barrier'), priorityOf('teleport'), priorityOf('demolish'),
      priorityOf('bullBear'), priorityOf('dividend'),
    ]).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect([
      priorityOf('taxShield'), priorityOf('subsidy'), priorityOf('boom'),
    ]).toEqual([15, 25, 55]);
    const all = ITEM_CARDS.map((c) => c.priority);
    expect(new Set(all).size).toBe(all.length);
  });

  it('M20.5 经济道具描述与商店售价档位自洽（desc 一行放得下、名字非空）', () => {
    for (const k of ['taxShield', 'subsidy', 'boom'] as ItemCardKind[]) {
      const c = ITEM_CARDS.find((x) => x.kind === k)!;
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeLessThanOrEqual(30);
    }
  });

  it('命运 20 张以负向/中性为主；机会 20 张全为正向', () => {
    expect(FATE_DECK.every((c) => c.id.startsWith('f-'))).toBe(true);
    expect(CHANCE_DECK.every((c) => c.id.startsWith('c-'))).toBe(true);
    expect(new Set(FATE_DECK.map((c) => c.id)).size).toBe(20);
    expect(new Set(CHANCE_DECK.map((c) => c.id)).size).toBe(20);
    expect(new Set(FATE_DECK.map((c) => c.name)).size).toBe(20);
    expect(new Set(CHANCE_DECK.map((c) => c.name)).size).toBe(20);
  });

  it('机制覆盖：命运 14 种 / 机会 10 种，且每种机制都有牌可抽（不留死代码）', () => {
    const fateKinds = new Set(FATE_DECK.map((c) => c.kind));
    const chanceKinds = new Set(CHANCE_DECK.map((c) => c.kind));
    expect(fateKinds.size).toBe(14);
    expect(chanceKinds.size).toBe(10);
    /* 每种机制至少 1 张：花色分布不塌缩，抽牌体验有变化 */
    for (const k of fateKinds) expect(FATE_DECK.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(1);
    for (const k of chanceKinds) expect(CHANCE_DECK.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(1);
  });

  it('带参卡面：金额 / 步数 / 百分比都是正整数，文案不超长（卡面板一行放得下）', () => {
    const check = (cards: Array<{ amount?: number; steps?: number; percent?: number; name: string; text: string }>): void => {
      for (const c of cards) {
        for (const v of [c.amount, c.steps, c.percent]) {
          if (v !== undefined) expect(Number.isInteger(v) && v > 0).toBe(true);
        }
        expect(c.text.length).toBeLessThanOrEqual(30);
        expect(c.name.length).toBeGreaterThan(0);
      }
    };
    check(FATE_DECK);
    check(CHANCE_DECK);
  });
});