/**
 * CorsiEngine — 空间记忆（科西积木 / Corsi Block-Tapping）纯逻辑引擎
 *
 * 零渲染依赖（可在 Node 单测 / tools 下直接跑），与 Match3Engine 同构：
 * 渲染层只消费 getState() 重建点亮动画与点回反馈，规则正确性由本文件 + 单测兜住。
 *
 * 玩法数据契约：
 * - 每轮生成一段「格索引序列」，相邻两格不重复（避免原地连点），长度 = sequenceLength。
 * - 系统演示（phase=demo）→ 玩家点回（phase=recall）→ 整轮判定（phase=roundResult）→ 下一轮。
 * - 计分：correctRounds（正确复现的轮数，作为 score 上报）；maxSeqAchieved（历史最长正确序列）。
 */

export type CorsiPhase = "demo" | "recall" | "roundResult" | "done";

export interface CorsiState {
  gridSize: number;
  /** 当前演示序列（格索引，0..gridSize²-1） */
  sequence: number[];
  sequenceLength: number;
  roundsTotal: number;
  roundsDone: number;
  /** 正确复现的轮数（= 上报 score） */
  correctRounds: number;
  /** 历史最长正确序列长度 */
  maxSeqAchieved: number;
  phase: CorsiPhase;
}

export class CorsiEngine {
  private gridSize: number;
  private sequenceLength: number;
  private roundsTotal: number;
  private passRounds: number;
  private rng: () => number;

  private roundsDone = 0;
  private correctRounds = 0;
  private maxSeqAchieved = 0;
  private sequence: number[] = [];
  private recallInput: number[] = [];
  private phase: CorsiPhase = "demo";

  constructor(
    gridSize: number,
    sequenceLength: number,
    roundsTotal: number,
    passRounds: number,
    rng: () => number = Math.random,
  ) {
    this.gridSize = gridSize;
    this.sequenceLength = sequenceLength;
    this.roundsTotal = roundsTotal;
    this.passRounds = passRounds;
    this.rng = rng;
    this.nextSequence();
  }

  /** 生成新一轮序列：相邻格不重复；长度不超过网格容量 */
  nextSequence(): void {
    const n = this.gridSize * this.gridSize;
    const len = Math.max(1, Math.min(this.sequenceLength, n));
    const seq: number[] = [];
    let prev = -1;
    for (let i = 0; i < len; i++) {
      let cell = Math.floor(this.rng() * n);
      let guard = 0;
      // 避免与上一格相同（Corsi 经典「无相邻重复」约束）
      while (cell === prev && guard++ < 32) cell = Math.floor(this.rng() * n);
      seq.push(cell);
      prev = cell;
    }
    this.sequence = seq;
    this.recallInput = [];
    this.phase = "demo";
  }

  /** 玩家点回一个格子。仅在 recall 阶段有效。 */
  submitTap(cellIndex: number): "correct" | "wrong" | "roundComplete" {
    if (this.phase !== "recall") return "wrong";
    this.recallInput.push(cellIndex);
    const idx = this.recallInput.length - 1;

    if (cellIndex !== this.sequence[idx]) {
      this.phase = "roundResult";
      this.roundsDone++;
      return "wrong";
    }
    if (this.recallInput.length === this.sequence.length) {
      this.correctRounds++;
      this.maxSeqAchieved = Math.max(this.maxSeqAchieved, this.sequence.length);
      this.phase = "roundResult";
      this.roundsDone++;
      return "roundComplete";
    }
    return "correct";
  }

  /** roundResult 后由场景调用：进入下一轮演示，或结束 */
  advance(): void {
    if (this.roundsDone >= this.roundsTotal) {
      this.phase = "done";
      return;
    }
    this.nextSequence();
  }

  /** 场景演示（demo）播放完毕后调用：进入点回（recall）阶段 */
  beginRecall(): void {
    if (this.phase === "demo") this.phase = "recall";
  }

  isLevelPassed(): boolean {
    return this.correctRounds >= this.passRounds;
  }

  getState(): CorsiState {
    return {
      gridSize: this.gridSize,
      sequence: this.sequence,
      sequenceLength: this.sequenceLength,
      roundsTotal: this.roundsTotal,
      roundsDone: this.roundsDone,
      correctRounds: this.correctRounds,
      maxSeqAchieved: this.maxSeqAchieved,
      phase: this.phase,
    };
  }

  /** 当前点回进行到的位置（用于进度点渲染） */
  getCurrentRecallIndex(): number {
    return this.recallInput.length;
  }

  /** 已点回的格子（用于回显确认圆环） */
  getRecallSoFar(): number[] {
    return this.recallInput;
  }
}
