/**
 * MemoryMechanics — match3-mem 记忆增强型三消的「记忆逻辑」（纯函数，与渲染解耦，可单测）
 *
 * 定位：补全评估骨架的数据闭环——
 *   配置 LevelConfig.memory → 本模块计算命中/误判 → LevelMetrics(memoryHitRate/mismatchCount)
 *   → CrossGameScorer（match3 分支已支持 memoryHitRate）→ 跨游戏记录 → brain-working-memory
 *
 * 三种机制（见《match3-mem 原型规格》第 2 章）：
 *   - shadow   影子任务：学习阶段高亮若干目标格，玩家后续消除中"回忆命中"这些位置（空间/视觉工作记忆）
 *   - paired   配对线索：学习阶段给定配对关系，玩家须把"同对的牌"凑一起才算成功（联想绑定）
 *   - delayed  延迟保持：学习阶段出现一次关键图案，间隔若干步后优先消除该图案（前瞻记忆微缩）
 *
 * 渲染层（Match3Scene overlay）负责：学习阶段高亮/预览、遮蔽、把玩家"回忆动作"整理成下方输入喂入本模块。
 */

import type { MemoryConfig } from "../config/LevelConfig";

export interface MemoryOutcome {
  /** 记忆命中率 0..1（主准确率来源） */
  memoryHitRate: number;
  /** 误判次数（降稳定性） */
  mismatchCount: number;
}

export interface MemoryInput {
  // shadow
  targetCells?: readonly string[];
  clearedTargetCells?: readonly string[];
  // paired
  learnedPairs?: ReadonlyArray<readonly [string, string]>;
  playerMatches?: ReadonlyArray<readonly [string, string]>;
  // delayed
  actualClears?: number;
  luresCleared?: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const normPair = (a: string, b: string): string => [a, b].sort().join("|");

/**
 * 影子任务：学习阶段高亮 targetCells，玩家本关消除中命中的目标格集合为 clearedTargetCells。
 * 命中率 = 命中目标格数 / 目标格总数；影子任务不单独记误判（以"命中目标格数"刻画回忆完整度）。
 */
export function scoreShadowRecall(
  targetCells: readonly string[],
  clearedTargetCells: readonly string[],
): MemoryOutcome {
  const learned = new Set(targetCells);
  let hits = 0;
  for (const c of clearedTargetCells) if (learned.has(c)) hits += 1;
  return {
    memoryHitRate: learned.size > 0 ? clamp01(hits / learned.size) : 1,
    mismatchCount: 0,
  };
}

/**
 * 配对线索：learnedPairs 为学习阶段展示的配对（无序对）；playerMatches 为玩家完成的配对（无序对）。
 * 正确 = 玩家配对落在 learnedPairs 中；误判 = 玩家配对不属任何学习配对（错配）。
 */
export function scorePairedClue(
  learnedPairs: ReadonlyArray<readonly [string, string]>,
  playerMatches: ReadonlyArray<readonly [string, string]>,
): MemoryOutcome {
  const learned = new Set(learnedPairs.map(([a, b]) => normPair(a, b)));
  let hits = 0;
  let mismatches = 0;
  for (const [a, b] of playerMatches) {
    if (learned.has(normPair(a, b))) hits += 1;
    else mismatches += 1;
  }
  const required = learnedPairs.length || 1;
  return { memoryHitRate: clamp01(hits / required), mismatchCount: mismatches };
}

/**
 * 延迟保持：学习阶段出现一次关键图案，间隔若干步后须优先消除该图案类型。
 * @param requiredClears 前瞻窗口内要求消除的目标类型次数
 * @param actualClears 玩家实际在前瞻窗口内消除的目标类型次数
 * @param luresCleared 玩家在前瞻窗口内误消除的诱饵类型次数（错按）
 */
export function scoreDelayedRetention(
  requiredClears: number,
  actualClears: number,
  luresCleared = 0,
): MemoryOutcome {
  return {
    memoryHitRate: requiredClears > 0 ? clamp01(actualClears / requiredClears) : 1,
    mismatchCount: luresCleared,
  };
}

/** 按 MemoryConfig.type 分派到对应机制评分（Match3Scene overlay 统一入口）。 */
export function scoreMemory(config: MemoryConfig, input: MemoryInput): MemoryOutcome {
  switch (config.type) {
    case "shadow":
      return scoreShadowRecall(input.targetCells ?? [], input.clearedTargetCells ?? []);
    case "paired":
      return scorePairedClue(input.learnedPairs ?? [], input.playerMatches ?? []);
    case "delayed":
      return scoreDelayedRetention(config.targetCount, input.actualClears ?? 0, input.luresCleared ?? 0);
  }
}
