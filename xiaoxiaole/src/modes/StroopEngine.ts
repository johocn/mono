/**
 * StroopEngine — 色词干扰（Stroop Color-Word）纯逻辑引擎
 *
 * 与 Match3Engine / CorsiEngine 同构：零渲染依赖，可在 Node 中直接单测。
 *
 * 玩法：中央显示一个中文颜色词，其「墨水颜色」可能与字义不一致。
 *   默认规则（reverse=false）：点「墨水颜色」
 *   反转规则（reverse=true） ：点「字的含义」
 *
 * 四条难度轴全部由构造参数驱动（配合 LevelGen 的关卡配置）：
 *   colors   颜色选项数 2→3→4
 *   conflict 冲突试次占比（字义 ≠ 墨色）
 *   reverse  规则反转
 *   （限时由场景负责，引擎只接收 rtMs）
 *
 * 核心指标：正确率、反应时，以及 **Stroop 效应量 = 中位RT(冲突) − 中位RT(一致)**。
 */

export interface StroopColor {
  name: string; // 中文颜色名（同时作为「字义」和按钮文字标签）
  hex: string;  // 墨色
}

/**
 * 颜色顺序刻意按「辨识度 + 色觉障碍友好」排列：
 * 2 色时取 红+蓝（色盲最难混淆的一对），3 色加 黄，4 色才加 绿。
 * 黄色用偏深的琥珀色，避免浅黄在白底上看不清（适老）。
 */
export const STROOP_COLORS: StroopColor[] = [
  { name: "红", hex: "#E5484D" },
  { name: "蓝", hex: "#2E7BD6" },
  { name: "黄", hex: "#E0A800" },
  { name: "绿", hex: "#2FA84F" },
];

export interface StroopTrial {
  word: string;      // 显示的字（颜色名）
  wordIndex: number; // 字义对应的颜色下标
  inkIndex: number;  // 墨水颜色下标
  congruent: boolean; // 字义 == 墨色（一致试次）
  answerIndex: number; // 本题正确答案下标（已按 reverse 规则换算）
}

export interface StroopState {
  trials: number;
  index: number;     // 已完成题数
  correct: number;
  done: boolean;
}

export class StroopEngine {
  private colorCount: number;
  private trials: number;
  private conflict: number;
  private reverse: boolean;
  private rng: () => number;

  private trial: StroopTrial | null = null;
  private index = 0;
  private correct = 0;
  private done = false;

  // 反应时分组（ms）：一致 / 冲突 / 全部
  private congRT: number[] = [];
  private conflictRT: number[] = [];
  private allRT: number[] = [];

  constructor(
    colorCount: number,
    trials: number,
    conflictRatio: number,
    reverse: boolean,
    rng: () => number = Math.random,
  ) {
    this.colorCount = Math.max(2, Math.min(STROOP_COLORS.length, colorCount));
    this.trials = Math.max(1, trials);
    this.conflict = Math.max(0, Math.min(1, conflictRatio));
    this.reverse = reverse;
    this.rng = rng;
  }

  getState(): StroopState {
    return { trials: this.trials, index: this.index, correct: this.correct, done: this.done };
  }

  getTrial(): StroopTrial | null {
    return this.trial;
  }

  /** 取当前可用颜色数量（供渲染选项按钮） */
  getColorCount(): number {
    return this.colorCount;
  }

  /** 生成下一题；若已做完返回 null */
  nextTrial(): StroopTrial | null {
    if (this.done) return null;
    const n = this.colorCount;
    const wordIndex = Math.floor(this.rng() * n) % n;
    const wantConflict = this.rng() < this.conflict;

    let inkIndex = wordIndex;
    if (wantConflict) {
      // 从「非字义」的下标里随机取一个，保证一定是冲突试次
      inkIndex = Math.floor(this.rng() * (n - 1));
      if (inkIndex >= wordIndex) inkIndex += 1;
    }

    const congruent = wordIndex === inkIndex;
    this.trial = {
      word: STROOP_COLORS[wordIndex].name,
      wordIndex,
      inkIndex,
      congruent,
      // 默认点墨色；反转规则时点字义
      answerIndex: this.reverse ? wordIndex : inkIndex,
    };
    return this.trial;
  }

  /** 作答。返回是否答对；同时记录反应时到对应分组 */
  submit(selectedIndex: number, rtMs: number): boolean {
    const t = this.trial;
    if (!t || this.done) return false;
    const ok = selectedIndex === t.answerIndex;
    if (ok) this.correct++;
    this.index++;
    this.allRT.push(rtMs);
    (t.congruent ? this.congRT : this.conflictRT).push(rtMs);
    this.trial = null;
    if (this.index >= this.trials) this.done = true;
    return ok;
  }

  /** 超时未作答：记为答错，并按超时时长计入 RT 分组 */
  timeout(rtMs: number): void {
    const t = this.trial;
    if (!t || this.done) return;
    this.index++;
    this.allRT.push(rtMs);
    (t.congruent ? this.congRT : this.conflictRT).push(rtMs);
    this.trial = null;
    if (this.index >= this.trials) this.done = true;
  }

  isLevelPassed(passTarget: number): boolean {
    return this.correct >= passTarget;
  }

  // === 指标 ===

  getMedianRT(): number {
    return median(this.allRT);
  }

  /** Stroop 效应量：冲突试次中位 RT − 一致试次中位 RT（越大说明越容易被字干扰） */
  getStroopEffect(): number {
    const c = median(this.conflictRT);
    const g = median(this.congRT);
    if (!c || !g) return 0;
    return Math.round(c - g);
  }

  getCongruentMedianRT(): number {
    return median(this.congRT);
  }

  getConflictMedianRT(): number {
    return median(this.conflictRT);
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : Math.round(s[mid]);
}
