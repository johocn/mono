import { describe, it, expect } from 'vitest';
import {
  LINES, ROLE_BY_SEAT, QUOTE_MAX_CHARS, linesOf, pickLine, pickLineForSeat, roleOfSeat,
} from '../../src/data/lines';

describe('lines：原著台词库', () => {
  it('四角色席序与 board.PLAYER_NAME 对齐（悟空/八戒/悟净/三藏）', () => {
    expect(ROLE_BY_SEAT).toEqual(['wukong', 'bajie', 'wujing', 'sanzang']);
    expect(roleOfSeat(0)).toBe('wukong');
    expect(roleOfSeat(3)).toBe('sanzang');
    expect(roleOfSeat(4)).toBe('wukong');   // 越界回绕，不炸渲染
  });

  it('每条都带回目出处（chapterNo ≥ 1 且 chapter 非空），且圣诞无重复', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(30);
    for (const l of LINES) {
      expect(l.chapterNo).toBeGreaterThanOrEqual(1);
      expect(l.chapter.trim().length).toBeGreaterThan(0);
      expect(l.text.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(LINES.map((l) => l.text)).size).toBe(LINES.length);
  });

  it('四角色各有台词，且悟空/八戒不少于 8 条', () => {
    expect(linesOf('wukong').length).toBeGreaterThanOrEqual(8);
    expect(linesOf('bajie').length).toBeGreaterThanOrEqual(8);
    expect(linesOf('wujing').length).toBeGreaterThanOrEqual(4);
    expect(linesOf('sanzang').length).toBeGreaterThanOrEqual(6);
  });

  it('取词确定性：同 role + seed 恒等；不同 seed 会换句', () => {
    expect(pickLine('wukong', 7)).toEqual(pickLine('wukong', 7));
    const a = pickLine('wukong', 0);
    const b = pickLine('wukong', 1);
    expect(a).not.toEqual(b);
    expect(pickLineForSeat(2, 5)).toEqual(pickLine('wujing', 5));
  });

  it('窄容器取词：四角色都能在 QUOTE_MAX_CHARS 内取到短句（气泡两行排得下）', () => {
    for (const role of ROLE_BY_SEAT) {
      for (let seed = 0; seed < 8; seed += 1) {
        expect(pickLine(role, seed, QUOTE_MAX_CHARS).text.length).toBeLessThanOrEqual(QUOTE_MAX_CHARS);
      }
    }
  });
});