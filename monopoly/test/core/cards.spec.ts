import { describe, it, expect } from 'vitest';
import {
  barrierAt, bombDown, clearBarrier, createDeck, demolishDown, grant, handIndexOf, has,
  placeBarrier, use, type Hand,
} from '../../src/core/cards';
import { makeRng } from '../../src/core/dice';
import { FATE_DECK, ITEM_CARDS, type ItemCardKind } from '../../src/data/cards';
import type { Estates } from '../../src/core/estate';

describe('core.cards 牌堆（seed 定序 / 抽空洗牌）', () => {
  it('同 seed → 同序；连抽整堆互不重复；再抽一张触发洗牌（remaining 先降后回升）', () => {
    const a = createDeck(FATE_DECK, makeRng(7));
    const b = createDeck(FATE_DECK, makeRng(7));
    const n = FATE_DECK.length;
    const first = Array.from({ length: n }, () => a.draw().id);
    const second = Array.from({ length: n }, () => b.draw().id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(n);
    expect(a.remaining()).toBe(0);
    /* 抽空后再抽 1 张 → 整堆洗牌重来，remaining 回到 n-1 */
    a.draw();
    expect(a.remaining()).toBe(n - 1);
  });

  it('异 seed → 抽序不同（且不调用 Math.random）', () => {
    const a = createDeck(FATE_DECK, makeRng(7));
    const c = createDeck(FATE_DECK, makeRng(99));
    const s1 = Array.from({ length: 6 }, () => a.draw().id);
    const s2 = Array.from({ length: 6 }, () => c.draw().id);
    expect(s1).not.toEqual(s2);
  });
});

describe('core.cards 手牌（8 槽 / 去重）', () => {
  it('grant 去重：空手牌入 bomb 长度 1；再入 bomb → false', () => {
    const hand: Hand = [];
    expect(grant(hand, 'bomb')).toBe(true);
    expect(hand).toHaveLength(1);
    expect(grant(hand, 'bomb')).toBe(false);
    expect(hand).toHaveLength(1);
  });

  it('填满 8 种后再 grant → false（满槽）', () => {
    const hand: Hand = [];
    for (const c of ITEM_CARDS) expect(grant(hand, c.kind)).toBe(true);
    expect(hand).toHaveLength(8);
    expect(grant(hand, 'bomb')).toBe(false);
  });

  it('has / handIndexOf / use 一致', () => {
    const hand: Hand = ['bomb', 'teleport'];
    expect(has(hand, 'teleport')).toBe(true);
    expect(has(hand, 'pardon')).toBe(false);
    expect(handIndexOf(hand, 'teleport')).toBe(1);
    expect(use(hand, 'teleport')).toBe(true);
    expect(hand).toEqual(['bomb']);
    expect(use(hand, 'teleport')).toBe(false);
  });
});

describe('core.cards 炸弹（降 1 级 / L1 炸回无主）', () => {
  it('L2 → L1 且仍归原主；L1 → 删键回无主', () => {
    const estates: Estates = { 3: { index: 3, owner: 2, level: 2, processing: false } };
    expect(bombDown(estates, 3, 1)).toEqual({ ok: true, index: 3, owner: 2, level: 1 });
    expect(estates[3]).toEqual({ index: 3, owner: 2, level: 1, processing: false });

    expect(bombDown(estates, 3, 1)).toEqual({ ok: true, index: 3, owner: 2, level: 0 });
    expect(estates[3]).toBeUndefined();
  });

  it('非 shop / 无主 → not-estate；自己的地块 → own-tile', () => {
    const estates: Estates = {
      1: { index: 1, owner: 1, level: 2, processing: false },
      4: { index: 4, owner: 1, level: 2, processing: false },
    };
    expect(bombDown(estates, 5, 1)).toEqual({ ok: false, reason: 'not-estate' });   // chance 格
    expect(bombDown(estates, 6, 1)).toEqual({ ok: false, reason: 'not-estate' });   // shop 无主
    expect(bombDown(estates, 4, 1)).toEqual({ ok: false, reason: 'own-tile' });
    expect(estates[4]).toEqual({ index: 4, owner: 1, level: 2, processing: false });
  });
});

describe('core.cards 拆迁令（任意级一次夷平 / 归无主）', () => {
  it('L3 → 删键回无主，返回原主与原级数', () => {
    const estates: Estates = { 3: { index: 3, owner: 2, level: 3, processing: false } };
    expect(demolishDown(estates, 3, 1)).toEqual({ ok: true, index: 3, owner: 2, level: 0 });
    expect(estates[3]).toBeUndefined();
  });

  it('非 shop / 无主 → not-estate；自己的地块 → own-tile', () => {
    const estates: Estates = {
      1: { index: 1, owner: 1, level: 2, processing: false },
      4: { index: 4, owner: 1, level: 4, processing: false },
    };
    expect(demolishDown(estates, 5, 1)).toEqual({ ok: false, reason: 'not-estate' });  // chance 格
    expect(demolishDown(estates, 6, 1)).toEqual({ ok: false, reason: 'not-estate' });  // shop 无主
    expect(demolishDown(estates, 4, 1)).toEqual({ ok: false, reason: 'own-tile' });
    expect(estates[4]).toEqual({ index: 4, owner: 1, level: 4, processing: false });
  });
});

describe('core.cards 路障（设 / 查 / 撤）', () => {
  it('placeBarrier 重复 → false；barrierAt / clearBarrier 一致', () => {
    const barriers = {};
    expect(placeBarrier(barriers, 5, 1)).toBe(true);
    expect(placeBarrier(barriers, 5, 2)).toBe(false);
    expect(barrierAt(barriers, 5)).toEqual({ index: 5, owner: 1 });
    expect(barrierAt(barriers, 6)).toBeNull();
    expect(clearBarrier(barriers, 5)).toBe(true);
    expect(barrierAt(barriers, 5)).toBeNull();
    expect(clearBarrier(barriers, 5)).toBe(false);
  });
});

describe('core.cards 无 Math.random', () => {
  it('全部随机路径吃注入 rng（同 seed 可复现）', () => {
    const kinds: ItemCardKind[] = ['bomb', 'barrier', 'pardon', 'teleport', 'doubleRent', 'demolish'];
    const hand: Hand = [];
    const rnd = makeRng(3);
    const picks = Array.from({ length: 5 }, () => kinds[Math.floor(rnd() * kinds.length)]);
    for (const k of picks) grant(hand, k);
    expect(hand.length).toBeGreaterThan(0);
    expect(ITEM_CARDS.some((c) => c.kind === hand[0])).toBe(true);
  });
});