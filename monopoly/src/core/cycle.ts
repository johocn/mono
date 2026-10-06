/**
 * M20.5 经济周期与查税纯函数（spec §4.3 D42/D43）。
 *
 * 与 `core/bank.ts` / `core/facility.ts` 同规：只依赖 `data/*`，不 import `game.ts` 运行时
 * （类型在此定义，`game.ts` 反向 import）；全链路纯算术、零 `Math.random`。
 */
import {
  AUDIT_MAX, AUDIT_PER_RENT, AUDIT_RATE,
  ECON_BIAS_ECONOMY, ECON_BIAS_NORMAL, ECON_INDEX_MAX, ECON_INDEX_MIN, ECON_VOL,
} from '../data/economy';
import type { NewsItem } from '../data/news';

/** 夹到 `[MIN, MAX]`，四舍五入到 3 位小数（避免浮点尾数进断言 / 进租金乘法） */
export function clampIndex(v: number): number {
  const clamped = Math.min(ECON_INDEX_MAX, Math.max(ECON_INDEX_MIN, v));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * 当期新闻 → 景气偏置：大盘新闻 ±`ECON_BIAS_ECONOMY` / 其它 ±`ECON_BIAS_NORMAL` / 无新闻 0。
 * 利好为正、利空为负（D48）。
 */
export function econBiasOf(news: NewsItem | null): number {
  if (!news) return 0;
  const mag = news.scope === 'economy' ? ECON_BIAS_ECONOMY : ECON_BIAS_NORMAL;
  return news.sentiment === 'good' ? mag : -mag;
}

/** 轮末景气游走：`clampIndex(cur + (2·rng()−1) × ECON_VOL + bias × newsMult)`（D42；M20.6 D54） */
export function nextEconomyIndex(
  cur: number, rng: () => number, news: NewsItem | null, newsMult = 1,
): number {
  return clampIndex(cur + (2 * rng() - 1) * ECON_VOL + econBiasOf(news) * newsMult);
}

/** 被查概率：`clamp(roundRent × AUDIT_PER_RENT, 0, AUDIT_MAX)`（每 ￥100 租金 +2%，上限 40%） */
export function auditChanceOf(roundRent: number): number {
  if (roundRent <= 0) return 0;
  return Math.min(AUDIT_MAX, roundRent * AUDIT_PER_RENT);
}

/** 补税额：`round(roundRent × AUDIT_RATE)`（本轮租金收入的 30%） */
export function auditTaxOf(roundRent: number): number {
  if (roundRent <= 0) return 0;
  return Math.round(roundRent * AUDIT_RATE);
}
