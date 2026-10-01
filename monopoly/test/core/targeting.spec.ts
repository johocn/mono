import { describe, it, expect } from 'vitest';
import { candidatesFor, canTarget, previewFor } from '../../src/core/targeting';
import type { GameState } from '../../src/core/game';

/** 构造最小可用 state：只填 targeting 需要的字段 */
function stateWith(over: Partial<GameState>): GameState {
  return {
    players: [
      { id: 1, pos: 0, cash: 1000, worth: 1000, jailTurns: 0, bankrupt: false, finished: false },
      { id: 2, pos: 0, cash: 1000, worth: 1000, jailTurns: 0, bankrupt: false, finished: false },
    ],
    current: 0,
    estates: {},
    barriers: {},
    ...over,
  } as unknown as GameState;
}

describe('core.targeting 候选口径', () => {
  it('bomb/demolish：只列对手 shop 且已成楼（有 estate）的格', () => {
    const st = stateWith({
      estates: {
        1: { index: 1, owner: 2, level: 2, processing: false },
        3: { index: 3, owner: 1, level: 1, processing: false },   // 自己
        5: { index: 5, owner: 2, level: 1, processing: false },   // 自己落点？5 为 chance，剔除非 shop
      },
    });
    expect(candidatesFor('bomb', st)).toEqual([1]);
    expect(candidatesFor('demolish', st)).toEqual([1]);
  });

  it('barrier：当前玩家前方 1–6 格且未设障', () => {
    const st = stateWith({ current: 0 });
    const ahead = candidatesFor('barrier', st);
    expect(ahead[0]).toBe(1);
    expect(ahead.length).toBeLessThanOrEqual(6);
    const withBarrier = stateWith({ current: 0, barriers: { 2: { index: 2, owner: 1 } } });
    expect(candidatesFor('barrier', withBarrier)).not.toContain(2);
  });

  it('teleport：除当前格外的全部格（32 格为 31）', () => {
    const st = stateWith({ current: 0 });
    const all = candidatesFor('teleport', st);
    expect(all).toHaveLength(31);
    expect(all).not.toContain(st.players[0].pos);
  });
});

describe('core.targeting 命中判定与预演', () => {
  it('canTarget：候选范围内 → true，范围外 → false', () => {
    const st = stateWith({
      estates: { 1: { index: 1, owner: 2, level: 2, processing: false } },
    });
    expect(canTarget('bomb', 1, st)).toBe(true);
    expect(canTarget('bomb', 4, st)).toBe(false);       // 4 为 shop 但无楼 → 非候选
  });

  it('previewFor：返回三行（标题 / 后果 / 受影响方）', () => {
    const st = stateWith({
      estates: { 1: { index: 1, owner: 2, level: 3, processing: false } },
    });
    const lines = previewFor('demolish', 1, st);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('拆迁令');
    expect(lines[2]).toContain('猪八戒');   // owner 2 → PLAYER_NAME[1]
  });
});

describe('core.targeting 自由出售候选（M20.1）', () => {
  it('candidatesFor("sell")：只列当前玩家自有地块（升序）', () => {
    const st = stateWith({
      current: 0,
      estates: {
        8: { index: 8, owner: 1, level: 2, processing: false },
        1: { index: 1, owner: 1, level: 1, processing: false },
        3: { index: 3, owner: 2, level: 3, processing: false },   // 对手，非候选
      },
    });
    expect(candidatesFor('sell', st)).toEqual([1, 8]);
  });

  it('canTarget("sell")：自有 → true；他人 / 无主 → false', () => {
    const st = stateWith({
      current: 0,
      estates: {
        1: { index: 1, owner: 1, level: 1, processing: false },
        3: { index: 3, owner: 2, level: 3, processing: false },
      },
    });
    expect(canTarget('sell', 1, st)).toBe(true);
    expect(canTarget('sell', 3, st)).toBe(false);   // 他人
    expect(canTarget('sell', 4, st)).toBe(false);   // 无主
  });

  it('previewFor("sell")：三行 = 标题 / 售价（变卖价 100%）/ 后果', () => {
    const st = stateWith({
      current: 0,
      estates: { 3: { index: 3, owner: 1, level: 3, processing: false } },
    });
    expect(previewFor('sell', 3, st)).toEqual([
      '出售 · 长峰特产',
      '售价 ￥330（变卖价 100%）',
      '售出后地块回归可购买',
    ]);
  });
});