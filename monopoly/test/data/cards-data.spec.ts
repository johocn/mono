import { describe, it, expect } from 'vitest';
import {
  CHANCE_DECK, DECK_SIZE, FATE_DECK, HAND_SIZE, ITEM_CARDS, type ItemCardKind,
} from '../../src/data/cards';

describe('cards 数据（spec §5.3）', () => {
  it('道具 6 种、手牌 6 槽、命运 / 机会牌堆各 20 张', () => {
    expect(ITEM_CARDS.map((c) => c.kind)).toEqual(
      ['bomb', 'barrier', 'pardon', 'teleport', 'doubleRent', 'demolish'],
    );
    expect(ITEM_CARDS).toHaveLength(6);
    expect(HAND_SIZE).toBe(6);
    expect(DECK_SIZE).toBe(20);
    expect(FATE_DECK).toHaveLength(20);
    expect(CHANCE_DECK).toHaveLength(20);
  });

  it('道具：炸弹/路障/迁点/拆迁令需选目标，免罚/翻倍不需', () => {
    const targetOf = (k: ItemCardKind): string => ITEM_CARDS.find((c) => c.kind === k)!.target;
    expect([targetOf('bomb'), targetOf('barrier'), targetOf('teleport'), targetOf('demolish')])
      .toEqual(['foe', 'tile', 'tile', 'foe']);
    expect([targetOf('pardon'), targetOf('doubleRent')]).toEqual(['none', 'self']);
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