/**
 * M20.5 新闻公平抽取（spec §4.4 D47）。从 `game.ts` 内的私有 `rollNews` 迁出并升级行为。
 *
 * 公平性三条：① 冷却——最近 `NEWS_COOLDOWN` 条出现过的 id 不重复抽（候选池为空则放宽）
 * ② 同向上限——连续同向（利好 / 利空）达 `NEWS_STREAK_MAX` 条后收窄为反向（反向池空则放宽）
 * ③ target 与「谁持有得多」无关，规则对四位玩家完全同一。
 *
 * 仍是「固定表 + 独立 rng 流」⇒ 同 seed 逐值可复现。
 */
import {
  NEWS_COOLDOWN, NEWS_STREAK_MAX, NEWS_TABLE, type NewsItem, type Sentiment,
} from '../data/news';

/** 由历史（**由新到旧**）推导队首连续同向条数；历史为空 / 首条未知 → `null` */
export function sentimentStreak(
  history: readonly string[],
  table: readonly NewsItem[] = NEWS_TABLE,
): { sentiment: Sentiment; count: number } | null {
  if (history.length === 0) return null;
  const byId = new Map(table.map((n) => [n.id, n]));
  const head = byId.get(history[0]);
  if (!head) return null;
  let count = 1;
  for (let i = 1; i < history.length; i++) {
    const n = byId.get(history[i]);
    if (!n || n.sentiment !== head.sentiment) break;
    count++;
  }
  return { sentiment: head.sentiment, count };
}

/** 公平抽取（D47）；`history` 为**由新到旧**的 id 列表 */
export function rollNews(rng: () => number, history: readonly string[] = []): NewsItem {
  const recent = new Set(history.slice(0, NEWS_COOLDOWN));
  let pool = NEWS_TABLE.filter((n) => !recent.has(n.id));
  /* 放宽 ①：冷却窗口覆盖全表（表长 ≤ 冷却）时回到全表 */
  if (pool.length === 0) pool = [...NEWS_TABLE];

  const streak = sentimentStreak(history);
  if (streak && streak.count >= NEWS_STREAK_MAX) {
    const opposite = pool.filter((n) => n.sentiment !== streak.sentiment);
    /* 放宽 ②：反向池为空则保持原池 */
    if (opposite.length > 0) pool = opposite;
  }
  return pool[Math.floor(rng() * pool.length)];
}
