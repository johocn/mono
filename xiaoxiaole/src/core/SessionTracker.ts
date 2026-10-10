/**
 * 行为数据采集器 — 记录操作序列/反应时/准确率
 * 供自适应引擎与后端上报使用
 */

import type { OperationRecord, SessionReport } from "../api/types";
import type { SessionMetrics } from "./AdaptiveEngine";
import { GAME_CONFIG } from "./GameConfig";

export class SessionTracker {
  private operations: OperationRecord[] = [];
  private startTime: number = 0;
  private lastActionTime: number = 0;
  private correctCount: number = 0;
  private totalActions: number = 0;
  private reactionTimes: number[] = [];
  private score: number = 0;
  private levelId: string = "";
  private mode: string = "";

  start(levelId: string, mode: string): void {
    this.operations = [];
    this.startTime = Date.now();
    this.lastActionTime = this.startTime;
    this.correctCount = 0;
    this.totalActions = 0;
    this.reactionTimes = [];
    this.score = 0;
    this.levelId = levelId;
    this.mode = mode;
  }

  /** 记录一次操作 */
  record(type: string, correct: boolean, scoreDelta: number = 0): void {
    const now = Date.now();
    const rt = now - this.lastActionTime;
    this.lastActionTime = now;

    this.totalActions++;
    if (correct) this.correctCount++;

    const op: OperationRecord = {
      type,
      correct,
      reactionTime: rt,
      timestamp: now,
    };
    this.operations.push(op);
    this.reactionTimes.push(rt);
    this.score += scoreDelta;
  }

  addScore(delta: number): void {
    this.score += delta;
  }

  getScore(): number { return this.score; }

  getReactionTimes(): number[] { return [...this.reactionTimes]; }

  getMedianRT(): number {
    if (this.reactionTimes.length === 0) return GAME_CONFIG.medianReactionBaseline;
    const sorted = [...this.reactionTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted[mid];
  }

  /** 计算会话指标 */
  getMetrics(passed: boolean, stepLimit: number, stepsUsed: number): SessionMetrics {
    const accuracy = this.totalActions > 0 ? this.correctCount / this.totalActions : 0;
    const avgRT = this.reactionTimes.length > 0
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : GAME_CONFIG.medianReactionBaseline;
    const stepEfficiency = stepLimit > 0 ? (stepLimit - stepsUsed) / stepLimit : 0;
    return { accuracy, avgReactionTime: avgRT, stepEfficiency, passed };
  }

  /** 生成上报数据 */
  toReport(passed: boolean, stepsUsed: number, stepLimit: number): SessionReport {
    const metrics = this.getMetrics(passed, stepLimit, stepsUsed);
    return {
      levelId: this.levelId,
      mode: this.mode,
      operations: [...this.operations],
      accuracy: metrics.accuracy,
      avgReactionTime: metrics.avgReactionTime,
      stepEfficiency: metrics.stepEfficiency,
      passed,
      score: this.score,
      duration: (Date.now() - this.startTime) / 1000,
    };
  }

  getCorrectCount(): number { return this.correctCount; }
  getTotalActions(): number { return this.totalActions; }
}

export const tracker = new SessionTracker();
