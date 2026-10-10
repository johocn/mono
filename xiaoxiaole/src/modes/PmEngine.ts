/**
 * PmEngine — 前瞻记忆（Prospective Memory）纯逻辑引擎
 *
 * 与 StroopEngine / MoneyEngine 同构：零渲染依赖，可在 Node 中直接单测。
 *
 * 采用**事件型前瞻记忆**范式：
 *   · 进行中任务（ongoing task）：看物品，点出它属于哪一类
 *   · 前瞻任务（PM task）      ：看到目标 🐟 就【按铃】；看到相似诱饵不能按铃，照常分类
 *
 * 干扰设计：诱饵（🦐 / 🍗）与目标同属「荤鲜」且外形接近，
 *   玩家必须抑制掉「顺手按铃」的冲动 —— 这正是前瞻记忆 + 反应抑制的训练点。
 *
 * 四条难度轴：规则横幅可见性、目标间隔（稀疏度）、是否插入诱饵、分类类别数。
 */

export type PmBannerMode = "always" | "fade" | "once";

export interface PmCategoryItem {
  emoji: string;
  name: string;
}

export interface PmCategory {
  key: string;
  name: string;
  items: PmCategoryItem[];
}

/** 分类池：目标与诱饵都在「荤鲜」内，保证干扰真实存在 */
export const PM_CATEGORIES: PmCategory[] = [
  {
    key: "seafood",
    name: "荤鲜",
    items: [
      { emoji: "🐟", name: "鲜鱼" }, // ← 前瞻目标
      { emoji: "🦐", name: "虾" },   // ← 诱饵
      { emoji: "🍗", name: "鸡肉" }, // ← 诱饵
    ],
  },
  {
    key: "veg",
    name: "蔬菜",
    items: [
      { emoji: "🥬", name: "白菜" },
      { emoji: "🍅", name: "西红柿" },
      { emoji: "🍄", name: "蘑菇" },
      { emoji: "🥕", name: "胡萝卜" },
    ],
  },
  {
    key: "fruit",
    name: "水果",
    items: [
      { emoji: "🍎", name: "苹果" },
      { emoji: "🍇", name: "葡萄" },
      { emoji: "🍊", name: "橘子" },
      { emoji: "🍌", name: "香蕉" },
    ],
  },
];

/** 前瞻目标：看到它就按铃（＝记得关火） */
export const PM_TARGET = { emoji: "🐟", name: "鲜鱼" };

export interface PmTrial {
  emoji: string;
  name: string;
  /** 正确类别下标（目标题此项无意义，因为应该按铃） */
  categoryIndex: number;
  kind: "ongoing" | "target" | "lure";
}

export interface PmState {
  trials: number;
  index: number;
  correct: number;      // 做对的题数（按铃命中 + 分类正确）
  pmHits: number;       // 该按铃且按了
  pmTargets: number;    // 目标出现次数
  pmFalseAlarms: number;// 不该按铃却按了
  done: boolean;
}

export class PmEngine {
  private catCount: number;
  private trials: number;
  private banner: PmBannerMode;
  private every: number;
  private lures: boolean;
  private rng: () => number;

  /** 本题使用的类别（第 0 个恒为「荤鲜」，保证目标/诱饵有归属） */
  private cats: PmCategory[] = [];
  private sequence: PmTrial[] = [];
  private index = 0;
  private correct = 0;
  private pmHits = 0;
  private pmTargets = 0;
  private pmFalseAlarms = 0;
  private done = false;
  private rtList: number[] = [];

  constructor(
    catCount: number,
    trials: number,
    banner: PmBannerMode,
    every: number,
    lures: boolean,
    rng: () => number = Math.random,
  ) {
    this.catCount = Math.max(2, Math.min(PM_CATEGORIES.length, catCount));
    this.trials = Math.max(1, trials);
    this.banner = banner;
    this.every = Math.max(2, every);
    this.lures = lures;
    this.rng = rng;
    this.cats = PM_CATEGORIES.slice(0, this.catCount); // 第 0 个是「荤鲜」
    this.buildSequence();
  }

  /** 构造整关序列：按 every 插入目标，按需插入诱饵 */
  private buildSequence(): void {
    const seq: PmTrial[] = [];
    // 诱饵池：荤鲜里除目标外的其它项
    const lurePool = this.cats[0].items.filter((it) => it.emoji !== PM_TARGET.emoji);
    // 常规池：所有启用类别里除目标外的项
    const normalPool: { emoji: string; name: string; cat: number }[] = [];
    this.cats.forEach((c, ci) => {
      for (const it of c.items) {
        if (it.emoji === PM_TARGET.emoji) continue;
        normalPool.push({ ...it, cat: ci });
      }
    });

    let sinceTarget = 0;
    while (seq.length < this.trials) {
      const remaining = this.trials - seq.length;
      // 到间隔就放目标（留一格放诱饵/常规，避免连续目标）
      if (sinceTarget >= this.every - 1 && remaining > 1) {
        seq.push({
          emoji: PM_TARGET.emoji,
          name: PM_TARGET.name,
          categoryIndex: 0,
          kind: "target",
        });
        this.pmTargets++;
        sinceTarget = 0;
        // 目标后按需紧跟一个诱饵，制造「刚按完铃别再按」的干扰
        if (this.lures && lurePool.length > 0 && seq.length < this.trials) {
          const lure = lurePool[Math.floor(this.rng() * lurePool.length)];
          seq.push({ ...lure, categoryIndex: 0, kind: "lure" });
          sinceTarget++;
        }
        continue;
      }
      const pick = normalPool[Math.floor(this.rng() * normalPool.length)];
      seq.push({
        emoji: pick.emoji,
        name: pick.name,
        categoryIndex: pick.cat,
        kind: pick.cat === 0 ? "lure" : "ongoing",
      });
      sinceTarget++;
    }
    this.sequence = seq;
  }

  getState(): PmState {
    return {
      trials: this.trials,
      index: this.index,
      correct: this.correct,
      pmHits: this.pmHits,
      pmTargets: this.pmTargets,
      pmFalseAlarms: this.pmFalseAlarms,
      done: this.done,
    };
  }

  /** 当前题；已做完返回 null */
  getTrial(): PmTrial | null {
    if (this.done || this.index >= this.sequence.length) return null;
    return this.sequence[this.index];
  }

  /** 本题使用的类别（供渲染分类按钮） */
  getCategories(): PmCategory[] {
    return this.cats;
  }

  /**
   * 按下铃。返回是否为正确按铃（目标题按下 = 命中；非目标题按下 = 误报）。
   */
  pressBell(rtMs: number): boolean {
    const t = this.getTrial();
    if (!t) return false;
    const ok = t.kind === "target";
    if (ok) {
      this.pmHits++;
      this.correct++;
    } else {
      this.pmFalseAlarms++;
    }
    this.finishTrial(rtMs);
    return ok;
  }

  /** 选择分类。返回是否分类正确（目标题选分类 = 忘了按铃，记为错） */
  pickCategory(catIndex: number, rtMs: number): boolean {
    const t = this.getTrial();
    if (!t) return false;
    const ok = t.kind !== "target" && catIndex === t.categoryIndex;
    if (ok) this.correct++;
    this.finishTrial(rtMs);
    return ok;
  }

  /** 超时未作答：记为答错（目标题超时 = 漏按铃） */
  timeout(rtMs: number): void {
    if (!this.getTrial()) return;
    this.finishTrial(rtMs);
  }

  private finishTrial(rtMs: number): void {
    this.index++;
    this.rtList.push(rtMs);
    if (this.index >= this.sequence.length) this.done = true;
  }

  isLevelPassed(passTarget: number): boolean {
    return this.correct >= passTarget;
  }

  getMedianRT(): number {
    return median(this.rtList);
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : Math.round(s[mid]);
}
