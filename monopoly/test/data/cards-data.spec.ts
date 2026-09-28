import { describe, it, expect } from 'vitest';
import {
  CHANCE_DECK, DECK_SIZE, FATE_DECK, HAND_SIZE, ITEM_CARDS, type ItemCardKind,
} from '../../src/data/cards';

describe('cards 数据（spec §5.3）', () => {
  it('道具 5 种、手牌 5 槽、牌堆各 6 张', () => {
    expect(ITEM_CARDS.map((c) => c.kind)).toEqual(
      ['bomb', 'barrier', 'pardon', 'teleport', 'doubleRent'],
    );
    expect(ITEM_CARDS).toHaveLength(5);
    expect(HAND_SIZE).toBe(5);
    expect(DECK_SIZE).toBe(6);
    expect(FATE_DECK).toHaveLength(6);
    expect(CHANCE_DECK).toHaveLength(6);
  });

  it('道具：炸弹/路障/迁点需选目标，免罚/翻倍不需', () => {
    const targetOf = (k: ItemCardKind): string => ITEM_CARDS.find((c) => c.kind === k)!.target;
    expect([targetOf('bomb'), targetOf('barrier'), targetOf('teleport')]).toEqual(['foe', 'tile', 'tile']);
    expect([targetOf('pardon'), targetOf('doubleRent')]).toEqual(['none', 'self']);
  });

  it('命运 6 张多为负向/中性；机会 6 张全为正向', () => {
    expect(FATE_DECK.every((c) => c.id.startsWith('f-'))).toBe(true);
    expect(CHANCE_DECK.every((c) => c.id.startsWith('c-'))).toBe(true);
    expect(new Set(FATE_DECK.map((c) => c.id)).size).toBe(6);
    expect(new Set(CHANCE_DECK.map((c) => c.id)).size).toBe(6);
  });
});