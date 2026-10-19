/**
 * CognitiveEvaluation — 把「认知画像」翻译成「现状 → 目标 → 差距」
 *
 * 纯函数、零副作用、可在 Node 单测中直接验证（不碰 localStorage / DOM）。
 * 服务：月度报告（buildMonthlyReport）、家属端差距视图、设计文档第 7 章落地。
 *
 * 所有目标值来自 CognitiveTargets（示例/可配置），非临床结论。
 */

import {
  CognitiveProfile,
  AxisScore,
} from "./CognitiveProfile";
import {
  domainTarget,
  DOSAGE_TARGETS,
  OVERALL_TARGET,
  bandOf,
  DosageTargets,
} from "../config/CognitiveTargets";

export interface DomainGap {
  key: string;
  label: string;
  current: number;
  target: number;
  /** 目标 - 现状；≤0 表示已达标 / 超额 */
  gap: number;
  met: boolean;
}

export interface CognitiveEvaluation {
  overallCurrent: number;
  overallTarget: number;
  overallGap: number;
  /** 综合指数定性带（示例锚点） */
  band: string;
  bandAction: string;
  /** 全部已覆盖域的差距 */
  domains: DomainGap[];
  /** 最弱且未达标的 3 项（优先训练建议） */
  weakestGaps: DomainGap[];
  /** 训练有效剂量目标（示例） */
  dosage: DosageTargets;
}

/** 单域差距（纯函数） */
export function domainGapOf(a: AxisScore): DomainGap {
  const target = domainTarget(a.key);
  const gap = Math.round(target - a.value);
  return {
    key: a.key,
    label: a.label,
    current: a.value,
    target,
    gap,
    met: gap <= 0,
  };
}

/**
 * 计算整体评估结果。
 * - domains：覆盖全部已训练域（value>4，与 CognitiveProfile 的「trained」定义一致）。
 * - weakestGaps：从未达标域中取 current 最低 3 项。
 */
export function evaluateCognitive(p: CognitiveProfile): CognitiveEvaluation {
  const domains = p.axes
    .filter((a) => a.value > 4)
    .map(domainGapOf)
    .sort((x, y) => x.current - y.current);

  const weakestGaps = domains.filter((d) => !d.met).slice(0, 3);

  const band = bandOf(p.overall);

  return {
    overallCurrent: p.overall,
    overallTarget: OVERALL_TARGET,
    overallGap: Math.round(OVERALL_TARGET - p.overall),
    band: band.label,
    bandAction: band.action,
    domains,
    weakestGaps,
    dosage: DOSAGE_TARGETS,
  };
}
