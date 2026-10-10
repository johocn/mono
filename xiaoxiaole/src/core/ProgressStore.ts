/**
 * 进度持久化 — localStorage
 *
 * 记录内容：
 * - 每关最佳分数 / 星数 / 通关状态 / 游玩次数
 * - 已解锁关卡（首次只解锁各模式第 1 关，通关后解锁同模式下一关）
 * - 各模式累计指标（用于结算雷达图与自适应）
 */

import { ALL_LEVELS, type LevelConfig, type ModeId, type ItemConfig } from "../config/LevelConfig";
import { RADAR_AXES } from "../config/CognitiveMap";
import { skinApi } from "./SkinApi";
import { DEFAULT_HOME_STYLE, type HomeStyleId } from "../config/homeStyles";

export interface LevelRecord {
  passed: boolean;
  bestScore: number;
  stars: number;
  plays: number;
  lastPlayed: number;
}

export interface ModeStat {
  sessions: number;
  accuracySum: number;
  starSum: number;
}

interface ProgressData {
  version: number;
  levels: Record<string, LevelRecord>;
  unlocked: string[];
  modes: Record<string, ModeStat>;
  /** 跨关共享的道具背包 */
  items: Record<string, number>;
  /** 上次领取每日礼的日期（YYYY-MM-DD），用于每日一次 */
  lastDailyGift: string;
  /** 积分余额（换装花园兑换皮肤用） */
  points: number;
  /** 连续签到天数（7 天一循环） */
  signStreak: number;
  /** 上次签到日期（YYYY-MM-DD），用于连签判断 */
  lastSignDate: string;
  /** 雷达每日快照（按日 upsert，最多保留 120 天），用于认知画像趋势 */
  radarHistory: { date: string; values: number[] }[];
  /** 首页 UI 皮肤（5 套可切换，默认「清新自然」） */
  homeStyle: HomeStyleId;
}

const STORAGE_KEY = "bg_progress_v1";
const VERSION = 1;

const ITEM_KEYS: (keyof ItemConfig)[] = ["hint", "reshuffle", "reveal", "peek", "undo", "rehear", "step", "shield"];

/** 本地日期字符串（YYYY-MM-DD），按设备时区，避免 toISOString 的 UTC 偏移 */
function dayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 7 天循环签到奖励表（索引=连签天数） */
interface SignReward { item?: keyof ItemConfig; itemCount?: number; points?: number; }
const SIGN_REWARDS: Record<number, SignReward> = {
  1: { item: "hint", itemCount: 1 },
  2: { points: 10 },
  3: { item: "reshuffle", itemCount: 1 },
  4: { points: 15 },
  5: { item: "reveal", itemCount: 1 },
  6: { points: 20 },
  7: { item: "shield", itemCount: 1, points: 30 },
};

// 星级规则已抽到零依赖模块 core/StarRules.ts（便于在 Node 中单测）；
// 这里导入后再导出，外部（如 ResultScene）的引用路径保持不变。
import {
  computeStars,
  computeCorsiStars,
  computeFaceStars,
  computeMemoryStars,
  computeStroopStars,
  computePmStars,
  computeNostalgiaStars,
} from "./StarRules";
export {
  computeStars,
  computeCorsiStars,
  computeFaceStars,
  computeMemoryStars,
  computeStroopStars,
  computePmStars,
  computeNostalgiaStars,
};

function defaultData(): ProgressData {
  return {
    version: VERSION,
    levels: {},
    // 每个模式的第一关默认解锁
    unlocked: ["1-1", "2-1", "3-1", "4-1", "5-1", "6-1", "7-1", "8-1", "9-1", "10-1", "11-1"],
    modes: {},
    items: {},
    lastDailyGift: "",
    points: 0,
    signStreak: 0,
    lastSignDate: "",
    radarHistory: [],
    homeStyle: DEFAULT_HOME_STYLE,
  };
}

export class ProgressStore {
  private data: ProgressData = defaultData();

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProgressData>;
      if (!parsed || parsed.version !== VERSION) return;
      this.data = {
        version: VERSION,
        levels: parsed.levels ?? {},
        unlocked: parsed.unlocked?.length ? parsed.unlocked : defaultData().unlocked,
        modes: parsed.modes ?? {},
        items: parsed.items ?? {},
        lastDailyGift: parsed.lastDailyGift ?? "",
        // 老存档没有 points 字段：补 0 而不是升 VERSION，避免旧进度被整份丢弃
        points: parsed.points ?? 0,
        signStreak: parsed.signStreak ?? 0,
        lastSignDate: parsed.lastSignDate ?? "",
        radarHistory: parsed.radarHistory ?? [],
        // 老存档没有 homeStyle：回退默认，避免整份丢弃
        homeStyle: parsed.homeStyle ?? DEFAULT_HOME_STYLE,
      };
    } catch {
      this.data = defaultData();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* 隐私模式 / 配额不足时静默忽略 */
    }
  }

  // === 查询 ===

  isUnlocked(levelId: string): boolean {
    return this.data.unlocked.includes(levelId);
  }

  getRecord(levelId: string): LevelRecord | undefined {
    return this.data.levels[levelId];
  }

  getStars(levelId: string): number {
    return this.data.levels[levelId]?.stars ?? 0;
  }

  getBestScore(levelId: string): number {
    return this.data.levels[levelId]?.bestScore ?? 0;
  }

  getTotalStars(): number {
    return Object.values(this.data.levels).reduce((s, r) => s + r.stars, 0);
  }

  getMaxStars(): number {
    return ALL_LEVELS.length * 3;
  }

  /** 已通关关卡数 */
  getCompletedCount(): number {
    return Object.values(this.data.levels).filter((r) => r.passed).length;
  }

  /** 双阳特色全关通关（成就「双阳纪念徽章」判定） */
  isShuangyangComplete(): boolean {
    const levels = ALL_LEVELS.filter((l) => l.theme === "shuangyang");
    return levels.length > 0 && levels.every((l) => this.data.levels[l.id]?.passed);
  }

  /** 最近一次游玩时间戳（毫秒）；无任何记录返回 0 */
  getLastPlayed(): number {
    let latest = 0;
    for (const r of Object.values(this.data.levels)) {
      if (r.lastPlayed && r.lastPlayed > latest) latest = r.lastPlayed;
    }
    return latest;
  }

  /** 某模式已获得星数 / 满星数 */
  getModeStars(mode: ModeId): { got: number; max: number } {
    const levels = ALL_LEVELS.filter((l) => l.mode === mode);
    const got = levels.reduce((s, l) => s + this.getStars(l.id), 0);
    return { got, max: levels.length * 3 };
  }

  // === 写入 ===

  /** 记录一次关卡结果，返回本次星数 */
  recordResult(
    level: LevelConfig,
    passed: boolean,
    score: number,
    stepsUsed: number,
    accuracy: number,
    medianRT: number = 0,
    pmHits: number = 0,
    pmTargets: number = 0,
    pmFalseAlarms: number = 0,
  ): number {
    const stars = level.mode === "corsi"
      ? computeCorsiStars(passed, score, level.stepLimit)
      : level.mode === "face"
        ? computeFaceStars(passed, score, level.faceCount ?? level.stepLimit, level.passTarget)
        : level.mode === "memory"
          ? computeMemoryStars(passed, stepsUsed, level.cardPairs ?? level.passTarget)
          : level.mode === "stroop" || level.mode === "money"
            // stroop / money 都是「正确率 + 反应时」型，共用同一套星级规则
            ? computeStroopStars(passed, score, level.stepLimit, medianRT)
            : level.mode === "pm"
              ? computePmStars(passed, pmHits, pmTargets, pmFalseAlarms)
              : level.mode === "clock"
                // clock 与 stroop / money 同为「正确率 + 反应时」型
                ? computeStroopStars(passed, score, level.stepLimit, medianRT)
                : level.mode === "nostalgia"
                  // 怀旧金曲：准确率 + 反应时 型（trials = 题数）
                  ? computeNostalgiaStars(passed, score, level.questionCount ?? level.passTarget, medianRT)
                  : computeStars(passed, score, level.passTarget, stepsUsed, level.stepLimit);

    const prev = this.data.levels[level.id];
    this.data.levels[level.id] = {
      passed: prev?.passed || passed,
      bestScore: Math.max(prev?.bestScore ?? 0, passed ? score : 0),
      stars: Math.max(prev?.stars ?? 0, stars),
      plays: (prev?.plays ?? 0) + 1,
      lastPlayed: Date.now(),
    };

    const stat = this.data.modes[level.mode] ?? { sessions: 0, accuracySum: 0, starSum: 0 };
    stat.sessions += 1;
    stat.accuracySum += Math.max(0, Math.min(1, accuracy));
    stat.starSum += stars;
    this.data.modes[level.mode] = stat;

    // 解锁同模式下一关
    if (passed) {
      const levels = ALL_LEVELS.filter((l) => l.mode === level.mode);
      const idx = levels.findIndex((l) => l.id === level.id);
      const next = levels[idx + 1];
      if (next && !this.isUnlocked(next.id)) {
        this.data.unlocked.push(next.id);
      }
    }

    this.save();
    this.upsertRadarSnapshot();
    return stars;
  }

  /** 雷达各轴分数（与 RADAR_AXES 顺序一致），未训练维度为 0 */
  computeRadarValues(): number[] {
    return RADAR_AXES.map((axis) => {
      const stat = this.data.modes[axis.mode];
      if (!stat || stat.sessions === 0) return 0;

      const levelCount = ALL_LEVELS.filter((l) => l.mode === axis.mode).length || 1;
      const avgAccuracy = stat.accuracySum / stat.sessions;
      // 星数按「每关 3 星」归一化
      const starRatio = stat.starSum / (levelCount * 3);

      // 准确率 60% + 星数 40%，避免只看一项
      const value = Math.round((avgAccuracy * 0.6 + Math.min(1, starRatio) * 0.4) * 100);
      return Math.max(4, Math.min(100, value));
    });
  }

  /** 结算雷达图数据（真实聚合，未训练维度为 0） */
  getRadar(): { label: string; value: number }[] {
    return RADAR_AXES.map((axis, i) => ({ label: axis.label, value: this.computeRadarValues()[i] }));
  }

  /** 雷达每日快照：最多保留 120 天，按日 upsert（同一天多次游玩只保留最新） */
  getRadarHistory(): { date: string; values: number[] }[] {
    return this.data.radarHistory.slice();
  }

  private upsertRadarSnapshot(): void {
    const today = dayStr();
    const values = this.computeRadarValues();
    const hist = this.data.radarHistory;
    const idx = hist.findIndex((h) => h.date === today);
    if (idx >= 0) hist[idx].values = values;
    else {
      hist.push({ date: today, values });
      if (hist.length > 120) hist.splice(0, hist.length - 120);
    }
  }

  /** 该模式平均准确率（供自适应引擎参考） */
  getModeAccuracy(mode: ModeId): number | null {
    const stat = this.data.modes[mode];
    if (!stat || stat.sessions === 0) return null;
    return stat.accuracySum / stat.sessions;
  }

  // === 道具背包（跨关共享、持久化） ===

  getItem(key: keyof ItemConfig): number {
    return this.data.items[key] ?? 0;
  }

  getInventory(): Record<keyof ItemConfig, number> {
    const inv = {} as Record<keyof ItemConfig, number>;
    for (const k of ITEM_KEYS) inv[k] = this.data.items[k] ?? 0;
    return inv;
  }

  addItem(key: keyof ItemConfig, n: number): void {
    this.data.items[key] = (this.data.items[key] ?? 0) + n;
    this.save();
  }

  useItem(key: keyof ItemConfig): boolean {
    const have = this.data.items[key] ?? 0;
    if (have <= 0) return false;
    this.data.items[key] = have - 1;
    this.save();
    return true;
  }

  /** 每日首次进入主菜单发放随机道具；返回获得的道具或 null（今日已领） */
  dailyGift(): keyof ItemConfig | null {
    const today = new Date().toISOString().slice(0, 10);
    if (this.data.lastDailyGift === today) return null;
    this.data.lastDailyGift = today;
    const key = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
    this.addItem(key, 1);
    return key;
  }

  // === 连续签到（7 天循环，独立字段，与每日随机礼互不干扰） ===

  /** 当前连签天数（1–7；未签到为 0） */
  getSignStreak(): number {
    return this.data.signStreak ?? 0;
  }

  /**
   * 签到：返回今日是否已签、连签天数、奖励与积分。
   * 连签逻辑：上次是昨天则 +1，否则重置为 1；满 7 天循环回 1。
   */
  signInToday(): { already: boolean; day: number; reward: SignReward; points: number } {
    const today = dayStr();
    if (this.data.lastSignDate === today) {
      return { already: true, day: this.data.signStreak, reward: {}, points: 0 };
    }
    const streak = this.data.lastSignDate === dayStr(-1) ? this.data.signStreak + 1 : 1;
    this.data.signStreak = streak > 7 ? 1 : streak;
    this.data.lastSignDate = today;

    const reward = SIGN_REWARDS[this.data.signStreak] ?? {};
    let pts = 0;
    if (reward.item && reward.itemCount) this.addItem(reward.item, reward.itemCount);
    if (reward.points) pts = this.addPoints(reward.points, "earn_signin");
    this.save();
    return { already: false, day: this.data.signStreak, reward, points: pts };
  }

  // === 积分（换装花园兑换皮肤；与人民币购买并行） ===

  getPoints(): number {
    return this.data.points ?? 0;
  }

  /**
   * 增加积分，返回最新余额（忽略非正数）。
   * 登录后异步同步到服务端；失败不影响本地，本地始终是游客模式下的可靠来源。
   */
  addPoints(n: number, reason = "earn_pass"): number {
    if (n <= 0) return this.data.points ?? 0;
    const add = Math.floor(n);
    this.data.points = (this.data.points ?? 0) + add;
    this.save();
    if (skinApi.available()) void skinApi.earnPoints(add, reason);
    return this.data.points;
  }

  /** 以服务端余额为准覆盖本地（积分兑换后同步，避免双写漂移） */
  setPoints(n: number): void {
    this.data.points = Math.max(0, Math.floor(n));
    this.save();
  }

  // === 首页 UI 皮肤（5 套可切换，持久化） ===

  getHomeStyle(): HomeStyleId {
    return this.data.homeStyle ?? DEFAULT_HOME_STYLE;
  }

  setHomeStyle(id: HomeStyleId): void {
    if (this.data.homeStyle === id) return;
    this.data.homeStyle = id;
    this.save();
  }

  /** 消费积分；余额不足返回 false 且不扣减 */
  spendPoints(n: number): boolean {
    const cur = this.data.points ?? 0;
    if (n <= 0 || cur < n) return false;
    this.data.points = cur - n;
    this.save();
    return true;
  }

  reset(): void {
    this.data = defaultData();
    this.save();
  }
}

export const progress = new ProgressStore();
