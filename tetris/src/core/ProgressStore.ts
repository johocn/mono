/**
 * ProgressStore — 本地进度 / 道具背包 / 积分（localStorage 本地优先）
 * 在线（已登录）时：积分获得/消费走服务端权威（防刷/防超额），进度登录后全量拉取 + 关键变更增量回推。
 * 离线/未登录：全部本地，游戏完整可玩（游客优先，对齐消消乐）。
 */

import type { ItemConfig } from "../config/LevelConfig";
import { tetrisApi } from "./TetrisApi";

interface ProgressData {
  version: number;
  bestScore: number;
  plays: number;
  items: Record<string, number>;
  lastDailyGift: string;
  points: number;
  signinStreak: number;
  lastSignDate: string;
}

const STORAGE_KEY = "tt_progress_v1";
const VERSION = 1;

/** 方块道具背包键（含适老辅助 + 分享/激励奖励 + 优惠券） */
export const ITEM_KEYS: (keyof ItemConfig)[] = [
  "slow", "undo", "bomb", "swap", "hint", "shield", "hammer", "coupon",
];

function dayStr(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function defaultData(): ProgressData {
  return {
    version: VERSION,
    bestScore: 0,
    plays: 0,
    items: {},
    lastDailyGift: "",
    points: 0,
    signinStreak: 0,
    lastSignDate: "",
  };
}

export class ProgressStore {
  private data: ProgressData = defaultData();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<ProgressData>;
      if (!p || p.version !== VERSION) return;
      this.data = {
        version: VERSION,
        bestScore: p.bestScore ?? 0,
        plays: p.plays ?? 0,
        items: p.items ?? {},
        lastDailyGift: p.lastDailyGift ?? "",
        points: p.points ?? 0,
        signinStreak: p.signinStreak ?? 0,
        lastSignDate: p.lastSignDate ?? "",
      };
    } catch { this.data = defaultData(); }
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch { /* 忽略 */ }
  }

  // === 分数 ===
  getBestScore(): number { return this.data.bestScore; }
  getPlays(): number { return this.data.plays; }
  recordScore(score: number): number {
    this.data.plays += 1;
    if (score > this.data.bestScore) this.data.bestScore = score;
    this.save();
    this.schedulePush();
    return this.data.bestScore;
  }

  // === 道具背包 ===
  getItem(key: keyof ItemConfig): number { return this.data.items[key] ?? 0; }
  getInventory(): Record<keyof ItemConfig, number> {
    const inv = {} as Record<keyof ItemConfig, number>;
    for (const k of ITEM_KEYS) inv[k] = this.data.items[k] ?? 0;
    return inv;
  }
  addItem(key: keyof ItemConfig, n: number): void {
    this.data.items[key] = (this.data.items[key] ?? 0) + n;
    this.save();
    this.schedulePush();
  }
  useItem(key: keyof ItemConfig): boolean {
    const have = this.data.items[key] ?? 0;
    if (have <= 0) return false;
    this.data.items[key] = have - 1;
    this.save();
    this.schedulePush();
    return true;
  }

  /** 每日首次进入主菜单发放随机道具 + 积分；返回获得的道具或 null（今日已领） */
  dailyGift(): keyof ItemConfig | null {
    const today = dayStr();
    if (this.data.lastDailyGift === today) return null;
    this.data.lastDailyGift = today;
    const key = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
    this.addItem(key, 1);
    // 积分走服务端（refId 幂等：同一天只计一次，防重复发放）
    this.grantPoints(5, "earn_daily_gift", `dailygift:${today}`);
    return key;
  }

  // === 连续签到（7 天循环） ===
  getSignStreak(): number { return this.data.signinStreak ?? 0; }
  signInToday(): { already: boolean; day: number; reward: string } {
    const today = dayStr();
    if (this.data.lastSignDate === today) {
      return { already: true, day: this.data.signinStreak, reward: "" };
    }
    const yesterday = dayStr(new Date(Date.now() - 86400000));
    const streak = this.data.lastSignDate === yesterday ? this.data.signinStreak + 1 : 1;
    const capped = streak > 7 ? 1 : streak;
    this.data.signinStreak = capped;
    this.data.lastSignDate = today;

    if (tetrisApi.available()) {
      // 服务端权威：后台签到，回写连签天数 / 积分 / 奖励道具（幂等，防重复发放）
      void tetrisApi.signin().then((r) => {
        if (r.ok && r.data) {
          this.data.signinStreak = r.data.signinStreak;
          this.data.lastSignDate = today;
          this.data.points = r.data.balance;
          if (r.data.rewardItem) this.addItem(r.data.rewardItem as keyof ItemConfig, 1);
          this.save();
          this.schedulePush();
        }
      }).catch(() => {});
      return { already: false, day: capped, reward: "" };
    }

    const gifts: string[] = ["slow", "undo", "bomb", "swap", "hint", "shield", "coupon"];
    const reward = gifts[(capped - 1) % gifts.length];
    this.addItem(reward as keyof ItemConfig, 1);
    this.addPoints(10);
    this.save();
    return { already: false, day: capped, reward };
  }

  // === 积分（兑换皮肤用） ===
  getPoints(): number { return this.data.points ?? 0; }

  /** 纯本地加积分（离线 / 降级用；在线请勿直接调用，改用 grantPoints） */
  addPoints(n: number): number {
    if (n <= 0) return this.data.points;
    this.data.points = (this.data.points ?? 0) + Math.floor(n);
    this.save();
    return this.data.points;
  }

  /** 积分获得：乐观本地 + 后台上报服务端（回写权威余额，含 refId 幂等 + 每日上限） */
  grantPoints(n: number, type: string, refId?: string): number {
    const after = this.addPoints(n);
    if (tetrisApi.available() && n > 0) {
      void tetrisApi.earnPoints(n, type, refId).then((r) => {
        if (r.ok && r.data) { this.data.points = r.data.balance; this.save(); }
      }).catch(() => {});
    }
    return after;
  }

  /** 纯本地扣积分（离线 / 降级用）；在线请改用 spendPointsOnline */
  spendPoints(n: number): boolean {
    const cur = this.data.points ?? 0;
    if (n <= 0 || cur < n) return false;
    this.data.points = cur - n;
    this.save();
    return true;
  }

  /** 积分消费：在线时走服务端权威（校验余额、防超额、可幂等）；失败回滚本地。离线走本地。 */
  async spendPointsOnline(n: number, type: string, refId?: string): Promise<boolean> {
    if (n <= 0) return false;
    if (!tetrisApi.available()) return this.spendPoints(n);
    const cur = this.data.points ?? 0;
    if (cur < n) return false;
    this.data.points = cur - n; // 乐观扣减
    this.save();
    const r = await tetrisApi.spendPoints(n, type, refId);
    if (r.ok && r.data) {
      this.data.points = r.data.balance;
      this.save();
      return true;
    }
    this.data.points = cur; // 回滚
    this.save();
    return false;
  }

  // === 服务端同步（在线） ===

  /** 取本地进度快照，用于增量回推 */
  getProfilePayload() {
    return {
      bestScore: this.data.bestScore,
      plays: this.data.plays,
      items: this.data.items,
      signinStreak: this.data.signinStreak,
      lastSignDate: this.data.lastSignDate,
    };
  }

  /** 用服务端数据合并本地（bestScore/plays 取 max、背包取 max、签到以服务端为准） */
  applyServerProfile(prof: {
    bestScore: number;
    plays: number;
    signinStreak: number;
    lastSignDate: string;
    items: Record<string, number>;
  }): void {
    this.data.bestScore = Math.max(this.data.bestScore, prof.bestScore ?? 0);
    this.data.plays = Math.max(this.data.plays, prof.plays ?? 0);
    this.data.signinStreak = prof.signinStreak ?? this.data.signinStreak;
    if (prof.lastSignDate) this.data.lastSignDate = prof.lastSignDate;
    const items = this.data.items;
    for (const k of Object.keys(prof.items ?? {})) {
      items[k] = Math.max(items[k] ?? 0, prof.items[k] ?? 0);
    }
    this.data.items = items;
    this.save();
  }

  /** 直接设置积分（来自服务端权威余额） */
  setPoints(n: number): void {
    this.data.points = n;
    this.save();
  }

  /** 增量回推进度到服务端（合并写入） */
  async pushProgress(): Promise<void> {
    if (!tetrisApi.available()) return;
    const r = await tetrisApi.saveProgress(this.getProfilePayload());
    if (r.ok && r.data) this.applyServerProfile(r.data);
  }

  /** 关键变更后 debounce 合并回推（300ms） */
  schedulePush(): void {
    if (!tetrisApi.available()) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.pushProgress();
    }, 300);
  }

  reset(): void { this.data = defaultData(); this.save(); }
}

export const progress = new ProgressStore();
