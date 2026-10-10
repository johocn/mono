/**
 * ReviewStore — 间隔复习（Spaced Repetition）系统
 *
 * 把短期训练转成长期记忆：玩家在 face / memory 模式里遇到过的「联想条目」会被登记，
 * 之后按遗忘曲线定期回来复习。这是元机制，不占用新关卡/新玩法。
 *
 * 为什么必须运行时登记：face / memory 的牌是每局随机生成的，
 * 无法从关卡配置反推「玩家到底见过哪些」，只能由场景在结束时上报。
 *
 * 调度：SM-2 简化版。连续记住 → 间隔按 1/2/4/8/16/30 天递增；忘掉 → 间隔重置。
 * 首次登记时间隔为 0 天（当日到期），趁热打铁做一次即时复习。
 *
 * 存储：独立 localStorage 键，不并入 ProgressStore 存档，
 * 避免改动既有的 VERSION 迁移逻辑 / 老存档兼容风险。
 */

const STORAGE_KEY = "xiaoxiaole_review_v1";

/** 连续记住第 n 次后的复习间隔（天） */
export const REVIEW_INTERVALS = [1, 2, 4, 8, 16, 30];

/** 单次复习会话题数上限（适老：避免疲劳） */
export const REVIEW_SESSION_LIMIT = 6;

export type ReviewItemKind = "face" | "iconword" | "couplet" | "sound";

export interface ReviewItem {
  id: string;
  mode: "face" | "memory" | "poetry" | "audio"; // 来源模式
  kind: ReviewItemKind;         // 渲染类型（头像 / emoji / 文本题干 / 声音）
  seed?: number;                // face 用：头像 seed
  icon?: string;                // iconword / sound 用：emoji
  prompt?: string;              // couplet 用：文本题干（上句）；sound 用：声音 id（供播放）
  label: string;                // 正确标签（人名 / 词 / 下句 / 声音名）
  reps: number;                 // 连续记住的次数
  intervalDays: number;         // 当前复习间隔（天）
  lastReviewDay: number;        // 上次复习日（天为单位）
}

/** 登记时的输入（不含调度字段） */
export type ReviewItemInput = Omit<ReviewItem, "reps" | "intervalDays" | "lastReviewDay">;

interface ReviewData {
  version: number;
  items: Record<string, ReviewItem>;
}

/** 当前是第几天（UTC 天，跨时区也足够稳定，仅用于算间隔） */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * 纯函数：根据「已连续记住次数」与本次结果推算下一次调度。
 * 抽出为纯函数是为了可在 Node 单测里直接验证（不碰 localStorage）。
 */
export function nextSchedule(reps: number, remembered: boolean): { reps: number; intervalDays: number } {
  if (!remembered) {
    // 忘掉：连续记录清零，明天再来
    return { reps: 0, intervalDays: 1 };
  }
  const r = reps + 1;
  return { reps: r, intervalDays: REVIEW_INTERVALS[Math.min(r - 1, REVIEW_INTERVALS.length - 1)] };
}

/** 纯函数：是否到期（距上次复习天数 ≥ 间隔） */
export function isDue(item: ReviewItem, nowDay: number): boolean {
  return nowDay - item.lastReviewDay >= item.intervalDays;
}

function emptyData(): ReviewData {
  return { version: 1, items: {} };
}

/** localStorage 安全读取（Node / 隐私模式下静默降级） */
function loadData(): ReviewData {
  try {
    if (typeof localStorage === "undefined") return emptyData();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as ReviewData;
    if (!parsed || parsed.version !== 1 || !parsed.items) return emptyData();
    return parsed;
  } catch {
    return emptyData();
  }
}

class ReviewStore {
  private data: ReviewData | null = null;

  private ensure(): ReviewData {
    if (!this.data) this.data = loadData();
    return this.data;
  }

  private save(): void {
    try {
      if (typeof localStorage === "undefined" || !this.data) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* 隐私模式 / 配额不足时静默忽略 */
    }
  }

  /** 登记一批已经见过的条目（同一 id 已存在则保留原有更强的记忆状态） */
  recordItems(items: ReviewItemInput[]): void {
    if (items.length === 0) return;
    const data = this.ensure();
    const now = today();
    for (const it of items) {
      if (data.items[it.id]) continue; // 已登记：不动，避免把进度打回第一天
      data.items[it.id] = {
        ...it,
        reps: 0,
        intervalDays: 0,   // 当日到期 → 趁热打铁
        lastReviewDay: now,
      };
    }
    this.save();
  }

  /** 到期条目：越久没复习越靠前 */
  getDueQueue(limit = REVIEW_SESSION_LIMIT): ReviewItem[] {
    const data = this.ensure();
    const now = today();
    return Object.values(data.items)
      .filter((it) => isDue(it, now))
      .sort((a, b) => a.lastReviewDay - b.lastReviewDay)
      .slice(0, limit);
  }

  /** 到期总数（用于首页角标，不设上限） */
  getDueCount(): number {
    const data = this.ensure();
    const now = today();
    return Object.values(data.items).filter((it) => isDue(it, now)).length;
  }

  /** 提交一次复习结果，推进调度 */
  review(id: string, remembered: boolean): void {
    const data = this.ensure();
    const item = data.items[id];
    if (!item) return;
    const { reps, intervalDays } = nextSchedule(item.reps, remembered);
    item.reps = reps;
    item.intervalDays = intervalDays;
    item.lastReviewDay = today();
    this.save();
  }

  /** 清空全部复习数据：仅供调试 / 重置进度 */
  clear(): void {
    this.data = emptyData();
    this.save();
  }
}

export const reviews = new ReviewStore();
