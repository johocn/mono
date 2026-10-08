/**
 * 文案与结算结果结构
 */

export interface LevelResult {
  score: number;
  lines: number;
  level: number;
  passed: boolean;
  best: number;
  isNewBest: boolean;
  zen: boolean;
}

/** 星级：按分数里程碑（适老，达成即星，不卡死） */
export function computeStars(score: number, zen: boolean): number {
  if (zen) return score > 0 ? 1 : 0;
  if (score >= 5000) return 3;
  if (score >= 2000) return 2;
  if (score >= 500) return 1;
  return 0;
}
