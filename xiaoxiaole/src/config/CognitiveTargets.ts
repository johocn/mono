/**
 * 认知评估目标值配置（示例 / 可配置）
 *
 * ⚠️ 全部数值为「示例锚点」，上线前须由临床 + 产品共同校准。
 * 本配置仅为「训练表现量化」，非临床诊断工具。
 *
 * 对应设计文档《脑力花园-康养认知训练游戏设计方案》第 7 章。
 * 把文档里的示例目标值抽成可独立调整的配置，便于：
 *  - 临床校准后只改这里，不必动业务逻辑；
 *  - 月报 / 海报 / 家属端统一引用同一套目标，避免口径不一致。
 */

import { RADAR_AXES } from "./CognitiveMap";

/** 综合认知指数（0-100）→ 定性带（示例锚点，按 MoCA/老年常模思路） */
export interface NormBand {
  min: number;
  label: string;
  action: string;
}

export const NORM_BANDS: NormBand[] = [
  { min: 90, label: "优秀", action: "保持" },
  { min: 75, label: "良好", action: "进阶挑战" },
  { min: 50, label: "稳步", action: "维持规律训练" },
  { min: 0,  label: "需关注", action: "强化 L0、家属介入" },
];

/** 单域默认目标值（与文档统一示例线 75 对齐；可按域单独微调） */
export const DEFAULT_DOMAIN_TARGET = 75;
/** 单域最低达标线，避免出现「塌陷」弱项 */
export const DOMAIN_FLOOR = 60;

/** 取某认知域的目标值（当前全局统一 75，预留按 key 单独覆盖） */
export function domainTarget(key: string): number {
  return DEFAULT_DOMAIN_TARGET;
}

/** 训练「有效剂量」目标（示例） */
export interface DosageTargets {
  weeklySessions: number; // ≥4 次/周
  sessionMinutes: number; // ≥15 分钟/次
  reviewCompletionRate: number; // ≥80% 复习到期完成率
  signInRateMonthly: number; // ≥60% 月连签率
}

export const DOSAGE_TARGETS: DosageTargets = {
  weeklySessions: 4,
  sessionMinutes: 15,
  reviewCompletionRate: 0.8,
  signInRateMonthly: 0.6,
};

/** 综合指数目标（与单域默认线一致） */
export const OVERALL_TARGET = DEFAULT_DOMAIN_TARGET;

/** 综合指数 → 定性带标签 */
export function bandOf(overall: number): NormBand {
  for (const b of NORM_BANDS) if (overall >= b.min) return b;
  return NORM_BANDS[NORM_BANDS.length - 1];
}

/** 全部认知域 key（用于校验目标配置完整性，便于扩展时及时发现遗漏） */
export const ALL_AXIS_KEYS: string[] = RADAR_AXES.map((a) => a.key);
