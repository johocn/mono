/**
 * 星级规则 — 纯函数集合（零依赖、零副作用）
 *
 * 为什么单独成文件：ProgressStore 的模块图会经 core/Env.ts 在**加载期**读取
 * `window`，导致这些纯函数在 Node 里根本无法被单测（一 import 就崩）。
 * 抽到这里后既可在 Node 中直接测试，也让「星级怎么算」这件事有唯一归属地。
 *
 * 统一原则：能否过关 ≠ 能拿几星。过关按各模式的达标线，三星才要求又快又准。
 */

/** 星数规则：3★ 超额 50% 且省下 40% 步数；2★ 超额 20%；1★ 通关 */
export function computeStars(
  passed: boolean,
  score: number,
  passTarget: number,
  stepsUsed: number,
  stepLimit: number,
): number {
  if (!passed) return 0;
  const over = passTarget > 0 ? (score - passTarget) / passTarget : 0;
  const savedRatio = stepLimit > 0 ? (stepLimit - stepsUsed) / stepLimit : 0;
  if (over >= 0.5 && savedRatio >= 0.4) return 3;
  if (over >= 0.2) return 2;
  return 1;
}

/** 空间记忆（corsi）星级：全对=3★，≥80% 正确轮=2★，达标=1★（不计步数效率，避免永不三星） */
export function computeCorsiStars(passed: boolean, correct: number, total: number): number {
  if (!passed) return 0;
  if (correct >= total) return 3;
  if (correct >= Math.ceil(total * 0.8)) return 2;
  return 1;
}

/** 面孔-名字（face）星级：全对=3★，≥80% 正确回忆=2★，达标=1★ */
export function computeFaceStars(
  passed: boolean,
  correct: number,
  faceCount: number,
  _passTarget: number,
): number {
  if (!passed) return 0;
  if (faceCount > 0 && correct >= faceCount) return 3;
  if (faceCount > 0 && correct >= Math.ceil(faceCount * 0.8)) return 2;
  return 1;
}

/**
 * 记忆翻翻乐（memory）星级：按步数效率评定
 * 理论上配齐 N 对最少需 N 步；≤1.6 倍 =3★，≤2.4 倍 =2★，否则 1★。
 */
export function computeMemoryStars(
  passed: boolean,
  movesUsed: number,
  cardPairs: number,
): number {
  if (!passed || cardPairs <= 0) return 0;
  if (movesUsed <= Math.ceil(cardPairs * 1.6)) return 3;
  if (movesUsed <= Math.ceil(cardPairs * 2.4)) return 2;
  return 1;
}

/**
 * 前瞻记忆（pm）星级：核心看「该按铃时按了没」，其次看有没有乱按
 * 3★：按铃命中率 ≥80% 且误报 ≤1 次；2★：命中率 ≥60%；否则 1★。
 * 注：pm 的价值在于「别忘了那件事」，所以命中率是主指标，误报是扣分项。
 */
export function computePmStars(
  passed: boolean,
  pmHits: number,
  pmTargets: number,
  pmFalseAlarms: number,
): number {
  if (!passed || pmTargets <= 0) return 0;
  const rate = pmHits / pmTargets;
  if (rate >= 0.8 && pmFalseAlarms <= 1) return 3;
  if (rate >= 0.6) return 2;
  return 1;
}

/**
 * 色词干扰（stroop）星级：同时看「准」与「快」
 * 3★：正确率 ≥90% 且中位反应时 ≤1600ms；2★：正确率 ≥80% 或反应时 ≤2600ms；否则 1★。
 * 注：stroop 的核心指标是抑制干扰，光答对不够，还要不为字所扰、答得果断。
 */
export function computeStroopStars(
  passed: boolean,
  correct: number,
  trials: number,
  medianRT: number,
): number {
  if (!passed || trials <= 0) return 0;
  const acc = correct / trials;
  const fast = medianRT > 0 && medianRT <= 1600;
  const okay = medianRT > 0 && medianRT <= 2600;
  if (acc >= 0.9 && fast) return 3;
  if (acc >= 0.8 || okay) return 2;
  return 1;
}

/**
 * 怀旧金曲（nostalgia）星级：与 stroop 同源思路（准 + 快）
 * 3★：正确率 ≥90% 且中位反应时 ≤2200ms；2★：正确率 ≥80% 或反应时 ≤3600ms；否则 1★。
 * 怀旧回忆更偏语义提取，节奏放宽一档，避免长辈难以满星。
 */
export function computeNostalgiaStars(
  passed: boolean,
  correct: number,
  trials: number,
  medianRT: number,
): number {
  if (!passed || trials <= 0) return 0;
  const acc = correct / trials;
  const fast = medianRT > 0 && medianRT <= 2200;
  const okay = medianRT > 0 && medianRT <= 3600;
  if (acc >= 0.9 && fast) return 3;
  if (acc >= 0.8 || okay) return 2;
  return 1;
}
