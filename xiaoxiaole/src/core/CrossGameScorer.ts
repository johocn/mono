/**
 * CrossGameScorer — 客户端纯函数评分器（配置驱动，可单测）
 *
 * 输入：关卡 id + 目标游戏 id + 玩家本关表现（LevelMetrics）
 * 输出：综合评分（0-100，越高越好）+ 分维度标准化得分 + 原始指标透传
 *
 * 设计要点：
 * - 算分在客户端完成，后端仅持久化（与 scoring 模块解耦，见 nest cross-game-record）。
 * - score/axes 仅反映「表现好坏」，不掺杂关卡难度权重；难度通过各玩法配置体现。
 * - 原始指标一并上报，便于后端复核与未来改公式时回溯。
 */

import type { LevelMetrics } from "../config/GameText";

export interface CrossGameScoreResult {
  targetGameId: string;
  levelId: string;
  mode: string;
  /** 综合评分 0-100（越高越好） */
  score: number;
  /** 分维度标准化得分（0-100），供目标游戏做画像/排行榜 */
  axes: Record<string, number>;
  /** 原始表现指标（透传，便于追溯与后端复核） */
  rawMetrics: Record<string, number>;
}

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));

/** 各玩法准确率（0-1）：score 语义随模式不同，统一换算为「完成度」 */
function accuracyOf(m: LevelMetrics): number {
  switch (m.mode) {
    case "match3":
      // match3-mem（记忆增强型三消）：若提供了 memoryHitRate，以其作为主准确率
      if (typeof m.memoryHitRate === "number") return clamp(m.memoryHitRate);
      // 普通 match3：score 为积分，passTarget 为通关阈值
      return m.passTarget > 0 ? Math.min(1, m.score / m.passTarget) : m.passed ? 1 : 0;
    case "poetry":
    case "memory":
      // score 为配对成功数，分母为目标对数
      return m.pairsTotal && m.pairsTotal > 0 ? Math.min(1, m.score / m.pairsTotal) : m.passed ? 1 : 0;
    case "corsi":
      // score 为正确轮数；分母是「尝试轮数」(stepsUsed)，才能区分好坏玩家；
      // maxSeqAchieved 仅作兜底（极端情况下 stepsUsed 为 0）
      return Math.min(1, m.score / (m.stepsUsed || m.maxSeqAchieved || 1));
    case "face":
      // score 为认对位数；分母用「出现的总面孔数」(totalQuestions)，对全部面孔做梯度评分；
      // 仅当 totalQuestions 缺失时回退到 pairsTotal / passTarget，再回退到通关二元
      return Math.min(1, m.score / (m.totalQuestions || m.pairsTotal || m.passTarget || 1));
    case "stroop":
    case "money":
    case "clock":
      // score 为答对题数，分母为题目数（stepLimit 此处用作题量）
      return m.stepLimit > 0 ? Math.min(1, m.score / m.stepLimit) : m.passed ? 1 : 0;
    case "pm":
      // 前瞻记忆：按铃命中 / 目标出现
      return m.pmTargets && m.pmTargets > 0 ? Math.min(1, (m.pmHits ?? 0) / m.pmTargets) : m.passed ? 1 : 0;
    case "audio":
    case "nostalgia":
      return m.totalQuestions && m.totalQuestions > 0
        ? Math.min(1, m.score / m.totalQuestions)
        : m.passed
          ? 1
          : 0;
    default:
      return m.passed ? 1 : 0;
  }
}

/** 速度分（0-100）：反应时优先，否则看步数效率；缺数据回退准确率 */
function speedOf(m: LevelMetrics): number {
  // 反应时型：medianRT 越小越快（以 400ms 快基线、1500ms 慢基线线性映射）
  if (typeof m.medianRT === "number" && m.medianRT > 0) {
    return clamp(100 - ((m.medianRT - 400) / (1500 - 400)) * 100);
  }
  // 步数效率型：剩余步数越多越快
  if (m.stepLimit > 0 && m.stepsUsed > 0) {
    const eff = 1 - m.stepsUsed / m.stepLimit; // 可能为负（超步），clamp 处理
    return clamp(50 + eff * 60);
  }
  return clamp(accuracyOf(m) * 100);
}

/** 稳定性分（0-100）：误报/序列达成/错误惩罚；缺数据回退准确率 */
function stabilityOf(m: LevelMetrics): number {
  if (m.mode === "pm") {
    // 前瞻记忆：误报（pmFalseAlarms）越多越不稳
    const base = accuracyOf(m) * 100;
    const fa = m.pmFalseAlarms ?? 0;
    return clamp(base - fa * 8);
  }
  if (m.mode === "audio" && typeof m.maxSeqAchieved === "number") {
    // 序列记忆：最长序列越长越稳
    return clamp(m.maxSeqAchieved * 12);
  }
  if (m.mode === "match3" && typeof m.memoryHitRate === "number") {
    // match3-mem：配对/回忆误判越多越不稳
    const base = accuracyOf(m) * 100;
    const mm = m.mismatchCount ?? 0;
    return clamp(base - mm * 8);
  }
  // 其它模式：以准确率近似稳定性
  return clamp(accuracyOf(m) * 100);
}

/**
 * 计算跨游戏评分结果。
 * @param levelId 关卡 id
 * @param targetGameId 目标游戏 id（由 resolveTargetGame 得出）
 * @param m 本关表现指标
 */
export function computeCrossGameScore(
  levelId: string,
  targetGameId: string,
  m: LevelMetrics,
): CrossGameScoreResult {
  const acc = accuracyOf(m);
  const spd = speedOf(m);
  const sta = stabilityOf(m);

  // 综合分：准确率为主，速度/稳定性为辅；未通关时整体打折但不归零
  const passFactor = m.passed ? 1 : 0.6;
  const score = clamp(
    Math.round((acc * 0.6 + (spd / 100) * 0.25 + (sta / 100) * 0.15) * 100 * passFactor),
  );

  const rawMetrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "number") rawMetrics[k] = v;
  }

  return {
    targetGameId,
    levelId,
    mode: m.mode,
    score,
    axes: {
      accuracy: clamp(Math.round(acc * 100)),
      speed: clamp(Math.round(spd)),
      stability: clamp(Math.round(sta)),
    },
    rawMetrics,
  };
}
