/**
 * MoneyEngine — 日常钱币计算（买菜找零 / 合计）纯逻辑引擎
 *
 * 与 StroopEngine 同构：零渲染依赖，可在 Node 中直接单测。
 *
 * 两种题型（都给 4 个金额选项点选，老人免打字）：
 *   · change 找零：买了 X 元的菜，付了 Y 元，应找多少？
 *   · total  合计：买了几样，一共多少钱？
 *
 * **金额一律以「分」为整数单位**（1 元 = 100 分），全程整数运算，
 * 彻底避免 0.1+0.2 之类的浮点误差——找零算错一分钱对老人是真实困扰。
 *
 * 难度轴由构造参数驱动：题型、商品件数、金额上限、是否带角分。
 */

export type MoneyMode = "change" | "total";

export interface MoneyItem {
  emoji: string;
  name: string;
  priceCents: number; // 单价（分）
}

export interface MoneyProblem {
  mode: MoneyMode;
  items: MoneyItem[];
  paidCents?: number;  // change 题型：付款金额（分）
  answerCents: number; // 正确答案（分）
  optionsCents: number[]; // 4 个选项（分，已打乱）
  answerIndex: number;
  prompt: string;
}

export interface MoneyState {
  trials: number;
  index: number;
  correct: number;
  done: boolean;
}

/** 买菜常见商品（基准价，单位：分） */
export const GOODS: MoneyItem[] = [
  { emoji: "🥬", name: "白菜", priceCents: 350 },
  { emoji: "🍅", name: "西红柿", priceCents: 580 },
  { emoji: "🥚", name: "鸡蛋", priceCents: 1200 },
  { emoji: "🍎", name: "苹果", priceCents: 880 },
  { emoji: "🍇", name: "葡萄", priceCents: 1500 },
  { emoji: "🐟", name: "鲜鱼", priceCents: 2500 },
  { emoji: "🍚", name: "大米", priceCents: 4500 },
  { emoji: "🍄", name: "蘑菇", priceCents: 690 },
];

/** 常见付款面额（分）：10 / 20 / 50 / 100 元 */
const BILLS = [1000, 2000, 5000, 10000];

/** 把「分」格式化成人民币展示文本：1250 → ¥12.5，1200 → ¥12 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  if (fen === 0) return `${sign}¥${yuan}`;
  // 分位是 10 的倍数时只显示到角，避免出现「¥12.50」这种老人不习惯的写法
  const jiao = fen / 10;
  return Number.isInteger(jiao) ? `${sign}¥${yuan}.${jiao}` : `${sign}¥${yuan}.${fen.toString().padStart(2, "0")}`;
}

export class MoneyEngine {
  private mode: MoneyMode;
  private itemCount: number;
  private maxCents: number;
  private useCents: boolean;
  private trials: number;
  private rng: () => number;

  private problem: MoneyProblem | null = null;
  private index = 0;
  private correct = 0;
  private done = false;
  private rtList: number[] = [];

  constructor(
    mode: MoneyMode,
    itemCount: number,
    maxYuan: number,
    useCents: boolean,
    trials: number,
    rng: () => number = Math.random,
  ) {
    this.mode = mode;
    this.itemCount = Math.max(1, Math.min(3, itemCount));
    this.maxCents = Math.max(1, maxYuan) * 100;
    this.useCents = useCents;
    this.trials = Math.max(1, trials);
    this.rng = rng;
  }

  getState(): MoneyState {
    return { trials: this.trials, index: this.index, correct: this.correct, done: this.done };
  }

  getProblem(): MoneyProblem | null {
    return this.problem;
  }

  /** 生成一道题；已做完返回 null */
  nextProblem(): MoneyProblem | null {
    if (this.done) return null;
    const items = this.pickItems();
    const totalCents = items.reduce((s, it) => s + it.priceCents, 0);

    let answer = totalCents;
    let paid: number | undefined;
    let prompt = "";

    if (this.mode === "change") {
      // 付一张不小于总价的面额，找零 = 付款 − 总价
      paid = BILLS.find((b) => b > totalCents) ?? BILLS[BILLS.length - 1] + totalCents;
      answer = paid - totalCents;
      prompt = `付了 ${formatCents(paid)}，应找多少？`;
    } else {
      prompt = items.length > 1 ? "这几样一共多少钱？" : "这样东西多少钱？";
    }

    const options = this.buildOptions(answer);
    // 打乱选项并定位正确答案下标
    const shuffled = shuffle(options, this.rng);
    this.problem = {
      mode: this.mode,
      items,
      paidCents: paid,
      answerCents: answer,
      optionsCents: shuffled,
      answerIndex: shuffled.indexOf(answer),
      prompt,
    };
    return this.problem;
  }

  /** 挑选不重复的商品，价格控制在金额上限内 */
  private pickItems(): MoneyItem[] {
    const pool = shuffle(GOODS, this.rng);
    const out: MoneyItem[] = [];
    for (const g of pool) {
      if (out.length >= this.itemCount) break;
      // 价格抖动：整元档 ±1 元；带角分档再加 5 角档
      let p = g.priceCents;
      const jitterPool = this.useCents ? [-100, -50, 0, 50, 100] : [-100, 0, 100];
      p += jitterPool[Math.floor(this.rng() * jitterPool.length)];
      if (!this.useCents) p = Math.round(p / 100) * 100; // 取整元
      p = Math.max(50, p);
      // 控制总价不超过上限
      const projected = out.reduce((s, it) => s + it.priceCents, 0) + p;
      if (projected > this.maxCents) continue;
      out.push({ ...g, priceCents: p });
    }
    if (out.length === 0) {
      // 兜底：上限太小时给一件便宜的
      const g = GOODS[0];
      out.push({ ...g, priceCents: Math.min(g.priceCents, Math.max(100, this.maxCents)) });
    }
    return out;
  }

  /** 生成 4 个互不相同的选项：正确答案 + 3 个贴近的干扰项 */
  private buildOptions(answer: number): number[] {
    const out = new Set<number>([answer]);
    // 干扰梯度：小单位差（元/角）、整十差、翻倍/减半式明显偏差
    const deltas = [100, 50, -100, -50, 1000, -1000, 500, -500];
    let guard = 0;
    while (out.size < 4 && guard < 100) {
      guard++;
      const d = deltas[Math.floor(this.rng() * deltas.length)];
      const cand = answer + d;
      if (cand > 0) out.add(cand);
    }
    // 极端情况兜底（如答案为 0 附近）：用递增补齐
    let bump = 100;
    while (out.size < 4) {
      out.add(answer + bump);
      bump += 100;
    }
    return [...out];
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
