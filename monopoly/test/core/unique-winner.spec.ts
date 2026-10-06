import { describe, it, expect } from 'vitest';
import { autoPlay, createGame, winnerOf } from '../../src/core/game';

/**
 * M20.6 D55 · 唯一胜者闸门。
 *
 * 客户硬要求「最后只有 1 人成为唯一胜利者」。`winnerOf` 已保证唯一（仅剩一人 → 该人；
 * 跑满 `ROUND_LIMIT` 仍多人 → 按净资产排名，并列取小 id）。本组测试把该性质**跨 seed 锁定**：
 * 任意 seed 的 `autoPlay` 必须返回**恰好一个** id，且与 `winnerOf` 一致。
 */
describe('M20.6 D55 · autoPlay 唯一胜者', () => {
  const seeds = [1, 2, 3, 7, 11, 42, 99, 20261002];

  it('任意 seed：autoPlay 返回合法且唯一的 id，对局收束（over）', () => {
    for (const seed of seeds) {
      const g = createGame({ seed });
      const id = autoPlay(g);

      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(g.state.players.length);
      expect(g.state.over).toBe(true);
      /* 返回的 id = 唯一胜者（与 winnerOf 同源，不并列） */
      expect(winnerOf(g.state)).toBe(id);
    }
  });

  it('只剩 1 名未破产者时：胜者恒为该人', () => {
    for (const seed of seeds) {
      const g = createGame({ seed });
      autoPlay(g);
      const alive = g.state.players.filter((p) => !p.bankrupt);
      if (alive.length === 1) expect(winnerOf(g.state)).toBe(alive[0].id);
    }
  });

  it('确定性：同 seed 两次 autoPlay 逐值一致（零随机外溢）', () => {
    for (const seed of seeds) {
      const a = autoPlay(createGame({ seed }));
      const b = autoPlay(createGame({ seed }));
      expect(a).toBe(b);
    }
  });
});