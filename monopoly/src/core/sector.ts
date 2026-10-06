/**
 * M20.6 板块租金系数纯函数（spec §5.2 D52）。
 *
 * 与 `core/facility.ts` 同规：只依赖 `data/*` 与 `data/board.ts` 的真源，
 * 不 import `game.ts` 运行时；纯查表、零随机。
 */
import { tierOf } from '../data/board';
import { SECTOR_RENT_COEF, type NewsItem } from '../data/news';

/**
 * 当期新闻 → 该地块的板块租金系数：
 * - 非板块新闻 / 无新闻 → 1；
 * - 板块新闻命中该地块所属商圈 → 利好 `SECTOR_RENT_COEF.good`（×1.25）/ 利空 `×0.8`；
 * - 板块新闻未命中（不同商圈）/ 该地块无商圈归属 → 1。
 */
export function sectorRentCoefOf(news: NewsItem | null, index: number): number {
  if (!news || news.scope !== 'sector') return 1;
  const tier = tierOf(index);
  if (tier === null || news.target !== tier) return 1;
  return news.sentiment === 'good' ? SECTOR_RENT_COEF.good : SECTOR_RENT_COEF.bad;
}