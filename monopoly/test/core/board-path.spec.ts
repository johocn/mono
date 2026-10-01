import { describe, it, expect } from 'vitest';
import { advance, pathIndices } from '../../src/core/board-path';
import { RING_SIZE } from '../../src/data/board';

describe('board-path 逐格移动（spec §5.1 / §5.4）', () => {
  it('常规前进不经过起点', () => {
    expect(advance(0, 3)).toEqual({ from: 0, to: 3, steps: 3, passedStart: false });
    expect(advance(10, 2)).toEqual({ from: 10, to: 12, steps: 2, passedStart: false });
  });

  it('越过终点回绕并记一次经过起点', () => {
    const r = advance(30, 5);
    expect(r.to).toBe(3);
    expect(r.passedStart).toBe(true);
  });

  it('正好落在起点也算经过（停留触发 +￥200）', () => {
    expect(advance(28, 4)).toEqual({ from: 28, to: 0, steps: 4, passedStart: true });
    expect(advance(31, 1).to).toBe(0);
    expect(advance(31, 1).passedStart).toBe(true);
  });

  it('整圈（32 步）回到原格且只算一次经过', () => {
    const r = advance(4, RING_SIZE);
    expect(r.to).toBe(4);
    expect(r.passedStart).toBe(true);
  });

  it('原地（0 步）不算经过', () => {
    expect(advance(7, 0)).toEqual({ from: 7, to: 7, steps: 0, passedStart: false });
    expect(advance(0, 0).passedStart).toBe(false);
  });

  it('后退（命运卡退格）绝不发起点奖励', () => {
    const r = advance(2, -3);
    expect(r.to).toBe(RING_SIZE - 1);
    expect(r.passedStart).toBe(false);
  });

  it('默认环长 = RING_SIZE=32，也支持自定义环长', () => {
    expect(RING_SIZE).toBe(32);
    expect(advance(3, 4, 8).to).toBe(7);
    expect(advance(3, 4, 8).passedStart).toBe(false);
    expect(advance(3, 6, 8).to).toBe(1);
    expect(advance(3, 6, 8).passedStart).toBe(true);
  });
});

describe('board-path 经过格序列（spec §6 P1 第 12 项：相机取景要整条路径）', () => {
  it('含起点与落点，逐格连续', () => {
    expect(pathIndices(10, 3)).toEqual([10, 11, 12, 13]);
    expect(pathIndices(0, 1)).toEqual([0, 1]);
  });

  it('回绕与整圈后回到原格', () => {
    expect(pathIndices(30, 3)).toEqual([30, 31, 0, 1]);
    const full = pathIndices(4, RING_SIZE);
    expect(full.length).toBe(RING_SIZE + 1);
    expect(full[0]).toBe(4);
    expect(full[full.length - 1]).toBe(4);
  });

  it('0 步 / 后退只有起点，且与 advance 的首尾一致', () => {
    expect(pathIndices(7, 0)).toEqual([7]);
    expect(pathIndices(2, -3)).toEqual([2]);
    const seq = pathIndices(11, 6);
    const mv = advance(11, 6);
    expect(seq[0]).toBe(mv.from);
    expect(seq[seq.length - 1]).toBe(mv.to);
  });
});