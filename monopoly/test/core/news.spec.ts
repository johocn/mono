import { describe, it, expect } from 'vitest';
import { NEWS_COOLDOWN, NEWS_STREAK_MAX, NEWS_TABLE, type NewsItem } from '../../src/data/news';
import { rollNews, sentimentStreak } from '../../src/core/news';
import { makeRng } from '../../src/core/dice';

const byId = (id: string): NewsItem => NEWS_TABLE.find((n) => n.id === id)!;

describe('M20.5 新闻公平抽取（spec §4.4 D47）', () => {
  it('常量：冷却 4 条、同向上限 3 条', () => {
    expect(NEWS_COOLDOWN).toBe(4);
    expect(NEWS_STREAK_MAX).toBe(3);
  });

  it('sentimentStreak：由新到旧数队首同向；空历史 / 未知 id → null', () => {
    expect(sentimentStreak([])).toBeNull();
    expect(sentimentStreak(['不存在'])).toBeNull();

    const goodIds = NEWS_TABLE.filter((n) => n.sentiment === 'good').map((n) => n.id);
    const badIds = NEWS_TABLE.filter((n) => n.sentiment === 'bad').map((n) => n.id);

    expect(sentimentStreak([goodIds[0]])).toEqual({ sentiment: 'good', count: 1 });
    expect(sentimentStreak([goodIds[0], goodIds[1], goodIds[2]])).toEqual({ sentiment: 'good', count: 3 });
    /* 遇反向即断 */
    expect(sentimentStreak([goodIds[0], goodIds[1], badIds[0], goodIds[2]])).toEqual({ sentiment: 'good', count: 2 });
  });

  it('冷却：最近 4 条不重复抽（历史为空 / 1 条时都合法）', () => {
    /* 遍历多组 seed，抽出的 id 都必须在「全表 − 最近 4 条」内 */
    for (let s = 1; s <= 40; s++) {
      const n = rollNews(makeRng(s), []);
      expect(NEWS_TABLE.map((x) => x.id)).toContain(n.id);
    }
    const history = NEWS_TABLE.slice(0, 4).map((n) => n.id);   // 最近 4 条
    const blocked = new Set(history);
    for (let s = 1; s <= 40; s++) {
      const n = rollNews(makeRng(s), history);
      expect(blocked.has(n.id)).toBe(false);
    }
  });

  it('冷却放宽：历史覆盖全表时不崩，仍返回表内元素', () => {
    const all = NEWS_TABLE.map((n) => n.id);
    const seen = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const n = rollNews(makeRng(s), all);
      expect(all).toContain(n.id);
      seen.add(n.id);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('同向上限：连续 3 条利好 → 下一条必为利空（反向池非空时）', () => {
    const goodIds = NEWS_TABLE.filter((n) => n.sentiment === 'good').map((n) => n.id);
    const history = [goodIds[0], goodIds[1], goodIds[2]];
    expect(sentimentStreak(history)).toEqual({ sentiment: 'good', count: 3 });
    for (let s = 1; s <= 40; s++) {
      expect(rollNews(makeRng(s), history).sentiment).toBe('bad');
    }
  });

  it('连续 2 条利好 → 仍可抽利好（未到上限不干预）', () => {
    const goodIds = NEWS_TABLE.filter((n) => n.sentiment === 'good').map((n) => n.id);
    const history = [goodIds[0], goodIds[1]];
    const sentiments = new Set<string>();
    for (let s = 1; s <= 40; s++) sentiments.add(rollNews(makeRng(s), history).sentiment);
    expect(sentiments.has('good')).toBe(true);
  });

  it('同 seed 逐值可复现；history 相同时序列一致', () => {
    const run = (): string[] => {
      const rng = makeRng(0xbeef);
      const history: string[] = [];
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        const n = rollNews(rng, history);
        history.unshift(n.id);
        if (history.length > NEWS_COOLDOWN) history.pop();
        out.push(n.id);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('长序列：滑动窗口内冷却恒成立，且同向不超过上限', () => {
    const rng = makeRng(0x2468ace);
    const history: string[] = [];
    const out: NewsItem[] = [];
    for (let i = 0; i < 200; i++) {
      const n = rollNews(rng, history);
      /* 冷却：与最近 min(NEWS_COOLDOWN, 已抽条数) 条都不重复 */
      const recent = history.slice(0, NEWS_COOLDOWN);
      if (recent.length > 0) expect(recent).not.toContain(n.id);
      history.unshift(n.id);
      if (history.length > NEWS_COOLDOWN) history.pop();
      out.push(n);
    }
    /* 同向连击：任何位置都不出现连续 NEWS_STREAK_MAX 条以上（反向池非空时） */
    let streak = 1;
    for (let i = 1; i < out.length; i++) {
      streak = out[i].sentiment === out[i - 1].sentiment ? streak + 1 : 1;
      expect(streak).toBeLessThanOrEqual(NEWS_STREAK_MAX);
    }
  });

  it('抽取结果恒为表内元素（首条历史为空时与旧口径同池 = 全表）', () => {
    const n = rollNews(makeRng(7), []);
    expect(byId(n.id)).toBeDefined();
  });
});
