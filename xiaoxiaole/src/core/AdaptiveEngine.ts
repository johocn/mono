/**
 * 自适应难度引擎 — spec v1.1 第 7.5/8 节
 * 采集指标 + 调节规则 + 护栏（防死亡螺旋）
 */

import type { LevelConfig, AdaptiveRange } from "../config/LevelConfig";
import { GAME_CONFIG } from "./GameConfig";

export interface SessionMetrics {
  accuracy: number;       // 准确率 0-1
  avgReactionTime: number; // 平均反应时 ms
  stepEfficiency: number;  // 步数效率 0-1
  passed: boolean;
}

export interface AdjustmentResult {
  stepAdjust: number;     // 步数调整量
  contentAdjust: number;  // 内容数量调整量
  reason: string;
  clamped: boolean;       // 是否触及护栏
}

export class AdaptiveEngine {
  private recentAccuracy: number[] = []; // 最近几关准确率
  private consecutiveDowngrades: number = 0;

  /** 记录单关指标 */
  recordSession(metrics: SessionMetrics): void {
    this.recentAccuracy.push(metrics.accuracy);
    if (this.recentAccuracy.length > 10) this.recentAccuracy.shift();
  }

  /**
   * 根据最近表现计算下一关调整（第 8.2 节规则 + 7.5 护栏）
   *
   * 输入维度：
   * - 最近 2 关准确率（< 0.60 偏低 / > 0.85 优秀）
   * - 中位反应时（> 基线 1.6 倍视为今日状态偏慢，给更多思考步数）
   */
  computeAdjustment(level: LevelConfig, medianRT: number): AdjustmentResult {
    const range: AdaptiveRange = level.adaptive;
    let stepAdjust = 0;
    let contentAdjust = 0;
    let reason = "表现稳定，维持当前难度";
    let clamped = false;

    const baseline = GAME_CONFIG.medianReactionBaseline;
    const slowReaction = Number.isFinite(medianRT) && medianRT > baseline * 1.6;

    if (this.recentAccuracy.length >= 2) {
      const last2 = this.recentAccuracy.slice(-2);
      const bothLow = last2.every((a) => a < 0.60);
      const bothHigh = last2.every((a) => a > 0.85);

      if (bothLow || slowReaction) {
        // 降难度：步数 +N，内容 -1
        stepAdjust = range.stepDelta;
        contentAdjust = -range.contentDelta;
        reason = bothLow ? "连续准确率偏低，降低难度" : "反应时偏慢，多给几步缓冲";
        this.consecutiveDowngrades++;
      } else if (bothHigh) {
        // 升难度：步数 -N，内容不变（不给老人加认知负荷）
        stepAdjust = -range.stepDelta;
        contentAdjust = 0;
        reason = "连续表现优异，提升挑战";
        this.consecutiveDowngrades = 0;
      } else {
        this.consecutiveDowngrades = 0;
      }
    } else if (slowReaction) {
      // 样本不足但明显偏慢：小幅加步数
      stepAdjust = Math.min(2, range.stepDelta);
      reason = "反应时偏慢，先加两步缓冲";
    }

    // === 7.5 护栏 ===
    // 步数调节边界 ±6
    if (Math.abs(stepAdjust) > GAME_CONFIG.maxStepAdjust) {
      stepAdjust = Math.sign(stepAdjust) * GAME_CONFIG.maxStepAdjust;
      clamped = true;
    }
    // 步数下限不得低于关卡自带下限 range.stepMin
    const floor = Math.max(1, range.stepMin);
    if (level.stepLimit + stepAdjust < floor) {
      stepAdjust = floor - level.stepLimit;
      clamped = true;
    }
    // 内容数量下限
    if (contentAdjust < 0) {
      const currentContent = level.iconTypes?.length
        ?? level.poetryPairs?.length
        ?? 3;
      if (currentContent + contentAdjust < range.contentMin) {
        contentAdjust = range.contentMin - currentContent;
        clamped = true;
      }
    }
    // 连续降档上限，防止死亡螺旋
    if (this.consecutiveDowngrades > GAME_CONFIG.maxConsecutiveDowngrades) {
      stepAdjust = 0;
      contentAdjust = 0;
      reason = "已连续降档多次，本轮保持难度，建议休息或换个模式";
      clamped = true;
    }

    return { stepAdjust, contentAdjust, reason, clamped };
  }

  getRecentAccuracy(): number[] {
    return [...this.recentAccuracy];
  }

  reset(): void {
    this.recentAccuracy = [];
    this.consecutiveDowngrades = 0;
  }
}

export const adaptive = new AdaptiveEngine();
