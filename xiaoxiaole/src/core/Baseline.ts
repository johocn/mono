/**
 * Baseline — 基线测评语义
 *
 * 离线前提下，不强制长辈一次性做完 11 个模式的正式测评（体验差、易放弃）。
 * 改为：把「第一次产生的认知快照」视作基线——雷达历史 radarHistory 的首条即基线，
 * 后续每次快照与它比较，就能自然呈现「练了之后有没有进步」。
 *
 * 这样「基线测评」零打扰、随玩随建，又让趋势图有明确的起点标注。
 */

import { progress } from "./ProgressStore";

export interface Baseline {
  date: string;
  values: number[];
  /** 基线综合认知指数（各域均值，0-100） */
  overall: number;
}

/** 取最早一条认知快照作为基线；尚无记录返回 null */
export function getBaseline(): Baseline | null {
  const hist = progress.getRadarHistory();
  if (hist.length === 0) return null;
  const first = hist[0];
  const overall = Math.round(first.values.reduce((s, v) => s + v, 0) / first.values.length);
  return { date: first.date, values: first.values, overall };
}
