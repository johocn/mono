/**
 * ClockEngine — 时间/钟表定向（Clock Reading & Setting）纯逻辑引擎
 *
 * 与 StroopEngine / MoneyEngine / PmEngine 同构：零渲染依赖，可在 Node 中直接单测。
 *
 * 两种题型（都是「四选一」）：
 *   · read 认时间：看钟面，从 4 个时间里点选正确的
 *   · set  拨钟表：给一个时间，从 4 个钟面里点选对应的（反向映射，更难）
 *
 * **干扰项特意包含「时针分针互换」类**（如把 3 点看成 15 分、或 3:15 看成 3:03 附近），
 * 这是老人读钟最常见的错误，也是本题型最有训练价值的地方。
 *
 * 难度轴：时间精度（整点→半点→5 分→任意分）、题型（read→set）、钟面是否显示数字。
 */

export type ClockMode = "read" | "set";
export type ClockPrecision = "hour" | "half" | "five" | "minute";

export interface ClockTime {
  hour: number;   // 1..12
  minute: number; // 0..59
}

export interface ClockTrial {
  kind: ClockMode;
  time: ClockTime;        // 正确时间（read 题=待读的钟面；set 题=待拨的时间）
  options: ClockTime[];   // 4 个选项（已打乱）
  answerIndex: number;
}

export interface ClockState {
  trials: number;
  index: number;
  correct: number;
  done: boolean;
}

/** 精度等级：越大越细、越难 */
const PRECISION_RANK: Record<ClockPrecision, number> = {
  hour: 0,
  half: 1,
  five: 2,
  minute: 3,
};

/** 把时间格式化成中文习惯：3点整 / 3点30分 / 3点05分 */
export function formatClockTime(t: ClockTime): string {
  const m = Math.max(0, Math.min(59, Math.round(t.minute)));
  if (m === 0) return `${t.hour}点整`;
  return `${t.hour}点${m.toString().padStart(2, "0")}分`;
}

export class ClockEngine {
  private mode: ClockMode;
  private precision: ClockPrecision;
  private trials: number;
  private rng: () => number;

  private problem: ClockTrial | null = null;
  private index = 0;
  private correct = 0;
  private done = false;
  private rtList: number[] = [];

  constructor(
    mode: ClockMode,
    precision: ClockPrecision,
    trials: number,
    rng: () => number = Math.random,
  ) {
    this.mode = mode;
    this.precision = precision;
    this.trials = Math.max(1, trials);
    this.rng = rng;
  }

  getState(): ClockState {
    return { trials: this.trials, index: this.index, correct: this.correct, done: this.done };
  }

  getTrial(): ClockTrial | null {
    return this.problem;
  }

  getPrecisionRank(): number {
    return PRECISION_RANK[this.precision];
  }

  /** 生成一道题；已做完返回 null */
  nextTrial(): ClockTrial | null {
    if (this.done) return null;
    const correct = this.randomTime();
    const options = this.buildOptions(correct);
    const shuffled = shuffle(options, this.rng);
    this.problem = {
      kind: this.mode,
      time: correct,
      options: shuffled,
      answerIndex: shuffled.findIndex((o) => o.hour === correct.hour && o.minute === correct.minute),
    };
    return this.problem;
  }

  /** 按精度随机一个时间 */
  private randomTime(): ClockTime {
    const hour = 1 + Math.floor(this.rng() * 12);
    let minute = 0;
    if (this.precision === "half") {
      minute = this.rng() < 0.5 ? 0 : 30;
    } else if (this.precision === "five") {
      minute = Math.floor(this.rng() * 12) * 5;
    } else if (this.precision === "minute") {
      minute = Math.floor(this.rng() * 60);
    }
    return { hour, minute };
  }

  /**
   * 生成 4 个互不相同的选项，含「时针分针互换」这一典型错误项。
   * 例：正确 3:15 → 干扰 15分方向的 3:03（把时针位置误读成分针）
   */
  private buildOptions(correct: ClockTime): ClockTime[] {
    const out: ClockTime[] = [correct];
    const seen = new Set<string>([key(correct)]);

    const candidates: ClockTime[] = [
      // 时针分针互换类：小时当分钟（3 点 → 15 分）
      { hour: correct.hour, minute: correct.hour * 5 % 60 },
      // 分钟当小时类（15 分 → 3 点）
      { hour: ((Math.floor(correct.minute / 5) % 12) || 12), minute: correct.minute },
      // ±1 小时
      { hour: (correct.hour % 12) + 1, minute: correct.minute },
      // ±30 分（跨小时）
      { hour: correct.minute >= 30 ? (correct.hour % 12) + 1 : correct.hour, minute: (correct.minute + 30) % 60 },
      // ±5 分
      { hour: correct.hour, minute: (correct.minute + 5) % 60 },
      // 整点半点混淆
      { hour: correct.hour, minute: 30 },
      { hour: correct.hour, minute: 0 },
    ];

    for (const c of candidates) {
      if (out.length >= 4) break;
      const k = key(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    // 兜底：用偏移补齐，确保一定有 4 个不同选项
    let offset = 1;
    while (out.length < 4) {
      const c = { hour: ((correct.hour - 1 + offset + 12) % 12) + 1, minute: correct.minute };
      const k = key(c);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
      offset++;
    }
    return out;
  }

  /** 作答，返回是否答对（并记录反应时） */
  submit(selectedIndex: number, rtMs: number): boolean {
    const p = this.problem;
    if (!p || this.done) return false;
    const ok = selectedIndex === p.answerIndex;
    if (ok) this.correct++;
    this.index++;
    this.rtList.push(rtMs);
    this.problem = null;
    if (this.index >= this.trials) this.done = true;
    return ok;
  }

  /** 超时未答：记为答错 */
  timeout(rtMs: number): void {
    if (!this.problem || this.done) return;
    this.index++;
    this.rtList.push(rtMs);
    this.problem = null;
    if (this.index >= this.trials) this.done = true;
  }

  isLevelPassed(passTarget: number): boolean {
    return this.correct >= passTarget;
  }

  getMedianRT(): number {
    return median(this.rtList);
  }
}

function key(t: ClockTime): string {
  return `${t.hour}:${t.minute}`;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : Math.round(s[mid]);
}
