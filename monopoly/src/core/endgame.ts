/**
 * M20.6 终局加速纯函数（spec §5.1 D54）。
 *
 * 与 `core/cycle.ts` 同规：只依赖 `data/*`，不 import `game.ts` 运行时；全链路纯算术、零随机。
 * 语义：段外（`round < ENDGAME_START_ROUND`）返回中性档（全 1）⇒ 既有回归逐值不变。
 */
import {
  ENDGAME_NEUTRAL, ENDGAME_STAGES, ENDGAME_START_ROUND, type EndgameStage,
} from '../data/economy';
import type { AiParams } from '../data/ai';

/** 轮次 → 终局阶段；未达 `ENDGAME_START_ROUND` 返回中性档；超出末段（> 60）沿用末段 */
export function endgameStageOf(round: number): EndgameStage {
  if (round < ENDGAME_START_ROUND) return ENDGAME_NEUTRAL;
  for (const s of ENDGAME_STAGES) {
    if (round >= s.from && round <= s.to) return s;
  }
  return ENDGAME_STAGES[ENDGAME_STAGES.length - 1] ?? ENDGAME_NEUTRAL;
}

/** 是否处于终局加速期（`round >= ENDGAME_START_ROUND`） */
export function inEndgame(round: number): boolean {
  return round >= ENDGAME_START_ROUND;
}

/**
 * 放大「偏离 1 的部分」：`1 + (coef − 1) × mult`。
 * `mult = 1` 时恒等（`coef` 原样返回）；`coef = 1` 时无论 `mult` 多大都恒为 1。
 * 例：`amplify(1.5, 2) = 2.0`（利好分红系数 1.5 在 newsMult=2 下翻倍到 2.0）。
 */
export function amplify(coef: number, mult: number): number {
  return 1 + (coef - 1) * mult;
}

/**
 * 终局 AI 参数激进化（spec §5.4 D56）：出价上限 `bidMult` 随 `rentMult` 上调、
 * 保留线 `reserve` 反向下调（同源加压：AI 更敢出价、更敢花钱，避免玩家单向承压）。
 * 段外（`round < 40`）原样返回 `base` ⇒ 既有 AI 回归逐值不变。
 */
export function endgameAiParams(base: AiParams, round: number): AiParams {
  if (!inEndgame(round)) return base;
  const st = endgameStageOf(round);
  return {
    ...base,
    bidMult: base.bidMult * st.rentMult,
    reserve: Math.round(base.reserve / st.rentMult),
  };
}